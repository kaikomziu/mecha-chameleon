import { ChatChannel } from './chat.js';
import { getUser } from './auth.js';

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// container にチャットUIを組み立てて設置する。compact:true だと吹き出しボタンで開閉する
// ゲーム画面向けのコンパクト版になる。
export function mountChat(container, roomId, { compact = false } = {}) {
  const root = document.createElement('div');
  root.className = compact ? 'chat-widget chat-compact' : 'chat-widget';
  root.innerHTML = `
    ${compact ? '<button class="chat-toggle">💬</button>' : ''}
    <div class="chat-panel${compact ? ' hidden' : ''}">
      <div class="chat-messages"></div>
      <div class="chat-input-row">
        <input class="chat-input" type="text" maxlength="200" placeholder="メッセージを入力…">
        <button class="chat-send">送信</button>
      </div>
    </div>`;
  container.appendChild(root);

  const messagesEl = root.querySelector('.chat-messages');
  const inputEl = root.querySelector('.chat-input');
  const panel = root.querySelector('.chat-panel');
  const toggleBtn = root.querySelector('.chat-toggle');

  let unread = 0;
  function appendMessage({ userId, name, text }) {
    const div = document.createElement('div');
    div.className = 'chat-msg' + (userId === getUser()?.id ? ' me' : '');
    div.innerHTML = `<span class="chat-name">${escapeHtml(name)}</span><span class="chat-text">${escapeHtml(text)}</span>`;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    if (compact && panel.classList.contains('hidden')) {
      unread++;
      toggleBtn.textContent = `💬 ${unread}`;
    }
  }

  const chat = new ChatChannel(roomId);
  chat.onMessage(appendMessage);
  chat.subscribe();

  function doSend() {
    chat.send(inputEl.value);
    inputEl.value = '';
  }
  root.querySelector('.chat-send').addEventListener('click', doSend);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSend();
    e.stopPropagation(); // ゲーム側のWASD等キー操作に文字入力が奪われないように
  });

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      panel.classList.toggle('hidden');
      if (!panel.classList.contains('hidden')) {
        unread = 0;
        toggleBtn.textContent = '💬';
        document.exitPointerLock?.(); // チャット欄をマウスで操作できるようにロック解除
        inputEl.focus();
      }
    });
  }

  return { destroy: () => { chat.destroy(); root.remove(); } };
}
