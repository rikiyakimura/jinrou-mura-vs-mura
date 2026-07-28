-- 人狼 村vs村 - 初期データベーススキーマ
-- ルーム管理と通信対戦のためのテーブル

-- 1. rooms テーブル: 対戦ルーム管理
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code TEXT NOT NULL UNIQUE,
  host_player_name TEXT NOT NULL,
  guest_player_name TEXT,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished')),
  game_options JSONB NOT NULL DEFAULT '{"madmanDog": false, "medium": false, "pit": false}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- room_code にインデックス（高速検索用）
CREATE INDEX idx_rooms_room_code ON rooms(room_code);
CREATE INDEX idx_rooms_status ON rooms(status);

-- 2. game_states テーブル: ゲーム進行状態
CREATE TABLE game_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  game_data JSONB NOT NULL,
  current_player INTEGER NOT NULL CHECK (current_player IN (1, 2)),
  current_phase TEXT NOT NULL,
  current_day INTEGER CHECK (current_day >= 1 AND current_day <= 3),
  waiting_for_player INTEGER CHECK (waiting_for_player IN (1, 2)),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(room_id)  -- 1ルームにつき1つのゲーム状態
);

-- room_id にインデックス
CREATE INDEX idx_game_states_room_id ON game_states(room_id);

-- 3. player_actions テーブル: プレイヤーアクション履歴
CREATE TABLE player_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL CHECK (player_id IN (1, 2)),
  action_type TEXT NOT NULL,
  action_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- room_id と created_at に複合インデックス
CREATE INDEX idx_player_actions_room_created ON player_actions(room_id, created_at DESC);

-- 4. updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_rooms_updated_at
  BEFORE UPDATE ON rooms
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_game_states_updated_at
  BEFORE UPDATE ON game_states
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 5. Realtime 有効化
-- game_states テーブルでリアルタイム同期を有効にする
ALTER PUBLICATION supabase_realtime ADD TABLE game_states;
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;

-- 6. Row Level Security (RLS) 有効化
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_actions ENABLE ROW LEVEL SECURITY;

-- RLS ポリシー: rooms
-- 全員が読み取り可能（room_code で検索するため）
CREATE POLICY "Anyone can read rooms"
  ON rooms FOR SELECT
  USING (true);

-- 全員がルーム作成可能
CREATE POLICY "Anyone can create rooms"
  ON rooms FOR INSERT
  WITH CHECK (true);

-- ルームの更新は誰でも可能（ゲスト参加時に更新）
CREATE POLICY "Anyone can update rooms"
  ON rooms FOR UPDATE
  USING (true);

-- RLS ポリシー: game_states
-- 全員が読み取り可能（簡易版、後で厳格化可能）
CREATE POLICY "Anyone can read game_states"
  ON game_states FOR SELECT
  USING (true);

-- 全員が作成・更新可能
CREATE POLICY "Anyone can create game_states"
  ON game_states FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update game_states"
  ON game_states FOR UPDATE
  USING (true);

-- RLS ポリシー: player_actions
-- 全員が読み取り可能
CREATE POLICY "Anyone can read player_actions"
  ON player_actions FOR SELECT
  USING (true);

-- 全員がアクション記録可能
CREATE POLICY "Anyone can create player_actions"
  ON player_actions FOR INSERT
  WITH CHECK (true);

-- 注: 本番環境では、認証を追加してポリシーを厳格化することを推奨
-- 現在は簡易版として全員アクセス可能に設定
