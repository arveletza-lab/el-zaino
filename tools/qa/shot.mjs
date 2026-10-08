// Captura reproducible de una vista.
// Uso: node shot.mjs <salida.png> <preset> [marcha] [fase] [ancho] [alto] [--movil] [--solo | --silueta]
//   preset: perfil-izq | perfil-der | tres-cuartos | frente | atras | cabeza | patas | campo
//           montura (vista desde la montura, con la interfaz) | ui (vista exterior inicial, con la interfaz)
//   marcha: stand | walk | trot | gallop (por defecto stand); fase: 0..1 (por defecto 0)
//   --movil: user agent de iPhone, pantalla táctil
//   --solo: solo el caballo (con arreos) sobre fondo magenta; --silueta: además sin arreos
//   Para comparar con foto-1: node shot.mjs out.png foto-1 stand 0 2048 1151 --silueta, y luego superponer.mjs
import { lanzar, nuevaPagina, abrirListo, asegurarCarpeta } from './lib.mjs';

const args = process.argv.slice(2);
const movil = args.includes('--movil'), solo = args.includes('--solo'), silueta = args.includes('--silueta');
const [salida, preset, marcha = 'stand', fase = '0', ancho = '1280', alto = '720'] = args.filter((a) => !a.startsWith('--'));
if (!salida || !preset) {
  console.error('Uso: node shot.mjs <salida.png> <preset> [marcha] [fase] [ancho] [alto] [--movil]');
  process.exit(1);
}
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

const browser = await lanzar();
const page = await nuevaPagina(browser, { ancho: +ancho, alto: +alto, userAgent: movil ? IPHONE : undefined });
await abrirListo(page);
const presets = await page.evaluate(() => window.__debug.presets);
if (!['montura', 'ui', 'seguir'].includes(preset) && !presets.includes(preset)) {
  console.error(`Preset desconocido "${preset}". Opciones: ${[...presets, 'montura', 'ui'].join(', ')}`);
  await browser.close(); process.exit(1);
}
await page.evaluate(({ preset, marcha, fase, solo, silueta }) => {
  const d = window.__debug;
  d.gait(marcha);
  d.view(preset === 'montura' ? 'rider' : preset === 'seguir' ? 'seguir' : 'out');
  d.freeze(fase);
  if (preset !== 'montura' && preset !== 'ui' && preset !== 'seguir') d.cam(preset);
  if (solo || silueta) d.soloCaballo(true, !silueta);
}, { preset, marcha, fase: parseFloat(fase), solo, silueta });
await page.waitForTimeout(1000);
asegurarCarpeta(salida);
await page.screenshot({ path: salida });
console.log(`Captura: ${salida} (${preset}, ${marcha}, fase ${fase}, ${ancho}x${alto}${movil ? ', iPhone' : ''})`);
if (page.mensajes.length) console.log('Consola:\n  ' + page.mensajes.join('\n  '));
await browser.close();
