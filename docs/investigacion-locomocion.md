# Investigación: locomoción del caballo (especificación para la v2)

Autor: agente de investigación de LOCOMOCIÓN. Lo usa el agente que programa `js/locomocion.js` y `js/marchas.js`.
Marco del proyecto (no cambia): metros, caballo en el origen mirando a +x, y arriba, +z = DERECHA; alzada 1,60 m.
El mundo se mueve; el estado en el suelo es `{ x, z, rumbo, velocidad, giro }`, `rumbo` crece al doblar a la IZQUIERDA
(ver docs/rediseno-v2.md). Patas: MD (mano derecha), MI, PD (pata derecha), PI, en ese orden en el código.

Convenciones de este documento:
- **(medido)**: el número sale de una fuente de la lista final. **(derivado)**: calculado a partir de datos medidos
  (se dice cómo). **(est.)**: no está en las fuentes que pude leer; es un valor razonable propuesto por mí.
- Fase del ciclo φ ∈ [0, 1): un tranco completo de una pata. Las tablas "por pata" dan la fase de **pisada** (`t`)
  y el **duty factor** (`d`, fracción del ciclo en apoyo); el despegue es `t + d` (mod 1).
- Conversión al formato de hoy (`off` en js/marchas.js, "apoya cuando frac(fase + off) < duty"): `off = frac(1 − t)`.
- "Largo de tranco" (SL) = distancia que avanza el cuerpo en un ciclo; v = SL · f.

---

## 0. Resumen de decisiones

1. **La velocidad manda, no la frecuencia.** El estado tiene `v` (m/s) y `ω` (rad/s). De `v` salen f(v), SL = v/f y
   el duty `d = L_apoyo / SL`, con **L_apoyo ≈ 1,1–1,4 m** (distancia que el cuerpo avanza mientras un casco está
   apoyado; casi constante en todas las marchas, ver 1.2). Hoy se hace al revés (velocidad del suelo a partir de stride
   y freq); con el plan de pisadas en el suelo el casco no puede patinar por construcción.
2. **Cada casco apoyado queda fijo en coordenadas del SUELO.** Al despegar, el casco viaja (trayectoria en el
   suelo) a una pisada predicha con la regla "el punto neutro de la pata debe quedar sobre el casco a mitad del
   apoyo" (regla de Raibert), usando la pose futura del caballo sobre el arco de giro.
3. **Un reloj de fase global continuo Φ + desfase por pata.** Los desfases cambian SOLO mientras la pata está en el
   aire (vuelo), con velocidad limitada: así las transiciones de marcha, los cambios de mano y el giro en el lugar no
   producen saltos ni temblores.
4. **Galope corto y galope tendido son una sola familia** parametrizada por la velocidad: 3 tiempos a ≤ 5 m/s, 4
   tiempos al aumentar (el par diagonal se disocia). La mano de galope es la del lado del giro (mano izquierda si
   `giro > 0`); el cambio de mano se hace en la suspensión.
5. **El cuerpo se mueve a partir de las pisadas**: altura de la cruz a partir de las manos apoyadas, altura de la
   grupa a partir de las patas apoyadas (núcleos de Fourier por pata, ver 7.8), cabeceo = diferencia entre las dos.
   Con eso el paso y el trote tienen 2 oscilaciones por tranco y el galope 1, sin elegir nada a mano.
6. **IK por pata en 3D**: abducción (rotación alrededor del eje x en el tope del miembro) + cadena plana de 3
   segmentos con la redundancia resuelta por la anatomía: en la mano el carpo está trabado (recto) en el apoyo y su
   flexión sale de una tabla en el vuelo; en la pata el aparato recíproco ata corvejón y babilla (se mueven juntos).
7. **Inclinación en curva** = atan(v·ω/g) (medido: los caballos se inclinan casi lo que dice la física, 3° menos);
   aceleración lateral máxima ≈ 5 m/s² (est.) ⇒ ω_max(v) = min(ω_cap, 5/v) y frenar si el giro pedido no entra.
8. **Giro en el lugar = media pirueta al paso**: secuencia lateral del paso, la pata de adentro (PI al doblar a la
   izquierda) marca el paso casi en el mismo lugar, las manos y la otra pata caminan alrededor, la mano de afuera
   cruza por delante. ≈ 45° por tranco, 180° en ~4 trancos (FEI: 3–4 trancos para la media pirueta).

---

## 1. Parámetros por marcha

### 1.1 Tabla general (caballo de silla de 1,60 m)

| Marcha | v típica (m/s) | Rango (m/s) | f (Hz) | SL (m) | duty mano | duty pata | Suspensión | Tiempos |
|---|---|---|---|---|---|---|---|---|
| Quieto | 0 | 0 | — | — | 1 | 1 | — | — |
| Paso | 1,6 | 1,1 – 1,9 | 0,80 – 0,95 (0,88 a 1,6) | 1,5 – 1,9 (1,77) | 0,70 → 0,58 (0,64) | +0,02 que la mano | no | 4, secuencia lateral |
| Trote | 3,5 | 2,4 – 5,0 | 1,19 – 1,39 (1,30) | 2,0 – 3,6 (2,69) | 0,50 → 0,34 (0,46) | 0,47 → 0,32 (0,43) | 2 × 2–5 % | 2, diagonales |
| Galope corto | 5,0 | 3,0 – 7,0 | 1,60 – 1,84 (1,72) | 1,9 – 3,8 (2,90) | 0,48 → 0,33 (0,42) | 0,54 → 0,38 (0,48) | 1 % → 20 % | 3 |
| Galope tendido | 11 | 8 – 14 (17 de carrera) | 1,92 – 2,24 (2,08) | 4,1 – 6,3 (5,3) | 0,30 → 0,21 (0,25) | 0,33 → 0,24 (0,28) | 25 – 30 % | 4, transverso |

Fuentes y cómo salen los números:
- Paso: 1,2–1,8 m/s, SL 1,5–1,9 m, f 0,8–1,1 Hz (IFCE, medido); 0,82–1,91 m/s (Khumsap 2002, medido); duty 0,70 → 0,60
  de lento a rápido (medido, ver búsqueda IFCE/Robilliard); en círculo de 10 m: 1,5 m/s, SL 1,7–1,8 m, duty 65 %
  (Hobbs 2011, medido). Pata con apoyo ~2,7 % más largo que la mano (Robilliard 2007, medido).
- Trote: reunido 3,20 m/s / 2,50 m; de trabajo 3,61 / 2,73; medio 4,47 / 3,26; largo 4,93 / 3,55 (Clayton 1994,
  medido). Duty mano 0,42–0,49, pata 0,39–0,46 (Robilliard 2007; Animals 2022; Hobbs 2011, medido). Suspensión hasta
  9 % del ciclo (IFCE), 2–4 % en caballos de silla (Animals 2022, medido).
- Galope corto: 4,4 m/s, ciclo 0,59 s (1,69 Hz), apoyo mano 0,27–0,29 s (duty 0,47), pata 0,32 s (0,54) (PMC10252091,
  medido). SL 1,9–4,6 m y f 1,6–2,0 Hz entre 2,9 y 9 m/s (IFCE, medido). Suspensión 1 % (reunido) a 15 % (largo)
  (Clayton, USDF, medido). En el galope corto la velocidad cambia sobre todo con el largo del tranco; la duración del
  tranco casi no cambia (Clayton 1994 galopes, medido).
- Galope tendido: f = 1,7052 + 0,0305·v + 0,0004·v² (Witte 2006, medido, 9–17 m/s); 2,02 Hz a 9 m/s, 2,41 a 17 m/s;
  duty mano 0,27 → 0,18 y pata 0,29 → 0,22 de 9 a 17 m/s; vuelo 135 → 119 ms (27–29 % del ciclo) (Witte 2006, medido).
  16,5 m/s con SL 6,7 m y 2,47 Hz (Pfau 2024, medido). Galope 9–20 m/s, SL 4,5–7,2 m, 2,27–2,92 Hz (IFCE, medido).
- Velocidades más económicas: paso ~1,7 m/s, trote ~3,3 m/s, galope ~5,6 m/s (IFCE, medido). Uso esas como "típicas"
  (redondeadas) salvo el galope tendido, que es 11 m/s (≈ 40 km/h, lo que hoy dice la interfaz).

### 1.2 Relaciones velocidad ↔ largo y frecuencia (para interpolar)

Fórmulas para el código (v en m/s; todas continuas dentro de cada marcha):

```js
// PASO (1,1–1,9 m/s): ajuste lineal a los extremos de IFCE (derivado)
SL = 0.70 + 0.67 * v;            // 1,2 → 1,50 m · 1,6 → 1,77 m · 1,8 → 1,91 m
f  = v / SL;                     // 0,80 → 0,90 → 0,94 Hz
dMano = clamp(1.12 / SL, 0.58, 0.75);  dPata = dMano + 0.02;
// TROTE (2,4–5,0 m/s): ajuste a Clayton 1994 (derivado; error < 3 cm en los 4 puntos)
SL = 0.61 * v + 0.55;            // 3,2 → 2,50 · 3,61 → 2,75 · 4,47 → 3,28 · 4,93 → 3,56
f  = v / SL;                     // 1,28 → 1,39 Hz
dMano = clamp(1.24 / SL, 0.33, 0.50);  dPata = clamp(1.16 / SL, 0.31, 0.48);
// GALOPE (3,0–14 m/s, una sola familia): f ajustada a (3; 1,60) IFCE, (4,4; 1,69) PMC10252091,
// (9; 1,96–2,02) Witte/IFCE, (17; 2,41) Witte (derivado)
f  = 1.40 + 0.067 * v - 0.0005 * v * v;   // 3 → 1,60 · 5 → 1,72 · 11 → 2,08 · 17 → 2,39
SL = v / f;                               // 3 → 1,88 · 5 → 2,90 · 11 → 5,29 · 17 → 7,1
dMano = clamp(1.25 / SL, 0.18, 0.48);  dPata = clamp(1.40 / SL, 0.21, 0.54);
```

**Largo de apoyo L_apoyo = d · SL** (derivado de los datos medidos): paso mano 1,12 m; trote mano 1,24 m, pata 1,16 m;
galope mano 1,23 m (4,4 m/s), 1,24 m (9 m/s), 1,28 m (17 m/s); galope pata 1,33–1,56 m. Es decir, el casco apoyado
recorre (respecto del cuerpo) ~1,1–1,4 m ≈ 0,7–0,9 × alzada en TODAS las marchas, y la marcha más rápida tiene duty
menor porque el tranco es más largo. Con el miembro anterior girando alrededor de la parte alta de la escápula
(~1,35 m de alto en el modelo de hoy) eso da ±25° de protracción/retracción, coherente con la sección 2.

Relación con el número de Froude (Fr = v²/(g·L), L = largo de la pata ≈ 1,4 m): transición paso → trote a Fr ≈ 0,35,
independiente del tamaño (Griffin 2004, medido: 1,6–2,3 m/s en caballos de 90 a 720 kg). Para este caballo:
v ≈ √(0,35·9,81·1,4) ≈ 2,2 m/s (derivado).

### 1.3 Fases de apoyo por pata (diagramas de Hildebrand)

Fase 0 = pisada de la pata de referencia (PI en paso y trote; posterior "de atrás" en el galope). `t` = pisada,
`d` = duty, `off = frac(1 − t)`. **Galope: tabla para MANO DERECHA** (mano adelantada MD, pata adelantada PD, pata
"de atrás" o *trailing* PI). Para mano izquierda se espeja: MD ↔ MI y PD ↔ PI.

**Paso** (v = 1,6 m/s), secuencia lateral PI → MI → PD → MD, pisadas separadas ~25 % (medido); la mano pisa
21,6 % del ciclo después de la pata del mismo lado (*lateral advanced placement*, medido); 53 % del tiempo con 3
apoyos y 27 % con 2 (medido).

| Pata | t (pisa) | d | despega | off |
|---|---|---|---|---|
| PI | 0,00 | 0,66 | 0,66 | 0,00 |
| MI | 0,24 | 0,64 | 0,88 | 0,76 |
| PD | 0,50 | 0,66 | 0,16 | 0,50 |
| MD | 0,74 | 0,64 | 0,38 | 0,26 |

Variación con la velocidad: la separación lateral pata → mano va de 0,21 (paso lento) a 0,25 (paso largo) (est.,
consistente con 21,6 % medido a velocidad media).

**Trote** (v = 3,5 m/s), diagonales PI+MD y PD+MI. La pata del diagonal pisa 20–30 ms antes que la mano
(disociación diagonal positiva; IFCE, medido) ≈ 0,02–0,04 del ciclo.

| Pata | t | d | despega | off |
|---|---|---|---|---|
| PI | 0,00 | 0,43 | 0,43 | 0,00 |
| MD | 0,02 | 0,46 | 0,48 | 0,98 |
| PD | 0,50 | 0,43 | 0,93 | 0,50 |
| MI | 0,52 | 0,46 | 0,98 | 0,48 |

Suspensiones: 0,48 → 0,50 y 0,98 → 1,00 (2 × 2 %; con trote largo, d baja y la suspensión crece a 2 × 5–8 %).

**Galope, mano derecha**, en función de la velocidad (interpolar linealmente entre columnas). Orden: PI (pata de
atrás) → PD (pata adelantada) → MI (mano de atrás) → MD (mano adelantada) → suspensión reunida. Puntos de anclaje:
0 % – 25 % – 50 % y suspensión 1–15 % en el galope corto (Clayton, medido); proporciones de Hildebrand para el galope
rápido del caballo: adelanto entre patas = 50 % del apoyo de la pata, adelanto entre manos = 70 % del apoyo de la
mano (Hildebrand 1977, medido); vuelo 27–29 % y duty de Witte 2006 (medido). Columnas intermedias: derivado.

| v (m/s) | 3,5 | 5 | 7 | 10 | 14 |
|---|---|---|---|---|---|
| t PI (pata de atrás) | 0 | 0 | 0 | 0 | 0 |
| t PD (pata adelantada) | 0,23 | 0,21 | 0,18 | 0,15 | 0,16 |
| t MI (mano de atrás) | 0,27 | 0,28 | 0,29 | 0,30 | 0,32 |
| t MD (mano adelantada) | 0,50 | 0,48 | 0,47 | 0,46 | 0,50 |
| d manos | 0,48 | 0,42 | 0,33 | 0,26 | 0,21 |
| d patas | 0,54 | 0,48 | 0,38 | 0,29 | 0,24 |
| suspensión (1 − t MD − d mano) | 0,02 | 0,10 | 0,20 | 0,28 | 0,29 |
| off MD / MI / PD / PI | 0,50 / 0,73 / 0,77 / 0 | 0,52 / 0,72 / 0,79 / 0 | 0,53 / 0,71 / 0,82 / 0 | 0,54 / 0,70 / 0,85 / 0 | 0,50 / 0,68 / 0,84 / 0 |

Notas:
- A 3,5–5 m/s la pata adelantada y la mano de atrás pisan casi juntas (separadas 0,04–0,07 ≈ 30 ms): se oye en 3
  tiempos. Desde ~7 m/s se separan (≥ 0,10): 4 tiempos (IFCE: "3 tiempos a ~3 m/s, 4 tiempos a alta velocidad").
- La única suspensión del galope del caballo es la **reunida** (con las patas recogidas bajo el cuerpo), después del
  despegue de la mano adelantada y antes de la pisada de la pata de atrás (Hildebrand 1977; Bertram 2009). No hay
  suspensión "extendida" (eso es del guepardo). Es exactamente lo de referencias/fotos/foto-3-galope.png: manos
  plegadas hacia atrás bajo el pecho con los carpos muy flexionados (suela mirando hacia atrás), patas adelantadas bajo
  el vientre con los corvejones flexionados, cola alzada que flamea hacia atrás, cuello estirado hacia adelante.
- El galope "4 tiempos" de los caballos de doma (galope lateral, mano antes que la pata del diagonal) es un defecto;
  no usarlo.

Diagramas (cada carácter = 5 % del ciclo, `#` = apoyado), a las velocidades típicas:

```
PASO 1,6 m/s            TROTE 3,5 m/s           GALOPE CORTO 5 m/s, mano der.  GALOPE 11 m/s, mano der.
MD ########.......##### MD ##########.......... MD ..........########..        MD .........#####......
MI .....#############.. MI ..........########## MI ......########......        MI ......#####.........
PD ####......########## PD ..........#########. PD ....##########......        PD ...######...........
PI ##############...... PI #########........... PI ##########..........        PI ######..............
```

### 1.4 Mano de galope y giro

- La mano adelantada es la de **adentro** de la curva: al doblar a la derecha, mano derecha; a la izquierda, mano
  izquierda (IFCE: "en el campo los caballos prefieren galopar a la mano derecha al doblar a la derecha"; caballos de
  carrera: "usualmente galopan con la mano adelantada del lado de adentro", PLOS One 2020, medido). Si entran a una
  curva con la mano contraria, suelen cambiar (IFCE).
- Con la convención del proyecto: `giro > 0` (dobla a la izquierda) ⇒ mano izquierda (MI y PI adelantadas, PD es la
  pata de atrás); `giro < 0` ⇒ mano derecha. En recta se conserva la mano actual.
- Histéresis recomendada (est.): cambiar de mano solo si |giro| > 0,15 rad/s sostenido 0,4 s con la mano contraria.
- Cambio de mano en el aire (*flying change*): ocurre en la suspensión; el primer pie que apoya después del cambio
  es la nueva pata de atrás (la que era la pata adelantada) (USDF, medido/descriptivo). El tranco del cambio es algo
  más corto y lento (est. −10 % de SL, de lo publicado sobre doma).
- En la curva la mano de adentro tiene apoyo más largo que la de afuera (con la mano correcta) y ambas tienen apoyos
  más cortos que en la recta (PLOS One 2020, medido).

---

## 2. Ángulos de las articulaciones

### 2.1 Convenciones y valores de pie

Los ángulos se dan como **Δ respecto de la pose parado en cuadro** (la pose de reposo del modelo), en grados,
**+ = extensión** (la articulación se abre) y **− = flexión**. Así sirven para cualquier esqueleto que arme el agente
CABALLO. Valores absolutos típicos de pie (para orientarse): hombro (ángulo craneal escápula–húmero) ~100–110°; codo
(caudal) ~145°; carpo 180° (recto); menudillo: cuartilla a 52° del suelo con la caña vertical (foto-1); cadera
(craneal pelvis–fémur) ~100°; babilla (caudal) ~145°; corvejón (dorsal) ~150–155°.

**Extensión del menudillo E** = ángulo entre la prolongación de la caña y la cuartilla (0 = alineadas). Parado,
E ≈ 38° (cuartilla a 52° del suelo). En la tabla va como ΔE (+ = el menudillo baja, la cuartilla se acuesta).

Qué está medido y qué no:
- Medido: ROM al trote de menudillo anterior 80,6 ± 7,1°, carpo 90,8 ± 7,1°, menudillo posterior 85,0 ± 7,7°;
  corvejón 51–55° a 4 m/s (Lanovaz 2002); máxima flexión en el vuelo del paso a 76 % del ciclo (carpo), 81 %
  (menudillo) y 84 % (codo) (Hodson 2000); al trote el hombro, la babilla y el corvejón están más flexionados en el
  apoyo y el carpo y el menudillo más extendidos que al paso (Back 1995); extensión máxima del menudillo en mitad del
  apoyo, cuando la caña está vertical (Clayton); ángulo palmar del menudillo a mitad del apoyo: 218° al paso, 226° al
  trote, 240° al galope (dato citado; no pude verificar la fuente primaria).
- **Las curvas cada 10 % son reconstrucciones (est.)**: forma tomada de las curvas publicadas (Back 1995, Hodson
  2000/2001, Clayton), ajustada para respetar los extremos, ROM y tiempos medidos de arriba. Error esperable ±5–10°.
  El IK (sección 7.7) decide la mayoría de los ángulos a partir de la posición del casco; estas tablas se usan para
  (a) la flexión del carpo en el vuelo, (b) la extensión del menudillo (cuartilla), (c) límites, y (d) pruebas.
- Para otras velocidades: **deformar el tiempo** con el duty: la parte de apoyo de la tabla (0 → d) se estira a
  (0 → d_nuevo) y la de vuelo (d → 1) a (d_nuevo → 1); amplitudes de vuelo ×(SL/SL_tabla)^0,5 (est.).
- Galope corto (3 tiempos): usar la tabla de galope deformada a su duty, con amplitudes de vuelo × 0,8 (est.).

### 2.2 Miembro anterior (mano). Fase 0 = pisada de ESA mano

"Miembro" = ángulo de la línea (parte alta de la escápula → casco) respecto de la vertical; + = protracción (casco
adelante).

**Paso** (apoyo 0–64 %):

| % ciclo | 0 | 10 | 20 | 30 | 40 | 50 | 60 | 70 | 80 | 90 |
|---|---|---|---|---|---|---|---|---|---|---|
| Miembro (°) | +22 | +15 | +8 | 0 | −8 | −15 | −22 | −12 | +8 | +24 |
| Hombro Δ | +8 | +6 | +4 | +2 | 0 | −2 | −5 | −8 | −2 | +8 |
| Codo Δ | −5 | −3 | 0 | +2 | +4 | +5 | 0 | −25 | −40 | −20 |
| Carpo Δ | 0 | +2 | +2 | +2 | +2 | +1 | −5 | −50 | −60 | −15 |
| Menudillo ΔE | −8 | +6 | +10 | +12 | +10 | +4 | −10 | −40 | −58 | −20 |

**Trote** (apoyo 0–46 %):

| % ciclo | 0 | 10 | 20 | 30 | 40 | 50 | 60 | 70 | 80 | 90 |
|---|---|---|---|---|---|---|---|---|---|---|
| Miembro (°) | +23 | +12 | +1 | −10 | −20 | −21 | −4 | +14 | +27 | +26 |
| Hombro Δ | +5 | 0 | −3 | −5 | −7 | −10 | −12 | −5 | +5 | +8 |
| Codo Δ | 0 | −4 | 0 | +6 | +10 | 0 | −30 | −45 | −25 | −5 |
| Carpo Δ | 0 | +4 | +5 | +4 | 0 | −30 | −80 | −85 | −40 | −8 |
| Menudillo ΔE | −5 | +15 | +20 | +16 | +2 | −25 | −55 | −70 | −45 | −15 |

**Galope tendido, mano adelantada** (10–11 m/s, apoyo 0–26 %; la mano de atrás es igual con su propia fase):

| % ciclo | 0 | 10 | 20 | 30 | 40 | 50 | 60 | 70 | 80 | 90 |
|---|---|---|---|---|---|---|---|---|---|---|
| Miembro (°) | +25 | +10 | −8 | −30 | −35 | −25 | −2 | +22 | +35 | +32 |
| Hombro Δ | +10 | +3 | −5 | −12 | −15 | −10 | 0 | +10 | +15 | +14 |
| Codo Δ | +2 | −3 | +3 | −15 | −50 | −60 | −45 | −15 | +5 | +8 |
| Carpo Δ | 0 | +5 | +3 | −60 | −105 | −100 | −60 | −20 | −2 | 0 |
| Menudillo ΔE | −2 | +28 | +20 | −30 | −75 | −80 | −55 | −25 | −10 | −5 |

Cuartilla respecto del suelo a mitad del apoyo (derivado de 218/226/240° tomando parado ≈ 205–208° en la misma
convención): **paso ≈ 40°, trote ≈ 32°, galope corto ≈ 28°, galope tendido ≈ 18–20°** (parado 52°). En el modelo de
hoy (cuartilla 0,12 m, casco 0,085 m) el menudillo baja de 0,18 m a ~0,13 m en el galope tendido.

### 2.3 Miembro posterior (pata). Fase 0 = pisada de ESA pata

"Miembro" = ángulo de la línea cadera → casco respecto de la vertical (+ = protracción).

**Paso** (apoyo 0–66 %):

| % ciclo | 0 | 10 | 20 | 30 | 40 | 50 | 60 | 70 | 80 | 90 |
|---|---|---|---|---|---|---|---|---|---|---|
| Miembro (°) | +18 | +12 | +5 | −2 | −9 | −16 | −23 | −18 | 0 | +16 |
| Cadera Δ | −10 | −6 | −2 | +3 | +8 | +12 | +15 | +10 | −2 | −10 |
| Babilla Δ | 0 | −5 | −3 | 0 | +4 | +6 | +2 | −20 | −35 | −12 |
| Corvejón Δ | 0 | −8 | −5 | −2 | +2 | +4 | 0 | −25 | −38 | −10 |
| Menudillo ΔE | −8 | +6 | +10 | +11 | +9 | +4 | −8 | −38 | −50 | −18 |

**Trote** (apoyo 0–43 %):

| % ciclo | 0 | 10 | 20 | 30 | 40 | 50 | 60 | 70 | 80 | 90 |
|---|---|---|---|---|---|---|---|---|---|---|
| Miembro (°) | +17 | +7 | −4 | −14 | −24 | −27 | −12 | +5 | +18 | +20 |
| Cadera Δ | −8 | −4 | +2 | +8 | +14 | +15 | +5 | −5 | −10 | −10 |
| Babilla Δ | 0 | −8 | −6 | +2 | +8 | −5 | −30 | −40 | −25 | −5 |
| Corvejón Δ | 0 | −15 | −17 | −8 | +2 | −15 | −45 | −52 | −25 | −5 |
| Menudillo ΔE | −5 | +15 | +20 | +14 | 0 | −28 | −55 | −60 | −35 | −12 |

**Galope tendido, pata de atrás** (10–11 m/s, apoyo 0–28 %; la pata adelantada es igual con su fase):

| % ciclo | 0 | 10 | 20 | 30 | 40 | 50 | 60 | 70 | 80 | 90 |
|---|---|---|---|---|---|---|---|---|---|---|
| Miembro (°) | +22 | +6 | −14 | −32 | −40 | −28 | −5 | +18 | +30 | +28 |
| Cadera Δ | −10 | −2 | +10 | +20 | +15 | 0 | −12 | −18 | −18 | −14 |
| Babilla Δ | 0 | −10 | 0 | +10 | −15 | −40 | −50 | −45 | −25 | −8 |
| Corvejón Δ | 0 | −20 | −10 | +5 | −25 | −55 | −62 | −50 | −28 | −8 |
| Menudillo ΔE | 0 | +25 | +20 | −15 | −45 | −65 | −60 | −40 | −15 | −5 |

### 2.4 Protracción y retracción del miembro completo; escápula y pelvis

- Pro/retracción del miembro completo ≈ ±(20–27)° en todas las marchas (derivado de L_apoyo/2 ≈ 0,55–0,70 m sobre
  ~1,35 m de miembro). Medido con la caña (no el miembro completo): ~±15–16° al trote a 4 m/s (PMC8199102). El
  miembro está vertical a mitad del apoyo (medido).
- Al trote, la mayor amplitud de la mano viene de más protracción; en la pata, de más retracción (Back, medido).
- **Retracción en el vuelo**: al final del vuelo el miembro vuelve hacia atrás antes de apoyar, para que el casco
  llegue con poca velocidad respecto del suelo; dura bastante más en la mano que en la pata (Clayton; Back 1995,
  medido). Tamaño: el casco pasa 4–8 cm por delante de la pisada y vuelve (est.).
- La mano gira alrededor de la parte alta de la escápula (no hay clavícula: toda la escápula rota sobre el tórax).
  Reparto propuesto: rotación de la escápula ≈ 0,45 × ángulo del miembro (est.; el modelo de hoy usa k = 0,4).
- La pata gira alrededor de la cadera al paso y al trote, y alrededor de la articulación **lumbosacra** en el galope
  (las dos patas avanzan juntas y toda la pelvis se balancea, lo que alarga el tranco) (Clayton, medido). Cabeceo de
  la pelvis: ROM 7° al paso, 15–16° al galope corto (PMC10698108, medido). → **Pedido al coordinador**: agregar a la
  pose `cuerpo.lumbosacro` (flexión de la pelvis respecto del tronco, rad) para poder hacerlo.

### 2.5 Acoplamientos que usa el IK

- **Carpo trabado en el apoyo**: el carpo se cierra en posición de máximo contacto apenas apoya y la mano funciona
  como un puntal rígido casi todo el apoyo (Clayton, medido). ⇒ en apoyo, carpo Δ ∈ [0, +5°]; toda la adaptación de
  largo la hacen hombro, codo y menudillo.
- **Aparato recíproco**: babilla, corvejón y (en menor medida) menudillo posterior se flexionan y extienden juntos
  (Clayton, medido). ⇒ Δcorvejón ≈ 1,0 · Δbabilla en el vuelo (est. 0,9–1,2); en el apoyo el corvejón cede algo más
  (amortigua) que la babilla (ver tablas).
- Las articulaciones distales se mueven en gran parte de forma pasiva: al despegar, el retroceso elástico de los
  tendones flexores levanta el casco y empieza la flexión del carpo (Clayton, medido).

---

## 3. El casco: aterrizaje, carga, despegue y vuelo

### 3.1 Altura y forma del arco

| | Paso | Trote | Galope corto | Galope tendido |
|---|---|---|---|---|
| Altura máx. casco anterior (sobre el suelo) | 0,08–0,10 m (est.) | 0,14 m (medido 13,8 ± 3,8 cm a la cuerda); 0,20–0,25 m en caballos de mucho movimiento (medido) | 0,22 m (est.) | 0,35–0,45 m (est.: con el carpo a −100° y la mano plegada bajo el pecho, foto-3) |
| Altura máx. casco posterior | 0,08 m (est.) | 0,11 m (medido 10,8 ± 2,4 cm) | 0,18 m (est.) | 0,28–0,35 m (est.) |
| Momento del pico (fracción del vuelo u) | mano 0,35, pata 0,25 | mano 0,35, pata 0,25 | mano 0,35, pata 0,30 | mano 0,40, pata 0,35 |

Forma (medido, Clayton): **el punto más alto llega poco después del despegue**, y en la mano hay una segunda subida
menor al final de la protracción (la pinza "salta" hacia arriba); arco levemente **bifásico**. En la pata el primer
pico es el más alto y le sigue una meseta más larga (medido). Para un criollo usar los valores bajos del trote.

Perfil vertical recomendado (est., da el arco bifásico con derivada nula al apoyar):

```js
// u ∈ [0,1] fracción del vuelo; H altura máx; mano: (c1, w1, a2, c2) = (0.33, 0.24, 0.45, 0.80); pata: (0.27, 0.22, 0.30, 0.75)
const ventana = (u) => Math.sin(Math.PI * u) ** 0.6;            // 0 en los extremos
const gauss = (u, c, w) => Math.exp(-(((u - c) / w) ** 2));
alturaVuelo = (u) => H * ventana(u) * Math.max(gauss(u, c1, w1), a2 * gauss(u, c2, 0.15)) / ventana(c1);
```

Perfil horizontal (en coordenadas del SUELO, del punto de despegue P0 a la pisada P1):

```js
const mj = (x) => x * x * x * (10 - 15 * x + 6 * x * x);         // mínimo tirón: velocidad 0 en 0 y en 1
// R: retracción del vuelo (fracción del paso): mano 0.06, pata 0.02 (est.); uR: comienzo de la retracción
avance = (u) => u < uR ? (1 + R) * mj(u / uR) : (1 + R) - R * mj((u - uR) / (1 - uR));   // uR = 0.82 mano, 0.9 pata
P(u) = P0 + (P1 - P0) * avance(u);
```

La derivada nula en u = 1 garantiza que el casco toca el suelo con velocidad horizontal cero (no patina al apoyar).

### 3.2 Aterrizaje

- En terreno duro el casco aterriza **plano** o con el talón (casi siempre el talón lateral) apenas antes; no de
  pinza (est. sobre Clayton: "en terreno duro el casco queda plano hasta que se levanta el talón"). Pitch del casco
  al tocar: 0 a −3° (pinza levemente arriba) (est.).
- El impacto se amortigua en la pared, el cojinete y las articulaciones (Clayton). Visualmente: en los primeros
  5–10 % del apoyo el menudillo empieza a bajar rápido.

### 3.3 Carga: hundimiento del menudillo

- El menudillo se extiende (baja) en la primera mitad del apoyo, máximo a **mitad del apoyo, cuando la caña está
  vertical**, que coincide con el pico de fuerza vertical; después sube devolviendo la energía elástica de los
  tendones (Clayton, medido).
- Perfil (est.): `E(s) = E0 + (Emax − E0) * Math.sin(Math.PI * s) ** 0.8` con s ∈ [0,1] la fracción del apoyo,
  E0 = E de reposo − 5°, Emax según la marcha (cuartilla a 40/32/28/19° del suelo, ver 2.2).
- Emax crece con la velocidad dentro de cada marcha (trote largo más que reunido, medido) y con un jinete (est. +2°).

### 3.4 Despegue (*breakover*)

- Empieza cuando se levanta el talón: el casco **rota sobre la pinza**, que sigue apoyada; termina cuando la pinza
  deja el suelo (Clayton, medido). Comienza ~86 % del apoyo (pico de tensión del flexor profundo, medido).
- Duración: ~6 % del apoyo al paso (caballos descalzos; 2 % con talón elevado, medido en caballos con laminitis);
  en el galope de carrera ~25–30 ms y baja con la velocidad (medido); propuesta: paso 10 %, trote 12 %, galope 20 %
  del apoyo (est.).
- Ángulo del casco al despegar respecto del suelo: paso ~35°, trote ~50°, galope ~70–90° (est.).
- Implementación: en el breakover el punto fijo en el suelo pasa a ser la **pinza** (no el centro del casco):
  `pitch = P_bo * mj((s - (1 - b)) / b)`, casco rotado alrededor de la pinza. Así no hay deslizamiento.

### 3.5 Vuelo: orientación del casco

- Con el menudillo y la articulación del casco flexionados, la suela mira hacia atrás/arriba en el primer tercio del
  vuelo (foto-3) y vuelve a quedar paralela al suelo en el último 20 % (est.). Lo da la tabla de ΔE + una flexión del
  casco respecto de la cuartilla de −30° (paso) a −50° (galope) en el vuelo (est.).

---

## 4. Tronco, cuello, cabeza y cola

### 4.1 Oscilación vertical (pico a pico) y fase

| | Cruz | Grupa (sacro / maslo) | Cabeza (oreja) | Oscilaciones / tranco |
|---|---|---|---|---|
| Paso | 3,3–3,6 cm (medido, sangre caliente/islandés); 7 cm (otro estudio) → usar 3,5 cm | 6,6–7,9 cm (medido) → 7 cm | 8–12 cm (medido) → 10 cm | 2 |
| Trote | 5–9 cm (medido; 9,2 cm sangre caliente) → 8 cm | 5,6–8,9 cm (medido) → 8 cm | 6–9 cm (medido) → 7 cm | 2 |
| Galope corto (5,8 m/s) | 18 cm (medido) → 15 cm a 5 m/s | 20 cm (medido) → 17 cm | 23 cm (medido) | 1 |
| Galope tendido | menor que en el galope corto (medido, Bertram/Pfau) → 10 cm (est.) | 12 cm (est.) | 15 cm (est.) | 1 |

El centro de masa oscila menos que la cruz: 53 mm al trote (Buchner 2000, medido; 27 % menos que el tronco).

Fase (Animals 2022, medido; % del apoyo de la mano o pata indicada):
- **Paso**: cruz mínima al 4–13 % del apoyo de cada mano (apenas pisa), máxima al 42–48 %; grupa mínima al 8–11 %
  del apoyo de cada pata, máxima al 51–57 % (el cuerpo "bóveda" sobre la pata apoyada: más alto a mitad del apoyo);
  cabeza mínima al 46–48 % del apoyo de cada mano, máxima al 86–88 %.
- **Trote**: cruz mínima al 39–42 % del apoyo de la mano (≈ mitad del apoyo, el resorte se comprime), máxima al
  91–98 % (≈ suspensión); grupa mínima al 41–45 % del apoyo de la pata; cabeza mínima al 39–46 %.
- **Galope**: una sola oscilación. El tronco sube desde mitad del apoyo hasta el comienzo de la suspensión y baja en
  la segunda mitad de la suspensión y al comienzo del apoyo (medido). La flexión máxima de la columna toracolumbar
  coincide con la mitad del apoyo de la mano adelantada (medido). Cruz más baja durante el apoyo de las manos, grupa
  más baja durante el apoyo de las patas (consecuencia; ver 7.8).

### 4.2 Cabeceo (pitch) del tronco, rolido y oscilación lateral

| | Cabeceo del tronco (ROM, medido) | Rolido (pico a pico) | Lateral del tronco (pico a pico) |
|---|---|---|---|
| Paso | 6 ± 2° (Dunbar 2008); 7° de pelvis | 4° (est.) | 4–5 cm, 1 por tranco, hacia la pata apoyada (est.) |
| Trote | 2 ± 1° | 2–3° (est.; la pelvis rota 1 vez por tranco con la pro/retracción de las patas, medido) | 2 cm (est.) |
| Galope corto | 8 ± 1° (tronco); 15–16° la pelvis | 3° (est.) | 2 cm (est.) |
| Galope tendido | 5° (est., menor oscilación vertical) | 2° (est.) | 1 cm (est.) |

En el galope el tronco se balancea: nariz arriba mientras apoyan las patas (grupa abajo), nariz abajo mientras apoyan
las manos (cruz abajo). Columna toracolumbar: 1 ciclo de flexión–extensión por tranco en el galope (medido).
Aceleración y frenado (est.): al acelerar el tronco baja la nariz ~1°/(m/s²); al frenar la grupa baja y la cruz sube
~1,5°/(m/s²), y el cuello sube.

### 4.3 Cuello y cabeza

Medido (Dunbar 2008, a 1,06 / 2,32 / 5,82 m/s): cabeceo (ROM en el espacio) cabeza 9° / 5° / 10°, cuello
10° / 4° / 8°, tronco 6° / 2° / 8° (paso / trote / galope). Los tres segmentos quedan **estabilizados** (rotaciones
< 20°): el caballo mantiene la cabeza relativamente quieta en el espacio, compensando el tronco. Al paso, el cabeceo
de la cabeza y su subida/bajada van casi en fase (21°); al galope casi en contrafase (41–135°).

| | Cuello: base respecto de parado | Cabeceo de cabeza y cuello | En fase con |
|---|---|---|---|
| Paso | −10° (baja; medido −18° en círculo a la cuerda; uso la mitad, est.) | 2 por tranco, ±5° cuello, 10 cm de cabeza | cabeza más baja a mitad del apoyo de cada mano (medido) |
| Trote | −5° (medido −6/−7°, ajustado) | 2 por tranco, ±2° | cabeza más baja a mitad del apoyo de cada diagonal (medido, 39–46 %) |
| Galope corto | +3° (medido: extensión de 4–6°) | 1 por tranco, ±4° cuello, cabeza ±5° | cabeza más baja durante el apoyo de las manos; sube en la suspensión y el apoyo de las patas (est. sobre Dunbar: contrafase con el tronco) |
| Galope tendido | −10°, cuello estirado adelante (est.; foto-3 tiene el cuello a 25° como parado porque es un galope corto) | 1 por tranco, ±3° | igual que el galope corto |

Implementación: cabeza respecto del cuello = −0,5 × cabeceo del cuello (estabiliza la cabeza; est.). Retardo:
resorte crítico (ω_n ≈ 6 rad/s) entre el objetivo y el ángulo dibujado.

### 4.4 Cola

No encontré datos medidos de cola. Propuesta (est.):
- Paso: colgando; balanceo lateral 1 por tranco, ±6° en la punta, siguiendo el rolido de la pelvis con 0,15 s de
  retardo.
- Trote: alzada +10° en la raíz; rebota 2 por tranco ±3°.
- Galope: alzada +25–35° en la raíz (foto-3: la cola sale de la grupa hacia arriba y flamea hacia atrás casi
  horizontal), sube y baja 1 por tranco ±8° en contrafase con el cabeceo de la pelvis.
- Siempre con resortes (cadena de 3–4 eslabones, amortiguamiento 0,5) para que la punta llegue tarde.

---

## 5. Giros

### 5.1 Radio, inclinación y velocidad

- Inclinación del cuerpo hacia adentro (física): **tan θ = v²/(g·r) = v·ω/g**. Medido: los caballos se inclinan
  2,8° (trote) y 3,4° (galope) **menos** que lo previsto (Greve/Dyson); en un círculo de 10 m (r = 5 m, piso plano):
  paso 1,5 m/s ≈ 5°, trote 3,7 m/s ≈ 15–23°, galope 4,8 m/s ≈ 23–30° (Hobbs 2011, medido; previsto: 2,6° / 15,6° /
  25°); trote en círculo de 6 m a 2,3 m/s: 14,8 ± 2,8° (Clayton & Sha 2006, medido); a la cuerda en 10 m: 10° de
  tronco (medido). Rolido de la pelvis en círculo: paso ~0°, trote 5–6°, galope 16–17° (medido).
  ⇒ Usar `θ = max(0, atan(v·|ω|/g) − 0.05)` hacia adentro, filtrado con un resorte (τ ≈ 0,25 s).
- La caña de la mano se inclina hacia adentro con el cuerpo: trote 15° (mano de adentro) vs 10° (afuera); galope
  24° vs 19° (Hobbs 2011, medido). En carrera, +4,4° de caña por cada 1 m/s² de aceleración centrípeta (medido).
- Velocidad y radio: en curvas cerradas los caballos frenan; la velocidad en curva la limitan la fuerza máxima de los
  miembros y el agarre del casco (Tan & Wilson 2011, medido, sin números en el resumen). En pistas de carrera con
  radio 20–120 m se galopa a 6–14 m/s; cerca de 14 m/s se acercan al límite de agarre (PLOS One 2020, medido).
  Propuesta: **aceleración lateral máxima a_lat = 5 m/s²** (est.; equivale a θ ≈ 27°, el máximo medido en galope)
  ⇒ `ω_max(v) = min(ω_cap[marcha], a_lat / v)`, y si el jugador pide más giro, bajar v a `a_lat/|ω|`.

| Marcha | ω_cap (rad/s) | Radio mínimo | Comentario |
|---|---|---|---|
| Quieto (en el lugar) | 0,55 (≈ 32°/s, 180° en 5,7 s) | 0 (pivota) | ver 5.4 |
| Paso | 0,7 | ~1,5 m (est.; vuelta sobre los posteriores al paso: ~0,5 m de radio de la pata, FEI) | |
| Trote | 0,75 | ~3 m (círculo de 6 m a 2,3 m/s, medido) | a 3,5 m/s: r = 4,7 m |
| Galope corto | 0,9 | ~3–5 m (pirueta de trabajo de 3 m de diámetro, reunido; círculo de 10 m, medido) | a 5 m/s: r = 5,6 m |
| Galope tendido | a_lat/v | ~20 m a 10 m/s (est.) | a 11 m/s: ω ≤ 0,45 |

### 5.2 Flexión lateral de columna y cuello

- Columna toracolumbar flexionada hacia adentro **5–6° de media en todas las marchas** en un círculo de ~9 m
  (PMC10698108, medido). ROM lateral: paso 15–16°, trote 7°, galope similar al paso (medido).
  ⇒ `curva = clamp(0.25 * L_cuerpo * ω / max(v, 0.3), −0.10, 0.10)` rad (L_cuerpo = 1,7 m; en un círculo de r = 4,5 m
  da 0,094 rad = 5,4°) (derivado). Signo del proyecto: + = hacia la izquierda = giro > 0.
- Cuello: el caballo va "levemente incurvado hacia el lado del giro" con la nuca como punto más alto (FEI). Propuesta
  (est.): `cuello.lateral = clamp(1.5 * curva + 0.25 * ωObjetivo, ±0.35)` y `cabeza.lateral = 0.4 * cuello.lateral`,
  con el término de ωObjetivo para que la cabeza "mire" la curva antes de que el cuerpo gire (anticipación ~0,3 s).

### 5.3 Dónde van las manos y las patas en la curva

- Patas de adentro: paso más corto, apoyo más largo, más inclinadas hacia adentro. Medido en círculo de 10 m: largo
  de tranco adentro 1,66 m vs afuera 1,77 m (paso), 2,50 vs 2,65 m (galope) (Hobbs 2011); apoyo de la mano de adentro
  en círculo chico al trote 0,387 s vs 0,343 s afuera (PMC10181099). Frecuencia algo menor en el círculo (paso 0,85
  → 0,78 Hz; trote 1,43 → 1,35 Hz) (medido).
  ⇒ Sale solo de la regla de pisadas (7.4) aplicada al arco: cada pata pisa donde estará su punto neutro, y el punto
  neutro de las patas de adentro recorre un arco más corto (radio r − z). No hace falta un caso especial.
- Las pisadas quedan hacia afuera respecto del cuerpo inclinado: con inclinación θ hacia adentro, desplazar el punto
  neutro de cada casco `h_tope · tan θ` hacia AFUERA de la curva (h_tope = altura del hombro/cadera, ~1,1–1,3 m)
  (derivado: el miembro queda alineado con la fuerza del suelo, que es lo que se mide).
- Cruce de manos: en vueltas cerradas al paso la mano de afuera cruza **por delante** de la de adentro; en la vuelta
  sobre los anteriores la pata de adentro cruza por delante de la de afuera (FEI/USDF, Horse & Hound, descriptivo).
  En giros abiertos no se cruzan.

### 5.4 Giro en el lugar

**Sobre los posteriores (media pirueta / vuelta sobre los posteriores)** — recomendado por defecto:
- Las manos y la pata de afuera giran alrededor de la **pata de adentro**, que se levanta y vuelve a apoyar casi en el
  mismo lugar (o un poco adelante) cada vez; mantiene la secuencia y el ritmo del paso (4 tiempos); el caballo va
  levemente incurvado hacia el lado del giro; nunca retrocede (FEI art. 413 / USEF, medido/normativo).
- Tamaño: pirueta con radio = largo del caballo; la "vuelta sobre los posteriores" de caballos jóvenes admite que la
  pata de adentro describa un círculo de ~0,5 m de radio (1 m de diámetro) (FEI/USEF).
- Trancos: media pirueta al galope 3–4 trancos, pirueta completa 6–8; cuarto de pirueta 2–3 trancos (FEI, medido).
  Al paso no hay número oficial; usar lo mismo (est.): **≈ 45° por tranco, 180° en 4 trancos**.
- Con la frecuencia del paso lento (0,65 Hz, est.) eso es ω ≈ 0,5 rad/s ⇒ 180° en ~6 s.
- Qué pata pivota: al girar a la IZQUIERDA (giro > 0) pivota **PI**; a la derecha, **PD**. La mano de afuera (MD al
  girar a la izquierda) cruza por delante de la de adentro.
- Cuánto se mueve cada casco por tranco (derivado, 45°/tranco, distancias del modelo de hoy): manos ~1,1 m en arco
  (están a ~1,35 m del pivote), pata de afuera ~0,2 m, pata de adentro 0–5 cm.

**Sobre los anteriores** (alternativa; parámetro `pivote`):
- La grupa gira alrededor de la **mano de adentro**, que marca el paso en el lugar; las patas describen el círculo
  grande y la de adentro cruza por delante de la de afuera (Horse & Hound; Wikipedia, descriptivo).

**Un caballo suelto** suele girar más bien alrededor del centro (las dos puntas se mueven) (est.). Recomiendo exponer
`pivote ∈ [0, 1]` (0 = sobre los posteriores, 0,5 = centro, 1 = sobre los anteriores) con 0,15 por defecto.

---

## 6. Transiciones, arrancar y frenar

### 6.1 Cómo cambia el patrón

- **Paso → trote** (limpia): se inicia desde el apoyo **diagonal** de dos patas del paso: la próxima mano retrasa su
  pisada y el caballo salta a una suspensión, seguido del otro diagonal; sin pasos intermedios. Puede salir de
  cualquiera de los dos diagonales. Transiciones "sucias": aparece un apoyo de una sola pata (mano o pata despegada
  antes de tiempo). Los caballos más entrenados hacen más transiciones limpias (Clayton/Argue, medido).
  Duración: ~1 paso (0,4–0,6 s) (derivado).
- **Trote → paso**: inverso (diagonal → apoyo de 3 patas del paso) (Clayton, descriptivo).
- **Trote → galope**: desde el apoyo diagonal del trote, de dos formas: (a) 2/3 de las veces el caballo **apoya una
  mano**, que será la mano adelantada del primer tranco (apoyo de 3: pata adelantada + mano de atrás + mano
  adelantada); (b) 1/3 **levanta la mano** del diagonal y queda la pata sola, que será la pata de atrás del primer
  tranco. Del mismo diagonal puede salir a cualquiera de las dos manos (Clayton/Argue, medido). Duración: 1 tranco.
- **Galope → trote**: (a) desde el apoyo diagonal del galope salta a una suspensión y apoya el otro diagonal;
  (b) desde el apoyo de la mano adelantada sola, en vez de la suspensión apoya la pata de atrás (diagonal) y sigue al
  trote. Ambas igual de frecuentes (Clayton/Argue, medido).
- **Galope corto → tendido**: continuo, por velocidad (tabla 1.3).
- Tiempo de reacción mínimo del caballo a una ayuda: 50 ms (medido).

### 6.2 Velocidades de transición (si la marcha la elige la velocidad)

- Paso → trote: Fr ≈ 0,35 ⇒ **2,2 m/s** (Griffin 2004, medido/derivado). Histéresis: trote → paso a 1,8 m/s (est.).
- Trote → galope: los caballos pasan al galope a una velocidad en la que galopar cuesta MÁS energía que trotar; el
  disparador es la fuerza en los miembros (Farley & Taylor 1991, medido). Valor para este caballo: **~5 m/s**,
  galope → trote a 4 m/s (est.). Con palanca, el jugador elige la marcha; la velocidad objetivo de cada marcha sale de
  la tabla 1.1 y el trote/galope se puede estirar dentro de su rango.

### 6.3 Arrancar y frenar

- Desde parado, el primer miembro en moverse fue siempre una **mano** (alto → trote, caballos de doma; preferencia
  por la derecha en los avanzados) (Argue & Clayton, medido). Para el paso, usar lo mismo (est.).
- Al acelerar, la frecuencia llega primero a su máximo y el largo de tranco crece de a poco (IFCE, medido para
  arranque de carrera).
- Trote → alto: los caballos avanzados cambian el patrón de golpe y mantienen la suspensión hasta 1–2 pasos antes del
  alto; los novatos hacen pasos intermedios (se analizaron 8 pasos diagonales antes y después del alto) (Argue &
  Clayton, medido). Propuesta (est.): frenar de trote a alto en **2–3 pasos diagonales** (~1–1,2 s), de paso a alto
  en 1 tranco, de galope a trote en 1–2 trancos.
- Aceleraciones (est.): arrancar al paso 1 m/s²; paso → trote 1,5 m/s²; trote → galope 2 m/s²; galope corto →
  tendido 3 m/s² (un caballo de carrera llega a ~15 m/s en ~4 s). Frenado: paso 1,5; trote 2; galope 3–4 m/s².
- Al frenar: la grupa baja, la cruz y el cuello suben, las patas entran más bajo el cuerpo (est., ver 4.2). Al
  acelerar: cuello abajo y adelante.
- Al quedar parado: las últimas pisadas se "cuadran" (cada casco a < 5 cm de su lugar de reposo); si alguno quedó
  lejos, el caballo da un pasito de acomodo con esa pata (est.).

---

## 7. Algoritmo recomendado

### 7.1 Estado

```js
const PATAS = ['MD', 'MI', 'PD', 'PI'];            // mismo orden que legDefs
const DELANTERA = [true, true, false, false], LADO = [+1, -1, +1, -1];   // +1 = derecha (+z)
estado = {
  pose: { x, z, rumbo, velocidad, giro },        // suelo (doble precisión)
  v, a,                                          // velocidad y aceleración actuales (m/s, m/s²)
  w,                                             // velocidad de giro (rad/s), + = izquierda
  marcha: 'quieto'|'paso'|'trote'|'galope',      // patrón actual
  marchaObjetivo, vObjetivo, wObjetivo,
  mano: +1 | -1,                                 // galope: +1 = mano derecha, -1 = izquierda
  Phi,                                           // fase global continua (NO se reinicia, NO se envuelve con saltos)
  p: [ { desf, desfObj, apoyado, sApoyo,         // por pata
         pisada: {x, z, yaw},                    // casco apoyado, en el SUELO
         despegue: {x, z, yaw, pitch},           // donde despegó (suelo)
         objetivo: {x, z, yaw},                  // pisada planificada (suelo)
         toeLock } ],                            // en breakover: pinza fija
  resortes: { y, cabeceo, rolido, curva, cuelloF, cuelloL, cabezaF, cabezaL, colaA, colaB, lumbosacro }
};
```

### 7.2 Conducción (palanca → v, ω, marcha)

```js
function conducir(entrada, dt) {
  // marchaObjetivo: misma lógica que la v0 (subir según y; bajar de a una mientras se mantiene y < -0.4)
  // vObjetivo: V_TIPICA[marchaObjetivo] (paso 1,6 · trote 3,5 · galope 5 → 11 si se mantiene la palanca a fondo > 1 s)
  const wMax = W_CAP[marchaObjetivo] && Math.min(W_CAP[marchaObjetivo], A_LAT / Math.max(estado.v, 0.1));
  estado.wObjetivo = -entrada.x * wMax;                 // derecha = giro negativo
  if (Math.abs(estado.wObjetivo) * estado.vObjetivo > A_LAT) estado.vObjetivo = A_LAT / Math.abs(estado.wObjetivo);
}
// cada subpaso h (1/120 s):
v → vObjetivo con aceleración limitada (ACEL/FRENO de 6.3) y tirón limitado (resorte crítico ω_n = 3 rad/s)
w → wObjetivo con resorte crítico (τ ≈ 0,3 s)
marcha: el patrón cambia cuando vObjetivo lo pide (sección 7.3); quieto solo cuando v < 0,05 y todas las patas apoyadas
```

### 7.3 Reloj de fase y desfases por pata

```js
function patron(marcha, v, mano) {
  // devuelve f, d[4], t[4] (pisadas) de las tablas 1.2/1.3 interpoladas en v; galope espejado según mano
}
function avanzarReloj(h) {
  const P = patron(estado.marcha, estado.v, estado.mano);
  estado.Phi += P.f * h;
  for (i of 0..3) {
    const q = estado.p[i];
    q.desfObj = frac(-P.t[i]);                       // = off
    if (!q.apoyado) {                                // SOLO en el vuelo
      let e = q.desfObj - q.desf; e -= Math.round(e);
      // límite: no acortar el vuelo por debajo de VUELO_MIN = 0,15 s ni alargarlo más de 1,5×
      q.desf = frac(q.desf + clamp(e, -RATE * h, RATE * h));   // RATE ≈ 0,8 ciclos/s (est.)
    }
    const fase = frac(estado.Phi + q.desf);
    // eventos (detectados por cruce, nunca por igualdad):
    //  apoyado && fase >= d[i]  → DESPEGUE (si no está en breakover forzado ya)
    //  !apoyado && fase envolvió (pasó de ~1 a ~0) → PISADA: q.pisada = q.objetivo; q.apoyado = true
  }
}
```

Por qué así: la fase de una pata en apoyo nunca se toca ⇒ su casco no salta. En el vuelo, cambiar el desfase solo
cambia cuándo pisa (el vuelo dura un poco más o menos). Una transición de marcha o un cambio de mano tardan ~1 tranco
y no hay estados imposibles. El cambio de mano en galope: se cambia `estado.mano` justo cuando empieza la suspensión
(todas en vuelo), y cada pata converge a su nuevo desfase sin apoyar nada a destiempo.

**Despegue anticipado** (seguridad): si una pata apoyada no alcanza su casco (7.5), se adelanta su `desf` lo justo
para que `fase = d[i]` y despega ahí mismo: es un salto de fase pero no de posición (el casco sale de donde estaba).

### 7.4 Plan de pisadas en el suelo

```js
function planificar(i, P) {                        // al despegar y cada cuadro mientras u < 0.7
  const q = estado.p[i], fase = frac(estado.Phi + q.desf);
  const tPisa = (1 - fase) / P.f;                  // segundos hasta que pise
  const tMedio = tPisa + P.d[i] / (2 * P.f);       // mitad de su próximo apoyo
  const futura = predecirPose(estado.pose, estado.v, estado.a, estado.w, tMedio);   // integra el arco
  const n = puntoNeutro(i);                        // marco del caballo: cascoReposo (+5 cm en patas al galope, est.)
  n.z += -signo(estado.w) * hTope[i] * Math.tan(inclinacion);   // hacia afuera de la curva (5.3)
  let obj = sueloDesdeCaballo(futura, n);          // (x, z) + Ry(rumbo)·n
  // límites: paso máximo (1,15 × SL) y distancia mínima de 0,10 m al casco apoyado del mismo par (manos o patas);
  // si hay que cruzar, se permite pero se marca q.cruza = true (la trayectoria pasa por delante, 7.6)
  q.objetivo = { x: obj.x, z: obj.z, yaw: futura.rumbo };
}
function predecirPose(p, v, a, w, t) {             // integración de un arco con aceleración (8 subpasos)
  // giro en el lugar: rotar alrededor del pivote (5.4) en vez de alrededor del origen del caballo
}
```

Entre u = 0,7 y 1 el objetivo queda congelado (sin re-planificar): elimina el temblor de los cascos que llegan.

### 7.5 Apoyo

```js
// en cada subpaso, para cada pata apoyada:
cascoCaballo = caballoDesdeSuelo(estado.pose, q.pisada);   // el casco NO se mueve en el suelo
s = fase / d;                                               // progreso del apoyo
E = perfilMenudillo(s, marcha, v);                          // 3.3
if (s > 1 - b) { /* breakover: pinza fija en el suelo, pitch = P_bo * mj(...) */ }
// alcance: dist(tope, menudillo) ≤ 0.995 * alcanceMax; si no alcanza, en orden:
//   1) E += hasta 10° más (el menudillo baja)
//   2) mano: la escápula se desliza hasta 3 cm hacia el casco (no hay clavícula)
//   3) cuerpo: la altura del cuerpo baja (7.8: y = min(y_plantilla, y_alcanzable))
//   4) si s > 0.6: despegue anticipado (7.3)
// yaw del casco: fijo en el suelo; en el giro en el lugar el casco que pivota puede girar sobre sí (máx. 15° por apoyo)
```

### 7.6 Vuelo

```js
u = (fase - d) / (1 - d);
P = lerp2(q.despegue, q.objetivo, avance(u));               // 3.1, en el SUELO
y = alturaVuelo(u) * escalaAltura(marcha, v);               // 3.1
if (q.cruza) P += adelante * 0.12 * Math.sin(Math.PI * u);  // pasa por delante del casco apoyado (est.)
// giro en el lugar: altura 0,06 m; la pata que pivota 0,04 m (marca el paso)
cascoCaballo = caballoDesdeSuelo(poseActual, P) con y
flexCarpo = tablaCarpo(u, marcha, v);  E = tablaMenudillo(u, ...);   // 2.2 / 2.3
```

### 7.7 IK por pata (3D, 3 segmentos + cuartilla)

Entradas: tope del miembro T (mano: parte alta de la escápula; pata: articulación de la cadera, que en el galope
gira con `lumbosacro`), objetivo H (corona del casco, marco del caballo), E (menudillo) y pitch del casco.

```js
// 1) Abducción: girar alrededor del eje x del caballo, en T
alfa = Math.atan2(H.z - T.z, T.y - H.y);            // limitar: ±0.25 rad hacia afuera, 0.20 hacia adentro (cruce)
Hp = rotarX(H, -alfa, T);                           // H llevado al plano z = T.z
// 2) Menudillo: F = Hp + P_LEN * dirCuartilla, con la cuartilla a (90° - E) del eje de la caña.
//    Primera aproximación: caña vertical (exacto a mitad del apoyo); 1 iteración corrigiendo con la caña resuelta.
// 3a) MANO (escápula S, húmero, antebrazo, caña):
//    psi = psi0 + 0.45 * anguloMiembro(T, F)         → hombro S = T + Ls * dir(psi)
//    c = apoyado ? clamp(c, 0, 5°) : tablaCarpo(...)  (flexión del carpo)
//    Lv = sqrt(La² + Lc² + 2·La·Lc·cos c)           (codo → menudillo con el carpo fijo)
//    IK de 2 huesos S → codo → F con (Lh, Lv), codo hacia atrás;
//    si |S−F| > Lh+Lv: pasos 1–4 de 7.5; si |S−F| < |Lh−Lv| (solo en vuelo): aumentar c (bisección).
//    Rodilla K: desde el codo, rotar hacia F el ángulo del triángulo (La, Lc, Lv), carpo plegando hacia atrás.
// 3b) PATA (fémur, tibia, metatarso) con aparato recíproco:
//    corvejón(θs) = θh0 + 1.0 * (θs − θs0)
//    alcance(θs) = |extremo de la cadena plana| es monótono en θs → bisección (12 iteraciones, arranque en el valor
//    del cuadro anterior) hasta alcance(θs) = |A − F|; θs ∈ [95°, 165°]
//    luego rotar la cadena alrededor de A para que termine en F, babilla adelante y corvejón atrás (forma de Z).
// 4) Deshacer la abducción (rotarX(+alfa)) en todos los puntos.
// 5) Casco: suela paralela al suelo en el apoyo (contra-rotar −alfa y −rolido del cuerpo), pitch del breakover;
//    en el vuelo, orientación de la cuartilla + flexión del casco (3.5).
```

Requisitos para no temblar: soluciones continuas (codo siempre atrás, rodilla nunca hacia adelante, corvejón siempre
atrás), bisección con arranque en el valor anterior, todos los límites con `smoothClamp` (no `Math.min` duro) cerca de
la extensión máxima.

### 7.8 Cuerpo a partir de las pisadas

Cada pata aporta un núcleo periódico de SU fase `φ_i` (no de la fase global):

```js
// K(φ) = A1 cos 2πφ + B1 sin 2πφ + A2 cos 4πφ + B2 sin 4πφ   (coeficientes por marcha, de la tabla de abajo)
yCruz  = Σ_{i manos} K_cruz(φ_i);   yGrupa = Σ_{i patas} K_grupa(φ_i);
```

Por qué funciona: en paso y trote las dos manos van desfasadas 0,5, así que el 1.er armónico se cancela solo y queda
el 2.º (2 oscilaciones por tranco); en el galope las manos van desfasadas ~0,2 y sobrevive el 1.er armónico (1
oscilación). En las transiciones los desfases cambian de a poco y la mezcla es continua. Para mezclar marchas,
**interpolar los coeficientes (A, B), nunca amplitud y fase** (la fase da vueltas).

Coeficientes por marcha (a partir de 4.1, en amplitud a y fase de mínimo φmin, convertir a A, B):
el término n-ésimo `a·cos(2πn(φ − φmin) + π)` tiene su mínimo en φmin.

| Marcha | Cruz (por mano) | Grupa (por pata) | Origen |
|---|---|---|---|
| Paso | n=2: a = 0,9 cm, φmin = 0,05 (≈ 8 % del apoyo) | n=2: a = 1,75 cm, φmin = 0,06 | medido (pico a pico 3,5 / 7 cm; mínimos 4–13 % / 8–11 %) |
| Trote | n=2: a = 2,0 cm, φmin = 0,21 (≈ mitad del apoyo) | n=2: a = 2,0 cm, φmin = 0,20 | medido (8 / 8 cm; mínimos 39–45 % del apoyo) |
| Galope corto (5 m/s) | n=1: a = 4,0 cm, φmin = d/2; n=2: 0,5 cm | n=1: a = 4,5 cm, φmin = d/2 | derivado de 15/17 cm con desfase entre manos ~0,2 (2a·cos(π·0,2) ≈ 1,6a de amplitud) |
| Galope tendido | n=1: a = 3,0 cm, φmin = d/2 | n=1: a = 3,5 cm, φmin = d/2 | est. |

Después:
```js
cabeceo = Math.atan2(yCruz - yGrupa, D_CG)        // D_CG ≈ 0,9 m (cruz a grupa en el modelo)
          + ACEL_PITCH * a;                         // −1°/(m/s²) al frenar → nariz arriba (est.)
y = (yCruz + yGrupa) / 2;
y = Math.min(y, yAlcanzable);                       // 7.5: el cuerpo nunca sube más de lo que las patas apoyadas alcanzan (softmin)
rolido = inclinacionCurva + Σ_i LADO[i] * K_rol(φ_i);   // K_rol n=1, ±1–2° (est.)
lateral = Σ_i LADO[i] * K_lat(φ_i);                 // 4.2 (est.)
curva = 5.2;  cuello y cabeza: 4.3 + 5.2;  cola: 4.4;  lumbosacro: K de las patas, ±7° galope (est.)
// todo pasa por resortes críticos (ω_n 6–10 rad/s para el cuerpo, 6 para el cuello, 3–4 para la cola)
```

### 7.9 Giro en el lugar pisando

```js
if (v < 0.05 && |wObjetivo| > 0.05) {
  marcha = 'paso'; patron con f = 0.65 Hz, d = 0.65, secuencia lateral; v = 0
  pivote (marco del caballo) = lerp(cascoReposo[pata de adentro], cascoReposo[mano de adentro], PIVOTE)  // 5.4
  la pose rota alrededor del pivote: (x, z) se mueve con w; predecirPose lo usa para las pisadas (7.4)
  pata que pivota: objetivo ≈ su pisada actual (+3 cm adelante), altura 0,04 m
  mano de afuera: q.cruza = true si su objetivo queda del otro lado de la mano de adentro
  cuerpo: inclinación 0; curva hacia el giro 0,06 rad; cuello lateral 0,25 rad (est.)
  w se integra de forma continua (no a saltos); el límite de alcance (7.5) hace despegar a tiempo la pata que se tuerce
}
```

### 7.10 Quieto y acomodar

```js
if (vObjetivo == 0 && |wObjetivo| < 0.05) {
  // cada pata que despega planifica su objetivo = punto neutro (cuadrado), con v → 0
  // cuando todas apoyadas y v < 0.05: si alguna está a > 5 cm de su reposo, un "paso de acomodo" de esa sola pata
  // (0,5 s, altura 4 cm); si no, estado.marcha = 'quieto' y el reloj se detiene (Phi deja de avanzar)
}
// arrancar: elegir Phi para que la próxima pata en despegar sea una mano (6.3); la primera zancada es medio paso
```

### 7.11 Lista contra deslizamientos y temblores

1. Un solo reloj `Phi`; nada usa `sin(2π·k·Phi)` con k variable (ya está en CLAUDE.md). Las oscilaciones salen de
   las fases de cada pata (7.8).
2. Desfases por pata: solo cambian en el vuelo, con velocidad limitada.
3. Cascos apoyados en coordenadas del suelo en doble precisión; se pasan al marco del caballo cada cuadro.
4. Trayectoria del vuelo en el suelo con derivada nula en los extremos ⇒ velocidad 0 al despegar y al pisar.
5. Objetivo congelado en el último 30 % del vuelo.
6. Subpasos fijos de 1/120 s (como `sim()` de hoy); el render usa el último estado.
7. Parámetros que dependen de v y de la marcha: interpolados en v y filtrados con resortes críticos; nunca cambian
   de golpe al cambiar la marcha.
8. IK con arranques en el cuadro anterior, límites suaves, sin cambios de rama.
9. Altura del cuerpo con `min` suave contra el alcance de las patas apoyadas.
10. Mano de galope y cambio de patrón con histéresis.

### 7.12 Pruebas para tools/qa/check.mjs

- Deslizamiento: para cada apoyo, distancia máxima en el SUELO del centro de la suela (o de la pinza en el breakover)
  respecto de su pisada < 3 cm; en recta, doblando (ω = ±ω_max) y girando en el lugar.
- Hundimiento: punto más bajo de la suela ≥ −0,5 cm; casco en vuelo nunca bajo el suelo.
- Secuencia: orden de pisadas por marcha (paso PI → MI → PD → MD; trote diagonales; galope según mano).
- Mano de galope: 2 trancos después de doblar sostenido a un lado, la mano adelantada es la de adentro.
- Duty y tranco medidos dentro de ±0,05 y ±10 % de la tabla 1.2 para la v medida.
- Temblor: tercera diferencia (tirón) de la altura del cuerpo y de cada casco por debajo de un umbral durante 3 s
  alrededor de cada cambio de marcha y de cada cambio de mano.
- Giro en el lugar: 180° en 4 ± 1 trancos; la pata que pivota se mueve < 10 cm en total.

---

## 8. Datos que no encontré en las fuentes (valores estimados)

- Curvas articulares cada 10 % (sección 2): reconstruidas; solo extremos, ROM y tiempos están medidos.
- Altura del casco al paso, al galope corto y al galope tendido; tamaño de la retracción del vuelo.
- Ángulo del casco al despegar; duración del breakover en paso y trote para caballos sanos.
- Oscilación lateral y rolido en recta; amplitudes en el galope tendido.
- Cola (sin datos).
- Flexión lateral del cuello en curvas y anticipación de la cabeza.
- Aceleraciones y frenados; aceleración lateral máxima (5 m/s²); velocidad de transición trote → galope (~5 m/s).
- Número de trancos de la media pirueta al PASO (se usó el de galope de la FEI).
- Coeficiente del aparato recíproco (1,0) y reparto de la escápula (0,45).

---

## 9. Fuentes

- Robilliard, Pfau, Wilson (2007). Gait characterisation and classification in horses. J Exp Biol 210:187.
  https://journals.biologists.com/jeb/article/210/2/187/17107/Gait-characterisation-and-classification-in-horses
- Clayton, H. M. Canter rhythms, oddities and illusions. USDF Connection (2011/12).
  https://www.usdf.org/EduDocs/The-Horse/Canter_Oddities_Illusions1.pdf
- Clayton, H. M. Transitions between trot and canter. USDF Connection (2009).
  https://www.usdf.org/EduDocs/The-Horse/HorsehealthConnection_TransitionsBetweenTrotandCanter.pdf
- Clayton, H. M. Transitions between walk and trot. USDF Connection (2009).
  https://www.usdf.org/EduDocs/The-Horse/horsehealthconnection_TransitionsBetweenWalkandTrot_2009_aug-2.pdf
- Clayton, H. M. Mechanics of equine locomotion (impacto, carga, breakover, vuelo, aparato recíproco, lumbosacra).
  https://www.quia.com/files/quia/users/medicinehawk/3307-Biomechanics/MECHANICS-OF-EQUINE-LOCOMOTION.pdf
- Clayton (1994). Comparison of the stride kinematics of the collected, working, medium and extended trot. EVJ 26:230.
  https://beva.onlinelibrary.wiley.com/doi/10.1111/j.2042-3306.1994.tb04375.x
- Clayton (1994). Comparison of the collected, working, medium and extended canters. EVJ Suppl 17.
  https://beva.onlinelibrary.wiley.com/doi/abs/10.1111/j.2042-3306.1994.tb04866.x
- IFCE Équipédia. The horse's gaits: definitions and figures (tabla de velocidad, largo y frecuencia; disociación;
  mano en las curvas).
  https://equipedia.ifce.fr/en/equipedia-the-universe-of-the-horse-ifce/equestrian-instruction-and-teaching/didactics-and-equestrian-techniques/interdisciplinary-principles/the-horses-gaits-definitions-and-figures
- Witte, Hirst, Wilson (2006). Effect of speed on stride parameters in racehorses at gallop in field conditions.
  J Exp Biol 209:4389. https://journals.biologists.com/jeb/article/209/21/4389/16347/Effect-of-speed-on-stride-parameters-in-racehorses
- Pfau et al. (2024). Dirt track surface preparation and associated differences in speed, stride length and stride
  frequency in galloping horses. Sensors. https://pmc.ncbi.nlm.nih.gov/articles/PMC11054522/
- Hildebrand, M. (1977). Analysis of asymmetrical gaits. J Mammal 58:131.
  https://www.originalwisdom.com/wp-content/uploads/bsk-pdf-manager/2019/04/Hildebrand_1977_Analysis-of-Asymmetrical-Gaits.pdf
- Bertram & Gutmann (2009). Motions of the running horse and cheetah revisited. J R Soc Interface.
  https://www.originalwisdom.com/wp-content/uploads/bsk-pdf-manager/2019/10/Bertram-and-Gutmann_2009_Motions-of-the-running-horse-and-cheetah-revisited.pdf
- Electromyographic and kinematic comparison of the leading and trailing fore- and hindlimbs during canter (2023).
  https://pmc.ncbi.nlm.nih.gov/articles/PMC10252091/
- Circle diameter impacts stride frequency and forelimb stance duration at various gaits in horses (2023).
  https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10181099/
- Hobbs, Licka, Polman (2011). The difference in kinematics of horses walking, trotting and cantering on a flat and
  banked 10 m circle. EVJ 43:686. https://vuir.vu.edu.au/9219/1/Banking%20paper%20Oct%2010%20(1).pdf
- Back motion in unridden horses in walk, trot and canter on a circle (2023).
  https://pmc.ncbi.nlm.nih.gov/articles/PMC10698108
- Clayton & Sha (2006). Head and body centre of mass movement in horses trotting on a circular path. EVJ.
  https://beva.onlinelibrary.wiley.com/doi/10.1111/j.2042-3306.2006.tb05588.x
- Greve & Dyson. Body lean angle in sound dressage horses in-hand, on the lunge and ridden (resumen).
  https://www.researchgate.net/publication/304025610_Body_lean_angle_in_sound_dressage_horses_in-hand_on_the_lunge_and_ridden
- The effect of curve running on distal limb kinematics in the Thoroughbred racehorse (2020). PLOS One.
  https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0244105
- Tan & Wilson (2011). Grip and limb force limits to turning performance in competition horses. Proc R Soc B.
  https://ora.ox.ac.uk/objects/uuid:042f0a1d-d66f-4c00-bb44-95c796aa6094
- Dunbar et al. (2008). Stabilization and mobility of the head, neck and trunk in horses during overground
  locomotion. J Exp Biol 211:3889.
  https://journals.biologists.com/jeb/article/211/24/3889/18018/Stabilization-and-mobility-of-the-head-neck-and
- Timing of vertical head, withers and pelvis movements relative to the footfalls in different equine gaits and
  breeds (Animals 2022). https://pmc.ncbi.nlm.nih.gov/articles/PMC9657284/
- Buchner et al. (2000). Body centre of mass movement in the sound horse. Vet J.
  https://www.sciencedirect.com/science/article/abs/pii/S1090023300905070
- Normal variation in pelvic roll motion pattern during straight-line trot in hand in warmblood horses (2023).
  https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10564842/
- Griffin, Kram, Wickler, Hoyt (2004). Biomechanical and energetic determinants of the walk–trot transition in horses.
  J Exp Biol 207:4215. https://journals.biologists.com/jeb/article-abstract/207/24/4215/2679/Biomechanical-and-energetic-determinants-of-the
- Farley & Taylor (1991). A mechanical trigger for the trot–gallop transition in horses. Science.
  https://www.science.org/doi/10.1126/science.1857965
- Argue & Clayton. Dressage training affects temporal variables in transitions between trot and halt (resumen).
  https://www.cambridge.org/core/journals/comparative-exercise-physiology/article/abs/dressage-training-affects-temporal-variables-in-transitions-between-trot-and-halt/C3AD73BBCCF85D334D6468F1B0B35B2B
- Argue & Clayton. A preliminary study of transitions between the walk and trot in dressage horses (resumen).
  https://pubmed.ncbi.nlm.nih.gov/8470463
- Khumsap et al. (2002). Effect of walking velocity on forelimb kinematics and kinetics. EVJ Suppl.
  https://pubmed.ncbi.nlm.nih.gov/12405709/
- Back et al. (1995). How the horse moves: 1. Forelimb kinematics; 2. Hind limb kinematics. EVJ 27.
  https://beva.onlinelibrary.wiley.com/doi/10.1111/j.2042-3306.1995.tb03029.x ·
  https://beva.onlinelibrary.wiley.com/doi/10.1111/j.2042-3306.1995.tb03030.x
- Hodson et al. (2000, 2001). The forelimb / hindlimb in walking horses: kinematics and ground reaction forces. EVJ.
  https://beva.onlinelibrary.wiley.com/doi/abs/10.2746/042516400777032237 ·
  https://beva.onlinelibrary.wiley.com/doi/10.2746/042516401776767485
- Lanovaz et al. (2002). Three-dimensional kinematics of the tarsal joint at the trot. EVJ.
  https://beva.onlinelibrary.wiley.com/doi/abs/10.1111/j.2042-3306.2002.tb05438.x
- Motion analysis and its use in equine practice and research (ROM al trote de carpo y menudillos; resumen).
  https://www.researchgate.net/publication/234163493_Motion_analysis_and_its_use_in_equine_practice_and_research
- Metacarpophalangeal joint angle measurement in equine forelimbs (ángulo del menudillo 218/226/240°; fuente
  probable, no verificada). https://www.researchgate.net/publication/273493548_Metacarpophalangeal_Joint_Angle_Measurement_in_Equine_Forelimbs
- The protraction and retraction angles of horse limbs: an estimation during trotting using inertial sensors (2021).
  https://pmc.ncbi.nlm.nih.gov/articles/PMC8199102/
- Effect of heel elevation on breakover phase in horses with laminitis (2020).
  https://pmc.ncbi.nlm.nih.gov/articles/PMC7528610/
- Influence of speed, ground surface and shoeing condition on hoof breakover duration in galloping Thoroughbred
  racehorses (2021). https://pmc.ncbi.nlm.nih.gov/articles/PMC8472780/
- The laterality of the gallop gait in Thoroughbred racehorses (2018). https://pmc.ncbi.nlm.nih.gov/articles/PMC5993273/
- USDF / FEI. Pirouette in walk and canter (reglamento FEI art. 413 y USEF DR112).
  https://www.usdf.org/EduDocs/Training/pirouetteinwalkandcanter.pdf
- USDF. Changes of lead and flying change of lead. https://www.usdf.org/EduDocs/Training/Changes_of_lead1.pdf
- Horse & Hound. What is a turn on the forehand. https://www.horseandhound.co.uk/features/turn-on-the-forehand-712913 ·
  Wikipedia: https://en.wikipedia.org/wiki/Turn_on_the_forehand
- Gaits, strides, footfall patterns, suspension, DAP and LAP (lateral advanced placement del paso 21,6 %).
  https://inertia-technology.com/techarticle/gaits-and-strides-in-equi-pro/
- Muybridge (1878). The Horse in Motion. https://en.wikipedia.org/wiki/The_Horse_in_Motion
- Back & Clayton (eds.). Equine Locomotion, 2.ª ed., Elsevier (referencia general; no consultado completo).
  https://shop.elsevier.com/books/equine-locomotion/back/978-0-7020-2950-9
- Altura del casco al trote (13,8 ± 3,8 cm mano, 10,8 ± 2,4 cm pata, sin barras; 20–25 cm en caballos de mucho
  movimiento): estudios de trote sobre barras de Clayton y colaboradores, citados en los resúmenes de búsqueda; no
  pude abrir el artículo primario.
