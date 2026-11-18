// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/core/analyze.js';

/**
 * T10: familias aún no implementadas. Dos garantías:
 *  1) HOY se declaran fuera de alcance y no devuelven estructura (prueba real, verde).
 *  2) MAÑANA deben dar esta fórmula (prueba `todo`, visible en el reporte, no oculta).
 * @type {[string, string][]}
 */
const FUTURO = [
  ['etoxietano', 'C₄H₁₀O'],
  ['metoxietano', 'C₃H₈O'],
  ['etanoato de metilo', 'C₃H₆O₂'],
  ['propanoato de etilo', 'C₅H₁₀O₂'],
  ['etilamina', 'C₂H₇N'],
  ['dimetilamina', 'C₂H₇N'],
  ['etanamida', 'C₂H₅NO'],
  ['propanamida', 'C₃H₇NO'],
];

test('T10 (hoy): éteres, ésteres, aminas y amidas se declaran fuera de alcance', () => {
  for (const [nombre] of FUTURO) {
    const a = analyze(nombre);
    assert.notEqual(a.status, 'valido', nombre);
    assert.equal(a.molecule, null, `${nombre}: no debe inventar estructura`);
    assert.ok(['fuera_de_alcance', 'invalido'].includes(a.status), `${nombre}: ${a.status}`);
  }
});

for (const [nombre, formula] of FUTURO) {
  test(`T10 (pendiente): ${nombre} -> ${formula}`, { todo: 'familia aún no implementada' }, () => {
    const a = analyze(nombre);
    assert.equal(a.status, 'valido');
    assert.equal(a.formula, formula);
  });
}
