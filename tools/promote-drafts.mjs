/* ============================================================
   TECHRA 下書き昇格スクリプト (Node.js 22+)

   content/drafts.json（AIが起草したニュース解説の下書き）を
   content/update.json に取り込み、manifest.json のversionを上げる。
   = 「下書きを公開可能な状態にする」処理。

   GitHub Actions では、これを専用ブランチ上で実行して
   プルリクエストを作る（人がマージして初めて公開）。
   ローカルでも `node tools/promote-drafts.mjs` で実行可能。
   ============================================================ */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const draftsPath = join(ROOT, 'content/drafts.json');
const updatePath = join(ROOT, 'content/update.json');
const manifestPath = join(ROOT, 'content/manifest.json');

if (!existsSync(draftsPath)) {
  console.log('[info] content/drafts.json が無いため何もしません。');
  process.exit(0);
}

const drafts = JSON.parse(readFileSync(draftsPath, 'utf8'));
const items = (drafts.items || []).map(it => { const c = { ...it }; delete c.draft; return c; });
if (!items.length) { console.log('[info] 下書きが空です。'); process.exit(0); }

const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : { version: 1 };
const update = existsSync(updatePath) ? JSON.parse(readFileSync(updatePath, 'utf8')) : {};
const stamp = new Date().toISOString().slice(0, 10);
const newVersion = (manifest.version || 1) + 1;

update.version = newVersion;
update.date = stamp;
update.news = update.news || [];
let added = 0;
for (const it of items) {
  if (!update.news.some(n => n.id === it.id)) { update.news.push(it); added++; }
}
update.growthLog = update.growthLog || [];
update.growthLog.unshift({
  date: stamp,
  type: 'news',
  text: `AIが起草し人がレビューしたニュース解説を${added}件追加（${items.map(d => (d.title || '').slice(0, 18) + '…').join(' / ')}）。一次情報の確認を推奨します。`,
  terms: [...new Set(items.flatMap(d => (d.terms || []).map(t => t.id)))].slice(0, 5)
});

manifest.version = newVersion;
manifest.date = stamp;

writeFileSync(updatePath, JSON.stringify(update, null, 2));
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`[info] update.json に${added}件を取り込み、manifest を v${newVersion} に更新しました。`);
