// 3D wheel for the display screen. The wheel face (names, colours, image) is the
// same 2D drawing as before, used as a texture on a lit, tilted disc.
// display.js keeps the flat wheel if this module fails to load or WebGL is missing.

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const TILT = -0.32; // top of the wheel leans away from the audience
const MAX_PEGS = 72; // beyond this the pegs merge into a solid ring

function createWheel3D({ canvas, faceCanvas }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;

  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
  camera.position.set(0, 0, 5.2);

  const light = new THREE.DirectionalLight(0xffffff, 1.6);
  light.position.set(-1.6, 2.4, 4.5);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  light.shadow.camera.left = -2;
  light.shadow.camera.right = 2;
  light.shadow.camera.top = 2;
  light.shadow.camera.bottom = -2;
  light.shadow.radius = 6;
  light.shadow.bias = -0.0005;
  scene.add(light, new THREE.AmbientLight(0xffffff, 0.15));

  // Everything that tilts together; `spinner` is the part that turns.
  const tilted = new THREE.Group();
  tilted.rotation.x = TILT;
  scene.add(tilted);
  const spinner = new THREE.Group();
  tilted.add(spinner);

  const gold = new THREE.MeshStandardMaterial({ color: 0xd4a94e, metalness: 1, roughness: 0.28 });

  // Soft shadow of the wheel on the page behind it.
  const shadowCatcher = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 8),
    new THREE.ShadowMaterial({ opacity: 0.22 })
  );
  shadowCatcher.position.z = -0.35;
  shadowCatcher.receiveShadow = true;
  tilted.add(shadowCatcher);

  // Face: a disc whose UVs match the 2D drawing, so it looks identical head on.
  const texture = new THREE.CanvasTexture(faceCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const face = new THREE.Mesh(
    new THREE.CircleGeometry(1, 160),
    // Low env response keeps the slice colours true to the chosen palette.
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.7, metalness: 0, envMapIntensity: 0.4 })
  );
  face.position.z = 0.051;
  face.receiveShadow = true;
  spinner.add(face);

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 0.1, 160).rotateX(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x2a2522, metalness: 0.2, roughness: 0.6 })
  );
  body.castShadow = true;
  spinner.add(body);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.045, 32, 200), gold);
  rim.position.z = 0.05;
  rim.castShadow = true;
  spinner.add(rim);

  const hub = new THREE.Group();
  const hubBase = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.06, 64).rotateX(Math.PI / 2), gold);
  hubBase.position.z = 0.08;
  const hubCap = new THREE.Mesh(new THREE.SphereGeometry(0.07, 32, 16), gold);
  hubCap.position.z = 0.11;
  hub.add(hubBase, hubCap);
  hub.traverse((part) => {
    part.castShadow = true;
  });
  spinner.add(hub);

  const pegs = new THREE.Group();
  spinner.add(pegs);
  const pegGeometry = new THREE.CylinderGeometry(0.016, 0.016, 0.07, 16).rotateX(Math.PI / 2);

  // One peg on each slice boundary. Slice i starts at canvas angle i*arc, which is
  // -i*arc on the disc (the canvas y axis points down).
  function setPegs(count) {
    pegs.clear();
    if (count < 2 || count > MAX_PEGS) {
      return;
    }
    const arc = (Math.PI * 2) / count;
    for (let i = 0; i < count; i += 1) {
      const peg = new THREE.Mesh(pegGeometry, gold);
      peg.position.set(Math.cos(-i * arc) * 0.935, Math.sin(-i * arc) * 0.935, 0.09);
      peg.castShadow = true;
      pegs.add(peg);
    }
  }

  // Pointer sits on the rim at a clock position and points at the centre.
  const pointerMaterial = new THREE.MeshStandardMaterial({ color: 0x8f2b18, metalness: 0.35, roughness: 0.35 });
  const pointer = new THREE.Group();
  const pointerTip = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.24, 48), pointerMaterial);
  const pointerBall = new THREE.Mesh(new THREE.SphereGeometry(0.06, 32, 16), gold);
  pointerBall.position.y = 0.13;
  pointer.add(pointerTip, pointerBall);
  pointer.traverse((part) => {
    part.castShadow = true;
  });
  tilted.add(pointer);

  function setPointer(clockHour, color) {
    const angle = ((clockHour % 12) * 30 * Math.PI) / 180; // clockwise from the top
    pointer.position.set(Math.sin(angle) * 1.1, Math.cos(angle) * 1.1, 0.14);
    pointer.rotation.z = Math.PI - angle; // cone tip (its +y) faces the centre
    pointerMaterial.color.set(color);
    // The tilt squashes the wheel vertically, so a pointer at the side needs more room.
    camera.position.z = 5.2 + 0.6 * Math.abs(Math.sin(angle));
  }

  function setFace(nameCount) {
    texture.needsUpdate = true;
    setPegs(nameCount);
  }

  function resize(size) {
    renderer.setSize(size, size, false);
  }

  // `rotation` is the 2D canvas angle (clockwise); the disc turns the other way in 3D maths.
  function render(rotation) {
    spinner.rotation.z = -rotation;
    renderer.render(scene, camera);
  }

  return { setFace, setPointer, resize, render };
}

window.createWheel3D = createWheel3D;
window.dispatchEvent(new Event("wheel3d-ready"));
