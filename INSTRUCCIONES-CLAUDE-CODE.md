Vamos a convertir el prototipo del caballo en un proyecto ordenado para trabajar con subagentes y publicarlo en GitHub Pages. Seguí las partes en orden. No hagas commit hasta la PARTE 7.

Punto de partida:
- _origen/caballo.html: versión actual completa (un solo archivo, Three.js r128 desde CDN). Es la referencia de cómo tiene que verse y comportarse.
- referencias/fotos/: cuatro fotos de referencia del pelaje y la conformación (ver CLAUDE.md, sección "Referencias").

══════════════════════════════════════
PARTE 0 — Separar en módulos (sin cambiar nada visible)
══════════════════════════════════════
Antes de tocar nada, sacá capturas de _origen/caballo.html (servido en localhost) en vista exterior parado, al trote y en vista desde la montura, y guardalas en qa-out/antes/.

Pasá el archivo a esta estructura, sitio estático sin build:
- index.html: documento completo (<!doctype html>, <html lang="es">, <head> con charset, viewport con viewport-fit=cover, <title>El zaino</title>, meta description), el marcado del título y del panel de controles, y los <script>.
- css/style.css: todos los estilos.
- vendor/three.min.js (three r128) y vendor/OrbitControls.js (three@0.128.0/examples/js/controls/OrbitControls.js), descargados con npm o curl. Nada se carga desde CDN salvo Google Fonts.
- js/ con módulos ES (type="module"); THREE sigue siendo global:
  - js/util.js: lin, lerp, sstep, clamp01, frac, TAU, rnd (semilla fija), prof (interpolación Hermite), cap, section, ruido.
  - js/texturas.js: texturas de canvas del caballo (pelo del cuerpo, crin y cola, cuero).
  - js/escena.js: renderer, cámara, OrbitControls, luces, mapa de entorno (reflejos del pelaje), sombras.
  - js/caballo.js: perfiles anatómicos, campo de distancias (SDF) y Surface Nets, esqueleto y pesos de piel, color del pelaje, ojos, ollares, orejas, crin, copete, cola, cascos, IK de patas (legIK, solveLeg), updateSkeleton.
  - js/marchas.js: tabla GAITS, mezcla entre marchas, velocidad del suelo.
  - js/montura.js: mandil, montura, faldones, cincha, estribos, cabezada, bocado, riendas, manos del jinete.
  - js/campo.js: cielo, lomas, pradera, camino, matas, alambrados, rancho, árboles, ovejas, updateField.
  - js/camaras.js: vista exterior y vista desde la montura (setView, applyOffset, updateRiderCamera, arrastre para mirar).
  - js/main.js: arranque, botones, teclado, bucle de animación, mensaje de carga.
- Mantené EXACTAMENTE el orden de las llamadas a rnd() que tiene el original (ver "Reglas críticas" en CLAUDE.md): si cambia el orden, cambian la crin, la cola, las matas y la posición de las ovejas.
- Agregá al pie de la página, discreto: "Hecho con three.js (MIT)". Licencia del proyecto: MIT, en LICENSE.

Al terminar, sacá las mismas capturas del sitio nuevo en qa-out/despues/ y compará con tools/qa/compare.mjs (PARTE 2). Tienen que verse iguales.

══════════════════════════════════════
PARTE 1 — Modo de prueba (solo local)
══════════════════════════════════════
Agregá en js/main.js un objeto window.__debug que SOLO exista cuando location.hostname sea "localhost" o "127.0.0.1" (nunca en GitHub Pages). Debe ofrecer:
- ready: promesa que resuelve cuando el cuerpo del caballo terminó de construirse (tarda unos segundos).
- gait(nombre): 'stand' | 'walk' | 'trot' | 'gallop', aplicado al instante sin mezcla.
- freeze(fase): detiene la animación en una fase de 0 a 1 del ciclo de la marcha (capturas reproducibles); freeze(null) la libera.
- view(nombre): 'out' o 'rider'.
- cam(preset | {pos:[x,y,z], target:[x,y,z]}): presets 'perfil-izq', 'perfil-der', 'tres-cuartos', 'frente', 'atras', 'cabeza', 'patas', 'campo'. Oculta el título y el panel mientras está activo.
  - 'perfil-izq': cámara en z negativo mirando hacia +z, a la altura de la cruz, campo de visión estrecho (30°): muestra el lado IZQUIERDO del caballo con la cabeza hacia la izquierda de la imagen, igual que foto-1.
  - 'perfil-der': el espejo, desde z positivo: lado derecho, cabeza hacia la derecha, como foto-4.
  - 'tres-cuartos': como foto-2, desde adelante y a la izquierda del caballo.
- look(yaw, pitch): dirección de la mirada en la vista desde la montura.
- sim(segundos): avanza la animación a paso fijo de 1/120 s.
- state(): {gait, phase, view, apoyos:[MI,MD,PI,PD], groundSpeed, buildMs}.
- stats(): {drawCalls, triangles, fps, bodyVerts}.
- hooves(): posición en el mundo de los 4 cascos y si están apoyados.

══════════════════════════════════════
PARTE 2 — Herramientas de QA (tools/qa/)
══════════════════════════════════════
- tools/qa/package.json con playwright como dependencia de desarrollo (npm install ahí; node_modules en .gitignore).
- tools/qa/serve.sh: levanta `python -m http.server 8000` en la raíz si no está corriendo (que funcione en Git Bash de Windows).
- Lanzar Chromium con GPU si hay; si falla WebGL, reintentar con args ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'].
- tools/qa/shot.mjs: uso `node shot.mjs <salida.png> <preset> [marcha] [fase] [ancho] [alto]` → abre http://localhost:8000, espera __debug.ready, aplica marcha, fase y cámara, espera 1 s y guarda la captura. El preset 'montura' usa la vista desde la montura.
- tools/qa/check.mjs: después de CADA cambio. Imprime:
  - errores y advertencias de consola;
  - tiempo de construcción del cuerpo (buildMs) y vértices;
  - fps, draw calls y triángulos en vista exterior y desde la montura;
  - para paso, trote y galope: durante 4 s simulados, cuánto se desliza cada casco apoyado respecto del suelo (debe ser menos de 3 cm por apoyo) y si algún casco queda por debajo del suelo (no debe);
  - que los apoyos sigan la secuencia correcta: paso en 4 tiempos, trote en diagonales, galope en 4 tiempos.
- tools/qa/compare.mjs: uso `node compare.mjs <ref.png> <render.png> <salida.png>` → lado a lado, referencia a la izquierda, render a la derecha, 640 px de ancho cada una.
- Las capturas van a qa-out/ (en .gitignore).

══════════════════════════════════════
PARTE 3 — .gitignore
══════════════════════════════════════
qa-out/
tools/qa/node_modules/
node_modules/
_origen/
referencias/fotos/
referencias/recortes/

══════════════════════════════════════
PARTE 4 — CLAUDE.md (en la raíz)
══════════════════════════════════════
Escribilo en español, conciso, con estas secciones:

## Proyecto
El zaino: caballo zaino colorado en 3D, ensillado, que recorre un campo uruguayo (rancho, ovejas, alambrados). Marchas: quieto, paso, trote, galope. Vista exterior (orbitar) y vista desde la montura. Three.js r128 (vendor/, global THREE), sitio estático para GitHub Pages, sin build. Todo se genera por código: sin modelos ni imágenes externas.

## Correr y probar
- `bash tools/qa/serve.sh` y abrir http://localhost:8000.
- `node tools/qa/check.mjs` después de CADA cambio: sin errores de consola, sin cascos que patinen ni que se hundan.
- window.__debug solo existe en localhost (ver js/main.js).

## Arquitectura
(Una línea por archivo de js/ describiendo qué contiene, basándote en el código real.)

## Convenciones
- Unidades en metros. Altura a la cruz: 1,60 m. El caballo está en el origen, mirando hacia +x; y hacia arriba.
- +z es el lado DERECHO del caballo (adelante × arriba = derecha). OJO: en el prototipo las etiquetas MI/MD/PI/PD están invertidas (la pata con s=+1 está a la derecha pero se llama "MI"). Corregilo en la PARTE 0 y verificá que el indicador de apoyos coincida con la pata real.
- La crin cae sobre el lado derecho (+z), como es costumbre.
- Cuerpo: un solo campo de distancias (SDF) en una grilla de 1,15 cm, convertido en malla con Surface Nets y suavizado Taubin. Barril definido por los perfiles TOP, BOT y SIDE (alto de lomo, línea de vientre y semiancho en función de x), relieve con TORSO_BUMPS; cuello y cabeza barridos sobre neckCurve y headCurve; músculos con ellipsoid() y roundCone() unidos con smin.
- Esqueleto: hueso 0 cuerpo, 1 cuello, 2 cabeza, y por pata 4 huesos (brazo o muslo, antebrazo o pierna, caña, cuartilla). Pose de reposo = parado en cuadro; legIK resuelve rodilla y corvejón en el plano lateral.
- Velocidad del suelo = 2 · stride · freq · velocidad / duty, para que el casco apoyado no patine. El campo se mueve hacia −x y se repite cada 2·WRAP (WRAP = 320 m). Lo repetitivo (matas, postes) usa grupos periódicos.
- Camino a lo largo de x en z = 0; alambrados en z = −5,5 y z = 9,5; rancho en z = −30.

## Reglas críticas
- rnd() tiene semilla fija: NO cambiar el orden de construcción ni agregar llamadas a rnd() en medio del código existente. Si algo nuevo necesita azar, usar un hash de la posición o agregarlo al final.
- El cuerpo del caballo es UNA sola malla: toda mejora anatómica se hace en el SDF (formas, músculos, perfiles), nunca con mallas pegadas encima, para que no aparezcan cortes entre zonas.
- Rendimiento: construcción del cuerpo menos de 3 s en PC; menos de 400.000 triángulos visibles y 60 fps en PC; debe abrir en celular.
- Página siempre en tema claro. Funcionar a 400 px de ancho y en celular horizontal.
- Sin marcas registradas en textos ni texturas.

## Referencias (referencias/fotos/, no se suben)
- foto-1-perfil-izq.png (2048x1151): zaino colorado parado de perfil, mirando a la izquierda, sobre pasto. LA referencia principal de proporciones y conformación.
- foto-2-tres-cuartos.png (588x441): tres cuartos de frente, pelaje muy brillante. Referencia de brillo, reflejos y musculatura de paleta, antebrazo y grupa.
- foto-3-galope.png (800x534): galope suspendido, fondo blanco. Referencia de patas plegadas, cuello y cola levantada en el galope.
- foto-4-perfil-der-campo.png (550x483): perfil mirando a la derecha, en el campo, con lucero y media blanca. Referencia de cabeza, cascos y del paisaje.
- Los recortes y mediciones van a referencias/recortes/ y referencias/medidas.md (los mantiene referencia-fotos).

## Subagentes
- referencia-fotos: mide y describe las fotos. Solo lectura del código.
- qa-render: prueba, captura y compara. Solo lectura del código.
- caballo: anatomía, pelaje, crin, cola, cascos y marchas (js/caballo.js, js/marchas.js, js/texturas.js).
- montura-camaras: arreos, riendas, manos y cámaras (js/montura.js, js/camaras.js).
- entorno: campo, cielo, rancho, ovejas, alambrados, árboles (js/campo.js).
- ui-hud: título, panel, botones, carga, accesibilidad (index.html, css/style.css, interfaz en js/main.js).
Flujo típico: referencia-fotos → caballo → qa-render.

══════════════════════════════════════
PARTE 5 — Subagentes (.claude/agents/)
══════════════════════════════════════
Creá estos seis archivos con este contenido exacto:

--- .claude/agents/referencia-fotos.md ---
---
name: referencia-fotos
description: Analiza las fotos de referencia (y las que el usuario agregue en referencias/fotos/) y devuelve una especificación escrita y medida de una zona del caballo, su pelaje o su movimiento. Usar ANTES de modificar el caballo. No edita código.
tools: Bash, Read, Glob, Write, WebSearch, WebFetch
model: sonnet
---
Sos analista de referencia visual del proyecto El zaino. Leé CLAUDE.md (secciones "Convenciones" y "Referencias") y referencias/medidas.md si existe.

Proceso:
1. Si referencias/medidas.md no existe: en foto-1-perfil-izq.png marcá con Python (PIL) la altura a la cruz y medí en píxeles, convertido a metros con cruz = 1,60 m: largo del cuerpo (encuentro a nalga), profundidad del tronco, altura de la grupa, largo de cabeza y cuello, altura de rodilla, corvejón y menudillo, largo de caña y cuartilla, ángulo de paleta, de cuartilla y de casco. Escribí la tabla en referencias/medidas.md.
2. Recortá la zona pedida (por ejemplo cabeza, paleta, grupa, patas traseras, crin, cola) de todas las fotos donde se vea, ampliá a 800 px y guardá en referencias/recortes/<zona>/. Miralas con Read.
3. Para el color, muestreá con PIL en 5 a 10 puntos de luz, medio tono y sombra, y en los cabos negros. Informá los hex.
4. Si una duda anatómica no se resuelve con las fotos, buscá en la web (anatomía equina, conformación) y citá la fuente.

Devolvé SOLO texto, con este formato:
ZONA: <nombre>
- Medidas: valores en metros y ángulos, comparados con los del modelo si los conocés (perfiles TOP, BOT, SIDE y posiciones en CLAUDE.md).
- Forma: contornos de perfil, de frente y de arriba, en orden de adelante hacia atrás, con dónde está el punto más alto, el más ancho y cada hundimiento.
- Músculos y relieves visibles: cuáles, dónde (x, y aproximados en metros), cuánto sobresalen y cómo se ve el borde (suave o marcado).
- Pelaje: colores hex por zona, dónde está el brillo y cómo es, transiciones (por ejemplo dónde empieza el negro de las patas).
- Crin, copete y cola (si corresponde): largo, volumen, caída, ondulación, color.
Al final: "Fotos usadas: ..." y "Dudas: ...".
Nunca edites archivos fuera de referencias/. Nunca pegues imágenes en la respuesta.

--- .claude/agents/qa-render.md ---
---
name: qa-render
description: Verifica el proyecto después de un cambio. Corre check.mjs, revisa errores y rendimiento, saca capturas en las vistas pedidas y las compara con las fotos de referencia. Devuelve un informe de problemas. No edita código.
tools: Bash, Read, Glob, Grep
model: sonnet
---
Sos QA del proyecto El zaino. Leé CLAUDE.md.

Siempre:
1. `bash tools/qa/serve.sh`
2. `node tools/qa/check.mjs` → anotá errores, tiempo de construcción, rendimiento, deslizamiento y hundimiento de cascos, y secuencia de apoyos.

Si te piden revisar una zona, una marcha o una vista:
3. Sacá capturas con tools/qa/shot.mjs en los presets que correspondan (por defecto perfil-izq, tres-cuartos y atras; para crin y vista de jinete, montura), en 2 o 3 fases de la marcha.
4. Si hay foto de referencia equivalente, armá la comparación con tools/qa/compare.mjs y mirala con Read. Para comparar con foto-1, usá perfil-izq parado.
5. Si te piden probar en celular, repetí con viewport 400x820 y 844x390 y user agent de iPhone.

Devolvé SOLO texto:
- RESULTADO GENERAL: OK / CON PROBLEMAS
- Chequeo: errores (o "sin errores"), buildMs, triángulos, draw calls y fps por vista; cascos (deslizamiento máximo por marcha, hundimientos); apoyos (correcto o qué falla)
- Problemas visuales: lista numerada, cada uno con vista, marcha y fase, zona, qué se ve mal y qué debería verse según la referencia
- Rutas de las capturas en qa-out/ para que el usuario las abra
No edites archivos del proyecto. No pegues imágenes en la respuesta.

--- .claude/agents/caballo.md ---
---
name: caballo
description: Implementa cambios en el caballo - proporciones, músculos, cabeza, orejas, ojos, patas, cascos, pelaje y brillo, crin, copete, cola y las marchas. Usar con una especificación concreta, idealmente la que devuelve referencia-fotos.
tools: Read, Edit, Write, Glob, Grep, Bash
---
Sos el artista técnico del caballo del proyecto El zaino. Leé CLAUDE.md completo antes de tocar nada, en especial "Convenciones" y "Reglas críticas".

Archivos que podés modificar: js/caballo.js, js/marchas.js y js/texturas.js. Si necesitás cambiar otro archivo, decilo en tu respuesta en vez de hacerlo.

Reglas:
- El cuerpo es una sola malla generada desde el SDF: cambiá perfiles, formas y músculos en el SDF; nunca agregues mallas sueltas sobre el cuerpo.
- Unión de formas con smin y un radio de mezcla acorde al tamaño del músculo, para que las transiciones entre zonas sean continuas.
- Si cambiás la pose de reposo o el largo de los huesos, recalculá los pesos de piel y verificá que no se estiren triángulos al plegar las patas en el galope.
- Respetá la regla de rnd() con semilla fija.
- Texturas generadas con canvas, sin imágenes externas.
- Al terminar, corré `node tools/qa/check.mjs` y sacá capturas con shot.mjs en perfil-izq parado y tres-cuartos al trote.

Devolvé: qué cambiaste (archivo y función), resultado de check.mjs, rutas de las capturas y qué conviene que qa-render revise.

--- .claude/agents/montura-camaras.md ---
---
name: montura-camaras
description: Implementa cambios en la montura y los arreos (mandil, montura, faldones, cincha, estribos, cabezada, bocado, riendas), las manos del jinete y las cámaras (vista exterior y desde la montura). Usar con una especificación concreta.
tools: Read, Edit, Write, Glob, Grep, Bash
---
Sos el artista técnico de arreos y cámaras del proyecto El zaino. Leé CLAUDE.md.

Archivos que podés modificar: js/montura.js y js/camaras.js. No toques la anatomía ni las marchas.

Reglas:
- Los arreos se apoyan sobre la superficie del cuerpo (torsoSurf, headSurf, neckSurf): si el caballo cambia de forma, tienen que seguir apoyados sin atravesarlo ni flotar.
- Las riendas van del bocado a las manos en la vista desde la montura y descansan sobre la cruz en la vista exterior.
- La vista desde la montura arranca mirando el camino y deja ver orejas, crin y el frente de la montura; el balanceo depende de la marcha.
- Sin logos ni marcas.
- Al terminar, corré check.mjs y sacá capturas con shot.mjs en tres-cuartos y montura, parado y al galope.

Devolvé: qué cambiaste, rutas de las capturas y cualquier duda.

--- .claude/agents/entorno.md ---
---
name: entorno
description: Implementa cambios en el campo - cielo, lomas, pradera, camino, matas, alambrados, rancho, ramada, árboles, ovejas y su animación, y cómo se desplaza el paisaje con la marcha.
tools: Read, Edit, Write, Glob, Grep, Bash
---
Sos el artista técnico de entorno del proyecto El zaino. Leé CLAUDE.md.

Archivo que podés modificar: js/campo.js. Si necesitás otro, decilo.

Reglas:
- Paisaje de campo uruguayo: rancho de paredes encaladas y techo de paja, alambrados de postes de madera con varillas e hilos, ovejas de raza lanera, eucaliptos y ombúes, cuchillas suaves.
- Todo lo que está en el suelo se mueve con updateField y se repite: usá grupos periódicos para lo repetitivo e InstancedMesh para elementos numerosos.
- La niebla y el color de las lomas tienen que coincidir para que no aparezca una franja clara en el horizonte.
- Nada debe atravesar el camino por donde va el caballo (z entre −1,7 y 1,7).
- Al terminar, corré check.mjs y sacá capturas con shot.mjs en campo, tres-cuartos y montura, al paso.

Devolvé: qué cambiaste, rendimiento antes y después, rutas de las capturas.

--- .claude/agents/ui-hud.md ---
---
name: ui-hud
description: Implementa cambios de interfaz - título, panel de marchas, botón de vista desde la montura, velocidad, indicador de apoyos, mensaje de carga, accesibilidad - en escritorio y celular.
tools: Read, Edit, Write, Glob, Grep, Bash
---
Sos el diseñador de interfaz del proyecto El zaino. Leé CLAUDE.md.

Archivos que podés modificar: index.html, css/style.css y las partes de interfaz de js/main.js (no la escena, ni el caballo, ni el campo).

Reglas:
- Estilo actual: Instrument Serif para el título, IBM Plex Sans Condensed para la interfaz, IBM Plex Mono para datos; acento color ladrillo; panel claro translúcido abajo. Página siempre en tema claro.
- Todo tiene que funcionar a 400 px de ancho y en celular horizontal (844x390), sin tapar el caballo más de lo necesario.
- Textos en español rioplatense, claros y cortos. Teclas: 1 a 4 marchas, V vista.
- Foco visible en el teclado y respeto de prefers-reduced-motion.
- Al terminar, corré check.mjs y sacá capturas en 1280x720, 400x820 y 844x390, en vista exterior y desde la montura.

Devolvé: qué cambiaste y las rutas de las capturas.

══════════════════════════════════════
PARTE 6 — README.md
══════════════════════════════════════
Breve, en español: qué es, cómo se usa (botones y teclas), cómo correrlo local, licencia MIT y créditos (three.js, MIT; fuentes de Google Fonts, OFL).

══════════════════════════════════════
VERIFICACIÓN FINAL
══════════════════════════════════════
1. Corré `node tools/qa/check.mjs` y mostrame el resultado.
2. Mostrame la comparación de qa-out/antes/ y qa-out/despues/ (PARTE 0): decime si hay diferencias.
3. Confirmá que window.__debug no existe si se abre con otro hostname (probalo con http://127.0.0.2:8000).
4. Listá los archivos creados.

══════════════════════════════════════
PARTE 7 — Publicar (solo cuando yo lo confirme)
══════════════════════════════════════
Cuando te diga "publicá":
1. git init, rama main, primer commit con todo lo que no está en .gitignore.
2. Creá el repositorio público "el-zaino" en mi cuenta con `gh repo create` (si gh no está o no tiene sesión, decime los pasos para hacerlo en github.com).
3. Push y activá GitHub Pages desde main, carpeta raíz.
4. Esperá a que el sitio esté en línea, abrilo y confirmá que carga sin errores y que window.__debug no existe. Pasame la dirección.
