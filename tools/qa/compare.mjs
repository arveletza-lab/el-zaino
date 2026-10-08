// Comparación lado a lado: referencia a la izquierda, render a la derecha, 640 px de ancho cada una.
// Uso: node compare.mjs <ref.png> <render.png> <salida.png>
// Si las dos imágenes tienen el mismo tamaño, también informa cuántos píxeles difieren.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import { asegurarCarpeta } from './lib.mjs';

const [ref, render, salida] = process.argv.slice(2);
if (!ref || !render || !salida) { console.error('Uso: node compare.mjs <ref.png> <render.png> <salida.png>'); process.exit(1); }

const dataUrl = (f) => {
  const ext = extname(f).toLowerCase().replace('.', '');
  const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';
  return `data:${mime};base64,${readFileSync(f).toString('base64')}`;
};

const browser = await chromium.launch();
const page = await browser.newPage();
const res = await page.evaluate(async ([a, b]) => {
  const load = (src) => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = ko; i.src = src; });
  const [A, B] = await Promise.all([load(a), load(b)]);
  const W = 640, gap = 8, ha = Math.round(A.height * W / A.width), hb = Math.round(B.height * W / B.width), H = Math.max(ha, hb);
  const c = document.createElement('canvas'); c.width = W * 2 + gap; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.drawImage(A, 0, 0, W, ha); g.drawImage(B, W + gap, 0, W, hb);
  let diff = null;
  if (A.width === B.width && A.height === B.height) {
    const px = (img) => { const k = document.createElement('canvas'); k.width = img.width; k.height = img.height; const x = k.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, img.width, img.height).data; };
    const da = px(A), db = px(B);
    let n = 0, suma = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let i = 0; i < da.length; i += 4) {
      const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
      suma += d;
      if (d > 8) { n++; const p = i / 4, x = p % A.width, y = Math.floor(p / A.width); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    const total = da.length / 4;
    diff = { pixelesDistintos: n, porcentaje: +(100 * n / total).toFixed(3), difMedia: +(suma / total).toFixed(3), zona: n ? [x0, y0, x1, y1] : null };
  }
  return { png: c.toDataURL('image/png'), diff };
}, [dataUrl(ref), dataUrl(render)]);
await browser.close();

asegurarCarpeta(salida);
writeFileSync(salida, Buffer.from(res.png.split(',')[1], 'base64'));
console.log('Comparación:', salida);
if (res.diff) {
  const d = res.diff;
  console.log(`  Píxeles distintos (>8/255): ${d.pixelesDistintos} (${d.porcentaje} %), diferencia media ${d.difMedia}` + (d.zona ? `, zona [x0,y0,x1,y1] = [${d.zona.join(', ')}]` : ''));
}
