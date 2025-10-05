import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type { Transcript } from '@/types/speech';
import { logger } from '@/lib/logger';

const LOCATION = 'lib/indexeddb-storage.ts';

// IndexedDBのスキーマ定義
interface TranscriptDB extends DBSchema {
  transcripts: {
    key: number; // timestamp をキーとして使用
    value: Transcript;
    indexes: {
      'by-timestamp': number;
    };
  };
}

const DB_NAME = 'humanity1-transcripts';
const DB_VERSION = 1;
const STORE_NAME = 'transcripts';

// IndexedDBインスタンスのキャッシュ
let dbInstance: IDBPDatabase<TranscriptDB> | null = null;

/**
 * IndexedDBの初期化
 */
async function initDB(): Promise<IDBPDatabase<TranscriptDB>> {
  if (dbInstance) {
    return dbInstance;
  }

  logger.info(
    `${LOCATION}:initDB`,
    'IndexedDB初期化',
    'IndexedDBデータベースを初期化しています',
    { dbName: DB_NAME, version: DB_VERSION }
  );

  try {
    dbInstance = await openDB<TranscriptDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // ストアが存在しない場合のみ作成
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: 'timestamp',
          });

          // タイムスタンプでソートするためのインデックス
          store.createIndex('by-timestamp', 'timestamp');

          logger.info(
            `${LOCATION}:initDB:upgrade`,
            'IndexedDBストア作成',
            'transcriptsストアとインデックスを作成しました',
            { storeName: STORE_NAME }
          );
        }
      },
    });

    logger.info(
      `${LOCATION}:initDB`,
      'IndexedDB初期化完了',
      'IndexedDBデータベースの初期化が完了しました',
      { dbName: DB_NAME }
    );

    return dbInstance;
  } catch (error) {
    logger.error(
      `${LOCATION}:initDB`,
      'IndexedDB初期化失敗',
      'IndexedDBの初期化に失敗しました',
      { dbName: DB_NAME, version: DB_VERSION },
      error as Error
    );
    throw error;
  }
}

/**
 * 文字起こしデータをIndexedDBに保存
 * @param transcript 保存する文字起こしデータ
 */
export async function saveToIndexedDB(transcript: Transcript): Promise<void> {
  try {
    const db = await initDB();
    await db.put(STORE_NAME, transcript);

    logger.debug(
      `${LOCATION}:saveToIndexedDB`,
      'IndexedDBに保存',
      '文字起こしデータをIndexedDBに保存しました',
      {
        timestamp: transcript.timestamp,
        textLength: transcript.text.length,
      }
    );
  } catch (error) {
    logger.error(
      `${LOCATION}:saveToIndexedDB`,
      'IndexedDB保存失敗',
      '文字起こしデータの保存に失敗しました',
      { transcript },
      error as Error
    );
    throw error;
  }
}

/**
 * 複数の文字起こしデータをIndexedDBに一括保存
 * @param transcripts 保存する文字起こしデータの配列
 */
export async function saveBatchToIndexedDB(transcripts: Transcript[]): Promise<void> {
  try {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');

    await Promise.all([
      ...transcripts.map(t => tx.store.put(t)),
      tx.done,
    ]);

    logger.debug(
      `${LOCATION}:saveBatchToIndexedDB`,
      'IndexedDBに一括保存',
      '複数の文字起こしデータをIndexedDBに保存しました',
      {
        count: transcripts.length,
        totalTextLength: transcripts.reduce((sum, t) => sum + t.text.length, 0),
      }
    );
  } catch (error) {
    logger.error(
      `${LOCATION}:saveBatchToIndexedDB`,
      'IndexedDB一括保存失敗',
      '文字起こしデータの一括保存に失敗しました',
      { count: transcripts.length },
      error as Error
    );
    throw error;
  }
}

/**
 * IndexedDBから最新のN件を取得
 * @param limit 取得件数（デフォルト100）
 * @returns 文字起こしデータの配列（新しい順）
 */
export async function getLatestFromIndexedDB(limit: number = 100): Promise<Transcript[]> {
  try {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const index = tx.store.index('by-timestamp');

    // カーソルを使って降順で取得
    const transcripts: Transcript[] = [];
    let cursor = await index.openCursor(null, 'prev'); // 'prev' = 降順

    while (cursor && transcripts.length < limit) {
      transcripts.push(cursor.value);
      cursor = await cursor.continue();
    }

    logger.debug(
      `${LOCATION}:getLatestFromIndexedDB`,
      'IndexedDBから取得',
      '最新の文字起こしデータを取得しました',
      {
        requested: limit,
        retrieved: transcripts.length,
      }
    );

    return transcripts;
  } catch (error) {
    logger.error(
      `${LOCATION}:getLatestFromIndexedDB`,
      'IndexedDB取得失敗',
      'IndexedDBからのデータ取得に失敗しました',
      { limit },
      error as Error
    );
    throw error;
  }
}

/**
 * IndexedDBから全データを取得
 * @returns すべての文字起こしデータの配列（新しい順）
 */
export async function getAllFromIndexedDB(): Promise<Transcript[]> {
  try {
    const db = await initDB();
    const allTranscripts = await db.getAllFromIndex(STORE_NAME, 'by-timestamp');

    // 降順にソート（新しい順）
    allTranscripts.sort((a, b) => b.timestamp - a.timestamp);

    logger.debug(
      `${LOCATION}:getAllFromIndexedDB`,
      'IndexedDBから全取得',
      'すべての文字起こしデータを取得しました',
      {
        count: allTranscripts.length,
      }
    );

    return allTranscripts;
  } catch (error) {
    logger.error(
      `${LOCATION}:getAllFromIndexedDB`,
      'IndexedDB全取得失敗',
      'IndexedDBからの全データ取得に失敗しました',
      {},
      error as Error
    );
    throw error;
  }
}

/**
 * IndexedDB内のデータ数を取得
 * @returns データ数
 */
export async function getIndexedDBCount(): Promise<number> {
  try {
    const db = await initDB();
    const count = await db.count(STORE_NAME);

    logger.debug(
      `${LOCATION}:getIndexedDBCount`,
      'IndexedDBカウント',
      'IndexedDB内のデータ数を取得しました',
      { count }
    );

    return count;
  } catch (error) {
    logger.error(
      `${LOCATION}:getIndexedDBCount`,
      'IndexedDBカウント失敗',
      'データ数の取得に失敗しました',
      {},
      error as Error
    );
    throw error;
  }
}

/**
 * 古いデータをIndexedDBから削除（指定件数を超えた分）
 * @param keepCount 保持する件数（デフォルト300）
 * @returns 削除されたデータの配列
 */
export async function deleteOldFromIndexedDB(keepCount: number = 300): Promise<Transcript[]> {
  try {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const index = tx.store.index('by-timestamp');

    // 全データを取得（降順）
    const allTranscripts: Transcript[] = [];
    let cursor = await index.openCursor(null, 'prev');

    while (cursor) {
      allTranscripts.push(cursor.value);
      cursor = await cursor.continue();
    }

    // 保持件数を超えた分を削除対象とする
    const toDelete = allTranscripts.slice(keepCount);

    if (toDelete.length === 0) {
      logger.debug(
        `${LOCATION}:deleteOldFromIndexedDB`,
        '削除対象なし',
        '保持件数を超えていないため、削除対象はありません',
        {
          totalCount: allTranscripts.length,
          keepCount,
        }
      );
      return [];
    }

    // 削除実行
    const deleteTx = db.transaction(STORE_NAME, 'readwrite');
    await Promise.all([
      ...toDelete.map(t => deleteTx.store.delete(t.timestamp)),
      deleteTx.done,
    ]);

    logger.info(
      `${LOCATION}:deleteOldFromIndexedDB`,
      'IndexedDBから削除',
      '古い文字起こしデータを削除しました',
      {
        totalCount: allTranscripts.length,
        keepCount,
        deletedCount: toDelete.length,
      }
    );

    return toDelete;
  } catch (error) {
    logger.error(
      `${LOCATION}:deleteOldFromIndexedDB`,
      'IndexedDB削除失敗',
      '古いデータの削除に失敗しました',
      { keepCount },
      error as Error
    );
    throw error;
  }
}

/**
 * IndexedDBから特定のデータを削除
 * @param timestamps 削除するデータのタイムスタンプ配列
 */
export async function deleteFromIndexedDB(timestamps: number[]): Promise<void> {
  try {
    const db = await initDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');

    await Promise.all([
      ...timestamps.map(ts => tx.store.delete(ts)),
      tx.done,
    ]);

    logger.debug(
      `${LOCATION}:deleteFromIndexedDB`,
      'IndexedDBから削除',
      '指定されたデータを削除しました',
      {
        count: timestamps.length,
      }
    );
  } catch (error) {
    logger.error(
      `${LOCATION}:deleteFromIndexedDB`,
      'IndexedDB削除失敗',
      '指定データの削除に失敗しました',
      { count: timestamps.length },
      error as Error
    );
    throw error;
  }
}

/**
 * IndexedDBをクリア（全データ削除）
 */
export async function clearIndexedDB(): Promise<void> {
  try {
    const db = await initDB();
    await db.clear(STORE_NAME);

    logger.info(
      `${LOCATION}:clearIndexedDB`,
      'IndexedDBクリア',
      'IndexedDBの全データを削除しました',
      {}
    );
  } catch (error) {
    logger.error(
      `${LOCATION}:clearIndexedDB`,
      'IndexedDBクリア失敗',
      'IndexedDBのクリアに失敗しました',
      {},
      error as Error
    );
    throw error;
  }
}
