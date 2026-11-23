# Módulo de reacciones

Fuente: `compendio_de_reacciones_org_nicas.md` (proyecto Claude): 12 tipos × 5 ejemplos.
Plan completo: `claude/plan_implementacion_reacciones.md` (proyecto Claude).

## Alcance (23-nov-2026)

Las reacciones **entran** en el proyecto (antes estaban fuera). Cada reacción es una función
determinista que transforma el grafo `Molecule` existente; sin dependencias ni motor SMARTS.

Reacciones: esterificación de Fischer, oxidación de alcoholes, reducción de aldehídos/cetonas,
adición a alquenos (Markovnikov), deshidratación (Zaitsev), descarboxilación de sales,
saponificación, hidrólisis ácida de ésteres, halogenación radicalar de alcanos, combustión,
polimerización por adición e hidrogenación catalítica.

## Fuera de alcance (se declara, no se inventa)

- Ciclos (ciclopentano, ciclohexeno…): halogenación ej. 5 e hidrogenación ej. 5 del compendio.
- Ésteres aromáticos (benzoato de metilo): saponificación ej. 5.
- Estereoquímica (cis/trans en Zaitsev), reordenamientos de carbocatión, polisustitución.

## Correcciones al compendio

- Oxidación ej. 2: decía «3-metil-2-pentanol» pero la estructura dibujada es **2-metil-3-pentanol**
  (producto: 2-metil-3-pentanona). Se conserva la estructura dibujada.
- Combustión: el título dice «hidrocarburos» pero el ej. 5 es etanol; se admite C/H/O.
- Halogenación: «terciario > secundario > primario» vale para Br₂; con Cl₂ se muestra mezcla.

## Pruebas

`test/oro-reacciones.json` (60 ejemplos del compendio) + `test/reacciones.test.js`.
