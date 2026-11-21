// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  GROUPS, MAX_CHAIN, emptyDraft, setLength, setBond, addGroup, removeGroup, draftToSmiles, describe, verify,
} from '../src/core/construct.js';
import { fromSmiles } from '../src/core/smiles.js';

/** @param {number} n @param {[number, string][]} gs @param {[number, 1 | 2 | 3][]} [bs] */
function mk(n, gs, bs = []) {
  let d = emptyDraft(n);
  for (const [i, o] of bs) d = setBond(d, i, o);
  for (const [p, k] of gs) d = addGroup(d, p, k);
  return d;
}

/**
 * Oráculo independiente: dibujo -> SMILES escrito a mano -> nombre escrito a mano.
 * @type {[string, ReturnType<typeof mk>, string, string, string][]}  [descripción, borrador, SMILES, nombre, fórmula]
 */
const CASOS = [
  ['butano', mk(4, []), 'CCCC', 'butano', 'C₄H₁₀'],
  ['2-metilpropano', mk(3, [[2, 'metil']]), 'CC(C)C', '2-metilpropano', 'C₄H₁₀'],
  ['bromoetano', mk(2, [[1, 'Br']]), 'CCBr', 'bromoetano', 'C₂H₅Br'],
  ['1-buteno', mk(4, [], [[1, 2]]), 'C=CCC', '1-buteno', 'C₄H₈'],
  ['2-butino', mk(4, [], [[2, 3]]), 'CC#CC', '2-butino', 'C₄H₆'],
  ['2-propanol', mk(3, [[2, 'OH']]), 'CC(O)C', '2-propanol', 'C₃H₈O'],
  ['propanona', mk(3, [[2, '=O']]), 'CC(=O)C', 'propanona', 'C₃H₆O'],
  ['propanal', mk(3, [[1, '=O']]), 'CCC=O', 'propanal', 'C₃H₆O'],
  ['ácido etanoico', mk(2, [[1, '=O'], [1, 'OH']]), 'CC(=O)O', 'ácido etanoico', 'C₂H₄O₂'],
  ['etanamida', mk(2, [[1, '=O'], [1, 'NH2']]), 'CC(N)=O', 'etanamida', 'C₂H₅NO'],
  ['etanoato de metilo', mk(2, [[1, '=O'], [1, 'OCH3']]), 'CC(=O)OC', 'etanoato de metilo', 'C₃H₆O₂'],
  ['metoxietano', mk(2, [[1, 'OCH3']]), 'CCOC', 'metoxietano', 'C₃H₈O'],
  ['N-metil-2-propanamina', mk(3, [[2, 'NHCH3']]), 'CC(C)NC', 'N-metil-2-propanamina', 'C₄H₁₁N'],
  ['ácido 2-aminopropanoico', mk(3, [[1, '=O'], [1, 'OH'], [2, 'NH2']]), 'CC(N)C(=O)O', 'ácido 2-aminopropanoico', 'C₃H₇NO₂'],
  ['3-buten-1-ol', mk(4, [[1, 'OH']], [[3, 2]]), 'OCCC=C', '3-buten-1-ol', 'C₄H₈O'],
];

for (const [nom, d, smi, nombre, formula] of CASOS) {
  test(`constructor: ${nom}`, () => {
    const r = describe(d);
    assert.equal(r.status, 'valido', r.errors.join(' | '));
    assert.equal(r.molecule?.canonicalKey(), fromSmiles(smi).canonicalKey(), 'estructura distinta a la esperada');
    assert.equal(r.formula, formula);
    assert.equal(r.canonicalName, nombre);
    // ida y vuelta: el nombre escrito a mano da la misma molécula que el dibujo
    assert.equal(verify(d, nombre).verdict, 'correcta');
  });
}

test('constructor: se descartan los grupos al acortar la cadena y se conservan los enlaces', () => {
  let d = mk(5, [[5, 'Br'], [2, 'OH']], [[1, 2], [4, 3]]);
  d = setLength(d, 3);
  assert.deepEqual(d.groups, [{ pos: 2, kind: 'OH' }]);
  assert.deepEqual(d.bonds, [2, 1]);
  assert.equal(setLength(d, 99).n, MAX_CHAIN);
  assert.equal(setLength(d, 0).n, 1);
  assert.equal(draftToSmiles(d), 'C=C(O)C');
});

test('constructor: quitar un grupo de un carbono', () => {
  const d = mk(2, [[1, 'Br'], [1, 'Cl'], [2, 'OH']]);
  const e = removeGroup(d, 1, 0);
  assert.deepEqual(e.groups, [{ pos: 1, kind: 'Cl' }, { pos: 2, kind: 'OH' }]);
  assert.equal(draftToSmiles(e), 'C(Cl)C(O)');
});

test('constructor: la valencia se vigila (nunca se inventa una estructura)', () => {
  // =O en un carbono con doble enlace: 5 enlaces
  const a = describe(mk(3, [[2, '=O']], [[1, 2]]));
  assert.equal(a.status, 'invalido');
  assert.equal(a.molecule, null);
  // cuatro sustituyentes sobre un carbono interno
  const b = describe(mk(3, [[2, 'Br'], [2, 'Cl'], [2, 'I']]));
  assert.equal(b.status, 'invalido');
  // grupo desconocido o posición fuera de rango: no cambia el borrador
  const d = emptyDraft(3);
  assert.deepEqual(addGroup(d, 9, 'Br'), d);
  assert.deepEqual(addGroup(d, 1, 'xyz'), d);
});

test('constructor: lo que no se sabe nombrar se declara fuera de alcance', () => {
  // dos carbonilos en la misma cadena con éster al lado: diéster / grupo no soportado
  const r = describe(mk(4, [[1, '=O'], [1, 'OCH3'], [4, '=O'], [4, 'OCH3']]));
  assert.notEqual(r.status, 'valido');
  assert.equal(r.analysis, null);
  assert.ok(r.errors.length > 0);
});

test('constructor: barrido — toda combinación de un grupo da estado válido, inválido o fuera de alcance, y si es válido el nombre vuelve a la misma molécula', () => {
  let validos = 0;
  for (let n = 1; n <= 6; n++) {
    for (const g of GROUPS) {
      for (let p = 1; p <= n; p++) {
        for (const ord of /** @type {(1 | 2 | 3)[]} */ ([1, 2, 3])) {
          const bs = n > 1 ? /** @type {[number, 1 | 2 | 3][]} */ ([[Math.min(p, n - 1), ord]]) : [];
          const d = mk(n, [[p, g.kind]], bs);
          const r = describe(d);
          assert.ok(['valido', 'invalido', 'fuera_de_alcance'].includes(r.status));
          if (r.status === 'valido') {
            validos++;
            assert.equal(r.analysis?.molecule?.canonicalKey(), r.molecule?.canonicalKey(), draftToSmiles(d));
            assert.equal(r.molecule?.validate().length, 0);
          } else {
            assert.ok(r.errors.length > 0, draftToSmiles(d));
          }
        }
      }
    }
  }
  assert.ok(validos > 300, `solo ${validos} casos válidos`);
});

/* ---------------------- verifica mi respuesta ---------------------- */

test('verifica: nombre correcto en otra forma aceptada', () => {
  const d = mk(3, [[2, 'OH']]);
  assert.equal(verify(d, 'propan-2-ol').verdict, 'correcta');
  assert.equal(verify(d, 'alcohol isopropílico').verdict, 'correcta');
});

test('verifica: estructura correcta pero nombre mal escrito (orden alfabético)', () => {
  const d = mk(6, [[2, 'metil'], [5, 'metil'], [3, 'Br']]);
  const v = verify(d, '3-bromo-2,5-dimetilhexano');
  assert.equal(v.verdict, 'correcta');
  const w = verify(d, '2,5-dimetil-3-bromohexano'); // misma molécula, orden no alfabético
  assert.equal(w.verdict, 'correcta_con_avisos');
  assert.ok(w.notes.length > 0);
  assert.equal(w.expected, '3-bromo-2,5-dimetilhexano');
});

test('verifica: isómero y molécula distinta', () => {
  const d = mk(3, [[2, 'OH']]); // 2-propanol
  const iso = verify(d, '1-propanol');
  assert.equal(iso.verdict, 'isomero');
  assert.match(iso.message, /isómero/);
  assert.equal(iso.student?.formula, 'C₃H₈O');
  const otra = verify(d, 'propanona');
  assert.equal(otra.verdict, 'distinta');
  assert.match(otra.message, /C₃H₆O/);
  assert.match(otra.message, /C₃H₈O/);
});

test('verifica: vacío, sin entender, incompleto y estructura inválida', () => {
  const d = mk(3, [[2, 'OH']]);
  assert.equal(verify(d, '   ').verdict, 'vacio');
  assert.equal(verify(d, 'xyz').verdict, 'no_se_entiende');
  assert.equal(verify(d, 'bromopropano').verdict, 'no_se_entiende');
  const mala = mk(3, [[2, '=O']], [[1, 2]]);
  assert.equal(verify(mala, 'propanona').verdict, 'sin_estructura');
});
