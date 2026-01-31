# lithe-db

JSONファイルに保存する、AIフレンドリーな軽量データベース。

## 概要
JSON形式でデータを保存することにより、人間だけでなくAIにとっても構造が理解しやすく、直接読み書きが容易なデータベースを目指します。

## 主な特徴
- **コレクション指向**: データを「コレクション（テーブル）」単位で管理します。
- **自動採番 ID**: 全てのレコードには、挿入時に一意な `id` が自動的に付与されます。
- **自動タイムスタンプ**: `created_at`（作成日時）と `updated_at`（更新日時）が自動的に管理されます。
- **インデックス (Index) 支援**: 特定のフィールドに対してインデックスを作成し、高速な検索を可能にします。ユニーク制約も設定可能です。
- **リレーション (Relation)**: コレクション間の関連度を定義し、参照整合性の維持や自動マッピングをサポートします。
- **データ保護 (イミュータビリティ)**: 検索・挿入時に返されるオブジェクトはデータベース内の実データから隔離されています。取得したオブジェクトを直接編集しても、明示的に `update` メソッドを呼ばない限り、データベース内の元データは書き換えられません。
- **AIフレンドリー**: コード全体に詳細なJSDocコメントが付与されており、配布用ファイル（dist）でも可読性を維持しています。これにより、AIエージェントやLLMによるコード解析と実装補助がスムーズに行えます。
- **堅牢な書き込み**: トランザクションとアトミックな書き込みにより、データの破損を防ぎます。

## クイックスタート

### インストール

```bash
npm install lithe-db
```

### 基本的な使い方

```javascript
import LitheDB from 'lithe-db';
const db = new LitheDB('database.json');

// コレクションの取得とデータの挿入
const users = db.collection('users');
const newUser = await users.insert({
  name: '田中 太郎',
  email: 'tanaka@example.com'
});

console.log(newUser.id); // "000001_users"
console.log(newUser.created_at); // 自動付与されたタイムスタンプ

// データの検索
const user = await users.findOne({ email: 'tanaka@example.com' });

// リレーションの設定（メタデータ）
db.defineRelation('posts', 'author_email', { ref: 'users', field: 'email' });

// リレーションを含むデータの取得
const posts = db.collection('posts');
const postWithUser = await posts.findOne({ id: '000002_posts' }, { populate: true });
console.log(postWithUser.author_email.name); // ユーザーオブジェクトが展開される
```

## データ形式

データは `data` セクションにコレクションごと、`metadata` セクションにインデックス情報などが保存されます。

```json
{
  "metadata": {
    "indices": {
      "users": ["email"]
    },
    "relations": {
      "posts": {
        "author_email": { "ref": "users", "field": "email" }
      }
    }
  },
  "data": {
    "users": [
      {
        "id": "000001_users",
        "name": {
          "first": "太郎",
          "last": "田中"
        },
        "email": "example@example.com",
        "created_at": "2026-01-31T12:00:00Z",
        "updated_at": "2026-01-31T12:00:00Z"
      }
    ],
    "posts": [
      {
        "id": "000002_posts",
        "title": "最初の投稿",
        "author_email": "example@example.com",
        "created_at": "2026-01-31T12:05:00Z",
        "updated_at": "2026-01-31T12:05:00Z"
      }
    ]
  }
}
```

## 仕様詳細

### レコードの構成
全てのレコードは以下のシステムプロパティを自動的に保持します：
- `id`: 文字列。以下の特徴を持ちます：
  - **グローバル一意**: 全てのコレクションを通じてユニークです。
  - **順序性**: IDでソートすると、レコードの追加順になります。
  - **自己記述的**: IDから所属するコレクション名が推測できます（例: `000001_user`, `000002_post`）。
- `created_at`: ISO 8601 形式の文字列
- `updated_at`: ISO 8601 形式の文字列

その他のフィールドには、文字列、数値、論理値、配列、および**ネストされたオブジェクト**を自由に含めることができます。

### 書き込み動作
- データの挿入時、全コレクション共通のシリアル番号を元に、`${serial}_${collectionName}` 形式のIDが割り振られます。
- データの更新時は、 `updated_at` が現在時刻に更新されます。

### インデックス
- **高速化**: インデックスが設定されたフィールドでの検索は、全件スキャンを回避してメモリ上のハッシュマップ等を利用します。
- **ユニーク制約**: インデックス作成時に `unique: true` を指定することで、重複データの挿入を防ぐことができます。

### リレーション
- **参照定義**: `metadata.relations` に関連性を定義します。
  - `ref`: 参照先のコレクション名
  - `field`: 参照先のフィールド名（省略時は `id`）
- **柔軟な紐付け**: `id` だけでなく、`email` などの任意のフィールドを外部キーとして使用可能です。
- **自動解決**: 取得時に外部キーの値を、参照先の条件に一致する実データ（オブジェクト）に展開することが可能です。
- **整合性チェック**: 挿入・更新時に、参照先の値が実在するかをチェックします。

### トランザクション / アトミックな書き込み
- **アトミックな保存**: ファイル保存時は、一時ファイルに書き込んだ後にリネームを行う手法（Atomic Write）を採用し、書き込み中のクラッシュによるデータ破損を防止します。
- **トランザクション**: 複数の操作（挿入、更新、削除）を一つのグループとして扱い、一括でコミット（保存）する仕組みを提供します。途中でエラーが発生した場合はメモリ上の変更を破棄することで、一貫性を保ちます。
- **自動バックアップ**: 保存の直前に、直前の正常な状態を `.bak` ファイルとして保持する機能を備えます。

## API インターフェース

### `LitheDB` クラス
データベースのメインエントリポイント。

- `new LitheDB(storage, options)`
  - `storage`: ストレージアダプター、または保存先のファイルパス（文字列）。
  - `options`: `{ backup: boolean }` などの設定。
- `LitheDB.create(target, options)` (Static)
  - **自動環境判別**: 実行環境を自動的に判別し、最適なストレージアダプターを選択します。
    - **Node.js環境**: `FileStorage` を使用します。`target` 省略時はデフォルトで `'database.json'` が使用されます。
    - **ブラウザ環境**: `LocalStorage` を使用します。`target` 省略時はデフォルトで `'lithe-db'` がキー名として使用されます。
  - 引数なしで呼び出すだけで、即座に最適な永続化ストレージがセットアップされます。
- `db.collection(name)`
  - 指定した名前のコレクション操作用オブジェクトを返します。
  - **動的作成**: 指定したコレクションが存在しない場合、最初にデータを挿入したタイミングで自動的に作成されます。明示的な作成メソッドは不要です。
- `db.defineRelation(collection, field, config)`
  - リレーションを定義します。
- `db.createIndex(collection, field, options)`
  - インデックスを作成します。
- `db.beginTransaction()` / `db.commit()` / `db.rollback()`
  - トランザクション制御を行います。

### ストレージアダプター (Storage Adapter)
テストコードの記述や異なる実行環境への対応を容易にするため、I/O処理をインターフェースとして分離しています。

- **`FileStorage`**: Node.jsの `fs` に依存し、実際にファイルへ保存します（デフォルト）。
- **`MemoryStorage`**: メモリ上のみでデータを保持します。テストに最適です。
- **`LocalStorage`**: ブラウザの `localStorage` を使用してデータを永続化します。ブラウザ環境での利用に最適です。
- **`GoogleSheetsStorage`**: Google スプレッドシートをストレージとして使用します。各コレクションが個別のシートとして保存されるため、データの視認性が高く、スプレッドシート上での直接編集も可能です（`googleapis` パッケージが必要です）。
- **`GASStorage`**: Google Apps Script (GAS) 環境専用のストレージ。`SpreadsheetApp` を直接使用して Google スプレッドシートに保存します。外部ライブラリ不要で GAS 内から手軽に利用できます。
- **カスタムアダプター**: `read()`, `write()`, `exists()` などのメソッドを持つオブジェクトを実装することで、独自の保存先（S3, Redis等）を指定可能です。

### `Collection` オブジェクト
各コレクションに対する操作。

- `insert(data)`: データを挿入し、`id`, `created_at`, `updated_at` を付与したレコードを返します。
- `find(query, options)`: クエリに一致する全レコードを配列で返します。
- `findOne(query, options)`: クエリに一致する最初の1件を返します。
- `update(query, data)`: クエリに一致するレコードを更新し、`updated_at` を書き換えます。
- `remove(query)`: クエリに一致するレコードを削除します。

#### クエリとオプション
- `query`: `{ email: 'user@example.com' }` のようなオブジェクト形式。
- `options`:
  - `populate`: `true` にするとリレーションに基づきデータを展開。
  - `sort`: `{ id: 'asc' | 'desc' }` でのソート。

## 開発者向け

### ビルド

ライブラリのビルド（ESM/CJS/型定義の生成）を行うには、以下のコマンドを実行します。

```bash
npm run build
```

開発中に自動ビルドを行う場合は以下を使用してください。

```bash
npm run dev
```

### テスト

Vitest を使用してテストを実行します。

```bash
# 全テストの実行
npm test

# ウォッチモード（変更監視）での実行
npm run test:watch
```

## 配布・リリース

### リリースの作成方法
`package.json` のバージョン更新と Git タグの作成を同時に行うため、`npm version` コマンドを使用してください。目的によって以下の3つを使い分けます。

> [!IMPORTANT]
> GitHubのセキュリティ上の制限により、手元の環境から `.github/workflows/build.yml` を push できない場合があります。その場合は、[GitHubサイト上で直接編集](https://github.com/naosim/lithe-db/blob/main/.github/workflows/build.yml)を行ってください。

```bash
# 1. パッチリリース (バグ修正など: 1.0.0 -> 1.0.1)
npm version patch

# 2. マイナーリリース (機能追加など: 1.0.0 -> 1.1.0)
npm version minor

# 3. メジャーリリース (破壊的変更など: 1.0.0 -> 2.0.0)
npm version major

# GitHubにコードとタグを送信
git push origin main --tags
```

タグが push されると GitHub Actions が自動的に起動し、リポジトリの **Releases** ページに最新のビルド済みファイル（`lithe-db.global.js` など）が公開されます。

## 配布ファイル (dist)

`dist` ディレクトリには、さまざまな環境で利用できるようにビルドされたファイルが含まれています。

- **`lithe-db.js`**: ES Modules (ESM) 形式。モダンな Node.js 環境や、Vite/Webpack などのビルドールを使用するプロジェクトに最適です。
- **`lithe-db.cjs`**: CommonJS (CJS) 形式。従来の `require()` を使用する Node.js 環境向けです。
- **`lithe-db.global.js`**: IIFE 形式。ビルドツールを使わずに、ブラウザで `<script>` タグから直接読み込む場合に使用します。グローバル変数 `LitheDB` としてアクセスできます。
- **`lithe-db.d.ts`**: ES Modules 向けの TypeScript 型定義ファイルです。
- **`lithe-db.d.cts`**: CommonJS 向けの TypeScript 型定義ファイルです。
- **`*.map`**: ソースマップファイルです。デバッグ時に元のソースコードとの対応関係を確認するために使用されます。

## 技術スタック
- 言語: JavaScript (ES Modules)
- 互換性: Node.js (16+), 各種モダンブラウザ
- ストレージ: 単一のローカルJSONファイル (Node.js) / LocalStorage (Browser)

## 注意事項
- **ES Modules 専用**: 本ライブラリは ES Modules (ESM) 形式で提供されています。Node.js で使用する場合は `package.json` に `"type": "module"` を設定するか、拡張子を `.mjs` にしてください。
- **環境依存の自動切り替え**: `LitheDB.create()` を使用すると、実行環境（ブラウザか Node.js か）を自動で判別して適切なストレージを選択します。
