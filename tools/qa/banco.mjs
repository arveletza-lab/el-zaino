// Banco de pruebas del SDF del cuerpo, sin navegador (~2 s): mide las vistas como vistas.mjs, pero sobre el campo de
// distancias en vez de la malla horneada, y dibuja siluetas ortográficas (perfil, frente, atrás y arriba).
// Uso: node banco.mjs [salida.png] [--viejo <copia de js/caballo.js>]   (con --viejo, su contorno va en rojo)
// Sirve para iterar sobre la forma sin hornear; antes de dar algo por bueno, medir con vistas.mjs.
import { writeFileSync, readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { asegurarCarpeta } from './lib.mjs';
globalThis.THREE = { Vector3: class {}, Color: class {} };
const RAIZ = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2), iV = args.indexOf('--viejo');
const archivoViejo = iV >= 0 ? resolve(args[iV + 1]) : null;
const salida = args.filter((a, i) => !a.startsWith('--') && i !== iV + 1)[0] || resolve(RAIZ, 'qa-out/banco.png');
asegurarCarpeta(salida);
const t0 = Date.now();
const nuevo = (await import(pathToFileURL(resolve(RAIZ, 'js/caballo.js')).href + '?' + Date.now())).crearCampo();
const t1 = Date.now();
console.log('campo nuevo:', t1 - t0, 'ms');
const viejo = archivoViejo ? (await import(pathToFileURL(archivoViejo).href)).crearCampo() : null;

const H = 0.01, X0 = -0.9, X1 = 1.62, Y0 = 0, Y1 = 2.2;
function tablaZ(cp) {
  const nx = Math.round((X1 - X0) / H) + 1, ny = Math.round((Y1 - Y0) / 0.005) + 1, Z = new Float32Array(nx * ny).fill(-1);
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const x = X0 + i * H, y = Y0 + j * 0.005;
    let z = 0.42, f = cp.evaluar(x, y, z), it = 0;
    while (f > 0 && z > 0 && it < 400) { z -= Math.min(0.012, Math.max(f * 0.8, 0.0015)); f = cp.evaluar(x, y, Math.max(0, z)); it++; }
    if (f > 0) { // no hay piel en este (x, y) con z ≥ 0
      Z[i + j * nx] = -1; continue;
    }
    // bisección entre z (adentro) y z + paso
    let a = Math.max(0, z), b = a + 0.01;
    for (let k = 0; k < 10; k++) { const m = (a + b) / 2; if (cp.evaluar(x, y, m) < 0) a = m; else b = m; }
    Z[i + j * nx] = a;
  }
  return { Z, nx, ny, at: (x, y) => { const i = Math.round((x - X0) / H), j = Math.round((y - Y0) / 0.005); return (i < 0 || j < 0 || i >= nx || j >= ny) ? -1 : Z[i + j * nx]; } };
}
const tn = tablaZ(nuevo); const t2 = Date.now(); console.log('tabla z:', t2 - t1, 'ms');
const tv = viejo ? tablaZ(viejo) : null;

// ---- vistas ----
const obj = JSON.parse(readFileSync(resolve(RAIZ, 'referencias/medidas-3vistas.json'), 'utf8'));
const maxEn = (T, f) => { let m = -1; for (let i = 0; i < T.nx; i++) for (let j = 0; j < T.ny; j++) { const x = X0 + i * H, y = Y0 + j * 0.005; if (f(x, y)) m = Math.max(m, T.Z[i + j * T.nx]); } return m; };
const arriba = (T, x) => maxEn(T, (xx) => Math.abs(xx - x) < 0.006);
const frente = (T, y) => maxEn(T, (x, yy) => x > 0.2 && Math.abs(yy - y) < 0.006);
const atras = (T, y) => maxEn(T, (x, yy) => x < 0.2 && Math.abs(yy - y) < 0.006);
const corte = (T, x, y) => maxEn(T, (xx, yy) => Math.abs(xx - x) <= 0.0101 && Math.abs(yy - y) < 0.006);
let dentro = 0, total = 0, peor = 0;
const fila = (nom, k, s, mn, mv) => { const d = mn - s; total++; if (Math.abs(d) <= 0.015) dentro++; peor = Math.max(peor, Math.abs(d)); console.log(`  ${nom} ${k.toFixed(2).padStart(5)}  obj ${s.toFixed(3)}  nuevo ${mn.toFixed(3)} (${d >= 0 ? '+' : ''}${d.toFixed(3)})${Math.abs(d) > 0.015 ? ' ✗' : '  '}${mv != null ? '   viejo ' + mv.toFixed(3) : ''}`); };
console.log('arriba'); for (const [x, s] of obj.arriba) fila('x', x, s, arriba(tn, x), tv && arriba(tv, x));
console.log('frente'); for (const [y, s] of obj.frente) fila('y', y, s, frente(tn, y), tv && frente(tv, y));
console.log('atras'); for (const [y, s] of obj.atras) fila('y', y, s, atras(tn, y), tv && atras(tv, y));
for (const sec of obj.secciones) { console.log('corte', sec.nombre, sec.x); for (const [y, s] of sec.puntos) fila('y', y, s, corte(tn, sec.x, y), tv && corte(tv, sec.x, y)); }
console.log(`${dentro} de ${total} dentro de ±1,5 cm; peor ${(peor * 100).toFixed(1)} cm`);
// extra: arriba de 0,7 a 1,0 (debería quedar en 0,23 → 0,20) y frente a 0,5 y 0,6
console.log('arriba extra', [0.7, 0.8, 0.9, 1.0].map((x) => `${x}: ${arriba(tn, x).toFixed(3)}${tv ? '/' + arriba(tv, x).toFixed(3) : ''}`).join('  '));
console.log('frente extra', [0.5, 0.6, 0.7].map((y) => `${y}: ${frente(tn, y).toFixed(3)}${tv ? '/' + frente(tv, y).toFixed(3) : ''}`).join('  '));
console.log('atras extra', [0.5, 0.6].map((y) => `${y}: ${atras(tn, y).toFixed(3)}${tv ? '/' + atras(tv, y).toFixed(3) : ''}`).join('  '));
// cortes completos (semiancho por altura) en algunas x
const cortes = [0.9, 0.7, 0.55, 0.45, 0.2, 0.05, -0.05, -0.3, -0.5, -0.6];
for (const x of cortes) {
  const ys = []; for (let y = 0.7; y <= 1.66; y += 0.05) { const a = corte(tn, x, y), b = tv ? corte(tv, x, y) : null; ys.push(`${y.toFixed(2)}:${a < 0 ? '  -  ' : a.toFixed(3)}${b != null ? '/' + (b < 0 ? '  -  ' : b.toFixed(3)) : ''}`); }
  console.log('corte x=' + x, ys.join(' '));
}

// ---- dibujo ----
const PX = 220; // px por metro
const W1 = Math.round((X1 - X0) * PX), H1 = Math.round(Y1 * PX);
const WF = Math.round(0.8 * PX);
const ancho = W1 + 2 * WF + 20, alto = H1 + Math.round(0.8 * PX) + 10;
const img = new Uint8Array(ancho * alto * 3).fill(255);
const pon = (x, y, r, g, b) => { if (x < 0 || y < 0 || x >= ancho || y >= alto) return; const k = (y * ancho + x) * 3; img[k] = r; img[k + 1] = g; img[k + 2] = b; };
// mapas de ocupación
function mapa(T, sel) { // sel: 'perfil' | 'frente' | 'atras' | 'arriba'
  if (sel === 'perfil') { const m = new Uint8Array(W1 * H1); for (let px = 0; px < W1; px++) for (let py = 0; py < H1; py++) { const x = X0 + px / PX, y = Y1 - py / PX; m[px + py * W1] = T.at(x, y) >= 0 ? 1 : 0; } return [m, W1, H1]; }
  if (sel === 'frente' || sel === 'atras') {
    const m = new Uint8Array(WF * H1);
    for (let py = 0; py < H1; py++) { const y = Y1 - py / PX; const z = sel === 'frente' ? frenteRapido(T, y) : atrasRapido(T, y); for (let px = 0; px < WF; px++) { const zz = Math.abs((px - WF / 2) / PX); m[px + py * WF] = zz <= z ? 1 : 0; } }
    return [m, WF, H1];
  }
  const HA = Math.round(0.8 * PX), m = new Uint8Array(W1 * HA);
  for (let px = 0; px < W1; px++) { const x = X0 + px / PX; let z = -1; const i = Math.round((x - X0) / H); for (let j = 0; j < T.ny; j++) z = Math.max(z, T.Z[i + j * T.nx]); for (let py = 0; py < HA; py++) { const zz = Math.abs((py - HA / 2) / PX); m[px + py * W1] = zz <= z ? 1 : 0; } }
  return [m, W1, HA];
}
const cacheF = new Map();
function filaMax(T, y, cond) { const j = Math.round((y - Y0) / 0.005); let m = -1; if (j < 0 || j >= T.ny) return -1; for (let i = 0; i < T.nx; i++) { const x = X0 + i * H; if (cond(x)) m = Math.max(m, T.Z[i + j * T.nx]); } return m; }
const frenteRapido = (T, y) => filaMax(T, y, (x) => x > 0.2);
const atrasRapido = (T, y) => filaMax(T, y, (x) => x < 0.2);
function dibujar(sel, ox, oy) {
  const [mn, w, h] = mapa(tn, sel), mv = tv ? mapa(tv, sel)[0] : null;
  for (let px = 0; px < w; px++) for (let py = 0; py < h; py++) {
    const k = px + py * w;
    if (mn[k]) pon(ox + px, oy + py, 150, 150, 160);
    if (mv) { const borde = mv[k] && ((px > 0 && !mv[k - 1]) || (px < w - 1 && !mv[k + 1]) || (py > 0 && !mv[k - w]) || (py < h - 1 && !mv[k + w])); if (borde) pon(ox + px, oy + py, 230, 0, 0); }
  }
  // grilla cada 10 cm
  for (let px = 0; px < w; px++) for (let py = 0; py < h; py++) if (!mn[px + py * w] && ((px % 22) === 0 && (py % 4) === 0 || (py % 22) === 0 && (px % 4) === 0)) pon(ox + px, oy + py, 210, 210, 230);
}
dibujar('perfil', 0, 0);
dibujar('frente', W1 + 10, 0);
dibujar('atras', W1 + WF + 20, 0);
dibujar('arriba', 0, H1 + 10);
// PNG
function png(w, h, rgb) {
  const crc = (buf) => { let c, crcT = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; } let x = 0xffffffff; for (const b of buf) x = crcT[(x ^ b) & 0xff] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
  const chunk = (tipo, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(tipo), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; Buffer.from(rgb.buffer, y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
writeFileSync(salida, png(ancho, alto, img));
console.log('png:', salida, 'total', Date.now() - t0, 'ms');
