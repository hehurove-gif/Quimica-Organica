// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/core/analyze.js';

/**
 * T10: éteres, ésteres, aminas y amidas (v0.3). Cada nombre debe dar esta fórmula.
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

for (const [nombre, formula] of FUTURO) {
  test(`T10: ${nombre} -> ${formula}`, () => {
    const a = analyze(nombre);
    assert.equal(a.status, 'valido', nombre);
    assert.equal(a.formula, formula);
    assert.ok(a.molecule, `${nombre}: debe devolver estructura`);
  });
}
