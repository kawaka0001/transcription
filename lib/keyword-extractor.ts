import type { Word } from '@/types/speech';

// 日本語のストップワード（除外する一般的な単語）
const STOP_WORDS = new Set([
  'の', 'に', 'は', 'を', 'た', 'が', 'で', 'て', 'と', 'し', 'れ', 'さ', 'ある', 'いる', 'も', 'する', 'から', 'な', 'こと', 'として', 'い', 'や', 'れる', 'など', 'なっ', 'ない', 'この', 'ため', 'その', 'あっ', 'よう', 'また', 'もの', 'という', 'あり', 'まで', 'られ', 'なる', 'へ', 'か', 'だ', 'これ', 'によって', 'により', 'おり', 'より', 'による', 'ず', 'なり', 'られる', 'において', 'ば', 'なかっ', 'なく', 'しかし', 'について', 'せ', 'だっ', 'その後', 'できる', 'それ', 'う', 'ので', 'なお', 'のみ', 'でき', 'き', 'つ', 'における', 'および', 'いう', 'さらに', 'でも', 'ら', 'たり', 'その他', 'に関する', 'たち', 'ます', 'ん', 'なら', 'に対して', '特に', 'せる', '及び', 'これら', 'とき', 'では', 'にて', 'ほか', 'ながら', 'うち', 'そして', 'とともに', 'ただし', 'かつて', 'それぞれ', 'または', 'お', 'ほど', 'ものの', 'に対する', 'ほとんど', 'と共に', 'といった', 'です', 'くる', 'という', 'こうした', 'ところ', 'ため'
]);

// 英語のストップワード
const ENGLISH_STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 'must', 'can', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very'
]);

export function extractKeywords(text: string): Map<string, number> {
  const wordFrequency = new Map<string, number>();

  // テキストを単語に分割（日本語と英語の両方に対応）
  const words = text
    .toLowerCase()
    .split(/[\s、。！？,.!?]+/)
    .filter(word => word.length > 0);

  words.forEach(word => {
    // ストップワードをスキップ
    if (STOP_WORDS.has(word) || ENGLISH_STOP_WORDS.has(word)) {
      return;
    }

    // 短すぎる単語や数字のみの単語をスキップ
    if (word.length < 2 || /^\d+$/.test(word)) {
      return;
    }

    const count = wordFrequency.get(word) || 0;
    wordFrequency.set(word, count + 1);
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
