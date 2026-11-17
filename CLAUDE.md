# Reglas del repositorio

Proyecto: editor educativo de Química Orgánica para bachillerato (nomenclatura en español <-> estructura).

- La interpretación de nombres y la conectividad molecular son **deterministas** (gramática + reglas). Nunca IA generativa.
- Hacer commits pequeños y frecuentes (cada vez que se editen 2 o más archivos), para poder retomar sin perder trabajo.
- El modelo molecular (`src/core/molecule.js`) es independiente de cualquier editor o biblioteca gráfica.
- Toda regla nueva lleva pruebas (`npm test`). No degradar pruebas para obtener un build verde.
- `npm run typecheck` debe pasar (JSDoc + `// @ts-check`).
- Sin dependencias de ejecución. Añadir una solo si se justifica y se revisa su licencia.
- Si algo no está soportado, el sistema lo dice (estado `fuera_de_alcance`); nunca inventa una estructura.
