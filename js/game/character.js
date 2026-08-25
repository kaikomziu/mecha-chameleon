import * as THREE from 'https://esm.sh/three@0.160.0';

const TEX_SIZE = 256;
const BASE_COLOR = '#cfcfcf';

export const POSES = {
  standing: { label: '立つ', eyeHeight: 1.55 },
  crouch: { label: 'しゃがむ', eyeHeight: 0.95 },
  curled: { label: '丸まる', eyeHeight: 0.55 },
};

function buildGeometry(pose) {
  switch (pose) {
    case 'crouch':
      return { geo: new THREE.CapsuleGeometry(0.42, 0.35, 6, 16), yOffset: 0.62 };
    case 'curled':
      return { geo: new THREE.SphereGeometry(0.48, 20, 16), yOffset: 0.48 };
    case 'standing':
    default:
      return { geo: new THREE.CapsuleGeometry(0.32, 0.9, 6, 16), yOffset: 0.77 };
  }
}

export class Character {
  constructor(pose = 'standing') {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = TEX_SIZE;
    this.ctx = this.canvas.getContext('2d');
    this.resetPaint();

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.material = new THREE.MeshStandardMaterial({ map: this.texture, roughness: 0.85 });

    this.group = new THREE.Group();
    this.mesh = null;
    this.pose = pose;
    this.setPose(pose);
  }

  resetPaint() {
    this.ctx.fillStyle = BASE_COLOR;
    this.ctx.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
    if (this.texture) this.texture.needsUpdate = true;
  }

  setPose(pose) {
    if (this.mesh) this.group.remove(this.mesh);
    const { geo, yOffset } = buildGeometry(pose);
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.position.y = yOffset;
    this.mesh.castShadow = true;
    this.group.add(this.mesh);
    this.pose = pose;
    return yOffset;
  }

  paintAtUV(u, v, color, brushSize) {
    const x = u * TEX_SIZE;
    const y = (1 - v) * TEX_SIZE;
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(x, y, brushSize, 0, Math.PI * 2);
    this.ctx.fill();
    // テクスチャの継ぎ目(左右端)もそれっぽく塗れるように補完
    if (x < brushSize) { this.ctx.beginPath(); this.ctx.arc(x + TEX_SIZE, y, brushSize, 0, Math.PI * 2); this.ctx.fill(); }
    if (x > TEX_SIZE - brushSize) { this.ctx.beginPath(); this.ctx.arc(x - TEX_SIZE, y, brushSize, 0, Math.PI * 2); this.ctx.fill(); }
    this.texture.needsUpdate = true;
  }

  exportPaintDataURL(maxSize = 48) {
    const small = document.createElement('canvas');
    small.width = small.height = maxSize;
    const sctx = small.getContext('2d');
    sctx.drawImage(this.canvas, 0, 0, maxSize, maxSize);
    return small.toDataURL('image/jpeg', 0.55);
  }

  applyPaintDataURL(dataUrl) {
    const img = new Image();
    img.onload = () => {
      this.ctx.clearRect(0, 0, TEX_SIZE, TEX_SIZE);
      this.ctx.drawImage(img, 0, 0, TEX_SIZE, TEX_SIZE);
      this.texture.needsUpdate = true;
    };
    img.src = dataUrl;
  }

  dispose() {
    this.mesh?.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}

export const PALETTE = [
  '#cfcfcf', '#ffffff', '#1a1a1a', '#8a5a34', '#5b3a20',
  '#e7e2d6', '#cfd3d6', '#a9adb0', '#3d6b8a', '#8a3d3d',
  '#8a8f96', '#c9cdd2', '#4b7a3a', '#d8b23b', '#b04a9c',
];
