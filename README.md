# Humanity1 - Real-time 3D Word Cloud Transcription

リアルタイム音声認識と3Dワードクラウド可視化を組み合わせたインタラクティブなWebアプリケーション。

## ✨ 特徴

- 🎤 **リアルタイム文字起こし** - Web Speech APIによる高速な音声認識
- 🌐 **3Dワードクラウド** - Three.js (React Three Fiber) による美しい3D可視化
- 🔄 **インタラクティブ** - マウスで3D空間を回転・ズーム可能
- 📊 **頻度分析** - 重要な単語を自動抽出し、サイズと色で表現
- 💯 **完全無料** - Web Speech APIを使用（APIキー不要）

## 🚀 技術スタック

- **Next.js 15** - React フレームワーク
- **TypeScript** - 型安全な開発
- **React Three Fiber** - Three.jsのReactラッパー
- **Tailwind CSS** - ユーティリティファーストCSS
- **Web Speech API** - ブラウザネイティブの音声認識

## 📋 必要要件

- **ブラウザ**: Chrome または Edge（Web Speech API対応）
- **Node.js**: 18.17以降
- **マイク**: 音声入力用

## 🛠️ セットアップ

```bash
# 依存関係のインストール
npm install

# 開発サーバーの起動
npm run dev

# ビルド
npm run build

# 本番サーバーの起動
npm start
```

開発サーバーは [http://localhost:3000](http://localhost:3000) で起動します。

## 📖 使い方

1. **マイクボタンをクリック** - 音声認識を開始
2. **話す** - リアルタイムで文字起こしと3Dワードクラウドが生成される
3. **3D空間を操作** - マウスで回転、ズーム、パン
4. **停止ボタン** - 音声認識を停止
5. **クリアボタン** - すべてのデータをリセット

## 🎨 ワードクラウドの仕組み

- **サイズ**: 出現頻度が高いほど大きく表示
- **色**: 頻度に応じて青→緑→黄→赤に変化
- **配置**: 球体状にランダム配置
- **アニメーション**: 各単語がゆっくり回転

## 🔧 カスタマイズ

### 言語設定を変更

`components/TranscriptionApp.tsx` の `lang` を変更:

```typescript
useSpeechRecognition({
  lang: 'en-US', // 英語
  // lang: 'ja-JP', // 日本語（デフォルト）
  continuous: true,
  interimResults: true,
});
```

### ワードクラウドの単語数を変更

`components/TranscriptionApp.tsx` の `maxWords` を変更:

```typescript
const words = generateWordCloudData(texts, 100); // デフォルト: 50
```

### ストップワードの追加

`lib/keyword-extractor.ts` の `STOP_WORDS` に除外したい単語を追加。

## 📁 プロジェクト構造

```
humanity1/
├── app/                    # Next.js App Router
│   ├── globals.css        # グローバルスタイル
│   ├── layout.tsx         # ルートレイアウト
│   └── page.tsx           # ホームページ
├── components/            # Reactコンポーネント
│   ├── TranscriptionApp.tsx  # メインアプリ
│   └── WordCloud3D.tsx       # 3Dワードクラウド
├── hooks/                 # カスタムフック
│   └── useSpeechRecognition.ts  # 音声認識フック
├── lib/                   # ユーティリティ
│   └── keyword-extractor.ts     # キーワード抽出
├── types/                 # TypeScript型定義
│   └── speech.ts
└── public/                # 静的ファイル
```

## 🌐 ブラウザ対応

| ブラウザ | 対応状況 |
|---------|---------|
| Chrome | ✅ 完全対応 |
| Edge | ✅ 完全対応 |
| Firefox | ❌ Web Speech API非対応 |
| Safari | ⚠️ 部分的に対応 |

## 🤝 貢献

プルリクエストを歓迎します！

## 📄 ライセンス

MIT

## 🔗 関連リンク

- [Web Speech API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)
- [React Three Fiber](https://docs.pmnd.rs/react-three-fiber)
- [Next.js Documentation](https://nextjs.org/docs)

---

**Humanity1** - Making conversations visible in 3D space 🌐✨
