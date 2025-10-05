import { openDB, DBSchema, IDBPDatabase } from 'idb';
import type {
  Transcript,
  TranscriptionSession,
  SessionMetadata,
  WordCloudSnapshot,
  Word,
} from '@/types/speech';
import { logger } from '@/lib/logger';
import { generateWordCloudData, generateSentenceCloudData } from '@/lib/keyword-extractor';
import { insertTranscripts, type TranscriptRow } from './supabase';

const LOCATION = 'lib/transcription-data-manager.ts';

// 同期設定
const MAX_INDEXEDDB_COUNT = 300; // IndexedDBに保持する最大件数
const SYNC_BATCH_SIZE = 50; // 1回の同期で送信する件数
const SYNC_INTERVAL_MS = 60 * 1000; // 同期間隔（1分）

// ===================================
// IndexedDB スキーマ定義
// ===================================

interface TranscriptionDB extends DBSchema {
  // 生データ: 文字起こし（既存の構造を維持）
  transcripts: {
    key: number; // timestamp
    value: Transcript;
    indexes: {
      'by-timestamp': number;
    };
  };

  // セッションデータ: メタデータとワードクラウドスナップショット
  sessions: {
    key: string; // session ID
    value: {
      id: string;
      metadata: SessionMetadata;
      wordCloudSnapshot?: WordCloudSnapshot;
    };
    indexes: {
      'by-created': number;
    };
  };
}

const DB_NAME = 'humanity1-transcriptions-v2';
const DB_VERSION = 2;
const TRANSCRIPTS_STORE = 'transcripts';
const SESSIONS_STORE = 'sessions';

let dbInstance: IDBPDatabase<TranscriptionDB> | null = null;

// ===================================
// 初期化
// ===================================

/**
 * IndexedDBの初期化
 */
async function initDB(): Promise<IDBPDatabase<TranscriptionDB>> {
  if (dbInstance) {
    return dbInstance;
  }

  logger.info(
    `${LOCATION}:initDB`,
    'TranscriptionDB初期化',
    '中央データストア用のIndexedDBを初期化しています',
    { dbName: DB_NAME, version: DB_VERSION }
  );

  try {
    dbInstance = await openDB<TranscriptionDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion, newVersion, transaction) {
        // transcriptsストア（既存の構造）
        if (!db.objectStoreNames.contains(TRANSCRIPTS_STORE)) {
          const transcriptsStore = db.createObjectStore(TRANSCRIPTS_STORE, {
            keyPath: 'timestamp',
          });
          transcriptsStore.createIndex('by-timestamp', 'timestamp');

          logger.info(
            `${LOCATION}:initDB:upgrade`,
            'transcriptsストア作成',
            'transcriptsストアを作成しました',
            {}
          );
        }

        // sessionsストア（新規）
        if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
          const sessionsStore = db.createObjectStore(SESSIONS_STORE, {
            keyPath: 'id',
          });
          sessionsStore.createIndex('by-created', 'metadata.createdAt');

          logger.info(
            `${LOCATION}:initDB:upgrade`,
            'sessionsストア作成',
            'sessionsストアを作成しました',
            {}
          );
        }
      },
    });

    logger.info(
      `${LOCATION}:initDB`,
      'TranscriptionDB初期化完了',
      'データベースの初期化が完了しました',
      {}
    );

    return dbInstance;
  } catch (error) {
    logger.error(
      `${LOCATION}:initDB`,
      'TranscriptionDB初期化失敗',
      'データベースの初期化に失敗しました',
      { dbName: DB_NAME, version: DB_VERSION },
      error as Error
    );
    throw error;
  }
}

// ===================================
// TranscriptionDataManager クラス
// ===================================

/**
 * 文字起こしデータの中央管理システム
 *
 * 責務:
 * 1. セッション管理（メタデータ、統計情報）
 * 2. 文字起こし生データの管理
 * 3. ワードクラウドスナップショットの保存・取得
 * 4. データの一元化と整合性の保証
 */
export class TranscriptionDataManager {
  private currentSessionId: string | null = null;

  // Supabase同期の状態管理
  private isSyncing = false;
  private lastSyncTime = 0;
  private syncIntervalId: NodeJS.Timeout | null = null;

  /**
   * 新しいセッションを開始
   */
  async startSession(language: string = 'ja-JP'): Promise<string> {
    const sessionId = this.generateSessionId();
    const now = Date.now();

    const session = {
      id: sessionId,
      metadata: {
        createdAt: now,
        updatedAt: now,
        totalDuration: 0,
        totalTranscripts: 0,
        totalWords: 0,
        language,
      },
    };

    const db = await initDB();
    await db.put(SESSIONS_STORE, session);

    this.currentSessionId = sessionId;

    logger.info(
      `${LOCATION}:startSession`,
      'セッション開始',
      '新しい文字起こしセッションを開始しました',
      { sessionId, language }
    );

    return sessionId;
  }

  /**
   * 現在のセッションIDを取得（なければ新規作成）
   */
  async getCurrentSessionId(): Promise<string> {
    if (this.currentSessionId) {
      return this.currentSessionId;
    }

    // 最新のセッションを取得
    const latestSession = await this.getLatestSession();
    if (latestSession) {
      this.currentSessionId = latestSession.id;
      return latestSession.id;
    }

    // セッションがなければ新規作成
    return await this.startSession();
  }

  /**
   * 文字起こしを追加
   */
  async addTranscript(transcript: Transcript): Promise<void> {
    const db = await initDB();

    // 文字起こしを保存
    await db.put(TRANSCRIPTS_STORE, transcript);

    // セッションのメタデータを更新
    const sessionId = await this.getCurrentSessionId();
    await this.updateSessionMetadata(sessionId, transcript);

    logger.debug(
      `${LOCATION}:addTranscript`,
      '文字起こし追加',
      '文字起こしデータを追加しました',
      {
        sessionId,
        timestamp: transcript.timestamp,
        textLength: transcript.text.length,
      }
    );
  }

  /**
   * ワードクラウドを生成して保存
   * Transcript[] → Word[] への変換を実行
   */
  async generateAndSaveWordCloud(
    displayMode: 'words' | 'sentences',
    maxItems: number = 50,
    version: string = 'v1.0.0'
  ): Promise<Word[]> {
    // 文字起こしデータを取得
    const transcripts = await this.getAllTranscripts();

    if (transcripts.length === 0) {
      logger.debug(
        `${LOCATION}:generateAndSaveWordCloud`,
        'ワードクラウド生成スキップ',
        '文字起こしデータがないため、ワードクラウド生成をスキップしました',
        { displayMode }
      );
      return [];
    }

    // Transcript[] → string[] に変換
    const texts = transcripts.map(t => t.text);

    // 表示モードに応じてワードクラウドデータを生成
    const words = displayMode === 'sentences'
      ? generateSentenceCloudData(texts, maxItems)
      : generateWordCloudData(texts, maxItems);

    // スナップショットとして保存
    await this.saveWordCloudSnapshot(displayMode, words, version);

    logger.info(
      `${LOCATION}:generateAndSaveWordCloud`,
      'ワードクラウド生成完了',
      `${displayMode}モードでワードクラウドを生成しました`,
      {
        displayMode,
        wordCount: words.length,
        transcriptCount: transcripts.length,
        version,
      }
    );

    return words;
  }

  /**
   * ワードクラウドスナップショットを保存
   */
  async saveWordCloudSnapshot(
    displayMode: 'words' | 'sentences',
    words: Word[],
    version: string = 'v1.0.0'
  ): Promise<void> {
    const sessionId = await this.getCurrentSessionId();
    const db = await initDB();

    const session = await db.get(SESSIONS_STORE, sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const snapshot: WordCloudSnapshot = {
      generatedAt: Date.now(),
      displayMode,
      words,
      version,
    };

    // セッションにスナップショットを追加
    session.wordCloudSnapshot = snapshot;
    session.metadata.updatedAt = Date.now();
    await db.put(SESSIONS_STORE, session);

    logger.debug(
      `${LOCATION}:saveWordCloudSnapshot`,
      'ワードクラウド保存',
      'ワードクラウドスナップショットを保存しました',
      {
        sessionId,
        displayMode,
        wordCount: words.length,
        version,
      }
    );
  }

  /**
   * ワードクラウドスナップショットを取得
   */
  async getWordCloudSnapshot(): Promise<WordCloudSnapshot | null> {
    const sessionId = await this.getCurrentSessionId();
    const db = await initDB();

    const session = await db.get(SESSIONS_STORE, sessionId);
    return session?.wordCloudSnapshot ?? null;
  }

  /**
   * 現在のセッションの全データを取得
   */
  async getCurrentSession(): Promise<TranscriptionSession | null> {
    const sessionId = await this.getCurrentSessionId();
    const db = await initDB();

    const session = await db.get(SESSIONS_STORE, sessionId);
    if (!session) {
      return null;
    }

    // 文字起こしデータを取得
    const transcripts = await this.getTranscripts();

    return {
      id: session.id,
      metadata: session.metadata,
      transcripts,
      wordCloudData: session.wordCloudSnapshot,
    };
  }

  /**
   * 文字起こしデータを取得（新しい順、デフォルト100件）
   */
  async getTranscripts(limit: number = 100): Promise<Transcript[]> {
    const db = await initDB();
    const tx = db.transaction(TRANSCRIPTS_STORE, 'readonly');
    const index = tx.store.index('by-timestamp');

    const transcripts: Transcript[] = [];
    let cursor = await index.openCursor(null, 'prev'); // 降順

    while (cursor && transcripts.length < limit) {
      transcripts.push(cursor.value);
      cursor = await cursor.continue();
    }

    return transcripts;
  }

  /**
   * すべての文字起こしデータを取得
   */
  async getAllTranscripts(): Promise<Transcript[]> {
    const db = await initDB();
    const allTranscripts = await db.getAllFromIndex(TRANSCRIPTS_STORE, 'by-timestamp');

    // 降順にソート（新しい順）
    allTranscripts.sort((a, b) => b.timestamp - a.timestamp);

    return allTranscripts;
  }

  /**
   * 全データをクリア
   */
  async clearAll(): Promise<void> {
    const db = await initDB();
    await db.clear(TRANSCRIPTS_STORE);
    await db.clear(SESSIONS_STORE);

    this.currentSessionId = null;

    logger.info(
      `${LOCATION}:clearAll`,
      '全データクリア',
      'すべてのデータをクリアしました',
      {}
    );
  }

  /**
   * セッションデータをJSONエクスポート
   */
  async exportSessionAsJSON(): Promise<string> {
    const session = await this.getCurrentSession();
    if (!session) {
      throw new Error('No active session');
    }

    return JSON.stringify(session, null, 2);
  }

  // ===================================
  // Supabase同期機能
  // ===================================

  /**
   * IndexedDBのデータ数を取得
   */
  async getTranscriptCount(): Promise<number> {
    const db = await initDB();
    return await db.count(TRANSCRIPTS_STORE);
  }

  /**
   * 古いデータを削除してSupabaseに同期
   */
  async syncToSupabase(force: boolean = false): Promise<number> {
    // 既に同期中の場合はスキップ
    if (this.isSyncing && !force) {
      logger.debug(
        `${LOCATION}:syncToSupabase`,
        '同期スキップ',
        '既に同期処理が実行中のためスキップしました',
        {}
      );
      return 0;
    }

    try {
      this.isSyncing = true;

      // IndexedDB内のデータ数を確認
      const count = await this.getTranscriptCount();

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
      const toSync = await this.deleteOldTranscripts(MAX_INDEXEDDB_COUNT);

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

      // バッチで同期
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
        }
      }

      this.lastSyncTime = Date.now();

      logger.info(
        `${LOCATION}:syncToSupabase`,
        '同期完了',
        `合計${totalSynced}件のデータをSupabaseに同期しました`,
        {
          totalSynced,
          totalAttempted: transcriptRows.length,
          timestamp: this.lastSyncTime,
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
      this.isSyncing = false;
    }
  }

  /**
   * 定期的な自動同期を開始
   */
  startAutoSync(intervalMs: number = SYNC_INTERVAL_MS): void {
    // 既に起動している場合は停止してから再起動
    if (this.syncIntervalId) {
      this.stopAutoSync();
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

    this.syncIntervalId = setInterval(async () => {
      try {
        await this.syncToSupabase();
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
    this.syncToSupabase().catch(error => {
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
  stopAutoSync(): void {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId);
      this.syncIntervalId = null;

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
   */
  getSyncStatus(): {
    isSyncing: boolean;
    lastSyncTime: number;
    isAutoSyncRunning: boolean;
  } {
    return {
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime,
      isAutoSyncRunning: this.syncIntervalId !== null,
    };
  }

  /**
   * 全データをSupabaseにエクスポート（手動バックアップ用）
   */
  async exportAllToSupabase(): Promise<number> {
    try {
      logger.info(
        `${LOCATION}:exportAllToSupabase`,
        '全データエクスポート開始',
        'IndexedDBの全データをSupabaseにエクスポートします',
        {}
      );

      const allTranscripts = await this.getAllTranscripts();

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

  // ===================================
  // プライベートメソッド
  // ===================================

  /**
   * セッションIDを生成（YYYY-MM-DD_HHmmss形式）
   */
  private generateSessionId(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day}_${hours}${minutes}${seconds}`;
  }

  /**
   * セッションのメタデータを更新
   */
  private async updateSessionMetadata(
    sessionId: string,
    transcript: Transcript
  ): Promise<void> {
    const db = await initDB();
    const session = await db.get(SESSIONS_STORE, sessionId);

    if (!session) {
      logger.error(
        `${LOCATION}:updateSessionMetadata`,
        'セッション未発見',
        'セッションが見つかりませんでした',
        { sessionId }
      );
      return;
    }

    // メタデータを更新
    session.metadata.updatedAt = Date.now();
    session.metadata.totalTranscripts += 1;
    session.metadata.totalWords += transcript.text.split(/\s+/).length;

    await db.put(SESSIONS_STORE, session);
  }

  /**
   * 最新のセッションを取得
   */
  private async getLatestSession(): Promise<{
    id: string;
    metadata: SessionMetadata;
    wordCloudSnapshot?: WordCloudSnapshot;
  } | null> {
    const db = await initDB();
    const tx = db.transaction(SESSIONS_STORE, 'readonly');
    const index = tx.store.index('by-created');

    const cursor = await index.openCursor(null, 'prev'); // 降順
    return cursor ? cursor.value : null;
  }

  /**
   * 古いデータをIndexedDBから削除（指定件数を超えた分）
   * @param keepCount 保持する件数
   * @returns 削除されたデータの配列
   */
  private async deleteOldTranscripts(keepCount: number = 300): Promise<Transcript[]> {
    try {
      const db = await initDB();
      const tx = db.transaction(TRANSCRIPTS_STORE, 'readwrite');
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
          `${LOCATION}:deleteOldTranscripts`,
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
      const deleteTx = db.transaction(TRANSCRIPTS_STORE, 'readwrite');
      await Promise.all([
        ...toDelete.map(t => deleteTx.store.delete(t.timestamp)),
        deleteTx.done,
      ]);

      logger.info(
        `${LOCATION}:deleteOldTranscripts`,
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
        `${LOCATION}:deleteOldTranscripts`,
        'IndexedDB削除失敗',
        '古いデータの削除に失敗しました',
        { keepCount },
        error as Error
      );
      throw error;
    }
  }
}

// ===================================
// シングルトンインスタンス
// ===================================

export const transcriptionDataManager = new TranscriptionDataManager();
