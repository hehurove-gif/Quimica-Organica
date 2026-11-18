// @ts-check
/**
 * Representación semidesarrollada: texto (CH₃–CH(CH₃)–CH₂–Br) y SVG en zigzag como en los
 * ejemplos de libro de texto. Las coordenadas viven AQUÍ, no en el modelo molecular:
 * dibujar distinto no cambia la molécula.
 */
import { Molecule, HALOGENS } from './molecule.js';

const SUB = '₀₁₂₃₄₅₆₇₈₉';
/** @param {number} n */
const sub = (n) => (n > 1 ? String(n).split('').map((d) => SUB[Number(d)]).join('') : '');

/**
 * Texto de un carbono con sus hidrógenos y halógenos "compactos": CH₂, CHBr₂, CCl₃.
 * @param {Molecule} mol
 * @param {number} id
 * @param {number[]} skip vecinos que no se escriben aquí (cadena / padre / ramas de carbono)
 */
function carbonText(mol, id, skip) {
  const h = mol.implicitH(id);
  /** @type {Record<string, number>} */
  const halos = {};
  for (const nb of mol.neighbors(id)) {
    const el = mol.element(nb.id);
    if (HALOGENS.includes(el) && !skip.includes(nb.id)) halos[el] = (halos[el] || 0) + 1;
  }
  const hText = h ? `H${sub(h)}` : '';
  const xText = Object.keys(halos)
    .sort()
    .map((el) => `${el}${sub(halos[el])}`)
    .join('');
  return `C${hText}${xText}`;
}

/**
 * Rama de carbono escrita de forma lineal: "CH(CH₃)–CH₃".
 * @param {Molecule} mol
 * @param {number} id
 * @param {number} parent
 * @returns {string}
 */
function branchText(mol, id, parent) {
  const kids = mol.neighbors(id).map((n) => n.id).filter((k) => k !== parent && mol.element(k) === 'C');
  const base = carbonText(mol, id, [parent]);
  if (kids.length === 0) return base;
  const parts = kids.map((k) => branchText(mol, k, id));
  const last = parts.pop();
  return `${base}${parts.map((p) => `(${p})`).join('')}–${last}`;
}

/**
 * Fórmula semidesarrollada en una línea, siguiendo la cadena dada.
 * @param {Molecule} mol
 * @param {number[]} chain
 * @returns {string}
 */
export function semidesarrollada(mol, chain) {
  const n = chain.length;
  const parts = chain.map((id, i) => {
    const prev = chain[i - 1];
    const next = chain[i + 1];
    const others = mol.neighbors(id).map((x) => x.id).filter((x) => x !== prev && x !== next);
    const carbonBranches = others.filter((x) => mol.element(x) === 'C');
    const halos = others.filter((x) => HALOGENS.includes(mol.element(x)));
    const isEnd = n > 1 && (i === 0 || i === n - 1);
    // extremo con un único halógeno: se escribe como grupo aparte: Br–CH₂–… / …–CH₂–Br
    if (isEnd && carbonBranches.length === 0 && halos.length === 1) {
      const x = mol.element(halos[0]);
      const c = carbonText(mol, id, halos);
      return i === 0 ? `${x}–${c}` : `${c}–${x}`;
    }
    const base = carbonText(mol, id, carbonBranches);
    return base + carbonBranches.map((b) => `(${branchText(mol, b, id)})`).join('');
  });
  return parts.join('–');
}

/* ------------------------------ SVG ------------------------------ */

/**
 * @typedef {{ x: number, y: number }} Pt
 * @typedef {{ bond?: number, fontSize?: number, locants?: boolean }} RenderOptions
 */

/** @param {string} s */
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Posiciones 2D de todos los átomos.
 * @param {Molecule} mol
 * @param {number[]} chain
 * @param {number} L longitud de enlace
 * @returns {Map<number, Pt>}
 */
export function layout(mol, chain, L) {
  /** @type {Map<number, Pt>} */
  const pos = new Map();
  const dx = L * Math.cos(Math.PI / 6);
  const dy = L * Math.sin(Math.PI / 6);
  const yOf = (/** @type {number} */ i) => (((i % 2) + 2) % 2 === 0 ? 0 : dy);
  const n = chain.length;
  chain.forEach((id, i) => pos.set(id, { x: i * dx, y: yOf(i) }));

  /**
   * Coloca una rama que sale de `parent` con ángulo `a` (radianes, SVG: y hacia abajo).
   * @param {number} id @param {number} parent @param {Pt} from @param {number} a @param {number} flip
   */
  const place = (id, parent, from, a, flip) => {
    const p = { x: from.x + L * Math.cos(a), y: from.y + L * Math.sin(a) };
    pos.set(id, p);
    const kids = mol.neighbors(id).map((k) => k.id).filter((k) => k !== parent);
    const t = Math.PI / 3;
    /** @type {number[]} */
    let angles = [];
    if (kids.length === 1) angles = [a + flip * t];
    else if (kids.length === 2) angles = [a - t, a + t];
    else if (kids.length === 3) angles = [a - t, a, a + t];
    kids.forEach((k, j) => place(k, id, p, angles[j], -flip));
  };

  chain.forEach((id, i) => {
    const prev = chain[i - 1];
    const next = chain[i + 1];
    const subs = mol.neighbors(id).map((x) => x.id).filter((x) => x !== prev && x !== next);
    const here = /** @type {Pt} */ (pos.get(id));
    const outSign = i % 2 === 0 ? -1 : 1; // vértice superior: hacia arriba; inferior: hacia abajo
    /** @type {number[]} */
    let angles = [];
    if (n === 1) {
      angles = [0, Math.PI, -Math.PI / 2, Math.PI / 2];
    } else if (i === 0 || i === n - 1) {
      const toVirtual = i === 0
        ? Math.atan2(yOf(-1) - here.y, -dx)
        : Math.atan2(yOf(n) - here.y, dx);
      const outward = outSign * (Math.PI / 2);
      angles = [toVirtual, outward, -outward];
    } else {
      const base = outSign * (Math.PI / 2);
      const spread = Math.PI / 6;
      angles = subs.length === 1 ? [base] : [base - spread, base + spread];
    }
    subs.forEach((s, j) => {
      const a = angles[j];
      const flip = Math.sin(a) < 0 ? 1 : -1; // gira hacia la derecha
      place(s, id, here, a, flip);
    });
  });
  return pos;
}

/**
 * Etiqueta de un átomo como tramos de texto: [{ t, sub }]
 * @param {Molecule} mol
 * @param {number} id
 * @param {Map<number, Pt>} pos
 * @returns {{ t: string, sub: boolean }[]}
 */
function atomLabel(mol, id, pos) {
  const el = mol.element(id);
  if (el !== 'C') return [{ t: el, sub: false }];
  const h = mol.implicitH(id);
  const nbs = mol.neighbors(id);
  const me = /** @type {Pt} */ (pos.get(id));
  const leafToRight = nbs.length === 1 && /** @type {Pt} */ (pos.get(nbs[0].id)).x > me.x + 4;
  /** @type {{ t: string, sub: boolean }[]} */
  const out = [];
  const hPart = () => {
    if (h > 0) out.push({ t: 'H', sub: false });
    if (h > 1) out.push({ t: String(h), sub: true });
  };
  if (leafToRight && h > 0) {
    hPart();
    out.push({ t: 'C', sub: false });
  } else {
    out.push({ t: 'C', sub: false });
    hPart();
  }
  return out;
}

/**
 * SVG de la estructura semidesarrollada.
 * Cada átomo lleva `data-atom="id"` y cada enlace `data-bond="a-b"` (para el resaltado cruzado).
 * @param {Molecule} mol
 * @param {number[]} chain cadena principal (C1 a la izquierda)
 * @param {RenderOptions} [opts]
 * @returns {string}
 */
export function renderSvg(mol, chain, opts = {}) {
  const L = opts.bond ?? 46;
  const fs = opts.fontSize ?? 20;
  const pos = layout(mol, chain, L);
  const labels = new Map(mol.atoms.map((a) => [a.id, atomLabel(mol, a.id, pos)]));
  /** @param {number} id */
  const width = (id) =>
    /** @type {{ t: string, sub: boolean }[]} */ (labels.get(id)).reduce((s, l) => s + l.t.length * (l.sub ? 0.5 : 0.66) * fs, 0);
  const h = fs * 0.9;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [id, p] of pos) {
    const w = width(id) / 2;
    minX = Math.min(minX, p.x - w);
    maxX = Math.max(maxX, p.x + w);
    minY = Math.min(minY, p.y - h);
    maxY = Math.max(maxY, p.y + h);
  }
  const pad = 22;
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;
  const W = Math.round(maxX - minX);
  const H = Math.round(maxY - minY);

  /** Recorte del enlace en el borde de la etiqueta. @param {number} id @param {number} ux @param {number} uy */
  const trim = (id, ux, uy) => {
    const hw = width(id) / 2 + 3;
    const hh = h / 2 + 3;
    const tx = Math.abs(ux) > 1e-6 ? hw / Math.abs(ux) : Infinity;
    const ty = Math.abs(uy) > 1e-6 ? hh / Math.abs(uy) : Infinity;
    return Math.min(tx, ty);
  };

  const f = (/** @type {number} */ v) => v.toFixed(1);
  /** @type {string[]} */
  const lines = [];
  for (const b of mol.bonds) {
    const pa = /** @type {Pt} */ (pos.get(b.a));
    const pb = /** @type {Pt} */ (pos.get(b.b));
    const len = Math.hypot(pb.x - pa.x, pb.y - pa.y) || 1;
    const ux = (pb.x - pa.x) / len;
    const uy = (pb.y - pa.y) / len;
    const ta = trim(b.a, ux, uy);
    const tb = trim(b.b, ux, uy);
    lines.push(
      `<line data-bond="${b.a}-${b.b}" x1="${f(pa.x + ux * ta)}" y1="${f(pa.y + uy * ta)}" x2="${f(pb.x - ux * tb)}" y2="${f(pb.y - uy * tb)}"/>`,
    );
  }

  /** @type {string[]} */
  const atoms = [];
  for (const a of mol.atoms) {
    const p = /** @type {Pt} */ (pos.get(a.id));
    const spans = /** @type {{ t: string, sub: boolean }[]} */ (labels.get(a.id));
    let inner = '';
    let lowered = false;
    for (const s of spans) {
      if (s.sub) {
        inner += `<tspan dy="${f(fs * 0.22)}" font-size="${f(fs * 0.72)}">${s.t}</tspan>`;
        lowered = true;
      } else {
        inner += lowered ? `<tspan dy="${f(-fs * 0.22)}">${s.t}</tspan>` : s.t;
        lowered = false;
      }
    }
    const w = width(a.id);
    atoms.push(
      `<g class="atom el-${a.el}" data-atom="${a.id}"><rect class="hit" x="${f(p.x - w / 2 - 3)}" y="${f(p.y - h / 2 - 3)}" width="${f(w + 6)}" height="${f(h + 6)}" rx="4"/><text x="${f(p.x)}" y="${f(p.y)}">${inner}</text></g>`,
    );
  }

  /** @type {string[]} */
  const locs = [];
  if (opts.locants) {
    chain.forEach((id, i) => {
      const p = /** @type {Pt} */ (pos.get(id));
      const inward = i % 2 === 0 ? 1 : -1;
      locs.push(`<text class="locant" x="${f(p.x)}" y="${f(p.y + inward * (h / 2 + 12))}">${i + 1}</text>`);
    });
  }

  const label = esc(semidesarrollada(mol, chain));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" class="mol" viewBox="${f(minX)} ${f(minY)} ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${label}">` +
    `<g class="bonds" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" fill="none">${lines.join('')}</g>` +
    `<g class="atoms" font-family="Helvetica, Arial, sans-serif" font-size="${fs}" fill="currentColor" text-anchor="middle" dominant-baseline="central">${atoms.join('')}</g>` +
    (locs.length ? `<g class="locants" font-family="Helvetica, Arial, sans-serif" font-size="${f(fs * 0.55)}" fill="currentColor" opacity="0.55" text-anchor="middle" dominant-baseline="central">${locs.join('')}</g>` : '') +
    `</svg>`
  );
}
