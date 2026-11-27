// @ts-check
/** Pestaña «Reacciones»: elegir reacción, escribir reactivos, ver ecuación balanceada, estructuras y pasos. */
import { react, REACTIONS } from '../core/reactions.js';
import { speciesFromName } from '../core/species.js';
import { analyze } from '../core/analyze.js';
import { renderSvg } from '../core/render.js';

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const tipo = /** @type {HTMLSelectElement} */ ($('r-tipo'));
const practica = /** @type {HTMLInputElement} */ ($('r-practica'));

/** Campos por reacción: reactivos orgánicos y opciones. Ejemplos: [nombres, opciones]. */
const UI = /** @type {Record<string, { reactivos: string[], opciones?: [string, string, string[]][], ejemplos: [string[], Record<string, string>][] }>} */ ({
  esterificacion: { reactivos: ['Ácido carboxílico', 'Alcohol'], ejemplos: [[['ácido etanoico', 'etanol'], {}], [['ácido butanoico', '1-butanol'], {}]] },
  oxidacion: { reactivos: ['Alcohol'], opciones: [['oxidante', 'Oxidante', ['KMnO4', 'K2Cr2O7', 'PCC']]], ejemplos: [[['2-butanol'], {}], [['etanol'], { oxidante: 'KMnO4' }], [['1-propanol'], { oxidante: 'PCC' }], [['2-metil-2-propanol'], {}]] },
  reduccion: { reactivos: ['Aldehído o cetona'], opciones: [['reductor', 'Reductor', ['NaBH4', 'LiAlH4']]], ejemplos: [[['propanona'], {}], [['butanal'], {}]] },
  markovnikov: { reactivos: ['Alqueno'], opciones: [['reactivo', 'Reactivo', ['HBr', 'HCl', 'HI', 'H2O']]], ejemplos: [[['propeno'], { reactivo: 'H2O' }], [['1-buteno'], { reactivo: 'HCl' }], [['2-penteno'], { reactivo: 'HBr' }]] },
  deshidratacion: { reactivos: ['Alcohol'], ejemplos: [[['2-butanol'], {}], [['2-pentanol'], {}], [['metanol'], {}]] },
  descarboxilacion: { reactivos: ['Sal de ácido carboxílico'], ejemplos: [[['etanoato de sodio'], {}], [['2-metilpropanoato de sodio'], {}]] },
  saponificacion: { reactivos: ['Éster'], opciones: [['base', 'Base', ['NaOH', 'KOH', 'LiOH']]], ejemplos: [[['etanoato de metilo'], {}], [['propanoato de etilo'], { base: 'KOH' }]] },
  hidrolisis: { reactivos: ['Éster'], ejemplos: [[['etanoato de isopropilo'], {}], [['butanoato de butilo'], {}]] },
  halogenacion: { reactivos: ['Alcano'], opciones: [['halogeno', 'Halógeno', ['Cl2', 'Br2']]], ejemplos: [[['propano'], { halogeno: 'Br2' }], [['butano'], { halogeno: 'Cl2' }], [['2-metilpropano'], { halogeno: 'Br2' }]] },
  combustion: { reactivos: ['Compuesto (C, H, O)'], ejemplos: [[['butano'], {}], [['etanol'], {}]] },
  polimerizacion: { reactivos: ['Monómero'], ejemplos: [[['eteno'], {}], [['cloroeteno'], {}], [['estireno'], {}]] },
  hidrogenacion: { reactivos: ['Alqueno o alquino'], opciones: [['catalizador', 'Catalizador', ['Pt', 'Pd', 'Ni']]], ejemplos: [[['propino'], {}], [['2-buteno'], { catalizador: 'Ni' }]] },
});

/** @param {string} tag @param {string} [cls] @param {string} [text] */
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

for (const id of Object.keys(UI)) {
  const o = el('option', undefined, REACTIONS[id].nombre);
  /** @type {HTMLOptionElement} */ (o).value = id;
  tipo.append(o);
}

/** @returns {{ nombres: string[], opts: Record<string, string> }} */
function leerCampos() {
  const nombres = [...document.querySelectorAll('#r-campos input')].map((i) => /** @type {HTMLInputElement} */ (i).value);
  /** @type {Record<string, string>} */
  const opts = {};
  for (const s of document.querySelectorAll('#r-campos select')) opts[/** @type {HTMLSelectElement} */ (s).dataset.opt ?? ''] = /** @type {HTMLSelectElement} */ (s).value;
  return { nombres, opts };
}

function construirCampos() {
  const def = UI[tipo.value];
  const box = $('r-campos');
  box.replaceChildren();
  def.reactivos.forEach((r, i) => {
    const l = el('label', undefined, r);
    const inp = /** @type {HTMLInputElement} */ (el('input'));
    inp.type = 'text'; inp.autocomplete = 'off'; inp.spellcheck = false; inp.dataset.i = String(i);
    inp.addEventListener('input', ejecutar);
    l.append(inp);
    box.append(l);
  });
  for (const [key, label, vals] of def.opciones ?? []) {
    const l = el('label', undefined, label);
    const sel = /** @type {HTMLSelectElement} */ (el('select'));
    sel.dataset.opt = key;
    for (const v of vals) { const o = el('option', undefined, v); /** @type {HTMLOptionElement} */ (o).value = v; sel.append(o); }
    sel.addEventListener('change', ejecutar);
    l.append(sel);
    box.append(l);
  }
  const ej = $('r-ejemplos');
  ej.replaceChildren(el('span', undefined, 'Prueba:'));
  for (const [nombres, opts] of def.ejemplos) {
    const b = el('button', undefined, nombres.join(' + '));
    /** @type {HTMLButtonElement} */ (b).type = 'button';
    b.addEventListener('click', () => {
      document.querySelectorAll('#r-campos input').forEach((i, k) => { /** @type {HTMLInputElement} */ (i).value = nombres[k] ?? ''; });
      for (const [k, v] of Object.entries(opts)) { const s = /** @type {HTMLSelectElement | null} */ (document.querySelector(`#r-campos select[data-opt="${k}"]`)); if (s) s.value = v; }
      ejecutar();
    });
    ej.append(b);
  }
  $('r-resultado').hidden = true;
  $('r-estado').textContent = '';
}

/** @param {import('../core/species.js').Species} s */
function tarjeta(s) {
  const c = el('div', `r-esp${s.role === 'secundario' ? ' sec' : ''}`);
  const rol = s.role === 'secundario' ? ' (minoritario)' : s.role === 'mezcla' ? ' (mezcla)' : '';
  c.append(el('h3', undefined, `${s.coef && s.coef > 1 ? `${s.coef} × ` : ''}${s.name ?? s.formula}${rol}`));
  if (s.mol && s.kind === 'organic') {
    const d = el('div', 'svg');
    if (s.mol.isTree() && s.chain) d.innerHTML = renderSvg(s.mol, s.chain, { locants: false });
    else d.innerHTML = analyze(s.name ?? '').aromatic?.svg({ locants: false }) ?? ''; // anillo de benceno: dibujo propio
    if (d.innerHTML) c.append(d);
  }
  c.append(el('small', undefined, `${s.formula}${s.semi && s.kind !== 'inorganic' ? ` · ${s.semi}` : ''}`));
  return c;
}

/** @type {import('../core/reactions.js').ReactionResult | null} */
let actual = null;

function ejecutar() {
  const { nombres, opts } = leerCampos();
  const estado = $('r-estado');
  if (nombres.every((n) => !n.trim())) { $('r-resultado').hidden = true; estado.className = 'estado'; estado.textContent = ''; return; }
  const r = react(tipo.value, nombres, opts);
  actual = r;
  estado.className = `estado ${r.status === 'valido' ? 'valido' : r.status === 'sin_reaccion' ? 'incompleto' : r.status}`;
  if (r.status === 'valido') estado.textContent = 'Reacción calculada con reglas deterministas.';
  else {
    estado.textContent = r.status === 'sin_reaccion' ? 'No hay reacción en estas condiciones.' : r.status === 'fuera_de_alcance' ? 'Fuera de alcance.' : r.status === 'incompleto' ? 'Falta algo.' : 'Hay un problema.';
    const sm = el('small', undefined, r.errors.map((e) => e.message).join(' '));
    estado.append(sm);
  }
  const res = $('r-resultado');
  const mostrar = r.status === 'valido' || (r.status === 'sin_reaccion' && r.steps.length > 0);
  res.hidden = !mostrar;
  if (!mostrar) return;
  $('r-eq').textContent = r.equationSemi ?? `${r.substrates.map((s) => s.name).join(' + ')}  ✗  (no reacciona)`;
  $('r-eq-nombres').textContent = r.equation ?? '';
  $('r-especies').replaceChildren(...[...r.substrates, ...r.reagents, ...r.products].map(tarjeta));
  $('r-pasos').replaceChildren(...r.steps.map((t) => el('li', undefined, t)));
  $('r-notas').replaceChildren(...r.notes.map((t) => el('li', undefined, t)));
  const hayPractica = practica.checked && r.status === 'valido';
  $('r-practica-caja').hidden = !hayPractica;
  $('r-solucion').hidden = hayPractica;
  $('r-eq').hidden = hayPractica;
  $('r-eq-nombres').hidden = hayPractica;
  if (hayPractica) { /** @type {HTMLInputElement} */ ($('r-resp')).value = ''; $('r-veredicto').textContent = ''; }
}

function verificar() {
  if (!actual || actual.status !== 'valido') return;
  const txt = /** @type {HTMLInputElement} */ ($('r-resp')).value;
  const v = $('r-veredicto');
  if (!txt.trim()) { v.replaceChildren(); return; }
  const mine = speciesFromName(txt);
  const org = actual.products.filter((p) => (p.kind === 'organic' || p.kind === 'salt' || p.kind === 'polymer') && p.role !== 'secundario');
  const msg = el('div', 'v');
  if (!mine.ok) { msg.className = 'v info'; msg.textContent = 'No puedo leer ese nombre todavía.'; }
  else if (org.some((p) => p.key === mine.species.key)) { msg.className = 'v ok'; msg.textContent = '¡Correcto! Ese es un producto principal.'; }
  else if (actual.products.some((p) => p.key === mine.species.key)) { msg.className = 'v aviso'; msg.textContent = 'Es un producto posible, pero minoritario.'; }
  else { msg.className = 'v mal'; msg.textContent = 'Esa no es la estructura que se obtiene. Revisa la regla.'; }
  v.replaceChildren(msg);
}

tipo.addEventListener('change', construirCampos);
practica.addEventListener('change', ejecutar);
$('r-resp').addEventListener('input', verificar);
$('r-revelar').addEventListener('click', () => {
  $('r-practica-caja').hidden = true;
  for (const id of ['r-solucion', 'r-eq', 'r-eq-nombres']) $(id).hidden = false;
});
construirCampos();
