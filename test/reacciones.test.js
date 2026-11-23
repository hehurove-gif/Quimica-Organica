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
      assert.ok(conserves(left, res.products.map((s) => s.counts), res.coefficients), 'átomos no conservados');
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
