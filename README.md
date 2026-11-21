# Química Orgánica — editor educativo

Aplicación web para aprender nomenclatura orgánica en bachillerato. El estudiante escribe un nombre en español y obtiene la estructura (fórmula semidesarrollada) con explicación paso a paso. Todo es determinista: gramática + reglas, **sin IA generativa**.

## Probar

```bash
npm start            # http://localhost:8080
npm test             # pruebas del núcleo (Node 22+, sin dependencias)
npm run typecheck    # tipos (JSDoc) con tsc
```

También se puede abrir con un nombre precargado: `http://localhost:8080/?q=bromuro%20de%20etilo`.

## Qué hace la v0.1

- Lee **varias formas** del mismo compuesto: `1-bromo-2-metilpropano`, `2-metil-1-bromopropano`, `bromuro de isobutilo`, `5-fluor-2-metil-1-yodo-hexano`…
- Estados claros: **válido / incompleto / no válido / fuera de alcance**. Nunca inventa una estructura.
- Avisa de errores típicos: orden alfabético, numeración por el extremo equivocado, cadena no más larga, localizador faltante o fuera de rango, valencias imposibles.
- Dibuja la estructura semidesarrollada y resalta qué parte del nombre corresponde a qué átomos.
- Muestra el nombre canónico, la forma radicofuncional y la fórmula molecular.

## Constructor y «verifica mi respuesta» (v0.3)

La pestaña **Construir y verificar** arma una estructura sin escribir el nombre: se elige cuántos carbonos tiene la cadena (1–10), el orden de cada enlace y los grupos de cada carbono (halógenos, –OH, =O, éteres, aminas, radicales). El nombre, el dibujo y los pasos salen de las mismas reglas que el otro modo. Con un nombre propio escrito en el cuadro, el sistema compara **la estructura** (no el texto) y dice si es correcto, un isómero o una molécula distinta. El «modo práctica» oculta la respuesta hasta acertar o pedirla. Lo que se escribe como nombre también se puede llevar al constructor, y viceversa.

Alcance actual: alcanos, alquenos, alquinos, halogenuros, alcoholes, éteres, aldehídos, cetonas, ácidos, ésteres, aminas y amidas. Ver `docs/`.

## Documentación

- [`docs/convenciones-nomenclatura.md`](docs/convenciones-nomenclatura.md): qué formas se aceptan y cómo se escribe la forma canónica.
- [`docs/arquitectura.md`](docs/arquitectura.md): módulos, estados, pruebas y limitaciones.
