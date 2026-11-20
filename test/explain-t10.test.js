// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/core/analyze.js';

/**
 * T10 (etapa 3): la explicación paso a paso de éteres, ésteres, aminas y amidas.
 * Los nombres salen de las presentaciones de clase (Nomenclatura orgánica, unidad 4).
 */
const EJEMPLOS = [
  // ésteres (presentación: «Ésteres»)
  'etanoato de isopropilo', 'propanoato de etilo', 'metanoato de metilo', 'formiato de etilo',
  '2-metilpropanoato de isopropilo', '2-metilpropanoato de metilo', 'propanoato de isobutilo',
  '2,2-dimetilpropanoato de metilo', '4-metil-3-isopropilpentanoato de etilo',
  // amidas
  'butanamida', 'metanamida', '2-metilbutanamida', '2-metilpropanamida', 'N-metiletanamida', 'N,N-dimetiletanamida',
  // aminas (nomenclatura común: «…ilamina»)
  'butilamina', 'dibutilamina', 'tributilamina', 'etilmetilamina', 'dimetilamina',
  // aminas y éteres como sustituyentes
  '2-aminopentano', '2,4-dimetil-2-aminohexano', 'N-metiletanamina',
  '2,5-dimetil-3-secbutoxihexano', '3-butil-4-etil-2-isopropoxiundecano', 'metoxietano', 'dietil éter',
];

for (const nombre of EJEMPLOS) {
  test(`T10 explain: ${nombre}`, () => {
    const a = analyze(nombre);
    assert.equal(a.status, 'valido', `${nombre}: ${a.errors.map((e) => e.message).join(' | ')}`);
    assert.ok(a.steps.length >= 3, 'explicación demasiado corta');
    const ids = new Set(a.molecule?.atoms.map((x) => x.id));
    for (const s of a.steps) {
      assert.ok(s.title.length > 0 && s.text.length > 20, `${nombre}: paso vacío «${s.title}»`);
      assert.ok(!/undefined|NaN|\[object|\bnull\b/.test(`${s.title} ${s.text}`), `${nombre}: texto roto en «${s.title}»: ${s.text}`);
      assert.ok(s.atomIds.every((id) => ids.has(id)), `${nombre}: «${s.title}» apunta a un átomo inexistente`);
    }
    // la última etapa siempre es el cierre de valencias con la fórmula real
    const last = a.steps[a.steps.length - 1];
    assert.equal(last.title, 'Valencias');
    assert.ok(last.text.includes(/** @type {string} */ (a.formula)));
  });
}

/** @param {string} nombre @param {string} titulo */
const paso = (nombre, titulo) => {
  const s = analyze(nombre).steps.find((x) => x.title.includes(titulo));
  assert.ok(s, `${nombre}: falta el paso «${titulo}»`);
  return s;
};

test('T10 explain: éster — la cola «de …ilo» cuenta todos los carbonos del radical', () => {
  assert.match(paso('etanoato de isopropilo', 'Cola del éster').text, /3 carbonos/); // isopropil = 3 C (cadena base de 2)
  assert.match(paso('propanoato de isobutilo', 'Cola del éster').text, /4 carbonos/);
  assert.match(paso('etanoato de metilo', 'Cola del éster').text, /1 carbono /);
  assert.match(paso('etanoato de metilo', 'Grupo principal').text, /éster/);
});

test('T10 explain: clase de amina según los radicales en el nitrógeno', () => {
  assert.match(paso('butilamina', 'amina').text, /primaria/);
  assert.match(paso('dibutilamina', 'amina').text, /secundaria/);
  assert.match(paso('tributilamina', 'amina').text, /terciaria/);
  assert.match(paso('etilmetilamina', 'Radical «etil»').text, /2 carbonos/);
  assert.match(paso('N-metiletanamina', 'Grupo principal').text, /secundaria/);
});

test('T10 explain: amidas y localizador N', () => {
  assert.match(paso('butanamida', 'Grupo principal').text, /primaria/);
  assert.match(paso('N,N-dimetiletanamida', 'Grupo principal').text, /2 sustituyentes/);
  assert.match(paso('N,N-dimetiletanamida', 'Sustituyente «metil»').text, /nitrógeno/);
  assert.match(paso('N-metiletanamida', 'Sustituyente «metil»').text, /nitrógeno \(N\)/);
});

test('T10 explain: alcoxi con radical ramificado (secbutoxi = 4 C, no 3)', () => {
  const t = paso('2,5-dimetil-3-secbutoxihexano', 'secbutoxi').text;
  assert.match(t, /4 carbonos/);
  assert.match(t, /1-metilpropoxi/);
  assert.match(t, /al carbono 3/);
});

test('T10 explain: la corrección de conteo también vale para radicales ordinarios', () => {
  // isobutil = 4 carbonos (cadena base de 3 + metilo); antes se decía «3 carbonos»
  assert.match(paso('2-isobutilpentano', 'isobutil').text, /4 carbonos/);
});

test('T10 explain: concordancia y valencias solo mencionan lo que hay', () => {
  assert.match(paso('butanamida', 'Grupo principal').text, /Es una amida/);
  assert.match(paso('etanoato de metilo', 'Valencias').text, /el oxígeno 2/);
  assert.doesNotMatch(paso('etanoato de metilo', 'Valencias').text, /nitrógeno/);
  assert.match(paso('butilamina', 'Valencias').text, /el nitrógeno 3/);
  assert.doesNotMatch(paso('butano', 'Valencias').text, /nitrógeno|oxígeno/);
});

test('T10 explain: forma radicofuncional de éter y de amina', () => {
  assert.match(paso('dietil éter', 'Forma radicofuncional').text, /R–O–R/);
  assert.match(paso('dietil éter', 'Radical «etil»').text, /dos radicales iguales/);
  assert.match(paso('etilmetilamina', 'Forma radicofuncional').text, /orden alfabético|secundaria/);
});
