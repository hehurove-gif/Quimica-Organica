# Resultados de la ejecución del plan de pruebas (v0.2)

Fecha: 2026-11-18 · Comandos: `npm test`, `npm run typecheck`, `python3 tools/check_golden.py`.

## Resumen

| Comprobación | Resultado |
|---|---|
| `npm test` | 70 pruebas: **62 pasan, 0 fallan, 8 `todo`** (familias de la etapa siguiente) |
| `npm run typecheck` | limpio |
| `tools/check_golden.py` (fórmulas calculadas aparte, en Python) | 85 compuestos, 159 nombres, **0 discrepancias** |
| UI en Chrome headless | alqueno+alcohol, ácido, incompleto y fuera de alcance se muestran como se espera (captura revisada a mano) |

## Matriz plan → ejecución

| ID | Estado | Dónde |
|---|---|---|
| T0 regresión v0.1 | ✅ | pruebas previas, ajustadas solo donde una función pasó de «fuera de alcance» a soportada (`propanol`, `2-buteno`, CH₃OH, eteno) |
| T1 SMILES/molécula | ✅ | `smiles.test.js`, `molecule.test.js` |
| T2 parser | ✅ | `parser.test.js`, `funciones.test.js` |
| T3 constructor | ✅ | `funciones.test.js` (omisión de localizadores, errores específicos) |
| T4 nombres | ✅ | `namer-funciones.test.js` (22 estructuras × 2 estilos) |
| T5 casos de oro | ✅ parcial | `oro.test.js` + `test/oro.json`. **Meta del plan (90 / 200) no alcanzada: 85 / 159.** |
| T6 propiedad | ✅ | `propiedad-funciones.test.js`, 3000 moléculas con semilla fija |
| T7 diagnósticos | ✅ parcial | grupo principal, enlaces múltiples, numeración, alfabético; falta un caso por cada criterio de desempate |
| T8 render | ✅ | `render-funciones.test.js` |
| T9 UI | 🟡 | revisada con Chrome headless a mano; **no automatizada** y sin auditoría de errores de consola |
| T10 éteres/ésteres/aminas/amidas | ✅ (`todo`) | `tier2.test.js`: hoy se declaran fuera de alcance; 8 pruebas `todo` visibles |
| T11 constructor visual / «verifica mi respuesta» | 🔲 | siguiente etapa |

## Hallazgos durante la ejecución

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
