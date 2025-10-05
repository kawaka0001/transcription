-- Humanity1 文字起こしアプリのSupabaseテーブル設計
-- このSQLをSupabase SQLエディタで実行してください

-- 文字起こしデータを保存するテーブル
CREATE TABLE IF NOT EXISTS transcripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  text TEXT NOT NULL,
  timestamp BIGINT NOT NULL, -- Unix timestamp (milliseconds)
  is_final BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,

  -- インデックス：タイムスタンプ順で高速検索
  -- 日付範囲検索やページネーションで使用
  CONSTRAINT transcripts_timestamp_idx UNIQUE (timestamp)
);

-- タイムスタンプでの高速検索用インデックス
CREATE INDEX IF NOT EXISTS idx_transcripts_timestamp ON transcripts(timestamp DESC);

-- 作成日時での検索用インデックス（日付範囲検索で使用）
CREATE INDEX IF NOT EXISTS idx_transcripts_created_at ON transcripts(created_at DESC);

-- フルテキスト検索用インデックス（将来的な検索機能のため）
CREATE INDEX IF NOT EXISTS idx_transcripts_text_search ON transcripts USING gin(to_tsvector('japanese', text));

-- Row Level Security (RLS)を有効化
-- 認証なしでも使えるように、すべてのユーザーに読み書き権限を付与
-- 本番環境では認証を追加することを推奨
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;

-- 匿名ユーザーでも読み書き可能なポリシー（開発用）
-- 本番環境では削除して、認証ベースのポリシーに変更してください
CREATE POLICY "Enable read access for all users" ON transcripts
  FOR SELECT USING (true);

CREATE POLICY "Enable insert access for all users" ON transcripts
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update access for all users" ON transcripts
  FOR UPDATE USING (true);

CREATE POLICY "Enable delete access for all users" ON transcripts
  FOR DELETE USING (true);

-- コメント
COMMENT ON TABLE transcripts IS '音声文字起こしデータの永久保存用テーブル';
COMMENT ON COLUMN transcripts.id IS 'UUID主キー';
COMMENT ON COLUMN transcripts.text IS '文字起こしテキスト';
COMMENT ON COLUMN transcripts.timestamp IS 'Unix timestamp (ミリ秒)';
COMMENT ON COLUMN transcripts.is_final IS '確定フラグ（trueは確定、falseは暫定）';
COMMENT ON COLUMN transcripts.created_at IS 'レコード作成日時（UTC）';
COMMENT ON COLUMN transcripts.synced_at IS 'IndexedDBから同期された日時（UTC）';
