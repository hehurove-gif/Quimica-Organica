// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { Molecule } from '../src/core/molecule.js';
import { nameMolecule } from '../src/core/namer.js';
import { analyze } from '../src/core/analyze.js';

/** PRNG determinista. @param {number} a */
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Molécula acíclica aleatoria con C, halógenos, OH y =O (válida por valencia).
 * @param {() => number} rnd
 */
function randomMolecule(rnd) {
  const m = new Molecule();
  const n = 1 + Math.floor(rnd() * 7);
  /** @type {number[]} */
  const cs = [m.addAtom('C')];
  for (let i = 1; i < n; i++) {
    const parent = cs[Math.floor(rnd() * cs.length)];
    const id = m.addAtom('C');
    // 15 %: enlace doble, 8 %: triple (si la valencia lo permite)
    const r = rnd();
    const want = r < 0.08 ? 3 : r < 0.23 ? 2 : 1;
    const order = m.bondSum(parent) + want <= 4 && want <= 3 ? want : 1;
    m.addBond(parent, id, order);
    cs.push(id);
  }
  const extras = Math.floor(rnd() * 4);
  for (let k = 0; k < extras; k++) {
    const c = cs[Math.floor(rnd() * cs.length)];
    const r = rnd();
    const free = 4 - m.bondSum(c);
    if (free <= 0) continue;
    if (r < 0.4) m.addBond(c, m.addAtom('O'), 1);
    else if (r < 0.6 && free >= 2) m.addBond(c, m.addAtom('O'), 2);
    else m.addBond(c, m.addAtom(['F', 'Cl', 'Br', 'I'][Math.floor(rnd() * 4)]), 1);
  }
  return m;
}

test('propiedad: nombre -> lectura -> misma molécula (escolar e IUPAC 2013), 3000 moléculas', () => {
  const rnd = mulberry32(2026);
  let named = 0;
  let skipped = 0;
  for (let i = 0; i < 3000; i++) {
    const mol = randomMolecule(rnd);
    if (mol.validate().length) continue;
    const r = nameMolecule(mol);
    if (!r.ok) {
      skipped++;
      continue;
    }
    named++;
    for (const nm of [r.systematic, r.iupac2013]) {
      const a = analyze(nm);
      assert.equal(a.status, 'valido', `${nm}: ${a.errors.map((e) => e.message).join('|')}`);
      assert.equal(a.molecule?.canonicalKey(), mol.canonicalKey(), `${nm} (${mol.formula()})`);
      assert.equal(a.correcto, true, nm);
      assert.equal(a.formula, mol.formula(), nm);
    }
  }
  assert.ok(named > 1500, `solo ${named} nombradas (${skipped} fuera de alcance)`);
});
