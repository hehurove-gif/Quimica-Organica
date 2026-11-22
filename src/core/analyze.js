// @ts-check
/**
 * Punto de entrada del núcleo: texto -> análisis completo.
 *
 * Pipeline determinista: normalizar -> parser (gramática) -> constructor (grafo + química)
 *   -> nombre canónico + diagnósticos -> representación -> explicación.
 * Si algo no se puede afirmar con certeza, se dice (estados incompleto / inválido /
 * fuera_de_alcance) y NO se devuelve estructura.
 */
import { parse, normalize } from './parser.js';
import { build } from './build.js';
import { nameMolecule, diagnose, aminaComoPrefijoOf } from './namer.js';
import { semidesarrollada } from './render.js';
import { explain } from './explain.js';
import { commonNamesOf } from './lexicon.js';

/**
 * @typedef {import('./parser.js').Ast} Ast
 * @typedef {import('./molecule.js').Molecule} Molecule
 * @typedef {{
 *   type: string, severity: 'info' | 'aviso', message: string,
 *   correct?: string, from?: number, to?: number
 * }} Note
 * @typedef {{
 *   status: 'valido' | 'incompleto' | 'invalido' | 'fuera_de_alcance' | 'vacio',
 *   errors: { code: string, message: string, from?: number, to?: number }[],
 *   notes: Note[],
 *   ast: Ast | null,
 *   molecule: Molecule | null,
 *   chain: number[],
 *   trace: import('./build.js').TraceItem[],
 *   names: { sistematico: string | null, iupac2013: string | null, radicofuncional: string | null } | null,
 *   correcto: boolean,
 *   formula: string | null,
 *   semidesarrollada: string | null,
 *   steps: import('./explain.js').Step[],
 * }} Analysis
 */

/** @param {string} s */
const squash = (s) => normalize(s).replace(/[\s]+/g, '');

/**
 * @param {string} text
 * @returns {Analysis}
 */
export function analyze(text) {
  /** @type {Analysis} */
  const base = {
    status: 'vacio', errors: [], notes: [], ast: null, molecule: null, chain: [], trace: [],
    names: null, correcto: false, formula: null, semidesarrollada: null, steps: [],
  };
  const p = parse(text);
  if (p.status !== 'valido' || !p.ast) {
    return { ...base, status: p.status, errors: p.errors };
  }

  /** @type {Note[]} */
  const notes = p.notes.map((n) => ({ type: n.type, severity: /** @type {'info'} */ ('info'), message: n.message, from: n.from, to: n.to }));
  const b = build(p.ast);
  for (const n of b.notes) notes.push({ type: n.type, severity: 'aviso', message: n.message });
  if (b.status !== 'valido' || !b.molecule) {
    // localizador omitido con varias moléculas posibles: decir cómo se llamaría cada una
    const errors = b.errors.map((e) => {
      if (!e.candidates) return e;
      const opciones = e.candidates
        .map((c) => {
          const r = nameMolecule(c.molecule);
          return r.ok && r.systematic ? `«${r.systematic}»${r.radicofuncional ? ` (${r.radicofuncional})` : ''}` : null;
        })
        .filter((x) => x !== null);
      const { candidates: _omit, ...rest } = e;
      return opciones.length > 1 ? { ...rest, message: `${rest.message} Según el carbono que elijas sería: ${opciones.join(' o ')}.` } : rest;
    });
    return { ...base, status: b.status, errors, ast: p.ast, notes };
  }
  const mol = b.molecule;
  const canon = nameMolecule(mol);

  let drawChain = b.chain;
  /** @type {Analysis['names']} */
  let names = null;
  let correcto = false;

  if (canon.ok) {
    drawChain = canon.chain; // se dibuja con la numeración correcta (C1 a la izquierda)
    names = { sistematico: canon.systematic, iupac2013: canon.iupac2013, radicofuncional: canon.radicofuncional };

    const common = p.ast.form === 'sustitutivo' ? p.ast.common : undefined;
    if (common) {
      notes.push({
        type: 'comun', severity: 'info',
        message: `«${common.name}» es un nombre común; el sistemático es «${canon.systematic}».`,
      });
    }
    for (const d of diagnose(p.ast, mol, b.chain)) {
      notes.push({ type: d.type, severity: 'aviso', message: d.message, correct: d.correct });
    }
    const typed = squash(text);
    correcto =
      typed === squash(canon.systematic) ||
      typed === squash(canon.iupac2013) ||
      (canon.radicofuncional !== null && typed === squash(canon.radicofuncional));

    const otros = commonNamesOf(canon.systematic ?? '').filter((n) => squash(n) !== typed);
    if (otros.length && !common) {
      notes.push({
        type: 'comun_equivalente', severity: 'info',
        message: `En el lenguaje cotidiano y en muchos libros también se llama ${otros.map((n) => `«${n}»`).join(' o ')}.`,
      });
    }
    const deClase = aminaComoPrefijoOf(mol);
    if (deClase && squash(deClase) !== typed && squash(deClase) !== squash(canon.systematic ?? '')) {
      notes.push({
        type: 'forma_de_clase', severity: 'info',
        message: `Muchos libros y presentaciones de clase nombran la amina como sustituyente de un alcano: «${deClase}». La nomenclatura actual usa «${canon.systematic}».`,
      });
    }
    if (p.ast.form === 'radicofuncional') {
      notes.push({
        type: 'equivalencia', severity: 'info',
        message: `En forma sustitutiva se escribe «${canon.systematic}».`,
      });
    } else if (canon.radicofuncional && !common) {
      notes.push({
        type: 'equivalencia', severity: 'info',
        message: `También se puede nombrar en forma radicofuncional: «${canon.radicofuncional}».`,
      });
    }
  } else {
    notes.push({ type: 'sin_nombre', severity: 'aviso', message: `La estructura es válida, pero no puedo generar su nombre: ${canon.reason}` });
  }

  return {
    status: 'valido',
    errors: [],
    notes,
    ast: p.ast,
    molecule: mol,
    chain: drawChain,
    trace: b.trace,
    names,
    correcto,
    formula: mol.formula(),
    semidesarrollada: semidesarrollada(mol, drawChain),
    steps: explain(p.ast, b, mol, canon.ok ? canon : null),
  };
}
