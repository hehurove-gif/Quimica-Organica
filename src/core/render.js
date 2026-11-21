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
 * Heteroátomos "con cola": un O con dos enlaces (éter/éster) o un N con más de uno (amina
 * sustituida, amida sustituida). Se escriben como grupos aparte (R–O–R′, R–NH–R′), no compactos.
 * @param {Molecule} mol
 * @param {number} id
 * @param {number[]} exclude
 * @returns {number[]}
 */
function heteroKids(mol, id, exclude) {
  return mol.neighbors(id)
    .filter((nb) => !exclude.includes(nb.id))
    .filter((nb) => {
      const el = mol.element(nb.id);
      return (el === 'O' || el === 'N') && mol.neighbors(nb.id).length > 1;
    })
    .map((nb) => nb.id);
}

/**
 * Texto lineal de un sustituyente que cuelga de `parent` por el átomo `id` (carbono, halógeno, O o N):
 * "CH(CH₃)–CH₃", "OCH₃", "NH₂", "NHCH₃", "N(CH₃)CH₃".
 * @param {Molecule} mol
 * @param {number} id
 * @param {number} parent
 * @returns {string}
 */
function subText(mol, id, parent) {
  const el = mol.element(id);
  if (el === 'C') return branchText(mol, id, parent);
  if (HALOGENS.includes(el)) return el;
  const kids = mol.neighbors(id).map((n) => n.id).filter((k) => k !== parent);
  if (el === 'O') return kids.length ? `O${subText(mol, kids[0], id)}` : 'OH';
  const h = mol.implicitH(id);
  const head = `N${h ? `H${sub(h)}` : ''}`;
  const texts = kids.map((k) => subText(mol, k, id));
  if (texts.length === 0) return head;
  if (texts.length === 1) return `${head}${texts[0]}`;
  return `${head}(${texts[0]})${texts[1]}`;
}

/**
 * Texto de un carbono con sus hidrógenos, halógenos y heteroátomos "compactos":
 * CH₂, CHBr₂, CCl₃, CH₂OH, CH(OH), CH₂NH₂, C(=O), CHO, COOH, CONH₂.
 * @param {Molecule} mol
 * @param {number} id
 * @param {number[]} skip vecinos que no se escriben aquí (cadena / padre / ramas de carbono)
 * @param {'start' | 'end' | 'inner'} [where] posición en la línea (para escribir HO– / –OH)
 */
function carbonText(mol, id, skip, where = 'inner') {
  const h = mol.implicitH(id);
  /** @type {Record<string, number>} */
  const halos = {};
  let oxo = 0;
  let oh = 0;
  let nh2 = 0;
  for (const nb of mol.neighbors(id)) {
    if (skip.includes(nb.id)) continue;
    const el = mol.element(nb.id);
    const deg = mol.neighbors(nb.id).length;
    if (HALOGENS.includes(el)) halos[el] = (halos[el] || 0) + 1;
    else if (el === 'O') {
      if (deg > 1) continue; // éter/éster: se escribe aparte (heteroKids)
      if (nb.order === 2) oxo++;
      else oh++;
    } else if (el === 'N') {
      if (deg > 1) continue; // N sustituido: se escribe aparte
      nh2++;
    }
  }
  const hText = h ? `H${sub(h)}` : '';
  const xText = Object.keys(halos)
    .sort()
    .map((el) => `${el}${sub(halos[el])}`)
    .join('');
  const carbonNbrs = mol.neighbors(id).filter((x) => mol.element(x.id) === 'C').length;
  if (oxo === 1 && oh === 1 && !xText) return h ? 'HCOOH' : where === 'start' ? 'HOOC' : 'COOH'; // ácido carboxílico
  if (oxo === 1 && oh === 0 && !xText && carbonNbrs <= 1 && nh2 === 0) {
    if (h === 1) return where === 'start' ? 'OHC' : 'CHO'; // aldehído
    if (h === 2) return 'HCHO'; // metanal
  }
  if (oxo === 1 && nh2 === 1 && oh === 0 && !xText && carbonNbrs <= 1) {
    return where === 'start' ? 'H₂NOC' : `${h ? 'H' : ''}CONH₂`; // amida primaria
  }
  let t = `C${hText}${xText}`;
  if (oxo) t += oxo === 1 ? '(=O)' : `(=O)${sub(oxo)}`;
  if (oh) {
    const single = oh === 1;
    if (where === 'start' && single) t = `HO${t}`;
    else if (where === 'end' && single) t += 'OH';
    else t += single ? '(OH)' : `(OH)${sub(oh)}`;
  }
  if (nh2) {
    const single = nh2 === 1 && !oh;
    if (where === 'start' && single) t = `H₂N${t}`;
    else if (where === 'end' && single) t += 'NH₂';
    else t += nh2 === 1 ? '(NH₂)' : `(NH₂)${sub(nh2)}`;
  }
  return t;
}

/**
 * Rama de carbono escrita de forma lineal: "CH(CH₃)–CH₃".
 * @param {Molecule} mol
 * @param {number} id
 * @param {number} parent
 * @returns {string}
 */
function branchText(mol, id, parent) {
  const carbons = mol.neighbors(id).map((n) => n.id).filter((k) => k !== parent && mol.element(k) === 'C');
  const hetero = heteroKids(mol, id, [parent]);
  const kids = [...carbons, ...hetero];
  const base = carbonText(mol, id, [parent, ...kids], kids.length ? 'inner' : 'end');
  if (kids.length === 0) return base;
  const parts = kids.map((k) => subText(mol, k, id));
  const last = parts.pop();
  return `${base}${parts.map((p) => `(${p})`).join('')}–${last}`;
}

/**
 * Igual que `branchText`, pero escrito «al revés»: el carbono de unión queda a la derecha, para
 * los radicales que se dibujan a la izquierda del grupo (CH₃–CH₂–O–…, CH₃–CH(CH₃)–OOC–…).
 * @param {Molecule} mol
 * @param {number} id
 * @param {number} parent
 * @returns {string}
 */
function branchTextRev(mol, id, parent) {
  const carbons = mol.neighbors(id).map((n) => n.id).filter((k) => k !== parent && mol.element(k) === 'C');
  const hetero = heteroKids(mol, id, [parent]);
  const kids = [...carbons, ...hetero];
  const base = carbonText(mol, id, [parent, ...kids], kids.length ? 'inner' : 'end');
  if (kids.length === 0) return base;
  const through = /** @type {number} */ (kids[kids.length - 1]);
  const rest = kids.slice(0, -1).map((k) => `(${subText(mol, k, id)})`).join('');
  const head = mol.element(through) === 'C' ? branchTextRev(mol, through, id) : subText(mol, through, id);
  return `${head}–${base}${rest}`;
}

/**
 * Tiras de CH₂ "puros" (interiores, sin sustituyentes, enlaces sencillos) de 5 o más carbonos.
 * Se comprimen como CH₂–(CH₂)ₖ–CH₂: la tira [start..end] conserva sus dos extremos.
 * @param {Molecule} mol
 * @param {number[]} chain
 * @returns {{ start: number, end: number }[]}
 */
export function compressibleRuns(mol, chain) {
  const n = chain.length;
  /** @param {number} i */
  const plain = (i) => {
    if (i <= 0 || i >= n - 1) return false;
    const id = chain[i];
    const others = mol.neighbors(id).filter((x) => x.id !== chain[i - 1] && x.id !== chain[i + 1]);
    const orderTo = (/** @type {number} */ k) => mol.neighbors(id).find((x) => x.id === chain[k])?.order ?? 1;
    return others.length === 0 && mol.implicitH(id) === 2 && orderTo(i - 1) === 1 && orderTo(i + 1) === 1;
  };
  /** @type {{ start: number, end: number }[]} */
  const runs = [];
  for (let i = 0; i < n; i++) {
    if (!plain(i)) continue;
    let j = i;
    while (j + 1 < n && plain(j + 1)) j++;
    if (j - i + 1 >= 5) runs.push({ start: i, end: j });
    i = j;
  }
  return runs;
}

/**
 * Carbono de un extremo de la cadena con un único éter/éster/amina/amida sustituido.
 * Al inicio se escribe «al revés» para leerse de izquierda a derecha: CH₃–O–CH₂–…, CH₃–NH–CO–…
 * @param {Molecule} mol
 * @param {number} id carbono de la cadena
 * @param {number} h heteroátomo (O con dos enlaces o N sustituido)
 * @param {boolean} atStart el carbono es C1 (a la izquierda)
 * @returns {string}
 */
function terminalHetero(mol, id, h, atStart) {
  const el = mol.element(h);
  // al inicio el radical «de paso» se escribe al revés (el carbono de unión queda junto al grupo)
  const kidIds = mol.neighbors(h).map((x) => x.id).filter((k) => k !== id);
  const kids = kidIds.map((k, j) => (atStart && j === kidIds.length - 1 && mol.element(k) === 'C' ? branchTextRev(mol, k, h) : subText(mol, k, h)));
  const carbonyl = mol.neighbors(id).some((nb) => nb.order === 2 && mol.element(nb.id) === 'O');
  const hasH = mol.implicitH(id) > 0 ? 'H' : '';
  if (el === 'O') {
    const r = kids[0];
    if (carbonyl) return atStart ? `${r}–OOC` : `${hasH}COO–${r}`; // éster
    const c = carbonText(mol, id, [h], atStart ? 'start' : 'end');
    return atStart ? `${r}–O–${c}` : `${c}–O–${r}`;
  }
  // nitrógeno con uno o dos radicales: NH–R  /  N(R)–R′
  const nPart = kids.length === 1 ? 'NH' : `N(${kids[0]})`;
  const tail = kids.length === 1 ? kids[0] : kids[1];
  const c = carbonyl ? 'CO' : carbonText(mol, id, [h], atStart ? 'start' : 'end');
  if (atStart) return `${tail}–${nPart}–${c}`;
  return carbonyl ? `${hasH}CO${nPart}–${tail}` : `${c}–${nPart}–${tail}`;
}

/**
 * Fórmula semidesarrollada en una línea, siguiendo la cadena dada.
 * @param {Molecule} mol
 * @param {number[]} chain
 * @param {{ compress?: boolean }} [opts] compress: escribe las tiras largas de CH₂ como (CH₂)ₙ
 *   dejando un CH₂ a cada lado: CH₂–(CH₂)₅–CH₂
 * @returns {string}
 */
export function semidesarrollada(mol, chain, opts = {}) {
  const n = chain.length;
  /** @param {number} a @param {number} b */
  const joint = (a, b) => {
    const o = mol.neighbors(a).find((x) => x.id === b)?.order ?? 1;
    return o === 3 ? '≡' : o === 2 ? '=' : '–';
  };
  /** @type {string[]} */
  const parts = [];
  chain.forEach((id, i) => {
    const prev = chain[i - 1];
    const next = chain[i + 1];
    const others = mol.neighbors(id).map((x) => x.id).filter((x) => x !== prev && x !== next);
    const carbonBranches = others.filter((x) => mol.element(x) === 'C');
    const halos = others.filter((x) => HALOGENS.includes(mol.element(x)));
    const hetero = heteroKids(mol, id, [prev, next]);
    const isEnd = n > 1 && (i === 0 || i === n - 1);
    const where = n === 1 ? 'end' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'inner';
    const atStart = i === 0 && n > 1;
    if ((isEnd || n === 1) && hetero.length === 1 && carbonBranches.length === 0 && halos.length === 0) {
      // éter, éster, amina o amida sustituida en un extremo: R–O–CH₂–… / …–CH₂–NH–R / …–COO–R
      parts[i] = terminalHetero(mol, id, hetero[0], atStart);
    } else if (isEnd && carbonBranches.length === 0 && halos.length === 1 && others.length === 1) {
      const x = mol.element(halos[0]);
      const c = carbonText(mol, id, halos);
      parts[i] = i === 0 ? `${x}–${c}` : `${c}–${x}`;
    } else {
      const base = carbonText(mol, id, [...carbonBranches, ...hetero], where);
      parts[i] = base
        + carbonBranches.map((b) => `(${branchText(mol, b, id)})`).join('')
        + hetero.map((h) => `(${subText(mol, h, id)})`).join('');
    }
  });
  const runs = opts.compress ? compressibleRuns(mol, chain) : [];
  let out = '';
  for (let i = 0; i < n; i++) {
    const r = runs.find((x) => x.start === i);
    if (r) {
      // CH₂–(CH₂)ₖ–CH₂, con k = largo − 2
      out += `${i ? '–' : ''}${parts[i]}–(${parts[i + 1]})${sub(r.end - r.start - 1)}–${parts[r.end]}`;
      i = r.end;
      continue;
    }
    out += (i ? joint(chain[i - 1], chain[i]) : '') + parts[i];
  }
  return out;
}

/* ------------------------------ SVG ------------------------------ */

/**
 * @typedef {{ x: number, y: number }} Pt
 * @typedef {{ bond?: number, fontSize?: number, locants?: boolean, compress?: boolean }} RenderOptions
 */

/** @param {string} s */
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Posiciones 2D de todos los átomos.
 * @param {Molecule} mol
 * @param {number[]} chain
 * @param {number} L longitud de enlace
 * @param {Set<number>} [hidden] átomos que no se dibujan (tira comprimida)
 * @returns {Map<number, Pt>}
 */
export function layout(mol, chain, L, hidden = new Set()) {
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
    const subs = mol.neighbors(id).map((x) => x.id).filter((x) => x !== prev && x !== next && !hidden.has(x));
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
  const h = mol.implicitH(id);
  if (el !== 'C' && h === 0) return [{ t: el, sub: false }];
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
    out.push({ t: el, sub: false });
  } else {
    out.push({ t: el, sub: false });
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
  const L = opts.bond ?? 68;
  const fs = opts.fontSize ?? 20;
  // tira comprimida: se dibuja CH₂ – (CH₂)ₖ – CH₂ con un solo nodo para los k carbonos centrales
  const runs = opts.compress ? compressibleRuns(mol, chain) : [];
  /** @type {Set<number>} */
  const hidden = new Set();
  /** @type {Map<number, number>} átomo oculto -> nodo que lo representa */
  const repOf = new Map();
  /** @type {Map<number, { k: number, from: number, to: number }>} */
  const collapsed = new Map();
  /** @type {number[]} */
  const display = [];
  /** @type {number[]} posición real (1..n) de cada elemento mostrado */
  const trueIdx = [];
  for (let i = 0; i < chain.length; i++) {
    const r = runs.find((x) => x.start === i);
    if (!r) {
      display.push(chain[i]);
      trueIdx.push(i + 1);
      continue;
    }
    const rep = chain[r.start + 1];
    display.push(chain[r.start], rep, chain[r.end]);
    trueIdx.push(r.start + 1, r.start + 2, r.end + 1);
    collapsed.set(rep, { k: r.end - r.start - 1, from: r.start + 2, to: r.end });
    repOf.set(rep, rep);
    for (let m = r.start + 2; m < r.end; m++) {
      hidden.add(chain[m]);
      repOf.set(chain[m], rep);
    }
    i = r.end;
  }
  const pos = layout(mol, display, L, hidden);
  const shown = mol.atoms.filter((a) => !hidden.has(a.id));
  const labels = new Map(shown.map((a) => [a.id, atomLabel(mol, a.id, pos)]));
  for (const [rep, c] of collapsed) {
    labels.set(rep, [
      { t: '(CH', sub: false }, { t: '2', sub: true }, { t: ')', sub: false }, { t: String(c.k), sub: true },
    ]);
  }
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
    const hw = width(id) / 2 + 2;
    const hh = h / 2 + 2;
    const tx = Math.abs(ux) > 1e-6 ? hw / Math.abs(ux) : Infinity;
    const ty = Math.abs(uy) > 1e-6 ? hh / Math.abs(uy) : Infinity;
    return Math.min(tx, ty);
  };

  const f = (/** @type {number} */ v) => v.toFixed(1);
  /** @type {string[]} */
  const lines = [];
  for (const b0 of mol.bonds) {
    const b = { a: repOf.get(b0.a) ?? b0.a, b: repOf.get(b0.b) ?? b0.b, order: b0.order };
    if (b.a === b.b) continue; // enlace interno de la tira comprimida
    const pa = /** @type {Pt} */ (pos.get(b.a));
    const pb = /** @type {Pt} */ (pos.get(b.b));
    const len = Math.hypot(pb.x - pa.x, pb.y - pa.y) || 1;
    const ux = (pb.x - pa.x) / len;
    const uy = (pb.y - pa.y) / len;
    const ta = trim(b.a, ux, uy);
    const tb = trim(b.b, ux, uy);
    const offsets = b.order === 3 ? [-3.6, 0, 3.6] : b.order === 2 ? [-2.6, 2.6] : [0];
    for (const o of offsets) {
      const ox = -uy * o;
      const oy = ux * o;
      lines.push(
        `<line data-bond="${b.a}-${b.b}" x1="${f(pa.x + ux * ta + ox)}" y1="${f(pa.y + uy * ta + oy)}" x2="${f(pb.x - ux * tb + ox)}" y2="${f(pb.y - uy * tb + oy)}"/>`,
      );
    }
  }

  /** @type {string[]} */
  const atoms = [];
  for (const a of shown) {
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
    display.forEach((id, i) => {
      const p = /** @type {Pt} */ (pos.get(id));
      const inward = i % 2 === 0 ? 1 : -1;
      const c = collapsed.get(id);
      const text = c ? `${c.from}–${c.to}` : String(trueIdx[i]);
      locs.push(`<text class="locant" x="${f(p.x)}" y="${f(p.y + inward * (h / 2 + 12))}">${text}</text>`);
    });
  }

  const label = esc(semidesarrollada(mol, chain, { compress: opts.compress }));
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" class="mol" viewBox="${f(minX)} ${f(minY)} ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${label}">` +
    `<g class="bonds" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" fill="none">${lines.join('')}</g>` +
    `<g class="atoms" font-family="Helvetica, Arial, sans-serif" font-size="${fs}" fill="currentColor" text-anchor="middle" dominant-baseline="central">${atoms.join('')}</g>` +
    (locs.length ? `<g class="locants" font-family="Helvetica, Arial, sans-serif" font-size="${f(fs * 0.55)}" fill="currentColor" opacity="0.55" text-anchor="middle" dominant-baseline="central">${locs.join('')}</g>` : '') +
    `</svg>`
  );
}
