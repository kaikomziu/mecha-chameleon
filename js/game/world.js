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
  function addBox(x, z, w, h, d, mat, ry = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, h / 2, z);
    mesh.rotation.y = ry;
    mesh.castShadow = true;
    scene.add(mesh);
    props.push(mesh);
    const cos = Math.abs(Math.cos(ry)), sin = Math.abs(Math.sin(ry));
    const ew = (w * cos + d * sin) / 2, ed = (w * sin + d * cos) / 2;
    colliders.push({ minX: x - ew, maxX: x + ew, minZ: z - ed, maxZ: z + ed, h });
    return mesh;
  }
  function addCylinder(x, z, r, h, mat) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16), mat);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    scene.add(mesh);
    props.push(mesh);
    colliders.push({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r, h });
    return mesh;
  }

  const wood = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.8 });
  const wood2 = new THREE.MeshStandardMaterial({ map: woodTexture('#5b3a20'), roughness: 0.8 });
  const fabric = new THREE.MeshStandardMaterial({ map: fabricTexture(), roughness: 0.9 });
  const fabric2 = new THREE.MeshStandardMaterial({ map: fabricTexture('#8a3d3d'), roughness: 0.9 });
  const metal = new THREE.MeshStandardMaterial({ map: metalTexture(), roughness: 0.4, metalness: 0.6 });

  addBox(-8, -8, 3, 0.9, 1.6, wood);      // テーブル
  addBox(-8, -5.5, 1.2, 1.6, 1.2, fabric); // ソファ的な箱
  addBox(-4, -9.5, 1.4, 1.8, 1.4, wood2, 0.4); // 本棚
  addCylinder(3, -8, 0.6, 1.8, metal);     // ドラム缶
  addCylinder(4.5, -6.5, 0.6, 1.8, metal);
  addBox(8, -8, 2.4, 2.2, 2.4, fabric2);   // 大型ボックス
  addBox(9, -3, 1.2, 1.2, 1.2, wood);
  addBox(-9, 3, 1.6, 2.4, 1.6, metal, 0.3); // ロッカー
  addBox(-6, 8, 3.2, 1.0, 1.6, wood);
  addBox(0, 9, 1.4, 1.4, 1.4, fabric);
  addBox(6, 8, 2.0, 1.8, 2.0, wood2, 0.6);
  addCylinder(8.5, 3, 0.5, 2.4, metal);
  addBox(-2, -2, 1.0, 1.0, 1.0, fabric2);
  addBox(3, 1, 1.4, 0.6, 1.4, wood);
  addBox(-4, 4, 0.9, 1.9, 0.9, metal);

  const light1 = new THREE.HemisphereLight(0xffffff, 0x3a3a3a, 0.9);
  scene.add(light1);
  const light2 = new THREE.PointLight(0xfff2d6, 0.9, 30);
  light2.position.set(0, ROOM_HEIGHT - 0.5, 0);
  scene.add(light2);
  const light3 = new THREE.DirectionalLight(0xffffff, 0.4);
  light3.position.set(10, 10, 5);
  scene.add(light3);

  return { colliders, props, roomSize: ROOM_SIZE, roomHeight: ROOM_HEIGHT };
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
