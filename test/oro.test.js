// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from '../src/core/analyze.js';
import { fromSmiles } from '../src/core/smiles.js';

/** Tabla de oro compartida con tools/check_golden.py (que calcula la fórmula por su cuenta). */
/** @type {{ nombre: string, formula: string, smiles: string, variantes: string[] }[]} */
const ORO = JSON.parse(readFileSync(new URL('./oro.json', import.meta.url), 'utf8'));

test('T5: la tabla de oro tiene el tamaño comprometido', () => {
  assert.ok(ORO.length >= 80);
  assert.ok(ORO.reduce((s, d) => s + 1 + d.variantes.length, 0) >= 150);
});

test('T5: cada nombre y variante da la fórmula y la estructura de referencia', () => {
  /** @type {string[]} */
  const fallos = [];
  for (const d of ORO) {
    const ref = fromSmiles(d.smiles);
    for (const nm of [d.nombre, ...d.variantes]) {
      const a = analyze(nm);
      if (a.status !== 'valido') fallos.push(`${nm}: ${a.status} ${a.errors[0]?.message ?? ''}`);
      else if (a.formula !== d.formula) fallos.push(`${nm}: fórmula ${a.formula} ≠ ${d.formula}`);
      else if (a.molecule?.canonicalKey() !== ref.canonicalKey()) fallos.push(`${nm}: estructura distinta`);
    }
  }
  assert.deepEqual(fallos, []);
});

test('T5: el nombre canónico de cada compuesto es el de la tabla (estructura -> nombre)', () => {
  /** @type {string[]} */
  const fallos = [];
  for (const d of ORO) {
    const a = analyze(d.nombre);
    const dado = a.names?.sistematico;
    if (a.status !== 'valido' || !dado) continue;
    const canon = [dado, a.names?.iupac2013 ?? ''].map((x) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase());
    const mio = d.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    if (!canon.includes(mio) && !d.variantes.length) fallos.push(`${d.nombre} -> ${dado}`);
  }
  assert.deepEqual(fallos, []);
});
