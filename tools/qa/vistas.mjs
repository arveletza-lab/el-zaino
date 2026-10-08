// Mide el volumen del cuerpo en reposo (malla horneada, sin cascos ni pelo) desde 3 vistas ortográficas y por cortes,
// y lo compara con las medidas de referencia (referencias/medidas-3vistas.json, las escribe referencia-fotos).
// Uso: node vistas.mjs [objetivo.json] [--json salida.json]
//   arriba:    semiancho máximo |z| en cada x (silueta vista desde arriba)
//   frente:    semiancho máximo |z| en cada y de la mitad delantera (x > 0,2): lo que tapa la vista de frente
//   atras:     igual con la mitad trasera (x < 0,2)
//   secciones: semiancho a cada altura en un corte x (franja de ±1 cm; incluye los miembros si el corte los cruza)
// Formato del objetivo: { tolerancia, arriba: [[x, s]...], frente: [[y, s]...], atras: [[y, s]...],
//   secciones: [{ nombre, x, puntos: [[y, s]...] }] }; las claves que falten no se comparan.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { lanzar, nuevaPagina, abrirListo, asegurarCarpeta } from './lib.mjs';

const args = process.argv.slice(2);
const iJson = args.indexOf('--json');
const salidaJson = iJson >= 0 ? args[iJson + 1] : null;
const objetivoArchivo = args.filter((a, i) => !a.startsWith('--') && i !== iJson + 1)[0] || new URL('../../referencias/medidas-3vistas.json', import.meta.url);
const objetivo = existsSync(objetivoArchivo) ? JSON.parse(readFileSync(objetivoArchivo, 'utf8')) : null;

const browser = await lanzar();
const page = await nuevaPagina(browser, { ancho: 640, alto: 360 });
await abrirListo(page);
const med = await page.evaluate((obj) => {
  const p = window.__caballo.cuerpo.pos, n = p.length / 3;
  const PASO = 0.01;
  const perfil = (eje, filtro) => {
    const m = new Map();
    for (let i = 0; i < n; i++) {
      const x = p[i * 3], y = p[i * 3 + 1], z = Math.abs(p[i * 3 + 2]);
      if (!filtro(x, y)) continue;
      const k = Math.round((eje === 'x' ? x : y) / PASO);
      if (!(m.get(k) >= z)) m.set(k, z);
    }
    return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([k, s]) => [+(k * PASO).toFixed(2), +s.toFixed(3)]);
  };
  // corte en x: semiancho máximo a cada altura en la franja (incluye los miembros si el corte los cruza)
  const corte = (x0) => perfil('y', (x, y) => Math.abs(x - x0) <= 0.01);
  const res = {
    arriba: perfil('x', () => true),
    frente: perfil('y', (x) => x > 0.2),
    atras: perfil('y', (x) => x < 0.2),
    secciones: {}
  };
  const xs = new Set([0.9, 0.55, 0.45, 0.2, 0.05, -0.05, -0.3, -0.6]);
  for (const s of obj?.secciones ?? []) xs.add(s.x);
  for (const x of xs) res.secciones[x] = corte(x);
  return res;
}, objetivo);
await browser.close();

const interp = (tabla, t) => {
  if (!tabla.length) return NaN;
  let mejor = null;
  for (const [k, s] of tabla) if (Math.abs(k - t) < 0.0051) mejor = Math.max(mejor ?? 0, s);
  if (mejor !== null) return mejor;
  for (let i = 1; i < tabla.length; i++) {
    const [a, sa] = tabla[i - 1], [b, sb] = tabla[i];
    if (a <= t && t <= b) return b - a > 0.05 ? NaN : sa + (sb - sa) * (t - a) / (b - a);
  }
  return NaN;
};

const f3 = (v) => (Number.isFinite(v) ? v.toFixed(3) : '  —  ');
let peor = 0, fuera = 0, total = 0;
function comparar(nombre, tablaModelo, puntos, eje) {
  const tol = objetivo.tolerancia ?? 0.015;
  console.log(`\n${nombre}  (${eje}: objetivo / modelo / diferencia)`);
  for (const [t, s] of puntos) {
    const m = interp(tablaModelo, t), d = m - s;
    total++;
    const mal = !Number.isFinite(d) || Math.abs(d) > tol;
    if (mal) fuera++;
    if (Number.isFinite(d)) peor = Math.max(peor, Math.abs(d));
    console.log(`  ${eje} = ${t.toFixed(2).padStart(5)}   ${f3(s)}  ${f3(m)}  ${Number.isFinite(d) ? (d >= 0 ? '+' : '') + d.toFixed(3) : '  —  '}${mal ? '  ✗' : ''}`);
  }
}

if (objetivo) {
  if (objetivo.arriba) comparar('Desde arriba (semiancho por x)', med.arriba, objetivo.arriba, 'x');
  if (objetivo.frente) comparar('De frente, mitad delantera (semiancho por y)', med.frente, objetivo.frente, 'y');
  if (objetivo.atras) comparar('Desde atrás, mitad trasera (semiancho por y)', med.atras, objetivo.atras, 'y');
  for (const s of objetivo.secciones ?? []) comparar(`Corte ${s.nombre} (x = ${s.x})`, med.secciones[s.x], s.puntos, 'y');
  console.log(`\n${total - fuera} de ${total} medidas dentro de ±${(objetivo.tolerancia ?? 0.015) * 100} cm; peor diferencia ${(peor * 100).toFixed(1)} cm`);
} else {
  console.log('Sin objetivo (referencias/medidas-3vistas.json): solo se miden las vistas.');
  const resumen = (tabla, paso) => tabla.filter(([k]) => Math.abs(k / paso - Math.round(k / paso)) < 1e-6).map(([k, s]) => `${k.toFixed(2)}:${s.toFixed(3)}`).join('  ');
  console.log('arriba (x:s)', resumen(med.arriba, 0.1));
  console.log('frente (y:s)', resumen(med.frente, 0.1));
  console.log('atras  (y:s)', resumen(med.atras, 0.1));
}
if (salidaJson) { asegurarCarpeta(salidaJson); writeFileSync(salidaJson, JSON.stringify(med)); console.log('JSON:', salidaJson); }
if (objetivo && fuera) process.exitCode = 1;
