import * as THREE from 'https://esm.sh/three@0.160.0';
import { tileFloorTexture, wallTexture, woodTexture, fabricTexture, metalTexture, ceilingTexture } from './textures.js';

const ROOM_SIZE = 26;
const ROOM_HEIGHT = 6;

// 部屋 + 家具を構築。衝突判定用に水平AABB([minX,minZ,maxX,maxZ])の配列も返す。
export function buildWorld(scene) {
  const colliders = [];

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE),
    new THREE.MeshStandardMaterial({ map: tileFloorTexture(), roughness: 0.9 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM_SIZE, ROOM_SIZE),
    new THREE.MeshStandardMaterial({ map: ceilingTexture(), roughness: 1, side: THREE.DoubleSide })
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = ROOM_HEIGHT;
  scene.add(ceiling);

  const wallMat = new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 1 });
  const wallDefs = [
    { pos: [0, ROOM_HEIGHT / 2, -ROOM_SIZE / 2], rot: [0, 0, 0] },
    { pos: [0, ROOM_HEIGHT / 2, ROOM_SIZE / 2], rot: [0, Math.PI, 0] },
    { pos: [-ROOM_SIZE / 2, ROOM_HEIGHT / 2, 0], rot: [0, Math.PI / 2, 0] },
    { pos: [ROOM_SIZE / 2, ROOM_HEIGHT / 2, 0], rot: [0, -Math.PI / 2, 0] },
  ];
  for (const w of wallDefs) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_SIZE, ROOM_HEIGHT), wallMat);
    wall.position.set(...w.pos);
    wall.rotation.set(...w.rot);
    scene.add(wall);
  }
  const half = ROOM_SIZE / 2;
  colliders.push({ minX: -half - 1, maxX: half + 1, minZ: -half - 1, maxZ: -half, h: ROOM_HEIGHT }); // 奥壁
  colliders.push({ minX: -half - 1, maxX: half + 1, minZ: half, maxZ: half + 1, h: ROOM_HEIGHT }); // 手前壁
  colliders.push({ minX: -half - 1, maxX: -half, minZ: -half - 1, maxZ: half + 1, h: ROOM_HEIGHT }); // 左壁
  colliders.push({ minX: half, maxX: half + 1, minZ: -half - 1, maxZ: half + 1, h: ROOM_HEIGHT }); // 右壁

  const props = [];
  const propColors = []; // ボットの擬態判定用: {x, z, color}
  function addBox(x, z, w, h, d, mat, ry = 0, color) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, h / 2, z);
    mesh.rotation.y = ry;
    mesh.castShadow = true;
    scene.add(mesh);
    props.push(mesh);
    const cos = Math.abs(Math.cos(ry)), sin = Math.abs(Math.sin(ry));
    const ew = (w * cos + d * sin) / 2, ed = (w * sin + d * cos) / 2;
    colliders.push({ minX: x - ew, maxX: x + ew, minZ: z - ed, maxZ: z + ed, h });
    if (color) propColors.push({ x, z, color });
    return mesh;
  }
  function addCylinder(x, z, r, h, mat, color) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16), mat);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    scene.add(mesh);
    props.push(mesh);
    colliders.push({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r, h });
    if (color) propColors.push({ x, z, color });
    return mesh;
  }

  const woodColor = '#8a5a34', wood2Color = '#5b3a20', fabricColor = '#3d6b8a', fabric2Color = '#8a3d3d', metalColor = '#8a8f96';
  const wood = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.8 });
  const wood2 = new THREE.MeshStandardMaterial({ map: woodTexture(wood2Color), roughness: 0.8 });
  const fabric = new THREE.MeshStandardMaterial({ map: fabricTexture(), roughness: 0.9 });
  const fabric2 = new THREE.MeshStandardMaterial({ map: fabricTexture(fabric2Color), roughness: 0.9 });
  const metal = new THREE.MeshStandardMaterial({ map: metalTexture(), roughness: 0.4, metalness: 0.6 });

  addBox(-8, -8, 3, 0.9, 1.6, wood, 0, woodColor);      // テーブル
  addBox(-8, -5.5, 1.2, 1.6, 1.2, fabric, 0, fabricColor); // ソファ的な箱
  addBox(-4, -9.5, 1.4, 1.8, 1.4, wood2, 0.4, wood2Color); // 本棚
  addCylinder(3, -8, 0.6, 1.8, metal, metalColor);     // ドラム缶
  addCylinder(4.5, -6.5, 0.6, 1.8, metal, metalColor);
  addBox(8, -8, 2.4, 2.2, 2.4, fabric2, 0, fabric2Color);   // 大型ボックス
  addBox(9, -3, 1.2, 1.2, 1.2, wood, 0, woodColor);
  addBox(-9, 3, 1.6, 2.4, 1.6, metal, 0.3, metalColor); // ロッカー
  addBox(-6, 8, 3.2, 1.0, 1.6, wood, 0, woodColor);
  addBox(0, 9, 1.4, 1.4, 1.4, fabric, 0, fabricColor);
  addBox(6, 8, 2.0, 1.8, 2.0, wood2, 0.6, wood2Color);
  addCylinder(8.5, 3, 0.5, 2.4, metal, metalColor);
  addBox(-2, -2, 1.0, 1.0, 1.0, fabric2, 0, fabric2Color);
  addBox(3, 1, 1.4, 0.6, 1.4, wood, 0, woodColor);
  addBox(-4, 4, 0.9, 1.9, 0.9, metal, 0, metalColor);

  const light1 = new THREE.HemisphereLight(0xffffff, 0x3a3a3a, 0.9);
  scene.add(light1);
  const light2 = new THREE.PointLight(0xfff2d6, 0.9, 30);
  light2.position.set(0, ROOM_HEIGHT - 0.5, 0);
  scene.add(light2);
  const light3 = new THREE.DirectionalLight(0xffffff, 0.4);
  light3.position.set(10, 10, 5);
  scene.add(light3);

  return { colliders, props, propColors, floorColor: '#cfd3d6', roomSize: ROOM_SIZE, roomHeight: ROOM_HEIGHT };
}

// 指定座標に最も近い家具の色(4ユニット以内)、無ければ床の色を返す(ボットの擬態判定用)
export function nearestBackgroundColor(x, z, world) {
  let best = null, bestDist = 4;
  for (const p of world.propColors) {
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < bestDist) { bestDist = d; best = p.color; }
  }
  return best || world.floorColor;
}

// 部屋の中からランダムな(何にも埋まっていない)スポーンポイントを1つ選ぶ
export function randomSpawnPoint(world) {
  const r = world.roomSize / 2 - 2;
  for (let i = 0; i < 20; i++) {
    const x = (Math.random() * 2 - 1) * r;
    const z = (Math.random() * 2 - 1) * r;
    const [rx, rz] = resolveCollisions(x, z, 0.38, world.colliders);
    if (Math.abs(rx - x) < 0.01 && Math.abs(rz - z) < 0.01) return [x, z];
  }
  return [0, 0];
}

// 2点間の視線が家具・壁で遮られていないかを簡易判定(線分上を数点サンプリング)
export function hasLineOfSight(x1, z1, x2, z2, colliders) {
  const steps = 12;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = x1 + (x2 - x1) * t;
    const z = z1 + (z2 - z1) * t;
    for (const c of colliders) {
      if (x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ) return false;
    }
  }
  return true;
}

// 円柱(プレイヤー)とAABB群の簡易衝突解決。位置を押し出して返す。
export function resolveCollisions(x, z, radius, colliders) {
  for (const c of colliders) {
    const closestX = Math.max(c.minX, Math.min(x, c.maxX));
    const closestZ = Math.max(c.minZ, Math.min(z, c.maxZ));
    const dx = x - closestX;
    const dz = z - closestZ;
    const distSq = dx * dx + dz * dz;
    if (distSq < radius * radius) {
      const dist = Math.sqrt(distSq) || 0.0001;
      const push = radius - dist;
      x += (dx / dist) * push;
      z += (dz / dist) * push;
    }
  }
  return [x, z];
}
