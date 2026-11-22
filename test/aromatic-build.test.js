// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAromatic, buildAromatic, buildRing, subByName } from '../src/core/aromatic.js';

/** @param {string} name */
function build(name) {
  const p = parseAromatic(name);
  assert.equal(p.status, 'valido', `${name}: ${JSON.stringify(p)}`);
  if (p.status !== 'valido') throw new Error('no válido');
  return buildAromatic(p.ast);
}
/** @param {[number, string][]} l */
const ring = (l) => buildRing(l.map(([pos, n]) => ({ pos, sub: subByName(n) }))).canonicalKey();

/** @type {[string, string, [number, string][]][]} */
const CASOS = [
  ['benceno', 'C₆H₆', []],
  ['bromobenceno', 'C₆H₅Br', [[1, 'bromo']]],
  ['nitrobenceno', 'C₆H₅NO₂', [[1, 'nitro']]],
  ['tolueno', 'C₇H₈', [[1, 'metil']]],
  ['metilbenceno', 'C₇H₈', [[1, 'metil']]],
  ['etilbenceno', 'C₈H₁₀', [[1, 'etil']]],
  ['fenol', 'C₆H₆O', [[1, 'hidroxi']]],
  ['anilina', 'C₆H₇N', [[1, 'amino']]],
  ['ácido benzoico', 'C₇H₆O₂', [[1, 'carboxi']]],
  ['benzaldehído', 'C₇H₆O', [[1, 'formil']]],
  ['ácido bencenosulfónico', 'C₆H₆O₃S', [[1, 'sulfo']]],
  ['1,2-dibromobenceno', 'C₆H₄Br₂', [[1, 'bromo'], [2, 'bromo']]],
  ['1,4-diclorobenceno', 'C₆H₄Cl₂', [[1, 'cloro'], [4, 'cloro']]],
  ['1,3-dinitrobenceno', 'C₆H₄N₂O₄', [[1, 'nitro'], [3, 'nitro']]],
  ['o-xileno', 'C₈H₁₀', [[1, 'metil'], [2, 'metil']]],
  ['1,3,5-trimetilbenceno', 'C₉H₁₂', [[1, 'metil'], [3, 'metil'], [5, 'metil']]],
  ['2,4,6-trinitrotolueno', 'C₇H₅N₃O₆', [[1, 'metil'], [2, 'nitro'], [4, 'nitro'], [6, 'nitro']]],
  ['p-nitrotolueno', 'C₇H₇NO₂', [[1, 'metil'], [4, 'nitro']]],
  ['ácido 2-hidroxibenzoico', 'C₇H₆O₃', [[1, 'carboxi'], [2, 'hidroxi']]],
  ['4-bromo-1,2-dimetilbenceno', 'C₈H₉Br', [[1, 'metil'], [2, 'metil'], [4, 'bromo']]],
  ['p-bromoclorobenceno', 'C₆H₄BrCl', [[1, 'bromo'], [4, 'cloro']]],
  ['hexaclorobenceno', 'C₆Cl₆', [[1, 'cloro'], [2, 'cloro'], [3, 'cloro'], [4, 'cloro'], [5, 'cloro'], [6, 'cloro']]],
  ['terc-butilbenceno', 'C₁₀H₁₄', [[1, 'terc-butil']]],
];

for (const [name, formula, placed] of CASOS) {
  test(`aromático: «${name}» → ${formula}`, () => {
    const b = build(name);
    assert.equal(b.status, 'valido');
    if (b.status !== 'valido') return;
    assert.equal(b.molecule.formula(), formula);
    assert.deepEqual(b.molecule.validate(), []);
    assert.equal(b.molecule.canonicalKey(), ring(placed));
  });
}

test('aromático: sin localizadores y varias estructuras → incompleto con opciones', () => {
  const b = build('dibromobenceno');
  assert.equal(b.status, 'incompleto');
  if (b.status === 'incompleto') assert.equal(b.options.length, 3);
  const c = build('nitrotolueno');
  assert.equal(c.status, 'incompleto');
  if (c.status === 'incompleto') assert.equal(c.options.length, 3);
  assert.equal(build('xileno').status, 'incompleto');
});

test('aromático: contradicciones → invalido', () => {
  for (const n of ['1,1-dibromobenceno', '1,7-dibromobenceno', '1-bromo-1-clorobenceno', '1,2,3-dibromobenceno', '2,3-bromobenceno', '1-bromotolueno', 'o-1,2-dibromobenceno', 'o-tribromobenceno']) {
    const p = parseAromatic(n);
    const st = p.status === 'valido' ? buildAromatic(p.ast).status : p.status;
    assert.equal(st, 'invalido', n);
  }
  assert.equal(parseAromatic('benzoico').status, 'invalido');
});

test('aromático: lo no soportado se declara fuera de alcance; lo no aromático se deja pasar', () => {
  assert.equal(parseAromatic('2-fenilbencenobenceno').status, 'fuera_de_alcance');
  assert.equal(parseAromatic('4-(metilamino)benceno').status, 'fuera_de_alcance');
  assert.equal(parseAromatic('butano').status, 'no_aromatico');
  assert.equal(parseAromatic('2-metilpropano').status, 'no_aromatico');
});
