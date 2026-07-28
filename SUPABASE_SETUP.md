# Supabase セットアップガイド

オンライン対戦機能を有効にするために、以下の手順でSupabaseをセットアップしてください。

## 1. データベースマイグレーションの実行

### 手順

1. **Supabase Dashboardにアクセス**
   - URL: https://supabase.com/dashboard
   - プロジェクト: `zdrdpiikttpjxztcvgrk` を選択

2. **SQL Editorを開く**
   - 左メニューから「SQL Editor」を選択
   - 「New query」をクリック

3. **マイグレーションSQLを実行**
   - `supabase/migrations/20260101_initial_schema.sql` ファイルを開く
   - 全ての内容をコピー
   - SQL Editorに貼り付けて「Run」をクリック
   - 「Success. No rows returned」と表示されれば成功

4. **テーブルの確認**
   - 左メニューから「Table Editor」を選択
   - 以下のテーブルが作成されていることを確認:
     - `rooms` - ルーム管理
     - `game_states` - ゲーム状態
     - `player_actions` - アクション履歴

---

## 2. Anonymous Key (anon key) の取得

### 手順

1. **Project Settings を開く**
   - 左メニュー下部の歯車アイコン（Settings）をクリック
   - 「API」タブを選択

2. **APIキーをコピー**
   - 「Project API keys」セクションを探す
   - `anon` `public` と書かれたキーをコピー
   - このキーは `eyJ...` で始まる長い文字列

3. **コードに設定**
   - `src/js/supabase.js` ファイルを開く
   - 8行目の `SUPABASE_ANON_KEY` の値を、コピーしたキーに置き換える

   ```javascript
   const SUPABASE_ANON_KEY = 'ここにコピーしたanon keyを貼り付け';
   ```

### セキュリティ注意事項

- `anon key`はクライアント側で使用される公開キーです
- Row Level Security (RLS)によって保護されています
- `service_role key`（秘密鍵）は絶対にクライアント側で使用しないでください

---

## 3. Realtime 機能の確認

### 手順

1. **Table Editor でテーブルを開く**
   - `game_states` テーブルを選択

2. **Realtime を確認**
   - 画面右側の「Realtime」タブをクリック
   - 「Enabled」になっていることを確認
   - 無効の場合は「Enable」をクリック

3. **rooms テーブルも同様に確認**
   - `rooms` テーブルでもRealtime が有効か確認

---

## 4. 動作確認

### ローカルでテスト

1. **開発サーバーを起動**
   ```bash
   npm run dev
   ```

2. **ブラウザで開く**
   - http://localhost:5173/ にアクセス

3. **オンライン対戦をテスト**
   - 「オンライン対戦」ボタンをクリック
   - 「ルームを作成」で4桁の暗証番号を取得
   - 別のブラウザ（またはシークレットウィンドウ）で同じURLを開く
   - 「ルームに参加」で暗証番号を入力
   - 対戦が開始されることを確認

---

## トラブルシューティング

### エラー: "relation does not exist"
- マイグレーションが正しく実行されていません
- SETUP_DATABASE.mdの手順を再確認してください

### Realtime が動作しない
- ブラウザのコンソールでエラーを確認
- Supabase DashboardでRealtimeが有効か確認
- anon keyが正しく設定されているか確認

### ルームが見つからない
- データベースが正しくセットアップされているか確認
- ブラウザのコンソールでエラーログを確認
- Supabase Dashboard の Table Editor で `rooms` テーブルを確認

---

## 補足情報

### データベーススキーマ

詳細は `database-schema.md` を参照してください。

### API エンドポイント

- Supabase URL: https://zdrdpiikttpjxztcvgrk.supabase.co
- REST API: https://zdrdpiikttpjxztcvgrk.supabase.co/rest/v1/
- Realtime: wss://zdrdpiikttpjxztcvgrk.supabase.co/realtime/v1/websocket

### セキュリティ

現在の実装はプロトタイプ版です。本番環境では以下を推奨:
- 認証機能の追加（Supabase Auth）
- RLS ポリシーの厳格化
- Rate limiting の設定
