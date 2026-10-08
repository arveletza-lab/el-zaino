// Superpone el contorno del modelo (rojo) y el modelo semitransparente sobre una foto de referencia.
// El render tiene que ser una captura con --silueta o --solo (fondo magenta) alineada con la foto,
// por ejemplo: node shot.mjs ../../qa-out/f1.png foto-1 stand 0 2048 1151 --silueta
// Uso: node superponer.mjs <foto.png> <render.png> <salida.png> [ancho=1600] [opacidad=0.35]
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { asegurarCarpeta } from './lib.mjs';

const [foto, render, salida, ancho = '1600', alfa = '0.35'] = process.argv.slice(2);
if (!foto || !render || !salida) { console.error('Uso: node superponer.mjs <foto.png> <render.png> <salida.png> [ancho] [opacidad]'); process.exit(1); }
const url = (f) => 'data:image/png;base64,' + readFileSync(f).toString('base64');

const browser = await chromium.launch();
const page = await browser.newPage();
const png = await page.evaluate(async ([a, b, W, alfa]) => {
  const load = (s) => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = s; });
  const [F, R] = await Promise.all([load(a), load(b)]);
  const H = Math.round(F.height * W / F.width);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.drawImage(R, 0, 0, W, H);
  const rd = g.getImageData(0, 0, W, H).data;
  const mask = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) { const r = rd[i * 4], gg = rd[i * 4 + 1], bb = rd[i * 4 + 2]; mask[i] = (Math.abs(r - 255) + gg + Math.abs(bb - 255)) > 90 ? 1 : 0; }
  g.drawImage(F, 0, 0, W, H);
  const out = g.getImageData(0, 0, W, H), o = out.data;
  for (let i = 0; i < W * H; i++) {
    if (mask[i]) for (let k = 0; k < 3; k++) o[i * 4 + k] = o[i * 4 + k] * (1 - alfa) + rd[i * 4 + k] * alfa;
    const x = i % W, y = (i / W) | 0;
    if (x > 0 && y > 0 && x < W - 1 && y < H - 1 && mask[i] && (!mask[i - 1] || !mask[i + 1] || !mask[i - W] || !mask[i + W])) {
      for (const j of [i, i + 1, i + W]) { o[j * 4] = 255; o[j * 4 + 1] = 30; o[j * 4 + 2] = 30; }
    }
  }
  g.putImageData(out, 0, 0);
  return c.toDataURL('image/png');
}, [url(foto), url(render), +ancho, +alfa]);
await browser.close();
asegurarCarpeta(salida);
writeFileSync(salida, Buffer.from(png.split(',')[1], 'base64'));
console.log('Superposición:', salida);
