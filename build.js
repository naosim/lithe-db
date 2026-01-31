import { build } from 'tsup';

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

try {
  await build({
    entry: ['index.js'],
    format: ['cjs', 'esm', 'iife'],
    globalName: 'LitheDB',
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    minify: false,
    outDir: 'dist',
    platform: 'node',
    external: ['node:fs/promises', 'googleapis'],
    banner: {
      js: banner,
    },
  });
  console.log('Build successful!');
} catch (error) {
  console.error('Build failed:', error);
  process.exit(1);
}
