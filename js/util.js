// Utilidades matemáticas comunes. THREE es global (vendor/three.min.js).
export const V = THREE.Vector3;
export const lin = (h) => new THREE.Color(h).convertSRGBToLinear();
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp01 = (x) => Math.max(0, Math.min(1, x));
export const sstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const frac = (x) => x - Math.floor(x);
export const TAU = Math.PI * 2;
// Azar con semilla fija: el orden de las llamadas define crin, cola, matas y ovejas (ver CLAUDE.md).
export const rnd = (() => { let s = 7; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; })();

// smooth (cubic Hermite) interpolation through profile keys, so surfaces have no flat bands
export function prof(keys, t) {
  const n = keys.length;
  if (t <= keys[0][0]) return keys[0][1];
  if (t >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 0; while (t > keys[i + 1][0]) i++;
  const slope = (j) => {
    if (j <= 0) return (keys[1][1] - keys[0][1]) / (keys[1][0] - keys[0][0]);
    if (j >= n - 1) return (keys[n - 1][1] - keys[n - 2][1]) / (keys[n - 1][0] - keys[n - 2][0]);
    const a = (keys[j][1] - keys[j - 1][1]) / (keys[j][0] - keys[j - 1][0]), b = (keys[j + 1][1] - keys[j][1]) / (keys[j + 1][0] - keys[j][0]);
    return a * b <= 0 ? 0 : (a + b) / 2;
  };
  const [t0, v0] = keys[i], [t1, v1] = keys[i + 1], h = t1 - t0, s = (t - t0) / h;
  const s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * v0 + (s3 - 2 * s2 + s) * h * slope(i) + (-2 * s3 + 3 * s2) * v1 + (s3 - s2) * h * slope(i + 1);
}
// rounded end caps for a swept section (t in 0..1)
export function cap(t, c0, c1) {
  let f = 1;
  if (c0 > 0 && t < c0) { const u = (c0 - t) / c0; f *= Math.sqrt(Math.max(0, 1 - u * u)); }
  if (c1 > 0 && t > 1 - c1) { const u = (t - (1 - c1)) / c1; f *= Math.sqrt(Math.max(0, 1 - u * u)); }
  return Math.max(f, 0.003);
}
// asymmetric section: front/back depth along N, side width along Z, superellipse exponent
export function section(ca, sa, RYf, RYb, RXf, RXb, e) {
  const w = 0.5 + 0.5 * ca;
  const RY = ca >= 0 ? RYf : RYb;
  const RX = lerp(RXb, RXf, w);
  const pc = Math.sign(ca) * Math.pow(Math.abs(ca), e), ps = Math.sign(sa) * Math.pow(Math.abs(sa), e);
  return [pc * RY, ps * RX];
}

// ---------- ruido ----------
// Se crean con fábricas para que consuman rnd() en el mismo punto de la construcción que el original.
// Perlin 3D (color del pelaje)
export function crearRuido3() {
  const perm = new Uint8Array(512); for (let i = 0; i < 256; i++) perm[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < 256; i++) perm[i + 256] = perm[i];
  const g = (h, x, y, z) => { const u = h & 1 ? x : -x, v = h & 2 ? y : -y, w = h & 4 ? z : -z; return u + v + w; };
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x, y, z) => {
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255, Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x), v = fade(y), w = fade(z);
    const A = perm[X] + Y, AA = perm[A] + Z, AB = perm[A + 1] + Z, B = perm[X + 1] + Y, BA = perm[B] + Z, BB = perm[B + 1] + Z;
    return lerp(lerp(lerp(g(perm[AA], x, y, z), g(perm[BA], x - 1, y, z), u), lerp(g(perm[AB], x, y - 1, z), g(perm[BB], x - 1, y - 1, z), u), v),
      lerp(lerp(g(perm[AA + 1], x, y, z - 1), g(perm[BA + 1], x - 1, y, z - 1), u), lerp(g(perm[AB + 1], x, y - 1, z - 1), g(perm[BB + 1], x - 1, y - 1, z - 1), u), v), w);
  };
}
// value noise 2D y fbm (relieve de las lomas)
export function crearRuidoValor() {
  const N = 256, tbl = new Float32Array(N * N); for (let i = 0; i < tbl.length; i++) tbl[i] = rnd();
  const at = (x, y) => tbl[(x & (N - 1)) + (y & (N - 1)) * N];
  const vnoise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return lerp(lerp(at(xi, yi), at(xi + 1, yi), u), lerp(at(xi, yi + 1), at(xi + 1, yi + 1), u), v);
  };
  const fbm = (x, y) => vnoise(x, y) * 0.5 + vnoise(x * 2.1, y * 2.1) * 0.25 + vnoise(x * 4.3, y * 4.3) * 0.125;
  return { vnoise, fbm };
}
