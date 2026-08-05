-- playersテーブル作成（戦績管理用）
CREATE TABLE players (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '名無し',
  online_wins INT NOT NULL DEFAULT 0,
  online_losses INT NOT NULL DEFAULT 0,
  online_draws INT NOT NULL DEFAULT 0,
  cpu_wins INT NOT NULL DEFAULT 0,
  cpu_losses INT NOT NULL DEFAULT 0,
  cpu_draws INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_played_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLSを有効化
ALTER TABLE players ENABLE ROW LEVEL SECURITY;

-- 誰でも読める
CREATE POLICY "Players are viewable by everyone"
  ON players FOR SELECT USING (true);

-- 自分のレコードのみ更新可能
CREATE POLICY "Users can update own record"
  ON players FOR UPDATE USING (auth.uid() = id);

-- 自分のレコードのみ挿入可能
CREATE POLICY "Users can insert own record"
  ON players FOR INSERT WITH CHECK (auth.uid() = id);

-- インデックス（勝率でのソート用、将来のランキング機能向け）
CREATE INDEX idx_players_online_stats ON players (online_wins, online_losses);

-- roomsテーブルにユーザーID列を追加（戦績表示用）
ALTER TABLE rooms ADD COLUMN host_user_id UUID REFERENCES auth.users(id);
ALTER TABLE rooms ADD COLUMN guest_user_id UUID REFERENCES auth.users(id);
