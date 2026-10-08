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

  // Studio reflections: soft gradient dome + two softboxes, prefiltered (no visible environment)
  (function buildEnv() {
    const env = new THREE.Scene();
    const g = new THREE.SphereGeometry(10, 32, 16);
    const col = [];
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / 10;
      const c = y < 0 ? new THREE.Color().lerpColors(lin('#4a5a2c'), lin('#9fb0a0'), sstep(-0.6, 0, y)) : new THREE.Color().lerpColors(lin('#c6d6e2'), lin('#4f86c6'), sstep(0, 0.8, y));
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    env.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const box = (x, y, z, w, h, k) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k * 0.95), side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
    };
    box(4, 6, 5, 3, 3, 4.5);
    box(-6, 4, -4, 6, 3, 1.4);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(env, 0.04).texture;
  })();

  scene.add(new THREE.HemisphereLight(0xcfe2f5, 0x5d6b3a, 0.55));
  const key = new THREE.DirectionalLight(0xfff1dd, 2.6);
  key.position.set(3, 5, 3.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -2.2, right: 2.2, top: 2.7, bottom: -0.5, near: 1, far: 14 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.015;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xc8dcff, 0.8);
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
