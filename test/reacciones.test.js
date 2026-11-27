// @ts-check
/**
 * Tabla de oro del compendio de reacciones (test/oro-reacciones.json).
 * Los productos se comparan por clave canónica (no por texto) y la ecuación debe conservar átomos.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { react, REACTIONS } from '../src/core/reactions.js';
import { speciesFromName } from '../src/core/species.js';
import { conserves } from '../src/core/balance.js';

/** @type {{ t: string, r: string[], o?: Record<string, string>, p: string[], c?: number[], fuera?: string }[]} */
const ORO = JSON.parse(readFileSync(new URL('./oro-reacciones.json', import.meta.url), 'utf8'));

for (const [i, e] of ORO.entries()) {
  if (!REACTIONS[e.t]) continue; // se activan conforme se implementa cada reacción
  test(`oro reacciones #${i + 1}: ${e.t} de ${e.r.join(' + ')}`, () => {
    const res = react(e.t, e.r, e.o ?? {});
    if (e.fuera) {
      assert.equal(res.status, 'fuera_de_alcance', `debía declararse fuera de alcance: ${e.fuera}`);
      assert.equal(res.products.length, 0);
      return;
    }
    assert.equal(res.status, 'valido', JSON.stringify(res.errors));
    const esperados = e.p.map((n) => {
      const s = speciesFromName(n);
      assert.ok(s.ok, `no pude leer el producto esperado «${n}»`);
      return s.ok ? s.species.key : '';
    });
    const obtenidos = res.products.filter((p) => p.role !== 'secundario').map((p) => p.key);
    assert.deepEqual([...obtenidos].sort(), [...esperados].sort(), `productos: ${res.equation}`);
    if (res.coefficients) {
      const left = [...res.substrates, ...res.reagents].map((s) => s.counts);
      const eq = res.products.filter((p) => p.coef !== undefined); // las alternativas (otros isómeros) no están en la ecuación
      assert.ok(conserves(left, eq.map((s) => s.counts), res.coefficients), 'átomos no conservados');
      if (e.c) assert.deepEqual([...res.coefficients.reactants, ...res.coefficients.products], e.c, res.equation ?? '');
    }
    // cada producto orgánico tiene nombre canónico
    for (const p of res.products) if (p.kind === 'organic') assert.ok(p.name, `sin nombre: ${p.formula}`);
  });
}

test('oxidación: terciario no reacciona, primario con PCC se detiene en aldehído', () => {
  const t = react('oxidacion', ['2-metil-2-propanol'], {});
  assert.equal(t.status, 'sin_reaccion');
  assert.equal(t.products.length, 0);
  assert.ok(t.steps.length >= 2);
  const p = react('oxidacion', ['1-propanol'], { oxidante: 'PCC' });
  assert.equal(p.products[0].name, 'propanal');
});

test('opciones y entradas inválidas se declaran, no se inventan', () => {
  assert.equal(react('oxidacion', ['etanol'], { oxidante: 'agua' }).status, 'incompleto');
  assert.equal(react('oxidacion', [''], {}).status, 'incompleto');
  assert.equal(react('oxidacion', ['bromoetano'], {}).status, 'sin_reaccion');
  assert.equal(react('reduccion', ['ácido etanoico'], {}).status, 'fuera_de_alcance');
  assert.equal(react('hidrogenacion', ['butano'], {}).status, 'sin_reaccion');
  assert.equal(react('nada', ['x']).status, 'invalido');
});

test('Markovnikov: empate de H da mezcla; Zaitsev: el minoritario se rotula; Cl₂ da mezcla, Br₂ elige', () => {
  const m = react('markovnikov', ['2-penteno'], { reactivo: 'HBr' });
  assert.deepEqual(m.products.map((p) => p.role), ['mezcla', 'mezcla']);
  assert.deepEqual(react('markovnikov', ['2-buteno'], { reactivo: 'HBr' }).products.map((p) => p.name), ['2-bromobutano']);
  const z = react('deshidratacion', ['2-pentanol']);
  assert.deepEqual(z.products.map((p) => [p.name, p.role]).filter((x) => x[0] !== 'agua'), [['2-penteno', 'principal'], ['1-penteno', 'secundario']]);
  const cl = react('halogenacion', ['butano'], { halogeno: 'Cl2' });
  assert.ok(cl.products.filter((p) => p.kind === 'organic').every((p) => p.role === 'mezcla'));
  const br = react('halogenacion', ['butano'], { halogeno: 'Br2' });
  assert.deepEqual(br.products.filter((p) => p.kind === 'organic').map((p) => [p.name, p.role]), [['2-bromobutano', 'principal'], ['1-bromobutano', 'secundario']]);
  assert.equal(react('deshidratacion', ['metanol']).status, 'sin_reaccion');
  assert.equal(react('markovnikov', ['propino'], {}).status, 'fuera_de_alcance');
  assert.equal(react('halogenacion', ['etanol'], {}).status, 'fuera_de_alcance');
});

test('grupo C/D: casos negativos y fuera de alcance se declaran', () => {
  assert.equal(react('esterificacion', ['ácido etanoico', 'ácido propanoico']).status, 'sin_reaccion');
  assert.equal(react('esterificacion', ['etanol'], {}).status, 'incompleto');
  assert.equal(react('hidrolisis', ['etanol']).status, 'sin_reaccion');
  assert.equal(react('saponificacion', ['etanoato de metilo'], { base: 'agua' }).status, 'incompleto');
  assert.equal(react('descarboxilacion', ['metanoato de sodio']).status, 'fuera_de_alcance');
  assert.equal(react('descarboxilacion', ['etanol']).status, 'fuera_de_alcance'); // no es una sal
  assert.equal(react('descarboxilacion', ['benzoato de sodio']).status, 'fuera_de_alcance'); // anillo
  assert.equal(react('combustion', ['bromoetano']).status, 'fuera_de_alcance');
  assert.equal(react('polimerizacion', ['1,3-butadieno']).status, 'fuera_de_alcance');
  assert.equal(react('polimerizacion', ['butano']).status, 'fuera_de_alcance');
});

test('saponificación con LiOH y esterificación en cualquier orden de reactivos', () => {
  const s = react('saponificacion', ['etanoato de metilo'], { base: 'LiOH' });
  assert.equal(s.products[0].name, 'etanoato de litio');
  const a = react('esterificacion', ['ácido etanoico', 'etanol']);
  const b = react('esterificacion', ['etanol', 'ácido etanoico']);
  assert.equal(a.products[0].key, b.products[0].key);
  assert.equal(a.reversible, true);
  assert.match(a.equation ?? '', /⇌/);
});

test('invariante: el nombre de cada producto orgánico vuelve a la misma estructura (ida y vuelta)', () => {
  for (const e of ORO) {
    if (e.fuera || !REACTIONS[e.t]) continue;
    const res = react(e.t, e.r, e.o ?? {});
    for (const p of res.products.filter((x) => x.kind === 'organic' || x.kind === 'salt')) {
      const back = speciesFromName(/** @type {string} */ (p.name));
      assert.ok(back.ok, `no se relee «${p.name}»`);
      assert.equal(back.ok && back.species.key, p.key, `ida y vuelta de «${p.name}» (${e.t})`);
    }
  }
});

test('ecuación: la combustión del etanol se escribe con coeficientes y nombres', () => {
  const r = react('combustion', ['etanol']);
  assert.equal(r.equation, 'etanol + 3 oxígeno —[calor]→ 2 dióxido de carbono + 3 agua');
});

test('dibujo: toda especie acíclica de las reacciones se dibuja sin errores', async () => {
  const { renderSvg } = await import('../src/core/render.js');
  for (const e of ORO) {
    if (e.fuera || !REACTIONS[e.t]) continue;
    const res = react(e.t, e.r, e.o ?? {});
    for (const s of [...res.substrates, ...res.reagents, ...res.products]) {
      if (s.mol && s.chain && s.kind === 'organic' && s.mol.isTree()) {
        assert.match(renderSvg(s.mol, s.chain, { locants: false }), /<svg/, `${e.t}: ${s.name}`);
      }
    }
  }
});
