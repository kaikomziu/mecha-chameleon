// Gameクラスの「HUD(画面上のUI要素)構築」メソッド。
export const hudMethods = {
  _initHUD() {
    const hud = document.createElement('div');
    hud.className = 'game-hud';
    hud.innerHTML = `
      <div class="hud-top">
        <div class="hud-phase"></div>
        <div class="hud-timer">--</div>
        <div class="hud-role"></div>
      </div>
      <div class="hud-alive"></div>
      <button class="hud-repaint hidden">🎨 擬態を直す</button>
      <button class="hud-vote-skip">もうええよ (0/0)</button>
      <div class="hud-overlay hidden"><div class="hud-overlay-inner"></div></div>
      <div class="hit-flash hidden"></div>
      <div class="crosshair hidden">+</div>
    `;
    this.uiRoot.appendChild(hud);
    this.hud = hud;
    this.hud.querySelector('.hud-vote-skip').addEventListener('click', () => this._castVoteSkip());
    this.hud.querySelector('.hud-repaint').addEventListener('click', () => this._openPaintMode());
  },
};
