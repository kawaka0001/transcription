# Humanity1 - セットアップ手順

リアルタイム3Dワードクラウド文字起こしアプリのセットアップガイドです。

## 📋 必要なもの

- Node.js 18以上
- Chrome または Edge ブラウザ（Web Speech API対応）
- Supabaseアカウント（無料プランでOK）

## 🚀 クイックスタート

### 1. 依存関係のインストール

```bash
npm install
```

### 2. Supabaseプロジェクトの作成

1. [Supabase](https://supabase.com)にアクセスしてアカウントを作成
2. 新しいプロジェクトを作成
3. プロジェクトの設定ページから以下を取得：
   - `Project URL`
   - `anon public` API Key

### 3. データベーステーブルの作成

Supabaseのダッシュボードで：

1. 左メニューから「SQL Editor」を選択
2. `supabase/schema.sql`の内容をコピー＆ペースト
3. 「Run」ボタンをクリックして実行

### 4. 環境変数の設定

`.env.local`ファイルを編集して、Supabaseの認証情報を設定：

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 5. 開発サーバーの起動

```bash
npm run dev
```

ブラウザで http://localhost:3000 を開く

### 6. マイクの許可

初回アクセス時にマイクの使用許可を求められるので「許可」をクリック

---

## 🎯 機能の説明

### データの永続化

このアプリは**三層構造**でデータを管理しています：

```
音声認識
  ↓
React State（最新100件のみ表示）
  ↓ 即座に保存
IndexedDB（ブラウザ内、直近300件バッファ）
  ↓ 1分ごとに自動同期
Supabase PostgreSQL（全履歴永久保存）
```

### 自動同期

- **IndexedDB**: 文字起こしが確定すると即座に保存
- **Supabase**: IndexedDBが300件を超えると、古いデータから自動的にSupabaseに移動
- **同期間隔**: 1分ごとに自動チェック

### 手動同期

ヘッダーの「☁️ 同期」ボタンをクリックすると、即座にSupabaseへ同期できます。

### データのクリア

「🗑️ クリア」ボタンで、React StateとIndexedDBのデータをクリアできます。
**注意**: Supabaseに同期済みのデータは削除されません。

---

## 🔧 トラブルシューティング

### 音声認識が動作しない

- Chrome または Edge ブラウザを使用していますか？
- マイクの使用許可を与えましたか？
- HTTPSまたはlocalhostで実行していますか？（Web Speech APIの要件）

### Supabase同期エラー

1. `.env.local`の設定を確認
2. Supabaseのテーブルが正しく作成されているか確認
3. ブラウザのコンソールでエラーメッセージを確認

### IndexedDBエラー

- ブラウザのプライベートモードを使用していないか確認
- ブラウザのストレージ容量を確認

---

## 📊 データ容量の目安

- **IndexedDB**: 最大300件（約数MB）
- **Supabase無料プラン**: 500MB（数十万件の文字起こしを保存可能）

1時間の連続録音で約3,000〜5,000件の文字起こしデータが生成されます。

---

## 🛠️ 開発コマンド

```bash
# 開発サーバー起動
npm run dev

# 型チェック
npm run type-check

# リント
npm run lint

# ビルド
npm run build

# 本番サーバー起動
npm run start
```

---

## 📚 主要ファイル

- `hooks/usePersistentTranscription.ts` - 永続化機能付き文字起こしフック
- `lib/indexeddb-storage.ts` - IndexedDB操作ライブラリ
- `lib/supabase.ts` - Supabase操作ライブラリ
- `lib/sync-manager.ts` - 自動同期ロジック
- `supabase/schema.sql` - データベーススキーマ

---

## ⚙️ 設定のカスタマイズ

### 保持件数の変更

`lib/sync-manager.ts`の以下の値を変更：

```typescript
const MAX_INDEXEDDB_COUNT = 300; // IndexedDBに保持する最大件数
const SYNC_INTERVAL_MS = 60 * 1000; // 同期間隔（ミリ秒）
```

### 表示件数の変更

`hooks/usePersistentTranscription.ts`の以下の値を変更：

```typescript
const DISPLAY_LIMIT = 100; // React Stateに保持する最新件数
```

---

## 🔐 セキュリティ

現在の実装では**認証なし**でSupabaseを使用しています（開発用）。

**本番環境では以下の対応が必須です：**

1. Supabaseの`Row Level Security (RLS)`ポリシーを修正
2. 認証機能を追加（Supabase Auth推奨）
3. ユーザーごとにデータを分離

---

## 📝 ライセンス

MIT License

---

## 🤝 サポート

問題が発生した場合は、Issueを作成してください。
