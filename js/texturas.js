// Texturas de canvas del caballo: pelo del cuerpo (color y relieve, también usado como
// relieve del cuero y la lana) y mechones para crin, copete y cola.
import { rnd, TAU } from './util.js';

// Pelo corto: vetas finas a lo largo de v (el caballo orienta las UV para que v siga la dirección del pelo)
export function coatTexture(base, streak) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 18000; i++) {
    const x = rnd() * 512, y = rnd() * 512, l = 4 + rnd() * 11;
    g.strokeStyle = rnd() > 0.5 ? `rgba(255,255,255,${0.03 + rnd() * streak})` : `rgba(0,0,0,${0.03 + rnd() * streak})`;
    g.lineWidth = 0.4 + rnd() * 0.6;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 1.6, y + l); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// azar local (no consume rnd(): ver hairTexture)
function azar(semilla) {
  let s = semilla >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Mechones sobre fondo transparente (crin, cola, copete y pelos de las orejas): un atlas de 4 columnas (u en cuartos),
// cada una un mechón distinto que llena su columna, con los bordes vacíos:
//   0: mechón largo y tupido que se separa en 5–6 puntas;   1: puntas desparejas (pelos de largos muy distintos);
//   2: ralo, pelos sueltos que se abren (capa de afuera);    3: tupido y parejo (capas de abajo, maslo y raíz de la crin).
// v = 1 es la raíz (arriba del canvas) y v = 0 la punta. Los pelos se juntan en mechones que se afinan hacia la punta
// (como el pelo de verdad, que se agrupa) y cada pelo termina a una altura distinta. La textura es casi neutra (gris
// claro con pelos más oscuros y más claros, puntas quemadas apenas más cálidas): el color de cada mechón lo da el
// color de vértice de js/caballo.js. Se dibuja directo en los píxeles (pelos con antialias) y los niveles de mipmap
// se arman acá conservando la cobertura del alphaTest (si no, de lejos el pelo se vuelve ralo y desaparece).
// Azar local con semilla fija (no consume rnd()).
export const HAIR_COLS = 4;
// umbral del alphaTest del pelo (hairMat y su material de sombra en js/caballo.js)
export const UMBRAL_PELO = 0.4;
export function hairTexture() {
  const W = 512, H = 512, CW = W / HAIR_COLS;
  const A = new Float32Array(W * H), Lp = new Float32Array(W * H), Sp = new Float32Array(W * H);
  const r = azar(9137);
  // seno en tabla (el dibujo de los pelos es lo que más tarda de las texturas)
  const SEN = new Float32Array(1024); for (let i = 0; i < 1024; i++) SEN[i] = Math.sin(i / 1024 * Math.PI * 2);
  const sen = (x) => SEN[((x * 162.97466) | 0) & 1023];
  // columnas: [mechones, pelos por mechón, largo del mechón (fracción de H), largo de cada pelo (mín, exponente),
  //            semiancho del mechón en la raíz y en la punta (px), ondulación, abanico de la punta]
  const COLS = [
    [6, 72, [0.86, 1.0], [0.55, 0.35], [10, 15], [1.2, 3], 2.0, 4],
    [7, 55, [0.55, 1.0], [0.3, 0.8], [8, 13], [1, 3], 2.5, 6],
    [4, 30, [0.6, 1.0], [0.35, 0.6], [9, 16], [3, 8], 4.0, 14],
    [8, 70, [0.82, 1.0], [0.7, 0.4], [14, 22], [5, 9], 1.5, 3]
  ];
  COLS.forEach(([nM, nP, lM, lP, wr, wt, onda, abanico], col) => {
    const x0c = col * CW + 3, x1c = (col + 1) * CW - 4;
    for (let m = 0; m < nM; m++) {
      const wR = wr[0] + r() * (wr[1] - wr[0]), wT = wt[0] + r() * (wt[1] - wt[0]);
      const cx0 = x0c + wR + 2 + (m + 0.5 + (r() - 0.5) * 0.8) / nM * (x1c - x0c - 2 * wR - 4);
      const curva = (r() - 0.5) * abanico * 2, Lm = H * (lM[0] + r() * (lM[1] - lM[0]));
      const fq = 0.004 + r() * 0.008, ph = r() * Math.PI * 2;
      for (let i = 0; i < nP; i++) {
        const o = (r() * 2 - 1) * Math.sqrt(r()), y0 = -2 + Math.pow(r(), 2.5) * 35;
        const len = Lm * (lP[0] + (1 - lP[0]) * Math.pow(r(), lP[1]));
        const fp = 0.01 + r() * 0.02, pp = r() * 6.3, amp = 0.3 + r() * 1.2, suelto = r() < 0.08 ? (r() - 0.5) * 18 : 0;
        // un pelo: ancho w (px), opacidad a0, luminancia lum y quemado al sol en la punta (sol)
        const w = 0.8 + r() * 1.0, a0 = 0.8 + 0.2 * r(), lum = 0.55 + 0.45 * r(), sol = r() < 0.5 ? 0.5 : 0;
        const ya = Math.max(0, Math.floor(y0)), yb = Math.min(H - 1, Math.floor(y0 + len));
        for (let y = ya; y <= yb; y++) {
          const q = (y - y0) / len;
          if (q < 0 || q > 1) continue;
          const x = cx0 + curva * q * q + sen(q * Lm * fq + ph) * onda * q + o * (wR + (wT - wR) * q) + sen(q * len * fp + pp) * amp * q + suelto * q * q;
          const hw = Math.max(0.35, w * (1 - 0.45 * q) * 0.5);
          const a = a0 * (q < 0.78 ? 1 : 1 - (q - 0.78) / 0.22) * Math.min(1, (q + 0.02) * 30);
          const sq = sol * Math.max(0, (q - 0.45) / 0.55);
          const i1 = Math.min(x1c, Math.ceil(x + hw + 1));
          for (let ix = Math.max(x0c, Math.floor(x - hw - 1)); ix <= i1; ix++) {
            const cov = Math.min(1, hw + 0.5 - Math.abs(ix + 0.5 - x));
            if (cov <= 0) continue;
            const c = a * cov, k = y * W + ix, c1 = 1 - c;
            Lp[k] = lum * c + Lp[k] * c1; Sp[k] = sq * c + Sp[k] * c1; A[k] = c + A[k] * c1;
          }
        }
      }
    }
  });
  // niveles de mipmap: promedio 2 × 2 y luego la opacidad se escala para que la fracción de texeles que pasan el
  // alphaTest sea la del nivel 0
  const niveles = [{ w: W, h: H, A, Lp, Sp, escala: 1 }];
  const pasa = (a, s) => { let n = 0; for (let k = 0; k < a.length; k++) if (a[k] * s >= UMBRAL_PELO) n++; return n / a.length; };
  const f0 = pasa(A, 1);
  while (niveles[niveles.length - 1].w > 1 || niveles[niveles.length - 1].h > 1) {
    const p = niveles[niveles.length - 1], w = Math.max(1, p.w >> 1), h = Math.max(1, p.h >> 1);
    const n = { w, h, A: new Float32Array(w * h), Lp: new Float32Array(w * h), Sp: new Float32Array(w * h), escala: 1 };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let a = 0, l = 0, s = 0;
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const k = Math.min(p.h - 1, y * 2 + dy) * p.w + Math.min(p.w - 1, x * 2 + dx);
        a += p.A[k]; l += p.Lp[k]; s += p.Sp[k];
      }
      const k = y * w + x; n.A[k] = a / 4; n.Lp[k] = l / 4; n.Sp[k] = s / 4;
    }
    let lo = 1, hi = 6;
    for (let it = 0; it < 12; it++) { const m = (lo + hi) / 2; if (pasa(n.A, m) < f0) lo = m; else hi = m; }
    n.escala = (lo + hi) / 2;
    niveles.push(n);
  }
  const lienzos = niveles.map((n) => {
    const c = document.createElement('canvas');
    c.width = n.w; c.height = n.h;
    const g = c.getContext('2d'), img = g.createImageData(n.w, n.h), d = img.data;
    for (let k = 0; k < n.w * n.h; k++) {
      const a = n.A[k], L = a > 1e-4 ? n.Lp[k] / a : 0.78, s = a > 1e-4 ? n.Sp[k] / a : 0;
      d[k * 4] = Math.min(255, L * 255); d[k * 4 + 1] = Math.min(255, L * (1 - 0.08 * s) * 255); d[k * 4 + 2] = Math.min(255, L * (1 - 0.16 * s) * 255);
      d[k * 4 + 3] = Math.min(255, a * n.escala * 255);
    }
    g.putImageData(img, 0, 0);
    return c;
  });
  // la versión anterior consumía 129.600 llamadas a rnd(): se consumen igual para no cambiar lo que viene después
  // (montura, campo; ver CLAUDE.md)
  for (let i = 0; i < 129600; i++) rnd();
  const t = new THREE.CanvasTexture(lienzos[0]);
  t.mipmaps = lienzos;
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = 8;
  return t;
}

// Brillo del pelo en el canal VERDE del mapa de relieve (el relieve de three.js lee el rojo, la rugosidad lee el
// verde: el cuero y la lana, que solo usan el relieve, no cambian). Mechones de 1 a 4 mm de ancho y 2 a 7 cm de largo
// a lo largo de v (la dirección del pelo): claro = el mechón agarra el brillo (menos rugoso y con más reflejo, ver
// bodyMat en js/caballo.js), oscuro = lo apaga. Así el reflejo se rompe en vetas que siguen el pelo, como el reflejo
// anisótropo del pelo corto. Azar local con semilla fija (no consume rnd()). La textura se repite en las dos
// direcciones (los índices dan la vuelta). Se escribe directo en los píxeles: es mucho más rápido que trazar.
function vetasBrillo(canvas) {
  const W = canvas.width, H = canvas.height, f = new Float32Array(W * H).fill(0.48);
  const r = azar(48611);
  // mechón: huso a lo largo de y (ancho w, largo len, apenas curvo), suave en los bordes y en las puntas
  const mechon = (x0, y0, len, w, dx, val, a) => {
    for (let j = 0; j < len; j++) {
      const q = j / len, cx = x0 + dx * q * q, fin = Math.sin(Math.PI * q), hw = w * (0.4 + 0.6 * fin) * 0.5;
      const y = ((Math.floor(y0 + j) % H) + H) % H;
      for (let i = Math.floor(cx - hw); i <= Math.ceil(cx + hw); i++) {
        const t = 1 - Math.abs(i - cx) / (hw + 0.5);
        if (t <= 0) continue;
        const k = y * W + ((i % W) + W) % W, m = a * t * fin;
        f[k] += (val - f[k]) * m;
      }
    }
  };
  // mechones anchos (dónde el pelo agarra la luz o la apaga) y pelos finos encima
  for (let i = 0; i < 700; i++) mechon(r() * W, r() * H, 60 + r() * 200, 6 + r() * 22, (r() - 0.5) * 16, r() < 0.5 ? 0.92 : 0.06, 0.18 + r() * 0.25);
  for (let i = 0; i < 2600; i++) mechon(r() * W, r() * H, 14 + r() * 50, 1 + r() * 1.5, (r() - 0.5) * 4, r() < 0.5 ? 1 : 0, 0.15 + r() * 0.3);
  // reemplazar solo el verde sin leer el lienzo (getImageData obliga a bajarlo de la GPU): se anula el verde
  // multiplicando por magenta y se suma una capa (0, verde, 0)
  const capa = document.createElement('canvas'); capa.width = W; capa.height = H;
  const gc = capa.getContext('2d'), img = gc.createImageData(W, H);
  for (let k = 0; k < W * H; k++) { img.data[k * 4 + 1] = Math.max(0, Math.min(255, f[k] * 255)); img.data[k * 4 + 3] = 255; }
  gc.putImageData(img, 0, 0);
  const g = canvas.getContext('2d');
  g.save();
  g.globalCompositeOperation = 'multiply'; g.fillStyle = '#ff00ff'; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'lighter'; g.drawImage(capa, 0, 0);
  g.restore();
}

// Orden fijo: color del pelo, relieve del pelo (y del cuero), mechones.
export function crearTexturasCaballo() {
  const coatMap = coatTexture('#dadada', 0.045); coatMap.repeat.set(6, 3); coatMap.encoding = THREE.sRGBEncoding;
  const coatBump = coatTexture('#808080', 0.25); coatBump.repeat.set(6, 3);
  vetasBrillo(coatBump.image);
  const hairTex = hairTexture();
  return { coatMap, coatBump, hairTex };
}
