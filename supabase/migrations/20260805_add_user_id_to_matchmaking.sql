-- matchmaking_queueにuser_idカラムを追加
-- マッチング時に正しいユーザーIDをルームに設定するため

ALTER TABLE matchmaking_queue ADD COLUMN user_id UUID;

-- インデックス追加
CREATE INDEX idx_matchmaking_user_id ON matchmaking_queue(user_id);
