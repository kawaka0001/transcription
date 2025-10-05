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
}
