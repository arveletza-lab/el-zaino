// Arranque, botones, teclado, bucle de animación y mensaje de carga.
// El orden de construcción (escena → texturas → caballo → montura → campo) es el del prototipo:
// no cambiarlo, porque rnd() tiene semilla fija (ver CLAUDE.md).
import { crearEscena } from './escena.js';
import { crearTexturasCaballo } from './texturas.js';
import { construirCaballo } from './caballo.js';
import { construirMontura } from './montura.js';
import { construirCampo } from './campo.js';
import { crearMarcha, etiqueta } from './marchas.js';
import { crearCamaras, VISTAS } from './camaras.js';
import { cargarCuerpo, empacar, gzip, hashFuentes } from './horneado.js';
import { crearLocomocion } from './locomocion.js';
import { crearPalanca } from './palanca.js';

// window.__debug: solo en local, nunca en GitHub Pages
const DEBUG = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
let avisarListo = null, avisarFalla = null;
if (DEBUG) {
  window.__debug = { ready: new Promise((ok, mal) => { avisarListo = ok; avisarFalla = mal; }) };
  window.__debug.ready.catch(() => {});   // si el arranque falla, solo lo ven quienes esperan ready
}

// el cuerpo horneado se empieza a bajar enseguida, en paralelo con todo lo demás
// (?generar, solo en local, lo ignora y lo genera: lo usa tools/qa/hornear.mjs)
const generar = DEBUG && new URLSearchParams(location.search).has('generar');
const cuerpoListo = generar ? Promise.resolve(null) : cargarCuerpo({ local: DEBUG }).catch((e) => {
  console.warn('No se pudo usar el cuerpo horneado, se genera en el momento:', e.message);
  return null;
});

// ---------- mensaje de carga y de error ----------
const loadingEl = document.getElementById('loading');
const loadingMsg = document.getElementById('loading-msg');
const loadingBtn = document.getElementById('loading-retry');
loadingBtn.addEventListener('click', () => location.reload());
function mostrarFalla(texto, { boton = true } = {}) {
  loadingMsg.textContent = texto;
  loadingBtn.hidden = !boton;
  loadingEl.classList.add('falla');
  loadingEl.hidden = false;
  document.body.classList.add('sin-escena');
}
function textoDeFalla(e) {
  const m = (e && e.message) || String(e);
  if (/webgl|context/i.test(m)) return 'No se pudo iniciar la escena 3D: tu navegador no tiene WebGL disponible. Probá activar la aceleración por hardware o abrir la página en otro navegador.';
  return 'No se pudo iniciar la escena 3D: ' + m;
}

// el mensaje "Modelando el caballo…" se pinta antes de la construcción
setTimeout(() => {
  iniciar().catch((e) => {
    console.error('Falló el arranque:', e);
    mostrarFalla(textoDeFalla(e));
    if (avisarFalla) avisarFalla(e);
  });
}, 30);

async function iniciar() {
  const stage = document.getElementById('stage');
  const sinMovimiento = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // tiempos de cada etapa de la carga, en ms (window.__debug.state().tiempos)
  const tiempos = {}, inicio = performance.now();
  let tMarca = inicio;
  const marca = (k) => { const t = performance.now(); tiempos[k] = Math.round(t - tMarca); tMarca = t; };
  const { renderer, scene, camera, controls, orientarSol } = crearEscena(stage); marca('escena');
  // si el navegador le saca el contexto a la página (falta de memoria de video, driver), se avisa y, si lo
  // devuelve, se recarga: rearmar todo a mano no vale la pena
  renderer.domElement.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    mostrarFalla('Se perdió el acceso a la placa de video. Esperando que vuelva…', { boton: true });
  });
  renderer.domElement.addEventListener('webglcontextrestored', () => location.reload());
  const tex = crearTexturasCaballo(); marca('texturas');
  const horneado = await cuerpoListo; marca('esperaCuerpo');
  const caballo = construirCaballo({ scene, ...tex, horneado }); marca('caballo');
  const buildMs = tiempos.caballo;
  // los arreos son los objetos que construirMontura agrega al caballo (para poder ocultarlos en las pruebas)
  const antesArreos = new Set(); caballo.horse.traverse((o) => antesArreos.add(o));
  const montura = construirMontura({ caballo, coatBump: tex.coatBump }); marca('montura');
  const arreos = []; caballo.horse.traverse((o) => { if (!antesArreos.has(o) && o.isMesh) arreos.push(o); });
  const campo = construirCampo({ scene, renderer, darkMat: caballo.darkMat }); marca('campo');
  const marcha = crearMarcha();
  // con movimiento reducido el caballo arranca quieto (antes de crear la locomoción, para que empiece parado)
  if (sinMovimiento) marcha.setYa('stand');
  const { legs } = caballo;
  let time = 0, speed = 1, paused = false;

  // ---------- interfaz ----------
  const cadenceEl = document.getElementById('cadence');
  const btns = [...document.querySelectorAll('.gaits button')];
  function marcarBotones(name) { btns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.gait === name))); }
  function setGait(name) {
    marcha.setTarget(name);
    marcarBotones(name);
    mostrarEtiqueta();
  }
  // el panel dice la marcha elegida (y en el galope si es tendido y la mano). La etiqueta de marchas.js trae
  // el nombre entre <b>…</b>: se arma con nodos, sin innerHTML. #cadence es una región viva: solo se toca si
  // el texto cambia, para no repetir el anuncio.
  let manoEtiqueta = 1;
  function mostrarEtiqueta() {
    const txt = etiqueta(marcha.nombre, marcha.tendido, manoEtiqueta, marcha.real);
    const m = /^<b>(.*?)<\/b>(.*)$/s.exec(txt);
    const nombre = m ? m[1] : '', resto = m ? m[2] : txt.replace(/<[^>]*>/g, '');
    if (cadenceEl.textContent === nombre + resto) return;
    const b = document.createElement('b'); b.textContent = nombre;
    cadenceEl.replaceChildren(b, document.createTextNode(resto));
  }
  btns.forEach((b) => b.addEventListener('click', () => setGait(b.dataset.gait)));
  marcarBotones(marcha.nombre);
  mostrarEtiqueta();

  const speedEl = document.getElementById('speed'), speedOut = document.getElementById('speed-out');
  speedEl.addEventListener('input', () => { speed = parseFloat(speedEl.value); speedOut.textContent = speed.toFixed(1) + '×'; });
  // con el mouse o el dedo, al soltar el control de velocidad se le saca el foco para que las flechas vuelvan a
  // conducir; si se llegó con Tab, las flechas lo ajustan (como cualquier control) y la ayuda lo explica
  let speedPuntero = false;
  speedEl.addEventListener('pointerdown', () => { speedPuntero = true; });
  const soltarSpeed = () => { if (speedPuntero) { speedPuntero = false; speedEl.blur(); } };
  speedEl.addEventListener('pointerup', soltarSpeed);
  speedEl.addEventListener('pointercancel', soltarSpeed);
  speedEl.addEventListener('change', soltarSpeed);
  const spinBtn = document.getElementById('spin');
  spinBtn.addEventListener('click', () => {
    controls.autoRotate = !controls.autoRotate;
    spinBtn.setAttribute('aria-pressed', String(controls.autoRotate));
  });

  // conducción: palanca (vista desde la montura) y flechas del teclado; locomoción en el suelo
  // el control de la vista de la palanca (▲ ▼) inclina la vista como arrastrarla hacia arriba o hacia abajo
  const palanca = crearPalanca({ contenedor: document.body, onInclinar: (d) => palanca.inclinacion(camaras.inclinar(d)) });
  const loco = crearLocomocion({ caballo, marcha, setGait, campo });
  let entradaDebug = null;

  // panel compacto en la vista desde la montura: marchas, volver y "Más" (apoyos, descripción y velocidad)
  const dockEl = document.getElementById('dock'), masBtn = document.getElementById('mas');
  function abrirDock(si) {
    dockEl.classList.toggle('abierto', si);
    masBtn.setAttribute('aria-expanded', String(si));
    masBtn.setAttribute('aria-label', si ? 'Menos controles' : 'Más controles');
  }
  masBtn.addEventListener('click', () => abrirDock(masBtn.getAttribute('aria-expanded') !== 'true'));
  // compacto: siempre desde la montura; en la vista exterior, solo en pantallas bajas (celular horizontal)
  const pantallaBaja = window.matchMedia ? window.matchMedia('(max-height: 500px)') : { matches: false };
  let montado = false;
  function ponerCompacto() {
    const c = montado || pantallaBaja.matches;
    if (!c) abrirDock(false);
    document.body.classList.toggle('compacto', c);
    masBtn.hidden = !c;
  }
  if (pantallaBaja.addEventListener) pantallaBaja.addEventListener('change', ponerCompacto);

  const hintEl = document.getElementById('hint');
  const AYUDA = {
    out: 'Arrastrá para girarlo · rueda o pellizco para acercar · flechas para conducir',
    rider: 'Palanca o flechas: arriba acelera, abajo frena, a un costado dobla · arrastrá la vista para mirar',
    seguir: 'Palanca o flechas: arriba acelera, abajo frena, a un costado dobla · arrastrá para girar la cámara',
    speed: 'Las flechas ajustan la velocidad · Tab para salir y volver a conducir con las flechas'
  };
  const ponerAyuda = () => {
    const enSpeed = document.activeElement === speedEl && speedEl.matches(':focus-visible');
    hintEl.textContent = enSpeed ? AYUDA.speed : AYUDA[camaras.st.view];
    document.body.classList.toggle('ayuda-speed', enSpeed);
  };
  speedEl.addEventListener('focus', () => ponerAyuda());
  speedEl.addEventListener('blur', () => ponerAyuda());
  const vToggle = document.getElementById('v-toggle'), vLabel = document.getElementById('v-label'), vCorto = document.getElementById('v-corto');
  const NOMBRE_VISTA = { out: 'vista libre', seguir: 'vista de atrás', rider: 'desde la montura' };
  const SIGUIENTE = {
    out: { largo: 'Ver desde atrás', corto: 'Atrás' },
    seguir: { largo: 'Ver desde la montura', corto: 'Montura' },
    rider: { largo: 'Vista libre', corto: 'Libre' }
  };
  const camaras = crearCamaras({
    stage, renderer, camera, controls, body: caballo.body, hands: montura.hands, jinete: montura.jinete, pose: loco.pose,
    onCambio(v) {
      // vistas para manejar (de atrás y desde la montura): palanca y panel compacto
      montado = v !== 'out';
      const sig = SIGUIENTE[v];
      vLabel.textContent = sig.largo;
      vCorto.textContent = sig.corto;
      vToggle.setAttribute('aria-label', `Cambiar de vista (ahora: ${NOMBRE_VISTA[v]}). ${sig.largo}`);
      spinBtn.hidden = montado;
      document.body.classList.toggle('montado', montado);
      abrirDock(false);
      ponerCompacto();
      palanca.mostrar(montado);
      if (montado) palanca.inclinacion(camaras.inclinacion());
      if (!montado) spinBtn.setAttribute('aria-pressed', 'false');
      // (camaras.st.view todavía puede no estar actualizado cuando se llama onCambio)
      hintEl.textContent = AYUDA[v];
    }
  });
  // el botón de vista (y la tecla V) pasa por las tres vistas: exterior → de atrás → montura → exterior
  const toggleView = () => camaras.setView(VISTAS[(VISTAS.indexOf(camaras.st.view) + 1) % VISTAS.length]);
  vToggle.addEventListener('click', toggleView);

  // teclado: 1 a 4 marchas, V vista (las flechas las lee la palanca). Sin modificadores ni repetición
  // (mantener V apretada no alterna sin parar) y nunca mientras se escribe en un campo de texto.
  const TECLAS = { '1': 'stand', '2': 'walk', '3': 'trot', '4': 'gallop' };
  const escribiendo = (t) => t instanceof Element &&
    !!t.closest('textarea, select, [contenteditable]:not([contenteditable="false"]), input:not([type="range"]):not([type="button"]):not([type="checkbox"]):not([type="radio"])');
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat || e.isComposing || escribiendo(e.target)) return;
    if (TECLAS[e.key]) setGait(TECLAS[e.key]);
    else if (e.key === 'v' || e.key === 'V') toggleView();
    else if (e.key === 'r' || e.key === 'R') reiniciar();
  });

  // aviso de obstáculo: mientras un alambrado, árbol, rancho u oveja impide avanzar (loco.bloqueado). Si la locomoción todavía no
  // expone la propiedad, se consulta su estado() unas veces por segundo.
  const avisoEl = document.getElementById('aviso');
  let bloqT = 0, bloqVisto = false, avisoOn = false, avisoResto = 0;
  function revisarBloqueo(dt) {
    let bloq;
    if (typeof loco.bloqueado === 'boolean') bloq = loco.bloqueado === true;
    else {
      bloqT -= dt;
      if (bloqT <= 0) { bloqT = 0.25; bloqVisto = !!(loco.estado && loco.estado().bloqueado === true); }
      bloq = bloqVisto;
    }
    // queda al menos 1,5 s y se va 0,6 s después de liberarse, para que no parpadee
    if (bloq) avisoResto = Math.max(avisoResto - dt, avisoOn ? 0.6 : 1.5);
    else avisoResto -= dt;
    const on = bloq || avisoResto > 0;
    if (on === avisoOn) return;
    avisoOn = on;
    avisoEl.textContent = on ? 'Hay un obstáculo adelante: doblá para seguir' : '';
    avisoEl.classList.toggle('visible', on);
  }

  // reinicio (por si el caballo queda trancado): vuelve al punto de partida, sobre el camino, quieto y mirando
  // por el camino; la vista se mantiene
  function reiniciar() {
    entradaDebug = null;
    setGait('stand'); marcha.setYa('stand');
    loco.reiniciar(0);
    campo.actualizar(loco.pose, 0, time);
    orientarSol(0);
    if (camaras.st.view === 'out') camaras.setView('out');
    revisarBloqueo(10);
  }
  document.getElementById('reiniciar').addEventListener('click', reiniciar);

  const footEls = loco.patas.map((q) => document.getElementById('f-' + q.id));
  window.addEventListener('resize', camaras.resize);
  camaras.resize();
  camaras.setView('out');

  // ---------- un paso de animación ----------
  // la locomoción planifica las pisadas en el suelo y deja la pose aplicada en el caballo; el campo se mueve con
  // la pose del suelo; el indicador de apoyos muestra las patas apoyadas
  function step(dt) {
    time += dt;
    loco.conducir(entradaDebug || palanca.leer(), dt);
    loco.paso(dt, speed, time);
    palanca.rumbo(loco.pose.rumbo);
    if (montado) palanca.inclinacion(camaras.inclinacion());   // también sigue el arrastre (solo cambia si cambia el nivel)
    campo.actualizar(loco.pose, dt, time);
    orientarSol(loco.pose.rumbo);
    loco.patas.forEach((q, i) => footEls[i].classList.toggle('on', q.apoyado));
    revisarBloqueo(dt);
    if (loco.etiquetaCambio() || (marcha.nombre === 'gallop' && loco.mano !== manoEtiqueta)) { manoEtiqueta = loco.mano; mostrarEtiqueta(); }
    montura.actualizarMontura(camaras.st.view, loco.cur, loco.fase, loco.pose);
  }
  function render() {
    camaras.update();
    renderer.render(scene, camera);
  }

  let fps = 0, frames = 0, fpsT0 = performance.now();
  const clock = new THREE.Clock();
  function tick() {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!paused) step(dt);
    render();
    frames++;
    const now = performance.now();
    if (now - fpsT0 >= 1000) { fps = frames * 1000 / (now - fpsT0); frames = 0; fpsT0 = now; }
    requestAnimationFrame(tick);
  }
  renderer.compile(scene, camera); marca('compilar');
  tick(); marca('primerCuadro');
  tiempos.total = Math.round(performance.now() - inicio);
  // desde que se empezó a cargar la página hasta el primer cuadro
  tiempos.desdeNavegacion = Math.round(performance.now());
  // (si mientras tanto se perdió el contexto, el aviso queda a la vista)
  if (!loadingEl.classList.contains('falla')) loadingEl.hidden = true;

  if (DEBUG) instalarDebug();

  // ---------- modo de prueba (solo localhost) ----------
  function instalarDebug() {
    const PRESETS = {
      'perfil-izq': { pos: [0.22, 1.6, -4.4], target: [0.22, 1.04, 0], fov: 30 },
      'perfil-der': { pos: [0.22, 1.6, 4.4], target: [0.22, 1.04, 0], fov: 30 },
      'tres-cuartos': { pos: [3.8, 1.55, -4.4], target: [0.1, 1.0, 0], fov: 30 },
      'frente': { pos: [5.5, 1.5, 0], target: [0.4, 1.1, 0], fov: 30 },
      'atras': { pos: [-5.5, 1.6, 0], target: [0, 1.05, 0], fov: 30 },
      'cabeza': { pos: [2.45, 2.0, -1.55], target: [1.42, 1.78, 0], fov: 30 },
      'patas': { pos: [0.0, 0.55, -4.0], target: [0.0, 0.5, 0], fov: 30 },
      'campo': { pos: [10, 4.5, 12], target: [-4, 1, -18], fov: 45 },
      // casi ortográfica, con la misma escala y encuadre que referencias/fotos/foto-1 (2048x1151, cruz = 1,60 m):
      // capturar a 2048x1151 y superponer con tools/qa/superponer.mjs
      'foto-1': { pos: [0.298, 1.0555, -60], target: [0.298, 1.0555, 0], fov: 2.2545 }
    };
    const ORDEN = ['MI', 'MD', 'PI', 'PD'];
    // vértices del borde inferior del casco, para medir si se hunde
    const suelas = legs.map((leg) => {
      const pts = [];
      leg.hoof.traverse((o) => {
        if (!o.isMesh) return;
        const hp = o.geometry.attributes.position;
        let mn = Infinity;
        for (let i = 0; i < hp.count; i++) mn = Math.min(mn, hp.getY(i));
        for (let i = 0; i < hp.count; i++) if (hp.getY(i) < mn + 0.004) pts.push(new THREE.Vector3(hp.getX(i), hp.getY(i), hp.getZ(i)));
      });
      return pts;
    });
    const centroSuela = new THREE.Vector3(0.02, -caballo.HOOF_H, 0), tmp = new THREE.Vector3();
    const aSuelo = (x, z) => {
      const p = loco.pose, c = Math.cos(p.rumbo), s = Math.sin(p.rumbo);
      return { x: p.x + x * c + z * s, z: p.z - x * s + z * c };
    };
    const pose0 = () => { if (paused) step(0); };
    let fondo = null;

    Object.assign(window.__debug, {
      gait(nombre) {
        if (!['stand', 'walk', 'trot', 'gallop'].includes(nombre)) throw new Error('marcha desconocida: ' + nombre);
        setGait(nombre); marcha.setYa(nombre); loco.establecer(); pose0();
      },
      // congela la marcha actual en régimen, en línea recta, con la pose del suelo en 0 y el reloj en `fase`
      freeze(fase) {
        if (fase === null || fase === undefined) { paused = false; return; }
        paused = true; time = 0; entradaDebug = null; loco.reiniciar(fase); orientarSol(0);
        step(0); render();
      },
      // pone el caballo en (x, z) del suelo con ese rumbo, andando en régimen
      ubicar(x, z, rumbo = 0) { loco.ubicar(x, z, rumbo); step(0); render(); },
      galopeTendido(si = true) { marcha.tendido = !!si && marcha.nombre === 'gallop'; loco.establecer(); mostrarEtiqueta(); pose0(); },
      bloqueado: (x0, z0, x1, z1) => campo.bloqueado(x0, z0, x1, z1),
      solidoEn: (x, z, r = 0) => campo.solidoEn(x, z, r),
      toca: (margen = 0) => loco.toca(margen),
      // contorno del caballo (visto desde arriba) en el suelo, con un margen opcional (m)
      contorno: (margen = 0) => loco.contorno(margen),
      alambrados: () => campo.alambrados,
      view(nombre) { camaras.setView(VISTAS.includes(nombre) ? nombre : 'out'); pose0(); },
      reiniciar() { reiniciar(); },
      cam(p) {
        const f = p == null ? null : typeof p === 'string' ? PRESETS[p] : { fov: 30, ...p };
        if (p != null && !f) throw new Error('preset desconocido: ' + p);
        document.body.classList.toggle('debug-cam', !!f);
        camaras.setFija(f); pose0(); render();
      },
      // modo silueta: solo el caballo sobre fondo plano; arreos: false también oculta montura y cabezada
      soloCaballo(on, conArreos = true) {
        if (!fondo) fondo = { bg: scene.background, fog: scene.fog, vis: new Map() };
        scene.children.forEach((o) => {
          if (o === caballo.horse || o.isLight) return;
          if (!fondo.vis.has(o)) fondo.vis.set(o, o.visible);
          o.visible = on ? false : fondo.vis.get(o);
        });
        arreos.forEach((m) => { m.visible = !on || conArreos; });
        scene.background = on ? new THREE.Color(0xff00ff) : fondo.bg;
        scene.fog = on ? null : fondo.fog;
        if (on && !conArreos) montura.hands.forEach((h) => { h.visible = false; });
        render();
      },
      // simula la palanca: palanca(x, y) con x derecha +, y adelante +; palanca(null) la suelta
      palanca(x, y) { entradaDebug = x == null ? null : { x, y, activa: true }; },
      look(yaw, pitch) { camaras.st.yaw = yaw; camaras.st.pitch = pitch; },
      sim(segundos) {
        const n = Math.round(segundos * 120);
        for (let i = 0; i < n; i++) step(1 / 120);
        render();
      },
      state() {
        const e = loco.estado();
        return {
          gait: marcha.nombre, phase: loco.fase, view: camaras.st.view,
          apoyos: ORDEN.map((id) => loco.patas.find((q) => q.id === id).apoyado),
          marcha: e, mano: e.mano, tendido: marcha.tendido, groundSpeed: loco.pose.velocidad, buildMs, tiempos: { ...tiempos, cuerpo: caballo.tiemposCuerpo }, horneado: caballo.horneado, pose: { ...loco.pose }, time,
          cuerpo: { y: caballo.body.position.y, rot: caballo.body.rotation.z, rolido: -caballo.body.rotation.x, cuello: caballo.neckPivot.rotation.z, cuelloLat: caballo.neckPivot.rotation.y }
        };
      },
      stats() {
        return { drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles, fps, bodyVerts: caballo.NV, programas: renderer.info.programs.length, listaProgramas: renderer.info.programs.map((p) => p.name) };
      },
      // cascos en el SUELO: centro de la suela (o la pinza durante el breakover), si está apoyado y el punto más bajo
      hooves() {
        return ORDEN.map((id) => {
          const k = legs.findIndex((l) => l.id === id), leg = legs[k], q = loco.patas.find((p) => p.id === id);
          leg.hoof.updateMatrixWorld(true);
          const c = leg.hoof.localToWorld(tmp.copy(centroSuela));
          const out = { id, apoyado: q.apoyado, x: c.x, y: c.y, z: c.z, incl: leg.inclinacion || 0 };
          const g = aSuelo(c.x, c.z); out.sx = g.x; out.sz = g.z;
          const t = leg.hoof.localToWorld(tmp.copy(caballo.patas[k].pinza));
          const gp = aSuelo(t.x, t.z); out.px = gp.x; out.pz = gp.z; out.pinzaY = t.y;
          let minY = Infinity;
          for (const v of suelas[k]) minY = Math.min(minY, leg.hoof.localToWorld(tmp.copy(v)).y);
          out.minY = minY;
          return out;
        });
      },
      // articulaciones en reposo de cada pata (m): W codo o babilla, J rodilla o corvejón, F menudillo, H corona
      huesos() {
        const r = (v) => [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)];
        return legs.map((l) => ({ id: l.id, W: r(l.rest.W), J: r(l.rest.J), F: r(l.rest.F), H: r(l.rest.H) }));
      },
      // cuerpo empacado y comprimido, en base64 (lo usa tools/qa/hornear.mjs, con la página abierta con ?generar)
      async exportarCuerpo() {
        const bin = new Uint8Array(await gzip(empacar(caballo.cuerpo, await hashFuentes())));
        let txt = ''; for (let i = 0; i < bin.length; i += 0x8000) txt += String.fromCharCode(...bin.subarray(i, i + 0x8000));
        return btoa(txt);
      },
      presets: Object.keys(PRESETS)
    });
    avisarListo();
  }
}
