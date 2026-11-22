// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/core/analyze.js';
import { fromSmiles } from '../src/core/smiles.js';
import { commonNamesOf } from '../src/core/lexicon.js';

/** Los 6 puntos de `docs/revision-de-nombres.md`. */

/* 1. Localizadores: IUPAC 2013 P-14.3.4 (estilo IUPAC) vs. estilo escolar */
test('punto 1: IUPAC 2013 conserva localizadores donde P-14.3.4 lo exige', () => {
  /** @type {[string, string, string][]} */
  const casos = [ // [nombre, escolar, iupac2013]
    ['propeno', 'propeno', 'propeno'], // P-14.3.4.2(d): se omite
    ['eteno', 'eteno', 'eteno'],
    ['etanol', 'etanol', 'etanol'],
    ['metanol', 'metanol', 'metanol'],
    ['propanona', 'propanona', 'propan-2-ona'], // excepción de P-14.3.4.4
    ['butanona', 'butanona', 'butan-2-ona'], // excepción de P-14.3.4.4
    ['propadieno', 'propadieno', 'propa-1,2-dieno'], // excepción de P-14.3.4.4
    ['ácido propenoico', 'ácido 2-propenoico', 'ácido prop-2-enoico'], // excepción de P-14.3.4.4
    ['propino', 'propino', 'prop-1-ino'], // no aparece en P-14.3.4: se conserva el localizador
    ['2-propanol', '2-propanol', 'propan-2-ol'],
  ];
  for (const [n, esc, iu] of casos) {
    const a = analyze(n);
    assert.equal(a.status, 'valido', n);
    assert.equal(a.names?.sistematico, esc, `${n} (escolar)`);
    assert.equal(a.names?.iupac2013, iu, `${n} (IUPAC)`);
  }
});

/* 2. Dos estilos: el principal es el escolar y el IUPAC se ofrece siempre que difiera */
test('punto 2: se muestran los dos estilos cuando difieren', () => {
  const a = analyze('2-buteno');
  assert.equal(a.names?.sistematico, '2-buteno');
  assert.equal(a.names?.iupac2013, 'but-2-eno');
  // y los dos se aceptan como entrada
  assert.equal(analyze('but-2-eno').molecule?.canonicalKey(), a.molecule?.canonicalKey());
  assert.equal(analyze('but-2-eno').correcto, true);
  assert.equal(analyze('2-buteno').correcto, true);
});

/* 3. Nombres comunes como equivalencia */
test('punto 3: nombres comunes como equivalencia, también para ésteres con cualquier radical', () => {
  assert.deepEqual(commonNamesOf('propanona'), ['acetona']);
  assert.deepEqual(commonNamesOf('ácido etanoico'), ['ácido acético']);
  assert.deepEqual(commonNamesOf('etanoato de isopropilo'), ['acetato de isopropilo']);
  assert.deepEqual(commonNamesOf('butanoato de metilo'), ['butirato de metilo']);
  assert.deepEqual(commonNamesOf('2-metilpentano'), []);
  const nota = (/** @type {string} */ n) => analyze(n).notes.find((x) => x.type === 'comun_equivalente')?.message ?? '';
  assert.match(nota('propanona'), /«acetona»/);
  assert.match(nota('etanoato de isopropilo'), /«acetato de isopropilo»/);
  assert.equal(nota('2-metilpentano'), '');
  assert.equal(nota('acetona'), ''); // ya escribió el nombre común: no se repite
});

/* 4. Aminas: forma de clase como equivalencia */
test('punto 4: la amina también se muestra como sustituyente de un alcano (forma de clase)', () => {
  /** @type {[string, string][]} */
  const casos = [
    ['N-metil-2-propanamina', '2-(metilamino)propano'],
    ['N,N-dimetil-2-propanamina', '2-(dimetilamino)propano'],
    ['N-etil-N-metil-1-butanamina', '1-(etilmetilamino)butano'],
    ['dibutilamina', '1-(butilamino)butano'],
    ['1-butanamina', '1-aminobutano'],
  ];
  for (const [n, clase] of casos) {
    const nota = analyze(n).notes.find((x) => x.type === 'forma_de_clase');
    assert.ok(nota, n);
    assert.ok(nota.message.includes(`«${clase}»`), `${n}: ${nota.message}`);
    // la forma de clase se lee de vuelta como la misma molécula
    assert.equal(analyze(clase).molecule?.canonicalKey(), analyze(n).molecule?.canonicalKey(), clase);
  }
  // si el alumno ya la escribió, no se repite; las funciones de mayor prioridad no la generan
  assert.equal(analyze('2-(metilamino)propano').notes.some((x) => x.type === 'forma_de_clase'), false);
  assert.equal(analyze('ácido 2-aminopropanoico').notes.some((x) => x.type === 'forma_de_clase'), false);
  assert.equal(analyze('N-metiletanamida').notes.some((x) => x.type === 'forma_de_clase'), false);
});

/* 5. Éteres sin localizador: se pide, y se dice qué molécula sería cada opción */
test('punto 5: éter sin localizador no se adivina, pero se explican las opciones', () => {
  const a = analyze('butoxibutano');
  assert.equal(a.status, 'incompleto');
  assert.equal(a.molecule, null);
  const msg = a.errors[0].message;
  assert.match(msg, /«1-butoxibutano»/);
  assert.match(msg, /«1-sec-butoxibutano»/);
  const b = analyze('etoxipropano');
  assert.match(b.errors[0].message, /«1-etoxipropano».*«2-etoxipropano»/);
  // con localizador es válido y es la molécula esperada
  assert.equal(analyze('1-butoxibutano').molecule?.canonicalKey(), fromSmiles('CCCCOCCCC').canonicalKey());
  assert.equal(analyze('2-etoxipropano').molecule?.canonicalKey(), fromSmiles('CCOC(C)C').canonicalKey());
});

/* 6. Orden alfabético: se acepta, se avisa y se corrige */
test('punto 6: ejemplos de clase fuera de orden alfabético se aceptan con aviso', () => {
  /** @type {[string, string][]} */
  const casos = [
    ['2,4-dimetil-2-aminohexano', '2,4-dimetil-2-hexanamina'], // nombre actual; la forma de clase ordenada es «2-amino-2,4-dimetilhexano»
    ['4-etil-2,2-dimetil-3-bromohexano', '3-bromo-4-etil-2,2-dimetilhexano'],
  ];
  for (const [n, correcto] of casos) {
    const a = analyze(n);
    assert.equal(a.status, 'valido', n);
    assert.equal(a.correcto, false, n);
    const aviso = a.notes.find((x) => x.type === 'orden_alfabetico');
    assert.ok(aviso, n);
    assert.equal(aviso.severity, 'aviso');
    assert.equal(a.names?.sistematico, correcto);
    assert.equal(analyze(correcto).correcto, true);
  }
});
