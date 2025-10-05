'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { usePersistentTranscription } from '@/hooks/usePersistentTranscription';
import { generateWordCloudData, generateSentenceCloudData } from '@/lib/keyword-extractor';
import type { Word } from '@/types/speech';
import { logger } from '@/lib/logger';

// 3Dコンポーネントは動的インポートでSSRを無効化
const WordCloud3D = dynamic(() => import('./WordCloud3D'), { ssr: false });

const LOCATION = 'components/TranscriptionApp.tsx';

type DisplayMode = 'words' | 'sentences';
type ViewMode = 'wordcloud' | 'transcript' | 'both';

export default function TranscriptionApp() {
  const {
    isListening,
    transcripts,
    interimTranscript,
    error,
    startListening,
    stopListening,
    clearAll,
    isInitialized,
    syncStatus,
    manualSync,
    exportAll,
  } = usePersistentTranscription({
    lang: 'ja-JP',
    continuous: true,
    interimResults: true,
    maxAlternatives: 5, // 認識候補を増やして精度向上
  });

  const [wordCloudData, setWordCloudData] = useState<Word[]>([]);
  const [keywords, setKeywords] = useState<Set<string>>(new Set());
  const [displayMode, setDisplayMode] = useState<DisplayMode>('sentences'); // デフォルトは文表示
  const [viewMode, setViewMode] = useState<ViewMode>('both'); // デフォルトは両方表示
  const [isHeaderOpen, setIsHeaderOpen] = useState(false); // ヘッダーの開閉状態

  // 重要な単語をハイライトするヘルパー関数（メモ化）
  const highlightKeywords = useCallback((text: string, keywords: Set<string>): JSX.Element => {
    const words = text.split(/(\s+|[、。！？,.!?]+)/);

    return (
      <>
        {words.map((word, index) => {
          const cleanWord = word.toLowerCase().trim();
          // 空文字、記号のみ、1文字以下は除外
          const isKeyword = cleanWord.length >= 2 && keywords.has(cleanWord);

          if (isKeyword) {
            return (
              <span key={index} className="lyrics-highlight">
                {word}
              </span>
            );
          }
          return <span key={index}>{word}</span>;
        })}
      </>
    );
  }, []);

  // 文字起こしが更新されたらワードクラウドとキーワードを再生成
  useEffect(() => {
    if (transcripts.length > 0) {
      try {
        const texts = transcripts.map(t => t.text);

        // 表示モードに応じてデータを生成
        const newWords = displayMode === 'sentences'
          ? generateSentenceCloudData(texts, 15)
          : generateWordCloudData(texts, 50);

        // 前回のデータと比較して頻度が上がった単語/文を検出
        setWordCloudData((prevWords) => {
          const prevWordMap = new Map(
            prevWords.map((w) => [`${w.text}-${w.position.join(',')}`, w.frequency])
          );

          const updatedWords = newWords.map((word) => {
            const key = `${word.text}-${word.position.join(',')}`;
            const prevFrequency = prevWordMap.get(key);

            // 既存の単語で頻度が上がった場合のみエフェクト表示
            const frequencyIncreased =
              prevFrequency !== undefined && word.frequency > prevFrequency;

            return {
              ...word,
              justClicked: frequencyIncreased,
            };
          });

          // エフェクトフラグを600ms後にクリア
          if (updatedWords.some((w) => w.justClicked)) {
            setTimeout(() => {
              setWordCloudData((current) =>
                current.map((w) => ({ ...w, justClicked: false }))
              );
            }, 600);
          }

          return updatedWords;
        });

        // ワードクラウドデータから頻度の高いキーワードを抽出（重複処理を削減）
        const topKeywords = newWords
          .filter(w => w.frequency >= 2 && w.text.length >= 2) // 頻度2以上、2文字以上
          .slice(0, 5) // 上位5個に制限
          .map(w => w.text.toLowerCase());
        setKeywords(new Set(topKeywords));

        logger.debug(
          `${LOCATION}:useEffect`,
          'ワードクラウド更新',
          `${displayMode === 'sentences' ? '文' : '単語'}クラウドを再生成しました`,
          {
            displayMode,
            transcriptCount: transcripts.length,
            wordCloudSize: newWords.length,
            topKeywords: Array.from(topKeywords),
            totalTextLength: texts.join('').length,
          }
        );
      } catch (err) {
        logger.error(
          `${LOCATION}:useEffect`,
          'ワードクラウド生成エラー',
          'ワードクラウドの生成中にエラーが発生しました',
          {
            displayMode,
            transcriptCount: transcripts.length,
          },
          err as Error
        );
      }
    }
  }, [transcripts, displayMode]);

  const fullTranscript = useMemo(() => {
    return transcripts.map(t => t.text).join(' ');
  }, [transcripts]);

  // エラーが発生したときにログ記録
  useEffect(() => {
    if (error) {
      logger.warn(
        `${LOCATION}:useEffect`,
        'エラー表示',
        'ユーザーにエラーメッセージを表示しています',
        {
          error,
          isListening,
          transcriptCount: transcripts.length,
        }
      );
    }
  }, [error, isListening, transcripts.length]);

  const handleClear = async () => {
    logger.info(
      `${LOCATION}:handleClear`,
      'ユーザー操作: 全データクリア',
      'ユーザーが文字起こしとワードクラウドをクリアしました',
      {
        transcriptCount: transcripts.length,
        wordCloudSize: wordCloudData.length,
        keywordCount: keywords.size,
      }
    );
    await clearAll();
    setWordCloudData([]);
    setKeywords(new Set());
  };

  const handleManualSync = async () => {
    try {
      logger.info(
        `${LOCATION}:handleManualSync`,
        'ユーザー操作: 手動バックアップ',
        'ユーザーが全データのバックアップを開始しました',
        {}
      );
      const count = await exportAll();
      logger.info(
        `${LOCATION}:handleManualSync`,
        '手動バックアップ完了',
        `${count}件のデータをSupabaseにバックアップしました`,
        { count }
      );
      alert(`✅ ${count}件のデータをSupabaseにバックアップしました`);
    } catch (error) {
      logger.error(
        `${LOCATION}:handleManualSync`,
        '手動バックアップエラー',
        '手動バックアップに失敗しました',
        {},
        error as Error
      );
      alert('❌ バックアップに失敗しました');
    }
  };

  const handleWordClick = useCallback((clickedWord: Word) => {
    logger.info(
      `${LOCATION}:handleWordClick`,
      'ユーザー操作: 単語クリック',
      `単語「${clickedWord.text}」の重要度を上げました`,
      { word: clickedWord.text, currentFrequency: clickedWord.frequency }
    );

    setWordCloudData((prevWords) =>
      prevWords.map((word) =>
        word.text === clickedWord.text && word.position === clickedWord.position
          ? {
              ...word,
              frequency: word.frequency + 1,
              // サイズも少し大きくする（頻度に応じて）
              size: Math.min(word.size * 1.05, 2),
              // 星のエフェクト用フラグ
              justClicked: true,
            }
          : word
      )
    );

    // 600ms後にエフェクトフラグをクリア
    setTimeout(() => {
      setWordCloudData((prevWords) =>
        prevWords.map((word) =>
          word.text === clickedWord.text && word.position === clickedWord.position
            ? { ...word, justClicked: false }
            : word
        )
      );
    }, 600);
  }, []);

  const handleWordDelete = useCallback((deletedWord: Word) => {
    logger.info(
      `${LOCATION}:handleWordDelete`,
      'ユーザー操作: 単語削除',
      `単語「${deletedWord.text}」を削除しました`,
      { word: deletedWord.text }
    );

    setWordCloudData((prevWords) =>
      prevWords.filter(
        (word) =>
          !(word.text === deletedWord.text && word.position === deletedWord.position)
      )
    );
  }, []);

  return (
    <div className="flex flex-col h-screen">
      {/* ヘッダー */}
      <header className="glass-header text-white sticky top-0 z-50">
        <div className="max-w-7xl mx-auto">
          {/* メニューバー（常に表示） */}
          <div className="flex items-center justify-between gap-2 p-2">
            {/* タイトル */}
            <h1 className="text-sm md:text-base font-bold drop-shadow-lg whitespace-nowrap">
              Humanity1
            </h1>

            {/* ステータス表示 */}
            <div className="flex items-center gap-2 text-[10px] md:text-xs opacity-70">
              <span>📦 {transcripts.length}</span>
              {syncStatus.isAutoSyncRunning && (
                <span className="animate-pulse text-green-400">●</span>
              )}
              {isListening && (
                <span className="flex items-center gap-1">
                  <span className="animate-pulse text-red-400">●</span>
                  <span className="hidden sm:inline">録音中</span>
                </span>
              )}
            </div>

            {/* ハンバーガーボタン */}
            <button
              onClick={() => setIsHeaderOpen(!isHeaderOpen)}
              className="glass-button px-3 py-1.5 rounded-lg font-semibold text-white shadow-lg"
              title={isHeaderOpen ? 'メニューを閉じる' : 'メニューを開く'}
            >
              {isHeaderOpen ? '✕' : '☰'}
            </button>
          </div>

          {/* 展開可能なボタングループ */}
          <div
            className={`overflow-hidden transition-all duration-300 ease-in-out ${
              isHeaderOpen ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'
            }`}
          >
            <div className="p-2 pt-0 space-y-2">
              {/* 表示切り替え */}
              <div className="flex gap-2">
                <button
                  onClick={() => setViewMode('wordcloud')}
                  className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold ${
                    viewMode === 'wordcloud'
                      ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/50'
                      : 'glass-button text-white'
                  }`}
                >
                  🌌 3D
                </button>
                <button
                  onClick={() => setViewMode('transcript')}
                  className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold ${
                    viewMode === 'transcript'
                      ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/50'
                      : 'glass-button text-white'
                  }`}
                >
                  📝 文字
                </button>
                <button
                  onClick={() => setViewMode('both')}
                  className={`flex-1 px-3 py-2 rounded-lg text-xs font-semibold ${
                    viewMode === 'both'
                      ? 'bg-cyan-500 text-white shadow-lg shadow-cyan-500/50'
                      : 'glass-button text-white'
                  }`}
                >
                  ⚡ 両方
                </button>
              </div>

              {/* 操作ボタン */}
              <div className="flex gap-2">
                <button
                  onClick={isListening ? stopListening : startListening}
                  className={`flex-1 px-4 py-2 rounded-lg font-semibold glass-button ${
                    isListening ? 'glass-button-active' : 'glass-button-success'
                  } text-white shadow-lg text-xs`}
                >
                  {isListening ? '⏸️ 停止' : '🎤 開始'}
                </button>
                <button
                  onClick={() => setDisplayMode(prev => prev === 'words' ? 'sentences' : 'words')}
                  className="px-3 py-2 glass-button rounded-lg font-semibold text-white shadow-lg text-xs"
                  title={displayMode === 'sentences' ? '単語表示に切り替え' : '文表示に切り替え'}
                >
                  {displayMode === 'sentences' ? '📝 文' : '🔤 単語'}
                </button>
                <button
                  onClick={handleManualSync}
                  disabled={syncStatus.isSyncing}
                  className="px-3 py-2 glass-button rounded-lg font-semibold text-white shadow-lg disabled:opacity-50 text-xs"
                  title="全データをSupabaseにバックアップ"
                >
                  {syncStatus.isSyncing ? '🔄' : '💾'}
                </button>
                <button
                  onClick={handleClear}
                  className="px-3 py-2 glass-button rounded-lg font-semibold text-white shadow-lg text-xs"
                  title="全データをクリア"
                >
                  🗑️
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* エラー表示 */}
      {error && (
        <div className="glass-card border border-red-500 text-white px-6 py-4 m-4 rounded-2xl shadow-xl shadow-red-500/20">
          <p className="font-bold text-lg text-red-400">⚠️ エラー</p>
          <p className="mt-1">{error}</p>
        </div>
      )}

      {/* メインコンテンツ */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* 3Dワードクラウド */}
        {(viewMode === 'wordcloud' || viewMode === 'both') && (
          <div className={`${viewMode === 'both' ? 'h-[16rem] md:h-auto md:flex-1' : 'flex-1'} relative`}>
            <WordCloud3D
              words={wordCloudData}
              onWordClick={handleWordClick}
              onWordDelete={handleWordDelete}
            />
            {!isListening && wordCloudData.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-4 md:p-8">
                <div className="glass-dark text-white text-center p-6 md:p-10 rounded-3xl max-w-md shadow-2xl">
                  <p className="text-2xl md:text-3xl mb-3 md:mb-4">🎤</p>
                  <p className="text-xl md:text-2xl font-bold mb-2 md:mb-3">マイクボタンを押して開始</p>
                  <p className="text-xs md:text-sm opacity-90 leading-relaxed">
                    音声がリアルタイムで美しい3D空間に可視化されます
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 文字起こし表示 */}
        {(viewMode === 'transcript' || viewMode === 'both') && (
          <div className={`${
            viewMode === 'both'
              ? 'flex-1 md:w-1/2 lg:w-96 md:flex-none border-t md:border-t-0 md:border-l'
              : 'flex-1'
          } glass-dark p-4 md:p-6 overflow-y-auto border-white border-opacity-10`}>
          <h2 className="text-xl md:text-2xl font-bold mb-4 md:mb-6 text-white drop-shadow-lg">
            📝 文字起こし
          </h2>

          {/* リアルタイム（仮確定） - Apple Music風 */}
          {interimTranscript && (
            <div className="mb-3 md:mb-4 p-3 md:p-4 glass-card rounded-2xl border border-cyan-400/50 shadow-lg shadow-cyan-500/10 fade-in-up">
              <p className="text-xs md:text-sm text-cyan-400 mb-2 font-semibold flex items-center gap-2">
                <span className="animate-pulse transcript-glow">●</span> 認識中...
              </p>
              <p className="transcript-interim text-sm md:text-base leading-relaxed font-medium">
                {highlightKeywords(interimTranscript, keywords)}
              </p>
            </div>
          )}

          {/* 確定した文字起こし */}
          <div className="space-y-2 md:space-y-3">
            {!isInitialized ? (
              <p className="text-white text-opacity-70 text-sm text-center py-8">
                <span className="animate-pulse">読み込み中...</span>
              </p>
            ) : transcripts.length === 0 ? (
              <p className="text-white text-opacity-70 text-xs md:text-sm text-center py-6 md:py-8">
                音声認識を開始すると、ここに文字起こしが表示されます。
              </p>
            ) : (
              <div className="space-y-2 md:space-y-3">
                {transcripts.map((t, index) => (
                  <div
                    key={t.timestamp}
                    className="p-3 md:p-5 glass-card rounded-2xl shadow-lg hover:scale-[1.02] hover:border-cyan-500/30 transition-all fade-in-up"
                    style={{ animationDelay: `${index * 0.05}s` }}
                  >
                    <p className="text-xs text-gray-400 mb-2 md:mb-3 font-medium">
                      🕐 {new Date(t.timestamp).toLocaleTimeString('ja-JP')}
                    </p>
                    <p className="transcript-confirmed text-white text-sm md:text-base leading-relaxed font-medium">
                      {highlightKeywords(t.text, keywords)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 全文表示 */}
          {fullTranscript && (
            <div className="mt-4 md:mt-6 p-4 md:p-5 glass-dark rounded-2xl shadow-xl border border-gray-700 fade-in-up">
              <h3 className="text-xs md:text-sm font-bold mb-2 md:mb-3 text-gray-300 flex items-center gap-2">
                📄 全文
              </h3>
              <p className="transcript-confirmed text-xs md:text-sm text-white whitespace-pre-wrap leading-relaxed font-medium">
                {highlightKeywords(fullTranscript, keywords)}
              </p>
            </div>
          )}
          </div>
        )}
      </div>

      {/* フッター */}
      <footer className="glass-header text-white p-2 md:p-3 text-center text-xs md:text-sm border-t border-white border-opacity-10">
        <p className="opacity-90">
          <span className="hidden md:inline">Chrome/Edge推奨 | Web Speech API使用 | </span>
          マイクの使用許可が必要です
        </p>
      </footer>
    </div>
  );
}
