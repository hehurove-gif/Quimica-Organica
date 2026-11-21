// @ts-check
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/core/analyze.js';
import { layout } from '../src/core/render.js';

/** Ningún par de átomos queda a menos de 0.55 enlaces (etiquetas encimadas). */
const NOMBRES = [
  '2,5-dimetil-3-secbutoxihexano',
  '2,2,4-trimetilpentano',
  '3-etil-2,2-dimetilpentano',
  '3,3-dietilpentano',
  '2,4-dimetil-3-isopropilpentano',
  '3-etil-6-metil-5-isopentil-4-aminononano',
  '2,2,3,3-tetrametilbutano',
  '3-etil-3-metilhexano',
  'etanoato de isobutilo',
  'N,N-dimetil-2-propanamina',
  '2-bromo-N,N-dimetil-1-propanamina',
];

for (const nombre of NOMBRES) {
  test(`layout sin átomos encimados: ${nombre}`, () => {
    const r = analyze(nombre);
    assert.equal(r.status, 'valido', nombre);
    assert.ok(r.molecule && r.chain);
    const L = 40;
    const pos = layout(r.molecule, r.chain, L);
    const pts = [...pos.values()];
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        assert.ok(Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) >= 0.55 * L, `${nombre}: átomos ${i} y ${j} encimados`);
      }
    }
  });
}
