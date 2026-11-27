// @ts-check
import { analyze } from '../core/analyze.js';
import { renderSvg, semidesarrollada } from '../core/render.js';
import { moleculeToDraft, moleculeToRing } from '../core/construct.js';
import { showView } from './vistas.js';
import { loadDraft } from './constructor.js';
import './reacciones.js';

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const input = /** @type {HTMLInputElement} */ ($('nombre'));
const locChk = /** @type {HTMLInputElement} */ ($('loc'));
const compChk = /** @type {HTMLInputElement} */ ($('comp'));

/** @type {import('../core/analyze.js').Analysis | null} */
let current = null;

const ESTADOS = {
  valido: ['✓ Válido', 'El nombre es completo y produce una estructura.'],
  incompleto: ['… Incompleto', ''],
  invalido: ['✗ No válido', ''],
  fuera_de_alcance: ['⚠ Fuera de alcance por ahora', ''],
};

/** @param {string} tag @param {string} [cls] @param {string} [text] */
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

/** Fórmula semidesarrollada en una línea, comprimida o no según el botón. */
function renderSemi() {
  if (!current || !current.molecule) return;
  if (current.aromatic) { $('semi').textContent = current.semidesarrollada || ''; return; }
  $('semi').textContent = semidesarrollada(current.molecule, current.chain, { compress: compChk.checked });
}

/** Quita los resaltados. */
function clearHl() {
  document.querySelectorAll('.hl').forEach((n) => n.classList.remove('hl'));
}

/**
 * Resalta átomos (y enlaces entre ellos) y, opcionalmente, tokens del nombre.
 * @param {number[]} atomIds @param {number[]} tokenIdx
 */
function highlight(atomIds, tokenIdx) {
  clearHl();
  const set = new Set(atomIds);
  for (const id of set) document.querySelector(`#svg [data-atom="${id}"]`)?.classList.add('hl');
  document.querySelectorAll('#svg [data-bond]').forEach((b) => {
    const [x, y] = /** @type {string} */ (b.getAttribute('data-bond')).split('-').map(Number);
    if (set.has(x) && set.has(y)) b.classList.add('hl');
  });
  for (const i of tokenIdx) document.querySelector(`#leido [data-tok="${i}"]`)?.classList.add('hl');
}

/** El nombre escrito, con cada parte reconocida subrayada (cadena / sustituyentes). */
function renderLeido(/** @type {string} */ text, /** @type {import('../core/analyze.js').Analysis} */ a) {
  const box = $('leido');
  box.replaceChildren();
  if (a.status !== 'valido' || !current) {
    box.textContent = text;
    return;
  }
  const items = a.trace
    .map((t, i) => ({ t, i }))
    .filter((x) => x.t.span)
    .sort((p, q) => /** @type {any} */ (p.t.span).from - /** @type {any} */ (q.t.span).from);
  let pos = 0;
  for (const { t, i } of items) {
    const sp = /** @type {{ from: number, to: number }} */ (t.span);
    if (sp.from < pos) continue;
    if (sp.from > pos) box.append(text.slice(pos, sp.from));
    const tok = el('span', `tok ${t.role}`, text.slice(sp.from, sp.to));
    tok.dataset.tok = String(i);
    tok.addEventListener('mouseenter', () => highlight(t.atomIds, [i]));
    tok.addEventListener('mouseleave', clearHl);
    box.append(tok);
    pos = sp.to;
  }
  if (pos < text.length) box.append(text.slice(pos));
}

function renderDrawing() {
  const a = current;
  if (!a || !a.molecule) return;
  $('svg').innerHTML = a.aromatic
    ? a.aromatic.svg({ locants: locChk.checked })
    : renderSvg(a.molecule, a.chain, { locants: locChk.checked, compress: compChk.checked });
  $('svg').querySelectorAll('[data-atom]').forEach((g) => {
    const id = Number(g.getAttribute('data-atom'));
    g.addEventListener('mouseenter', () => {
      const idx = a.trace.map((t, i) => (t.atomIds.includes(id) ? i : -1)).filter((i) => i >= 0);
      const ids = new Set([id, ...idx.flatMap((i) => a.trace[i].atomIds)]);
      highlight([...ids], idx);
    });
    g.addEventListener('mouseleave', clearHl);
  });
}

function update() {
  const text = input.value;
  const a = analyze(text);
  current = a;
  const estado = $('estado');
  estado.className = `estado ${a.status}`;
  estado.replaceChildren();

  if (a.status === 'vacio') {
    estado.className = 'estado';
    $('resultado').hidden = true;
    $('leido').textContent = '';
    return;
  }
  const [titulo, detalle] = ESTADOS[/** @type {keyof typeof ESTADOS} */ (a.status)];
  estado.append(titulo);
  const msg = a.status === 'valido' ? detalle : a.errors.map((e) => e.message).join(' ');
  if (msg) estado.append(el('small', '', msg));

  renderLeido(text, a);

  if (a.status !== 'valido' || !a.molecule) {
    $('resultado').hidden = true;
    return;
  }
  $('resultado').hidden = false;
  const aCons = $('a-constructor');
  aCons.hidden = !(a.aromatic ? moleculeToRing(a.molecule) : moleculeToDraft(a.molecule, a.chain));
  renderDrawing();
  renderSemi();

  const dl = $('nombres');
  dl.replaceChildren();
  /** @param {string} k @param {string} v */
  const row = (k, v) => {
    dl.append(el('dt', '', k), el('dd', '', v));
  };
  if (a.names?.sistematico) row('Nombre sistemático (escolar)', a.names.sistematico);
  if (a.names?.iupac2013 && a.names.iupac2013 !== a.names.sistematico) row('Nombre IUPAC 2013', a.names.iupac2013);
  if (a.names?.radicofuncional) row('Forma radicofuncional', a.names.radicofuncional);
  if (a.aromatic?.variantes.length) row('También válido', a.aromatic.variantes.join(' · '));
  if (a.aromatic?.comunes.length) row('Nombre común', a.aromatic.comunes.join(' · '));
  row('Fórmula molecular', a.formula || '');
  row('Tu nombre', a.correcto ? '✓ correcto' : '⚠ se entiende, pero revisa las observaciones');

  const ul = $('avisos');
  ul.replaceChildren();
  $('avisos-sec').hidden = a.notes.length === 0;
  for (const n of a.notes) {
    const li = el('li', n.severity === 'aviso' ? 'aviso' : '');
    li.append(el('b', '', n.severity === 'aviso' ? '⚠' : 'ℹ'), n.message);
    ul.append(li);
  }

  const ol = $('pasos');
  ol.replaceChildren();
  for (const s of a.steps) {
    const li = el('li');
    li.append(el('b', '', s.title), s.text);
    li.addEventListener('mouseenter', () => {
      const idx = a.trace.map((t, i) => (s.atomIds.length && t.atomIds.some((x) => s.atomIds.includes(x)) && t.role !== 'cadena' ? i : -1)).filter((i) => i >= 0);
      highlight(s.atomIds.length === a.molecule?.atoms.length ? [] : s.atomIds, s.atomIds.length === a.molecule?.atoms.length ? [] : idx);
      li.classList.add('hl');
    });
    li.addEventListener('mouseleave', clearHl);
    ol.append(li);
  }
}

input.addEventListener('input', update);
locChk.addEventListener('change', renderDrawing);
compChk.addEventListener('change', () => {
  renderDrawing();
  renderSemi();
});
document.querySelectorAll('[data-ej]').forEach((b) =>
  b.addEventListener('click', () => {
    input.value = /** @type {string} */ (b.getAttribute('data-ej'));
    input.focus();
    update();
  }),
);
$('a-constructor').addEventListener('click', () => {
  if (!current || !current.molecule) return;
  const d = current.aromatic ? moleculeToRing(current.molecule) : moleculeToDraft(current.molecule, current.chain);
  if (!d) return;
  loadDraft(d);
  showView('constructor');
});
document.addEventListener('abrir-nombre', (e) => {
  input.value = /** @type {CustomEvent<string>} */ (e).detail;
  update();
});
const params = new URLSearchParams(location.search);
input.value = params.get('q') ?? '5-fluoro-2-metil-1-yodohexano';
compChk.checked = params.get('comp') === '1';
update();
