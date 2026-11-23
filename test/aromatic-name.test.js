// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAromatic, buildAromatic, buildRing, nameAromatic, subByName } from '../src/core/aromatic.js';

/** @param {string} name */
function nameOf(name) {
  const p = parseAromatic(name);
  assert.equal(p.status, 'valido', name);
  if (p.status !== 'valido') throw new Error();
  const b = buildAromatic(p.ast);
  assert.equal(b.status, 'valido', name);
  if (b.status !== 'valido') throw new Error();
  const r = nameAromatic(b.molecule);
  assert.equal(r.ok, true, name);
  if (!r.ok) throw new Error();
  return r;
}

/** @type {[string, string][]} entrada → nombre sistemático */
const CASOS = [
  ['benceno', 'benceno'], ['bromobenceno', 'bromobenceno'], ['nitrobenceno', 'nitrobenceno'],
  ['metilbenceno', 'tolueno'], ['etilbenceno', 'etilbenceno'], ['fenol', 'fenol'], ['anilina', 'anilina'],
  ['ácido benzoico', 'ácido benzoico'], ['benzaldehído', 'benzaldehído'], ['ácido bencenosulfónico', 'ácido bencenosulfónico'],
  ['1,2-dibromobenceno', '1,2-dibromobenceno'], ['o-dibromobenceno', '1,2-dibromobenceno'], ['1,4-diclorobenceno', '1,4-diclorobenceno'],
  ['1,3-dinitrobenceno', '1,3-dinitrobenceno'], ['o-xileno', '1,2-dimetilbenceno'], ['1,3,5-trimetilbenceno', '1,3,5-trimetilbenceno'],
  ['2,4,6-trinitrotolueno', '2,4,6-trinitrotolueno'], ['p-nitrotolueno', '4-nitrotolueno'], ['ácido 2-hidroxibenzoico', 'ácido 2-hidroxibenzoico'],
  ['1,2-dimetil-4-bromobenceno', '4-bromo-1,2-dimetilbenceno'], ['p-clorobromobenceno', '1-bromo-4-clorobenceno'],
  ['m-cloroanilina', '3-cloroanilina'], ['3-nitrofenol', '3-nitrofenol'], ['2-etiltolueno', '1-etil-2-metilbenceno'],
  ['1,2,3,4,5,6-hexaclorobenceno', '1,2,3,4,5,6-hexaclorobenceno'],
];
for (const [entrada, nombre] of CASOS) {
  test(`nombre aromático: «${entrada}» → «${nombre}»`, () => {
    assert.equal(nameOf(entrada).systematic, nombre);
  });
}

test('nombre aromático: alternativas y nombres comunes', () => {
  assert.ok(nameOf('tolueno').alternatives.includes('metilbenceno'));
  assert.ok(nameOf('fenol').alternatives.includes('hidroxibenceno'));
  assert.ok(nameOf('p-nitrotolueno').alternatives.includes('p-nitrotolueno'));
  assert.ok(nameOf('1,3-dinitrobenceno').alternatives.includes('m-dinitrobenceno'));
  assert.deepEqual(nameOf('1,3-dimetilbenceno').commons, ['m-xileno']);
  assert.ok(nameOf('hexaclorobenceno').alternatives.includes('hexaclorobenceno'));
});

test('nombre aromático: lo no soportado devuelve el motivo', () => {
  const p = parseAromatic('1,2-dicarboxi-4-nitrobenceno');
  assert.equal(p.status, 'valido');
  if (p.status !== 'valido') return;
  const b = buildAromatic(p.ast);
  assert.equal(b.status, 'valido');
  if (b.status !== 'valido') return;
  const r = nameAromatic(b.molecule);
  assert.equal(r.ok, false);
});

test('ida y vuelta exhaustiva: toda combinación de hasta 3 sustituyentes se nombra y se vuelve a leer igual', () => {
  const NAMES = ['bromo', 'nitro', 'metil', 'hidroxi', 'amino', 'carboxi', 'etil', 'sulfo'];
  /** @type {number[][]} */
  const combos = [];
  for (let a = 1; a <= 6; a++) {
    combos.push([a]);
    for (let b = a + 1; b <= 6; b++) {
      combos.push([a, b]);
      for (let c = b + 1; c <= 6; c++) combos.push([a, b, c]);
    }
  }
  let nombrados = 0;
  for (const poss of combos) {
    const total = NAMES.length ** poss.length;
    for (let n = 0; n < total; n++) {
      const asg = poss.map((pos, i) => ({ pos, sub: subByName(NAMES[Math.floor(n / NAMES.length ** i) % NAMES.length]) }));
      const m = buildRing(asg);
      const r = nameAromatic(m);
      if (!r.ok) continue; // dos grupos principales iguales (dioles, diácidos…)
      nombrados++;
      const p = parseAromatic(r.systematic);
      assert.equal(p.status, 'valido', r.systematic);
      if (p.status !== 'valido') continue;
      const b = buildAromatic(p.ast);
      assert.equal(b.status, 'valido', r.systematic);
      if (b.status !== 'valido') continue;
      assert.equal(b.molecule.canonicalKey(), m.canonicalKey(), r.systematic);
      // el nombre es canónico: nombrar de nuevo la molécula releída da lo mismo
      const r2 = nameAromatic(b.molecule);
      assert.equal(r2.ok && r2.systematic, r.systematic);
      for (const alt of r.alternatives) {
        const pa = parseAromatic(alt);
        assert.equal(pa.status, 'valido', alt);
        if (pa.status !== 'valido') continue;
        const ba = buildAromatic(pa.ast);
        assert.equal(ba.status, 'valido', alt);
        if (ba.status === 'valido') assert.equal(ba.molecule.canonicalKey(), m.canonicalKey(), alt);
      }
    }
  }
  assert.ok(nombrados > 3000);
});
