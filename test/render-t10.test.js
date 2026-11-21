// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/core/analyze.js';
import { renderSvg } from '../src/core/render.js';

/**
 * T10 (etapa 5): dibujo de éteres, ésteres, aminas y amidas.
 * Texto semidesarrollado esperado, escrito a mano y legible de izquierda a derecha
 * (C1 siempre a la izquierda: los radicales del lado izquierdo se escriben al revés).
 * @type {[string, string][]}
 */
const TEXTO = [
  // éteres
  ['metoxietano', 'CH₃–O–CH₂–CH₃'],
  ['etoxietano', 'CH₃–CH₂–O–CH₂–CH₃'],
  ['metoximetano', 'CH₃–O–CH₃'],
  ['2-metoxipropano', 'CH₃–CH(OCH₃)–CH₃'],
  ['2-metil-1-metoxipropano', 'CH₃–O–CH₂–CH(CH₃)–CH₃'],
  ['3-metoxipropanal', 'OHC–CH₂–CH₂–O–CH₃'],
  // ésteres
  ['etanoato de metilo', 'CH₃–OOC–CH₃'],
  ['propanoato de etilo', 'CH₃–CH₂–OOC–CH₂–CH₃'],
  ['etanoato de isopropilo', 'CH₃–CH(CH₃)–OOC–CH₃'],
  ['etanoato de isobutilo', 'CH₃–CH(CH₃)–CH₂–OOC–CH₃'],
  ['metanoato de metilo', 'HCOO–CH₃'],
  ['propenoato de metilo', 'CH₃–OOC–CH=CH₂'],
  // aminas
  ['metilamina', 'CH₃NH₂'],
  ['propan-2-amina', 'CH₃–CH(NH₂)–CH₃'],
  ['2-aminopentano', 'CH₃–CH(NH₂)–CH₂–CH₂–CH₃'],
  ['dimetilamina', 'CH₃–NH–CH₃'],
  ['trimetilamina', 'CH₃–N(CH₃)–CH₃'],
  ['etilmetilamina', 'CH₃–NH–CH₂–CH₃'],
  ['dibutilamina', 'CH₃–CH₂–CH₂–CH₂–NH–CH₂–CH₂–CH₂–CH₃'],
  ['N-metilpropan-2-amina', 'CH₃–CH(NHCH₃)–CH₃'],
  ['N-etil-N-metilpropan-1-amina', 'CH₃–N(CH₂–CH₃)–CH₂–CH₂–CH₃'],
  ['etano-1,2-diamina', 'H₂NCH₂–CH₂NH₂'],
  // amidas
  ['metanamida', 'HCONH₂'],
  ['etanamida', 'H₂NOC–CH₃'],
  ['butanamida', 'H₂NOC–CH₂–CH₂–CH₃'],
  ['N-metiletanamida', 'CH₃–NH–CO–CH₃'],
  ['N,N-dimetiletanamida', 'CH₃–N(CH₃)–CO–CH₃'],
  ['N-etilpropanamida', 'CH₃–CH₂–NH–CO–CH₂–CH₃'],
  ['N,N-dietiletanamida', 'CH₃–CH₂–N(CH₂–CH₃)–CO–CH₃'],
  // varias funciones
  ['ácido 2-aminopropanoico', 'HOOC–CH(NH₂)–CH₃'],
  ['3-aminopropanamida', 'H₂NOC–CH₂–CH₂NH₂'],
  ['2-hidroxietanoato de metilo', 'CH₃–OOC–CH₂OH'],
];

for (const [nombre, esperado] of TEXTO) {
  test(`T10 render: ${nombre} -> ${esperado}`, () => {
    const a = analyze(nombre);
    assert.equal(a.status, 'valido', nombre);
    assert.equal(a.semidesarrollada, esperado);
  });
}

test('T10 render: la fórmula del texto coincide con la molécula (C, N y O contados)', () => {
  /** @param {string} t @param {string} el */
  const cuenta = (t, el) => {
    const re = new RegExp(`${el}(?![a-z])([₀-₉]*)`, 'g');
    let n = 0;
    for (const m of t.matchAll(re)) n += m[1] ? Number([...m[1]].map((d) => '₀₁₂₃₄₅₆₇₈₉'.indexOf(d)).join('')) : 1;
    return n;
  };
  for (const [nombre] of TEXTO) {
    const a = analyze(nombre);
    const m = /** @type {import('../src/core/molecule.js').Molecule} */ (a.molecule);
    const texto = /** @type {string} */ (a.semidesarrollada);
    for (const el of ['C', 'N', 'O']) {
      const real = m.atoms.filter((x) => x.el === el).length;
      // el texto también escribe «CO», «COO», «OOC»: se cuentan por letra
      assert.equal(cuenta(texto, el), real, `${nombre}: ${el} en «${texto}»`);
    }
    // hidrógenos: los H del texto = H implícitos de la molécula
    const hTexto = [...texto.matchAll(/H([₀-₉]*)/g)].reduce((s, x) => s + (x[1] ? Number([...x[1]].map((d) => '₀₁₂₃₄₅₆₇₈₉'.indexOf(d)).join('')) : 1), 0);
    const hReal = m.atoms.reduce((s, x) => s + m.implicitH(x.id), 0);
    assert.equal(hTexto, hReal, `${nombre}: H en «${texto}»`);
  }
});

test('T10 render: el SVG dibuja todos los átomos y enlaces con sus etiquetas', () => {
  for (const [nombre] of TEXTO) {
    const a = analyze(nombre);
    const m = /** @type {import('../src/core/molecule.js').Molecule} */ (a.molecule);
    const svg = renderSvg(m, a.chain, { locants: true });
    assert.ok(!/NaN|undefined/.test(svg), `${nombre}: coordenadas rotas`);
    for (const at of m.atoms) assert.ok(svg.includes(`data-atom="${at.id}"`), `${nombre}: falta el átomo ${at.id}`);
    for (const b of m.bonds) assert.ok(svg.includes(`data-bond="${b.a}-${b.b}"`) || svg.includes(`data-bond="${b.b}-${b.a}"`), `${nombre}: falta el enlace ${b.a}-${b.b}`);
    const dobles = m.bonds.filter((b) => b.order === 2).length;
    const lineas = (svg.match(/<line /g) || []).length;
    assert.equal(lineas, m.bonds.length + dobles, `${nombre}: líneas de enlace`);
  }
  // etiquetas: N y O con sus hidrógenos
  const amida = renderSvg(/** @type {any} */ (analyze('etanamida').molecule), /** @type {any} */ (analyze('etanamida').chain));
  assert.match(amida, /el-N/);
  assert.match(amida, />NH<tspan[^>]*>2<\/tspan>|>NH2</, 'NH₂ con subíndice');
  const eter = renderSvg(/** @type {any} */ (analyze('metoxietano').molecule), /** @type {any} */ (analyze('metoxietano').chain));
  assert.match(eter, /el-O/);
});

test('T10 render: un radical a la derecha y otro a la izquierda no se pisan (éster y éter sencillos)', () => {
  for (const nombre of ['etanoato de isopropilo', 'etoxietano', 'N,N-dimetiletanamida', 'N-etil-N-metilpropan-1-amina']) {
    const a = analyze(nombre);
    const svg = renderSvg(/** @type {any} */ (a.molecule), /** @type {any} */ (a.chain));
    // posiciones (x,y) de los textos de los átomos: no debe haber dos a menos de 12 px
    const pts = [...svg.matchAll(/<text x="([-\d.]+)" y="([-\d.]+)"/g)].map((m) => [Number(m[1]), Number(m[2])]);
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        assert.ok(Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]) > 12, `${nombre}: átomos encimados`);
      }
    }
  }
});
