# Convenciones de nomenclatura (v0.1)

Principio: **leer de forma generosa, escribir de forma estricta.** El parser acepta varias formas de escribir el mismo compuesto; el sistema siempre muestra una sola forma canónica y explica la diferencia.

## Formas de entrada aceptadas

| Forma | Ejemplos |
|---|---|
| Sustitutiva | `1-bromo-2-metilpropano`, `bromoetano`, `5-fluoro-2-metil-1-yodohexano` |
| Radicofuncional (halogenuros) | `bromuro de etilo`, `bromuro de isobutilo`, `cloruro de 2-metilbutilo` |
| Nombres comunes | `isobutano`, `isopentano`, `neopentano`, `cloroformo`, `tetracloruro de carbono` |
| Radicales comunes | `isopropil`, `isobutil`, `sec-butil`, `terc-butil`, `isopentil`, `neopentil` |
| Radicales compuestos | `2-(2-metilpropil)heptano` |

## Variantes toleradas (se interpretan y se avisa)

- Mayúsculas y acentos indiferentes.
- `fluor`/`fluoro`, `yodo`/`iodo`, `clor`/`cloro`, `brom`/`bromo`.
- Espacios alrededor de guiones (`2- metil -1-bromopropano`) y guion antes de la cadena (`yodo-hexano`).
- Sustituyentes en **cualquier orden** (`2-metil-1-bromopropano`): se interpreta y se avisa del orden alfabético.
- `n-hexano`, `tert-butil`, `ter-butil`, `t-butil`, `sec-butil`/`s-butil`.
- Localizadores omitidos **solo si no hay ambigüedad** (`bromoetano` sí; `bromopropano` pide el localizador).

## Forma canónica de salida

1. Cadena principal: la más larga.
2. Empate: la que tenga más sustituyentes.
3. Numeración: localizadores más bajos para el conjunto de sustituyentes.
4. Empate: el primero en orden alfabético recibe el localizador más bajo.
5. Prefijos en orden alfabético (sin contar `di-`, `tri-`…, ni `sec-`, `terc-`; `iso` sí cuenta).
6. Sin guion entre el último prefijo y la cadena (`yodohexano`).
7. Localizadores omitidos solo en metano y en etano con un único sustituyente.
8. Radicales comunes (`isobutil`…) en lugar de la forma sistemática; radicales complejos entre paréntesis.

> **Corrección al documento de investigación:** el nombre de referencia `5-fluoro-1-yodo-2-metilhexano` no está en orden alfabético («metil» va antes que «yodo»). El correcto es **`5-fluoro-2-metil-1-yodohexano`**, que coincide con la imagen de referencia.

## Decisiones pendientes (a validar con el profesor / programa oficial)

- Estilo de localizador para insaturaciones (`2-buteno` vs `but-2-eno`) y alcoholes (`1-propanol` vs `propan-1-ol`): se decide al implementar esas familias.
- ~~Éteres: `metoxietano` vs `etil metil éter`.~~ **Resuelto en v0.3:** se leen y se generan ambas; el nombre principal es el sustitutivo (alcoxi) y el radicofuncional se ofrece como equivalencia.
- ~~Aminas: `propilamina` vs `propan-1-amina`.~~ **Resuelto en v0.3:** se leen y se generan ambas (`1-propanamina` escolar, `propan-1-amina` IUPAC 2013, `propilamina` radicofuncional).

## Cadenas largas (v0.2)

- Raíces de 1 a 99 carbonos: `undec`, `dodec`, … `nonadec`, `eicos` (también se lee `icos`), `heneicos`, `docos`, `tricos`, … `triacont`, `hentriacont`… Al escribir se usa la forma tradicional (`eicosano`).
- Multiplicadores hasta 20 (`undeca`… `icosa`).
- Ambigüedad: `tridecil` es un radical de 13 carbonos, no «tri + decil» (3 × decilo se escribiría `tri(decil)`). Gana la lectura como raíz.
- Botón «Comprimir CH₂ → (CH₂)ₙ»: afecta solo a la línea semidesarrollada (no al dibujo en zigzag ni al modelo). Una tira de 5 o más CH₂ interiores se escribe `CH₂–(CH₂)ₖ–CH₂` dejando uno a cada lado, p. ej. `Br–CH₂–CH(CH₃)–CH₂–(CH₂)₅–CH₂–CH₃`. Tiras más cortas no se comprimen.
