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

## Para el profesor (decisiones de criterio, no de error)

1. **Localizadores omitidos cuando no hay ambigüedad:** el sistema escribe `propeno`, `propino`, `propadieno`, `butanona`, `propanona`, `metanamina`, pero `1-buteno`, `2-butanol`. IUPAC 2013 es más estricto en algunos de estos (`propa-1,2-dieno`, `prop-1-eno`); los libros de bachillerato suelen escribir la forma corta. ¿Qué exige el programa?
2. **Dos estilos:** escolar (`1-buteno`, `2-propanol`, `1,2-etanodiol`) e IUPAC 2013 (`but-1-eno`, `propan-2-ol`, `etano-1,2-diol`). Se muestran ambos; el principal es el escolar.
3. **`etanoato` / `acetato`:** el nombre principal es el sistemático; `acetato de etilo` se lee y se muestra como equivalencia.
4. **Aminas:** el principal es `N-metil-2-propanamina`; también se ofrecen `N-metilpropan-2-amina` e `isopropilmetilamina`. Las presentaciones usan `2-(metilamino)propano`, que se lee pero no es la forma que se escribe.
5. **Éteres:** `1-butoxibutano` lleva localizador (clase escribe `butoxibutano`); con `1-` y `2-` son moléculas distintas, así que sin localizador se pide completarlo.
6. **Orden alfabético:** algunos ejemplos de clase no lo respetan (`2,4-dimetil-2-aminohexano`); el sistema los acepta, avisa y escribe el orden correcto.

## Límites de esta revisión

- Sin acceso a un programa oficial de la asignatura ni a un generador de nombres independiente, el oráculo son las reglas escritas y los SMILES a mano; si el criterio escolar difiere de IUPAC en un punto, lo decide el profesor.
- Las presentaciones aportadas no incluyen ejemplos de insaturaciones con función, así que la regla nueva se apoya en IUPAC y en la coherencia interna, no en ellas.
