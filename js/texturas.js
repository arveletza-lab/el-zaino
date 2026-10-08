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

// Mechones sobre fondo transparente (crin, cola, copete y pelos de las orejas). La textura es casi neutra (gris
// claro con pelos más oscuros y más claros, puntas quemadas apenas más cálidas): el color de cada mechón lo da el
// color de vértice de js/caballo.js. v = 1 es la raíz (arriba del canvas) y v = 0 la punta. Los pelos se juntan en
// mechones angostos con huecos entre ellos, los bordes de la tira tienen menos pelos y cada pelo termina a una
// altura distinta, así una tira no se lee como una lámina con el borde recto.
export function hairTexture() {
  const W = 256, H = 1024;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const r = azar(9137);
  g.lineCap = 'round';
  const nMech = 18;
  for (let m = 0; m < nMech; m++) {
    const cx = (m + 0.5 + (r() - 0.5) * 0.7) / nMech * W;
    const borde = Math.min(cx, W - cx) / W;                    // 0 en los bordes de la tira, 0,5 en el medio
    const dens = 0.45 + 0.55 * Math.min(1, borde * 4);
    const largoM = H * (0.5 + 0.5 * r());                     // largo del mechón
    const ancho = 2.5 + r() * 4.5, amp = 1 + r() * 4, fq = 0.003 + r() * 0.006, ph = r() * Math.PI * 2;
    const n = Math.round((12 + r() * 14) * dens);
    for (let i = 0; i < n; i++) {
      const x0 = cx + (r() - 0.5) * ancho * 2, len = largoM * (0.35 + 0.65 * Math.pow(r(), 0.6)), y0 = -6 + Math.pow(r(), 2.2) * 110;
      const w = 0.7 + r() * 1.1, tono = r(), quemado = r() < 0.55;
      const base = 120 + tono * 110, steps = 18, desv = (r() - 0.5) * 10;
      for (let s = 0; s < steps; s++) {
        const q = s / steps, ya = y0 + len * q, yb = y0 + len * (s + 1) / steps;
        const fade = q < 0.7 ? 1 : 1 - (q - 0.7) / 0.3;
        const sol = quemado ? Math.max(0, (q - 0.5) / 0.5) * 0.5 : 0;
        const L = base + (235 - base) * sol;
        g.strokeStyle = `rgba(${L | 0},${(L * (1 - 0.08 * sol)) | 0},${(L * (1 - 0.16 * sol)) | 0},${(0.75 + 0.25 * r()) * fade})`;
        g.lineWidth = w * (1 - 0.5 * q);
        g.beginPath();
        g.moveTo(x0 + Math.sin(ya * fq + ph) * amp + desv * q, ya);
        g.lineTo(x0 + Math.sin(yb * fq + ph) * amp + desv * (s + 1) / steps, yb);
        g.stroke();
      }
    }
  }
  // la versión anterior consumía 129.600 llamadas a rnd(): se consumen igual para no cambiar lo que viene después
  // (montura, campo; ver CLAUDE.md)
  for (let i = 0; i < 129600; i++) rnd();
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  t.anisotropy = 8;
  return t;
}

// Orden fijo: color del pelo, relieve del pelo (y del cuero), mechones.
export function crearTexturasCaballo() {
  const coatMap = coatTexture('#dadada', 0.045); coatMap.repeat.set(6, 3); coatMap.encoding = THREE.sRGBEncoding;
  const coatBump = coatTexture('#808080', 0.25); coatBump.repeat.set(6, 3);
  const hairTex = hairTexture();
  return { coatMap, coatBump, hairTex };
}
