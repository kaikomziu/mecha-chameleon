// エントリーポイント。各UIモジュールを読み込む(副作用でイベントリスナーが登録される)。
import { initAuth } from './authUI.js';
import './lobbyUI.js';
import './roomUI.js';

initAuth();
