// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from '../src/core/analyze.js';

/** Tabla de oro de aromáticos (fórmulas comprobadas aparte por tools/check_golden.py). */
/** @type {{ nombre: string, formula: string, sustituyentes: string[], variantes: string[] }[]} */
const ORO = JSON.parse(readFileSync(new URL('./oro-aromaticos.json', import.meta.url), 'utf8'));

test('oro aromático: tamaño comprometido', () => {
  assert.ok(ORO.length >= 40);
  assert.ok(ORO.reduce((s, d) => s + 1 + d.variantes.length, 0) >= 70);
});

test('oro aromático: el nombre canónico se reconoce, da la fórmula y es su propio nombre sistemático', () => {
  /** @type {string[]} */
  const fallos = [];
  for (const d of ORO) {
    const a = analyze(d.nombre);
    if (a.status !== 'valido') fallos.push(`${d.nombre}: ${a.status} ${a.errors[0]?.message ?? ''}`);
    else if (a.formula !== d.formula) fallos.push(`${d.nombre}: fórmula ${a.formula} ≠ ${d.formula}`);
    else if (a.names?.sistematico !== d.nombre) fallos.push(`${d.nombre}: nombra ${a.names?.sistematico}`);
    else if (!a.correcto) fallos.push(`${d.nombre}: no se marca correcto`);
  }
  assert.deepEqual(fallos, []);
});

test('oro aromático: cada variante (o-/m-/p-, benceno, nombres comunes) es la misma estructura', () => {
  /** @type {string[]} */
  const fallos = [];
  for (const d of ORO) {
    const ref = analyze(d.nombre).molecule?.canonicalKey();
    for (const v of d.variantes) {
      const a = analyze(v);
      if (a.status !== 'valido') fallos.push(`${v}: ${a.status} ${a.errors[0]?.message ?? ''}`);
      else if (a.molecule?.canonicalKey() !== ref) fallos.push(`${v}: estructura distinta de ${d.nombre}`);
      else if (a.names?.sistematico !== d.nombre) fallos.push(`${v}: nombra ${a.names?.sistematico}`);
    }
  }
  assert.deepEqual(fallos, []);
});
