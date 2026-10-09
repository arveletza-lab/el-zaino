// Renderer, cámara, OrbitControls, luces, mapa de entorno (reflejos del pelaje) y sombras.
import { lin, sstep } from './util.js';

export function crearEscena(stage) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 1500);
  camera.position.set(4.0, 1.75, 4.7);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(0.05, 0.85, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 1.6;
  controls.maxDistance = 15;
  controls.maxPolarAngle = Math.PI * 0.62;
  controls.autoRotateSpeed = 1.2;

  // Reflejos de exterior: domo con cielo (claro en el horizonte, azul arriba), cuchillas con bruma, pasto y algo de
  // tierra bajo el caballo, prefiltrado (no se ve). Sin softboxes de estudio: sus reflejos blancos daban al pelaje
  // aspecto de plástico; así los reflejos toman el color del lugar.
  (function buildEnv() {
    const env = new THREE.Scene();
    const g = new THREE.SphereGeometry(10, 64, 32);
    const col = [];
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / 10;
      let c;
      if (y >= 0) c = new THREE.Color().lerpColors(lin('#dfe7ea'), lin('#6e9bd2'), sstep(0, 0.75, y));
      else {
        c = new THREE.Color().lerpColors(lin('#9db08f'), lin('#6f8a3c'), sstep(0, -0.12, y));   // horizonte: cuchillas con bruma
        c.lerp(lin('#5e7434'), sstep(-0.12, -0.6, y));                                          // pasto
        c.lerp(lin('#7d6f52'), 0.35 * sstep(-0.6, -0.95, y));                                   // tierra bajo el caballo
      }
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    env.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.04).texture;
  })();

  // el hemisferio compensa lo que la luz de contorno, más suave, deja de iluminar del lado a la sombra
  scene.add(new THREE.HemisphereLight(0xcfe2f5, 0x5d6b3a, 0.7));
  const key = new THREE.DirectionalLight(0xfff1dd, 2.6);
  key.position.set(3, 5, 3.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -2.2, right: 2.2, top: 2.7, bottom: -0.5, near: 1, far: 14 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.015;
  scene.add(key);
  // luz de contorno neutra y suave: azulada y a 0,8 dejaba un reflejo blanco azulado en el pelaje del lado a la sombra
  const rim = new THREE.DirectionalLight(0xe6e4e0, 0.45);
  rim.position.set(-4, 3, -3);
  scene.add(rim);

  // el sol y la luz de contorno quedan fijos en el MUNDO: el caballo está en el origen y el mundo gira -rumbo,
  // así que las luces giran igual alrededor del caballo (la cámara de sombra sigue centrada en él)
  const solBase = key.position.clone(), contornoBase = rim.position.clone(), eje = new THREE.Vector3(0, 1, 0);
  function orientarSol(rumbo) {
    key.position.copy(solBase).applyAxisAngle(eje, -rumbo);
    rim.position.copy(contornoBase).applyAxisAngle(eje, -rumbo);
  }
  return { renderer, scene, camera, controls, orientarSol };
}

export const shadowed = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };
