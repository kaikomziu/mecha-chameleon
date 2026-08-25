# 🦎 めっちゃカメレオン Web

スマホとPCでクロスプレイできる、擬態×かくれんぼのブラウザ向けマルチプレイゲーム。
ビルド不要の素のHTML/CSS/JS(ES Modules)+ Three.js(擬似3D一人称)+ Supabase(認証・部屋・ランク・リアルタイム同期)。

## 遊び方
1. メールアドレス+パスワードで新規登録すると、そのままログイン状態になる(確認メール・パスワードリセットの機能はなし)
2. 部屋を作成 (プライベート/公開、最大人数、カメレオン(隠れる側)人数を設定) or コード/野良で参加。一人でも🤖ボット(CPU)を入れて練習できる
3. 隠れる側は制限時間内にポーズを選び、自分の体を自由ブラシで塗って背景に擬態
4. 鬼は歩き回って怪しい場所をクリック/タップして発砲
5. 全員見つければ鬼の勝ち、時間切れで生き残りがいれば隠れる側の勝ち
6. 勝つほどランクが上昇: ブロンズ→シルバー→ゴールド→プラチナ→ダイヤモンド→マスター

## セットアップ(必須・1分)
このアプリはメール確認・パスワードリセットの機能を持たないため、**Supabase側の「メール確認」を必ずオフにする必要があります**。オンのままだと新規登録してもログインできません(復旧手段がありません)。

Supabaseダッシュボード( https://supabase.com/dashboard/project/kifnzvktwbomxthzvvgy/auth/providers )→ Email プロバイダー設定 → **「Confirm email」のチェックを外して保存** するだけです。外部アカウント作成は不要。

なお、パスワードを忘れたユーザーの救済手段が無いため、**万一パスワードを忘れたら新しい別メールアドレスで再登録**してもらう運用になります(ランク・戦績は新アカウントに引き継がれません)。

## 技術構成
- フロントエンド: 素のES Modules (ビルド不要、GitHub Pagesでそのまま動作)
- 3Dエンジン: Three.js (CDN経由、esm.sh)
- バックエンド: Supabase (Postgres + Auth + Realtime Broadcast/Presence)
  - プロジェクト: `mc_` 接頭辞のテーブル群のみ使用(既存の他サイト用テーブルとは分離)
- リアルタイム同期: 位置・視点・ペイント・発砲・投票スキップは Realtime Broadcast(DB非経由・低遅延)
- 永続データ: 部屋メタ情報・プロフィール・ランク・対戦結果は Postgres(RLSで自分の行のみ更新可)

## ディレクトリ構成
全JSファイルは変更しやすさのため200行以内に分割している。

```
index.html            # 認証/ロビー/部屋待機/ゲームの4画面を持つSPA
css/style.css
js/
  config.js            # Supabase接続情報・ランク閾値・ゲームバランス
  supabaseClient.js
  auth.js              # メール/ゲスト認証・プロフィール取得
  network.js           # Realtime Broadcastラッパー
  chat.js / chatUI.js  # 部屋チャット(Broadcast)・入力中インジケーター・DOM組み立て
  rank.js              # ランキング取得
  rooms.js             # 部屋の基本CRUD(作成/参加/退出/購読)
  roomBots.js          # CPU(ボット)の追加/削除
  roomLifecycle.js     # ゲーム開始/フェーズ進行/ラウンド終了/ロビー復帰
  appState.js          # 画面遷移・共有state(他UIモジュールから参照)
  authUI.js            # ログイン/新規登録/ゲスト参加/プロフィールのUI配線
  lobbyUI.js           # ロビー(部屋作成/コード参加/野良一覧/ランキング)のUI配線
  roomUI.js            # 部屋待機画面〜ゲーム画面マウントのUI配線
  app.js               # 起動エントリーポイント(上記UIモジュールを読み込むだけ)
  game/
    game.js             # ゲームのコア(constructor/メインループ/初期化)
    gamePhases.js        # フェーズ遷移(隠れる/索敵/結果)・ペイントモード
    gameNetwork.js       # リモートプレイヤー同期・擬態(色合わせ)判定
    gameCombat.js        # 発砲・投票スキップ・タイムアウト解決
    gameHud.js           # HUD(画面上のUI要素)構築
    botAI.js             # CPUの移動・擬態・索敵AIシミュレーション
    world.js             # マップ生成・簡易コリジョン・視線判定
    textures.js           # プロシージャルテクスチャ
    character.js          # ペイント可能なキャラクターメッシュ
    colorUtils.js          # 擬態の色合わせ判定用ユーティリティ
    controls.js            # PC(ポインターロック)/スマホ(仮想スティック)入力統一
    paint.js                # 擬態ペイントUI
```

`game.js`本体は`gamePhases.js`等のメソッド群を`Object.assign(Game.prototype, ...)`で合体させて1つのクラスとして振る舞う(呼び出し側からは分割を意識しなくてよい)。
