# Plan de pruebas — v0.2 (módulos de funciones orgánicas)

**Alcance de esta etapa:** alquenos, alquinos, alcoholes, aldehídos, cetonas y ácidos carboxílicos (monofuncionales y con prefijos `hidroxi`/`oxo`), más las herramientas que las verifican (lector/escritor SMILES, casos de oro).
**Siguiente etapa (planeada, ver T10):** éteres, ésteres, aminas, amidas; constructor visual y modo «verifica mi respuesta» (T11).

## 1. Principios

1. **Conectividad, no apariencia.** Se compara el grafo (clave canónica), nunca coordenadas ni dibujo.
2. **Tres comprobaciones independientes por caso de oro:** (a) la fórmula declarada a mano, (b) la fórmula calculada por un script de Python distinto del código (`tools/check_golden.py`) a partir del SMILES, (c) la fórmula y el grafo que produce el núcleo a partir del nombre.
3. **Nunca estructura inventada.** Toda entrada no válida, incompleta, ambigua o fuera de alcance debe devolver estado ≠ `valido` y `molecule = null`.
4. **Ida y vuelta.** estructura → nombre → estructura debe reconstruir el mismo grafo; y nombre → estructura → nombre debe ser idempotente.
5. **No se degradan pruebas** para obtener verde (regla del repo).

## 2. Limitación del oráculo (declarada)

No hay RDKit ni OPSIN disponibles en este entorno (sin red). Los SMILES y nombres de los casos de oro los escribió el asistente a partir de conocimiento químico y **no están revisados por un profesor**. Las tres comprobaciones detectan inconsistencias internas, pero no un error que se repita en las tres. **Criterio de salida pendiente:** revisión humana de la tabla (`test/golden.js`) antes de dar por buena la cobertura.

## 3. Convenciones de nomenclatura bajo prueba

- **Entrada generosa:** estilo escolar (`2-buteno`, `2-propanol`, `4-penten-2-ol`, `1,3-butadieno`) **y** estilo IUPAC 2013 (`but-2-eno`, `propan-2-ol`, `pent-4-en-2-ol`, `buta-1,3-dieno`, `propano-1,2-diol`).
- **Salida:** estilo escolar.
- **Selección de cadena (IUPAC 1979, el que se enseña):** (1) más grupos funcionales principales; (2) más enlaces múltiples; (3) más larga; (4) más sustituyentes.
- **Numeración:** localizadores más bajos para (1) grupo principal, (2) enlaces múltiples, (3) prefijos en conjunto, (4) el primero alfabético.
- **Prioridad de grupos:** ácido > aldehído > cetona > alcohol. Los de menor prioridad pasan a prefijos (`hidroxi`, `oxo`).
- **Localizadores omitidos:** se omiten solo cuando no hay ambigüedad (principio comprobable: re-leer el nombre sin ellos debe dar la misma molécula).

## 4. Matriz de pruebas

Estado: ✅ implementado y ejecutado · ⏳ pendiente (prueba escrita como `todo`) · 🔲 sin escribir.

| ID | Módulo | Objetivo | Casos | Oráculo | Estado |
|---|---|---|---|---|---|
| T0 | Regresión v0.1 | Nada de lo anterior se rompe | 40 pruebas existentes | pruebas previas | ⏳ |
| T1 | `smiles.js`, `molecule.js` | Lector/escritor SMILES acíclico; valencias de O; órdenes de enlace en la clave canónica | ida y vuelta SMILES↔grafo; `C=C`≠`C-C`; `CC(=O)O` | grafo | ⏳ |
| T2 | `parser.js` | Gramática de alquenos/alquinos/alcoholes/aldehídos/cetonas/ácidos en ambos estilos | ≥ 60 nombres válidos; prefijos incompletos para cada sufijo; fuera de alcance solo para tier 2 | estados | ⏳ |
| T3 | `build.js` | Semántica de localizadores, multiplicadores, cetona terminal, rangos, valencias, ambigüedad con localizadores omitidos de enlace/sufijo | errores con mensaje específico; `butanona` ✓ / `pentanona` incompleto | grafo | ⏳ |
| T4 | `namer.js` | Reglas de cadena, numeración, prefijos funcionales, omisión de localizadores, dienos, dioles, ácidos | ≥ 40 casos con nombre canónico esperado | tabla de oro | ⏳ |
| T5 | Casos de oro | Nombre ↔ SMILES ↔ fórmula, con variantes de escritura | ≥ 90 compuestos; ≥ 200 nombres | declarada + Python + núcleo | ⏳ |
| T6 | Propiedad | 3000 moléculas aleatorias con funciones: nombre → parser → mismo grafo; nombrar es idempotente | generador con semilla fija | propiedad | ⏳ |
| T7 | Diagnósticos | Cada criterio de numeración/cadena tiene un mensaje propio | grupo principal, enlace múltiple, prefijos, alfabético, cadena | casos manuales | ⏳ |
| T8 | `render.js` | Enlaces dobles/triples, etiquetas `OH`/`HO`, `CHO`, `COOH`, `CO`; sin solapamiento | texto semidesarrollado exacto + geometría | texto esperado | ⏳ |
| T9 | UI | Estados visibles, ejemplos, resaltado cruzado, sin errores de consola | Chrome headless, volcado del DOM | DOM | ⏳ |
| T10 | Éteres, ésteres, aminas, amidas | Cobertura de familias restantes | casos listados abajo | — | ⏳ (todo) |
| T11 | Constructor visual / «verifica mi respuesta» | Edición ↔ modelo ↔ nombre | — | — | 🔲 |

### Casos reservados para T10 (escritos como `todo`)

`metoxietano`, `etoxipropano`, `etanoato de metilo`, `propanoato de etilo`, `metilamina`, `1-propanamina`, `etanamida`, `N-metiletanamida`, `ácido 2-aminopropanoico`.

## 5. Criterios de entrada y salida

- **Entrada:** módulo implementado con su sección de pruebas escrita **antes** de dar el módulo por terminado.
- **Salida de la etapa:** T0–T9 en verde, `npm run typecheck` limpio, T10 en estado `todo` explícito (no oculto), documento de resultados (`docs/resultados-pruebas.md`) con la matriz real de lo ejecutado.
- **Regla de commits:** un commit por módulo + pruebas.
