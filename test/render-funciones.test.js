// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/core/analyze.js';
import { renderSvg } from '../src/core/render.js';

/** @type {[string, string][]} */
const SEMI = [
  ['4-penten-2-ol', 'CH₃–CH(OH)–CH₂–CH=CH₂'],
  ['ácido etanoico', 'HOOC–CH₃'],
  ['propanal', 'OHC–CH₂–CH₃'],
  ['butanona', 'CH₃–C(=O)–CH₂–CH₃'],
  ['1,2-etanodiol', 'HOCH₂–CH₂OH'],
  ['metanal', 'HCHO'],
  ['ácido metanoico', 'HCOOH'],
  ['propino', 'CH≡C–CH₃'],
  ['metanol', 'CH₃OH'],
];

test('semidesarrollada con funciones y enlaces múltiples', () => {
  for (const [name, semi] of SEMI) assert.equal(analyze(name).semidesarrollada, semi, name);
});

test('SVG: enlaces dobles y triples son líneas paralelas con el mismo data-bond', () => {
  const count = (/** @type {string} */ name) => {
    const a = analyze(name);
    const svg = renderSvg(/** @type {any} */ (a.molecule), a.chain);
    return { svg, lines: (svg.match(/<line /g) || []).length, bonds: a.molecule?.bonds.length || 0 };
  };
  const eteno = count('eteno'); // 1 doble = 2 líneas
  assert.equal(eteno.lines, 2);
  const etino = count('etino'); // 1 triple = 3 líneas
  assert.equal(etino.lines, 3);
  const acetona = count('propanona'); // 2 simples + 1 doble = 4
  assert.equal(acetona.lines, 4);
  assert.match(count('etanol').svg, />OH<|>HO</);
});

test('trazabilidad: función y enlace múltiple se enlazan con su parte del nombre', () => {
  const a = analyze('4-penten-2-ol');
  const roles = a.trace.map((t) => t.role);
  assert.ok(roles.includes('insaturacion') && roles.includes('funcion'));
  for (const t of a.trace) assert.ok(t.span && t.span.to > t.span.from, t.label);
  assert.ok(a.steps.some((s) => /Enlace doble/.test(s.title)));
  assert.ok(a.steps.some((s) => /alcohol/.test(s.text)));
});
