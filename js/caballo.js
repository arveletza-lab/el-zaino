// El zaino v2: caballo anatómico construido por código.
//
// TÉCNICA
//   Un solo campo de distancias (SDF) por capas sobre un esqueleto real (ver docs/investigacion-anatomia.md), hecho de
//   superficies LISAS por secciones transversales (crearLoft), no de una suma de músculos:
//   1. volumen axial: UN loft de la cola a la nuca (EJE: líneas superior e inferior del perfil de foto-1 y forma de
//      cada sección; las secciones son verticales en el tronco y giran de a poco hasta quedar perpendiculares al
//      cuello) y la cabeza por perfiles, unida con una sola mezcla en la garganta y la nuca;
//   2. miembros: lofts por cortes horizontales (MANO, PATA: contornos de perfil, centro y anchos hacia afuera y hacia
//      la línea media), las dos manos (y las dos patas) en una primitiva y unidas al tronco con una sola mezcla
//      amplia; el tope delantero e interno de las manos es el pectoral;
//   3. huesos subcutáneos y articulaciones con relieve bajo y mezcla chica (punta de la cadera, tuberosidad sacra,
//      olécranon, rodilla, corvejón, menudillo, castaños, cabeza) y tendones de la caña;
//   4. surcos (curvas proyectadas sobre la piel: bordes musculares, tendones, cinchera, yugular, cabeza) y relieve
//      muscular sutil (RELIEVE: el mismo desplazamiento con signo contrario, masas amplias de milímetros a 1 cm);
//   5. cavidades (ollares, comisuras, hendidura de los párpados) y párpados.
//   Se poligoniza UNA vez en reposo con Surface Nets en banda estrecha (grilla gruesa 4h que descarta el espacio
//   lejano, grilla fina h solo cerca de la piel), 1 pasada de Taubin y proyección de Newton de los vértices a la
//   isosuperficie (conserva los surcos). Los pesos de piel (calcularPesosPiel) salen de qué loft tiene más cerca cada
//   vértice (eje, cabeza, manos, patas), suavizado sobre la malla, con planos por articulación dentro de cada miembro
//   y reglas para la escápula, las uniones y la línea media (ver PESOS). Oclusión ambiental por vértice (aoMap) en el
//   vientre y las caras internas. Todo se hornea en assets/cuerpo-caballo.bin.gz (tools/qa/hornear.mjs).
//   Mallas aparte (no son piel con pelo): cascos, ojos, orejas y el pelo (crin, copete y cola, ver PELO).
//
// ESQUELETO (30 huesos)
//   0 pelvis (grupa, gira en la lumbosacra), 1 lomo (= grupo body), 2 tórax craneal (cruz)
//   3–6 cuello: C7–T1, C5–C6, C3–C4, C1–C2 (la flexión y la lateral se reparten entre los 4)
//   7 cabeza (articulación atlanto-occipital)
//   por mano (MD 8–13, MI 14–19): escápula (gira alrededor de su tercio dorsal y se desliza), húmero, antebrazo,
//     caña, cuartilla (menudillo → corona), casco
//   por pata (PD 20–24, PI 25–29): fémur, tibia, caña, cuartilla, casco
//   La curva lateral del tronco se reparte entre el tórax craneal (0,45) y la grupa (0,55).
//
// API
//   const caballo = construirCaballo({ scene, coatMap, coatBump, hairTex, horneado })
//   caballo.aplicarPose(pose)   pose en el marco del caballo (metros, radianes), todo opcional:
//     cuerpo: { y, x, cabeceo, pivote, rolido, curva, lumbosacro }
//        y, x: desplazamiento del tronco respecto del reposo (x + = hacia adelante).
//        cabeceo: + = nariz arriba, alrededor de `pivote` = [x, y] (marco del caballo). Sin pivote gira alrededor
//          del suelo bajo el origen (como hasta ahora: la cruz se corre ~1,4·θ hacia adelante o atrás). Con un
//          pivote cerca del centro de masa, por ejemplo [0.05, 1.1], la cruz casi no se desliza (~0,5·θ). Para
//          compensar a mano el corrimiento sin cambiar el pivote: cuerpo.x. El tope de cada miembro (hombro,
//          cadera) gira con el tronco: con pivote P y cabeceo θ, un punto p del tronco queda en
//          P + Rz(θ)·(p − P) (antes del rolido) + (x, y, 0).
//        rolido: + = se inclina a la IZQUIERDA (hacia −z, como al doblar a la izquierda), siempre alrededor del suelo
//          bajo el origen; curva: flexión lateral, + = cóncavo a la izquierda; lumbosacro: + = la pelvis se mete
//          abajo (flexión, galope).
//     cuello: { flexion, lateral }   flexion + = sube el cuello; lateral + = hacia la izquierda
//     cabeza: { flexion, lateral }   flexion + = nariz arriba (se abre la nuca); lateral + = hacia la izquierda
//     patas: { MD|MI|PD|PI: { casco: Vector3, apoyado, inclinacion, rumbo, menudillo, carpo, flexCasco, mezclaCasco } }
//        casco: centro de la corona del casco (articulación interfalangiana distal), marco del caballo; con el
//          casco plano la suela queda HOOF_H más abajo. Un casco apoyado NUNCA se mueve: si la pata no llega,
//          primero se para la cuartilla, en las manos se desliza la escápula (hasta 4 cm) y por último el casco
//          rota sobre la pinza (breakover); en el vuelo el casco se acerca lo que haga falta.
//        inclinacion: + = talón arriba (rota sobre la pinza; la locomoción entrega `casco` ya rotado, ver
//          caballo.cascoConPinza).
//        rumbo (opcional, 0 por defecto): giro del casco alrededor del eje vertical en el marco del caballo
//          (+ = la pinza hacia −z, el mismo sentido que pose.rumbo de la locomoción). Para que un casco apoyado
//          quede fijo respecto del SUELO al doblar: rumbo = rumbo del caballo al pisar − rumbo actual. Se aplica
//          antes de la inclinación (la pinza del breakover gira con él; usar cascoConPinza con el mismo rumbo).
//        menudillo: ΔE (+ = el menudillo baja bajo carga, − = se flexiona en el vuelo).
//        carpo: flexión de la rodilla en el vuelo (rad, solo manos; en el apoyo queda recta).
//        flexCasco: flexión del casco respecto de la cuartilla en el vuelo. mezclaCasco: 0 = suela paralela al
//          suelo, 1 = casco rígido con la cuartilla (por defecto 0 apoyado y 1 en el vuelo).
//        compensa (0 … 1, por defecto 1): cuánto compensa el IK apoyado si la pata no llega (al pisar entra de a poco).
//          En la primera mitad del vuelo la compensación que tenía la pata al despegar (cuartilla, escápula y
//          breakover) sigue con su velocidad y se apaga con 1 − mezclaCasco; en la segunda mitad solo acerca el IK.
//        Si nada de una pata cambió desde el cuadro anterior (casco, opciones y tronco), no se vuelve a resolver.
//     cola: { alzada (0 colgando … 1 galope), balanceo (0 … 1,5), viento, giro }
//        La cerda es una cadena con inercia (se atrasa respecto del cuerpo, flamea): viento = velocidad del aire
//        hacia atrás en m/s (por defecto 0,4 + 6·alzada); giro = velocidad de giro en rad/s (por defecto se
//        estima con cuerpo.curva); la cola se abre hacia afuera de la curva.
//     orejas: { izq, der }  giro hacia atrás (0 = adelante, ~1,6 = de costado, ~2,5 = pegadas atrás)
//     crin: { agitacion, frecuencia, viento }   tiempo: segundos (crin, cola y orejas; un salto atrás del reloj
//        reinicia la cola en reposo; el IK lo usa para la velocidad de la compensación al despegar)
//   caballo.patas: [{ id, delantera, lado (+1 derecha), hombro | cadera (Vector3, tope del miembro en reposo),
//                     alcanceMax, cascoReposo (Vector3), pinza (Vector3 local del casco), HOOF_H }]
//   caballo.cascoConPinza(pinzaSuelo, inclinacion, out, pata, rumbo = 0): centro de la corona para una pinza fija
//     en el suelo.
//   caballo.legs[]: resultado del IK por pata (id, inclinacion real, stance, hoof, rest).
//   caballo.anatomia = { ARTIC, MARCAS }; caballo.superficieTorso / neckSurf / headSurf: puntos de la piel;
//   TOP/BOT/SIDE/TORSO_BUMPS: perfiles del tronco ajustados a la piel, para la montura; body, neckPivot,
//   neckRoot (marco de C7–T1: lo que se cuelga ahí sigue la base del cuello), headGroup, headInner, darkMat, NV.
//   caballo.medirEstiramiento(): estiramiento de las aristas en la pose actual (pruebas). En localhost queda
//   window.__caballo con esta misma API (y _campo, el campo de distancias, solo para depurar).
//
// PELO
//   Crin, copete, cola, pestañas y pelos de las orejas son UNA malla con piel (SkinnedMesh, 1 draw call) sobre
//   un esqueleto propio: los 30 huesos del cuerpo + 10 de la crin (mechones que flamean alrededor de la cresta)
//   + copete + 2 orejas + 10 de la cola. Por cuadro solo se calculan esas matrices (la GPU deforma la malla).
//   El maslo es un tubo con piel en los huesos de la cola, con el material del cuerpo (mismo programa).
import { V, lin, lerp, sstep, TAU, rnd, prof, cap, section, crearRuido3 } from './util.js';
import { shadowed } from './escena.js';

// =====================================================================================================
// ANATOMÍA (datos puros, lado derecho z > 0; el izquierdo es el espejo). docs/investigacion-anatomia.md §1.2
// =====================================================================================================
export const ARTIC = {
  AO: [1.285, 1.955, 0], C1C2: [1.235, 1.885, 0], C3C4: [1.09, 1.625, 0], C5C6: [0.945, 1.395, 0], C7T1: [0.83, 1.215, 0],
  T6: [0.60, 1.28, 0], T10: [0.43, 1.32, 0], T18L1: [0.10, 1.375, 0], LS: [-0.20, 1.43, 0], S5: [-0.46, 1.42, 0], Cd1: [-0.50, 1.415, 0],
  escapulaDorsal: [0.635, 1.505, 0.10], escapulaPivote: [0.69, 1.42, 0.11], hombro: [0.965, 1.075, 0.165], codo: [0.735, 0.89, 0.165],
  rodilla: [0.735, 0.48, 0.13], menudilloD: [0.735, 0.178, 0.125], coronaD: [0.826, 0.053, 0.125],
  cadera: [-0.37, 1.25, 0.20], babilla: [-0.265, 0.875, 0.19], corvejon: [-0.615, 0.575, 0.135],
  menudilloT: [-0.615, 0.175, 0.12], coronaT: [-0.536, 0.053, 0.12]
};
export const MARCAS = {
  cruz: [0.45, 1.60, 0], encuentro: [1.03, 1.06, 0.20], olecranon: [0.65, 0.96, 0.15], puntaCadera: [-0.04, 1.46, 0.245],
  tuberSacro: [-0.22, 1.575, 0.045], trocanter: [-0.34, 1.33, 0.235], puntaNalga: [-0.625, 1.28, 0.10], rotula: [-0.19, 0.94, 0.17],
  puntaCorvejon: [-0.70, 0.65, 0.135], espinaEscapular: [0.80, 1.30, 0.175], manubrio: [0.98, 1.00, 0], nuca: [1.33, 2.05, 0]
};
// Cabeza: eje de la nuca al labio superior, 0,60 m a 58° bajo la horizontal. Coordenadas de cabeza (u, v, w):
// u a lo largo del eje desde la nuca, v hacia la frente (− hacia la quijada), w = z.
const CAB = { N: [1.33, 2.05], L: 0.60, A: [Math.cos(-58 * Math.PI / 180), Math.sin(-58 * Math.PI / 180)] };
CAB.F = [-CAB.A[1], CAB.A[0]];
const hp = (u, v, w = 0) => [CAB.N[0] + u * CAB.A[0] + v * CAB.F[0], CAB.N[1] + u * CAB.A[1] + v * CAB.F[1], w];
const HOOF_H = 0.053;          // de la corona (articulación interfalangiana distal) al suelo, con el casco plano
const H_MALLA = 0.0118;        // lado de la grilla fina (m): el horneado admite hasta 65.535 vértices

// huesos
const HB = { pelvis: 0, lomo: 1, torax: 2, c0: 3, c1: 4, c2: 5, c3: 6, cabeza: 7 };
const BASE_PATA = { MD: 8, MI: 14, PD: 20, PI: 25 };
const NB = 30;
const hueso = (id, k) => BASE_PATA[id] + k;   // mano: 0 esc 1 hum 2 ant 3 caña 4 cuart 5 casco · pata: 0 fém 1 tib 2 caña 3 cuart 4 casco

// ---------- vectores livianos [x, y, z] ----------
const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vsc = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vlen = (a) => Math.hypot(a[0], a[1], a[2]);
const vnorm = (a) => { const l = vlen(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
function ejes(dir, plano) {
  const e1 = vnorm(dir);
  let e3 = vsub(plano, vsc(e1, vdot(plano, e1)));
  if (vlen(e3) < 1e-6) e3 = Math.abs(e1[1]) < 0.9 ? vcross(e1, [0, 1, 0]) : vcross(e1, [1, 0, 0]);
  e3 = vnorm(e3);
  return [e1, vcross(e3, e1), e3];
}

// ---------- primitivas SDF (devuelven { f(x, y, z), box }) ----------
// elipsoide orientado (aproximación de Íñigo Quílez); r = [a lo largo de dir, ancho, espesor en `plano`]
function elipsoide(c, r, dir = [1, 0, 0], plano = [0, 0, 1]) {
  const [e1, e2, e3] = ejes(dir, plano), [cx, cy, cz] = c, [a, b, d] = r, m = Math.max(a, b, d);
  return {
    f: (x, y, z) => {
      const dx = x - cx, dy = y - cy, dz = z - cz;
      const p1 = (dx * e1[0] + dy * e1[1] + dz * e1[2]) / a, p2 = (dx * e2[0] + dy * e2[1] + dz * e2[2]) / b, p3 = (dx * e3[0] + dy * e3[1] + dz * e3[2]) / d;
      const k0 = Math.sqrt(p1 * p1 + p2 * p2 + p3 * p3), k1 = Math.sqrt((p1 / a) ** 2 + (p2 / b) ** 2 + (p3 / d) ** 2);
      return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(a, b, d);
    },
    box: [cx - m, cx + m, cy - m, cy + m, cz - m, cz + m]
  };
}
// caja redondeada orientada: semiejes h = [a lo largo de dir, ancho, espesor en `plano`] (con el redondeo r)
function caja(c, h, r, dir = [1, 0, 0], plano = [0, 0, 1]) {
  const [e1, e2, e3] = ejes(dir, plano), [cx, cy, cz] = c, a = h[0] - r, b = h[1] - r, d = h[2] - r, m = Math.hypot(h[0], h[1], h[2]);
  return {
    f: (x, y, z) => {
      const dx = x - cx, dy = y - cy, dz = z - cz;
      const q1 = Math.abs(dx * e1[0] + dy * e1[1] + dz * e1[2]) - a, q2 = Math.abs(dx * e2[0] + dy * e2[1] + dz * e2[2]) - b, q3 = Math.abs(dx * e3[0] + dy * e3[1] + dz * e3[2]) - d;
      return Math.hypot(Math.max(q1, 0), Math.max(q2, 0), Math.max(q3, 0)) + Math.min(Math.max(q1, q2, q3), 0) - r;
    },
    box: [cx - m, cx + m, cy - m, cy + m, cz - m, cz + m]
  };
}
// cápsula de radio variable
function capsula(a, b, ra, rb) {
  const ab = vsub(b, a), L2 = vdot(ab, ab), m = Math.max(ra, rb);
  return {
    f: (x, y, z) => {
      const dx = x - a[0], dy = y - a[1], dz = z - a[2];
      let t = (dx * ab[0] + dy * ab[1] + dz * ab[2]) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      return Math.hypot(dx - ab[0] * t, dy - ab[1] * t, dz - ab[2] * t) - (ra + (rb - ra) * t);
    },
    box: [Math.min(a[0], b[0]) - m, Math.max(a[0], b[0]) + m, Math.min(a[1], b[1]) - m, Math.max(a[1], b[1]) + m, Math.min(a[2], b[2]) - m, Math.max(a[2], b[2]) + m]
  };
}
// surco: hendidura gaussiana a lo largo de una polilínea 3D (se suma al campo: empuja la piel hacia adentro)
// Con `hacia` (dirección 3D) el perfil es asimétrico: del lado de `hacia` cae con `ancho` (suave) y del otro con
// `duro` (borde marcado). El ancho se mezcla con el coseno del ángulo entre el desvío y `hacia` (sstep de −1 a 1):
// sin saltos al cruzar el plano perpendicular a `hacia` (con un corte por signo quedaba una arista)
function surco(pts, prof_, ancho, hacia = null, duro = ancho) {
  let b = [1e9, -1e9, 1e9, -1e9, 1e9, -1e9];
  pts.forEach((p) => { b = [Math.min(b[0], p[0]), Math.max(b[1], p[0]), Math.min(b[2], p[1]), Math.max(b[3], p[1]), Math.min(b[4], p[2]), Math.max(b[5], p[2])]; });
  const g = Math.max(ancho, duro) * 3, segs = [];
  for (let i = 0; i < pts.length - 1; i++) { const ab = vsub(pts[i + 1], pts[i]); segs.push([pts[i], ab, Math.max(1e-9, vdot(ab, ab))]); }
  if (pts.length === 1) segs.push([pts[0], [0, 0, 0], 1]);   // un punto solo: hoyuelo o relieve redondo (distancia al punto)
  const iw2 = 1 / (ancho * ancho), iw2d = 1 / (duro * duro), H = hacia ? vnorm(hacia) : null;
  return {
    f: (x, y, z) => {
      let m = 1e9, lado = 0;
      for (const [a, ab, L2] of segs) {
        const dx = x - a[0], dy = y - a[1], dz = z - a[2];
        let t = (dx * ab[0] + dy * ab[1] + dz * ab[2]) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = dx - ab[0] * t, ey = dy - ab[1] * t, ez = dz - ab[2] * t, d2 = ex * ex + ey * ey + ez * ez;
        if (d2 < m) { m = d2; if (H) lado = ex * H[0] + ey * H[1] + ez * H[2]; }
      }
      if (!H || m < 1e-12) return prof_ * Math.exp(-m * iw2);
      const c = lado / Math.sqrt(m);
      return prof_ * Math.exp(-m * (iw2d + (iw2 - iw2d) * sstep(-1, 1, c)));
    },
    box: [b[0] - g, b[1] + g, b[2] - g, b[3] + g, b[4] - g, b[5] + g]
  };
}
// tabla de un perfil (claves [u, valor] o número) muestreada en n puntos entre u0 y u1
function tabla(keys, u0, u1, n) {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = typeof keys === 'number' ? keys : prof(keys, u0 + (u1 - u0) * i / (n - 1));
  return a;
}
// distancia a una sección asimétrica: alto arriba ryt y abajo ryb desde la altura del ancho máximo, ancho wm
// que va hacia wt (arriba) y wb (abajo), superelipses de exponente nt / nb
function distSeccion(v, w, ryt, ryb, wm, wt, wb, nt, nb) {
  let a, ry, Wz, n;
  if (v >= 0) { ry = ryt; a = v / ry; Wz = wm + (wt - wm) * (a < 1 ? a : 1); n = nt; } else { ry = ryb; a = -v / ry; Wz = wm + (wb - wm) * (a < 1 ? a : 1); n = nb; }
  const b = Math.abs(w) / Wz;
  const q = n === 2 ? Math.sqrt(a * a + b * b) : Math.pow(Math.pow(a, n) + Math.pow(b, n), 1 / n);
  const k1 = Math.sqrt((a / ry) ** 2 + (b / Wz) ** 2);
  return k1 > 1e-9 ? q * (q - 1) / k1 : -Math.min(ry, Wz);
}
// cuerpo por perfiles a lo largo de un eje recto: O origen, A eje, U "arriba" de la sección (Z = A × U)
function perfilado({ O, A, U, u0, u1, top, bot, hm, wm, wt, wb, nt = 2, nb = 2, n = 200 }) {
  const Z = vcross(A, U);
  const T = tabla(top, u0, u1, n), B = tabla(bot, u0, u1, n), HM = tabla(hm, u0, u1, n), WM = tabla(wm, u0, u1, n), WT = tabla(wt, u0, u1, n), WB = tabla(wb, u0, u1, n);
  const inv = (n - 1) / (u1 - u0);
  const val = (a, i, f) => a[i] + (a[Math.min(n - 1, i + 1)] - a[i]) * f;
  const fn = (x, y, z) => {
    const dx = x - O[0], dy = y - O[1], dz = z - O[2];
    const u = dx * A[0] + dy * A[1] + dz * A[2], v = dx * U[0] + dy * U[1] + dz * U[2], w = dx * Z[0] + dy * Z[1] + dz * Z[2];
    const uc = u < u0 ? u0 : u > u1 ? u1 : u, ex = Math.abs(u - uc);
    const s = (uc - u0) * inv, i = Math.min(n - 2, s | 0), f = s - i;
    const yt = val(T, i, f), yb = val(B, i, f), ym = yb + (yt - yb) * val(HM, i, f);
    let d = distSeccion(v - ym, w, Math.max(1e-3, yt - ym), Math.max(1e-3, ym - yb), val(WM, i, f), val(WT, i, f), val(WB, i, f), nt, nb);
    if (ex > 0) d = d > 0 ? Math.hypot(d, ex) : Math.max(d, ex);
    return d;
  };
  // caja: esquinas del volumen local
  let vmin = 1e9, vmax = -1e9, wmax = 0;
  for (let i = 0; i < n; i++) { vmin = Math.min(vmin, B[i]); vmax = Math.max(vmax, T[i]); wmax = Math.max(wmax, WM[i], WT[i], WB[i]); }
  const b = [1e9, -1e9, 1e9, -1e9, 1e9, -1e9];
  for (const uu of [u0, u1]) for (const vv of [vmin, vmax]) for (const ww of [-wmax, wmax]) {
    const p = [O[0] + A[0] * uu + U[0] * vv + Z[0] * ww, O[1] + A[1] * uu + U[1] * vv + Z[1] * ww, O[2] + A[2] * uu + U[2] * vv + Z[2] * ww];
    b[0] = Math.min(b[0], p[0]); b[1] = Math.max(b[1], p[0]); b[2] = Math.min(b[2], p[1]); b[3] = Math.max(b[3], p[1]); b[4] = Math.min(b[4], p[2]); b[5] = Math.max(b[5], p[2]);
  }
  return { f: fn, box: b, local: (x, y, z) => { const dx = x - O[0], dy = y - O[1], dz = z - O[2]; return [dx * A[0] + dy * A[1] + dz * A[2], dx * U[0] + dy * U[1] + dz * U[2], dx * Z[0] + dy * Z[1] + dz * Z[2]]; } };
}

// ---------- loft: superficie lisa por secciones entre dos curvas del plano (x, y) ----------
// Cada estación da, para su t, los extremos P (abajo o atrás) y Q (arriba o adelante) de la sección en el plano xy y
// la forma de la sección (distSeccion en el plano (P → Q, z)): ancho máximo wm a la fracción hm desde P, que tiende a
// wt hacia Q y a wb hacia P, superelipses de exponente nt (lado de Q) y nb (lado de P); centro en z = zc. Con `lados`
// (miembros) el centro va a z = ±zc y el ancho hacia la línea media es otro (wmI, wtI, wbI).
// Todas las columnas se interpolan con Hermite monótono (C1). Un mapa 2D precalculado da la sección que pasa por cada
// punto (x, y) y se refina con Newton; fuera de [0, 1] el extremo es plano con los bordes redondeados.
// Con `horizontal` (miembros) todas las secciones son horizontales y t sale directo de la altura (sin mapa).
function crearLoft({ est, caja, h = 0.008, n = 700, ext = 0.3, lados = false, kLados = 0.02, zmax = 0.34, horizontal = false }) {
  const col = (f) => est.map((e) => [e.t, f(e)]);
  const K = [
    col((e) => e.P[0]), col((e) => e.P[1]), col((e) => e.Q[0]), col((e) => e.Q[1]),
    col((e) => e.hm ?? 0.5), col((e) => e.wm), col((e) => e.wt ?? e.wm), col((e) => e.wb ?? e.wm), col((e) => e.nt ?? 2), col((e) => e.nb ?? 2), col((e) => e.zc ?? 0),
    col((e) => e.wmI ?? e.wm), col((e) => e.wtI ?? e.wmI ?? e.wt ?? e.wm), col((e) => e.wbI ?? e.wmI ?? e.wb ?? e.wm)
  ];
  const tA = -ext, tB = 1 + ext, inv = (n - 1) / (tB - tA);
  // P y Q se extienden en línea recta más allá de los extremos (las demás columnas quedan fijas)
  const T = K.map((keys, c) => {
    const a = new Float64Array(n), d = 1e-3;
    const p0 = prof(keys, 0), p1 = prof(keys, 1), s0 = (prof(keys, d) - p0) / d, s1 = (p1 - prof(keys, 1 - d)) / d;
    for (let i = 0; i < n; i++) {
      const t = tA + i / inv;
      a[i] = c < 4 && t < 0 ? p0 + t * s0 : c < 4 && t > 1 ? p1 + (t - 1) * s1 : prof(keys, t < 0 ? 0 : t > 1 ? 1 : t);
    }
    return a;
  });
  const [TPX, TPY, TQX, TQY, THM, TWM, TWT, TWB, TNT, TNB, TZC, TWMI, TWTI, TWBI] = T;
  const der = (a) => { const d = new Float64Array(n); for (let i = 0; i < n; i++) d[i] = (a[Math.min(n - 1, i + 1)] - a[Math.max(0, i - 1)]) * inv / (i === 0 || i === n - 1 ? 1 : 2); return d; };
  const DPX = der(TPX), DPY = der(TPY), DQX = der(TQX), DQY = der(TQY);
  // mapa t(x, y): cruces de signo de g = (Q − P) × (X − P) entre estaciones vecinas; si hay varios, el de la sección
  // en la que el punto queda más adentro del segmento
  const [x0, x1, y0, y1] = caja, nx = horizontal ? 0 : Math.ceil((x1 - x0) / h) + 1, ny = horizontal ? 0 : Math.ceil((y1 - y0) / h) + 1, mapa = new Float32Array(nx * ny);
  const PASO = 4;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const X = x0 + i * h, Y = y0 + j * h;
    let best = 1e9, bt = NaN, prev = 0;
    for (let k = 0; k < n; k += PASO) {
      const Px = TPX[k], Py = TPY[k], g = (TQX[k] - Px) * (Y - Py) - (TQY[k] - Py) * (X - Px);
      if (k > 0 && (g === 0 || (g > 0) !== (prev > 0))) {
        const fr = prev / (prev - g), kk = k - PASO + fr * PASO, t = tA + kk / inv;
        const i0 = Math.min(n - 2, kk | 0), f2 = kk - i0;
        const px = TPX[i0] + (TPX[i0 + 1] - TPX[i0]) * f2, py = TPY[i0] + (TPY[i0 + 1] - TPY[i0]) * f2;
        const dx = TQX[i0] + (TQX[i0 + 1] - TQX[i0]) * f2 - px, dy = TQY[i0] + (TQY[i0 + 1] - TQY[i0]) * f2 - py;
        const s = ((X - px) * dx + (Y - py) * dy) / (dx * dx + dy * dy);
        const out = Math.max(0, -s, s - 1) + 0.3 * Math.max(0, -t, t - 1) + 0.001 * Math.abs(t - 0.5);
        if (out < best) { best = out; bt = t; }
      }
      prev = g;
    }
    mapa[i + j * nx] = bt;
  }
  // t exacto (Newton sobre g(t) = 0) a partir del mapa
  const yA = est[0].P[1], yB = est[est.length - 1].P[1];
  const tExacto = (x, y) => {
    if (horizontal) { const t = (y - yA) / (yB - yA); return t < tA ? tA : t > tB ? tB : t; }
    const fx = (x - x0) / h, fy = (y - y0) / h;
    if (fx < 0 || fy < 0 || fx >= nx - 1 || fy >= ny - 1) return NaN;
    const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, k = i + j * nx;
    let t = (mapa[k] * (1 - u) + mapa[k + 1] * u) * (1 - v) + (mapa[k + nx] * (1 - u) + mapa[k + nx + 1] * u) * v;
    if (t !== t) return NaN;
    for (let it = 0; it < 3; it++) {
      const s = (t - tA) * inv, q = s < 0 ? 0 : s > n - 2 ? n - 2 : s | 0, f = s - q, q1 = q + 1;
      const Px = TPX[q] + (TPX[q1] - TPX[q]) * f, Py = TPY[q] + (TPY[q1] - TPY[q]) * f;
      const Dx = TQX[q] + (TQX[q1] - TQX[q]) * f - Px, Dy = TQY[q] + (TQY[q1] - TQY[q]) * f - Py;
      const dPx = DPX[q] + (DPX[q1] - DPX[q]) * f, dPy = DPY[q] + (DPY[q1] - DPY[q]) * f;
      const dDx = DQX[q] + (DQX[q1] - DQX[q]) * f - dPx, dDy = DQY[q] + (DQY[q1] - DQY[q]) * f - dPy;
      const g = Dx * (y - Py) - Dy * (x - Px), dg = dDx * (y - Py) - Dx * dPy - dDy * (x - Px) + Dy * dPx;
      if (Math.abs(dg) < 1e-9) break;
      let dt = g / dg; dt = dt < -0.05 ? -0.05 : dt > 0.05 ? 0.05 : dt;
      t -= dt; t = t < tA ? tA : t > tB ? tB : t;
      if (Math.abs(dt) < 1e-6) break;
    }
    return t;
  };
  // sección en t (dentro de [0, 1]): extremos, dirección y forma
  const sec = { Px: 0, Py: 0, ux: 0, uy: 0, D: 0, hm: 0, wm: 0, wt: 0, wb: 0, nt: 2, nb: 2, zc: 0, wmI: 0, wtI: 0, wbI: 0 };
  const seccion = (t) => {
    const s = (t - tA) * inv, i = s < 0 ? 0 : s > n - 2 ? n - 2 : s | 0, f = s - i, i1 = i + 1;
    const Px = TPX[i] + (TPX[i1] - TPX[i]) * f, Py = TPY[i] + (TPY[i1] - TPY[i]) * f;
    const dx = TQX[i] + (TQX[i1] - TQX[i]) * f - Px, dy = TQY[i] + (TQY[i1] - TQY[i]) * f - Py, D = Math.hypot(dx, dy);
    sec.Px = Px; sec.Py = Py; sec.D = D; sec.ux = dx / D; sec.uy = dy / D;
    sec.hm = THM[i] + (THM[i1] - THM[i]) * f; sec.wm = TWM[i] + (TWM[i1] - TWM[i]) * f; sec.wt = TWT[i] + (TWT[i1] - TWT[i]) * f;
    sec.wb = TWB[i] + (TWB[i1] - TWB[i]) * f; sec.nt = TNT[i] + (TNT[i1] - TNT[i]) * f; sec.nb = TNB[i] + (TNB[i1] - TNB[i]) * f;
    sec.zc = TZC[i] + (TZC[i1] - TZC[i]) * f; sec.wmI = TWMI[i] + (TWMI[i1] - TWMI[i]) * f; sec.wtI = TWTI[i] + (TWTI[i1] - TWTI[i]) * f; sec.wbI = TWBI[i] + (TWBI[i1] - TWBI[i]) * f;
    return sec;
  };
  const f = (x, y, z) => {
    const t = tExacto(x, y);
    if (t !== t) return 0.3;
    const tc = t < 0 ? 0 : t > 1 ? 1 : t, S = seccion(tc);
    const rx = x - S.Px, ry = y - S.Py;
    const v = rx * S.ux + ry * S.uy - S.hm * S.D, e = Math.abs(rx * S.uy - ry * S.ux);
    const ryt = Math.max(1e-3, S.D * (1 - S.hm)), ryb = Math.max(1e-3, S.D * S.hm);
    let d;
    if (!lados) d = distSeccion(v, z - S.zc, ryt, ryb, S.wm, S.wt, S.wb, S.nt, S.nb);
    else {
      // un lado por cada signo de z; hacia la línea media (w < 0) con los anchos de adentro
      const wa = z - S.zc, wb = -z - S.zc;
      const a = wa >= 0 ? distSeccion(v, wa, ryt, ryb, S.wm, S.wt, S.wb, S.nt, S.nb) : distSeccion(v, wa, ryt, ryb, S.wmI, S.wtI, S.wbI, S.nt, S.nb);
      const b = wb >= 0 ? distSeccion(v, wb, ryt, ryb, S.wm, S.wt, S.wb, S.nt, S.nb) : distSeccion(v, wb, ryt, ryb, S.wmI, S.wtI, S.wbI, S.nt, S.nb);
      const hh = kLados - Math.abs(a - b);
      d = hh > 0 ? Math.min(a, b) - hh * hh * 0.25 / kLados : Math.min(a, b);
    }
    if (tc !== t || e > 0.003) d = d > 0 ? Math.hypot(d, e) : Math.max(d, e);
    return d;
  };
  let bx0 = 1e9, bx1 = -1e9, by0 = 1e9, by1 = -1e9;
  for (let i = 0; i < n; i++) {
    const t = tA + i / inv;
    if (t < -0.02 || t > 1.02) continue;
    bx0 = Math.min(bx0, TPX[i], TQX[i]); bx1 = Math.max(bx1, TPX[i], TQX[i]); by0 = Math.min(by0, TPY[i], TQY[i]); by1 = Math.max(by1, TPY[i], TQY[i]);
  }
  const m = 0.02;
  return { f, tDe: tExacto, seccion, box: [bx0 - m, bx1 + m, by0 - m, by1 + m, -zmax, zmax] };
}

// ---------- cuello: "loft" entre la línea superior (cresta) y la inferior (garganta), secciones no paralelas ----------
// Las estaciones dan, para t de 0 (base) a 1 (garganta), el punto de la cresta T y el de la línea inferior B.
const CUELLO = {
  T: [[0.50, 1.605], [0.71, 1.685], [0.86, 1.80], [0.98, 1.895], [1.12, 1.97], [1.28, 2.02]],
  B: [[1.00, 1.10], [1.08, 1.245], [1.135, 1.375], [1.185, 1.50], [1.225, 1.62], [1.225, 1.72]],
  W: [[0, 0.21], [0.2, 0.18], [0.4, 0.15], [0.6, 0.126], [0.8, 0.106], [1, 0.09]],
  hm: 0.42
};
function crearCuello() {
  const keys = (k, c) => CUELLO[k].map((p, i) => [i / (CUELLO[k].length - 1), p[c]]);
  const tx = keys('T', 0), ty = keys('T', 1), bx = keys('B', 0), by = keys('B', 1);
  const punto = (kx, ky, t) => {
    if (t >= 0 && t <= 1) return [prof(kx, t), prof(ky, t)];
    const e = t < 0 ? 0 : 1, d = 0.01 * (t < 0 ? 1 : -1);
    const p0 = [prof(kx, e), prof(ky, e)], p1 = [prof(kx, e + d), prof(ky, e + d)], k = (t - e) / -d;
    return [p0[0] + (p0[0] - p1[0]) * k, p0[1] + (p0[1] - p1[1]) * k];
  };
  const Tp = (t) => punto(tx, ty, t), Bp = (t) => punto(bx, by, t);
  const n = 160, TT = [], BB = [], WW = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / (n - 1); TT.push(Tp(t)); BB.push(Bp(t)); WW[i] = prof(CUELLO.W, t); }
  // tabla 2D de t sobre el plano (x, y)
  const G = { x0: 0.30, y0: 0.85, h: 0.008 };
  G.nx = Math.ceil((1.52 - G.x0) / G.h) + 1; G.ny = Math.ceil((2.25 - G.y0) / G.h) + 1;
  const tt = new Float32Array(G.nx * G.ny);
  const NS = 64, ts = [], tps = [], bps = [];
  for (let i = 0; i < NS; i++) { const t = -0.6 + 2.2 * i / (NS - 1); ts.push(t); tps.push(Tp(t)); bps.push(Bp(t)); }
  for (let j = 0; j < G.ny; j++) for (let i = 0; i < G.nx; i++) {
    const px = G.x0 + i * G.h, py = G.y0 + j * G.h;
    let best = 1e9, bt = 0, prev = 0;
    for (let k = 0; k < NS; k++) {
      const T = tps[k], B = bps[k], g = (T[0] - B[0]) * (py - B[1]) - (T[1] - B[1]) * (px - B[0]);
      if (k > 0 && (g === 0 || (g > 0) !== (prev > 0))) {
        const f = prev / (prev - g), t = lerp(ts[k - 1], ts[k], f);
        const T2 = Tp(t), B2 = Bp(t), dx = T2[0] - B2[0], dy = T2[1] - B2[1];
        const s = ((px - B2[0]) * dx + (py - B2[1]) * dy) / (dx * dx + dy * dy);
        const out = Math.max(0, -s, s - 1) + 0.02 * Math.abs(t - 0.5);
        if (out < best) { best = out; bt = t; }
      }
      prev = g;
    }
    tt[i + j * G.nx] = best < 1e8 ? bt : -1;
  }
  const tDe = (x, y) => {
    const fx = (x - G.x0) / G.h, fy = (y - G.y0) / G.h;
    if (fx < 0 || fy < 0 || fx >= G.nx - 1 || fy >= G.ny - 1) return -9;
    const i = fx | 0, j = fy | 0, u = fx - i, v = fy - j, k = i + j * G.nx;
    return (tt[k] * (1 - u) + tt[k + 1] * u) * (1 - v) + (tt[k + G.nx] * (1 - u) + tt[k + G.nx + 1] * u) * v;
  };
  const f = (x, y, z) => {
    const t = tDe(x, y);
    if (t < -5) return 1;
    const tc = t < 0 ? 0 : t > 1 ? 1 : t, ex = Math.abs(t - tc) * 0.9;
    const s = tc * (n - 1), i = Math.min(n - 2, s | 0), fr = s - i;
    const Tx = TT[i][0] + (TT[i + 1][0] - TT[i][0]) * fr, Ty = TT[i][1] + (TT[i + 1][1] - TT[i][1]) * fr;
    const Bx = BB[i][0] + (BB[i + 1][0] - BB[i][0]) * fr, By = BB[i][1] + (BB[i + 1][1] - BB[i][1]) * fr;
    const W = WW[i] + (WW[i + 1] - WW[i]) * fr;
    const dx = Tx - Bx, dy = Ty - By, D = Math.hypot(dx, dy), ux = dx / D, uy = dy / D;
    const cx = Bx + dx * CUELLO.hm, cy = By + dy * CUELLO.hm;
    const v = (x - cx) * ux + (y - cy) * uy;
    // distancia fuera del plano de la sección (≈ 0 donde la tabla es válida; evita islas lejos del cuello)
    const e = Math.max(ex, Math.abs((x - cx) * uy - (y - cy) * ux) - 0.004);
    let d = distSeccion(v, z, D * (1 - CUELLO.hm), D * CUELLO.hm, W, W * 0.5, W * 0.84, 2, 2.3);
    if (e > 0) d = d > 0 ? Math.hypot(d, e) : Math.max(d, e);
    return d;
  };
  return { f, box: [0.42, 1.36, 0.98, 2.08, -0.22, 0.22], tDe, Tp, Bp, W: (t) => prof(CUELLO.W, t) };
}

// =====================================================================================================
// CAMPO DE DISTANCIAS DEL CUERPO
// =====================================================================================================
// Cada primitiva: { f, box, k, op (0 unión suave, 1 resta suave, 2 surco o relieve) }. El orden de la lista es el de
// las capas. Los pesos de piel no salen de las primitivas sino de los lofts (calcularPesosPiel).
export function crearCampo() {
  const prims = [];
  const U = (p, k) => { prims.push({ f: p.f, box: p.box, k, op: 0 }); return p; };
  const R = (p, k) => { prims.push({ f: p.f, box: p.box, k, op: 1 }); return p; };
  const Gs = (p) => { prims.push({ f: p.f, box: p.box, k: 0, op: 2 }); return p; };
  // pertenencia a huesos (la usa calcularPesosPiel a través de mEje): tronco por x (grupa, lomo, tórax)
  const mX = (x, y, z, w, W) => {
    const wp = sstep(-0.02, -0.2, x), wt = sstep(0.38, 0.62, x);
    W[HB.pelvis] += w * wp; W[HB.torax] += w * wt; W[HB.lomo] += w * Math.max(0, 1 - wp - wt);
  };
  const cuello = crearCuello();
  const tJ = ['C7T1', 'C5C6', 'C3C4', 'C1C2', 'AO'].map((k) => cuello.tDe(ARTIC[k][0], ARTIC[k][1]));
  const NECKB = [HB.torax, HB.c0, HB.c1, HB.c2, HB.c3, HB.cabeza], BW_CUELLO = [0.16, 0.09, 0.08, 0.07, 0.08];
  const pesoCuello = (t, w, W) => {
    let rem = w;
    for (let i = 0; i < tJ.length; i++) { const bw = BW_CUELLO[i], f = sstep(tJ[i] - bw, tJ[i] + bw, t); W[NECKB[i]] += rem * (1 - f); rem *= f; }
    W[HB.cabeza] += rem;
  };

  // ---------------- capa 1: volumen axial (UN loft de la cola a la nuca) ----------------
  // Estaciones [xT, yT, xB, yB, hm, wm, wt, wb, nt, nb]: T sobre la línea superior de la piel y B sobre la inferior
  // (perfil de foto-1). En el tronco las secciones son verticales; desde la cruz giran de a poco (B corre por el pecho
  // más rápido que T por la cruz) hasta quedar perpendiculares al cuello: no hay escalón en la cruz ni en el pecho.
  // Anchos del tronco: referencias/medidas.md "Medidas en 3 vistas"; del cuello, investigacion-anatomia.md §4.3.
  const EJE = [
    [-0.665, 1.440, -0.665, 1.260, 0.50, 0.045, 0.035, 0.035, 2, 2],
    [-0.62, 1.515, -0.62, 1.120, 0.55, 0.150, 0.130, 0.080, 2.2, 2],
    [-0.55, 1.553, -0.55, 1.050, 0.58, 0.205, 0.225, 0.100, 2.1, 2],
    [-0.45, 1.594, -0.45, 1.010, 0.55, 0.235, 0.250, 0.120, 2.1, 2],
    [-0.35, 1.606, -0.35, 1.015, 0.45, 0.248, 0.265, 0.130, 2.15, 2],
    [-0.25, 1.603, -0.25, 1.035, 0.38, 0.258, 0.278, 0.150, 2.25, 2.2],
    [-0.15, 1.586, -0.15, 1.005, 0.32, 0.268, 0.290, 0.180, 2.5, 2.3],
    [-0.05, 1.566, -0.05, 0.955, 0.32, 0.283, 0.305, 0.200, 2.5, 2.4],
    [0.05, 1.553, 0.05, 0.905, 0.38, 0.290, 0.290, 0.250, 2.2, 2.6],
    [0.15, 1.552, 0.15, 0.876, 0.40, 0.293, 0.285, 0.252, 2.0, 2.7],
    [0.25, 1.568, 0.25, 0.864, 0.40, 0.288, 0.270, 0.252, 2.0, 2.7],
    [0.35, 1.597, 0.40, 0.855, 0.36, 0.272, 0.200, 0.225, 2.0, 2.5],
    [0.44, 1.615, 0.58, 0.862, 0.33, 0.250, 0.155, 0.210, 2.0, 2.5],
    [0.52, 1.624, 0.76, 0.903, 0.36, 0.240, 0.125, 0.200, 2.0, 2.6],
    [0.60, 1.636, 0.92, 0.912, 0.40, 0.235, 0.120, 0.200, 2.0, 2.7],
    [0.66, 1.660, 1.04, 0.968, 0.42, 0.215, 0.120, 0.200, 2.0, 2.7],
    [0.72, 1.700, 1.08, 1.070, 0.43, 0.190, 0.100, 0.180, 2.0, 2.6],
    [0.80, 1.768, 1.105, 1.190, 0.42, 0.170, 0.085, 0.150, 2, 2.4],
    [0.88, 1.845, 1.130, 1.290, 0.42, 0.152, 0.076, 0.130, 2, 2.3],
    [0.96, 1.913, 1.160, 1.365, 0.42, 0.138, 0.069, 0.116, 2, 2.3],
    [1.04, 1.963, 1.195, 1.440, 0.42, 0.130, 0.065, 0.110, 2, 2.4],
    [1.12, 1.998, 1.228, 1.510, 0.42, 0.120, 0.060, 0.102, 2, 2.5],
    [1.20, 2.038, 1.255, 1.600, 0.42, 0.112, 0.056, 0.095, 2, 2.5],
    [1.28, 2.045, 1.270, 1.700, 0.42, 0.105, 0.052, 0.090, 2, 2.5]
  ];
  // t: largo recorrido por el punto medio de la sección, normalizado
  const estEje = [];
  {
    let u = 0, prev = null;
    for (const e of EJE) {
      const mx = (e[0] + e[2]) / 2, my = (e[1] + e[3]) / 2;
      if (prev) u += Math.hypot(mx - prev[0], my - prev[1]);
      prev = [mx, my];
      estEje.push({ t: u, Q: [e[0], e[1]], P: [e[2], e[3]], hm: e[4], wm: e[5], wt: e[6], wb: e[7], nt: e[8], nb: e[9] });
    }
    for (const e of estEje) e.t /= u;
    estEje.largo = u;
  }
  const eje = crearLoft({ est: estEje, caja: [-0.95, 1.52, 0.5, 2.3], h: 0.014 });
  // pesos: rectas de corte por cada articulación del cuello (con la dirección de las secciones del cuello, la de
  // C7–T1 corrida 6 cm hacia la cabeza para que el pecho y la cruz queden en el tórax); del lado del tronco, por x
  // (grupa, lomo, tórax)
  const cortesCuello = ['C7T1', 'C5C6', 'C3C4', 'C1C2', 'AO'].map((k, i) => {
    const J = ARTIC[k], t = Math.max(0, Math.min(1, cuello.tDe(J[0], J[1]))), T = cuello.Tp(t), B = cuello.Bp(t);
    let nx = T[1] - B[1], ny = B[0] - T[0]; const l = Math.hypot(nx, ny); nx /= l; ny /= l;
    if ((CAB.N[0] - J[0]) * nx + (CAB.N[1] - J[1]) * ny < 0) { nx = -nx; ny = -ny; }
    const off = i === 0 ? 0.06 : 0;
    return { x: J[0] + nx * off, y: J[1] + ny * off, nx, ny, bw: [0.10, 0.08, 0.08, 0.09, 0.09][i] };
  });
  const mEje = (x, y, z, w, W) => {
    let rem = w;
    for (let i = 0; i < 5; i++) {
      const c = cortesCuello[i], f = sstep(-c.bw, c.bw, (x - c.x) * c.nx + (y - c.y) * c.ny), q = rem * (1 - f);
      if (i === 0) mX(x, y, z, q, W); else W[NECKB[i]] += q;
      rem *= f;
      if (rem <= 0) return;
    }
    W[HB.cabeza] += rem;
  };
  U(eje, 0.01);
  // cabeza (perfiles en coordenadas de cabeza), unida al cuello con una sola mezcla en la garganta y la nuca
  const cabeza = perfilado({
    O: [CAB.N[0], CAB.N[1], 0], A: [CAB.A[0], CAB.A[1], 0], U: [CAB.F[0], CAB.F[1], 0], u0: -0.04, u1: 0.615,
    top: [[-0.04, -0.10], [0.0, -0.03], [0.04, 0.002], [0.10, 0.004], [0.20, 0.0], [0.30, -0.002], [0.40, -0.006], [0.48, -0.012], [0.54, -0.024], [0.58, -0.04], [0.605, -0.06], [0.615, -0.075]],
    bot: [[-0.04, -0.135], [0.02, -0.17], [0.08, -0.23], [0.14, -0.255], [0.20, -0.245], [0.26, -0.21], [0.32, -0.17], [0.42, -0.14], [0.50, -0.125], [0.56, -0.12], [0.60, -0.105], [0.615, -0.085]],
    hm: 0.6,
    wm: [[-0.04, 0.06], [0.02, 0.077], [0.08, 0.095], [0.16, 0.102], [0.22, 0.094], [0.30, 0.072], [0.38, 0.063], [0.46, 0.057], [0.53, 0.057], [0.58, 0.056], [0.615, 0.04]],
    wt: [[-0.04, 0.05], [0.04, 0.072], [0.12, 0.092], [0.20, 0.086], [0.30, 0.06], [0.40, 0.05], [0.50, 0.045], [0.58, 0.04], [0.615, 0.03]],
    wb: [[-0.04, 0.05], [0.10, 0.06], [0.20, 0.055], [0.30, 0.045], [0.45, 0.042], [0.55, 0.05], [0.615, 0.035]],
    nt: 3, nb: 2.2
  });
  U(cabeza, 0.05);
  U(elipsoide([-0.605, 1.415, 0], [0.06, 0.045, 0.05]), 0.05);     // nacimiento de la cola

  // ---------------- capa 2: miembros, lofts por cortes horizontales ----------------
  // Contornos de perfil (adelante y atrás) de foto-1; centro zc y semianchos hacia afuera (wl) y hacia la línea media
  // (wi) por altura; hm = altura del ancho máximo entre atrás (0) y adelante (1); ft, fb: ancho relativo hacia adelante y
  // hacia atrás (y fti, fbi del lado de adentro). Las dos manos (y las dos patas) son UNA primitiva: entre sí se mezclan
  // con radio chico (la hendidura bajo la cola, la luz entre los antebrazos) y con el tronco con una sola mezcla amplia.
  // [y, xAtras, xAdelante, zc, hm, wl, wi, ft, fb, fti, fbi]
  const MANO = [
    [0.040, 0.772, 0.836, 0.126, 0.50, 0.040, 0.040, 0.9, 0.9, 0.9, 0.9],
    [0.065, 0.774, 0.850, 0.126, 0.50, 0.042, 0.042, 0.9, 0.9, 0.9, 0.9],
    [0.090, 0.762, 0.842, 0.125, 0.50, 0.033, 0.033, 0.9, 0.9, 0.9, 0.9],
    [0.115, 0.748, 0.822, 0.126, 0.50, 0.030, 0.030, 0.9, 0.9, 0.9, 0.9],
    [0.140, 0.690, 0.802, 0.126, 0.55, 0.032, 0.032, 0.9, 0.8, 0.9, 0.8],
    [0.165, 0.678, 0.784, 0.126, 0.50, 0.039, 0.039, 0.9, 0.8, 0.9, 0.8],
    [0.190, 0.675, 0.775, 0.125, 0.50, 0.039, 0.039, 0.9, 0.8, 0.9, 0.8],
    [0.215, 0.682, 0.766, 0.126, 0.55, 0.033, 0.033, 0.9, 0.7, 0.9, 0.7],
    [0.250, 0.690, 0.762, 0.126, 0.60, 0.027, 0.027, 0.9, 0.6, 0.9, 0.6],
    [0.300, 0.690, 0.758, 0.127, 0.60, 0.026, 0.026, 0.9, 0.6, 0.9, 0.6],
    [0.400, 0.690, 0.762, 0.128, 0.60, 0.027, 0.027, 0.9, 0.6, 0.9, 0.6],
    [0.440, 0.694, 0.772, 0.129, 0.55, 0.036, 0.036, 0.9, 0.7, 0.9, 0.7],
    [0.465, 0.700, 0.778, 0.130, 0.55, 0.044, 0.044, 0.9, 0.7, 0.9, 0.7],
    [0.490, 0.692, 0.782, 0.130, 0.55, 0.048, 0.048, 0.9, 0.7, 0.9, 0.7],
    [0.515, 0.688, 0.790, 0.131, 0.55, 0.052, 0.052, 0.9, 0.7, 0.9, 0.7],
    [0.540, 0.690, 0.794, 0.132, 0.58, 0.043, 0.045, 0.9, 0.7, 0.9, 0.7],
    [0.600, 0.688, 0.803, 0.136, 0.58, 0.048, 0.052, 0.9, 0.7, 0.9, 0.7],
    [0.700, 0.672, 0.820, 0.145, 0.56, 0.058, 0.072, 0.9, 0.7, 0.9, 0.7],
    [0.800, 0.656, 0.832, 0.150, 0.55, 0.066, 0.086, 0.9, 0.7, 0.9, 0.7],
    [0.850, 0.645, 0.860, 0.152, 0.55, 0.068, 0.100, 0.9, 0.7, 0.9, 0.7],
    [0.900, 0.630, 0.905, 0.150, 0.58, 0.072, 0.122, 0.9, 0.7, 0.9, 0.6],
    [0.950, 0.620, 0.950, 0.146, 0.60, 0.074, 0.140, 0.9, 0.7, 0.9, 0.6],
    [1.000, 0.625, 0.990, 0.140, 0.60, 0.078, 0.140, 0.9, 0.7, 0.9, 0.6],
    [1.060, 0.640, 1.010, 0.130, 0.58, 0.080, 0.132, 0.8, 0.7, 0.9, 0.6],
    [1.120, 0.670, 1.000, 0.118, 0.55, 0.072, 0.118, 0.8, 0.7, 0.9, 0.6],
    [1.180, 0.720, 0.980, 0.100, 0.50, 0.040, 0.070, 0.9, 0.7, 0.9, 0.7],
    [1.260, 0.780, 0.930, 0.080, 0.50, 0.010, 0.020, 0.9, 0.7, 0.9, 0.7]
  ];
  const PATA = [
    [0.040, -0.590, -0.528, 0.120, 0.50, 0.040, 0.040, 0.9, 0.9, 0.9, 0.9],
    [0.065, -0.588, -0.512, 0.120, 0.50, 0.040, 0.040, 0.9, 0.9, 0.9, 0.9],
    [0.090, -0.600, -0.522, 0.120, 0.50, 0.032, 0.032, 0.9, 0.9, 0.9, 0.9],
    [0.115, -0.614, -0.542, 0.120, 0.50, 0.029, 0.029, 0.9, 0.9, 0.9, 0.9],
    [0.140, -0.668, -0.558, 0.120, 0.45, 0.032, 0.032, 0.8, 0.9, 0.8, 0.9],
    [0.165, -0.676, -0.572, 0.120, 0.50, 0.039, 0.039, 0.8, 0.9, 0.8, 0.9],
    [0.190, -0.678, -0.576, 0.120, 0.50, 0.039, 0.039, 0.8, 0.9, 0.8, 0.9],
    [0.215, -0.674, -0.584, 0.122, 0.45, 0.033, 0.033, 0.7, 0.9, 0.7, 0.9],
    [0.250, -0.671, -0.584, 0.123, 0.40, 0.028, 0.028, 0.6, 0.9, 0.6, 0.9],
    [0.350, -0.668, -0.584, 0.124, 0.40, 0.027, 0.027, 0.6, 0.9, 0.6, 0.9],
    [0.450, -0.668, -0.584, 0.126, 0.40, 0.029, 0.029, 0.6, 0.9, 0.6, 0.9],
    [0.500, -0.664, -0.582, 0.130, 0.45, 0.033, 0.033, 0.7, 0.9, 0.7, 0.9],
    [0.540, -0.661, -0.576, 0.132, 0.45, 0.036, 0.036, 0.8, 0.9, 0.8, 0.9],
    [0.565, -0.662, -0.564, 0.133, 0.45, 0.038, 0.038, 0.8, 0.8, 0.8, 0.8],
    [0.590, -0.684, -0.538, 0.134, 0.50, 0.040, 0.040, 0.8, 0.5, 0.8, 0.5],
    [0.615, -0.700, -0.514, 0.136, 0.55, 0.043, 0.043, 0.7, 0.4, 0.7, 0.4],
    [0.640, -0.714, -0.490, 0.138, 0.58, 0.045, 0.045, 0.65, 0.35, 0.65, 0.35],
    [0.665, -0.718, -0.466, 0.140, 0.60, 0.047, 0.047, 0.65, 0.32, 0.65, 0.32],
    [0.690, -0.706, -0.440, 0.140, 0.60, 0.049, 0.056, 0.65, 0.32, 0.65, 0.35],
    [0.740, -0.686, -0.385, 0.140, 0.60, 0.056, 0.088, 0.65, 0.35, 0.6, 0.5],
    [0.790, -0.664, -0.325, 0.140, 0.58, 0.067, 0.112, 0.6, 0.45, 0.5, 0.75],
    [0.840, -0.652, -0.262, 0.135, 0.55, 0.082, 0.120, 0.6, 0.6, 0.4, 0.9],
    [0.890, -0.656, -0.180, 0.130, 0.52, 0.095, 0.117, 0.6, 0.7, 0.4, 0.9],
    [0.940, -0.664, -0.135, 0.130, 0.50, 0.115, 0.117, 0.6, 0.75, 0.4, 0.9],
    [1.000, -0.670, -0.150, 0.135, 0.48, 0.130, 0.124, 0.6, 0.8, 0.4, 0.9],
    [1.100, -0.680, -0.130, 0.135, 0.46, 0.133, 0.133, 0.6, 0.8, 0.4, 0.9],
    [1.200, -0.686, -0.120, 0.130, 0.46, 0.130, 0.128, 0.6, 0.8, 0.4, 0.9],
    [1.300, -0.682, -0.140, 0.125, 0.46, 0.125, 0.122, 0.6, 0.8, 0.4, 0.9],
    [1.380, -0.672, -0.170, 0.115, 0.46, 0.098, 0.100, 0.6, 0.8, 0.4, 0.9],
    [1.440, -0.672, -0.230, 0.100, 0.46, 0.065, 0.065, 0.6, 0.8, 0.4, 0.9],
    [1.500, -0.640, -0.300, 0.080, 0.46, 0.012, 0.012, 0.6, 0.8, 0.4, 0.9]
  ];
  const estMiembro = (T) => {
    const y0 = T[0][0], y1 = T[T.length - 1][0];
    return T.map(([y, xb, xf, zc, hm, wl, wi, ft, fb, fti, fbi]) => ({ t: (y - y0) / (y1 - y0), P: [xb, y], Q: [xf, y], zc, hm, wm: wl, wt: wl * ft, wb: wl * fb, wmI: wi, wtI: wi * fti, wbI: wi * fbi }));
  };
  const manos = crearLoft({ est: estMiembro(MANO), caja: [0.45, 1.2, -0.05, 1.3], n: 500, ext: 0.08, horizontal: true, lados: true, kLados: 0.02, zmax: 0.3 });
  const patas = crearLoft({ est: estMiembro(PATA), caja: [-0.95, 0.1, -0.05, 1.6], n: 500, ext: 0.08, horizontal: true, lados: true, kLados: 0.012, zmax: 0.32 });
  U(manos, 0.09);
  U(patas, 0.07);

  const A_ = CAB.A.concat(0), F_ = CAB.F.concat(0);
  [1, -1].forEach((s) => {
    const z = (p) => [p[0], p[1], p[2] * s], Zs = [0, 0, s];
    const hz = (u, v, w) => hp(u, v, w * s);
    // cabeza: masetero (ganacha)
    U(elipsoide(hz(0.16, -0.205, 0.06), [0.10, 0.10, 0.035], A_, Zs), 0.045);

    // ---------------- capa 3: huesos subcutáneos y articulaciones (relieve bajo, mezcla chica) ----------------
    const DIRC = [0.905, 0.426, 0];   // plano de la corona del casco (más alta en la pinza que en los talones)
    // corvejón: bloque anguloso, punta del calcáneo atrás y arriba, cuerda recta hacia la pierna
    U(caja(z([-0.62, 0.565, 0.135]), [0.05, 0.043, 0.032], 0.014, [0, 1, 0], Zs), 0.025);
    U(capsula(z([-0.58, 0.86, 0.135]), z([-0.70, 0.665, 0.135]), 0.02, 0.016), 0.03);   // cuerda del corvejón
    U(capsula(z([-0.668, 0.60, 0.135]), z([-0.703, 0.655, 0.135]), 0.02, 0.021), 0.02);   // punta del corvejón (calcáneo)
    U(capsula(z([-0.65, 0.50, 0.13]), z([-0.656, 0.21, 0.12]), 0.018, 0.018), 0.008);   // tendones flexores
    U(elipsoide(z([-0.625, 0.178, 0.12]), [0.045, 0.045, 0.039]), 0.02);   // menudillo
    U(elipsoide(z([-0.655, 0.185, 0.12]), [0.024, 0.033, 0.03]), 0.015);   // sesamoideos
    U(elipsoide(z([-0.67, 0.148, 0.12]), [0.012, 0.01, 0.012]), 0.02);   // espolón
    U(elipsoide(z([-0.556, 0.052, 0.12]), [0.042, 0.02, 0.047], DIRC, Zs), 0.02);   // rodete coronario
    U(elipsoide(z([-0.62, 0.48, 0.095]), [0.014, 0.02, 0.01]), 0.006);   // castaño
    U(elipsoide(z([0.655, 0.955, 0.15]), [0.035, 0.04, 0.03]), 0.025);   // olécranon
    U(caja(z([0.743, 0.478, 0.13]), [0.042, 0.035, 0.044], 0.014, [0, 1, 0], Zs), 0.02);   // rodilla: plana y ancha de frente
    U(elipsoide(z([0.697, 0.50, 0.133]), [0.016, 0.03, 0.016]), 0.02);   // hueso accesorio (apenas sale atrás: la rodilla angulosa, no una bola)
    U(capsula(z([0.705, 0.43, 0.13]), z([0.704, 0.205, 0.125]), 0.017, 0.017), 0.008);   // tendones flexores
    U(elipsoide(z([0.728, 0.18, 0.125]), [0.044, 0.044, 0.038]), 0.02);   // menudillo
    U(elipsoide(z([0.70, 0.186, 0.125]), [0.023, 0.032, 0.029]), 0.015);   // sesamoideos
    U(elipsoide(z([0.685, 0.15, 0.125]), [0.012, 0.01, 0.012]), 0.02);   // espolón
    U(elipsoide(z([0.806, 0.052, 0.125]), [0.042, 0.02, 0.05], DIRC, Zs), 0.02);   // rodete coronario
    U(elipsoide(z([0.745, 0.605, 0.105]), [0.018, 0.028, 0.012]), 0.006);   // castaño
    // cabeza
    U(capsula(hz(0.06, -0.06, 0.085), hz(0.17, -0.07, 0.088), 0.012, 0.012), 0.03);   // arco cigomático
    U(capsula(hz(0.165, -0.022, 0.08), hz(0.235, -0.018, 0.078), 0.012, 0.011), 0.02);   // reborde supraorbitario
    U(elipsoide(hz(0.205, -0.045, 0.07), [0.035, 0.03, 0.025], A_, Zs), 0.02);   // órbita
    U(capsula(hz(0.25, -0.09, 0.082), hz(0.36, -0.08, 0.072), 0.009, 0.009), 0.018);   // cresta facial
    U(capsula(hz(0.05, -0.11, 0.07), hz(0.13, -0.275, 0.06), 0.015, 0.015), 0.03);   // borde de la rama de la mandíbula
    U(capsula(hz(0.13, -0.27, 0.055), hz(0.30, -0.195, 0.035), 0.014, 0.014), 0.04);   // borde inferior
    U(capsula(hz(0.30, -0.195, 0.035), hz(0.525, -0.125, 0.02), 0.012, 0.012), 0.04);
    U(elipsoide(hz(0.008, -0.03, 0.054), [0.022, 0.018, 0.022]), 0.03);   // base de la oreja (queda dentro del tubo de la oreja)
  });
  // línea media: mentón y labios
  U(elipsoide(hp(0.54, -0.142, 0), [0.032, 0.03, 0.034], A_), 0.018);   // mentón
  U(elipsoide(hp(0.585, -0.065, 0), [0.035, 0.045, 0.052], A_), 0.025);   // labio superior
  U(elipsoide(hp(0.575, -0.108, 0), [0.03, 0.022, 0.04], A_), 0.02);   // labio inferior

  // ---------- índice por bloques: cada muestra evalúa solo las primitivas cercanas ----------
  const DOM = { x0: -0.92, x1: 1.78, y0: -0.03, y1: 2.24, z0: -0.4, z1: 0.4, bs: 0.06 };
  DOM.nx = Math.ceil((DOM.x1 - DOM.x0) / DOM.bs); DOM.ny = Math.ceil((DOM.y1 - DOM.y0) / DOM.bs); DOM.nz = Math.ceil((DOM.z1 - DOM.z0) / DOM.bs);
  let FN, OP, KK, LISTS;
  function indexar() {
    FN = prims.map((p) => p.f); OP = Int8Array.from(prims.map((p) => p.op)); KK = Float32Array.from(prims.map((p) => p.k));
    const tmp = Array.from({ length: DOM.nx * DOM.ny * DOM.nz }, () => []);
    prims.forEach((p, n) => {
      const g = p.op === 2 ? 0.01 : p.k + 0.045, b = p.box;
      const i0 = Math.max(0, Math.floor((b[0] - g - DOM.x0) / DOM.bs)), i1 = Math.min(DOM.nx - 1, Math.floor((b[1] + g - DOM.x0) / DOM.bs));
      const j0 = Math.max(0, Math.floor((b[2] - g - DOM.y0) / DOM.bs)), j1 = Math.min(DOM.ny - 1, Math.floor((b[3] + g - DOM.y0) / DOM.bs));
      const k0 = Math.max(0, Math.floor((b[4] - g - DOM.z0) / DOM.bs)), k1 = Math.min(DOM.nz - 1, Math.floor((b[5] + g - DOM.z0) / DOM.bs));
      for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) tmp[i + DOM.nx * (j + DOM.ny * k)].push(n);
    });
    LISTS = tmp.map((l) => Int32Array.from(l));
  }
  const lista = (x, y, z) => {
    let i = ((x - DOM.x0) / DOM.bs) | 0, j = ((y - DOM.y0) / DOM.bs) | 0, k = ((z - DOM.z0) / DOM.bs) | 0;
    i = i < 0 ? 0 : i >= DOM.nx ? DOM.nx - 1 : i; j = j < 0 ? 0 : j >= DOM.ny ? DOM.ny - 1 : j; k = k < 0 ? 0 : k >= DOM.nz ? DOM.nz - 1 : k;
    return LISTS[i + DOM.nx * (j + DOM.ny * k)];
  };
  function evaluar(x, y, z) {
    const L = lista(x, y, z);
    let d = 1;
    for (let n = 0; n < L.length; n++) {
      const i = L[n], v = FN[i](x, y, z), op = OP[i];
      if (op === 0) { const k = KK[i], h = k - Math.abs(d - v); d = h > 0 ? Math.min(d, v) - h * h * 0.25 / k : Math.min(d, v); }
      else if (op === 1) { const k = KK[i], a = -d, h = k - Math.abs(a - v); d = -(h > 0 ? Math.min(a, v) - h * h * 0.25 / k : Math.min(a, v)); }
      else d += v;
    }
    return d;
  }
  const gradiente = (x, y, z, e, out) => {
    out[0] = evaluar(x + e, y, z) - evaluar(x - e, y, z); out[1] = evaluar(x, y + e, z) - evaluar(x, y - e, z); out[2] = evaluar(x, y, z + e) - evaluar(x, y, z - e);
    const l = Math.hypot(out[0], out[1], out[2]) || 1; out[0] /= l; out[1] /= l; out[2] /= l; return out;
  };
  // rayo desde un punto interior: primer cruce con la piel (null si no sale)
  function rayo(o, dir, max = 0.6) {
    let s = 0, d = evaluar(o[0], o[1], o[2]);
    if (d > 0) {   // empezó afuera: volver hacia adentro por el rayo opuesto un poco
      return null;
    }
    let prevS = 0;
    for (let it = 0; it < 80 && s < max; it++) {
      prevS = s; s += Math.max(0.0015, -d * 0.85);
      d = evaluar(o[0] + dir[0] * s, o[1] + dir[1] * s, o[2] + dir[2] * s);
      if (d > 0) {
        let a = prevS, b = s;
        for (let k = 0; k < 14; k++) { const m = (a + b) / 2; if (evaluar(o[0] + dir[0] * m, o[1] + dir[1] * m, o[2] + dir[2] * m) > 0) b = m; else a = m; }
        const t = (a + b) / 2, p = [o[0] + dir[0] * t, o[1] + dir[1] * t, o[2] + dir[2] * t];
        return { p, n: gradiente(p[0], p[1], p[2], 0.003, [0, 0, 0]).slice(), s: t };
      }
    }
    return null;
  }
  indexar();

  // ---------------- capa 4: surcos y relieve muscular, proyectados sobre la piel ----------------
  // pts: [x, y, z0] en el lado derecho; se proyectan desde z0 en la dirección dz (normalmente hacia afuera)
  const local = typeof location !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1');
  const proyectar = (p, dir) => {
    const r = rayo(p, dir, 0.5);
    if (!r && local) console.warn('caballo: un punto de surco o relieve no se proyecta sobre la piel (¿empieza fuera del cuerpo?)', p.map((v) => +v.toFixed(3)));
    return r ? r.p : p;
  };
  const surcos = [];
  const S_ = (pts, depth, width, dir = [0, 0, 1], hacia = null, duro = width) => surcos.push({ pts, depth, width, dir, hacia, duro });
  S_([[1.07, 1.28, 0], [1.13, 1.43, 0], [1.20, 1.62, 0], [1.26, 1.73, 0]], 0.005, 0.026);                 // surco yugular
  S_([[0.63, 1.06, 0], [0.585, 0.94, 0], [0.56, 0.885, 0]], 0.008, 0.028);                                   // cinchera
  S_([[-0.23, 1.36, 0.12], [-0.29, 1.23, 0.12], [-0.35, 1.10, 0.12], [-0.405, 0.965, 0.12], [-0.46, 0.83, 0.12]], 0.0025, 0.03);                                 // bíceps femoral
  S_([[-0.60, 0.78, 0.135], [-0.63, 0.73, 0.135], [-0.66, 0.68, 0.135]], 0.009, 0.014);                                          // hueco de la cuerda del corvejón (afuera)
  S_([[-0.60, 0.78, 0.135], [-0.63, 0.73, 0.135], [-0.66, 0.68, 0.135]], 0.009, 0.014, [0, 0, -1]);                             // (adentro)
  S_([[0.722, 0.42, 0.128], [0.721, 0.21, 0.125]], 0.004, 0.006);                                           // tendones de la caña (afuera)
  S_([[0.722, 0.42, 0.128], [0.721, 0.21, 0.125]], 0.004, 0.006, [0, 0, -1]);
  S_([[-0.63, 0.52, 0.13], [-0.635, 0.22, 0.12]], 0.004, 0.006);
  S_([[-0.63, 0.52, 0.13], [-0.635, 0.22, 0.12]], 0.004, 0.006, [0, 0, -1]);
  S_([[0.72, 0.86, 0.13], [0.725, 0.62, 0.13]], 0.003, 0.012);                                              // antebrazo: entre extensores y flexores
  // relieve muscular
  // Desplazamiento suave del campo (profundidad negativa: d −= a·exp(−r²/w²) alrededor de una polilínea proyectada
  // sobre la piel), sin smin ni pesos propios: masas amplias y bajas (milímetros a 1 cm) que no mueven la silueta.
  // [puntos (x, y, z0 de partida dentro del cuerpo), amplitud (m, negativa = relieve), ancho w (m), dirección]
  const RELIEVE = [
    [[[0.71, 1.39, 0], [0.84, 1.18, 0]], -0.004, 0.07],                                    // paleta: una masa ancha sobre la espina escapular
    // con borde (hacia = lado suave, duro = ancho del lado marcado): tríceps, encuentro, codo y espina escapular
    [[[0.59, 1.36, 0], [0.63, 1.24, 0], [0.68, 1.11, 0], [0.74, 1.01, 0]], -0.011, 0.075, [0, 0, 1], [1, -0.5, 0], 0.032],   // tríceps: llena el ángulo paleta–brazo–codo; borde atrás y arriba
    [[[1.0, 1.08, 0]], -0.008, 0.045, [0.3, 0, 1], [-1, -0.4, 0], 0.016],                  // encuentro: borde adelante y arriba
    [[[0.66, 0.97, 0.10]], -0.006, 0.035, [-0.3, 0, 1], [1, 0.4, 0], 0.012],               // codo (olécranon): borde atrás
    [[[0.70, 1.42, 0], [0.80, 1.30, 0], [0.90, 1.17, 0]], -0.0025, 0.035, [0, 0, 1], [1, 0.8, 0], 0.022],   // espina escapular: apenas, borde atrás suave
    [[[0.80, 0.84, 0.145], [0.78, 0.62, 0.135]], -0.004, 0.022, [0.7, 0, 1]],              // antebrazo: extensores (adelante)
    [[[0.68, 0.84, 0.145], [0.695, 0.62, 0.135]], -0.004, 0.022, [-0.6, 0, 1]],            // antebrazo: flexores (atrás)
    [[[1.00, 1.30, 0], [1.05, 1.46, 0], [1.11, 1.62, 0], [1.17, 1.78, 0]], -0.004, 0.03],  // borde del braquiocefálico
    [[[0.78, 1.66, 0], [0.92, 1.77, 0], [1.06, 1.88, 0], [1.18, 1.95, 0]], -0.005, 0.05],  // cresta y esplenio
    [[[0.02, 1.38, 0], [0.0, 1.36, 0]], 0.008, 0.055],                                     // hueco del ijar
    [[[-0.03, 1.455, 0], [-0.08, 1.44, 0]], -0.013, 0.05],                 // punta de la cadera: prominencia ancha y baja,
    [[[-0.06, 1.47, 0], [-0.14, 1.53, 0], [-0.21, 1.565, 0]], -0.004, 0.03, [0, 0.6, 1]],  //   que sigue hacia la tuberosidad sacra
    [[[-0.08, 1.42, 0], [-0.22, 1.38, 0], [-0.33, 1.33, 0]], -0.004, 0.035],              //   y hacia el trocánter
    [[[-0.21, 1.50, 0]], -0.004, 0.022, [0, 1, 0.25]],                                     // tuberosidad sacra
    [[[-0.20, 1.44, 0], [-0.38, 1.41, 0], [-0.50, 1.36, 0]], -0.006, 0.06, [0, 0.3, 1]],   // glúteo medio
    [[[-0.42, 1.30, 0.12], [-0.47, 1.10, 0.12], [-0.48, 0.92, 0.12]], -0.008, 0.055],      // bíceps femoral
    [[[-0.64, 1.28, 0.08], [-0.61, 1.12, 0.09], [-0.585, 0.98, 0.1], [-0.565, 0.86, 0.11]], 0.006, 0.016, [-0.6, 0, 1]],  // línea de la pobreza
    [[[-0.60, 1.30, 0.06], [-0.60, 1.0, 0.08]], -0.008, 0.045, [-1, 0, 0.3]],              // semitendinoso: la nalga vista desde atrás
    [[[-0.21, 0.935, 0.15]], -0.007, 0.035, [0.5, 0, 1]],                                  // babilla
    [[[-0.45, 0.84, 0.13], [-0.56, 0.72, 0.13]], -0.006, 0.03, [-0.3, 0, 1]]               // pierna, encima del corvejón
  ];
  for (const [pts, a, w, dir, hacia, duro] of RELIEVE) S_(pts, a, w, dir, hacia, duro);
  const wHat = [0, 0, 1];
  const proyCab = (u, v) => [hp(u, v, 0), wHat];
  const surcosCab = [
    [[proyCab(0.27, -0.16), proyCab(0.285, -0.20)], 0.006, 0.010],     // escotadura vascular
    [[proyCab(0.0, -0.10), proyCab(0.035, -0.175), proyCab(0.075, -0.235)], 0.010, 0.02],   // hueco detrás de la ganacha
    [[proyCab(0.13, -0.008), proyCab(0.16, -0.004)], 0.007, 0.018],     // fosa supraorbitaria
    [[proyCab(0.50, -0.094), proyCab(0.56, -0.091), proyCab(0.598, -0.089)], 0.011, 0.007]   // comisura de la boca
  ];
  [1, -1].forEach((s) => {
    for (const sc of surcos) {
      const dir = [sc.dir[0], sc.dir[1], sc.dir[2] * s];
      const pts = sc.pts.map((p) => proyectar([p[0], p[1], p[2] * s], vnorm(dir)));
      Gs(surco(pts, sc.depth, sc.width, sc.hacia && [sc.hacia[0], sc.hacia[1], sc.hacia[2] * s], sc.duro));
    }
    for (const [pp, depth, width] of surcosCab) Gs(surco(pp.map(([p, d]) => proyectar(p, [d[0], d[1], d[2] * s])), depth, width));
  });
  Gs(surco([proyectar(hp(0.598, -0.089, 0), A_)], 0.008, 0.008));   // la boca cruza el frente del hocico
  // línea media: cruz (relieve) y hendidura entre las nalgas, bajo la cola, hasta y ≈ 1,05
  Gs(surco([[0.32, 1.50], [0.40, 1.52], [0.47, 1.52], [0.52, 1.51]].map(([x, y]) => proyectar([x, y, 0], [0, 1, 0])), -0.007, 0.026));   // (dentro de la zona que compensa TORSO_BUMPS, x ≤ 0,52)
  Gs(surco([[-0.55, 1.36], [-0.55, 1.22], [-0.55, 1.08]].map(([x, y]) => proyectar([x, y, 0], [-1, 0, 0])), 0.007, 0.018));
  // surco central del pecho: de debajo de la garganta hasta entre los antebrazos (separa las dos masas del pectoral)
  Gs(surco([[0.95, 1.22, 1, -0.1], [0.93, 1.12, 1, -0.2], [0.90, 1.03, 1, -0.45], [0.85, 0.99, 0.7, -0.7], [0.80, 0.99, 0.3, -1], [0.74, 0.99, 0.05, -1]]
    .map(([x, y, dx, dy]) => proyectar([x, y, 0], vnorm([dx, dy, 0]))), 0.009, 0.013));

  // ---------------- capa 5: cavidades (ollares y ojos) ----------------
  indexar();
  const ojos = [];
  [1, -1].forEach((s) => {
    const eje = vnorm(vadd(vadd(vsc([0, 0, s], 0.9), vsc(A_, 0.33)), vsc(F_, 0.12)));
    const dentro = hp(0.205, -0.05, 0.02 * s);
    const r = rayo(dentro, eje, 0.2);
    const sup = r ? r.p : hp(0.205, -0.05, 0.088 * s);
    const R = 0.0245, c = vsub(sup, vsc(eje, R - 0.0075));
    ojos.push({ s, c, eje, R });
    // hendidura de los párpados (almendra a lo largo de la cara) y párpados: arcos sobre el globo
    const Lg = vnorm(vsub(vadd(A_, vsc(F_, -0.35)), vsc(eje, vdot(vadd(A_, vsc(F_, -0.35)), eje))));
    let Sg = vcross(eje, Lg); if (Sg[1] < 0) Sg = vsc(Sg, -1);
    R_(elipsoide(vadd(c, vsc(eje, R * 0.8)), [0.023, 0.0155, 0.014], Lg, eje), 0.005);
    const arco = (phi0, phi1, rr) => {
      const pts = [-0.95, -0.5, 0, 0.5, 0.95].map((psi) => {
        const ph = lerp(phi1, phi0, 1 - Math.abs(psi) / 0.95), d = vnorm(vadd(vadd(vsc(eje, Math.cos(ph) * Math.cos(psi)), vsc(Sg, Math.sin(ph))), vsc(Lg, Math.cos(ph) * Math.sin(psi))));
        return vadd(c, vsc(d, R + 0.0025));
      });
      for (let i = 0; i < 4; i++) U(capsula(pts[i], pts[i + 1], rr, rr), 0.007);
    };
    arco(0.95, 0.45, 0.0055);    // párpado superior
    arco(-0.85, -0.4, 0.0045);   // párpado inferior
    // ollares: coma abierta hacia adelante y afuera
    // (ala: reborde en relieve por arriba y afuera de la abertura, el falso ollar)
    U(capsula(hp(0.528, -0.03, 0.05 * s), hp(0.566, -0.038, 0.049 * s), 0.0065, 0.006), 0.012);
    U(capsula(hp(0.566, -0.038, 0.049 * s), hp(0.586, -0.056, 0.04 * s), 0.006, 0.005), 0.01);
    R_(elipsoide(hp(0.552, -0.047, 0.044 * s), [0.032, 0.014, 0.022], vnorm(vadd(A_, vsc(F_, 0.35))), [0.35, 0, s]), 0.006);
    R_(elipsoide(hp(0.576, -0.063, 0.034 * s), [0.018, 0.015, 0.019], A_, [0.35, 0, s]), 0.006);
  });
  function R_(p, k) { R(p, k); }
  indexar();

  // pesos de la piel de cada miembro (construirCaballo): planos por cada articulación, con la normal hacia abajo de la
  // cadena y mezclas anchas en las grandes (escápula–húmero, codo, cadera–fémur, babilla). El del codo y el del
  // corvejón van inclinados hacia atrás para que el olécranon y la punta del corvejón sigan al hueso de abajo; el de la
  // babilla pasa por la babilla y, atrás, por el comienzo de la pierna (y ≈ 0,78): la nalga es del fémur, no de la tibia.
  const plano = (J, n, bw) => { const l = Math.hypot(n[0], n[1]); return { x: J[0], y: J[1], nx: n[0] / l, ny: n[1] / l, bw }; };
  const PLANOS_MANO = [plano(ARTIC.hombro, [-0.12, -0.99], 0.08), plano(ARTIC.codo, [-0.6, -0.8], 0.07), plano(ARTIC.rodilla, [0, -1], 0.035), plano(ARTIC.menudilloD, [0.31, -0.95], 0.025), plano(ARTIC.coronaD, [0.31, -0.95], 0.015)];
  const PLANOS_PATA = [plano(ARTIC.cadera, [0.27, -0.96], 0.16), plano(ARTIC.babilla, [0.273, -0.962], 0.14), plano(ARTIC.corvejon, [-0.8, -0.6], 0.045), plano(ARTIC.menudilloT, [0.28, -0.96], 0.025), plano(ARTIC.coronaT, [0.28, -0.96], 0.015)];
  const cadenaPlanos = (x, y, P, bones, w, W) => {
    let rem = w;
    for (let i = 0; i < P.length; i++) { const q = P[i], f = sstep(-q.bw, q.bw, (x - q.x) * q.nx + (y - q.y) * q.ny); W[bones[i]] += rem * (1 - f); rem *= f; }
    W[bones[bones.length - 1]] += rem;
  };
  const cadenaMano = (id, x, y, w, W) => cadenaPlanos(x, y, PLANOS_MANO, [0, 1, 2, 3, 4, 5].map((k) => hueso(id, k)), w, W);
  const cadenaPata = (id, x, y, w, W) => cadenaPlanos(x, y, PLANOS_PATA, [HB.pelvis, ...[0, 1, 2, 3, 4].map((k) => hueso(id, k))], w, W);
  return { prims, evaluar, gradiente, rayo, lista: (x, y, z) => lista(x, y, z), cuello, cabeza, eje, manos, patas, ojos, pesoCuello, mEje, cadenaMano, cadenaPata, DOM };
}

// =====================================================================================================
// MALLA: Surface Nets en banda estrecha + Taubin (1 pasada) + proyección de Newton
// =====================================================================================================
function mallar(cp, h) {
  const C = 4, X0 = -0.86, Y0 = -0.012, Z0 = -0.36;
  let nx = Math.ceil((1.74 - X0) / h) + 1, ny = Math.ceil((2.18 - Y0) / h) + 1, nz = Math.ceil((0.36 - Z0) / h) + 1;
  nx = Math.ceil((nx - 1) / C) * C + 1; ny = Math.ceil((ny - 1) / C) * C + 1; nz = Math.ceil((nz - 1) / C) * C + 1;
  const cx = (nx - 1) / C + 1, cy = (ny - 1) / C + 1, cz = (nz - 1) / C + 1, H = C * h;
  const ev = cp.evaluar;
  const gruesa = new Float32Array(cx * cy * cz);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) gruesa[i + cx * (j + cy * k)] = ev(X0 + i * H, Y0 + j * H, Z0 + k * H);
  const N = nx * ny * nz, campo = new Float32Array(N), hecho = new Uint8Array(N);
  const thr = 0.5 * Math.sqrt(3) * H + 2 * h, tau = 2.5 * h + 0.006;
  const banda = [];
  const cv = new Float32Array(8);
  let exactas = 0;
  for (let ck = 0; ck < cz - 1; ck++) for (let cj = 0; cj < cy - 1; cj++) for (let ci = 0; ci < cx - 1; ci++) {
    let mn = 1e9, pos = 0, neg = 0;
    for (let c = 0; c < 8; c++) {
      const v = gruesa[(ci + (c & 1)) + cx * ((cj + ((c >> 1) & 1)) + cy * (ck + ((c >> 2) & 1)))];
      cv[c] = v; mn = Math.min(mn, Math.abs(v)); if (v < 0) neg++; else pos++;
    }
    if ((neg === 0 || pos === 0) && mn > thr) continue;
    banda.push(ci, cj, ck);
    for (let kk = 0; kk <= C; kk++) for (let jj = 0; jj <= C; jj++) for (let ii = 0; ii <= C; ii++) {
      const i = ci * C + ii, j = cj * C + jj, k = ck * C + kk, n = i + nx * (j + ny * k);
      if (hecho[n]) continue;
      hecho[n] = 1;
      const fx = ii / C, fy = jj / C, fz = kk / C;
      const v = ((cv[0] * (1 - fx) + cv[1] * fx) * (1 - fy) + (cv[2] * (1 - fx) + cv[3] * fx) * fy) * (1 - fz) + ((cv[4] * (1 - fx) + cv[5] * fx) * (1 - fy) + (cv[6] * (1 - fx) + cv[7] * fx) * fy) * fz;
      if (Math.abs(v) < tau) { campo[n] = ev(X0 + i * h, Y0 + j * h, Z0 + k * h); exactas++; } else campo[n] = v;
    }
  }
  // vértices: uno por celda que corta la piel
  const NC = (nx - 1) * (ny - 1) * (nz - 1), celda = new Int32Array(NC).fill(-1);
  const pos = [];
  const F = (i, j, k) => campo[i + nx * (j + ny * k)];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const val = new Float32Array(8);
  for (let b = 0; b < banda.length; b += 3) {
    const ci = banda[b], cj = banda[b + 1], ck = banda[b + 2];
    for (let kk = 0; kk < C; kk++) for (let jj = 0; jj < C; jj++) for (let ii = 0; ii < C; ii++) {
      const i = ci * C + ii, j = cj * C + jj, k = ck * C + kk;
      let mask = 0;
      for (let c = 0; c < 8; c++) { const o = corners[c]; val[c] = F(i + o[0], j + o[1], k + o[2]); if (val[c] < 0) mask |= 1 << c; }
      if (mask === 0 || mask === 255) continue;
      let sx = 0, sy = 0, sz = 0, cnt = 0;
      for (const [a, bb] of edges) {
        if ((val[a] < 0) === (val[bb] < 0)) continue;
        const t = val[a] / (val[a] - val[bb]), A = corners[a], B = corners[bb];
        sx += A[0] + (B[0] - A[0]) * t; sy += A[1] + (B[1] - A[1]) * t; sz += A[2] + (B[2] - A[2]) * t; cnt++;
      }
      celda[i + (nx - 1) * (j + (ny - 1) * k)] = pos.length / 3;
      pos.push(X0 + (i + sx / cnt) * h, Y0 + (j + sy / cnt) * h, Z0 + (k + sz / cnt) * h);
    }
  }
  const Cc = (i, j, k) => celda[i + (nx - 1) * (j + (ny - 1) * k)];
  const idx = [];
  const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c); };
  for (let b = 0; b < banda.length; b += 3) {
    const ci = banda[b], cj = banda[b + 1], ck = banda[b + 2];
    for (let kk = 0; kk < C; kk++) for (let jj = 0; jj < C; jj++) for (let ii = 0; ii < C; ii++) {
      const i = ci * C + ii, j = cj * C + jj, k = ck * C + kk;
      if (i < 1 || j < 1 || k < 1 || i >= nx - 1 || j >= ny - 1 || k >= nz - 1) continue;
      const v0 = F(i, j, k) < 0;
      if (v0 !== (F(i + 1, j, k) < 0)) quad(Cc(i, j - 1, k - 1), Cc(i, j, k - 1), Cc(i, j, k), Cc(i, j - 1, k), v0);
      if (v0 !== (F(i, j + 1, k) < 0)) quad(Cc(i - 1, j, k - 1), Cc(i - 1, j, k), Cc(i, j, k), Cc(i, j, k - 1), v0);
      if (v0 !== (F(i, j, k + 1) < 0)) quad(Cc(i - 1, j - 1, k), Cc(i, j - 1, k), Cc(i, j, k), Cc(i - 1, j, k), v0);
    }
  }
  return { pos: new Float32Array(pos), idx: Uint32Array.from(idx), exactas };
}
// vecinos de cada vértice (CSR)
function vecinos(idx, NV) {
  const deg = new Int32Array(NV + 1);
  for (let t = 0; t < idx.length; t += 3) { deg[idx[t]] += 2; deg[idx[t + 1]] += 2; deg[idx[t + 2]] += 2; }
  const start = new Int32Array(NV + 1);
  for (let v = 0; v < NV; v++) start[v + 1] = start[v] + deg[v];
  const fill = start.slice(0, NV), nb = new Int32Array(start[NV]);
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    nb[fill[a]++] = b; nb[fill[a]++] = c; nb[fill[b]++] = a; nb[fill[b]++] = c; nb[fill[c]++] = a; nb[fill[c]++] = b;
  }
  return { start, nb };
}
function taubin(pos, ady, pasos) {
  const NV = pos.length / 3, tmp = new Float32Array(pos.length), { start, nb } = ady;
  const step = (lam) => {
    for (let v = 0; v < NV; v++) {
      const s0 = start[v], s1 = start[v + 1];
      if (s1 === s0) { tmp[v * 3] = pos[v * 3]; tmp[v * 3 + 1] = pos[v * 3 + 1]; tmp[v * 3 + 2] = pos[v * 3 + 2]; continue; }
      let x = 0, y = 0, z = 0;
      for (let e = s0; e < s1; e++) { const u = nb[e] * 3; x += pos[u]; y += pos[u + 1]; z += pos[u + 2]; }
      const n = s1 - s0;
      tmp[v * 3] = pos[v * 3] + lam * (x / n - pos[v * 3]); tmp[v * 3 + 1] = pos[v * 3 + 1] + lam * (y / n - pos[v * 3 + 1]); tmp[v * 3 + 2] = pos[v * 3 + 2] + lam * (z / n - pos[v * 3 + 2]);
    }
    pos.set(tmp);
  };
  for (let i = 0; i < pasos; i++) { step(0.5); step(-0.53); }
}
function proyectarNewton(pos, cp, h) {
  const ev = cp.evaluar, e = h * 0.25;
  for (let v = 0; v < pos.length; v += 3) {
    const x = pos[v], y = pos[v + 1], z = pos[v + 2];
    const d = ev(x, y, z);
    const gx = (ev(x + e, y, z) - ev(x - e, y, z)) / (2 * e), gy = (ev(x, y + e, z) - ev(x, y - e, z)) / (2 * e), gz = (ev(x, y, z + e) - ev(x, y, z - e)) / (2 * e);
    const g2 = gx * gx + gy * gy + gz * gz;
    if (g2 < 1e-6) continue;
    let k = d / g2;
    const step = Math.abs(k) * Math.sqrt(g2);
    if (step > h * 0.8) k *= h * 0.8 / step;
    pos[v] = x - gx * k; pos[v + 1] = y - gy * k; pos[v + 2] = z - gz * k;
  }
}

// =====================================================================================================
// CABALLO
// =====================================================================================================
// normales promediadas con los vecinos (sin facetas en las curvas suaves; los surcos se conservan porque son
// más anchos que la grilla)
function suavizarNormales(geo, idx, NV, pasos) {
  const n = geo.attributes.normal.array, { start, nb } = vecinos(idx, NV), tmp = new Float32Array(n.length);
  for (let p = 0; p < pasos; p++) {
    for (let v = 0; v < NV; v++) {
      let x = n[v * 3] * 2, y = n[v * 3 + 1] * 2, z = n[v * 3 + 2] * 2;
      for (let e = start[v]; e < start[v + 1]; e++) { const u = nb[e] * 3; x += n[u]; y += n[u + 1]; z += n[u + 2]; }
      const l = Math.hypot(x, y, z) || 1; tmp[v * 3] = x / l; tmp[v * 3 + 1] = y / l; tmp[v * 3 + 2] = z / l;
    }
    n.set(tmp);
  }
}

// =====================================================================================================
// PESOS DE PIEL
// =====================================================================================================
// Constantes (m salvo indicación); cada una con el porqué. Rangos [a, b] = rampa suave (sstep) de a a b.
const PESOS = {
  mezclaMano: 0.08,     // ± de (eje.f − manos.f) en que la piel pasa del tronco a la mano: ancha, la axila se reparte en ~16 cm
  mezclaPata: 0.06,     // ídem con la pata (está más metida en la grupa: la franja es más corta)
  mezclaCabeza: 0.06,   // ídem cabeza contra cuello (garganta y nuca): con menos, la cabeza arriba estiraba la garganta
  // lejos de cada loft su distancia es aproximada (llegó a dar "pata" en el hocico): la pertenencia se limita a su región
  regionMano: { x0: [0.40, 0.50], x1: [1.15, 1.25], y1: [1.25, 1.35] },
  regionPata: { x1: [0.0, 0.12], y1: [1.52, 1.62] },
  // piel de la paleta que sigue a la escápula deslizante: hasta 60 %, cerca de la línea escápula–hombro, del lado de afuera
  escapula: { peso: 0.6, radio: [0.04, 0.12], afuera: [0.08, 0.16] },
  // halos: la piel del tronco junto al miembro sigue en parte al hueso que mueve la unión (húmero detrás del codo y en la
  // cinchera; fémur en el pliegue del flanco), menos cuanto más lejos: el corrimiento se reparte en 15 cm, no en 2 aristas
  haloMano: { peso: 0.55, alcance: 0.15, x0: [0.35, 0.5], x1: [1.05, 1.2], y1: [1.1, 1.25] },
  haloPata: { peso: 0.5, alcance: 0.15, x0: [-0.55, -0.45], x1: [-0.05, 0.1], y1: [1.2, 1.35] },
  haloMax: 0.85,        // tope de lo que se lleva el miembro en la piel del tronco (el resto sigue al tronco)
  medio: 0.06,          // |z| desde el que valen los halos: la piel de la línea media es del tronco
  // puentes entre los dos miembros (esternón y vértice de la luz entre las manos; horquilla entre los muslos): la piel es del
  // tronco en la línea de la horquilla y del miembro a `alcance` de ella, medido sobre la piel (por la cara interna o la
  // nalga). Las dos manos (patas) se mueven en sentidos opuestos: ese corte se reparte en una franja ancha.
  puenteMano: { alcance: 0.18, yHorquilla: 0.86, x0: [0.5, 0.6], x1: [1.05, 1.15], y1: [1.05, 1.15] },
  puentePata: { alcance: 0.13, yHorquilla: 1.0, x0: [-0.8, -0.72], x1: [-0.3, -0.18], y1: [1.4, 1.5] },
  puente: 0.8,          // de lo que se le quita al miembro en el puente, cuánto va al promedio de los dos húmeros (fémures):
                        // si avanzan juntos (galope) la piel los acompaña; si van opuestos queda en el medio
  // piel bajo la pelvis entre los muslos: sigue en parte al promedio de los dos fémures (en el pecho, lo mismo con los
  // húmeros empeoraba la axila en el galope tendido, así que no se usa)
  perine: { peso: 0.45, y1: [0.98, 1.12], x0: [-0.72, -0.62], x1: [-0.32, -0.2], z: [0.06, 0.12] },
  lado: 0.02,           // rampa derecha–izquierda (z) de lo que es de un miembro: sin escalón en la línea media
  enTransicion: 0.005,  // una pertenencia entre esto y 1 − esto marca el vértice como zona de transición
  // suavizado de las pertenencias: 40 pasadas en las transiciones y en ANILLOS anillos de vecinos alrededor (el 47 % de
  // los vértices está en una transición y los anillos suman otro 24 %; más suavizado le quitaba pertenencia a la cara
  // interna del antebrazo y estiraba la axila; menos anillos estiraban la garganta con la cabeza arriba)
  anillos: 8, pasadasTransicion: 40,
  pasadasGlobales: 2,   // pasadas suaves de los pesos ya compuestos en todo el cuerpo
  pesoMinimo: 0.004     // influencias menores se descartan antes de normalizar a 4
};
const rampaSube = (r, x) => sstep(r[0], r[1], x), rampaBaja = (r, x) => 1 - sstep(r[0], r[1], x);
// Pertenencia: cada vértice es del miembro, del eje (tronco y cuello) o de la cabeza según cuál de esos lofts tiene
// más cerca; las pertenencias se suavizan sobre la malla y después se componen los pesos: dentro de cada miembro, la
// cadena de planos por articulación (cp.cadenaMano / cadenaPata); en el eje, cp.mEje; más escápula, halos, puentes y
// periné (ver PESOS). Se guardan las 4 mayores influencias, normalizadas, y la parte distal de cada vértice (pernas).
function calcularPesosPiel(cp, pos, idx, NV, DISTAL, skinIndex, skinWeight, pernas) {
  const P_ = PESOS, p = pos, W = new Float32Array(NB), WB = new Float32Array(NV * NB), trans = new Uint8Array(NV);
  const ESC0 = ARTIC.escapulaDorsal, ESC1 = ARTIC.hombro;
  const segDist2 = (x, y, a, b) => { const abx = b[0] - a[0], aby = b[1] - a[1]; let t = ((x - a[0]) * abx + (y - a[1]) * aby) / (abx * abx + aby * aby); t = t < 0 ? 0 : t > 1 ? 1 : t; return Math.hypot(x - a[0] - abx * t, y - a[1] - aby * t); };
  // 1) pertenencias escalares por vértice: mano, pata, cabeza, escápula y halos
  const NE = 6, ES = new Float32Array(NV * NE);   // mM, mP, mH, e, hM, hP
  const enT = (m) => m > P_.enTransicion && m < 1 - P_.enTransicion;
  for (let v = 0; v < NV; v++) {
    const x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2], az = Math.abs(z);
    const dE = cp.eje.f(x, y, z), dC = cp.cabeza.f(x, y, z), dM = cp.manos.f(x, y, z), dP = cp.patas.f(x, y, z);
    const rM = P_.regionMano, rP = P_.regionPata;
    const mM = sstep(-P_.mezclaMano, P_.mezclaMano, dE - dM) * rampaSube(rM.x0, x) * rampaBaja(rM.x1, x) * rampaBaja(rM.y1, y);
    const mP = sstep(-P_.mezclaPata, P_.mezclaPata, dE - dP) * rampaBaja(rP.x1, x) * rampaBaja(rP.y1, y);
    const mH = sstep(-P_.mezclaCabeza, P_.mezclaCabeza, dE - dC);
    const e = P_.escapula.peso * rampaBaja(P_.escapula.radio, segDist2(x, y, ESC0, ESC1)) * rampaSube(P_.escapula.afuera, az) * (1 - mH);
    const hm = P_.haloMano, hp_ = P_.haloPata;
    const hM = hm.peso * (1 - sstep(0, hm.alcance, dM)) * rampaSube(hm.x0, x) * rampaBaja(hm.x1, x) * rampaBaja(hm.y1, y);
    const hP = hp_.peso * (1 - sstep(0, hp_.alcance, dP)) * rampaSube(hp_.x0, x) * rampaBaja(hp_.x1, x) * rampaBaja(hp_.y1, y);
    const o = v * NE;
    ES[o] = mM; ES[o + 1] = mP; ES[o + 2] = mH; ES[o + 3] = e; ES[o + 4] = hM; ES[o + 5] = hP;
    trans[v] = enT(mM) || enT(mP) || enT(mH) || e + hM + hP > P_.enTransicion ? 1 : 0;
  }
  // 2) suavizado laplaciano de las pertenencias, solo en las transiciones y en P_.anillos anillos de vecinos
  //    (el anillo r marca r + 2, así cada pasada solo crece desde el anillo anterior: sin propagarse en cascada)
  const ady = vecinos(idx, NV), tmpE = new Float32Array(NV * NE);
  for (let r = 0; r < P_.anillos; r++) {
    for (let v = 0; v < NV; v++) if (trans[v] === r + 1) for (let e = ady.start[v]; e < ady.start[v + 1]; e++) if (!trans[ady.nb[e]]) trans[ady.nb[e]] = r + 2;
  }
  for (let pass = 0; pass < P_.pasadasTransicion; pass++) {
    for (let v = 0; v < NV; v++) {
      const o = v * NE, s0 = ady.start[v], s1 = ady.start[v + 1], n = s1 - s0;
      if (!trans[v] || !n) { for (let k = 0; k < NE; k++) tmpE[o + k] = ES[o + k]; continue; }
      for (let k = 0; k < NE; k++) tmpE[o + k] = ES[o + k] * 0.5;
      const f = 0.5 / n;
      for (let e = s0; e < s1; e++) { const q = ady.nb[e] * NE; for (let k = 0; k < NE; k++) tmpE[o + k] += ES[q + k] * f; }
    }
    ES.set(tmpE);
  }
  // 3) pesos. Los puentes van después del suavizado, para que la línea media quede exactamente del tronco.
  const LADOS = [['MD', 'PD'], ['MI', 'PI']], fl = [0, 0];
  for (let v = 0; v < NV; v++) {
    const x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2], o = v * NE, az = Math.abs(z);
    W.fill(0);
    const medio = sstep(0, P_.medio, az), pm = P_.puenteMano, pp = P_.puentePata;
    const bM = (1 - sstep(0, pm.alcance, Math.hypot(az, Math.max(0, pm.yHorquilla - y)))) * rampaSube(pm.x0, x) * rampaBaja(pm.x1, x) * rampaBaja(pm.y1, y);
    const bP = (1 - sstep(0, pp.alcance, Math.hypot(az, Math.max(0, pp.yHorquilla - y)))) * rampaSube(pp.x0, x) * rampaBaja(pp.x1, x) * rampaBaja(pp.y1, y);
    let mM = ES[o] * (1 - bM), mP = ES[o + 1] * (1 - bP), pM = ES[o] * bM * P_.puente, pP = ES[o + 1] * bP * P_.puente;
    const mm = mM + mP + pM + pP; if (mm > 1) { mM /= mm; mP /= mm; pM /= mm; pP /= mm; }
    const mH = ES[o + 2], e = ES[o + 3], hM = ES[o + 4] * medio, hP = ES[o + 5] * medio, mT = 1 - mM - mP - pM - pP;
    W[hueso('MD', 1)] += pM / 2; W[hueso('MI', 1)] += pM / 2; W[hueso('PD', 0)] += pP / 2; W[hueso('PI', 0)] += pP / 2;
    fl[0] = sstep(-P_.lado, P_.lado, z); fl[1] = 1 - fl[0];
    const pr = P_.perine;
    const gP = pr.peso * rampaBaja(pr.y1, y) * rampaSube(pr.x0, x) * rampaBaja(pr.x1, x) * rampaBaja(pr.z, az);
    if (mT > 0) {
      if (gP > 0) { W[hueso('PD', 0)] += mT * gP / 2; W[hueso('PI', 0)] += mT * gP / 2; }
      const th = e + hM + hP, hh = Math.min(Math.max(0, P_.haloMax - gP), th), k = th > 0 ? hh / th : 0;
      for (let l = 0; l < 2; l++) {
        const f = fl[l], [M, P] = LADOS[l];
        if (f <= 0) continue;
        if (e > 0) W[hueso(M, 0)] += mT * e * k * f;
        if (hM > 0) W[hueso(M, 1)] += mT * hM * k * f;
        if (hP > 0) W[hueso(P, 0)] += mT * hP * k * f;
      }
      const resto = Math.max(0, 1 - hh - gP);
      if (mH < 1) cp.mEje(x, y, z, mT * resto * (1 - mH), W);
      W[HB.cabeza] += mT * resto * mH;
    }
    for (let l = 0; l < 2; l++) {
      const f = fl[l], [M, P] = LADOS[l];
      if (f <= 0) continue;
      if (mM > 0) cp.cadenaMano(M, x, y, mM * f, W);
      if (mP > 0) cp.cadenaPata(P, x, y, mP * f, W);
    }
    let s = 0; for (let b = 0; b < NB; b++) s += W[b];
    if (s <= 0) { W[HB.lomo] = 1; s = 1; }
    for (let b = 0; b < NB; b++) WB[v * NB + b] = W[b] / s;
  }
  // 4) pasadas suaves de los pesos compuestos en todo el cuerpo
  const tmp = new Float32Array(NV * NB);
  for (let pass = 0; pass < P_.pasadasGlobales; pass++) {
    for (let v = 0; v < NV; v++) {
      const s0 = ady.start[v], s1 = ady.start[v + 1], o = v * NB, n = s1 - s0;
      for (let b = 0; b < NB; b++) tmp[o + b] = WB[o + b] * 0.5;
      if (!n) { for (let b = 0; b < NB; b++) tmp[o + b] = WB[o + b]; continue; }
      const f = 0.5 / n;
      for (let e = s0; e < s1; e++) { const q = ady.nb[e] * NB; for (let b = 0; b < NB; b++) tmp[o + b] += WB[q + b] * f; }
    }
    WB.set(tmp);
  }
  // 5) las 4 mayores influencias, normalizadas
  const order = [0, 1, 2, 3], wv = new Float32Array(4);
  for (let v = 0; v < NV; v++) {
    const o = v * NB;
    for (let k = 0; k < 4; k++) { order[k] = -1; wv[k] = -1; }
    for (let b = 0; b < NB; b++) {
      const w = WB[o + b];
      if (w <= wv[3]) continue;
      let k = 3; while (k > 0 && w > wv[k - 1]) { wv[k] = wv[k - 1]; order[k] = order[k - 1]; k--; }
      wv[k] = w; order[k] = b;
    }
    let s = 0; for (let k = 0; k < 4; k++) if (wv[k] > P_.pesoMinimo) s += wv[k];
    for (let k = 0; k < 4; k++) {
      const ok = wv[k] > P_.pesoMinimo && order[k] >= 0;
      skinIndex[v * 4 + k] = ok ? order[k] : 0;
      skinWeight[v * 4 + k] = ok ? wv[k] / s : 0;
    }
    let d = 0; for (let b = 0; b < NB; b++) if (DISTAL[b]) d += WB[o + b];
    pernas[v] = d;
  }
}

export function construirCaballo({ scene, coatMap, coatBump, hairTex, horneado = null }) {
  const tiemposCuerpo = {}; let tcT = performance.now();
  const mc = (k) => { const t = performance.now(); tiemposCuerpo[k] = Math.round(t - tcT); tcT = t; };
  // pelaje zaino colorado (albedo, docs/investigacion-anatomia.md §6.1): base, oscuro (dorso, cara interna),
  // claro y caoba (variación de rojo a caoba en manchas grandes)
  const COAT = lin('#682d17'), COAT_DARK = lin('#3f170b'), LIGHT = lin('#86421f'), CAOBA = lin('#4c1d10'), ROJO = lin('#7c2c10');
  const BLACK = lin('#15100e'), MUZZLE = lin('#2c1d17'), HALO = lin('#5a4438');

  // Pocos programas de shader: casi todo es MeshStandardMaterial con bumpMap; el cuerno de los cascos y las orejas
  // usan el mismo programa que coatMat (colores de vértice, map y bumpMap, una cara)
  const coatMat = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, map: coatMap, bumpMap: coatBump, bumpScale: 0.0012, roughness: 0.58, metalness: 0, envMapIntensity: 0.3 });
  const hoofMat = new THREE.MeshStandardMaterial({ vertexColors: true, color: 0xffffff, map: coatMap, bumpMap: coatBump, bumpScale: 0.0016, roughness: 0.36, metalness: 0, envMapIntensity: 0.55 });
  // pelo (crin, copete, cola y orejas): una sola malla con piel; el color de cada mechón va en los vértices
  const hairMat = new THREE.MeshLambertMaterial({ map: hairTex, vertexColors: true, alphaTest: 0.32, side: THREE.DoubleSide, skinning: true });
  hairMat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>', '#include <dithering_fragment>\n  gl_FragColor.a = 1.0;'); };
  const hairDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: hairTex, alphaTest: 0.32, skinning: true });
  const eyeMat = new THREE.MeshStandardMaterial({ color: lin('#1a0d08'), roughness: 0.04, envMapIntensity: 1.6, bumpMap: coatBump, bumpScale: 0, side: THREE.DoubleSide });
  const darkMat = new THREE.MeshStandardMaterial({ color: lin('#0b0605'), roughness: 0.95, bumpMap: coatBump, bumpScale: 0, side: THREE.DoubleSide });

  // ---------- grupos del esqueleto (todos "en reposo": cada grupo *In mapea coordenadas de reposo al mundo) ----------
  const horse = new THREE.Group(); scene.add(horse);
  const body = new THREE.Group(); horse.add(body);
  const pivote = (parent, P) => { const g = new THREE.Group(); g.position.set(P[0], P[1], P[2]); parent.add(g); const inn = new THREE.Group(); inn.position.set(-P[0], -P[1], -P[2]); g.add(inn); return [g, inn]; };
  const [cruzG, cruzIn] = pivote(body, [0.40, 1.33, 0]);
  const [grupaG, grupaIn] = pivote(body, [0.05, 1.37, 0]);
  const [lsG, lsIn] = pivote(grupaIn, ARTIC.LS);
  const [neckPivot, neckRoot] = pivote(cruzIn, ARTIC.C7T1);
  const [n1G, n1In] = pivote(neckRoot, ARTIC.C5C6);
  const [n2G, n2In] = pivote(n1In, ARTIC.C3C4);
  const [n3G, n3In] = pivote(n2In, ARTIC.C1C2);
  const [headGroup, headInner] = pivote(n3In, ARTIC.AO);
  const segCuello = [neckPivot, n1G, n2G, n3G];
  const FLEX_CUELLO = [0.4, 0.25, 0.2, 0.15], LAT_CUELLO = [0.45, 0.25, 0.18, 0.12];
  // fuente de la matriz de cada hueso del tronco, cuello y cabeza
  const fuenteHueso = [lsIn, body, cruzIn, neckRoot, n1In, n2In, n3In, headInner];

  mc('partes');
  // ---------- campo de distancias ----------
  const cp = crearCampo();
  mc('sdf');

  // ---------- malla del cuerpo ----------
  let net;
  if (horneado) net = { pos: horneado.pos, idx: horneado.idx };
  else {
    net = mallar(cp, H_MALLA);
    mc('malla');
    const ady0 = vecinos(net.idx, net.pos.length / 3);
    taubin(net.pos, ady0, 1);
    proyectarNewton(net.pos, cp, H_MALLA);
    mc('suavizado');
  }
  const NV = net.pos.length / 3;
  const bodyGeo = new THREE.BufferGeometry();
  bodyGeo.setAttribute('position', new THREE.BufferAttribute(net.pos, 3));
  bodyGeo.setIndex(new THREE.BufferAttribute(net.idx, 1));
  bodyGeo.computeVertexNormals();
  suavizarNormales(bodyGeo, net.idx, NV, 2);

  // ---------- pesos de piel por pertenencia ----------
  const skinIndex = horneado ? horneado.skinIndex : new Uint16Array(NV * 4), skinWeight = horneado ? horneado.skinWeight : new Float32Array(NV * 4);
  const pernas = new Float32Array(NV);   // cuánto pertenece cada vértice a la parte baja de los miembros (cabos negros)
  const DISTAL = new Uint8Array(NB);
  ['MD', 'MI'].forEach((id) => { [2, 3, 4, 5].forEach((k) => { DISTAL[hueso(id, k)] = 1; }); });
  ['PD', 'PI'].forEach((id) => { [1, 2, 3, 4].forEach((k) => { DISTAL[hueso(id, k)] = 1; }); });
  if (!horneado) {
    calcularPesosPiel(cp, net.pos, net.idx, NV, DISTAL, skinIndex, skinWeight, pernas);
  } else {
    for (let v = 0; v < NV; v++) { let d = 0; for (let k = 0; k < 4; k++) if (DISTAL[skinIndex[v * 4 + k]]) d += skinWeight[v * 4 + k]; pernas[v] = d; }
  }
  bodyGeo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  bodyGeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
  mc('pesos');

  // ---------- color del pelaje ----------
  const noise3 = crearRuido3();
  {
    const p = net.pos, nrm = bodyGeo.attributes.normal.array, col = horneado ? horneado.col : new Float32Array(NV * 3), uv = new Float32Array(NV * 2);
    const c = new THREE.Color(), ojosC = cp.ojos;
    const ollares = [1, -1].map((s) => hp(0.558, -0.05, 0.042 * s));
    for (let v = 0; v < NV; v++) {
      const x = p[v * 3], y = p[v * 3 + 1], z = p[v * 3 + 2], ny = nrm[v * 3 + 1], nz = nrm[v * 3 + 2];
      const pl = pernas[v];
      // pelo: hacia atrás en el tronco y la cabeza, hacia abajo en los miembros (dirección de las vetas del mapa)
      const wl = Math.min(1, pl * 1.3);
      uv[v * 2] = lerp(y * 2.4 + z * 0.4, x * 2.4 + z * 0.8, wl); uv[v * 2 + 1] = lerp(x * 2.4, y * 2.4, wl);
      if (horneado) continue;
      colorPelo(x, y, z, ny, nz, pl, wl, c);
      col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
    }
    bodyGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    bodyGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    function colorPelo(x, y, z, ny, nz, pl, wl, c) {
      c.copy(COAT);
      // manchas grandes de rojo a caoba y variación fina
      const nd = noise3(x * 4.5, y * 4.5, z * 4.5) * 0.7 + noise3(x * 13, y * 13, z * 13) * 0.3;
      c.lerp(nd > 0 ? ROJO : CAOBA, Math.min(1, Math.abs(nd) * 1.6) * 0.55);
      c.lerp(LIGHT, 0.18 * sstep(0.1, 0.5, noise3(x * 2 + 7, y * 2, z * 2)));
      c.lerp(COAT_DARK, 0.55 * sstep(0.3, 0.95, ny) * (x < 1.2 ? 1 : 0));          // línea superior más oscura
      // cara interna de los miembros y entre las manos y los muslos, más oscura
      c.lerp(COAT_DARK, 0.5 * sstep(0.16, 0.04, Math.abs(z)) * sstep(1.0, 0.85, y));
      c.lerp(COAT_DARK, 0.35 * sstep(0.2, 0.7, -nz * Math.sign(z || 1)) * sstep(1.15, 0.95, y));
      c.lerp(LIGHT, 0.15 * sstep(-0.1, -0.6, ny) * sstep(1.25, 1.05, y) * (1 - wl)); // vientre y flanco apenas más claros
      // cuello: negro bajo la crin, a lo largo de la cresta (más del lado derecho, donde cae)
      const t = cp.cuello.tDe(x, y);
      if (t > 0.02 && t < 1.02) {
        const T = cp.cuello.Tp(Math.min(1, t)), B = cp.cuello.Bp(Math.min(1, t));
        const dx = T[0] - B[0], dy = T[1] - B[1], D = Math.hypot(dx, dy);
        const sCr = ((x - B[0]) * dx + (y - B[1]) * dy) / (D * D);
        c.lerp(BLACK, 0.85 * sstep(z > 0 ? 0.93 : 0.975, z > 0 ? 0.99 : 1.0, sCr) * sstep(0.04, 0.16, t));
      }
      // cabeza: hocico oscuro con un halo grisáceo en los ollares, contorno de los ojos
      if (x > 1.1 && y > 1.38) {
        const [u, vv] = cp.cabeza.local(x, y, z);
        if (u > -0.05) {
          c.lerp(COAT_DARK, 0.25 * sstep(0.25, 0.42, u));
          c.lerp(MUZZLE, sstep(0.47, 0.56, u));
          let dmin = 1e9; for (const o of ollares) dmin = Math.min(dmin, Math.hypot(x - o[0], y - o[1], z - o[2]));
          c.lerp(HALO, 0.55 * sstep(0.06, 0.03, dmin));
          c.lerp(BLACK, sstep(0.026, 0.014, dmin));
          c.lerp(BLACK, 0.7 * sstep(0.56, 0.6, u) * sstep(-0.075, -0.095, vv));   // labios y boca
          for (const o of ojosC) { const de = Math.hypot(x - o.c[0], y - o.c[1], z - o.c[2]); c.lerp(COAT_DARK, 0.45 * sstep(0.045, 0.03, de)); c.lerp(BLACK, sstep(0.0285, 0.0255, de)); }
        }
      }
      // cabos negros: borde irregular y difuminado; manos hasta ~0,62 (más arriba por detrás del antebrazo), patas
      // hasta encima de la punta del corvejón (más arriba por detrás, más abajo por delante de la pierna)
      if (pl > 0.03) {
        const front = x > 0.2;
        const atras = front ? sstep(0.76, 0.68, x) : sstep(-0.56, -0.70, x);
        const tope = (front ? 0.585 + 0.07 * atras : 0.575 + 0.13 * atras)
          + 0.05 * noise3(x * 9 + 5, y * 5, z * 9) + 0.02 * noise3(x * 31, y * 23 + 3, z * 31);
        c.lerp(BLACK, Math.min(1, pl * 1.6) * sstep(tope + 0.07, tope - 0.06, y));
      }
      // castaños y espolones
      for (const [cx, cy, cz] of [[0.745, 0.605, 0.105], [-0.62, 0.48, 0.095], [0.684, 0.148, 0.125], [-0.672, 0.145, 0.12]]) {
        if (Math.hypot(x - cx, y - cy, Math.abs(z) - cz) < 0.022) c.lerp(lin('#2a2420'), 0.85);
      }
    }
  }
  // oclusión ambiental por vértice (aoMap: una rampa de gris leída en uv2.x). El vientre y las caras que miran abajo, la
  // cara interna de los miembros, las axilas y la ingle reciben menos luz del cielo y, sobre todo, no lo reflejan: sin
  // esto el reflejo del entorno dibujaba una franja clara y rosada bajo el vientre al estirarse la piel en el galope.
  // (aoMap también atenúa el especular indirecto en MeshPhysicalMaterial; el material del cuerpo es su propio programa)
  const aoTex = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 1;
    const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 256, 0);
    gr.addColorStop(0, '#000'); gr.addColorStop(1, '#fff'); g.fillStyle = gr; g.fillRect(0, 0, 256, 1);
    const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; return t;
  })();
  {
    const p = net.pos, nrm = bodyGeo.attributes.normal.array, uv2 = new Float32Array(NV * 2);
    for (let v = 0; v < NV; v++) {
      const y = p[v * 3 + 1], z = p[v * 3 + 2], ny = nrm[v * 3 + 1], nz = nrm[v * 3 + 2];
      const abajo = sstep(0.15, 0.75, -ny) * sstep(1.25, 0.95, y);                                 // vientre, pecho bajo
      const adentro = sstep(0.15, 0.7, -nz * Math.sign(z || 1)) * sstep(1.15, 0.85, y) * sstep(0.2, 0.08, Math.abs(z));   // caras internas
      const ao = Math.max(0.25, 1 - 0.7 * abajo - 0.35 * adentro);
      uv2[v * 2] = 0.002 + 0.996 * ao; uv2[v * 2 + 1] = 0.5;
    }
    bodyGeo.setAttribute('uv2', new THREE.BufferAttribute(uv2, 2));
  }
  mc('color');

  // pelo corto y brillante: barniz sobre una base más áspera, vetas (map), relieve fino (bump) y rugosidad con las
  // mismas vetas (roughnessMap: el brillo se rompe a lo largo del pelo, como el reflejo anisótropo); el barniz da
  // los reflejos nítidos de la paleta, las costillas y la grupa (foto-2)
  const bodyMat = new THREE.MeshPhysicalMaterial({
    vertexColors: true, skinning: true, map: coatMap, bumpMap: coatBump, bumpScale: 0.0008, roughnessMap: coatBump, aoMap: aoTex, aoMapIntensity: 1,
    color: new THREE.Color(1.25, 1.18, 1.15), roughness: 0.95, metalness: 0, reflectivity: 0.45, clearcoat: 0.3, clearcoatRoughness: 0.3, envMapIntensity: 0.7
  });
  const rootBone = new THREE.Bone();
  const bones = []; for (let i = 0; i < NB; i++) { const b = new THREE.Bone(); b.matrixAutoUpdate = false; rootBone.add(b); bones.push(b); }
  const bodyMesh = shadowed(new THREE.SkinnedMesh(bodyGeo, bodyMat));
  bodyMesh.frustumCulled = false;
  bodyMesh.add(rootBone);
  bodyMesh.bind(new THREE.Skeleton(bones, bones.map(() => new THREE.Matrix4())), new THREE.Matrix4());
  horse.add(bodyMesh);   // primero: js/montura.js busca la primera SkinnedMesh del caballo

  // ---------- superficies de la piel (rayos contra el SDF) ----------
  const _o = [0, 0, 0], _d = [0, 0, 0];
  function superficie(o, d, out, nOut) {
    const r = cp.rayo(o, d, 0.6);
    if (r) { out.set(r.p[0], r.p[1], r.p[2]); if (nOut) nOut.set(r.n[0], r.n[1], r.n[2]); }
    else { out.set(o[0] + d[0] * 0.1, o[1] + d[1] * 0.1, o[2] + d[2] * 0.1); if (nOut) nOut.set(d[0], d[1], d[2]); }
    return out;
  }
  // cuello: t de la base (0) a la garganta (1); ang 0 = cresta, π = garganta, + = lado derecho
  function neckSurf(t, ang, out, nOut) {
    const T = cp.cuello.Tp(t), B = cp.cuello.Bp(t), dx = T[0] - B[0], dy = T[1] - B[1], D = Math.hypot(dx, dy);
    _o[0] = B[0] + dx * 0.5; _o[1] = B[1] + dy * 0.5; _o[2] = 0;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    _d[0] = dx / D * ca; _d[1] = dy / D * ca; _d[2] = sa;
    return superficie(_o, _d, out, nOut);
  }
  // versión rápida para la crin: tabla de la piel del cuello en (t, ang), interpolada
  let tablaCuello = null;
  const TC = { nt: 27, na: 29, a0: -1.8, a1: 1.8 };
  function neckSurfRapido(t, ang, out, nOut) {
    if (!tablaCuello) {
      tablaCuello = new Float32Array(TC.nt * TC.na * 4);
      const q = new V(), n = new V();
      for (let i = 0; i < TC.nt; i++) for (let j = 0; j < TC.na; j++) {
        const tt = i / (TC.nt - 1), aa = lerp(TC.a0, TC.a1, j / (TC.na - 1));
        neckSurf(tt, aa, q, n);
        const T = cp.cuello.Tp(tt), B = cp.cuello.Bp(tt), k = (i * TC.na + j) * 4;
        tablaCuello[k] = Math.hypot(q.x - (T[0] + B[0]) / 2, q.y - (T[1] + B[1]) / 2, q.z);
        tablaCuello[k + 1] = n.x; tablaCuello[k + 2] = n.y; tablaCuello[k + 3] = n.z;
      }
    }
    const fi = Math.max(0, Math.min(TC.nt - 1.001, t * (TC.nt - 1))), fj = Math.max(0, Math.min(TC.na - 1.001, (ang - TC.a0) / (TC.a1 - TC.a0) * (TC.na - 1)));
    const i = fi | 0, j = fj | 0, u = fi - i, v = fj - j;
    const val = (c) => { const k = (a, b) => tablaCuello[(a * TC.na + b) * 4 + c]; return (k(i, j) * (1 - v) + k(i, j + 1) * v) * (1 - u) + (k(i + 1, j) * (1 - v) + k(i + 1, j + 1) * v) * u; };
    const T = cp.cuello.Tp(t), B = cp.cuello.Bp(t), dx = T[0] - B[0], dy = T[1] - B[1], D = Math.hypot(dx, dy), ca = Math.cos(ang), sa = Math.sin(ang), r = val(0);
    out.set((T[0] + B[0]) / 2 + dx / D * ca * r, (T[1] + B[1]) / 2 + dy / D * ca * r, sa * r);
    if (nOut) nOut.set(val(1), val(2), val(3)).normalize();
    return out;
  }
  // cabeza: t de la nuca (0) al labio (1); ang 0 = frente, π = quijada, + = lado derecho
  function headSurf(t, ang, out, nOut) {
    const u = Math.max(0.01, Math.min(0.59, t * CAB.L));
    const top = prof([[0, 0], [0.3, 0], [0.5, -0.012], [0.6, -0.05]], u), bot = prof([[0, -0.14], [0.15, -0.19], [0.3, -0.16], [0.45, -0.13], [0.6, -0.1]], u);
    const c = hp(u, (top + bot) / 2, 0);
    _o[0] = c[0]; _o[1] = c[1]; _o[2] = 0;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    _d[0] = CAB.F[0] * ca; _d[1] = CAB.F[1] * ca; _d[2] = sa;
    return superficie(_o, _d, out, nOut);
  }
  // tronco: punto de la piel a la altura x, ángulo desde arriba (0) hacia el costado derecho (+)
  function superficieTorso(x, ang, out, nOut) {
    const yc = (prof(TOP, x) + prof(BOT, x)) / 2;
    _o[0] = x; _o[1] = yc; _o[2] = 0; _d[0] = 0; _d[1] = Math.cos(ang); _d[2] = Math.sin(ang);
    return superficie(_o, _d, out, nOut);
  }
  // perfiles del tronco ajustados a la piel nueva, con la forma que usa js/montura.js (section con e = 0,85)
  const TOP = [], BOT = [], SIDE = [], TORSO_BUMPS = [];
  {
    const o = [0, 0, 0];
    for (let x = -0.62; x <= 0.981; x += 0.08) {
      const xx = +x.toFixed(3);
      let top = prof([[-0.6, 1.47], [-0.3, 1.585], [0, 1.57], [0.3, 1.57], [0.45, 1.6], [0.6, 1.57], [0.8, 1.44], [1.0, 1.2]], xx);
      let bot = prof([[-0.6, 1.12], [-0.3, 1.02], [0, 0.93], [0.3, 0.86], [0.55, 0.86], [0.8, 0.93], [1.0, 1.06]], xx);
      if (xx > -0.45 && xx < 0.62) {
        o[0] = xx; o[1] = 1.2; o[2] = 0;
        const rt = cp.rayo(o, [0, 1, 0], 0.6), rb = cp.rayo(o, [0, -1, 0], 0.6);
        if (rt) top = rt.p[1]; if (rb) bot = rb.p[1];
      }
      const yc = (top + bot) / 2, ry = (top - bot) / 2;
      // ancho tal que el punto de la montura a ang = 1,45 (faldones y cincha) caiga sobre la piel
      const ca = Math.cos(1.45), sa = Math.sin(1.45), u = Math.pow(ca, 0.85) * ry;
      o[0] = xx; o[1] = yc + u; o[2] = 0;
      const rs = cp.rayo(o, [0, 0, 1], 0.6);
      const zs = rs ? rs.p[2] : 0.24;
      const rx = zs / (Math.pow(sa, 0.85) * lerp(0.94, 1, 0.5 + 0.5 * ca));
      TOP.push([xx, top]); BOT.push([xx, bot]); SIDE.push([xx, rx]);
    }
  }
  // relieves (TORSO_BUMPS) donde la piel queda por fuera de la superficie de la montura: así el mandil, los
  // faldones y la cincha no se hunden en la punta de la cadera, la paleta o el lomo
  {
    const base = (x, ang, out) => {
      const yc = (prof(TOP, x) + prof(BOT, x)) / 2, yc2 = (prof(TOP, x + 0.01) + prof(BOT, x + 0.01)) / 2;
      let tx = 0.01, ty = yc2 - yc; const l = Math.hypot(tx, ty); tx /= l; ty /= l;
      const ry = (prof(TOP, x) - prof(BOT, x)) / 2, rx = prof(SIDE, x);
      const [u, v] = section(Math.cos(ang), Math.sin(ang), ry, ry, rx, rx * 0.94, 0.85);
      return out.set(x - ty * u, yc + tx * u, v);
    };
    const P = new V(), C = [0, 0, 0];
    for (let x = -0.32; x <= 0.52; x += 0.06) for (let ang = -Math.PI; ang < Math.PI; ang += 0.18) {
      if (Math.abs(ang) > 1.5 && (x < 0.3 || x > 0.5)) continue;
      base(x, ang, P);
      C[0] = x; C[1] = (prof(TOP, x) + prof(BOT, x)) / 2; C[2] = 0;
      const d = [P.x - C[0], P.y - C[1], P.z - C[2]], L = Math.hypot(...d);
      const r = cp.rayo(C, [d[0] / L, d[1] / L, d[2] / L], 0.7);
      if (!r) continue;
      const res = r.s - L;
      if (res > 0.003) TORSO_BUMPS.push([+P.x.toFixed(3), +P.y.toFixed(3), +P.z.toFixed(3), 0.05, +(res * 0.8).toFixed(4)]);
    }
  }
  mc('superficies');

  // ---------- cascos ----------
  // Cono truncado alto (docs/investigacion-anatomia.md §3): pared con la pinza a ~53° (manos) o ~56° (patas),
  // 8–9 cm de pared en la pinza y ~4 cm en los talones, banda coronaria (perioplo) arriba, cuerno casi negro con
  // vetas verticales (map y bump con las vetas a lo largo de v) y brillo leve. Abajo: borde de la pared, línea
  // blanca, suela cóncava oscura, ranilla en V con su surco y los talones. Origen = corona (articulación
  // interfalangiana distal); el suelo queda a −HOOF_H. Una sola malla cerrada con coatMat-programa (hoofMat).
  function cascoGeo(trasero) {
    const seg = 64;
    const pos = [], col = [], uv = [], idx = [];
    const cPared = lin('#2a2420'), cPerioplo = lin('#4f453c'), cLinea = lin('#5a4c3e'), cSuela = lin('#2b2420'), cRanilla = lin('#3d332c');
    const hash = (j) => { const s = Math.sin(j * 127.1 + (trasero ? 311.7 : 0)) * 43758.5453; return s - Math.floor(s); };
    // contorno en el suelo (x adelante, z al costado) y de la corona, para el ángulo a (0 = pinza)
    const suelo = (a) => {
      const c = Math.cos(a), s = Math.sin(a);
      const lx = c > 0 ? (trasero ? 0.063 : 0.065) : (trasero ? 0.062 : 0.064), lz = trasero ? 0.0575 : 0.0625;
      let x = lx * c, z = lz * s;
      if (trasero) z *= 1 - 0.2 * Math.max(0, c) ** 2;                         // pinza en punta
      if (c < -0.55) { const k = (-c - 0.55) / 0.45; x = lerp(x, -lx * 0.86, k * k); z *= 1 - 0.12 * k; }  // talones
      return [x, z];
    };
    const corona = (a) => {
      const c = Math.cos(a), s = Math.sin(a), h = 0.5 + 0.5 * c;
      // (queda apenas por dentro del rodete coronario de la piel, que la cubre)
      const x = lerp(-0.053, trasero ? 0.0135 : 0.0145, Math.pow(h, 0.9));
      const z = (trasero ? 0.0425 : 0.045) * s * Math.sqrt(Math.max(0, 1 - 0.12 * c * c));
      const y = lerp(-0.0165, 0.0145, Math.pow(h, 1.1));
      return [x, y, z];
    };
    const R = [];   // anillos de la pared, de la corona al suelo
    const TT = [0, 0.04, 0.09, 0.16, 0.3, 0.5, 0.7, 0.88, 1];
    for (const t of TT) {
      const ring = [];
      for (let j = 0; j <= seg; j++) {
        const a = (j / seg) * TAU, [x0, y0, z0] = corona(a), [x1, z1] = suelo(a);
        // perioplo: rodete apenas saliente arriba; la pared se abre un poco hacia el suelo
        const rod = 0.0022 * Math.exp(-(((t - 0.035) / 0.035) ** 2)) - 0.0008 * sstep(0.06, 0.12, t) * (1 - sstep(0.12, 0.25, t));
        const ca = Math.cos(a), sa = Math.sin(a);
        const x = lerp(x0, x1, t) + ca * (rod + 0.0015 * Math.sin(Math.PI * t)), z = lerp(z0, z1, t) + sa * (rod + 0.0015 * Math.sin(Math.PI * t));
        const y = t === 1 ? -HOOF_H : lerp(y0, -HOOF_H, t);
        const k = pos.length / 3;
        pos.push(x, y, z);
        const vet = 0.75 + 0.5 * hash(j) + 0.2 * hash(j * 3.1 + t * 7);
        const cc = cPared.clone().multiplyScalar(vet).lerp(cPerioplo, 1 - sstep(0.03, 0.1, t));
        col.push(cc.r, cc.g, cc.b);
        uv.push(j / seg * 3.0, y * 4 + 0.5);
        ring.push(k);
      }
      R.push(ring);
    }
    for (let r = 0; r < R.length - 1; r++) for (let j = 0; j < seg; j++) {
      const a = R[r][j], b = R[r][j + 1], c = R[r + 1][j], d = R[r + 1][j + 1];
      idx.push(a, b, c, b, d, c);
    }
    // abajo: borde de la pared, línea blanca, suela cóncava y ranilla
    const ranilla = (x, z) => {   // 0 fuera de la ranilla, 1 en el medio (V que abre hacia los talones)
      const f = (0.025 - x) / 0.085;
      if (f <= 0 || f > 1.05) return 0;
      const w = 0.028 * Math.min(1, f) + 0.002;
      return sstep(w, w * 0.6, Math.abs(z));
    };
    const SB = [[1.0, 0, 'pared'], [0.86, 0, 'linea'], [0.8, 0.004, 'suela'], [0.62, 0.009, 'suela'], [0.42, 0.012, 'suela'], [0.22, 0.013, 'suela'], [0.06, 0.013, 'suela']];
    const RB = [R[R.length - 1]];
    for (let q = 1; q < SB.length; q++) {
      const [sc, alto, tipo] = SB[q], ring = [];
      for (let j = 0; j <= seg; j++) {
        const a = (j / seg) * TAU, [x1, z1] = suelo(a);
        const x = x1 * sc + (1 - sc) * -0.01, z = z1 * sc;
        const rn = tipo === 'suela' ? ranilla(x, z) : 0;
        const surco = rn * sstep(0.004, 0.0, Math.abs(z)) * (x < 0.0 ? 1 : 0);
        const y = -HOOF_H + alto * (1 - rn * 0.75) + surco * 0.006;
        const k = pos.length / 3;
        pos.push(x, y, z);
        const cc = tipo === 'linea' ? cLinea : cSuela.clone().lerp(cRanilla, rn);
        col.push(cc.r, cc.g, cc.b);
        uv.push(x * 5, z * 5);
        ring.push(k);
      }
      RB.push(ring);
    }
    for (let r = 0; r < RB.length - 1; r++) for (let j = 0; j < seg; j++) {
      const a = RB[r][j], b = RB[r][j + 1], c = RB[r + 1][j], d = RB[r + 1][j + 1];
      idx.push(a, b, c, b, d, c);
    }
    const cS = pos.length / 3; pos.push(-0.01, -HOOF_H + 0.011, 0); col.push(cRanilla.r, cRanilla.g, cRanilla.b); uv.push(0, 0);
    const ult = RB[RB.length - 1];
    for (let j = 0; j < seg; j++) idx.push(ult[j], ult[j + 1], cS);
    // tapa de la corona (queda dentro de la piel, cierra la malla)
    const cT = pos.length / 3; pos.push(-0.02, -0.004, 0); col.push(cPared.r, cPared.g, cPared.b); uv.push(0, 0);
    for (let j = 0; j < seg; j++) idx.push(R[0][j + 1], R[0][j], cT);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    // puntos del borde del suelo para controlar que el casco no se hunda en el vuelo
    const borde = R[R.length - 1].map((k) => new V(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]));
    const muestras = borde.filter((_, j) => j % 4 === 0);
    const pinza = new V(Math.max(...borde.map((v) => v.x)), -HOOF_H, 0);
    return { g, muestras, pinza };
  }
  const cascoD = cascoGeo(false), cascoT = cascoGeo(true);

  // ---------- patas: geometría de reposo e IK ----------
  // (sin vectores nuevos por cuadro: todo lo que se usa en cada cuadro está preasignado)
  const rotXa = (p, ang, T, out) => { const dy = p.y - T.y, dz = p.z - T.z, c = Math.cos(ang), s = Math.sin(ang); return out.set(p.x, T.y + dy * c - dz * s, T.z + dy * s + dz * c); };
  const rotX = (p, ang, T) => rotXa(p, ang, T, new V());
  const rot2a = (x, y, a, o) => { const c = Math.cos(a), s = Math.sin(a); o[0] = x * c - y * s; o[1] = x * s + y * c; return o; };
  const ang2 = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]);
  const len2 = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const LEG_IDS = ['MD', 'MI', 'PD', 'PI'];
  const nuevoRes = () => ({ S: [0, 0], E: [0, 0], K: [0, 0], B: [0, 0], C: [0, 0], Fe: [0, 0], exceso: 0, th: 0 });
  const legs = LEG_IDS.map((id) => {
    const front = id[0] === 'M', s = id[1] === 'D' ? 1 : -1;
    const z = (p) => new V(p[0], p[1], p[2] * s);
    const J = front ? { T: z(ARTIC.escapulaPivote), S: z(ARTIC.hombro), E: z(ARTIC.codo), K: z(ARTIC.rodilla), F: z(ARTIC.menudilloD), H: z(ARTIC.coronaD) }
      : { T: z(ARTIC.cadera), B: z(ARTIC.babilla), C: z(ARTIC.corvejon), F: z(ARTIC.menudilloT), H: z(ARTIC.coronaT) };
    const L = { id, front, s, b0: BASE_PATA[id], parent: front ? cruzIn : lsIn, J, T: J.T.clone(), stance: true };
    L.alfa0 = Math.atan2(J.H.z - J.T.z, J.T.y - J.H.y);
    L.pl = {}; L.dz = {};
    for (const k in J) { const q = rotX(J[k], L.alfa0, J.T); L.pl[k] = [q.x, q.y]; L.dz[k] = q.z - J.T.z; }
    const P = L.pl;
    L.Lp = len2(P.F, P.H);
    const cdir0 = front ? [(P.F[0] - P.K[0]) / len2(P.K, P.F), (P.F[1] - P.K[1]) / len2(P.K, P.F)] : [(P.F[0] - P.C[0]) / len2(P.C, P.F), (P.F[1] - P.C[1]) / len2(P.C, P.F)];
    const pdir0 = [(P.H[0] - P.F[0]) / L.Lp, (P.H[1] - P.F[1]) / L.Lp];
    L.thE0 = Math.atan2(cdir0[0] * pdir0[1] - cdir0[1] * pdir0[0], cdir0[0] * pdir0[0] + cdir0[1] * pdir0[1]);
    L.cdir = cdir0.slice();
    if (front) {
      L.Lsc = len2(P.T, P.S); L.angSc0 = ang2(P.T, P.S);
      L.Lh = len2(P.S, P.E); L.La = len2(P.E, P.K); L.Lc = len2(P.K, P.F);
      L.lam0 = Math.atan2(P.F[0] - P.T[0], P.T[1] - P.F[1]);
      const u = [P.F[0] - P.S[0], P.F[1] - P.S[1]], e = [P.E[0] - P.S[0], P.E[1] - P.S[1]];
      L.sideE = Math.sign(u[0] * e[1] - u[1] * e[0]) || -1;
    } else {
      L.Lf = len2(P.T, P.B); L.Lt = len2(P.B, P.C); L.Lm = len2(P.C, P.F);
      const d0 = [(P.B[0] - P.T[0]) / L.Lf, (P.B[1] - P.T[1]) / L.Lf], d1 = [(P.C[0] - P.B[0]) / L.Lt, (P.C[1] - P.B[1]) / L.Lt], d2 = [(P.F[0] - P.C[0]) / L.Lm, (P.F[1] - P.C[1]) / L.Lm];
      const sang = (a, b) => Math.atan2(a[0] * b[1] - a[1] * b[0], a[0] * b[0] + a[1] * b[1]);
      const s1 = sang([-d0[0], -d0[1]], d1), s2 = sang([-d1[0], -d1[1]], d2);
      L.sigS = Math.sign(s1); L.thS0 = Math.abs(s1); L.sigH = Math.sign(s2); L.thH0 = Math.abs(s2);
      L.d0 = d0;
      L.thSmin = L.thS0 - 1.05; L.thSmax = Math.min(2.95, L.thS0 + 0.95);
    }
    // casco
    const cg = front ? cascoD : cascoT;
    const hoof = new THREE.Group();
    hoof.add(shadowed(new THREE.Mesh(cg.g, hoofMat)));
    hoof.position.copy(J.H);
    horse.add(hoof);
    L.hoof = hoof; L.muestras = cg.muestras; L.pinza = cg.pinza;
    // marcos de reposo de los huesos
    L.restInv = [];
    L.rest = { W: (front ? J.E : J.B).clone(), J: (front ? J.K : J.C).clone(), F: J.F.clone(), H: J.H.clone() };
    // memoria preasignada para el IK
    L.j = front ? { T: new V(), S: new V(), E: new V(), K: new V(), F: new V(), H: new V() } : { T: new V(), B: new V(), C: new V(), F: new V(), H: new V() };
    L.segs = front ? [[L.j.T, L.j.S], [L.j.S, L.j.E], [L.j.E, L.j.K], [L.j.K, L.j.F], [L.j.F, L.j.H]] : [[L.j.T, L.j.B], [L.j.B, L.j.C], [L.j.C, L.j.F], [L.j.F, L.j.H]];
    L.normal = new V();
    L.res = nuevoRes(); L.resP = nuevoRes(); L.tmpTh = nuevoRes();
    L.it = { res: L.res, alfa: 0, H: [0, 0], F: [0, 0], cdir: [0, 0], pd: [0, 0] };
    L.itP = { res: L.resP, alfa: 0, H: [0, 0], F: [0, 0], cdir: [0, 0], pd: [0, 0] };
    L.firma = new Float64Array(28).fill(NaN);
    L.compDesp = { tope: 0, slide: 0, extra: 0, vt: 0, vs: 0, ve: 0, t: 0, ap: false }; L.segunda = false;
    L.inclinacion = 0;
    return L;
  });
  // marco (matriz) de un segmento A → B con normal n
  const _X = new V(), _Y = new V(), _Z = new V();
  function marco(A, Bp, n, out) {
    _X.subVectors(Bp, A).normalize();
    _Z.copy(n).addScaledVector(_X, -n.dot(_X)).normalize();
    _Y.crossVectors(_Z, _X);
    return out.makeBasis(_X, _Y, _Z).setPosition(A);
  }
  const Mp = new THREE.Matrix4(), Mpi = new THREE.Matrix4(), mTmp = new THREE.Matrix4(), mTmp2 = new THREE.Matrix4();
  const qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), qC = new THREE.Quaternion(), eTmp = new THREE.Euler();
  const vN = new V(), EJE_Z = new V(0, 0, 1), _hp = new V(), _hq = new V(), _a3 = new V(), _a3b = new V();
  const _S2 = [0, 0], _u2 = [0, 0], _r2 = [0, 0];
  // Alcance de las cadenas sin singularidades: el IK de 2 segmentos tiene derivada infinita con el miembro del todo
  // estirado (o plegado), así que la distancia efectiva nunca llega a menos de IK_M del tope y se satura de forma
  // suave (C1) en una banda de IK_K: el menudillo efectivo se acerca al tope del miembro sin saltos.
  // En el vuelo el margen y la banda crecen con mezclaCasco (ikVuelo, 0 apoyado): el casco puede ir muy lejos del
  // alcance (el plan del vuelo no lo conoce) y al volver a entrar con la banda angosta el codo se abría de golpe.
  const IK_M = 0.008, IK_K = 0.015, IK_MV = 0.03, IK_KV = 0.08;
  let ikVuelo = 0, tIK = 0;   // tIK: tiempo de la pose (para la velocidad de la compensación al despegar)
  // igual a x hasta lim − k, igual a lim desde lim + k, cuadrática entre medio (continua en valor y derivada)
  const satArriba = (x, lim, k) => (x <= lim - k ? x : x >= lim + k ? lim : x - (x - lim + k) * (x - lim + k) / (4 * k));
  const satAbajo = (x, lim, k) => -satArriba(-x, -lim, k);
  // rampa C1: 0 para x ≤ 0, x²/(2k) hasta k, x − k/2 después
  const rampa = (x, k) => (x <= 0 ? 0 : x < k ? x * x / (2 * k) : x - k / 2);
  // cadena plana de la mano: S, E, K y el menudillo efectivo en `o`; d = |S − F|, dlim = distancia máxima (con margen);
  // exceso > 0 si F queda en la banda de saturación (no llega del todo), < 0 si queda demasiado cerca
  function cadenaMano(L, F, c, slide, o) {
    const P = L.pl, T = P.T;
    const lam = Math.atan2(F[0] - T[0], T[1] - F[1]), psi = 0.45 * (lam - L.lam0);
    const S = o.S;
    S[0] = T[0] + L.Lsc * Math.cos(L.angSc0 + psi); S[1] = T[1] + L.Lsc * Math.sin(L.angSc0 + psi);
    if (slide) { const d = len2(S, F); S[0] += (F[0] - S[0]) / d * slide; S[1] += (F[1] - S[1]) / d * slide; }
    const Lv = Math.sqrt(L.La * L.La + L.Lc * L.Lc + 2 * L.La * L.Lc * Math.cos(c));
    const M = IK_M + IK_MV * ikVuelo, K = IK_K + IK_KV * ikVuelo;
    const d = len2(S, F), dmax = L.Lh + Lv - M, dmin = Math.abs(L.Lh - Lv) + IK_M;
    o.d = d; o.dlim = dmax; o.k = K;
    o.exceso = d > dmax - K ? d - (dmax - K) : d < dmin + IK_K ? -(dmin + IK_K - d) : 0;
    const dc = satAbajo(satArriba(d, dmax, K), dmin, IK_K);
    const ux = (F[0] - S[0]) / d, uy = (F[1] - S[1]) / d;
    o.Fe[0] = S[0] + ux * dc; o.Fe[1] = S[1] + uy * dc;
    const g = Math.acos(Math.max(-1, Math.min(1, (L.Lh * L.Lh + dc * dc - Lv * Lv) / (2 * L.Lh * dc))));
    rot2a(ux, uy, L.sideE * g, _r2); o.E[0] = S[0] + _r2[0] * L.Lh; o.E[1] = S[1] + _r2[1] * L.Lh;
    const uex = (o.Fe[0] - o.E[0]) / Lv, uey = (o.Fe[1] - o.E[1]) / Lv;
    // ángulo del antebrazo respecto de E → menudillo, exacto y sin la singularidad de acos con la rodilla recta
    const gk = Math.atan2(L.Lc * Math.sin(c), L.La + L.Lc * Math.cos(c));
    rot2a(uex, uey, gk, _r2); o.K[0] = o.E[0] + _r2[0] * L.La; o.K[1] = o.E[1] + _r2[1] * L.La;
    return o;
  }
  // cadena plana de la pata con el aparato recíproco (corvejón = babilla)
  function cadenaPataTh(L, th, o) {
    const T = L.pl.T;
    const thH = Math.min(3.1, Math.max(0.8, L.thH0 + (th - L.thS0)));
    o.B[0] = T[0] + L.Lf * L.d0[0]; o.B[1] = T[1] + L.Lf * L.d0[1];
    rot2a(-L.d0[0], -L.d0[1], L.sigS * th, _r2); const d1x = _r2[0], d1y = _r2[1];
    o.C[0] = o.B[0] + L.Lt * d1x; o.C[1] = o.B[1] + L.Lt * d1y;
    rot2a(-d1x, -d1y, L.sigH * thH, _r2);
    o.Fe[0] = o.C[0] + L.Lm * _r2[0]; o.Fe[1] = o.C[1] + L.Lm * _r2[1];
    return o;
  }
  // distancia del tope al menudillo con la babilla en th (sin closures: se llama ~25 veces por pata y por cuadro)
  const alcPata = (L, th) => len2(L.pl.T, cadenaPataTh(L, th, L.tmpTh).Fe);
  const rotar2Alrededor = (p, T, rho) => { rot2a(p[0] - T[0], p[1] - T[1], rho, _r2); p[0] = T[0] + _r2[0]; p[1] = T[1] + _r2[1]; };
  function cadenaPata(L, F, o) {
    const T = L.pl.T, d = len2(T, F);
    let lo = L.thSmin, hi = L.thSmax, th;
    if (L.rmax === undefined) { L.rmax = alcPata(L, hi); L.rmin = alcPata(L, lo); }
    const M = IK_M + IK_MV * ikVuelo, K = IK_K + IK_KV * ikVuelo;
    const rmax = L.rmax - M, rmin = L.rmin + IK_M;
    o.d = d; o.dlim = rmax; o.k = K;
    o.exceso = d > rmax - K ? d - (rmax - K) : d < rmin + IK_K ? -(rmin + IK_K - d) : 0;
    // distancia efectiva saturada de forma suave (ver IK_M, IK_K)
    const dc = satAbajo(satArriba(d, rmax, K), rmin, IK_K);
    for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (alcPata(L, m) < dc) lo = m; else hi = m; }
    th = (lo + hi) / 2;
    cadenaPataTh(L, th, o);
    const rho = ang2(T, F) - ang2(T, o.Fe);
    rotar2Alrededor(o.B, T, rho); rotar2Alrededor(o.C, T, rho); rotar2Alrededor(o.Fe, T, rho);
    o.th = th;
    return o;
  }
  // un intento completo para un casco H (marco del caballo): articulaciones planas en `it` (Mpi ya calculada)
  function intento(L, Hh, op, slide, haciaTope, carpo, it) {
    const Hp = _hp.copy(Hh).applyMatrix4(Mpi), T = L.T;
    const alfa = Math.atan2(Hp.z - T.z, T.y - Hp.y);
    const Hq = rotXa(Hp, alfa, T, _hq), H = it.H; H[0] = Hq.x; H[1] = Hq.y;
    const thE = L.thE0 + (op.menudillo || 0);
    const cd = it.cdir; cd[0] = L.cdir[0]; cd[1] = L.cdir[1];
    const pd = it.pd, F = it.F, res = it.res;
    // punto fijo caña ↔ cuartilla: se itera hasta converger (con 2 pasadas el resultado dependía de la dirección de la
    // caña del cuadro anterior, que ya traía la compensación: la pata oscilaba entre cuadros)
    for (let k = 0, e = 1; k < 8 && e > 1e-9; k++) {
      const c0 = cd[0], c1 = cd[1];
      rot2a(cd[0], cd[1], thE, pd);
      if (haciaTope > 0) {   // la cuartilla gira hacia el tope del miembro (acorta el alcance)
        const tqx = L.pl.T[0] - H[0], tqy = L.pl.T[1] - H[1], tl = Math.hypot(tqx, tqy);
        const a0 = Math.atan2(pd[1], pd[0]), a1 = Math.atan2(-tqy / tl, -tqx / tl);
        let da = a1 - a0; da -= Math.round(da / TAU) * TAU;
        pd[0] = Math.cos(a0 + da * haciaTope); pd[1] = Math.sin(a0 + da * haciaTope);
      }
      F[0] = H[0] - L.Lp * pd[0]; F[1] = H[1] - L.Lp * pd[1];
      if (L.front) cadenaMano(L, F, carpo, slide, res); else cadenaPata(L, F, res);
      const K = L.front ? res.K : res.C, dl = len2(K, res.Fe);
      cd[0] = (res.Fe[0] - K[0]) / dl; cd[1] = (res.Fe[1] - K[1]) / dl;
      e = (cd[0] - c0) * (cd[0] - c0) + (cd[1] - c1) * (cd[1] - c1);
    }
    it.alfa = alfa;
    return it;
  }
  const hoofPos = new V(), toeTmp = new V(), _Hc = new V(), _Hb = new V();
  // rota el casco sobre la pinza: centro de la corona para una pinza fija en el suelo (marco del caballo).
  // rumbo (opcional): giro del casco alrededor de y (ver patas.X.rumbo)
  function cascoConPinza(pinzaSuelo, incl, out = new V(), pata = legs[0], rumbo = 0) {
    const px = pata.pinza.x, py = pata.pinza.y, c = Math.cos(-incl), s = Math.sin(-incl);
    const ox = px * c - py * s, oy = px * s + py * c, cr = Math.cos(rumbo), sr = Math.sin(rumbo);
    return out.set(pinzaSuelo.x - ox * cr, pinzaSuelo.y - oy, pinzaSuelo.z + ox * sr);
  }
  // breakover: distancia del tope al menudillo con el casco rotado i sobre la pinza fija (toeTmp)
  function distBreak(L, i, op, slide, tope, c, rumbo) { return intento(L, cascoConPinza(toeTmp, i, _Hb, L, rumbo), op, slide, tope, c, L.itP).res.d; }
  // ángulo i en [a, b] con distBreak(i) = obj (decreciente): bisección y una interpolación lineal final (así el
  // resultado varía de forma continua, sin escalones del tamaño del último intervalo)
  function raizBreak(L, op, slide, tope, c, rumbo, obj, a, b, n) {
    let ga = distBreak(L, a, op, slide, tope, c, rumbo) - obj, gb = distBreak(L, b, op, slide, tope, c, rumbo) - obj;
    for (let k = 0; k < n; k++) {
      const m = (a + b) / 2, gm = distBreak(L, m, op, slide, tope, c, rumbo) - obj;
      if (gm > 0) { a = m; ga = gm; } else { b = m; gb = gm; }
    }
    return ga - gb > 1e-12 ? a + (b - a) * ga / (ga - gb) : (a + b) / 2;
  }
  // articulación plana p (coordenadas del plano del miembro) a 3D, marco del caballo
  function a3(L, alfa, p, k, out) { const T = L.T; return rotXa(_a3.set(p[0], p[1], T.z + L.dz[k]), -alfa, T, out).applyMatrix4(Mp); }
  function resolverPata(L, Hin, op, subido = 0) {
    Mp.copy(L.parent.matrixWorld);
    Mpi.copy(Mp).invert();
    const apoyado = !!op.apoyado, rumbo = op.rumbo || 0;
    const H = _Hc.copy(Hin); if (subido) H.y += subido;
    const mez = op.mezclaCasco !== undefined ? op.mezclaCasco : apoyado ? 0 : 1;
    let incl = op.inclinacion || 0, slide = 0, tope = 0, inclReal = NaN;
    let c = op.carpo || 0;
    ikVuelo = apoyado ? 0 : mez;
    let r = intento(L, H, op, 0, 0, c, L.it);
    // en el vuelo (manos): si la mano queda muy cerca del hombro, la rodilla se pliega más (Lv se limita de forma suave)
    if (!apoyado && L.front) {
      const La = L.La, Lc = L.Lc, Lv = Math.sqrt(La * La + Lc * Lc + 2 * La * Lc * Math.cos(c));
      const Lv1 = satArriba(Lv, r.res.d + L.Lh - IK_M - 2 * IK_K, IK_K);   // (lado plegado: margen fijo)
      if (Lv1 < Lv) { c = Math.min(2.5, Math.acos(Math.max(-1, Math.min(1, (Lv1 * Lv1 - La * La - Lc * Lc) / (2 * La * Lc))))); r = intento(L, H, op, 0, 0, c, L.it); }
    }
    // Si la pata no llega: en orden, se para la cuartilla, en las manos se desliza la escápula y el casco rota sobre la
    // pinza (breakover). Lo que hay que acortar (R) sale de una saturación suave de la distancia al tope, y cada recurso
    // toma su parte con otra saturación suave: todo es continuo en valor y en velocidad (no hay umbrales que se
    // activen de golpe). Apoyado se compensa todo; en el vuelo, en la proporción 1 − mezclaCasco (igual que apoyado al
    // despegar; en el resto del vuelo el casco se acerca, ver cadenaMano). En la segunda mitad del vuelo R cambia rápido
    // (el casco vuelve hacia la pisada) y cualquier recurso que lo siguiera daba tirones: ahí solo acerca el IK, con la
    // banda que se angosta hasta la del apoyo al pisar.
    // En la primera mitad del vuelo (hasta que mezclaCasco llega a 1) la compensación no se recalcula: sigue la que
    // tenía la pata al despegar (ángulo de la cuartilla, escápula y breakover agregado) y se va con 1 − mezclaCasco.
    // Recalcularla con la cuartilla flexionándose rápido daba saltos (la ganancia de la cuartilla cambia mucho).
    // (el cambio de una regla a la otra es con mezclaCasco = 1, donde las dos valen 0)
    if (apoyado) L.segunda = false; else if (mez >= 1 - 1e-9) L.segunda = true;
    const d0 = r.res.d, KB = r.res.k, lim = r.res.dlim - KB, cd0 = L.compDesp;
    if (!apoyado && !L.segunda) {
      // valor y velocidad del último apoyo: c(t) = (c0 + v·t·(1 − t/0,1)²)·(1 − mezclaCasco), C1 al despegar
      const w = 1 - mez, tv = Math.max(0, tIK - cd0.t), gv = tv * Math.max(0, 1 - tv / 0.1) ** 2;
      tope = Math.min(1, Math.max(0, cd0.tope + cd0.vt * gv)) * w;
      slide = Math.max(0, cd0.slide + cd0.vs * gv) * w;
      const ext = Math.max(0, cd0.extra + cd0.ve * gv);
      if (ext > 0) {
        const cs = Math.cos(-incl), sn = Math.sin(-incl), ox = L.pinza.x * cs - L.pinza.y * sn, oy = L.pinza.x * sn + L.pinza.y * cs;
        toeTmp.set(H.x + ox * Math.cos(rumbo), H.y + oy, H.z - ox * Math.sin(rumbo));
        incl += ext * w;
        cascoConPinza(toeTmp, incl, H, L, rumbo);
      }
      r = intento(L, H, op, slide, tope, c, L.it);
    } else if (apoyado && d0 > lim - KB) {
      // al pisar la compensación entra de a poco (op.compensa, 0 → 1 al principio del apoyo): el vuelo termina sin
      // compensación (solo acerca el IK) y así no hay salto al pisar
      let R = (op.compensa !== undefined ? op.compensa : 1) * (d0 - satArriba(d0, lim, KB));
      // 1) la cuartilla se para hacia el tope del miembro: gira la fracción `tope` del ángulo que le falta para
      //    alinearse con la recta tope → corona, proporcional a lo que hay que acortar (satura en 1 a los ~2,6 cm).
      //    Lo que acorta de verdad depende de ese ángulo; lo que falte lo toman la escápula, el breakover o el IK.
      if (R > 0) {
        tope = satArriba(R / 0.04, 1, 0.3);
        r = intento(L, H, op, 0, tope, c, L.it);
        R -= d0 - r.res.d;
      }
      // 2) en las manos la escápula se desliza a lo largo del miembro (hasta 4 cm)
      //    (R ya entra con derivada nula: la escápula toma todo hasta saturar cerca de los 4 cm)
      if (L.front && R > 0) { slide = satArriba(R, 0.04, 0.006); R -= slide; if (slide > 0) r = intento(L, H, op, slide, tope, c, L.it); }
      // 3) breakover: el casco rota sobre la pinza (la pinza no se mueve), hasta 0,9 rad más. Rotar acorta hasta un
      //    ángulo iM (después vuelve a alargar): se busca iM y la parte del breakover se satura de forma suave en lo
      //    que acorta hasta ahí. Si aun así no llega, el casco se sigue dando vuelta de a poco (hasta +0,9 rad): es la
      //    señal para que la locomoción despegue la pata (y la del --alcance de check.mjs); la cuartilla absorbe el resto.
      if (R > 1e-6) {
        const cs = Math.cos(-incl), sn = Math.sin(-incl), ox = L.pinza.x * cs - L.pinza.y * sn, oy = L.pinza.x * sn + L.pinza.y * cs;
        toeTmp.set(H.x + ox * Math.cos(rumbo), H.y + oy, H.z - ox * Math.sin(rumbo));
        const dA = r.res.d;
        let kM = 0, dM = dA;
        for (let k = 1; k <= 6; k++) { const dk = distBreak(L, incl + 0.15 * k, op, slide, tope, c, rumbo); if (dk < dM) { dM = dk; kM = k; } }
        let iM = incl;
        if (kM > 0) {   // sección áurea alrededor de la mejor muestra
          let a = incl + 0.15 * (kM - 1), b = Math.min(incl + 0.9, incl + 0.15 * (kM + 1));
          for (let k = 0; k < 14; k++) {
            const m1 = b - 0.618 * (b - a), m2 = a + 0.618 * (b - a);
            if (distBreak(L, m1, op, slide, tope, c, rumbo) < distBreak(L, m2, op, slide, tope, c, rumbo)) b = m2; else a = m1;
          }
          iM = (a + b) / 2; dM = Math.min(dM, distBreak(L, iM, op, slide, tope, c, rumbo));
        }
        const cap3 = dA - dM, i0 = incl;
        if (cap3 > 1e-5) {
          const R3 = satArriba(R, cap3, 0.3 * cap3), obj = dA - R3;
          incl = R3 >= cap3 - 1e-9 ? iM : raizBreak(L, op, slide, tope, c, rumbo, obj, i0, iM, 16);
          R -= R3;
        }
        inclReal = incl;
        if (R > 0.002) incl += (i0 + 0.9 - incl) * sstep(0.002, 0.012, R);
        cascoConPinza(toeTmp, incl, H, L, rumbo);
        r = intento(L, H, op, slide, tope, c, L.it);
      }
    }
    L.cdir[0] = r.cdir[0]; L.cdir[1] = r.cdir[1];
    // articulaciones 3D
    const T = L.T, P = r.res, j = L.j;
    const al = r.alfa;
    a3(L, al, L.pl.T, 'T', j.T); a3(L, al, P.Fe, 'F', j.F);
    if (L.front) { a3(L, al, P.S, 'S', j.S); a3(L, al, P.E, 'E', j.E); a3(L, al, P.K, 'K', j.K); } else { a3(L, al, P.B, 'B', j.B); a3(L, al, P.C, 'C', j.C); }
    // el casco: apoyado, en H exacto; en el vuelo, al final de la cuartilla con la dirección con la que se resolvió
    // (H corrido lo que se acercó el menudillo): si el menudillo llega, el casco queda en H igual que apoyado
    if (apoyado) j.H.copy(H); else { _S2[0] = P.Fe[0] + r.pd[0] * L.Lp; _S2[1] = P.Fe[1] + r.pd[1] * L.Lp; a3(L, al, _S2, 'H', j.H); }
    if (L.front && slide) {   // la escápula entera se corre con el hombro
      const sl = rotXa(_a3.set(L.pl.T[0], L.pl.T[1], T.z + L.dz.T), -r.alfa, T, _a3b).applyMatrix4(Mp);
      cadenaMano(L, r.F, c, 0, L.resP);
      a3(L, al, L.resP.S, 'S', _hp);
      j.T.copy(sl).add(_hq.subVectors(j.S, _hp));
    }
    // normal del plano del miembro
    vN.set(0, Math.sin(r.alfa), Math.cos(r.alfa)).transformDirection(Mp);
    L.normal.copy(vN);
    // orientación del casco: rumbo (alrededor de y) y luego la inclinación sobre la pinza
    qA.setFromEuler(eTmp.set(0, rumbo, -incl, 'YXZ'));
    if (mez > 0) {
      marco(j.F, j.H, vN, mTmp);
      mTmp2.multiplyMatrices(mTmp, L.restInv[L.front ? 4 : 3]);   // deformación de la cuartilla
      qB.setFromRotationMatrix(mTmp2);
      qB.multiply(qC.setFromAxisAngle(EJE_Z, -(op.flexCasco || 0)));
      qA.slerp(qB, mez);
    }
    L.hoof.quaternion.copy(qA);
    L.hoof.position.copy(j.H);
    L.hoof.updateMatrix();
    // en el vuelo el casco no puede quedar por debajo del suelo: se sube lo que se hunde, con una rampa suave (C1)
    // que no toca nada mientras la suela no baja del suelo (al pisar no hay salto)
    if (!apoyado && !subido) {
      let mn = 1e9;
      for (const m of L.muestras) mn = Math.min(mn, hoofPos.copy(m).applyMatrix4(L.hoof.matrix).y);
      const sube = rampa(0.002 - mn, 0.004);
      if (sube > 0) return resolverPata(L, Hin, op, sube);
    }
    L.hoof.matrixWorld.multiplyMatrices(horse.matrixWorld, L.hoof.matrix);
    L.inclinacion = incl;
    if (apoyado && !subido) {
      const ext = (Number.isNaN(inclReal) ? incl : inclReal) - (op.inclinacion || 0), dt = tIK - cd0.t;
      if (cd0.ap && dt > 1e-4) { cd0.vt = (tope - cd0.tope) / dt; cd0.vs = (slide - cd0.slide) / dt; cd0.ve = (ext - cd0.extra) / dt; }
      else if (!cd0.ap) cd0.vt = cd0.vs = cd0.ve = 0;
      cd0.tope = tope; cd0.slide = slide; cd0.extra = ext; cd0.t = tIK; cd0.ap = true;
    } else if (!apoyado) cd0.ap = false;
    L.stance = apoyado;
    huesosPata(L);
  }
  function huesosPata(L) {
    const n = L.normal, b = bones, o = L.b0, segs = L.segs;
    for (let k = 0; k < segs.length; k++) { marco(segs[k][0], segs[k][1], n, mTmp); b[o + k].matrix.multiplyMatrices(mTmp, L.restInv[k]); }
    b[o + segs.length].matrix.multiplyMatrices(L.hoof.matrix, L.restInv[segs.length]);
  }
  // marcos de reposo
  legs.forEach((L) => {
    const J = L.J, n = new V(0, Math.sin(L.alfa0), Math.cos(L.alfa0));
    const segs = L.front ? [[J.T, J.S], [J.S, J.E], [J.E, J.K], [J.K, J.F], [J.F, J.H]] : [[J.T, J.B], [J.B, J.C], [J.C, J.F], [J.F, J.H]];
    L.restInv = segs.map(([A, Bp]) => marco(A, Bp, n, new THREE.Matrix4()).invert());
    L.restInv.push(new THREE.Matrix4().makeTranslation(-J.H.x, -J.H.y, -J.H.z));
  });
  // alcance máximo: del tope al casco, con el miembro estirado hacia abajo (apoyado y casco plano)
  legs.forEach((L) => {
    let lo = 0.8, hi = 1.8;
    const tope = L.T.clone(), Hx = new V(), op0 = { apoyado: true };
    const prueba = (dist) => { Mp.identity(); Mpi.identity(); return intento(L, Hx.set(tope.x + (L.J.H.x - tope.x) * 0.3, tope.y - dist, L.J.H.z), op0, 0, 0, 0, L.itP).res.exceso > 0; };
    for (let i = 0; i < 20; i++) { const m = (lo + hi) / 2; if (prueba(m)) hi = m; else lo = m; }
    L.alcanceMax = lo;
  });

  // ---------- ojos: globo oscuro y muy liso (el reflejo del cielo y de la luz es el punto de brillo) ----------
  cp.ojos.forEach((o) => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(o.R, 32, 22), eyeMat);
    eye.position.set(o.c[0], o.c[1], o.c[2]);
    eye.quaternion.setFromUnitVectors(EJE_Z, new V(o.eje[0], o.eje[1], o.eje[2]));
    eye.scale.set(1.05, 0.92, 0.86);
    headInner.add(eye);
  });

  // ---------- orejas: hoja con copa que abre hacia adelante y afuera, punta apenas curvada hacia adentro ----------
  // Marco de la oreja: y a lo largo de la oreja, z hacia donde abre la copa, x hacia afuera (m = ±1 espeja).
  // La sección es un arco de circunferencia: casi un tubo en la base (que envuelve la base de la oreja de la piel)
  // y una cuchara abierta hacia la punta. Una malla cerrada (cara de afuera con el pelaje, adentro oscura y el
  // canto), con el programa de coatMat.
  const OREJA = { L: 0.15 };
  const orejaAncho = (v) => (0.072 + 0.04 * Math.sin(Math.PI * v * 0.9)) * Math.pow(Math.max(0, 1 - v), 0.6) + 0.0008;
  function orejaPunto(m, v, th, adentro, out) {
    const thm = lerp(3.12, 1.15, Math.pow(sstep(0.12, 0.95, v), 0.75)), W = orejaAncho(v) / 2, R = thm > Math.PI / 2 ? W : W / Math.sin(thm);
    const r = adentro ? R - (0.0045 * (1 - v) + 0.0015) : R, u = th * thm;
    const X = r * Math.sin(u) - 0.014 * v * v, Z = -r * Math.cos(u) + (thm > Math.PI / 2 ? 0 : R * Math.cos(thm)) - 0.008 * v * v;
    return out.set(X * m, v * OREJA.L, Z);
  }
  function orejaGeo(m) {
    const nv = 18, nu = 16, pos = [], col = [], uv = [], idx = [], P = new V();
    const cAfuera = (v, th) => COAT.clone().lerp(COAT_DARK, 0.35 * sstep(0.2, 0.7, v)).lerp(BLACK, Math.max(0.85 * sstep(0.82, 0.98, Math.abs(th)), sstep(0.7, 0.93, v)));
    const cAdentro = (v, th) => lin('#24180f').lerp(lin('#4a3828'), 0.7 * (1 - Math.abs(th)) * (1 - v)).lerp(BLACK, 0.8 * sstep(0.85, 1, Math.abs(th)));
    const caras = [];
    for (const adentro of [false, true]) {
      const o = pos.length / 3;
      for (let i = 0; i <= nv; i++) for (let j = 0; j <= nu; j++) {
        const v = i / nv, th = j / nu * 2 - 1;
        orejaPunto(m, v, th, adentro, P); pos.push(P.x, P.y, P.z);
        const c = adentro ? cAdentro(v, th) : cAfuera(v, th); col.push(c.r, c.g, c.b);
        uv.push(P.x * 2.4 + 0.5, P.y * 2.4);
      }
      caras.push(o);
    }
    // triángulos orientados: la cara de afuera mira hacia atrás (−z en el medio), la de adentro hacia la copa
    const tri = (a, b, c, quiero) => {
      const A = new V(pos[a * 3], pos[a * 3 + 1], pos[a * 3 + 2]), B = new V(pos[b * 3], pos[b * 3 + 1], pos[b * 3 + 2]), C = new V(pos[c * 3], pos[c * 3 + 1], pos[c * 3 + 2]);
      const n = new V().subVectors(B, A).cross(new V().subVectors(C, A));
      return n.dot(quiero) >= 0;
    };
    const iM = Math.floor(nv / 2), jM = Math.floor(nu / 2);
    const flipA = !tri(caras[0] + iM * (nu + 1) + jM, caras[0] + (iM + 1) * (nu + 1) + jM, caras[0] + iM * (nu + 1) + jM + 1, new V(0, 0, -1));
    const flipB = !tri(caras[1] + iM * (nu + 1) + jM, caras[1] + (iM + 1) * (nu + 1) + jM, caras[1] + iM * (nu + 1) + jM + 1, new V(0, 0, 1));
    caras.forEach((o, k) => {
      const flip = k === 0 ? flipA : flipB;
      for (let i = 0; i < nv; i++) for (let j = 0; j < nu; j++) {
        const a = o + i * (nu + 1) + j, b = a + 1, c = a + nu + 1, d = c + 1;
        if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
      }
    });
    // canto: une los bordes de las dos caras (orientado hacia afuera del borde)
    for (const j of [0, nu]) for (let i = 0; i < nv; i++) {
      const a = caras[0] + i * (nu + 1) + j, b = caras[0] + (i + 1) * (nu + 1) + j, c = caras[1] + i * (nu + 1) + j, d = caras[1] + (i + 1) * (nu + 1) + j;
      const v = i / nv, afuera = orejaPunto(m, v, j === 0 ? -1 : 1, false, new V()).sub(orejaPunto(m, v, j === 0 ? -0.9 : 0.9, false, new V()));
      if (tri(a, b, c, afuera)) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  const ears = [1, -1].map((s) => {
    const base = new THREE.Group();
    const bp = hp(0.012, -0.018, 0.056 * s);
    const up = new V(0.1, 1, 0.14 * s).normalize(), fw = new V(0.95, -0.05, 0.32 * s);
    fw.addScaledVector(up, -fw.dot(up)).normalize();
    const xl = new V().crossVectors(up, fw);
    base.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xl, up, fw));
    base.position.set(bp[0], bp[1], bp[2]).addScaledVector(up, -0.022);   // la base del tubo queda dentro de la piel
    const piv = new THREE.Group(); base.add(piv);
    piv.add(shadowed(new THREE.Mesh(orejaGeo(-s), coatMat)));
    piv.userData = { s, m: -s };
    headInner.add(base);
    return piv;
  });
  horse.updateMatrixWorld(true);
  mc('patas');

  // =====================================================================================================
  // PELO: crin, copete, cola, pestañas y pelos de las orejas en UNA malla con piel (1 draw call, se deforma en la
  // GPU). Huesos propios además de los 30 del cuerpo: 10 de la crin (mechones que flamean alrededor de la
  // cresta), 1 del copete, 2 de las orejas y 9 de la cola (cadena con inercia, ver actualizarCola).
  // =====================================================================================================
  const RA = (() => { let s = 20240611 >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();
  // la versión anterior consumía 4310 llamadas a rnd() en la crin, el copete y la cola: se consumen igual para no
  // cambiar la montura ni el campo (ver CLAUDE.md)
  for (let i = 0; i < 4310; i++) rnd();
  const NM = 10, B_CRIN = NB, B_COPETE = NB + NM, B_OREJA = B_COPETE + 1, B_COLA = B_OREJA + 2;
  const TQ = [[-0.60, 1.425], [-0.665, 1.415], [-0.715, 1.36], [-0.745, 1.27], [-0.758, 1.16], [-0.764, 1.06], [-0.768, 0.90], [-0.768, 0.74], [-0.764, 0.58], [-0.757, 0.44], [-0.75, 0.30]].map(([x, y]) => new V(x, y, 0));
  const NQ = TQ.length, ND = 5, NBH = NB + NM + 3 + (NQ - 1);
  const PEL = { pos: [], nrm: [], uv: [], col: [], si: [], sw: [], idx: [] };
  const _cc = new THREE.Color();
  // tira de pelo: puntos P, direcciones del ancho W y normales N (V[]), ancho, afinado, pesos(k, lado) →
  // [hueso, peso] × 4, color de la raíz y de la punta, ventana de la textura [u0, u1]
  let brillo = 0;
  const BRILLO_PELO = lin('#5a4a40');
  function tira(P, W, N, ancho, afinar, pesos, c0, c1, u0, u1) {
    const n = P.length - 1, o = PEL.pos.length / 3;
    for (let k = 0; k <= n; k++) {
      const f = k / n, w = ancho * (1 - afinar * f) * 0.5;
      _cc.copy(c0).lerp(c1, f * f).lerp(BRILLO_PELO, brillo * Math.exp(-(((f - 0.3) / 0.16) ** 2)));
      const ps = pesos(k);
      for (let sg = -1; sg <= 1; sg += 2) {
        PEL.pos.push(P[k].x + W[k].x * w * sg, P[k].y + W[k].y * w * sg, P[k].z + W[k].z * w * sg);
        PEL.nrm.push(N[k].x, N[k].y, N[k].z);
        PEL.uv.push(sg < 0 ? u0 : u1, 1 - f);
        PEL.col.push(_cc.r, _cc.g, _cc.b);
        let s = 0; for (let q = 0; q < 4; q++) s += ps[q * 2 + 1];
        for (let q = 0; q < 4; q++) { PEL.si.push(ps[q * 2]); PEL.sw.push(s > 0 ? ps[q * 2 + 1] / s : q === 0 ? 1 : 0); }
      }
      if (k < n) { const a = o + k * 2; PEL.idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
  }
  const tono = (k) => {   // color de un mechón: casi negro, a veces rojizo; puntas quemadas por el sol
    const base = lin('#16110f').lerp(lin('#2a1912'), k < 0.15 ? 0.9 : k * 0.5);
    return [base, base.clone().lerp(lin('#3a2418'), 0.35 + 0.4 * k)];
  };

  // ---------- crin larga que cae sobre el lado derecho (+z), por mechones ----------
  brillo = 0.45;
  const pesoPunto = (x, y) => {   // dos huesos del cuello y peso del segundo, según la posición a lo largo del cuello
    const W = new Float32Array(NB); cp.pesoCuello(cp.cuello.tDe(x, y), 1, W);
    let a = 0, b = 0; for (let i = 0; i < NB; i++) if (W[i] > W[a]) a = i;
    b = a === 0 ? 1 : 0; for (let i = 0; i < NB; i++) if (i !== a && W[i] > W[b]) b = i;
    const s = W[a] + W[b];
    return [a, b, s > 0 ? W[b] / s : 0];
  };
  const T_CRIN = [], C_CRIN = [];   // t de cada hueso de la crin y su eje (punto de la cresta y tangente)
  for (let g = 0; g < NM; g++) {
    const t = 0.05 + 0.95 * g / (NM - 1);
    T_CRIN.push(t);
    const T0 = cp.cuello.Tp(Math.min(1, t + 0.01)), T1 = cp.cuello.Tp(Math.max(0, t - 0.01)), Tp = cp.cuello.Tp(t);
    const eje = new V(T0[0] - T1[0], T0[1] - T1[1], 0).normalize();
    const base = new V(Tp[0], Tp[1], 0);
    C_CRIN.push({ base, eje, perp: new V(-eje.y, eje.x, 0), huesos: pesoPunto(Tp[0] - 0.02 * eje.y, Tp[1] - 0.04) });
  }
  {
    const tmpN = new V(), q = new V();
    const nMech = 46;
    for (let m = 0; m < nMech; m++) {
      const tc = 0.03 + 0.97 * (m + RA()) / nMech;
      // largo del mechón (la textura termina los pelos entre la mitad y el final de la tira): corto en la cruz,
      // donde la crin termina suave, largo en el medio, algo más corto en la nuca
      const Lm = (0.05 + 0.24 * sstep(0.03, 0.3, tc) - 0.05 * sstep(0.85, 1, tc)) * (0.7 + 0.6 * RA());
      const [c0, c1] = tono(RA());
      const fase = RA() * TAU, onda = 0.004 + RA() * 0.012;
      const nT = tc < 0.12 ? 2 : 3;
      for (let k = 0; k < nT; k++) {
        const t = Math.min(1, Math.max(0.02, tc + (RA() - 0.5) * 0.02));
        const L = Lm * (0.7 + 0.3 * RA()), capa = RA();
        const R = cp.cuello.W(t) * 0.5, n = 9;
        const a0 = -0.06 + RA() * 0.16;           // raíz: sobre la cresta o apenas a la izquierda
        const T0 = cp.cuello.Tp(Math.min(1, t + 0.01)), T1 = cp.cuello.Tp(Math.max(0, t - 0.01));
        const Tc = new V(T0[0] - T1[0], T0[1] - T1[1], 0).normalize();
        const P = [], N = [], W = [];
        for (let i = 0; i <= n; i++) {
          const f = i / n, arc = f * L;
          let ang = a0 + arc / R, cuelga = 0;
          if (ang > 1.35) { cuelga = (ang - 1.35) * R; ang = 1.35; }
          const p = neckSurfRapido(t, ang, new V(), tmpN);
          p.addScaledVector(tmpN, 0.003 + capa * 0.009 + 0.012 * Math.min(1, f * 2.2));
          p.addScaledVector(Tc, -0.025 * f + Math.sin(f * 4 + fase) * onda * f);
          p.y -= cuelga;
          P.push(p); N.push(tmpN.clone());
        }
        const tw = (RA() - 0.5) * 1.1;
        for (let i = 0; i <= n; i++) {
          const D = q.subVectors(P[Math.min(n, i + 1)], P[Math.max(0, i - 1)]).normalize();
          const Wp = Tc.clone().addScaledVector(D, -Tc.dot(D)).normalize();
          W.push(Wp.multiplyScalar(Math.cos(tw)).addScaledVector(new V().crossVectors(D, Wp), Math.sin(tw)));
        }
        const [a, b, w] = pesoPunto(P[0].x, P[0].y);
        const gf = Math.max(0, Math.min(NM - 1.001, (t - T_CRIN[0]) / (T_CRIN[1] - T_CRIN[0]))), g = gf | 0, gr = gf - g;
        const ps = [0, 0, 0, 0, 0, 0, 0, 0];
        tira(P, W, N, 0.016 + RA() * 0.016, 0.5, (i) => {
          const s = sstep(0, 0.75, i / n);
          ps[0] = a; ps[1] = (1 - s) * (1 - w); ps[2] = b; ps[3] = (1 - s) * w; ps[4] = B_CRIN + g; ps[5] = s * (1 - gr); ps[6] = B_CRIN + g + 1; ps[7] = s * gr;
          return ps;
        }, c0, c1, RA() * 0.5, 0.5 + RA() * 0.5);
      }
    }
  }
  // ---------- copete: nace entre las orejas y cae sobre la frente hasta la altura de los ojos ----------
  const COPETE_RAIZ = new V(...hp(-0.005, 0.0, 0));
  {
    const tmpN = new V(), q = new V();
    for (let i = 0; i < 34; i++) {
      const off = (RA() - 0.5) * 0.75, L = 0.15 + RA() * 0.1, n = 8, P = [], N = [], W = [];
      const abre = (RA() - 0.45) * 0.5, [c0, c1] = tono(RA() * 0.6);
      for (let k = 0; k <= n; k++) {
        const f = k / n, t = Math.max(0.004, (f * L - 0.015) / CAB.L);
        const p = headSurf(Math.min(0.9, t), off + abre * f, new V(), tmpN);
        p.addScaledVector(tmpN, 0.005 + 0.01 * f + RA() * 0.004);
        P.push(p); N.push(tmpN.clone());
      }
      for (let k = 0; k <= n; k++) {
        const D = q.subVectors(P[Math.min(n, k + 1)], P[Math.max(0, k - 1)]).normalize();
        W.push(new V().crossVectors(D, N[k]).normalize());
      }
      const ps = [HB.cabeza, 0, B_COPETE, 0, 0, 0, 0, 0];
      tira(P, W, N, 0.012 + RA() * 0.012, 0.75, (k) => { const s = sstep(0.1, 0.8, k / n); ps[1] = 1 - s; ps[3] = s; return ps; }, c0, c1, RA() * 0.5, 0.5 + RA() * 0.5);
    }
  }
  // ---------- pestañas (párpado superior, 2/3 de afuera) ----------
  brillo = 0;
  for (const o of cp.ojos) {
    const eje = new V(...o.eje), A = new V(CAB.A[0], CAB.A[1], 0), c = new V(...o.c);
    const Lg = A.clone().addScaledVector(eje, -A.dot(eje)).normalize();
    const Sg = new V().crossVectors(eje, Lg); if (Sg.y < 0) Sg.negate();
    for (let k = 0; k < 7; k++) {
      const psi = lerp(-0.15, 0.85, k / 6), ph = 0.62;
      const raiz = c.clone().addScaledVector(new V().copy(eje).multiplyScalar(Math.cos(ph) * Math.cos(psi)).addScaledVector(Sg, Math.sin(ph)).addScaledVector(Lg, Math.cos(ph) * Math.sin(psi)).normalize(), o.R + 0.0075);
      const dir = eje.clone().multiplyScalar(0.8).addScaledVector(Sg, -0.15).addScaledVector(Lg, 0.25 * psi).normalize();
      const P = [raiz, raiz.clone().addScaledVector(dir, 0.012), raiz.clone().addScaledVector(dir, 0.022).addScaledVector(Sg, -0.004)];
      const W = P.map(() => Lg), N = P.map(() => Sg);
      const ps = [HB.cabeza, 1, 0, 0, 0, 0, 0, 0];
      tira(P, W, N, 0.0045, 0.6, () => ps, BLACK, BLACK, 0.3, 0.42);
    }
  }
  // ---------- pelos de adentro de las orejas ----------
  const orejaReposo = ears.map((piv) => piv.matrixWorld.clone());
  ears.forEach((piv, e) => {
    const s = piv.userData.s, M = orejaReposo[e], P0 = new V();
    for (let k = 0; k < 9; k++) {
      const v0 = 0.05 + 0.4 * k / 9, th = (RA() - 0.5) * 0.9;
      orejaPunto(piv.userData.m, v0, th, true, P0);
      const P = [P0.clone(), P0.clone().add(new V(0, 0.03 + RA() * 0.02, 0.012)), P0.clone().add(new V(0, 0.05 + RA() * 0.03, 0.02))].map((p) => p.applyMatrix4(M));
      const N = P.map(() => new V(0, 0, 1).transformDirection(M)), W = P.map(() => new V(1, 0, 0).transformDirection(M));
      const ps = [B_OREJA + e, 1, 0, 0, 0, 0, 0, 0];
      tira(P, W, N, 0.012, 0.6, () => ps, lin('#5c4a3c'), lin('#a08a74'), RA() * 0.5, 0.5 + RA() * 0.5);
    }
  });
  // ---------- cola: maslo (piel, mismo material que el cuerpo) y cerda por mechones alrededor ----------
  brillo = 0.45;
  // TQ: nodos de la cola en reposo (marco de la pelvis): 0–5 maslo, 5–9 cerda colgando hasta y ≈ 0,42
  const LQ = [], DQ = [];
  for (let i = 0; i < NQ - 1; i++) { LQ.push(TQ[i].distanceTo(TQ[i + 1])); DQ.push(new V().subVectors(TQ[i + 1], TQ[i]).normalize()); }
  const sQ = [0]; for (let i = 0; i < NQ - 1; i++) sQ.push(sQ[i] + LQ[i]);
  const puntoCola = (s, out) => {   // s: parámetro de nodos (0 … NQ − 1) → punto de la curva en reposo
    const i = Math.max(0, Math.min(NQ - 2, Math.floor(s))), f = s - i;
    return out.copy(TQ[i]).lerp(TQ[i + 1], f);
  };
  const pesosCola = (s, ps) => {   // dos huesos de la cola según s (tienda centrada en cada segmento)
    const x = Math.max(0.5, Math.min(NQ - 1.5, s)), i = Math.floor(x - 0.5), f = x - 0.5 - i;
    ps[0] = B_COLA + i; ps[1] = 1 - f; ps[2] = B_COLA + Math.min(NQ - 2, i + 1); ps[3] = f; ps[4] = 0; ps[5] = 0; ps[6] = 0; ps[7] = 0;
    return ps;
  };
  const radioMaslo = (s) => lerp(0.04, 0.025, s / ND) * cap(s / ND, 0, 0.12);
  {
    const tmpP = new V(), tmpT = new V();
    const nMech = 36;
    for (let m = 0; m < nMech; m++) {
      const [c0, c1] = tono(RA());
      const s0 = 0.3 + RA() * 4.4, phi0 = Math.PI * (-0.8 + 1.6 * RA());   // alrededor del maslo (0 = arriba/atrás, ±π = contra las nalgas)
      const largo = lerp(0.55, 1, Math.pow(RA(), 0.5));                       // los pelos terminan entre y ≈ 0,38 y 0,60
      const nT = 5;
      for (let k = 0; k < nT; k++) {
        const phi = phi0 + (RA() - 0.5) * 0.6, sIni = Math.max(0.2, s0 + (RA() - 0.5) * 0.6);
        const sFin = Math.min(NQ - 1, lerp(sIni + 2, NQ - 1, largo * (0.85 + 0.15 * RA())));
        const n = 12, P = [], N = [], W = [], Ss = [];
        const abre = 0.035 + RA() * 0.06, fase = RA() * TAU;
        for (let i = 0; i <= n; i++) {
          const f = i / n, s = lerp(sIni, sFin, f);
          puntoCola(s, tmpP);
          const seg = Math.max(0, Math.min(NQ - 2, Math.floor(s)));
          tmpT.copy(DQ[seg]);
          const nx = -tmpT.y, ny = tmpT.x;   // normal en el plano de simetría
          // volumen: cerca de la raíz pegado al maslo; abajo se abre y al final se cierra un poco
          const r = radioMaslo(Math.min(s, ND)) * (s < ND ? 1 : 0.8) + abre * sstep(0, 0.45, f) * (1 - 0.35 * sstep(0.6, 1, f));
          const ca = Math.cos(phi), sa = Math.sin(phi);
          const p = tmpP.clone();
          p.x += nx * -ca * r; p.y += ny * -ca * r; p.z += sa * r;
          p.z += Math.sin(f * 5 + fase) * 0.006 * f;
          P.push(p); Ss.push(s);
          N.push(new V(nx * -ca, ny * -ca, sa).normalize());
        }
        for (let i = 0; i <= n; i++) {
          const D = new V().subVectors(P[Math.min(n, i + 1)], P[Math.max(0, i - 1)]).normalize();
          W.push(new V().crossVectors(N[i], D).normalize());
        }
        const ps = [0, 0, 0, 0, 0, 0, 0, 0];
        tira(P, W, N, 0.028 + RA() * 0.03, 0.45, (i) => pesosCola(Ss[i], ps), c0, c1, RA() * 0.4, 0.6 + RA() * 0.4);
      }
    }
  }
  const peloGeo = new THREE.BufferGeometry();
  peloGeo.setAttribute('position', new THREE.Float32BufferAttribute(PEL.pos, 3));
  peloGeo.setAttribute('normal', new THREE.Float32BufferAttribute(PEL.nrm, 3));
  peloGeo.setAttribute('uv', new THREE.Float32BufferAttribute(PEL.uv, 2));
  peloGeo.setAttribute('color', new THREE.Float32BufferAttribute(PEL.col, 3));
  peloGeo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(PEL.si, 4));
  peloGeo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(PEL.sw, 4));
  peloGeo.setIndex(PEL.idx);
  const huesosPelo = bones.slice();
  for (let i = NB; i < NBH; i++) { const b = new THREE.Bone(); b.matrixAutoUpdate = false; rootBone.add(b); huesosPelo.push(b); }
  const esqPelo = new THREE.Skeleton(huesosPelo, huesosPelo.map(() => new THREE.Matrix4()));
  const pelo = new THREE.SkinnedMesh(peloGeo, hairMat);
  pelo.castShadow = true; pelo.receiveShadow = true; pelo.customDepthMaterial = hairDepth; pelo.frustumCulled = false;
  pelo.bind(esqPelo, new THREE.Matrix4());
  horse.add(pelo);
  // maslo: tubo con piel en los huesos de la cola, con el material del cuerpo (mismo programa)
  {
    const nS = 14, nR = 16, pos = [], nrm = [], uv = [], col = [], si = [], sw = [], idx = [];
    const P = new V(), ps = [0, 0, 0, 0, 0, 0, 0, 0], cc = new THREE.Color();
    for (let i = 0; i <= nS; i++) {
      const s = ND * i / nS, seg = Math.min(NQ - 2, Math.floor(s)), D = DQ[seg], nx = -D.y, ny = D.x;
      puntoCola(s, P);
      const r = radioMaslo(s) * (i === 0 ? 0.85 : 1);
      pesosCola(s, ps);
      cc.copy(COAT).lerp(BLACK, sstep(0.0, 0.25, i / nS));
      for (let j = 0; j <= nR; j++) {
        const a = j / nR * TAU, ca = Math.cos(a), sa = Math.sin(a);
        pos.push(P.x + nx * ca * r, P.y + ny * ca * r, P.z + sa * r * 0.92);
        nrm.push(nx * ca, ny * ca, sa);
        uv.push(j / nR * 0.5, s * 0.4);
        col.push(cc.r, cc.g, cc.b);
        si.push(ps[0], ps[2], 0, 0); sw.push(ps[1], ps[3], 0, 0);
        if (i < nS && j < nR) { const a0 = i * (nR + 1) + j; idx.push(a0, a0 + nR + 1, a0 + 1, a0 + 1, a0 + nR + 1, a0 + nR + 2); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    g.setIndex(idx);
    const maslo = shadowed(new THREE.SkinnedMesh(g, bodyMat));
    maslo.frustumCulled = false;
    maslo.bind(esqPelo, new THREE.Matrix4());
    horse.add(maslo);
  }
  // marcos de reposo de los segmentos de la cola
  const colaRestInv = [];
  for (let i = 0; i < NQ - 1; i++) colaRestInv.push(marco(TQ[i], TQ[i + 1], EJE_Z, new THREE.Matrix4()).invert());
  mc('crin');

  // =====================================================================================================
  // POSE
  // =====================================================================================================
  const estado = { crinAmp: 0.008, crinFreq: 0.8, tiempo: 0 };
  const _P = new V(), _RP = new V();
  function aplicarTronco(pose) {
    const cu = pose.cuerpo || {}, ne = pose.cuello || {}, ca = pose.cabeza || {};
    // cabeceo alrededor de cuerpo.pivote (por defecto el suelo bajo el origen) y rolido alrededor del suelo
    const piv = cu.pivote, px = piv ? piv[0] : 0, py = piv ? piv[1] : 0, cab = cu.cabeceo || 0, rol = -(cu.rolido || 0);
    body.rotation.set(rol, 0, cab);
    const cz = Math.cos(cab), sz = Math.sin(cab);
    _RP.set(px - (px * cz - py * sz), py - (px * sz + py * cz), 0).applyAxisAngle(_P.set(1, 0, 0), rol);
    body.position.set((cu.x || 0) + _RP.x, (cu.y || 0) + _RP.y, _RP.z);
    cruzG.rotation.set(0, 0.45 * (cu.curva || 0), 0);
    grupaG.rotation.set(0, -0.55 * (cu.curva || 0), 0);
    lsG.rotation.set(0, 0, cu.lumbosacro || 0);
    for (let i = 0; i < 4; i++) segCuello[i].rotation.set(0, LAT_CUELLO[i] * (ne.lateral || 0), FLEX_CUELLO[i] * (ne.flexion || 0));
    headGroup.rotation.set(0, ca.lateral || 0, ca.flexion || 0);
    // solo la cadena del esqueleto (lo que cuelga de ella se actualiza al dibujar)
    horse.updateMatrix(); horse.updateWorldMatrix(false, false);
    for (const g of [body, cruzG, cruzIn, grupaG, grupaIn, lsG, lsIn, neckPivot, neckRoot, n1G, n1In, n2G, n2In, n3G, n3In, headGroup, headInner]) { g.updateMatrix(); g.matrixWorld.multiplyMatrices(g.parent.matrixWorld, g.matrix); }
    for (let b = 0; b < 8; b++) bones[b].matrix.copy(fuenteHueso[b].matrixWorld);
  }
  function actualizarOrejas(pose, time) {
    const o = pose.orejas;
    ears.forEach((piv, i) => {
      const s = piv.userData.s;
      let giro;
      if (o && (s > 0 ? o.der : o.izq) !== undefined) giro = s > 0 ? o.der : o.izq;
      else giro = 0.15 + Math.pow(Math.max(0, Math.sin(time * 0.7 + i * 2.3)), 12) * 0.5;
      piv.rotation.set(-0.12 - 0.25 * Math.min(1, giro / 2.5), -s * giro * 0.9, 0);
      piv.updateMatrix();
      piv.parent.matrixWorld.multiplyMatrices(headInner.matrixWorld, piv.parent.matrix);
      piv.matrixWorld.multiplyMatrices(piv.parent.matrixWorld, piv.matrix);
      huesosPelo[B_OREJA + i].matrix.multiplyMatrices(piv.matrixWorld, mTmp.copy(orejaReposo[i]).invert());
    });
  }
  // crin y copete: huesos que flamean alrededor de la cresta (la amplitud y el viento vienen de crin.agitacion)
  const _mA = new THREE.Matrix4(), _mR = new THREE.Matrix4(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
  function mezclaMat(A, B, w, out) { const a = A.elements, b = B.elements, o = out.elements; for (let i = 0; i < 16; i++) o[i] = a[i] + (b[i] - a[i]) * w; return out; }
  function rotarAlrededor(C, q, out) {   // matriz de rotación q alrededor del punto C
    out.makeRotationFromQuaternion(q);
    const e = out.elements; _P.copy(C).applyQuaternion(q);
    e[12] = C.x - _P.x; e[13] = C.y - _P.y; e[14] = C.z - _P.z;
    return out;
  }
  function actualizarCrin(time, pose) {
    const amp = estado.crinAmp, fr = Math.max(0.7, estado.crinFreq), viento = pose.crin && pose.crin.viento !== undefined ? pose.crin.viento : amp * 140;
    const alza = Math.min(0.5, viento * 0.06);
    for (let g = 0; g < NM; g++) {
      const C = C_CRIN[g], [a, b, w] = C.huesos;
      mezclaMat(bones[a].matrix, bones[b].matrix, w, _mA);
      const fl = Math.sin(time * 2.4 * fr - g * 0.55) * amp * 9 + Math.sin(time * 5.3 * fr + g * 1.7) * amp * 3;
      _q1.setFromAxisAngle(C.eje, -(alza + fl));
      _q2.setFromAxisAngle(C.perp, Math.sin(time * 1.7 * fr + g * 0.9) * amp * 4 - alza * 0.4);
      _q1.multiply(_q2);
      huesosPelo[B_CRIN + g].matrix.multiplyMatrices(_mA, rotarAlrededor(C.base, _q1, _mR));
    }
    _q1.setFromAxisAngle(EJE_Z, Math.sin(time * 1.9 * fr) * amp * 4 - alza * 0.3);
    huesosPelo[B_COPETE].matrix.multiplyMatrices(bones[HB.cabeza].matrix, rotarAlrededor(COPETE_RAIZ, _q1, _mR));
  }
  // ---------- cola: el maslo sigue a la pelvis (alzada y balanceo); la cerda es una cadena con inercia ----------
  const ANG_REPOSO = [], ANG_ALZADA = [145, 152, 162, 174, 186].map((g) => g * Math.PI / 180);
  for (let i = 0; i < ND; i++) ANG_REPOSO.push(Math.atan2(DQ[i].y, DQ[i].x) + (DQ[i].y < 0 && DQ[i].x < 0 ? TAU : 0));
  const cola = { P: TQ.map((p) => p.clone()), Pp: TQ.map((p) => p.clone()), t: null, R: TQ.map((p) => p.clone()) };
  const _mL = new THREE.Matrix4(), _g = new V(), _d0 = new V(), _d1 = new V(), _vel = new V(), _nz = new V(), _qd = new THREE.Quaternion();
  // posición del maslo (nodos 0 … ND) en el marco de reposo de la pelvis
  function masloReposo(alz, sw, time, out) {
    out[0].copy(TQ[0]);
    const a = Math.max(-0.2, Math.min(1.3, alz));
    for (let i = 0; i < ND; i++) {
      const ang = lerp(ANG_REPOSO[i], ANG_ALZADA[i], a);
      out[i + 1].set(out[i].x + Math.cos(ang) * LQ[i], out[i].y + Math.sin(ang) * LQ[i], 0);
      out[i + 1].z = Math.sin(time * 1.9 - i * 0.7) * 0.012 * sw * (i + 1) * 0.5;
    }
  }
  function pasoCola(h, viento, lateral, time) {
    const g = 9.81, kd = 3.2;
    for (let i = ND + 1; i < NQ; i++) {
      const P = cola.P[i], Pp = cola.Pp[i];
      _vel.subVectors(P, Pp).divideScalar(h);
      const turb = Math.sin(time * 7.1 + i * 1.3) * 0.25 + Math.sin(time * 12.7 + i * 2.1) * 0.12;
      const ax = kd * (-viento - _vel.x), ay = -g + kd * (viento * 0.12 * turb - _vel.y), az = kd * (viento * 0.25 * turb - _vel.z) + lateral;
      Pp.copy(P);
      P.x += _vel.x * h * 0.995 + ax * h * h; P.y += _vel.y * h * 0.995 + ay * h * h; P.z += _vel.z * h * 0.995 + az * h * h;
    }
    // forma: cada nodo tiende a seguir la dirección de reposo respecto del final del maslo; largo fijo
    _d0.subVectors(cola.P[ND], cola.P[ND - 1]).normalize();
    _qd.setFromUnitVectors(DQ[ND - 1], _d0);
    for (let it = 0; it < 2; it++) for (let i = ND + 1; i < NQ; i++) {
      const A = cola.P[i - 1], P = cola.P[i];
      _d1.copy(DQ[i - 1]).applyQuaternion(_qd);
      _g.copy(A).addScaledVector(_d1, LQ[i - 1]);
      P.lerp(_g, 0.035);
      _d1.subVectors(P, A); const l = _d1.length() || 1;
      P.copy(A).addScaledVector(_d1, LQ[i - 1] / l);
    }
    // la cerda no entra en las nalgas ni en los garrones
    for (let i = ND + 1; i < NQ; i++) { const P = cola.P[i]; if (P.x > -0.72 && P.y > 0.55) P.x = -0.72 + (P.x + 0.72) * 0.3; }
  }
  function actualizarCola(time, pose) {
    const co = pose.cola || {};
    const alz = co.alzada || 0, sw = co.balanceo !== undefined ? co.balanceo : 0.6;
    const viento = co.viento !== undefined ? co.viento : 0.4 + 6 * Math.max(0, alz);
    const lateral = co.giro !== undefined ? co.giro * 6 : 40 * ((pose.cuerpo && pose.cuerpo.curva) || 0);
    masloReposo(alz, sw, time, cola.R);
    const M = lsIn.matrixWorld;
    for (let i = 0; i <= ND; i++) cola.P[i].copy(cola.R[i]).applyMatrix4(M);
    let dt = cola.t === null ? -1 : time - cola.t;
    cola.t = time;
    if (dt < 0 || dt > 0.25) {
      // reinicio (primer cuadro o salto del reloj): la cerda en reposo detrás del maslo y se deja asentar
      for (let i = ND + 1; i < NQ; i++) { cola.P[i].copy(TQ[i]).applyMatrix4(M); cola.Pp[i].copy(cola.P[i]); }
      for (let k = 0; k < 90; k++) pasoCola(1 / 60, viento, lateral, time - (90 - k) / 60);
    } else if (dt > 0) {
      const n = Math.ceil(dt / (1 / 90)), h = dt / n;
      for (let k = 0; k < n; k++) pasoCola(h, viento, lateral, time - dt + (k + 1) * h);
    }
    // huesos: marco de cada segmento (normal = z de la pelvis) por el inverso del de reposo
    _nz.set(0, 0, 1).transformDirection(M);
    for (let i = 0; i < NQ - 1; i++) huesosPelo[B_COLA + i].matrix.multiplyMatrices(marco(cola.P[i], cola.P[i + 1], _nz, _mL), colaRestInv[i]);
  }

  const _firma = new Float64Array(28);
  function firmaPata(L, H, op) {
    const f = _firma, e = L.parent.matrixWorld.elements;
    for (let i = 0; i < 16; i++) f[i] = e[i];
    f[16] = H.x; f[17] = H.y; f[18] = H.z; f[19] = op.apoyado ? 1 : 0; f[20] = op.inclinacion || 0; f[21] = op.menudillo || 0;
    f[22] = op.carpo || 0; f[23] = op.flexCasco || 0; f[24] = op.mezclaCasco !== undefined ? op.mezclaCasco : -1; f[25] = op.rumbo || 0; f[26] = op.compensa !== undefined ? op.compensa : 1;
    let igual = true; for (let i = 0; i < 27; i++) if (f[i] !== L.firma[i]) { igual = false; break; }
    if (!igual) L.firma.set(f);
    return igual;
  }
  const OP_REPOSO = { apoyado: true };
  function aplicarPose(pose = {}) {
    const time = pose.tiempo !== undefined ? pose.tiempo : estado.tiempo;
    estado.tiempo = time;
    if (pose.crin) { if (pose.crin.agitacion !== undefined) estado.crinAmp = pose.crin.agitacion; if (pose.crin.frecuencia !== undefined) estado.crinFreq = pose.crin.frecuencia; }
    aplicarTronco(pose);
    tIK = time;
    const pt = pose.patas || {};
    for (let i = 0; i < 4; i++) {
      const L = legs[i], q = pt[L.id], H = q && q.casco ? q.casco : L.J.H, op = q || OP_REPOSO;
      if (!firmaPata(L, H, op)) resolverPata(L, H, op);   // si nada cambió, la pata queda como estaba
    }
    actualizarCola(time, pose);
    actualizarOrejas(pose, time);
    actualizarCrin(time, pose);
    rootBone.updateMatrixWorld(true);
  }

  // pose de reposo
  mc('cola'); aplicarPose({}); mc('pose');

  // API de patas para la locomoción
  const patas = legs.map((L) => ({
    id: L.id, delantera: L.front, lado: L.s, [L.front ? 'hombro' : 'cadera']: L.T.clone(), alcanceMax: L.alcanceMax,
    cascoReposo: L.J.H.clone(), pinza: L.pinza.clone(), HOOF_H
  }));

  // estiramiento de la malla en la pose actual (para pruebas): razón entre el largo de cada arista y el de reposo
  function medirEstiramiento() {
    const p = net.pos, idx = net.idx, q = new Float32Array(p.length), v = new V(), acc = new V();
    for (let i = 0; i < NV; i++) {
      acc.set(0, 0, 0);
      for (let k = 0; k < 4; k++) { const w = skinWeight[i * 4 + k]; if (!w) continue; v.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]).applyMatrix4(bones[skinIndex[i * 4 + k]].matrix); acc.addScaledVector(v, w); }
      q[i * 3] = acc.x; q[i * 3 + 1] = acc.y; q[i * 3 + 2] = acc.z;
    }
    let max = 0, min = 1e9, mas15 = 0, mas2 = 0, n = 0, peor = null; const zonas = {};
    for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) {
      const a = idx[t + e], b = idx[t + (e + 1) % 3];
      const l0 = Math.hypot(p[a * 3] - p[b * 3], p[a * 3 + 1] - p[b * 3 + 1], p[a * 3 + 2] - p[b * 3 + 2]);
      const l1 = Math.hypot(q[a * 3] - q[b * 3], q[a * 3 + 1] - q[b * 3 + 1], q[a * 3 + 2] - q[b * 3 + 2]);
      if (l0 < H_MALLA * 0.4) continue;   // las aristas diminutas de Surface Nets no dicen nada
      const r = l1 / l0; n++;
      if (r > max) { max = r; peor = [p[a * 3], p[a * 3 + 1], p[a * 3 + 2]].map((x) => +x.toFixed(3)); }
      min = Math.min(min, r); if (r > 1.5) mas15++; if (r > 2) { mas2++; const key = Math.round(p[a * 3] * 10) + ',' + Math.round(p[a * 3 + 1] * 10) + ',' + Math.sign(p[a * 3 + 2]); zonas[key] = (zonas[key] || 0) + 1; }
    }
    return { max: +max.toFixed(2), min: +min.toFixed(2), mas15, mas2, aristas: n, peor, zonas: Object.entries(zonas).sort((a, b) => b[1] - a[1]).slice(0, 8) };
  }

  const api = {
    horse, body, neckPivot, neckRoot, headGroup, headInner, legs, HOOF_H, NV,
    TOP, BOT, SIDE, TORSO_BUMPS, neckSurf, headSurf, superficieTorso, darkMat,
    aplicarPose, patas, cascoConPinza, medirEstiramiento,
    anatomia: { ARTIC, MARCAS }, tiemposCuerpo, horneado: !!horneado, _campo: cp,
    cuerpo: { pos: net.pos, idx: net.idx, skinIndex, skinWeight, col: bodyGeo.attributes.color.array }
  };
  if (typeof location !== 'undefined' && (location.hostname === 'localhost' || location.hostname === '127.0.0.1')) window.__caballo = api;
  return api;
}
