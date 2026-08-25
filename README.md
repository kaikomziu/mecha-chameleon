# 🦎 めっちゃカメレオン Web

スマホとPCでクロスプレイできる、擬態×かくれんぼのブラウザ向けマルチプレイゲーム。
ビルド不要の素のHTML/CSS/JS(ES Modules)+ Three.js(擬似3D一人称)+ Supabase(認証・部屋・ランク・リアルタイム同期)。

## 遊び方
1. メールアドレス+パスワードで新規登録(確認メールのリンクを開いてからログイン)
2. 部屋を作成 (プライベート/公開、最大人数、カメレオン(隠れる側)人数を設定) or コード/野良で参加
3. 隠れる側は制限時間内にポーズを選び、自分の体を自由ブラシで塗って背景に擬態
4. 鬼は歩き回って怪しい場所をクリック/タップして発砲
5. 全員見つければ鬼の勝ち、時間切れで生き残りがいれば隠れる側の勝ち
6. 勝つほどランクが上昇: ブロンズ→シルバー→ゴールド→プラチナ→ダイヤモンド→マスター

## セットアップ
メール+パスワード認証は**追加の手動セットアップ不要**(Google OAuthのようなCloud Console作業なし)。
新規登録すると、Supabaseの組み込みメーラーから確認メールが届くので、リンクを開いてからログインする(迷惑メールフォルダに入ることがあるので注意)。

### 電話番号(SMS)ログインを有効にする場合(必須ではない・あなたの作業)
電話番号ログインはコード側の実装済みですが、SMS送信を代行する外部プロバイダの契約がないと動きません(Supabaseが直接SMSは送れないため)。
Supabaseが対応しているのは Twilio / Twilio Verify / MessageBird / Vonage / TextLocal。日本の携帯番号に送るなら Twilio が実績豊富です。

1. https://www.twilio.com/try-twilio でアカウントを作成し、電話番号を1つ購入(無料トライアルには使える範囲に制限あり)
2. コンソールから「Account SID」「Auth Token」と、購入した送信元番号(またはMessaging Service SID)を控える
3. Supabaseダッシュボード( https://supabase.com/dashboard/project/kifnzvktwbomxthzvvgy/auth/providers )の「Phone」プロバイダーをオンにし、Twilioの認証情報を入力して保存
4. 同ダッシュボードの Authentication → Sign In / Providers で「Enable phone confirmations」もオンにしておく

**注意点:**
- Twilio等の契約作業はGoogle Cloud Consoleと同様にサービス提供者側の年齢・利用規約の制約を受ける可能性があります(先にGoogleで年齢制限に当たった場合、Twilioでも同様の壁に当たる可能性があります)。
- SMS送信は基本的に**1通ごとに課金**されます(メール認証は無料)。無料トライアル分を使い切ると送信が止まるので注意。
- この設定が完了するまでは、ログイン画面の「電話番号」タブでコード送信を押すとエラーになりますが、メール+パスワードでのログインには影響しません。

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
