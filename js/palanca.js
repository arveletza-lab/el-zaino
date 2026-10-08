// Palanca de conducción tipo arcade (visible en la vista desde la montura) y flechas del teclado
// (andan en las dos vistas). Interfaz (ver docs/rediseno-v2.md):
//   const palanca = crearPalanca({ contenedor: document.body });
//   palanca.leer()        -> { x: -1..1 (derecha +), y: -1..1 (adelante +), activa }
//   palanca.mostrar(bool) -> muestra u oculta la palanca en pantalla
//   palanca.rumbo(rad)    -> opcional: muestra la brújula con el rumbo (rad, crece al doblar a la izquierda)
//   palanca.inclinacion(v) -> muestra la inclinación de la vista (−1 abajo … 1 arriba) en el control de la vista
// Control de la vista, arriba de la palanca: botones ▼ ▲ que hacen lo mismo que arrastrar la vista hacia abajo o
// hacia arriba (un paso al tocar, sigue mientras se mantiene apretado) y las teclas Re Pág / Av Pág. Llama a
// onInclinar(delta) (+ = hacia arriba); quien lo recibe (js/main.js → camaras.inclinar) devuelve el nivel con
// palanca.inclinacion(v).
// La palanca no guarda la marcha: al soltarla vuelve al centro (y = 0) y la locomoción mantiene la marcha.

const NS = 'http://www.w3.org/2000/svg';
const FLECHAS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

// dibujo: base vista desde arriba y adelante (ELEV), vástago de largo L que se inclina hasta TILT_MAX
const ELEV = 42 * Math.PI / 180, SIN_E = Math.sin(ELEV), COS_E = Math.cos(ELEV);
const L = 58, TILT_MAX = 32 * Math.PI / 180, R_BASE = 50, ALTO_BASE = 8, R_BOLA = 16;
const VB = { x: -56, y: -76, w: 112, h: 128 };   // viewBox del dibujo
const CENTRO_Y = -L * COS_E;   // altura en pantalla de la bola en reposo (referencia del arrastre)
const ZONA_MUERTA = 0.15;      // fracción del recorrido en el centro que no hace nada
const RAMPA_TECLA = 1.5;       // s que tarda ↑ en llevar la palanca al tope
const Y_TOQUE = 0.2;           // ↑ apenas se toca: pide paso
const PASO_VISTA = 0.2;       // un toque de ▲ ▼ o de Re Pág / Av Pág (el rango es −1 … 1)
const VEL_VISTA = 0.9;        // por segundo, mientras se mantiene apretado (después de ESPERA_VISTA)
const ESPERA_VISTA = 0.35;    // s antes de empezar a moverse solo
const NIVELES = 9;             // marcas del indicador

function el(tag, attrs = {}, padre) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (padre) padre.appendChild(n);
  return n;
}

function construirSvg() {
  const svg = el('svg', { viewBox: `${VB.x} ${VB.y} ${VB.w} ${VB.h}`, class: 'pl-svg', 'aria-hidden': 'true', focusable: 'false' });
  const defs = el('defs', {}, svg);
  const g1 = el('radialGradient', { id: 'pl-bola', cx: '36%', cy: '30%', r: '72%' }, defs);
  el('stop', { offset: '0', 'stop-color': '#f0a07a' }, g1);
  el('stop', { offset: '0.45', 'stop-color': '#a64a22' }, g1);
  el('stop', { offset: '1', 'stop-color': '#5a220e' }, g1);
  const g2 = el('linearGradient', { id: 'pl-base', x1: '0', y1: '0', x2: '0', y2: '1' }, defs);
  el('stop', { offset: '0', 'stop-color': '#fbfaf8' }, g2);
  el('stop', { offset: '1', 'stop-color': '#e3e0db' }, g2);
  const g3 = el('linearGradient', { id: 'pl-canto', x1: '0', y1: '0', x2: '1', y2: '0' }, defs);
  el('stop', { offset: '0', 'stop-color': '#7a3418' }, g3);
  el('stop', { offset: '0.4', 'stop-color': '#9a4520' }, g3);
  el('stop', { offset: '1', 'stop-color': '#5e2410' }, g3);
  const f = el('filter', { id: 'pl-difuso', x: '-50%', y: '-50%', width: '200%', height: '200%' }, defs);
  el('feGaussianBlur', { stdDeviation: '3' }, f);

  const ry = R_BASE * SIN_E;
  // sombra de la base sobre el suelo, canto y tapa
  el('ellipse', { cx: 0, cy: ALTO_BASE + 4, rx: R_BASE + 2, ry: ry + 2, fill: 'rgba(30,34,38,.22)', filter: 'url(#pl-difuso)' }, svg);
  el('ellipse', { cx: 0, cy: ALTO_BASE, rx: R_BASE, ry, fill: 'url(#pl-canto)' }, svg);
  el('rect', { x: -R_BASE, y: 0, width: 2 * R_BASE, height: ALTO_BASE, fill: 'url(#pl-canto)' }, svg);
  el('ellipse', { cx: 0, cy: 0, rx: R_BASE, ry, fill: 'url(#pl-base)', stroke: 'rgba(30,34,38,.18)', 'stroke-width': 1 }, svg);
  // guía del recorrido y marcas de las cuatro direcciones
  el('ellipse', { cx: 0, cy: 0, rx: 29, ry: 29 * SIN_E, fill: 'none', stroke: 'rgba(30,34,38,.16)', 'stroke-width': 1.2, 'stroke-dasharray': '2 3' }, svg);
  const marca = (ang, color) => {
    const c = Math.cos(ang), s = Math.sin(ang), r = 40;
    const px = (u, v) => `${(c * u - s * v).toFixed(1)},${(-(s * u + c * v) * SIN_E).toFixed(1)}`;
    el('polygon', { points: [px(r + 5, 0), px(r - 2, -5), px(r - 2, 5)].join(' '), fill: color }, svg);
  };
  marca(Math.PI / 2, '#9a4520');                 // adelante
  marca(-Math.PI / 2, 'rgba(30,34,38,.45)');     // frenar
  marca(0, 'rgba(30,34,38,.45)');                // derecha
  marca(Math.PI, 'rgba(30,34,38,.45)');          // izquierda
  // sombra de la bola, fuelle, vástago y bola (se mueven)
  const sombra = el('ellipse', { rx: 13, ry: 13 * SIN_E, fill: 'rgba(30,34,38,.28)', filter: 'url(#pl-difuso)' }, svg);
  el('ellipse', { cx: 0, cy: 0, rx: 11, ry: 11 * SIN_E, fill: '#2b2f33' }, svg);
  el('ellipse', { cx: 0, cy: -1.2, rx: 7, ry: 7 * SIN_E, fill: '#454b51' }, svg);
  const vastago = el('line', { x1: 0, y1: 0, stroke: '#5d646b', 'stroke-width': 8, 'stroke-linecap': 'round' }, svg);
  const brillo = el('line', { x1: -1.6, y1: -1, stroke: '#d4d8dc', 'stroke-width': 2.2, 'stroke-linecap': 'round' }, svg);
  const bola = el('g', {}, svg);
  el('circle', { r: R_BOLA, fill: 'url(#pl-bola)' }, bola);
  el('ellipse', { cx: -5.5, cy: -7, rx: 6, ry: 4, fill: 'rgba(255,255,255,.55)', transform: 'rotate(-28 -5.5 -7)' }, bola);
  return { svg, sombra, vastago, brillo, bola };
}

function flecha(dir) {
  // flecha curva de doblar (dir = -1 izquierda, +1 derecha)
  const s = el('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' });
  const g = el('g', { transform: dir < 0 ? 'translate(24 0) scale(-1 1)' : '' }, s);
  el('path', { d: 'M5 19v-6a5 5 0 0 1 5-5h9' }, g);
  el('path', { d: 'M15 4l4 4-4 4' }, g);
  return s;
}

// flecha simple para el control de la vista (dir = +1 arriba, −1 abajo)
function chevron(dir) {
  const s = el('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' });
  el('path', { d: dir > 0 ? 'M6 15l6-6 6 6' : 'M6 9l6 6 6-6' }, s);
  return s;
}

// control de la vista: [▼] vista (nivel) [▲]
function construirVista(onInclinar) {
  const fila = document.createElement('div');
  fila.className = 'pl-cam';
  fila.setAttribute('role', 'group');
  fila.setAttribute('aria-label', 'Inclinación de la vista');
  const boton = (dir) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pl-cam-btn';
    b.setAttribute('aria-label', dir > 0 ? 'Mirar más arriba' : 'Mirar más abajo');
    b.setAttribute('aria-keyshortcuts', dir > 0 ? 'PageUp' : 'PageDown');
    b.appendChild(chevron(dir));
    // tocar: un paso; mantener apretado: sigue subiendo o bajando. Con el teclado (Enter, espacio) llega un
    // click sin puntero (detail 0): un paso.
    let raf = 0, t0 = 0, tPrev = 0, id = null;
    const cuadro = (t) => {
      const dt = Math.min(0.05, (t - tPrev) / 1000); tPrev = t;
      if ((t - t0) / 1000 > ESPERA_VISTA) onInclinar(dir * VEL_VISTA * dt);
      raf = requestAnimationFrame(cuadro);
    };
    const parar = (e) => {
      if (id === null || (e && e.pointerId !== id)) return;
      id = null; b.classList.remove('apretado');
      if (raf) cancelAnimationFrame(raf); raf = 0;
    };
    b.addEventListener('pointerdown', (e) => {
      if (id !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault(); e.stopPropagation();
      id = e.pointerId;
      try { b.setPointerCapture(id); } catch { /* sin captura */ }
      b.classList.add('apretado');
      onInclinar(dir * PASO_VISTA);
      t0 = tPrev = performance.now();
      raf = requestAnimationFrame(cuadro);
    });
    b.addEventListener('pointerup', parar);
    b.addEventListener('pointercancel', parar);
    b.addEventListener('lostpointercapture', parar);
    b.addEventListener('click', (e) => { if (e.detail === 0) onInclinar(dir * PASO_VISTA); });
    b.parar = () => parar();
    return b;
  };
  const bajar = boton(-1), subir = boton(1);
  const centro = document.createElement('span');
  centro.className = 'pl-cam-centro';
  const rotulo = document.createElement('span');
  rotulo.className = 'pl-rotulo'; rotulo.textContent = 'vista';
  const nivel = document.createElement('span');
  nivel.className = 'pl-cam-nivel'; nivel.setAttribute('aria-hidden', 'true');
  const marcas = [];
  for (let i = 0; i < NIVELES; i++) { const m = document.createElement('i'); nivel.appendChild(m); marcas.push(m); }
  centro.append(rotulo, nivel);
  const estado = document.createElement('span');
  estado.className = 'solo-lector'; estado.setAttribute('aria-live', 'polite');
  fila.append(bajar, centro, subir, estado);
  let ultimo = null;
  function mostrar(v) {
    const k = Math.round((Math.max(-1, Math.min(1, v)) + 1) / 2 * (NIVELES - 1));
    if (k === ultimo) return;
    ultimo = k;
    marcas.forEach((m, i) => m.classList.toggle('on', i <= k));
    // en el tope el botón se ve apagado pero sigue enfocable (disabled le sacaría el foco y el pointerup)
    subir.classList.toggle('tope', v >= 1); subir.setAttribute('aria-disabled', String(v >= 1));
    bajar.classList.toggle('tope', v <= -1); bajar.setAttribute('aria-disabled', String(v <= -1));
    estado.textContent = `Vista ${k === (NIVELES - 1) / 2 ? 'normal' : k > (NIVELES - 1) / 2 ? 'más arriba' : 'más abajo'}`;
  }
  return { fila, mostrar, parar: () => { subir.parar(); bajar.parar(); } };
}

export function crearPalanca({ contenedor = document.body, onInclinar = () => {} } = {}) {
  const sinMovimiento = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  // ---------- teclado ----------
  // cada tecla: { t0 (ms), leida, suelta }; un toque más corto que un cuadro igual se lee una vez
  const teclas = new Map();
  window.addEventListener('keydown', (e) => {
    if (!FLECHAS.includes(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
    // el control de velocidad (y cualquier campo) usa las flechas cuando tiene el foco
    if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
    e.preventDefault();
    const k = teclas.get(e.key);
    if (!k) teclas.set(e.key, { t0: performance.now(), leida: false, suelta: false });
    else k.suelta = false;
    despertar();
  });
  window.addEventListener('keyup', (e) => {
    const k = teclas.get(e.key);
    if (!k) return;
    if (k.leida) teclas.delete(e.key); else k.suelta = true;
    despertar();
  });
  window.addEventListener('blur', () => { teclas.clear(); soltarPuntero(); alt.parar(); });
  // Re Pág / Av Pág: inclinación de la vista (solo con la palanca a la vista: vistas de atrás y desde la montura)
  window.addEventListener('keydown', (e) => {
    if ((e.key !== 'PageUp' && e.key !== 'PageDown') || !visible || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
    e.preventDefault();
    onInclinar(e.key === 'PageUp' ? PASO_VISTA : -PASO_VISTA);
  });
  const alt = construirVista((d) => onInclinar(d));

  function leerTeclas() {
    const ahora = performance.now();
    let x = 0, y = 0;
    if (teclas.has('ArrowRight')) x += 1;
    if (teclas.has('ArrowLeft')) x -= 1;
    if (teclas.has('ArrowDown')) y = -1;
    else if (teclas.has('ArrowUp')) {
      const t = (ahora - teclas.get('ArrowUp').t0) / 1000;
      y = Math.min(1, Y_TOQUE + (1 - Y_TOQUE) * t / RAMPA_TECLA);
    }
    return { x, y, activa: teclas.size > 0 };
  }

  // ---------- elemento en pantalla ----------
  const raiz = document.createElement('div');
  raiz.className = 'palanca';
  raiz.hidden = true;
  // Las flechas conducen desde cualquier parte de la página, así que la palanca no necesita el foco para el
  // teclado. Igual es enfocable y tiene role="application": con un lector de pantalla, al enfocarla las flechas
  // le llegan a la página en vez de mover el cursor de lectura (es el único caso en que hace falta). Tab sale.
  raiz.tabIndex = 0;
  raiz.setAttribute('role', 'application');
  raiz.setAttribute('aria-roledescription', 'palanca');
  raiz.setAttribute('aria-label', 'Palanca para conducir');
  raiz.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown ArrowLeft ArrowRight');
  const instr = document.createElement('span');
  instr.id = 'pl-instrucciones'; instr.className = 'solo-lector';
  instr.textContent = 'Flechas: arriba acelera y sube de marcha, abajo frena, izquierda y derecha doblan. Con el mouse o el dedo, arrastrá la bola.';
  raiz.setAttribute('aria-describedby', instr.id);
  const arriba = document.createElement('span');
  arriba.className = 'pl-rotulo pl-arriba'; arriba.textContent = 'más rápido';
  const abajo = document.createElement('span');
  abajo.className = 'pl-rotulo pl-abajo'; abajo.textContent = 'frenar';
  const medio = document.createElement('div');
  medio.className = 'pl-medio';
  const izq = document.createElement('span'); izq.className = 'pl-flecha pl-izq'; izq.appendChild(flecha(-1));
  const der = document.createElement('span'); der.className = 'pl-flecha pl-der'; der.appendChild(flecha(1));
  const dib = construirSvg();
  medio.append(izq, dib.svg, der);
  // brújula: oculta hasta que alguien llame a rumbo()
  const brujula = document.createElement('div');
  brujula.className = 'pl-brujula'; brujula.hidden = true; brujula.setAttribute('aria-hidden', 'true');
  const svgBrujula = el('svg', { viewBox: '-12 -12 24 24', focusable: 'false' }, brujula);
  el('circle', { r: 11 }, svgBrujula);
  const aguja = el('g', { class: 'pl-aguja' }, svgBrujula);
  el('path', { d: 'M0 -8.5L2.6 0H-2.6Z' }, aguja);
  el('path', { class: 'sur', d: 'M0 8.5L2.6 0H-2.6Z' }, aguja);
  arriba.setAttribute('aria-hidden', 'true'); abajo.setAttribute('aria-hidden', 'true');
  raiz.append(alt.fila, arriba, medio, abajo, brujula, instr);
  // en el orden del foco va justo después del panel de controles
  const dock = contenedor.querySelector('.dock') || document.querySelector('.dock');
  if (dock && dock.parentNode === contenedor) dock.after(raiz); else contenedor.appendChild(raiz);

  // alto del panel de controles, para ubicar la palanca encima en pantallas angostas
  if (dock && window.ResizeObserver) {
    new ResizeObserver(() => document.documentElement.style.setProperty('--dock-h', dock.offsetHeight + 'px')).observe(dock);
  }

  // ---------- puntero (mouse, dedo, lápiz) ----------
  let puntero = null;   // { id }
  const valPuntero = { x: 0, y: 0 };
  function desdePuntero(e) {
    const r = dib.svg.getBoundingClientRect();
    const k = r.width / VB.w;                         // px por unidad del viewBox
    const cx = r.left - VB.x * k, cy = r.top + (CENTRO_Y - VB.y) * k;
    const radio = Math.max(38, 40 * k);              // recorrido completo en px
    let x = (e.clientX - cx) / radio, y = -(e.clientY - cy) / radio;
    const m = Math.hypot(x, y);
    if (m < ZONA_MUERTA) { x = 0; y = 0; }
    else {
      // zona muerta radial con reescala, y un poco de "riel" para ir derecho adelante o atrás
      const m2 = Math.min(1, (m - ZONA_MUERTA) / (1 - ZONA_MUERTA));
      x = x / m * m2; y = y / m * m2;
      if (Math.abs(x) < 0.1) x = 0;
      if (Math.abs(y) < 0.1) y = 0;
    }
    valPuntero.x = x; valPuntero.y = y;
  }
  raiz.addEventListener('pointerdown', (e) => {
    if (puntero || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (e.target instanceof Element && e.target.closest('.pl-cam')) { e.stopPropagation(); return; }   // control de la vista
    e.preventDefault(); e.stopPropagation();
    puntero = { id: e.pointerId };
    try { raiz.setPointerCapture(e.pointerId); } catch { /* sin captura */ }
    raiz.classList.add('agarrada');
    // si el foco estaba en un control que usa las flechas (velocidad), se lo saca para que conduzcan
    const act = document.activeElement;
    if (act && act !== raiz && act.matches && act.matches('input, select, textarea')) act.blur();
    desdePuntero(e);
    despertar();
  });
  raiz.addEventListener('pointermove', (e) => {
    if (!puntero || e.pointerId !== puntero.id) return;
    e.preventDefault();
    desdePuntero(e);
    despertar();
  });
  function soltarPuntero() {
    if (!puntero) return;
    try { raiz.releasePointerCapture(puntero.id); } catch { /* ya liberada */ }
    puntero = null;
    valPuntero.x = 0; valPuntero.y = 0;
    raiz.classList.remove('agarrada');
    despertar();
  }
  const fin = (e) => { if (puntero && e.pointerId === puntero.id) soltarPuntero(); };
  raiz.addEventListener('pointerup', fin);
  raiz.addEventListener('pointercancel', fin);
  raiz.addEventListener('lostpointercapture', fin);
  raiz.addEventListener('contextmenu', (e) => e.preventDefault());
  // que nada llegue al lienzo de abajo (mirar alrededor, órbita)
  ['click', 'wheel', 'touchstart', 'touchmove'].forEach((t) => raiz.addEventListener(t, (e) => { e.stopPropagation(); if (t !== 'click') e.preventDefault(); }, { passive: false }));

  function entrada() {
    if (puntero) return { x: valPuntero.x, y: valPuntero.y, activa: true };
    return leerTeclas();
  }

  // ---------- dibujo con resorte ----------
  const vis = { x: 0, y: 0, vx: 0, vy: 0 };
  let visible = false, raf = 0, tPrev = 0;
  function dibujar() {
    let x = vis.x, y = vis.y;
    const m = Math.hypot(x, y);
    if (m > 1.15) { x *= 1.15 / m; y *= 1.15 / m; }
    const mm = Math.hypot(x, y);
    const th = mm * TILT_MAX, d = L * Math.sin(th), h = L * Math.cos(th);
    const ux = mm > 1e-4 ? x / mm : 0, uy = mm > 1e-4 ? y / mm : 0;
    const bx = ux * d, by = -uy * d * SIN_E - h * COS_E;
    dib.vastago.setAttribute('x2', bx.toFixed(2)); dib.vastago.setAttribute('y2', by.toFixed(2));
    dib.brillo.setAttribute('x2', (bx * 0.86 - 1.6).toFixed(2)); dib.brillo.setAttribute('y2', (by * 0.86 - 1).toFixed(2));
    // un poco más grande cuando se acerca (hacia atrás), más chica cuando se aleja
    const esc = 1 - 0.09 * uy * Math.sin(th) / Math.sin(TILT_MAX);
    dib.bola.setAttribute('transform', `translate(${bx.toFixed(2)} ${by.toFixed(2)}) scale(${esc.toFixed(3)})`);
    // la sombra cae sobre la base, corrida a la derecha y abajo (luz de arriba a la izquierda)
    dib.sombra.setAttribute('cx', (ux * d * 1.25 + 5).toFixed(2));
    dib.sombra.setAttribute('cy', (-uy * d * SIN_E * 1.25 + 4).toFixed(2));
  }
  function cuadro(t) {
    raf = 0;
    const dt = Math.min(0.05, tPrev ? (t - tPrev) / 1000 : 1 / 60); tPrev = t;
    const e = entrada();
    const destino = { x: e.x, y: e.y };
    if (puntero || sinMovimiento.matches) {
      // con el dedo sigue al dedo; sin animaciones va directo
      vis.x = destino.x; vis.y = destino.y; vis.vx = vis.vy = 0;
    } else {
      // resorte suave, con un leve rebote al soltar
      const kR = e.activa ? 520 : 260, c = 2 * Math.sqrt(kR) * (e.activa ? 1 : 0.62);
      vis.vx += (-kR * (vis.x - destino.x) - c * vis.vx) * dt;
      vis.vy += (-kR * (vis.y - destino.y) - c * vis.vy) * dt;
      vis.x += vis.vx * dt; vis.y += vis.vy * dt;
    }
    raiz.classList.toggle('va-adelante', e.y > 0.15);
    raiz.classList.toggle('va-freno', e.y < -0.4);
    raiz.classList.toggle('va-izq', e.x < -0.2);
    raiz.classList.toggle('va-der', e.x > 0.2);
    dibujar();
    const quieto = !e.activa && Math.abs(vis.x) + Math.abs(vis.y) + Math.abs(vis.vx) + Math.abs(vis.vy) < 1e-3;
    if (quieto) { vis.x = vis.y = vis.vx = vis.vy = 0; dibujar(); tPrev = 0; return; }
    if (visible) raf = requestAnimationFrame(cuadro);
    else tPrev = 0;
  }
  function despertar() { if (visible && !raf) raf = requestAnimationFrame(cuadro); }
  dibujar();

  return {
    // { x: -1..1 (derecha +), y: -1..1 (adelante +), activa }
    leer() {
      const e = entrada();
      // las teclas soltadas antes de que se leyeran cuentan una vez y se borran
      for (const [k, v] of teclas) { if (v.suelta) teclas.delete(k); else v.leida = true; }
      return e;
    },
    mostrar(si) {
      visible = !!si;
      raiz.hidden = !visible;
      contenedor.classList.toggle('con-palanca', visible);
      if (!visible) {
        soltarPuntero();
        alt.parar();
        if (raf) cancelAnimationFrame(raf);
        raf = 0; tPrev = 0;
        vis.x = vis.y = vis.vx = vis.vy = 0; dibujar();
      } else despertar();
    },
    // inclinación de la vista (−1 abajo … 1 arriba) en el control de la vista
    inclinacion(v) { if (Number.isFinite(v)) alt.mostrar(v); },
    // rumbo en radianes (crece al doblar a la izquierda); la aguja señala la dirección inicial
    rumbo(rad) {
      if (!Number.isFinite(rad)) return;
      brujula.hidden = false;
      aguja.setAttribute('transform', `rotate(${(rad * 180 / Math.PI).toFixed(1)})`);
    }
  };
}
