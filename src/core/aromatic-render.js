// @ts-check
/**
 * Dibujo de derivados del benceno: hexágono con enlaces dobles alternados (Kekulé) y los
 * sustituyentes como etiquetas condensadas (NO₂, CH₃, COOH…). Sin DOM.
 *
 * Cada vértice lleva `data-atom` (carbono del anillo), cada sustituyente `data-atom` de su átomo
 * raíz y cada enlace del anillo `data-bond="a-b"`: la misma convención que `renderSvg`.
 */

/**
 * @typedef {import('./molecule.js').Molecule} Molecule
 * @typedef {import('./aromatic.js').SubSpec} SubSpec
 * @typedef {{ pos: number, sub: SubSpec, atomIds: number[] }} RingGroup
 */

const SUBS_DIGITS = '₀₁₂₃₄₅₆₇₈₉';

/** @param {string} s */
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * «CH₃» -> [{t:'CH'},{t:'3',sub:true}]
 * @param {string} label
 * @returns {{ t: string, sub: boolean }[]}
 */
export function labelSpans(label) {
  /** @type {{ t: string, sub: boolean }[]} */
  const out = [];
  for (const ch of label) {
    const d = SUBS_DIGITS.indexOf(ch);
    const sub = d >= 0;
    const t = sub ? String(d) : ch;
    const last = out[out.length - 1];
    if (last && last.sub === sub) last.t += t;
    else out.push({ t, sub });
  }
  return out;
}

/** @param {string} s */
const sub = (s) => s.replace(/\d/g, (d) => SUBS_DIGITS[Number(d)]);

/**
 * Fórmula condensada del anillo: C₆H₅–Br, C₆H₄(NO₂)₂, C₆H₂(CH₃)(NO₂)₃… (las posiciones las da el dibujo).
 * @param {{ sub: SubSpec }[]} groups
 * @returns {string}
 */
export function ringSemi(groups) {
  const n = groups.length;
  const hs = 6 - n;
  if (n === 0) return 'C₆H₆';
  const base = hs === 0 ? 'C₆' : `C₆H${hs > 1 ? sub(String(hs)) : ''}`;
  /** @type {Map<string, { sub: SubSpec, k: number }>} */
  const by = new Map();
  for (const g of groups) {
    const e = by.get(g.sub.name) ?? { sub: g.sub, k: 0 };
    e.k++;
    by.set(g.sub.name, e);
  }
  const parts = [...by.values()]
    .sort((a, b) => a.sub.alpha.localeCompare(b.sub.alpha) || a.sub.name.localeCompare(b.sub.name))
    .map(({ sub: s, k }) => {
      const simple = /^[A-Z][a-z]?$/.test(s.label);
      const body = simple ? s.label : `(${s.label})`;
      return `${body}${k > 1 ? sub(String(k)) : ''}`;
    });
  if (n === 1) return `${base}–${groups[0].sub.label}`;
  return `${base}${parts.join('')}`;
}

/**
 * @param {Molecule} mol
 * @param {number[]} ringOrder  carbonos del anillo en orden de posición (1..6)
 * @param {RingGroup[]} groups
 * @param {{ locants?: boolean, fontSize?: number }} [opts]
 * @returns {string}
 */
export function renderRingSvg(mol, ringOrder, groups, opts = {}) {
  const fs = opts.fontSize ?? 20;
  const R = 36; // lado del hexágono
  const B = 34; // enlace al sustituyente
  const f = (/** @type {number} */ v) => v.toFixed(1);
  /** vértice k (0..5): la posición 1 arriba, en sentido horario */
  const vert = (/** @type {number} */ k) => {
    const ang = (-90 + 60 * k) * (Math.PI / 180);
    return { x: R * Math.cos(ang), y: R * Math.sin(ang), ux: Math.cos(ang), uy: Math.sin(ang) };
  };
  const posOf = new Map(ringOrder.map((id, k) => [id, k]));

  /** @type {string[]} */
  const lines = [];
  for (const b of mol.bonds) {
    const ka = posOf.get(b.a);
    const kb = posOf.get(b.b);
    if (ka === undefined || kb === undefined) continue;
    const pa = vert(ka);
    const pb = vert(kb);
    lines.push(`<line data-bond="${b.a}-${b.b}" x1="${f(pa.x)}" y1="${f(pa.y)}" x2="${f(pb.x)}" y2="${f(pb.y)}"/>`);
    if (b.order === 2) {
      // segundo trazo hacia el centro, acortado
      const mx = (pa.x + pb.x) / 2;
      const my = (pa.y + pb.y) / 2;
      const len = Math.hypot(mx, my) || 1;
      const ox = (-mx / len) * 6.5;
      const oy = (-my / len) * 6.5;
      const sh = 0.14;
      const x1 = pa.x + (pb.x - pa.x) * sh + ox;
      const y1 = pa.y + (pb.y - pa.y) * sh + oy;
      const x2 = pb.x - (pb.x - pa.x) * sh + ox;
      const y2 = pb.y - (pb.y - pa.y) * sh + oy;
      lines.push(`<line data-bond="${b.a}-${b.b}" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}"/>`);
    }
  }

  const spansWidth = (/** @type {{ t: string, sub: boolean }[]} */ sp) =>
    sp.reduce((s, l) => s + l.t.length * (l.sub ? 0.5 : 0.66) * fs, 0);
  const h = fs * 0.9;

  /** @type {string[]} */
  const atoms = [];
  /** @type {string[]} */
  const hits = [];
  for (let k = 0; k < 6; k++) {
    const p = vert(k);
    hits.push(`<g class="atom el-C ringc" data-atom="${ringOrder[k]}"><circle class="hit" cx="${f(p.x)}" cy="${f(p.y)}" r="9" fill="transparent"/></g>`);
  }

  let minX = -R - 10;
  let maxX = R + 10;
  let minY = -R - 10;
  let maxY = R + 10;
  for (const g of groups) {
    const k = g.pos - 1;
    const p = vert(k);
    const sp = labelSpans(g.sub.label);
    const w = spansWidth(sp);
    // el enlace termina en el borde de la etiqueta (más largo si la etiqueta es ancha y el vértice lateral)
    const bx = p.x + p.ux * B;
    const by = p.y + p.uy * B;
    lines.push(`<line data-bond="${ringOrder[k]}-${g.atomIds[0]}" x1="${f(p.x)}" y1="${f(p.y)}" x2="${f(bx)}" y2="${f(by)}"/>`);
    let inner = '';
    let lowered = false;
    for (const s of sp) {
      if (s.sub) {
        inner += `<tspan dy="${f(fs * 0.22)}" font-size="${f(fs * 0.72)}">${esc(s.t)}</tspan>`;
        lowered = true;
      } else {
        inner += lowered ? `<tspan dy="${f(-fs * 0.22)}">${esc(s.t)}</tspan>` : esc(s.t);
        lowered = false;
      }
    }
    // la etiqueta se centra tras el extremo del enlace, separada por su semiancho/semialto
    const lx = bx + p.ux * (w / 2 * Math.abs(p.ux) + 2);
    const ly = by + p.uy * (h / 2 * Math.abs(p.uy) + 2);
    atoms.push(
      `<g class="atom el-${g.sub.kind === 'frag' ? 'X' : 'N'}" data-atom="${g.atomIds[0]}"><rect class="hit" x="${f(lx - w / 2 - 3)}" y="${f(ly - h / 2 - 3)}" width="${f(w + 6)}" height="${f(h + 6)}" rx="4"/><text x="${f(lx)}" y="${f(ly)}">${inner}</text></g>`,
    );
    minX = Math.min(minX, lx - w / 2);
    maxX = Math.max(maxX, lx + w / 2);
    minY = Math.min(minY, ly - h);
    maxY = Math.max(maxY, ly + h);
  }

  /** @type {string[]} */
  const locs = [];
  if (opts.locants) {
    for (let k = 0; k < 6; k++) {
      const p = vert(k);
      locs.push(`<text class="locant" x="${f(p.x * 0.62)}" y="${f(p.y * 0.62)}">${k + 1}</text>`);
    }
  }
  const pad = 22;
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  const W = Math.round(maxX - minX);
  const H = Math.round(maxY - minY);
  const label = esc(ringSemi(groups));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" class="mol" viewBox="${f(minX)} ${f(minY)} ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${label}">` +
    `<g class="bonds" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" fill="none">${lines.join('')}</g>` +
    `<g class="atoms" font-family="Helvetica, Arial, sans-serif" font-size="${fs}" fill="currentColor" text-anchor="middle" dominant-baseline="central">${hits.join('')}${atoms.join('')}</g>` +
    (locs.length ? `<g class="locants" font-family="Helvetica, Arial, sans-serif" font-size="${f(fs * 0.55)}" fill="currentColor" opacity="0.55" text-anchor="middle" dominant-baseline="central">${locs.join('')}</g>` : '') +
    `</svg>`
  );
}
