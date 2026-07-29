-- 人狼 村vs村 - 同時入力システム用カラム追加
-- オンライン対戦で route/ticks/night フェーズを同時入力可能にする

-- game_states テーブルに3つのカラムを追加
ALTER TABLE game_states
  ADD COLUMN player1_ready BOOLEAN DEFAULT FALSE,
  ADD COLUMN player2_ready BOOLEAN DEFAULT FALSE,
  ADD COLUMN simultaneous_mode BOOLEAN DEFAULT FALSE;

-- コメント
COMMENT ON COLUMN game_states.player1_ready IS 'プレイヤー1が現在のフェーズを完了したか';
COMMENT ON COLUMN game_states.player2_ready IS 'プレイヤー2が現在のフェーズを完了したか';
COMMENT ON COLUMN game_states.simultaneous_mode IS '現在のフェーズが同時入力モードか';
