// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { balance, conserves } from '../src/core/balance.js';
import { inorganic, countsOf, speciesFromName } from '../src/core/species.js';
import { Molecule } from '../src/core/molecule.js';
import { fromSmiles } from '../src/core/smiles.js';

test('balance: combustión del butano = 2, 13, 8, 10', () => {
  const butano = countsOf(fromSmiles('CCCC'));
  const r = balance([butano, inorganic('O2').counts], [inorganic('CO2').counts, inorganic('H2O').counts]);
  assert.deepEqual(r, { reactants: [2, 13], products: [8, 10] });
});

test('balance: símbolos [O] y [H] dan coeficientes enteros mínimos', () => {
  const etanol = countsOf(fromSmiles('CCO'));
  const acido = countsOf(fromSmiles('CC(=O)O'));
  const r = balance([etanol, inorganic('[O]').counts], [acido, inorganic('H2O').counts]);
  assert.deepEqual(r, { reactants: [1, 2], products: [1, 1] });
  const prop = countsOf(fromSmiles('CC(=O)C'));
  const r2 = balance([prop, inorganic('[H]').counts], [countsOf(fromSmiles('CC(O)C'))]);
  assert.deepEqual(r2, { reactants: [1, 2], products: [1] });
});

test('balance: ecuación imposible devuelve null y conserves lo detecta', () => {
  assert.equal(balance([{ C: 1 }], [{ N: 1 }]), null);
  assert.equal(conserves([{ C: 1, H: 4 }], [{ C: 1, H: 2 }], { reactants: [1], products: [1] }), false);
});

test('Molecule: clone, setBond, without, split y merge', () => {
  const m = fromSmiles('CC(=O)OC');
  const c = m.clone();
  c.setBond(1, 2, 1);
  assert.equal(m.formula(), 'C₃H₆O₂');
  assert.equal(c.formula(), 'C₃H₈O₂');
  const cut = m.clone();
  cut.setBond(1, 3, 0);
  assert.equal(cut.split().length, 2);
  const { mol, map } = m.without([2]);
  assert.equal(mol.atoms.length, 4);
  assert.equal(map.has(2), false);
  const big = new Molecule();
  big.merge(m);
  big.merge(fromSmiles('CO'));
  assert.equal(big.components().length, 2);
  assert.deepEqual(big.validate().map((i) => i.code), ['desconectado']);
});

test('species: nombres inorgánicos, orgánicos, sales y polímeros', () => {
  const agua = speciesFromName('Agua');
  assert.ok(agua.ok && agua.species.formula === 'H₂O');
  const sal = speciesFromName('propanoato de potasio');
  assert.ok(sal.ok && sal.species.kind === 'salt' && sal.species.cation === 'K');
  assert.deepEqual(sal.ok && sal.species.counts, { C: 3, H: 5, O: 2, K: 1 });
  const pol = speciesFromName('polietileno');
  assert.ok(pol.ok && pol.species.kind === 'polymer');
  assert.equal(speciesFromName('ciclopentano').ok, false);
});
