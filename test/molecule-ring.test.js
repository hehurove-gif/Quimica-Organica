// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { Molecule } from '../src/core/molecule.js';

/**
 * Benzol a mano: anillo de 6 C (Kekulé con el doble enlace en la pareja `kek`, 0 o 1) y sustituyentes.
 * @param {Record<number, 'Br' | 'Cl' | 'CH3' | 'NO2' | 'OH' | 'SO3H'>} subs posición 1-6 -> grupo
 * @param {{ kek?: 0 | 1, shift?: number, reverse?: boolean }} [o] giro/sentido/Kekulé para probar la invarianza
 */
function benzene(subs, o = {}) {
  const m = new Molecule();
  const ring = Array.from({ length: 6 }, () => m.addAtom('C'));
  for (let i = 0; i < 6; i++) m.addBond(ring[i], ring[(i + 1) % 6], /** @type {1 | 2} */ ((i + (o.kek || 0)) % 2 === 0 ? 2 : 1));
  for (const [pos, g] of Object.entries(subs)) {
    let k = (Number(pos) - 1 + (o.shift || 0)) % 6;
    if (o.reverse) k = (6 - k) % 6;
    const c = ring[k];
    if (g === 'Br' || g === 'Cl') m.addBond(c, m.addAtom(g));
    else if (g === 'CH3') m.addBond(c, m.addAtom('C'));
    else if (g === 'OH') m.addBond(c, m.addAtom('O'));
    else if (g === 'NO2') {
      const n = m.addAtom('N', 1);
      m.addBond(c, n);
      m.addBond(n, m.addAtom('O'), 2);
      m.addBond(n, m.addAtom('O', -1));
    } else if (g === 'SO3H') {
      const s = m.addAtom('S');
      m.addBond(c, s);
      m.addBond(s, m.addAtom('O'), 2);
      m.addBond(s, m.addAtom('O'), 2);
      m.addBond(s, m.addAtom('O'));
    }
  }
  return m;
}

test('anillo: fórmulas y valencias (nitro con carga formal, sulfo con S)', () => {
  /** @type {[Record<number, any>, string][]} */
  const casos = [
    [{}, 'C₆H₆'],
    [{ 1: 'Br' }, 'C₆H₅Br'],
    [{ 1: 'CH3' }, 'C₇H₈'],
    [{ 1: 'NO2' }, 'C₆H₅NO₂'],
    [{ 1: 'CH3', 2: 'NO2', 4: 'NO2', 6: 'NO2' }, 'C₇H₅N₃O₆'], // TNT
    [{ 1: 'SO3H' }, 'C₆H₆O₃S'],
    [{ 1: 'OH', 2: 'Cl' }, 'C₆H₅ClO'],
  ];
  for (const [s, f] of casos) {
    const m = benzene(s);
    assert.deepEqual(m.validate(), [], JSON.stringify(s));
    assert.equal(m.formula(), f, JSON.stringify(s));
  }
});

test('anillo: clave canónica invariante a giro, sentido y forma de Kekulé', () => {
  const base = { 1: 'CH3', 2: 'Br', 4: 'NO2' };
  const k = benzene(base).canonicalKey();
  assert.ok(k && k.startsWith('Ar6<'));
  for (const kek of /** @type {(0 | 1)[]} */ ([0, 1])) {
    for (let shift = 0; shift < 6; shift++) {
      for (const reverse of [false, true]) {
        assert.equal(benzene(base, { kek, shift, reverse }).canonicalKey(), k, `kek=${kek} shift=${shift} rev=${reverse}`);
      }
    }
  }
});

test('anillo: o-, m- y p- son moléculas distintas; los trisustituidos también', () => {
  const keys = [
    benzene({ 1: 'Br', 2: 'Br' }), benzene({ 1: 'Br', 3: 'Br' }), benzene({ 1: 'Br', 4: 'Br' }),
    benzene({ 1: 'Br', 2: 'Br', 3: 'Br' }), benzene({ 1: 'Br', 2: 'Br', 4: 'Br' }), benzene({ 1: 'Br', 3: 'Br', 5: 'Br' }),
    benzene({ 1: 'Br', 2: 'Cl', 3: 'Br' }), benzene({ 1: 'Br', 2: 'Br', 3: 'Cl' }),
  ].map((m) => m.canonicalKey());
  assert.equal(new Set(keys).size, keys.length);
  // 1,2 = 2,1 = 3,4 ... (misma molécula)
  assert.equal(benzene({ 1: 'Br', 2: 'Cl' }).canonicalKey(), benzene({ 3: 'Cl', 4: 'Br' }).canonicalKey());
  assert.equal(benzene({ 2: 'Br', 6: 'Br' }).canonicalKey(), benzene({ 1: 'Br', 3: 'Br' }).canonicalKey()); // ambas meta
});

test('anillo: lo que no es benceno no recibe clave (ciclohexano, dos ciclos, grafo roto)', () => {
  const m = new Molecule();
  const r = Array.from({ length: 6 }, () => m.addAtom('C'));
  for (let i = 0; i < 6; i++) m.addBond(r[i], r[(i + 1) % 6]);
  assert.equal(m.canonicalKey(), null); // ciclohexano: aún no
  const n = new Molecule();
  const q = Array.from({ length: 5 }, () => n.addAtom('C'));
  for (let i = 0; i < 5; i++) n.addBond(q[i], q[(i + 1) % 5]);
  assert.equal(n.canonicalKey(), null); // ciclopentano
});

test('anillo: las moléculas acíclicas conservan su clave de siempre', () => {
  const m = new Molecule();
  const a = m.addAtom('C');
  const b = m.addAtom('C');
  m.addBond(a, b);
  assert.equal(m.canonicalKey(), 'C()~1~C()'); // etano: dos centros
});
