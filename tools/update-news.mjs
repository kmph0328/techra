/* ============================================================
   TECHRA 自動コンテンツ更新スクリプト (Node.js 22+)

   GitHub Actions(.github/workflows/update-content.yml)から日次実行される想定。
   ローカルでも `node tools/update-news.mjs` で動作する。

   ■ A（無料・常時）: ニュースレーダー
     - 経産省Atom ＋ Googleニュースのトピック別RSSを収集
     - 各見出しを領域・既存用語に自動リンク（クエリ＝トピックで高精度）
     - 無関係な見出しを除外し content/radar.json を出力
     - → サイトに「関連用語付きの最新ニュース見出し」として表示(AIなし・ハルシネーションなし)

   ■ B（課金・人が関所）: AI下書き → 人がレビュー → 公開
     - ANTHROPIC_API_KEY がある場合のみ、レーダー上位を Claude に渡し
       TECHRA形式のニュース解説(前提知識・観点別・事実/推測の区別)を起草
     - 下書きは content/drafts.json に保存（自動公開しない）
     - GitHub Actions側でPRを作成 → 人がマージして初めて公開（workflow参照）

   APIキーが無い場合はAのみ実行する。
   ============================================================ */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = JSON.parse(readFileSync(join(ROOT, 'tools/sources.json'), 'utf8'));

const VALID_TERM_IDS = Object.keys(SOURCES.termKeywords || {});
const VALID_DOMAINS = Object.keys(SOURCES.domainKeywords || {});

/* ---------- フィードURL組み立て ---------- */
function feedUrl(feed) {
  if (feed.type === 'gnews') {
    const q = encodeURIComponent(feed.query);
    return `https://news.google.com/rss/search?q=${q}&hl=ja&gl=JP&ceid=JP:ja`;
  }
  return feed.url;
}

async function fetchText(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'TECHRA-content-bot/1.0 (learning site radar)' },
      signal: AbortSignal.timeout(25000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (e) {
    console.warn(`[warn] フィード取得失敗: ${url} (${e.message})`);
    return null;
  }
}

/* ---------- 最小限のRSS/Atomパース(外部依存なし) ---------- */
function parseFeed(xml, feed) {
  const items = [];
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/g) || [];
  for (const b of blocks) {
    let title = pick(b, 'title');
    if (!title) continue;
    const link = pick(b, 'link') || (b.match(/<link[^>]*href="([^"]+)"/) || [])[1] || '';
    const dateStr = pick(b, 'pubDate') || pick(b, 'dc:date') || pick(b, 'updated') || pick(b, 'published') || '';
    const date = dateStr ? new Date(dateStr) : null;
    // Googleニュースのタイトルは「見出し - 媒体名」。媒体名は<source>から取り、タイトルから除去
    let source = feed.name;
    const srcTag = b.match(/<source[^>]*>([^<]+)<\/source>/);
    if (srcTag) {
      source = decode(srcTag[1]);
      const suffix = ' - ' + source;
      if (title.endsWith(suffix)) title = title.slice(0, -suffix.length);
    }
    items.push({
      title: decode(title).trim(),
      link: decode(link).trim(),
      date: date && !isNaN(date) ? date.toISOString().slice(0, 10) : null,
      source,
      feed
    });
  }
  return items;
}

function pick(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1').replace(/<[^>]+>/g, '').trim() : null;
}

function decode(s) {
  return (s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
}

/* ---------- 分類: 領域 & 用語リンク ---------- */
function classify(item) {
  const title = item.title;
  const domains = new Set();
  const terms = new Set();

  // 領域: gnessはクエリ＝トピックなのでフィード領域を採用
  if (item.feed.type === 'gnews') {
    (item.feed.domains || []).forEach(d => domains.add(d));
  }
  // 本文キーワードで領域を追加(METIはこれが主)
  for (const [domain, kws] of Object.entries(SOURCES.domainKeywords)) {
    if (kws.some(k => title.includes(k))) domains.add(domain);
  }
  // 用語リンク: 見出しに実際に出た用語だけを精密に紐付け(全フィード共通)
  for (const [termId, kws] of Object.entries(SOURCES.termKeywords)) {
    if (kws.some(k => title.includes(k))) terms.add(termId);
  }
  // 見出しから1語も拾えなかった場合のみ、フィードのトピック用語を保険的に付ける
  if (terms.size === 0 && item.feed.terms) item.feed.terms.forEach(t => terms.add(t));
  // 候補テーマ
  const candidateHits = [];
  for (const [cand, kws] of Object.entries(SOURCES.candidateKeywords)) {
    if (kws.some(k => title.includes(k))) candidateHits.push(cand);
  }
  return {
    title, link: item.link, date: item.date, source: item.source,
    feedName: item.feed.name,
    domains: [...domains].filter(d => VALID_DOMAINS.includes(d)),
    terms: [...terms].filter(t => VALID_TERM_IDS.includes(t)),
    candidateHits
  };
}

function normTitle(t) {
  return t.replace(/[\s　]+/g, '').replace(/[「」『』（）()【】]/g, '').slice(0, 24);
}

/* ---------- B: Claudeでニュース解説を起草(下書き) ---------- */
const NEWS_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['id', 'date', 'source', 'title', 'summary', 'why', 'background', 'lenses', 'facts', 'spec', 'terms', 'prereq', 'watch', 'domains'],
        properties: {
          id: { type: 'string' }, date: { type: 'string' }, source: { type: 'string' },
          title: { type: 'string' }, summary: { type: 'string' }, why: { type: 'string' }, background: { type: 'string' },
          lenses: {
            type: 'object', additionalProperties: false, required: ['beginner', 'tech', 'biz'],
            properties: { beginner: { type: 'string' }, tech: { type: 'string' }, biz: { type: 'string' }, reg: { type: 'string' }, risk: { type: 'string' } }
          },
          facts: { type: 'array', items: { type: 'string' } },
          spec: { type: 'array', items: { type: 'string' } },
          terms: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'rel'], properties: { id: { type: 'string' }, rel: { type: 'string' } } } },
          prereq: { type: 'array', items: { type: 'string' } },
          watch: { type: 'array', items: { type: 'string' } },
          domains: { type: 'array', items: { type: 'string' } }
        }
      }
    }
  }
};

async function draftWithClaude(radar) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();
  // 用語リンクが付いた＝学習接続しやすい見出しを優先
  const candidates = radar.filter(r => r.terms.length > 0).slice(0, 12);
  if (!candidates.length) return [];

  const prompt = `あなたは産業技術リテラシー学習サイト「TECHRA」の編集者です。
以下の収集済みニュース見出しから、学習価値が高いものを最大${SOURCES.maxDraftsPerRun}件選び、TECHRA形式のニュース解説に変換してください。

# 厳守事項（信頼性が最重要）
- 見出しと出典から確実に言えることだけを facts に、見通し・解釈・未確定情報は spec に分けること
- 見出しから判断できない詳細・数値・固有名詞を創作しない。不確かなら spec に回すか書かない
- これは人間がレビューする「下書き」です。確証のない断定は避けること
- 各解説は日本語。lensesは読者像(beginner/tech/biz/reg/risk)ごとに2〜4文
- terms/prereq の id は次の収録済み用語IDのみ: ${VALID_TERM_IDS.join(', ')}
- domains は次のみ: ${VALID_DOMAINS.join(', ')}
- id は "n-" で始まる英小文字ケバブケース。date は見出しの日付(YYYY-MM-DD)

# 収集済み見出し
${JSON.stringify(candidates.map(c => ({ title: c.title, source: c.source, date: c.date, link: c.link, terms: c.terms, domains: c.domains })), null, 2)}`;

  const response = await client.messages.create({
    model: process.env.TECHRA_MODEL || 'claude-opus-4-8',
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high', format: { type: 'json_schema', schema: NEWS_SCHEMA } },
    messages: [{ role: 'user', content: prompt }]
  });
  const text = response.content.find(b => b.type === 'text')?.text;
  if (!text) throw new Error('Claude応答にテキストなし');
  const parsed = JSON.parse(text);
  for (const item of parsed.items) {
    item.terms = (item.terms || []).filter(t => VALID_TERM_IDS.includes(t.id));
    item.prereq = (item.prereq || []).filter(id => VALID_TERM_IDS.includes(id));
    item.domains = (item.domains || []).filter(d => VALID_DOMAINS.includes(d));
    item.reflectedAt = new Date().toISOString().slice(0, 10);
    item.draft = true;
  }
  return parsed.items;
}

/* ---------- メイン ---------- */
async function main() {
  const today = new Date();
  const freshLimit = new Date(today.getTime() - (SOURCES.freshDays || 10) * 86400000);

  // 収集
  let raw = [];
  for (const feed of SOURCES.feeds) {
    const xml = await fetchText(feedUrl(feed));
    if (xml) raw = raw.concat(parseFeed(xml, feed));
  }
  console.log(`[info] 収集: ${raw.length}件`);

  // 分類 → 直近のみ → 関連あるもののみ → 重複排除 → フィード偏り是正
  const seen = new Set();
  const candScores = {};
  const radar = [];
  for (const it of raw) {
    const c = classify(it);
    if (it.date && new Date(it.date) < freshLimit) continue;     // 古い
    if (!c.domains.length && !c.terms.length) continue;          // 無関係を除外
    const key = normTitle(c.title);
    if (!key || seen.has(key)) continue;                         // 重複
    seen.add(key);
    c.candidateHits.forEach(x => candScores[x] = (candScores[x] || 0) + 1);
    delete c.candidateHits;
    radar.push(c);
  }
  radar.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  // フィードごとに上限を設けてトピックの多様性を確保
  const perFeed = {};
  const maxPerFeed = SOURCES.maxPerFeed || 6;
  const balanced = radar.filter(c => {
    perFeed[c.feedName] = (perFeed[c.feedName] || 0) + 1;
    return perFeed[c.feedName] <= maxPerFeed;
  });
  balanced.forEach(c => delete c.feedName);                      // 内部フィールドを除去
  const capped = balanced.slice(0, SOURCES.maxRadarItems || 40);
  console.log(`[info] レーダー: ${capped.length}件(関連あり・直近${SOURCES.freshDays}日・重複排除後)`);

  // A: radar.json を出力(サイトが読み込む)
  const stamp = today.toISOString().slice(0, 10);
  writeFileSync(join(ROOT, 'content/radar.json'), JSON.stringify({
    collectedAt: today.toISOString(),
    freshDays: SOURCES.freshDays,
    candidateMentions: candScores,
    items: capped
  }, null, 2));
  console.log('[info] content/radar.json を更新しました');

  // 候補スコアの確認用ログ
  const candTop = Object.entries(candScores).sort((a, b) => b[1] - a[1]);
  if (candTop.length) console.log('[info] 新規テーマ候補の出現:', candTop.map(([k, v]) => `${k}:${v}`).join(', '));

  // B: AI下書き(APIキーがある時のみ。自動公開はしない)
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('[info] ANTHROPIC_API_KEY 未設定 → Aのみ実行(AI下書きはスキップ)');
    return;
  }
  try {
    const drafts = await draftWithClaude(capped);
    if (!drafts.length) { console.log('[info] 下書き対象なし'); return; }
    writeFileSync(join(ROOT, 'content/drafts.json'), JSON.stringify({
      generatedAt: today.toISOString(), date: stamp, items: drafts
    }, null, 2));
    console.log(`[info] content/drafts.json に下書き${drafts.length}件を生成(レビュー後に公開)`);
  } catch (e) {
    console.error('[error] AI下書き生成に失敗:', e.message);
    process.exitCode = 1;
  }
}

main().catch(e => { console.error(e); process.exit(1); });
