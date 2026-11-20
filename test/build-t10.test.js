// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/core/parser.js';
import { build } from '../src/core/build.js';
import { fromSmiles } from '../src/core/smiles.js';

/**
 * T10 (etapa 2): construcción de éteres, ésteres, aminas y amidas.
 * Oráculo independiente: la estructura se compara con un SMILES escrito a mano
 * (mismo grafo, no solo la misma fórmula).
 * @type {[string, string, string][]}  [nombre, SMILES, fórmula]
 */
const VALIDOS = [
  ['metoxietano', 'COCC', 'C₃H₈O'],
  ['etoxietano', 'CCOCC', 'C₄H₁₀O'],
  ['1-metoxi-2-metilpropano', 'COCC(C)C', 'C₅H₁₂O'],
  ['(2-metilpropoxi)etano', 'CCOCC(C)C', 'C₆H₁₄O'],
  ['etil metil éter', 'CCOC', 'C₃H₈O'],
  ['dietil éter', 'CCOCC', 'C₄H₁₀O'],
  ['éter etílico', 'CCOCC', 'C₄H₁₀O'],
  ['etanoato de metilo', 'CC(=O)OC', 'C₃H₆O₂'],
  ['propanoato de etilo', 'CCC(=O)OCC', 'C₅H₁₀O₂'],
  ['acetato de etilo', 'CC(=O)OCC', 'C₄H₈O₂'],
  ['metanoato de metilo', 'C(=O)OC', 'C₂H₄O₂'],
  ['propenoato de metilo', 'C=CC(=O)OC', 'C₄H₆O₂'],
  ['metilamina', 'CN', 'CH₅N'],
  ['etilamina', 'CCN', 'C₂H₇N'],
  ['dimetilamina', 'CNC', 'C₂H₇N'],
  ['trimetilamina', 'CN(C)C', 'C₃H₉N'],
  ['etilmetilamina', 'CCNC', 'C₃H₉N'],
  ['1-propanamina', 'CCCN', 'C₃H₉N'],
  ['propan-1-amina', 'CCCN', 'C₃H₉N'],
  ['etanamina', 'CCN', 'C₂H₇N'],
  ['N-metiletanamina', 'CCNC', 'C₃H₉N'],
  ['etano-1,2-diamina', 'NCCN', 'C₂H₈N₂'],
  ['1,2-diaminoetano', 'NCCN', 'C₂H₈N₂'],
  ['etanamida', 'CC(N)=O', 'C₂H₅NO'],
  ['acetamida', 'CC(N)=O', 'C₂H₅NO'],
  ['propanamida', 'CCC(N)=O', 'C₃H₇NO'],
  ['N-metiletanamida', 'CC(=O)NC', 'C₃H₇NO'],
  ['N,N-dimetiletanamida', 'CC(=O)N(C)C', 'C₄H₉NO'],
  ['2-metil-N-metilpropanamida', 'CC(C)C(=O)NC', 'C₅H₁₁NO'],
  ['etanodiamida', 'NC(=O)C(N)=O', 'C₂H₄N₂O₂'],
  ['ácido 2-aminopropanoico', 'CC(N)C(=O)O', 'C₃H₇NO₂'],
];

for (const [nombre, smiles, formula] of VALIDOS) {
  test(`T10 build: ${nombre}`, () => {
    const p = parse(nombre);
    assert.ok(p.ast, `${nombre}: el parser no devolvió AST (${p.status})`);
    const b = build(p.ast);
    assert.equal(b.status, 'valido', `${nombre}: ${b.errors.map((e) => e.message).join(' | ')}`);
    assert.ok(b.molecule);
    assert.equal(b.molecule.formula(), formula);
    assert.equal(b.molecule.canonicalKey(), fromSmiles(smiles).canonicalKey(), 'estructura distinta a la esperada');
    assert.equal(b.molecule.validate().length, 0);
  });
}

test('T10 build: el localizador N distingue N-metil de C-metil', () => {
  const nMetil = build(/** @type {any} */ (parse('N-metiletanamina').ast)).molecule;
  const cMetil = build(/** @type {any} */ (parse('1-metil-1-etanamina').ast)).molecule; // = isopropilamina
  assert.ok(nMetil && cMetil);
  assert.notEqual(nMetil.canonicalKey(), cMetil.canonicalKey());
  assert.equal(cMetil.canonicalKey(), fromSmiles('CC(C)N').canonicalKey());
});

test('T10 build: sin localizador se pide, y la opción N se muestra como «N» (no como 0)', () => {
  for (const nombre of ['metiletanamina', 'bromoetanamida', 'N-metilpropanamina', 'etoxipropano']) {
    const p = parse(nombre);
    assert.ok(p.ast, nombre);
    const b = build(p.ast);
    assert.equal(b.status, 'incompleto', nombre);
    assert.equal(b.molecule, null, `${nombre}: no debe adivinar`);
    assert.ok(!/\(0 \/|\/ 0[ )]/.test(b.errors[0].message), `${nombre}: filtra la posición interna 0: ${b.errors[0].message}`);
  }
  const msg = build(/** @type {any} */ (parse('metiletanamina').ast)).errors[0].message;
  assert.match(msg, /N/);
});

test('T10 build: errores químicos con mensaje claro', () => {
  /** @type {[string, RegExp][]} */
  const casos = [
    ['tetrametilamina', /máximo 3 radicales/],
    ['trimetil éter', /exactamente 2 radicales/],
    ['N-metilmetano', /N \(nitrógeno\)/], // N sin amina/amida
    ['N,N,N-trimetiletanamida', /valencia|enlaces/i], // N con 4 enlaces
    ['N-metiletano-1,2-diamina', /N y N/], // varios N: notación pendiente
    ['propanodioato de metilo', /diésteres|dioato/i],
  ];
  for (const [nombre, re] of casos) {
    const p = parse(nombre);
    if (!p.ast) continue; // el parser ya lo rechazó: también es correcto
    const b = build(p.ast);
    assert.notEqual(b.status, 'valido', nombre);
    assert.equal(b.molecule, null, `${nombre}: no debe devolver estructura`);
    assert.match(b.errors.map((e) => e.message).join(' | '), re, nombre);
  }
});

test('T10 build: «0» escrito como localizador no se confunde con N', () => {
  const p = parse('0-metiletanamina');
  assert.notEqual(p.status, 'valido');
  assert.equal(p.ast, null);
});

test('T10 build: la trazabilidad cubre función, N-sustituyente y cola del éster', () => {
  const b = build(/** @type {any} */ (parse('N-metiletanamida').ast));
  assert.ok(b.molecule);
  const fun = b.trace.find((t) => t.role === 'funcion' && t.label === 'amida');
  assert.ok(fun && fun.atomIds.length === 3, 'amida = C, O, N');
  const metil = b.trace.find((t) => t.role === 'grupo');
  assert.ok(metil);
  const nId = fun.atomIds.find((id) => b.molecule?.atoms[id].el === 'N');
  assert.ok(nId !== undefined);
  assert.ok(b.molecule.neighbors(nId).some((v) => v.id === metil.atomIds[0]), 'el metilo está unido al N');

  const e = build(/** @type {any} */ (parse('etanoato de metilo').ast));
  const cola = e.trace.find((t) => t.label === 'de metilo');
  assert.ok(cola && cola.atomIds.length === 1);
});
