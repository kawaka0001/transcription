'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { generateWordCloudData, extractKeywords } from '@/lib/keyword-extractor';
import WordCloud3D from './WordCloud3D';
import type { Word } from '@/types/speech';

// 重要な単語をハイライトするヘルパー関数
function highlightKeywords(text: string, keywords: Set<string>): JSX.Element {
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
}

export default function TranscriptionApp() {
  const {
    isListening,
    transcript,
    interimTranscript,
    error,
    startListening,
    stopListening,
    clearTranscript,
  } = useSpeechRecognition({
    lang: 'ja-JP',
    continuous: true,
    interimResults: true,
  });

  const [wordCloudData, setWordCloudData] = useState<Word[]>([]);
  const [keywords, setKeywords] = useState<Set<string>>(new Set());

  // 文字起こしが更新されたらワードクラウドとキーワードを再生成
  useEffect(() => {
    if (transcript.length > 0) {
      const texts = transcript.map(t => t.text);
      const words = generateWordCloudData(texts, 50);
      setWordCloudData(words);

      // 全文からキーワードを抽出（頻度2回以上、上位5個のみ）
      const fullText = texts.join(' ');
      const keywordMap = extractKeywords(fullText);
      const topKeywords = Array.from(keywordMap.entries())
        .filter(([word, freq]) => freq >= 2 && word.length >= 2) // 頻度2以上、2文字以上
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5) // 上位5個に制限
        .map(([word]) => word);
      setKeywords(new Set(topKeywords));
    }
  }, [transcript]);

  const fullTranscript = useMemo(() => {
    return transcript.map(t => t.text).join(' ');
  }, [transcript]);

  const handleClear = () => {
    clearTranscript();
    setWordCloudData([]);
    setKeywords(new Set());
  };

  return (
    <div className="flex flex-col h-screen">
      {/* ヘッダー */}
      <header className="glass-header text-white p-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold drop-shadow-lg">Humanity1 - 3D Word Cloud</h1>
          <div className="flex gap-3">
            <button
              onClick={isListening ? stopListening : startListening}
              className={`px-6 py-2 rounded-xl font-semibold glass-button ${
                isListening ? 'glass-button-active' : 'glass-button-success'
              } text-white shadow-lg`}
            >
              {isListening ? '⏸️ 停止' : '🎤 開始'}
            </button>
            <button
              onClick={handleClear}
              className="px-6 py-2 glass-button rounded-xl font-semibold text-white shadow-lg"
            >
              🗑️ クリア
            </button>
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
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* 3Dワードクラウド */}
        <div className="flex-1 relative">
          <WordCloud3D words={wordCloudData} />
          {!isListening && wordCloudData.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none p-8">
              <div className="glass-dark text-white text-center p-10 rounded-3xl max-w-md shadow-2xl">
                <p className="text-3xl mb-4">🎤</p>
                <p className="text-2xl font-bold mb-3">マイクボタンを押して開始</p>
                <p className="text-sm opacity-90 leading-relaxed">
                  音声がリアルタイムで美しい3D空間に可視化されます
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 文字起こし表示 */}
        <div className="w-full lg:w-96 glass-dark p-6 overflow-y-auto border-l border-white border-opacity-10">
          <h2 className="text-2xl font-bold mb-6 text-white drop-shadow-lg">
            📝 文字起こし
          </h2>

          {/* リアルタイム（仮確定） */}
          {interimTranscript && (
            <div className="mb-4 p-4 glass-card rounded-2xl border border-cyan-400 shadow-lg shadow-cyan-500/20 fade-in-up">
              <p className="text-sm text-cyan-400 mb-2 font-semibold flex items-center gap-2">
                <span className="animate-pulse">●</span> 認識中...
              </p>
              <p className="text-white italic lyrics-text">
                {highlightKeywords(interimTranscript, keywords)}
              </p>
            </div>
          )}

          {/* 確定した文字起こし */}
          <div className="space-y-3">
            {transcript.length === 0 ? (
              <p className="text-white text-opacity-70 text-sm text-center py-8">
                音声認識を開始すると、ここに文字起こしが表示されます。
              </p>
            ) : (
              <div className="space-y-3">
                {[...transcript].reverse().map((t, index) => (
                  <div
                    key={t.timestamp}
                    className="p-5 glass-card rounded-2xl shadow-lg hover:scale-[1.02] hover:border-cyan-500/30 transition-all fade-in-up"
                    style={{ animationDelay: `${index * 0.05}s` }}
                  >
                    <p className="text-xs text-gray-400 mb-3 font-medium">
                      🕐 {new Date(t.timestamp).toLocaleTimeString('ja-JP')}
                    </p>
                    <p className="text-white lyrics-text">
                      {highlightKeywords(t.text, keywords)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 全文表示 */}
          {fullTranscript && (
            <div className="mt-6 p-5 glass-dark rounded-2xl shadow-xl border border-gray-700 fade-in-up">
              <h3 className="text-sm font-bold mb-3 text-gray-300 flex items-center gap-2">
                📄 全文
              </h3>
              <p className="text-sm text-white whitespace-pre-wrap leading-relaxed lyrics-text">
                {highlightKeywords(fullTranscript, keywords)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* フッター */}
      <footer className="glass-header text-white p-3 text-center text-sm border-t border-white border-opacity-10">
        <p className="opacity-90">
          Chrome/Edge推奨 | Web Speech API使用 | マイクの使用許可が必要です
        </p>
      </footer>
    </div>
  );
}
