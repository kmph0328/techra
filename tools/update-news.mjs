/* ============================================================
   TECHRA 自動コンテンツ更新スクリプト (Node.js 22+)

   GitHub Actions(.github/workflows/update-content.yml)から日次実行される想定。
   ローカルでも `node tools/update-news.mjs` で動作する。

   フェーズ1: 収集(常時実行)
     - tools/sources.json のRSS/Atomフィードを取得
     - 直近N日の見出しを領域キーワードで分類し content/inbox.json に保存
     - 新規テーマ候補(CANDIDATES)のニュース出現スコアを再計算

   フェーズ2: 解説生成(ANTHROPIC_API_KEY がある場合のみ)
     - 関連度の高い見出し上位を Claude (claude-opus-4-8) に渡し、
       TECHRA形式のニュース解説(前提知識・観点別解説・事実/推測の区別付き)を
       構造化出力で生成
     - content/update.json に差分としてマージし、manifest.json のversionを+1
     - → 公開サイトの全訪問者に自動反映される

   APIキーが無い場合はフェーズ1のみ実行し、inbox.jsonを人間のレビュー用に残す。
   ============================================================ */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = JSON.parse(readFileSync(join(ROOT, 'tools/sources.json'), 'utf8'));

/* サイトに収録済みの用語ID(生成ニュースのリンク検証に使用) */
const VALID_TERM_IDS = [
  'voc', 'pfas', 'sds-ghs', 'prtr', 'hazop', 'bouhaku', 'kouatsu-gas', 'zeb',
  'semi-process', 'euv', 'cleanroom', 'upw', 'cvd-pvd-ald', 'hbm', 'foundry-model',
  'hydrogen', 'ccus', 'scope123', 'lca', 'ppa', 'fit-fip', 'hikaseki',
  'heatpump-cop', 'lib', 'solid-state', 'datacenter', 'pue', 'liquid-cooling',
  'boiler-steam', 'heat-recovery', 'enecons-bels', 'casbee-leed',
  'econ-security', 'supply-risk', 'perovskite'
];
const VALID_DOMAINS = Object.keys(SOURCES.domainKeywords);

/* ---------- フェーズ1: 収集 ---------- */

async function fetchFeed(feed) {
  try {
    const res = await fetch(feed.url, {
      headers: { 'User-Agent': 'TECHRA-content-bot/1.0 (learning site updater)' },
      signal: AbortSignal.timeout(20000)
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (e) {
    console.warn(`[warn] フィード取得失敗: ${feed.name} (${e.message})`);
    return null;
  }
}

/* RSS2.0/RSS1.0/Atom の最低限のパース(外部依存なし) */
function parseFeed(xml, feed) {
  const items = [];
  const blocks = xml.match(/<(item|entry)[\s\S]*?<\/\1>/g) || [];
  for (const b of blocks) {
    const title = pick(b, 'title');
    if (!title) continue;
    const link = pick(b, 'link') || (b.match(/<link[^>]*href="([^"]+)"/) || [])[1] || '';
    const dateStr = pick(b, 'pubDate') || pick(b, 'dc:date') || pick(b, 'updated') || pick(b, 'published') || '';
    const date = dateStr ? new Date(dateStr) : null;
    items.push({ title: decode(title), link: decode(link), date: date && !isNaN(date) ? date.toISOString().slice(0, 10) : null, source: feed.name, feedDomains: feed.domains });
  }
  return items;
}

function pick(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, '$1').replace(/<[^>]+>/g, '').trim() : null;
}

function decode(s) {
  return (s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
}

function classify(items) {
  return items.map(it => {
    const domains = new Set(it.feedDomains || []);
    for (const [domain, kws] of Object.entries(SOURCES.domainKeywords)) {
      if (kws.some(k => it.title.includes(k))) domains.add(domain);
    }
    const candidateHits = [];
    for (const [cand, kws] of Object.entries(SOURCES.candidateKeywords)) {
      if (kws.some(k => it.title.includes(k))) candidateHits.push(cand);
    }
    return { ...it, domains: [...domains], candidateHits };
  });
}

/* ---------- フェーズ2: Claudeによる解説生成 ---------- */

const NEWS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'date', 'source', 'title', 'summary', 'why', 'background', 'lenses', 'facts', 'spec', 'terms', 'prereq', 'watch', 'domains'],
        properties: {
          id: { type: 'string' },
          date: { type: 'string' },
          source: { type: 'string' },
          title: { type: 'string' },
          summary: { type: 'string' },
          why: { type: 'string' },
          background: { type: 'string' },
          lenses: {
            type: 'object',
            additionalProperties: false,
            required: ['beginner', 'tech', 'biz'],
            properties: {
              beginner: { type: 'string' },
              tech: { type: 'string' },
              biz: { type: 'string' },
              reg: { type: 'string' },
              risk: { type: 'string' }
            }
          },
          facts: { type: 'array', items: { type: 'string' } },
          spec: { type: 'array', items: { type: 'string' } },
          terms: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false, required: ['id', 'rel'],
              properties: { id: { type: 'string' }, rel: { type: 'string' } }
            }
          },
          prereq: { type: 'array', items: { type: 'string' } },
          watch: { type: 'array', items: { type: 'string' } },
          domains: { type: 'array', items: { type: 'string' } }
        }
      }
    }
  }
};

async function draftNewsWithClaude(headlines) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();

  const prompt = `あなたは産業技術リテラシー学習サイト「TECHRA」の編集者です。
以下の収集済みニュース見出しから、学習価値が高いもの最大${SOURCES.maxDraftsPerRun}件を選び、TECHRA形式のニュース解説に変換してください。

# 厳守事項
- 見出しと出典から確実に言えることだけを facts に、見通し・解釈・未確定情報は spec に分けること(信頼性が最重要)
- 不確かな数値・固有名詞は書かない。見出しから判断できない詳細を創作しない
- 各解説は日本語。lensesは読者像(beginner=初学者/tech=技術者/biz=ビジネス・投資/reg=規制/risk=リスク)ごとに2〜4文
- terms/prereq の id は次の収録済み用語IDのみ使用可: ${VALID_TERM_IDS.join(', ')}
- domains は次のみ使用可: ${VALID_DOMAINS.join(', ')}
- id は "n-" で始まる英小文字ケバブケース
- date は見出しの日付(YYYY-MM-DD)

# 収集済み見出し
${JSON.stringify(headlines, null, 2)}`;

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'high',
      format: { type: 'json_schema', schema: NEWS_SCHEMA }
    },
    messages: [{ role: 'user', content: prompt }]
  });

  const text = response.content.find(b => b.type === 'text')?.text;
  if (!text) throw new Error('Claudeの応答にテキストがありません');
  const parsed = JSON.parse(text);

  // 収録外の用語ID・領域IDを除去(安全側のバリデーション)
  for (const item of parsed.items) {
    item.terms = (item.terms || []).filter(t => VALID_TERM_IDS.includes(t.id));
    item.prereq = (item.prereq || []).filter(id => VALID_TERM_IDS.includes(id));
    item.domains = (item.domains || []).filter(d => VALID_DOMAINS.includes(d));
    item.reflectedAt = new Date().toISOString().slice(0, 10);
  }
  return parsed.items;
}

/* ---------- メイン ---------- */

async function main() {
  const today = new Date();
  const freshLimit = new Date(today.getTime() - (SOURCES.freshDays || 7) * 86400000);

  // 1. 収集
  let all = [];
  for (const feed of SOURCES.feeds) {
    const xml = await fetchFeed(feed);
    if (xml) all = all.concat(parseFeed(xml, feed));
  }
  const fresh = classify(all).filter(it => !it.date || new Date(it.date) >= freshLimit);
  console.log(`[info] 収集: ${all.length}件 / 直近${SOURCES.freshDays}日: ${fresh.length}件`);

  // 2. 候補テーマのスコア集計
  const candScores = {};
  for (const it of fresh) for (const c of it.candidateHits) candScores[c] = (candScores[c] || 0) + 1;

  // 3. inbox.json(人間レビュー用 + 透明性のための公開ログ)
  const inbox = {
    collectedAt: today.toISOString(),
    freshDays: SOURCES.freshDays,
    candidateMentions: candScores,
    items: fresh.map(({ feedDomains, ...rest }) => rest)
  };
  writeFileSync(join(ROOT, 'content/inbox.json'), JSON.stringify(inbox, null, 2));
  console.log('[info] content/inbox.json を更新しました');

  // 4. 解説生成(APIキーがある場合のみ)
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log('[info] ANTHROPIC_API_KEY 未設定のため収集のみで終了(inbox.jsonを人間がレビューしてupdate.jsonへ反映してください)');
    return;
  }
  const relevant = fresh.filter(it => it.domains.length > 0).slice(0, 20);
  if (!relevant.length) {
    console.log('[info] 関連する新着見出しがないため解説生成をスキップ');
    return;
  }

  const drafts = await draftNewsWithClaude(relevant.map(({ candidateHits, feedDomains, ...rest }) => rest));
  if (!drafts.length) { console.log('[info] 生成対象なし'); return; }

  // 5. update.json へマージ + manifest version更新
  const manifestPath = join(ROOT, 'content/manifest.json');
  const updatePath = join(ROOT, 'content/update.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const update = existsSync(updatePath) ? JSON.parse(readFileSync(updatePath, 'utf8')) : {};
  const newVersion = (manifest.version || 1) + 1;
  const stamp = today.toISOString().slice(0, 10);

  update.version = newVersion;
  update.date = stamp;
  update.news = update.news || [];
  for (const d of drafts) {
    if (!update.news.some(n => n.id === d.id)) update.news.push(d);
  }
  update.growthLog = update.growthLog || [];
  update.growthLog.unshift({
    date: stamp,
    type: 'news',
    text: `自動更新: 新着ニュース${drafts.length}件を解説付きで追加（${drafts.map(d => d.title.slice(0, 18) + '…').join(' / ')}）。一次情報の確認を推奨します。`,
    terms: [...new Set(drafts.flatMap(d => d.terms.map(t => t.id)))].slice(0, 4)
  });

  writeFileSync(updatePath, JSON.stringify(update, null, 2));
  manifest.version = newVersion;
  manifest.date = stamp;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`[info] content/update.json を v${newVersion} に更新(ニュース${drafts.length}件追加)`);
}

main().catch(e => { console.error(e); process.exit(1); });
