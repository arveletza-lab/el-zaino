// Chequeo general: correr después de CADA cambio.
// Uso: node check.mjs   (con el servidor levantado: bash tools/qa/serve.sh)
//      node check.mjs --alcance   mide con el IK la tabla ALCANCE de js/locomocion.js y la imprime (para pegarla
//                                 si cambia la anatomía de las patas en js/caballo.js)
// Sale con código 1 si algo falla.
// Los cascos se miden en coordenadas del SUELO (docs/rediseno-v2.md): un casco apoyado no puede moverse más de
// 3 cm en su apoyo (el centro de la suela mientras está plano; la pinza durante el breakover), ni hundirse.
import { lanzar, nuevaPagina, abrirListo } from './lib.mjs';

const SLIP_MAX = 0.03;      // m de deslizamiento por apoyo
const HUNDIDO_MAX = -0.005; // m por debajo del suelo tolerado
const fallas = [], avisos = [];
const ok = (cond, msg) => { if (!cond) fallas.push(msg); return cond; };
const cm = (m) => (m * 100).toFixed(1) + ' cm';
const grados = (r) => (r * 180 / Math.PI).toFixed(0) + '°';

const browser = await lanzar();
const page = await nuevaPagina(browser);
await abrirListo(page);

if (process.argv.includes('--alcance')) {
  const t = await page.evaluate(() => {
    const d = window.__debug, C = window.__caballo; d.gait('stand'); d.freeze(0);
    const res = {};
    for (const [nom, id] of [['mano', 'MD'], ['pata', 'PD']]) {
      const P = C.patas.find((p) => p.id === id), L = C.legs.find((l) => l.id === id), T = P.hombro || P.cadera;
      res[nom] = [0, 35, 50, 60].map((g) => {
        const inc = g * Math.PI / 180, fila = [];
        for (let k = 0; k <= 16; k++) {
          const dx = -0.8 + k * 0.1;
          let lo = -0.3, hi = 0.3;
          for (let it = 0; it < 18; it++) {
            const y = (lo + hi) / 2;
            const casco = C.cascoConPinza(new THREE.Vector3(T.x + dx + P.pinza.x, 0, P.cascoReposo.z), inc, new THREE.Vector3(), P);
            C.aplicarPose({ cuerpo: { y }, patas: { [id]: { casco, apoyado: true, inclinacion: inc } } });
            if ((L.inclinacion || 0) > inc + 0.01) hi = y; else lo = y;
          }
          fila.push(lo.toFixed(3));
        }
        return '[' + fila.join(', ') + ']';
      });
    }
    const sep = ',\n    ';
    return `const ALCANCE = {\n  mano: [${res.mano.join(sep)}],\n  pata: [${res.pata.join(sep)}]\n};`;
  });
  console.log(t);
  await browser.close();
  process.exit(0);
}

console.log('== El zaino · check ==');
console.log('WebGL:', browser.webgl, /swiftshader/i.test(browser.webgl) ? '(software: los fps no son representativos)' : '');

// ---------- construcción ----------
const st0 = await page.evaluate(() => ({ ...window.__debug.state(), ...window.__debug.stats() }));
console.log(`\nConstrucción del cuerpo: ${st0.buildMs.toFixed(0)} ms · ${st0.bodyVerts} vértices`);
console.log('Tiempos de carga (ms):', JSON.stringify(st0.tiempos));
ok(st0.buildMs < 3000, `construcción del cuerpo en ${st0.buildMs.toFixed(0)} ms (máximo 3000)`);
ok(st0.tiempos.total < 2000, `primera carga en ${st0.tiempos.total} ms (máximo 2000)`);

// ---------- rendimiento ----------
console.log('\nRendimiento (al paso, 1280x720):');
for (const v of ['out', 'seguir', 'rider']) {
  await page.evaluate((v) => { const d = window.__debug; d.cam(null); d.palanca(null); d.gait('walk'); d.freeze(0); d.freeze(null); d.view(v); }, v);
  await page.waitForTimeout(2500);
  const s = await page.evaluate(() => window.__debug.stats());
  console.log(`  ${{ out: 'exterior', seguir: 'de atrás', rider: 'montura ' }[v]}: ${s.fps.toFixed(0)} fps · ${s.drawCalls} draw calls · ${s.triangles.toLocaleString('es')} triángulos`);
  ok(s.triangles < 400000, `${v}: ${s.triangles} triángulos (máximo 400.000)`);
  if (!/swiftshader/i.test(browser.webgl) && s.fps < 55) avisos.push(`${v}: ${s.fps.toFixed(0)} fps (objetivo 60)`);
}
await page.evaluate(() => { window.__debug.view('out'); window.__debug.freeze(0); });

// ---------- medidor (en la página): simula de a 1/120 s y junta apoyos, deslizamientos y pisadas ----------
await page.evaluate(() => {
  // acciones: [{ t (s), palanca: [x, y] | null, marcha: 'walk' | ..., boton: id }]
  window.__medir = (segundos, acciones = [], opciones = {}) => {
    const d = window.__debug, dt = 1 / 120, N = Math.round(segundos * 120);
    const ids = ['MI', 'MD', 'PI', 'PD'];
    const abierto = {}, apoyos = [], pisadas = [], despegues = [];
    let minY = { v: Infinity }, ladoMal = new Set(), indicadorMal = 0;
    const ys = [], rots = [], rumbos = [], poses = [];
    let cruces = 0;
    const reales = [], panel = new Set();
    const recorrido = { MI: 0, MD: 0, PI: 0, PD: 0 }, ultimo = {};
    // articulaciones de cada miembro en el marco del caballo (codo o babilla, rodilla o corvejón, menudillo, corona)
    const ART = { E: 'codo', K: 'rodilla', B: 'babilla', C: 'corvejón', F: 'menudillo', H: 'corona' };
    const legs = opciones.articulaciones ? window.__caballo.legs : [];
    const art = {};
    for (const L of legs) for (const k of Object.keys(ART)) if (L.j[k]) art[L.id + ' ' + ART[k]] = { L, k, prev: [], a: 0, n: 0, apoyado: [] };
    acciones = acciones.slice().sort((a, b) => a.t - b.t);
    for (let n = 0; n < N; n++) {
      const t = n * dt;
      while (acciones.length && acciones[0].t <= t + 1e-9) {
        const a = acciones.shift();
        if ('palanca' in a) a.palanca ? d.palanca(a.palanca[0], a.palanca[1]) : d.palanca(null);
        if (a.boton) document.getElementById(a.boton).click();
        if (a.tendido !== undefined) d.galopeTendido(a.tendido);
      }
      d.sim(dt);
      const H = d.hooves(), S = d.state();
      // aceleración de cada articulación por segunda diferencia (1/120 s); umbral en opciones.articulaciones (m/s²)
      for (const nom in art) {
        const o = art[nom], p = o.L.j[o.k], q = o.prev;
        q.push([p.x, p.y, p.z]); if (q.length > 3) q.shift();
        if (q.length === 3) {
          const a = Math.hypot(...[0, 1, 2].map((c) => (q[2][c] - 2 * q[1][c] + q[0][c]) / (dt * dt)));
          if (a > opciones.articulaciones) o.n++;
          if (a > o.a) { o.a = a; o.t = t; o.apoyado = H.find((h) => h.id === o.L.id).apoyado; }
        }
      }
      if (opciones.reales) { const r = S.marcha.real; const k = r.nombre + (r.tendido ? '+' : ''); if (reales[reales.length - 1] !== k) reales.push(k); if (opciones.panel) panel.add(document.getElementById('cadence').textContent); }
      ys.push(S.cuerpo.y); rots.push(S.cuerpo.rot + S.cuerpo.cuello); rumbos.push(S.pose.rumbo);
      // el cuerpo (contorno visto desde arriba y círculos sobre el eje) toca un alambrado, poste, tronco, casa u oveja
      if (opciones.contorno && d.toca(0)) cruces++;
      if (opciones.nariz) {
        const p = S.pose, c = Math.cos(p.rumbo), s = Math.sin(p.rumbo);
        poses.push({ x: p.x + 1.75 * c, z: p.z - 1.75 * s, cx: p.x, cz: p.z });
      }
      ids.forEach((id, i) => { if (document.getElementById('f-' + id).classList.contains('on') !== S.apoyos[i]) indicadorMal++; });
      for (const h of H) {
        if (h.minY < minY.v) minY = { v: h.minY, id: h.id, t, apoyado: h.apoyado };
        if (opciones.lado && ((h.id.endsWith('D') && h.z <= 0) || (h.id.endsWith('I') && h.z >= 0))) ladoMal.add(h.id);
        if (ultimo[h.id]) recorrido[h.id] += Math.hypot(h.sx - ultimo[h.id].x, h.sz - ultimo[h.id].z);
        ultimo[h.id] = { x: h.sx, z: h.sz };
        let a = abierto[h.id];
        if (h.apoyado && !a) {
          a = abierto[h.id] = { id: h.id, cx: h.sx, cz: h.sz, px: null, pz: null, max: 0, n0: n, maxIncl: 0 };
          pisadas.push({ id: h.id, Phi: S.marcha.Phi, t, x: h.sx, z: h.sz, gait: S.marcha.tipo });
        }
        if (h.apoyado) {
          let dist;
          if (h.incl < 0.02) dist = Math.hypot(h.sx - a.cx, h.sz - a.cz);
          else {
            if (a.px === null) { a.px = h.px; a.pz = h.pz; a.slipCentro = Math.hypot(h.sx - a.cx, h.sz - a.cz); }
            dist = Math.hypot(h.px - a.px, h.pz - a.pz);
          }
          a.max = Math.max(a.max, dist);
          a.maxIncl = Math.max(a.maxIncl, h.incl);
        } else if (a) {
          apoyos.push({ id: h.id, slip: a.max, n0: a.n0, n1: n, f: S.marcha.f, incl: a.maxIncl });
          despegues.push({ id: h.id, Phi: S.marcha.Phi, t });
          abierto[h.id] = null;
        }
      }
    }
    const S = d.state();
    const acel = (v) => { let m = 0; for (let i = 1; i < v.length - 1; i++) m = Math.max(m, Math.abs(v[i + 1] - 2 * v[i] + v[i - 1]) / (dt * dt)); return m; };
    return { cruces, reales, panel: [...panel], apoyos, pisadas, despegues, minY, ladoMal: [...ladoMal], indicadorMal, ay: acel(ys), ar: acel(rots), rumbo: S.pose.rumbo,
      rumbos: rumbos.filter((_, i) => i % 12 === 0), poses: poses.filter((_, i) => i % 6 === 0), recorrido, final: S, indicadorN: N,
      articulaciones: Object.entries(art).map(([nom, o]) => ({ nom, a: o.a, n: o.n, t: o.t, apoyado: o.apoyado })) };
  };
});

const NOMBRE = { stand: 'quieto', walk: 'paso', trot: 'trote', gallop: 'galope' };
function informar(nombre, r, { saltearPrimeros = 0 } = {}) {
  let peor = { slip: 0 };
  for (const id of ['MI', 'MD', 'PI', 'PD']) {
    const a = r.apoyos.filter((x) => x.id === id && x.n0 >= saltearPrimeros);
    const p = a.reduce((m, x) => (x.slip > m.slip ? x : m), { slip: 0 });
    if (p.slip > peor.slip) peor = { ...p, id };
  }
  const n = r.apoyos.length;
  console.log(`  ${n} apoyos · deslizamiento máximo ${cm(peor.slip)}${peor.id ? ' (' + peor.id + ')' : ''} · casco más bajo ${cm(r.minY.v)} (${r.minY.id}${r.minY.apoyado ? ', apoyado' : ', en el aire'})`);
  ok(peor.slip < SLIP_MAX, `${nombre}: el casco ${peor.id} se desliza ${cm(peor.slip)} en un apoyo (máximo ${cm(SLIP_MAX)})`);
  ok(r.minY.v >= HUNDIDO_MAX, `${nombre}: el casco ${r.minY.id} queda ${cm(-r.minY.v)} por debajo del suelo`);
  ok(r.indicadorMal === 0, `${nombre}: el indicador de apoyos no coincide con las patas (${r.indicadorMal} lecturas)`);
}
const fr = (x) => ((x % 1) + 1) % 1;

// ---------- alcance de las patas: la tabla de js/locomocion.js tiene que coincidir con el IK de js/caballo.js ----------
{
  const r = await page.evaluate(async () => {
    const { alcance } = await import('/js/locomocion.js');
    const d = window.__debug, C = window.__caballo; d.gait('stand'); d.freeze(0);
    const medir = (id, dx, inc) => {
      const P = C.patas.find((p) => p.id === id), L = C.legs.find((l) => l.id === id), T = P.hombro || P.cadera;
      let lo = -0.3, hi = 0.3;
      for (let it = 0; it < 18; it++) {
        const y = (lo + hi) / 2;
        const casco = C.cascoConPinza(new THREE.Vector3(T.x + dx + P.pinza.x, 0, P.cascoReposo.z), inc, new THREE.Vector3(), P);
        C.aplicarPose({ cuerpo: { y }, patas: { [id]: { casco, apoyado: true, inclinacion: inc } } });
        if ((L.inclinacion || 0) > inc + 0.01) hi = y; else lo = y;
      }
      return { ik: lo, tabla: alcance(id[0] === 'M', dx, inc) };
    };
    const out = [medir('MD', -0.55, 0.8), medir('MD', 0.55, 0), medir('PD', -0.65, 0.8), medir('PD', 0.45, 0)];
    d.freeze(0);
    return out;
  });
  const peor = Math.max(...r.map((x) => Math.abs(x.ik - x.tabla)));
  console.log(`
Alcance de las patas (tabla contra IK): diferencia máxima ${cm(peor)}`);
  ok(peor < 0.015, `la tabla de alcance de js/locomocion.js no coincide con el IK (${cm(peor)}); volver a medirla con node tools/qa/check.mjs --alcance`);
}

// ---------- en línea recta: deslizamiento, apoyos, secuencia y duty ----------
// tabla de la investigación (§1.3); el modelo acorta el apoyo de las manos un 8 % y el de las patas un 3 % (js/marchas.js)
const TABLA_DUTY = { walk: [0.63, 0.65], trot: [0.46, 0.43], gallop: [0.43, 0.48] };
// temblor de los miembros: aceleración máxima de cada articulación cuadro a cuadro (docs/instrucciones-nuevo-chat.md §3);
// un salto de velocidad en un solo cuadro (despegue o pisada no continuos en velocidad) da picos de 100–200 m/s².
// Con el casco quieto en el suelo al despegar y al pisar, el mínimo físico es 4·D/T² (D tranco, T vuelo): paso
// ~43, trote ~55, galope ~120 m/s²; más el levantamiento y la flexión del menudillo. En el galope las manos se
// pasan 8–12 cm del alcance del miembro al despegar y antes de pisar (lo absorbe el IK): umbral provisorio hasta
// rediseñar el vuelo de las manos con el modelo nuevo (antes del arreglo: paso 854, trote 1600, galope 2381).
const ACEL_ART = { walk: 100, trot: 220, gallop: 600 };
for (const g of ['walk', 'trot', 'gallop']) {
  const r = await page.evaluate(([g, umbral]) => { const d = window.__debug; d.palanca(null); d.gait(g); d.freeze(0); return window.__medir(5, [], { lado: true, articulaciones: umbral }); }, [g, ACEL_ART[g]]);
  console.log(`\n${NOMBRE[g][0].toUpperCase() + NOMBRE[g].slice(1)} en línea recta (5 s, ${r.final.groundSpeed.toFixed(2)} m/s, ${r.final.marcha.f.toFixed(2)} Hz):`);
  informar(`${NOMBRE[g]} recto`, r);
  console.log(`  Cuerpo: aceleración máxima ${r.ay.toFixed(1)} m/s², giro ${r.ar.toFixed(1)} rad/s²`);
  ok(r.ay < 30 && r.ar < 60, `${NOMBRE[g]} recto: el cuerpo tiembla (${r.ay.toFixed(0)} m/s², ${r.ar.toFixed(0)} rad/s²)`);
  const arts = r.articulaciones.sort((a, b) => b.a - a.a), pa = arts[0];
  const porMiembro = ['MI', 'MD', 'PI', 'PD'].map((id) => { const l = arts.filter((x) => x.nom.startsWith(id)); return `${id} ${Math.max(...l.map((x) => x.a)).toFixed(0)}`; }).join(' · ');
  console.log(`  Articulaciones: aceleración máxima ${porMiembro} m/s² (umbral ${ACEL_ART[g]}); peor ${pa.nom} ${pa.a.toFixed(0)} m/s² en t = ${pa.t.toFixed(2)} s (${pa.apoyado ? 'apoyado' : 'en el aire'}); ${arts.reduce((s, x) => s + x.n, 0)} cuadros sobre el umbral`);
  ok(pa.a < ACEL_ART[g], `${NOMBRE[g]} recto: temblor de los miembros (${pa.nom} ${pa.a.toFixed(0)} m/s², máximo ${ACEL_ART[g]})`);
  ok(r.ladoMal.length === 0, `${NOMBRE[g]}: patas del lado equivocado según su nombre: ${r.ladoMal.join(', ')}`);
  // secuencia: fase de la última pisada de cada pata
  const fase = {};
  for (const p of r.pisadas) fase[p.id] = fr(p.Phi);
  const orden = Object.entries(fase).sort((a, b) => a[1] - b[1]);
  const rot = orden.findIndex(([id]) => id === 'PI');
  const desde = orden.slice(rot).concat(orden.slice(0, rot));
  const rel = desde.map(([id, f]) => [id, fr(f - fase.PI)]);
  const txt = rel.map(([id, f]) => `${id} ${f.toFixed(2)}`).join(' → ');
  const dif = (a, b) => { const x = Math.abs(fase[a] - fase[b]) % 1; return Math.min(x, 1 - x); };
  let bien, seq;
  if (g === 'walk') {
    const ordenIds = rel.map(([id]) => id).join(',');
    const gaps = rel.map(([, f], i) => fr((rel[(i + 1) % 4][1]) - f));
    bien = ordenIds === 'PI,MI,PD,MD' && Math.min(...gaps) > 0.18;
    seq = bien ? '4 tiempos, secuencia lateral' : 'MAL';
  } else if (g === 'trot') {
    bien = dif('MI', 'PD') < 0.05 && dif('MD', 'PI') < 0.05 && Math.abs(dif('MI', 'MD') - 0.5) < 0.05;
    seq = bien ? '2 tiempos, diagonales MI+PD y MD+PI' : 'MAL: las diagonales no pisan juntas';
  } else {
    const ordenIds = rel.map(([id]) => id).join(',');
    const derecha = ordenIds === 'PI,PD,MI,MD', izquierda = ordenIds === 'PD,PI,MD,MI';
    const tres = dif(derecha ? 'PD' : 'PI', derecha ? 'MI' : 'MD') < 0.1;
    bien = (derecha || izquierda) && tres;
    seq = bien ? `3 tiempos, mano ${derecha ? 'derecha' : 'izquierda'} adelante` : 'MAL';
  }
  console.log(`  Pisadas: ${txt} · ${seq}`);
  ok(bien, `${NOMBRE[g]}: secuencia de apoyos incorrecta (${txt})`);
  // duty medido (fracción del ciclo en apoyo) contra la tabla de la investigación
  const dm = r.apoyos.filter((a) => a.id[0] === 'M' && a.n0 > 0), dp = r.apoyos.filter((a) => a.id[0] === 'P' && a.n0 > 0);
  const duty = (l) => l.reduce((s, a) => s + (a.n1 - a.n0) / 120 * a.f, 0) / Math.max(1, l.length);
  const [tm, tp] = TABLA_DUTY[g], mm = duty(dm), mp = duty(dp);
  console.log(`  Duty: manos ${mm.toFixed(2)} (tabla ${tm}), patas ${mp.toFixed(2)} (tabla ${tp})`);
  ok(Math.abs(mm - tm) < 0.06 && Math.abs(mp - tp) < 0.06, `${NOMBRE[g]}: duty ${mm.toFixed(2)}/${mp.toFixed(2)} lejos de la tabla ${tm}/${tp}`);
  const bo = r.apoyos.filter((a) => a.n0 > 0).reduce((m, a) => Math.max(m, a.incl), 0);
  console.log(`  Breakover máximo ${grados(bo)}`);
  ok(bo < 80 * Math.PI / 180, `${NOMBRE[g]}: un casco apoyado rota ${grados(bo)} sobre la pinza (la pata no alcanza)`);
}

// ---------- doblando a cada lado ----------
console.log('\nDoblando (palanca a fondo a un costado, 6 s):');
for (const g of ['walk', 'trot', 'gallop']) {
  for (const lado of [-1, 1]) {
    // en un potrero grande, lejos de los alambrados
    const r = await page.evaluate(([g, lado]) => { const d = window.__debug; d.palanca(null); d.gait(g); d.freeze(0); d.ubicar(-120, 100, 0); return window.__medir(6, [{ t: 0, palanca: [lado, 0] }]); }, [g, lado]);
    const nombre = `${NOMBRE[g]} doblando a la ${lado < 0 ? 'izquierda' : 'derecha'}`;
    process.stdout.write(`  ${nombre}: giró ${grados(r.rumbo)}, inclinación ${grados(r.final.cuerpo.rolido)}${g === 'gallop' ? `, mano ${r.final.mano}` : ''}\n  `);
    informar(nombre, r);
    ok(Math.sign(r.rumbo) === -lado && Math.abs(r.rumbo) > 1, `${nombre}: giró ${grados(r.rumbo)}`);
    ok(Math.sign(r.final.cuerpo.rolido) === -lado, `${nombre}: no se inclina hacia adentro (${grados(r.final.cuerpo.rolido)})`);
    if (g === 'gallop') ok(r.final.mano === (lado < 0 ? 'izquierda' : 'derecha'), `${nombre}: galopa con la mano ${r.final.mano} (tiene que ser la de adentro)`);
  }
}

// ---------- giro en el lugar ----------
console.log('\nGiro en el lugar (parado, palanca a un costado hasta 180°):');
for (const lado of [-1, 1]) {
  const r = await page.evaluate((lado) => {
    const d = window.__debug; d.palanca(null); d.gait('stand'); d.freeze(0); d.ubicar(-120, 100, 0);
    return window.__medir(9, [{ t: 0, palanca: [lado, 0] }]);
  }, lado);
  const k = r.rumbos.findIndex((x) => Math.abs(x) >= Math.PI);
  const nombre = `giro en el lugar a la ${lado < 0 ? 'izquierda' : 'derecha'}`;
  const pivota = lado < 0 ? 'PI' : 'PD';
  const pasosMano = r.pisadas.filter((p) => p.id === (lado < 0 ? 'MD' : 'MI') && (k < 0 || p.t <= k * 0.1)).length;
  const otras = Object.entries(r.recorrido).filter(([id]) => id !== pivota).map(([, v]) => v);
  process.stdout.write(`  ${nombre}: 180° en ${k < 0 ? '> 9' : (k * 0.1).toFixed(1)} s, ${pasosMano} trancos; recorrido de los cascos ${Object.entries(r.recorrido).map(([id, v]) => id + ' ' + v.toFixed(2)).join(', ')} m
  `);
  informar(nombre, r);
  ok(k >= 0, `${nombre}: no llegó a 180° en 9 s (${grados(r.rumbo)})`);
  const corr = Math.hypot(r.final.pose.x + 120, r.final.pose.z - 100);
  ok(Math.abs(r.final.groundSpeed) < 0.01 && corr < 0.8, `${nombre}: no giró en el lugar (se corrió ${corr.toFixed(2)} m)`);
  ok(r.recorrido[pivota] < Math.min(...otras), `${nombre}: la pata de adentro (${pivota}) no es la que menos se mueve`);
  ok(pasosMano >= 3 && pasosMano <= 6, `${nombre}: ${pasosMano} trancos para 180° (esperado 4 ± 1)`);
}
// después de girar, al soltar la palanca, queda parado y cuadrado
{
  const r = await page.evaluate(() => { const d = window.__debug; d.gait('stand'); d.freeze(0); d.ubicar(-120, 100, 0); return window.__medir(8, [{ t: 0, palanca: [1, 0] }, { t: 3.3, palanca: null }]); });
  const fin = r.final;
  console.log(`  al soltar: ${fin.marcha.quieto ? 'queda quieto' : 'sigue moviéndose'}`);
  informar('giro en el lugar y alto', r);
  ok(fin.marcha.quieto, 'giro en el lugar: al soltar la palanca no queda quieto');
}

// ---------- palanca a fondo desde parado: sube de a una marcha y el panel dice la marcha real ----------
{
  const r = await page.evaluate(() => {
    const d = window.__debug; d.palanca(null); d.gait('stand'); d.freeze(0); d.ubicar(-120, 100, 0);
    return window.__medir(11, [{ t: 0, palanca: [0, 1] }, { t: 10.9, palanca: null }], { reales: true, panel: true });
  });
  const seq = r.reales.join(' → ');
  console.log(`
Palanca a fondo desde parado: ${seq}`);
  ok(seq.startsWith('stand → walk → trot → gallop → gallop+'), `palanca a fondo: la marcha no sube de a una (${seq})`);
  console.log(`  panel: ${r.panel.join(' | ')}`);
  // el panel dice "Galope tendido" (como marcha real) solo cuando el caballo ya va a galope tendido
  ok(r.panel.findIndex((t) => /^Galope tendido/.test(t)) >= r.panel.findIndex((t) => /^Galope →/.test(t)), 'palanca: el panel dice Galope tendido antes de tiempo');
  ok(r.panel.some((t) => /^Quieto → Paso/.test(t)) && r.panel.some((t) => /^Galope → Galope tendido/.test(t)), 'palanca: el panel no muestra la marcha real y la pedida mientras cambia ("Quieto → Paso", "Galope → Galope tendido")');
}

// ---------- transiciones: sin temblores ni deslizamientos ----------
console.log('\nTransiciones (5 s desde el cambio):');
const TRANS = [['walk', 'trot'], ['walk', 'gallop'], ['trot', 'gallop'], ['gallop', 'trot'], ['gallop', 'walk'], ['trot', 'walk'], ['stand', 'walk'], ['stand', 'trot'], ['trot', 'stand'], ['walk', 'stand'], ['gallop', 'tendido'], ['tendido', 'gallop']];
for (const [de, a] of TRANS) {
  const r = await page.evaluate(([de, a]) => {
    const d = window.__debug; d.palanca(null);
    d.gait(de === 'tendido' ? 'gallop' : de); if (de === 'tendido') d.galopeTendido(true);
    d.freeze(0); d.sim(1.5);
    const acc = a === 'tendido' ? [{ t: 0, tendido: true }] : a === 'gallop' && de === 'tendido' ? [{ t: 0, palanca: [0, -1] }, { t: 0.3, palanca: null }] : [{ t: 0, boton: 'g-' + a }];
    return window.__medir(5, acc);
  }, [de, a]);
  const bien = r.ay < 30 && r.ar < 60;
  const nom = (x) => (x === 'tendido' ? 'galope tendido' : NOMBRE[x]);
  process.stdout.write(`  ${nom(de)} → ${nom(a)}: aceleración máxima del cuerpo ${r.ay.toFixed(1)} m/s², giro ${r.ar.toFixed(1)} rad/s²${bien ? '' : '  ← TIEMBLA'}\n  `);
  informar(`${nom(de)} → ${nom(a)}`, r);
  ok(bien, `transición ${nom(de)} → ${nom(a)}: el cuerpo tiembla (${r.ay.toFixed(0)} m/s², ${r.ar.toFixed(0)} rad/s²)`);
  if (a === 'stand') ok(r.final.marcha.quieto, `${nom(de)} → quieto: no se detuvo en 5 s`);
}
// cambio de mano en el galope: doblar a un lado y después al otro
{
  const r = await page.evaluate(() => { const d = window.__debug; d.palanca(null); d.gait('gallop'); d.freeze(0); d.ubicar(-120, 100, 0); return window.__medir(8, [{ t: 0, palanca: [-1, 0] }, { t: 3, palanca: [1, 0] }, { t: 6, palanca: null }]); });
  process.stdout.write(`  galope, cambio de mano (izquierda → derecha): ${r.ay.toFixed(1)} m/s², ${r.ar.toFixed(1)} rad/s², mano final ${r.final.mano}\n  `);
  informar('cambio de mano', r);
  ok(r.final.mano === 'derecha', `cambio de mano: terminó con la mano ${r.final.mano}`);
  ok(r.ay < 30 && r.ar < 60, `cambio de mano: el cuerpo tiembla (${r.ay.toFixed(0)} m/s², ${r.ar.toFixed(0)} rad/s²)`);
}

// ---------- alambrados ----------
console.log('\nAlambrados:');
{
  // contra el alambrado de z = −5,5 (el caballo mira a −z: rumbo = π/2), lejos de las tranqueras
  const r = await page.evaluate(() => {
    const d = window.__debug; d.palanca(null); d.gait("trot"); d.freeze(0); d.ubicar(0, 6, Math.PI / 2);
    return window.__medir(8, [], { nariz: true, contorno: true });
  });
  const minZ = Math.min(...r.poses.map((p) => p.z));
  console.log(`  al trote hacia el alambrado (z = −5,5): la nariz llega a z = ${minZ.toFixed(2)} y ${r.final.marcha.bloqueado ? 'se detiene' : 'no se detiene'}`);
  ok(minZ > -5.5 && r.cruces === 0, `alambrado: el caballo lo toca o lo cruza (nariz en z = ${minZ.toFixed(2)}, ${r.cruces} cuadros tocando)`);
  ok(r.final.groundSpeed < 0.05, 'alambrado: el caballo no se detiene');
  // parado frente al alambrado puede girar y volver
  const r2 = await page.evaluate(() => window.__medir(8, [{ t: 0, palanca: [1, 0] }, { t: 7, palanca: null }], { contorno: true }));
  console.log(`  parado frente al alambrado gira ${grados(r2.rumbo - Math.PI / 2)}${r2.cruces ? `, tocándolo ${r2.cruces} cuadros` : ' sin tocarlo'}`);
  ok(Math.abs(r2.rumbo - Math.PI / 2) > 1.5, 'alambrado: parado no puede girar');
  ok(r2.cruces === 0, `alambrado: al girar parado lo toca (${r2.cruces} cuadros)`);
  // doblando hacia el alambrado al trote y al galope (andando paralelo, a 2,5 m): nunca lo toca
  for (const [g, lado] of [['trot', -1], ['gallop', -1], ['trot', 1]]) {
    const z0 = lado < 0 ? -3 : 7;
    const rr = await page.evaluate(([g, lado, z0]) => {
      const d = window.__debug; d.palanca(null); d.gait(g); d.freeze(0); d.ubicar(20, z0, 0);
      return window.__medir(8, [{ t: 0, palanca: [lado, 0] }], { contorno: true });
    }, [g, lado, z0]);
    const nom = `${NOMBRE[g]} doblando hacia el alambrado de z = ${lado < 0 ? '−5,5' : '9,5'}`;
    console.log(`  ${nom}: ${rr.cruces ? `lo toca ${rr.cruces} cuadros` : 'no lo toca'}, giró ${grados(rr.rumbo)}`);
    ok(rr.cruces === 0, `${nom}: el cuerpo toca el alambrado (${rr.cruces} cuadros)`);
  }
  // frenar a fondo pidiendo Quieto cerca de un alambrado (z = −200): no lo cruza ni lo toca
  for (const [nom, tendido, dist] of [['galope tendido', true, 18], ['galope corto', false, 8]]) {
    const rq = await page.evaluate(([tendido, dist]) => {
      const d = window.__debug;
      let x = null;
      for (let k = 0; k < 40 && x === null; k++) { const c = -150 + k * 2.5; if ([-2, 0, 2].every((o) => d.bloqueado(c + o, -195, c + o, -205))) x = c; }
      d.palanca(null); d.gait('gallop'); if (tendido) d.galopeTendido(true); d.freeze(0); d.ubicar(x, -200 + dist, Math.PI / 2);
      const m = window.__medir(6, [{ t: 0, boton: 'g-stand' }], { nariz: true, contorno: true });
      m.x = x;
      return m;
    }, [tendido, dist]);
    const minZ = Math.min(...rq.poses.map((p) => p.z));
    console.log(`  ${nom} a ${dist} m del alambrado (z = −200), pulsar Quieto: la nariz llega a z = ${minZ.toFixed(2)}${rq.cruces ? `, lo toca ${rq.cruces} cuadros` : ', sin tocarlo'}`);
    ok(minZ > -200 && rq.cruces === 0, `${nom} a ${dist} m, pulsar Quieto: atraviesa o toca el alambrado (nariz en z = ${minZ.toFixed(2)})`);
    ok(rq.final.groundSpeed < 0.05, `${nom} a ${dist} m, pulsar Quieto: no se detiene`);
  }
  // otros sólidos, al trote: el rancho (entrando por la tranquera de x = −24) y el ombú de (18, −16)
  for (const [nom, x0, z0, xo, zo] of [['el rancho', -24, -8, -14, -30], ['el ombú de (18, −16)', 18, -8, 18, -16]]) {
    const ro = await page.evaluate(([x0, z0, xo, zo]) => {
      const d = window.__debug; d.palanca(null); d.gait('trot'); d.freeze(0);
      d.ubicar(x0, z0, Math.atan2(-(zo - z0), xo - x0));
      return window.__medir(8, [], { contorno: true, nariz: true });
    }, [x0, z0, xo, zo]);
    const dmin = Math.min(...ro.poses.map((p) => Math.hypot(p.cx - xo, p.cz - zo)));
    console.log(`  al trote hacia ${nom}: ${ro.cruces ? `lo toca ${ro.cruces} cuadros` : 'no lo toca'}, se detiene a ${dmin.toFixed(1)} m de su centro`);
    ok(ro.cruces === 0, `al trote hacia ${nom}: el cuerpo lo atraviesa o lo toca (${ro.cruces} cuadros)`);
    ok(ro.final.groundSpeed < 0.05, `al trote hacia ${nom}: no se detiene`);
  }
  // por una tranquera abierta lo cruza: busca una tranquera del alambrado z = −5,5 con el paso libre
  const r3 = await page.evaluate(() => {
    const d = window.__debug;
    let x = null;
    for (const a of d.alambrados()) {
      if (a.z0 !== -5.5 || a.z1 !== -5.5) continue;
      for (const t of a.tranqueras) for (const dx of [0, -0.4, 0.4, -0.8, 0.8]) if (x === null && !d.bloqueado(t.x + dx, 2, t.x + dx, -14)) x = t.x + dx;
    }
    if (x === null) return null;
    d.palanca(null); d.gait('trot'); d.freeze(0); d.ubicar(x, 4, Math.PI / 2);
    const m = window.__medir(8, [], { nariz: true, contorno: true });
    m.x = x;
    return m;
  });
  if (!r3) ok(false, 'alambrado: no encontré una tranquera libre en z = −5,5');
  else {
    const minZ3 = Math.min(...r3.poses.map((p) => p.cz));
    console.log(`  al trote por la tranquera de x = ${r3.x.toFixed(1)}: el caballo llega a z = ${minZ3.toFixed(1)}`);
    ok(minZ3 < -9, `tranquera: el caballo no la cruza (llega a z = ${minZ3.toFixed(1)})`);
    ok(r3.cruces === 0, `tranquera: al pasar toca un poste o la hoja (${r3.cruces} cuadros)`);
  }
}

// ---------- consola ----------
console.log('\nConsola:', page.mensajes.length ? '\n  ' + page.mensajes.join('\n  ') : 'sin errores ni advertencias');
ok(page.mensajes.length === 0, `${page.mensajes.length} mensajes de error o advertencia en la consola`);

// ---------- segunda carga (con caché) ----------
await page.reload({ waitUntil: 'load' });
await page.waitForFunction(() => window.__debug && window.__debug.ready, null, { timeout: 120000 });
await page.evaluate(() => window.__debug.ready);
const t2 = await page.evaluate(() => window.__debug.state().tiempos.total);
console.log(`\nSegunda carga: ${t2} ms`);
if (t2 >= 600) avisos.push(`segunda carga en ${t2} ms (objetivo 600)`);

await browser.close();
if (avisos.length) console.log('\nAvisos:\n  - ' + avisos.join('\n  - '));
console.log(fallas.length ? `\nRESULTADO: CON PROBLEMAS (${fallas.length})\n  - ${fallas.join('\n  - ')}` : '\nRESULTADO: OK');
process.exit(fallas.length ? 1 : 0);
