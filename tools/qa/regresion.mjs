// Capturas deterministas usando solo la interfaz (sin window.__debug), con un reloj propio:
// performance.now y requestAnimationFrame se reemplazan y los cuadros se avanzan de a 1/60 s.
// sirve para comparar dos versiones del sitio cuadro por cuadro.
// Uso: node regresion.mjs <url> <carpeta-salida>
//   ej.: node regresion.mjs http://localhost:8000/_origen/caballo.html ../../qa-out/antes
import { lanzar, nuevaPagina, asegurarCarpeta } from './lib.mjs';
import { join } from 'node:path';

const [url, carpeta] = process.argv.slice(2);
if (!url || !carpeta) { console.error('Uso: node regresion.mjs <url> <carpeta-salida>'); process.exit(1); }

const ESCENAS = [
  { nombre: 'exterior-parado', clicks: ['#g-stand'], ms: 3000 },
  { nombre: 'exterior-trote', clicks: ['#g-trot'], ms: 3000 },
  { nombre: 'montura-paso', clicks: ['#v-toggle'], ms: 2000 }
];

// reloj controlado: el tiempo solo avanza con __avanzar(ms)
const RELOJ = () => {
  let t = 0;
  const cola = [];
  performance.now = () => t;
  Date.now = () => t;
  window.requestAnimationFrame = (cb) => { cola.push(cb); return cola.length; };
  window.__avanzar = (ms) => {
    for (let n = Math.round(ms * 60 / 1000); n > 0; n--) { t += 1000 / 60; cola.splice(0).forEach((cb) => cb(t)); }
  };
};

const browser = await lanzar();
console.log('WebGL:', browser.webgl);
for (const e of ESCENAS) {
  const page = await nuevaPagina(browser);
  await page.addInitScript(RELOJ);
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForFunction(() => document.getElementById('loading').hidden, null, { timeout: 60000 });
  for (const sel of e.clicks) await page.click(sel);
  await page.evaluate((ms) => window.__avanzar(ms), e.ms);
  await page.waitForTimeout(500); // deja terminar las transiciones CSS del panel
  const out = join(carpeta, e.nombre + '.png');
  asegurarCarpeta(out);
  await page.screenshot({ path: out });
  console.log('Captura:', out, page.mensajes.length ? '\n  ' + page.mensajes.join('\n  ') : '');
  await page.context().close();
}
await browser.close();
