// PC(ポインターロック+WASD)とスマホ(仮想スティック+ドラッグ視点+発砲ボタン)を
// 同一インターフェースに統一するコントローラ。
const isTouch = matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;

export class Controls {
  constructor({ domElement, uiRoot, camera, onFire }) {
    this.dom = domElement;
    this.camera = camera;
    this.onFire = onFire;
    this.yaw = 0;
    this.pitch = 0;
    this.moveX = 0; // 左右ストレイフ -1..1
    this.moveZ = 0; // 前後 -1..1
    this.enabled = true;
    this.locked = false;
    this.keys = new Set();

    if (isTouch) this._setupTouch(uiRoot);
    else this._setupDesktop();
  }

  setEnabled(v) {
    this.enabled = v;
    if (!v) { this.moveX = 0; this.moveZ = 0; }
  }

  // 視点(見回し)は許可したまま、移動だけ止めたい場合(索敵フェーズの隠れる側など)
  setMoveLocked(v) {
    this.moveLocked = v;
  }

  _setupDesktop() {
    this.hint = document.createElement('div');
    this.hint.className = 'pointer-hint';
    this.hint.textContent = 'クリックして視点操作を開始';
    this.dom.parentElement.appendChild(this.hint);

    this.dom.addEventListener('click', () => {
      if (!this.enabled) return;
      this.dom.requestPointerLock?.();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.dom;
      this.hint.style.display = this.locked ? 'none' : 'flex';
    });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked || !this.enabled) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch -= e.movementY * 0.0022;
      this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch));
    });
    this.dom.addEventListener('mousedown', (e) => {
      if (this.locked && this.enabled && e.button === 0) this.onFire?.();
    });
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
  }

  _setupTouch(uiRoot) {
    const stick = document.createElement('div');
    stick.className = 'touch-stick';
    stick.innerHTML = '<div class="touch-stick-knob"></div>';
    const knob = stick.querySelector('.touch-stick-knob');
    uiRoot.appendChild(stick);

    const fireBtn = document.createElement('button');
    fireBtn.className = 'touch-fire-btn';
    fireBtn.textContent = '発砲';
    fireBtn.style.display = 'none';
    uiRoot.appendChild(fireBtn);
    this.fireBtn = fireBtn;
    fireBtn.addEventListener('touchstart', (e) => { e.preventDefault(); if (this.enabled) this.onFire?.(); }, { passive: false });

    let stickTouchId = null, stickOrigin = null;
    stick.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      stickTouchId = t.identifier;
      stickOrigin = { x: t.clientX, y: t.clientY };
    }, { passive: false });

    const look = { touchId: null, lastX: 0, lastY: 0 };
    this.dom.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickTouchId) continue;
        if (look.touchId === null) { look.touchId = t.identifier; look.lastX = t.clientX; look.lastY = t.clientY; }
      }
    }, { passive: false });

    window.addEventListener('touchmove', (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        if (t.identifier === stickTouchId && stickOrigin) {
          let dx = t.clientX - stickOrigin.x, dy = t.clientY - stickOrigin.y;
          const max = 42;
          const len = Math.hypot(dx, dy) || 1;
          if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
          knob.style.transform = `translate(${dx}px, ${dy}px)`;
          this.moveX = dx / max;
          this.moveZ = dy / max;
        } else if (t.identifier === look.touchId) {
          const dx = t.clientX - look.lastX, dy = t.clientY - look.lastY;
          look.lastX = t.clientX; look.lastY = t.clientY;
          this.yaw -= dx * 0.0032;
          this.pitch -= dy * 0.0032;
          this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch));
        }
      }
    }, { passive: false });

    window.addEventListener('touchend', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickTouchId) {
          stickTouchId = null; stickOrigin = null;
          knob.style.transform = 'translate(0,0)';
          this.moveX = 0; this.moveZ = 0;
        }
        if (t.identifier === look.touchId) look.touchId = null;
      }
    });
    this.stickEl = stick;
  }

  setFireButtonVisible(v) {
    if (this.fireBtn) this.fireBtn.style.display = v ? 'block' : 'none';
  }

  // 毎フレーム呼び出し: カメラのyaw/pitchを適用し、移動ベクトルを返す
  update() {
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;

    let mx = this.moveX, mz = -this.moveZ;
    if (!isTouch) {
      mx = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
      mz = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
    }
    if (!this.enabled || this.moveLocked) { mx = 0; mz = 0; }
    return { moveX: mx, moveZ: mz };
  }
}

export { isTouch };
