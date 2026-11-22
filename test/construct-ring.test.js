// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyRing, setRingSub, describe, verify, moleculeToRing } from '../src/core/construct.js';
import { analyze } from '../src/core/analyze.js';

/** @param {[number, string][]} l */
const ring = (l) => l.reduce((d, [p, n]) => setRingSub(d, p, n), emptyRing());

test('constructor de anillo: describe nombra y cierra la ida y vuelta', () => {
  assert.equal(describe(emptyRing()).canonicalName, 'benceno');
  const tnt = describe(ring([[1, 'metil'], [2, 'nitro'], [4, 'nitro'], [6, 'nitro']]));
  assert.equal(tnt.status, 'valido');
  assert.equal(tnt.canonicalName, '2,4,6-trinitrotolueno');
  assert.equal(tnt.formula, 'C₇H₅N₃O₆');
  assert.equal(describe(ring([[3, 'carboxi'], [5, 'hidroxi']])).canonicalName, 'ácido 3-hidroxibenzoico');
});

test('constructor de anillo: dos grupos principales iguales → fuera de alcance, sin inventar nombre', () => {
  const r = describe(ring([[1, 'hidroxi'], [2, 'hidroxi']]));
  assert.equal(r.status, 'fuera_de_alcance');
  assert.equal(r.canonicalName, null);
});

test('constructor de anillo: setRingSub ignora posiciones o sustituyentes inválidos', () => {
  const d = emptyRing();
  assert.equal(setRingSub(d, 7, 'bromo'), d);
  assert.equal(setRingSub(d, 1, 'fenil'), d);
  assert.deepEqual(setRingSub(setRingSub(d, 2, 'bromo'), 2, null).subs, Array(6).fill(null));
});

test('verifica mi respuesta con anillo: compara estructuras, no texto', () => {
  const d = ring([[1, 'bromo'], [4, 'cloro']]);
  assert.equal(verify(d, '1-bromo-4-clorobenceno').verdict, 'correcta');
  assert.equal(verify(d, 'p-bromoclorobenceno').verdict, 'correcta');
  // orden alfabético incumplido: misma estructura, nombre mejorable
  assert.equal(verify(d, 'p-clorobromobenceno').verdict, 'correcta_con_avisos');
  assert.equal(verify(d, '4-bromo-1-clorobenceno').verdict, 'correcta_con_avisos');
  assert.equal(verify(d, '1-bromo-3-clorobenceno').verdict, 'isomero');
  assert.equal(verify(d, 'bromobenceno').verdict, 'distinta');
  assert.equal(verify(d, 'dibromobenceno').verdict, 'no_se_entiende');
});

test('sincronía nombre → constructor: la numeración del nombre se conserva', () => {
  const a = analyze('2,4,6-trinitrotolueno');
  const rd = a.molecule ? moleculeToRing(a.molecule) : null;
  assert.deepEqual(rd?.subs, ['metil', 'nitro', null, 'nitro', null, 'nitro']);
  assert.equal(describe(/** @type {any} */ (rd)).canonicalName, '2,4,6-trinitrotolueno');
  assert.equal(moleculeToRing(analyze('butano').molecule ?? /** @type {any} */ (null)), null);
});
