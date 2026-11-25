
import * as THREE from 'three';

const $ = id => document.getElementById(id);

const CONFIG = {
  school: {
    name: 'ЗАБРОШЕННАЯ ШКОЛА',
    size: 110,
    color: 0x252b2b,
    floor: 0x343b39,
    wall: 0x555a55,
    monsterSpeed: 2.5
  },
  hospital: {
    name: 'СТАРАЯ БОЛЬНИЦА',
    size: 125,
    color: 0x20292d,
    floor: 0x303b3d,
    wall: 0x667174,
    monsterSpeed: 2.8
  },
  village: {
    name: 'ЗАБРОШЕННАЯ ДЕРЕВНЯ',
    size: 145,
    color: 0x25251d,
    floor: 0x393326,
    wall: 0x514638,
    monsterSpeed: 3
  }
};

const ITEMS = {
  battery: {
    name: 'Батарейка',
    price: 30,
    description: 'Восстанавливает заряд фонарика',
    icon: '🔋'
  },
  medkit: {
    name: 'Аптечка',
    price: 50,
    description: 'Восстанавливает здоровье',
    icon: '🩹'
  },
  decoy: {
    name: 'Шумовая приманка',
    price: 70,
    description: 'Отвлекает монстра',
    icon: '📢'
  }
};

let scene;
let camera;
let renderer;
let clock;

let player;
let monster;
let flashlight;
let flashlightLight;

let mapType = 'school';
let running = false;
let gameOver = false;
let animationStarted = false;

let yaw = 0;
let pitch = 0;

let health = 100;
let battery = 100;
let coins = 0;
let keysFound = 0;
let resources = 0;

let inventory = {
  battery: 0,
  medkit: 0,
  decoy: 0
};

let crouching = false;
let flashlightOn = true;
let inSafeZone = false;

let velocity = new THREE.Vector3();
let direction = new THREE.Vector3();

let held = {};

// МОБИЛЬНЫЙ ДЖОЙСТИК
let mobileMoveX = 0;
let mobileMoveY = 0;

let walls = [];
let pickups = [];
let safeZones = [];
let lamps = [];

let lastNoise = null;
let noiseRadius = 0;
let noiseTimer = 0;
let monsterState = 'idle';
let monsterTarget = null;

let stepTime = 0;
let monsterAttackCooldown = 0;
let gameTime = 0;

const PLAYER_HEIGHT = 1.7;

const materials = {};

const clamp = THREE.MathUtils.clamp;
const random = (min, max) => min + Math.random() * (max - min);

// МАТЕРИАЛЫ

function createMaterials() {
  materials.floor = new THREE.MeshStandardMaterial({
    color: CONFIG[mapType].floor,
    roughness: 1
  });

  materials.wall = new THREE.MeshStandardMaterial({
    color: CONFIG[mapType].wall,
    roughness: 0.95
  });

  materials.dark = new THREE.MeshStandardMaterial({
    color: 0x111414,
    roughness: 1
  });

  materials.wood = new THREE.MeshStandardMaterial({
    color: 0x49372a,
    roughness: 0.9
  });

  materials.metal = new THREE.MeshStandardMaterial({
    color: 0x42494a,
    metalness: 0.5,
    roughness: 0.6
  });

  materials.red = new THREE.MeshStandardMaterial({
    color: 0x7c0909,
    emissive: 0x400000
  });

  materials.green = new THREE.MeshStandardMaterial({
    color: 0x174d28,
    emissive: 0x06200c
  });

  materials.white = new THREE.MeshStandardMaterial({
    color: 0xb7bdb8,
    roughness: 0.8
  });
}

// СОЗДАНИЕ СЦЕНЫ

function createScene() {
  scene = new THREE.Scene();

  scene.background = new THREE.Color(CONFIG[mapType].color);
  scene.fog = new THREE.FogExp2(CONFIG[mapType].color, 0.012);

  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    400
  );

  camera.position.set(0, PLAYER_HEIGHT, 0);

  if (!renderer) {
    renderer = new THREE.WebGLRenderer({
      antialias: true
    });

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    renderer.domElement.id = 'gameCanvas';
    document.body.appendChild(renderer.domElement);
  }

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.domElement.style.display = 'block';

  clock = new THREE.Clock();

  const ambient = new THREE.AmbientLight(0x819090, 0.28);
  scene.add(ambient);

  const moon = new THREE.DirectionalLight(0x82949b, 0.35);
  moon.position.set(-30, 60, -20);
  moon.castShadow = true;
  scene.add(moon);
}

// ОБЪЕКТЫ

function addMesh(geometry, material, x, y, z, castShadow = true) {
  const mesh = new THREE.Mesh(geometry, material);

  mesh.position.set(x, y, z);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;

  scene.add(mesh);
  return mesh;
}

function addWall(x, z, width, depth, height = 5) {
  const wall = addMesh(
    new THREE.BoxGeometry(width, height, depth),
    materials.wall,
    x,
    height / 2,
    z
  );

  walls.push({
    x,
    z,
    width,
    depth
  });

  return wall;
}

// ПОЛ

function addFloor() {
  const size = CONFIG[mapType].size;

  const floor = addMesh(
    new THREE.PlaneGeometry(size, size),
    materials.floor,
    0,
    0,
    0,
    false
  );

  floor.rotation.x = -Math.PI / 2;

  const grid = new THREE.GridHelper(
    size,
    45,
    0x343a35,
    0x343a35
  );

  grid.position.y = 0.015;
  scene.add(grid);
}

// НАРУЖНЫЕ СТЕНЫ

function addOuterWalls() {
  const half = CONFIG[mapType].size / 2;

  addWall(0, half, CONFIG[mapType].size, 1);
  addWall(-half, 0, 1, CONFIG[mapType].size);
  addWall(half, 0, 1, CONFIG[mapType].size);

  const doorwayWidth = 12;
  const sideWidth = (CONFIG[mapType].size - doorwayWidth) / 2;

  addWall(
    -(doorwayWidth / 2 + sideWidth / 2),
    -half,
    sideWidth,
    1
  );

  addWall(
    doorwayWidth / 2 + sideWidth / 2,
    -half,
    sideWidth,
    1
  );

  addMesh(
    new THREE.BoxGeometry(doorwayWidth, 2, 1),
    materials.wall,
    0,
    4.5,
    -half
  );
}

// ПЛАНИРОВКА КАРТ

function addRoomLayout() {
  const size = CONFIG[mapType].size;

  if (mapType === 'school') {
    addWall(-20, -10, 1, 45);
    addWall(20, 10, 1, 45);
    addWall(-20, 20, 35, 1);
    addWall(20, -20, 35, 1);
    addWall(0, 0, 28, 1);
  }

  if (mapType === 'hospital') {
    addWall(-25, 0, 1, 55);
    addWall(25, 0, 1, 55);
    addWall(0, -25, 45, 1);
    addWall(0, 25, 45, 1);
    addWall(-5, 0, 1, 28);
  }

  if (mapType === 'village') {
    for (let i = 0; i < 7; i++) {
      const x = random(-size / 2 + 15, size / 2 - 15);
      const z = random(-size / 2 + 15, size / 2 - 15);

      if (Math.hypot(x, z) < 20) continue;

      createHouse(x, z);
    }
  }
}

// ДОМА

function createHouse(x, z) {
  const width = random(9, 15);
  const depth = random(9, 15);

  addWall(x, z - depth / 2, width, 0.7, 4);
  addWall(x, z + depth / 2, width, 0.7, 4);
  addWall(x - width / 2, z, 0.7, depth, 4);
  addWall(x + width / 2, z, 0.7, depth, 4);

  const roof = addMesh(
    new THREE.ConeGeometry(width * 0.85, 4, 4),
    materials.wood,
    x,
    6,
    z
  );

  roof.rotation.y = Math.PI / 4;

  addMesh(
    new THREE.BoxGeometry(1.5, 2.5, 0.4),
    materials.dark,
    x,
    1.25,
    z - depth / 2 - 0.2
  );
}

// МЕБЕЛЬ

function createFurniture() {
  if (mapType === 'school') {
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 4; col++) {
        const x = -13 + col * 8;
        const z = -10 + row * 7;

        createDesk(x, z);
      }
    }

    createCabinet(-32, 0);
    createCabinet(32, 0);
    createCabinet(-32, 20);
    createCabinet(32, -20);
  }

  if (mapType === 'hospital') {
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 3; col++) {
        createBed(-15 + col * 15, -15 + row * 8);
      }
    }

    createCabinet(-35, 0);
    createCabinet(35, 0);
  }

  if (mapType === 'village') {
    for (let i = 0; i < 35; i++) {
      const x = random(-55, 55);
      const z = random(-55, 55);

      if (Math.hypot(x, z) < 18) continue;

      createTree(x, z);
    }
  }
}

function createDesk(x, z) {
  addMesh(
    new THREE.BoxGeometry(3.2, 0.25, 2),
    materials.wood,
    x,
    1.1,
    z
  );

  for (const dx of [-1.3, 1.3]) {
    for (const dz of [-0.7, 0.7]) {
      addMesh(
        new THREE.CylinderGeometry(0.08, 0.1, 1.1, 8),
        materials.metal,
        x + dx,
        0.55,
        z + dz
      );
    }
  }

  addMesh(
    new THREE.BoxGeometry(0.9, 0.15, 0.8),
    materials.metal,
    x,
    1.35,
    z - 0.2
  );
}

function createBed(x, z) {
  addMesh(
    new THREE.BoxGeometry(5, 0.4, 2.5),
    materials.metal,
    x,
    0.7,
    z
  );

  addMesh(
    new THREE.BoxGeometry(4.7, 0.25, 2.3),
    materials.white,
    x,
    1,
    z
  );

  addMesh(
    new THREE.BoxGeometry(1.2, 0.3, 1.5),
    materials.white,
    x - 1.5,
    1.25,
    z
  );
}

function createCabinet(x, z) {
  addMesh(
    new THREE.BoxGeometry(2.5, 4, 1.5),
    materials.wood,
    x,
    2,
    z
  );

  addMesh(
    new THREE.BoxGeometry(0.1, 0.3, 0.1),
    materials.metal,
    x + 0.9,
    2,
    z - 0.8
  );
}

function createTree(x, z) {
  addMesh(
    new THREE.CylinderGeometry(0.4, 0.7, 5, 8),
    materials.wood,
    x,
    2.5,
    z
  );

  const leaves = new THREE.MeshStandardMaterial({
    color: 0x17251a,
    roughness: 1
  });

  addMesh(
    new THREE.SphereGeometry(random(2.5, 4), 8, 7),
    leaves,
    x,
    6,
    z
  );
}

// ОСВЕЩЕНИЕ

function createLamps() {
  for (let i = 0; i < 12; i++) {
    const x = random(-35, 35);
    const z = random(-35, 35);

    const light = new THREE.PointLight(0xb5c6b9, 1.1, 17);
    light.position.set(x, 4, z);
    scene.add(light);

    const bulb = addMesh(
      new THREE.SphereGeometry(0.18, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xcbd8bb }),
      x,
      4,
      z,
      false
    );

    lamps.push({
      light,
      bulb,
      base: random(0.5, 1.2)
    });
  }
}

// БЕЗОПАСНЫЕ ЗОНЫ

function createSafeZones() {
  const positions = [
    { x: -35, z: -35 },
    { x: 35, z: 35 },
    { x: -35, z: 35 }
  ];

  positions.forEach(p => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(4, 0.12, 8, 40),
      new THREE.MeshBasicMaterial({ color: 0x25d66d })
    );

    ring.rotation.x = Math.PI / 2;
    ring.position.set(p.x, 0.12, p.z);
    scene.add(ring);

    const light = new THREE.PointLight(0x20ff70, 1.4, 10);
    light.position.set(p.x, 2, p.z);
    scene.add(light);

    safeZones.push({
      x: p.x,
      z: p.z,
      radius: 4,
      ring
    });
  });
}

// ПРЕДМЕТЫ НА КАРТЕ

function createPickup(type, x, z) {
  const colors = {
    key: 0xffd52a,
    battery: 0x36b9ff,
    medkit: 0xff3434,
    coin: 0xffc400,
    resource: 0x5bdb8a
  };

  const geometry = type === 'key'
    ? new THREE.TorusGeometry(0.35, 0.12, 8, 16)
    : new THREE.BoxGeometry(0.7, 0.7, 0.7);

  const mesh = addMesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: colors[type],
      emissive: colors[type],
      emissiveIntensity: 0.25
    }),
    x,
    0.8,
    z
  );

  pickups.push({
    type,
    mesh,
    x,
    z,
    collected: false
  });
}

function createPickups() {
  const size = CONFIG[mapType].size / 2 - 12;

  for (let i = 0; i < 3; i++) {
    createPickup('key', random(-size, size), random(-size, size));
  }

  for (let i = 0; i < 8; i++) {
    createPickup('battery', random(-size, size), random(-size, size));
  }

  for (let i = 0; i < 5; i++) {
    createPickup('medkit', random(-size, size), random(-size, size));
  }

  for (let i = 0; i < 15; i++) {
    createPickup('coin', random(-size, size), random(-size, size));
  }

  for (let i = 0; i < 12; i++) {
    createPickup('resource', random(-size, size), random(-size, size));
  }
}

// ВЫХОД

function createExit() {
  const half = CONFIG[mapType].size / 2;

  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0x574b36,
    roughness: 0.9
  });

  addMesh(
    new THREE.BoxGeometry(0.5, 5, 0.5),
    frameMaterial,
    -4,
    2.5,
    -half
  );

  addMesh(
    new THREE.BoxGeometry(0.5, 5, 0.5),
    frameMaterial,
    4,
    2.5,
    -half
  );

  addMesh(
    new THREE.BoxGeometry(8.5, 0.4, 0.5),
    frameMaterial,
    0,
    5,
    -half
  );

  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(4, 1, 0.2),
    new THREE.MeshBasicMaterial({ color: 0x7d1111 })
  );

  sign.position.set(0, 5.8, -half + 0.3);
  scene.add(sign);
}

// ИГРОК

function createPlayer() {
  player = new THREE.Group();
  player.position.set(0, 0, 0);

  scene.add(player);

  camera.position.set(0, PLAYER_HEIGHT, 0);
  camera.rotation.order = 'YXZ';

  player.add(camera);

  const flashlightBody = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.12, 0.7, 12),
    materials.metal
  );

  flashlightBody.rotation.x = Math.PI / 2;
  flashlightBody.position.set(0.35, -0.3, -0.65);
  camera.add(flashlightBody);

  flashlight = flashlightBody;

  flashlightLight = new THREE.SpotLight(
    0xe5f1ff,
    35,
    35,
    Math.PI / 7,
    0.35,
    1.2
  );

  flashlightLight.position.set(0.35, -0.25, -0.6);
  flashlightLight.target.position.set(0.35, -0.25, -8);

  camera.add(flashlightLight);
  camera.add(flashlightLight.target);
}

// МОНСТР

function createMonster() {
  monster = new THREE.Group();

  const skin = new THREE.MeshStandardMaterial({
    color: 0x171c1b,
    roughness: 0.95
  });

  const skinLight = new THREE.MeshStandardMaterial({
    color: 0x29302d,
    roughness: 1
  });

  const eyeMaterial = new THREE.MeshBasicMaterial({
    color: 0xff1010
  });

  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.75, 1.8, 6, 10),
    skin
  );

  body.position.y = 2.2;
  monster.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.7, 16, 12),
    skinLight
  );

  head.position.set(0, 3.8, -0.1);
  monster.add(head);

  for (const x of [-0.25, 0.25]) {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 8, 8),
      eyeMaterial
    );

    eye.position.set(x, 3.85, -0.72);
    monster.add(eye);
  }

  const arms = [];
  const legs = [];

  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.18, 1.7, 4, 8),
      skin
    );

    arm.position.set(side * 0.95, 2.4, 0);
    arm.rotation.z = side * -0.3;

    monster.add(arm);
    arms.push(arm);
  }

  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.23, 1.3, 4, 8),
      skin
    );

    leg.position.set(side * 0.35, 0.85, 0);
    monster.add(leg);
    legs.push(leg);
  }

  monster.userData.arms = arms;
  monster.userData.legs = legs;
  monster.userData.body = body;
  monster.userData.head = head;
  monster.userData.searchTimer = 0;

  monster.position.set(15, 0, -20);

  scene.add(monster);
}

// ИНТЕРФЕЙС

function setText(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

function updateUI() {
  setText('health', Math.ceil(health));
  setText('battery', Math.ceil(battery));
  setText('keys', keysFound + '/3');
  setText('coins', coins);
  setText('resources', resources);

  setText('healthValue', Math.ceil(health));
  setText('batteryValue', Math.ceil(battery));
  setText('keysValue', keysFound + '/3');
  setText('coinsValue', coins);

  const healthBar = $('healthBar');
  if (healthBar) healthBar.style.width = health + '%';

  const batteryBar = $('batteryBar');
  if (batteryBar) batteryBar.style.width = battery + '%';

  setText('monsterStatus', getMonsterStatus());
}

function getMonsterStatus() {
  if (inSafeZone) return 'БЕЗОПАСНАЯ ЗОНА';
  if (monsterState === 'investigate') return 'МОНСТР СЛЫШИТ ШУМ';
  if (monsterState === 'search') return 'МОНСТР ИЩЕТ';
  if (monsterState === 'chase') return 'МОНСТР ПРЕСЛЕДУЕТ';

  return 'МОНСТР НЕ СЛЫШИТ';
}

// ГЛАВНОЕ МЕНЮ

function showMenu() {
  running = false;
  gameOver = false;
  held = {};
  resetMobileJoystick();

  document.exitPointerLock?.();

  const menu = $('menuScreen');
  if (menu) menu.style.display = 'flex';

  const hud = $('hud');
  if (hud) hud.style.display = 'none';

  const shop = $('shopScreen');
  if (shop) shop.style.display = 'none';

  const pause = $('pauseScreen');
  if (pause) pause.style.display = 'none';

  const end = $('endScreen');
  if (end) end.style.display = 'none';

  const canvas = $('gameCanvas');
  if (canvas) canvas.style.display = 'none';
}

// НАЧАЛО ИГРЫ

function startGame(selectedMap = 'school') {
  mapType = CONFIG[selectedMap] ? selectedMap : 'school';

  running = false;
  gameOver = false;
  held = {};
  resetMobileJoystick();

  document.exitPointerLock?.();

  health = 100;
  battery = 100;
  coins = 0;
  keysFound = 0;
  resources = 0;

  inventory = {
    battery: 0,
    medkit: 0,
    decoy: 0
  };

  yaw = 0;
  pitch = 0;
  crouching = false;
  flashlightOn = true;
  inSafeZone = false;

  velocity.set(0, 0, 0);
  direction.set(0, 0, 0);

  lastNoise = null;
  noiseRadius = 0;
  noiseTimer = 0;
  monsterState = 'idle';
  monsterTarget = null;

  stepTime = 0;
  monsterAttackCooldown = 0;
  gameTime = 0;

  walls = [];
  pickups = [];
  safeZones = [];
  lamps = [];

  createMaterials();
  createScene();

  addFloor();
  addOuterWalls();
  addRoomLayout();
  createFurniture();
  createLamps();
  createSafeZones();
  createPickups();
  createExit();
  createPlayer();
  createMonster();

  const canvas = $('gameCanvas');
  if (canvas) canvas.style.display = 'block';

  const hud = $('hud');
  if (hud) hud.style.display = 'flex';

  setText('mapName', CONFIG[mapType].name);
  setText('objective', 'Найдите 3 ключа и доберитесь до выхода');

  const menu = $('menuScreen');
  if (menu) menu.style.display = 'none';

  const pause = $('pauseScreen');
  if (pause) pause.style.display = 'none';

  const shop = $('shopScreen');
  if (shop) shop.style.display = 'none';

  const end = $('endScreen');
  if (end) end.style.display = 'none';

  running = true;

  if (!animationStarted) {
    animationStarted = true;
    animate();
  }

  clock.getDelta();
  updateUI();

  // На телефоне мышь не захватываем.
  if (!window.matchMedia('(pointer: coarse)').matches) {
    renderer.domElement.requestPointerLock?.();
  }
}

// ИГРОВОЙ ЦИКЛ


function movePlayer(dt) {
  if (!player || !running) return;

  const forward = new THREE.Vector3(
    -Math.sin(yaw),
    0,
    -Math.cos(yaw)
  );

  const right = new THREE.Vector3(
    Math.cos(yaw),
    0,
    -Math.sin(yaw)
  );

  direction.set(0, 0, 0);

  // Клавиатура
  if (held.KeyW || held.ArrowUp) direction.add(forward);
  if (held.KeyS || held.ArrowDown) direction.sub(forward);
  if (held.KeyD || held.ArrowRight) direction.add(right);
  if (held.KeyA || held.ArrowLeft) direction.sub(right);

  // Джойстик
  direction.addScaledVector(forward, mobileMoveY);
  direction.addScaledVector(right, mobileMoveX);

  const moving = direction.lengthSq() > 0.001;

  if (moving) direction.normalize();

  const sprint =
    (held.ShiftLeft || held.ShiftRight) && !crouching;

  const speed = crouching ? 2.1 : sprint ? 8 : 4.5;

  const targetVelocity = direction.clone().multiplyScalar(speed);

  velocity.x = THREE.MathUtils.damp(
    velocity.x,
    targetVelocity.x,
    12,
    dt
  );

  velocity.z = THREE.MathUtils.damp(
    velocity.z,
    targetVelocity.z,
    12,
    dt
  );

  const nextX = player.position.x + velocity.x * dt;
  const nextZ = player.position.z + velocity.z * dt;

  if (!collides(nextX, player.position.z)) {
    player.position.x = nextX;
  } else {
    velocity.x = 0;
  }

  if (!collides(player.position.x, nextZ)) {
    player.position.z = nextZ;
  } else {
    velocity.z = 0;
  }

  const half = CONFIG[mapType].size / 2 - 2;

  player.position.x = clamp(player.position.x, -half, half);
  player.position.z = clamp(player.position.z, -half, half);

  if (moving) {
    const bobSpeed = sprint ? 13 : crouching ? 5 : 8;

    camera.position.y =
      PLAYER_HEIGHT + Math.sin(gameTime * bobSpeed) * 0.035;

    if (
      !crouching &&
      gameTime - stepTime > (sprint ? 0.35 : 0.7)
    ) {
      makeNoise(sprint ? 24 : 9);
      stepTime = gameTime;
    }
  } else {
    camera.position.y = THREE.MathUtils.damp(
      camera.position.y,
      PLAYER_HEIGHT,
      8,
      dt
    );
  }

  inSafeZone = safeZones.some(zone => {
    return Math.hypot(
      player.position.x - zone.x,
      player.position.z - zone.z
    ) < zone.radius;
  });

  const safeElement = $('safe');

  if (safeElement) {
    safeElement.style.display = inSafeZone ? 'block' : 'none';
  }
}


// ДВИЖЕНИЕ ИГРОКА

function movePlayer(dt) {
  if (!player || !running) return;

  const forward = new THREE.Vector3(
    -Math.sin(yaw),
    0,
    -Math.cos(yaw)
  );

  const right = new THREE.Vector3(
    Math.cos(yaw),
    0,
    -Math.sin(yaw)
  );

  direction.set(0, 0, 0);

  if (held.KeyW) direction.add(forward);
  if (held.KeyS) direction.sub(forward);
  if (held.KeyD) direction.add(right);
  if (held.KeyA) direction.sub(right);

  // ДЖОЙСТИК УПРАВЛЯЕТ ТОЛЬКО ДВИЖЕНИЕМ ТЕЛА
  direction.addScaledVector(forward, mobileMoveY);
  direction.addScaledVector(right, mobileMoveX);

  const moving = direction.lengthSq() > 0;
  direction.addScaledVector(forward, mobileMoveY);
direction.addScaledVector(right, mobileMoveX);

  if (moving) direction.normalize();

  const sprint =
    (held.ShiftLeft || held.ShiftRight) && !crouching;

  const speed = crouching ? 2.1 : sprint ? 8 : 4.5;

  const targetVelocity = direction.clone().multiplyScalar(speed);

  velocity.x = THREE.MathUtils.damp(
    velocity.x,
    targetVelocity.x,
    12,
    dt
  );

  velocity.z = THREE.MathUtils.damp(
    velocity.z,
    targetVelocity.z,
    12,
    dt
  );

  const nextX = player.position.x + velocity.x * dt;
  const nextZ = player.position.z + velocity.z * dt;

  if (!collides(nextX, player.position.z)) {
    player.position.x = nextX;
  } else {
    velocity.x = 0;
  }

  if (!collides(player.position.x, nextZ)) {
    player.position.z = nextZ;
  } else {
    velocity.z = 0;
  }

  const half = CONFIG[mapType].size / 2 - 2;

  player.position.x = clamp(player.position.x, -half, half);
  player.position.z = clamp(player.position.z, -half, half);

  if (moving) {
    const bobSpeed = sprint ? 13 : crouching ? 5 : 8;

    camera.position.y =
      PLAYER_HEIGHT + Math.sin(gameTime * bobSpeed) * 0.035;

    if (
      !crouching &&
      gameTime - stepTime > (sprint ? 0.35 : 0.7)
    ) {
      makeNoise(sprint ? 24 : 9);
      stepTime = gameTime;
    }
  } else {
    camera.position.y = THREE.MathUtils.damp(
      camera.position.y,
      PLAYER_HEIGHT,
      8,
      dt
    );
  }

  inSafeZone = safeZones.some(zone => {
    return Math.hypot(
      player.position.x - zone.x,
      player.position.z - zone.z
    ) < zone.radius;
  });

  const safeElement = $('safe');

  if (safeElement) {
    safeElement.style.display = inSafeZone ? 'block' : 'none';
  }
}

// СТОЛКНОВЕНИЯ

function collides(x, z) {
  const radius = 0.65;
  const half = CONFIG[mapType].size / 2;

  if (
    x < -half + radius ||
    x > half - radius ||
    z < -half + radius ||
    z > half - radius
  ) {
    return true;
  }

  const exitZ = -half;
  const nearExit = Math.abs(z - exitZ) < 1.2;
  const insideDoor = Math.abs(x) < 5;

  if (nearExit && insideDoor) return false;

  for (const wall of walls) {
    const minX = wall.x - wall.width / 2 - radius;
    const maxX = wall.x + wall.width / 2 + radius;
    const minZ = wall.z - wall.depth / 2 - radius;
    const maxZ = wall.z + wall.depth / 2 + radius;

    if (
      x > minX &&
      x < maxX &&
      z > minZ &&
      z < maxZ
    ) {
      return true;
    }
  }

  return false;
}

// КАМЕРА

function updateCamera() {
  if (!camera) return;

  camera.rotation.order = 'YXZ';
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;
}

// ИИ МОНСТРА

function updateMonster(dt) {
  if (!monster || !player) return;

  const distance = monster.position.distanceTo(player.position);

  if (inSafeZone) {
    monsterState = 'idle';
    monsterTarget = null;
    noiseTimer = 0;

    monsterAttackCooldown = Math.max(
      0,
      monsterAttackCooldown - dt
    );

    animateMonster(dt);
    return;
  }

  if (monsterState === 'investigate' && monsterTarget) {
    moveMonsterTo(
      monsterTarget,
      dt,
      CONFIG[mapType].monsterSpeed
    );

    if (monster.position.distanceTo(monsterTarget) < 2) {
      monsterState = 'search';
      monster.userData.searchTimer = 0;
      monsterTarget = null;
    }
  } else if (monsterState === 'search') {
    monster.userData.searchTimer =
      (monster.userData.searchTimer || 0) + dt;

    monster.rotation.y += Math.sin(gameTime * 2) * dt * 0.5;

    if (monster.userData.searchTimer > 4) {
      monster.userData.searchTimer = 0;
      monsterState = 'idle';
    }
  }

  monsterAttackCooldown = Math.max(
    0,
    monsterAttackCooldown - dt
  );

  if (
    distance < 1.8 &&
    monsterState !== 'idle' &&
    monsterAttackCooldown <= 0
  ) {
    health = Math.max(0, health - 20);
    monsterAttackCooldown = 1.2;

    showMessage('МОНСТР АТАКОВАЛ ТЕБЯ!', 1500);

    if (health <= 0) finishGame(false);
  }

  animateMonster(dt);
}

function moveMonsterTo(target, dt, speed) {
  const dx = target.x - monster.position.x;
  const dz = target.z - monster.position.z;

  const distance = Math.hypot(dx, dz);

  if (distance < 0.1) return;

  const moveX = dx / distance * speed * dt;
  const moveZ = dz / distance * speed * dt;

  const nextX = monster.position.x + moveX;
  const nextZ = monster.position.z + moveZ;

  if (!collides(nextX, monster.position.z)) {
    monster.position.x = nextX;
  }

  if (!collides(monster.position.x, nextZ)) {
    monster.position.z = nextZ;
  }

  monster.rotation.y = Math.atan2(-dx, -dz);
}

function animateMonster(dt) {
  if (!monster) return;

  const moving = monsterState === 'investigate';

  const swing = Math.sin(
    gameTime * (moving ? 9 : 2)
  ) * 0.3;

  monster.userData.arms.forEach((arm, index) => {
    arm.rotation.x = index === 0 ? swing : -swing;
  });

  monster.userData.legs.forEach((leg, index) => {
    leg.rotation.x = index === 0 ? -swing : swing;
  });

  monster.userData.body.position.y =
    2.2 + Math.sin(gameTime * 3) * 0.04;
}

// ЗВУК

function makeNoise(radius) {
  if (!player || !monster || inSafeZone) return;

  const distance = monster.position.distanceTo(player.position);

  if (distance > radius) return;

  lastNoise = player.position.clone();
  noiseRadius = radius;
  noiseTimer = 5;

  monsterState = 'investigate';
  monsterTarget = lastNoise.clone();
}

function updateNoise(dt) {
  if (noiseTimer > 0) {
    noiseTimer = Math.max(0, noiseTimer - dt);
  }
}

// ПРЕДМЕТЫ

function updatePickups(dt) {
  if (!player) return;

  for (const item of pickups) {
    if (item.collected) continue;

    item.mesh.rotation.y += dt * 1.5;
    item.mesh.position.y =
      0.8 + Math.sin(gameTime * 2) * 0.12;

    const distance = Math.hypot(
      player.position.x - item.x,
      player.position.z - item.z
    );

    if (distance < 1.5) collectPickup(item);
  }
}

function collectPickup(item) {
  if (item.collected) return;

  item.collected = true;
  scene.remove(item.mesh);

  switch (item.type) {
    case 'key':
      keysFound++;
      showMessage('🔑 НАЙДЕН КЛЮЧ!', 1500);
      break;

    case 'battery':
      battery = Math.min(100, battery + 25);
      showMessage('🔋 БАТАРЕЯ НАЙДЕНА', 1200);
      break;

    case 'medkit':
      health = Math.min(100, health + 25);
      showMessage('🩹 АПТЕЧКА НАЙДЕНА', 1200);
      break;

    case 'coin':
      coins += 10;
      break;

    case 'resource':
      resources++;
      showMessage('📦 НАЙДЕН РЕСУРС', 1200);
      break;
  }

  updateUI();
}

// ЛАМПЫ

function updateLamps(dt) {
  lamps.forEach(lamp => {
    lamp.light.intensity =
      lamp.base * (0.7 + Math.random() * 0.3);
  });
}

// ФОНАРИК

function updateFlashlight(dt) {
  if (!flashlightLight) return;

  if (flashlightOn && battery > 0) {
    battery -= dt * 0.8;
    flashlightLight.intensity = 35;
  } else {
    flashlightLight.intensity = 0;
    flashlightOn = false;
  }

  battery = Math.max(0, battery);
}

function toggleFlashlight() {
  if (battery <= 0) {
    showMessage('БАТАРЕЯ РАЗРЯЖЕНА!', 1500);
    return;
  }

  flashlightOn = !flashlightOn;

  if (flashlightLight) {
    flashlightLight.intensity = flashlightOn ? 35 : 0;
  }
}

// ВЫХОД

function checkExit() {
  if (!player) return;

  const half = CONFIG[mapType].size / 2;

  const nearExit =
    player.position.z < -half + 4 &&
    Math.abs(player.position.x) < 5;

  if (nearExit) {
    if (keysFound >= 3) {
      finishGame(true);
    } else {
      setText(
        'objective',
        'Нужно найти ещё ' + (3 - keysFound) + ' ключа'
      );
    }
  } else {
    setText(
      'objective',
      'Найдите 3 ключа и доберитесь до выхода'
    );
  }
}

// КОНЕЦ ИГРЫ

function finishGame(won) {
  if (gameOver) return;

  running = false;
  gameOver = true;
  held = {};
  resetMobileJoystick();

  document.exitPointerLock?.();

  const end = $('endScreen');

  if (end) end.style.display = 'flex';

  setText(
    'endTitle',
    won ? 'ТЫ ВЫЖИЛ!' : 'ТЫ ПОГИБ'
  );

  setText(
    'endDescription',
    won
      ? 'Ты нашёл ключи и выбрался из этого места.'
      : 'Монстр поймал тебя. Попробуй ещё раз.'
  );

  const hud = $('hud');
  if (hud) hud.style.display = 'none';
}

// СООБЩЕНИЯ

function showMessage(message, duration = 1800) {
  const element = $('message');

  if (!element) return;

  element.textContent = message;
  element.style.display = 'block';

  clearTimeout(showMessage.timer);

  showMessage.timer = setTimeout(() => {
    element.style.display = 'none';
  }, duration);
}

// МАГАЗИН

function openShop() {
  if (!running) return;

  running = false;
  held = {};
  resetMobileJoystick();

  document.exitPointerLock?.();

  const shop = $('shopScreen');
  if (shop) shop.style.display = 'flex';

  renderShop();
}

function closeShop() {
  const shop = $('shopScreen');

  if (shop) shop.style.display = 'none';

  if (!gameOver) {
    running = true;

    if (!window.matchMedia('(pointer: coarse)').matches) {
      renderer?.domElement.requestPointerLock?.();
    }
  }
}

function renderShop() {
  const container = $('shopItems');

  if (!container) return;

  container.innerHTML = '';

  Object.entries(ITEMS).forEach(([id, item]) => {
    const card = document.createElement('div');

    card.className = 'shop-item';

    card.innerHTML = `
      <div class="shop-icon">${item.icon}</div>
      <h3>${item.name}</h3>
      <p>${item.description}</p>
      <p>Цена: ${item.price} монет</p>
      <button data-buy="${id}">Купить</button>
    `;

    container.appendChild(card);
  });

  container.querySelectorAll('[data-buy]').forEach(button => {
    button.addEventListener('click', () => {
      buyItem(button.dataset.buy);
    });
  });
}

function buyItem(id) {
  const item = ITEMS[id];

  if (!item) return;

  if (coins < item.price) {
    showMessage('НЕДОСТАТОЧНО МОНЕТ!', 1500);
    return;
  }

  coins -= item.price;
  inventory[id]++;

  showMessage('ПОКУПКА УСПЕШНА!', 1500);
  updateUI();
}

// ИСПОЛЬЗОВАНИЕ ПРЕДМЕТОВ

function useItem(id) {
  if (!running) return;

  if (!inventory[id] || inventory[id] <= 0) {
    showMessage('НЕТ ЭТОГО ПРЕДМЕТА!', 1500);
    return;
  }

  if (id === 'battery') {
    battery = Math.min(100, battery + 50);
  }

  if (id === 'medkit') {
    health = Math.min(100, health + 50);
  }

  if (id === 'decoy') {
    const fakeNoise = new THREE.Vector3(
      player.position.x + random(-25, 25),
      0,
      player.position.z + random(-25, 25)
    );

    lastNoise = fakeNoise.clone();
    monsterTarget = fakeNoise.clone();
    noiseTimer = 7;
    noiseRadius = 60;
    monsterState = 'investigate';
  }

  inventory[id]--;

  updateUI();
  showMessage('ПРЕДМЕТ ИСПОЛЬЗОВАН', 1200);
}

// ПАУЗА

function pauseGame() {
  if (!running) return;

  running = false;
  held = {};
  resetMobileJoystick();

  document.exitPointerLock?.();

  const pause = $('pauseScreen');
  if (pause) pause.style.display = 'flex';
}

function resumeGame() {
  const pause = $('pauseScreen');
  if (pause) pause.style.display = 'none';

  if (!gameOver) {
    running = true;

    if (!window.matchMedia('(pointer: coarse)').matches) {
      renderer?.domElement.requestPointerLock?.();
    }
  }
}

// ПРИСЕДАНИЕ

function toggleCrouch() {
  if (!running) return;

  crouching = !crouching;

  showMessage(
    crouching ? 'ТЫ ПРИСЕЛ' : 'ТЫ ВСТАЛ',
    900
  );
}

// КЛАВИАТУРА

function onKeyDown(event) {
  if (!running) return;

  held[event.code] = true;

  if (event.code === 'KeyF') toggleFlashlight();
  if (event.code === 'KeyC') toggleCrouch();
  if (event.code === 'Escape') pauseGame();
  if (event.code === 'KeyE') interact();

  if (event.code === 'Digit1') useItem('battery');
  if (event.code === 'Digit2') useItem('medkit');
  if (event.code === 'Digit3') useItem('decoy');

  if (
    ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']
      .includes(event.code)
  ) {
    event.preventDefault();
  }
}

function onKeyUp(event) {
  held[event.code] = false;
}

// МЫШЬ

function onMouseMove(event) {
  if (!running) return;

  if (document.pointerLockElement !== renderer?.domElement) return;

  yaw -= event.movementX * 0.002;
  pitch -= event.movementY * 0.002;

  pitch = clamp(pitch, -1.35, 1.35);

  updateCamera();
}

// ДЕЙСТВИЕ

function interact() {
  if (!player || !running) return;

  const half = CONFIG[mapType].size / 2;

  if (
    player.position.z < -half + 7 &&
    Math.abs(player.position.x) < 6
  ) {
    if (keysFound >= 3) {
      finishGame(true);
    } else {
      showMessage('НУЖНО НАЙТИ ВСЕ 3 КЛЮЧА', 1800);
    }
  }
}

// МОБИЛЬНЫЙ ДЖОЙСТИК ДЛЯ ТЕЛА


// МОБИЛЬНЫЙ ДЖОЙСТИК — АВТОСОЗДАНИЕ



let joystickActive = false;
let joystickPointerId = null;

let joystick = document.getElementById('mobileJoystick');
let knob = document.getElementById('mobileKnob');

if (!joystick) {
  joystick = document.createElement('div');
  joystick.id = 'mobileJoystick';
  document.body.appendChild(joystick);
}

if (!knob) {
  knob = document.createElement('div');
  knob.id = 'mobileKnob';
  joystick.appendChild(knob);
}

// СТИЛИ ДЖОЙСТИКА
const joystickStyle = document.createElement('style');

joystickStyle.textContent = `
  #mobileJoystick {
    position: fixed !important;
    left: 25px !important;
    bottom: 30px !important;
    width: 140px !important;
    height: 140px !important;
    border: 3px solid rgba(255,255,255,0.55);
    border-radius: 50%;
    background: rgba(20,20,20,0.5);
    z-index: 999999 !important;
    display: block !important;
    touch-action: none !important;
    user-select: none;
    pointer-events: auto !important;
  }

  #mobileKnob {
    position: absolute;
    left: 40px;
    top: 40px;
    width: 60px;
    height: 60px;
    border-radius: 50%;
    background: rgba(255,255,255,0.85);
    box-shadow: 0 0 15px black;
    pointer-events: none;
  }
`;

document.head.appendChild(joystickStyle);

function resetMobileJoystick() {
  joystickActive = false;
  joystickPointerId = null;

  mobileMoveX = 0;
  mobileMoveY = 0;

  if (knob) {
    knob.style.transform = 'translate(0px, 0px)';
  }
}

function updateJoystick(event) {
  const rect = joystick.getBoundingClientRect();

  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  let dx = event.clientX - centerX;
  let dy = event.clientY - centerY;

  const maxDistance = 40;
  const distance = Math.hypot(dx, dy);

  if (distance > maxDistance) {
    dx = dx / distance * maxDistance;
    dy = dy / distance * maxDistance;
  }

  knob.style.transform = `translate(${dx}px, ${dy}px)`;

  mobileMoveX = dx / maxDistance;
  mobileMoveY = -dy / maxDistance;

  if (Math.abs(mobileMoveX) < 0.12) mobileMoveX = 0;
  if (Math.abs(mobileMoveY) < 0.12) mobileMoveY = 0;
}

joystick.addEventListener('pointerdown', event => {
  if (!running || joystickActive) return;

  event.preventDefault();

  joystickActive = true;
  joystickPointerId = event.pointerId;

  joystick.setPointerCapture(event.pointerId);
  updateJoystick(event);
});

joystick.addEventListener('pointermove', event => {
  if (!joystickActive) return;
  if (event.pointerId !== joystickPointerId) return;

  event.preventDefault();
  updateJoystick(event);
});

joystick.addEventListener('pointerup', event => {
  if (event.pointerId === joystickPointerId) {
    resetMobileJoystick();
  }
});

joystick.addEventListener('pointercancel', resetMobileJoystick);
joystick.addEventListener('lostpointercapture', resetMobileJoystick);


// КНОПКИ

function bindButtons() {
  const bindings = [
    ['startSchool', () => startGame('school')],
    ['startHospital', () => startGame('hospital')],
    ['startVillage', () => startGame('village')],
    ['shopButton', openShop],
    ['pauseButton', pauseGame],
    ['resumeButton', resumeGame],
    ['closeShopButton', closeShop],
    ['restartButton', () => startGame(mapType)],
    ['menuButton', showMenu],
    ['useBattery', () => useItem('battery')],
    ['useMedkit', () => useItem('medkit')],
    ['useDecoy', () => useItem('decoy')]
  ];

  bindings.forEach(([id, callback]) => {
    const element = $(id);

    if (element) {
      element.addEventListener('click', callback);
    }
  });
}

// ИЗМЕНЕНИЕ РАЗМЕРА ОКНА

function onResize() {
  if (!camera || !renderer) return;

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(
    window.innerWidth,
    window.innerHeight
  );
}

// ЗАПУСК

window.startGame = startGame;
window.openShop = openShop;
window.closeShop = closeShop;
window.pauseGame = pauseGame;
window.resumeGame = resumeGame;
window.showMenu = showMenu;
window.buyItem = buyItem;
window.useItem = useItem;

window.addEventListener('keydown', onKeyDown);
window.addEventListener('keyup', onKeyUp);
window.addEventListener('mousemove', onMouseMove);
window.addEventListener('resize', onResize);

window.addEventListener('blur', () => {
  held = {};
  resetMobileJoystick();
});

bindButtons();

console.log('NIGHTMARE: SURVIVAL загружен!');
