export interface Word {
  text: string;
  timestamp: number;
  frequency: number;
  position: [number, number, number];
  size: number;
}

export interface Transcript {
  text: string;
  timestamp: number;
  isFinal: boolean;
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
