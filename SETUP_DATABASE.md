# データベースセットアップ手順

## Supabaseへのマイグレーション実行

### 手順

1. **Supabase Dashboardにアクセス**
   - URL: https://supabase.com/dashboard
   - プロジェクト: `zdrdpiikttpjxztcvgrk`

2. **SQL Editorを開く**
   - 左メニューから「SQL Editor」を選択
   - 「New query」をクリック

3. **マイグレーションを実行**
   - `supabase/migrations/20260101_initial_schema.sql` の内容をコピー
   - SQL Editorに貼り付け
   - 「Run」ボタンをクリック

4. **実行結果の確認**
   - エラーがないことを確認
   - 「Success. No rows returned」と表示されればOK

5. **テーブルの確認**
   - 左メニューから「Table Editor」を選択
   - 以下のテーブルが作成されていることを確認:
     - `rooms`
     - `game_states`
     - `player_actions`

### 作成されるテーブル

#### rooms
- ルーム管理テーブル
- 4桁の暗証番号でルーム作成・参加

#### game_states
- ゲーム進行状態を保存
- リアルタイム同期の対象

#### player_actions
- プレイヤーの行動履歴
- デバッグ・リプレイ用

### Realtime機能

`game_states`と`rooms`テーブルでRealtime機能が有効化されています。
これにより、他のプレイヤーの行動がリアルタイムで反映されます。

### セキュリティ

Row Level Security (RLS)が有効化されています。
現在は開発用に全員アクセス可能に設定していますが、
本番環境では認証を追加して制限することを推奨します。

---

## トラブルシューティング

### エラー: "relation already exists"
- テーブルが既に存在している場合は、削除してから再実行してください
- SQL Editor で以下を実行:
  ```sql
  DROP TABLE IF EXISTS player_actions CASCADE;
  DROP TABLE IF EXISTS game_states CASCADE;
  DROP TABLE IF EXISTS rooms CASCADE;
  ```

### Realtime が動作しない
- Table Editor で各テーブルを開き、「Realtime」タブで有効化されているか確認
- または以下のSQLを実行:
  ```sql
  ALTER PUBLICATION supabase_realtime ADD TABLE game_states;
  ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
  ```
