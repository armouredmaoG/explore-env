import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { BokehPass } from "three/addons/postprocessing/BokehPass.js";
import { FilmPass } from "three/addons/postprocessing/FilmPass.js";
import { SMAAPass } from "three/addons/postprocessing/SMAAPass.js";
import { AfterimagePass } from "three/addons/postprocessing/AfterimagePass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { OutlinePass } from "three/addons/postprocessing/OutlinePass.js";
import Lenis from "lenis";
import GUI from "lil-gui";
import gsap from "gsap";

/* ============================================================
   Cartier-style scroll experience.
   Scroll drives the camera along a Catmull-Rom path; the camera
   auto-faces the nearest pedestal ring as it passes each one.
   ============================================================ */

const canvas = document.getElementById("scene");
const sizes = { width: window.innerWidth, height: window.innerHeight };

const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

/* ----- Renderer ----- */
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(isMobile ? 1.0 : Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

/* ----- Scene + atmosphere ----- */
const scene = new THREE.Scene();
scene.background = new THREE.Color("#d9d6cd");
// scene.fog = new THREE.FogExp2("#d9d6cd", 0.0325);

/* ----- Camera ----- */
const camera = new THREE.PerspectiveCamera(
  55,
  sizes.width / sizes.height,
  0.1,
  220,
);

/* ----- Pedestal positions (single source of truth) ----- */
const stops = [
  { x: -4, z: 9 },
  { x: 4, z: -14 },
  { x: -4, z: -26 },
  { x: 4, z: -39 },
  { x: -3, z: -50 },
];

/* ----- Camera path ----- */
// Straight line down the corridor.
const cameraPath = new THREE.LineCurve3(
  new THREE.Vector3(0, 2.5, 26),   // entry
  new THREE.Vector3(0, 2.5, -45),  // exit
);

/* ----- Pedestal-progress mapping -----
   For each pedestal, find the u (0..1) along the path where the camera
   is closest to it. The play loop uses these to blend the look-target
   between the two pedestals you're currently between. */
const RING_HEIGHT = 3.2;

/* ----- Environment ----- */
const world = new THREE.Group();
scene.add(world);

const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 150),
  new THREE.MeshStandardMaterial({
    color: "#b9b7ae",
    roughness: 0.45,
    metalness: 0.5,
  }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.z = -12;
world.add(floor);

// Pedestals with a rotating gold "watch" ring + a key spotlight each.
const rings = [];
const columns = [];
const spots = [];
const ringMaterial = new THREE.MeshStandardMaterial({
  color: "#caa45a",
  metalness: 1,
  roughness: 0.25,
  emissive: "#3a2a08",
  emissiveIntensity: 0.5,
});

for (const { x, z } of stops) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const column = new THREE.Mesh(
    new THREE.CylinderGeometry(0.8, 1, 2.4, 24),
    new THREE.MeshStandardMaterial({
      color: "#a9a79e",
      roughness: 0.6,
      metalness: 0.5,
      emissive: "#3a2a08",
      emissiveIntensity: 0.5,
    }),
  );
  column.position.y = 1.2;
  group.add(column);
  columns.push(column);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.72, 0.22, 28, 80),
    ringMaterial,
  );
  ring.position.y = RING_HEIGHT;
  group.add(ring);

  const spot = new THREE.SpotLight("#ffe9c0", 40, 14, Math.PI / 3, 0.1, 1.5);
  spot.position.set(0, 8, 0);
  spot.target = ring;
  group.add(spot, spot.target);

  world.add(group);
  rings.push(ring);
  spots.push(spot);
}

// Pillars lining the corridor.
for (let i = 0; i < 16; i++) {
  const z = 20 - i * 5;
  for (const side of [-6.5, 6.5]) {
    const pillar = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 10, 0.6),
      new THREE.MeshStandardMaterial({
        color: "#908f87",
        roughness: 0.7,
        metalness: 0.2,
      }),
    );
    pillar.position.set(side, 5, z);
    world.add(pillar);
  }
}

/* ----- Lights ----- */
const fill = new THREE.DirectionalLight("#fff3e0", 3);
fill.position.set(-5, 14, 4);
scene.add(fill);

/* ----- GUI ----- */
const gui = new GUI({ title: "Lighting" });

const spotHelpers = spots.map((s) => {
  const h = new THREE.SpotLightHelper(s);
  scene.add(h);
  return h;
});
const fillHelper = new THREE.DirectionalLightHelper(fill, 2, "#ff0066");
scene.add(fillHelper);

const spotParams = {
  x: 0,
  y: 8,
  z: 0,
  intensity: 40,
  angle: Math.PI / 3,
  penumbra: 0.1,
  decay: 1.5,
  distance: 14,
  color: "#ffe9c0",
};

const updateSpots = () => {
  spots.forEach((s) => {
    s.position.set(spotParams.x, spotParams.y, spotParams.z);
    s.intensity = spotParams.intensity;
    s.angle = spotParams.angle;
    s.penumbra = spotParams.penumbra;
    s.decay = spotParams.decay;
    s.distance = spotParams.distance;
    s.color.set(spotParams.color);
  });
};

const spotFolder = gui.addFolder("Spotlights (all 5)");
spotFolder.add(spotParams, "x", -5, 5, 0.1).onChange(updateSpots).name("offset X");
spotFolder.add(spotParams, "y", 0, 20, 0.1).onChange(updateSpots).name("height (Y)");
spotFolder.add(spotParams, "z", -5, 5, 0.1).onChange(updateSpots).name("offset Z");
spotFolder.add(spotParams, "intensity", 0, 300, 1).onChange(updateSpots);
spotFolder.add(spotParams, "angle", 0.05, Math.PI / 2, 0.01).onChange(updateSpots);
spotFolder.add(spotParams, "penumbra", 0, 1, 0.01).onChange(updateSpots);
spotFolder.add(spotParams, "decay", 0, 3, 0.1).onChange(updateSpots);
spotFolder.add(spotParams, "distance", 0, 40, 0.5).onChange(updateSpots);
spotFolder.addColor(spotParams, "color").onChange(updateSpots);

const fillFolder = gui.addFolder("Directional Fill");
fillFolder.add(fill.position, "x", -20, 20, 0.1).name("position X");
fillFolder.add(fill.position, "y", -20, 30, 0.1).name("position Y");
fillFolder.add(fill.position, "z", -20, 20, 0.1).name("position Z");
fillFolder.add(fill, "intensity", 0, 10, 0.1);
fillFolder.addColor({ c: "#fff3e0" }, "c").onChange((v) => fill.color.set(v)).name("color");

const sceneFolder = gui.addFolder("Scene");
sceneFolder.add(renderer, "toneMappingExposure", 0, 3, 0.05).name("exposure");

const debugParams = { showHelpers: true };
gui.add(debugParams, "showHelpers").onChange((v) => {
  spotHelpers.forEach((h) => (h.visible = v));
  fillHelper.visible = v;
});

spotFolder.open();

/* ----- Post-processing ----- */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const gtao = new GTAOPass(scene, camera, sizes.width, sizes.height);
gtao.output = GTAOPass.OUTPUT.Default;
const bloom = new UnrealBloomPass(
  new THREE.Vector2(sizes.width, sizes.height),
  0.2,
  0.3,
  1,
);
const film = new FilmPass(0.3, false);
const bokeh = new BokehPass(scene, camera, {
  focus: 15,
  aperture: 0.0001,
  maxblur: 0.01,
});
const afterimage = new AfterimagePass(0.4);
const smaa = new SMAAPass(sizes.width, sizes.height);

if (!isMobile) {
  composer.addPass(afterimage);
  composer.addPass(gtao);
  composer.addPass(bokeh);
}
composer.addPass(bloom);
composer.addPass(film);

const outlinePass = new OutlinePass(
  new THREE.Vector2(sizes.width, sizes.height),
  scene,
  camera,
);
outlinePass.edgeStrength = 4;
outlinePass.edgeGlow = 0.7;
outlinePass.edgeThickness = 1.5;
outlinePass.pulsePeriod = 2;
outlinePass.visibleEdgeColor.set("#ffffff");
outlinePass.hiddenEdgeColor.set("#444444");
composer.addPass(outlinePass);

if (!isMobile) {
  composer.addPass(smaa);
}
composer.addPass(new OutputPass());

const bloomFolder = gui.addFolder("Bloom");
bloomFolder.add(bloom, "strength", 0, 3, 0.05);
bloomFolder.add(bloom, "radius", 0, 2, 0.05);
bloomFolder.add(bloom, "threshold", 0, 1, 0.01);

/* ----- Scroll ----- */
const lenis = new Lenis();
let targetProgress = 0;
let progress = 0;
lenis.on("scroll", (e) => {
  targetProgress = e.progress;
});

/* ----- Click-to-pedestal camera (first pedestal demo) ----- */
let isAnimating = false;
let savedProgress = 0;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let activePedestalIndex = -1;
let isHoveringActive = false;
const animLookTarget = new THREE.Vector3();

canvas.addEventListener("click", (e) => {
  pointer.x = (e.clientX / sizes.width) * 2 - 1;
  pointer.y = -(e.clientY / sizes.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);

  if (isAnimating) {
    returnToScroll();
    return;
  }

  if (activePedestalIndex !== -1) {
    const hits = raycaster.intersectObject(columns[activePedestalIndex].parent, true);
    if (hits.length > 0) {
      flyToPedestal(activePedestalIndex);
    }
  }
});


/* ----- Clone materials for all pedestals to manage opacity independently ----- */
for (let i = 0; i < stops.length; i++) {
  columns[i].material = columns[i].material.clone();
  rings[i].material = rings[i].material.clone();
  columns[i].material.transparent = true;
  rings[i].material.transparent = true;
  columns[i].material.opacity = 1.0;
  rings[i].material.opacity = 1.0;
}

// Clear initial selectedObjects since activePedestalIndex will handle it dynamically
outlinePass.selectedObjects = [];

/* ----- Hover outline (pointer + outline shader) ----- */
canvas.addEventListener("pointermove", (e) => {
  if (isAnimating) {
    outlinePass.selectedObjects = [];
    canvas.style.cursor = "default";
    isHoveringActive = false;
    return;
  }
  pointer.x = (e.clientX / sizes.width) * 2 - 1;
  pointer.y = -(e.clientY / sizes.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  if (activePedestalIndex !== -1) {
    const hits = raycaster.intersectObject(columns[activePedestalIndex].parent, true);
    if (hits.length > 0) {
      // Stop pulsating and set full opacity on hover
      outlinePass.pulsePeriod = 0;
      columns[activePedestalIndex].material.opacity = 1.0;
      rings[activePedestalIndex].material.opacity = 1.0;
      canvas.style.cursor = "pointer";
      isHoveringActive = true;
      outlinePass.selectedObjects = [columns[activePedestalIndex].parent];
    } else {
      // Resume pulsating and restore default opacity when not hovered
      outlinePass.pulsePeriod = 2;
      columns[activePedestalIndex].material.opacity = 0.99;
      rings[activePedestalIndex].material.opacity = 0.99;
      canvas.style.cursor = "default";
      isHoveringActive = false;
      outlinePass.selectedObjects = [columns[activePedestalIndex].parent];
    }
  } else {
    canvas.style.cursor = "default";
    isHoveringActive = false;
    outlinePass.selectedObjects = [];
  }
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && isAnimating) returnToScroll();
});

function flyToPedestal(index) {
  const stop = stops[index];
  isAnimating = true;
  savedProgress = progress;

  // Clear outline and set opacity to 1.0 during fly-to focus
  outlinePass.selectedObjects = [];
  for (let i = 0; i < stops.length; i++) {
    columns[i].material.opacity = 1.0;
    rings[i].material.opacity = 1.0;
  }

  // Snapshot current lookAt so GSAP can lerp from it
  animLookTarget.copy(lookTarget);

  // Camera destination: slightly in front & above the pedestal
  const dest = { x: stop.x + 2, y: 3.5, z: stop.z + 3 };

  gsap.to(camera.position, {
    x: dest.x, y: dest.y, z: dest.z,
    duration: 0.9,
    ease: "power3.inOut",
  });

  gsap.to(animLookTarget, {
    x: stop.x, y: RING_HEIGHT, z: stop.z,
    duration: 0.9,
    ease: "power3.inOut",
  });
}

function returnToScroll() {
  const p = THREE.MathUtils.clamp(savedProgress, 0, 1);
  const scrollPos = new THREE.Vector3();
  cameraPath.getPointAt(p, scrollPos);

  gsap.to(camera.position, {
    x: scrollPos.x, y: scrollPos.y, z: scrollPos.z,
    duration: 0.8,
    ease: "power2.inOut",
    onComplete: () => {
      progress = savedProgress;
      targetProgress = savedProgress;
      isAnimating = false;
    },
  });

  // Pre-compute the glance-adjusted lookTarget to match exactly what
  // the scroll-driven frame loop will produce at scrollPos — avoids
  // the last-frame snap when isAnimating flips to false.
  const fwd = new THREE.Vector3().copy(scrollPos).add(forwardDir);
  let totalInf = 0;
  let maxInf = 0;
  let bx = 0;
  let bz = 0;
  for (const stop of stops) {
    const dx = stop.x - scrollPos.x;
    const dz = stop.z - scrollPos.z;
    const inf = Math.exp(-(dx * dx + dz * dz) / GLANCE_RANGE_SQ);
    bx += stop.x * inf;
    bz += stop.z * inf;
    totalInf += inf;
    if (inf > maxInf) maxInf = inf;
  }
  let returnLook;
  if (totalInf > 0.001) {
    const pt = new THREE.Vector3(bx / totalInf, RING_HEIGHT, bz / totalInf);
    returnLook = new THREE.Vector3().lerpVectors(fwd, pt, maxInf * GLANCE_AMOUNT);
  } else {
    returnLook = fwd;
  }

  gsap.to(animLookTarget, {
    x: returnLook.x, y: returnLook.y, z: returnLook.z,
    duration: 0.8,
    ease: "power2.inOut",
  });
}

/* ----- Resize ----- */
window.addEventListener("resize", () => {
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;
  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();
  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(isMobile ? 1.0 : Math.min(window.devicePixelRatio, 2));
  composer.setSize(sizes.width, sizes.height);
});

/* ----- Render loop ----- */
const timer = new THREE.Timer();
const lookTarget = new THREE.Vector3();
const forwardLook = new THREE.Vector3();
const pedestalTarget = new THREE.Vector3();

// Forward direction along the (straight) path. Looking at
// camera.position + forwardDir always faces the travel direction.
const forwardDir = new THREE.Vector3()
  .subVectors(cameraPath.v2, cameraPath.v1)
  .normalize();

// "Glance" toward pedestals as the camera passes them.
//   GLANCE_AMOUNT: 0 = no glance, 0.18 = subtle head-turn, 1 = full lookAt.
//   GLANCE_RANGE: distance (world units) at which a pedestal's pull drops
//     to ~37%. Larger = glances start earlier and last longer.
const GLANCE_AMOUNT = 0.06;
const GLANCE_RANGE = 5;
const GLANCE_RANGE_SQ = GLANCE_RANGE * GLANCE_RANGE;

function frame(time) {
  timer.update(time);
  lenis.raf(time);

  if (!isAnimating) {
    progress += (targetProgress - progress) * 0.06;
  }
  const p = THREE.MathUtils.clamp(progress, 0, 1);

  if (!isAnimating) {
    cameraPath.getPointAt(p, camera.position);
    forwardLook.copy(camera.position).add(forwardDir);

    // Weighted-by-distance blend across all pedestals.
    let totalInf = 0;
    let maxInf = 0;
    let bx = 0;
    let bz = 0;
    let closestIndex = -1;
    let minPedDist = Infinity;

    for (let i = 0; i < stops.length; i++) {
      const stop = stops[i];
      const dx = stop.x - camera.position.x;
      const dz = stop.z - camera.position.z;
      const inf = Math.exp(-(dx * dx + dz * dz) / GLANCE_RANGE_SQ);
      bx += stop.x * inf;
      bz += stop.z * inf;
      totalInf += inf;
      if (inf > maxInf) maxInf = inf;

      // Only consider pedestals in front of the camera
      if (camera.position.z > stop.z - 1) {
        const pedPos = new THREE.Vector3(stop.x, RING_HEIGHT, stop.z);
        const dist = camera.position.distanceTo(pedPos);
        if (dist < minPedDist) {
          minPedDist = dist;
          closestIndex = i;
        }
      }
    }

    // Determine active pedestal and update Bokeh focus distance dynamically
    if (closestIndex !== -1 && minPedDist < 25) {
      activePedestalIndex = closestIndex;
      if (!isMobile) bokeh.uniforms['focus'].value = minPedDist;
    } else {
      activePedestalIndex = -1;
      if (!isMobile) bokeh.uniforms['focus'].value = 15;
    }

    if (totalInf > 0.001) {
      pedestalTarget.set(bx / totalInf, RING_HEIGHT, bz / totalInf);
      lookTarget.lerpVectors(forwardLook, pedestalTarget, maxInf * GLANCE_AMOUNT);
    } else {
      lookTarget.copy(forwardLook);
    }
    camera.lookAt(lookTarget);

    // Handle outline default selection and opacities for active vs inactive pedestals
    if (activePedestalIndex !== -1) {
      if (!isHoveringActive) {
        outlinePass.selectedObjects = [columns[activePedestalIndex].parent];
        outlinePass.pulsePeriod = 2;
        columns[activePedestalIndex].material.opacity = 0.99;
        rings[activePedestalIndex].material.opacity = 0.99;
      }
    } else {
      outlinePass.selectedObjects = [];
    }

    // Enforce solid opacity for inactive pedestals
    for (let i = 0; i < stops.length; i++) {
      if (i !== activePedestalIndex) {
        columns[i].material.opacity = 1.0;
        rings[i].material.opacity = 1.0;
      }
    }
  } else {
    camera.lookAt(animLookTarget);
  }

  const t = timer.getElapsed();
  rings.forEach((ring, i) => {
    ring.rotation.y = t * 0.4 + i;
    ring.rotation.x = Math.sin(t * 0.5 + i) * 0.2;
  });

  // Project click-to-view label above the active pedestal
  if (clickLabelEl) {
    if (!isAnimating && activePedestalIndex !== -1) {
      labelPos.set(stops[activePedestalIndex].x, RING_HEIGHT + 1.2, stops[activePedestalIndex].z);
      const dist = camera.position.distanceTo(labelPos);
      labelPos.project(camera);

      // Only show when in front of camera, reasonably close, and not yet passed
      if (labelPos.z <= 1 && dist < 25 && camera.position.z > stops[activePedestalIndex].z - 1) {
        const x = (labelPos.x * 0.5 + 0.5) * sizes.width;
        const y = (labelPos.y * -0.5 + 0.5) * sizes.height;
        clickLabelEl.style.display = "block";
        clickLabelEl.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
      } else {
        clickLabelEl.style.display = "none";
      }
    } else {
      clickLabelEl.style.display = "none";
    }
  }

  if (debugParams.showHelpers) {
    spotHelpers.forEach((h) => h.update());
    fillHelper.update();
  }

  composer.render();
  requestAnimationFrame(frame);
}
const labelPos = new THREE.Vector3();
const clickLabelEl = document.getElementById("click-label");
requestAnimationFrame(frame);

/* ----- Hide the loader once the first frame has rendered ----- */
requestAnimationFrame(() => {
  document.getElementById("loader").classList.add("hidden");
});
