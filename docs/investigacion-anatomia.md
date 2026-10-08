# Investigación de anatomía: especificación para el caballo v2

Documento de trabajo para el agente CABALLO (rediseño v2, ver docs/rediseno-v2.md). Reúne datos de anatomía veterinaria, estudios de conformación y mediciones propias sobre las fotos de referencia, todo traducido al marco del modelo.

**Marco:** metros; caballo en el origen mirando a +x; y arriba; +z = lado DERECHO. Alzada a la cruz 1,60 m, cruz en x = 0,45. Las tablas dan el lado derecho (z > 0): el izquierdo es el espejo (z → −z).

**Cómo leer las fuentes:** [F#] remite a la lista de fuentes del final. **"Medición propia"** quiere decir medido en foto-1 con la escala del proyecto (0,002051 m/px; x = 0,45 + (950 − px)·0,002051; y = (1090 − py)·0,002051; las patas traseras de foto-1 están ~3 % más cerca de la cámara). **"Estimación"** quiere decir que el número no está en las fuentes ni se puede medir en las fotos (por ejemplo, anchos vistos de frente): sale de proporciones anatómicas y hay que verificarlo en la superposición. Los recortes con grilla en coordenadas del modelo están en `referencias/recortes/anatomia/`.

> **Advertencia sobre los ángulos publicados.** Los ángulos articulares de los estudios de conformación se miden con marcadores en la piel y cada estudio usa marcas distintas. Por eso, por ejemplo, el corvejón da 148–160° en la literatura y ~133° entre centros articulares en foto-1. En el modelo mandan las **posiciones de los centros articulares** de la §1.2, que reproducen la silueta de foto-1. Los ángulos publicados sirven solo como control de rango.

---

## 0. Resumen de decisiones (lo que el modelador tiene que llevarse)

1. **Primero el esqueleto.** Se define una tabla de centros articulares y marcas óseas (§1.2) en reposo (parado en cuadro). Todo lo demás (músculos, tendones, relieves) se expresa **relativo a esos puntos**, para poder ajustar proporciones sin rehacer formas.
2. **Una sola malla, de un campo de distancias por capas** (§7.3): huesos subcutáneos → músculos (husos con origen e inserción en huesos) → tendones → "piel" (unión suave global más un desplazamiento de 4–8 mm). Se poligoniza **una vez**, en reposo, y se hornea. Se mantiene Surface Nets, pero en banda estrecha a **h ≈ 9 mm** (≈ 100 mil vértices, ≈ 200 mil triángulos), con **proyección de los vértices a la isosuperficie** y **normales tomadas del gradiente del campo** en lugar de 4 pasadas de Taubin, que borran los surcos.
3. **Surcos y relieves controlados por pares:** el radio de mezcla `k` de cada unión suave decide si el borde entre dos músculos se ve marcado (k = 0,5–1,5 cm) o suave (k = 3–8 cm). Las líneas que no son bordes de músculo (surco yugular, pliegue del flanco, surco de los isquiotibiales, hueco delante de la cuerda del corvejón) se tallan con **curvas de surco** (§7.3.4).
4. **Pesos de piel por pertenencia:** cada primitiva lleva el hueso (o el par de huesos) al que pertenece, y el peso de cada vértice sale de qué primitivas forman la superficie en ese punto. Así la piel sigue a los músculos. Esqueleto de unos 38 huesos (§7.4), con escápula móvil sobre el tórax.
5. **Correctivos de pose horneados** (morph targets, como máximo 8 en r128) para codo/rodilla, babilla/corvejón y cuello. Se calculan al hornear reevaluando el campo en la pose flexionada y proyectando los vértices; la técnica es la de "implicit skinning" [F21], hecha fuera de línea.
6. **Proporciones de foto-1** (referencias/medidas.md), cerradas con largos óseos reales: escápula 0,54 m con cartílago a 52°, húmero 0,30, radio 0,365, caña delantera 0,267, fémur 0,39, tibia 0,45, caña trasera 0,40, cuartilla a 54° adelante y 57° atrás.

---

## 1. Esqueleto

### 1.1 Lista de huesos y articulaciones relevantes

| Región | Huesos | Articulaciones (nombre común) | Importancia para forma y movimiento |
|---|---|---|---|
| Cabeza | cráneo, mandíbula, hioides | atlanto-occipital (nuca), temporomandibular | Cráneo largo; órbita completa con arco cigomático; cresta facial; mandíbula con ganacha ancha. |
| Cuello | 7 cervicales (C1 atlas, C2 axis el más largo) | AO (flexión de la nuca), atlanto-axial (giro), C2–C7 | La columna cervical va **baja** en la base del cuello y hace una S [F9]; la cresta es ligamento nucal más grasa, no hueso. |
| Tórax | 18 torácicas, 18 pares de costillas (8 esternales, 10 asternales), esternón | — | Espinosas T2–T9 forman la cruz; la cima es T5–T6 [F8]. Anticlinal T16. |
| Lomo | 6 lumbares | lumbosacra | Las transversas lumbares, largas y planas, dan el lomo ancho y plano. La lumbosacra concentra la flexión dorsoventral en el galope [F10][F14]. |
| Grupa | sacro (5 fusionadas), pelvis (ilion, isquion, pubis) | sacroilíaca (casi rígida), coxofemoral (cadera) | Marcas visibles: punta de la cadera (tuberosidad coxal), tuberosidad sacra, punta de la nalga (tuberosidad isquiática). |
| Cola | 15–21 coccígeas | — | Maslo (parte carnosa) de ~0,45–0,5 m. |
| Mano | escápula + cartílago, húmero, radio (+ cúbito fusionado, olécranon), 7–8 carpianos, metacarpiano III (caña) + II y IV (peronés), sesamoideos proximales, P1, P2, navicular, P3 | hombro (escápulo-humeral), codo, rodilla (carpo), menudillo (metacarpofalángica), cuartilla (interfalangiana proximal), corona (interfalangiana distal) | **Sin clavícula:** la escápula rota y se desliza sobre el tórax, sostenida por la cincha muscular (serrato ventral) [F12][F27]. |
| Pata | fémur, rótula, tibia (+ peroné vestigial), 6–7 tarsianos con calcáneo, metatarsiano III + II y IV, sesamoideos, P1, P2, navicular, P3 | cadera, babilla (femororrotuliana + femorotibial), corvejón (tarsocrural), menudillo, cuartilla, corona | **Aparato recíproco:** babilla y corvejón se flexionan juntos (peroneo tercero adelante, flexor digital superficial atrás) [F17][F18]. La rótula se traba al dormir parado. |

### 1.2 Centros articulares y marcas óseas en reposo (parado en cuadro)

"Centro" = eje de giro de la articulación (lo que usan los huesos del esqueleto). "Piel" = el punto de la superficie que se ve en la foto. Lado derecho (z > 0). Las coordenadas x, y de las marcas de piel salen de foto-1 (medidas.md y medición propia). Las z son **estimaciones** cerradas con los anchos publicados: pecho 0,41 m en criollos [F25], fémur con 10,7 cm entre cóndilos [F7].

#### Columna (cuerpos vertebrales; z = 0)

| Punto | x | y | Nota |
|---|---|---|---|
| Nuca (cresta nucal, piel) | 1,33 | 2,05 | medidas.md |
| Articulación atlanto-occipital (AO) | 1,285 | 1,955 | ~9 cm por debajo de la nuca |
| C1/C2 | 1,235 | 1,885 | Alas del atlas (relieve detrás de la ganacha): (1,24; 1,90; ±0,075) |
| C2/C3 | 1,165 | 1,745 | C2 ≈ 0,16 m, la vértebra más larga |
| C3/C4 | 1,09 | 1,625 | |
| C4/C5 | 1,015 | 1,51 | |
| C5/C6 | 0,945 | 1,395 | |
| C6/C7 | 0,89 | 1,29 | |
| C7/T1 | 0,83 | 1,215 | Punto más bajo de la S cervical (estimación) |
| T6 (cuerpo) | 0,60 | 1,28 | Su espinosa, muy inclinada hacia atrás, forma la cruz |
| T10 | 0,43 | 1,32 | |
| T14 | 0,26 | 1,35 | |
| T16 (anticlinal) | 0,18 | 1,36 | Espinosa vertical [F8] |
| T18/L1 | 0,10 | 1,375 | Última costilla |
| L6/S1 (lumbosacra) | −0,20 | 1,43 | Justo delante y debajo de la tuberosidad sacra |
| Fin del sacro (S5) | −0,46 | 1,42 | |
| Cd1 | −0,50 | 1,415 | Nacimiento de la cola en la piel: (−0,62; 1,42) |

Largo total cervical (AO → T1) ≈ 0,87 m: C1 0,09; C2 0,16; C3–C5 0,14; C6 0,12; C7 0,10 (estimación ajustada a foto-1, con cuello de 0,98 m en la línea superior). Torácicas ≈ 4,2 cm cada una; lumbares ≈ 5 cm.

**Puntas de las espinosas** (hueso, ~1–1,5 cm bajo la piel): T2 (0,70; 1,48) · T4 (0,56; 1,575) · **T6 (0,45; 1,585) = cruz** · T8 (0,37; 1,58) · T10 (0,29; 1,565) · T12 (0,22; 1,555) · T16 (0,09; 1,56) · L3 (0,00; 1,57) · L6 (−0,13; 1,575). Las de T2–T9 miden 0,25–0,35 m e inclinan 25–35° hacia atrás. Desde T17 inclinan hacia adelante [F8].

#### Tórax

| Punto | x | y | z | Nota |
|---|---|---|---|---|
| Manubrio (punta del esternón, "punta del pecho") | 0,98 | 1,00 | 0 | Entre los dos encuentros |
| Esternón, punto más bajo | 0,55 | 0,885 | 0 | Bajo la cinchera; la piel queda a 0,85–0,86 |
| Apófisis xifoides | 0,33 | 0,88 | 0 | |
| Primera costilla | de T1 (0,83; 1,215) a (0,96; 1,00) | | ±0,10 | Casi vertical, oculta bajo la paleta |
| Costillas 8–10 (las más largas, ~0,65–0,70 m) | de (0,52; 1,30) a (0,36; 0,90) | | ±0,26 en su parte más ancha | Bajan hacia atrás; el cartílago costal vuelve hacia adelante hasta el esternón |
| Última costilla (18) | de (0,10; 1,37) a (−0,02; 1,08) | | ±0,26 | |
| Arco costal (piel) | (0,05; 1,30) → (0,15; 1,05) → (0,32; 0,88) | | | Se insinúa en caballos magros |

Semiancho máximo del tórax (hueso + músculo intercostal): ~0,26 a la altura de las costillas 12–14 (x ≈ 0,15–0,25; y ≈ 1,15). Con piel, ~0,29 (ver §4).

#### Miembro anterior (mano)

| Punto | x | y | z | Nota |
|---|---|---|---|---|
| Borde dorsal de la escápula (cartílago), centro | 0,635 | 1,505 | 0,10 | Ángulo craneal (0,72; 1,52; 0,09); ángulo caudal (0,54; 1,46; 0,11) |
| Tuberosidad de la espina escapular | 0,80 | 1,30 | 0,175 | Inserción del trapecio; relieve leve |
| **Hombro** (centro glenohumeral) | 0,965 | 1,075 | 0,165 | |
| Encuentro (tubérculo mayor, piel) | 1,03 | 1,06 | 0,20 | medidas.md (1,03; 1,05) |
| Tuberosidad deltoidea | 0,88 | 0,98 | 0,20 | Inserción del braquiocefálico y del deltoides |
| **Codo** (centro) | 0,735 | 0,89 | 0,165 | Epicóndilo lateral (piel): (0,74; 0,90; 0,20) |
| Punta del codo (olécranon) | 0,65 | 0,96 | 0,15 | Sobresale hacia atrás y arriba |
| Articulación antebraquiocarpiana | 0,735 | 0,525 | 0,13 | |
| **Rodilla** (centro del carpo) | 0,735 | 0,48 | 0,13 | medidas.md |
| Hueso accesorio del carpo (bulto atrás de la rodilla) | 0,68 | 0,50 | 0,135 | |
| Carpometacarpiana | 0,735 | 0,445 | 0,128 | |
| Botón del peroné (fin del metacarpiano IV) | 0,72 | 0,31 | 0,145 | Medial (II): z = 0,105 |
| **Menudillo** (centro) | 0,735 | 0,178 | 0,125 | Sesamoideos atrás (0,70; 0,18); espolón (0,685; 0,15) |
| Cuartilla, interfalangiana proximal | 0,791 | 0,101 | 0,125 | P1 = 0,095 a 54° del suelo |
| Corona, interfalangiana distal | 0,826 | 0,053 | 0,125 | P2 = 0,06 |
| Rodete coronario | adelante (0,84; 0,068), talón (0,765; 0,035) | | | |
| Casco en el suelo | lumbre (0,891; 0), talones (0,76; 0) | | ancho 0,125 | |
| Castaño (callo córneo) | 0,74 | 0,60 | 0,10 (cara medial) | ~10–12 cm sobre la rodilla |

#### Miembro posterior (pata)

| Punto | x | y | z | Nota |
|---|---|---|---|---|
| Punta de la cadera (tuberosidad coxal) | −0,04 | 1,46 | 0,245 | medidas.md; ancho de cadera ~0,49 en hueso y ~0,51 con piel |
| Tuberosidad sacra | −0,22 | 1,575 | 0,045 | La cima de la grupa en la piel queda en (−0,27; 1,59) |
| **Cadera** (cabeza del fémur, acetábulo) | −0,37 | 1,25 | 0,20 | Estimación: 0,58 del camino de la punta de la cadera a la de la nalga, 8–10 cm por debajo de esa línea |
| Trocánter mayor ("articulación" visible) | −0,34 | 1,33 | 0,235 | |
| Tercer trocánter | −0,31 | 1,12 | 0,235 | Inserción del glúteo superficial |
| Punta de la nalga (tuberosidad isquiática, hueso) | −0,625 | 1,28 | 0,10 | En la piel, la silueta (−0,69; 1,25) es la masa del semitendinoso |
| **Babilla** (centro femorotibial) | −0,265 | 0,875 | 0,19 | Cóndilo lateral (piel): (−0,25; 0,87; 0,25) |
| Rótula (frente de la babilla) | −0,19 | 0,94 | 0,17 | Piel en (−0,17; 0,95) (medición propia) |
| Tuberosidad de la tibia | −0,215 | 0,86 | 0,17 | |
| **Corvejón** (centro tarsocrural) | −0,615 | 0,575 | 0,135 | medidas.md (−0,64; 0,58), con la pata llevada a la vertical (en foto-1 la PI está remetida hacia atrás) |
| Punta del corvejón (tuberosidad calcánea) | −0,70 | 0,65 | 0,135 | En la plomada de la punta de la nalga [F4] |
| Maléolo lateral | −0,61 | 0,60 | 0,175 | |
| **Menudillo** trasero | −0,615 | 0,175 | 0,12 | |
| Cuartilla (interfalangiana proximal) | −0,566 | 0,100 | 0,12 | P1 = 0,09 a 57° |
| Corona (interfalangiana distal) | −0,536 | 0,053 | 0,12 | |
| Casco en el suelo | lumbre (−0,473; 0), talones (−0,60; 0) | | ancho 0,115 | |
| Castaño | −0,62 | 0,48 | 0,08 (cara medial) | Justo debajo del corvejón |

### 1.3 Largos (entre centros) y ángulos en reposo

| Segmento | Largo en el modelo | Referencia | Ángulo en reposo (modelo) | Rango publicado |
|---|---|---|---|---|
| Escápula + cartílago | 0,54 | Línea externa cruz–encuentro 0,69 en pura sangre [F1] | 52,5° con la horizontal | 40–55° [F2]; 58° en Morna [F3]; 60° en criollo [F25] |
| Húmero | 0,295 | brazo 0,34 externo [F1] | 39° bajo la horizontal (hacia atrás) | |
| Hombro (escápula–húmero) | — | — | **91°** | 87–99° [F1][F3] |
| Radio (codo → antebraquiocarpiana) | 0,365 | antebrazo 0,46 externo [F1]; 0,44 en foto-1 | vertical | |
| Codo (húmero–radio) | — | — | **129°** | 123–138° [F1][F3][F6] |
| Carpo | — | — | 180° (columna recta) | 171–178° [F1][F3][F6] |
| Caña delantera (carpometacarpiana → menudillo) | 0,267 | caña 0,287 externa [F1] | vertical | |
| Menudillo delantero | — | — | **144°** (cuartilla a 54° del suelo) | 143–149° [F1][F3][F6] |
| Cuartilla delantera (P1 + P2) | 0,155 | — | 54° del suelo | 52° en foto-1; 61° en Morna [F3] |
| Pelvis (punta de la cadera → punta de la nalga) | 0,61 | "croup length" 0,57 en criollos de 1,42 m [F25] | 17° (línea de las tuberosidades); grupa ≈ 22° [F25] | |
| Fémur (cadera → babilla) | 0,39 | Largo máximo del fémur 0,46 con el trocánter [F7] | 74° bajo la horizontal, hacia adelante | |
| Cadera (punta de la cadera–trocánter–rótula) | — | — | **92°** | 78–89° [F1][F3][F6] |
| Tibia (babilla → corvejón) | 0,45 | pierna 0,53 externa [F1]; 0,52 en foto-1 | 41° sobre la horizontal | |
| Babilla (fémur–tibia) | — | — | **116°** | 100–129° [F1][F3][F6] |
| Caña trasera (corvejón → menudillo) | 0,40 | caña 0,374 externa [F1]; 0,40 en foto-1 | vertical | |
| Corvejón (tibia–caña) | — | — | **133°** | 148–160° con marcadores en la piel [F1][F3][F6][F25] (ver la advertencia del principio) |
| Menudillo trasero | — | — | 147° (cuartilla a 57°) | 150–156° [F1][F3][F6] |

### 1.4 Rangos de movimiento (para el IK y para los correctivos)

| Articulación | Rango | Fuente |
|---|---|---|
| Hombro | ~25–35° de flexión-extensión al paso y al trote | estimación a partir de [F15][F27] |
| Escápula | Rota sobre el tórax alrededor de un punto en su **tercio dorsal**; el miembro entero pendula desde ahí. El borde caudal baja y retrocede cuando el miembro se extiende. Recorrido de ±8–12° (estimación). | [F27][F15] |
| Codo | al trote, 91° flexionado a 146° extendido | [F16] |
| Carpo | al trote, 99° flexionado a 181° extendido (hiperextensión leve en el apoyo); flexión pasiva máxima ~140° respecto de recto | [F16][F13] |
| Menudillo delantero | 62° al paso, 77° al trote (flexión-extensión); en el apoyo se extiende (el menudillo "baja") y en la elevación se flexiona; 13–18° de abducción y aducción | [F11] |
| Cuartilla (interfalangiana proximal) | 13–14° | [F12b] |
| Corona (interfalangiana distal) | 46–47° | [F12b] |
| Cadera | ~30–40° al paso y al trote | estimación |
| Babilla y corvejón | **Acoplados** por el aparato recíproco: Δcorvejón ≈ Δbabilla. Corvejón ~40–44° al trote (3D), flexión pasiva máxima ~135° | [F17][F18][F13][F16b] |
| Columna toracolumbar | por segmento: flexión-extensión 2,8–4,9°, flexión lateral 1,9–3,6°, rotación axial 4,6–5,8°. La flexión lateral máxima está en T11–T12; la flexión dorsoventral máxima, en la lumbosacra y en el galope. | [F14][F10] |
| Cuello | Muy móvil. La nuca (AO) flexiona y extiende ~90° en total; la atlanto-axial gira la cabeza (inclinación ±30–40°); la base C6–T1 da la mayor parte de la flexión lateral y vertical del cuello. | estimación anatómica |
| Orejas | Cada una gira hasta ~180° en forma independiente, con 10–16 músculos | [F23] |

**Reglas de movimiento que conviene respetar en el código:**
- Mano: en el balanceo, el miembro pendula desde el tercio dorsal de la escápula; en el apoyo, el tronco "cuelga" en la cincha muscular y puede bajar unos centímetros entre las paletas.
- Pata: pendula desde la cadera al paso y al trote, y desde la lumbosacra en el galope y el galope tendido [F27]. Babilla y corvejón se flexionan juntos.
- Menudillo: en el apoyo bajo carga se extiende 15–25° más que en reposo (el menudillo "cae"). En el balanceo se flexiona fuerte, para que el casco pase cerca del suelo.

---

## 2. Músculos superficiales que dan la silueta y el relieve

Convenciones: **O** = origen, **I** = inserción (puntos de la §1.2 o del hueso indicado). "Vientre" = tamaño de la parte carnosa (largo × ancho × espesor, en metros, espesor sobre el hueso). "Borde": **marcado** = surco visible con luz rasante (k de mezcla 0,5–1,5 cm); **suave** = transición sin línea (k 3–8 cm). Coordenadas del lado derecho. Anatomía de [F19][F20][F22][F24][F26]; volúmenes estimados y verificados contra foto-1 y foto-2.

### 2.1 Cuello y cabeza

| Músculo | O → I (en coordenadas) | Vientre | Borde y aspecto | Al moverse |
|---|---|---|---|---|
| **Cresta del cuello** (ligamento nucal funicular + grasa + romboides cervical) | nuca (1,30; 2,02) → cruz (0,50; 1,59), por arriba de C2–T3 | 0,95 × 0,06–0,10 (alto sobre el esplenio) × 0,05–0,08 de semiancho | Convexa y suave; en el criollo (foto-1) es gruesa. Forma la línea superior del cuello. | Con el cuello estirado se afina; con el cuello flexionado se arquea y, del lado cóncavo, hace pliegues de piel. |
| **Esplenio** | espinosas T3–T5 y ligamento nucal (0,60; 1,52) → cresta nucal y alas de C1–C3 (1,22; 1,90) | 0,70 × 0,20–0,25 × 0,03–0,05 | Gran triángulo plano entre la cresta y el braquiocefálico. Su borde ventral es un surco **suave** paralelo a la cresta, ~8–12 cm por debajo de ella. | Se acorta y engrosa al levantar o doblar el cuello hacia su lado. |
| **Braquiocefálico** (cleidomastoideo + cleidobraquial) | mastoides, cresta nucal y ala del atlas (1,25; 1,90; 0,07) → tuberosidad deltoidea y cresta humeral (0,90; 0,99; 0,19) | 0,95 × 0,08–0,10 × 0,03–0,04 (cinta) | Banda en la parte baja del costado del cuello, que llega al encuentro. Su borde ventral es el borde superior del **surco yugular** (**marcado** en caballos magros, moderado acá). | Al adelantar la mano se acorta y abulta en la base del cuello. Con la mano apoyada, baja la cabeza. |
| **Esternocefálico** (esternomandibular) | manubrio (0,98; 1,00; 0,02) → borde caudal de la rama mandibular (1,36; 1,72; 0,07) | 0,85 × 0,04 × 0,025 | Cordón bajo, en la línea inferior del cuello. Su borde dorsal cierra el surco yugular por abajo. | Flexiona la cabeza. Tenso al bajar la cabeza. |
| **Omotransverso** | ala del atlas (1,23; 1,88) → espina escapular y fascia del hombro (0,92; 1,15) | queda por debajo del braquiocefálico en la mitad superior | No se ve aparte: engrosa la mitad dorsal del braquiocefálico. | — |
| **Trapecio cervical** | ligamento nucal de C2 a T3, a lo largo de la cresta (1,00; 1,85) → (0,55; 1,58) → tuberosidad de la espina escapular (0,80; 1,30; 0,175) | lámina triangular, 0,01–0,015 de espesor | Triángulo plano por encima de la espina escapular. Su borde inferior hace una línea **suave** hacia la tuberosidad. | Levanta la escápula. |
| **Serrato ventral cervical** | transversas de C4–C7 (1,00; 1,50 → 0,88; 1,28; ±0,10) → cara medial y craneal de la escápula (0,70; 1,48) | 0,30 × 0,15 × 0,05 | Masa en abanico en la base del cuello, delante de la paleta, entre el braquiocefálico y la escápula. Borde **suave**. | Sostiene el tórax ("cincha muscular"). |
| **Masetero** | cresta facial y arco cigomático → cara lateral de la rama mandibular | ~0,18 × 0,15 × 0,02–0,03 | Forma la **ganacha**, plana y redonda, que es el plano más grande de la cabeza. Arriba la limita la cresta facial (borde **marcado**); adelante, la escotadura vascular de la mandíbula (surco **marcado** por donde cruzan la arteria y la vena faciales). | Se hincha al masticar. |
| **Elevador del labio superior y elevador nasolabial** | debajo y delante del ojo (1,46; 1,82) → ala de la nariz y labio (1,56; 1,58) | finos | Planos diagonales en el costado del hocico. Le dan la "caída" de la cara entre la cresta facial y el ollar. | Abren el ollar y levantan el labio. |
| **Temporal** | fosa temporal → apófisis coronoides | relleno | Por encima del ojo queda la **fosa supraorbitaria**, un hueco de ~4 cm de diámetro y 0,5–1 cm de profundidad. | Late al masticar. |

### 2.2 Paleta, brazo y antebrazo

| Músculo | O → I | Vientre | Borde y aspecto | Al moverse |
|---|---|---|---|---|
| **Trapecio torácico** | espinosas de T3–T10 (0,55 → 0,25; ~1,57) → tuberosidad de la espina escapular | lámina de 0,01 | Plano, en la cara superior detrás de la cruz. | — |
| **Supraespinoso** | fosa supraespinosa (0,70; 1,48 → 0,90; 1,15) → tubérculos mayor y menor (1,01; 1,08) | 0,40 × 0,08 × 0,04–0,05 | Rellena la paleta por delante de la espina. | — |
| **Infraespinoso** | fosa infraespinosa (0,62; 1,45 → 0,86; 1,15) → tubérculo mayor, parte caudal (0,98; 1,07) | 0,38 × 0,10 × 0,04 | Por detrás de la espina. La **espina escapular**, entre los dos, se ve como un surco o una línea leve desde (0,66; 1,48) hasta (0,93; 1,13). | — |
| **Deltoides** | espina escapular y borde caudal de la escápula (0,75; 1,30 → 0,60; 1,40) → tuberosidad deltoidea (0,88; 0,98; 0,20) | 0,25 × 0,08 × 0,03 | Bulto oblicuo detrás del encuentro. Su borde inferior, con el tríceps, hace la línea **marcada** "deltoides-tríceps". | Abulta al flexionar el hombro. |
| **Tríceps braquial** (cabeza larga + lateral) | larga: borde caudal de la escápula (0,62; 1,42); lateral: húmero (0,84; 1,02) → olécranon (0,65; 0,96) | triángulo de 0,38 de alto × 0,22 de ancho × 0,08–0,10 | La mayor masa del brazo, con vértice en la punta del codo. Su **borde superior** es una línea oblicua del encuentro hacia el ángulo caudal de la escápula, **marcada** en caballos en forma (se ve en foto-1 en (0,62–0,85; 1,10–1,30)). Atrás, el surco de la cinchera lo separa del tórax. | Duro y abultado en el apoyo; se ablanda en el balanceo. |
| **Dorsal ancho** | fascia toracolumbar, de T4 a L1 (0,55 → 0,10; 1,55) → tuberosidad redonda mayor del húmero, cara medial (0,80; 1,05) | lámina de 0,01–0,02 | Borde craneal diagonal **suave** detrás de la escápula. | Retrae el miembro. |
| **Pectoral descendente** (superficial) | manubrio (1,00; 1,00; ±0,03) → cresta humeral (0,90; 0,98; 0,17) | 0,15 × 0,10 × 0,04–0,05 | Los dos **bultos del pecho**, uno a cada lado, con un surco medio **marcado** entre ellos (la "V" del pecho visto de frente). | Aduce el miembro. |
| **Pectoral transverso** | esternón (0,85 → 0,65; 0,92) → fascia medial del antebrazo (0,74; 0,82; 0,13) | 0,20 × 0,10 × 0,03 | Forma el vértice inferior del pecho y la "axila" por delante del antebrazo. | — |
| **Pectoral ascendente** (profundo) | esternón y túnica abdominal (0,75 → 0,40; 0,88) → tubérculos del húmero | 0,40 × 0,12 × 0,05 | Llena la cinchera por abajo. | — |
| **Extensor carpo-radial** | epicóndilo lateral (0,76; 0,92; 0,19) → tuberosidad del metacarpiano III (0,745; 0,44) | vientre en los 2/3 superiores del antebrazo: 0,25 × 0,06 × 0,03 | Frente del antebrazo. Su tendón cruza la cara anterior de la rodilla y se ve. | Tenso al extender. |
| **Extensor digital común y extensor digital lateral** | epicóndilo lateral, radio → P3 (apófisis extensora) y P1 | vientres de 0,22 × 0,04 × 0,02 en la cara lateral | Surcos verticales **marcados** en la cara lateral del antebrazo. Los tendones bajan por el frente de la caña. | — |
| **Ulnar lateral y flexores del carpo y de los dedos** | epicóndilos lateral y medial → accesorio del carpo (0,68; 0,50) y, por los tendones flexores, P2 y P3 | masa caudal de 0,28 × 0,08 × 0,04 | Cara caudal del antebrazo. Un surco vertical **marcado** los separa de los extensores en la cara lateral. | Al flexionar la rodilla, el accesorio sobresale atrás. |

**Forma del antebrazo:** ancho arriba (prof. 0,16–0,18 m incluido el pecho), en cono hasta la rodilla (prof. 0,10–0,11). Los músculos ocupan los 2/3 superiores; el tercio distal es de tendones, más plano y de bordes nítidos.

### 2.3 Tronco

| Músculo | O → I | Aspecto |
|---|---|---|
| **Serrato ventral torácico** | costillas 1–8/9, cara lateral (dientes en (0,55 → 0,35; 1,05 → 1,15)) → cara medial de la escápula (0,62; 1,45) | En caballos en forma se ven 4–5 **dientes de sierra** detrás del tríceps, de ~0,05 de ancho y 2–4 mm de relieve, que se intercalan con los del oblicuo externo. |
| **Oblicuo externo del abdomen** | costillas 5–18, cara lateral → línea alba, tendón prepúbico, punta de la cadera | Lámina fina. Forma el flanco. Por delante de la punta de la cadera y por debajo de las transversas lumbares queda la **fosa del ijar** (hueco de 1,5–2,5 cm). |
| **Longísimo e iliocostal** | a los lados de las espinosas, de la cruz al sacro | Llenan el dorso y el lomo: el **lomo** es ancho y plano (semiancho 0,15–0,17 en y ≈ 1,50). En un caballo bien musculado las espinosas quedan al ras (sin cresta); en uno magro se marcan. |
| **Pliegue del flanco** (pliegue de la babilla, piel) | de (−0,02; 1,25) a la babilla (−0,17; 0,97) | Pliegue de piel **marcado** entre el abdomen y el muslo. En foto-1 se ve muy claro, de (−0,04; 1,46) a (−0,16; 1,02), junto con el borde del tensor de la fascia lata. |

### 2.4 Grupa, muslo y pierna

| Músculo | O → I | Vientre | Borde y aspecto | Al moverse |
|---|---|---|---|---|
| **Glúteo medio** | aponeurosis del longísimo (0,00; 1,50), ala del ilion, sacroilíaca → trocánter mayor (−0,34; 1,33; 0,235) | 0,45 × 0,25 × 0,10–0,14 (el músculo más grande del caballo) | Da toda la redondez de la grupa entre la punta de la cadera, la tuberosidad sacra y la cola. Bordes **suaves**. | Se contrae en el impulso. |
| **Glúteo superficial** | punta de la cadera (−0,04; 1,46) y fascia glútea → tercer trocánter (−0,31; 1,12; 0,24) | "V" fina de 0,02–0,03 | Su cabeza craneal baja oblicua desde la punta de la cadera. Un surco **marcado** la separa del tensor de la fascia lata. | — |
| **Tensor de la fascia lata** | punta de la cadera (−0,04; 1,46; 0,25) → fascia lata, rótula (−0,18; 0,95) | vientre de 0,30 × 0,10 × 0,03 en la mitad superior | Es el **borde anterior del muslo**: la diagonal punta de la cadera → babilla, muy visible en foto-1. | Tenso al adelantar la pata. |
| **Cuádriceps** (vasto lateral) | fémur → rótula | 0,30 × 0,12 × 0,08 | Bulto delantero del muslo por encima de la babilla, en (−0,22; 1,05). Lo cubren el tensor y la fascia. | — |
| **Bíceps femoral** (con el glúteo superficial forma el glúteo-bíceps) | ligamento sacrotuberoso, punta de la nalga (−0,62; 1,30) y primeras coccígeas → rótula, cresta tibial y, por el tendón tarsiano, calcáneo | 0,55 × 0,25 × 0,08–0,10 | Ocupa la cara lateral del muslo entre el fémur y el semitendinoso. En foto-1 se ve un **surco oblicuo** de (−0,23; 1,36) a (−0,46; 0,83): muy probablemente el que separa sus porciones craneal y caudal (rotular y tibial). Hay que reproducirlo como surco **suave a marcado**. | Abulta en el impulso. |
| **Semitendinoso** | primeras coccígeas y punta de la nalga (−0,60; 1,40 → −0,62; 1,28) → cresta tibial (cara medial) y calcáneo (−0,68; 0,66) | 0,60 × 0,10–0,12 × 0,08–0,10 | Hace la **silueta posterior del muslo** (la "nalga") desde la punta de la nalga hasta la pierna. El surco con el bíceps femoral (**surco de los isquiotibiales**, "línea de la pobreza" en caballos flacos) es casi vertical, en x ≈ −0,60 → −0,55, de y 1,25 a 0,85. | Se marca en el impulso. |
| **Semimembranoso** | punta de la nalga (cara ventral) y coccígeas → cóndilo femoral medial | 0,45 × 0,12 × 0,10 | Cara caudomedial. Visto desde atrás, las dos masas se juntan bajo la cola en una **hendidura** central que baja hasta y ≈ 0,95. | — |
| **Gastrocnemio** | cara caudal del fémur distal (−0,33; 0,88) → punta del corvejón (−0,70; 0,65) | vientre en la mitad superior de la pierna, por detrás: 0,22 × 0,07 × 0,06 | Forma la pierna ("gaskin") por detrás. Su tendón y el del flexor digital superficial forman la **cuerda del corvejón**. | — |
| **Extensores de la pierna** (digital largo, tibial craneal, peroneo tercero) | cóndilo femoral lateral y tibia → frente del tarso y caña | 0,30 × 0,06 × 0,03 | Cara anterolateral de la pierna. Un surco vertical **marcado** separa el extensor digital largo del lateral. | El peroneo tercero acopla babilla y corvejón. |

---

## 3. Tendones y zonas óseas visibles bajo la piel

| Zona | Qué se ve (forma y medidas) | Cómo modelarlo |
|---|---|---|
| **Caña delantera** | Hueso al frente (redondeado, ~0,045 de ancho). Por detrás, separados del hueso por un **surco lateral marcado** de 3–5 mm: ligamento suspensor y tendones flexores digitales profundo y superficial, en una banda de ~0,035 de profundidad y ~0,03 de ancho. Sección total ~0,058 de ancho × 0,078 de profundidad; perímetro ~0,20–0,21 (criollo 0,19–0,20 [F25]; pura sangre 0,20 [F28]). Botones de los peronés a 2/3 de la altura. | Dos cápsulas paralelas (hueso, y tendones 1,5–2 cm detrás) unidas con k = 0,4–0,6 cm. Más el surco. |
| **Caña trasera** | Más larga (0,40) y más profunda (perímetro ~0,22 [F28]): ~0,06 × 0,085. El metatarsiano es más redondo. | Igual que la delantera, un poco mayor. |
| **Menudillo** | Más ancho que la caña: 0,075 de ancho × 0,11 de profundidad en foto-1 (medición propia). Atrás, el bulto de los **sesamoideos** y el **espolón** (callo) abajo. Adelante, plano. | Elipsoide con la parte de atrás más prominente. Espolón: pequeña cápsula. |
| **Cuartilla** | Cilindro un poco aplanado, 0,055 × 0,06, inclinado 54° (adelante) o 57° (atrás). | Barrido. |
| **Corona** | Rodete coronario: anillo ~0,5 cm más saliente que la cuartilla, con el pelo cayendo sobre el casco. | Pequeño toro (anillo) en el borde del casco. |
| **Casco delantero** | Lumbre a 50–55° (paralela a la cuartilla) [F29][F30]. Pared en la lumbre de 7,5–8,5 cm; talones de 3,5–4,5 cm (lumbre:talón ≈ 2:1 [F29]). Suelo **redondo**: 0,125 de ancho × 0,13 de largo. Talones un poco más abiertos que la corona. | Malla aparte (como en v1). Sección del suelo circular. |
| **Casco trasero** | Más empinado: lumbre a 53–57°. Suelo **ovalado y en punta** en la lumbre: 0,115 × 0,13. Talones algo más altos y anchos. | Malla aparte, con la lumbre más aguda. |
| **Rodilla** | Plana adelante, con el tendón del extensor carpo-radial marcado. Atrás sobresale el accesorio. Ancho ~0,10, profundidad ~0,11. | Cápsula ancha más el accesorio. |
| **Corvejón** | **Punta del calcáneo** bien marcada atrás y arriba; por delante, la **cuerda del corvejón** (tendón calcáneo común, 0,025–0,03 de espesor) sale de la pierna y se separa de la tibia dejando un **hueco** visible de 2–3 cm. Maléolos a los lados; adelante, un pliegue plano. Ancho lateral ~0,10. | Cápsula de la cuerda (de (−0,50; 0,78) a (−0,70; 0,65)), unida con k pequeño, más una curva de surco en el hueco. |
| **Babilla** | Bulto redondo adelante y afuera (rótula y cóndilo lateral). La babilla es el punto **más ancho** de la grupa vista desde atrás (regla de conformación). | Elipsoide (−0,21; 0,92; 0,23), 0,07 × 0,08 × 0,06. |
| **Punta de la cadera** | Prominencia angulosa a (−0,04; 1,46; 0,245). Por delante, el hueco del ijar; por debajo, la diagonal del tensor. En foto-1 forma una "coma" de luz. | Elipsoide óseo con k ≈ 1 cm; los glúteos lo envuelven por atrás. |
| **Punta de la nalga** | La tuberosidad isquiática se palpa bajo la cola; la silueta la hace el semitendinoso. | — |
| **Cruz** | Espinosas T4–T7; el cartílago de la escápula queda 6–8 cm por debajo, a cada lado. Ancho en la cima: ~0,06. | Cresta de cápsulas sobre las puntas de las espinosas. |
| **Encuentro** | Tubérculo mayor, bulto redondo de ~0,08. Por debajo y adelante, el pectoral descendente. | — |
| **Codo** | Olécranon prominente atrás; el codo queda separado del tórax por el surco de la cinchera. | — |
| **Venas** | En caballos en forma se ven la vena safena (cara medial de la pierna y de la caña trasera), la torácica superficial (de la cinchera hacia el flanco, a lo largo del vientre, y = 0,95–1,0) y la cefálica (cara medial del antebrazo). | Opcional: curvas en relieve de 3–5 mm (curva de surco con signo invertido). |

---

## 4. Secciones transversales

### 4.1 Tronco (cortes perpendiculares a x)

y_sup e y_inf: piel en foto-1 (medidas.md y silueta propia). Semianchos: **estimación** a partir de anchos publicados (pecho 0,41 m [F25]; perímetro torácico 1,74–1,77 m en caballos de 1,42–1,55 m [F25][F28]; ancho de cadera ~0,50) y de la anatomía (tórax angosto arriba y ancho abajo). Hay que validarlos con las vistas frente y atrás del modelo contra foto-2.

| Corte | x | y_sup | y_inf | Semiancho máximo (y donde ocurre) | Semiancho a 80 % de la altura | Forma |
|---|---|---|---|---|---|---|
| Base del cuello y encuentros | 0,90 | 1,40 | 0,98 | 0,21 (1,08) | 0,14 | Huevo con la punta arriba; encuentros a ±0,20 en y = 1,06 |
| Cruz | 0,45 | 1,60 | 0,85 | 0,23 (1,08), sin los codos | 0,09 (y = 1,45) | Quilla muy angosta arriba (0,06 en la cima); paletas planas a los lados |
| Cinchera | 0,55 | 1,59 | 0,855 | 0,22 (1,10) | 0,11 | Surco de la cinchera detrás del codo, 1–1,5 cm |
| Mitad de las costillas | 0,20 | 1,565 | 0,866 | **0,29** (1,15) | 0,18 (1,47) | Barril redondo; el dorso es redondeado, no en quilla; vientre plano con semiancho 0,15 en y = 0,90 |
| Lomo | 0,05 | 1,57 | 0,90 | 0,285 (1,12) | 0,17 (1,50) | Lomo **plano** (transversas lumbares), ligero surco central de 0,5 cm |
| Flanco e ijar | −0,05 | 1,575 | 0,95 | 0,27 (1,15) y 0,255 (1,46, punta de la cadera) | 0,24 | "Caja": ancha arriba (puntas de la cadera), hueco del ijar de −2 cm en y ≈ 1,38 |
| Grupa | −0,30 | 1,59 | (muslos) | 0,26 (1,30, trocánteres) | 0,20 (1,50) | Cima redondeada (en un caballo musculado, "grupa doble" con un surco de 0,5–1 cm sobre la columna) |
| Nalga | −0,60 | 1,48 | 0,95 | 0,18 por lado (1,20) | 0,12 | Dos masas con hendidura central bajo la cola, hasta y ≈ 0,95 |
| Babillas | −0,22 | — | — | **0,27** (0,95) | — | Punto más ancho de la grupa vista desde atrás |

Control: el perímetro de la sección en x = 0,55 (cinchera), con 0,74 de alto y 0,44 de ancho en forma de huevo, da ≈ 1,85 m. Coincide con el perímetro torácico medido de criollos y pura sangre (1,74–1,77 m [F25][F28]), escalado a 1,60 m.

### 4.2 Contornos de frente y desde atrás (semiancho máximo de la silueta según la altura; estimación)

| y | De frente | Desde atrás |
|---|---|---|
| 1,60 | 0,03 (cruz) | 0,07 (cima de la grupa, 1,59) |
| 1,46 | 0,13 | **0,255** (puntas de la cadera) |
| 1,30 | 0,21 | 0,26 |
| 1,15 | 0,27 (barril detrás de las paletas) | 0,27 |
| 1,05 | 0,28 (encuentros ±0,20 y barril) | 0,27 |
| 0,95 | 0,28 (codos ±0,22 y barril) | **0,28** (babillas) |
| 0,80 | 0,21 (antebrazos) | 0,22 (piernas) |
| 0,60 | 0,18 | 0,18 (corvejones) |
| 0,48 | 0,18 (rodillas) | 0,16 |
| 0,30 | 0,16 (cañas) | 0,155 |
| 0,10 | 0,165 (cascos, centros a ±0,125) | 0,155 (cascos, centros a ±0,12) |

De frente, los miembros anteriores son columnas verticales que bajan desde el encuentro: la vertical del encuentro pasa por el centro de la rodilla, la caña y el casco. Desde atrás, la vertical de la punta de la nalga pasa por la punta del corvejón y baja por el medio de la caña [F4].

### 4.3 Cuello (cortes perpendiculares al eje)

Profundidad (de la cresta a la garganta, sin la crin): **medición propia** en foto-1, restando ~0,03 de crin y pelo. Ancho: estimación con el perímetro de la garganta de criollos, 0,74–0,78 m [F25]. Posición a lo largo de la línea media del cuello (de la base a la garganta).

| Punto | Centro del eje (x, y) | Dirección del corte | Profundidad | Ancho total | Forma |
|---|---|---|---|---|---|
| Base (t ≈ 0,15) | (0,80; 1,36) | 50° | ~0,60 (se funde con el pecho y la cruz) | 0,34 | Gota invertida: ancha abajo (serrato, braquiocefálico), angosta en la cresta |
| t ≈ 0,40 | (0,92; 1,50) | 48° | 0,52 | 0,27 | Óvalo; la cresta ocupa el cuarto superior |
| t ≈ 0,65 | (1,04; 1,63) | 45° | 0,43 | 0,21 | Óvalo más angosto; el surco yugular queda en el tercio inferior |
| Garganta (t ≈ 0,90) | (1,13; 1,73) | 42° | 0,37 | 0,18 | La garganta se angosta debajo de la ganacha y deja el hueco entre la mandíbula y el cuello |

Línea superior (cresta, piel) medida: (0,71; 1,69) → (0,86; 1,81) → (0,97; 1,91) → (1,10; 1,98) → nuca (1,33; 2,05). Línea inferior: encuentro (1,04; 1,16) → (1,12; 1,33) → (1,18; 1,49) → (1,24; 1,61) → garganta (1,22; 1,71).

---

## 5. Cabeza

Largo de la nuca al labio superior: **0,60 m** (foto-1, girada; criollos 0,64 m con 1,42 m de alzada [F25]; pura sangre ~0,55–0,60). Inclinación del eje: 58° con la horizontal (medidas.md). En la tabla, "u" es la fracción del largo desde la nuca hacia el hocico.

| Elemento | Medidas | Posición | Notas para el modelado |
|---|---|---|---|
| **Frente** | ancho 0,19–0,20 entre las órbitas; ancho máximo de la cabeza 0,21–0,22 en los arcos cigomáticos (Gesha 0,215 [F31]) | u = 0,15–0,40 | Plana; pasa a la nariz sin escalón (perfil recto; el criollo puede ser apenas convexo, "acarnerado"). |
| **Remolino de la frente** | — | u ≈ 0,30, en la línea media, a la altura de los ojos o algo más arriba | Ver §6. |
| **Órbita** | cavidad orbitaria de 0,063 de largo × 0,053 de alto [F32] | u ≈ 0,33–0,36, en el borde entre la frente y el costado; el eje del ojo mira hacia afuera y algo adelante (~25–30° respecto del costado) | El **reborde supraorbitario** (ceja ósea) sobresale arriba y atrás; por encima queda la **fosa supraorbitaria** (hueco). |
| **Ojo** | globo de 0,051 de alto × 0,043 de ancho × 0,051 de largo axial [F32]; abertura de los párpados de ~0,040–0,045 × 0,025–0,030 | centro a u ≈ 0,35 | Iris marrón oscuro casi negro; **pupila horizontal** ovalada; **gránulos del iris** (cuerpos negros) en el borde superior de la pupila. Pestañas superiores de 2–3 cm en los 2/3 externos; carúncula en el ángulo interno. Casi sin esclerótica visible. |
| **Cresta facial** | relieve de 0,8–1,2 cm | desde debajo del ángulo anterior del ojo (u ≈ 0,38) hacia adelante y algo abajo, paralela al perfil, hasta u ≈ 0,55 | El rasgo más reconocible de la cara del caballo. Borde superior del masetero. |
| **Hueso nasal** | ancho 0,10–0,12 a mitad de la cara | u = 0,40–0,85 | Dorso plano. Los costados se hunden un poco por delante de la cresta facial (en ese hueco están las raíces de los dientes). |
| **Ollares** | forma de coma o C; largo 0,06–0,07, ancho 0,03 (en reposo); dilatados, 0,05 de diámetro | u ≈ 0,90–0,96, a los lados del hocico; el eje mayor sigue la línea de la cara; abren hacia adelante y afuera | Cavidad (resta en el SDF), con el **ala** y el pliegue del falso ollar arriba. Borde interno oscuro y húmedo. |
| **Hocico** | ancho 0,11–0,12 en los ollares, ~0,10 justo por encima; alto 0,12–0,13 | u = 0,85–1,0 | Redondeado, con pelos táctiles. Labio superior móvil con un leve surco central. |
| **Comisura de la boca** | — | u ≈ 0,85, a la altura del borde de la mandíbula | Ahí va el bocado. |
| **Labio inferior y mentón** | mentón: almohadilla de ~0,05 | detrás y debajo del labio inferior | La almohadilla redonda debajo de la boca. |
| **Mandíbula y ganacha** | ancho por fuera de las ganachas 0,19–0,20; profundidad de la cabeza en la ganacha 0,27–0,30 (perpendicular al eje) | ganacha centrada en u ≈ 0,25–0,35, en la mitad inferior | Borde caudal de la rama vertical, desde la articulación temporomandibular (debajo de la base de la oreja, u ≈ 0,12) hasta el ángulo redondeado (radio 0,10–0,12). **Escotadura vascular** en el borde inferior, en u ≈ 0,45. |
| **Canal entre las mandíbulas** | separación entre los bordes inferiores: 0,08–0,10 en la garganta ("4 dedos"), 0,04 en el mentón | cara ventral | Hueco en V entre las dos ramas. |
| **Nuca** | — | cresta nucal en (1,33; 2,05) | Entre las orejas; ahí nace el copete. Detrás, la cresta del cuello. |
| **Orejas** | largo 0,15–0,18 (foto-1 ≈ 0,16, medición propia); ancho en la base 0,075–0,09; espesor del cartílago 3–5 mm | bases a ±0,06–0,07 de la línea media, 2–3 cm detrás de la nuca | Forma de hoja (lanceolada) con la punta curvada hacia adentro y una concha (cuenco) que abre hacia adelante y afuera. En reposo, erguidas, con las puntas a 0,12–0,15 entre sí. Movimiento: giro sobre el eje vertical de hasta ~180° cada una e independiente [F23]; atrás y pegadas (enojo), caídas a los lados (relajado), adelante (atento). Bordes y punta negros en los zainos; adentro, pelos claros (beige) en mechones. |

---

## 6. Pelaje zaino colorado

### 6.1 Colores medidos (mediana de 13×13 px; medición propia)

Son colores **fotografiados** (con luz, sombra y brillo), no albedo. Para el albedo conviene partir del medio tono y dejar que la luz haga el resto.

| Zona | Foto | Hex |
|---|---|---|
| Paleta al sol | foto-1 | #7d3c23 |
| Costillas al sol | foto-1 | #76361b |
| Costillas, medio tono | foto-1 | #6f422f |
| Brillo en las costillas (reflejo) | foto-1 | #9f6c58 |
| Flanco | foto-1 | #733515 |
| Grupa al sol (brillo moteado) | foto-1 | #7c5043 |
| Cima de la grupa | foto-1 | #592118 |
| Dorso y lomo (más oscuros) | foto-1 | #4b1a12 |
| Costado del cuello en sombra | foto-1 | #4b1f15 – #5d3329 |
| Vientre en sombra | foto-1 | #471e0d |
| Codo en sombra | foto-1 | #36150d |
| Antebrazo | foto-1 | #743e1e |
| Pierna | foto-1 | #5f270d |
| Nalga en sombra | foto-1 | #48150b |
| Pecho | foto-1 | #6e3c26 |
| Caña (cabos negros) | foto-1 | #1b1717 |
| Cola | foto-1 | #1d191c |
| Hocico (claro al sol) | foto-1 | #7c6758 |
| Labios | foto-1 | #261b17 |
| Casco delantero | foto-1 | #3a3432 |
| Paleta con brillo fuerte | foto-2 | #9e4a35 |
| Costillas | foto-2 | #96361b |
| Muslo | foto-2 | #902a0d |
| Cuello | foto-2 | #753321 |
| Costillas | foto-4 | #7a493a |
| Grupa | foto-4 | #744436 |
| Ganacha | foto-4 | #6a3f2e |

Albedo sugerido (sRGB): base **#6a3420**, oscuro (dorso, línea superior) **#4a1e12**, claro (barriga y flanco, apenas más claro en los zainos) **#7e4a30**, cabos **#16100e**, hocico **#2c1d17** con un halo apenas más claro y grisáceo alrededor de los ollares (#5a4438).

### 6.2 Distribución y transiciones

- **Cabos negros:** manos negras desde el suelo hasta **y ≈ 0,60–0,65** (12–15 cm sobre la rodilla), más arriba por detrás del antebrazo. Patas negras hasta **y ≈ 0,62–0,70**, apenas por encima de la punta del corvejón, más bajo por delante de la pierna. Transición en un degradé de 6–10 cm, irregular, sin línea recta (medición propia en foto-1).
- **Crin, copete y cola** negros (#16100e – #1f1c20); en foto-2 las puntas están quemadas por el sol (#3a2418).
- **Orejas:** bordes y tercio superior negros por detrás.
- **Hocico** oscuro; el contorno de los ojos, apenas más oscuro.
- **Línea superior** (cuello alto, cruz, dorso, grupa) más oscura que los costados.
- **Señas blancas en las fotos:** foto-1 tiene una **corona blanca en la pata izquierda (PI)**, del rodete hasta y ≈ 0,05. Foto-4 tiene lucero, malacara y media blanca. Hay que decidir si se ponen (el v1 no tiene señas).

### 6.3 Dirección del pelo y remolinos [F33][F34]

El pelo corre en líneas de flujo, como un campo vectorial tangente a la piel:
- **Cabeza:** parte del **remolino de la frente** (línea media, a la altura de los ojos o algo más arriba) en forma radial: hacia el hocico por la cara, hacia la nuca por arriba y hacia los lados.
- **Cuello:** de la cresta hacia abajo y atrás. Sobre el surco yugular, en la cara ventral del cuello, hay una **línea de encuentro** ("pluma") donde chocan las corrientes de los dos lados.
- **Tronco:** hacia atrás y abajo en los costados, hacia atrás en el dorso.
- **Flanco:** **remolino o pluma del flanco** delante de la babilla, donde la corriente del vientre (que sube) choca con la de las costillas (que va hacia atrás). Va desde el pliegue de la babilla hacia la punta de la cadera, y es uno de los rasgos más reconocibles.
- **Pecho:** remolinos entre las manos y una línea de encuentro en el medio del vientre.
- **Nalga:** línea de encuentro en el borde caudal de los muslos, bajo la cola.
- **Miembros:** hacia abajo; hay remolinos en la axila y detrás del codo.

En el código: un campo de dirección del pelo por vértice (tangente) sirve para orientar la textura del pelo (vetas) y el brillo anisótropo simulado.

### 6.4 Brillo

El pelo corto del zaino brilla en las **masas convexas** que miran a la luz: paleta, costillas, grupa y muslo. En foto-1 la grupa y el dorso muestran un brillo **moteado** (efecto de tordillo apenas insinuado), y en foto-2 el brillo es especular y fuerte. Material sugerido (r128): MeshPhysicalMaterial con rugosidad 0,45–0,55 y clearcoat 0,3 con rugosidad de clearcoat 0,25 (como v1); para el aspecto de foto-2, rugosidad 0,38 y clearcoat 0,45. r128 no tiene anisotropía: hay que simularla con las vetas del mapa de pelo orientadas por la dirección del pelo.

### 6.5 Crin, copete y cola

| Elemento | Medidas | Caída |
|---|---|---|
| Crin | Foto-1: **crin tusada** (cortada al ras, 1–2 cm, con algunos pelos en la cruz; recorte f1-cuello.png). En foto-3 la crin entera mide 0,15–0,30 | La convención del proyecto es la crin larga cayendo sobre el lado derecho (+z). **Decisión del usuario:** larga (convención actual) o tusada (como foto-1). |
| Copete | 0,20–0,25, hasta la altura de los ojos | Entre las orejas, sobre la frente. |
| Cola: maslo | 0,45–0,50 de largo (15–21 coccígeas); diámetro de 0,07 en la raíz y 0,04 en la punta, con piel | Nace en (−0,62; 1,42). Parado, sale hacia atrás y un poco arriba y enseguida cae pegada a las nalgas. |
| Cola: cerda | termina a **y ≈ 0,40** del suelo en foto-1 (medición propia), a mitad de la caña trasera; volumen de 0,12–0,16 de ancho bajo el maslo y 0,18–0,22 en el medio | Separada de las nalgas 2–5 cm en el medio. En el galope (foto-3), la raíz se levanta 30–45° sobre la horizontal y la cerda vuela hacia atrás. |

---

## 7. Técnica: cómo modelan los artistas y cómo conviene hacerlo por código acá

### 7.1 Cómo trabajan los artistas 3D y los escultores

- **De lo grande a lo chico:** primero las masas simples (cráneo, caja torácica, pelvis, cuello, paleta, muslo, cada segmento del miembro), luego los músculos y al final los detalles. Si se detalla antes de cerrar las proporciones, el error queda [F35].
- **Marcas óseas como "puntos de paso":** se ubican primero las articulaciones y los puntos óseos subcutáneos (cruz, encuentro, codo, punta de la cadera, nalga, babilla, corvejón), y la superficie se construye entre ellos [F35].
- **Capas:** esqueleto → músculos → pliegues de piel → venas, de a una capa por vez [F36].
- **Topología de animación:** en las mallas para rig, los anillos de aristas siguen los grupos musculares y rodean ojos, ollares, boca y orejas, con anillos extra en cada articulación para deformar bien [F36].
- **Lo que más realismo da** [F36]: ojo con membrana nictitante y córnea con refracción; cascos con su textura y la línea del rodete; pelo con brillo anisótropo orientado por un mapa de flujo; dispersión subsuperficial en orejas y ollares; venas y pliegues finos; y la variación de rugosidad.
- **Trabajos académicos con modelos anatómicos:** Wilhelms y Van Gelder (1997) modelan animales en capas, con huesos, músculos como elipsoides o cilindros deformables y una piel atada por anclas a lo que tiene debajo [F37]. Scheepers et al. (1997) usan músculos elipsoidales que se deforman con la pose del esqueleto [F38]. Vaillant et al. (2013), "Implicit skinning", usan campos de distancia por hueso para corregir el skinning lineal: dan bultos y contacto sin perder detalle [F21].

### 7.2 Alternativas de técnica por código

| Técnica | A favor | En contra | Veredicto |
|---|---|---|---|
| **SDF por capas + Surface Nets** (evolución de v1) | Una sola malla sin costuras por construcción; los surcos salen de la mezcla entre músculos; ya existe la infraestructura (stamp, Surface Nets, horneado). Las formas se definen por anatomía (origen e inserción). | Topología irregular (no hay anillos de aristas en las articulaciones); el detalle fino depende de h. | **Recomendada.** |
| Jaula de subdivisión (Catmull-Clark) generada por código | Topología limpia para deformar; superficies muy suaves. | Armar por código la jaula de un caballo (4 miembros + cuello + cola, con buena topología en las uniones) es muy difícil y frágil; los surcos exigen más anillos. | No. |
| Barridos con secciones (v0) | Barato; buenos anillos. | Las uniones del miembro con el tronco y del cuello con el pecho dejan costuras o intersecciones. | Solo para la cola, la crin y los cascos (mallas aparte). |
| Metaballs | Simples. | Formas "gordas", difíciles de controlar; surcos pobres. | No: los SDF con smin dan más control. |

### 7.3 Recomendación concreta para el generador

#### 7.3.1 Estructura de datos

```js
// js/anatomia.js: datos puros (sin THREE ni rnd), fáciles de ajustar y de testear
export const ARTIC = {           // centros articulares en reposo, lado derecho (z > 0); el izquierdo es el espejo
  AO: [1.285, 1.955, 0], C1C2: [1.235, 1.885, 0], C2C3: [1.165, 1.745, 0], C3C4: [1.09, 1.625, 0],
  C4C5: [1.015, 1.51, 0], C5C6: [0.945, 1.395, 0], C6C7: [0.89, 1.29, 0], C7T1: [0.83, 1.215, 0],
  T6: [0.60, 1.28, 0], T10: [0.43, 1.32, 0], T14: [0.26, 1.35, 0], T18L1: [0.10, 1.375, 0],
  LS: [-0.20, 1.43, 0], S5: [-0.46, 1.42, 0], Cd1: [-0.50, 1.415, 0],
  escapulaDorsal: [0.635, 1.505, 0.10], hombro: [0.965, 1.075, 0.165], codo: [0.735, 0.89, 0.165],
  carpoProx: [0.735, 0.525, 0.13], rodilla: [0.735, 0.48, 0.13], carpoDist: [0.735, 0.445, 0.128],
  menudilloD: [0.735, 0.178, 0.125], cuartillaD: [0.791, 0.101, 0.125], coronaD: [0.826, 0.053, 0.125],
  cadera: [-0.37, 1.25, 0.20], babilla: [-0.265, 0.875, 0.19], corvejon: [-0.615, 0.575, 0.135],
  menudilloT: [-0.615, 0.175, 0.12], cuartillaT: [-0.566, 0.100, 0.12], coronaT: [-0.536, 0.053, 0.12],
};
export const MARCAS = {          // marcas óseas (piel o hueso, ver §1.2)
  cruz: [0.45, 1.60, 0], encuentro: [1.03, 1.06, 0.20], olecranon: [0.65, 0.96, 0.15],
  puntaCadera: [-0.04, 1.46, 0.245], tuberSacro: [-0.22, 1.575, 0.045], trocanter: [-0.34, 1.33, 0.235],
  tercerTrocanter: [-0.31, 1.12, 0.235], puntaNalga: [-0.625, 1.28, 0.10], rotula: [-0.19, 0.94, 0.17],
  puntaCorvejon: [-0.70, 0.65, 0.135], espinaEscapular: [0.80, 1.30, 0.175], manubrio: [0.98, 1.00, 0],
};
// Primitiva: cada una pertenece a uno o dos huesos y se expresa con puntos del esqueleto
// { tipo: 'huso'|'elipsoide'|'capsula'|'barrido', hueso: 'humero', huesoB: 'radio',
//   a: ['codo', [dx, dy, dz]], b: ['olecranon', [...]], radio: [r0, rMax, r1], aplanado: 0.6,
//   capa: 'musculo', grupo: 'triceps', k: 0.012 }
// Surco: { curva: [[x, y, z], ...], prof: 0.006, ancho: 0.012, hueso: 'cuerpo' }
```

- Las posiciones de los músculos se dan **relativas a marcas** (nombre más desplazamiento), así que mover una articulación arrastra todo lo que cuelga de ella.
- Un **huso** (forma de los músculos largos) es una curva de Bézier cuadrática de origen a inserción, con radio que sigue un perfil (fino en los extremos, `rMax` en el vientre) y sección elíptica (aplanada contra el hueso). Es el "roundCone" de v1 generalizado.

#### 7.3.2 Capas y mezcla

1. **Hueso subcutáneo** (k chico, 0,5–1 cm): cruz, espina escapular, encuentro, olécranon, rodilla, caña y menudillo, punta de la cadera, rótula, calcáneo, cráneo (frente, órbitas, cresta facial, nasal, mandíbula).
2. **Volumen interior** (k grande, 6–10 cm): caja torácica con los perfiles medidos de §4, abdomen y cuello profundo. Es la "masa" sobre la que se apoyan los músculos.
3. **Músculos** (§2): cada uno con su `k` contra el resto. Los grupos (por ejemplo los dos glúteos) se mezclan primero entre sí y después contra el resto.
4. **Tendones** de los miembros distales (k 0,4–0,6 cm) y la cuerda del corvejón.
5. **Piel:** desplazamiento final `d − e`, con e = 4–6 mm en el tronco y 2–3 mm en los miembros distales. Más una unión suave global que "tensa" la piel sobre las concavidades: entre las nalgas, en la cinchera y en la garganta.
6. **Surcos y pliegues:** se restan al final (§7.3.4).
7. **Cavidades:** ollares, comisuras y hendidura de los párpados como restas suaves.

La unión suave depende del orden. Para que sea estable, hay que aplicar las capas siempre en ese orden y, dentro de cada capa, ordenar las primitivas por la tabla (no por el azar).

#### 7.3.3 Resolución y rendimiento

- **Medición de v1:** h = 1,15 cm da 61.417 vértices y 122.664 triángulos (cabecera de assets/cuerpo-caballo.bin.gz). El número de vértices escala como 1/h²:

| h | Vértices | Triángulos |
|---|---|---|
| 1,15 cm (v1) | 61 mil | 123 mil |
| 1,0 cm | 81 mil | 162 mil |
| **0,9 cm (recomendado)** | 100 mil | 200 mil |
| 0,8 cm | 127 mil | 254 mil |

  Con h = 0,9 cm el cuerpo usa la mitad del presupuesto de 400 mil y deja lugar para crin, cola, cascos, montura y campo.
- **Banda estrecha en dos niveles** para generar en menos de 3 s: (a) grilla gruesa de 3,6 cm (4 h) que evalúa el campo y marca las celdas con |d| < 4 h; (b) solo en esas celdas, la grilla fina. Los puntos por evaluar bajan de ~6 millones (grilla llena a 0,9 cm) a ~0,6–0,8 millones.
- **Cada muestra evalúa pocas primitivas:** las cajas de las primitivas se indexan en bloques de 8³ celdas, y cada muestra evalúa solo las de su bloque (~10–25 en vez de ~150).
- **Vértices sobre la superficie exacta:** después de Surface Nets, 2 iteraciones de Newton (`p −= d(p)·∇d/|∇d|²`, con el gradiente por diferencias centrales de h/4).
- **Normales** tomadas de ∇d en cada vértice (no de computeVertexNormals). Así el sombreado conserva surcos más finos que la malla.
- **Suavizado:** 1 pasada de Taubin, como mucho (v1 usa 4: borran surcos de menos de ~2 h).
- **Si la cabeza o los miembros distales necesitan más detalle:** refinar solo esa zona con subdivisión "roja-verde" (los triángulos del borde se parten en 2, para no dejar vértices colgados) y proyectar los vértices nuevos.
- **Horneado:** se agregan al formato de js/horneado.js las normales (pueden recalcularse) y los morph targets (Int16 cuantizados, comprimen bien porque casi todo es cero). Con unos 100 mil vértices, el archivo .gz queda en ~1,5–2,5 MB. Hay que vigilar la primera carga (< 2 s).
- **Materiales:** el cuerpo sigue en un solo MeshPhysicalMaterial con skinning y morphTargets. Cuidado: activar morphTargets en el material crea **otra variante de programa** de shader; medir con `__debug.stats().programas`.

#### 7.3.4 Surcos, relieves y pliegues

- **Bordes de músculos:** salen de la unión suave. `k` chico da borde marcado; `k` grande, suave. Hay que dar un `k` por músculo o por par, según la columna "Borde" de §2.
- **Curvas de surco** (no son bordes de un músculo): `d += prof · exp(−(r/ancho)²)`, con r la distancia a una polilínea en 3D. Lista mínima:

| Surco | Curva (lado derecho) | Profundidad / ancho |
|---|---|---|
| Surco yugular | (1,00; 1,15; 0,13) → (1,10; 1,40; 0,11) → (1,20; 1,62; 0,09) → (1,28; 1,74; 0,08) | 6 / 15 mm |
| Cinchera (detrás del codo) | (0,62; 1,05; 0,22) → (0,58; 0,92; 0,20) → (0,55; 0,87; 0,12) | 10 / 25 mm |
| Borde superior del tríceps | (0,95; 1,08; 0,21) → (0,80; 1,20; 0,22) → (0,62; 1,32; 0,21) | 4 / 12 mm |
| Espina escapular | (0,66; 1,48; 0,14) → (0,80; 1,30; 0,18) → (0,93; 1,13; 0,20) | 3 / 15 mm |
| Pliegue del flanco | (−0,02; 1,30; 0,25) → (−0,10; 1,15; 0,26) → (−0,17; 0,98; 0,24) | 8 / 12 mm |
| Fosa del ijar | elipse centrada en (0,02; 1,38; 0,25), radios 0,10 × 0,07 | 15 / 50 mm |
| Bíceps femoral (oblicuo) | (−0,23; 1,36; 0,25) → (−0,35; 1,10; 0,27) → (−0,46; 0,83; 0,22) | 4 / 14 mm |
| Isquiotibiales | (−0,60; 1,25; 0,16) → (−0,58; 1,05; 0,18) → (−0,55; 0,85; 0,16) | 6 / 12 mm |
| Hueco delante de la cuerda del corvejón | (−0,55; 0,75; 0,135) → (−0,65; 0,66; 0,135), por los dos lados (z ± 0,03) | 10 / 12 mm |
| Tendones de la caña | por detrás del hueso, a cada lado, de la rodilla o el corvejón al menudillo | 3 / 5 mm |
| Escotadura vascular de la mandíbula | borde inferior de la mandíbula, u ≈ 0,45 | 5 / 10 mm |
| Fosa supraorbitaria | círculo por encima del ojo | 6 / 20 mm |

- **Venas:** curvas de surco con signo invertido (relieve de 3–4 mm). Opcional.
- **Dientes del serrato:** 4–5 lóbulos con relieve de 3 mm.

#### 7.3.5 Esqueleto de animación y pesos

**Huesos (≈ 38):**
- raíz;
- tronco: pelvis + lomo, tórax caudal, tórax craneal (3 huesos, para la `curva` lateral y el cabeceo del tronco);
- cuello: 4 (C1–C2, C3–C4, C5–C6, C7–T1);
- cabeza, mandíbula y 2 orejas (las orejas son mallas aparte);
- cola: 6;
- por cada mano: escápula, húmero, radio, caña, cuartilla y casco (6);
- por cada pata: fémur, tibia, caña, cuartilla y casco (5).

**Pesos por pertenencia:**
1. En cada vértice, cada primitiva i recibe `w_i = exp(−max(0, d_i(p)) / σ)`, con σ = 1,5 cm.
2. Ese peso se reparte entre su hueso y su `huesoB` según el parámetro t a lo largo del huso. Por ejemplo, el tríceps va de escápula y húmero a radio, y sobre el codo pasa al radio.
3. Se suman los pesos por hueso, se suavizan sobre la malla con 5–10 pasadas de Laplace, y se conservan los 4 mayores, normalizados.

**Escápula:** hueso propio, hijo del tórax craneal. Gira alrededor de su tercio dorsal (0,69; 1,42) y se desliza (hasta 3–4 cm a lo largo de su eje, para la "cincha" de v1).

**Correctivos de pose (PSD [F39]):**
- Hasta 8 morph targets (límite de r128 con morphTargets sin morphNormals):
  - 4: flexión fuerte de cada miembro (codo y carpo, o babilla y corvejón);
  - 2: cuello arriba y abajo;
  - 2: cuello a izquierda y derecha.
- Cada uno se calcula al hornear:
  1. Posar el esqueleto en la flexión.
  2. Reevaluar el campo con las primitivas transformadas por sus huesos.
  3. Mover cada vértice ya deformado por el skinning a la isosuperficie (Newton).
  4. Pasar el desplazamiento al espacio de reposo (inversa de la matriz de skinning del vértice).
- En tiempo real, el peso de cada target sale del ángulo de la articulación (por ejemplo, w = smoothstep entre el reposo y la flexión máxima).

#### 7.3.6 Una sola malla y sin cortes

- **Todo lo que forma la piel con pelo** (tronco, cuello, cabeza, miembros hasta el rodete y raíz de la cola) es parte del mismo campo. Las mallas aparte son solo: cascos, ojos (globo), orejas (cartílago fino, imposible a h = 9 mm), interior de los ollares (opcional), crin, copete y cerda de la cola.
- Las orejas aparte se insertan en un **montículo de la base modelado en el SDF**, para que no quede un borde suelto.
- El color, la dirección del pelo y los pesos se calculan por vértice sobre esa malla única. Las transiciones (cabos negros, hocico) son funciones suaves de la posición en reposo o de la distancia a marcas.

#### 7.3.7 Orden de trabajo sugerido para el agente CABALLO

1. Escribir js/anatomia.js con las tablas ARTIC y MARCAS y un modo de depuración que dibuje el esqueleto (líneas y esferas) superpuesto a foto-1 con `shot.mjs --silueta` y `superponer.mjs`.
2. Volumen interior + huesos subcutáneos → mallar → superposición con foto-1.
3. Músculos por región (cuello, paleta y brazo, antebrazo, tronco, grupa, pierna, distal), con captura después de cada región en perfil-izq, tres-cuartos y atrás.
4. Surcos, piel y cabeza en detalle.
5. Esqueleto de animación y pesos; IK 3D; correctivos; horneado.
6. Color, dirección del pelo, brillo.

---

## Fuentes

- [F1] Evaluation of Limb Conformation in Jumping Thoroughbred Horses, Asian Journal of Animal Sciences (2015). https://scialert.net/fulltext/?doi=ajas.2015.208.216
- [F2] Common Forelimb Conformation Faults in Horses (Mad Barn); Sport Horse Conformation: It's All in the Shoulders (Jumper Nation). https://madbarn.com/forelimb-conformation-faults-in-horses/ · https://jumpernation.com/sport-horse-conformation-shoulders/
- [F3] Evaluating Forelimb and Hindlimb Joint Conformation of Morna Racehorses, Vet. Sci. (2025). https://pmc.ncbi.nlm.nih.gov/articles/PMC11768722/
- [F4] Horse Conformation Analysis, Univ. of Arkansas FSA3029; Evaluating Horse Conformation, UGA B1400. https://www.uaex.uada.edu/publications/pdf/FSA3029_2020.pdf · https://fieldreport.caes.uga.edu/publications/B1400/evaluating-horse-conformation/
- [F6] Genome-Wide Association Studies Based on Equine Joint Angle Measurements (Franches-Montagnes y Lipizzan, n = 495). https://pmc.ncbi.nlm.nih.gov/articles/PMC6562990/
- [F7] Anatomical variations of the equine femur and tibia using statistical shape modeling, PLOS ONE (2023). https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0287381
- [F8] Anatomy of the Thoracolumbar Vertebral Region, Vet Clin North Am Equine (fórmula C7 T18 L6 S5 Cd15–21; cruz en T4–T6; anticlinal T16). https://www.sciencedirect.com/science/article/pii/S074907391730161X · https://vetstudyguides.com/horse-vertebral-column/
- [F9] Functional Anatomy and Clinical Biomechanics of the Equine Cervical Spine. https://www.researchgate.net/publication/316053036_Functional_Anatomy_and_Clinical_Biomechanics_of_the_Equine_Cervical_Spine
- [F10] Townsend et al., Kinematics of the equine thoracolumbar spine, EVJ (1983). https://beva.onlinelibrary.wiley.com/doi/10.1111/j.2042-3306.1983.tb01732.x
- [F11] Chateau et al., 3D kinematics of the equine metacarpophalangeal joint at walk and trot (2007). https://pubmed.ncbi.nlm.nih.gov/17546207/
- [F12] Limbs of the horse (Wikipedia). https://en.wikipedia.org/wiki/Limbs_of_the_horse
- [F12b] 3D kinematics of the interphalangeal joints in the forelimb of walking and trotting horses. https://www.researchgate.net/publication/6443307_3D_kinematics_of_the_interphalangeal_joints_in_the_forelimb_of_walking_and_trotting_horses
- [F13] Liljebrink & Bergh, Goniometry: is it a reliable tool to monitor passive joint range of motion in horses?, EVJ (2010). https://beva.onlinelibrary.wiley.com/doi/10.1111/j.2042-3306.2010.00254.x
- [F14] Faber et al., Basic three-dimensional kinematics of the vertebral column of horses trotting on a treadmill (2001). https://pubmed.ncbi.nlm.nih.gov/11341399/
- [F15] Hodson et al., The forelimb in walking horses: 1. Kinematics and ground reaction forces, EVJ (2000). https://beva.onlinelibrary.wiley.com/doi/abs/10.2746/042516400777032237
- [F16] Morales et al., Angular kinematic patterns of limbs in elite and riding horses at trot (1998). https://pubmed.ncbi.nlm.nih.gov/9844972/
- [F16b] Three-dimensional kinematics of the tarsal joint at the trot. https://researchgate.net/publication/8661466_Three-dimensional_kinematics_of_the_tarsal_joint_at_the_trot
- [F17] Stay Apparatus – Horse Anatomy (WikiVet). https://en.wikivet.net/Stay_Apparatus_-_Horse_Anatomy
- [F18] The Reciprocal System of the hindlimb (J. Limpkin). https://www.jessicalimpkin.co.uk/jessica-limpkin-equine-massage-blog/the-reciprocal-system-of-the-hindlimb-what-is-it-and-what-does-it-mean
- [F19] Thoracic Limb Extrinsic Muscles – Horse Anatomy (WikiVet). https://en.wikivet.net/Thoracic_Limb_Extrinsic_Muscles_-_Horse_Anatomy
- [F20] Forelimb – Anatomy & Physiology (WikiVet). https://en.wikivet.net/Forelimb_-_Anatomy_&_Physiology
- [F21] Vaillant et al., Implicit Skinning: Real-Time Skin Deformation with Contact Modeling, ACM TOG 32(4) (SIGGRAPH 2013). https://www.irit.fr/~Loic.Barthe/implicitskinning.php · http://rodolphe-vaillant.fr/entry/31/implicit-skinning-real-time-skin-deformation-with-contact-modeli
- [F22] Rump Muscles – Horse Anatomy (WikiVet). https://en.wikivet.net/Rump_Muscles_-_Horse_Anatomy
- [F23] The Horse's Ears and Hearing (Iowa State Extension); The horse's ears (Cavalluna). https://www.extension.iastate.edu/equine/horses-ears-and-hearing · https://www.cavalluna.com/en/backstage-more/knowledge-about-horses/horse-anatomy/the-horse-ears
- [F24] Muscles of Pelvic Limb of Horse (Vetscraft); IMAIOS vet-Anatomy (glúteo superficial, tensor de la fascia lata). https://www.vetscraft.com/muscles-of-pelvic-limb-of-horse/ · https://www.imaios.com/en/vet-anatomy/anatomical-structures/gluteus-superficialis-muscle-11078084768
- [F25] Biometric evaluation of Criollo horses participating in the Freio de Ouro competition, Rev. Bras. Zootec. (n = 634). https://www.scielo.br/j/rbz/a/hbr7zYCshKqRFxrp4BQ6JbR/?lang=en&format=html
- [F26] What's in the muscle? Brachiocephalic / Semitendinosus / Tensor fasciae latae (T. Hendriks). https://www.thirzahendriks.com/post/what-s-in-the-muscle-brachiocephalic · https://www.thirzahendriks.com/post/what-s-in-the-muscle-semitendinosus
- [F27] H. M. Clayton, Mechanics of Equine Locomotion (el miembro anterior rota alrededor del tercio superior de la escápula; el posterior, alrededor de la cadera al paso y al trote y de la lumbosacra en el galope). https://www.quia.com/files/quia/users/medicinehawk/3307-Biomechanics/MECHANICS-OF-EQUINE-LOCOMOTION.pdf
- [F28] Morphometrical Measurements of Thoroughbred Horses. https://www.researchgate.net/publication/317578664_Morphometrical_Measurements_of_Thoroughbred_Horses_Equus_caballus
- [F29] Differentiation between fore and hind hoof dimensions in the horse (manos redondas y más grandes; patas ovaladas y en punta; lumbre:talón ≈ 2:1). https://www.researchgate.net/publication/266098865_Differentiation_between_fore_and_hind_hoof_dimensions_in_the_horse_Equus_caballus
- [F30] Hoof – Anatomy & Physiology (WikiVet); Value of Quality Foot Radiographs (Equine Podiatry: pared dorsal de 70–80 mm a ~55°, talones a ~52°). https://en.wikivet.net/Hoof_-_Anatomy_&_Physiology · http://www.equipodiatry.com/news/ValueofQualityFootRadiographs.html
- [F31] Phenotypic characterization of Gesha horses (largo y ancho de cabeza). https://www.genresj.org/index.php/grj/article/download/genresj.KPIL8781/115?inline=1
- [F32] Computed Tomographic Assessment of Normal Ocular Dimensions and Densities in Cadaveric Horses (n = 21). https://pmc.ncbi.nlm.nih.gov/articles/PMC12607728/
- [F33] Hair whorl (horse) (Wikipedia). https://en.wikipedia.org/wiki/Hair_whorl_(horse)
- [F34] Phenotypic and Genetic Study of the Presence of Hair Whorls in Pura Raza Español Horses. https://pmc.ncbi.nlm.nih.gov/articles/PMC10525084/
- [F35] Sandy Scott, In the studio: horse anatomy and bony landmarks. https://sandyscottblog.blogspot.com/2015/03/619-in-studio-horse-anatomy-and-bony.html
- [F36] Making a Realistic Horse in ZBrush, Substance 3D Painter & Marmoset Toolbag (80.lv, A. Shetty). https://80.lv/articles/making-a-realistic-horse-in-zbrush-substance-3d-painter-marmoset-toolbag
- [F37] Wilhelms & Van Gelder, Anatomically Based Modeling, SIGGRAPH 1997 (citado en Aubel & Thalmann, Efficient Muscle Shape Deformation). https://infoscience.epfl.ch/server/api/core/bitstreams/b1c81751-3b32-4e7d-b284-48fe5d702937/content
- [F38] Scheepers et al., Anatomy-based modeling of the human musculature, SIGGRAPH 1997 (mismo resumen que F37). https://www.researchgate.net/publication/2477788_Modeling_and_Deformation_of_the_Human_Body_Using_an_Anatomically-Based_Approach
- [F39] Lewis, Cordner & Fong, Pose Space Deformation, SIGGRAPH 2000 (correctivos de pose; referencia clásica, no consultada en línea para este documento).

**Datos no verificados en la fuente primaria:** largos óseos en vértebras individuales (cervicales, torácicas, lumbares), semianchos del tronco, contornos de frente y desde atrás, posición exacta del acetábulo y recorrido de la escápula. Están marcados como "estimación" en el texto y hay que validarlos con las capturas contra foto-1 y foto-2.
