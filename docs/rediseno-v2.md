# Rediseño v2: caballo nuevo desde cero, locomoción realista y palanca de conducción

## Decisiones del usuario
- El caballo se rediseña DESDE CERO, todo por código (sin modelos externos), lo más realista posible: anatomía real (esqueleto, músculos, tendones), geometría del movimiento real.
- Campo SIN FIN: se repite en todas las direcciones; los alambrados tienen tranqueras abiertas para cruzarlos.
- En la vista desde la montura aparece una palanca tipo arcade:
  - arriba: acelera (más inclinada = paso → trote → galope); al soltarla, el caballo mantiene la marcha;
  - abajo: frena (baja de marcha hasta quedar quieto); NO hay marcha atrás;
  - costados: dobla. Para volver hacia atrás se mantiene la palanca a un costado hasta girar el ángulo deseado, 180° incluido; también parado (gira en el lugar, pisando).
  - Las flechas del teclado hacen lo mismo (en las dos vistas).

## Marco de referencia (no cambia)
- El caballo sigue en el origen de la escena mirando a +x, y arriba, +z = derecha. Lo que se mueve es el MUNDO.
- Estado de locomoción (`locomocion.pose`): `{ x, z, rumbo, velocidad, giro }` en coordenadas del suelo (metros, radianes).
  - Dirección de avance en el suelo: `(cos rumbo, 0, -sin rumbo)`. `rumbo` crece al doblar a la IZQUIERDA (igual que `rotation.y` de three.js).
  - Un punto del caballo `p` (marco del caballo) está en el suelo en `(x, z) + Ry(rumbo)·p`.
  - El campo se dibuja como `mundo.rotation.y = -rumbo` y cada objeto en `envolver(posSuelo - (x, z))`.

## Archivos y dueños
| Archivo | Dueño | Qué hace |
|---|---|---|
| js/main.js | coordinador (integración) | arranque, bucle, interfaz general, window.__debug |
| js/locomocion.js, js/marchas.js | agente LOCOMOCIÓN | conducción (palanca → marcha y giro), plan de pisadas en el suelo, trayectorias de cascos, movimiento del cuerpo, cuello y cabeza, giro en el lugar |
| js/caballo.js (+ js/anatomia.js nuevo, js/texturas.js) | agente CABALLO | anatomía desde cero, malla, esqueleto, pesos, color, IK 3D, `aplicarPose()` |
| js/campo.js | agente ENTORNO | campo sin fin 2D, tranqueras, `actualizar(pose, dt, t)` |
| js/palanca.js, css/style.css, index.html | agente INTERFAZ | palanca arcade, flechas del teclado, accesibilidad |
| js/montura.js, js/camaras.js | agente MONTURA (después del caballo) | arreos sobre el cuerpo nuevo |
| tools/qa/check.mjs | agente LOCOMOCIÓN | pruebas de pisadas en el suelo 2D, giros, giro en el lugar |
| docs/investigacion-*.md | agentes de INVESTIGACIÓN | especificaciones con fuentes |

Nadie edita archivos de otro dueño. Si hace falta, se pide al coordinador.

## Interfaces

### Palanca (js/palanca.js)
```js
const palanca = crearPalanca({ contenedor: document.body });
palanca.leer()        // -> { x: -1..1 (derecha +), y: -1..1 (adelante +), activa: bool }  (palanca o flechas del teclado)
palanca.mostrar(bool) // visible solo en la vista desde la montura (el teclado anda siempre)
palanca.rumbo(rad)    // brújula con el rumbo (rad, crece al doblar a la izquierda)
```

### Locomoción (js/locomocion.js)
```js
const loco = crearLocomocion({ caballo, marcha, setGait, campo });   // campo: bloqueado() y solidoEn() para frenar
loco.conducir(entrada, dt)  // entrada = palanca.leer(): sube o baja de a una marcha (setGait) y fija el giro
loco.paso(dt, speed, time)  // avanza el estado, planifica pisadas y deja la pose aplicada en el caballo
loco.pose                   // { x, z, rumbo, velocidad, giro }
loco.cur                    // { v, freq, stride, pesos } para la montura (pesos de cada tipo de marcha real)
loco.fase, loco.mano        // fase global (0..1) y mano de galope (+1 derecha)
loco.bloqueado              // true mientras un alambrado u obstáculo impide avanzar o girar hacia donde se pide
loco.patas                  // estado de cada pata (id, apoyado, ...): indicador de apoyos
loco.reiniciar(fase)        // x = z = rumbo = 0 y la marcha en régimen (lo usa __debug.freeze); ubicar(x, z, rumbo)
marcha.real                 // { nombre, tendido, giro }: la marcha que lleva el caballo (el panel la muestra)
```

### Caballo (js/caballo.js)
Además de lo que ya exporta (horse, body, neckPivot, neckRoot, headGroup, headInner, legs, hoofGeo, HOOF_H, NV, Sweep, darkMat, cuerpo, tiemposCuerpo, horneado y las superficies que usa la montura):
```js
caballo.aplicarPose(pose)  // pose en el marco del caballo:
// {
//   cuerpo: { y, cabeceo, rolido, curva },          // curva: flexión lateral del tronco (rad, + = hacia la izquierda)
//   cuello: { flexion, lateral }, cabeza: { flexion, lateral },
//   patas: { MD|MI|PD|PI: { casco: Vector3, inclinacion, apoyado } },   // casco: centro de la corona del casco
//   cola: { alzada, balanceo }, orejas: { ... }, tiempo
// }
caballo.patas  // por pata: { id, delantera, lado, hombro|cadera (Vector3 en reposo), alcanceMax, cascoReposo: Vector3 }
```
El IK de cada pata resuelve en 3D (incluye abducción lateral del hombro o la cadera) y nunca mueve un casco apoyado.

### Campo (js/campo.js)
```js
campo.actualizar(pose, dt, t)  // pose = loco.pose; mueve y rota el mundo, envuelve en x y en z
```

## Fases
1. En paralelo: INVESTIGACIÓN anatomía, INVESTIGACIÓN locomoción, ENTORNO (campo 2D), INTERFAZ (palanca).
2. CABALLO (con la investigación de anatomía).
3. LOCOMOCIÓN (con la investigación de locomoción y la API del caballo nuevo).
4. MONTURA (arreos sobre el cuerpo nuevo), QA y revisión de código.

## Criterios de aceptación
- `node tools/qa/check.mjs` OK: sin errores, cascos apoyados con menos de 3 cm de deslizamiento en el SUELO (también doblando y girando en el lugar), sin hundirse, secuencias correctas, sin temblores.
- Superposición con foto-1 (tools/qa/superponer.mjs) igual o mejor que v1; vistas tres-cuartos, frente, atrás y cabeza revisadas contra las fotos.
- Primera carga menor a 2 s en PC, siguientes menor a 0,6 s; cuerpo horneado actualizado.
- Palanca usable con mouse, dedo y teclado, a 400 px de ancho y en celular horizontal.
