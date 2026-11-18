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
- Sin alquenos, alquinos, ciclos, aromáticos ni grupos funcionales con oxígeno/nitrógeno.
- Sin editor visual ni estructura→nombre desde un dibujo (el nombre canónico ya existe en el núcleo; falta el constructor/editor).
- Los casos de referencia los revisó un asistente: **deben revisarse por un profesor de Química** (el oráculo de pruebas aún no es independiente).
