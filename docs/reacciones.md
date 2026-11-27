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

## Uso (API)

```js
import { react } from './src/core/reactions.js';
const r = react('oxidacion', ['etanol'], { oxidante: 'KMnO4' });
r.equation;     // etanol + 2 [O] —[KMnO4]→ ácido etanoico + agua   (nombres)
r.equationSemi; // HOCH₂–CH₃ + 2 [O] —[KMnO4]→ HOOC–CH₃ + H₂O      (semidesarrolladas)
r.status;       // valido | sin_reaccion | incompleto | invalido | fuera_de_alcance
r.products;     // especies con role: principal | secundario | mezcla (alternativas sin coeficiente)
```

| id | reactivos | opciones |
|---|---|---|
| `esterificacion` | ácido + alcohol (cualquier orden) | — |
| `oxidacion` | alcohol | `oxidante`: KMnO4, K2Cr2O7, PCC |
| `reduccion` | aldehído o cetona | `reductor`: NaBH4, LiAlH4 |
| `markovnikov` | alqueno | `reactivo`: HCl, HBr, HI, H2O |
| `deshidratacion` | alcohol | — |
| `descarboxilacion` | sal de Na/K/Li | — |
| `saponificacion` | éster | `base`: NaOH, KOH, LiOH |
| `hidrolisis` | éster | — |
| `halogenacion` | alcano | `halogeno`: Cl2, Br2 |
| `combustion` | compuesto C/H/O | — |
| `polimerizacion` | monómero del catálogo | — |
| `hidrogenacion` | alqueno o alquino | `catalizador`: Pt, Pd, Ni |

Los coeficientes salen de `balance.js` y cada resultado verifica la conservación de átomos; si no balancea, devuelve `invalido` en vez de una ecuación falsa.

## Preguntas para el docente

1. ¿Se enseña `[O]`/`[H]` como símbolos o con el reactivo completo?
2. ¿Cl₂ como mezcla (químicamente correcto) o con «principal» (como el compendio)?
3. ¿Estereoquímica (cis/trans en Zaitsev) queda fuera?
4. ¿Los ciclos entran en el plan escolar? Si sí, hay que implementar cicloalcanos (hoy fuera de alcance).
5. Validar los 60 ejemplos del compendio y la corrección de oxidación ej. 2.

## Pruebas

`test/oro-reacciones.json` (60 ejemplos del compendio) + `test/reacciones.test.js`.
