// Arreos y jinete: mandil, montura (paneles, asiento con borrén y perilla, faldones, faldoncitos y costuras),
// cincha, estribos, cabezada, bocado, riendas y manos del jinete (solo visibles en la vista desde la montura).
//
// Todo se apoya en la piel REAL del caballo:
// - tronco: tabla de la piel medida con caballo.superficieTorso (rayos contra el SDF) en planos x = cte,
//   con una envolvente suave que puentea los huecos chicos (como un mandil de verdad) y nunca queda por
//   dentro de la piel. La montura es rígida: se apoya en una segunda envolvente, más lisa a lo largo del
//   lomo (máximo y promedio en ±5 cm), que tampoco queda nunca por dentro de la piel. Todo cuelga del grupo
//   body (lomo); detrás de la cruz y de la paleta, donde la piel no pertenece a los huesos de la mano.
// - cabeza: correas sobre caballo.headSurf (y sobre el anillo de la nuca de caballo.neckSurf para la testera
//   y el ahogadero, detrás de las orejas), colgadas de headInner.
// - riendas: cuero plano de 2 cm. Cada punto de apoyo sobre el cuello está anclado a un vértice de la piel y
//   se mueve con sus mismos pesos (sigue los 4 segmentos del cuello y la cabeza); la cara plana sigue la
//   normal de la piel. Vista exterior: descansan sobre el cuello y se juntan en la cruz. Vista desde la
//   montura: entran al puño por abajo (debajo del meñique), salen arriba bajo el pulgar y el seno cae a la
//   derecha de la cruz; al doblar (pose.giro, + = izquierda) la mano de ese lado se abre y tira hacia atrás,
//   esa rienda se tensa y la otra afloja.
// - jinete: actualizarMontura calcula el balanceo del jinete según la marcha (montura.jinete, con el ojo
//   sentado en lo hondo del asiento: jinete.ojo), que usan la cámara de la montura (js/camaras.js) y las manos.
import { V, lin, lerp, sstep, clamp01, TAU, prof } from './util.js';
import { shadowed } from './escena.js';

export function construirMontura({ caballo, coatBump }) {
  const { horse, body, headInner, headSurf, neckSurf, TOP, BOT } = caballo;
  const superficieTorso = caballo.superficieTorso;
  const mat = (color, roughness, bumpScale, extra = {}) => new THREE.MeshStandardMaterial({ color: lin(color), roughness, side: THREE.DoubleSide, bumpMap: coatBump, bumpScale, ...extra });
  const leatherMat = mat('#6a3a1e', 0.36, 0.0008, { envMapIntensity: 0.6 });
  const seatMat = mat('#4a2814', 0.5, 0.0004, { envMapIntensity: 0.5 });
  const panelMat = mat('#5a3119', 0.55, 0.0006, { envMapIntensity: 0.5 });
  const darkLeather = mat('#2a1810', 0.44, 0.0004, { envMapIntensity: 0.55 });
  const padMat = mat('#26303d', 0.92, 0.0015);
  const piping = mat('#d9d2c3', 0.8, 0.0008);
  const hiloMat = mat('#c2a477', 0.75, 0);
  const metalMat = mat('#cfd2d6', 0.28, 0, { metalness: 1, envMapIntensity: 1.2 });

  // =====================================================================================================
  // PIEL DEL TRONCO: tabla r(x, ang) = distancia desde el eje (x, yc(x), 0) en el plano x = cte
  // =====================================================================================================
  const ycDe = (x) => (prof(TOP, x) + prof(BOT, x)) / 2;
  const TX0 = -0.44, TDX = 0.025, TNX = 45, TNA = 41, TA1 = 2.0, TDA = TA1 / (TNA - 1);
  const tabla = new Float32Array(TNX * TNA), tablaS = new Float32Array(TNX * TNA);
  {
    const P = new V(), N = new V(), cruda = new Float32Array(TNX * TNA);
    for (let i = 0; i < TNX; i++) {
      const x = TX0 + i * TDX, yc = ycDe(x);
      for (let j = 0; j < TNA; j++) { superficieTorso(x, j * TDA, P, N); cruda[i * TNA + j] = Math.hypot(P.y - yc, P.z); }
    }
    // envolvente: máximo con los vecinos en x, suavizado en ang, y nunca por dentro de la piel
    const env = new Float32Array(TNX * TNA);
    for (let i = 0; i < TNX; i++) for (let j = 0; j < TNA; j++) {
      let m = 0;
      for (let di = -1; di <= 1; di++) { const ii = Math.max(0, Math.min(TNX - 1, i + di)); m = Math.max(m, cruda[ii * TNA + j]); }
      env[i * TNA + j] = m;
    }
    for (let i = 0; i < TNX; i++) for (let j = 0; j < TNA; j++) {
      const a = env[i * TNA + Math.abs(j - 1)], b = env[i * TNA + j], c = env[i * TNA + Math.min(TNA - 1, j + 1)];
      tabla[i * TNA + j] = Math.max(cruda[i * TNA + j], 0.25 * a + 0.5 * b + 0.25 * c);
    }
    // envolvente de la montura (rígida): máximo en ±R celdas y después promedio en ±R: nunca queda por dentro
    // (cada ventana del promedio contiene el punto) y no copia los bultos de la cruz ni del lomo
    const R = 2, mx = new Float32Array(TNX * TNA);
    for (let i = 0; i < TNX; i++) for (let j = 0; j < TNA; j++) {
      let m = 0;
      for (let di = -R; di <= R; di++) m = Math.max(m, tabla[Math.max(0, Math.min(TNX - 1, i + di)) * TNA + j]);
      mx[i * TNA + j] = m;
    }
    for (let i = 0; i < TNX; i++) for (let j = 0; j < TNA; j++) {
      let s = 0;
      for (let di = -R; di <= R; di++) s += mx[Math.max(0, Math.min(TNX - 1, i + di)) * TNA + j];
      tablaS[i * TNA + j] = s / (2 * R + 1);
    }
  }
  function radio(x, a, k) {
    const fi = Math.max(0, Math.min(TNX - 1.0001, (x - TX0) / TDX)), fj = Math.max(0, Math.min(TNA - 1.0001, Math.abs(a) / TDA));
    const i = fi | 0, j = fj | 0, u = fi - i, v = fj - j, q = i * TNA + j;
    const r0 = (tabla[q] * (1 - v) + tabla[q + 1] * v) * (1 - u) + (tabla[q + TNA] * (1 - v) + tabla[q + TNA + 1] * v) * u;
    if (!k) return r0;
    const r1 = (tablaS[q] * (1 - v) + tablaS[q + 1] * v) * (1 - u) + (tablaS[q + TNA] * (1 - v) + tablaS[q + TNA + 1] * v) * u;
    return r0 + (r1 - r0) * k;
  }
  const puntoPiel = (x, a, k, out) => { const r = radio(x, a, k); return out.set(x, ycDe(x) + r * Math.cos(a), r * Math.sin(a)); };
  const _a = new V(), _b = new V();
  // punto y normal hacia afuera (x a lo largo, ang 0 = lomo, + = lado derecho); k: 0 piel, 1 envolvente de la montura
  function piel(x, a, out, nOut, k = 0) {
    if (Math.abs(a) > TA1 - 0.02 || x < TX0 || x > TX0 + (TNX - 1) * TDX) return superficieTorso(x, a, out, nOut);
    puntoPiel(x, a, k, out);
    if (nOut) {
      puntoPiel(x + 0.004, a, k, _a).sub(out); puntoPiel(x, a + 0.01, k, _b).sub(out);
      nOut.crossVectors(_b, _a).normalize();
      if (nOut.y * Math.cos(a) + nOut.z * Math.sin(a) < 0) nOut.negate();
    }
    return out;
  }

  // paño sobre el tronco: map(u, v) -> [x, ang, separación, k (0 piel, 1 envolvente de la montura)]
  function drape(nu, nv, map, material) {
    const pos = [], uv = [], idx = [], P = new V(), N = new V();
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
      const u = i / nu, v = j / nv;
      const [x, ang, off, k = 0] = map(u, v);
      piel(x, ang, P, N, k).addScaledVector(N, off);
      pos.push(P.x, P.y, P.z); uv.push(u, v);
      if (i < nu && j < nv) { const a = i * (nv + 1) + j; idx.push(a, a + nv + 1, a + 1, a + 1, a + nv + 1, a + nv + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    const m = shadowed(new THREE.Mesh(g, material));
    body.add(m);
    return m;
  }
  // costuras: puntadas (rayitas de hilo) a lo largo de path(t) -> [x, ang, separación, k]; todas en una malla
  const hilo = { pos: [], nrm: [], idx: [] };
  function costura(path, n = 160) {
    const P = [], NN = [], L = [0];
    for (let i = 0; i <= n; i++) {
      const [x, a, off, k = 1] = path(i / n), p = new V(), q = new V();
      piel(x, a, p, q, k).addScaledVector(q, off + 0.0012);
      P.push(p); NN.push(q);
      if (i) L.push(L[i - 1] + p.distanceTo(P[i - 1]));
    }
    const at = (s, out, nOut) => {
      let i = 1; while (i < n && L[i] < s) i++;
      const f = (s - L[i - 1]) / Math.max(1e-6, L[i] - L[i - 1]);
      out.lerpVectors(P[i - 1], P[i], f); nOut.lerpVectors(NN[i - 1], NN[i], f).normalize();
    };
    const A = new V(), B = new V(), NA = new V(), NB = new V(), T = new V(), W = new V();
    for (let s = 0.004; s + 0.006 < L[n]; s += 0.0105) {
      at(s, A, NA); at(s + 0.006, B, NB);
      T.subVectors(B, A); W.crossVectors(NA, T).normalize().multiplyScalar(0.0011);
      const b = hilo.pos.length / 3;
      hilo.pos.push(A.x - W.x, A.y - W.y, A.z - W.z, A.x + W.x, A.y + W.y, A.z + W.z, B.x - W.x, B.y - W.y, B.z - W.z, B.x + W.x, B.y + W.y, B.z + W.z);
      for (let r = 0; r < 2; r++) hilo.nrm.push(NA.x, NA.y, NA.z, NA.x, NA.y, NA.z);
      hilo.idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    }
  }
  // superelipse |u|^4 + |v|^4 = 1: ancho relativo y borde
  const sq = (u) => Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u), 4)), 0.25);
  const borde = (th) => { const c = Math.cos(th), s = Math.sin(th); return [Math.sign(c) * Math.sqrt(Math.abs(c)), Math.sign(s) * Math.sqrt(Math.abs(s))]; };

  // ---------- mandil (con vivo claro en el borde y canto hasta la piel) ----------
  const PAD = { xc: 0.155, hl: 0.355, aw: 1.72 };   // de x = −0,20 a 0,51: asoma detrás del borrén y delante de la perilla
  // más angosto atrás (la piel del muslo y la grupa se mueve en el galope)
  const padAw = (uu) => PAD.aw * (1 - 0.24 * Math.max(0, -uu) ** 2);
  // en polares (u = radio, v = vuelta) para que el borde de cada capa sea exactamente la superelipse
  // más grueso atrás: la punta de la cadera sube con la pelvis en el galope (se mide con la piel en movimiento)
  const padExtra = (x) => 0.006 * sstep(0.05, -0.10, x);
  const padMap = (k, off) => (u, v) => { const [bu, bv] = borde(v * TAU), uu = bu * u * k, x = PAD.xc + uu * PAD.hl; return [x, bv * u * k * padAw(uu), off + padExtra(x)]; };
  drape(16, 120, padMap(1, 0.010), piping);
  drape(16, 120, padMap(0.965, 0.016), padMat);
  drape(96, 1, (u, v) => { const [uu, vv] = borde(u * TAU); const x = PAD.xc + uu * PAD.hl; return [x, vv * padAw(uu), lerp(0.003, 0.010 + padExtra(x), v)]; }, piping);

  // ---------- cincha: en la cinchera, detrás del codo; sube oblicua hasta debajo de los faldones ----------
  const CINCHA = { a0: 1.3, x0: 0.40, x1: 0.43, ancho: 0.07 };   // abajo, detrás del codo: en el galope el antebrazo llega hasta x ≈ 0,47 (reposo)
  const xCincha = (a) => lerp(CINCHA.x0, CINCHA.x1, sstep(1.25, 2.7, Math.abs(a)));
  drape(4, 72, (u, v) => {
    const th = lerp(CINCHA.a0, TAU - CINCHA.a0, v), a = th > Math.PI ? th - TAU : th;
    return [xCincha(a) + (u - 0.5) * CINCHA.ancho, a, 0.008];
  }, darkLeather);

  // =====================================================================================================
  // MONTURA: todo sobre la envolvente lisa (k = 1). Separaciones medidas desde esa envolvente.
  // =====================================================================================================
  // paneles (bastos): dos almohadas a los lados de la canal (la canal queda abierta: se ve desde atrás)
  const PANEL = { x0: -0.19, x1: 0.395, a0: 0.10, a1: 0.86 };
  function panelT(x, a) {
    const v = (Math.abs(a) - PANEL.a0) / (PANEL.a1 - PANEL.a0);
    if (v <= 0 || v >= 1 || x <= PANEL.x0 || x >= PANEL.x1) return 0;
    const e = Math.sqrt(clamp01((x - PANEL.x0) / 0.045)) * Math.sqrt(clamp01((PANEL.x1 - x) / 0.05));
    return 0.034 * Math.pow(Math.sin(Math.PI * v), 0.45) * (1 - 0.45 * v) * (1 - 0.3 * sstep(0.15, 0.39, x)) * e;
  }
  const panelOff = (x, a) => 0.014 + panelT(x, a);
  [1, -1].forEach((s) => {
    drape(40, 16, (u, v) => {
      const x = lerp(PANEL.x0, PANEL.x1, u), a = s * lerp(PANEL.a0, PANEL.a1, v), t = panelT(x, a);
      return [x, a, 0.014 + t, clamp01(t / 0.012)];
    }, panelMat);
  });

  // asiento: perfil de la línea media (x, separación) desde el pie del borrén, por el borde del borrén, lo
  // hondo del asiento y la perilla, hasta el frente de la perilla sobre la cruz
  const PERFIL = [
    [-0.150, 0.044], [-0.168, 0.085], [-0.171, 0.122], [-0.158, 0.143], [-0.134, 0.140],
    [-0.090, 0.112], [-0.030, 0.085], [0.040, 0.071], [0.100, 0.067], [0.170, 0.071],
    [0.250, 0.081], [0.320, 0.094], [0.370, 0.108], [0.397, 0.105], [0.413, 0.088], [0.421, 0.058], [0.422, 0.032]
  ];
  const curvaPerfil = new THREE.CatmullRomCurve3(PERFIL.map(([x, h]) => new V(x, h, 0)), false, 'centripetal');
  const perfil = (u) => curvaPerfil.getPointAt(u);
  // medio ancho (ang) del asiento: ancho atrás, angosto en el puente, la cabeza del fuste adelante
  const seatAw = (x) => 0.80 - 0.30 * sstep(-0.02, 0.27, x) - 0.08 * sstep(0.27, 0.40, x);
  const SEAT_EDGE = 0.048;
  // perfil transversal: plano con el borde redondeado en el asiento; media luna en el borrén y en la perilla
  const seatOff = (x, h, vv) => {
    const kc = Math.max(sstep(-0.09, -0.15, x), sstep(0.30, 0.38, x));
    const c = lerp(1 - vv * vv * vv * vv, Math.sqrt(Math.max(0, 1 - vv * vv)), kc);
    const e = Math.min(SEAT_EDGE, h);
    return e + (h - e) * c;
  };
  drape(72, 36, (u, v) => {
    const p = perfil(u), vv = v * 2 - 1;
    return [p.x, vv * seatAw(p.x), seatOff(p.x, p.y, vv), 1];
  }, seatMat);
  // canto del asiento: del borde hasta los faldones, en todo el contorno
  [1, -1].forEach((s) => {
    drape(72, 2, (u, v) => { const p = perfil(u); return [p.x, s * seatAw(p.x), lerp(0.026, Math.min(SEAT_EDGE, p.y), v), 1]; }, seatMat);
  });
  // vivo (ribete) del borde del asiento
  [1, -1].forEach((s) => costura((t) => { const p = perfil(lerp(0.12, 0.92, t)); return [p.x, s * (seatAw(p.x) - 0.035), seatOff(p.x, p.y, 1 - 0.035 / seatAw(p.x)), 1]; }));

  // faldones y rodilleras: cortados hacia adelante, terminan antes de la paleta; por encima de los paneles
  // y por debajo del borde del asiento
  const xFald = (v) => 0.20 + 0.10 * v, hwFald = (v) => 0.17 * (1 - 0.25 * v * v * v) * (1 - 0.3 * sstep(0.8, 1, v) ** 2);
  const FA0 = 0.6, FA1 = 1.05;
  const fldOff = (x, a, v) => Math.min(0.037, Math.max(0.022 + 0.004 * v, panelOff(x, a) + 0.005));
  const faldon = (s) => (u, v) => { const x = xFald(v) + (u * 2 - 1) * hwFald(v), a = s * (FA0 + v * FA1); return [x, a, fldOff(x, a, v), 1]; };
  [1, -1].forEach((s) => {
    drape(24, 28, faldon(s), leatherMat);
    // rodillera sobre el borde delantero
    drape(10, 16, (u, v) => {
      const uu = u * 2 - 1, vv = v * 2 - 1, vf = 0.05 + v * 0.75, x = xFald(vf) + hwFald(vf) - 0.028 + uu * 0.016 * sq(vv), a = s * (0.66 + v * 0.8);
      return [x, a, fldOff(x, a, vf) + 0.003 + 0.0045 * Math.sin(Math.PI * u) * sq(vv), 1];
    }, leatherMat);
    // costura a 1,3 cm del borde: atrás, abajo y adelante
    const f = faldon(s), m = 0.075, b = 0.955;
    costura((t) => {
      const L = 1 + 1 + 1, q = t * L;
      const [u, v] = q < 1 ? [m, lerp(0.1, b, q)] : q < 2 ? [lerp(m, 1 - m, q - 1), b] : [1 - m, lerp(b, 0.1, q - 2)];
      return f(u, v);
    }, 240);
  });

  // faldoncitos: tapan la barra del estribo, debajo de la cabeza de la montura
  const SK = { x0: 0.215, x1: 0.405, a0: 0.46, a1: 0.98 };
  const skOff = (x, a) => Math.min(0.041, fldOff(x, a, clamp01((Math.abs(a) - FA0) / FA1)) + 0.005);
  const faldoncito = (s) => (u, v) => {
    const hw = (SK.x1 - SK.x0) / 2 * Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, v - 0.55) / 0.45, 2))) * (1 - 0.15 * v);
    const x = (SK.x0 + SK.x1) / 2 + 0.012 * v + (u * 2 - 1) * Math.max(0.002, hw), a = s * lerp(SK.a0, SK.a1, v);
    return [x, a, skOff(x, a), 1];
  };
  [1, -1].forEach((s) => {
    drape(14, 18, faldoncito(s), panelMat);
    const f = faldoncito(s);
    costura((t) => { const q = t * 2; const [u, v] = q < 1 ? [0.1, lerp(0.05, 0.93, q)] : [0.9, lerp(0.93, 0.05, q - 1)]; const r = f(u, v); r[2] += 0.0005; return r; }, 120);
  });

  // ---------- estriberas y estribos: la estribera sale de debajo del faldoncito ----------
  const estriboGeo = (() => {
    const p = [[0, -0.008], [0.034, -0.017], [0.052, -0.044], [0.058, -0.085], [0.057, -0.128], [0.046, -0.141], [0, -0.143], [-0.046, -0.141], [-0.057, -0.128], [-0.058, -0.085], [-0.052, -0.044], [-0.034, -0.017]];
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(p.map(([x, y]) => new V(x, y, 0)), true, 'centripetal'), 64, 0.0055, 8, true);
  })();
  const stirrups = [1, -1].map((s) => {
    const P = new V(), N = new V(), Q = new V();
    const XE = 0.30, AE = 0.86;
    piel(XE, s * AE, P, N, 1).addScaledVector(N, fldOff(XE, AE, (AE - FA0) / FA1) + 0.004);
    const pivot = new THREE.Group(); pivot.position.copy(P); body.add(pivot);
    const len = P.y - 0.99;
    // inclinación hacia afuera para que la estribera no entre en el faldón ni en la barriga
    let tilt = 0.05;
    for (let a = 0.9; a <= 2.3; a += 0.05) {
      piel(XE, s * a, Q, N, 1).addScaledVector(N, a < FA0 + FA1 ? fldOff(XE, a, (a - FA0) / FA1) + 0.004 : 0.008);
      const dy = P.y - Q.y;
      if (dy > 0.05 && dy < len + 0.15) tilt = Math.max(tilt, Math.atan2(Math.abs(Q.z) + 0.012 - Math.abs(P.z), dy));
    }
    const strap = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.025, len, 0.005), darkLeather));
    strap.position.set(0, -len / 2, 0); pivot.add(strap);
    const iron = new THREE.Group(); iron.position.set(0, -len, 0); pivot.add(iron);
    const arco = shadowed(new THREE.Mesh(estriboGeo, metalMat));
    const tread = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.008, 0.05), metalMat));
    tread.position.y = -0.141;
    iron.add(arco, tread);
    pivot.rotation.x = -s * tilt;
    return { pivot, s, tilt };
  });

  // todas las puntadas en una sola malla
  {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(hilo.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(hilo.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(hilo.pos.length / 3 * 2), 2));
    g.setIndex(hilo.idx);
    body.add(new THREE.Mesh(g, hiloMat));
  }

  // lo hondo del asiento (marco del grupo body): ahí se sienta el jinete
  const hondo = new V(0, Infinity, 0);
  {
    const P = new V(), N = new V();
    for (let i = 0; i <= 200; i++) {
      const p = perfil(i / 200);
      if (p.x < -0.1 || p.x > 0.3) continue;
      piel(p.x, 0, P, N, 1).addScaledVector(N, p.y);
      if (P.y < hondo.y) hondo.copy(P);
    }
  }
  const pomo = (() => { const p = perfil(0.93), P = new V(), N = new V(); return piel(p.x, 0, P, N, 1).addScaledVector(N, p.y); })();

  // =====================================================================================================
  // CABEZADA
  // =====================================================================================================
  // cinta plana que sigue puntos (correas de la cabezada; se arma una sola vez)
  function cinta(points, wdirs, material, width) {
    const n = points.length - 1, w = width / 2, pos = new Float32Array((n + 1) * 6), idx = [];
    for (let k = 0; k <= n; k++) {
      const P = points[k], W = wdirs[k];
      pos.set([P.x - W.x * w, P.y - W.y * w, P.z - W.z * w, P.x + W.x * w, P.y + W.y * w, P.z + W.z * w], k * 6);
      if (k < n) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    return shadowed(new THREE.Mesh(g, material));
  }
  // ejes de la cabeza medidos sobre headSurf (t de la nuca al labio, ang 0 = frente): para proyectar
  // cualquier punto sobre la piel de la cabeza
  const cab = (() => {
    const P = new V(), Q = new V();
    const o = headSurf(0, 0, new V()), f = headSurf(0.5, 0, new V());
    const A = f.clone().sub(o); const L = A.length() / 0.5; A.normalize();
    const F = new V(-A.y, A.x, 0);
    const centro = (t, out) => { headSurf(t, 0, P); headSurf(t, Math.PI, Q); return out.addVectors(P, Q).multiplyScalar(0.5); };
    return { o, A, F, L, centro };
  })();
  const _c = new V(), _d = new V();
  function proyectarCabeza(P, out, nOut) {
    const t = Math.max(0.0, Math.min(0.98, _d.subVectors(P, cab.o).dot(cab.A) / cab.L));
    cab.centro(t, _c); _d.subVectors(P, _c);
    return headSurf(t, Math.atan2(_d.z, _d.dot(cab.F)), out, nOut);
  }
  // correa: puntos de control (en reposo) → curva → proyectada sobre la piel; nuca: usa el anillo del cuello
  function correa(n, width, ctrl, { off = 0.005, sobre = 'cabeza', mat: material = darkLeather } = {}) {
    const curva = ctrl ? new THREE.CatmullRomCurve3(ctrl, false, 'centripetal') : null;
    const pts = [], nrm = [], wd = [], N = new V();
    for (let k = 0; k <= n; k++) {
      const p = curva ? curva.getPoint(k / n) : new V();
      if (sobre === 'cabeza') proyectarCabeza(p, p, N); else p.copy(sobre(k / n, p, N));
      pts.push(p.addScaledVector(N, off)); nrm.push(N.clone());
    }
    for (let k = 0; k <= n; k++) {
      const T = new V().subVectors(pts[Math.min(n, k + 1)], pts[Math.max(0, k - 1)]).normalize();
      wd.push(new V().crossVectors(T, nrm[k]).normalize());
    }
    headInner.add(cinta(pts, wd, material, width));
    return pts;
  }
  const H = (t, a) => headSurf(t, a, new V());
  function buscarEnCabeza(P, s) {
    const Q = new V(); let best = [Infinity, 0.2, 2.2];
    const prueba = (t, a) => { if (t < 0 || t > 0.9) return; const d = headSurf(t, s * a, Q).distanceTo(P); if (d < best[0]) best = [d, t, a]; };
    for (let t = 0; t <= 0.45; t += 0.05) for (let a = 1.5; a <= 3.0; a += 0.1) prueba(t, a);
    const [, t0, a0] = best;
    for (let i = -5; i <= 5; i++) for (let j = -5; j <= 5; j++) prueba(t0 + i * 0.01, a0 + j * 0.02);
    return [best[1], best[2]];
  }
  const NK = (t, a) => neckSurf(t, a, new V());
  const TN = 0.985;   // anillo de la nuca, detrás de las orejas
  // testera: por la nuca detrás de las orejas, baja hasta la quijada
  const AT = 1.8;   // la testera baja por detrás del ojo hasta acá
  correa(40, 0.024, null, { sobre: (f, p, n) => neckSurf(TN, lerp(-AT, AT, f), p, n), off: 0.005 });
  const bitLocal = [], bitNLocal = [];
  [1, -1].forEach((s) => {
    // carrillera: del extremo de la testera, por detrás del ojo y de la cresta facial, a la argolla del bocado
    const bit = H(0.875, s * 2.25);
    const ini = NK(TN, s * AT);
    // el extremo de la testera en coordenadas de la cabeza (búsqueda gruesa y fina), y de ahí recto a la argolla
    const ct = buscarEnCabeza(ini, s);
    correa(40, 0.022, null, { sobre: (f, p, n) => headSurf(lerp(ct[0], 0.85, f), s * lerp(ct[1], 2.22, f), p, n) });
    // ahogadero: de la testera, por debajo de la garganta
    correa(18, 0.015, null, { sobre: (f, p, n) => neckSurf(lerp(TN, 0.93, f), s * lerp(1.62, Math.PI, f), p, n), off: 0.007 });
    // frontalera: por la frente, delante de las orejas, hasta la testera
    correa(16, 0.018, [H(0.1, 0), H(0.1, s * 0.6), H(0.07, s * 1.05), H(0.04, s * 1.45), ini], { off: 0.006 });
    // argolla del bocado, en la comisura, en el plano de la cara
    const N = new V(); headSurf(0.875, s * 2.25, bit, N).addScaledVector(N, 0.006);
    const ring = shadowed(new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.0042, 10, 28), metalMat));
    ring.position.copy(bit); ring.lookAt(_c.copy(bit).add(N)); headInner.add(ring);
    bitLocal.push(bit.clone().addScaledVector(N, 0.004)); bitNLocal.push(N.clone());
  });
  // muserola: vuelta completa sobre la caña nasal, dos dedos debajo de la cresta facial
  correa(48, 0.026, null, { sobre: (f, p, n) => headSurf(0.64, lerp(-Math.PI, Math.PI, f), p, n), off: 0.006 });
  // filete: cañón de la boca entre las argollas
  {
    const a = bitLocal[0], b = bitLocal[1], L = a.distanceTo(b);
    const can = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, L, 10), metalMat));
    can.position.addVectors(a, b).multiplyScalar(0.5);
    can.quaternion.setFromUnitVectors(new V(0, 1, 0), _d.subVectors(b, a).normalize());
    headInner.add(can);
  }

  // =====================================================================================================
  // RIENDAS: puntos anclados a la piel del cuello (siguen sus pesos), una sola rienda continua
  // =====================================================================================================
  const malla = horse.children.find((o) => o.isSkinnedMesh);
  const huesos = malla ? malla.skeleton.bones : null;
  const { pos: pp, skinIndex: si, skinWeight: sw } = caballo.cuerpo;
  const NVb = pp.length / 3;
  // ancla: vértice de la piel más cercano al punto de reposo P + su normal
  const delCuello = []; for (let i = 0; i < NVb; i++) if (pp[i * 3] > 0.4 && pp[i * 3 + 1] > 1.3) delCuello.push(i);
  function anclar(P, N) {
    let best = 0, bd = Infinity;
    for (const i of delCuello) {
      const dx = pp[i * 3] - P.x, dy = pp[i * 3 + 1] - P.y, dz = pp[i * 3 + 2] - P.z, d = dx * dx + dy * dy + dz * dz;
      if (d < bd) { bd = d; best = i; }
    }
    return { i: best, p: P.clone(), n: N.clone() };
  }
  // posición actual (marco del caballo) del punto anclado, desplazado `off` sobre la normal
  const _m = new V(), _n = new V();
  function seguir(an, off, out, nOut) {
    out.set(0, 0, 0); nOut.set(0, 0, 0);
    if (!huesos) { out.copy(an.p); nOut.copy(an.n); }
    else for (let k = 0; k < 4; k++) {
      const w = sw[an.i * 4 + k]; if (!w) continue;
      const M = huesos[si[an.i * 4 + k]].matrix;
      out.addScaledVector(_m.copy(an.p).applyMatrix4(M), w);
      nOut.addScaledVector(_n.copy(an.n).transformDirection(M), w);
    }
    nOut.normalize();
    return out.addScaledVector(nOut, off);
  }
  // apoyos por lado (s = +1 derecha): [t, ang] sobre el cuello, de la quijada a la cruz
  // exterior: suben por el costado del cuello y cruzan la crin delante de la cruz (bastante juntos para que
  // la rienda no corte el cuello entre apoyo y apoyo); montura: del costado del cuello hacia las manos
  const APOYO = {
    exterior: [[0.86, 1.62], [0.66, 1.42], [0.47, 1.2], [0.33, 0.95], [0.22, 0.68], [0.15, 0.4], [0.115, 0.17]],
    montura: [[0.84, 1.62], [0.58, 1.38], [0.32, 1.08]]
  };
  const cresta = (() => { const N = new V(), P = neckSurf(0.1, 0, new V(), N); return anclar(P, N); })();
  const anclas = [1, -1].map((s) => {
    const mk = ([t, a]) => { const N = new V(), P = neckSurf(t, s * a, new V(), N); return anclar(P, N); };
    return { exterior: APOYO.exterior.map(mk), montura: APOYO.montura.map(mk) };
  });

  // =====================================================================================================
  // JINETE: ojo sentado en lo hondo del asiento; manos con guantes de cuero sobre la cruz, delante de la perilla
  // =====================================================================================================
  const OJO = new V(hondo.x - 0.14, hondo.y + 0.74, 0);
  const MANO = (() => { const P = new V(), N = new V(), x = pomo.x + 0.13; piel(x, 0, P, N); return new V(x, Math.max(P.y + 0.13, pomo.y + 0.06), 0.075); })();
  const CODO = new V(OJO.x + 0.15, OJO.y - 0.50, 0.2);
  const gloveMat = mat('#3d2416', 0.5, 0.0003, { envMapIntensity: 0.5 });
  const sleeveMat = mat('#4a4a3e', 0.95, 0.0006, { envMapIntensity: 0.35 });
  // juntar geometrías (cada una con su matriz) en una sola: una malla por material
  function fusionar(partes) {
    const pos = [], nrm = [], uv = [], idx = [];
    for (const [geo, M] of partes) {
      const g = geo.index ? geo : geo.toNonIndexed();
      g.applyMatrix4(M);
      const b = pos.length / 3, P = g.attributes.position.array, Nn = g.attributes.normal.array, U = g.attributes.uv.array;
      for (let i = 0; i < P.length; i++) { pos.push(P[i]); nrm.push(Nn[i]); }
      for (let i = 0; i < U.length; i++) uv.push(U[i]);
      if (g.index) for (const i of g.index.array) idx.push(b + i); else for (let i = 0; i < P.length / 3; i++) idx.push(b + i);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }
  // caja redondeada (superelipsoide) de medios lados h
  // (afina hacia −x: la muñeca)
  function cajaRedonda(hx, hy, hz, e = 0.55, afina = 0) {
    const g = new THREE.SphereGeometry(1, 18, 14), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const f = (v) => Math.sign(v) * Math.pow(Math.abs(v), e), x = f(p.getX(i)), k = 1 - afina * Math.max(0, -x);
      p.setXYZ(i, x * hx, f(p.getY(i)) * hy * k, f(p.getZ(i)) * hz * k);
    }
    g.computeVertexNormals();
    return g;
  }
  const _q = new THREE.Quaternion(), _s = new V();
  const M4 = (pos, quat = _q.identity(), sc = _s.set(1, 1, 1)) => new THREE.Matrix4().compose(pos, quat, sc);
  // elipsoide de A a B (falange, pulgar) con radio r
  const hueso = (A, B, r) => {
    const d = new V().subVectors(B, A), L = d.length() / 2 + r * 0.6;
    return [new THREE.SphereGeometry(1, 12, 8), M4(new V().addVectors(A, B).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new V(0, 1, 0), d.normalize()), new V(r, L, r))];
  };
  // mano (marco local: x adelante, y arriba, z hacia afuera con s): puño cerrado con el pulgar arriba, los
  // nudillos adelante y el dorso hacia afuera; la rienda pasa vertical por dentro de los dedos
  const RIENDA_MANO = { entra: new V(0.016, -0.056, 0), sale: new V(0.02, 0.05, 0) };
  const hands = [1, -1].map((s) => {
    const z = (v) => v * s;
    const glove = [];
    glove.push([cajaRedonda(0.037, 0.042, 0.020, 0.55, 0.22), M4(new V(-0.008, 0, z(0.003)))]);   // dorso y palma
    // dedos: falanges proximales (nudillos adelante, hacia adentro) y medias (por la cara de adentro, hacia atrás)
    [[0.030, 0.0105], [0.010, 0.0108], [-0.010, 0.0104], [-0.029, 0.0094]].forEach(([y, r], i) => {
      const yy = y - 0.002 * i;
      glove.push(hueso(new V(0.023, yy, z(0.015)), new V(0.027, yy, z(-0.012)), r));
      glove.push(hueso(new V(0.024, yy, z(-0.016)), new V(0.000, yy, z(-0.018)), r * 0.85));
    });
    glove.push(hueso(new V(-0.020, 0.032, z(-0.010)), new V(0.030, 0.049, z(-0.008)), 0.0115));   // pulgar sobre la rienda
    // puño del guante (abierto en campana hacia el codo)
    const dir = new V().subVectors(new V(CODO.x, CODO.y, s * CODO.z), new V(MANO.x, MANO.y, s * MANO.z)).normalize();
    const qa = new THREE.Quaternion().setFromUnitVectors(new V(0, 1, 0), dir);
    glove.push([new THREE.CylinderGeometry(0.038, 0.031, 0.045, 18, 1, true), M4(new V(-0.047, -0.004, 0).addScaledVector(dir, 0.022), qa)]);
    // antebrazo con la manga hasta el codo (marco de la mano)
    const loc = (P) => new V(P.x - MANO.x, P.y - MANO.y, s * P.z - s * MANO.z);
    const tramo = (A, B, rA, rB) => { const d = new V().subVectors(B, A), L = d.length(); return [new THREE.CylinderGeometry(rB, rA, L, 18, 1, true), M4(new V().addVectors(A, B).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new V(0, 1, 0), d.normalize()))]; };
    const muneca = new V(-0.05, -0.004, 0).addScaledVector(dir, 0.03), codo = loc(CODO);
    const sleeve = [tramo(muneca, codo, 0.034, 0.044), [new THREE.SphereGeometry(0.044, 16, 12), M4(codo)]];
    const g = new THREE.Group();
    g.add(new THREE.Mesh(fusionar(glove), gloveMat), new THREE.Mesh(fusionar(sleeve), sleeveMat));
    g.position.set(MANO.x, MANO.y, s * MANO.z); body.add(g);
    g.userData = { s };
    return g;
  });

  // rienda: cinta de cuero plana (sección elíptica 2 cm × 4 mm) con la cara plana sobre la normal pedida;
  // normales calculadas a mano (sin computeVertexNormals por cuadro)
  class Tubo {
    constructor(nSeg, nRad, material, ancho, espesor) {
      this.nSeg = nSeg; this.nRad = nRad; this.ancho = ancho; this.espesor = espesor;
      const nv = (nSeg + 1) * (nRad + 1), g = new THREE.BufferGeometry(), idx = [];
      this.pos = new Float32Array(nv * 3); this.nrm = new Float32Array(nv * 3);
      const id = (i, j) => i * (nRad + 1) + j;
      for (let i = 0; i < nSeg; i++) for (let j = 0; j < nRad; j++) idx.push(id(i, j), id(i + 1, j), id(i, j + 1), id(i, j + 1), id(i + 1, j), id(i + 1, j + 1));
      g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(this.nrm, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(nv * 2), 2));
      g.setIndex(idx);
      this.geo = g; this.mesh = shadowed(new THREE.Mesh(g, material)); this.mesh.frustumCulled = false;
      this.pts = []; this.ns = []; for (let i = 0; i <= nSeg; i++) { this.pts.push(new V()); this.ns.push(new V()); }
      this.cs = []; for (let j = 0; j <= nRad; j++) { const an = (j / nRad) * TAU; this.cs.push(Math.cos(an), Math.sin(an)); }
      this.T = new V(); this.W = new V(); this.B = new V();
    }
    // punto(t, out, nOut): centro y normal deseada de la cara plana
    update(punto) {
      const { nSeg, nRad, pos, nrm, pts, ns, cs, T, W, B, ancho, espesor } = this;
      for (let i = 0; i <= nSeg; i++) punto(i / nSeg, pts[i], ns[i]);
      for (let i = 0; i <= nSeg; i++) {
        T.subVectors(pts[Math.min(nSeg, i + 1)], pts[Math.max(0, i - 1)]).normalize();
        const w = ns[i]; const d = w.dot(T);
        const wx = w.x - T.x * d, wy = w.y - T.y * d, wz = w.z - T.z * d, l = Math.hypot(wx, wy, wz);
        if (l > 1e-3) W.set(wx / l, wy / l, wz / l);   // si no, queda la del punto anterior
        else { W.addScaledVector(T, -W.dot(T)).normalize(); }
        B.crossVectors(T, W);
        const C = pts[i];
        for (let j = 0; j <= nRad; j++) {
          const c = cs[j * 2], s = cs[j * 2 + 1], u = c * espesor, v = s * ancho, k = (i * (nRad + 1) + j) * 3;
          pos[k] = C.x + W.x * u + B.x * v; pos[k + 1] = C.y + W.y * u + B.y * v; pos[k + 2] = C.z + W.z * u + B.z * v;
          // normal de la elipse: (cos/espesor, sin/ancho)
          const nu = c * ancho, nv = s * espesor, nl = 1 / Math.hypot(nu, nv);
          nrm[k] = (W.x * nu + B.x * nv) * nl; nrm[k + 1] = (W.y * nu + B.y * nv) * nl; nrm[k + 2] = (W.z * nu + B.z * nv) * nl;
        }
      }
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.normal.needsUpdate = true;
    }
  }
  const reinMat = mat('#2e1a0e', 0.72, 0.0003, { envMapIntensity: 0.35 });
  const rienda = new Tubo(160, 8, reinMat, 0.010, 0.0021);
  horse.add(rienda.mesh);
  // una sola rienda continua, de la argolla izquierda a la derecha:
  // exterior: argolla, apoyos, cruce sobre la cruz, apoyos, argolla
  // montura: argolla, 3 apoyos, entra al puño, sale bajo el pulgar, seno, sale, entra, 3 apoyos, argolla
  const nuevaCurva = (n) => { const P = []; for (let i = 0; i < n; i++) P.push(new V()); return new THREE.CatmullRomCurve3(P, false, 'centripetal'); };
  const curvaExt = nuevaCurva(2 * (1 + APOYO.exterior.length) + 1), curvaMon = nuevaCurva(2 * (3 + APOYO.montura.length) + 1);
  // normal de la cara plana en cada punto de control (se interpola igual que la curva)
  const normalesExt = curvaExt.points.map(() => new V()), normalesMon = curvaMon.points.map(() => new V());
  const _S = new V(), _N = new V(), _L = new V(), _h = new V(), _invH = new THREE.Matrix4(), _Mb = new THREE.Matrix4();
  const manoE = [new V(), new V()], manoS = [new V(), new V()], manoN = [new V(), new V()], bitW = [new V(), new V()], bitN = [new V(), new V()];
  const MANE = (s) => (s > 0 ? 0.012 : 0);   // la crin cae a la derecha: la rienda va por encima
  // seno de la rienda (marco body): cae a la derecha de la cruz, delante de las manos
  const SENO = (() => { const P = new V(), N = new V(); piel(MANO.x + 0.03, 0.75, P, N); return P.addScaledVector(N, 0.05); })();

  // estado del jinete (lo usa la cámara de la montura): desplazamientos en el marco del caballo y el ojo en reposo
  const jinete = { x: 0, y: 0, z: 0, cabeceo: 0, rolido: 0, giro: 0, vista: 'out', ojo: OJO };

  let curva = curvaExt, normales = normalesExt;
  const puntoRienda = (t, o, n) => {
    curva.getPoint(t, o);
    const f = t * (normales.length - 1), i = Math.min(normales.length - 2, Math.floor(f));
    n.lerpVectors(normales[i], normales[i + 1], f - i);
  };
  function actualizarRiendas(view, giro) {
    const montado = view === 'rider';
    // matrices del mundo ya al día: caballo.aplicarPose actualiza horse (y body, headInner) en cada cuadro
    _invH.copy(horse.matrixWorld).invert();
    const gk = Math.max(-1, Math.min(1, giro / 0.55));   // + = dobla a la izquierda (mano izquierda, s = −1)
    [1, -1].forEach((s, k) => {
      bitW[k].copy(bitLocal[k]).applyMatrix4(headInner.matrixWorld).applyMatrix4(_invH);
      bitN[k].copy(bitNLocal[k]).transformDirection(headInner.matrixWorld);
      if (!montado) return;
      const abre = Math.max(0, -s * gk), cede = Math.max(0, s * gk);
      // mano: la del lado del giro se abre y tira hacia atrás; la otra cede un poco
      const h = hands[k];
      h.position.set(MANO.x - 0.07 * abre + 0.025 * cede + jinete.x * 0.6, MANO.y + 0.01 * abre + jinete.y * 0.6, s * (MANO.z + 0.11 * abre) + jinete.z * 0.6);
      h.rotation.set(0, s * 0.35 * abre, 0);
      h.updateMatrix();
      _Mb.multiplyMatrices(body.matrixWorld, h.matrix).premultiply(_invH);
      manoE[k].copy(RIENDA_MANO.entra).applyMatrix4(_Mb);
      manoS[k].copy(RIENDA_MANO.sale).applyMatrix4(_Mb);
      manoN[k].set(0, 0, s).transformDirection(_Mb);
    });
    curva = montado ? curvaMon : curvaExt; normales = montado ? normalesMon : normalesExt;
    const RP = curva.points, U = RP.length - 1, M = U / 2;
    [1, -1].forEach((s, k) => {
      const idx = (n) => (s < 0 ? n : U - n);
      RP[idx(0)].copy(bitW[k]); normales[idx(0)].copy(bitN[k]);
      if (!montado) {
        const n = anclas[k].exterior.length;
        anclas[k].exterior.forEach((an, j) => { seguir(an, 0.007 + MANE(s) * Math.min(1, j / (n - 2)), RP[idx(j + 1)], normales[idx(j + 1)]); });
      } else {
        const abre = Math.max(0, -s * gk), cede = Math.max(0, s * gk);
        const tension = clamp01(0.45 + 0.55 * abre - 0.4 * cede), floja = 1 - tension;
        const fr = [0.22, 0.48, 0.72];
        anclas[k].montura.forEach((an, j) => {
          const P = RP[idx(j + 1)], off = 0.012 + MANE(s) * 0.5 + 0.012 * j;
          seguir(an, off, P, _N);
          // en el aire la rienda se da vuelta y muestra la cara (se ve de arriba como una cinta, no de canto)
          normales[idx(j + 1)].copy(_N).lerp(_h.set(0, 1, 0), 0.75 * tension).normalize();
          _S.copy(P).addScaledVector(_N, -off);
          _L.lerpVectors(bitW[k], manoE[k], fr[j]);
          P.lerp(_L, tension * 0.85);
          P.y -= floja * 0.05 * Math.sin(Math.PI * fr[j]);
          // nunca por dentro del cuello
          const d = _h.subVectors(P, _S).dot(_N);
          if (d < 0.008) P.addScaledVector(_N, 0.008 - d);
        });
        RP[idx(M - 2)].copy(manoE[k]); normales[idx(M - 2)].copy(manoN[k]);
        RP[idx(M - 1)].copy(manoS[k]); normales[idx(M - 1)].copy(manoN[k]);
      }
    });
    if (!montado) {
      // las dos riendas se cruzan sobre la crin, delante de la cruz
      seguir(cresta, 0.022, RP[M], normales[M]);
    } else {
      // el seno de la rienda cae a la derecha de la cruz, delante de las manos
      RP[M].copy(SENO).applyMatrix4(body.matrixWorld).applyMatrix4(_invH);
      normales[M].set(0, 1, 0).transformDirection(body.matrixWorld);
    }
    rienda.update(puntoRienda);
  }

  // pesos de cada marcha (continuos: el balanceo cambia sin saltos), de cur.pesos de la locomoción
  const _pm = { wW: 0, wT: 0, wG: 0 };
  function pesosMarcha(cur) {
    const p = cur && cur.pesos;
    if (!p) { _pm.wW = _pm.wT = _pm.wG = 0; return _pm; }
    const tot = (p.walk || 0) + (p.trot || 0) + (p.gallop || 0) + (p.giro || 0) || 1, mov = clamp01((cur.stride || 0) / 0.1);
    _pm.wW = ((p.walk || 0) + (p.giro || 0)) / tot * mov; _pm.wT = (p.trot || 0) / tot * mov; _pm.wG = (p.gallop || 0) / tot * mov;
    return _pm;
  }

  // por cuadro: balanceo del jinete según la marcha, riendas (a las manos o sobre la cruz) y estribos.
  // cur = loco.cur ({ stride, freq, v, pesos }); pose = { x, z, rumbo, velocidad, giro } (giro en rad/s, + = izquierda)
  function actualizarMontura(view, cur, phase, pose) {
    const giro = pose && Number.isFinite(pose.giro) ? pose.giro : 0;
    const vel = pose && Number.isFinite(pose.velocidad) ? pose.velocidad : 0;
    const stride = cur && Number.isFinite(cur.stride) ? cur.stride : 0;
    const { wW, wT, wG } = pesosMarcha(cur);
    const ph = TAU * phase;   // solo múltiplos enteros de la fase (sin temblores al cambiar de marcha)
    jinete.x = 0.03 * wG * Math.sin(ph - 0.9);
    jinete.y = -0.008 * wT * Math.cos(2 * ph) + 0.012 * wG * Math.cos(ph - 0.9);
    jinete.z = 0.012 * wW * Math.sin(ph);
    jinete.cabeceo = -0.035 * wG * Math.sin(ph - 0.4) + 0.006 * wT * Math.sin(2 * ph);
    jinete.rolido = 0.015 * wW * Math.sin(ph) + 0.06 * giro * clamp01(vel / 4);
    jinete.giro = giro; jinete.vista = view;
    actualizarRiendas(view, giro);
    stirrups.forEach((st, i) => {
      st.pivot.rotation.z = Math.sin(ph + i * 0.5) * (0.04 + stride * 0.25);
      // al doblar, la fuerza centrífuga abre un poco el estribo de afuera
      st.pivot.rotation.x = -st.s * (st.tilt + Math.max(0, st.s * giro) * 0.05 * clamp01(vel / 4));
    });
  }

  const api = { hands, jinete, actualizarMontura };
  if (typeof location !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1')) window.__montura = { ...api, piel };
  return api;
}
