// Humo de la pestaña Reacciones (manual, no entra en `npm test`): npm start en otra terminal y
//   PLAYWRIGHT=/ruta/a/playwright/index.mjs CHROME=/usr/bin/google-chrome node tools/smoke-reacciones.mjs
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1000, height: 1400 } });
const errs = [];
p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', (e) => errs.push('PAGEERROR ' + e.message + ' ' + (e.stack || '').split('\n').slice(0, 6).join(' / ')));
await p.goto('http://localhost:8080/index.html');
await p.click('#tab-reacciones');
console.log('reacciones en el selector:', await p.locator('#r-tipo option').count());
await p.selectOption('#r-tipo', 'oxidacion');
await p.click('#r-ejemplos button >> nth=1'); // etanol + KMnO4
console.log('estado:', (await p.textContent('#r-estado')).trim());
console.log('ecuación:', (await p.textContent('#r-eq')).trim());
console.log('especies:', await p.locator('.r-esp').count(), '| svg:', await p.locator('.r-esp svg').count());
await p.click('#r-ejemplos button >> nth=3'); // terciario
console.log('terciario:', (await p.textContent('#r-estado')).trim().slice(0, 90));
await p.selectOption('#r-tipo', 'deshidratacion');
await p.click('#r-ejemplos button >> nth=1'); // 2-pentanol
console.log('Zaitsev tarjetas:', (await p.locator('.r-esp h3').allTextContents()).join(' | '));
await p.check('#r-practica');
console.log('práctica: respuesta oculta:', await p.isHidden('#r-solucion'));
await p.fill('#r-resp', '2-penteno');
console.log('veredicto:', (await p.textContent('#r-veredicto')).trim());
await p.fill('#r-resp', '1-penteno');
console.log('veredicto minoritario:', (await p.textContent('#r-veredicto')).trim());
await p.fill('#r-resp', 'propano');
console.log('veredicto mal:', (await p.textContent('#r-veredicto')).trim());
await p.click('#r-revelar');
console.log('tras revelar visible:', await p.isVisible('#r-solucion'));
await p.uncheck('#r-practica');
await p.selectOption('#r-tipo', 'polimerizacion');
await p.click('#r-ejemplos button >> nth=2');
console.log('polímero:', (await p.textContent('#r-eq')).trim());
for (const t of ['nombre', 'constructor']) { await p.click(`#tab-${t}`); }
console.log('errores de consola:', errs.length, errs.slice(0, 3));
await b.close();
