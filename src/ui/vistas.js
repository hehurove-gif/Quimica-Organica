// @ts-check
/** Pestañas: «Nombre → estructura» y «Construir y verificar». */
const VISTAS = /** @type {const} */ (['nombre', 'constructor', 'reacciones']);

/** @param {'nombre' | 'constructor' | 'reacciones'} cual */
export function showView(cual) {
  for (const v of VISTAS) {
    const sel = v === cual;
    const tab = /** @type {HTMLElement} */ (document.getElementById(`tab-${v}`));
    const panel = /** @type {HTMLElement} */ (document.getElementById(`vista-${v}`));
    tab.setAttribute('aria-selected', String(sel));
    panel.hidden = !sel;
  }
}

for (const v of VISTAS) document.getElementById(`tab-${v}`)?.addEventListener('click', () => showView(v));
