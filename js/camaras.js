// Cámaras: vista exterior (OrbitControls), vista de atrás ('seguir': de arriba y atrás, sigue al caballo con un
// poco de retraso al doblar, como la cámara de un juego de carreras) y vista desde la montura (arrastre para
// mirar), más una cámara fija para capturas de prueba (solo la usa window.__debug).
// Vista desde la montura: el ojo del jinete va sentado en lo hondo del asiento (jinete.ojo, lo mide
// js/montura.js sobre la montura) y se mece con la marcha según montura.jinete (marcha, fase y giro); al
// doblar, la mirada acompaña un poco hacia el lado del giro.
import { V, lerp } from './util.js';

export const VISTAS = ['out', 'seguir', 'rider'];

export function crearCamaras({ stage, renderer, camera, controls, body, hands, jinete, pose, onCambio }) {
  // ojo de un jinete sentado: ~0,76 m sobre lo hondo del asiento, un poco atrás (de reserva si no hay jinete.ojo)
  const eyeLocal = jinete && jinete.ojo ? jinete.ojo.clone() : new V(-0.01, 2.38, 0);
  const PITCH0 = -0.40;   // arranca mirando el camino, con orejas, crin y cabeza de la montura en cuadro
  const st = { view: 'out', yaw: 0, pitch: PITCH0, fija: null, yawS: 0, pitchS: 0 };
  let drag = null;

  // vista desde la montura: corre la imagen hacia arriba lo que tapa el panel de abajo (con su margen; hasta
  // el 40 % del alto). El panel cambia de alto (plegable, compacto en esta vista): un ResizeObserver lo sigue.
  let dock = null;
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => applyOffset()) : null;
  function buscarPanel() {
    if (dock && dock.isConnected) return dock;
    if (dock && ro) ro.unobserve(dock);
    dock = document.querySelector('.dock');
    if (dock && ro) ro.observe(dock);
    return dock;
  }
  function tapaPanel(h) {
    const d = buscarPanel();
    if (!d) return 0;
    const rs = stage.getBoundingClientRect(), rd = d.getBoundingClientRect();
    if (rd.height === 0) return 0;   // oculto
    if (rd.top < rs.top + 0.5 * h) return Math.min(rd.height, 0.4 * h);   // no está abajo
    return Math.max(0, Math.min(rs.bottom - rd.top, 0.4 * h));
  }
  function applyOffset() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (st.view !== 'out' && !st.fija) camera.setViewOffset(w, h, 0, Math.round(tapaPanel(h)), w, h);
    else camera.clearViewOffset();
  }
  buscarPanel();

  // en pantallas angostas (celular vertical) se abre el campo para que entren el camino y las manos
  const fovMontura = () => { const a = stage.clientWidth / Math.max(1, stage.clientHeight); return 75 + 22 * Math.max(0, Math.min(1, (1 - a) / 0.5)); };

  function encuadreExterior() {
    // en pantallas altas y angostas la cámara se aleja para que entre el caballo entero
    const asp = stage.clientWidth / Math.max(1, stage.clientHeight);
    const kd = Math.max(1, 0.5 + 0.75 / asp);
    const ty = stage.clientWidth < 560 ? 0.55 : 0.85;
    controls.target.set(0.05, ty, 0);
    camera.position.set(0.05 + 3.95 * kd, ty + 0.9 * kd, 4.7 * kd);
  }

  // vista de atrás: más abierta en pantallas angostas para que entre el caballo entero
  const fovSeguir = () => { const a = stage.clientWidth / Math.max(1, stage.clientHeight); return 42 + 26 * Math.max(0, Math.min(1, (1.2 - a) / 0.7)); };
  const fovDe = (v) => (v === 'rider' ? fovMontura() : v === 'seguir' ? fovSeguir() : 30);

  function setView(v) {
    if (!VISTAS.includes(v)) v = 'out';
    st.view = v;
    onCambio(v);
    hands.forEach((h) => { h.visible = v === 'rider'; });
    drag = null;
    controls.enabled = v === 'out' && !st.fija;
    camera.fov = fovDe(v);
    camera.near = v === 'rider' ? 0.03 : 0.1;
    if (v === 'seguir') { st.yawS = 0; st.pitchS = 0; rumboCam = pose ? pose.rumbo : 0; }
    applyOffset();
    camera.updateProjectionMatrix();
    if (v === 'out') {
      controls.autoRotate = false;
      encuadreExterior();
    }
  }

  // arrastre para mirar (montura) o para girar la cámara alrededor del caballo (vista de atrás): un solo dedo
  // (el primero); los demás punteros se ignoran
  const cvs = renderer.domElement;
  cvs.addEventListener('pointerdown', (e) => {
    if (st.view === 'out' || drag) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    try { cvs.setPointerCapture(e.pointerId); } catch (err) { /* puntero ya liberado */ }
  });
  cvs.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id || st.view === 'out') return;
    if (st.view === 'rider') {
      st.yaw = Math.max(-2.6, Math.min(2.6, st.yaw - (e.clientX - drag.x) * 0.005));
      st.pitch = Math.max(-1.25, Math.min(0.45, st.pitch - (e.clientY - drag.y) * 0.004));
    } else {
      st.yawS = Math.max(-Math.PI, Math.min(Math.PI, st.yawS - (e.clientX - drag.x) * 0.006));
      st.pitchS = Math.max(-0.35, Math.min(0.6, st.pitchS + (e.clientY - drag.y) * 0.004));
    }
    drag.x = e.clientX; drag.y = e.clientY;
  });
  const endDrag = (e) => { if (drag && (!e || e.pointerId === undefined || e.pointerId === drag.id)) drag = null; };
  cvs.addEventListener('pointerup', endDrag);
  cvs.addEventListener('pointercancel', endDrag);
  cvs.addEventListener('lostpointercapture', endDrag);
  window.addEventListener('blur', () => { drag = null; });
  document.addEventListener('visibilitychange', () => { if (document.hidden) drag = null; });

  const eyeW = new V(), lookW = new V();
  function updateRiderCamera() {
    const j = jinete;
    eyeW.copy(eyeLocal);
    if (j) { eyeW.x += j.x; eyeW.y += j.y; eyeW.z += j.z; }
    const yReposo = eyeW.y;
    body.localToWorld(eyeW);
    // el asiento y la cintura absorben parte del rebote del lomo
    eyeW.y = lerp(yReposo, eyeW.y, 0.7);
    camera.position.copy(eyeW);
    // la mirada sigue un poco el cabeceo del caballo y el del jinete; al doblar acompaña hacia ese lado
    const giro = j ? j.giro : 0;
    const yaw = st.yaw - Math.max(-0.3, Math.min(0.3, 0.45 * giro));
    const pitch = st.pitch + body.rotation.z * 0.25 + (j ? j.cabeceo : 0);
    const cp = Math.cos(pitch);
    lookW.set(eyeW.x + cp * Math.cos(yaw), eyeW.y + Math.sin(pitch), eyeW.z + cp * Math.sin(yaw));
    camera.lookAt(lookW);
    // rolido: parte del del caballo (body.rotation.x = −rolido) más el vaivén del jinete (+ = hacia la izquierda)
    camera.rotateZ(-body.rotation.x * 0.6 + (j ? j.rolido : 0));
  }

  // vista de atrás. Marco del caballo (mira a +x): la cámara va atrás (−x) y arriba y mira un poco adelante de la
  // cruz. Al doblar, el rumbo de la cámara sigue al del caballo con retraso, así se ve al caballo girar dentro del
  // cuadro; lo que el usuario la gira arrastrando vuelve solo al centro cuando la suelta.
  let rumboCam = 0, tPrev = 0;
  const camPos = new V(), camMira = new V(), MIRA = new V(0.35, 1.05, 0);
  const envolverAng = (a) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
  function updateSeguir() {
    const ahora = performance.now(), dt = tPrev ? Math.min(0.1, (ahora - tPrev) / 1000) : 0;
    tPrev = ahora;
    const rumbo = pose ? pose.rumbo : 0;
    rumboCam = rumbo + envolverAng(rumboCam - rumbo) * Math.exp(-dt * 2.2);
    if (!drag) { st.yawS *= Math.exp(-dt * 0.9); st.pitchS *= Math.exp(-dt * 0.9); }
    const a = envolverAng(rumboCam - rumbo) + st.yawS;
    // más lejos en pantallas altas y angostas, para que entre el caballo entero
    const asp = stage.clientWidth / Math.max(1, stage.clientHeight);
    const k = Math.max(1, 0.8 + 0.25 / asp);
    const D = 5.0 * k, H = (2.85 + 1.8 * st.pitchS) * k;
    camPos.set(MIRA.x - D * Math.cos(a), H, MIRA.z + D * Math.sin(a));
    camera.position.copy(camPos);
    camMira.copy(MIRA);
    camera.lookAt(camMira);
  }

  // resize: en celular la barra de direcciones cambia el alto a cada rato; el encuadre exterior solo se
  // rehace cuando cambia el ancho de verdad (girar el teléfono, otra ventana), así no salta la vista
  let anchoPrevio = -1;
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    if (st.view !== 'out' && !st.fija) camera.fov = fovDe(st.view);
    const cambioAncho = anchoPrevio >= 0 && Math.abs(w - anchoPrevio) > 1;
    anchoPrevio = w;
    if (cambioAncho && st.view === 'out' && !st.fija) controls.target.y = w < 560 ? 0.55 : 0.85;
    applyOffset();
    camera.updateProjectionMatrix();
  }

  // cámara fija {pos, target, fov} para capturas; null vuelve a la vista normal
  const fijaTarget = new V();
  function setFija(f) {
    st.fija = f;
    if (f) {
      if (st.view === 'rider') setView('out');
      controls.enabled = false;
      camera.fov = f.fov || 30; camera.near = 0.05;
      camera.position.set(...f.pos);
      fijaTarget.set(...f.target);
      camera.lookAt(fijaTarget);
      applyOffset();
      camera.updateProjectionMatrix();
    } else {
      setView(st.view);
    }
  }

  function update() {
    if (st.fija) camera.lookAt(fijaTarget);
    else if (st.view === 'rider') updateRiderCamera();
    else if (st.view === 'seguir') updateSeguir();
    else { tPrev = 0; controls.update(); }
  }

  return { st, setView, resize, update, setFija };
}
