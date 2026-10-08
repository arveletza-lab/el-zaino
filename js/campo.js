// El campo sin fin en 2D: cielo, cuchillas, pradera, caminos, alambrados con tranqueras, ranchos,
// montes de eucaliptos, ombúes y majadas de ovejas.
// El caballo queda en el origen de la escena; lo que se mueve es el MUNDO (docs/rediseno-v2.md):
// mundo.rotation.y = −rumbo y cada cosa del suelo se dibuja en envolver(posSuelo − (x, z)).
// El campo es una BALDOSA de T × T metros que se repite en x y en z. Se divide en parcelas de C × C m;
// cada parcela es un grupo con InstancedMesh por capa (postes, varillas, hilos, matas, árboles, ovejas)
// y se recoloca entera alrededor del caballo, así el recorte por cámara funciona por parcela.
//
// API (coordenadas del SUELO, las mismas de loco.pose; todo envuelve con la baldosa):
//   const campo = construirCampo({ scene, renderer, darkMat })
//   campo.actualizar(pose, dt, t)        pose = { x, z, rumbo, velocidad }: mueve y rota el mundo; dt (s) anima
//                                        las ovejas que se apartan (dt = 0: nada se mueve); t (s): reloj del pastoreo
//   campo.bloqueado(x0, z0, x1, z1)      → true si el segmento cruza o toca un sólido
//   campo.solidoEn(x, z, radio = 0)      → true si el círculo toca un sólido, aunque el sólido quede entero adentro
//                                        (p. ej. una hoja de tranquera dentro del contorno del caballo)
//   campo.alambrados                     [{ x0, z0, x1, z1, tranqueras: [{ x, z, t, ancho, hoja: { x0, z0, x1, z1 } }] }]
//   window.__debug.campo                 la misma API, solo en localhost (pruebas de qa-out/)
// Sólidos: alambrados (segmentos de 9 cm de grosor, cortados en las tranqueras), postes de tranquera y de esquina,
// hojas abiertas, rancho y puesto (casa hasta el alero y ramada: cajas giradas; palenque: segmento con grosor),
// troncos de eucaliptos y ombúes (círculos) y ovejas (círculos que se mueven: se apartan del caballo).
// Nada sólido en los caminos (|z| < 1,7 y |x − 250| < 1,5) ni en el arranque (0, 0). Las consultas usan una grilla
// de 10 m sobre la baldosa (solo prueban los sólidos de las celdas que tocan) y no crean objetos.
import { V, lin, lerp, sstep, frac, TAU, rnd, crearRuidoValor } from './util.js';
import { shadowed } from './escena.js';

const T = 800;                 // lado de la baldosa (m)
const C = 80, NC = T / C;      // parcelas
const envolver = (v) => v - T * Math.round(v / T);
// red de alambrados (coordenadas de la baldosa): líneas de x constante y de z constante
const CAMINO_B = 250;                                   // segundo camino, a lo largo de z
const XV = [-400, -205, -40, 100, CAMINO_B - 5.5, CAMINO_B + 5.5];
const ZH = [-400, -200, -5.5, 9.5, 200];
const TRAMOS_X = [[-400, -205], [-205, -40], [-40, 100], [100, CAMINO_B - 5.5], [CAMINO_B + 5.5, 400]];
const TRAMOS_Z = [[-400, -200], [-200, -5.5], [9.5, 200], [200, 400]];
const ANCHO_TRANQUERA = 3.8;

export function construirCampo({ scene, renderer, darkMat }) {
  const FOG = '#c6d3d6', FOG_D = 0.005;
  const FOG_COL = new THREE.Color(FOG);
  // la niebla se mezcla después de la codificación sRGB: el color de la niebla es el que se ve en pantalla
  scene.fog = new THREE.FogExp2(FOG_COL, FOG_D);
  renderer.setClearColor(FOG_COL, 1);
  const { fbm } = crearRuidoValor();
  const canvasTex = (w, h, draw, srgb = true) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); if (srgb) t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  };
  const r = (a, b) => a + (b - a) * rnd();

  // lejos: cielo y cuchillas, solo giran con el rumbo; mundo: todo lo del suelo
  const lejos = new THREE.Group(), mundo = new THREE.Group();
  scene.add(lejos, mundo);

  // ---------- cielo con cúmulos; el borde de abajo es exactamente el color de la niebla ----------
  {
    const tex = canvasTex(2048, 512, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#2b66ad'); gr.addColorStop(0.45, '#4f8bcb'); gr.addColorStop(0.76, '#97bbdc'); gr.addColorStop(0.9, FOG); gr.addColorStop(1, FOG);
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 46; i++) {
        const cx = rnd() * w, cy = h * (0.5 + rnd() * 0.36), s = (30 + rnd() * 60) * (1.25 - cy / h);
        for (let k = 0; k < 14; k++) {
          const x = cx + (rnd() - 0.5) * s * 3.2, y = cy + (rnd() - 0.6) * s * 0.7, rr = s * (0.4 + rnd() * 0.6) * (1 - (cy / h) * 0.5);
          const rg = g.createRadialGradient(x, y, 0, x, y, rr);
          rg.addColorStop(0, 'rgba(255,255,255,0.55)'); rg.addColorStop(0.6, 'rgba(250,251,253,0.25)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = rg; g.beginPath(); g.ellipse(x, y, rr * 1.6, rr * 0.8, 0, 0, TAU); g.fill();
        }
      }
    });
    tex.wrapT = THREE.ClampToEdgeWrapping;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24, 0, TAU, 0, Math.PI * 0.53), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }));
    dome.renderOrder = -2;
    lejos.add(dome);
  }

  // ---------- cuchillas lejanas ----------
  // Colores calculados en sRGB y pasados a lineal (el material los vuelve a codificar): donde la loma sale
  // del suelo tiene la misma niebla que la pradera a esa distancia (sin franja clara); más arriba se ve
  // con la perspectiva aérea de las lomas lejanas.
  {
    const segA = 160, segR = 26, R0 = 330, R1 = 900, pos = [], col = [], idx = [];
    const fogS = new THREE.Color(FOG), verde = new THREE.Color('#5b7a3f'), seco = new THREE.Color('#82905a'), c = new THREE.Color();
    for (let j = 0; j <= segR; j++) {
      const rad = R0 + Math.pow(j / segR, 1.3) * (R1 - R0);
      for (let i = 0; i <= segA; i++) {
        const a = (i / segA) * TAU, x = Math.cos(a) * rad, z = Math.sin(a) * rad;
        // lomas suaves en las dos direcciones (no mesetas a lo largo del radio)
        const hgt = (fbm(x * 0.0045 + 40, z * 0.0045 + 40) - 0.3) * 115 * sstep(430, 660, rad) - 3;
        const y = Math.max(-3, hgt), alto = Math.max(0, y);
        pos.push(x, y, z);
        const fSuelo = 1 - Math.exp(-Math.pow(rad * FOG_D, 2));
        const fAire = lerp(0.6, 0.84, sstep(450, 900, rad));
        const f = lerp(fSuelo, fAire, Math.sqrt(sstep(0, 50, alto)));
        c.copy(verde).lerp(seco, 0.5 * fbm(a * 9, rad * 0.02)).lerp(fogS, f).convertSRGBToLinear();
        col.push(c.r, c.g, c.b);
        if (i < segA && j < segR) { const q = j * (segA + 1) + i; idx.push(q, q + segA + 1, q + 1, q + 1, q + segA + 1, q + segA + 2); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    lejos.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, toneMapped: false })));
  }

  // ---------- pradera (textura con desplazamiento 2D) ----------
  const grassTex = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#5e7f35'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      const x = rnd() * w, y = rnd() * h, rr = 20 + rnd() * 60, v = rnd();
      g.fillStyle = v < 0.5 ? `rgba(70,100,35,${0.15 + rnd() * 0.2})` : v < 0.85 ? `rgba(120,140,55,${0.12 + rnd() * 0.15})` : `rgba(150,135,70,${0.1 + rnd() * 0.12})`;
      g.beginPath(); g.ellipse(x, y, rr, rr * (0.5 + rnd() * 0.5), rnd() * 3, 0, TAU); g.fill();
    }
    for (let i = 0; i < 26000; i++) {
      const x = rnd() * w, y = rnd() * h, l = 3 + rnd() * 7, v = rnd();
      g.strokeStyle = v < 0.45 ? `rgba(48,78,25,0.6)` : v < 0.85 ? `rgba(118,150,58,0.55)` : `rgba(176,170,96,0.5)`;
      g.lineWidth = 0.8 + rnd() * 0.8;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 3, y - l); g.stroke();
    }
    for (let i = 0; i < 90; i++) { // margaritas y macachines
      g.fillStyle = rnd() < 0.6 ? 'rgba(245,240,215,0.9)' : 'rgba(225,180,210,0.85)';
      g.beginPath(); g.arc(rnd() * w, rnd() * h, 1.4 + rnd(), 0, TAU); g.fill();
    }
  });
  const GRASS_TILE = 5, SUELO = 1100;
  grassTex.repeat.set(SUELO / GRASS_TILE, SUELO / GRASS_TILE);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(SUELO, SUELO), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 0.95, envMapIntensity: 0.4 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  mundo.add(ground);

  // ---------- caminos de tierra: A a lo largo de x en z = 0, B a lo largo de z en x = 250 ----------
  const dirtTex = canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = '#8a6a48'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) {
      const v = rnd(); g.fillStyle = v < 0.5 ? `rgba(95,70,45,${0.25 + rnd() * 0.3})` : `rgba(170,140,105,${0.2 + rnd() * 0.3})`;
      g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 1 + rnd() * 2);
    }
    // dos huellas de rueda y un lomo de pasto en el medio
    const band = (y0, y1, col) => { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, y0, w, y1 - y0); };
    band(h * 0.18, h * 0.42, 'rgba(160,130,95,0.55)'); band(h * 0.58, h * 0.82, 'rgba(160,130,95,0.55)');
    band(h * 0.42, h * 0.58, 'rgba(95,120,50,0.55)');
    band(-h * 0.1, h * 0.14, 'rgba(90,120,45,0.8)'); band(h * 0.86, h * 1.1, 'rgba(90,120,45,0.8)');
    for (let i = 0; i < 2500; i++) {
      const y = rnd() < 0.5 ? (rnd() < 0.5 ? rnd() * h * 0.16 : h - rnd() * h * 0.16) : h * (0.45 + rnd() * 0.1);
      g.strokeStyle = rnd() < 0.5 ? 'rgba(60,90,30,0.7)' : 'rgba(120,150,60,0.6)'; g.lineWidth = 1;
      const x = rnd() * w; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 2, y - 3 - rnd() * 5); g.stroke();
    }
  });
  const DIRT_TILE = 6, LARGO_CAMINO = 1000;
  const dirtA = dirtTex, dirtB = dirtTex.clone(), yardTex = dirtTex.clone();
  dirtB.needsUpdate = true; yardTex.needsUpdate = true;
  dirtA.repeat.set(LARGO_CAMINO / DIRT_TILE, 1); dirtB.repeat.set(LARGO_CAMINO / DIRT_TILE, 1); yardTex.repeat.set(3, 3);
  const caminoMat = (map, k) => new THREE.MeshStandardMaterial({ map, roughness: 1, envMapIntensity: 0.3, polygonOffset: true, polygonOffsetFactor: -k, polygonOffsetUnits: -k });
  const caminoA = new THREE.Mesh(new THREE.PlaneGeometry(LARGO_CAMINO, 3.4).rotateX(-Math.PI / 2), caminoMat(dirtA, 2));
  const caminoB = new THREE.Mesh(new THREE.PlaneGeometry(LARGO_CAMINO, 3.0).rotateX(-Math.PI / 2).rotateY(Math.PI / 2), caminoMat(dirtB, 4));
  caminoA.position.y = 0.002; caminoB.position.y = 0.003;
  caminoA.receiveShadow = caminoB.receiveShadow = true;
  mundo.add(caminoA, caminoB);

  // ---------- más texturas ----------
  const tuftTex = canvasTex(128, 128, (g, w, h) => {
    for (let i = 0; i < 40; i++) {
      const x0 = w * (0.2 + rnd() * 0.6), lean = (rnd() - 0.5) * w * 0.5, top = h * (0.05 + rnd() * 0.45);
      g.strokeStyle = rnd() < 0.75 ? `rgb(${50 + rnd() * 30 | 0},${80 + rnd() * 35 | 0},${28 + rnd() * 15 | 0})` : `rgb(${150 + rnd() * 30 | 0},${145 + rnd() * 30 | 0},80)`;
      g.lineWidth = 1.5 + rnd() * 1.5;
      g.beginPath(); g.moveTo(x0, h); g.quadraticCurveTo(x0 + lean * 0.3, h * 0.5, x0 + lean, top); g.stroke();
    }
  });
  tuftTex.wrapS = tuftTex.wrapT = THREE.ClampToEdgeWrapping;
  const woodTex = canvasTex(64, 256, (g, w, h) => {
    g.fillStyle = '#6e5a44'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) { g.strokeStyle = rnd() < 0.5 ? 'rgba(40,30,20,0.45)' : 'rgba(150,130,105,0.4)'; g.lineWidth = 0.5 + rnd() * 1.5; const x = rnd() * w; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + (rnd() - 0.5) * 6, h); g.stroke(); }
  });
  // follaje: hojitas grises (el color lo pone el material)
  const leafTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#8a8a8a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const v = 70 + rnd() * 170 | 0; g.fillStyle = `rgba(${v},${v},${v},0.85)`;
      g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 2 + rnd() * 4, 1 + rnd() * 1.5, rnd() * TAU, 0, TAU); g.fill();
    }
    for (let i = 0; i < 300; i++) { g.fillStyle = 'rgba(25,25,25,0.5)'; g.beginPath(); g.arc(rnd() * w, rnd() * h, 1 + rnd() * 3, 0, TAU); g.fill(); }
  });
  // vellón: rulos claros y oscuros
  const lanaTex = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const v = rnd() < 0.5 ? 150 + rnd() * 50 | 0 : 230 + rnd() * 25 | 0; g.strokeStyle = `rgba(${v},${v},${v},0.8)`; g.lineWidth = 1 + rnd();
      const x = rnd() * w, y = rnd() * h, rr = 1.5 + rnd() * 3; g.beginPath(); g.arc(x, y, rr, rnd() * TAU, rnd() * TAU + 3.5); g.stroke();
    }
  });
  const blancoTex = canvasTex(4, 4, (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); });

  // ---------- materiales: todo lo instanciado usa la misma familia (MeshStandardMaterial con map) ----------
  const stdMap = (map, color, extra = {}) => new THREE.MeshStandardMaterial({ map, color: lin(color), roughness: 0.9, ...extra });
  const woodMat = stdMap(woodTex, '#ffffff');
  const gateMat = stdMap(woodTex, '#d9cbb3');
  const wireMat = stdMap(blancoTex, '#8d9396', { metalness: 0.8, roughness: 0.35 });
  const barkMat = stdMap(woodTex, '#b3aa9b');
  const ombuBark = stdMap(woodTex, '#b9ae9d', { roughness: 0.95 });
  const leafMat = stdMap(leafTex, '#7d9273', { envMapIntensity: 0.4 });
  const leafMat2 = stdMap(leafTex, '#4c6a35', { envMapIntensity: 0.4 });
  const fleeceMat = stdMap(lanaTex, '#e2d9c6', { roughness: 1, envMapIntensity: 0.3 });
  const sheepFace = stdMap(blancoTex, '#e9e4dc', { roughness: 0.8 });
  const sheepDark = stdMap(blancoTex, '#3a3330', { roughness: 0.8 });
  const tuftMat = new THREE.MeshLambertMaterial({ map: tuftTex, alphaTest: 0.4, side: THREE.DoubleSide });

  // ---------- geometrías ----------
  const M4 = () => new THREE.Matrix4();
  const trs = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => M4().compose(new V(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new V(sx, sy, sz));
  const con = (g, m) => g.clone().applyMatrix4(m);
  // une geometrías (posición, normal, uv) en una sola indexada
  function unir(lista) {
    const pos = [], nor = [], uv = [], idx = []; let base = 0;
    for (const g of lista) {
      const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
      for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0); }
      if (g.index) for (const k of g.index.array) idx.push(k + base); else for (let i = 0; i < p.count; i++) idx.push(i + base);
      base += p.count;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }
  // bola deformada, soldada (normales suaves) y con uv planas sin costura
  function bola(det, deform, kuv = 1) {
    const src = new THREE.IcosahedronGeometry(1, det), p = src.attributes.position;
    const mapa = new Map(), pos = [], idx = [];
    for (let i = 0; i < p.count; i++) {
      const key = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
      let k = mapa.get(key);
      if (k === undefined) { k = pos.length / 3; mapa.set(key, k); const x = p.getX(i), y = p.getY(i), z = p.getZ(i), s = deform(x, y, z); pos.push(x * s, y * s, z * s); }
      idx.push(k);
    }
    const uv = []; for (let i = 0; i < pos.length; i += 3) uv.push((pos[i] + pos[i + 2] * 0.7) * kuv, pos[i + 1] * kuv);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  const deformaCopa = (x, y, z) => 1 + 0.13 * Math.sin(x * 5 + z * 4) * Math.cos(y * 4) + 0.05 * Math.sin(x * 11 + y * 9);
  // copas en tres niveles de detalle (cerca, medio, lejos) con las mismas matrices
  const copaGeo3 = bola(3, deformaCopa, 1.5), copaGeo = bola(2, deformaCopa, 1.5), copaGeo1 = bola(1, deformaCopa, 1.5), copaGeo0 = bola(0, deformaCopa, 1.5);
  const lanaGeo = bola(2, (x, y, z) => 1 + 0.07 * Math.sin(x * 11 + y * 7) * Math.cos(z * 9 - y * 5) + 0.05 * Math.sin(x * 23 + z * 19), 1.2);
  const lanaChica = bola(1, (x, y, z) => 1 + 0.06 * Math.sin(x * 11 + y * 7), 0.8);

  const postGeo = new THREE.CylinderGeometry(0.075, 0.085, 1.45, 8).translate(0, 0.72, 0);
  const varGeo = new THREE.BoxGeometry(0.045, 1.22, 0.03).translate(0, 0.61, 0);
  const hiloGeo = new THREE.BoxGeometry(1, 0.012, 0.012).translate(0.5, 0, 0);
  const tuftGeo = (() => { const a = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0); return unir([a, a.clone().rotateY(Math.PI / 2)]); })();
  // hoja de la tranquera: bisagra en el origen, se extiende a lo largo de +x (5 tablas, dos montantes y la diagonal)
  const HOJA = ANCHO_TRANQUERA - 0.3;
  const hojaGeo = (() => {
    const p = [];
    [0.32, 0.56, 0.8, 1.04, 1.28].forEach((y) => p.push(con(new THREE.BoxGeometry(HOJA, 0.11, 0.045), trs(HOJA / 2, y, 0))));
    p.push(con(new THREE.BoxGeometry(0.11, 1.12, 0.07), trs(0.07, 0.8, 0)), con(new THREE.BoxGeometry(0.1, 1.12, 0.07), trs(HOJA - 0.06, 0.8, 0)));
    const dx = HOJA - 0.24, dy = 0.96, L = Math.hypot(dx, dy);
    p.push(con(new THREE.BoxGeometry(L, 0.1, 0.04), trs(0.12 + dx / 2, 0.32 + dy / 2, 0.045, 0, 0, Math.atan2(dy, dx))));
    return unir(p);
  })();
  const troncoGeo = new THREE.CylinderGeometry(0.35, 1, 1, 7).translate(0, 0.5, 0);
  // tronco del ombú: grueso, con contrafuertes en la base y acanalado
  const ombuTroncoGeo = (() => {
    const g = new THREE.LatheGeometry([[0.01, -0.1], [2.1, -0.1], [1.85, 0.2], [1.45, 0.6], [1.2, 1.3], [1.1, 2.2], [1.2, 2.9], [1.45, 3.4], [0.7, 3.9], [0.01, 4.0]].map(([x, y]) => new THREE.Vector2(x, y)), 20, 0, TAU);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), th = Math.atan2(z, x);
      const k = 1 + (0.22 * Math.max(0, Math.sin(5 * th + 0.7)) ** 2) * (1 - sstep(0, 2.2, y)) + 0.07 * Math.sin(9 * th + y * 2.3) + 0.05 * Math.sin(3 * th - y * 1.7);
      p.setXYZ(i, x * k, y, z * k);
    }
    g.computeVertexNormals(); return g;
  })();
  // oveja (marco de la oveja: mira a +x); la cabeza se arma en el marco del cuello (pivote en 0,45; 0,78; 0)
  const CUELLO = new V(0.45, 0.78, 0);
  const ovejaCuerpo = unir([con(lanaGeo, trs(0, 0.66, 0, 0, 0, 0, 0.58, 0.36, 0.34)), con(lanaGeo, trs(-0.32, 0.68, 0, 0, 0, 0, 0.3, 0.33, 0.33))]);
  // patas en dos pares diagonales (al trotar se mueven en oposición, con un corte que deja la cadera fija)
  const CADERA = 0.44;
  const pataOveja = new THREE.CylinderGeometry(0.035, 0.03, 0.42, 6).translate(0, -0.21, 0);
  const ovejaPatasA = unir([[0.32, 0.12], [-0.34, -0.12]].map(([x, z]) => con(pataOveja, trs(x, CADERA, z))));
  const ovejaPatasB = unir([[0.32, -0.12], [-0.34, 0.12]].map(([x, z]) => con(pataOveja, trs(x, CADERA, z))));
  const ovejaPatas = unir([ovejaPatasA, ovejaPatasB]); // lejos, quietas (una llamada de dibujo menos)
  const ovejaLejos = unir([con(lanaChica, trs(0.02, 0.66, 0, 0, 0, 0, 0.62, 0.37, 0.35)), con(lanaChica, trs(0.5, 0.74, 0, 0, 0, 0.5, 0.2, 0.12, 0.11))]);
  const ovejaCuello = unir([con(lanaChica, trs(0.1, 0, 0, 0, 0, 0, 0.2, 0.16, 0.16)), con(lanaChica, trs(0.24, 0.08, 0, 0, 0, 0, 0.09, 0.07, 0.09))]);
  const ovejaCara = unir([con(new THREE.SphereGeometry(1, 10, 6), trs(0.34, 0, 0, 0, 0, -0.5, 0.2, 0.11, 0.095)),
    ...[1, -1].map((s) => con(new THREE.SphereGeometry(1, 6, 4), trs(0.24, 0.02, s * 0.1, s * 0.5, 0, 0, 0.06, 0.018, 0.03)))]);
  const ovejaHocico = con(new THREE.SphereGeometry(1, 8, 6), trs(0.46, -0.07, 0, 0, 0, 0, 0.05, 0.045, 0.05));

  // ---------- capas instanciadas por parcela ----------
  // la capa se dibuja si la distancia del caballo a la parcela está entre desde y lod (m);
  // copias: capas que reciben la misma instancia (otros niveles de detalle)
  const OVEJA_CERCA = 110;
  const CAPAS = {
    matas: { geo: tuftGeo, mat: tuftMat, lod: 75, recibe: true },
    postes: { geo: postGeo, mat: woodMat, lod: 340, sombra: true },
    varillas: { geo: varGeo, mat: woodMat, lod: 160, sombra: true },
    hilos: { geo: hiloGeo, mat: wireMat, lod: 190 },
    hojas: { geo: hojaGeo, mat: gateMat, lod: Infinity, sombra: true },
    troncoE: { geo: troncoGeo, mat: barkMat, lod: Infinity, sombra: true },
    copaE: { geo: copaGeo, mat: leafMat, lod: 140, copias: ['copaE1', 'copaE0'] },
    copaE1: { geo: copaGeo1, mat: leafMat, desde: 140, lod: 300 },
    copaE0: { geo: copaGeo0, mat: leafMat, desde: 300, lod: Infinity },
    troncoO: { geo: ombuTroncoGeo, mat: ombuBark, lod: Infinity, sombra: true },
    ramaO: { geo: troncoGeo, mat: ombuBark, lod: Infinity },
    copaO: { geo: copaGeo3, mat: leafMat2, lod: 140, copias: ['copaO1'] },
    copaO1: { geo: copaGeo1, mat: leafMat2, desde: 140, lod: Infinity },
    // movil: la oveja se aparta del caballo hasta CORREA m de su lugar (la esfera de recorte se agranda)
    ovejaCuerpo: { geo: ovejaCuerpo, mat: fleeceMat, lod: OVEJA_CERCA, sombra: true, copias: ['ovejaLejos'], movil: true },
    ovejaLejos: { geo: ovejaLejos, mat: fleeceMat, desde: OVEJA_CERCA, lod: 290, movil: true },
    ovejaPatasA: { geo: ovejaPatasA, mat: sheepDark, lod: OVEJA_CERCA, movil: true, copias: ['ovejaPatas'] },
    ovejaPatasB: { geo: ovejaPatasB, mat: sheepDark, lod: OVEJA_CERCA, movil: true },
    ovejaPatas: { geo: ovejaPatas, mat: sheepDark, desde: OVEJA_CERCA, lod: 290, movil: true },
    ovejaCuello: { geo: ovejaCuello, mat: fleeceMat, lod: OVEJA_CERCA, anim: true, movil: true },
    ovejaCara: { geo: ovejaCara, mat: sheepFace, lod: OVEJA_CERCA, anim: true, movil: true },
    ovejaHocico: { geo: ovejaHocico, mat: sheepDark, lod: OVEJA_CERCA, anim: true, movil: true }
  };
  const parcelas = [];
  for (let i = 0; i < NC; i++) for (let k = 0; k < NC; k++) {
    const grupo = new THREE.Group(); mundo.add(grupo);
    parcelas.push({ cx: -T / 2 + (i + 0.5) * C, cz: -T / 2 + (k + 0.5) * C, grupo, items: {}, capas: [], ovejas: [], dist: 0 });
  }
  const parcelaDe = (x, z) => {
    const i = Math.min(NC - 1, Math.floor((envolver(x) + T / 2) / C)), k = Math.min(NC - 1, Math.floor((envolver(z) + T / 2) / C));
    return parcelas[i * NC + k];
  };
  const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new V(), _s = new V();
  // pone una instancia en el punto (x, y, z) de la baldosa, con giro (rx, ry, rz) y escala
  function poner(capa, x, y, z, ry = 0, sx = 1, sy = sx, sz = sx, rx = 0, rz = 0) {
    const pc = parcelaDe(x, z);
    const m = M4().compose(_p.set(envolver(x - pc.cx), y, envolver(z - pc.cz)), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
    const lista = pc.items[capa] || (pc.items[capa] = []);
    lista.push(m);
    for (const otra of CAPAS[capa].copias || []) (pc.items[otra] || (pc.items[otra] = [])).push(m);
    return { pc, i: lista.length - 1, m };
  }

  // ---------- ocupación (para que nada se encime) ----------
  const ocupado = []; // [x, z, radio]
  const libre = (x, z, rad) => ocupado.every(([ox, oz, or]) => Math.hypot(envolver(x - ox), envolver(z - oz)) > or + rad);
  const enCamino = (x, z, m) => Math.abs(envolver(z)) < 1.7 + m || Math.abs(envolver(x - CAMINO_B)) < 1.5 + m;

  // ---------- sólidos (choque del caballo): segmentos con grosor, círculos, cajas rotadas y ovejas ----------
  // Todos con la misma forma de objeto (el bucle de choque es monomórfico). Coordenadas de la baldosa.
  // tipo: 0 = segmento (x0, z0) → (x1, z1) con grosor r; 1 = círculo (x0, z0) de radio r;
  //       2 = caja de centro (x0, z0), semilados hx, hz, girada ry (c = cos ry, s = sin ry); 3 = oveja (o.x, o.z, r)
  const SOL = [];
  function nuevoSolido(tipo, x0, z0, x1, z1, r) {
    const so = { tipo, x0, z0, x1, z1, r, c: 1, s: 0, hx: 0, hz: 0, o: null, marca: 0, mnx: 0, mxx: 0, mnz: 0, mxz: 0 };
    SOL.push(so); return so;
  }
  function solidoSegmento(x0, z0, x1, z1, grosor) {
    const so = nuevoSolido(0, x0, z0, x1, z1, grosor);
    so.mnx = Math.min(x0, x1) - grosor; so.mxx = Math.max(x0, x1) + grosor; so.mnz = Math.min(z0, z1) - grosor; so.mxz = Math.max(z0, z1) + grosor;
  }
  function solidoCirculo(x, z, r) {
    const so = nuevoSolido(1, x, z, x, z, r);
    so.mnx = x - r; so.mxx = x + r; so.mnz = z - r; so.mxz = z + r;
  }
  // caja de semilados (hx, hz) con centro en (lx, lz) del marco de un objeto puesto en (x, z) con giro ry
  function solidoCaja(x, z, ry, lx, lz, hx, hz) {
    const c = Math.cos(ry), s = Math.sin(ry);
    const so = nuevoSolido(2, x + lx * c + lz * s, z - lx * s + lz * c, 0, 0, 0);
    so.c = c; so.s = s; so.hx = hx; so.hz = hz;
    const ex = Math.abs(c) * hx + Math.abs(s) * hz, ez = Math.abs(s) * hx + Math.abs(c) * hz;
    so.mnx = so.x0 - ex; so.mxx = so.x0 + ex; so.mnz = so.z0 - ez; so.mxz = so.z0 + ez;
  }

  // ---------- alambrados: postes cada ~10 m, 4 varillas entre postes, 6 hilos, tranqueras abiertas ----------
  const alambrados = [];
  const esquinas = new Set();
  // abreHacia: +1 o −1 = la hoja abre hacia +z o −z del marco del lado (0 = al azar); fijas: centros de tranqueras
  function lado(x0, z0, x1, z1, abreHacia, fijas) {
    const L = Math.hypot(x1 - x0, z1 - z0), ux = (x1 - x0) / L, uz = (z1 - z0) / L;
    // marco del lado: +x local a lo largo del alambrado, +z local = (sin ry, cos ry) en el suelo
    const ry = Math.atan2(-uz, ux);
    const n = L > 110 ? 2 : 1;
    const centros = fijas || Array.from({ length: n }, (_, k) => Math.min(L - 12, Math.max(12, L * (k + 0.5) / n + r(-10, 10))));
    const tranqueras = [];
    const piezas = []; let t0 = 0;
    for (const tc of centros) {
      piezas.push([t0, tc - ANCHO_TRANQUERA / 2]); t0 = tc + ANCHO_TRANQUERA / 2;
      const gx = x0 + ux * tc, gz = z0 + uz * tc;
      // postes de la tranquera, gruesos y altos
      for (const s of [-1, 1]) poner('postes', gx + ux * s * ANCHO_TRANQUERA / 2, 0, gz + uz * s * ANCHO_TRANQUERA / 2, rnd() * 3, 2.1, 1.22, 2.1);
      // hoja abierta: bisagra en uno de los postes, girada 95-120° hacia el lado que abre
      const hacia = abreHacia || (rnd() < 0.5 ? 1 : -1), enInicio = rnd() < 0.5, phi = r(1.65, 2.1);
      const bx = gx - ux * (enInicio ? 1 : -1) * (ANCHO_TRANQUERA / 2 - 0.15), bz = gz - uz * (enInicio ? 1 : -1) * (ANCHO_TRANQUERA / 2 - 0.15);
      const ang = ry + (enInicio ? -hacia * phi : Math.PI + hacia * phi);
      poner('hojas', bx, 0.02, bz, ang);
      const hx = bx + Math.cos(ang) * HOJA, hz = bz - Math.sin(ang) * HOJA;
      solidoSegmento(bx, bz, hx, hz, 0.06);
      for (const s of [-1, 1]) solidoCirculo(gx + ux * s * ANCHO_TRANQUERA / 2, gz + uz * s * ANCHO_TRANQUERA / 2, 0.19);
      tranqueras.push({ x: gx, z: gz, t: tc, ancho: ANCHO_TRANQUERA, hoja: { x0: bx, z0: bz, x1: hx, z1: hz } });
    }
    piezas.push([t0, L]);
    for (const [a, b] of piezas) {
      const len = b - a, m = Math.max(1, Math.ceil(len / 10)), sp = len / m;
      const px = (t) => x0 + ux * t, pz = (t) => z0 + uz * t;
      for (let j = 1; j < m; j++) poner('postes', px(a + j * sp), 0, pz(a + j * sp), rnd() * 3, 1, 1, 1, (rnd() - 0.5) * 0.04, (rnd() - 0.5) * 0.04);
      for (let j = 0; j < m; j++) for (let k = 1; k <= 4; k++) {
        const t = a + (j + k / 5) * sp;
        poner('varillas', px(t), 0.06, pz(t), ry + (rnd() - 0.5) * 0.2, 1, 1, 1, 0, (rnd() - 0.5) * 0.03);
      }
      for (const y of [0.28, 0.46, 0.64, 0.82, 1.0, 1.18]) poner('hilos', px(a), y, pz(a), ry, len, 1, 1);
      solidoSegmento(px(a), pz(a), px(b), pz(b), 0.09);
    }
    for (const [x, z] of [[x0, z0], [x1, z1]]) {
      const key = `${envolver(x).toFixed(1)},${envolver(z).toFixed(1)}`;
      if (!esquinas.has(key)) { esquinas.add(key); poner('postes', x, 0, z, rnd() * 3, 1.5, 1.12, 1.5); solidoCirculo(x, z, 0.14); }
    }
    alambrados.push({ x0, z0, x1, z1, tranqueras });
  }
  // alambrados a lo largo de x (z constante)
  for (const z of ZH) for (const [xa, xb] of TRAMOS_X) {
    const abre = z === -5.5 ? -1 : z === 9.5 ? 1 : 0;
    // la tranquera del casco, frente al rancho (se ve desde la vista de campo)
    const fijas = z === -5.5 && xa === -40 ? [16, 92] : null;
    lado(xa, z, xb, z, abre, fijas);
  }
  // alambrados a lo largo de z (x constante); en el marco del lado, +z local es −x
  for (const x of XV) for (const [za, zb] of TRAMOS_Z) {
    const abre = x === CAMINO_B - 5.5 ? 1 : x === CAMINO_B + 5.5 ? -1 : 0;
    lado(x, za, x, zb, abre, null);
  }
  // los postes y los árboles no se pegan a los alambrados
  const potreros = [];
  for (const [xa, xb] of TRAMOS_X) for (const [za, zb] of TRAMOS_Z) potreros.push({ xa, xb, za, zb });

  // ---------- rancho criollo: paredes encaladas, techo de paja, ramada, palenque ----------
  function makeRancho() {
    const R = new THREE.Group();
    const L = 8.5, Wd = 4.6, Hw = 2.3, ridge = 2.9;
    const lime = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#ece8de'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 1600; i++) { g.fillStyle = rnd() < 0.5 ? `rgba(200,190,170,${0.1 + rnd() * 0.2})` : `rgba(255,255,250,${0.15 + rnd() * 0.2})`; g.beginPath(); g.arc(rnd() * w, rnd() * h, 1 + rnd() * 6, 0, TAU); g.fill(); }
      const gr = g.createLinearGradient(0, h * 0.78, 0, h); gr.addColorStop(0, 'rgba(140,110,80,0)'); gr.addColorStop(1, 'rgba(130,100,70,0.55)'); g.fillStyle = gr; g.fillRect(0, h * 0.78, w, h * 0.22);
    });
    lime.repeat.set(2, 1);
    const wallMat = new THREE.MeshStandardMaterial({ map: lime, roughness: 0.95 });
    const thatch = canvasTex(512, 256, (g, w, h) => {
      g.fillStyle = '#8c7346'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) {
        const x = rnd() * w, y = rnd() * h, l = 10 + rnd() * 30, v = rnd();
        g.strokeStyle = v < 0.35 ? 'rgba(70,55,30,0.6)' : v < 0.8 ? 'rgba(170,145,95,0.55)' : 'rgba(205,185,135,0.5)';
        g.lineWidth = 0.6 + rnd(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 3, y + l); g.stroke();
      }
      for (let k = 0; k < 6; k++) { g.fillStyle = 'rgba(60,45,25,0.25)'; g.fillRect(0, (k + 1) * h / 7, w, 2); }
    });
    thatch.repeat.set(3, 1);
    const roofMat = new THREE.MeshStandardMaterial({ map: thatch, roughness: 1 });
    const doorMat = new THREE.MeshStandardMaterial({ color: lin('#5a3f2a'), map: woodTex, roughness: 0.85 });
    const box = (w, h, d, mat, x, y, z) => { const m = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat)); m.position.set(x, y, z); R.add(m); return m; };
    box(L, Hw, 0.35, wallMat, 0, Hw / 2, Wd / 2);
    box(L, Hw, 0.35, wallMat, 0, Hw / 2, -Wd / 2);
    box(0.35, Hw, Wd, wallMat, L / 2, Hw / 2, 0);
    box(0.35, Hw, Wd, wallMat, -L / 2, Hw / 2, 0);
    const tri = new THREE.Shape(); tri.moveTo(-Wd / 2, 0); tri.lineTo(Wd / 2, 0); tri.lineTo(0, ridge); tri.lineTo(-Wd / 2, 0);
    const gableGeo = new THREE.ExtrudeGeometry(tri, { depth: 0.35, bevelEnabled: false });
    [L / 2, -L / 2].forEach((x) => { const m = shadowed(new THREE.Mesh(gableGeo, wallMat)); m.rotation.y = Math.PI / 2; m.position.set(x - 0.175, Hw, 0); R.add(m); });
    const slope = Math.hypot(Wd / 2 + 0.7, ridge + 0.35), ang = Math.atan2(ridge + 0.35, Wd / 2 + 0.7);
    [1, -1].forEach((s) => {
      const m = shadowed(new THREE.Mesh(new THREE.BoxGeometry(L + 1.1, 0.32, slope), roofMat));
      m.position.set(0, Hw - 0.35 + (ridge + 0.35) / 2 + 0.12, s * (Wd / 2 + 0.7) / 2);
      m.rotation.x = s * ang; R.add(m);
    });
    const ridgeRoll = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, L + 1.1, 12), roofMat));
    ridgeRoll.rotation.z = Math.PI / 2; ridgeRoll.position.set(0, Hw + ridge + 0.05, 0); R.add(ridgeRoll);
    box(1.0, 1.9, 0.08, doorMat, -0.8, 0.95, Wd / 2 + 0.19);
    [[1.9, 1.35], [-3.0, 1.35]].forEach(([x, y]) => { box(0.9, 0.8, 0.07, doorMat, x, y, Wd / 2 + 0.19); box(0.04, 0.8, 0.09, darkMat, x, y, Wd / 2 + 0.2); });
    // ramada: postes y techo de paja al costado de la casa
    const pole = new THREE.CylinderGeometry(0.07, 0.08, 2.4, 8); pole.translate(0, 1.2, 0);
    [[L / 2 + 0.6, 2.6], [L / 2 + 3.6, 2.6], [L / 2 + 0.6, -1.6], [L / 2 + 3.6, -1.6]].forEach(([x, z]) => { const m = shadowed(new THREE.Mesh(pole, woodMat)); m.position.set(x, 0, z); R.add(m); });
    const shade = shadowed(new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.18, 4.8), roofMat)); shade.position.set(L / 2 + 2.1, 2.45, 0.5); shade.rotation.z = -0.08; R.add(shade);
    // palenque al frente
    const rail = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 8), woodMat)); rail.rotation.z = Math.PI / 2; rail.position.set(1.5, 1.0, Wd / 2 + 3.2); R.add(rail);
    [0.1, 2.9].forEach((x) => { const m = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.1, 8), woodMat)); m.position.set(x, 0.55, Wd / 2 + 3.2); R.add(m); });
    // patio de tierra apisonada
    const yard = new THREE.Mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshStandardMaterial({ map: yardTex, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    yard.rotation.x = -Math.PI / 2; yard.position.set(0.5, 0.004, 2); yard.scale.set(1.2, 0.8, 1); yard.receiveShadow = true; R.add(yard);
    return R;
  }
  function ponerGrupo(obj, x, z, ry) {
    const pc = parcelaDe(x, z);
    obj.position.set(envolver(x - pc.cx), 0, envolver(z - pc.cz)); obj.rotation.y = ry;
    pc.grupo.add(obj);
  }
  // sólidos del rancho en su marco (L = 8,5 y Wd = 4,6 de makeRancho): la casa hasta el borde del alero
  // (el jinete pega con la cabeza), la ramada entera y el palenque (palo y postes, segmento con grosor)
  function solidosRancho(x, z, ry) {
    solidoCaja(x, z, ry, 0, 0, 4.8, 2.95);
    solidoCaja(x, z, ry, 4.25 + 2.1, 0.5, 1.95, 2.45);
    const c = Math.cos(ry), s = Math.sin(ry), pz = 2.3 + 3.2;
    solidoSegmento(x + 0.1 * c + pz * s, z - 0.1 * s + pz * c, x + 2.9 * c + pz * s, z - 2.9 * s + pz * c, 0.1);
  }
  const rancho = makeRancho();
  ponerGrupo(rancho, -14, -30, 0.12); ocupado.push([-14, -30, 12]); solidosRancho(-14, -30, 0.12);
  // un puesto (otro rancho igual) en el potrero del oeste, de frente al camino
  ponerGrupo(rancho.clone(), -300, 34, Math.PI + 0.08); ocupado.push([-300, 34, 12]); solidosRancho(-300, 34, Math.PI + 0.08);

  // ---------- árboles: eucaliptos (montes y cortinas) y ombúes ----------
  function eucalipto(x, z, h) {
    const rb = 0.16 + h * 0.011, inc = (rnd() - 0.5) * 0.06;
    poner('troncoE', x, 0, z, rnd() * TAU, rb, h * 0.84, rb, inc, (rnd() - 0.5) * 0.06);
    solidoCirculo(x, z, rb + 0.05);
    const nb = 7 + Math.floor(rnd() * 3);
    for (let b = 0; b < nb; b++) {
      const k = b / nb, y = h * (0.46 + 0.5 * k + rnd() * 0.05), rr = h * (0.055 + rnd() * 0.035) * (1.1 - 0.45 * k);
      const a = rnd() * TAU, d = h * (0.03 + rnd() * 0.09) * (1 - 0.5 * k);
      poner('copaE', x + Math.cos(a) * d + inc * y, y, z + Math.sin(a) * d, rnd() * TAU, rr, rr * (1.4 + rnd() * 0.5), rr);
    }
  }
  function monte(cx, cz, w, d, n, giro = 0, hMin = 15, hMax = 26) {
    const c = Math.cos(giro), s = Math.sin(giro), pts = [];
    for (let i = 0, tries = 0; i < n && tries < n * 30; tries++) {
      const u = (rnd() - 0.5) * w, v = (rnd() - 0.5) * d;
      const x = cx + u * c + v * s, z = cz - u * s + v * c;
      if (pts.some(([px, pz]) => Math.hypot(px - x, pz - z) < 2.6)) continue;
      pts.push([x, z]); eucalipto(x, z, r(hMin, hMax)); i++;
    }
    ocupado.push([cx, cz, Math.hypot(w, d) / 2 + 2]);
  }
  function ombu(x, z, s = 1) {
    poner('troncoO', x, 0, z, rnd() * TAU, s);
    solidoCirculo(x, z, 2.1 * s); // con los contrafuertes de la base
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU + rnd() * 0.6, inc = r(0.6, 0.95);
      // rama gruesa que sale del tronco hacia afuera y arriba (el cilindro crece a lo largo de +y)
      const m = M4().makeRotationY(a).multiply(M4().makeRotationZ(-inc));
      const q = new THREE.Quaternion().setFromRotationMatrix(m), eu = new THREE.Euler().setFromQuaternion(q);
      poner('ramaO', x, 3.3 * s, z, eu.y, 0.45 * s, 4.2 * s, 0.45 * s, eu.x, eu.z);
    }
    for (let i = 0; i < 13; i++) {
      const a = rnd() * TAU, d = Math.sqrt(rnd()) * 5 * s, rr = (2.1 + rnd() * 1.8) * s;
      poner('copaO', x + Math.cos(a) * d, (5.2 + rnd() * 2.2 - d * 0.18) * s, z + Math.sin(a) * d, rnd() * TAU, rr, rr * 0.72, rr);
    }
    ocupado.push([x, z, 8 * s]);
  }
  // los del casco y del camino, cerca del arranque (se ven desde las vistas de prueba)
  monte(-8, -42, 22, 12, 16, 0, 13, 22);
  monte(70, 62, 34, 14, 22, 0, 12, 22);
  ombu(18, -16);
  ombu(-60, 28, 1.15);

  // ---------- ovejas Corriedale (pastan: el cuello sube y baja; se apartan del caballo) ----------
  const CORREA = 10;   // m que una oveja se aleja de su lugar
  function oveja(x, z, ry, s) {
    const base = poner('ovejaCuerpo', x, 0, z, ry, s);
    const iP = poner('ovejaPatasA', x, 0, z, ry, s).i; poner('ovejaPatasB', x, 0, z, ry, s);
    const cab = M4().copy(base.m).multiply(M4().makeTranslation(CUELLO.x, CUELLO.y, CUELLO.z));
    const iCab = ['ovejaCuello', 'ovejaCara', 'ovejaHocico'].map((capa) => { const it = poner(capa, x, 0, z, ry, s); it.m.copy(cab); return it.i; });
    const o = { cab, iCab, iC: base.i, iP, pc: base.pc, x, z, casaX: x, casaZ: z, ry, s, v: 0, alerta: 0, paso: 0, quieta: true, ph: rnd() * TAU, rate: 0.3 + rnd() * 0.4 };
    const so = nuevoSolido(3, x, z, x, z, 0.62 * s); so.o = o;
    const m = CORREA + so.r; so.mnx = x - m; so.mxx = x + m; so.mnz = z - m; so.mxz = z + m;
    base.pc.ovejas.push(o);
  }
  function majada(cx, cz, n, rad, pot) {
    for (let i = 0, tries = 0; i < n && tries < n * 20; tries++) {
      const a = rnd() * TAU, d = rad * Math.sqrt(rnd());
      const x = cx + Math.cos(a) * d * 1.3, z = cz + Math.sin(a) * d;
      if (pot && (x < pot.xa + 3 || x > pot.xb - 3 || z < pot.za + 3 || z > pot.zb - 3)) continue;
      if (!libre(x, z, 0.8) || enCamino(x, z, 3)) continue;
      oveja(x, z, rnd() * TAU, 0.9 + rnd() * 0.2); i++;
    }
  }
  const potreroDe = (x, z) => potreros.find((p) => x > p.xa && x < p.xb && z > p.za && z < p.zb);
  majada(0, -12, 6, 4, potreroDe(0, -12));
  majada(50, -95, 22, 16, potreroDe(50, -95));
  majada(-110, 70, 18, 14, potreroDe(-110, 70));

  // el resto de los potreros: majadas, montes y ombúes al azar
  for (const p of potreros) {
    const cerca = (p.xa === -40 || p.xa === -205) && (p.za === -200 || p.za === 9.5);
    const enP = (m) => [r(p.xa + m, p.xb - m), r(p.za + m, p.zb - m)];
    if (!cerca && rnd() < 0.45) {
      const w = r(20, 44), d = r(10, 18), [x, z] = enP(Math.max(w, d) / 2 + 12);
      if (libre(x, z, Math.hypot(w, d) / 2)) monte(x, z, w, d, Math.round(w * d / 30), rnd() < 0.5 ? 0 : Math.PI / 2);
    }
    if (!cerca && rnd() < 0.35) { const [x, z] = enP(16); if (libre(x, z, 9)) ombu(x, z, r(0.9, 1.2)); }
    if (!cerca && rnd() < 0.6) { const [x, z] = enP(25); majada(x, z, 14 + Math.floor(rnd() * 14), r(10, 18), p); }
  }

  // ---------- matas de pasto, en todas las parcelas, fuera de caminos y patios ----------
  for (const pc of parcelas) {
    const cerca = ocupado.filter(([ox, oz, or]) => Math.abs(envolver(ox - pc.cx)) < C / 2 + or && Math.abs(envolver(oz - pc.cz)) < C / 2 + or);
    for (let i = 0; i < 450; i++) {
      const x = pc.cx + (rnd() - 0.5) * C, z = pc.cz + (rnd() - 0.5) * C;
      const s = 0.12 + rnd() * 0.22, ry = rnd() * TAU;
      if (enCamino(x, z, 0.5) || cerca.some(([ox, oz, or]) => Math.hypot(envolver(x - ox), envolver(z - oz)) < or - 2)) continue;
      poner('matas', x, 0, z, ry, s * 1.3, s, s * 1.3);
    }
  }

  // ---------- armar los InstancedMesh de cada parcela ----------
  const _c = new V(), _b = new THREE.Box3();
  for (const pc of parcelas) {
    pc.mallas = {};
    for (const [nombre, lista] of Object.entries(pc.items)) {
      const def = CAPAS[nombre];
      if (!def.geo.boundingSphere) def.geo.computeBoundingSphere();
      const bs = def.geo.boundingSphere;
      // esfera que contiene todas las instancias (el recorte por cámara de r128 usa la de la geometría)
      const esf = lista.map((m) => [bs.center.clone().applyMatrix4(m), bs.radius * m.getMaxScaleOnAxis()]);
      _b.makeEmpty(); esf.forEach(([c]) => _b.expandByPoint(c)); _b.getCenter(_c);
      let R = 0; esf.forEach(([c, rr]) => { R = Math.max(R, c.distanceTo(_c) + rr); });
      const geo = new THREE.BufferGeometry();
      geo.setIndex(def.geo.index);
      for (const k of Object.keys(def.geo.attributes)) geo.setAttribute(k, def.geo.attributes[k]);
      geo.boundingSphere = new THREE.Sphere(_c.clone(), R + (def.anim ? 0.6 : 0) + (def.movil ? CORREA : 0));
      const mesh = new THREE.InstancedMesh(geo, def.mat, lista.length);
      lista.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.frustumCulled = true; // en r128 viene apagado; acá la esfera de la geometría cubre todas las instancias
      mesh.castShadow = !!def.sombra; mesh.receiveShadow = !!def.recibe;
      pc.grupo.add(mesh);
      pc.capas.push({ mesh, desde: def.desde || 0, lod: def.lod });
      pc.mallas[nombre] = mesh;
    }
    pc.items = null;
    const ml = pc.mallas;
    pc.cab = pc.ovejas.length ? [ml.ovejaCuello, ml.ovejaCara, ml.ovejaHocico] : null;
    pc.cuerpo = pc.ovejas.length ? [ml.ovejaCuerpo, ml.ovejaLejos, ml.ovejaPatasA, ml.ovejaPatasB, ml.ovejaPatas] : null;
  }

  // ---------- grilla de sólidos: celdas de G × G m sobre la baldosa ----------
  // Cada celda guarda (índice del sólido, corrimiento en x, corrimiento en z): el corrimiento lleva al sólido al
  // marco de la celda envuelta (los alambrados del borde de la baldosa caen en las celdas del otro lado).
  // Las ovejas se anotan en las celdas que cubre su correa y se prueban en su posición actual.
  const G = 10, NG = T / G;
  const celdas = new Array(NG * NG).fill(null);
  const modNG = (i) => ((i % NG) + NG) % NG;
  for (let n = 0; n < SOL.length; n++) {
    const so = SOL[n];
    const i0 = Math.floor((so.mnx + T / 2) / G), i1 = Math.floor((so.mxx + T / 2) / G);
    const k0 = Math.floor((so.mnz + T / 2) / G), k1 = Math.floor((so.mxz + T / 2) / G);
    for (let i = i0; i <= i1; i++) for (let k = k0; k <= k1; k++) {
      const wi = modNG(i), wk = modNG(k), q = wi * NG + wk;
      (celdas[q] || (celdas[q] = [])).push(n, (wi - i) / NG * T, (wk - k) / NG * T);
    }
  }
  // candidatos de una consulta (rectángulo en el marco de la baldosa): arrays preasignados, sin repetidos
  const CAND = [], CSX = [], CSZ = [];
  let consulta = 0;
  function candidatos(mnx, mnz, mxx, mxz) {
    consulta++;
    let n = 0;
    const i0 = Math.floor((mnx + T / 2) / G), i1 = Math.floor((mxx + T / 2) / G);
    const k0 = Math.floor((mnz + T / 2) / G), k1 = Math.floor((mxz + T / 2) / G);
    for (let i = i0; i <= i1; i++) {
      const wi = modNG(i), qx = (i - wi) / NG * T;
      for (let k = k0; k <= k1; k++) {
        const wk = modNG(k), cel = celdas[wi * NG + wk];
        if (cel === null) continue;
        const qz = (k - wk) / NG * T;
        for (let j = 0; j < cel.length; j += 3) {
          const so = SOL[cel[j]];
          if (so.marca === consulta) continue;
          const sx = qx + cel[j + 1], sz = qz + cel[j + 2];
          if (so.mxx + sx < mnx || so.mnx + sx > mxx || so.mxz + sz < mnz || so.mnz + sz > mxz) continue;
          so.marca = consulta;
          CAND[n] = so; CSX[n] = sx; CSZ[n] = sz; n++;
        }
      }
    }
    return n;
  }
  // distancia² del punto p al segmento a-b
  function dist2Seg(px, pz, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = ax + dx * t - px, ez = az + dz * t - pz;
    return ex * ex + ez * ez;
  }
  const orient = (ax, az, bx, bz, cx, cz) => (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
  // corte del segmento a-b (marco de la baldosa) con la caja so (corrida sx, sz): recorte de Liang-Barsky
  function segCaja(so, sx, sz, ax, az, bx, bz) {
    const cx = so.x0 + sx, cz = so.z0 + sz, c = so.c, s = so.s;
    const u0 = (ax - cx) * c - (az - cz) * s, v0 = (ax - cx) * s + (az - cz) * c;
    const du = (bx - cx) * c - (bz - cz) * s - u0, dv = (bx - cx) * s + (bz - cz) * c - v0;
    let t0 = 0, t1 = 1;
    if (Math.abs(du) < 1e-12) { if (Math.abs(u0) > so.hx) return false; } else {
      let ta = (-so.hx - u0) / du, tb = (so.hx - u0) / du;
      if (ta > tb) { const w = ta; ta = tb; tb = w; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return false;
    }
    if (Math.abs(dv) < 1e-12) { if (Math.abs(v0) > so.hz) return false; } else {
      let ta = (-so.hz - v0) / dv, tb = (so.hz - v0) / dv;
      if (ta > tb) { const w = ta; ta = tb; tb = w; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return false;
    }
    return true;
  }

  // true si el segmento (x0, z0) → (x1, z1) del suelo cruza o toca un sólido: alambrado fuera de las tranqueras,
  // poste, hoja abierta, rancho, ramada, palenque, tronco u oveja
  function bloqueado(x0, z0, x1, z1) {
    const ox = T * Math.round(x0 / T), oz = T * Math.round(z0 / T);
    const ax = x0 - ox, az = z0 - oz, bx = x1 - ox, bz = z1 - oz;
    const n = candidatos(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz));
    for (let j = 0; j < n; j++) {
      const so = CAND[j], sx = CSX[j], sz = CSZ[j], r2 = so.r * so.r;
      if (so.tipo === 0) {
        const cx = so.x0 + sx, cz = so.z0 + sz, dx = so.x1 + sx, dz = so.z1 + sz;
        if (orient(cx, cz, dx, dz, ax, az) * orient(cx, cz, dx, dz, bx, bz) <= 0 && orient(ax, az, bx, bz, cx, cz) * orient(ax, az, bx, bz, dx, dz) <= 0) return true;
        if (dist2Seg(ax, az, cx, cz, dx, dz) <= r2 || dist2Seg(bx, bz, cx, cz, dx, dz) <= r2 || dist2Seg(cx, cz, ax, az, bx, bz) <= r2 || dist2Seg(dx, dz, ax, az, bx, bz) <= r2) return true;
      } else if (so.tipo === 1) {
        if (dist2Seg(so.x0 + sx, so.z0 + sz, ax, az, bx, bz) <= r2) return true;
      } else if (so.tipo === 2) {
        if (segCaja(so, sx, sz, ax, az, bx, bz)) return true;
      } else if (dist2Seg(so.o.x + sx, so.o.z + sz, ax, az, bx, bz) <= r2) return true;
    }
    return false;
  }
  // true si el círculo de centro (x, z) y ese radio toca un sólido (también si el sólido queda entero adentro)
  function solidoEn(x, z, radio, conOvejas) {
    const ox = T * Math.round(x / T), oz = T * Math.round(z / T), ax = x - ox, az = z - oz;
    const n = candidatos(ax - radio, az - radio, ax + radio, az + radio);
    for (let j = 0; j < n; j++) {
      const so = CAND[j], sx = CSX[j], sz = CSZ[j], rr = so.r + radio;
      if (so.tipo === 0) {
        if (dist2Seg(ax, az, so.x0 + sx, so.z0 + sz, so.x1 + sx, so.z1 + sz) <= rr * rr) return true;
      } else if (so.tipo === 1) {
        const dx = ax - so.x0 - sx, dz = az - so.z0 - sz;
        if (dx * dx + dz * dz <= rr * rr) return true;
      } else if (so.tipo === 2) {
        const dx = ax - so.x0 - sx, dz = az - so.z0 - sz;
        const u = Math.abs(dx * so.c - dz * so.s) - so.hx, v = Math.abs(dx * so.s + dz * so.c) - so.hz;
        const eu = u > 0 ? u : 0, ev = v > 0 ? v : 0;
        if (eu * eu + ev * ev <= radio * radio) return true;
      } else if (conOvejas) {
        const dx = ax - so.o.x - sx, dz = az - so.o.z - sz;
        if (dx * dx + dz * dz <= rr * rr) return true;
      }
    }
    return false;
  }

  // ---------- ovejas que se apartan ----------
  // Cuando el caballo se acerca (más lejos cuanto más rápido viene) la oveja levanta la cabeza, gira y trota
  // alejándose y hacia el costado del camino del caballo; no cruza alambrados, troncos ni caminos y no se aleja
  // más de CORREA m de su lugar. Si queda acorralada se para y el caballo la tiene que rodear (es un sólido).
  const GIROS = [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, 2.4, -2.4];
  const angulo = (a) => a - TAU * Math.round(a / TAU);
  function puedeIr(o, nx, nz, hx, hz, dist) {
    if (Math.hypot(envolver(nx - o.casaX), envolver(nz - o.casaZ)) > CORREA) return false;
    if (Math.hypot(envolver(nx - hx), envolver(nz - hz)) < dist - 1e-4) return false;
    if (enCamino(nx, nz, 0.9) && !enCamino(o.x, o.z, 0.9)) return false;
    return !solidoEn(nx, nz, 0.62 * o.s, false);
  }
  const _rz = M4(), _m = M4(), _mb = M4(), _sh = M4(), _tc = M4().makeTranslation(CUELLO.x, CUELLO.y, CUELLO.z), _up = new V(0, 1, 0);
  function moverOvejas(pc, dt, hx, hz, fx, fz, vh) {
    let cambio = false;
    for (let j = 0; j < pc.ovejas.length; j++) {
      const o = pc.ovejas[j];
      const dx = envolver(o.x - hx), dz = envolver(o.z - hz), dist = Math.hypot(dx, dz) || 1e-6;
      // se espanta antes si está en el camino del caballo (adelante y a menos de 3 m de su línea)
      const R = 3.5 + 0.6 * vh + (dx * fx + dz * fz > 0 && Math.abs(dz * fx - dx * fz) < 3 ? 0.8 * vh : 0);
      let vObj = 0;
      if (dist < R) {
        vObj = Math.min(4.5, 1 + 2.5 * (1 - dist / R) + 0.3 * vh);
        // se aleja del caballo y, si el caballo anda, se corre hacia el costado de su camino (derecha = (−fz, fx))
        let wx = dx / dist, wz = dz / dist;
        if (vh > 0.3) { const lat = dx * -fz + dz * fx >= 0 ? 1 : -1; wx -= 0.9 * lat * fz; wz += 0.9 * lat * fx; }
        const giro = angulo(Math.atan2(-wz, wx) - o.ry), max = 5 * dt;
        o.ry += giro > max ? max : giro < -max ? -max : giro;
      }
      o.alerta += ((dist < R + 5 ? 1 : 0) - o.alerta) * Math.min(1, dt * 3);
      const dv = vObj - o.v;
      o.v = Math.max(0, o.v + (dv > 4 * dt ? 4 * dt : dv < -6 * dt ? -6 * dt : dv));
      if (o.v > 1e-3) {
        const paso = o.v * dt;
        let movio = false;
        for (let g = 0; g < GIROS.length && !movio; g++) {
          const a = o.ry + GIROS[g], nx = o.x + Math.cos(a) * paso, nz = o.z - Math.sin(a) * paso;
          if (!puedeIr(o, nx, nz, hx, hz, dist)) continue;
          o.x = nx; o.z = nz; movio = true;
          if (g) { const max = 4 * dt; o.ry += GIROS[g] > 0 ? Math.min(GIROS[g], max) : Math.max(GIROS[g], -max); }
        }
        if (!movio) o.v = 0;
        o.paso += paso * TAU / 0.9;
      } else if (o.quieta) continue;
      // trote: pares diagonales en oposición (corte con la cadera fija) y el cuerpo que sube y baja
      const k = Math.min(1, o.v / 1.5), sw = Math.sin(o.paso), corte = 0.42 * k * sw;
      o.quieta = o.v <= 1e-3;
      if (o.quieta) o.paso = 0;
      _q.setFromAxisAngle(_up, o.ry);
      _mb.compose(_p.set(envolver(o.x - pc.cx), 0, envolver(o.z - pc.cz)), _q, _s.set(o.s, o.s, o.s));
      const pa = pc.cuerpo;
      pa[2].setMatrixAt(o.iP, _m.multiplyMatrices(_mb, _sh.set(1, -corte, 0, CADERA * corte, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)));
      pa[3].setMatrixAt(o.iP, _m.multiplyMatrices(_mb, _sh.set(1, corte, 0, -CADERA * corte, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)));
      pa[4].setMatrixAt(o.iP, _mb);
      _mb.elements[13] = 0.03 * k * Math.abs(sw);
      pa[0].setMatrixAt(o.iC, _mb); pa[1].setMatrixAt(o.iC, _mb);
      o.cab.multiplyMatrices(_mb, _tc);
      cambio = true;
    }
    if (cambio) for (let q = 0; q < 5; q++) pc.cuerpo[q].instanceMatrix.needsUpdate = true;
  }

  // ---------- cada cuadro: rotar, trasladar y envolver ----------
  const ALERTA_PARCELA = 30; // m: parcelas donde las ovejas pueden estar viendo al caballo
  const ult = { x: 0, z: 0, rumbo: 0, v: 0 };
  function aplicar(t, dt) {
    const px = ult.x, pz = ult.z, fx = Math.cos(ult.rumbo), fz = -Math.sin(ult.rumbo);
    mundo.rotation.y = -ult.rumbo; lejos.rotation.y = -ult.rumbo;
    grassTex.offset.set(frac(px / GRASS_TILE), frac(-pz / GRASS_TILE));
    dirtA.offset.x = frac(px / DIRT_TILE); caminoA.position.z = envolver(-pz);
    dirtB.offset.x = frac(-pz / DIRT_TILE); caminoB.position.x = envolver(CAMINO_B - px);
    for (let n = 0; n < parcelas.length; n++) {
      const pc = parcelas[n];
      const gx = envolver(pc.cx - px), gz = envolver(pc.cz - pz);
      pc.grupo.position.set(gx, 0, gz);
      const d = Math.hypot(Math.max(0, Math.abs(gx) - C / 2), Math.max(0, Math.abs(gz) - C / 2));
      for (let q = 0; q < pc.capas.length; q++) { const cp = pc.capas[q]; cp.mesh.visible = d >= cp.desde && d < cp.lod; }
      if (pc.cab === null || d >= OVEJA_CERCA) continue;
      if (dt > 0 && d < ALERTA_PARCELA) moverOvejas(pc, dt, px, pz, fx, fz, ult.v);
      // pastan: el cuello sube y baja; alerta, levanta la cabeza
      for (let j = 0; j < pc.ovejas.length; j++) {
        const o = pc.ovejas[j];
        const graze = 0.5 + 0.5 * Math.sin(t * o.rate + o.ph);
        _m.multiplyMatrices(o.cab, _rz.makeRotationZ(lerp(lerp(0.15, -1.05, sstep(0.3, 0.7, graze)), 0.3, o.alerta)));
        for (let q = 0; q < 3; q++) pc.cab[q].setMatrixAt(o.iCab[q], _m);
      }
      for (let q = 0; q < 3; q++) pc.cab[q].instanceMatrix.needsUpdate = true;
    }
  }

  aplicar(0, 0);
  const api = {
    actualizar(pose, dt, t) {
      ult.x = pose.x; ult.z = pose.z; ult.rumbo = pose.rumbo || 0; ult.v = Math.abs(pose.velocidad || 0);
      aplicar(t, Math.min(dt, 0.1));
    },
    bloqueado,
    solidoEn: (x, z, radio = 0) => solidoEn(x, z, radio, true),
    alambrados
  };
  // en localhost (window.__debug existe): acceso a la API del campo para las pruebas
  if (window.__debug) window.__debug.campo = api;
  return api;
}
