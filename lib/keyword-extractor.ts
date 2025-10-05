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
  'なら', '特に', '及び', 'では', 'にて', 'ながら', 'かつて', 'お', 'ほど', 'ものの', 'に対する', 'ほとんど', 'という', 'ず', 'なり'
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

export function generateWordCloudData(
  transcripts: string[],
  maxWords: number = 50
): Word[] {
  // 全文を結合
  const fullText = transcripts.join(' ');
  const wordFrequency = extractKeywords(fullText);

  // 頻度順にソート
  const sortedWords = Array.from(wordFrequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxWords);

  if (sortedWords.length === 0) return [];

  const maxFrequency = sortedWords[0][1];
  const minFrequency = sortedWords[sortedWords.length - 1][1];

  // 3D空間にランダムに配置
  return sortedWords.map(([text, frequency], index) => {
    // 頻度に基づいてサイズを計算（0.5〜3の範囲）
    const normalizedFreq = (frequency - minFrequency) / (maxFrequency - minFrequency || 1);
    const size = 0.5 + normalizedFreq * 2.5;

    // 球体状にランダム配置
    const radius = 10;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.sin(phi) * Math.sin(theta);
    const z = radius * Math.cos(phi);

    return {
      text,
      timestamp: Date.now(),
      frequency,
      position: [x, y, z],
      size,
    };
  });
}
