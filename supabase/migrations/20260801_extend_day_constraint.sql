-- current_day の制約を 1-5 に拡張（7軒バージョン対応）
-- 従来: current_day >= 1 AND current_day <= 3
-- 変更後: current_day >= 1 AND current_day <= 5

ALTER TABLE game_states
  DROP CONSTRAINT IF EXISTS game_states_current_day_check;

ALTER TABLE game_states
  ADD CONSTRAINT game_states_current_day_check
  CHECK (current_day >= 1 AND current_day <= 5);
