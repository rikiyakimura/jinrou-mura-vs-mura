-- 古いルームの自動削除（1時間更新なし）
-- pg_cron 拡張を使用

-- 1. pg_cron 拡張を有効化（Supabaseダッシュボードで有効にする必要あり）
-- CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 2. 毎時0分に1時間以上更新のないルームを削除
-- Supabase SQL Editorで実行:
/*
SELECT cron.schedule(
  'cleanup-old-rooms',
  '0 * * * *',
  $$
    DELETE FROM rooms
    WHERE updated_at < NOW() - INTERVAL '1 hour';
  $$
);
*/

-- 手動で古いルームを削除するためのファンクション
CREATE OR REPLACE FUNCTION cleanup_old_rooms()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM rooms
  WHERE updated_at < NOW() - INTERVAL '1 hour';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- 使用例: SELECT cleanup_old_rooms();
