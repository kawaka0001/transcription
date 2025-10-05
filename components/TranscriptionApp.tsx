'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { generateWordCloudData } from '@/lib/keyword-extractor';
import WordCloud3D from './WordCloud3D';
import type { Word } from '@/types/speech';

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

  // 文字起こしが更新されたらワードクラウドを再生成
  useEffect(() => {
    if (transcript.length > 0) {
      const texts = transcript.map(t => t.text);
      const words = generateWordCloudData(texts, 50);
      setWordCloudData(words);
    }
  }, [transcript]);

  const fullTranscript = useMemo(() => {
    return transcript.map(t => t.text).join(' ');
  }, [transcript]);

  const handleClear = () => {
    clearTranscript();
    setWordCloudData([]);
  };

  return (
    <div className="flex flex-col h-screen">
      {/* ヘッダー */}
      <header className="bg-slate-800 text-white p-4 shadow-lg">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold">Humanity1 - 3D Word Cloud Transcription</h1>
          <div className="flex gap-2">
            <button
              onClick={isListening ? stopListening : startListening}
              className={`px-6 py-2 rounded-lg font-semibold transition-colors ${
                isListening
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {isListening ? '⏸️ 停止' : '🎤 開始'}
            </button>
            <button
              onClick={handleClear}
              className="px-6 py-2 bg-slate-600 hover:bg-slate-700 rounded-lg font-semibold transition-colors"
            >
              🗑️ クリア
            </button>
          </div>
        </div>
      </header>

      {/* エラー表示 */}
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 m-4 rounded">
          <p className="font-bold">エラー</p>
          <p>{error}</p>
        </div>
      )}

      {/* メインコンテンツ */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* 3Dワードクラウド */}
        <div className="flex-1 relative">
          <WordCloud3D words={wordCloudData} />
          {!isListening && wordCloudData.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-white text-center bg-black bg-opacity-50 p-8 rounded-lg">
                <p className="text-xl mb-2">🎤 マイクボタンを押して開始</p>
                <p className="text-sm opacity-75">
                  音声がリアルタイムで3D空間に可視化されます
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 文字起こし表示 */}
        <div className="w-full lg:w-96 bg-slate-100 dark:bg-slate-900 p-4 overflow-y-auto">
          <h2 className="text-xl font-bold mb-4 text-slate-800 dark:text-white">
            文字起こし
          </h2>

          {/* リアルタイム（仮確定） */}
          {interimTranscript && (
            <div className="mb-4 p-3 bg-yellow-100 dark:bg-yellow-900 rounded-lg">
              <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-1">
                認識中...
              </p>
              <p className="text-slate-700 dark:text-slate-300 italic">
                {interimTranscript}
              </p>
            </div>
          )}

          {/* 確定した文字起こし */}
          <div className="space-y-2">
            {transcript.length === 0 ? (
              <p className="text-slate-500 dark:text-slate-400 text-sm">
                音声認識を開始すると、ここに文字起こしが表示されます。
              </p>
            ) : (
              <div className="space-y-2">
                {transcript.map((t, index) => (
                  <div
                    key={index}
                    className="p-3 bg-white dark:bg-slate-800 rounded-lg shadow"
                  >
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                      {new Date(t.timestamp).toLocaleTimeString('ja-JP')}
                    </p>
                    <p className="text-slate-800 dark:text-white">{t.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 全文表示 */}
          {fullTranscript && (
            <div className="mt-6 p-4 bg-white dark:bg-slate-800 rounded-lg shadow">
              <h3 className="text-sm font-bold mb-2 text-slate-700 dark:text-slate-300">
                全文
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
                {fullTranscript}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* フッター */}
      <footer className="bg-slate-800 text-white p-2 text-center text-sm">
        <p>
          Chrome/Edge推奨 | Web Speech API使用 | マイクの使用許可が必要です
        </p>
      </footer>
    </div>
  );
}
