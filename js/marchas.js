// Marchas: velocidades, patrones de apoyo y parámetros de cada marcha en función de la velocidad
// (docs/investigacion-locomocion.md §1, §2, §3 y §4). La locomoción (js/locomocion.js) los usa.
// Orden de las patas en todo el código: MD, MI, PD, PI (0..3).
// Un patrón da, para la velocidad v (m/s): f (Hz), d[i] (duty, fracción del ciclo en apoyo) y t[i] (fase de la
// pisada de cada pata respecto del reloj global; la pata i apoya cuando frac(Φ − t[i]) < d[i]).
// "Galope" de la interfaz = galope corto de 3 tiempos (5 m/s); con la palanca a fondo sostenida pasa al
// galope tendido de 4 tiempos (11 m/s). Es una sola familia: el patrón se interpola con la velocidad.
import { lerp, clamp01, sstep } from './util.js';

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// v: velocidad típica (× control de velocidad de la interfaz, dentro de [vMin, vMax]); wCap: giro máximo (rad/s)
export const MARCHAS = {
  stand:   { v: 0, vMin: 0, vMax: 0, wCap: 0.5,
             label: '<b>Quieto</b> · en reposo, peso en las cuatro patas' },
  walk:    { v: 1.6, vMin: 0.5, vMax: 2.1, wCap: 0.7,
             label: '<b>Paso</b> · 4 tiempos, secuencia lateral · ~6 km/h' },
  trot:    { v: 3.5, vMin: 1.8, vMax: 5.2, wCap: 0.75,
             label: '<b>Trote</b> · 2 tiempos en diagonal · ~13 km/h' },
  gallop:  { v: 5.0, vMin: 2.8, vMax: 8.5, wCap: 0.9,
             label: (mano) => `<b>Galope</b> · 3 tiempos, mano ${mano > 0 ? 'derecha' : 'izquierda'} · ~18 km/h` },
  tendido: { v: 11, vMin: 7, vMax: 16, wCap: 0.9,
             label: (mano) => `<b>Galope tendido</b> · 4 tiempos, mano ${mano > 0 ? 'derecha' : 'izquierda'} · ~40 km/h` }
};
export const ORDEN_MARCHAS = ['stand', 'walk', 'trot', 'gallop'];
export const A_LAT = 5;            // aceleración lateral máxima (m/s²): ω ≤ A_LAT / v (§5.1)
export const W_LUGAR = 0.55;       // giro en el lugar (rad/s): ~45° por tranco, 180° en ~6 s (§5.4)

const NOMBRES = { stand: 'Quieto', walk: 'Paso', trot: 'Trote', gallop: 'Galope', tendido: 'Galope tendido' };
const clave = (nombre, tendido) => (nombre === 'gallop' && tendido ? 'tendido' : nombre);
// Texto del panel. real = { nombre, tendido, giro } (marcha.real, la que lleva el caballo): si no coincide con la
// pedida dice las dos, por ejemplo "<b>Paso → Galope</b> · 4 tiempos, secuencia lateral · ~6 km/h".
export function etiqueta(nombre, tendido, mano, real) {
  const kp = clave(nombre, tendido);
  const kr = real ? clave(real.nombre, real.tendido) : kp;
  const m = MARCHAS[kr];
  let txt = typeof m.label === 'function' ? m.label(mano) : m.label;
  if (real && real.giro && kr === 'stand') txt = '<b>Quieto</b> · girando en el lugar, pisando';
  if (kr !== kp) txt = txt.replace(/^<b>(.*?)<\/b>/, `<b>$1 → ${NOMBRES[kp]}</b>`);
  return txt;
}

// velocidad objetivo de una marcha con el multiplicador de la interfaz
export function velocidadObjetivo(nombre, tendido, mult) {
  if (nombre === 'stand') return 0;
  const m = MARCHAS[nombre === 'gallop' && tendido ? 'tendido' : nombre];
  return clamp(m.v * mult, m.vMin, m.vMax);
}

// giro máximo según la marcha y la velocidad actual (radios de §5.1)
export function giroMaximo(nombre, tendido, v) {
  if (nombre === 'stand' && v < 0.3) return W_LUGAR;
  const cap = MARCHAS[nombre === 'gallop' && tendido ? 'tendido' : nombre].wCap;
  return Math.min(Math.max(cap, W_LUGAR), A_LAT / Math.max(v, 0.1));
}

// ---------- patrones (§1.2 y §1.3) ----------
// galope a mano derecha, columnas de velocidad: t de PD (pata adelantada), MI (mano de atrás), MD (mano adelantada)
const GV = [3.5, 5, 7, 10, 14];
const G_PD = [0.23, 0.21, 0.18, 0.15, 0.16], G_MI = [0.27, 0.28, 0.29, 0.30, 0.32], G_MD = [0.50, 0.48, 0.47, 0.46, 0.50];
function tabla(xs, ys, x) {
  if (x <= xs[0]) return ys[0];
  for (let i = 1; i < xs.length; i++) if (x <= xs[i]) return lerp(ys[i - 1], ys[i], (x - xs[i - 1]) / (xs[i] - xs[i - 1]));
  return ys[ys.length - 1];
}

// tipo: 'walk' | 'trot' | 'gallop' | 'giro' (giro en el lugar: paso lento lateral); mano: +1 derecha, −1 izquierda
export function patron(tipo, v, mano = 1, out = { f: 0, d: [0, 0, 0, 0], t: [0, 0, 0, 0] }) {
  const d = out.d, t = out.t;
  if (tipo === 'giro') {
    out.f = 0.75; d.fill(0.62);
    t[3] = 0; t[1] = 0.25; t[2] = 0.5; t[0] = 0.75;
  } else if (tipo === 'walk') {
    const SL = 0.70 + 0.67 * Math.max(v, 0.3);
    out.f = Math.max(0.6, v / SL);
    const dm = clamp(1.12 / SL, 0.58, 0.72), sep = lerp(0.21, 0.25, clamp01((v - 1.1) / 0.8));
    d[0] = d[1] = dm; d[2] = d[3] = dm + 0.02;
    t[3] = 0; t[1] = sep; t[2] = 0.5; t[0] = 0.5 + sep;
  } else if (tipo === 'trot') {
    const SL = 0.61 * Math.max(v, 1.2) + 0.55;
    out.f = Math.max(0.95, v / SL);
    d[0] = d[1] = clamp(1.24 / SL, 0.33, 0.5); d[2] = d[3] = clamp(1.16 / SL, 0.31, 0.48);
    t[3] = 0; t[0] = 0.02; t[2] = 0.5; t[1] = 0.52;
  } else {
    const vv = Math.max(v, 2);
    out.f = 1.40 + 0.067 * vv - 0.0005 * vv * vv;
    const SL = vv / out.f;
    d[0] = d[1] = clamp(1.25 / SL, 0.18, 0.48); d[2] = d[3] = clamp(1.40 / SL, 0.21, 0.54);
    const tPD = tabla(GV, G_PD, v), tMI = tabla(GV, G_MI, v), tMD = tabla(GV, G_MD, v);
    if (mano > 0) { t[3] = 0; t[2] = tPD; t[1] = tMI; t[0] = tMD; }
    else { t[2] = 0; t[3] = tPD; t[0] = tMI; t[1] = tMD; }
  }
  // Ajuste al modelo: la mano del modelo gira alrededor de un tope a 1,37 m del casco (el de la investigación
  // supone ~1,5 m), así que con el duty de la tabla el casco apoyado recorre más de lo que la mano alcanza
  // (despegaba con la pinza rotada 100°). Se acorta el apoyo de las manos un 8 % y el de las patas un 3 %;
  // todo queda dentro de los rangos medidos de §1.1.
  if (tipo !== 'giro') { d[0] *= 0.92; d[1] *= 0.92; d[2] *= 0.97; d[3] *= 0.97; }
  return out;
}

// ---------- parámetros de vuelo, apoyo y cuerpo por tipo de marcha (§2, §3, §4) ----------
// alturas en m, ángulos en rad. hM/hP: altura máxima del casco (mano/pata); pk: momento del pico (fracción del vuelo)
// carpo/menM/menP: flexión máxima en el vuelo (carpo, menudillo de la mano y de la pata), pkC/pkE: cuándo
// emax: extensión del menudillo a mitad del apoyo; bo: ángulo y fracción del apoyo del breakover
// cruz/grupa: núcleos de oscilación vertical [n, a, φmin] (φmin < 0 = mitad del apoyo); cuello: base y cabeceo
const DEG = Math.PI / 180;
const TIPOS = {
  giro:    { hM: 0.07, hP: 0.06, pkM: 0.33, pkP: 0.27, carpo: 50 * DEG, pkC: 0.42, menM: 45 * DEG, menP: 40 * DEG, pkE: 0.44, flexC: 25 * DEG,
             emax: 6 * DEG, boA: 25 * DEG, boB: 0.10, retM: 0.03, retP: 0.0,
             cruz: [[2, 0.003, 0.05]], grupa: [[2, 0.005, 0.06]], base: -0.002, rol: 0.01, cuello: -0.10, cabeza: 0, nod: [2, 0.02], cola: 0.03, sway: 0.9 },
  walk:    { hM: 0.09, hP: 0.08, pkM: 0.33, pkP: 0.27, carpo: 60 * DEG, pkC: 0.42, menM: 53 * DEG, menP: 45 * DEG, pkE: 0.44, flexC: 30 * DEG,
             emax: 12 * DEG, boA: 35 * DEG, boB: 0.10, retM: 0.06, retP: 0.02,
             cruz: [[2, 0.009, 0.05]], grupa: [[2, 0.0175, 0.06]], base: -0.005, rol: 0.02, cuello: -0.12, cabeza: 0, nod: [2, 0.045], cola: 0.05, sway: 1.0 },
  trot:    { hM: 0.14, hP: 0.11, pkM: 0.35, pkP: 0.27, carpo: 85 * DEG, pkC: 0.36, menM: 65 * DEG, menP: 55 * DEG, pkE: 0.42, flexC: 40 * DEG,
             emax: 20 * DEG, boA: 50 * DEG, boB: 0.12, retM: 0.06, retP: 0.02,
             cruz: [[2, 0.02, 0.21]], grupa: [[2, 0.02, 0.20]], base: -0.015, rol: 0.012, cuello: -0.07, cabeza: 0.02, nod: [2, 0.02], cola: 0.25, sway: 1.2 },
  gallop:  { hM: 0.22, hP: 0.18, pkM: 0.38, pkP: 0.32, carpo: 95 * DEG, pkC: 0.27, menM: 72 * DEG, menP: 60 * DEG, pkE: 0.32, flexC: 45 * DEG,
             emax: 24 * DEG, boA: 60 * DEG, boB: 0.18, retM: 0.06, retP: 0.02,
             cruz: [[1, 0.04, -1], [2, 0.005, -1]], grupa: [[1, 0.045, -1]], base: -0.03, rol: 0.02, cuello: -0.16, cabeza: 0.14, nod: [1, 0.10], cola: 0.9, sway: 1.5 },
  tendido: { hM: 0.36, hP: 0.28, pkM: 0.40, pkP: 0.35, carpo: 105 * DEG, pkC: 0.22, menM: 78 * DEG, menP: 65 * DEG, pkE: 0.28, flexC: 50 * DEG,
             emax: 33 * DEG, boA: 70 * DEG, boB: 0.20, retM: 0.06, retP: 0.02,
             cruz: [[1, 0.03, -1]], grupa: [[1, 0.035, -1]], base: -0.04, rol: 0.015, cuello: -0.24, cabeza: 0.22, nod: [1, 0.08], cola: 1.0, sway: 1.5 }
};
const NUM = ['hM', 'hP', 'pkM', 'pkP', 'carpo', 'pkC', 'menM', 'menP', 'pkE', 'flexC', 'emax', 'boA', 'boB', 'retM', 'retP', 'base', 'rol', 'cuello', 'cabeza', 'cola', 'sway'];

// Mezcla de parámetros con pesos por tipo (los pesos se filtran en la locomoción, así nada cambia de golpe).
// pesos: { giro, walk, trot, gallop } (suman 1); el galope se reparte entre corto y tendido según v.
// Los núcleos se devuelven ya como coeficientes (A, B) por armónico, para las manos y para las patas,
// con φmin = d/2 en el galope. Interpolar (A, B), nunca amplitud y fase (§7.8).
export function mezclarParametros(pesos, v, dM, dP, out = {}) {
  const kT = sstep(5.5, 10, v);
  const w = { giro: pesos.giro, walk: pesos.walk, trot: pesos.trot, gallop: pesos.gallop * (1 - kT), tendido: pesos.gallop * kT };
  for (const n of NUM) { let s = 0; for (const k in w) s += w[k] * TIPOS[k][n]; out[n] = s; }
  const coef = (lista, dd) => {
    const c = [0, 0, 0, 0];   // A1, B1, A2, B2
    for (const k in w) {
      if (!w[k]) continue;
      for (const [n, a, pm] of TIPOS[k][lista]) {
        const phm = pm < 0 ? dd / 2 : pm, ang = 2 * Math.PI * n * phm;
        c[(n - 1) * 2] += -w[k] * a * Math.cos(ang);
        c[(n - 1) * 2 + 1] += -w[k] * a * Math.sin(ang);
      }
    }
    return c;
  };
  out.kCruz = coef('cruz', dM); out.kGrupa = coef('grupa', dP);
  // cabeceo del cuello: n = 2 (paso, trote) o 1 (galope), más bajo a mitad del apoyo de cada mano
  const c = [0, 0, 0, 0];
  for (const k in w) {
    if (!w[k]) continue;
    const [n, a] = TIPOS[k].nod, ang = 2 * Math.PI * n * dM / 2;
    c[(n - 1) * 2] += -w[k] * a * Math.cos(ang); c[(n - 1) * 2 + 1] += -w[k] * a * Math.sin(ang);
  }
  out.kCuello = c;
  return out;
}

// valor de un núcleo (A1, B1, A2, B2) en la fase φ de una pata
export const nucleo = (k, ph) => {
  const a = 2 * Math.PI * ph;
  return k[0] * Math.cos(a) + k[1] * Math.sin(a) + k[2] * Math.cos(2 * a) + k[3] * Math.sin(2 * a);
};

// Estado de la marcha elegida (botones, teclado o palanca). La velocidad real y el patrón los lleva la locomoción.
export function crearMarcha() {
  const m = {
    nombre: 'walk',
    tendido: false,
    setTarget(nombre) { m.nombre = nombre; if (nombre !== 'gallop') m.tendido = false; },
    setYa(nombre) { m.setTarget(nombre); }
  };
  return m;
}
