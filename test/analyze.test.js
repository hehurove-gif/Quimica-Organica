// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/core/analyze.js';

test('los tres ejemplos de las imágenes de referencia', () => {
  // imagen 1: dos nombres para lo mismo (uno con orden alfabético incorrecto)
  const a = analyze('bromuro de isobutilo');
  assert.equal(a.status, 'valido');
  assert.equal(a.names?.sistematico, '1-bromo-2-metilpropano');
  assert.equal(a.semidesarrollada, 'Br–CH₂–CH(CH₃)–CH₃');
  assert.equal(a.correcto, true);

  const b = analyze('2- metil -1-bromopropano');
  assert.equal(b.status, 'valido');
  assert.equal(b.correcto, false);
  assert.equal(b.formula, a.formula);
  assert.ok(b.notes.some((n) => n.type === 'orden_alfabetico' && n.correct === '1-bromo-2-metilpropano'));

  // imagen 2
  const c = analyze('bromuro de etilo');
  assert.equal(c.names?.sistematico, 'bromoetano');
  assert.equal(c.formula, 'C₂H₅Br');
  assert.equal(analyze('bromoetano').names?.radicofuncional, 'bromuro de etilo');

  // imagen 3
  const d = analyze('5-fluor-2-metil-1-yodo-hexano');
  assert.equal(d.status, 'valido');
  assert.equal(d.formula, 'C₇H₁₄FI');
  assert.equal(d.names?.sistematico, '5-fluoro-2-metil-1-yodohexano');
  assert.ok(d.notes.some((n) => n.type === 'forma' && /fluoro/.test(n.message)));
  assert.equal(d.correcto, false); // «fluor» y el guion antes de la cadena
  assert.equal(analyze('5-fluoro-2-metil-1-yodohexano').correcto, true);
});

test('estados: nunca devuelve estructura si no es válido', () => {
  /** @type {[string, string][]} */
  const casos = [
    ['', 'vacio'],
    ['2-metil', 'incompleto'],
    ['bromopropano', 'incompleto'], // falta localizador: 1 o 2 son moléculas distintas
    ['xyz', 'invalido'],
    ['7-bromohexano', 'invalido'],
    ['1,1,1,1-tetrabromoetano', 'invalido'],
    ['propanol', 'incompleto'], // 1 o 2: moléculas distintas
    ['etilamina', 'fuera_de_alcance'],
    ['2-penteno-1-eno', 'invalido'],
  ];
  for (const [t, st] of casos) {
    const r = analyze(t);
    assert.equal(r.status, st, t);
    if (st !== 'valido') {
      assert.equal(r.molecule, null, t);
      assert.equal(r.semidesarrollada, null, t);
      assert.equal(r.steps.length, 0, t);
    }
  }
  assert.match(analyze('bromopropano').errors[0].message, /1/);
  assert.match(analyze('bromopropano').errors[0].message, /2/);
});

test('nombre común y equivalencias', () => {
  const r = analyze('isobutano');
  assert.equal(r.names?.sistematico, '2-metilpropano');
  assert.ok(r.notes.some((n) => n.type === 'comun'));
  assert.equal(r.correcto, false);
  assert.ok(analyze('2-bromopropano').notes.some((n) => n.type === 'equivalencia' && /isopropilo/.test(n.message)));
});

test('la explicación corresponde a las reglas aplicadas', () => {
  const r = analyze('5-fluoro-2-metil-1-yodohexano');
  const txt = r.steps.map((s) => s.text).join('\n');
  assert.match(txt, /hexano.*6 carbonos/);
  assert.match(txt, /carbono 5/); // flúor
  assert.match(txt, /carbono 2/); // metilo
  assert.match(txt, /carbono 1/); // yodo
  assert.match(txt, /C₇H₁₄FI/);
  // cada paso de sustituyente conoce sus átomos para el resaltado
  const subs = r.steps.filter((s) => s.title.startsWith('Sustituyente'));
  assert.equal(subs.length, 3);
  for (const s of subs) assert.ok(s.atomIds.length > 0);
});

test('localizador omitido sin ambigüedad produce aviso', () => {
  const r = analyze('bromoetano');
  assert.equal(r.status, 'valido');
  assert.ok(r.notes.some((n) => n.type === 'localizador_omitido'));
});

test('radicofuncional con radical ramificado', () => {
  const r = analyze('cloruro de 2-metilbutilo');
  assert.equal(r.status, 'valido');
  assert.equal(r.names?.sistematico, '1-cloro-2-metilbutano');
  assert.ok(r.steps.some((s) => s.title === 'Nombre sustitutivo equivalente'));
});
