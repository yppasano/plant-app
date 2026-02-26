-- ============================================
-- Ageta: 水やりリマインダー・状態記録機能用スキーマ変更
-- Supabase SQL Editor で実行してください
-- ============================================

-- 1. plants テーブルに needs_water カラムを追加
ALTER TABLE plants
ADD COLUMN IF NOT EXISTS needs_water boolean DEFAULT false;

COMMENT ON COLUMN plants.needs_water IS '明日水やりが必要（土が乾いたマーカー）';

-- 2. logs テーブルに condition と tags カラムを追加
ALTER TABLE logs
ADD COLUMN IF NOT EXISTS condition text,
ADD COLUMN IF NOT EXISTS tags jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN logs.condition IS '状態記録のメイン区分（Good/Normal/Bad）';
COMMENT ON COLUMN logs.tags IS '状態記録の詳細タグ（複数選択可）';

-- 既存のログで condition/tags が NULL の場合は空で問題なし
-- RLS ポリシーは既存のまま（user_id, plant_db_id で制御）
