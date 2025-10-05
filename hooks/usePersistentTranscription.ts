'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSpeechRecognition } from './useSpeechRecognition';
import type { Transcript, SpeechRecognitionConfig } from '@/types/speech';
import {
  saveToIndexedDB,
  getLatestFromIndexedDB,
  clearIndexedDB,
} from '@/lib/indexeddb-storage';
import {
  startAutoSync,
  stopAutoSync,
  syncToSupabase,
  getSyncStatus,
  exportAllToSupabase,
} from '@/lib/sync-manager';
import { logger } from '@/lib/logger';

const LOCATION = 'hooks/usePersistentTranscription.ts';
const DISPLAY_LIMIT = 100; // React Stateに保持する最新件数

/**
 * 永続化機能付き文字起こしフック
 * - IndexedDBに自動保存
 * - Supabaseに自動同期
 * - メモリ使用量を最小化（最新100件のみ表示）
 */
export function usePersistentTranscription(config?: SpeechRecognitionConfig) {
  const {
    isListening,
    transcript,
    interimTranscript,
    error,
    startListening: startSpeech,
    stopListening: stopSpeech,
    clearTranscript: clearSpeech,
  } = useSpeechRecognition(config);

  const [displayTranscripts, setDisplayTranscripts] = useState<Transcript[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{
    isSyncing: boolean;
    lastSyncTime: number;
    isAutoSyncRunning: boolean;
  }>({
    isSyncing: false,
    lastSyncTime: 0,
    isAutoSyncRunning: false,
  });

  // 初期化：IndexedDBから最新データを復元
  useEffect(() => {
    async function loadInitialData() {
      try {
        logger.info(
          `${LOCATION}:loadInitialData`,
          '初期化開始',
          'IndexedDBから最新データを読み込んでいます',
          {}
        );

        const latestTranscripts = await getLatestFromIndexedDB(DISPLAY_LIMIT);
        setDisplayTranscripts(latestTranscripts);
        setIsInitialized(true);

        logger.info(
          `${LOCATION}:loadInitialData`,
          '初期化完了',
          'IndexedDBからのデータ読み込みが完了しました',
          {
            count: latestTranscripts.length,
          }
        );
      } catch (error) {
        logger.error(
          `${LOCATION}:loadInitialData`,
          '初期化エラー',
          'IndexedDBからのデータ読み込みに失敗しました',
          {},
          error as Error
        );
        setIsInitialized(true); // エラーでも初期化完了とする
      }
    }

    loadInitialData();
  }, []);

  // 自動同期の開始（コンポーネントマウント時）
  useEffect(() => {
    startAutoSync();

    // 同期状態の定期更新
    const statusInterval = setInterval(() => {
      setSyncStatus(getSyncStatus());
    }, 1000);

    return () => {
      stopAutoSync();
      clearInterval(statusInterval);
    };
  }, []);

  // 新しい文字起こしが追加されたらIndexedDBに保存
  useEffect(() => {
    if (transcript.length === 0) return;

    const latestTranscript = transcript[transcript.length - 1];

    // IndexedDBに保存
    saveToIndexedDB(latestTranscript)
      .then(() => {
        logger.debug(
          `${LOCATION}:useEffect:save`,
          'IndexedDBに保存',
          '新しい文字起こしをIndexedDBに保存しました',
          {
            timestamp: latestTranscript.timestamp,
            textLength: latestTranscript.text.length,
          }
        );

        // 表示用のStateを更新（最新100件のみ保持）
        setDisplayTranscripts(prev => {
          const updated = [latestTranscript, ...prev];
          return updated.slice(0, DISPLAY_LIMIT);
        });
      })
      .catch(error => {
        logger.error(
          `${LOCATION}:useEffect:save`,
          'IndexedDB保存エラー',
          'IndexedDBへの保存に失敗しました',
          {
            transcript: latestTranscript,
          },
          error as Error
        );
      });
  }, [transcript]);

  // 音声認識の開始
  const startListening = useCallback(() => {
    startSpeech();
    logger.info(
      `${LOCATION}:startListening`,
      '音声認識開始',
      '永続化機能付き音声認識を開始しました',
      {
        autoSyncRunning: syncStatus.isAutoSyncRunning,
      }
    );
  }, [startSpeech, syncStatus.isAutoSyncRunning]);

  // 音声認識の停止
  const stopListening = useCallback(() => {
    stopSpeech();
    logger.info(
      `${LOCATION}:stopListening`,
      '音声認識停止',
      '永続化機能付き音声認識を停止しました',
      {
        displayCount: displayTranscripts.length,
      }
    );
  }, [stopSpeech, displayTranscripts.length]);

  // クリア（IndexedDBとReact Stateの両方）
  const clearAll = useCallback(async () => {
    try {
      logger.info(
        `${LOCATION}:clearAll`,
        '全データクリア開始',
        'IndexedDBとReact Stateをクリアします',
        {
          displayCount: displayTranscripts.length,
        }
      );

      await clearIndexedDB();
      clearSpeech();
      setDisplayTranscripts([]);

      logger.info(
        `${LOCATION}:clearAll`,
        '全データクリア完了',
        'すべてのデータをクリアしました',
        {}
      );
    } catch (error) {
      logger.error(
        `${LOCATION}:clearAll`,
        'クリアエラー',
        'データのクリアに失敗しました',
        {},
        error as Error
      );
      throw error;
    }
  }, [clearSpeech, displayTranscripts.length]);

  // 手動同期
  const manualSync = useCallback(async () => {
    try {
      logger.info(
        `${LOCATION}:manualSync`,
        '手動同期開始',
        'ユーザーが手動同期を開始しました',
        {}
      );

      const syncedCount = await syncToSupabase(true);

      logger.info(
        `${LOCATION}:manualSync`,
        '手動同期完了',
        `${syncedCount}件のデータをSupabaseに同期しました`,
        { syncedCount }
      );

      return syncedCount;
    } catch (error) {
      logger.error(
        `${LOCATION}:manualSync`,
        '手動同期エラー',
        '手動同期に失敗しました',
        {},
        error as Error
      );
      throw error;
    }
  }, []);

  // 全データエクスポート
  const exportAll = useCallback(async () => {
    try {
      logger.info(
        `${LOCATION}:exportAll`,
        '全データエクスポート開始',
        'ユーザーが全データエクスポートを開始しました',
        {}
      );

      const exportedCount = await exportAllToSupabase();

      logger.info(
        `${LOCATION}:exportAll`,
        '全データエクスポート完了',
        `${exportedCount}件のデータをSupabaseにエクスポートしました`,
        { exportedCount }
      );

      return exportedCount;
    } catch (error) {
      logger.error(
        `${LOCATION}:exportAll`,
        'エクスポートエラー',
        '全データエクスポートに失敗しました',
        {},
        error as Error
      );
      throw error;
    }
  }, []);

  return {
    // 音声認識関連
    isListening,
    interimTranscript,
    error,
    startListening,
    stopListening,

    // 表示用のデータ（最新100件）
    transcripts: displayTranscripts,

    // 永続化関連
    isInitialized,
    syncStatus,
    clearAll,
    manualSync,
    exportAll,
  };
}
