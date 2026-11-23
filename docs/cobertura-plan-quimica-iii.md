# Cobertura del plan de estudios escolar (Química III)

Criterio acordado: el sistema debe cubrir **como mínimo** los compuestos orgánicos y estructuras que
menciona el plan. Las **reacciones** (halogenación, oxidación, esterificación, saponificación,
polimerización…) no entran en el plan ni en el proyecto: solo interesan los nombres y estructuras
que aparecen en ellas. Donde el plan contradice la delimitación inicial del proyecto (que dejaba
fuera los aromáticos), **manda el plan**.

La prueba `test/plan-quimica-iii.test.js` ejecuta todas las listas de abajo (lectura → molécula
válida → fórmula → dibujo) y comprueba que las brechas se declaran en vez de inventarse.

## Cubierto

| Tema del plan | Compuestos comprobados | Resultado |
|---|---|---|
| Alcanos (metano y derivados, etano … decano, isómeros sencillos) | 23 | ✅ 23/23 |
| Alquenos (eteno, propeno, butenos, dienos, haloalquenos) | 18 | ✅ 18/18 |
| Alquinos (etino/acetileno, propino, butinos, haloalcanos derivados) | 12 | ✅ 12/12 |
| Oxigenados (alcoholes, aldehídos, cetonas, ácidos, ésteres, éteres, ácidos grasos) | 29 | ✅ 29/29 |
| Descarboxilación y otras obtenciones (ácido etanoico, metano, ácido propanoico, etano) | 4 | ✅ 4/4 |
| **Benceno y derivados** (RAP 2) | 20 | ✅ 20/20 *(nuevo)* |
| Glicerol (producto de la saponificación) | 2 | ✅ `1,2,3-propanotriol` |

### Benceno y derivados

Nombres que se leen, dibujan (hexágono con enlaces dobles alternados y sustituyentes condensados) y
nombran, tanto desde el nombre como desde el constructor («Anillo de benceno»):

`benceno`, `bromobenceno`, `clorobenceno`, `nitrobenceno`, `metilbenceno`/`tolueno`, `etilbenceno`,
`fenol`, `anilina`, `ácido benzoico`, `benzaldehído`, `ácido bencenosulfónico`, `1,2-dibromobenceno`,
`1,4-diclorobenceno`, `1,3-dinitrobenceno`, `o-xileno`, `1,3,5-trimetilbenceno`,
`2,4,6-trinitrotolueno`, `p-nitrotolueno`, `ácido 2-hidroxibenzoico`.

Sustituyentes del anillo: F, Cl, Br, I, nitro, sulfo, hidroxi, amino, formil, carboxi, metoxi, etoxi y
los radicales metil, etil, propil, isopropil, butil, isobutil, sec-butil, terc-butil. Hasta 6 posiciones.

Reglas (todas deterministas, ver `src/core/aromatic.js`):

1. **Grupo principal en C1**, por prioridad: ácido carboxílico > ácido sulfónico > aldehído > hidroxilo > amina.
   El padre toma el nombre retenido: ácido benzoico, ácido bencenosulfónico, benzaldehído, fenol, anilina.
2. Sin grupo principal: un solo `metil` (sin otro radical alquilo) → **tolueno** con el CH₃ en C1; en otro caso, **benceno**.
3. Numeración con el **menor conjunto de localizadores**; si empatan, el primer prefijo en **orden alfabético** recibe el menor.
4. Monosustituido: sin localizador (`bromobenceno`). Con 2 o más sustituyentes, siempre con localizadores.
5. **Orto/meta/para** (`o-`, `m-`, `p-`) se aceptan cuando hay exactamente dos sustituyentes, y se avisan como equivalencia de 1,2 / 1,3 / 1,4. `o-xileno` se acepta como nombre común (equivalente a `1,2-dimetilbenceno`).
6. **Variantes que se aceptan** (misma estructura): equivalentes sistemáticos que se marcan correctos — `hidroxibenceno`/`fenol`, `aminobenceno` y `bencenamina`/`anilina`, `ácido bencenocarboxílico`/`ácido benzoico`, `bencenocarbaldehído`/`benzaldehído`, `metilbenceno`/`tolueno`, `orto-`/`meta-`/`para-` además de `o-`/`m-`/`p-` — y nombres comunes que se leen, se marcan «común» y remiten al sistemático: `anisol`, `fenetol`, `cumeno`, `fenilamina`, `mesitileno`, `o/m/p-cresol`, `o/m/p-xileno`, `ácido salicílico`. La pantalla de nombres lista «También válido» y «Nombre común».
7. Faltan localizadores: si hay una sola estructura posible se resuelve (`hexaclorobenceno`); si hay varias, estado **incompleto** con las opciones (`dibromobenceno` → 1,2 / 1,3 / 1,4).
8. Lo no soportado se dice (**fuera de alcance**) y no se dibuja nada parcial.

Verificación: ida y vuelta exhaustiva (todas las combinaciones de hasta 3 de 8 sustituyentes en las
posiciones posibles: nombre → estructura → mismo nombre) y los 20 casos del plan con fórmula y clave canónica.

### Ampliación «ligeramente superior al plan» (v0.4)

| Tema | Ejemplos que ahora se leen | Notas |
|---|---|---|
| Dioles, diaminas y diácidos aromáticos | `catecol`, `resorcinol`, `hidroquinona`, `1,4-diaminobenceno`, `ácido ftálico/isoftálico/tereftálico`, `ácido 1,4-bencenodicarboxílico` | nombre escolar con prefijos (`1,2-dihidroxibenceno`); el diácido solo si no hay más sustituyentes |
| Vinilo / estireno | `estireno`, `vinilbenceno`, `etenilbenceno`, `4-nitroestireno` | sustituyente `etenil` en el anillo |
| Sulfónicos | `ácido p-toluensulfónico` | |
| Comunes de cadena | ácidos láurico, mirístico, palmítico, esteárico, oxálico, malónico, succínico, láctico, acrílico, metacrílico; `acroleína`, `isooctano`, `isopreno`, `cloruro de vinilo`, `acrilato/metacrilato de metilo` | se leen por su nombre sistemático y se avisan como comunes |
| Sales de ácidos carboxílicos (jabones) | `estearato de sodio`, `octadecanoato de sodio`, `acetato de potasio`, `benzoato de sodio`, `lactato de sodio` | anión carboxilato dibujado (O⁻) y catión Na⁺/K⁺/Li⁺ en nombre, fórmula y notas; solo monocarboxilatos |
| Polímeros de adición | `polietileno`, `polipropileno`, `policloruro de vinilo`, `poliestireno`, `teflón`, `polimetacrilato de metilo`, `poli(monómero)` | catálogo cerrado de unidades repetitivas; se dibuja el monómero; sin n ni estereoquímica |

**Error encontrado y corregido durante la auditoría:** `1-propenal` se aceptaba como válido, pero
el carbono del aldehído se quedaba sin H (era en realidad un ceteno). Ahora se rechaza («necesita
su hidrógeno»), `propenal` se resuelve como `2-propenal`, y el nombrador declara fuera de alcance los cetenos.

## Brechas documentadas (no inventan estructura)

| Caso | Estado | Motivo |
|---|---|---|
| `propanotriol` | incompleto | faltan localizadores (`1,2,3-propanotriol`); es el comportamiento correcto |
| `dióxido de carbono` | no válido | inorgánico (producto de la combustión) |
| `polibutadieno`, `poliisopreno`, polímeros fuera del catálogo | fuera de alcance | unidad 1,4 de dienos no catalogada |
| Sales de otros metales (`etanoato de calcio`) y de diácidos (`etanodioato de sodio`) | fuera de alcance | requieren varios cationes/cargas |
| Fenil como sustituyente de una cadena, naftaleno, bifenilo, PCB, DDT, benzopireno | fuera de alcance | anillos fusionados o fenil en cadena: no soportado |
| Triglicéridos, ácido oleico con estereoquímica, ácido cítrico, urea, carburo de calcio | fuera de alcance | no cubiertos |
| Cicloalcanos (ciclohexano…) | fuera de alcance | el analizador de cadenas no admite ciclos (sí el benceno) |
| Diol/diamina aromático con IUPAC 2013 (`benceno-1,2-diol`) | se lee la estructura, nombre escolar | el nombre iupac2013 repite el escolar |

## Decisiones y preguntas para el docente

- **Tolueno como padre sustituible.** La IUPAC 2013 conserva `tolueno` como nombre preferido, y los
  textos de bachillerato nombran `2,4,6-trinitrotolueno` y `p-nitrotolueno`. Se usa `tolueno` como padre
  y se muestra `metilbenceno` y la forma con benceno (`2-metil-1,3,5-trinitrobenceno`) como alternativa válida.
  *Pregunta:* ¿se prefiere en clase `trinitrotolueno` o `2-metil-1,3,5-trinitrobenceno`?
- Con otro radical alquilo (`1-etil-2-metilbenceno`) se prefiere el nombre con benceno antes que `2-etiltolueno`.
- `o-`, `m-`, `p-` son aceptados y se explican, pero el nombre canónico usa localizadores.
- `ácido` es obligatorio en `ácido benzoico` y `ácido bencenosulfónico`; sin esa palabra, error específico.
- Un nombre como `metilamino` pegado (sin paréntesis) en un anillo se lee como dos sustituyentes sueltos (`metil` + `amino`); los sustituyentes compuestos entre paréntesis quedan fuera de alcance.
