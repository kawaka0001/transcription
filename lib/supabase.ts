import { createClient } from '@supabase/supabase-js';

// 環境変数の検証
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase環境変数が設定されていません。.env.localファイルを確認してください。\n' +
    'NEXT_PUBLIC_SUPABASE_URL と NEXT_PUBLIC_SUPABASE_ANON_KEY が必要です。'
  );
}

// Supabaseクライアントの作成
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false, // 認証なしで使用する場合はfalse
  },
});

// 型定義
export interface TranscriptRow {
  id?: string;
  text: string;
  timestamp: number;
  is_final: boolean;
  created_at?: string;
  synced_at?: string;
}

/**
 * Supabaseに文字起こしデータを一括挿入
 * @param transcripts 文字起こしデータの配列
 * @returns 挿入されたレコード数
 */
export async function insertTranscripts(transcripts: TranscriptRow[]): Promise<number> {
  const { data, error } = await supabase
    .from('transcripts')
    .insert(transcripts)
    .select();

  if (error) {
    console.error('Supabase insert error:', error);
    throw new Error(`Supabaseへの保存に失敗しました: ${error.message}`);
  }

  return data?.length || 0;
}

/**
 * 指定期間の文字起こしデータを取得
 * @param startTimestamp 開始タイムスタンプ（ミリ秒）
 * @param endTimestamp 終了タイムスタンプ（ミリ秒）
 * @param limit 取得件数（デフォルト100）
 * @returns 文字起こしデータの配列
 */
export async function getTranscripts(
  startTimestamp?: number,
  endTimestamp?: number,
  limit: number = 100
): Promise<TranscriptRow[]> {
  let query = supabase
    .from('transcripts')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (startTimestamp) {
    query = query.gte('timestamp', startTimestamp);
  }

  if (endTimestamp) {
    query = query.lte('timestamp', endTimestamp);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Supabase select error:', error);
    throw new Error(`Supabaseからの取得に失敗しました: ${error.message}`);
  }

  return data || [];
}

/**
 * 全文検索（LIKE検索）
 * @param searchText 検索キーワード
 * @param limit 取得件数（デフォルト50）
 * @returns マッチした文字起こしデータの配列
 */
export async function searchTranscripts(
  searchText: string,
  limit: number = 50
): Promise<TranscriptRow[]> {
  const { data, error } = await supabase
    .from('transcripts')
    .select('*')
    .ilike('text', `%${searchText}%`)
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Supabase search error:', error);
    throw new Error(`検索に失敗しました: ${error.message}`);
  }

  return data || [];
}

/**
 * 古いデータの削除（指定日数より前のデータ）
 * @param daysToKeep 保持日数（デフォルト30日）
 * @returns 削除されたレコード数
 */
export async function deleteOldTranscripts(daysToKeep: number = 30): Promise<number> {
  const cutoffTimestamp = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;

  const { data, error } = await supabase
    .from('transcripts')
    .delete()
    .lt('timestamp', cutoffTimestamp)
    .select();

  if (error) {
    console.error('Supabase delete error:', error);
    throw new Error(`古いデータの削除に失敗しました: ${error.message}`);
  }

  return data?.length || 0;
}

/**
 * 統計情報の取得
 * @returns 総レコード数と最新のタイムスタンプ
 */
export async function getTranscriptStats(): Promise<{
  totalCount: number;
  latestTimestamp: number | null;
  oldestTimestamp: number | null;
}> {
  const { count, error: countError } = await supabase
    .from('transcripts')
    .select('*', { count: 'exact', head: true });

  if (countError) {
    console.error('Supabase count error:', countError);
    throw new Error(`統計情報の取得に失敗しました: ${countError.message}`);
  }

  const { data: latest } = await supabase
    .from('transcripts')
    .select('timestamp')
    .order('timestamp', { ascending: false })
    .limit(1)
    .single();

  const { data: oldest } = await supabase
    .from('transcripts')
    .select('timestamp')
    .order('timestamp', { ascending: true })
    .limit(1)
    .single();

  return {
    totalCount: count || 0,
    latestTimestamp: latest?.timestamp || null,
    oldestTimestamp: oldest?.timestamp || null,
  };
}
