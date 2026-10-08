// Locomoción: conducción (palanca → marcha, velocidad y giro), plan de pisadas en el SUELO, trayectoria de cada
// casco, movimiento del tronco, cuello, cabeza y cola, y la pose que se le pasa al caballo (caballo.aplicarPose).
// Especificación: docs/investigacion-locomocion.md (§1 marchas, §3 cascos, §4 cuerpo, §5 giros, §6 transiciones,
// §7 algoritmo). Marco (docs/rediseno-v2.md): el caballo queda en el origen mirando a +x; lo que se mueve es el
// mundo. pose = { x, z, rumbo, velocidad, giro } en el suelo; un punto p del caballo está en el suelo en
// (x, z) + Ry(rumbo)·p; rumbo crece al doblar a la IZQUIERDA (giro > 0).
//
// Reglas contra deslizamientos y temblores (§7.11):
// - Un solo reloj de fase continuo Φ; cada pata tiene su desfase, que SOLO cambia mientras la pata está en el aire.
// - El casco apoyado guarda su posición en el suelo y se pasa al marco del caballo cada cuadro: no puede patinar.
//   En el breakover queda fija la pinza (el casco rota sobre ella).
// - Al despegar, el casco viaja a una pisada predicha (regla del punto neutro sobre el arco de giro); la trayectoria
//   tiene velocidad nula al despegar y al pisar, y el objetivo se congela en el último 30 % del vuelo.
// - El cuerpo oscila con núcleos de la fase de CADA pata (nunca con la fase global), con coeficientes (A, B) que
//   se interpolan entre marchas.
// - Subpasos fijos de 1/120 s.
import { lerp, clamp01, sstep, frac } from './util.js';
import { patron, mezclarParametros, nucleo, velocidadObjetivo, giroMaximo, ORDEN_MARCHAS } from './marchas.js';

const G = 9.81, H_SUB = 1 / 120;
const PIVOTE = [0.05, 1.1];   // pivote del cabeceo del tronco (marco del caballo), cerca del centro de masa
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const mj = (x) => x * x * x * (10 - 15 * x + 6 * x * x);          // mínimo tirón: velocidad 0 en 0 y 1
const envolver = (x) => x - Math.round(x);
const envolverAng = (a) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
const softmin = (a, b, k) => (a + b - Math.sqrt((a - b) * (a - b) + k * k)) / 2;
// joroba de 0 a 1 y vuelta a 0: sube hasta pk y baja en `baja` (fracción del vuelo); 0 con derivada nula en los bordes
const joroba = (u, pk, baja = 0.5) => (u < pk ? sstep(0, pk, u) : 1 - sstep(pk, Math.min(1, pk + baja), u));
// sale rápido y apoya suave; el factor sstep(0, 0.15, u) hace que salga con velocidad nula (sin^0.6 sola tiene
// derivada infinita en u = 0: el casco saltaba hacia arriba al despegar)
const ventana = (u) => Math.pow(Math.max(0, Math.sin(Math.PI * u)), u < 0.5 ? 0.6 : 0.6 + 1.4 * sstep(0.5, 0.9, u)) * sstep(0, 0.15, u);
const gauss = (u, c, w) => Math.exp(-(((u - c) / w) ** 2));
// altura del casco en el vuelo (§3.1): arco bifásico, pico poco después del despegue
function alturaVuelo(u, c1, w1, a2, c2) {
  // máximo suave de las dos jorobas (Math.max tenía un quiebre donde se cruzan: un salto de velocidad vertical)
  const g1 = gauss(u, c1, w1), g2 = a2 * gauss(u, c2, 0.15);
  return ventana(u) * Math.pow(g1 ** 6 + g2 ** 6, 1 / 6) / ventana(c1);
}
// avance horizontal del casco en el SUELO durante el vuelo (§3.1): sale y llega con velocidad nula en el suelo
// (C1 con el apoyo). Con esa condición la aceleración mínima posible es 4·D/T² (D = largo del paso, T = vuelo:
// acelerar a fondo la mitad y frenar a fondo la otra mitad). El perfil se acerca a ese mínimo: aceleración trapezoidal
// (rampas lineales de PERFIL_W en las puntas y en el medio), ~4,25·D/T²; el anterior (smoothstep con rampas de 0,18 y
// 0,2) daba ~9·D/T² y frenaba en el último 20 % del vuelo. R: retracción del final del vuelo (el casco pasa un poco
// por delante de la pisada y vuelve), en fracción del paso, con el máximo en uR.
const PERFIL_W = 0.1, PERFIL_N = 600;
const PERFIL = (() => {
  const acc = (u) => (u < PERFIL_W ? u / PERFIL_W : u < 0.5 - PERFIL_W ? 1 : u < 0.5 + PERFIL_W ? (0.5 - u) / PERFIL_W
    : u < 1 - PERFIL_W ? -1 : (u - 1) / PERFIL_W);
  const v = new Float64Array(PERFIL_N + 1), p = new Float64Array(PERFIL_N + 1), h = 1 / PERFIL_N, sub = 20;
  for (let i = 0; i < PERFIL_N; i++) {   // integración fina (regla del punto medio en subpasos)
    let vi = v[i], pi = p[i];
    for (let k = 0; k < sub; k++) { const u = (i + (k + 0.5) / sub) * h, a = acc(u), dt = h / sub; pi += vi * dt + a * dt * dt / 2; vi += a * dt; }
    v[i + 1] = vi; p[i + 1] = pi;
  }
  const P1 = p[PERFIL_N];
  for (let i = 0; i <= PERFIL_N; i++) { v[i] /= P1; p[i] /= P1; }
  v[PERFIL_N] = 0; p[PERFIL_N] = 1;
  return { v, p, A: 1 / P1 };
})();
function perfilVuelo(u) {   // Hermite cúbico con la velocidad exacta de la tabla
  const x = clamp(u, 0, 1) * PERFIL_N, i = Math.min(PERFIL_N - 1, Math.floor(x)), t = x - i, h = 1 / PERFIL_N;
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * PERFIL.p[i] + (t3 - 2 * t2 + t) * h * PERFIL.v[i] + (-2 * t3 + 3 * t2) * PERFIL.p[i + 1] + (t3 - t2) * h * PERFIL.v[i + 1];
}
function avance(u, R, uR) {
  return perfilVuelo(u) + R * sstep(0.5, uR, u) * (1 - sstep(uR, 1, u));
}

// Alcance real de las patas apoyadas, medido con el IK de js/caballo.js (node tools/qa/check.mjs --alcance; check.mjs
// controla unos puntos contra el IK en vivo): la altura máxima del cuerpo (m, respecto del reposo) con la corona
// del casco a dx m por delante del tope del miembro (hombro o cadera), según la inclinación del breakover.
const ALC_DX0 = -0.8, ALC_PASO = 0.1, ALC_INC = [0, 35, 50, 60].map((g) => g * Math.PI / 180);
const ALCANCE = {
  mano: [[-0.290, -0.192, -0.113, -0.048, 0.005, 0.047, 0.081, 0.106, 0.123, 0.133, 0.135, 0.130, 0.118, 0.098, 0.071, 0.035, -0.009],
    [-0.219, -0.130, -0.057, 0.002, 0.051, 0.089, 0.119, 0.141, 0.154, 0.161, 0.160, 0.152, 0.136, 0.120, 0.090, 0.051, 0.003],
    [-0.195, -0.110, -0.041, 0.016, 0.062, 0.099, 0.127, 0.146, 0.158, 0.170, 0.168, 0.159, 0.142, 0.117, 0.085, 0.044, -0.006],
    [-0.183, -0.101, -0.033, 0.022, 0.066, 0.101, 0.135, 0.154, 0.165, 0.169, 0.166, 0.155, 0.138, 0.112, 0.079, 0.036, -0.015]],
  pata: [[-0.116, -0.049, 0.006, 0.051, 0.086, 0.113, 0.132, 0.143, 0.146, 0.142, 0.130, 0.111, 0.083, 0.047, 0.001, -0.056, -0.126],
    [-0.062, -0.000, 0.050, 0.090, 0.122, 0.144, 0.159, 0.167, 0.166, 0.158, 0.152, 0.142, 0.112, 0.073, 0.024, -0.035, -0.107],
    [-0.047, 0.012, 0.060, 0.098, 0.127, 0.147, 0.160, 0.188, 0.187, 0.178, 0.163, 0.139, 0.107, 0.066, 0.015, -0.047, -0.122],
    [-0.041, 0.016, 0.062, 0.098, 0.148, 0.169, 0.182, 0.187, 0.185, 0.175, 0.158, 0.133, 0.100, 0.058, 0.006, -0.058, -0.135]]
};
export function alcance(delantera, dx, incl) {
  const T = ALCANCE[delantera ? 'mano' : 'pata'];
  const fx = clamp((dx - ALC_DX0) / ALC_PASO, 0, 15.999), i = Math.floor(fx), tx = fx - i;
  let j = 0; while (j < 2 && incl > ALC_INC[j + 1]) j++;
  const tj = clamp((incl - ALC_INC[j]) / (ALC_INC[j + 1] - ALC_INC[j]), 0, 1);
  const fila = (r) => lerp(T[r][i], T[r][i + 1], tx);
  // fuera de la tabla, sigue con la pendiente del borde
  const extra = dx < ALC_DX0 ? (dx - ALC_DX0) * 0.9 : dx > -ALC_DX0 ? -(dx + ALC_DX0) * 0.5 : 0;
  return lerp(fila(j), fila(j + 1), tj) + extra;
}

// resorte crítico (para lo que cambia despacio: inclinación, curva, cuello)
function resorte(wn) { return { x: 0, v: 0, wn }; }
function moverResorte(r, obj, h) {
  const w = r.wn, n = Math.ceil(h * w / 0.15), k = h / Math.max(1, n);
  for (let i = 0; i < n; i++) { r.v += (w * w * (obj - r.x) - 2 * w * r.v) * k; r.x += r.v * k; }
  return r.x;
}

export function crearLocomocion({ caballo, marcha, setGait, campo }) {
  const IDS = ['MD', 'MI', 'PD', 'PI'];
  const patas = IDS.map((id) => caballo.patas.find((p) => p.id === id));
  const ikPatas = IDS.map((id) => caballo.legs.find((l) => l.id === id));   // resultado del IK (inclinación real)
  const HOOF_H = patas[0].HOOF_H;
  const pose = { x: 0, z: 0, rumbo: 0, velocidad: 0, giro: 0 };

  // ---------- estado ----------
  const est = {
    v: 0, a: 0, w: 0, wd: 0, vObj: 0, wObj: 0, mult: 1,
    Phi: 0, f: 0.9, d: [0.64, 0.64, 0.66, 0.66], P: patron('walk', 1.6, 1),
    tipo: 'walk', mano: 1, manoT: 0, manoPend: false, corr: 0,
    pesos: { giro: 0, walk: 1, trot: 0, gallop: 0 },
    quieto: true, kMov: 0, bloqueado: false, bloqGiro: 0, impide: false,
    esperaFreno: 0, tendidoT: 0
  };
  const rs = {
    incl: resorte(7), curva: resorte(5), cLat: resorte(5), cuello: resorte(4), acel: resorte(5), cola: resorte(4), falta: resorte(22)
  };
  // marco del caballo: punto neutro de cada pata en movimiento (la pisada queda centrada en él a mitad del apoyo)
  const NEUTRO = IDS.map((id, i) => {
    const p = patas[i];
    return p.delantera ? { x: 0.72, z: p.cascoReposo.z } : { x: -0.45, z: p.cascoReposo.z };
  });
  const legs = IDS.map((id, i) => ({
    id, i, front: patas[i].delantera, lado: patas[i].lado, par: [1, 0, 3, 2][i],
    desf: 0, fase: 0, apoyado: true, anticipar: false, esperando: false, fijo: true, s: 0, u: 0,
    suelo: { x: 0, z: 0 }, pinza: null, incl: 0, desp: { x: 0, z: 0, y: HOOF_H, incl: 0, ok: false, vx: 0, vz: 0, vy: 0, vi: 0, men: 0, vmen: 0, t: 0 },
    v0: { x: 0, z: 0, y: 0, i: 0, men: -0.087, vmen: 0 }, Tf: 0.4,
    p0: { x: 0, z: 0, y: HOOF_H, incl: 0, rumbo: 0 }, p1: { x: 0, z: 0 }, cruza: 0, paso: 0, rumboPisada: 0, ym: 1,
    casco: new THREE.Vector3(), op: { casco: null, apoyado: true, inclinacion: 0, rumbo: 0, menudillo: 0, carpo: 0, flexCasco: 0, mezclaCasco: 0 }
  }));

  // ---------- marcos ----------
  function aSuelo(P, px, pz, out) {
    const c = Math.cos(P.rumbo), s = Math.sin(P.rumbo);
    out.x = P.x + px * c + pz * s; out.z = P.z - px * s + pz * c;
    return out;
  }
  function aCaballo(P, gx, gz, out) {
    const c = Math.cos(P.rumbo), s = Math.sin(P.rumbo), dx = gx - P.x, dz = gz - P.z;
    out.x = dx * c - dz * s; out.z = dx * s + dz * c;
    return out;
  }
  // punto del caballo alrededor del que gira: en marcha, cerca del centro; parado, cerca de la pata de adentro
  // (giro sobre los posteriores, §5.4)
  const _pv = { x: 0, z: 0 };
  function pivote(v, w) {
    const k = 1 - sstep(0, 0.8, v), lado = w >= 0 ? -1 : 1;
    _pv.x = lerp(0.1, -0.33, k); _pv.z = lerp(0, 0.12 * lado, k);
    return _pv;
  }
  // avanza una pose (x, z, rumbo) con velocidad v y giro w durante h: el pivote avanza y el cuerpo gira a su alrededor
  const _g = { x: 0, z: 0 };
  function integrar(P, v, w, h) {
    const pv = pivote(v, w);
    aSuelo(P, pv.x, pv.z, _g);
    const rm = P.rumbo + w * h / 2;
    _g.x += Math.cos(rm) * v * h; _g.z -= Math.sin(rm) * v * h;
    P.rumbo += w * h;
    const c = Math.cos(P.rumbo), s = Math.sin(P.rumbo);
    P.x = _g.x - (pv.x * c + pv.z * s); P.z = _g.z - (-pv.x * s + pv.z * c);
  }
  const aceleracion = (v) => (v < 1.6 ? 1 : v < 3.5 ? 1.5 : v < 5.5 ? 2 : 3);
  const frenado = (v) => (v > 5 ? 3.5 : v > 2.2 ? 2 : 1.5);
  // pose futura (t segundos), con v yendo a vObj y w a wObj
  const fut = { x: 0, z: 0, rumbo: 0, v: 0 };
  function predecir(t, out = fut) {
    out.x = pose.x; out.z = pose.z; out.rumbo = pose.rumbo;
    let v = est.v, w = est.w, a = est.a;
    const n = Math.max(1, Math.min(10, Math.ceil(t / 0.06))), h = t / n;
    for (let k = 0; k < n; k++) {
      const aDes = clamp((est.vObj - v) * 1.8, -frenado(v), aceleracion(v));
      a += (aDes - a) * (1 - Math.exp(-h / 0.25));
      v = Math.max(0, v + a * h);
      w = est.wObj + (w - est.wObj) * Math.exp(-h / 0.3);
      integrar(out, v, w, h);
    }
    out.v = v;
    return out;
  }

  // ---------- patrón ----------
  // tipo de patrón según la marcha pedida y la velocidad real (§6): de parado o lento siempre se arranca al paso;
  // el galope se levanta desde 2,2 m/s (sin pasar por el trote) y al frenar se vuelve al paso desde 2,2 m/s
  function elegirTipo() {
    const v = est.v, g = marcha.nombre, act = est.tipo;
    if (est.vObj < 0.01 && v < 0.3) return Math.abs(est.wObj) > 0.05 || (act === 'giro' && v < 0.05) ? 'giro' : 'walk';
    let K = g === 'stand' ? 'walk' : g;
    if (K === 'gallop' && v < 2.2) K = act === 'trot' && v >= 1.2 ? 'trot' : 'walk';
    if (K === 'trot' && v < 1.2) K = 'walk';
    if (K === 'walk' && v > 2.3) K = act === 'gallop' && v >= 2.2 ? 'gallop' : 'trot';
    if (K === 'trot' && v > 6) K = 'gallop';
    if (K === 'giro') K = 'walk';
    return K;
  }
  // desfase objetivo de cada pata = −t (+ corrimiento común, elegido para que el cambio sea el menor posible)
  const desfObj = (i) => frac(est.corr - est.P.t[i]);
  function elegirCorrimiento() {
    let mejor = 0, menor = Infinity;
    for (let k = 0; k < 200; k++) {
      const c = k / 200;
      let e = 0;
      for (const q of legs) { const d = envolver(frac(c - est.P.t[q.i]) - q.desf); e += (q.apoyado ? 4 : 1) * d * d; }
      if (e < menor) { menor = e; mejor = c; }
    }
    est.corr = mejor;
  }

  // ---------- pisadas ----------
  const _f2 = { x: 0, z: 0, rumbo: 0, v: 0 }, _a = { x: 0, z: 0 }, _b = { x: 0, z: 0 };
  // punto neutro en el marco del caballo: en movimiento NEUTRO, parado el lugar de reposo (cuadrado)
  function neutro(q, v, out) {
    const k = sstep(0.05, 0.7, v), r = patas[q.i].cascoReposo, n = NEUTRO[q.i];
    const gal = est.pesos.gallop * (q.front ? 0 : 0.05);
    out.x = lerp(r.x, n.x + gal, k); out.z = r.z;
    return out;
  }
  function planificar(q) {
    const f = est.f, d = est.d[q.i];
    const tPisa = Math.max(0, 1 - q.fase) / f, tMedio = tPisa + d / (2 * f);
    const P = predecir(tMedio);
    neutro(q, P.v, _a);
    aSuelo(P, _a.x, _a.z, q.p1);
    // separación con el compañero apoyado (manos o patas), en el marco del caballo al pisar
    q.cruza = 0;
    const o = legs[q.par];
    if (o.apoyado) {
      const T = predecir(tPisa, _f2);
      aCaballo(T, q.p1.x, q.p1.z, _a); aCaballo(T, o.suelo.x, o.suelo.z, _b);
      const lat = q.lado * (_a.z - _b.z);           // > 0: del lado propio
      if (lat < 0.06) {
        q.cruza = 1;
        const sep = 0.15 - Math.abs(_a.x - _b.x);
        if (sep > 0 && Math.hypot(_a.x - _b.x, _a.z - _b.z) < 0.17) {
          _a.x = _b.x + (q.front || _a.x >= _b.x ? 0.15 : -0.15);
          aSuelo(T, _a.x, _a.z, q.p1);
        }
      }
    }
  }
  function despegar(q) {
    q.apoyado = false; q.u = 0;
    // el vuelo sale de donde estaba el casco en el último cuadro apoyado (en el breakover, rotado sobre la pinza) y
    // con su giro e inclinación: el IK recibe en el primer cuadro del vuelo lo mismo que en el último apoyado y con
    // mezclaCasco = 0 resuelve igual (la compensación de la cuartilla, la escápula y el breakover que agrega el IK se
    // va de a poco con mezclaCasco). Se guarda en el SUELO: con q.casco (marco del caballo) y la pose ya avanzada en
    // este subpaso, el casco saltaba v·h hacia adelante al despegar
    const dp = q.desp;
    // y con la velocidad que traía (en el suelo): si despega antes de terminar el breakover (anticipado) el casco
    // venía girando sobre la pinza; el vuelo la continúa y la apaga (ver posarPatas), así el despegue es C1
    if (dp.ok) {
      // (desde la foto del último cuadro apoyado pasaron dp.t segundos, uno o más subpasos: el casco sigue con su
      // velocidad, sin un cuadro quieto)
      const h = dp.t;
      q.p0.x = dp.x + dp.vx * h; q.p0.z = dp.z + dp.vz * h; q.p0.y = dp.y + dp.vy * h; q.p0.incl = dp.incl + dp.vi * h;
      q.v0.x = dp.vx; q.v0.z = dp.vz; q.v0.y = dp.vy; q.v0.i = dp.vi;
      q.v0.men = dp.men + dp.vmen * h; q.v0.vmen = dp.vmen;
    } else {
      aSuelo(pose, q.casco.x, q.casco.z, q.p0); q.p0.y = q.casco.y; q.p0.incl = q.incl;
      q.v0.x = q.v0.z = q.v0.y = q.v0.i = q.v0.vmen = 0; q.v0.men = -0.087;
    }
    q.Tf = Math.max(0.05, (1 - est.d[q.i]) / est.f);
    dp.ok = false;
    q.p0.rumbo = q.op.rumbo;
    q.pinza = null;
    planificar(q);
    q.paso = Math.hypot(q.p1.x - q.p0.x, q.p1.z - q.p0.z);
  }
  function guardarDespegue(q, dt) {
    const dp = q.desp, px = dp.x, pz = dp.z, py = dp.y, pi = dp.incl, pm = dp.men, habia = dp.ok;
    dp.men = q.op.menudillo; dp.t = 0;
    aSuelo(pose, q.casco.x, q.casco.z, dp); dp.y = q.casco.y; dp.incl = q.incl; dp.ok = true;
    if (dt > 0) {
      if (habia) { dp.vx = (dp.x - px) / dt; dp.vz = (dp.z - pz) / dt; dp.vy = (dp.y - py) / dt; dp.vi = (dp.incl - pi) / dt; dp.vmen = (dp.men - pm) / dt; }
      else dp.vx = dp.vz = dp.vy = dp.vi = dp.vmen = 0;
    }
  }
  function pisar(q) {
    q.apoyado = true; q.u = 1; q.s = 0; q.incl = 0; q.pinza = null;
    q.suelo.x = q.p1.x; q.suelo.z = q.p1.z; q.rumboPisada = pose.rumbo;
  }
  const lejosDelReposo = (q) => {
    aCaballo(pose, q.suelo.x, q.suelo.z, _a);
    const r = patas[q.i].cascoReposo;
    return Math.hypot(_a.x - r.x, _a.z - r.z) > 0.05;
  };

  // arrancar desde parado: la primera pata en moverse es una mano (§6.3); en el giro en el lugar, la de adentro
  function arrancar() {
    est.quieto = false;
    est.tipo = elegirTipo();
    patron(est.tipo, est.v, est.mano, est.P);
    est.f = est.P.f; est.d = est.P.d.slice(); est.corr = 0;
    legs.forEach((q, i) => { q.desf = desfObj(i); q.fijo = false; });
    const prim = est.tipo === 'giro' ? (est.wObj > 0 ? 1 : 0) : 0;
    est.Phi = est.d[prim] - 0.02 - legs[prim].desf;
    legs.forEach((q, i) => {
      q.fase = frac(est.Phi + q.desf);
      q.esperando = i !== prim && q.fase >= est.d[i];
    });
    for (const k in est.pesos) est.pesos[k] = k === est.tipo ? 1 : 0;
  }

  // ---------- un subpaso de la simulación ----------
  function subpaso(h) {
    for (const q of legs) q.desp.t += h;   // tiempo desde la foto del despegue (guardarDespegue)
    // velocidad (aceleración con tirón limitado) y giro (resorte crítico)
    const aDes = est.bloqueado ? clamp(-est.v * 4, -frenado(est.v) * 1.6, 0) : clamp((est.vObj - est.v) * 1.8, -frenado(est.v), aceleracion(est.v));
    est.a += (aDes - est.a) * (1 - Math.exp(-h / 0.25));
    est.v += est.a * h;
    if (est.v < 0) { est.v = 0; est.a = Math.max(0, est.a); }
    if (est.vObj === 0 && est.v < 0.004) { est.v = 0; est.a = 0; }
    const wn = 5;
    est.wd += (wn * wn * (est.wObj - est.w) - 2 * wn * est.wd) * h;
    est.w += est.wd * h;
    const parando = est.vObj < 0.01 && Math.abs(est.wObj) < 0.05;
    if (est.quieto) {
      if (!parando) arrancar();
      else { est.w = 0; est.wd = 0; }
    }
    if (est.quieto) { est.kMov = Math.max(0, est.kMov - h / 0.5); return; }
    est.kMov = Math.min(1, est.kMov + h / 0.5);
    if (parando && Math.abs(est.w) < 0.01 && est.v < 0.05) est.w = 0;

    // patrón: tipo, mano, f y d filtrados, desfases objetivo
    const tipo = elegirTipo();
    // mano de galope: la de adentro de la curva, con histéresis (§1.4); el cambio se hace en el aire
    const pedida = est.wObj > 0.15 ? -1 : est.wObj < -0.15 ? 1 : est.mano;
    if (tipo !== 'gallop') { if (Math.abs(est.wObj) > 0.05 && pedida !== est.mano) { est.mano = pedida; est.manoPend = true; } }
    else if (pedida !== est.mano) {
      est.manoT += h;
      const suspension = !legs[0].apoyado && !legs[1].apoyado && !legs[2].apoyado && !legs[3].apoyado;
      const adelantada = legs[est.mano > 0 ? 0 : 1];
      if (est.manoT > 0.4 && (suspension || (!adelantada.apoyado && adelantada.u < 0.1))) { est.mano = pedida; est.manoPend = true; est.manoT = 0; }
    } else est.manoT = 0;
    patron(tipo, est.v, est.mano, est.P);
    if (tipo !== est.tipo || est.manoPend) { est.tipo = tipo; est.manoPend = false; elegirCorrimiento(); }
    const kf = 1 - Math.exp(-h / 0.25);
    est.f += (est.P.f - est.f) * kf;
    for (let i = 0; i < 4; i++) est.d[i] += (est.P.d[i] - est.d[i]) * kf;
    const kp = 1 - Math.exp(-h / 0.35);
    for (const k in est.pesos) est.pesos[k] += ((k === tipo ? 1 : 0) - est.pesos[k]) * kp;

    // pose en el suelo
    integrar(pose, est.v, est.w, h);
    // reloj
    est.Phi += est.f * h;
    const rate = (tipo === 'gallop' ? 1.2 : 0.9) * h;
    for (const q of legs) {
      const d = est.d[q.i];
      // el desfase solo se corrige en el aire, con una rampa suave (sin escalones en la velocidad de la fase)
      if (!q.apoyado && q.u < 0.6) q.desf = frac(q.desf + clamp(envolver(desfObj(q.i) - q.desf) * 6 * h, -rate, rate) * sstep(0, 0.15, q.u) * (1 - sstep(0.45, 0.6, q.u)));
      const nf = frac(est.Phi + q.desf);
      const df = envolver(nf - q.fase);
      const envolvio = df > 0 && q.fase > 0.5 && nf < 0.5;
      if (q.apoyado) {
        // despegue anticipado (§7.3): la pata ya no alcanza su casco al final del apoyo; despega antes y su vuelo dura
        // un poco más (la fase no salta, así el cuerpo no tiembla)
        if (q.anticipar && !q.fijo && !q.esperando && nf < d) { q.anticipar = false; despegar(q); q.fase = nf; continue; }
        q.anticipar = false;
        if (q.esperando) { if (envolvio) q.esperando = false; }
        else if (!q.fijo && nf >= d && nf < d + 0.45) {
          if (parando && est.v < 0.05 && !lejosDelReposo(q)) q.fijo = true;
          else despegar(q);
        }
        q.s = q.esperando || q.fijo ? q.s : clamp01(nf / d);
      } else if (envolvio) {
        pisar(q);
        if (parando && est.v < 0.05 && !lejosDelReposo(q)) q.fijo = true;
      } else {
        if (df > 0) q.u += (1 - q.u) * df / Math.max(1e-4, 1 - q.fase);
        q.u = Math.min(q.u, 0.999);
      }
      q.fase = nf;
      if (!q.apoyado && q.u < 0.7) planificar(q);
    }
    let todosFijos = true;
    for (const q of legs) { if (!parando) q.fijo = false; if (!q.apoyado || !q.fijo) todosFijos = false; }
    if (parando && est.v < 0.05 && todosFijos) { est.quieto = true; est.v = 0; est.a = 0; }
  }

  // ---------- marcha real (la que lleva el caballo, no la pedida) ----------
  // stand | walk | trot | gallop (+ tendido); el giro en el lugar cuenta como quieto (girando)
  const real = { nombre: 'walk', tendido: false, giro: false };
  marcha.real = real;
  function actualizarReal() {
    let n;
    if (est.quieto || (est.v < 0.05 && est.tipo !== 'giro')) n = 'stand';
    else if (est.tipo === 'giro') n = 'stand';
    else n = est.tipo;
    const t = n === 'gallop' && est.v >= 8, g = est.tipo === 'giro' && !est.quieto;
    if (n !== real.nombre || t !== real.tendido || g !== real.giro) { real.nombre = n; real.tendido = t; real.giro = g; cambioEtiqueta = true; }
  }
  // una marcha está establecida cuando el caballo ya la lleva a (casi) su velocidad: recién ahí la palanca puede
  // pedir la siguiente (sube de a una aunque la palanca siga a fondo)
  function establecida(nombre) {
    if (nombre === 'stand') return true;
    const vo = velocidadObjetivo(nombre, nombre === 'gallop' && marcha.tendido, est.mult);
    return est.tipo === nombre && est.v >= 0.85 * vo;
  }

  // ---------- conducción (palanca o flechas) ----------
  let cambioEtiqueta = true;
  function conducir(entrada, dt) {
    const actual = ORDEN_MARCHAS.indexOf(marcha.nombre);
    if (entrada && entrada.y > 0.15) {
      // adelante: sube de marcha según cuánto se inclina, de a una (cada una se establece antes de la siguiente);
      // al soltar se mantiene
      const pedida = entrada.y > 0.85 ? 3 : entrada.y > 0.5 ? 2 : 1;
      if (pedida > actual && establecida(marcha.nombre)) setGait(ORDEN_MARCHAS[actual + 1]);
      // a fondo y sostenida con el galope ya establecido: galope tendido
      if (marcha.nombre === 'gallop' && entrada.y > 0.85 && establecida('gallop')) {
        est.tendidoT += dt;
        if (est.tendidoT > 1 && !marcha.tendido) { marcha.tendido = true; cambioEtiqueta = true; }
      } else est.tendidoT = 0;
      est.esperaFreno = 0;
    } else if (entrada && entrada.y < -0.4) {
      // atrás: frena de a una marcha por vez mientras se mantiene (del tendido primero al galope corto)
      est.esperaFreno -= dt;
      if (est.esperaFreno <= 0) {
        if (marcha.tendido) { marcha.tendido = false; cambioEtiqueta = true; est.esperaFreno = 0.6; }
        else if (actual > 0) { setGait(ORDEN_MARCHAS[actual - 1]); est.esperaFreno = 0.6; }
      }
      est.tendidoT = 0;
    } else { est.esperaFreno = 0; est.tendidoT = 0; }
    est.wObj = entrada ? -entrada.x * giroMaximo(marcha.nombre, marcha.tendido, est.v) : 0;
  }

  // ---------- alambrados y obstáculos ----------
  // Contorno del caballo visto desde arriba (marco del caballo): hocico, cabeza, pecho, costillas, grupa y cola,
  // más círculos sobre el eje (campo.solidoEn) para que un poste, un tronco, una oveja o la hoja de una tranquera
  // que quede entera adentro del contorno también cuenten. El caballo se frena antes de tocar nada con un margen
  // (adelante `margen`, a los costados hasta 15 cm, para pasar por las tranqueras de 3,8 m); parado puede girar,
  // pero no hacia el lado en que la cabeza o la grupa chocarían.
  const CX = [1.85, 1.55, 1.1, 0.3, -0.6, -0.85, -0.6, 0.3, 1.1, 1.55];
  const CZ = [0, 0.17, 0.33, 0.38, 0.33, 0, -0.33, -0.38, -0.33, -0.17];
  const EJE_X = [1.62, 1.2, 0.7, 0.2, -0.3, -0.68], EJE_R = [0.17, 0.3, 0.36, 0.38, 0.36, 0.3];
  const NC = CX.length, _cont = Array.from({ length: NC }, () => ({ x: 0, z: 0 })), _e = { x: 0, z: 0 };
  function contorno(P, margen = 0, out = _cont) {
    const ml = Math.min(margen, 0.15);
    for (let k = 0; k < NC; k++) aSuelo(P, CX[k] + (CX[k] > 1 ? margen : Math.sign(CX[k]) * ml), CZ[k] + Math.sign(CZ[k]) * ml, out[k]);
    return out;
  }
  function toca(P, margen) {
    const c = contorno(P, margen);
    for (let k = 0; k < NC; k++) {
      const a = c[k], b = c[(k + 1) % NC];
      if (campo.bloqueado(a.x, a.z, b.x, b.z)) return true;
    }
    if (campo.solidoEn) {
      const ml = Math.min(margen, 0.15);
      for (let k = 0; k < EJE_X.length; k++) {
        aSuelo(P, EJE_X[k], 0, _e);
        if (campo.solidoEn(_e.x, _e.z, EJE_R[k] + (k === 0 ? margen : ml))) return true;
      }
    }
    return false;
  }
  // pose si frena ahora (a la desaceleración de frenado de emergencia), con el giro que se está pidiendo
  // (la misma dinámica que subpaso con est.bloqueado)
  const _fr = { x: 0, z: 0, rumbo: 0 };
  function frenando(t, out, wObj) {
    out.x = pose.x; out.z = pose.z; out.rumbo = pose.rumbo;
    let v = est.v, w = est.w, a = est.a;
    const n = Math.max(2, Math.ceil(t / 0.05)), h = t / n;
    for (let k = 0; k < n; k++) {
      a += (clamp(-v * 4, -frenado(v) * 1.6, 0) - a) * (1 - Math.exp(-h / 0.25));
      v = Math.max(0, v + a * h);
      w = wObj + (w - wObj) * Math.exp(-h / 0.3);
      integrar(out, v, w, h);
    }
    return out;
  }
  function chocaFrenando(T, wObj) {
    const m = 0.4 + 0.03 * est.v;   // margen: 40 cm más el error de la predicción a mucha velocidad
    return toca(frenando(T * 0.35, _fr, wObj), m) || toca(frenando(T * 0.7, _fr, wObj), m) || toca(frenando(T, _fr, wObj), m);
  }
  const _p = { x: 0, z: 0, rumbo: 0 };
  function revisarAlambrados() {
    est.bloqGiro = 0;
    if (!campo || !campo.bloqueado) { est.bloqueado = false; return; }
    const quiere = velocidadObjetivo(marcha.nombre, marcha.tendido, est.mult) > 0;
    // también frena si va rápido aunque se haya pedido Quieto (el frenado normal no alcanzaría)
    const anda = est.v > 0.3;
    if (!quiere && !anda && Math.abs(est.wObj) < 0.01) { est.bloqueado = false; return; }
    // adelante: el recorrido que haría frenando ahora (3 muestras), con 40 cm de margen
    const T = est.v / (frenado(est.v) * 1.6) + 0.9;
    let choca = est.v > 0.05 || quiere ? chocaFrenando(T, est.wObj) : false;
    // si doblando choca pero derecho no, deja de doblar hacia el obstáculo y sigue
    if (choca && Math.abs(est.wObj) > 0.01 && !chocaFrenando(T, 0)) { est.bloqGiro = Math.sign(est.wObj); choca = false; }
    if (!est.bloqueado && (quiere || anda) && choca) est.bloqueado = true;
    else if (est.bloqueado && !choca) {
      // se libera cuando adelante hay 1,2 m libres (ya giró lo suficiente) o ya no se pide andar y está parado
      _p.x = pose.x; _p.z = pose.z; _p.rumbo = pose.rumbo;
      integrar(_p, 1.2, 0, 1);
      if (!toca(_p, 0.45) || (!quiere && est.v < 0.05)) est.bloqueado = false;
    }
    // girando parado o despacio: no meter la cabeza ni la grupa en el alambrado
    if (!est.bloqGiro && Math.abs(est.wObj) > 0.01 && est.v < 1) {
      _p.x = pose.x; _p.z = pose.z; _p.rumbo = pose.rumbo;
      integrar(_p, 0, Math.sign(est.wObj) * 0.2, 1);
      if (toca(_p, 0.12) && (!toca(pose, 0.12) || toca(_p, 0))) est.bloqGiro = Math.sign(est.wObj);
    }
  }

  // ---------- pose del caballo ----------
  const prm = {}, dbg = {};
  const poseCab = {
    cuerpo: { y: 0, cabeceo: 0, rolido: 0, curva: 0, lumbosacro: 0 },
    cuello: { flexion: 0, lateral: 0 }, cabeza: { flexion: 0, lateral: 0 },
    patas: {}, cola: { alzada: 0, balanceo: 0.6 }, crin: { agitacion: 0.008, frecuencia: 0.8 }, tiempo: 0
  };
  legs.forEach((q) => { poseCab.patas[q.id] = q.op; q.op.casco = q.casco; });
  const _t = new THREE.Vector3(), _q = { x: 0, z: 0 };

  function posarPatas() {
    const kM = est.kMov;
    for (const q of legs) {
      const op = q.op, pt = patas[q.i];
      if (q.apoyado) {
        aCaballo(pose, q.suelo.x, q.suelo.z, _q);
        q.casco.set(_q.x, HOOF_H, _q.z);
        // el casco apoyado no gira con el cuerpo: conserva el rumbo del suelo que tenía al pisar
        const rc = envolverAng(q.rumboPisada - pose.rumbo);
        op.rumbo = rc;
        // fracción del apoyo del breakover: la de la marcha, pero que dure al menos lo necesario para que la corona
        // (a ~10 cm de la pinza) no pase de aBO (mj: 5,77·ángulo·r/t²); con boB solo, en el trote y el galope el casco
        // rotaba 50–60° en ~40 ms (300 m/s² en la corona)
        const P = est.pesos, aBO = 25 * (P.walk + P.giro) + 90 * P.trot + 110 * P.gallop;
        const b = Math.min(0.35, Math.max(prm.boB, Math.sqrt(5.77 * prm.boA * 0.1 / aBO) * est.f / est.d[q.i])), s = q.s;
        let incl = 0;
        if (!q.fijo && !q.esperando && s > 1 - b) {
          incl = prm.boA * mj((s - (1 - b)) / b);
          if (!q.pinza) { q.pinza = { x: 0, z: 0 }; aSuelo(pose, _q.x + pt.pinza.x * Math.cos(rc), _q.z - pt.pinza.x * Math.sin(rc), q.pinza); }
          aCaballo(pose, q.pinza.x, q.pinza.z, _q);
          caballo.cascoConPinza(_t.set(_q.x, 0, _q.z), incl, q.casco, pt, rc);
        } else q.pinza = null;
        q.incl = incl;
        const e0 = -0.087 * kM, sl = q.esperando || q.fijo ? 0.5 : s;
        op.apoyado = true; op.inclinacion = incl; op.carpo = 0; op.flexCasco = 0; op.mezclaCasco = 0;
        op.compensa = q.esperando || q.fijo ? 1 : sstep(0, 0.12, s);
        // el menudillo baja bajo carga: joroba con derivada nula al pisar y al despegar (sin(πs)^0.8 tenía derivada
        // infinita en los dos extremos: el menudillo saltaba en el primer y el último cuadro del apoyo)
        op.menudillo = (e0 + (prm.emax * kM - e0) * sstep(0, 0.4, sl) * sstep(0, 0.4, 1 - sl)) * (q.fijo ? kM : 1);
      } else {
        const u = q.u, fr = q.front;
        const kPaso = 0.45 + 0.55 * clamp01(q.paso / 1.0);
        // retracción: hasta 1,5 cm, con la vuelta repartida en el último 25 % del vuelo
        const av = avance(u, Math.min((fr ? prm.retM : prm.retP) * clamp01(q.paso / 0.6), 0.015 / Math.max(q.paso, 0.05)), 0.75);
        // continuación de la velocidad del despegue: v0·T·u(1 − u)³ (derivada v0 en u = 0, se apaga con derivada nula)
        const cont = u * (1 - u) ** 3 * q.Tf;
        let gx = q.p0.x + (q.p1.x - q.p0.x) * av + q.v0.x * cont, gz = q.p0.z + (q.p1.z - q.p0.z) * av + q.v0.z * cont;
        if (q.cruza) { const sb = 0.12 * Math.sin(Math.PI * u) ** 2; gx += Math.cos(pose.rumbo) * sb; gz -= Math.sin(pose.rumbo) * sb; }
        aCaballo(pose, gx, gz, _q);
        const pivota = est.tipo === 'giro' && !fr && q.lado === (est.w >= 0 ? -1 : 1);
        const H = (pivota ? 0.04 : (fr ? prm.hM : prm.hP) * kPaso);
        const alt = fr ? alturaVuelo(u, prm.pkM, 0.24, 0.45, 0.80) : alturaVuelo(u, prm.pkP, 0.22, 0.30, 0.75);
        q.casco.set(_q.x, lerp(q.p0.y, HOOF_H, sstep(0, 0.6, u)) + H * alt + q.v0.y * cont, _q.z);
        const j = joroba(u, prm.pkE);
        q.incl = q.p0.incl * (1 - sstep(0, 0.35, u)) + q.v0.i * cont;
        op.apoyado = false; op.compensa = 1; op.inclinacion = q.incl; op.rumbo = q.p0.rumbo * (1 - sstep(0, 0.5, u));
        op.carpo = fr ? prm.carpo * kPaso * joroba(u, prm.pkC) : 0;
        // el menudillo sale del valor y la velocidad que traía del apoyo (si despegó antes de terminar el apoyo no
        // estaba en −0,087) y va a la flexión del vuelo
        op.menudillo = -0.087 - (fr ? prm.menM : prm.menP) * kPaso * j + (q.v0.men + 0.087) * (1 - sstep(0, 0.3, u)) + q.v0.vmen * cont;
        op.flexCasco = prm.flexC * kPaso * j;
        op.mezclaCasco = sstep(0, 0.25, u) * (1 - sstep(0.7, 0.97, u));
      }
    }
  }

  function posarCuerpo(h) {
    const kM = est.kMov, v = est.v;
    // amplitud: llena en la marcha, menor al arrancar y frenar
    const kA = kM * (est.pesos.giro + (1 - est.pesos.giro) * (0.35 + 0.65 * sstep(0, 1.6, v)));
    let yC = 0, yG = 0, nod = 0, rol = 0, ls = 0, colaB = 0;
    for (const q of legs) {
      const ph = q.fase;
      if (q.front) { yC += nucleo(prm.kCruz, ph); nod += nucleo(prm.kCuello, ph); }
      else {
        yG += nucleo(prm.kGrupa, ph);
        rol += q.lado * prm.rol * Math.cos(2 * Math.PI * (ph - est.d[q.i] / 2));
        ls += est.pesos.gallop * 0.045 * Math.cos(2 * Math.PI * (ph + 0.05)) + (1 - est.pesos.gallop) * 0.012 * Math.cos(4 * Math.PI * (ph - 0.1));
        colaB += est.pesos.gallop * 0.06 * Math.cos(2 * Math.PI * (ph + 0.3));
      }
    }
    yC *= kA; yG *= kA; nod *= kA; rol *= kA; ls *= kA;
    // aceleración: al acelerar baja la nariz, al frenar baja la grupa y sube el cuello (§4.2, §6.3)
    const acel = moverResorte(rs.acel, est.a, h);
    // el cabeceo gira alrededor de PIVOTE (cerca del centro de masa, caballo.js): galope ±4° (8° de ROM, §4.2)
    const cab = Math.atan2(yC - yG, 0.9) * lerp(1, 0.75, est.pesos.gallop) - (acel > 0 ? 0.0175 : 0.026) * acel;
    let y = (yC + yG) / 2 + prm.base * kM;
    // inclinación en la curva (§5.1)
    const lean = Math.sign(est.w) * Math.max(0, Math.atan(v * Math.abs(est.w) / G) - 0.05);
    const incl = moverResorte(rs.incl, lean, h);
    // el cuerpo nunca sube más de lo que alcanzan las patas apoyadas (§7.5)
    const c = Math.cos(cab), s = Math.sin(cab), px = PIVOTE[0], py = PIVOTE[1];
    let yMax = 1;
    for (const q of legs) {
      let peso;
      if (q.apoyado) peso = 1;
      else peso = sstep(0.3, 1, q.u);
      if (peso <= 0) continue;
      const pt = patas[q.i], T = pt.delantera ? pt.hombro : pt.cadera;
      // en el aire: la pisada vista desde el caballo en el momento de pisar (el cuerpo sigue avanzando hasta entonces)
      let hx, inc = 0;
      if (q.apoyado) { hx = q.casco.x; inc = q.incl; if (inc > 0.01) { aCaballo(pose, q.pinza.x, q.pinza.z, _q); hx = _q.x - pt.pinza.x * Math.cos(q.op.rumbo); } }
      else { aCaballo(predecir(Math.max(0, 1 - q.fase) / est.f, _f2), q.p1.x, q.p1.z, _q); hx = _q.x; }
      // el cabeceo gira el tope del miembro alrededor del pivote
      const tx = px + (T.x - px) * c - (T.y - py) * s, ty = py + (T.x - px) * s + (T.y - py) * c;
      const ym = alcance(pt.delantera, hx - tx, inc) - (ty - T.y);
      q.ym = ym;
      // (3 cm de margen: el suavizado de abajo deja el cuerpo un poco más alto que el límite, y lo que no alcanza lo
      // tiene que tomar el breakover del IK, que con el casco ya rotado 50–60° acorta poco y gira mucho)
      yMax = Math.min(yMax, lerp(0.3, ym - 0.03, peso));
    }
    dbg.y0 = y; dbg.yMax = yMax; dbg.cab = cab; dbg.yC = yC; dbg.yG = yG; dbg.nod = nod; dbg.acel = acel;
    // lo que hay que bajar el cuerpo para que lleguen las patas pasa por un resorte rápido (el límite tiene un
    // quiebre en cada pisada, cuando la pata está más estirada)
    const falta = y - softmin(y, -softmin(-yMax, 0.07, 0.03), 0.04);
    y -= h > 0 ? moverResorte(rs.falta, falta, h) : (rs.falta.x = falta);
    // al final del apoyo, si el cuerpo queda más alto de lo que la pata alcanza, la pata despega ya (§7.3)
    for (const q of legs) if (q.apoyado && !q.fijo && !q.esperando && q.s > 0.8 && y > q.ym + 0.008) q.anticipar = true;
    // curva de la columna y del cuello hacia el lado del giro (§5.2)
    const giroLugar = est.pesos.giro;
    const curvaObj = lerp(clamp(0.25 * 1.7 * est.w / Math.max(v, 0.3), -0.1, 0.1), 0.06 * clamp(est.wObj / 0.3, -1, 1), giroLugar);
    const curva = moverResorte(rs.curva, curvaObj, h);
    const cLat = moverResorte(rs.cLat, clamp(1.5 * curva + 0.25 * est.wObj, -0.35, 0.35), h);
    const cuelloBase = moverResorte(rs.cuello, prm.cuello * kM + (acel < 0 ? -0.03 * acel : -0.015 * acel), h);

    const cu = poseCab.cuerpo;
    cu.y = y; cu.cabeceo = cab; cu.rolido = incl + rol; cu.curva = curva; cu.lumbosacro = ls; cu.pivote = PIVOTE;
    poseCab.cuello.flexion = cuelloBase + nod - 0.5 * cab;
    poseCab.cuello.lateral = cLat;
    // la cabeza compensa el cabeceo del cuello al paso y al trote (§4.3); en el galope acompaña a las manos
    poseCab.cabeza.flexion = prm.cabeza * kM + lerp(-0.5, 0.2, est.pesos.gallop) * nod - 0.3 * cab;
    poseCab.cabeza.lateral = 0.4 * cLat;
    poseCab.cola.alzada = moverResorte(rs.cola, prm.cola * kM, h) + colaB * kA;
    poseCab.cola.balanceo = lerp(0.6, prm.sway, kM);
    poseCab.cola.viento = 0.4 + v; poseCab.cola.giro = est.w;
    poseCab.crin.viento = v;
    poseCab.crin.agitacion = 0.006 + kM * (0.0045 * v + 0.004 * giroLugar);
    poseCab.crin.frecuencia = Math.max(0.7, est.f * kM);
  }

  // ---------- paso de un cuadro ----------
  // lo que usa la montura (estribos, jinete): marcha real (pesos de cada tipo), velocidad y frecuencia
  const cur = { stride: 0, freq: 0, v: 0, pesos: est.pesos };
  function paso(dt, mult = 1, tiempo = 0) {
    est.mult = mult;
    revisarAlambrados();
    est.vObj = est.bloqueado ? 0 : velocidadObjetivo(marcha.nombre, marcha.tendido, mult);
    // lo que pide el usuario y no se puede (main.js muestra el aviso con loco.bloqueado)
    const pide = velocidadObjetivo(marcha.nombre, marcha.tendido, mult) > 0;
    est.impide = (est.bloqueado && pide) || (est.bloqGiro !== 0 && Math.sign(est.wObj) === est.bloqGiro);
    if ((est.bloqGiro && Math.sign(est.wObj) === est.bloqGiro) || (est.bloqueado && est.v > 0.3)) est.wObj = 0;
    const n = Math.ceil(dt / H_SUB - 1e-6), h = n ? dt / n : 0;
    for (let k = 0; k < n; k++) subpaso(h);
    pose.velocidad = est.v; pose.giro = est.w;
    mezclarParametros(est.pesos, est.v, (est.d[0] + est.d[1]) / 2, (est.d[2] + est.d[3]) / 2, prm);
    posarPatas();
    posarCuerpo(dt);
    poseCab.tiempo = tiempo;
    caballo.aplicarPose(poseCab);
    // dónde quedó cada casco apoyado (en el SUELO), por si despega en el próximo subpaso
    for (const q of legs) if (q.apoyado) guardarDespegue(q, dt);
    // si al final del apoyo el IK tuvo que rotar el casco sobre la pinza más de lo previsto, la pata despega en el
    // próximo subpaso; si el casco llegó a darse vuelta (la pata no alcanza ni con el breakover), despega ya y se
    // vuelve a posar este cuadro
    let rehacer = false;
    for (const q of legs) {
      if (!q.apoyado || q.fijo || q.s < 0.75) continue;
      const extra = (ikPatas[q.i].inclinacion || 0) - q.op.inclinacion;
      // (el IK compensa con el breakover de forma suave: apenas empieza a agregar, la pata despega en el próximo
      // subpaso; con 0,03 rad el breakover alcanzaba a girar 0,4 rad en un cuadro antes del despegue)
      if (extra > 0.3) { despegar(q); rehacer = true; } else if (extra > 0.005) q.anticipar = true;
    }
    if (rehacer) { posarPatas(); caballo.aplicarPose(poseCab); for (const q of legs) if (q.apoyado) guardarDespegue(q, 0); }
    actualizarReal();
    cur.v = est.v; cur.freq = est.f * est.kMov; cur.pesos = est.pesos;
    cur.stride = est.kMov * Math.max(Math.min(0.5, 0.09 * est.v), 0.12 * est.pesos.giro);
  }

  // ---------- régimen: deja la marcha actual andando en línea recta en la fase Φ (para __debug.freeze) ----------
  const _r = { x: 0, z: 0, rumbo: 0 };
  function poseEn(t, out) {   // pose en línea recta a velocidad constante, t puede ser negativo
    out.rumbo = pose.rumbo;
    out.x = pose.x + Math.cos(pose.rumbo) * est.v * t; out.z = pose.z - Math.sin(pose.rumbo) * est.v * t;
    return out;
  }
  function establecer(fase = est.Phi) {
    est.vObj = velocidadObjetivo(marcha.nombre, marcha.tendido, est.mult);
    est.v = est.vObj; est.a = 0; est.w = 0; est.wd = 0; est.wObj = 0; est.bloqueado = false;
    est.Phi = fase; est.manoT = 0; est.manoPend = false; est.corr = 0;
    for (const r in rs) { rs[r].x = 0; rs[r].v = 0; }
    est.quieto = marcha.nombre === 'stand';
    est.kMov = est.quieto ? 0 : 1;
    est.tipo = est.quieto ? 'walk' : elegirTipo();
    for (const k in est.pesos) est.pesos[k] = k === est.tipo ? 1 : 0;
    patron(est.tipo, est.v, est.mano, est.P);
    est.f = est.P.f; est.d = est.P.d.slice();
    mezclarParametros(est.pesos, est.v, est.d[0], est.d[2], prm);
    rs.cola.x = prm.cola * est.kMov; rs.cuello.x = prm.cuello * est.kMov;
    const f = est.f;
    for (const q of legs) {
      const i = q.i, d = est.d[i], pt = patas[i];
      q.desf = desfObj(i); q.fase = frac(fase + q.desf);
      q.esperando = false; q.pinza = null; q.incl = 0; q.cruza = 0; q.desp.ok = false; q.rumboPisada = pose.rumbo; q.p0.rumbo = 0; q.op.rumbo = 0;
      if (est.quieto) {
        const r = pt.cascoReposo;
        q.apoyado = true; q.fijo = true; q.s = 0.5;
        aSuelo(pose, r.x, r.z, q.suelo);
        continue;
      }
      q.fijo = false;
      neutro(q, est.v, _a);
      if (q.fase < d) {
        q.apoyado = true; q.s = q.fase / d;
        aSuelo(poseEn((d / 2 - q.fase) / f, _r), _a.x, _a.z, q.suelo);
      } else {
        q.apoyado = false; q.u = (q.fase - d) / (1 - d);
        // sin la velocidad de un despegue anterior: el menudillo arranca en su ángulo de vuelo (−0,087) y el casco donde
        // lo pone la trayectoria
        q.v0.x = q.v0.z = q.v0.y = q.v0.i = q.v0.vmen = 0; q.v0.men = -0.087; q.Tf = Math.max(0.05, (1 - d) / f);
        // donde despegó: su apoyo anterior, rotado sobre la pinza con el ángulo del breakover
        const g = aSuelo(poseEn(-(q.fase - d / 2) / f, _r), _a.x, _a.z, { x: 0, z: 0 });
        aCaballo(pose, g.x, g.z, _q);
        caballo.cascoConPinza(_t.set(_q.x + pt.pinza.x, 0, _q.z), prm.boA, q.casco, pt);
        aSuelo(pose, q.casco.x, q.casco.z, q.p0);
        q.p0.y = q.casco.y; q.p0.incl = prm.boA;
        neutro(q, est.v, _a);
        aSuelo(poseEn((1 - q.fase) / f + d / (2 * f), _r), _a.x, _a.z, q.p1);
        q.paso = Math.hypot(q.p1.x - q.p0.x, q.p1.z - q.p0.z);
      }
    }
    cambioEtiqueta = true;
    actualizarReal();
  }
  function reiniciar(fase = 0) { pose.x = 0; pose.z = 0; pose.rumbo = 0; establecer(fase); }
  function ubicar(x, z, rumbo) { pose.x = x; pose.z = z; pose.rumbo = rumbo; establecer(est.Phi); }
  reiniciar(0);

  return {
    pose, cur, conducir, paso, reiniciar, establecer, ubicar,
    get fase() { return frac(est.Phi); },
    get mano() { return est.mano; },
    // true mientras un alambrado u obstáculo impide avanzar o girar hacia donde pide el usuario
    get bloqueado() { return est.impide; },
    contorno: (margen = 0) => contorno(pose, margen).map((p) => ({ x: p.x, z: p.z })),
    toca: (margen = 0) => toca(pose, margen),
    // true una vez cada vez que cambia algo que muestra el panel (marcha real, galope tendido, mano)
    etiquetaCambio() { const c = cambioEtiqueta; cambioEtiqueta = false; return c; },
    patas: legs,
    estado: () => ({
      tipo: est.tipo, mano: est.mano > 0 ? 'derecha' : 'izquierda', tendido: marcha.tendido, v: est.v, a: est.a, w: est.w,
      vObj: est.vObj, wObj: est.wObj, f: est.f, d: est.d.slice(), Phi: est.Phi, quieto: est.quieto, bloqueado: est.bloqueado, impide: est.impide, real: { ...real },
      dbg: { ...dbg }, pesos: { ...est.pesos }, patas: legs.map((q) => ({ id: q.id, fase: q.fase, apoyado: q.apoyado, u: q.u, s: q.s, fijo: q.fijo, esperando: q.esperando, incl: q.incl }))
    })
  };
}
