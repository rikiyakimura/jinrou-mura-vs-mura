-- プレイヤー戦績の拡張（5軒/9軒別、完封/追放、連勝など）

-- ネット対戦（5軒）
ALTER TABLE players ADD COLUMN IF NOT EXISTS online_wins_classic INT DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS online_losses_classic INT DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS online_draws_classic INT DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS online_shutout_classic INT DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS online_expel_classic INT DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS online_survivors_classic INT DEFAULT 0;

-- ネット対戦（9軒）
ALTER TABLE players ADD COLUMN IF NOT EXISTS online_wins_large INT DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS online_losses_large INT DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS online_draws_large INT DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS online_shutout_large INT DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS online_expel_large INT DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS online_survivors_large INT DEFAULT 0;

-- ネット対戦（共通）
ALTER TABLE players ADD COLUMN IF NOT EXISTS online_max_streak INT DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS online_current_streak INT DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS online_disconnect INT DEFAULT 0;

-- CPU対戦（5軒）
ALTER TABLE players ADD COLUMN IF NOT EXISTS cpu_wins_classic INT DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS cpu_losses_classic INT DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS cpu_draws_classic INT DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS cpu_shutout_classic INT DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS cpu_expel_classic INT DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS cpu_survivors_classic INT DEFAULT 0;

-- CPU対戦（9軒）
ALTER TABLE players ADD COLUMN IF NOT EXISTS cpu_wins_large INT DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS cpu_losses_large INT DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS cpu_draws_large INT DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS cpu_shutout_large INT DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS cpu_expel_large INT DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS cpu_survivors_large INT DEFAULT 0;

-- CPU対戦（共通）
ALTER TABLE players ADD COLUMN IF NOT EXISTS cpu_max_streak INT DEFAULT 0;
ALTER TABLE players ADD COLUMN IF NOT EXISTS cpu_current_streak INT DEFAULT 0;
