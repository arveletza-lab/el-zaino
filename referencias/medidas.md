# Medidas de referencia

Medidas tomadas sobre `fotos/foto-1-perfil-izq.png` (2048x1151) con la cruz = 1,60 m.
Escala: 0,002051 m/px. Conversión a coordenadas del modelo (x adelante, y arriba, cruz en x = 0,45):
x = 0,45 + (950 − px) · 0,002051 · y = (1090 − py) · 0,002051 (suelo de las manos en py ≈ 1090).
Las patas traseras están ~3 % más cerca de la cámara (suelo en py ≈ 1128): sus medidas ya están corregidas.

Para comparar el modelo con la foto: `node tools/qa/shot.mjs <out.png> foto-1 stand 0 2048 1151 --silueta`
y `node tools/qa/superponer.mjs referencias/fotos/foto-1-perfil-izq.png <out.png> <sup.png>`.

## Puntos de la foto-1 (m, coordenadas del modelo)

| Punto | x | y | Modelo |
|---|---|---|---|
| Cruz | 0,45 | 1,60 | TOP 1,60 + relieve |
| Dorso (punto más bajo) | 0,19 | 1,57 | TOP |
| Grupa (punto más alto) | −0,27 | 1,59 | TOP |
| Nacimiento de la cola | −0,62 | 1,42 | tailRoot −0,56; 1,43 |
| Punta de la nalga | −0,69 | 1,25 | X0 = −0,70 |
| Encuentro (punta del hombro) | 1,03 | 1,05 | X1 = 1,00; top de la mano 0,93; 1,06 |
| Garganta | 1,22 | 1,71 | fin de neckCurve 1,22; 1,86 (centro) |
| Nuca | 1,33 | 2,05 | headCurve empieza en 1,30; 2,02 |
| Vientre (cincha) | 0,35–0,55 | 0,84–0,87 | BOT |
| Punta de la cadera | −0,03 | 1,46 | relieve −0,06; 1,46 |
| Babilla | −0,20 | 0,94 | root trasero −0,24; 0,92 |
| Codo | 0,72 | 0,92 | root delantero 0,72; 0,93 |
| Rodilla (carpo) | 0,73 | 0,48 | J delantero |
| Corvejón (articulación) | −0,64 | 0,58 | J trasero |
| Menudillo | 0,72 / −0,70 | 0,15–0,18 | F 0,18 |
| Casco | — | alto 0,085 | HOOF_H |

## Largos y ángulos

| Medida | Foto-1 | Estudio de pura sangre* | Modelo |
|---|---|---|---|
| Largo del cuerpo (encuentro a nalga) | 1,70 m | ≈ alzada | 1,70 m |
| Cuello (cruz a nuca) | 0,98 m | 1,5 × cabeza | 0,98 m |
| Cabeza (nuca a hocico) | ~0,6 m (girada en foto-1; 0,53 en foto-4, potrillo) | — | 0,60 m |
| Inclinación de la cabeza | 49° (girada) / 58° (foto-4) | — | 58° |
| Antebrazo (codo a rodilla) | 0,44 m | 0,46 m | 0,443 m |
| Caña delantera | 0,30 m | 0,287 m | 0,309 m |
| Pierna (babilla a corvejón) | 0,52 m | 0,53 m | 0,525 m |
| Caña trasera (corvejón a menudillo) | 0,40 m | 0,374 m | 0,40 m |
| Cuartilla | 0,12 m, ~52° al suelo | ángulo del menudillo 143° | P_LEN 0,12, REST_THETA 0,66 |
| Paleta (inclinación) | ~45° | articulación del hombro 99° | escápula a −45° |

\* Evaluation of Limb Conformation in Jumping Thoroughbred Horses, Asian Journal of Animal Sciences (2015):
https://scialert.net/fulltext/?doi=ajas.2015.208.216

## Color (muestreado en las fotos)

| Zona | Hex |
|---|---|
| Costillas al sol (foto-1) | #915c47 |
| Medio tono (foto-1) | #7c4b39 |
| Flanco en sombra (foto-1) | #542512 |
| Caña negra (foto-1) | #313226 |
| Cola (foto-1) | #1f1c20 |
| Cuerpo al sol (foto-2, muy brillante) | #862915 |
| Medio tono (foto-2) | #673022 |

Modelo: COAT #622f19, COAT_DARK #3d1a0b, LIGHT #874729, cabos negros #16100e.

## Reglas de conformación usadas

- De perfil, la mano es una columna: el menudillo cae debajo de la rodilla (no detrás).
- La vertical desde la punta de la nalga toca la punta del corvejón y baja por detrás de la caña.
- La babilla está adelante, a la altura del vientre: el miembro trasero forma una Z (cadera → babilla → corvejón).
- El cuello (línea superior) mide 1,5 veces la cabeza.

## Medidas en 3 vistas

Archivo para la herramienta: `referencias/medidas-3vistas.json` (la compara `cd tools/qa && node vistas.mjs`). Semianchos |z| en metros, normalizados a cruz 1,60 m. Fotos en `fotos/commons/` (no se suben); recortes y hojas de contactos en `recortes/vistas/`.

### Fotos usadas

| Vista | Archivo | Autor | Licencia | Uso |
|---|---|---|---|---|
| Frente | frente/Hevoset_kes_laitumella_3.jpg | kallerna | CC BY-SA 3.0 | Principal: caballo entero, casi de frente, cámara lejos |
| Frente | frente/2020_Fish_Creek_Gather_50811023847_.jpg | BLM Nevada | Dominio público | Patas y pecho (cámara cerca: el barril no sirve) |
| Frente | frente/Young_foal-dun_mare-_sorrel_gelding_IMG_5592.jpg | Betty Wills (Atsme) | CC BY-SA 4.0 | Cotejo de pecho y cabeza (yeguas anchas, sin cifras) |
| Frente | frente/Horse_007.jpg | Amada44 | Dominio público | Forma del pecho (primer plano) |
| Atrás | atras/Studfarm_in_Turkmenistan_-_Flickr_-_Kerri-Jo_74_.jpg | Kerri-Jo Stewart | CC BY 2.0 | Principal: dos caballos de atrás (alazán y castaño oscuro) |
| Atrás | atras/Turkmen_Studfarm_-_Flickr_-_Kerri-Jo_24_.jpg | Kerri-Jo Stewart | CC BY 2.0 | Cotejo: potro aislado de la derecha |
| Atrás | atras/To_The_Training_Grounds_538952650_.jpg | meteo | CC BY 2.0 | Solo forma de la grupa y la hendidura (cámara muy cerca) |
| Arriba (oblicua) | arriba/QUEENS_CAVALRY_READY_FOR_SUMMER_OF_CEREMONIAL_MOD_45162396.jpg | Sgt Rupert Frere | OGL v1.0 | Solo forma del tronco, grupa y cola |
| Arriba | arriba/Mare_and_colt_from_directly_above.jpg | Derrick Coetzee | CC0 | Solo forma (yegua echada) |

Revisadas y descartadas para cifras: Brauner.JPG (cámara a ~3 m, pecho y cabeza inflados), Palomino.jpg (cuerpo girado: se ve el flanco), Royal_Horseguard (jinetes tapan el tronco), Cadre noir y GOC Ickleford (cuerpo girado o patas en movimiento). Ninguna foto de arriba/, dorsal/ y picada/ es una vista cenital limpia de un caballo de silla (son oblicuas, potros, tiro o caballos echados); ventral/ son caballos revolcándose. Por eso "arriba" es DERIVADA.

### Método de escala

- Frente: suelo = base del casco más cercano; referencias verticales: ápice de la luz entre las manos (pecho) = 0,85 m y centro de la rodilla = 0,48 m. Hevoset_3: suelo y = 1745 px, ápice 1195, rodilla 1430 → 0,00155 m/px por las dos (coinciden al 2 %). Fish Creek: 0,00137 m/px (pecho; la rodilla no se distingue en la pata negra).
- Atrás: suelo = base de los cascos traseros; referencias: cima de la grupa 1,59 y nacimiento de la cola 1,42. Studfarm_74 (caballo de la derecha): suelo y = 1795, grupa 450, cola 580 → 0,00118 m/px por las dos (coinciden al 1 %). Caballo de la izquierda: 0,00115 (7 % entre grupa y cola). Turkmen_24 (potro): 0,0034 m/px normalizando la grupa a 1,59.
- Los caballos de las fotos no miden 1,60: las cifras son proporciones (se asume que rodilla y cima de la grupa guardan las proporciones de foto-1).
- Control con la literatura: puntas de la cadera de caballos de deporte 0,50 a 0,54 m con 1,55 a 1,62 m de cruz (Padilha et al. 2017, tabla 1: ancho de pecho 0,42, de cadera 0,54, cruz 1,62, perímetro torácico 1,84, esternón a suelo 0,86, codo a suelo 0,92; Souza 2013 citado ahí: 0,41 y 0,50 con 1,55; https://www.scielo.br/pdf/rbz/v46n1/1516-3598-rbz-46-01-00025.pdf). Escalado a 1,60: cadera 0,525 ± 0,015 (semi 0,262). En las fotos de atrás las puntas de la cadera miden semi 0,259 a 0,265: coincide.

### Corrección de perspectiva

- Frente: pecho y cabeza (cerca de la cámara) salen más grandes que el barril, 0,5 m más atrás. La distancia no se puede medir. En Hevoset_3 el barril es más ancho que el pecho y las patas son paralelas (lente larga, supongo más de 7 m): corrección +3 % al barril. En Fish Creek y Brauner la cabeza sale 40 a 60 % más ancha de lo debido (distancia ~2 a 3 m): solo valen para patas y pecho.
- Atrás: en Studfarm_74 el hombre (1,75 m) da 0,00162 m/px contra 0,00118 de los caballos: cámara a ~4,6 m de los cascos traseros. El barril (0,5 a 0,8 m más lejos que la grupa) se vería 8 a 11 % más chico: los 0,30 medidos serían 0,32 reales. No apliqué la corrección completa (daría un barril de 0,64 m de ancho, demasiado para un caballo liviano); apliqué +3 % y lo declaro como incertidumbre de ± 2 a 3 cm. Hay que tomar el barril máximo como 0,29 a 0,32.
- Giro: Hevoset_3 y Fish Creek están giradas 10 a 20°: se usó el lado derecho de la foto (el del cuerpo; el izquierdo trae cuello, cabeza y grupa asomando), que da 1 a 3 cm menos que el izquierdo.

### Mitad delantera (x > 0,2) vista de frente: semiancho por altura

| y | Hevoset_3 (lado der.) | Fish Creek (lado der.) | JSON | ± cm | Modelo hoy |
|---|---|---|---|---|---|
| 0,1 | 0,159 | 0,144 | no (depende del paso) | 3 | 0,158 |
| 0,2 | 0,120 | 0,147 | no | 3 | 0,161 |
| 0,3 | 0,119 | 0,142 | 0,140 | 2,5 | 0,154 |
| 0,5 (rodilla) | 0,137 | 0,159 | no | 3 | 0,180 |
| 0,6 | 0,141 | 0,160 | no | 3 | 0,193 |
| 0,7 | 0,164 | 0,192 | no | 3 | 0,209 |
| 0,8 | 0,198 | 0,230 | 0,215 | 2,5 | 0,216 |
| 0,9 | 0,206 | 0,242 | 0,228 | 2,5 | 0,219 |
| 1,0 | 0,240 | 0,284 | 0,262 | 2,5 | 0,247 |
| 1,1 | 0,255 | 0,275 | 0,280 | 2,5 | 0,271 |
| 1,2 | 0,258 | 0,271 | 0,278 | 2,5 | 0,264 |
| 1,3 | 0,244 | n/d | 0,255 | 3 | 0,236 |
| 1,4 | 0,211 | n/d | 0,225 | 3 | 0,220 |

Las patas dependen de cómo paró el caballo: centros de casco a ±0,095 (Hevoset_3, parado junto) y ±0,13 (Fish Creek); el modelo usa ±0,125. Desde 1,5 hay cuello y cabeza girados: no se mide. Semianchos aislados de la pata de frente (± 1 cm): casco 0,06 a 0,07 cada uno, caña 0,03 a 0,035, rodilla 0,05 a 0,055, antebrazo bajo 0,045, antebrazo alto 0,06 a 0,07.

### Mitad trasera (x < 0,2) vista desde atrás: semiancho por altura

| y | Studfarm_74 der. | Studfarm_74 izq. | Turkmen_24 | JSON | ± cm | Modelo hoy |
|---|---|---|---|---|---|---|
| 0,7 | 0,16 a 0,19 | 0,196 | n/d | 0,190 | 3 | 0,205 |
| 0,8 | 0,211 | 0,201 | n/d | 0,208 | 2 | 0,231 |
| 0,9 | 0,230 | 0,219 | n/d | 0,225 | 2 | 0,251 |
| 1,0 | 0,267 | 0,272 | n/d | 0,270 | 2 | 0,259 |
| 1,1 | 0,300 | 0,299 | 0,296 | 0,295 | 2,5 | 0,270 |
| 1,2 | 0,309 | 0,287 | n/d | 0,295 | 2,5 | 0,267 |
| 1,3 | 0,292 | 0,243 | n/d | 0,270 | 3 | 0,259 |
| 1,4 (puntas de la cadera, y ≈ 1,46) | 0,259 | n/d | 0,265 | 0,258 | 1,5 | 0,255 |

Corvejones y cañas de atrás: sin cifra estable. En Studfarm der. los cascos están casi pegados (centros a ±0,047); en la izq. las patas están abiertas (semi 0,176 a y = 0,6). El corvejón sin cola tapando mide semi 0,12 a 0,18 (el modelo usa centros a ±0,12). La cola cuelga larga entre las patas casi hasta el menudillo en las dos fotos principales y tapa los muslos.

Hendidura bajo la cola: las dos masas de las nalgas se separan por una raya vertical de 1 a 2 cm entre y ≈ 1,0 y 1,3 y se pierde bajo el dock de la cola (1,42); la luz entre los muslos abre recién a y ≈ 0,75 a 0,80. En Training_Grounds (de cerca) cada nalga es un óvalo vertical con surco central marcado.

### Anchos sueltos (cabeza, cuello, pecho)

- Pecho entre las puntas de la paleta: ancho 0,415 (Padilha: 0,42 con cruz 1,62), semi 0,21 ± 0,02. Es de la literatura, no medido en fotos.
- Cabeza a la altura de los ojos: ancho 0,215 ± 0,015 (Fish Creek da 0,215 con la escala de las patas; Padilha 0,22), semi 0,108. Hocico a la altura de las narinas: ancho 0,12 a 0,14 (semi 0,06 a 0,07), con mejillas en V que angostan la cara hacia el hocico.
- Cuello de frente: queda detrás de la cabeza y asoma 2 a 4 cm por lado cuando la cabeza está alta (Hevoset_3, Fish Creek). No se pudo medir su ancho en fotos; siguen valiendo las estimaciones de §4.3 (base 0,34, mitad 0,27, garganta 0,18 a 0,21 de ancho total).
- Forma del pecho de frente (Hevoset_3, Horse_007): un solo pecho continuo desde la garganta, con un surco central suave (2 a 3 cm de profundidad) que arranca bajo la garganta y termina entre los antebrazos; a cada lado hay una masa larga (pectoral descendente) que sobresale 2 a 4 cm y cae casi vertical al antebrazo, sin lóbulos. La luz entre los antebrazos arranca en y ≈ 0,80 a 0,85 (0,10 a 0,12 de ancho al codo; 0,17 a 0,19 de eje a eje en la rodilla). El borde de la paleta sobresale de la silueta 2 cm más que el antebrazo (0,22 a 0,24 contra 0,19 a 0,21).

### Desde arriba (derivada)

No hay foto cenital limpia. Se calcula como el máximo de las secciones a cada x, con las siluetas de frente y atrás (barril, caderas), las puntas de la cadera (0,26) y las fotos oblicuas solo para la forma: el tronco es una cuña, más ancho a la altura de las últimas costillas y los flancos, se angosta suavemente en la cinchera y vuelve a ensancharse poco en las paletas; la grupa vista desde arriba es un óvalo ancho que se cierra hacia la cola. El JSON lleva x = −0,3 a 0,6 (máximo 0,295 en x ≈ 0,1 a 0,3), ± 2,5 cm. Fuera de ese rango (nalga, base del cuello, cuello, cabeza) no hay medida confiable: valen §4.1 y §4.3 (estimaciones).

### Cortes del tronco

Solo van al JSON los puntos que salen directo de la silueta (barril máximo y puntas de la cadera). El resto es estimación.

| Corte | Semiancho máximo (y) | §4.1 | Cambia |
|---|---|---|---|
| x = 0,90 base del cuello y encuentros | ≤ 0,26 (silueta de frente a 1,0 a 1,1); puntas de la paleta ~0,21 | 0,21 (1,08) | Sin foto de este corte; no hay cambio |
| x = 0,55 cinchera | ≈ 0,23 a 0,24 (1,10) | 0,22 | +1 a 2 cm |
| x = 0,20 costillas | 0,29 (1,15); 0,265 a 1,05 | 0,29 | Igual; el modelo (0,273) está 1,7 cm abajo |
| x = 0,05 lomo | 0,29 (1,15) | 0,285 | Igual |
| x = −0,05 flanco e ijar | 0,285 (1,15); puntas de la cadera 0,26 (1,46) | 0,27 y 0,255 | +1,5 cm en el barril; puntas confirmadas |
| x = −0,30 grupa | ≈ 0,26 a 0,265 (1,15 a 1,30) | 0,26 | Igual (sin foto directa) |
| x = −0,60 nalga | sin medida | 0,18 | n/d |

### Diferencias con investigacion-anatomia.md §4

1. Barril (§4.1, §4.2): el máximo 0,29 en x = 0,2, y = 1,15 se confirma (0,29 a 0,31 desde atrás; 0,27 a 0,28 de frente sin corregir perspectiva). El modelo, 0,27, queda 2 a 2,5 cm fino de x = 0 a 0,4.
2. Muslos desde atrás (§4.2 daba 0,28 a 0,95, "babillas"): las fotos dan 0,225 a 0,9 y 0,27 a 1,0. La zona de y = 0,8 a 0,9 es 2,5 cm más angosta que lo estimado y que el modelo (0,23 a 0,25); el ensanche fuerte es recién arriba de 1,0.
3. Pecho y codos de frente (§4.2 daba 0,28 a 1,05 y a 0,95): la silueta mide 0,228 a 0,9 y 0,262 a 1,0, unos 2 cm menos. Desde arriba el modelo en x = 0,7 a 1,0 (0,254 a 0,229) queda 2 a 3 cm ancho.
4. Patas (§4.2 daba 0,16 a 0,18 a y = 0,3 a 0,5): 0,12 a 0,16 medido, pero depende del paso; conviene probar centros de casco a ±0,10 a 0,125.
5. Puntas de la cadera: §4.2 daba 0,255, medido 0,258 a 0,265. Se confirma.
6. Hendidura bajo la cola: llega hasta ~1,0 a 1,1 (no hasta 0,95).
7. Perímetro torácico: sin cambios (≈ 1,84 con las secciones de §4.1; Padilha 1,84).

Incertidumbres: ± 2 a 3 cm en el barril (perspectiva y escala ± 4 %), ± 1,5 cm en las puntas de la cadera, ± 3 cm en toda cifra de patas (paso), ± 2,5 cm en arriba y en los cortes.
