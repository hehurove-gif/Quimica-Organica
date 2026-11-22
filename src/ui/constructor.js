// @ts-check
import {
  GROUPS, MAX_CHAIN, RING_SUBS, emptyDraft, setLength, setBond, addGroup, removeGroup, describe, verify,
  emptyRing, setRingSub,
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
/** @type {import('../core/construct.js').RingDraft} */
let ringDraft = emptyRing();
let modoAnillo = false;
/** Borrador activo según el modo. */
const cur = () => (modoAnillo ? ringDraft : draft);
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

/** @param {import('../core/construct.js').Draft | import('../core/construct.js').RingDraft} d */
export function loadDraft(d) {
  if ('ring' in d) { ringDraft = d; modoAnillo = true; } else { draft = d; modoAnillo = false; }
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

/** Hexágono central del editor de anillo (decorativo): Kekulé con los vértices 1-6. */
const HEX_SVG = (() => {
  const pts = Array.from({ length: 6 }, (_, k) => {
    const ang = ((-90 + 60 * k) * Math.PI) / 180;
    return [40 * Math.cos(ang), 40 * Math.sin(ang)];
  });
  const ln = (/** @type {number} */ i, /** @type {number} */ j, /** @type {number} */ w) =>
    `<line x1="${pts[i][0].toFixed(1)}" y1="${pts[i][1].toFixed(1)}" x2="${pts[j][0].toFixed(1)}" y2="${pts[j][1].toFixed(1)}" stroke-width="${w}"/>`;
  const dobles = [0, 2, 4].map((i) => {
    const j = (i + 1) % 6;
    const mx = (pts[i][0] + pts[j][0]) / 2;
    const my = (pts[i][1] + pts[j][1]) / 2;
    const f = 7 / Math.hypot(mx, my);
    const sh = (/** @type {number[]} */ p) => [p[0] - mx * f + (mx - p[0]) * 0.18, p[1] - my * f + (my - p[1]) * 0.18];
    const a = sh(pts[i]);
    const b = sh(pts[j]);
    return `<line x1="${a[0].toFixed(1)}" y1="${a[1].toFixed(1)}" x2="${b[0].toFixed(1)}" y2="${b[1].toFixed(1)}" stroke-width="1.6"/>`;
  });
  const nums = pts.map((p, k) => `<text x="${(p[0] * 0.55).toFixed(1)}" y="${(p[1] * 0.55).toFixed(1)}">${k + 1}</text>`);
  return `<svg viewBox="-60 -60 120 120" width="130" height="130" aria-hidden="true" stroke="currentColor" fill="none" stroke-linecap="round">${[0, 1, 2, 3, 4, 5].map((i) => ln(i, (i + 1) % 6, 1.6)).join('')}${dobles.join('')}<g fill="currentColor" stroke="none" font-size="11" text-anchor="middle" dominant-baseline="central" opacity=".6">${nums.join('')}</g></svg>`;
})();

/** Editor del anillo: seis listas desplegables colocadas alrededor de un hexágono (1 arriba, sentido horario). */
function renderAnillo() {
  const box = $('c-anillo');
  box.replaceChildren();
  ringDraft.subs.forEach((name, k) => {
    const col = el('div', `carbono pos p${k + 1}`);
    col.append(el('div', 'c', String(k + 1)));
    const sel = /** @type {HTMLSelectElement} */ (el('select'));
    sel.setAttribute('aria-label', `Sustituyente en la posición ${k + 1}`);
    sel.append(Object.assign(el('option', '', '— H'), { value: '' }));
    for (const s of RING_SUBS) sel.append(Object.assign(el('option', '', `${s.name} (${s.label})`), { value: s.name }));
    sel.value = name ?? '';
    sel.classList.toggle('usada', !!name);
    sel.addEventListener('change', () => {
      ringDraft = setRingSub(ringDraft, k + 1, sel.value || null);
      render();
    });
    col.append(sel);
    box.append(col);
  });
  const hx = el('div', 'hx');
  hx.innerHTML = HEX_SVG;
  box.append(hx);
}

/** Veredicto de «Verifica mi respuesta». */
function renderVeredicto() {
  const box = $('c-veredicto');
  box.replaceChildren();
  const v = verify(cur(), nombreIn.value);
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
  $('c-cadena-box').hidden = modoAnillo;
  $('c-anillo-box').hidden = !modoAnillo;
  $('c-modo-cadena').setAttribute('aria-pressed', String(!modoAnillo));
  $('c-modo-anillo').setAttribute('aria-pressed', String(modoAnillo));
  if (modoAnillo) renderAnillo();
  else {
    nSlider.value = String(draft.n);
    $('c-n-out').textContent = String(draft.n);
    renderCadena();
  }

  const r = describe(cur());
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
  $('c-svg').innerHTML = a.aromatic ? a.aromatic.svg({ locants: locChk.checked }) : renderSvg(mol, a.chain, { locants: locChk.checked });
  $('c-semi').textContent = a.aromatic ? a.semidesarrollada || '' : semidesarrollada(mol, a.chain, {});

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
  if (a.aromatic?.variantes.length) row('También válido', a.aromatic.variantes.join(' · '));
  if (a.aromatic?.comunes.length) row('Nombre común', a.aromatic.comunes.join(' · '));
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
$('c-limpiar-anillo').addEventListener('click', () => loadDraft(emptyRing()));
$('c-modo-cadena').addEventListener('click', () => loadDraft(draft));
$('c-modo-anillo').addEventListener('click', () => loadDraft(ringDraft));
/** Ejemplos del anillo: [posición, sustituyente][] */
const EJ_ANILLO = /** @type {[number, string][][]} */ ([
  [],
  [[1, 'metil']],
  [[1, 'hidroxi']],
  [[1, 'nitro']],
  [[1, 'metil'], [4, 'nitro']],
  [[1, 'metil'], [3, 'metil'], [5, 'metil']],
  [[1, 'carboxi'], [2, 'hidroxi']],
  [[1, 'metil'], [2, 'nitro'], [4, 'nitro'], [6, 'nitro']],
]);
document.querySelectorAll('[data-rej]').forEach((b) =>
  b.addEventListener('click', () => {
    let d = emptyRing();
    for (const [p, n] of EJ_ANILLO[Number(b.getAttribute('data-rej'))]) d = setRingSub(d, p, n);
    loadDraft(d);
  }),
);
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
  const nombre = describe(cur()).canonicalName;
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
