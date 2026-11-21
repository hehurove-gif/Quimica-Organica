// @ts-check
import {
  GROUPS, MAX_CHAIN, emptyDraft, setLength, setBond, addGroup, removeGroup, describe, verify,
} from '../core/construct.js';
import { renderSvg, semidesarrollada } from '../core/render.js';
import { showView } from './vistas.js';

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const nSlider = /** @type {HTMLInputElement} */ ($('c-n'));
const nombreIn = /** @type {HTMLInputElement} */ ($('c-nombre'));
const locChk = /** @type {HTMLInputElement} */ ($('c-loc'));
const practica = /** @type {HTMLInputElement} */ ($('c-practica'));

/** @type {import('../core/construct.js').Draft} */
let draft = emptyDraft(4);
let revelada = false;

/** @param {string} tag @param {string} [cls] @param {string} [text] */
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Ejemplos: [carbonos, [carbono, grupo][], [enlace, orden][]] */
const EJEMPLOS = /** @type {[number, [number, string][], [number, 1 | 2 | 3][]][]} */ ([
  [3, [[2, 'OH']], []],
  [3, [[1, '=O'], [1, 'OH'], [2, 'NH2']], []],
  [6, [[2, 'metil'], [5, 'metil'], [3, 'Br']], []],
  [2, [[1, '=O'], [1, 'OCH3']], []],
  [4, [[1, 'OH']], [[3, 2]]],
]);

/** @param {import('../core/construct.js').Draft} d */
export function loadDraft(d) {
  draft = d;
  revelada = false;
  nombreIn.value = '';
  render();
}

/** Editor de la cadena: un carbono por columna, enlaces entre ellos. */
function renderCadena() {
  const box = $('c-cadena');
  box.replaceChildren();
  for (let i = 1; i <= draft.n; i++) {
    if (i > 1) {
      const wrap = el('div', 'enlace');
      const sel = /** @type {HTMLSelectElement} */ (el('select'));
      sel.setAttribute('aria-label', `Enlace entre C${i - 1} y C${i}`);
      for (const [v, t] of /** @type {[string, string][]} */ ([['1', '—'], ['2', '='], ['3', '≡']])) {
        const o = /** @type {HTMLOptionElement} */ (el('option', '', t));
        o.value = v;
        sel.append(o);
      }
      sel.value = String(draft.bonds[i - 2]);
      sel.addEventListener('change', () => {
        draft = setBond(draft, i - 1, /** @type {1 | 2 | 3} */ (Number(sel.value)));
        render();
      });
      wrap.append(sel);
      box.append(wrap);
    }
    const col = el('div', 'carbono');
    col.append(el('div', 'c', `C${i}`));
    const chips = el('div', 'chips');
    draft.groups
      .filter((g) => g.pos === i)
      .forEach((g, idx) => {
        const chip = el('span', 'chip');
        chip.append(g.kind);
        const x = /** @type {HTMLButtonElement} */ (el('button', '', '×'));
        x.type = 'button';
        x.setAttribute('aria-label', `Quitar ${g.kind} de C${i}`);
        x.addEventListener('click', () => {
          draft = removeGroup(draft, i, idx);
          render();
        });
        chip.append(x);
        chips.append(chip);
      });
    col.append(chips);
    const add = /** @type {HTMLSelectElement} */ (el('select'));
    add.setAttribute('aria-label', `Agregar un grupo a C${i}`);
    add.append(Object.assign(el('option', '', '+ grupo'), { value: '' }));
    for (const fam of [...new Set(GROUPS.map((g) => g.family))]) {
      const og = el('optgroup');
      og.setAttribute('label', fam);
      for (const g of GROUPS.filter((x) => x.family === fam)) og.append(Object.assign(el('option', '', g.label), { value: g.kind }));
      add.append(og);
    }
    add.addEventListener('change', () => {
      if (!add.value) return;
      draft = addGroup(draft, i, add.value);
      render();
    });
    col.append(add);
    box.append(col);
  }
}

/** Veredicto de «Verifica mi respuesta». */
function renderVeredicto() {
  const box = $('c-veredicto');
  box.replaceChildren();
  const v = verify(draft, nombreIn.value);
  const claseDe = { correcta: 'ok', correcta_con_avisos: 'aviso', isomero: 'mal', distinta: 'mal', no_se_entiende: 'info', sin_estructura: 'mal', vacio: '' };
  if (v.verdict === 'vacio') return v;
  const d = el('div', `v ${claseDe[v.verdict]}`);
  const titulo = {
    correcta: '✓ Correcto', correcta_con_avisos: '✓ Es la estructura, pero mejora el nombre', isomero: '✗ Es un isómero',
    distinta: '✗ No coincide', no_se_entiende: '… No lo entiendo todavía', sin_estructura: '✗ Estructura no válida', vacio: '',
  }[v.verdict];
  d.append(titulo, el('small', '', v.message));
  for (const n of v.notes) d.append(el('small', '', `⚠ ${n}`));
  if (v.student && (v.verdict === 'isomero' || v.verdict === 'distinta')) {
    d.append(el('small', '', `Tu nombre se dibujaría así: ${v.student.semidesarrollada}`));
  }
  box.append(d);
  return v;
}

function render() {
  nSlider.value = String(draft.n);
  $('c-n-out').textContent = String(draft.n);
  renderCadena();

  const r = describe(draft);
  const estado = $('c-estado');
  estado.className = `estado ${r.status}`;
  estado.replaceChildren();
  if (r.status !== 'valido') {
    estado.append(r.status === 'invalido' ? '✗ Estructura no válida' : '⚠ Fuera de alcance por ahora', el('small', '', r.errors.join(' ')));
    $('c-resultado').hidden = true;
    return;
  }
  estado.append('✓ Estructura válida', el('small', '', 'Se dibuja y se nombra con las mismas reglas que el modo «Nombre → estructura».'));
  $('c-resultado').hidden = false;
  const a = /** @type {import('../core/analyze.js').Analysis} */ (r.analysis);
  const mol = /** @type {import('../core/molecule.js').Molecule} */ (a.molecule);
  $('c-svg').innerHTML = renderSvg(mol, a.chain, { locants: locChk.checked });
  $('c-semi').textContent = semidesarrollada(mol, a.chain, {});

  const v = renderVeredicto();
  const oculto = practica.checked && !revelada && v.verdict !== 'correcta' && v.verdict !== 'correcta_con_avisos';
  $('c-respuesta').hidden = oculto;
  $('c-revelar').hidden = !practica.checked || !oculto;

  const dl = $('c-nombres');
  dl.replaceChildren();
  /** @param {string} k @param {string} t */
  const row = (k, t) => dl.append(el('dt', '', k), el('dd', '', t));
  if (a.names?.sistematico) row('Nombre sistemático (escolar)', a.names.sistematico);
  if (a.names?.iupac2013 && a.names.iupac2013 !== a.names.sistematico) row('Nombre IUPAC 2013', a.names.iupac2013);
  if (a.names?.radicofuncional) row('Forma radicofuncional', a.names.radicofuncional);
  row('Fórmula molecular', r.formula || '');

  const ul = $('c-avisos');
  ul.replaceChildren();
  const notas = a.notes.filter((n) => n.type !== 'localizador_omitido' && n.type !== 'orden_alfabetico' && n.type !== 'numeracion');
  $('c-avisos-sec').hidden = notas.length === 0;
  for (const n of notas) {
    const li = el('li', n.severity === 'aviso' ? 'aviso' : '');
    li.append(el('b', '', n.severity === 'aviso' ? '⚠' : 'ℹ'), n.message);
    ul.append(li);
  }
  const ol = $('c-pasos');
  ol.replaceChildren();
  for (const s of a.steps) {
    const li = el('li');
    li.append(el('b', '', s.title), s.text);
    ol.append(li);
  }
}

nSlider.addEventListener('input', () => {
  draft = setLength(draft, Number(nSlider.value));
  render();
});
locChk.addEventListener('change', render);
practica.addEventListener('change', () => {
  revelada = false;
  render();
});
nombreIn.addEventListener('input', render);
$('c-revelar').addEventListener('click', () => {
  revelada = true;
  render();
});
$('c-limpiar').addEventListener('click', () => loadDraft(emptyDraft(4)));
document.querySelectorAll('[data-cej]').forEach((b) =>
  b.addEventListener('click', () => {
    const [n, gs, bs] = EJEMPLOS[Number(b.getAttribute('data-cej'))];
    let d = emptyDraft(n);
    for (const [i, o] of bs) d = setBond(d, i, o);
    for (const [p, k] of gs) d = addGroup(d, p, k);
    loadDraft(d);
  }),
);
$('c-a-nombre').addEventListener('click', () => {
  const nombre = describe(draft).canonicalName;
  if (!nombre) return;
  document.dispatchEvent(new CustomEvent('abrir-nombre', { detail: nombre }));
  showView('nombre');
});

if (MAX_CHAIN !== Number(nSlider.max)) nSlider.max = String(MAX_CHAIN);
// ejemplo inicial: 2-propanol
{
  const [n, gs] = EJEMPLOS[0];
  let d = emptyDraft(n);
  for (const [p, k] of gs) d = addGroup(d, p, k);
  draft = d;
}
render();
