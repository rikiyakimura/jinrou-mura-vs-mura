-- 人狼 村vs村 - 自動マッチング用テーブル

-- マッチングキューテーブル
CREATE TABLE matchmaking_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  game_options JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'matched', 'expired', 'cancelled')),
  room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- インデックス
CREATE INDEX idx_matchmaking_status ON matchmaking_queue(status);
CREATE INDEX idx_matchmaking_options ON matchmaking_queue(game_options);
CREATE INDEX idx_matchmaking_created ON matchmaking_queue(created_at);

-- 古いエントリを自動削除（5分以上前のwaiting）
CREATE OR REPLACE FUNCTION cleanup_old_matchmaking()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM matchmaking_queue
  WHERE status = 'waiting'
    AND created_at < NOW() - INTERVAL '5 minutes';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 新規挿入時に古いエントリをクリーンアップ
CREATE TRIGGER trigger_cleanup_matchmaking
  AFTER INSERT ON matchmaking_queue
  FOR EACH STATEMENT
  EXECUTE FUNCTION cleanup_old_matchmaking();

-- Realtime有効化
ALTER PUBLICATION supabase_realtime ADD TABLE matchmaking_queue;

-- RLS
ALTER TABLE matchmaking_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read matchmaking_queue"
  ON matchmaking_queue FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert matchmaking_queue"
  ON matchmaking_queue FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update matchmaking_queue"
  ON matchmaking_queue FOR UPDATE
  USING (true);

CREATE POLICY "Anyone can delete matchmaking_queue"
  ON matchmaking_queue FOR DELETE
  USING (true);
