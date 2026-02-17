/**
 * 環境変数から Supabase 設定を取得
 * Vercel 等では環境変数に VITE_SUPABASE_URL, VITE_SUPABASE_KEY を設定してください
 */
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || '';
