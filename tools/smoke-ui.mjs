// Humo de la interfaz (manual, no entra en `npm test`): npm start en otra terminal y
//   PLAYWRIGHT=/ruta/a/playwright/index.mjs CHROME=/usr/bin/google-chrome node tools/smoke-ui.mjs
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage({ viewport: { width: 1000, height: 1400 } });
const errs = [];
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
await p.goto('http://localhost:8080/index.html');
await p.click('#tab-constructor');
console.log('estado inicial:', (await p.textContent('#c-estado')).trim().slice(0,60), '|', await p.textContent('#c-nombres'));
// ejemplo ácido 2-aminopropanoico
await p.click('[data-cej="1"]');
console.log('ejemplo1 nombres:', (await p.textContent('#c-nombres')).trim().replace(/\s+/g,' '));
// verificar
await p.fill('#c-nombre', 'ácido 2-aminopropanoico');
console.log('veredicto ok:', (await p.textContent('#c-veredicto')).trim().slice(0,80));
await p.fill('#c-nombre', '1-propanol');
console.log('veredicto otro:', (await p.textContent('#c-veredicto')).trim().slice(0,160));
// modo práctica
await p.check('#c-practica');
await p.fill('#c-nombre', 'xyz');
console.log('práctica respuesta oculta:', await p.isHidden('#c-respuesta'), '| botón revelar visible:', await p.isVisible('#c-revelar'));
await p.click('#c-revelar');
console.log('tras revelar oculta:', await p.isHidden('#c-respuesta'));
await p.uncheck('#c-practica');
// editar: añadir grupo y cambiar enlace
await p.click('[data-cej="0"]');
await p.selectOption('#c-cadena .enlace select >> nth=0', '2');
console.log('estado con doble enlace + OH en C2:', (await p.textContent('#c-estado')).trim().slice(0,100));
// inválido: =O en carbono con doble enlace
await p.selectOption('#c-cadena .carbono >> nth=1 >> select', '=O');
console.log('inválido:', (await p.textContent('#c-estado')).trim().slice(0,140));
// sincronía: constructor -> nombre
await p.click('[data-cej="2"]');
await p.click('#c-a-nombre');
console.log('pestaña nombre visible:', await p.isVisible('#vista-nombre'), '| input:', await p.inputValue('#nombre'));
// nombre -> constructor
await p.fill('#nombre', 'ácido 2-(metilamino)propanoico');
console.log('botón constructor visible:', await p.isVisible('#a-constructor'));
await p.click('#a-constructor');
console.log('constructor n:', await p.inputValue('#c-n'), '| nombres:', (await p.textContent('#c-nombres')).trim().replace(/\s+/g,' ').slice(0,90));
await p.screenshot({ path: '/tmp/shot-constructor.png', fullPage: true });
await p.click('[data-cej="1"]');
await p.screenshot({ path: '/tmp/shot-constructor2.png', fullPage: true });
console.log('errores de consola:', errs);
await b.close();
