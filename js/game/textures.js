// 外部画像を一切使わず、canvasで生成するプロシージャルテクスチャ集。
import * as THREE from 'https://esm.sh/three@0.160.0';

function makeCanvas(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function toTexture(canvas, repeat = [1, 1]) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function tileFloorTexture() {
  const c = makeCanvas(256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#cfd3d6';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#a9adb0';
  ctx.lineWidth = 3;
  for (let i = 0; i <= 256; i += 64) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke();
  }
  for (let i = 0; i < 300; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  return toTexture(c, [8, 8]);
}

export function wallTexture(hue = '#e7e2d6') {
  const c = makeCanvas(256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = hue;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.04})`;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 3, 3);
  }
  return toTexture(c, [4, 2]);
}

export function woodTexture(base = '#8a5a34') {
  const c = makeCanvas(256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 18; i++) {
    ctx.strokeStyle = `rgba(0,0,0,${0.08 + Math.random() * 0.1})`;
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    ctx.moveTo(0, i * 15 + Math.random() * 6);
    ctx.bezierCurveTo(80, i * 15 + Math.random() * 10, 180, i * 15 - Math.random() * 10, 256, i * 15);
    ctx.stroke();
  }
  return toTexture(c, [1, 1]);
}

export function fabricTexture(base = '#3d6b8a') {
  const c = makeCanvas(128);
  const ctx = c.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  for (let y = 0; y < 128; y += 4) {
    for (let x = (y / 4) % 2 === 0 ? 0 : 2; x < 128; x += 4) {
      ctx.fillRect(x, y, 2, 2);
    }
  }
  return toTexture(c, [2, 2]);
}

export function metalTexture(base = '#8a8f96') {
  const c = makeCanvas(128);
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 128, 128);
  grad.addColorStop(0, base);
  grad.addColorStop(0.5, '#c9cdd2');
  grad.addColorStop(1, base);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  return toTexture(c, [1, 1]);
}

export function ceilingTexture() {
  const c = makeCanvas(128);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f2f0ea';
  ctx.fillRect(0, 0, 128, 128);
  return toTexture(c, [4, 4]);
}
