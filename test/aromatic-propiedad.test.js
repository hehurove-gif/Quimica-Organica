// @ts-check
/**
 * Pruebas de propiedad y robustez del módulo aromático (semilla fija, reproducibles).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { SUBS, parseAromatic, buildAromatic, buildRing, nameAromatic, subByName } from '../src/core/aromatic.js';
import { analyze } from '../src/core/analyze.js';
import { describe, verify, moleculeToRing, emptyRing, setRingSub } from '../src/core/construct.js';

/** Generador pseudoaleatorio con semilla (mulberry32). */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Átomos de cada sustituyente, escritos aparte del código bajo prueba. */
const ATOMS = /** @type {Record<string, Record<string, number>>} */ ({
  fluoro: { F: 1 }, cloro: { Cl: 1 }, bromo: { Br: 1 }, yodo: { I: 1 }, nitro: { N: 1, O: 2 }, sulfo: { S: 1, O: 3, H: 1 },
  hidroxi: { O: 1, H: 1 }, amino: { N: 1, H: 2 }, formil: { C: 1, H: 1, O: 1 }, carboxi: { C: 1, O: 2, H: 1 },
  metoxi: { O: 1, C: 1, H: 3 }, etoxi: { O: 1, C: 2, H: 5 }, metil: { C: 1, H: 3 }, etil: { C: 2, H: 5 }, propil: { C: 3, H: 7 },
  isopropil: { C: 3, H: 7 }, butil: { C: 4, H: 9 }, isobutil: { C: 4, H: 9 }, 'sec-butil': { C: 4, H: 9 }, 'terc-butil': { C: 4, H: 9 },
});

/** @param {string} f fórmula con subíndices @returns {Record<string, number>} */
function counts(f) {
  /** @type {Record<string, number>} */
  const c = {};
  for (const [, el, n] of f.matchAll(/([A-Z][a-z]?)([₀-₉]*)/g)) {
    c[el] = (c[el] ?? 0) + (n ? Number([...n].map((d) => '₀₁₂₃₄₅₆₇₈₉'.indexOf(d)).join('')) : 1);
  }
  return c;
}

/** @param {number} seed @returns {{ pos: number, name: string }[]} */
function randomPlacement(next) {
  const k = Math.floor(next() * 7); // 0-6 sustituyentes
  const free = [1, 2, 3, 4, 5, 6];
  /** @type {{ pos: number, name: string }[]} */
  const out = [];
  for (let i = 0; i < k; i++) {
    const pos = free.splice(Math.floor(next() * free.length), 1)[0];
    out.push({ pos, name: SUBS[Math.floor(next() * SUBS.length)].name });
  }
  return out;
}

test('propiedad: 4000 anillos al azar — fórmula, valencias y clave coherentes con los sustituyentes', () => {
  const next = rng(20261122);
  for (let n = 0; n < 4000; n++) {
    const pl = randomPlacement(next);
    const m = buildRing(pl.map((p) => ({ pos: p.pos, sub: subByName(p.name) })));
    assert.deepEqual(m.validate(), []);
    const want = { C: 6, H: 6 - pl.length };
    for (const p of pl) for (const [el, k] of Object.entries(ATOMS[p.name])) want[el] = (want[el] ?? 0) + k;
    assert.deepEqual(counts(m.formula()), want, JSON.stringify(pl));
  }
});

test('propiedad: 4000 anillos al azar — nombre → estructura → mismo nombre; alternativas equivalentes', () => {
  const next = rng(424242);
  let nombrados = 0;
  for (let n = 0; n < 4000; n++) {
    const pl = randomPlacement(next);
    const m = buildRing(pl.map((p) => ({ pos: p.pos, sub: subByName(p.name) })));
    const r = nameAromatic(m);
    if (!r.ok) {
      // solo se rechaza con dos grupos principales iguales
      const principales = pl.filter((p) => ['carboxi', 'sulfo', 'formil', 'hidroxi', 'amino'].includes(p.name));
      assert.ok(principales.some((p) => principales.filter((q) => q.name === p.name).length > 1), JSON.stringify(pl));
      continue;
    }
    nombrados++;
    const a = analyze(r.systematic);
    assert.equal(a.status, 'valido', r.systematic);
    assert.equal(a.molecule?.canonicalKey(), m.canonicalKey(), r.systematic);
    assert.equal(a.correcto, true, r.systematic);
    assert.equal(a.names?.sistematico, r.systematic);
    assert.equal(a.formula, m.formula());
    for (const alt of r.alternatives) {
      const x = analyze(alt);
      assert.equal(x.status, 'valido', alt);
      assert.equal(x.molecule?.canonicalKey(), m.canonicalKey(), alt);
      assert.equal(x.correcto, true, alt);
    }
  }
  assert.ok(nombrados > 3000);
});

test('propiedad: el nombre no depende de cómo se numeren o giren los carbonos (12 simetrías)', () => {
  const next = rng(7);
  for (let n = 0; n < 600; n++) {
    const pl = randomPlacement(next);
    const base = nameAromatic(buildRing(pl.map((p) => ({ pos: p.pos, sub: subByName(p.name) }))));
    for (let s = 0; s < 6; s++) {
      for (const d of [1, -1]) {
        const moved = pl.map((p) => ({ pos: ((((p.pos - 1) * d + s) % 6) + 6) % 6 + 1, sub: subByName(p.name) }));
        const r = nameAromatic(buildRing(moved));
        assert.equal(r.ok, base.ok);
        if (r.ok && base.ok) assert.equal(r.systematic, base.systematic, JSON.stringify(pl));
      }
    }
  }
});

test('constructor de anillo: describe, verify y moleculeToRing son coherentes en 1500 anillos al azar', () => {
  const next = rng(99);
  for (let n = 0; n < 1500; n++) {
    const pl = randomPlacement(next);
    const rd = pl.reduce((d, p) => setRingSub(d, p.pos, p.name), emptyRing());
    const des = describe(rd);
    if (des.status !== 'valido') { assert.equal(des.canonicalName, null); continue; }
    const nombre = /** @type {string} */ (des.canonicalName);
    assert.equal(verify(rd, nombre).verdict, 'correcta', nombre);
    const back = moleculeToRing(/** @type {any} */ (des.molecule));
    assert.ok(back, nombre);
    assert.equal(describe(/** @type {any} */ (back)).canonicalName, nombre);
    // una molécula distinta nunca se da por buena
    const otro = setRingSub(rd, 1 + Math.floor(next() * 6), 'bromo');
    const d2 = describe(otro);
    if (d2.status === 'valido' && d2.molecule?.canonicalKey() !== des.molecule?.canonicalKey()) {
      assert.notEqual(verify(rd, /** @type {string} */ (d2.canonicalName)).verdict, 'correcta');
    }
  }
});

test('robustez: ningún texto hace fallar el análisis (prefijos, mayúsculas, basura, símbolos)', () => {
  const nombres = ['2,4,6-trinitrotolueno', 'ácido 2-hidroxibenzoico', '4-bromo-1,2-dimetilbenceno', 'p-nitrotolueno', 'o-xileno', 'hexaclorobenceno'];
  const estados = new Set(['valido', 'incompleto', 'invalido', 'fuera_de_alcance', 'vacio']);
  /** @type {string[]} */
  const textos = ['', ' ', 'benceno ', 'BENCENO', 'Tolueno', '  1,2-DIBROMOBENCENO  ', '1,2,3,4,5,6,7-heptaclorobenceno', 'o-', 'p-p-benceno',
    '--benceno', '1-', ',,benceno', 'benceno,', '1,,2-dibromobenceno', '99999999999-bromobenceno', 'bromo benceno', 'bromobencenobenceno',
    'ácido bencenosulfónico de sodio', 'benzoato de metilo', 'fenilamina', 'nitro', 'benzeno', 'bencenobenceno', '1-bromo-bencenо', '😀benceno'];
  for (const n of nombres) for (let i = 0; i <= n.length; i++) { textos.push(n.slice(0, i)); textos.push(n.slice(i)); }
  const next = rng(5);
  const alfabeto = '0123456789,-() abcdefghilmnoprstuxz';
  for (let i = 0; i < 1500; i++) {
    let t = '';
    for (let k = Math.floor(next() * 14); k > 0; k--) t += alfabeto[Math.floor(next() * alfabeto.length)];
    textos.push(next() < 0.5 ? t + 'benceno' : t);
  }
  for (const t of textos) {
    const a = analyze(t);
    assert.ok(estados.has(a.status), `«${t}» → ${a.status}`);
    if (a.status === 'valido') assert.ok(a.molecule && a.molecule.validate().length === 0, t);
    else assert.equal(a.molecule, null, `«${t}» no debe inventar estructura`);
    const p = parseAromatic(t);
    if (p.status === 'valido') {
      const b = buildAromatic(p.ast);
      if (b.status === 'valido') assert.deepEqual(b.molecule.validate(), [], t);
    }
  }
});
