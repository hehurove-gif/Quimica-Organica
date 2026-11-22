# Revisión de nombres de la tabla de oro (v0.3)

Fecha: 2026-11-21. Alcance: los 118 compuestos de `test/oro.json`, con los tres nombres que genera el sistema (escolar, IUPAC 2013, radicofuncional).

**Quién revisó:** el propio asistente, contra las reglas de nomenclatura (cadena principal, orden alfabético, prioridad de funciones, localizadores) y contra las presentaciones de clase aportadas. **No sustituye la revisión de un profesor de Química**: sigue pendiente y la lista de la sección «Para el profesor» es lo que conviene mostrarle.

## Resultado

- 118 estructuras verificadas con SMILES escritos a mano y fórmula calculada aparte (`tools/check_golden.py`): 0 discrepancias.
- Nombres: se revisaron uno por uno. Sin errores de cadena principal, numeración, orden alfabético ni prioridad de funciones.
- **Una inconsistencia real, corregida:** el sistema quitaba localizadores cuando el nombre corto se leía igual, pero lo hacía a medias:

| Antes | Ahora | Problema |
|---|---|---|
| `2-butinol` | `2-butin-1-ol` | quitaba el 1 del alcohol y dejaba el 2 del triple enlace; `3-buten-1-ol` sí conservaba ambos |
| `butenona` | `3-buten-2-ona` | quitaba ambos localizadores |
| `butanodiona` | `2,3-butanodiona` | `2,4-pentanodiona` sí los conservaba |
| `ácido propenoico` | `ácido 2-propenoico` | `ácido 2-butenoico` y `2-propenal` sí los conservaban |
| `propenoato de metilo` | `2-propenoato de metilo` | igual que el ácido |

Regla nueva (`shortest` en `namer.js`): con enlace múltiple **y** función a la vez, o con varias funciones iguales, se escriben todos los localizadores. Se siguen leyendo las formas cortas (`butenona`, `ácido propenoico`); solo cambia lo que el sistema escribe.

## Los 6 puntos de criterio: decisión tomada y cómo quedó

Estos puntos eran decisiones de criterio, no errores. Sin un profesor a la mano, cada uno se resolvió con la regla escrita más defendible y se dejó una prueba (`test/revision-nombres.test.js`). Si el programa de la asignatura pide otra cosa, cada decisión se puede revertir de forma independiente.

| # | Punto | Decisión | Dónde |
|---|---|---|---|
| 1 | Localizadores omitidos | **Estilo IUPAC 2013** sigue P-14.3.4 (fuente: Libro Azul, cap. P-1): se omiten en cadenas de 1–2 átomos (`metanol`, `etanol`, `eteno`) y en `propeno`; se conservan en `propan-2-ona`, `butan-2-ona`, `propa-1,2-dieno`, `ácido prop-2-enoico`. **Estilo escolar** quita los que sobran cuando no hay duda (`propanona`, `butanona`, `propadieno`). | `shortest` en `namer.js` |
| 2 | Dos estilos | Se mantienen ambos; el principal es el escolar y el IUPAC se muestra siempre que difiera. Los dos se aceptan como entrada. | — |
| 3 | `etanoato` / `acetato` y otros comunes | Ahora, además del nombre sistemático, se muestra el nombre común como equivalencia: «también se llama *acetona*», «*acetato de isopropilo*», «*ácido acético*»… con cualquier radical en los ésteres. | `commonNamesOf` en `lexicon.js` |
| 4 | Aminas (`N-metil-2-propanamina` vs `2-(metilamino)propano`) | El nombre principal sigue siendo el actual; la forma de clase se muestra como equivalencia y siempre se lee de vuelta como la misma molécula. | `aminaComoPrefijoOf` en `namer.js` |
| 5 | Éteres sin localizador (`butoxibutano`) | Se sigue pidiendo el localizador (no se adivina qué molécula quiso decir), pero el mensaje ahora dice qué molécula sería cada opción: «1-butoxibutano (dibutil éter)» o «1-sec-butoxibutano». | `analyze.js` |
| 6 | Orden alfabético | Sin cambios: se acepta, se avisa y se escribe el orden correcto. Queda cubierto por prueba con los dos ejemplos de clase. | — |

### Corrección a una versión anterior de este documento

La primera versión decía que IUPAC 2013 es «más estricto» y pedía `prop-1-eno`. **Era incorrecto:** P-14.3.4.2(d) lista el `propeno` entre los casos en que se omite el localizador. Lo que sí exige conservar son `propan-2-ona`, `butan-2-ona`, `propa-1,2-dieno` y `prop-2-enoic acid` (P-14.3.4.4). El `propino` no aparece en esa lista; se dejó con localizador (`prop-1-ino`) por prudencia y queda marcado para el profesor.

## Qué sigue necesitando a un profesor

1. ¿El programa de bachillerato acepta `propanona`, `butanona` y `propadieno` sin localizador (estilo escolar), o prefiere siempre localizador?
2. `propino`: ¿con o sin localizador en estilo IUPAC? (`prop-1-ino` es lo que genera hoy.)
3. ¿El nombre principal que se muestra debe ser el escolar o el IUPAC 2013?
4. ¿Se enseña la forma `2-(metilamino)propano` o la `N-metil-2-propanamina`? Hoy se muestran las dos.

## Límites de esta revisión

- Sin acceso a un programa oficial de la asignatura ni a un generador de nombres independiente, el oráculo son las reglas escritas y los SMILES a mano; si el criterio escolar difiere de IUPAC en un punto, lo decide el profesor.
- Las presentaciones aportadas no incluyen ejemplos de insaturaciones con función, así que la regla nueva se apoya en IUPAC y en la coherencia interna, no en ellas.
