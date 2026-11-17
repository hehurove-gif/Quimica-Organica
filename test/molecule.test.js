// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { Molecule } from '../src/core/molecule.js';

/** Construye una cadena lineal de n carbonos. @param {number} n */
function chain(n) {
  const m = new Molecule();
  const ids = [];
  for (let i = 0; i < n; i++) {
    ids.push(m.addAtom('C'));
    if (i) m.addBond(ids[i - 1], ids[i]);
  }
  return { m, ids };
}

test('hidrógenos implícitos y fórmula del butano', () => {
  const { m, ids } = chain(4);
  assert.equal(m.implicitH(ids[0]), 3);
  assert.equal(m.implicitH(ids[1]), 2);
  assert.equal(m.formula(), 'C₄H₁₀');
  assert.deepEqual(m.validate(), []);
});

test('fórmula con halógenos en orden de Hill', () => {
  const { m, ids } = chain(2);
  const br = m.addAtom('Br');
  m.addBond(ids[1], br);
  assert.equal(m.formula(), 'C₂H₅Br');
});

test('detecta valencia excedida', () => {
  const { m, ids } = chain(2);
  for (let i = 0; i < 3; i++) m.addBond(ids[0], m.addAtom('Cl'));
  // C1: 1 (cadena) + 3 = 4 -> aún válido
  assert.deepEqual(m.validate(), []);
  m.addBond(ids[0], m.addAtom('Cl'));
  const issues = m.validate();
  assert.equal(issues.length, 1);
  assert.equal(issues[0].code, 'valencia');
});

test('detecta átomos desconectados y enlaces a átomos inexistentes', () => {
  const m = new Molecule();
  m.addAtom('C');
  m.addAtom('C');
  assert.equal(m.validate()[0].code, 'desconectado');
  m.addBond(0, 9);
  assert.equal(m.validate()[0].code, 'enlace_invalido');
});

test('la clave canónica no depende del orden de los átomos ni de los ids', () => {
  // 2-metilbutano construido de dos maneras distintas
  const a = new Molecule();
  const [a1, a2, a3, a4, a5] = [0, 1, 2, 3, 4].map(() => a.addAtom('C'));
  a.addBond(a1, a2);
  a.addBond(a2, a3);
  a.addBond(a3, a4);
  a.addBond(a2, a5);

  const b = new Molecule();
  const [b1, b2, b3, b4, b5] = [0, 1, 2, 3, 4].map(() => b.addAtom('C'));
  b.addBond(b5, b4);
  b.addBond(b4, b3);
  b.addBond(b3, b2);
  b.addBond(b3, b1);
  assert.equal(a.canonicalKey(), b.canonicalKey());
});

test('la clave canónica distingue isómeros', () => {
  // pentano vs 2-metilbutano vs 2,2-dimetilpropano
  const pentano = chain(5).m;
  const metilbutano = new Molecule();
  const ids = [0, 1, 2, 3, 4].map(() => metilbutano.addAtom('C'));
  metilbutano.addBond(ids[0], ids[1]);
  metilbutano.addBond(ids[1], ids[2]);
  metilbutano.addBond(ids[2], ids[3]);
  metilbutano.addBond(ids[1], ids[4]);
  const neo = new Molecule();
  const n = [0, 1, 2, 3, 4].map(() => neo.addAtom('C'));
  for (let i = 1; i < 5; i++) neo.addBond(n[0], n[i]);
  const keys = new Set([pentano.canonicalKey(), metilbutano.canonicalKey(), neo.canonicalKey()]);
  assert.equal(keys.size, 3);
});

test('la clave canónica distingue la posición del halógeno', () => {
  const x = chain(3);
  x.m.addBond(x.ids[0], x.m.addAtom('Br'));
  const y = chain(3);
  y.m.addBond(y.ids[1], y.m.addAtom('Br'));
  assert.notEqual(x.m.canonicalKey(), y.m.canonicalKey());
});

test('moléculas con ciclos no tienen clave canónica (fuera de alcance v0.1)', () => {
  const { m, ids } = chain(3);
  m.addBond(ids[0], ids[2]);
  assert.equal(m.canonicalKey(), null);
});
