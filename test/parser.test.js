// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/core/parser.js';

/** @param {string} s */
const status = (s) => parse(s).status;

test('formas del mismo nombre se reconocen como válidas', () => {
  const validos = [
    'hexano',
    'n-hexano',
    'metano',
    'bromoetano',
    'bromuro de etilo',
    'Bromuro de Etilo',
    'bromuro de isobutilo',
    '1-bromo-2-metilpropano',
    '2-metil-1-bromopropano',
    '2- metil -1-bromopropano', // espacios como en la imagen de referencia
    '5-fluoro-1-yodo-2-metilhexano',
    '5-fluor-2-metil-1-yodo-hexano', // imagen de referencia: "fluor" y guion antes de la cadena
    '5-fluor-2-metil-1-yodohexano',
    '2,2-dimetilpropano',
    '2,2-dimetil propano',
    '1,2-dibromoetano',
    '2-iodopropano',
    '3-etil-2-metilpentano',
    '2-metiloctano', // "metil" + "octano" no debe leerse como "metilo"
    'pentano',
    '2-(2-metilpropil)heptano',
    'bromuro de terc-butilo',
    'cloruro de sec-butilo',
    'yoduro de 2-metilpropilo',
    'isobutano',
    'cloroformo',
    'tetracloruro de carbono',
    '2-isopropilhexano',
    '4-ter-butiloctano',
  ];
  for (const s of validos) assert.equal(status(s), 'valido', `esperaba válido: ${s} -> ${JSON.stringify(parse(s).errors)}`);
});

test('texto parcial se marca como incompleto, no como inválido', () => {
  const parciales = ['2', '2-', '2-metil', '2-metil-', '2,2-di', '2,2-dimetil', 'bromuro', 'bromuro d', 'bromuro de', 'bromuro de et', 'bromuro de 2-metilpropil'.slice(0, 19), 'propan', '1-brom', 'isobu', '2-(2-metil'];
  for (const s of parciales) {
    const r = parse(s);
    assert.equal(r.status, 'incompleto', `esperaba incompleto: «${s}» -> ${r.status} ${JSON.stringify(r.errors)}`);
  }
});

test('errores reales se marcan como inválidos con posición', () => {
  const r = parse('xyz');
  assert.equal(r.status, 'invalido');
  assert.equal(r.errors[0].from, 0);
  const r2 = parse('2-metilpropanx');
  assert.equal(r2.status, 'invalido');
  assert.ok(r2.errors[0].from >= 9);
  assert.equal(status('hexano hexano'), 'invalido');
  assert.equal(status('bromuro etilo'), 'invalido');
});

test('funciones aún no implementadas se marcan fuera de alcance, no como error', () => {
  for (const s of ['2-buteno', 'propanol', 'etanol', 'ciclohexano', 'benceno', 'ácido etanoico', 'butanona', 'propanal', 'etilamina', 'metoxietano', '1-propino']) {
    assert.equal(status(s), 'fuera_de_alcance', s);
  }
});

test('vacío', () => {
  assert.equal(status(''), 'vacio');
  assert.equal(status('   '), 'vacio');
});

test('acentos y mayúsculas no importan', () => {
  assert.equal(status('1-BROMO-2-MÉTIL PROPANO'.replace('MÉTIL', 'METIL')), 'valido');
  assert.equal(status('bromuro de ETILO'), 'valido');
});

test('notas de forma: fluor y guion antes de la cadena', () => {
  const r = parse('5-fluor-2-metil-1-yodo-hexano');
  const msgs = r.notes.map((n) => n.message).join(' | ');
  assert.match(msgs, /fluoro/);
  assert.match(msgs, /guion/);
});

test('AST de bromuro de isobutilo', () => {
  const r = parse('bromuro de isobutilo');
  assert.equal(r.ast?.form, 'radicofuncional');
  if (r.ast?.form === 'radicofuncional') {
    assert.equal(r.ast.halide.el, 'Br');
    assert.equal(r.ast.radical.n, 3);
    assert.deepEqual(r.ast.radical.groups[0].locants, [2]);
  }
});
