-- ============================================
-- Supabase RLS ポリシー設定
-- SQL Editor で実行してください
-- ============================================

-- 1. plants テーブルの user_id が UUID 型か確認
-- Table Editor > plants > user_id 列が uuid 型であること

-- 2. 既存ポリシーを削除
DROP POLICY IF EXISTS "Allow all actions for owner" ON plants;
DROP POLICY IF EXISTS "Users can only see their own plants" ON plants;
DROP POLICY IF EXISTS "Users can insert own plants" ON plants;
DROP POLICY IF EXISTS "Enable all access for own data" ON plants;

-- 3. plants テーブルに新規ポリシー（認証済みユーザーのみ、自分のデータのみ）
CREATE POLICY "plants_select_own"
  ON plants FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "plants_insert_own"
  ON plants FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "plants_update_own"
  ON plants FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "plants_delete_own"
  ON plants FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 4. logs テーブル
DROP POLICY IF EXISTS "Allow all actions for owner" ON logs;
DROP POLICY IF EXISTS "Users can only see their own logs" ON logs;

CREATE POLICY "logs_select_own"
  ON logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "logs_insert_own"
  ON logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "logs_update_own"
  ON logs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "logs_delete_own"
  ON logs FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- 5. RLS が有効か確認
-- SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('plants', 'logs');
