'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  Transcript,
  SpeechRecognitionConfig,
  SpeechRecognitionEvent,
  SpeechRecognitionErrorEvent
} from '@/types/speech';
import { logger } from '@/lib/logger';

const LOCATION = 'hooks/useSpeechRecognition.ts';

export function useSpeechRecognition(config: SpeechRecognitionConfig = {
  lang: 'ja-JP',
  continuous: true,
  interimResults: true,
  maxAlternatives: 3, // 認識候補を3つまで取得
}) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState<Transcript[]>([]);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const shouldRestartRef = useRef(false); // 自動再起動フラグ

  useEffect(() => {
    // ブラウザのWeb Speech API対応チェック
    if (typeof window === 'undefined') return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      const errorMsg = 'お使いのブラウザはWeb Speech APIに対応していません。Chrome/Edgeをご使用ください。';
      setError(errorMsg);
      logger.error(
        `${LOCATION}:useEffect`,
        'Web Speech API初期化',
        'ブラウザがWeb Speech APIに対応していない',
        {
          userAgent: navigator.userAgent,
          window: typeof window,
        }
      );
      return;
    }

    logger.info(
      `${LOCATION}:useEffect`,
      'Web Speech API初期化',
      'Web Speech APIの初期化を開始',
      {
        config,
        userAgent: navigator.userAgent,
      }
    );

    const recognition = new SpeechRecognition();
    recognition.lang = config.lang;
    recognition.continuous = config.continuous;
    recognition.interimResults = config.interimResults;

    // 認識精度向上のための設定
    if (config.maxAlternatives) {
      recognition.maxAlternatives = config.maxAlternatives;
    }

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }

      if (final) {
        logger.debug(
          `${LOCATION}:onresult`,
          '音声認識結果受信',
          '確定した文字起こしテキストを受信',
          {
            finalText: final,
            textLength: final.length,
            resultIndex: event.resultIndex,
            totalResults: event.results.length,
          }
        );
        setTranscript(prev => [...prev, {
          text: final,
          timestamp: Date.now(),
          isFinal: true,
        }]);
      }

      if (interim) {
        logger.debug(
          `${LOCATION}:onresult`,
          '音声認識中間結果受信',
          '仮確定の文字起こしテキストを受信',
          {
            interimText: interim,
            textLength: interim.length,
          }
        );
      }

      setInterimTranscript(interim);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // no-speechエラーは無視（一時的に音声がない状態）
      if (event.error === 'no-speech') {
        logger.debug(
          `${LOCATION}:onerror`,
          '音声認識エラー（無視）',
          'no-speechエラー: 一時的に音声が検出されない',
          {
            error: event.error,
            message: event.message,
            isListening,
            transcriptCount: transcript.length,
          }
        );
        return;
      }

      // abortedエラーは通常の停止なので無視
      if (event.error === 'aborted') {
        logger.debug(
          `${LOCATION}:onerror`,
          '音声認識エラー（無視）',
          'abortedエラー: 通常の停止処理',
          {
            error: event.error,
            message: event.message,
            isListening,
          }
        );
        return;
      }

      // 実際のエラー
      logger.error(
        `${LOCATION}:onerror`,
        '音声認識エラー',
        `音声認識でエラーが発生: ${event.error}`,
        {
          error: event.error,
          message: event.message,
          isListening,
          transcriptCount: transcript.length,
          config,
        }
      );

      setError(`音声認識エラー: ${event.error}`);
      setIsListening(false);
      shouldRestartRef.current = false; // エラー時は再起動しない
    };

    recognition.onend = () => {
      // 自動再起動が有効な場合（continuousモードで意図的な停止でない場合）
      if (shouldRestartRef.current && config.continuous) {
        try {
          recognition.start();
          logger.info(
            `${LOCATION}:onend`,
            '音声認識自動再起動',
            '音声認識が自動的に再起動されました',
            {
              config,
              transcriptCount: transcript.length,
            }
          );
        } catch (err) {
          logger.error(
            `${LOCATION}:onend`,
            '音声認識再起動失敗',
            '音声認識の自動再起動に失敗しました',
            {
              config,
              transcriptCount: transcript.length,
            },
            err as Error
          );
          setIsListening(false);
          shouldRestartRef.current = false;
        }
      } else {
        logger.info(
          `${LOCATION}:onend`,
          '音声認識終了',
          '音声認識が終了しました',
          {
            wasAutoRestart: shouldRestartRef.current,
            continuous: config.continuous,
            transcriptCount: transcript.length,
          }
        );
        setIsListening(false);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [config.lang, config.continuous, config.interimResults]);

  const startListening = useCallback(() => {
    if (recognitionRef.current && !isListening) {
      try {
        shouldRestartRef.current = true; // 自動再起動を有効化
        recognitionRef.current.start();
        setIsListening(true);
        setError(null);
        logger.info(
          `${LOCATION}:startListening`,
          'ユーザー操作: 音声認識開始',
          '音声認識を開始しました',
          {
            config,
            transcriptCount: transcript.length,
          }
        );
      } catch (err) {
        logger.error(
          `${LOCATION}:startListening`,
          'ユーザー操作: 音声認識開始失敗',
          '音声認識の開始に失敗しました',
          {
            config,
            transcriptCount: transcript.length,
            isListening,
          },
          err as Error
        );
        setError('音声認識の開始に失敗しました');
        shouldRestartRef.current = false;
      }
    }
  }, [isListening, config, transcript.length]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      shouldRestartRef.current = false; // 意図的な停止なので自動再起動を無効化
      recognitionRef.current.stop();
      setIsListening(false);
      logger.info(
        `${LOCATION}:stopListening`,
        'ユーザー操作: 音声認識停止',
        'ユーザーが音声認識を停止しました',
        {
          transcriptCount: transcript.length,
          config,
        }
      );
    }
  }, [isListening, transcript.length, config]);

  const clearTranscript = useCallback(() => {
    const currentCount = transcript.length;
    setTranscript([]);
    setInterimTranscript('');
    logger.info(
      `${LOCATION}:clearTranscript`,
      'ユーザー操作: 文字起こしクリア',
      'ユーザーが文字起こしをクリアしました',
      {
        clearedCount: currentCount,
      }
    );
  }, [transcript.length]);

  return {
    isListening,
    transcript,
    interimTranscript,
    error,
    startListening,
    stopListening,
    clearTranscript,
  };
}
