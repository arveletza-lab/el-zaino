// Estiramiento de la malla del cuerpo en poses extremas (razón entre el largo de cada arista y el de reposo,
// caballo.medirEstiramiento()). Poses: galope y galope tendido en todo el ciclo, trote, giro máximo al galope
// y cabeza abajo / arriba / al costado. Informa el máximo por pose y las zonas (x, y en decímetros, lado) con más
// aristas estiradas al doble.
// Uso: node estiramiento.mjs [--max N]   (sale con código 1 si alguna pose supera su límite; --max fija uno solo)
// Límites por pose (etapa 2c): las marchas no bajan de ~4 con skinning lineal porque el húmero avanza 30–45 cm
// respecto del tórax (axila e ingle); el resto, 2,5.
import { lanzar, nuevaPagina, abrirListo } from './lib.mjs';

const iMax = process.argv.indexOf('--max');
const LIMITE = { trote: 4.5, galope: 4.5, 'galope tendido': 6.5, 'galope doblando a fondo': 4 };
const MAX = iMax >= 0 ? +process.argv[iMax + 1] : null;
const limite = (nombre) => MAX ?? LIMITE[nombre] ?? 2.5;

const browser = await lanzar();
const page = await nuevaPagina(browser, { ancho: 640, alto: 360 });
await abrirListo(page);
const res = await page.evaluate(() => {
  const d = window.__debug, C = window.__caballo, out = [];
  const peor = (nombre, medir) => {
    let m = null;
    for (const r of medir()) if (!m || r.max > m.max) m = r;
    out.push({ nombre, ...m });
  };
  const ciclo = (g, tendido = false) => function* () {
    d.palanca(null); d.gait(g); if (tendido) d.galopeTendido(true); d.freeze(0); d.freeze(null);
    for (let i = 0; i < 40; i++) { d.sim(1 / 40 / (d.state().marcha.f || 1)); yield { ...C.medirEstiramiento(), fase: +d.state().phase.toFixed(2) }; }
    if (tendido) d.galopeTendido(false);
  };
  peor('trote', ciclo('trot'));
  peor('galope', ciclo('gallop'));
  peor('galope tendido', ciclo('gallop', true));
  peor('galope doblando a fondo', function* () {
    d.gait('gallop'); d.freeze(0); d.freeze(null); d.palanca(1, 1); d.sim(2);
    for (let i = 0; i < 30; i++) { d.sim(1 / 60); yield C.medirEstiramiento(); }
    d.palanca(null);
  });
  peor('giro en el lugar', function* () {
    d.gait('stand'); d.freeze(0); d.freeze(null); d.palanca(1, 0); d.sim(1);
    for (let i = 0; i < 30; i++) { d.sim(1 / 30); yield C.medirEstiramiento(); }
    d.palanca(null);
  });
  d.gait('stand'); d.freeze(0);
  const cabeza = (nombre, cuello, cab) => peor(nombre, function* () { C.aplicarPose({ cuello, cabeza: cab }); yield C.medirEstiramiento(); });
  cabeza('cabeza abajo (pastando)', { flexion: -0.9 }, { flexion: -0.4 });
  cabeza('cabeza arriba', { flexion: 0.5 }, { flexion: 0.4 });
  cabeza('cabeza al costado', { flexion: -0.2, lateral: 0.6 }, { lateral: 0.4 });
  d.freeze(0);
  return out;
});
await browser.close();

let mal = 0;
for (const r of res) {
  const z = r.zonas.slice(0, 4).map(([k, n]) => `${k}:${n}`).join(' ');
  console.log(`${r.nombre.padEnd(26)} máx ${r.max.toFixed(2)}${r.fase !== undefined ? ` (fase ${r.fase})` : ''} · aristas > 1,5: ${r.mas15} · > 2: ${r.mas2}${z ? ` · zonas ${z}` : ''}${r.max > limite(r.nombre) ? `  ✗ (límite ${limite(r.nombre)})` : ''}`);
  if (r.max > limite(r.nombre)) mal++;
}
console.log(mal ? `\n${mal} poses superan su límite de estiramiento` : '\nTodas las poses dentro de su límite');
if (mal) process.exitCode = 1;
