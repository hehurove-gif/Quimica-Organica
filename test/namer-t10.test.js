// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/core/parser.js';
import { build } from '../src/core/build.js';
import { nameMolecule, diagnose } from '../src/core/namer.js';
import { fromSmiles } from '../src/core/smiles.js';
import { analyze } from '../src/core/analyze.js';

/**
 * T10 (etapa 4): estructura -> nombre de éteres, ésteres, aminas y amidas.
 * Los nombres esperados están escritos a mano con las reglas de las presentaciones de clase
 * (prioridad ácido > éster > amida > aldehído > cetona > alcohol > amina; éter = alcoxi; N-sustituyentes).
 * @type {[string, string, string, string | null][]}  [SMILES, escolar, IUPAC 2013, radicofuncional]
 */
const CASOS = [
  // éteres: la cadena más larga es la base y el otro lado es alcoxi
  ['COCC', 'metoxietano', 'metoxietano', 'etil metil éter'],
  ['CCOCC', 'etoxietano', 'etoxietano', 'dietil éter'],
  ['COC', 'metoximetano', 'metoximetano', 'dimetil éter'],
  ['CCCOCCC', '1-propoxipropano', '1-propoxipropano', 'dipropil éter'],
  ['CCOC(C)C', '2-etoxipropano', '2-etoxipropano', 'etil isopropil éter'],
  ['COCC(C)C', '2-metil-1-metoxipropano', '2-metil-1-metoxipropano', 'isobutil metil éter'], // metil < metoxi
  ['CC(C)(C)OC', '2-metil-2-metoxipropano', '2-metil-2-metoxipropano', 'terc-butil metil éter'],
  // ésteres: alcanoato de …ilo
  ['CC(=O)OC', 'etanoato de metilo', 'etanoato de metilo', null],
  ['CCC(=O)OCC', 'propanoato de etilo', 'propanoato de etilo', null],
  ['CC(=O)OC(C)C', 'etanoato de isopropilo', 'etanoato de isopropilo', null],
  ['CC(=O)OCC(C)C', 'etanoato de isobutilo', 'etanoato de isobutilo', null],
  ['CCCC(=O)OCCCC', 'butanoato de butilo', 'butanoato de butilo', null],
  ['C(=O)OC', 'metanoato de metilo', 'metanoato de metilo', null],
  ['C=CC(=O)OC', 'propenoato de metilo', 'propenoato de metilo', null],
  ['OCC(=O)OC', '2-hidroxietanoato de metilo', '2-hidroxietanoato de metilo', null], // éster > alcohol
  // aminas: la cadena más larga contiene al N; los demás radicales llevan «N»
  ['CCCN', '1-propanamina', 'propan-1-amina', 'propilamina'],
  ['CC(C)N', '2-propanamina', 'propan-2-amina', 'isopropilamina'],
  ['CNC', 'N-metilmetanamina', 'N-metilmetanamina', 'dimetilamina'],
  ['CN(C)C', 'N,N-dimetilmetanamina', 'N,N-dimetilmetanamina', 'trimetilamina'],
  ['CCNC', 'N-metiletanamina', 'N-metiletanamina', 'etilmetilamina'],
  ['CCN(CC)CC', 'N,N-dietiletanamina', 'N,N-dietiletanamina', 'trietilamina'],
  ['CCCCNCCCC', 'N-butil-1-butanamina', 'N-butilbutan-1-amina', 'dibutilamina'],
  ['CC(C)CC(N)C', '4-metil-2-pentanamina', '4-metilpentan-2-amina', null],
  ['NCCN', '1,2-etanodiamina', 'etano-1,2-diamina', null],
  // amidas: carbono funcional = C1; N-sustituyentes
  ['CC(N)=O', 'etanamida', 'etanamida', null],
  ['CC(=O)NC', 'N-metiletanamida', 'N-metiletanamida', null],
  ['CC(=O)N(C)C', 'N,N-dimetiletanamida', 'N,N-dimetiletanamida', null],
  ['CC(C)C(=O)NC', 'N,2-dimetilpropanamida', 'N,2-dimetilpropanamida', null],
  ['NC(=O)CC(N)=O', 'propanodiamida', 'propanodiamida', null],
  // varias funciones: gana la de mayor prioridad
  ['CC(N)C(=O)O', 'ácido 2-aminopropanoico', 'ácido 2-aminopropanoico', null],
  ['NCCC(N)=O', '3-aminopropanamida', '3-aminopropanamida', null],
  ['NCC(=O)OC', '2-aminoetanoato de metilo', '2-aminoetanoato de metilo', null],
  ['COCCC=O', '3-metoxipropanal', '3-metoxipropanal', null],
];

for (const [smiles, escolar, iupac, radico] of CASOS) {
  test(`T10 namer: ${smiles} -> ${escolar}`, () => {
    const mol = fromSmiles(smiles);
    const r = nameMolecule(mol);
    assert.ok(r.ok, r.ok ? '' : r.reason);
    assert.equal(r.systematic, escolar);
    assert.equal(r.iupac2013, iupac);
    assert.equal(r.radicofuncional, radico);
    // ida y vuelta: cada nombre generado se lee de vuelta como la MISMA molécula
    for (const nombre of [r.systematic, r.iupac2013, ...(r.radicofuncional ? [r.radicofuncional] : [])]) {
      const p = parse(nombre);
      assert.ok(p.ast, `«${nombre}» no se puede leer (${p.status})`);
      const b = build(p.ast);
      assert.equal(b.status, 'valido', `«${nombre}»: ${b.errors.map((e) => e.message).join(' | ')}`);
      assert.equal(b.molecule?.canonicalKey(), mol.canonicalKey(), `«${nombre}» es otra molécula`);
    }
  });
}

test('T10 namer: el nombre no depende de cómo se dibuje (misma molécula, SMILES distintos)', () => {
  /** @type {string[][]} */
  const grupos = [
    ['CC(=O)OCC', 'CCOC(C)=O', 'O=C(C)OCC'],
    ['CCNC', 'CNCC', 'C(C)NC'],
    ['CC(=O)N(C)C', 'CN(C)C(C)=O', 'CN(C(=O)C)C'],
    ['COCC(C)C', 'CC(C)COC', 'C(OC)C(C)C'],
  ];
  for (const g of grupos) {
    const nombres = g.map((s) => {
      const r = nameMolecule(fromSmiles(s));
      assert.ok(r.ok);
      return r.systematic;
    });
    assert.equal(new Set(nombres).size, 1, `${g.join(' / ')} -> ${nombres.join(' / ')}`);
  }
});

test('T10 namer: isómeros de función con la misma fórmula (C₃H₆O₂, C₄H₁₁N, C₃H₈O) tienen nombres distintos', () => {
  // tema «Isomería» de las presentaciones: isómeros de función y de posición
  const fam = [
    ['CCC(=O)O', 'CC(=O)OC', 'CCOC=O'], // C₃H₆O₂: ácido propanoico, acetato de metilo, formiato de etilo
    ['CCCCN', 'CCNCC', 'CCCNC', 'CN(C)CC'], // C₄H₁₁N: amina 1ª, 2ª, 2ª, 3ª
    ['CCCO', 'CC(C)O', 'COCC'], // C₃H₈O: alcoholes y éter
  ];
  for (const g of fam) {
    const formulas = new Set(g.map((s) => fromSmiles(s).formula()));
    assert.equal(formulas.size, 1, `no son isómeros: ${g.join(', ')}`);
    const nombres = g.map((s) => {
      const r = nameMolecule(fromSmiles(s));
      assert.ok(r.ok);
      return r.systematic;
    });
    assert.equal(new Set(nombres).size, g.length, nombres.join(' / '));
  }
});

test('T10 namer: lo que todavía no se puede nombrar lo dice, sin inventar', () => {
  /** @type {[string, RegExp][]} */
  const casos = [
    ['CC(=O)NCC(O)C', /grupo funcional/], // N-(hidroxipropil): radical con función
    ['CC(=O)OCC(=O)C', /grupo funcional|aciloxi|cetona|radical/i],
    ['CCCNC(=O)C', /./], // sí se puede: control (debe nombrarse)
  ];
  for (const [smi, re] of casos) {
    const r = nameMolecule(fromSmiles(smi));
    if (smi === 'CCCNC(=O)C') {
      assert.ok(r.ok);
      assert.equal(r.systematic, 'N-propiletanamida');
    } else {
      assert.equal(r.ok, false, smi);
      assert.match(r.ok ? '' : r.reason, re);
    }
  }
});

test('T10 diagnose: la cadena del alumno no es la más larga (amina)', () => {
  const p = parse('N-etilmetanamina');
  assert.ok(p.ast);
  const b = build(p.ast);
  assert.ok(b.molecule);
  const d = diagnose(p.ast, b.molecule, b.chain);
  assert.equal(d.length, 1);
  assert.equal(d[0].type, 'cadena');
  assert.equal(d[0].correct, 'N-metiletanamina');
});

test('T10 diagnose: orden alfabético con alcoxi (metil antes que metoxi)', () => {
  const a = analyze('1-metoxi-2-metilpropano');
  assert.equal(a.status, 'valido');
  const aviso = a.notes.find((x) => x.type === 'orden_alfabetico');
  assert.ok(aviso, 'debe avisar del orden');
  assert.equal(aviso.correct, '2-metil-1-metoxipropano');
  assert.equal(a.correcto, false);
  // el nombre bien escrito no genera avisos
  const bien = analyze('2-metil-1-metoxipropano');
  assert.equal(bien.correcto, true);
  assert.equal(bien.notes.filter((x) => x.severity === 'aviso').length, 0);
});

test('T10 diagnose: el éster elige la cadena del ácido, no la del alcohol', () => {
  // «propanoato de butilo»: la cola (butilo) tiene más carbonos, pero la base es la cadena del ácido
  const a = analyze('propanoato de butilo');
  assert.equal(a.status, 'valido');
  assert.equal(a.names?.sistematico, 'propanoato de butilo');
  assert.equal(a.correcto, true);
  assert.equal(a.notes.filter((x) => x.severity === 'aviso').length, 0);
});

test('T10 analyze: «ida y vuelta» completa con los nombres de las presentaciones', () => {
  const nombres = [
    'etanoato de isopropilo', 'propanoato de isobutilo', '2-metilpropanoato de isopropilo',
    '2,2-dimetilpropanoato de metilo', '4-metil-3-isopropilpentanoato de etilo',
    'butanamida', '2-metilbutanamida', 'dibutilamina', 'tributilamina', 'etilmetilamina',
    '3-butil-4-etil-2-isopropoxiundecano', '2,5-dimetil-3-secbutoxihexano',
  ];
  for (const n of nombres) {
    const a = analyze(n);
    assert.equal(a.status, 'valido', n);
    assert.ok(a.names, `${n}: sin nombre generado`);
    const otra = analyze(a.names.sistematico);
    assert.equal(otra.status, 'valido', `${n} -> ${a.names.sistematico}`);
    assert.equal(otra.molecule?.canonicalKey(), a.molecule?.canonicalKey(), `${n} -> ${a.names.sistematico}`);
    assert.equal(otra.names?.sistematico, a.names.sistematico, `${n}: el nombre canónico no es estable`);
  }
});
