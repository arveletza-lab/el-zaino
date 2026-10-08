# Instrucciones para modelar el caballo de cero en un chat nuevo

Proyecto: C:\Users\usuario\Documents\Proyectos\caballo ("El zaino"). Leer primero CLAUDE.md.

## 1. Qué queda bien y se conserva

Funciona, está probado y no hay que rehacerlo:
- **Campo sin fin** (js/campo.js): baldosa de 800 m que se repite en x y en z, potreros con tranqueras, rancho, montes y ovejas. Tiene sólidos (`bloqueado`, `solidoEn`).
- **Palanca e interfaz** (js/palanca.js, js/main.js, css, index.html): conducción con palanca y flechas, panel compacto en la vista desde la montura, aviso de obstáculo y arranque robusto.
- **Marco del mundo**: el caballo queda en el origen mirando a +x y el mundo gira y se desplaza (`loco.pose = { x, z, rumbo, velocidad, giro }`). El sol gira con el rumbo.
- **Carga rápida**:
  - Cuerpo horneado en assets/ (js/horneado.js, tools/qa/hornear.mjs), validado por hash.
  - Pocos programas de shader: hoy son 17 y cada uno nuevo suma 0,1–0,2 s a la primera carga.
- **Herramientas de QA** (tools/qa/): check.mjs, shot.mjs (con presets, `--solo`, `--silueta`), superponer.mjs (contorno del modelo sobre foto-1 a la misma escala), compare.mjs y regresion.mjs.
- **Investigación con fuentes**: docs/investigacion-anatomia.md (esqueleto, músculos, cascos, cabeza, pelaje) y docs/investigacion-locomocion.md (marchas, ángulos y giros). Son correctas y siguen sirviendo.
- **Medidas tomadas sobre foto-1**: referencias/medidas.md.

## 2. Qué está mal y hay que rehacer: el modelo del caballo (js/caballo.js)

Síntomas que ve el usuario:
- **Bultos en la parte de adelante**: pecho, encuentro, paleta y base del cuello. También nudos en grupa y muslo, y sombreado facetado.
- **Aspecto de "muñeco"**: la forma general no termina de leerse como un caballo real.
- **Temblor de las manos al caminar**: ver la sección 3.

Por qué pasó (lecciones):
1. **El SDF armado con muchas primitivas se ve "en bultos".** Hay más de 35 músculos como elipsoides y husos unidos con smooth-min, y cada primitiva deja su propia loma. Achicar amplitudes o agrandar las mezclas solo los disimula. En el frente se superponen pectorales, encuentro, braquiocefálico, tríceps, la "masa interna" y el cierre del tronco.
2. **La forma se ajustó casi solo de perfil.** La superposición con foto-1 coincide en la silueta lateral, pero no hay referencias de frente ni desde arriba. Por eso el pecho, la paleta y la grupa quedan bien de costado y mal en tres cuartos.
3. **Primero se agregó detalle y después se corrigió el volumen.** Hay que hacerlo al revés: volumen grande correcto desde 3 vistas y, recién después, un relieve sutil.
4. **La malla se estira entre las manos y en la ingle** al galope (5 a 10 veces). Los pesos de piel por pertenencia a formas no alcanzan en esas zonas.

Cómo hacerlo esta vez (recomendado):
- **Paso 1. Referencias de frente, de atrás y desde arriba.** Conseguir fotos o láminas de conformación (sin marcas) y medirlas igual que foto-1. Anotar anchos del tronco en 6–8 secciones: cruz, cinchera, costillas, flanco, lomo, grupa y nalga; y del cuello en 4. Una parte ya está en docs/investigacion-anatomia.md §4, pero son estimaciones: verificarlas.
- **Paso 2. Un volumen liso por secciones transversales**, no una suma de primitivas:
  - Tronco, cuello y cabeza como un "loft" de secciones medidas a lo largo de la columna.
  - Las patas, como lofts propios unidos al tronco con una sola transición suave.
  - Antes de cualquier músculo, la silueta tiene que calzar de perfil (superponer.mjs con foto-1), de frente y desde arriba.
  - Alternativa válida: una jaula de control con subdivisión (Catmull-Clark) generada por código desde esas mismas secciones. Da superficies muy suaves y control de los bordes.
- **Paso 3. Relieve muscular sutil:**
  - Pocas formas, amplias y bajas (milímetros a 1–2 cm), o mejor como mapa de normales o de relieve pintado por código.
  - Nunca como bolas que cambian la silueta.
  - En el frente: un solo pecho continuo desde la garganta hasta los antebrazos, con un surco central suave, sin lóbulos sueltos.
- **Paso 4. Normales suaves**, calculadas del campo o promediadas, sin facetas. Mirarlo siempre con la luz del campo y con la de estudio.
- **Paso 5. Esqueleto y pesos al final**, sobre el volumen ya aprobado. Probar poses extremas (galope plegado, giro máximo, cabeza abajo) y medir el estiramiento de aristas. La malla debe quedar sana entre las manos y en la ingle.
- **Se conserva lo bueno de la v2**: cascos (cono con pared a ~53°, perioplo, suela y ranilla), orejas en hoja, ojo con brillo y pestañas, crin y cola de mechones con huesos propios, pelaje con reflejos y transición difuminada a los cabos negros. Se pueden reutilizar de js/caballo.js.

Reglas que siguen valiendo (están en CLAUDE.md):
- Una sola malla para el cuerpo; cascos, ojos, orejas, crin y cola van aparte.
- Marco: metros, mirando a +x, y arriba, +z = derecha; cruz 1,60 m en x = 0,45.
- Proporciones de foto-1: cuerpo 1,70 m, cuello 0,98 m de la cruz a la nuca, cabeza 0,60 m a ~58°.
- La API de pose que usa la locomoción (`aplicarPose`, `caballo.patas`, `cascoConPinza`, `cuerpo.pivote`, `patas.X.rumbo`) conviene mantenerla, o cambiarla junto con js/locomocion.js.
- Hornear después de cada cambio: `node tools/qa/hornear.mjs`.
- No subir los programas de shader; primera carga < 2 s y siguientes < 0,6 s.

## 3. Temblor de las manos al caminar (medido)

Medí la aceleración de cada casco cuadro a cuadro (1/120 s) durante 4 s al paso. El script está en qa-out/temblor.mjs:
- Todos los cascos tienen picos de unos **180 m/s²**, y el peor ocurre justo al **despegar** (apoyado → vuelo).
- Hay entre **50 y 70 picos de más de 60 m/s²** por pata en 4 s.
- Un pico así equivale a un **salto de velocidad de ~1,5 m/s en un solo cuadro**: se ve como un tirón o temblor.

Probables causas, todas en js/locomocion.js y en el IK de js/caballo.js:
- El paso del breakover (el casco rota sobre la pinza) al vuelo no es continuo en velocidad: cambia el punto fijo de la pinza a la trayectoria del vuelo.
- Despegue anticipado cuando la pata "no alcanza" (tabla ALCANCE).
- El deslizamiento de la escápula que entra y sale.
- El IK que cambia de solución entre cuadros.

Qué pedir:
- Una prueba en check.mjs que mida, cuadro a cuadro, la aceleración del casco, del menudillo, de la rodilla y del codo de cada mano. El umbral sería unos 40 m/s² al paso, y 3 a 4 veces eso al galope.
- Que la trayectoria sea continua en posición y en velocidad (C1) al despegar y al pisar.
- No suavizar a ciegas: arreglar la discontinuidad en su origen.

## 4. Proceso (para que no se demore ni se corte)

- **Límite de uso**: cuatro agentes grandes en paralelo agotaron el límite tres veces. Conviene:
  - Un agente por vez para el caballo, que es el trabajo más largo.
  - Como mucho dos en paralelo, y solo si tocan archivos distintos.
- **Archivos por agente**: cada agente toca solo sus archivos; quien coordina integra main.js.
- **Criterios medibles** antes de empezar: superposición en 3 vistas, estiramiento máximo de aristas, aceleración máxima de las articulaciones, tiempos de carga y programas de shader. Que check.mjs los compruebe.
- **Mirar primeros planos cada pocas iteraciones**: pecho de frente, tres cuartos, de atrás, manos al paso en cámara lenta (sim de 1/120 s), cabeza, cascos. Comparar con las fotos.
- **Pedir una revisión independiente** (qa-render + code-reviewer) al final de cada etapa, no solo al terminar todo.
- **Usar en el chat nuevo los agentes del proyecto** (.claude/agents/: referencia-fotos, caballo, qa-render, entorno, montura-camaras, ui-hud).

## 5. Mensaje sugerido para empezar el chat nuevo

> Leé CLAUDE.md, docs/instrucciones-nuevo-chat.md, docs/investigacion-anatomia.md y referencias/medidas.md. Vamos a rehacer desde cero el MODELO del caballo (js/caballo.js), conservando campo, palanca, interfaz, horneado, herramientas de QA y la API de pose que usa js/locomocion.js. Problemas a resolver: bultos en el frente (pecho, encuentro, paleta), aspecto de muñeco, malla estirada entre las manos y en la ingle, y el temblor de las manos al caminar (picos de ~180 m/s² al despegar, ver la sección 3). Método: primero referencias y medidas de frente, de atrás y desde arriba; después un volumen liso por secciones transversales que calce en las 3 vistas; recién después un relieve muscular sutil; al final esqueleto y pesos. Trabajá con un subagente por vez y verificá cada etapa con capturas y check.mjs.
