import type { Word } from '@/types/speech';
import TinySegmenter from 'tiny-segmenter';

// TinySegmenterのインスタンスを作成（再利用）
const segmenter = new TinySegmenter();

// 日本語のストップワード（除外する一般的な単語）
const STOP_WORDS = new Set([
  // 助詞
  'の', 'に', 'は', 'を', 'た', 'が', 'で', 'て', 'と', 'し', 'れ', 'さ', 'も', 'から', 'な', 'へ', 'か', 'だ', 'ば', 'ら', 'や', 'ね', 'よ', 'わ', 'ぞ', 'ぜ', 'け', 'ろ',
  // こそあど言葉（指示語）
  'この', 'その', 'あの', 'どの',
  'これ', 'それ', 'あれ', 'どれ',
  'ここ', 'そこ', 'あそこ', 'どこ',
  'こんな', 'そんな', 'あんな', 'どんな',
  'こう', 'そう', 'ああ', 'どう',
  'こちら', 'そちら', 'あちら', 'どちら',
  'これら', 'それら', 'あれら',
  'こうした', 'そうした', 'ああした',
  // 動詞・補助動詞
  'ある', 'いる', 'する', 'なる', 'できる', 'くる', 'いく', 'みる', 'れる', 'られる', 'せる', 'させる',
  // 形容詞・副詞
  'ない', 'なく', 'なっ', 'なかっ', 'よう', 'また', 'さらに', 'とても', 'すごく', 'かなり', 'もっと', 'ずっと',
  // 接続詞
  'が', 'けど', 'でも', 'しかし', 'だから', 'そして', 'または', 'ただし', 'なお', 'および',
  // 名詞（一般的すぎるもの）
  'こと', 'もの', 'とき', 'ところ', 'ため', 'ほう', 'ほか', 'うち',
  // その他機能語
  'として', 'において', 'に対して', 'に関する', 'によって', 'により', 'による', 'とともに', 'と共に', 'について',
  'あり', 'おり', 'まで', 'など', 'たり', 'その他', 'その後', 'それぞれ', 'たち', 'ます', 'です', 'ん',
  'い', 'せ', 'だっ', 'あっ', 'う', 'ので', 'のみ', 'でき', 'き', 'つ', 'における', 'いう', 'といった',
  'なら', '特に', '及び', 'では', 'にて', 'ながら', 'かつて', 'お', 'ほど', 'ものの', 'に対する', 'ほとんど', 'という', 'ず', 'なり',
  // フィラー（話し言葉のノイズ）
  'あー', 'えー', 'うー', 'おー', 'んー', 'まあ', 'ま', 'えっと', 'えーと', 'あのー', 'あの', 'その', 'そのー',
  'なんか', 'ちょっと', 'やっぱり', 'やっぱ', 'っていうか', 'まぁ', 'ねえ', 'さあ', 'ほら', 'じゃあ', 'んと'
]);

// 英語のストップワード
const ENGLISH_STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very'
]);

// 日本語を含むかチェック
function containsJapanese(text: string): boolean {
  return /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(text);
}

export function extractKeywords(text: string): Map<string, number> {
  const wordFrequency = new Map<string, number>();

  let words: string[];

  // 日本語が含まれていればTinySegmenterを使用
  if (containsJapanese(text)) {
    // 句読点・記号で文に分割してから形態素解析
    const sentences = text.split(/[。！？\n]+/).filter(s => s.length > 0);
    words = sentences.flatMap(sentence => segmenter.segment(sentence));
  } else {
    // 英語はスペースと記号で分割
    words = text.toLowerCase().split(/[\s,.!?]+/).filter(word => word.length > 0);
  }

  words.forEach(word => {
    const trimmedWord = word.trim().toLowerCase();

    // 空白や記号のみをスキップ
    if (!trimmedWord || /^[\s、。！？,.!?]+$/.test(trimmedWord)) {
      return;
    }

    // ストップワードをスキップ
    if (STOP_WORDS.has(trimmedWord) || ENGLISH_STOP_WORDS.has(trimmedWord)) {
      return;
    }

    // 短すぎる単語や数字のみの単語をスキップ
    if (trimmedWord.length < 2 || /^\d+$/.test(trimmedWord)) {
      return;
    }

    const count = wordFrequency.get(trimmedWord) || 0;
    wordFrequency.set(trimmedWord, count + 1);
  });

  return wordFrequency;
}

// 単語の重要度を計算（頻度重視、3回以上でボーナス）
function calculateWordWeight(word: string, frequency: number): number {
  let weight = frequency;

  // 3回以上出現した単語にのみボーナスを適用
  if (frequency >= 3) {
    // カタカナ語（全体がカタカナ）→ 固有名詞や専門用語の可能性が高い
    if (/^[ァ-ヶー]+$/.test(word)) {
      weight *= 1.2;
    }

    // 英大文字開始 → 固有名詞の可能性が高い
    if (/^[A-Z]/.test(word)) {
      weight *= 1.2;
    }

    // 長い単語（3文字以上）→ 重要な概念の可能性が高い
    if (word.length >= 3) {
      weight *= 1.2;
    }
  }

  return weight;
}

// 文に分割する関数（句読点を基準に）
function splitIntoSentences(text: string): string[] {
  // 日本語の句読点と改行で分割
  const sentences = text.split(/[。！？\n]+/).filter(s => s.trim().length > 0);
  return sentences.map(s => s.trim());
}

// 文の重要度スコアを計算
function calculateSentenceScore(
  sentence: string,
  wordFrequency: Map<string, number>,
  allWords: Set<string>
): number {
  // 文が短すぎる（5文字未満）または長すぎる（100文字以上）場合はスコアを下げる
  const length = sentence.length;
  if (length < 5) return 0;
  if (length > 100) return 0;

  // 文に含まれるキーワードを抽出
  const sentenceWords = extractKeywords(sentence);

  let score = 0;
  let keywordCount = 0;

  sentenceWords.forEach((freq, word) => {
    // 全体での出現頻度が高い単語が含まれていればスコアアップ
    const globalFreq = wordFrequency.get(word) || 0;
    if (globalFreq >= 2) {
      score += globalFreq * 10; // 頻度が高い単語は重要
      keywordCount++;
    }
  });

  // キーワードが1つも含まれていない文は除外
  if (keywordCount === 0) return 0;

  // キーワード密度ボーナス（文が短くてもキーワードが多い場合）
  const keywordDensity = keywordCount / (length / 10);
  score *= (1 + keywordDensity * 0.5);

  // 適度な長さの文にボーナス（15-50文字が理想）
  if (length >= 15 && length <= 50) {
    score *= 1.3;
  }

  return score;
}

// 重要な文を抽出する関数
export function extractImportantSentences(
  transcripts: string[],
  maxSentences: number = 20
): Array<{ text: string; score: number }> {
  // 全文を結合
  const fullText = transcripts.join(' ');

  // 全体のキーワード頻度を取得
  const wordFrequency = extractKeywords(fullText);
  const allWords = new Set(wordFrequency.keys());

  // 文に分割
  const sentences = splitIntoSentences(fullText);

  // 各文のスコアを計算
  const scoredSentences = sentences
    .map(sentence => ({
      text: sentence,
      score: calculateSentenceScore(sentence, wordFrequency, allWords),
    }))
    .filter(s => s.score > 0); // スコアが0より大きい文のみ

  // スコア順にソートして上位を取得
  return scoredSentences
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences);
}

// 重要な文を3D空間用のWordデータに変換
export function generateSentenceCloudData(
  transcripts: string[],
  maxSentences: number = 15
): Word[] {
  const importantSentences = extractImportantSentences(transcripts, maxSentences);

  if (importantSentences.length === 0) return [];

  const maxScore = importantSentences[0].score;
  const minScore = importantSentences[importantSentences.length - 1].score;

  // 3D空間にランダムに配置
  return importantSentences.map(({ text, score }, index) => {
    // スコアに基づいてサイズを計算（0.3〜0.8の範囲、文は小さめに）
    const normalizedScore = (score - minScore) / (maxScore - minScore || 1);
    const size = 0.3 + normalizedScore * 0.5;

    // 球体状にランダム配置
    const radius = 12;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.sin(phi) * Math.sin(theta);
    const z = radius * Math.cos(phi);

    return {
      text,
      timestamp: Date.now() + index, // 重複を避けるためインデックスを追加
      frequency: Math.round(score / 10), // スコアを頻度に変換（色付けに使用）
      position: [x, y, z],
      size,
    };
  });
}

export function generateWordCloudData(
  transcripts: string[],
  maxWords: number = 50
): Word[] {
  // 全文を結合
  const fullText = transcripts.join(' ');
  const wordFrequency = extractKeywords(fullText);

  // 重み付けスコアを計算してソート
  const weightedWords = Array.from(wordFrequency.entries()).map(([word, freq]) => ({
    word,
    frequency: freq,
    weight: calculateWordWeight(word, freq),
  }));

  const sortedWords = weightedWords
    .sort((a, b) => b.weight - a.weight)
    .slice(0, maxWords);

  if (sortedWords.length === 0) return [];

  const maxWeight = sortedWords[0].weight;
  const minWeight = sortedWords[sortedWords.length - 1].weight;

  // 3D空間にランダムに配置
  return sortedWords.map(({ word, frequency, weight }) => {
    // 重み付けスコアに基づいてサイズを計算（0.5〜2の範囲）
    const normalizedWeight = (weight - minWeight) / (maxWeight - minWeight || 1);
    const size = 0.5 + normalizedWeight * 1.5;

    // 球体状にランダム配置
    const radius = 10;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.sin(phi) * Math.sin(theta);
    const z = radius * Math.cos(phi);

    return {
      text: word,
      timestamp: Date.now(),
      frequency,
      position: [x, y, z],
      size,
    };
  });
}
