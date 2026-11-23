// @ts-check
/**
 * Cobertura mínima exigida por el plan de estudios escolar (Química III): todos los nombres de
 * compuestos orgánicos (estructuras) que menciona deben leerse, dibujarse y nombrarse.
 * Las reacciones no entran en el plan ni en el proyecto. Lo que sigue sin soporte se declara
 * (`BRECHAS`) y se verifica que el sistema lo diga en lugar de inventar una estructura.
 * Ver docs/cobertura-plan-quimica-iii.md.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze } from '../src/core/analyze.js';

const CASOS = {
 'Alcanos (práctica 1: metano, halogenación, oxidación parcial, combustión)': ['metano','clorometano','diclorometano','triclorometano','tetraclorometano','bromometano','metanol','metanal','ácido metanoico','etano','cloroetano','bromoetano','propano','2-cloropropano','butano','2-metilpropano','pentano','2,2-dimetilpropano','hexano','heptano','octano','nonano','decano'],
 'Alquenos (eteno por deshidratación de etanol, halogenación, oxidación parcial)': ['eteno','propeno','1-buteno','2-buteno','2-metilpropeno','1,2-dibromoetano','1,2-dicloroetano','etanol','etilenglicol','1,2-etanodiol','1-penteno','2-penteno','1,3-butadieno','1-cloroetano','cloroeteno','bromoeteno','tetrafluoroeteno','2-bromopropano'],
 'Alquinos (etino/acetileno, halogenación, oxidación parcial)': ['etino','acetileno','propino','1-butino','2-butino','1,2-dibromoeteno','1,1,2,2-tetrabromoetano','1,1,2,2-tetracloroetano','etanal','ácido etanoico','ácido etanodioico','etanodial'],
 'Oxigenados (oxidación de alcohol, esterificación, hidrólisis)': ['metanol','etanol','1-propanol','2-propanol','1-butanol','2-butanol','2-metil-2-propanol','1,2,3-propanotriol','etanal','propanal','butanal','propanona','butanona','ácido etanoico','ácido propanoico','ácido butanoico','ácido metanoico','etanoato de etilo','etanoato de metilo','propanoato de metilo','metanoato de etilo','butanoato de etilo','etoxietano','metoxietano','ácido hexadecanoico','ácido octadecanoico','ácido 9-octadecenoico','etanoato de pentilo','etanoato de octilo'],
 'Descarboxilación/otras obtenciones': ['ácido etanoico','metano','ácido propanoico','etano'],
 'Benceno y derivados (RAP 2)': ['benceno','bromobenceno','clorobenceno','nitrobenceno','metilbenceno','tolueno','etilbenceno','fenol','anilina','ácido benzoico','benzaldehído','ácido bencenosulfónico','1,2-dibromobenceno','1,4-diclorobenceno','1,3-dinitrobenceno','o-xileno','1,3,5-trimetilbenceno','2,4,6-trinitrotolueno','p-nitrotolueno','ácido 2-hidroxibenzoico','estireno','vinilbenceno','catecol','resorcinol','hidroquinona','ácido ftálico','ácido tereftálico','ácido p-toluensulfónico','1,4-diaminobenceno'],
 'Glicerol (producto de la saponificación)': ['1,2,3-propanotriol','propano-1,2,3-triol'],
 };

for (const [tema, nombres] of Object.entries(CASOS)) {
  test(`plan Química III — ${tema}`, () => {
    for (const n of nombres) {
      const a = analyze(n);
      assert.equal(a.status, 'valido', `${n}: ${a.status} ${a.errors.map((e) => e.message).join(' ')}`);
      assert.ok(a.molecule && a.formula, n);
      assert.deepEqual(a.molecule.validate(), [], n);
      assert.ok(a.semidesarrollada, n);
    }
  });
}

/** Casos del plan que el proyecto todavía no cubre: nunca se inventa una estructura. */
const BRECHAS = [
  'estearato de sodio', 'octadecanoato de sodio', // sales (jabones): requieren modelo iónico
  'polietileno', 'poli(eteno)', 'policloruro de vinilo', 'cloruro de vinilo', // polímeros y radical vinilo
  'dióxido de carbono', // inorgánico (producto de la combustión): fuera del proyecto
  'propanotriol', // sin localizadores hay más de una estructura
];
test('plan Química III — brechas documentadas: se dicen, no se inventan', () => {
  for (const n of BRECHAS) {
    const a = analyze(n);
    assert.notEqual(a.status, 'valido', n);
    assert.equal(a.molecule, null, n);
  }
});
