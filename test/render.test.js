// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/core/parser.js';
import { build } from '../src/core/build.js';
import { nameMolecule } from '../src/core/namer.js';
import { semidesarrollada, renderSvg, layout } from '../src/core/render.js';

/** @param {string} name */
function make(name) {
  const p = parse(name);
  const r = build(/** @type {import('../src/core/parser.js').Ast} */ (p.ast));
  const mol = /** @type {import('../src/core/molecule.js').Molecule} */ (r.molecule);
  const n = nameMolecule(mol);
  assert.ok(n.ok);
  return { mol, chain: n.ok ? n.chain : [] };
}

test('semidesarrollada coincide con las imágenes de referencia', () => {
  let { mol, chain } = make('bromoetano');
  // C1 siempre a la izquierda (coincide con la numeración); la imagen de referencia lo dibuja al revés
  assert.equal(semidesarrollada(mol, chain), 'Br–CH₂–CH₃');
  ({ mol, chain } = make('1-bromo-2-metilpropano'));
  assert.equal(semidesarrollada(mol, chain), 'Br–CH₂–CH(CH₃)–CH₃');
  ({ mol, chain } = make('5-fluoro-2-metil-1-yodohexano'));
  assert.equal(semidesarrollada(mol, chain), 'I–CH₂–CH(CH₃)–CH₂–CH₂–CH(F)–CH₃'.replace('CH(F)', 'CHF'));
});

test('semidesarrollada: casos con varios sustituyentes', () => {
  let { mol, chain } = make('2,2-dimetilpropano');
  assert.equal(semidesarrollada(mol, chain), 'CH₃–C(CH₃)(CH₃)–CH₃');
  ({ mol, chain } = make('triclorometano'));
  assert.equal(semidesarrollada(mol, chain), 'CHCl₃');
  ({ mol, chain } = make('metano'));
  assert.equal(semidesarrollada(mol, chain), 'CH₄');
  ({ mol, chain } = make('1,2-dibromoetano'));
  assert.equal(semidesarrollada(mol, chain), 'Br–CH₂–CH₂–Br');
});

test('SVG: un grupo por átomo, un trazo por enlace, sin coordenadas inválidas', () => {
  for (const nombre of ['hexano', '5-fluoro-2-metil-1-yodohexano', '2-bromo-2-metilpropano', '3-etil-2-metilpentano', 'tetraclorometano', '2-(2-metilpropil)heptano']) {
    const { mol, chain } = make(nombre);
    const svg = renderSvg(mol, chain, { locants: true });
    assert.equal((svg.match(/data-atom=/g) || []).length, mol.atoms.length, nombre);
    assert.equal((svg.match(/data-bond=/g) || []).length, mol.bonds.length, nombre);
    assert.ok(!/NaN|undefined|Infinity/.test(svg), `${nombre}: coordenadas inválidas`);
    assert.match(svg, /^<svg /);
  }
});

test('layout: ningún par de átomos se superpone (casos típicos del temario)', () => {
  const casos = ['hexano', '5-fluoro-2-metil-1-yodohexano', '2,2-dimetilpropano', '3-etil-2-metilpentano', '2,2,4-trimetilpentano', '1-bromo-2-metilpropano', 'tetraclorometano', '2,3-dimetilbutano', '3,3-dietilpentano'];
  for (const nombre of casos) {
    const { mol, chain } = make(nombre);
    const pos = [...layout(mol, chain, 68).entries()];
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const d = Math.hypot(pos[i][1].x - pos[j][1].x, pos[i][1].y - pos[j][1].y);
        assert.ok(d > 25, `${nombre}: átomos ${pos[i][0]} y ${pos[j][0]} a ${d.toFixed(1)}px`);
      }
    }
  }
});
