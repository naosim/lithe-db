import { defineConfig } from 'tsup';

const banner = `
/**
 * lithe-db - Node.jsおよびブラウザで動作するAIフレンドリーな軽量JSONデータベース。
 * 
 * 主な特徴:
 * - コレクション指向のデータ管理。
 * - IDとタイムスタンプの自動生成。
 * - リレーション（関連付け）とインデックスのサポート。
 * - アトミックな書き込みとトランザクション機能。
 * - アイソモーフィック仕様（Node.jsのFileStorageとブラウザのLocalStorageをサポート）。
 * 
 * このファイルは lithe-db ライブラリの一部です。
 * 人間およびAIによる解析を容易にするため、コメントを保持した状態でビルドされています。
 */
`;

export default defineConfig({
  entry: ['index.js'],
  format: ['cjs', 'esm', 'iife'],
  globalName: 'LitheDB',
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: false, // AI解析のために可読性を維持
  outDir: 'dist',
  platform: 'neutral',
  external: ['node:fs/promises'],
  banner: {
    js: banner,
  },
});
