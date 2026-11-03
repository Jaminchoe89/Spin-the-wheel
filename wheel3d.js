// 3D wheel for the display screen. The wheel face (names, colours, image) is the
// same 2D drawing as before, used as a texture on a lit, slightly tilted disc.
// display.js keeps the flat wheel if this module fails to load or WebGL is missing.

import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const TILT = -0.22; // top of the wheel leans away from the audience
const MAX_PEGS = 600;
const PEG_RADIUS = 0.935;
const PIVOT_RADIUS = 1.1;
const FLAPPER_LENGTH = 0.21; // pivot to tip; the tip reaches in past the pegs

// Flapper behaviour: a peg pushes the tip aside, then it springs back once the peg slips past.
// With many names the pegs are closer together, so both shrink with the slice angle.
const CONTACT_HALF_ANGLE = 0.05; // radians either side of the pointer where a peg touches the tip
const MAX_DEFLECTION = 0.55;
const FULL_SIZE_ARC = 0.12; // slices at least this wide get full size pegs and swing
const SPRING_STIFFNESS = 320;
const SPRING_DAMPING = 13;

// Close-up at the end of a spin: how many names fill the screen height, and where to look.
const ZOOM_VISIBLE_NAMES = 13;
const ZOOM_FOCUS_RADIUS = 0.75;
const ZOOM_HALF_WIDTH = 0.31; // keeps the names and the pointer at the rim both in shot
const FRAME_HALF_EXTENT = 1.15; // wheel plus bezel, in wheel units

function createWheel3D({ canvas, faceCanvas }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.VSMShadowMap;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;

  // A longer lens flattens perspective so the wheel reads as an object, not a fisheye.
  const camera = new THREE.PerspectiveCamera(22, 1, 0.05, 50);

  const keyLight = new THREE.DirectionalLight(0xffffff, 1.5);
  keyLight.position.set(-1.5, 2.6, 5);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  Object.assign(keyLight.shadow.camera, { left: -2, right: 2, top: 2, bottom: -2, near: 1, far: 12 });
  keyLight.shadow.radius = 10;
  keyLight.shadow.blurSamples = 20;
  keyLight.shadow.bias = -0.0002;
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.35);
  fillLight.position.set(2, -1, 3);
  scene.add(keyLight, fillLight, new THREE.AmbientLight(0xffffff, 0.12));

  // Everything that tilts together; `spinner` is the part that turns.
  const tilted = new THREE.Group();
  tilted.rotation.x = TILT;
  scene.add(tilted);
  const spinner = new THREE.Group();
  tilted.add(spinner);

  const graphite = new THREE.MeshPhysicalMaterial({
    color: 0x1d1d1f,
    metalness: 0.5,
    roughness: 0.38,
    clearcoat: 0.6,
    clearcoatRoughness: 0.25,
  });
  const aluminium = new THREE.MeshStandardMaterial({ color: 0xd2d3d6, metalness: 1, roughness: 0.32 });

  const shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.ShadowMaterial({ opacity: 0.18 }));
  shadowCatcher.position.z = -0.4;
  shadowCatcher.receiveShadow = true;
  tilted.add(shadowCatcher);

  // Face: a disc whose UVs match the 2D drawing, so it looks identical head on.
  const texture = new THREE.CanvasTexture(faceCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const face = new THREE.Mesh(
    new THREE.CircleGeometry(0.985, 180),
    // Matte with low env response, so slice colours stay true to the chosen palette.
    new THREE.MeshStandardMaterial({ map: texture, roughness: 0.7, metalness: 0, envMapIntensity: 0.35 })
  );
  face.position.z = 0.051;
  face.receiveShadow = true;
  spinner.add(face);

  const body = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.1, 180).rotateX(Math.PI / 2), graphite);
  body.castShadow = true;
  spinner.add(body);

  // Bezel: a lathed profile, flat on top with rounded edges.
  const bezelProfile = [
    [0.975, 0.05],
    [0.978, 0.07],
    [0.988, 0.082],
    [1.0, 0.086],
    [1.03, 0.084],
    [1.042, 0.072],
    [1.047, 0.05],
    [1.047, -0.05],
  ].map(([radius, height]) => new THREE.Vector2(radius, height));
  const bezel = new THREE.Mesh(new THREE.LatheGeometry(bezelProfile, 200).rotateX(Math.PI / 2), graphite);
  bezel.castShadow = true;
  bezel.receiveShadow = true;
  spinner.add(bezel);

  const hub = new THREE.Group();
  const hubBase = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.05, 96).rotateX(Math.PI / 2), graphite);
  hubBase.position.z = 0.075;
  const hubRing = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.007, 16, 96), aluminium);
  hubRing.position.z = 0.1;
  const hubCap = new THREE.Mesh(new THREE.SphereGeometry(0.07, 48, 24), aluminium);
  hubCap.scale.z = 0.35;
  hubCap.position.z = 0.1;
  hub.add(hubBase, hubRing, hubCap);
  hub.traverse((part) => {
    part.castShadow = true;
  });
  spinner.add(hub);

  // One peg on each slice boundary. Slice i starts at canvas angle i*arc, which is
  // -i*arc on the disc (the canvas y axis points down).
  const pegs = new THREE.InstancedMesh(
    new THREE.CapsuleGeometry(0.017, 0.05, 6, 16).rotateX(Math.PI / 2),
    aluminium,
    MAX_PEGS
  );
  pegs.castShadow = true;
  pegs.count = 0;
  spinner.add(pegs);
  let pegCount = 0;

  // One peg on each slice boundary, shrinking when slices get narrow.
  function setPegs(count) {
    pegCount = count >= 2 && count <= MAX_PEGS ? count : 0;
    pegs.count = pegCount;
    if (pegCount === 0) {
      return;
    }
    const arc = (Math.PI * 2) / pegCount;
    const scale = Math.min(1, Math.max(0.35, arc / FULL_SIZE_ARC));
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < pegCount; i += 1) {
      matrix.makeScale(scale, scale, 1);
      matrix.setPosition(Math.cos(-i * arc) * PEG_RADIUS, Math.sin(-i * arc) * PEG_RADIUS, 0.09);
      pegs.setMatrixAt(i, matrix);
    }
    pegs.instanceMatrix.needsUpdate = true;
  }

  // Flapper: a bevelled teardrop blade hanging from a pivot just outside the rim.
  // In its own frame the pivot is the origin and the tip points down (-y).
  function flapperShape() {
    const headRadius = 0.05;
    const shape = new THREE.Shape();
    shape.moveTo(0, -FLAPPER_LENGTH);
    shape.bezierCurveTo(0.014, -FLAPPER_LENGTH * 0.55, headRadius, -headRadius * 0.9, headRadius, 0);
    shape.absarc(0, 0, headRadius, 0, Math.PI, false);
    shape.bezierCurveTo(-headRadius, -headRadius * 0.9, -0.014, -FLAPPER_LENGTH * 0.55, 0, -FLAPPER_LENGTH);
    return shape;
  }

  const flapperMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x8f2b18,
    metalness: 0,
    roughness: 0.5,
    clearcoat: 0.2,
    clearcoatRoughness: 0.4,
    envMapIntensity: 0.35, // enough sheen to read as enamel without washing the colour out
  });
  const flapperBlade = new THREE.Mesh(
    new THREE.ExtrudeGeometry(flapperShape(), {
      depth: 0.022,
      bevelEnabled: true,
      bevelThickness: 0.007,
      bevelSize: 0.007,
      bevelSegments: 6,
      curveSegments: 48,
    }),
    flapperMaterial
  );
  flapperBlade.position.z = 0.072; // same height as the pegs so they meet
  flapperBlade.castShadow = true;

  const pivotPin = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.03, 32).rotateX(Math.PI / 2), aluminium);
  pivotPin.position.z = 0.115;
  pivotPin.castShadow = true;

  const flapper = new THREE.Group(); // swings about the pivot
  flapper.add(flapperBlade, pivotPin);
  const mount = new THREE.Group(); // sits on the rim at the pointer's clock position
  mount.add(flapper);
  tilted.add(mount);

  let pointerAngle = -Math.PI / 2; // canvas convention, same as display.js
  let pointerClockAngle = 0; // clockwise from the top
  let nameCount = 0;
  let faceWidth = faceCanvas.width;
  let deflection = 0;
  let deflectionVelocity = 0;
  let lastFrameAt = performance.now();

  function setPointer(clockHour, color) {
    const angle = ((clockHour % 12) * 30 * Math.PI) / 180; // clockwise from the top
    pointerAngle = -Math.PI / 2 + angle;
    mount.position.set(Math.sin(angle) * PIVOT_RADIUS, Math.cos(angle) * PIVOT_RADIUS, 0);
    mount.rotation.z = -angle; // the blade's -y now points at the centre
    pointerClockAngle = angle;
    flapperMaterial.color.set(color);
  }

  // Far enough back to fit the wheel and pointer on screen in both directions.
  function homeDistance() {
    const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const halfWidth = halfHeight * camera.aspect;
    const extentX = FRAME_HALF_EXTENT + 0.25 * Math.abs(Math.sin(pointerClockAngle));
    const extentY = FRAME_HALF_EXTENT + 0.25 * Math.abs(Math.cos(pointerClockAngle));
    return Math.max(extentX / halfWidth, extentY / halfHeight);
  }

  // Close enough that about ZOOM_VISIBLE_NAMES slices fill the screen height, but never so
  // close that the pointer drops out of shot. After the roll, screen width runs along the radius.
  function zoomDistance() {
    const arc = (Math.PI * 2) / Math.max(nameCount, 1);
    const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const forNames = ((ZOOM_VISIBLE_NAMES / 2) * arc * ZOOM_FOCUS_RADIUS) / halfHeight;
    const forPointer = ZOOM_HALF_WIDTH / (halfHeight * camera.aspect);
    return THREE.MathUtils.clamp(Math.max(forNames, forPointer), 0.45, homeDistance() * 0.6);
  }

  const homeLook = new THREE.Vector3();
  const tiltedNormal = new THREE.Vector3();
  const focus = new THREE.Vector3();
  const zoomPosition = new THREE.Vector3();
  const look = new THREE.Vector3();

  // zoom 0 shows the whole wheel; zoom 1 is a close-up beside the pointer, rolled so the
  // slices run across the screen and names read left to right as they pass.
  function placeCamera(zoom) {
    const eased = zoom * zoom * (3 - 2 * zoom);
    tilted.updateMatrixWorld();
    const radialX = Math.sin(pointerClockAngle);
    const radialY = Math.cos(pointerClockAngle);
    focus.set(radialX * ZOOM_FOCUS_RADIUS, radialY * ZOOM_FOCUS_RADIUS, 0.06).applyMatrix4(tilted.matrixWorld);
    tiltedNormal.set(0, 0, 1).applyQuaternion(tilted.quaternion);
    zoomPosition.copy(focus).addScaledVector(tiltedNormal, zoomDistance());

    camera.position.set(0, 0, homeDistance()).lerp(zoomPosition, eased);
    look.copy(homeLook).lerp(focus, eased);
    const roll = (Math.PI / 2 - pointerClockAngle) * eased;
    camera.up.set(-Math.sin(roll), Math.cos(roll), 0).applyQuaternion(tilted.quaternion);
    camera.lookAt(look);
  }

  // Pegs travel clockwise on screen. The nearest peg's offset from the pointer decides
  // whether it is pushing the blade; otherwise the blade springs back to rest.
  function updateFlapper(rotation, dt) {
    let contact = null;
    if (pegCount > 0) {
      const arc = (Math.PI * 2) / pegCount;
      const size = Math.min(1, arc / FULL_SIZE_ARC);
      const halfAngle = Math.min(CONTACT_HALF_ANGLE, arc * 0.4);
      const offset = (((rotation - pointerAngle) % arc) + arc) % arc;
      const delta = offset <= arc / 2 ? offset : offset - arc;
      if (Math.abs(delta) <= halfAngle) {
        contact = ((delta + halfAngle) / (2 * halfAngle)) * MAX_DEFLECTION * Math.max(size, 0.3);
      }
    }

    if (contact !== null && contact >= deflection) {
      deflection = contact;
      deflectionVelocity = 0;
    } else {
      const steps = Math.ceil(dt / 0.004); // small steps keep the spring stable
      const step = dt / steps;
      for (let i = 0; i < steps; i += 1) {
        deflectionVelocity += (-SPRING_STIFFNESS * deflection - SPRING_DAMPING * deflectionVelocity) * step;
        deflection += deflectionVelocity * step;
      }
    }
    flapper.rotation.z = deflection;
  }

  function setFace(count) {
    nameCount = count;
    // The face canvas grows for long name lists; a texture can't change size in place.
    if (faceCanvas.width !== faceWidth) {
      faceWidth = faceCanvas.width;
      texture.dispose();
    }
    texture.needsUpdate = true;
    setPegs(count);
  }

  function resize(width, height) {
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
  }

  // `rotation` is the 2D canvas angle (clockwise); the disc turns the other way in 3D maths.
  function render(rotation, zoom = 0) {
    const now = performance.now();
    const dt = Math.min((now - lastFrameAt) / 1000, 0.05);
    lastFrameAt = now;
    spinner.rotation.z = -rotation;
    updateFlapper(rotation, dt);
    placeCamera(zoom);
    renderer.render(scene, camera);
  }

  return { setFace, setPointer, resize, render, canZoom: true };
}

window.createWheel3D = createWheel3D;
window.dispatchEvent(new Event("wheel3d-ready"));
