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

## Benceno y derivados

Se leen, dibujan y nombran los derivados del benceno que pide el plan de Química III (`tolueno`, `fenol`, `anilina`, `ácido benzoico`, `2,4,6-trinitrotolueno`, `p-nitrotolueno`, `1,3,5-trimetilbenceno`…), con numeración IUPAC y equivalencias o-/m-/p-. El constructor tiene un modo **Anillo de benceno** (seis posiciones). También se leen estireno, dioles/diácidos aromáticos, sales de ácidos grasos (jabones) y polímeros de adición con catálogo cerrado. Cobertura detallada y brechas: [`docs/cobertura-plan-quimica-iii.md`](docs/cobertura-plan-quimica-iii.md).

Alcance actual: alcanos, alquenos, alquinos, halogenuros, alcoholes, éteres, aldehídos, cetonas, ácidos, ésteres, aminas, amidas y derivados del benceno. Ver `docs/`.

## Documentación

- [`docs/convenciones-nomenclatura.md`](docs/convenciones-nomenclatura.md): qué formas se aceptan y cómo se escribe la forma canónica.
- [`docs/cobertura-plan-quimica-iii.md`](docs/cobertura-plan-quimica-iii.md): qué pide el plan escolar y qué cubre el sistema (incluye brechas).
- [`docs/arquitectura.md`](docs/arquitectura.md): módulos, estados, pruebas y limitaciones.
