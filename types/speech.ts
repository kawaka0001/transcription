export interface Word {
  text: string;
  timestamp: number;
  frequency: number;
  position: [number, number, number];
  size: number;
  justClicked?: boolean; // クリック直後のエフェクト用フラグ
}

export interface Transcript {
  text: string;
  timestamp: number;
  isFinal: boolean;
}

// ===================================
// 中央データストア用の型定義
// ===================================

/**
 * セッション全体のデータを管理
 * これがJSONとして保存される主要なデータ構造
 */
export interface TranscriptionSession {
  id: string; // セッションID (YYYY-MM-DD_HHmmss形式)
  metadata: SessionMetadata;
  transcripts: Transcript[]; // 生データ（文字起こし）
  wordCloudData?: WordCloudSnapshot; // ワードクラウドのスナップショット（オプション）
}

/**
 * セッションのメタデータ
 */
export interface SessionMetadata {
  createdAt: number; // セッション開始時刻
  updatedAt: number; // 最終更新時刻
  totalDuration: number; // 総録音時間（ミリ秒）
  totalTranscripts: number; // 総文字起こし数
  totalWords: number; // 総単語数
  language: string; // 言語設定
}

/**
 * ワードクラウドのスナップショット
 * 変換済みデータを保存することで、再計算を避ける
 */
export interface WordCloudSnapshot {
  generatedAt: number; // 生成時刻
  displayMode: 'words' | 'sentences'; // 表示モード
  words: Word[]; // 変換済みのワードクラウドデータ
  version: string; // 変換アルゴリズムのバージョン（例: 'v1.0.0'）
}

export interface SpeechRecognitionConfig {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives?: number; // 認識候補の最大数
}

// Web Speech APIの型定義を拡張
export interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

export interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}
