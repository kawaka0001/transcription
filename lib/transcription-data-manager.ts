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

const LOCATION = 'lib/transcription-data-manager.ts';

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
}

// ===================================
// シングルトンインスタンス
// ===================================

export const transcriptionDataManager = new TranscriptionDataManager();
