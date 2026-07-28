# データベーススキーマ設計

## テーブル構成

### 1. rooms（ルーム管理）

対戦ルームの情報を管理。

```sql
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT NOT NULL UNIQUE,           -- 4桁の暗証番号
  host_player_name TEXT NOT NULL,           -- ホストのプレイヤー名
  guest_player_name TEXT,                   -- ゲストのプレイヤー名
  status TEXT NOT NULL DEFAULT 'waiting',   -- waiting, playing, finished
  game_options JSONB NOT NULL,              -- {madmanDog: bool, medium: bool, pit: bool}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**インデックス:**
- `room_code` にユニークインデックス（高速検索用）

**status の値:**
- `waiting`: ルーム作成済み、ゲスト待ち
- `playing`: ゲーム進行中
- `finished`: ゲーム終了

---

### 2. game_states（ゲーム状態）

ゲームの進行状態を保存。リアルタイム同期の対象。

```sql
CREATE TABLE game_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  game_data JSONB NOT NULL,                 -- ゲーム全体の状態（Gオブジェクト）
  current_player INTEGER NOT NULL,          -- 1 or 2（現在のターンのプレイヤー）
  current_phase TEXT NOT NULL,              -- place, pit, explorer, route, ticks, night, morning, end
  current_day INTEGER,                      -- 1-3（NULL = ゲーム開始前）
  waiting_for_player INTEGER,               -- 1 or 2（入力待ちのプレイヤー）
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**インデックス:**
- `room_id` に外部キー制約とインデックス

**game_data の構造:**
- 現在のmain.jsの`G`オブジェクトをそのままJSON化
- プレイヤー1と2の村の状態、ログ、スケジュールなど全て含む

---

### 3. player_actions（プレイヤーアクション履歴）

各プレイヤーの行動を記録（デバッグ・リプレイ用）。

```sql
CREATE TABLE player_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL,               -- 1 or 2
  action_type TEXT NOT NULL,                -- place, explorer, route, attack, protect など
  action_data JSONB NOT NULL,               -- アクションの詳細データ
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**インデックス:**
- `room_id, created_at` に複合インデックス（時系列取得用）

---

## リアルタイム同期の仕組み

### Supabase Realtime の利用

1. **game_states テーブルをサブスクライブ**
   - プレイヤーは自分のルームの`game_states`を監視
   - 相手がアクションを実行すると、`game_states`が更新される
   - 変更通知を受け取り、ローカルの`G`オブジェクトを更新

2. **フロー**
   ```
   プレイヤーA: アクション実行
   ↓
   game_statesテーブルを更新（current_player, game_data）
   ↓
   Supabase Realtime が変更を配信
   ↓
   プレイヤーB: 変更通知を受信、画面を更新
   ```

---

## セキュリティ

### Row Level Security (RLS)

各テーブルにRLSポリシーを設定：

1. **rooms**
   - 読み取り: 全員可能（room_codeでの検索用）
   - 作成: 全員可能
   - 更新: そのルームの参加者のみ（セッション管理必要）

2. **game_states**
   - 読み取り: そのルームの参加者のみ
   - 作成・更新: そのルームの参加者のみ

3. **player_actions**
   - 読み取り: そのルームの参加者のみ
   - 作成: そのルームの参加者のみ

---

## マイグレーション順序

1. `rooms` テーブル作成
2. `game_states` テーブル作成
3. `player_actions` テーブル作成
4. インデックス追加
5. RLSポリシー設定
6. Realtime有効化
