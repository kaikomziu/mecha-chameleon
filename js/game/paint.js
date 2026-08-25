import * as THREE from 'https://esm.sh/three@0.160.0';
import { PALETTE, POSES } from './character.js';

// 隠れフェーズ中の「擬態ペイント」UI。自分のキャラを鏡越しに映して
// ドラッグで自由にペイントできるようにする。
export class PaintController {
  constructor({ renderer, dom, character, onChanged }) {
    this.renderer = renderer;
    this.dom = dom;
    this.character = character;
    this.onChanged = onChanged;
    this.color = '#8a5a34';
    this.brushSize = 14;
    this.painting = false;
    this.raycaster = new THREE.Raycaster();
    this.active = false;

    this._buildUI();
    this._bindPointer();
  }

  _buildUI() {
    const root = document.createElement('div');
    root.className = 'paint-ui hidden';
    root.innerHTML = `
      <div class="paint-panel">
        <div class="paint-title">🎨 擬態ペイント — ドラッグして自分を塗ろう</div>
        <div class="paint-pose-row"></div>
        <div class="paint-palette"></div>
        <div class="paint-controls-row">
          <label>ブラシ<input type="range" min="4" max="34" value="14" class="brush-range"></label>
          <input type="color" class="color-picker" value="#8a5a34">
          <button class="paint-clear">リセット</button>
          <button class="paint-confirm">これで隠れる ✓</button>
        </div>
      </div>`;
    this.dom.appendChild(root);
    this.root = root;

    const poseRow = root.querySelector('.paint-pose-row');
    for (const [key, val] of Object.entries(POSES)) {
      const btn = document.createElement('button');
      btn.className = 'pose-btn';
      btn.textContent = val.label;
      btn.dataset.pose = key;
      btn.addEventListener('click', () => {
        this.character.setPose(key);
        poseRow.querySelectorAll('.pose-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.onChanged?.();
      });
      poseRow.appendChild(btn);
    }
    poseRow.querySelector('[data-pose="standing"]').classList.add('active');

    const paletteEl = root.querySelector('.paint-palette');
    for (const c of PALETTE) {
      const sw = document.createElement('button');
      sw.className = 'swatch';
      sw.style.background = c;
      sw.addEventListener('click', () => {
        this.color = c;
        root.querySelector('.color-picker').value = c;
      });
      paletteEl.appendChild(sw);
    }
    root.querySelector('.color-picker').addEventListener('input', (e) => (this.color = e.target.value));
    root.querySelector('.brush-range').addEventListener('input', (e) => (this.brushSize = Number(e.target.value)));
    root.querySelector('.paint-clear').addEventListener('click', () => {
      this.character.resetPaint();
      this.onChanged?.();
    });
    this._confirmBtn = root.querySelector('.paint-confirm');
  }

  onConfirm(fn) {
    this._confirmBtn.addEventListener('click', fn);
  }

  show(camera, mirrorPosition) {
    this.active = true;
    this.root.classList.remove('hidden');
    this.camera = camera;
    this.mirrorPosition = mirrorPosition;
  }

  hide() {
    this.active = false;
    this.root.classList.add('hidden');
  }

  _bindPointer() {
    const pointer = new THREE.Vector2();
    const paintFromEvent = (clientX, clientY) => {
      if (!this.active || !this.camera) return;
      const rect = this.renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(pointer, this.camera);
      const hit = this.raycaster.intersectObject(this.character.mesh, false)[0];
      if (hit?.uv) {
        this.character.paintAtUV(hit.uv.x, hit.uv.y, this.color, this.brushSize);
        this.onChanged?.();
      }
    };

    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      this.painting = true;
      paintFromEvent(e.clientX, e.clientY);
    });
    dom.addEventListener('pointermove', (e) => {
      if (!this.active || !this.painting) return;
      paintFromEvent(e.clientX, e.clientY);
    });
    window.addEventListener('pointerup', () => (this.painting = false));
  }
}
