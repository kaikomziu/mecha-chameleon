# 🦎 めっちゃカメレオン Web

スマホとPCでクロスプレイできる、擬態×かくれんぼのブラウザ向けマルチプレイゲーム。
ビルド不要の素のHTML/CSS/JS(ES Modules)+ Three.js(擬似3D一人称)+ Supabase(認証・部屋・ランク・リアルタイム同期)。

## 遊び方
1. Googleアカウントでログイン
2. 部屋を作成 (プライベート/公開、最大人数、カメレオン(隠れる側)人数を設定) or コード/野良で参加
3. 隠れる側は制限時間内にポーズを選び、自分の体を自由ブラシで塗って背景に擬態
4. 鬼は歩き回って怪しい場所をクリック/タップして発砲
5. 全員見つければ鬼の勝ち、時間切れで生き残りがいれば隠れる側の勝ち
6. 勝つほどランクが上昇: ブロンズ→シルバー→ゴールド→プラチナ→ダイヤモンド→マスター

## セットアップが必要な項目(あなたの作業)

### Google OAuthログインの有効化(必須)
Supabase側のGoogleログインを有効にするには、Google Cloud Console側でOAuthクライアントを発行する必要があります。

1. https://console.cloud.google.com/ にアクセスし、プロジェクトを作成(または既存のものを選択)
2. 「APIとサービス」→「OAuth同意画面」を設定(External、アプリ名は好きな名前でOK)
3. 「認証情報」→「認証情報を作成」→「OAuthクライアントID」→ アプリケーションの種類は「ウェブアプリケーション」
4. 「承認済みのリダイレクトURI」に以下を追加:
   ```
   https://kifnzvktwbomxthzvvgy.supabase.co/auth/v1/callback
   ```
5. 発行された「クライアントID」と「クライアントシークレット」をコピー
6. Supabaseダッシュボード( https://supabase.com/dashboard/project/kifnzvktwbomxthzvvgy/auth/providers )を開き、
   「Google」プロバイダーをオンにして、上記のクライアントID/シークレットを貼り付けて保存
7. 同ダッシュボードの Authentication → URL Configuration で、Site URL / Redirect URLs に
   公開後のGitHub PagesのURL(例: `https://kaikomziu.github.io/mecha-chameleon/`)を追加

これが終わるまでは「Googleでログイン」ボタンを押すとエラーになります。それ以外(部屋・ランク・DB)は既に本番稼働状態です。

## 技術構成
- フロントエンド: 素のES Modules (ビルド不要、GitHub Pagesでそのまま動作)
- 3Dエンジン: Three.js (CDN経由、esm.sh)
- バックエンド: Supabase (Postgres + Auth + Realtime Broadcast/Presence)
  - プロジェクト: `mc_` 接頭辞のテーブル群のみ使用(既存の他サイト用テーブルとは分離)
- リアルタイム同期: 位置・視点・ペイント・発砲・投票スキップは Realtime Broadcast(DB非経由・低遅延)
- 永続データ: 部屋メタ情報・プロフィール・ランク・対戦結果は Postgres(RLSで自分の行のみ更新可)

## ディレクトリ構成
```
index.html          # 認証/ロビー/部屋待機/ゲームの4画面を持つSPA
css/style.css
js/
  config.js          # Supabase接続情報・ランク閾値・ゲームバランス
  supabaseClient.js
  auth.js            # Googleログイン・プロフィール
  rooms.js           # 部屋作成/参加/開始/終了(DB)
  network.js         # Realtime Broadcastラッパー
  rank.js            # ランキング取得
  app.js             # 画面遷移・全体のつなぎこみ
  game/
    game.js           # ゲーム本体(フェーズ管理・当たり判定・同期)
    world.js           # マップ生成・簡易コリジョン
    textures.js         # プロシージャルテクスチャ
    character.js        # ペイント可能なキャラクターメッシュ
    controls.js         # PC(ポインターロック)/スマホ(仮想スティック)入力統一
    paint.js            # 擬態ペイントUI
```
