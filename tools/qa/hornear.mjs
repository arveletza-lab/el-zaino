// Hornea el cuerpo del caballo: lo genera en el navegador (página con ?generar) y lo guarda comprimido
// en assets/cuerpo-caballo.bin.gz, que la página carga en lugar de recalcularlo.
// Correrlo después de CADA cambio en js/caballo.js o js/util.js (check.mjs avisa si quedó desactualizado).
// Uso: node hornear.mjs   (con el servidor levantado: bash tools/qa/serve.sh)
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lanzar, nuevaPagina, abrirListo, URL_BASE } from './lib.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SALIDA = resolve(RAIZ, 'assets/cuerpo-caballo.bin.gz');

const browser = await lanzar();
const page = await nuevaPagina(browser);
await abrirListo(page, URL_BASE + '?generar');
const { b64, estado } = await page.evaluate(async () => ({ b64: await window.__debug.exportarCuerpo(), estado: window.__debug.state() }));
if (estado.horneado) throw new Error('la página usó el cuerpo horneado en vez de generarlo');
if (page.mensajes.length) console.log('Consola:\n  ' + page.mensajes.join('\n  '));
await browser.close();

const bin = Buffer.from(b64, 'base64');
mkdirSync(dirname(SALIDA), { recursive: true });
writeFileSync(SALIDA, bin);
console.log(`Cuerpo horneado: ${SALIDA} (${(bin.length / 1024).toFixed(0)} KB, ${estado.tiempos.cuerpo ? 'generado en ' + estado.tiempos.caballo + ' ms' : ''})`);
