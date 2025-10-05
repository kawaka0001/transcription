import type { Transcript } from '@/types/speech';
import {
  getIndexedDBCount,
  deleteOldFromIndexedDB,
  getAllFromIndexedDB,
} from './indexeddb-storage';
import { insertTranscripts, type TranscriptRow } from './supabase';
import { logger } from './logger';

const LOCATION = 'lib/sync-manager.ts';

// 設定
const MAX_INDEXEDDB_COUNT = 300; // IndexedDBに保持する最大件数
const SYNC_BATCH_SIZE = 50; // 1回の同期で送信する件数
const SYNC_INTERVAL_MS = 60 * 1000; // 同期間隔（1分）

// 同期状態の管理
let isSyncing = false;
let lastSyncTime = 0;
let syncIntervalId: NodeJS.Timeout | null = null;

/**
 * IndexedDBからSupabaseへの同期を実行
 * @param force 強制実行フラグ（デフォルトfalse）
 * @returns 同期されたレコード数
 */
export async function syncToSupabase(force: boolean = false): Promise<number> {
  // 既に同期中の場合はスキップ
  if (isSyncing && !force) {
    logger.debug(
      `${LOCATION}:syncToSupabase`,
      '同期スキップ',
      '既に同期処理が実行中のためスキップしました',
      {}
    );
    return 0;
  }

  try {
    isSyncing = true;

    // IndexedDB内のデータ数を確認
    const count = await getIndexedDBCount();

    if (count <= MAX_INDEXEDDB_COUNT && !force) {
      logger.debug(
        `${LOCATION}:syncToSupabase`,
        '同期不要',
        'IndexedDBのデータ数が閾値以下のため同期をスキップしました',
        {
          currentCount: count,
          maxCount: MAX_INDEXEDDB_COUNT,
        }
      );
      return 0;
    }

    logger.info(
      `${LOCATION}:syncToSupabase`,
      '同期開始',
      'IndexedDBからSupabaseへの同期を開始します',
      {
        currentCount: count,
        maxCount: MAX_INDEXEDDB_COUNT,
        force,
      }
    );

    // 削除対象のデータを取得（古い順に）
    const toSync = await deleteOldFromIndexedDB(MAX_INDEXEDDB_COUNT);

    if (toSync.length === 0) {
      logger.debug(
        `${LOCATION}:syncToSupabase`,
        '同期対象なし',
        '同期対象のデータがありませんでした',
        {}
      );
      return 0;
    }

    // Supabase用のデータ形式に変換
    const transcriptRows: TranscriptRow[] = toSync.map(t => ({
      text: t.text,
      timestamp: t.timestamp,
      is_final: t.isFinal,
    }));

    // バッチで同期（一度に大量送信しないように分割）
    let totalSynced = 0;
    for (let i = 0; i < transcriptRows.length; i += SYNC_BATCH_SIZE) {
      const batch = transcriptRows.slice(i, i + SYNC_BATCH_SIZE);

      try {
        const syncedCount = await insertTranscripts(batch);
        totalSynced += syncedCount;

        logger.debug(
          `${LOCATION}:syncToSupabase`,
          '同期バッチ完了',
          `${syncedCount}件のデータをSupabaseに同期しました`,
          {
            batchNumber: Math.floor(i / SYNC_BATCH_SIZE) + 1,
            syncedCount,
            totalSynced,
            remaining: transcriptRows.length - i - batch.length,
          }
        );
      } catch (error) {
        logger.error(
          `${LOCATION}:syncToSupabase`,
          '同期バッチ失敗',
          `バッチ同期に失敗しました（${i}〜${i + batch.length}件目）`,
          {
            batchNumber: Math.floor(i / SYNC_BATCH_SIZE) + 1,
            batchSize: batch.length,
          },
          error as Error
        );
        // エラーが発生してもIndexedDBからは既に削除されているため、
        // データロストを防ぐためにリトライは行わない
        // 将来的にはエラーキューを実装することを推奨
      }
    }

    lastSyncTime = Date.now();

    logger.info(
      `${LOCATION}:syncToSupabase`,
      '同期完了',
      `合計${totalSynced}件のデータをSupabaseに同期しました`,
      {
        totalSynced,
        totalAttempted: transcriptRows.length,
        timestamp: lastSyncTime,
      }
    );

    return totalSynced;
  } catch (error) {
    logger.error(
      `${LOCATION}:syncToSupabase`,
      '同期エラー',
      '同期処理中にエラーが発生しました',
      { force },
      error as Error
    );
    throw error;
  } finally {
    isSyncing = false;
  }
}

/**
 * 定期的な自動同期を開始
 * @param intervalMs 同期間隔（ミリ秒、デフォルト60秒）
 */
export function startAutoSync(intervalMs: number = SYNC_INTERVAL_MS): void {
  // 既に起動している場合は停止してから再起動
  if (syncIntervalId) {
    stopAutoSync();
  }

  logger.info(
    `${LOCATION}:startAutoSync`,
    '自動同期開始',
    '定期的な自動同期を開始しました',
    {
      intervalMs,
      intervalSeconds: intervalMs / 1000,
    }
  );

  syncIntervalId = setInterval(async () => {
    try {
      await syncToSupabase();
    } catch (error) {
      logger.error(
        `${LOCATION}:startAutoSync`,
        '自動同期エラー',
        '自動同期中にエラーが発生しましたが、次の同期を試行します',
        {},
        error as Error
      );
    }
  }, intervalMs);

  // 初回同期を即座に実行
  syncToSupabase().catch(error => {
    logger.error(
      `${LOCATION}:startAutoSync`,
      '初回同期エラー',
      '初回同期に失敗しましたが、定期同期は継続します',
      {},
      error as Error
    );
  });
}

/**
 * 自動同期を停止
 */
export function stopAutoSync(): void {
  if (syncIntervalId) {
    clearInterval(syncIntervalId);
    syncIntervalId = null;

    logger.info(
      `${LOCATION}:stopAutoSync`,
      '自動同期停止',
      '定期的な自動同期を停止しました',
      {}
    );
  }
}

/**
 * 同期状態を取得
 * @returns 同期中かどうか、最終同期時刻
 */
export function getSyncStatus(): {
  isSyncing: boolean;
  lastSyncTime: number;
  isAutoSyncRunning: boolean;
} {
  return {
    isSyncing,
    lastSyncTime,
    isAutoSyncRunning: syncIntervalId !== null,
  };
}

/**
 * 全データをSupabaseにエクスポート（手動バックアップ用）
 * @returns エクスポートされたレコード数
 */
export async function exportAllToSupabase(): Promise<number> {
  try {
    logger.info(
      `${LOCATION}:exportAllToSupabase`,
      '全データエクスポート開始',
      'IndexedDBの全データをSupabaseにエクスポートします',
      {}
    );

    const allTranscripts = await getAllFromIndexedDB();

    if (allTranscripts.length === 0) {
      logger.info(
        `${LOCATION}:exportAllToSupabase`,
        'エクスポート対象なし',
        'IndexedDBにデータがありません',
        {}
      );
      return 0;
    }

    const transcriptRows: TranscriptRow[] = allTranscripts.map(t => ({
      text: t.text,
      timestamp: t.timestamp,
      is_final: t.isFinal,
    }));

    // バッチでエクスポート
    let totalExported = 0;
    for (let i = 0; i < transcriptRows.length; i += SYNC_BATCH_SIZE) {
      const batch = transcriptRows.slice(i, i + SYNC_BATCH_SIZE);
      const exportedCount = await insertTranscripts(batch);
      totalExported += exportedCount;

      logger.debug(
        `${LOCATION}:exportAllToSupabase`,
        'エクスポートバッチ完了',
        `${exportedCount}件のデータをエクスポートしました`,
        {
          batchNumber: Math.floor(i / SYNC_BATCH_SIZE) + 1,
          exportedCount,
          totalExported,
          remaining: transcriptRows.length - i - batch.length,
        }
      );
    }

    logger.info(
      `${LOCATION}:exportAllToSupabase`,
      'エクスポート完了',
      `合計${totalExported}件のデータをSupabaseにエクスポートしました`,
      {
        totalExported,
      }
    );

    return totalExported;
  } catch (error) {
    logger.error(
      `${LOCATION}:exportAllToSupabase`,
      'エクスポートエラー',
      'エクスポート処理中にエラーが発生しました',
      {},
      error as Error
    );
    throw error;
  }
}
