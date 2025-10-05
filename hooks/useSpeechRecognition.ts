'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Transcript, SpeechRecognitionConfig } from '@/types/speech';

// Web Speech APIの型定義を拡張
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

export function useSpeechRecognition(config: SpeechRecognitionConfig = {
  lang: 'ja-JP',
  continuous: true,
  interimResults: true,
}) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState<Transcript[]>([]);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // ブラウザのWeb Speech API対応チェック
    if (typeof window === 'undefined') return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError('お使いのブラウザはWeb Speech APIに対応していません。Chrome/Edgeをご使用ください。');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = config.lang;
    recognition.continuous = config.continuous;
    recognition.interimResults = config.interimResults;

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
        setTranscript(prev => [...prev, {
          text: final,
          timestamp: Date.now(),
          isFinal: true,
        }]);
      }

      setInterimTranscript(interim);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      setError(`音声認識エラー: ${event.error}`);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
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
        recognitionRef.current.start();
        setIsListening(true);
        setError(null);
      } catch (err) {
        console.error('Failed to start recognition:', err);
        setError('音声認識の開始に失敗しました');
      }
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  }, [isListening]);

  const clearTranscript = useCallback(() => {
    setTranscript([]);
    setInterimTranscript('');
  }, []);

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
