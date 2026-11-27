# Arquitectura (v0.1)

Sin dependencias de ejecución. JavaScript moderno con tipos en JSDoc (`npm run typecheck`). Los mismos módulos corren en Node (pruebas) y en el navegador (interfaz) sin paso de compilación.

```
texto ──► parser.js ──► AST ──► build.js ──► Molecule ──► namer.js ──► nombre canónico + diagnósticos
 (peg.js)  (gramática)         (química)    (molecule.js)             render.js ──► texto / SVG
                                                                      explain.js ──► pasos
                          analyze.js une todo y devuelve un único objeto de análisis
```

| Módulo | Responsabilidad |
|---|---|
| `src/core/molecule.js` | Grafo de átomos/enlaces, H implícitos, valencias, fórmula, clave canónica (árboles). Independiente de cualquier editor. |
| `src/core/peg.js` | Mini biblioteca PEG. El estado *incompleto* sale de que el fallo ocurra al final del texto. |
| `src/core/lexicon.js` | Raíces, multiplicadores, halógenos, radicales y nombres comunes. |
| `src/core/parser.js` | Gramática: sustitutiva, radicofuncional, nombres comunes. Solo sintaxis. |
| `src/core/build.js` | AST → grafo. Valida localizadores/valencias, resuelve localizadores omitidos, registra trazabilidad token→átomos. |
| `src/core/namer.js` | Estructura → nombre canónico y diagnóstico (orden alfabético, numeración, cadena). Mismo módulo de reglas en ambos sentidos. |
| `src/core/render.js` | Semidesarrollada en texto y SVG (coordenadas separadas del modelo). |
| `src/core/explain.js` | Pasos derivados de las reglas realmente ejecutadas. |
| `src/core/analyze.js` | Orquestador: `analyze(texto)`. |
| `src/ui/` | Interfaz estática (sin framework). |

## Estados

`valido` · `incompleto` · `invalido` · `fuera_de_alcance` · `vacio`. Solo `valido` devuelve molécula. Ante ambigüedad real (p. ej. `bromopropano`) no se adivina: estado `incompleto` y se pide el localizador.

## Pruebas (`npm test`)

- Casos de referencia revisados a mano (incluye los ejemplos de las imágenes).
- Equivalencias: distintas formas de escribir el mismo compuesto producen la misma molécula (clave canónica).
- **Ida y vuelta**: 1500 moléculas aleatorias → nombre → parser → molécula, y comprobación de que no hay diagnósticos espurios.
- Estados incompleto/inválido/fuera de alcance, errores de localizadores y valencias.

## Limitaciones conocidas de v0.1

- Solo alcanos, radicales alquilo y halógenos (F, Cl, Br, I); cadena principal de hasta 10 carbonos.
- Sin ciclos distintos del benceno, polímeros, sales ni sustituyentes compuestos en anillos (ver `docs/cobertura-plan-quimica-iii.md`).
- Sin editor visual ni estructura→nombre desde un dibujo (el nombre canónico ya existe en el núcleo; falta el constructor/editor).
- Los casos de referencia los revisó un asistente: **deben revisarse por un profesor de Química** (el oráculo de pruebas aún no es independiente).

## Derivados del benceno

Módulo propio, separado del analizador de cadenas: `aromatic.js` (lectura de nombres, construcción, nombre IUPAC), `aromatic-analysis.js` (estados, notas, pasos), `aromatic-render.js` (hexágono SVG y fórmula condensada). `analyze()` lo consulta primero; si el texto no termina en un padre aromático, sigue el flujo de cadenas. El anillo se modela con enlaces de Kekulé; `Molecule.canonicalKey()` lo trata como aromático (menor de 12 lecturas). El nitro usa cargas formales (N⁺, O⁻) y el sulfo azufre con valencia 6. El constructor admite `RingDraft` (6 posiciones).

## Reacciones

Capa sobre el núcleo (no lo modifica salvo por operaciones de grafo nuevas): `species.js` (orgánicas, sales, polímeros e inorgánicas de catálogo cerrado, con conteo de átomos y clave de igualdad), `balance.js` (espacio nulo exacto con BigInt: coeficientes enteros mínimos) y `reactions.js` (`react(id, nombres, opciones)` → `ReactionResult`). Cada reacción es una función que clona el grafo y cambia órdenes de enlace o quita/une átomos; los H implícitos se recalculan solos. Detalle en `docs/reacciones.md`.

`Molecule` ganó `clone()`, `setBond()`, `without()`, `split()` y `merge()` (antes un grafo construido no se podía editar).
