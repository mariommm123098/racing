import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/500.css';
import './fonts.css';
import './style.css';

const canvas = document.querySelector('#world');
const ui = {
  intro: document.querySelector('#intro'),
  start: document.querySelector('#startButton'),
  hud: document.querySelector('#hud'),
  distance: document.querySelector('#distance'),
  speed: document.querySelector('#speed'),
  progressText: document.querySelector('#progressText'),
  progressBar: document.querySelector('#progressBar'),
  chapter: document.querySelector('#chapter'),
  chapterNumber: document.querySelector('#chapterNumber'),
  chapterGlyph: document.querySelector('#chapterGlyph'),
  chapterName: document.querySelector('#chapterName'),
  seedNotice: document.querySelector('#seedNotice'),
  seedColor: document.querySelector('#seedColor'),
  sound: document.querySelector('#soundToggle'),
  ending: document.querySelector('#ending'),
  restart: document.querySelector('#restartButton'),
  pause: document.querySelector('#pauseLabel'),
  flash: document.querySelector('#flash'),
  touchLeft: document.querySelector('#touchLeft'),
  touchRight: document.querySelector('#touchRight'),
};

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

const PALETTE = {
  paper: new THREE.Color('#ffffff'),
  sky: new THREE.Color('#80bad7'),
  fogWarm: new THREE.Color('#ead6bd'),
  grass: new THREE.Color('#72a66c'),
  grassLight: new THREE.Color('#a6c982'),
  road: new THREE.Color('#ad8f7f'),
  roadMark: new THREE.Color('#f0d8aa'),
  orange: new THREE.Color('#e37a43'),
  cream: new THREE.Color('#fff0d5'),
  bark: new THREE.Color('#79533e'),
  pine: new THREE.Color('#4f8769'),
  mountain: new THREE.Color('#8176a3'),
  cloud: new THREE.Color('#fff8ea'),
  rose: new THREE.Color('#dc7d87'),
  lavender: new THREE.Color('#8f75ba'),
  blue: new THREE.Color('#5595ba'),
  gold: new THREE.Color('#e7b548'),
  ink: new THREE.Color('#000000'),
};

const SEED_PALETTE = [
  { name: 'AZURE', color: '#6f9fc2' },
  { name: 'VIOLET', color: '#9a82ad' },
  { name: 'EMBER', color: '#c66c66' },
  { name: 'SUN', color: '#d9b45f' },
  { name: 'AMBER', color: '#d89055' },
];

const CHAPTERS = [
  { at: 0, roman: 'CHAPTER I', glyph: '线', name: 'SKETCH' },
  { at: 0.24, roman: 'CHAPTER II', glyph: '墨', name: 'INK' },
  { at: 0.52, roman: 'CHAPTER III', glyph: '彩', name: 'BLOOM' },
  { at: 0.80, roman: 'CHAPTER IV', glyph: '晨', name: 'AWAKEN' },
];

const state = {
  started: false,
  paused: false,
  ended: false,
  soundOn: true,
  speed: 0,
  lateralVelocity: 0,
  distance: 0,
  progress: 0,
  collected: 0,
  chapter: -1,
  endingTimer: 0,
  gateSpawned: false,
  gateCrossed: false,
  gateZ: 0,
  gateReveal: 0,
  cameraTransition: 0,
  inkStage: -1,
  elapsed: 0,
  shake: 0,
  seedNoticeTimer: 0,
  keys: { left: false, right: false, accelerate: false, brake: false },
};

// Renderer and post-processing ------------------------------------------------

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.22;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = PALETTE.paper.clone();
scene.fog = new THREE.Fog(PALETTE.paper.clone(), 90, 400);

const camera = new THREE.PerspectiveCamera(56, window.innerWidth / window.innerHeight, 0.1, 12000);
camera.position.set(0, 4.6, 11);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.06,
  0.48,
  0.92,
);
composer.addPass(bloom);

// Lighting --------------------------------------------------------------------

const hemiLight = new THREE.HemisphereLight('#ffffff', '#bdbdbd', 2.65);
scene.add(hemiLight);

const sunLight = new THREE.DirectionalLight('#ffffff', 1.85);
sunLight.position.set(-28, 45, 26);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(1024, 1024);
sunLight.shadow.camera.left = -35;
sunLight.shadow.camera.right = 35;
sunLight.shadow.camera.top = 40;
sunLight.shadow.camera.bottom = -20;
sunLight.shadow.camera.near = 1;
sunLight.shadow.camera.far = 130;
sunLight.shadow.bias = -0.0005;
scene.add(sunLight);

// Watercolor reveal shader ----------------------------------------------------

const MAX_RIPPLES = 16;
const rippleUniforms = Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, 0, 0));
const revealMaterials = [];

const revealVertexShader = /* glsl */`
  varying vec3 vWorld;
  varying float vViewDepth;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vec4 mvPosition = viewMatrix * world;
    vViewDepth = -mvPosition.z;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const revealFragmentShader = /* glsl */`
  precision highp float;

  uniform float uTime;
  uniform float uGlobal;
  uniform vec3 uMono;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uRoad;
  uniform vec4 uSeeds[${MAX_RIPPLES}];

  varying vec3 vWorld;
  varying float vViewDepth;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
      value += amp * noise(p);
      p = p * 2.07 + vec2(17.1, 9.2);
      amp *= 0.5;
    }
    return value;
  }

  float inkSplatter(vec2 point, float scale, float cutoff) {
    vec2 grid = point * scale;
    vec2 cell = floor(grid);
    vec2 local = fract(grid) - 0.5;
    float chance = hash(cell + vec2(19.7, 4.3));
    vec2 center = vec2(
      hash(cell + vec2(2.1, 17.4)),
      hash(cell + vec2(31.8, 8.6))
    ) - 0.5;
    center *= 0.72;
    float radius = mix(0.035, 0.16, hash(cell + vec2(7.7, 27.2)));
    float dot = 1.0 - smoothstep(radius, radius + 0.035, length(local - center));
    return dot * step(cutoff, chance);
  }

  float revealField(vec2 point) {
    float revealed = uGlobal;
    float paper = fbm(point * 0.045) * 0.22 + noise(point * 0.16) * 0.08;
    for (int i = 0; i < ${MAX_RIPPLES}; i++) {
      vec4 seed = uSeeds[i];
      if (seed.w > 0.5) {
        float radius = seed.z * (0.82 + paper);
        float d = length(point - seed.xy);
        float wash = 1.0 - smoothstep(radius - 7.0, radius + 5.0, d);
        float pigment = smoothstep(0.06, 0.30, noise(point * 0.21 + float(i) * 4.7));
        revealed = max(revealed, wash * (0.88 + pigment * 0.12));
      }
    }
    return clamp(revealed, 0.0, 1.0);
  }

  void main() {
    vec2 p = vWorld.xz;
    float reveal = revealField(p);
    float broadNoise = fbm(p * 0.055);
    float fibers = noise(p * vec2(0.55, 0.16));
    vec3 living = mix(uColorA, uColorB, broadNoise * 0.76 + fibers * 0.10);

    // The opening is built from white paper, solid black pigment and a narrow
    // grey feathered edge. Ink islands, dry-brush strokes and scattered drops
    // disappear naturally wherever the color-reveal field reaches them.
    float washCloud = fbm(p * 0.030 + vec2(7.4, 3.1));
    float washBody = smoothstep(0.47, 0.67, washCloud);
    float washCore = smoothstep(0.66, 0.76, washCloud);
    float washFeather = clamp(washBody - washCore, 0.0, 1.0);
    float inkRim = 1.0 - smoothstep(0.025, 0.13, abs(noise(p * 0.082 + 4.2) - 0.52));
    float dryBrush = smoothstep(0.57, 0.79, noise(p * vec2(0.36, 0.78) + 11.7));
    float paperFiber = noise(p * vec2(1.7, 0.23));
    float largeDrops = inkSplatter(p + vec2(13.0, 5.0), 0.11, 0.79);
    float fineDrops = inkSplatter(p + vec2(-8.0, 21.0), 0.34, 0.91);

    float blackInk = washCore;
    blackInk = max(blackInk, inkRim * washBody * 0.82);
    blackInk = max(blackInk, dryBrush * washBody * 0.72);
    blackInk = max(blackInk, largeDrops);
    blackInk = max(blackInk, fineDrops * 0.94);
    float greyInk = washFeather * 0.52 + (1.0 - paperFiber) * washBody * 0.08;
    if (uRoad > 0.5) {
      float roadStroke = smoothstep(0.60, 0.76, noise(p * vec2(0.72, 0.055)));
      blackInk = max(blackInk, roadStroke * 0.76);
      greyInk = max(greyInk, smoothstep(0.42, 0.64, noise(p * vec2(0.15, 0.68))) * 0.24);
    }
    float inkAmount = clamp(max(blackInk, greyInk), 0.0, 1.0);
    vec3 paperWhite = mix(vec3(1.0), uMono, 0.08);
    vec3 inkPaper = mix(paperWhite, vec3(0.0), inkAmount);
    inkPaper -= (paperFiber - 0.5) * 0.018;
    inkPaper = clamp(inkPaper, 0.0, 1.0);

    if (uRoad > 0.5) {
      float wear = smoothstep(0.32, 0.72, noise(p * vec2(0.16, 0.7)));
      living *= 0.94 + wear * 0.07;
    }
    vec3 color = mix(inkPaper, living, reveal);
    vec3 graphicInk = smoothstep(vec3(0.045), vec3(0.955), color);
    color = mix(graphicInk, color, reveal);
    color += (hash(gl_FragCoord.xy + uTime) - 0.5) * mix(0.006, 0.010, reveal);
    float fogFactor = smoothstep(uFogNear, uFogFar, vViewDepth);
    color = mix(color, uFogColor, fogFactor);
    gl_FragColor = vec4(color, 1.0);
  }
`;

function createRevealMaterial(mono, colorA, colorB, road = false) {
  const material = new THREE.ShaderMaterial({
    vertexShader: revealVertexShader,
    fragmentShader: revealFragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uGlobal: { value: 0 },
      uMono: { value: new THREE.Color(mono) },
      uColorA: { value: new THREE.Color(colorA) },
      uColorB: { value: new THREE.Color(colorB) },
      uFogColor: { value: PALETTE.paper.clone() },
      uFogNear: { value: scene.fog.near },
      uFogFar: { value: scene.fog.far },
      uRoad: { value: road ? 1 : 0 },
      uSeeds: { value: rippleUniforms.map((v) => v.clone()) },
    },
    side: THREE.DoubleSide,
  });
  revealMaterials.push(material);
  return material;
}

const terrain = new THREE.Mesh(
  new THREE.PlaneGeometry(270, 3800, 1, 1),
  createRevealMaterial('#ffffff', '#70a96c', '#d7ba69'),
);
terrain.rotation.x = -Math.PI / 2;
terrain.position.set(0, -0.07, -1760);
terrain.receiveShadow = true;
scene.add(terrain);

const road = new THREE.Mesh(
  new THREE.PlaneGeometry(13.8, 3600, 1, 1),
  createRevealMaterial('#ffffff', '#a48172', '#d8aa78', true),
);
road.rotation.x = -Math.PI / 2;
road.position.set(0, 0, -1700);
road.receiveShadow = true;
scene.add(road);

// World building --------------------------------------------------------------

const scenery = [];
const animatedScenery = [];
const obstacles = [];
const seeds = [];
const particles = [];
const ripples = [];

function createSketchEdgeGeometry(geometry, threshold) {
  const edgeGeometry = new THREE.EdgesGeometry(geometry, threshold);
  geometry.computeBoundingSphere();
  const radius = geometry.boundingSphere?.radius ?? 1;
  const jitter = clamp(radius * 0.0045, 0.004, 0.038);
  const positions = edgeGeometry.attributes.position;
  const colors = [];
  const darkInk = new THREE.Color('#000000');
  const featherInk = new THREE.Color('#303030');

  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const seed = Math.sin(i * 91.17 + x * 17.31 + y * 47.7 + z * 29.13) * 43758.5453;
    const random = seed - Math.floor(seed);
    const seedB = Math.sin((i + 13) * 57.3 + x * 31.1 - z * 19.7) * 15731.743;
    const randomB = seedB - Math.floor(seedB);
    positions.setXYZ(
      i,
      x + (random - 0.5) * jitter,
      y + (randomB - 0.5) * jitter,
      z + (random * 0.62 - randomB * 0.38) * jitter,
    );
    const feather = smoothstep(0.72, 1, random) * 0.62;
    const inkColor = darkInk.clone().lerp(featherInk, feather);
    colors.push(inkColor.r, inkColor.g, inkColor.b);
  }

  positions.needsUpdate = true;
  edgeGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return edgeGeometry;
}

function outlinedMesh(geometry, targetColor, options = {}) {
  const target = new THREE.Color(targetColor);
  const mono = new THREE.Color(options.inkFill ?? '#ffffff');
  const material = new THREE.MeshStandardMaterial({
    color: mono,
    roughness: options.roughness ?? 0.86,
    metalness: options.metalness ?? 0,
    flatShading: true,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    emissive: options.emissive ? new THREE.Color(options.emissive) : new THREE.Color('#000000'),
    emissiveIntensity: options.emissiveIntensity ?? 0,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;

  const requestedInkOpacity = options.edgeOpacity ?? 0.84;
  const inkOpacity = clamp(0.38 + requestedInkOpacity * 0.68, 0.56, 0.98);
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: '#000000',
    vertexColors: true,
    transparent: true,
    opacity: inkOpacity,
    depthWrite: false,
  });
  edgeMaterial.userData.inkOpacity = inkOpacity;
  const edges = new THREE.LineSegments(createSketchEdgeGeometry(geometry, options.edgeThreshold ?? 18), edgeMaterial);
  mesh.add(edges);
  return {
    mesh,
    part: { material, target, mono },
    edge: edgeMaterial,
  };
}

function registerScenery(root, x, z, parts, edges, extra = {}) {
  root.position.x = x;
  root.position.z = z;
  scene.add(root);
  const item = { root, x, z, parts, edges, reveal: 0, ...extra };
  scenery.push(item);
  return item;
}

function createTree(x, z, scale = 1, tone = 0) {
  const group = new THREE.Group();
  const parts = [];
  const edges = [];

  const trunk = outlinedMesh(new THREE.CylinderGeometry(0.22, 0.34, 2.5, 5), PALETTE.bark);
  trunk.mesh.position.y = 1.25;
  group.add(trunk.mesh);
  parts.push(trunk.part);
  edges.push(trunk.edge);

  const foliageColor = tone > 0.5 ? PALETTE.grassLight : PALETTE.pine;
  const crown1 = outlinedMesh(new THREE.ConeGeometry(1.35, 2.9, 6), foliageColor);
  crown1.mesh.position.y = 3.15;
  crown1.mesh.rotation.y = (x + z) * 0.013;
  group.add(crown1.mesh);
  parts.push(crown1.part);
  edges.push(crown1.edge);

  const crown2 = outlinedMesh(new THREE.ConeGeometry(0.98, 2.3, 6), foliageColor.clone().offsetHSL(0.01, -0.02, 0.035));
  crown2.mesh.position.y = 4.35;
  crown2.mesh.rotation.y = 0.38;
  group.add(crown2.mesh);
  parts.push(crown2.part);
  edges.push(crown2.edge);

  group.scale.setScalar(scale);
  registerScenery(group, x, z, parts, edges, { sway: Math.random() * Math.PI * 2 });
}

function createDeciduousTree(x, z, scale = 1, tone = 0) {
  const group = new THREE.Group();
  const parts = [];
  const edges = [];
  const foliageColors = [PALETTE.grassLight, PALETTE.gold, PALETTE.rose, PALETTE.blue];
  const foliageColor = foliageColors[tone % foliageColors.length];

  const trunk = outlinedMesh(new THREE.CylinderGeometry(0.25, 0.42, 2.9, 6), PALETTE.bark);
  trunk.mesh.position.y = 1.45;
  group.add(trunk.mesh);
  parts.push(trunk.part);
  edges.push(trunk.edge);

  [[-0.62, 3.45, 0.08, 1.18], [0.52, 3.6, 0, 1.28], [0, 4.48, 0.03, 1.48]].forEach(([px, py, pz, s], index) => {
    const crown = outlinedMesh(
      new THREE.IcosahedronGeometry(s, 1),
      foliageColor.clone().offsetHSL(index * 0.01, -0.03, index * 0.025),
      { edgeOpacity: 0.52, edgeThreshold: 12 },
    );
    crown.mesh.position.set(px, py, pz);
    crown.mesh.scale.set(1, 0.88, 0.92);
    group.add(crown.mesh);
    parts.push(crown.part);
    edges.push(crown.edge);
  });

  group.scale.setScalar(scale);
  registerScenery(group, x, z, parts, edges, { sway: Math.random() * Math.PI * 2 });
}

function createMountain(x, z, radius, height, tone = 0) {
  const group = new THREE.Group();
  const mountainColors = [PALETTE.mountain, PALETTE.lavender, PALETTE.blue, PALETTE.rose, PALETTE.pine];
  const target = mountainColors[tone % mountainColors.length].clone().offsetHSL(0, -0.06, 0.035);
  const mountain = outlinedMesh(new THREE.ConeGeometry(radius, height, 7), target, {
    castShadow: false,
    receiveShadow: true,
    edgeOpacity: 0.55,
    edgeThreshold: 6,
  });
  mountain.mesh.position.y = height / 2 - 0.25;
  mountain.mesh.rotation.y = (x * z) % 1;
  group.add(mountain.mesh);
  registerScenery(group, x, z, [mountain.part], [mountain.edge], { mountain: true });
}

function createCloud(x, y, z, scale) {
  const group = new THREE.Group();
  const parts = [];
  const edges = [];
  const shapes = [
    [-1.25, 0, 0, 1.1],
    [0, 0.25, 0, 1.45],
    [1.35, -0.05, 0, 0.95],
  ];
  shapes.forEach(([px, py, pz, s]) => {
    const cloud = outlinedMesh(new THREE.IcosahedronGeometry(1, 1), PALETTE.cloud, {
      castShadow: false,
      receiveShadow: false,
      edgeOpacity: 0.32,
    });
    cloud.mesh.position.set(px, py, pz);
    cloud.mesh.scale.set(s * 1.4, s * 0.68, s * 0.72);
    group.add(cloud.mesh);
    parts.push(cloud.part);
    edges.push(cloud.edge);
  });
  group.position.y = y;
  group.scale.setScalar(scale);
  registerScenery(group, x, z, parts, edges, { cloud: true, drift: Math.random() * 10 });
  animatedScenery.push(group);
}

function createGrassPatch(x, z, scale = 1) {
  const group = new THREE.Group();
  const vertices = [];
  for (let i = 0; i < 7; i += 1) {
    const px = (i - 3) * 0.16 + (Math.random() - 0.5) * 0.08;
    const h = 0.42 + Math.random() * 0.55;
    vertices.push(px, 0, 0, px + (Math.random() - 0.5) * 0.22, h, 0);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  const material = new THREE.LineBasicMaterial({ color: '#000000', transparent: true, opacity: 0.90 });
  const grass = new THREE.LineSegments(geometry, material);
  grass.scale.setScalar(scale);
  group.add(grass);
  registerScenery(group, x, z, [], [], {
    lineMaterial: material,
    lineTarget: PALETTE.grass.clone(),
  });
}

function createShrub(x, z, scale = 1, tone = 0) {
  const group = new THREE.Group();
  const parts = [];
  const edges = [];
  const colors = [PALETTE.grassLight, PALETTE.pine, PALETTE.lavender];
  const target = colors[tone % colors.length];

  [[-0.42, 0.48, 0.72], [0.35, 0.42, 0.62], [0, 0.72, 0.82]].forEach(([px, py, s], index) => {
    const crown = outlinedMesh(
      new THREE.IcosahedronGeometry(s, 0),
      target.clone().offsetHSL(index * 0.008, -0.02, index * 0.025),
      { edgeOpacity: 0.58, edgeThreshold: 10 },
    );
    crown.mesh.position.set(px, py, index === 1 ? 0.12 : 0);
    group.add(crown.mesh);
    parts.push(crown.part);
    edges.push(crown.edge);
  });

  group.scale.setScalar(scale);
  registerScenery(group, x, z, parts, edges, { sway: Math.random() * Math.PI * 2 });
}

function createFlowerPatch(x, z, scale = 1, tone = 0) {
  const group = new THREE.Group();
  const parts = [];
  const edges = [];
  const flowerColors = [PALETTE.rose, PALETTE.gold, PALETTE.lavender, PALETTE.blue];

  for (let i = 0; i < 3; i += 1) {
    const flowerX = (i - 1) * 0.34;
    const flowerZ = ((i * 7) % 3 - 1) * 0.18;
    const height = 0.42 + i * 0.13;
    const stem = outlinedMesh(new THREE.CylinderGeometry(0.025, 0.04, height, 5), PALETTE.grass, {
      edgeOpacity: 0.42,
      castShadow: false,
    });
    stem.mesh.position.set(flowerX, height * 0.5, flowerZ);
    group.add(stem.mesh);
    parts.push(stem.part);
    edges.push(stem.edge);

    const bloomPart = outlinedMesh(
      new THREE.OctahedronGeometry(0.13 + i * 0.012, 0),
      flowerColors[(tone + i) % flowerColors.length],
      { edgeOpacity: 0.42, emissive: flowerColors[(tone + i) % flowerColors.length], emissiveIntensity: 0.08, castShadow: false },
    );
    bloomPart.mesh.position.set(flowerX, height + 0.08, flowerZ);
    bloomPart.mesh.rotation.y = i * 0.8;
    group.add(bloomPart.mesh);
    parts.push(bloomPart.part);
    edges.push(bloomPart.edge);
  }

  group.scale.setScalar(scale);
  registerScenery(group, x, z, parts, edges, { flowers: true, sway: Math.random() * Math.PI * 2 });
}

function createWaysideRuin(x, z, scale = 1, tone = 0) {
  const group = new THREE.Group();
  const parts = [];
  const edges = [];
  const stoneColor = tone % 2 === 0 ? '#b5a99c' : '#aaa2b4';
  const pieces = [
    [-1.05, 1.7, 0, 0.55, 3.4, 0.62, 0],
    [1.05, 1.3, 0.12, 0.55, 2.6, 0.62, 0.06],
    [-0.12, 3.25, 0.05, 2.65, 0.5, 0.66, -0.08],
  ];

  pieces.forEach(([px, py, pz, sx, sy, sz, rz], index) => {
    const stone = outlinedMesh(new THREE.BoxGeometry(sx, sy, sz), new THREE.Color(stoneColor).offsetHSL(0, 0, index * 0.025), {
      edgeOpacity: 0.62,
      edgeThreshold: 8,
    });
    stone.mesh.position.set(px, py, pz);
    stone.mesh.rotation.z = rz;
    group.add(stone.mesh);
    parts.push(stone.part);
    edges.push(stone.edge);
  });

  group.scale.setScalar(scale);
  registerScenery(group, x, z, parts, edges, { ruin: true });
}

function createPond(x, z, radius = 5, tone = 0) {
  const group = new THREE.Group();
  const waterColors = [PALETTE.blue, new THREE.Color('#67aaa2'), new THREE.Color('#7898c8')];
  const water = outlinedMesh(new THREE.CylinderGeometry(radius, radius * 1.06, 0.07, 24), waterColors[tone % waterColors.length], {
    roughness: 0.24,
    metalness: 0.08,
    transparent: true,
    opacity: 0.82,
    castShadow: false,
    receiveShadow: true,
    edgeOpacity: 0.38,
  });
  water.mesh.position.y = -0.015;
  water.mesh.scale.z = 0.58;
  group.add(water.mesh);
  registerScenery(group, x, z, [water.part], [water.edge], { pond: true });
}

function createRoadLantern(x, z, tone = 0) {
  const group = new THREE.Group();
  const parts = [];
  const edges = [];
  const glowColors = [PALETTE.gold, PALETTE.rose, PALETTE.blue];
  const glowColor = glowColors[tone % glowColors.length];

  const stem = outlinedMesh(new THREE.CylinderGeometry(0.055, 0.09, 1.55, 6), PALETTE.bark, {
    edgeOpacity: 0.48,
    castShadow: false,
  });
  stem.mesh.position.y = 0.78;
  group.add(stem.mesh);
  parts.push(stem.part);
  edges.push(stem.edge);

  const lamp = outlinedMesh(new THREE.OctahedronGeometry(0.24, 0), glowColor, {
    emissive: glowColor,
    emissiveIntensity: 0.32,
    roughness: 0.32,
    edgeOpacity: 0.36,
    castShadow: false,
  });
  lamp.mesh.position.y = 1.72;
  group.add(lamp.mesh);
  parts.push(lamp.part);
  edges.push(lamp.edge);

  registerScenery(group, x, z, parts, edges, { lantern: true });
}

// Distant ranges build the ink-drawn horizon.
for (let i = 0; i < 32; i += 1) {
  const side = i % 2 === 0 ? -1 : 1;
  const z = -70 - i * 104;
  createMountain(side * (36 + (i % 4) * 11), z, 18 + (i % 3) * 5, 24 + (i % 5) * 4, i % 5);
}

for (let i = 0; i < 118; i += 1) {
  const side = i % 2 === 0 ? -1 : 1;
  const z = -28 - i * 28.5;
  const x = side * (10.5 + ((i * 17) % 20));
  const treeScale = 0.72 + ((i * 13) % 9) * 0.085;
  if (i % 4 === 1 || i % 9 === 0) createDeciduousTree(x, z, treeScale, i % 4);
  else createTree(x, z, treeScale, i % 4 === 0 ? 1 : 0);
}

for (let i = 0; i < 145; i += 1) {
  const side = i % 2 === 0 ? -1 : 1;
  const z = -16 - i * 22.5;
  const x = side * (8.2 + ((i * 11) % 10));
  createGrassPatch(x, z, 0.85 + (i % 5) * 0.12);
}

for (let i = 0; i < 20; i += 1) {
  const side = i % 2 === 0 ? -1 : 1;
  createCloud(side * (13 + (i % 4) * 7), 17 + (i % 3) * 2.5, -90 - i * 165, 1.1 + (i % 3) * 0.28);
}

for (let i = 0; i < 24; i += 1) {
  const side = i % 2 === 0 ? -1 : 1;
  createShrub(side * (12.5 + ((i * 7) % 15)), -58 - i * 132, 0.72 + (i % 4) * 0.11, i % 3);
}

for (let i = 0; i < 28; i += 1) {
  const side = i % 2 === 0 ? -1 : 1;
  createFlowerPatch(side * (8.1 + ((i * 5) % 8)), -42 - i * 112, 0.9 + (i % 3) * 0.13, i % 4);
}

for (let i = 0; i < 8; i += 1) {
  const side = i % 2 === 0 ? -1 : 1;
  createWaysideRuin(side * (17 + (i % 3) * 4), -210 - i * 410, 0.78 + (i % 3) * 0.11, i);
}

for (let i = 0; i < 10; i += 1) {
  const side = i % 2 === 0 ? -1 : 1;
  createPond(side * (19 + (i % 3) * 5), -280 - i * 315, 4.6 + (i % 3) * 1.25, i);
}

for (let i = 0; i < 18; i += 1) {
  const side = i % 2 === 0 ? -1 : 1;
  createRoadLantern(side * 7.75, -135 - i * 172, i);
}

// Road markings are outlined paper strips at first, then warm ivory.
for (let z = -35; z > -3520; z -= 24) {
  const marker = outlinedMesh(new THREE.BoxGeometry(0.12, 0.035, 8.5), PALETTE.roadMark, {
    castShadow: false,
    receiveShadow: false,
    edgeOpacity: 0.28,
  });
  marker.mesh.position.y = 0.035;
  const group = new THREE.Group();
  group.add(marker.mesh);
  registerScenery(group, 0, z, [marker.part], [marker.edge]);
}

const roadEdgeMaterial = new THREE.LineBasicMaterial({ color: '#000000', transparent: true, opacity: 0.92 });
[-6.9, 6.9].forEach((x) => {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(x, 0.06, 25),
    new THREE.Vector3(x, 0.06, -3540),
  ]);
  scene.add(new THREE.Line(geometry, roadEdgeMaterial));
});

// The threshold gate only materializes once the world is fully restored.
const thresholdGate = new THREE.Group();
thresholdGate.visible = false;
scene.add(thresholdGate);

const gateStoneMaterial = new THREE.MeshStandardMaterial({
  color: '#d8cbbb',
  roughness: 0.78,
  metalness: 0.02,
  flatShading: true,
  transparent: true,
  opacity: 1,
});
const gateGlowMaterial = new THREE.MeshStandardMaterial({
  color: '#f1c58c',
  emissive: '#e49a62',
  emissiveIntensity: 1.6,
  roughness: 0.3,
  toneMapped: false,
  transparent: true,
  opacity: 1,
});
const gateVeilMaterial = new THREE.MeshBasicMaterial({
  color: '#f4d8bd',
  transparent: true,
  opacity: 0,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
  toneMapped: false,
});

[-5.55, 5.55].forEach((x, index) => {
  const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.82, 8.7, 0.92), gateStoneMaterial);
  pillar.position.set(x, 4.35, 0);
  pillar.rotation.z = index === 0 ? -0.035 : 0.035;
  pillar.castShadow = true;
  thresholdGate.add(pillar);

  const foot = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.55, 1.5), gateStoneMaterial);
  foot.position.set(x, 0.28, 0);
  foot.castShadow = true;
  thresholdGate.add(foot);
});

const portalRing = new THREE.Mesh(new THREE.TorusGeometry(5.55, 0.28, 7, 40), gateGlowMaterial);
portalRing.position.y = 5.4;
portalRing.castShadow = true;
thresholdGate.add(portalRing);

const gateCrown = new THREE.Mesh(new THREE.OctahedronGeometry(0.48, 0), gateGlowMaterial);
gateCrown.position.set(0, 10.95, 0);
gateCrown.rotation.z = Math.PI * 0.25;
thresholdGate.add(gateCrown);

const portalVeil = new THREE.Mesh(new THREE.CircleGeometry(5.16, 40), gateVeilMaterial);
portalVeil.position.set(0, 5.4, 0.08);
thresholdGate.add(portalVeil);

const gateLight = new THREE.PointLight('#ffd3a1', 0, 38, 1.8);
gateLight.position.set(0, 5.4, 2.5);
thresholdGate.add(gateLight);

// Color seeds -----------------------------------------------------------------

const seedGeometry = new THREE.OctahedronGeometry(0.72, 0);
const lanePattern = [0, 0, -3.1, 0, 3.35, 0, -1.8, 0, 2.2, 0, -3.5, 0];

for (let i = 0; i < 38; i += 1) {
  const palette = SEED_PALETTE[i % SEED_PALETTE.length];
  const material = new THREE.MeshStandardMaterial({
    color: palette.color,
    emissive: palette.color,
    emissiveIntensity: 1.8,
    roughness: 0.28,
    metalness: 0.04,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(seedGeometry, material);
  const z = -70 - i * 67;
  const x = lanePattern[i % lanePattern.length];
  mesh.position.set(x, 1.05, z);
  mesh.rotation.set(0.2, i * 0.7, 0.4);
  mesh.castShadow = true;

  const haloMaterial = new THREE.MeshBasicMaterial({
    color: palette.color,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const halo = new THREE.Mesh(new THREE.SphereGeometry(1.35, 12, 8), haloMaterial);
  mesh.add(halo);
  scene.add(mesh);
  seeds.push({ mesh, x, z, palette, collected: false, baseY: 1.05, haloMaterial });
}

// Rocks become relevant as the camera approaches top-down play.
for (let i = 0; i < 24; i += 1) {
  const xChoices = [-4.2, -2.4, 2.3, 4.1];
  const x = xChoices[(i * 3) % xChoices.length];
  const z = -930 - i * 73;
  const rock = outlinedMesh(new THREE.DodecahedronGeometry(0.7 + (i % 3) * 0.14, 0), '#8f8278', {
    roughness: 1,
    edgeOpacity: 0.58,
  });
  rock.mesh.position.y = 0.68;
  rock.mesh.rotation.set(i * 0.21, i * 0.54, i * 0.1);
  const group = new THREE.Group();
  group.add(rock.mesh);
  const item = registerScenery(group, x, z, [rock.part], [rock.edge], { obstacle: true });
  group.visible = false;
  obstacles.push({ ...item, hit: false });
}

// Player car and original wanderer --------------------------------------------

const car = new THREE.Group();
car.position.set(0, 0.12, 0);
scene.add(car);

const carBodyMaterial = new THREE.MeshStandardMaterial({
  color: PALETTE.orange,
  roughness: 0.58,
  metalness: 0.03,
  flatShading: true,
});
const carCreamMaterial = new THREE.MeshStandardMaterial({
  color: PALETTE.cream,
  roughness: 0.72,
  flatShading: true,
});
const tireMaterial = new THREE.MeshStandardMaterial({ color: '#000000', roughness: 0.94 });

const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.56, 3.6), carBodyMaterial);
body.position.y = 0.78;
body.castShadow = true;
car.add(body);

const nose = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.36, 1.15), carCreamMaterial);
nose.position.set(0, 1.08, -1.05);
nose.castShadow = true;
car.add(nose);

const blueAccentMaterial = new THREE.MeshStandardMaterial({ color: '#7696a8', roughness: 0.5 });
const accent = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 2.85), blueAccentMaterial);
accent.position.set(0, 1.09, -0.15);
car.add(accent);

const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.22, 1.08), carCreamMaterial);
cabin.position.set(0, 1.16, 0.56);
cabin.castShadow = true;
car.add(cabin);

const wheelGeometry = new THREE.CylinderGeometry(0.43, 0.43, 0.26, 12);
[-0.99, 0.99].forEach((x) => {
  [-1.15, 1.12].forEach((z) => {
    const wheel = new THREE.Mesh(wheelGeometry, tireMaterial);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.55, z);
    wheel.castShadow = true;
    car.add(wheel);
  });
});

const headMaterial = new THREE.MeshStandardMaterial({ color: '#151619', roughness: 0.65 });
const glowMaterial = new THREE.MeshBasicMaterial({ color: '#fff4c7', toneMapped: false });
const robeMaterial = new THREE.MeshStandardMaterial({
  color: '#e6d3c1',
  roughness: 0.84,
  side: THREE.DoubleSide,
  flatShading: true,
});
const hairMaterial = new THREE.MeshStandardMaterial({
  color: '#f2ece2',
  roughness: 0.92,
  flatShading: true,
});
const furMaterial = new THREE.MeshStandardMaterial({
  color: '#eee5d8',
  roughness: 1,
  flatShading: true,
});
const capeMaterial = new THREE.MeshStandardMaterial({
  color: '#d98663',
  emissive: '#7d3828',
  emissiveIntensity: 0.16,
  roughness: 0.78,
  side: THREE.DoubleSide,
  flatShading: true,
});

const playerInkMaterials = [
  { material: carBodyMaterial, ink: new THREE.Color('#000000'), target: PALETTE.orange.clone() },
  { material: carCreamMaterial, ink: new THREE.Color('#ffffff'), target: PALETTE.cream.clone() },
  { material: blueAccentMaterial, ink: new THREE.Color('#000000'), target: new THREE.Color('#7696a8') },
  { material: headMaterial, ink: new THREE.Color('#000000'), target: new THREE.Color('#151619') },
  { material: robeMaterial, ink: new THREE.Color('#ffffff'), target: new THREE.Color('#e6d3c1') },
  { material: hairMaterial, ink: new THREE.Color('#ffffff'), target: new THREE.Color('#f2ece2') },
  { material: furMaterial, ink: new THREE.Color('#ffffff'), target: new THREE.Color('#eee5d8') },
  { material: capeMaterial, ink: new THREE.Color('#000000'), target: new THREE.Color('#d98663') },
];
playerInkMaterials.forEach(({ material, ink }) => material.color.copy(ink));
const capeEmissiveTarget = new THREE.Color('#7d3828');
const capeEmissiveInk = new THREE.Color('#000000');
capeMaterial.emissive.set('#000000');

const driver = new THREE.Group();
driver.position.set(0, 1.24, 0.48);
car.add(driver);

const torso = new THREE.Mesh(new THREE.ConeGeometry(0.52, 1.34, 7), robeMaterial);
torso.position.y = 0.42;
torso.rotation.z = Math.PI;
torso.castShadow = true;
driver.add(torso);

const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 9), headMaterial);
head.position.set(0, 1.14, -0.08);
head.scale.set(0.96, 1.08, 0.93);
driver.add(head);

const hood = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.095, 7, 14), robeMaterial);
hood.position.set(0, 1.08, -0.015);
hood.rotation.x = Math.PI / 2;
driver.add(hood);

const hairTufts = [
  [-0.28, 1.42, -0.02, -0.48, 0.08, 0.48],
  [-0.08, 1.50, -0.04, -0.16, 0.04, 0.56],
  [0.14, 1.48, -0.03, 0.22, -0.04, 0.52],
  [0.31, 1.37, -0.01, 0.5, -0.08, 0.44],
  [-0.38, 1.22, -0.01, -0.75, 0.08, 0.38],
  [0.39, 1.20, -0.01, 0.78, -0.04, 0.36],
];
hairTufts.forEach(([x, y, z, rz, rx, length], index) => {
  const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.14 + (index % 2) * 0.025, length, 5), hairMaterial);
  tuft.position.set(x, y, z);
  tuft.rotation.set(rx, index * 0.42, rz);
  tuft.castShadow = true;
  driver.add(tuft);
});

[-1, 1].forEach((side) => {
  const earFin = new THREE.Mesh(new THREE.ConeGeometry(0.105, 0.34, 4), capeMaterial);
  earFin.position.set(side * 0.43, 1.27, -0.02);
  earFin.rotation.z = side * -1.1;
  earFin.rotation.y = side * 0.18;
  driver.add(earFin);

  const shoulder = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 1), furMaterial);
  shoulder.position.set(side * 0.43, 0.72, 0.02);
  shoulder.scale.set(1.15, 0.82, 1.05);
  shoulder.castShadow = true;
  driver.add(shoulder);

  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 0.58, 6), robeMaterial);
  sleeve.position.set(side * 0.34, 0.64, -0.29);
  sleeve.rotation.x = Math.PI * 0.52;
  sleeve.rotation.z = side * -0.22;
  sleeve.castShadow = true;
  driver.add(sleeve);

  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.085, 7, 5), headMaterial);
  hand.position.set(side * 0.32, 0.64, -0.57);
  driver.add(hand);
});

[-0.12, 0.12].forEach((x) => {
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), glowMaterial);
  eye.position.set(x, 1.15, -0.32);
  eye.scale.set(1, 0.75, 0.5);
  driver.add(eye);
});

const capeShape = new THREE.Shape();
capeShape.moveTo(-0.5, 0);
capeShape.lineTo(0.5, 0);
capeShape.lineTo(0.92, 1.48);
capeShape.lineTo(0.28, 1.25);
capeShape.lineTo(0, 1.5);
capeShape.lineTo(-0.32, 1.22);
capeShape.lineTo(-0.92, 1.48);
capeShape.closePath();
const cape = new THREE.Mesh(new THREE.ShapeGeometry(capeShape), capeMaterial);
const CAPE_REST_X = Math.PI / 2 + 0.28;
cape.position.set(0, 0.72, 0.42);
cape.rotation.set(CAPE_REST_X, 0, 0);
cape.castShadow = true;
driver.add(cape);

const driverGlow = new THREE.PointLight('#f0a36f', 0, 5.5, 2);
driverGlow.position.set(0, 0.9, 0.35);
driver.add(driverGlow);

const carShadowMaterial = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.14, depthWrite: false });
const carShadow = new THREE.Mesh(new THREE.CircleGeometry(1.65, 24), carShadowMaterial);
carShadow.rotation.x = -Math.PI / 2;
carShadow.scale.set(0.72, 1.3, 1);
carShadow.position.y = 0.035;
car.add(carShadow);

const playerInkEdges = [];
const playerInkMeshes = [];
car.traverse((object) => {
  if (!object.isMesh || object === carShadow || object.material === glowMaterial) return;
  playerInkMeshes.push(object);
});
playerInkMeshes.forEach((object) => {
  const inkMaterial = new THREE.LineBasicMaterial({
    color: '#000000',
    vertexColors: true,
    transparent: true,
    opacity: 0.94,
    depthWrite: false,
  });
  const inkLines = new THREE.LineSegments(createSketchEdgeGeometry(object.geometry, 16), inkMaterial);
  object.add(inkLines);
  playerInkEdges.push(inkMaterial);
});

// Particle feedback -----------------------------------------------------------

function burstSeed(seed) {
  for (let i = 0; i < 16; i += 1) {
    const material = new THREE.MeshBasicMaterial({
      color: seed.palette.color,
      transparent: true,
      opacity: 0.9,
      toneMapped: false,
    });
    const particle = new THREE.Mesh(new THREE.OctahedronGeometry(0.08 + Math.random() * 0.1, 0), material);
    particle.position.copy(seed.mesh.position);
    particle.userData.velocity = new THREE.Vector3(
      (Math.random() - 0.5) * 4.8,
      1.2 + Math.random() * 3.6,
      (Math.random() - 0.5) * 4.8,
    );
    particle.userData.life = 1;
    scene.add(particle);
    particles.push(particle);
  }
}

function collectSeed(seed) {
  seed.collected = true;
  seed.mesh.visible = false;
  state.collected += 1;
  state.shake = Math.max(state.shake, 0.16);
  state.seedNoticeTimer = 1.45;

  ripples.push({
    x: seed.x,
    z: seed.z,
    radius: 2,
    maxRadius: 205 + state.progress * 55,
  });
  while (ripples.length > MAX_RIPPLES) ripples.shift();

  ui.seedColor.textContent = seed.palette.name;
  ui.seedNotice.style.setProperty('--seed-color', seed.palette.color);
  ui.seedNotice.classList.remove('show');
  void ui.seedNotice.offsetWidth;
  ui.seedNotice.classList.add('show');
  ui.flash.classList.add('on');
  window.setTimeout(() => ui.flash.classList.remove('on'), 70);

  burstSeed(seed);
  audio.playChime(seed.palette.color);
}

// Generative adaptive score ---------------------------------------------------

class AdaptiveAudio {
  constructor() {
    this.context = null;
    this.master = null;
    this.engine = null;
    this.engineGain = null;
    this.windGain = null;
    this.padGains = [];
    this.noteClock = 0;
    this.noteIndex = 0;
  }

  start() {
    if (this.context) {
      this.context.resume();
      return;
    }

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = 0.42;
    this.master.connect(this.context.destination);

    const compressor = this.context.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 12;
    compressor.ratio.value = 4;
    compressor.connect(this.master);
    this.bus = compressor;

    this.engine = this.context.createOscillator();
    this.engine.type = 'sawtooth';
    this.engine.frequency.value = 46;
    const engineFilter = this.context.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 150;
    this.engineGain = this.context.createGain();
    this.engineGain.gain.value = 0.012;
    this.engine.connect(engineFilter).connect(this.engineGain).connect(this.bus);
    this.engine.start();

    const noiseBuffer = this.context.createBuffer(1, this.context.sampleRate * 2, this.context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    const wind = this.context.createBufferSource();
    wind.buffer = noiseBuffer;
    wind.loop = true;
    const windFilter = this.context.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 480;
    this.windGain = this.context.createGain();
    this.windGain.gain.value = 0.012;
    wind.connect(windFilter).connect(this.windGain).connect(this.bus);
    wind.start();

    [130.81, 196.0, 261.63, 329.63].forEach((frequency, index) => {
      const oscillator = this.context.createOscillator();
      oscillator.type = index < 2 ? 'sine' : 'triangle';
      oscillator.frequency.value = frequency;
      oscillator.detune.value = index % 2 === 0 ? -5 : 6;
      const gain = this.context.createGain();
      gain.gain.value = 0;
      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 620 + index * 120;
      oscillator.connect(filter).connect(gain).connect(this.bus);
      oscillator.start();
      this.padGains.push(gain);
    });
  }

  setMuted(muted) {
    if (!this.context || !this.master) return;
    this.master.gain.setTargetAtTime(muted ? 0 : 0.42, this.context.currentTime, 0.12);
  }

  playTone(frequency, duration = 1.6, amount = 0.035) {
    if (!this.context || !state.soundOn) return;
    const now = this.context.currentTime;
    const osc = this.context.createOscillator();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    osc.type = 'triangle';
    osc.frequency.value = frequency;
    filter.type = 'lowpass';
    filter.frequency.value = 1200;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(amount, now + 0.035);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(filter).connect(gain).connect(this.bus);
    osc.start(now);
    osc.stop(now + duration + 0.05);
  }

  playChime() {
    const scale = [392, 440, 523.25, 659.25, 783.99];
    this.playTone(scale[state.collected % scale.length], 1.9, 0.065);
    this.playTone(scale[(state.collected + 2) % scale.length] * 0.5, 2.5, 0.035);
  }

  update(delta, progress, speed) {
    if (!this.context) return;
    const now = this.context.currentTime;
    this.engine.frequency.setTargetAtTime(39 + speed * 1.05, now, 0.08);
    this.engineGain.gain.setTargetAtTime(0.008 + speed * 0.00038, now, 0.12);
    this.windGain.gain.setTargetAtTime(0.008 + speed * 0.00042, now, 0.2);

    const padLevels = [
      smoothstep(0.10, 0.35, progress) * 0.025,
      smoothstep(0.25, 0.54, progress) * 0.020,
      smoothstep(0.46, 0.73, progress) * 0.014,
      smoothstep(0.70, 0.94, progress) * 0.010,
    ];
    this.padGains.forEach((gain, i) => gain.gain.setTargetAtTime(padLevels[i], now, 1.2));

    if (progress > 0.16) {
      this.noteClock -= delta;
      if (this.noteClock <= 0) {
        const melody = [261.63, 329.63, 392, 523.25, 440, 392, 329.63, 293.66];
        this.playTone(melody[this.noteIndex % melody.length], 1.7 + progress, 0.018 + progress * 0.018);
        if (progress > 0.62 && this.noteIndex % 2 === 0) {
          this.playTone(melody[(this.noteIndex + 2) % melody.length] * 0.5, 2.6, 0.014);
        }
        this.noteIndex += 1;
        this.noteClock = lerp(2.8, 1.42, progress);
      }
    }
  }
}

const audio = new AdaptiveAudio();

// Input -----------------------------------------------------------------------

const keyMap = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'accelerate',
  KeyW: 'accelerate',
  ArrowDown: 'brake',
  KeyS: 'brake',
};

window.addEventListener('keydown', (event) => {
  if (keyMap[event.code]) {
    state.keys[keyMap[event.code]] = true;
    event.preventDefault();
  }
  if (event.code === 'KeyP' && state.started && !state.ended && !event.repeat) togglePause();
});

window.addEventListener('keyup', (event) => {
  if (keyMap[event.code]) {
    state.keys[keyMap[event.code]] = false;
    event.preventDefault();
  }
});

function bindTouchButton(button, key) {
  const down = (event) => {
    event.preventDefault();
    state.keys[key] = true;
    button.classList.add('active');
  };
  const up = (event) => {
    event.preventDefault();
    state.keys[key] = false;
    button.classList.remove('active');
  };
  button.addEventListener('pointerdown', down);
  button.addEventListener('pointerup', up);
  button.addEventListener('pointercancel', up);
  button.addEventListener('pointerleave', up);
}

bindTouchButton(ui.touchLeft, 'left');
bindTouchButton(ui.touchRight, 'right');

function begin() {
  if (state.started) return;
  state.started = true;
  ui.intro.classList.add('hidden');
  ui.hud.classList.add('visible');
  ui.sound.classList.add('visible');
  audio.start();
  window.setTimeout(() => showChapter(0), 950);
}

function togglePause() {
  state.paused = !state.paused;
  ui.pause.classList.toggle('visible', state.paused);
  if (audio.context) {
    if (state.paused) audio.context.suspend();
    else audio.context.resume();
  }
}

ui.start.addEventListener('click', begin);
ui.restart.addEventListener('click', () => window.location.reload());
ui.sound.addEventListener('click', () => {
  state.soundOn = !state.soundOn;
  ui.sound.textContent = state.soundOn ? 'SOUND ON' : 'SOUND OFF';
  audio.setMuted(!state.soundOn);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && state.started && !state.paused && !state.ended) togglePause();
});

// Cinematic progression -------------------------------------------------------

function showChapter(index) {
  if (index === state.chapter || index < 0 || index >= CHAPTERS.length) return;
  state.chapter = index;
  const chapter = CHAPTERS[index];
  ui.chapterNumber.textContent = chapter.roman;
  ui.chapterGlyph.textContent = chapter.glyph;
  ui.chapterName.textContent = chapter.name;
  ui.chapter.classList.remove('show');
  void ui.chapter.offsetWidth;
  ui.chapter.classList.add('show');
}

function worldRevealAt(x, z) {
  const distantWash = smoothstep(0.04, 0.92, state.progress) * 0.32;
  const finalWash = smoothstep(0.70, 1, state.progress) * 0.68;
  let reveal = clamp(distantWash + finalWash, 0, 1);
  for (const ripple of ripples) {
    const distance = Math.hypot(x - ripple.x, z - ripple.z);
    reveal = Math.max(reveal, 1 - smoothstep(ripple.radius - 9, ripple.radius + 10, distance));
  }
  return clamp(reveal, 0, 1);
}

function updateWorldMaterials(delta) {
  ripples.forEach((ripple) => {
    ripple.radius = Math.min(ripple.maxRadius, ripple.radius + delta * (54 + state.progress * 24));
  });

  const globalReveal = clamp(
    smoothstep(0.04, 0.92, state.progress) * 0.32
      + smoothstep(0.70, 1, state.progress) * 0.68,
    0,
    1,
  );
  revealMaterials.forEach((material) => {
    material.uniforms.uTime.value = state.elapsed;
    material.uniforms.uGlobal.value = globalReveal;
    material.uniforms.uFogColor.value.copy(scene.fog.color);
    material.uniforms.uFogNear.value = scene.fog.near;
    material.uniforms.uFogFar.value = scene.fog.far;
    for (let i = 0; i < MAX_RIPPLES; i += 1) {
      const ripple = ripples[i];
      const uniform = material.uniforms.uSeeds.value[i];
      if (ripple) uniform.set(ripple.x, ripple.z, ripple.radius, 1);
      else uniform.set(0, 0, 0, 0);
    }
  });

  const clarityRadius = lerp(220, 1800, smoothstep(0.02, 1, state.progress));
  for (const item of scenery) {
    if (state.progress < 0.999 && Math.abs(item.z - car.position.z) > clarityRadius && !item.mountain && !item.cloud) continue;
    const targetReveal = worldRevealAt(item.x, item.z);
    item.reveal = lerp(item.reveal, targetReveal, 1 - Math.exp(-delta * 1.7));
    for (const part of item.parts) {
      part.material.color.copy(part.mono).lerp(part.target, item.reveal);
    }
    for (const edge of item.edges) edge.opacity = lerp(edge.userData.inkOpacity ?? 0.74, 0.08, item.reveal);
    if (item.lineMaterial) {
      item.lineMaterial.color.copy(PALETTE.ink).lerp(item.lineTarget, item.reveal);
      item.lineMaterial.opacity = lerp(0.90, 0.52, item.reveal);
    }
    if (item.sway !== undefined) {
      item.root.rotation.z = Math.sin(state.elapsed * 0.65 + item.sway) * 0.012;
    }
    if (item.cloud) {
      item.root.position.x = item.x + Math.sin(state.elapsed * 0.035 + item.drift) * 2.2;
    }
  }

  const playerReveal = smoothstep(0.01, 0.42, state.progress);
  for (const part of playerInkMaterials) {
    part.material.color.copy(part.ink).lerp(part.target, playerReveal);
  }
  capeMaterial.emissive.copy(capeEmissiveInk).lerp(capeEmissiveTarget, playerReveal);
  driverGlow.intensity = lerp(0, 0.34, playerReveal);
  for (const edge of playerInkEdges) edge.opacity = lerp(0.94, 0.08, playerReveal);

  roadEdgeMaterial.opacity = lerp(0.92, 0.16, smoothstep(0.25, 0.95, state.progress));
}

function updatePlayer(delta) {
  const targetSpeed = state.keys.brake ? 16 : state.keys.accelerate ? 45 : 31;
  const accelRate = state.keys.brake ? 3.6 : 1.45;
  state.speed = lerp(state.speed, targetSpeed, 1 - Math.exp(-delta * accelRate));

  const steer = (state.keys.right ? 1 : 0) - (state.keys.left ? 1 : 0);
  const topDownBlend = smoothstep(0, 1, state.cameraTransition);
  const lateralTarget = steer * lerp(8.7, 12.5, topDownBlend);
  state.lateralVelocity = lerp(state.lateralVelocity, lateralTarget, 1 - Math.exp(-delta * 6.5));

  car.position.x = clamp(car.position.x + state.lateralVelocity * delta, -5.35, 5.35);
  car.position.z -= state.speed * delta;
  car.rotation.y = lerp(car.rotation.y, -steer * lerp(0.16, 0.08, topDownBlend), 1 - Math.exp(-delta * 8));
  car.rotation.z = lerp(car.rotation.z, -steer * 0.055, 1 - Math.exp(-delta * 7));
  car.position.y = 0.12 + Math.sin(state.elapsed * state.speed * 0.24) * 0.017;

  cape.rotation.x = CAPE_REST_X + Math.sin(state.elapsed * 6.4) * 0.055 - state.speed * 0.0024;
  cape.rotation.z = Math.sin(state.elapsed * 3.2) * 0.035 - steer * 0.06;
  driver.rotation.z = lerp(driver.rotation.z, -steer * 0.055, 1 - Math.exp(-delta * 5));

  state.distance = Math.max(0, -car.position.z);
  const collectedProgress = state.collected * 0.041;
  const journeyGuarantee = smoothstep(2050, 2550, state.distance);
  const subtleJourney = Math.min(0.13, state.distance / 2550 * 0.13);
  state.progress = clamp(Math.max(collectedProgress + subtleJourney, journeyGuarantee), 0, 1);
}

function spawnThresholdGate() {
  if (state.gateSpawned) return;
  state.gateSpawned = true;
  state.gateZ = car.position.z - 52;
  state.gateReveal = 0;
  thresholdGate.position.set(0, 0, state.gateZ);
  thresholdGate.scale.setScalar(0.04);
  thresholdGate.visible = true;
  gateStoneMaterial.opacity = 0;
  gateGlowMaterial.opacity = 0;
  gateVeilMaterial.opacity = 0;
}

function updateThresholdGate(delta) {
  if (state.progress >= 0.999 && !state.gateSpawned) spawnThresholdGate();
  if (!state.gateSpawned) return;

  if (!state.gateCrossed) {
    state.gateReveal = lerp(state.gateReveal, 1, 1 - Math.exp(-delta * 2.6));
    const materialize = smoothstep(0, 1, state.gateReveal);
    thresholdGate.scale.setScalar(lerp(0.04, 1, materialize));
    gateStoneMaterial.opacity = materialize;
    gateGlowMaterial.opacity = materialize;
    gateVeilMaterial.opacity = (0.08 + Math.sin(state.elapsed * 2.6) * 0.025) * materialize;
    gateLight.intensity = materialize * (2.5 + Math.sin(state.elapsed * 2.2) * 0.35);
    portalRing.rotation.z += delta * 0.16;
    gateCrown.rotation.y += delta * 0.42;

    if (materialize > 0.78 && car.position.z <= state.gateZ - 1.8) {
      state.gateCrossed = true;
      state.cameraTransition = 0;
      state.endingTimer = 0;
      state.shake = Math.max(state.shake, 0.24);
      gateVeilMaterial.opacity = 0.72;
      ui.flash.classList.add('on');
      window.setTimeout(() => ui.flash.classList.remove('on'), 150);
      audio.playTone(523.25, 2.4, 0.065);
      audio.playTone(783.99, 3.1, 0.045);
    }
  } else {
    state.cameraTransition = clamp(state.cameraTransition + delta / 1.25, 0, 1);
    const distanceBehind = Math.max(0, state.gateZ - car.position.z);
    const fade = smoothstep(24, 125, distanceBehind);
    gateStoneMaterial.opacity = 1 - fade;
    gateGlowMaterial.opacity = 1 - fade;
    gateVeilMaterial.opacity = (0.22 + Math.sin(state.elapsed * 3.1) * 0.05) * (1 - fade);
    gateLight.intensity = (2.8 + Math.sin(state.elapsed * 2.4) * 0.4) * (1 - fade);
    portalRing.rotation.z += delta * 0.28;
    if (fade >= 0.999) thresholdGate.visible = false;
  }
}

const cameraPosition = new THREE.Vector3();
const cameraTarget = new THREE.Vector3();
const desiredCamera = new THREE.Vector3();
const desiredTarget = new THREE.Vector3();
const desiredCameraUp = new THREE.Vector3();

function updateCamera(delta) {
  const transition = smoothstep(0, 1, state.cameraTransition);
  const visibilityProgress = smoothstep(0.02, 1, state.progress);
  const chasePosition = new THREE.Vector3(car.position.x * 0.26, 4.65, car.position.z + 11.4);
  const overheadPosition = new THREE.Vector3(car.position.x * 0.12, 52, car.position.z + 4);
  desiredCamera.copy(chasePosition).lerp(overheadPosition, transition);

  const lookAhead = lerp(14, 28, visibilityProgress);
  const chaseTarget = new THREE.Vector3(car.position.x * 0.72, lerp(1.05, 1.45, visibilityProgress), car.position.z - lookAhead - state.speed * 0.07);
  const overheadTarget = new THREE.Vector3(car.position.x * 0.18, 0, car.position.z - 4);
  desiredTarget.copy(chaseTarget).lerp(overheadTarget, transition);

  if (!state.started) {
    desiredCamera.set(Math.sin(state.elapsed * 0.12) * 1.4, 4.4, 11.4);
    desiredTarget.set(0, 0.9, -5.8);
  }

  cameraPosition.lerp(desiredCamera, 1 - Math.exp(-delta * (state.started ? 3.2 : 1.4)));
  cameraTarget.lerp(desiredTarget, 1 - Math.exp(-delta * (state.started ? 4.1 : 1.8)));

  if (state.shake > 0.001) {
    cameraPosition.x += (Math.random() - 0.5) * state.shake;
    cameraPosition.y += (Math.random() - 0.5) * state.shake;
    state.shake *= Math.exp(-delta * 8);
  }

  camera.position.copy(cameraPosition);
  desiredCameraUp.set(0, lerp(1, 0.035, transition), lerp(0, -1, transition)).normalize();
  camera.up.lerp(desiredCameraUp, 1 - Math.exp(-delta * 2.8)).normalize();
  camera.lookAt(cameraTarget);
  const chaseFov = 55 + state.speed * 0.095 + visibilityProgress * 3.5;
  const targetFov = lerp(chaseFov, 34, transition);
  camera.fov = lerp(camera.fov, targetFov, 1 - Math.exp(-delta * 2.4));
  camera.updateProjectionMatrix();

  sunLight.position.set(car.position.x - 28, 45, car.position.z + 26);
  sunLight.target.position.copy(car.position);
  sunLight.target.updateMatrixWorld();
}

function updateCollectibles(delta) {
  for (const seed of seeds) {
    if (seed.collected) continue;
    seed.mesh.rotation.y += delta * 1.15;
    seed.mesh.rotation.x += delta * 0.38;
    seed.mesh.position.y = seed.baseY + Math.sin(state.elapsed * 2.1 + seed.z) * 0.18;
    seed.haloMaterial.opacity = 0.09 + Math.sin(state.elapsed * 2.6 + seed.z) * 0.025;

    if (Math.abs(seed.z - car.position.z) < 2.55 && Math.abs(seed.x - car.position.x) < 2.05) {
      collectSeed(seed);
    }
  }

  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const particle = particles[i];
    particle.userData.life -= delta * 0.72;
    particle.userData.velocity.y -= delta * 2.6;
    particle.position.addScaledVector(particle.userData.velocity, delta);
    particle.rotation.x += delta * 4;
    particle.rotation.y += delta * 3;
    particle.material.opacity = Math.max(0, particle.userData.life);
    particle.scale.setScalar(Math.max(0.01, particle.userData.life));
    if (particle.userData.life <= 0) {
      scene.remove(particle);
      particle.geometry.dispose();
      particle.material.dispose();
      particles.splice(i, 1);
    }
  }
}

function updateObstacles() {
  const active = state.progress > 0.48;
  for (const obstacle of obstacles) {
    obstacle.root.visible = active && obstacle.z < car.position.z - 8;
    if (!active || obstacle.hit) continue;
    if (Math.abs(obstacle.z - car.position.z) < 2.2 && Math.abs(obstacle.x - car.position.x) < 1.55) {
      obstacle.hit = true;
      state.speed *= 0.52;
      state.shake = 0.65;
      obstacle.root.rotation.z += (car.position.x > obstacle.x ? -1 : 1) * 0.9;
    }
  }
}

function updateAtmosphere() {
  const atmosphericProgress = smoothstep(0.04, 0.92, state.progress);
  const skyColor = PALETTE.paper.clone().lerp(PALETTE.sky, atmosphericProgress);
  scene.background.copy(skyColor);
  scene.fog.color.copy(skyColor).lerp(PALETTE.fogWarm, atmosphericProgress * 0.035);
  if (state.progress >= 0.999) {
    // Keep fog technically present for the reveal shader, but move it far
    // beyond the complete route so the restored world reads as infinite.
    scene.fog.near = 9000;
    scene.fog.far = 11000;
  } else {
    scene.fog.near = lerp(110, 720, atmosphericProgress);
    scene.fog.far = lerp(450, 1800, atmosphericProgress);
  }
  hemiLight.intensity = lerp(2.65, 3.2, atmosphericProgress);
  sunLight.intensity = lerp(1.85, 3.05, atmosphericProgress);
  sunLight.color.copy(new THREE.Color('#ffffff')).lerp(new THREE.Color('#ffe2b8'), atmosphericProgress * 0.78);
  bloom.strength = lerp(0.035, 0.30, atmosphericProgress);
  bloom.threshold = lerp(0.92, 0.76, atmosphericProgress);
  renderer.toneMappingExposure = lerp(1.22, 1.26, atmosphericProgress);
  const inkStage = 1 - smoothstep(0.02, 0.72, state.progress);
  if (Math.abs(inkStage - state.inkStage) > 0.004) {
    state.inkStage = inkStage;
    document.documentElement.style.setProperty('--ink-stage', inkStage.toFixed(3));
  }
}

function updateInterface(delta) {
  ui.distance.innerHTML = `${Math.floor(state.distance).toString().padStart(4, '0')} <i>m</i>`;
  ui.speed.innerHTML = `${Math.round(state.speed * 3.25).toString().padStart(3, '0')} <i>km/h</i>`;
  const percentage = Math.floor(state.progress * 100);
  ui.progressText.textContent = `${percentage.toString().padStart(2, '0')}%`;
  ui.progressBar.style.width = `${percentage}%`;

  for (let i = CHAPTERS.length - 1; i >= 0; i -= 1) {
    if (state.progress >= CHAPTERS[i].at && i > state.chapter) {
      showChapter(i);
      break;
    }
  }

  if (state.seedNoticeTimer > 0) {
    state.seedNoticeTimer -= delta;
    if (state.seedNoticeTimer <= 0) ui.seedNotice.classList.remove('show');
  }

  if (state.gateCrossed && state.cameraTransition >= 0.999 && !state.ended) {
    state.endingTimer += delta;
    if (state.endingTimer > 10.5) {
      state.ended = true;
      ui.ending.classList.add('visible');
      ui.hud.classList.remove('visible');
      ui.sound.classList.remove('visible');
    }
  }
}

// Loop ------------------------------------------------------------------------

const clock = new THREE.Clock();
cameraPosition.copy(camera.position);
cameraTarget.set(0, 1, -8);

function frame() {
  requestAnimationFrame(frame);
  const rawDelta = Math.min(clock.getDelta(), 0.10);
  const delta = state.paused ? 0 : rawDelta;
  state.elapsed += delta;

  if (state.started && !state.paused && !state.ended) {
    updatePlayer(delta);
    updateThresholdGate(delta);
    updateCollectibles(delta);
    updateObstacles();
    updateWorldMaterials(delta);
    updateAtmosphere();
    updateInterface(delta);
    audio.update(delta, state.progress, state.speed);
  } else if (!state.started) {
    car.position.y = 0.12 + Math.sin(state.elapsed * 1.6) * 0.014;
    cape.rotation.x = CAPE_REST_X + Math.sin(state.elapsed * 2.2) * 0.035;
    seeds.forEach((seed, i) => {
      seed.mesh.rotation.y += delta * 0.45;
      seed.mesh.position.y = seed.baseY + Math.sin(state.elapsed * 1.8 + i) * 0.14;
    });
    updateWorldMaterials(delta);
  }

  updateCamera(Math.max(delta, 0.001));
  composer.render();
}

frame();

function onResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, width < 720 ? 1.4 : 1.75));
  renderer.setSize(width, height, false);
  composer.setSize(width, height);
}

window.addEventListener('resize', onResize);

// Development-only stage jump used by automated visual checks. Vite removes
// this branch from the production build.
if (import.meta.env.DEV) {
  window.__CHROMA_TEST__ = {
    setStage(value) {
      const stage = clamp(value, 0, 1);
      state.collected = Math.ceil((stage * 0.94) / 0.041);
      car.position.z = -lerp(120, 1850, stage);
      state.distance = -car.position.z;
      ripples.push({ x: car.position.x, z: car.position.z, radius: 190, maxRadius: 260 });
      while (ripples.length > MAX_RIPPLES) ripples.shift();
    },
    crossGate() {
      state.collected = 25;
      state.progress = 1;
      if (!state.gateSpawned) spawnThresholdGate();
      state.gateReveal = 1;
      thresholdGate.scale.setScalar(1);
      car.position.z = state.gateZ - 2.2;
      updateThresholdGate(0.016);
    },
  };
}
