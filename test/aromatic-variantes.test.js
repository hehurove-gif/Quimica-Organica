// @ts-check
/**
 * Variantes de un mismo compuesto aromático: equivalentes sistemáticos (ambos correctos) y nombres comunes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/core/analyze.js';
import { SUBS, buildRing, nameAromatic, subByName } from '../src/core/aromatic.js';

/** @type {[string, string, boolean][]} entrada, nombre sistemático, ¿correcto tal cual? */
const EQUIVALENTES = [
  ['bencenamina', 'anilina', true],
  ['4-bromobencenamina', '4-bromoanilina', true],
  ['aminobenceno', 'anilina', true],
  ['hidroxibenceno', 'fenol', true],
  ['4-nitro-1-hidroxibenceno', '4-nitrofenol', false], // misma estructura, pero el nombre correcto lleva fenol
  ['ácido orto-hidroxibenzoico', 'ácido 2-hidroxibenzoico', true],
  ['ácido bencenocarboxílico', 'ácido benzoico', true],
  ['ácido 2-hidroxibencenocarboxílico', 'ácido 2-hidroxibenzoico', true],
  ['bencenocarbaldehído', 'benzaldehído', true],
  ['4-nitrobencenocarbaldehído', '4-nitrobenzaldehído', true],
  ['metilbenceno', 'tolueno', true],
  ['1-metil-4-nitrobenceno', '4-nitrotolueno', true],
  ['2-metil-1,3,5-trinitrobenceno', '2,4,6-trinitrotolueno', true],
  ['p-nitrotolueno', '4-nitrotolueno', true],
  ['orto-dibromobenceno', '1,2-dibromobenceno', true],
  ['meta-dinitrobenceno', '1,3-dinitrobenceno', true],
  ['para-diclorobenceno', '1,4-diclorobenceno', true],
];
for (const [entrada, sistematico, correcto] of EQUIVALENTES) {
  test(`variante equivalente: «${entrada}» = «${sistematico}»`, () => {
    const a = analyze(entrada);
    assert.equal(a.status, 'valido', entrada);
    assert.equal(a.names?.sistematico, sistematico);
    assert.equal(a.correcto, correcto);
    assert.equal(a.molecule?.canonicalKey(), analyze(sistematico).molecule?.canonicalKey());
  });
}

/** @type {[string, string][]} nombre común, nombre sistemático */
const COMUNES = [
  ['anisol', 'metoxibenceno'], ['fenetol', 'etoxibenceno'], ['cumeno', 'isopropilbenceno'], ['fenilamina', 'anilina'],
  ['mesitileno', '1,3,5-trimetilbenceno'], ['2-bromomesitileno', '2-bromo-1,3,5-trimetilbenceno'],
  ['o-cresol', '2-metilfenol'], ['m-cresol', '3-metilfenol'], ['p-cresol', '4-metilfenol'],
  ['ácido salicílico', 'ácido 2-hidroxibenzoico'], ['ácido 5-nitrosalicílico', 'ácido 2-hidroxi-5-nitrobenzoico'],
  ['o-xileno', '1,2-dimetilbenceno'], ['m-xileno', '1,3-dimetilbenceno'], ['p-xileno', '1,4-dimetilbenceno'],
];
const CON_EXTRA = new Set(['2-bromomesitileno', 'ácido 5-nitrosalicílico']);
for (const [comun, sistematico] of COMUNES) {
  test(`nombre común: «${comun}» → «${sistematico}»`, () => {
    const a = analyze(comun);
    assert.equal(a.status, 'valido', comun);
    assert.equal(a.names?.sistematico, sistematico);
    assert.equal(a.correcto, false, 'un nombre común no se da por el sistemático');
    assert.ok(a.notes.some((n) => n.type === 'comun' && n.message.includes(sistematico)), comun);
    assert.equal(a.molecule?.canonicalKey(), analyze(sistematico).molecule?.canonicalKey());
    // y la estructura sabe que ese nombre común existe
    if (CON_EXTRA.has(comun)) return; // con sustituyentes extra la estructura no ofrece el nombre común
    assert.ok(analyze(sistematico).aromatic?.comunes.some((c) => c.normalize('NFD').replace(/[̀-ͯ]/g, '') === comun.normalize('NFD').replace(/[̀-ͯ]/g, '')), `${sistematico} debe ofrecer «${comun}»`);
  });
}

test('variantes: sin posición o con posición imposible, se pide o se rechaza (no se inventa)', () => {
  assert.equal(analyze('cresol').status, 'incompleto');
  assert.match(analyze('cresol').errors[0].message, /o-cresol.*m-cresol.*p-cresol/);
  assert.equal(analyze('xileno').status, 'incompleto');
  assert.equal(analyze('o-mesitileno').status, 'invalido');
  assert.equal(analyze('p-ácido salicílico').status, 'invalido');
  assert.equal(analyze('1-bromomesitileno').status, 'invalido'); // C1 ya está ocupado
});

test('variantes: las que ofrece la estructura se leen de vuelta y son la misma molécula (2000 anillos)', () => {
  let a = 1234567;
  const next = () => ((a = (Math.imul(a, 1664525) + 1013904223) >>> 0) / 4294967296);
  let vistas = 0;
  for (let n = 0; n < 2000; n++) {
    const k = 1 + Math.floor(next() * 3);
    const free = [1, 2, 3, 4, 5, 6];
    /** @type {{ pos: number, sub: import('../src/core/aromatic.js').SubSpec }[]} */
    const pl = [];
    for (let i = 0; i < k; i++) pl.push({ pos: free.splice(Math.floor(next() * free.length), 1)[0], sub: SUBS[Math.floor(next() * SUBS.length)] });
    const m = buildRing(pl);
    const r = nameAromatic(m);
    if (!r.ok) continue;
    for (const v of [...r.alternatives, ...r.commons]) {
      vistas++;
      const x = analyze(v);
      assert.equal(x.status, 'valido', `${v} (de ${r.systematic})`);
      assert.equal(x.molecule?.canonicalKey(), m.canonicalKey(), `${v} (de ${r.systematic})`);
      assert.equal(x.names?.sistematico, r.systematic, v);
    }
  }
  assert.ok(vistas > 1500, `solo ${vistas} variantes`);
});

test('variantes: la lista de variantes no repite el nombre principal ni se repite a sí misma', () => {
  for (const n of ['anilina', 'fenol', 'tolueno', 'ácido benzoico', 'benzaldehído', 'p-cresol', 'ácido salicílico', '1,3,5-trimetilbenceno']) {
    const v = analyze(n).aromatic;
    const all = [...(v?.variantes ?? []), ...(v?.comunes ?? [])];
    assert.equal(new Set(all).size, all.length, n);
    assert.ok(!all.includes(analyze(n).names?.sistematico ?? ''), n);
  }
  assert.ok(analyze('anilina').aromatic?.variantes.includes('bencenamina'));
  assert.ok(analyze('ácido benzoico').aromatic?.variantes.includes('ácido bencenocarboxílico'));
});
