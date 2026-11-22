# Resultados de la ejecución del plan de pruebas (v0.3)

Fecha: 2026-11-21 (v0.2: 2026-11-18) · Comandos: `npm test`, `npm run typecheck`, `python3 tools/check_golden.py`.

## Resumen

| Comprobación | Resultado |
|---|---|
| `npm test` | 370 pruebas: **370 pasan, 0 fallan, 0 `todo`** (incluye aromáticos, propiedad con semilla fija y cobertura del plan de Química III) |
| `npm run typecheck` | limpio |
| `tools/check_golden.py` (fórmulas calculadas aparte, en Python) | 118 compuestos / 223 nombres + 46 aromáticos / 74 nombres, **0 discrepancias** |
| UI en Chrome headless | alqueno+alcohol, ácido, incompleto y fuera de alcance se muestran como se espera (captura revisada a mano) |

## Matriz plan → ejecución

| ID | Estado | Dónde |
|---|---|---|
| T0 regresión v0.1 | ✅ | pruebas previas, ajustadas solo donde una función pasó de «fuera de alcance» a soportada (`propanol`, `2-buteno`, CH₃OH, eteno) |
| T1 SMILES/molécula | ✅ | `smiles.test.js`, `molecule.test.js` |
| T2 parser | ✅ | `parser.test.js`, `funciones.test.js` |
| T3 constructor | ✅ | `funciones.test.js` (omisión de localizadores, errores específicos) |
| T4 nombres | ✅ | `namer-funciones.test.js` (22 estructuras × 2 estilos) |
| T5 casos de oro | ✅ | `oro.test.js` + `test/oro.json`. Meta del plan (90 / 200) alcanzada: **115 / 215** (30 compuestos nuevos de T10). |
| T6 propiedad | ✅ | `propiedad-funciones.test.js`, 3000 moléculas con semilla fija |
| T7 diagnósticos | ✅ parcial | grupo principal, enlaces múltiples, numeración, alfabético; falta un caso por cada criterio de desempate |
| T8 render | ✅ | `render-funciones.test.js` |
| T9 UI | 🟡 | revisada con Chrome headless a mano; **no automatizada** y sin auditoría de errores de consola |
| T10 éteres/ésteres/aminas/amidas | ✅ | `build-t10.test.js` (36), `explain-t10.test.js` (33), `namer-t10.test.js` (40), `render-t10.test.js` (35), `tier2.test.js` (8, antes `todo`) |
| T11 constructor visual / «verifica mi respuesta» | ✅ | `construct.test.js` (26), `construct-ring.test.js` (5); UI con `tools/smoke-ui.mjs` |
| T12 benceno y derivados (plan Química III) | ✅ | `molecule-ring.test.js`, `aromatic-build.test.js` (26), `aromatic-name.test.js` (incluye ida y vuelta exhaustiva), `aromatic-analyze.test.js`, `plan-quimica-iii.test.js`, `oro-aromaticos.test.js` (46 compuestos / 74 nombres), `aromatic-propiedad.test.js` (4000 anillos al azar ×2, 12 simetrías, constructor, fuzz de entradas) |

## Hallazgos durante la ejecución

### T10 (v0.3)

- **Regresión propia, corregida:** al rechazar `0` como localizador en el parser (para no confundirlo con `N`) rompí `0-bromohexano`, que debe dar «el localizador 0 no existe». `N` ahora es el valor interno −1.
- **Error previo de las explicaciones:** el conteo de carbonos de un radical ramificado usaba solo su cadena base («isobutil: 3 carbonos»; son 4). Corregido para todos los radicales.
- **Cinco pruebas antiguas** afirmaban «fuera de alcance» para éteres, ésteres, aminas y amidas. Se reescribieron con casos que siguen sin soporte (nitrilos, tioles, anhídridos, urea, ciclos, imidas, peróxidos); ninguna aserción se relajó.
- **Colisión de dibujo (corregida):** en moléculas muy ramificadas (p. ej. `2,5-dimetil-3-secbutoxihexano`) un radical grande de C3 se encimaba con el metilo de C5. El layout ahora detecta átomos a menos de 0.55 enlaces y prueba a girar el lado de cada rama (hasta 2¹⁰ combinaciones); lo cubre `test/render-layout.test.js`.
- **Contradicciones entre las presentaciones de clase y el sistema (a revisar con el profesor):**
  1. Las aminas secundarias y terciarias se nombran en clase `2-(metilamino)propano` / `1-(etilmetilamino)butano` (amino sustituido como prefijo). **Resuelto:** ya se leen (`test/nsub-t10.test.js`) y también se generan como prefijo, p. ej. `ácido 2-(metilamino)propanoico`; para una amina simple el sistema devuelve la forma `N-metil-2-propanamina`.
  2. Varios ejemplos de clase no respetan el orden alfabético de los prefijos (`2,4-dimetil-2-aminohexano`, `4-etil-2,2-dimetil-3-bromohexano`, `3-etil-6-metil-5-isopentil-4-aminononano`); el sistema los marca con aviso y propone el orden correcto.
  3. `BUTOXIBUTANO` se escribe sin localizador en clase; aquí es incompleto (`1-` o `2-butoxibutano` son moléculas distintas).
  4. Las amidas aparecen como `butanoamida`; se leen, pero el nombre que se genera es `butanamida`.
  5. `acetato de isopropilo` y demás ésteres con acilo común (acetato, formiato, propionato, butirato) + cualquier radical: **resuelto** (`test/esteres-comunes-t10.test.js`). Las sales orgánicas (`acetato de sodio`, `propanoato de potasio`) siguen sin soporte: el modelo no tiene iones, y el sistema lo declara `fuera_de_alcance` en vez de dibujar un éster.

- **Revisión de nombres (21-nov):** se revisaron los 118 compuestos; la única inconsistencia real era la omisión de localizadores con enlace múltiple + función (`2-butinol`, `butenona`, `butanodiona`, `ácido propenoico`). Corregida; detalle y puntos para el profesor en `docs/revision-de-nombres.md`.

### v0.2

- Dos pruebas mías estaban mal y las corrigió el sistema: `2,2,2-tribromoetanol` sí es válido (el carbono 2 completa sus 4 enlaces), y `propenal` sin localizador es ambiguo porque `O=C=C-C` cumple valencias.
- Se detectó y se cerró un hueco: un carbono con `=O` y dos `OH` (ácido carbónico) se nombraba como ácido metanoico y perdía un oxígeno. Ahora se declara fuera de alcance.
- Mientras se elegía cadena, una cadena candidata con un enlace múltiple fuera se descartaba pero también ocultaba el límite de 10 carbonos; se separó el error «inviable» del «no soportado».

## Decisiones abiertas (conviene que las revise un docente)

1. **Localizadores omitidos.** Se aceptan solo si todas las posiciones posibles dan la misma molécula (`butanona` sí; `propanol`, `buteno` no). `2-bromoetanol` se usa en la práctica pero hay dos moléculas posibles, así que el sistema pide `2-bromo-1-etanol`.
2. **Con sustituyentes se conservan todos los localizadores** al generar el nombre (`3-bromo-2-pentanona`).
3. **Selección de cadena IUPAC 1979** (grupo principal > enlaces múltiples > longitud > sustituyentes). IUPAC 2013 prioriza la longitud; sale distinto en casos raros.
4. Eninos (doble y triple en la misma cadena), radicales con enlaces múltiples o con funciones, y varios grupos principales en ramas distintas: fuera de alcance.

## Limitación del oráculo

No hay RDKit ni OPSIN en el entorno. La tabla de oro la escribí yo; el verificador en Python solo comprueba la fórmula a partir del SMILES, **no los nombres**. La corrección de los nombres de la tabla necesita revisión docente.
