# El zaino

Un caballo zaino colorado en 3D, ensillado, que recorre un campo uruguayo sin fin, con potreros, tranqueras, ranchos, montes y ovejas. El caballo está construido sobre un esqueleto anatómico real y se mueve pisando el suelo: paso, trote, galope y galope tendido, con giros y giro en el lugar. Todo se genera por código en el navegador con three.js: no hay modelos ni imágenes externas.

## Cómo se usa

- **Quieto, Paso, Trote, Galope**: cambian la marcha (teclas **1** a **4**).
- **Ver desde la montura**: pasa a la vista del jinete y vuelve a la exterior (tecla **V**).
- **Palanca** (en la vista desde la montura) o **flechas del teclado** (en las dos vistas): arriba acelera de a una marcha (paso, trote, galope; a fondo un rato, galope tendido) y al soltar mantiene la marcha; abajo frena; a un costado dobla. Para volver, mantené la palanca a un costado hasta girar lo que quieras, también parado. Los alambrados, árboles y el rancho no se atraviesan: buscá una tranquera.
- **Velocidad**: acelera o frena la marcha.
- **Girar solo**: la cámara da vueltas alrededor del caballo.
- En la vista exterior, arrastrá para girar y usá la rueda o el pellizco para acercar. Desde la montura, arrastrá para mirar alrededor.
- **Apoyos** muestra qué patas pisan el suelo: MI y MD son las manos izquierda y derecha; PI y PD, las patas.

## Correrlo en tu compu

Es un sitio estático, sin compilación. Desde la carpeta del proyecto:

```bash
bash tools/qa/serve.sh
```

y abrí http://localhost:8000 (o serví la carpeta con cualquier servidor estático).

Las herramientas de prueba están en `tools/qa/` (necesitan Node.js; instalalas con `npm install` en esa carpeta).

## Licencia y créditos

- Código bajo licencia MIT (ver [LICENSE](LICENSE)).
- [three.js](https://threejs.org) r128, licencia MIT (incluido en `vendor/`).
- Fuentes Instrument Serif, IBM Plex Sans Condensed e IBM Plex Mono, de Google Fonts, licencia SIL Open Font License (OFL).
