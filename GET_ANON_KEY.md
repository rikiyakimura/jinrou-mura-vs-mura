# Supabase Anon Key の取得手順

## 現在の状態

ルーム作成時に以下のエラーが発生しています：
```
Invalid API key - Double check your Supabase `anon` or `service_role` API key.
```

これは `src/js/supabase.js` に設定されている anon key が無効なためです。

---

## 解決手順

### 1. Supabase Dashboard にアクセス

1. ブラウザで開く: https://supabase.com/dashboard
2. ログイン（まだアカウントがない場合は作成）

### 2. プロジェクトを確認または作成

**既存のプロジェクトがある場合:**
- プロジェクト一覧から選択
- プロジェクトURL: `https://zdrdpiikttpjxztcvgrk.supabase.co` のプロジェクトを探す

**プロジェクトがない場合、新規作成:**
1. 「New Project」をクリック
2. プロジェクト名: `jinrou-mura-vs-mura`（任意）
3. Database Password: 強力なパスワードを設定（メモしておく）
4. Region: Northeast Asia (Tokyo) を推奨
5. 「Create new project」をクリック
6. プロジェクトの準備が完了するまで待つ（1-2分）

### 3. API Keyを取得

1. 左サイドバーの**歯車アイコン（Settings）**をクリック
2. 「Project Settings」内の **API** タブを選択
3. 「Project API keys」セクションを探す
4. **`anon` `public`** と書かれたキーを探す
   - これが `eyJhbGc...` で始まる長い文字列です
5. キーの右側にある**コピーアイコン**をクリック

### 4. プロジェクトURLを確認

同じ画面の「Project URL」をメモ:
- 例: `https://abcdefghijklmnop.supabase.co`

### 5. コードに設定

#### A. `src/js/supabase.js` を編集

```javascript
// 6行目と7行目を更新
const SUPABASE_URL = 'ここにProject URLを貼り付け';
const SUPABASE_ANON_KEY = 'ここにanon public keyを貼り付け';
```

**例:**
```javascript
const SUPABASE_URL = 'https://abcdefghijklmnop.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTcwMDAwMDAwMCwiZXhwIjoyMDE1NTc2MDAwfQ.XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
```

---

## 6. データベースマイグレーション実行

Supabase Dashboardで:

1. 左サイドバーから **SQL Editor** を選択
2. 「New query」をクリック
3. プロジェクト内の `supabase/migrations/20260101_initial_schema.sql` ファイルを開く
4. **全ての内容をコピー**
5. SQL Editorに貼り付け
6. 「Run」または「Ctrl+Enter」で実行
7. 成功メッセージ「Success. No rows returned」を確認

### テーブルの確認

1. 左サイドバーから **Table Editor** を選択
2. 以下のテーブルが作成されていることを確認:
   - `rooms`
   - `game_states`
   - `player_actions`

---

## 7. 動作確認

```bash
# 開発サーバーを再起動
npm run dev
```

ブラウザで http://localhost:5174/ を開き:
1. 「オンライン対戦」をクリック
2. 「ルームを作成」をクリック
3. プレイヤー名を入力
4. 「ルーム作成」をクリック
5. **4桁の暗証番号が表示されれば成功！**

---

## トラブルシューティング

### エラー: "Invalid API key"
- anon key が正しくコピーされているか確認
- キーの前後に余分なスペースがないか確認

### エラー: "relation does not exist"
- データベースマイグレーションが実行されていない
- STEP 6 を実行してください

### その他のエラー
- ブラウザのコンソール（F12キー）でエラーメッセージを確認
- エラーメッセージを教えていただければサポートします

---

## セキュリティ注意

### ⚠️ 重要
- `anon key` は公開キーで、クライアント側で使用されます
- **Gitにコミットする前に確認**: anon keyはパブリックなので問題ありませんが、`service_role key`（秘密鍵）は**絶対にコミットしないでください**

### 本番環境での推奨事項
- 環境変数として管理
- Vercelの環境変数に設定
- Row Level Security (RLS) でアクセス制御
