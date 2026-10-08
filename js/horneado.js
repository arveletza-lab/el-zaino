// Cuerpo horneado: la malla del caballo (SDF + Surface Nets + suavizado + pesos de piel + color) se
// calcula una vez con tools/qa/hornear.mjs y se guarda comprimida, para que la página no la recalcule.
// El archivo lleva un hash de los fuentes que definen el cuerpo. La página calcula ese hash sobre los fuentes
// que está corriendo (en producción salen de la caché del navegador, porque los módulos ya se bajaron), pide el
// archivo versionado con él (assets/cuerpo-caballo.bin.gz?v=<hash>, así nunca se usa uno viejo de la caché) y
// verifica que coincida; si no coincide, si el archivo está dañado o si tarda demasiado, avisa por consola y el
// cuerpo se genera en el momento.
export const RUTA = 'assets/cuerpo-caballo.bin.gz';
export const FUENTES = ['js/caballo.js', 'js/util.js'];
const MAGIA = 'ZCB2';
const PLAZO_MS = 8000;      // tiempo máximo para bajar fuentes y cuerpo antes de generarlo en el momento

// FNV-1a de 32 bits sobre el texto sin \r (igual en Windows y en Linux)
export function hashTexto(txt) {
  let h = 0x811c9dc5;
  const t = txt.replace(/\r/g, '');
  for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
// cache: 'no-store' en local (para ver siempre lo último que se editó); 'default' en producción (mismos
// archivos que ya cargó el navegador como módulos)
export async function hashFuentes({ cache = 'no-store', signal } = {}) {
  const textos = await Promise.all(FUENTES.map((f) => fetch(f, { cache, signal }).then((r) => {
    if (!r.ok) throw new Error(`no se pudo leer ${f} (HTTP ${r.status})`);
    return r.text();
  })));
  return hashTexto(textos.join('\n'));
}

const aLineal = new Float32Array(256).map((_, i) => { const c = i / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
const aSRGB = (c) => { const v = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; return Math.max(0, Math.min(255, Math.round(v * 255))); };
const alinear = (n) => (n + 3) & ~3;
// Uint16 -> diferencias con el anterior (mod 2^16, en zigzag) separadas en dos planos de bytes: gzip las comprime mucho mejor
function codificar16(a, paso, out) {
  const n = a.length;
  for (let k = 0; k < paso; k++) {
    let p = 0;
    for (let i = k; i < n; i += paso) {
      const d = ((a[i] - p) << 16) >> 16, z = ((d << 1) ^ (d >> 31)) & 0xffff;
      out[i] = z & 255; out[i + n] = z >> 8; p = a[i];
    }
  }
}
function decodificar16(b, n, paso, out) {
  for (let k = 0; k < paso; k++) {
    let p = 0;
    for (let i = k; i < n; i += paso) { const z = b[i] | (b[i + n] << 8), d = (z >>> 1) ^ -(z & 1); p = (p + d) & 0xffff; out[i] = p; }
  }
}

// {pos, idx, skinIndex, skinWeight, col} -> ArrayBuffer sin comprimir
export function empacar(c, hash) {
  const NV = c.pos.length / 3, NI = c.idx.length, idx32 = NV > 65535;
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < c.pos.length; i++) { const k = i % 3; min[k] = Math.min(min[k], c.pos[i]); max[k] = Math.max(max[k], c.pos[i]); }
  const cab = new TextEncoder().encode(JSON.stringify({ hash, NV, NI, idx32, min, max }));
  const partes = [
    ['pos', NV * 3 * 2], ['idx', NI * (idx32 ? 4 : 2)], ['skinIndex', NV * 4], ['skinWeight', NV * 4], ['col', NV * 3]
  ];
  let total = 8 + alinear(cab.length);
  const off = {};
  for (const [k, n] of partes) { off[k] = total; total += alinear(n); }
  const buf = new ArrayBuffer(total), dv = new DataView(buf), u8 = new Uint8Array(buf);
  for (let i = 0; i < 4; i++) u8[i] = MAGIA.charCodeAt(i);
  dv.setUint32(4, cab.length, true); u8.set(cab, 8);
  const pos = new Uint16Array(NV * 3);
  for (let i = 0; i < NV * 3; i++) { const k = i % 3; pos[i] = Math.round((c.pos[i] - min[k]) / (max[k] - min[k]) * 65535); }
  codificar16(pos, 3, new Uint8Array(buf, off.pos, NV * 3 * 2));
  if (idx32) new Uint32Array(buf, off.idx, NI).set(c.idx);
  else codificar16(Uint16Array.from(c.idx), 1, new Uint8Array(buf, off.idx, NI * 2));
  new Uint8Array(buf, off.skinIndex, NV * 4).set(c.skinIndex);
  const sw = new Uint8Array(buf, off.skinWeight, NV * 4);
  for (let i = 0; i < NV * 4; i++) sw[i] = Math.round(c.skinWeight[i] * 255);
  const col = new Uint8Array(buf, off.col, NV * 3);
  for (let i = 0; i < NV * 3; i++) col[i] = aSRGB(c.col[i]);
  return buf;
}

// ArrayBuffer sin comprimir -> cuerpo, o null (con un aviso por consola) si el archivo no es válido o no
// corresponde a lo esperado: esperado.hash (hash de los fuentes) y esperado.NV (cantidad de vértices), opcionales
export function desempacar(buf, esperado = {}) {
  const invalido = (m) => { console.warn(`${RUTA} no se puede usar (${m}): se genera el cuerpo en el momento.`); return null; };
  const u8 = new Uint8Array(buf), dv = new DataView(buf);
  if (u8.length < 8 || String.fromCharCode(...u8.subarray(0, 4)) !== MAGIA) return invalido('formato desconocido');
  const L = dv.getUint32(4, true);
  if (8 + L > u8.length) return invalido('encabezado cortado');
  let cab;
  try { cab = JSON.parse(new TextDecoder().decode(u8.subarray(8, 8 + L))); } catch { return invalido('encabezado ilegible'); }
  const { NV, NI, idx32, min, max } = cab || {};
  const entero = (n) => Number.isInteger(n) && n > 0;
  const terna = (a) => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);
  if (!entero(NV) || !entero(NI) || NI % 3 !== 0) return invalido('tamaños inválidos');
  if (!idx32 && NV > 65535) return invalido('demasiados vértices para índices de 16 bits');
  if (NV > 4e6 || NI > 24e6) return invalido('tamaños fuera de rango');
  if (!terna(min) || !terna(max) || min.some((m, k) => m > max[k])) return invalido('caja inválida');
  if (esperado.hash !== undefined && cab.hash !== esperado.hash) return invalido(`desactualizado respecto de ${FUENTES.join(' y ')}; volvé a hornearlo con: node tools/qa/hornear.mjs`);
  if (esperado.NV !== undefined && NV !== esperado.NV) return invalido(`tiene ${NV} vértices y se esperaban ${esperado.NV}`);
  let total = 8 + alinear(L);
  for (const n of [NV * 6, NI * (idx32 ? 4 : 2), NV * 4, NV * 4, NV * 3]) total += alinear(n);
  if (total !== u8.length) return invalido(`mide ${u8.length} bytes y debería medir ${total}`);
  let o = 8 + alinear(L);
  const tomar = (T, n, bytes) => { const a = new T(buf, o, n); o += alinear(n * bytes); return a; };
  const q = new Uint16Array(NV * 3); decodificar16(tomar(Uint8Array, NV * 3 * 2, 1), NV * 3, 3, q);
  let idx;
  if (idx32) idx = tomar(Uint32Array, NI, 4);
  else { idx = new Uint16Array(NI); decodificar16(tomar(Uint8Array, NI * 2, 1), NI, 1, idx); }
  for (let i = 0; i < NI; i++) if (idx[i] >= NV) return invalido('índices fuera de rango');
  const si = tomar(Uint8Array, NV * 4, 1), sw = tomar(Uint8Array, NV * 4, 1), c8 = tomar(Uint8Array, NV * 3, 1);
  const pos = new Float32Array(NV * 3);
  for (let i = 0; i < NV * 3; i++) { const k = i % 3; pos[i] = min[k] + q[i] / 65535 * (max[k] - min[k]); }
  const skinIndex = Uint16Array.from(si), skinWeight = new Float32Array(NV * 4);
  for (let v = 0; v < NV; v++) {
    let s = 0; for (let k = 0; k < 4; k++) s += sw[v * 4 + k];
    for (let k = 0; k < 4; k++) skinWeight[v * 4 + k] = s > 0 ? sw[v * 4 + k] / s : (k === 0 ? 1 : 0);
  }
  const col = new Float32Array(NV * 3);
  for (let i = 0; i < NV * 3; i++) col[i] = aLineal[c8[i]];
  return { hash: cab.hash, pos, idx, skinIndex, skinWeight, col };
}

const gunzip = (buf) => new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
export const gzip = (buf) => new Response(new Blob([buf]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();

// gzip empieza con 1f 8b; si el servidor mandó el archivo con Content-Encoding: gzip, fetch ya lo descomprimió
const esGzip = (buf) => { const u = new Uint8Array(buf, 0, Math.min(2, buf.byteLength)); return u[0] === 0x1f && u[1] === 0x8b; };

// Devuelve el cuerpo horneado, o null si no hay, si el navegador no puede descomprimirlo, si está dañado o
// desactualizado respecto de los fuentes. Puede rechazar (red, plazo vencido): quien llama genera el cuerpo.
// local: true en localhost (lee los fuentes sin caché)
export async function cargarCuerpo({ local = false, plazo = PLAZO_MS } = {}) {
  if (typeof DecompressionStream === 'undefined') return null;
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  let reloj = 0;
  const vencido = new Promise((_, rechazar) => {
    reloj = setTimeout(() => { if (ctl) ctl.abort(); rechazar(new Error(`tardó más de ${plazo / 1000} s en bajar`)); }, plazo);
  });
  const cargar = async () => {
    const signal = ctl ? ctl.signal : undefined;
    const hash = await hashFuentes({ cache: local ? 'no-store' : 'default', signal });
    const r = await fetch(`${RUTA}?v=${hash}`, { signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    let buf = await r.arrayBuffer();
    if (esGzip(buf)) {
      try { buf = await gunzip(buf); } catch { throw new Error('el archivo comprimido está dañado'); }
    }
    return desempacar(buf, { hash });
  };
  try { return await Promise.race([cargar(), vencido]); }
  finally { clearTimeout(reloj); }
}
