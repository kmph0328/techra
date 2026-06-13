/* ============================================================
   TECHRA コンテンツ同期レイヤー
   - 同梱データ(js/data/*)をベースに、配信された差分(content/update.json)を
     実行時にマージする。これにより「アプリ本体の再配布なし」で
     用語・ニュース・成長ログ・候補テーマを更新できる。
   - 取得した差分はlocalStorageへキャッシュし、オフライン時も
     最後に同期した内容で表示する。
   - file:// で開いた場合(完全オフライン)は同梱データのみで動作。

   update.json の形式(累積差分):
   {
     "version": 2,
     "date": "2026-06-12",
     "terms": [ {完全な用語オブジェクト...} ],        // idで置換 or 追加
     "termPatches": [ {"id":"voc","updated":"..."} ], // 部分更新
     "news": [ {完全なニュースオブジェクト...} ],
     "comparisons": [...], "routes": [...],
     "candidates": [...],                             // 全置換
     "growthLog": [ {date,type,text,terms} ]          // 重複除外して先頭追加
   }
   ============================================================ */

window.ContentSync = (function () {
  const CACHE_KEY = 'techra_content_cache_v1';

  function appliedVersion() {
    return (window.CONTENT_META && window.CONTENT_META.version) || 1;
  }

  function replaceById(target, items) {
    (items || []).forEach(it => {
      if (!it || !it.id) return;
      const i = target.findIndex(x => x.id === it.id);
      if (i >= 0) target[i] = it; else target.push(it);
    });
  }

  function merge(up) {
    if (up.terms) replaceById(window.TERMS, up.terms);
    if (up.termPatches) {
      up.termPatches.forEach(p => {
        const t = (window.TERMS || []).find(x => x.id === p.id);
        if (t) Object.assign(t, p);
      });
    }
    if (up.news) replaceById(window.NEWS, up.news);
    if (up.comparisons) replaceById(window.COMPARISONS, up.comparisons);
    if (up.routes) replaceById(window.ROUTES, up.routes);
    if (up.candidates) window.CANDIDATES = up.candidates;
    if (up.growthLog) {
      up.growthLog.forEach(g => {
        const dup = (window.GROWTH_LOG || []).some(x => x.date === g.date && x.text === g.text);
        if (!dup) window.GROWTH_LOG.unshift(g);
      });
      window.GROWTH_LOG.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    }
  }

  /* 差分を適用(古い版・同じ版は無視)。trueなら適用された */
  function apply(up) {
    if (!up || typeof up.version !== 'number' || up.version <= appliedVersion()) return false;
    try {
      merge(up);
      window.CONTENT_META.version = up.version;
      window.CONTENT_META.syncedAt = up.date || null;
      return true;
    } catch (e) {
      return false;
    }
  }

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function writeCache(up) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(up)); } catch (e) { /* noop */ }
  }

  async function fetchJson(path) {
    const res = await fetch(path + '?_=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  /* 起動時同期:
     1) キャッシュ済み差分を即適用(初回描画から反映される)
     2) ホスティング先のmanifestを確認し、新しければupdate.jsonを取得・適用 */
  /* ニュースレーダー(A): 自動収集の見出し。content/radar.json を読み込む */
  const RADAR_CACHE = 'techra_radar_cache_v1';
  function loadRadarFromCache() {
    try {
      const raw = localStorage.getItem(RADAR_CACHE);
      if (raw) { const d = JSON.parse(raw); window.RADAR = d.items || []; window.RADAR_META = { collectedAt: d.collectedAt }; }
    } catch (e) { /* noop */ }
  }
  function setRadar(d) {
    window.RADAR = (d && d.items) || [];
    window.RADAR_META = { collectedAt: d && d.collectedAt };
    try { localStorage.setItem(RADAR_CACHE, JSON.stringify({ collectedAt: window.RADAR_META.collectedAt, items: window.RADAR })); } catch (e) { /* noop */ }
    window.dispatchEvent(new CustomEvent('techra:radar-loaded'));
  }

  async function start() {
    const cached = readCache();
    if (cached) apply(cached);
    loadRadarFromCache();   // オフライン/初回描画用に即時反映

    if (location.protocol === 'file:') {
      window.CONTENT_META.channel = 'offline';
      return;
    }
    try {
      const mf = await fetchJson('content/manifest.json');
      window.CONTENT_META.channel = 'online';
      window.CONTENT_META.lastChecked = new Date().toISOString();
      if (mf && typeof mf.version === 'number' && mf.version > appliedVersion()) {
        const up = await fetchJson('content/update.json');
        if (apply(up)) {
          writeCache(up);
          window.dispatchEvent(new CustomEvent('techra:content-updated', {
            detail: { version: up.version, message: `🌱 コンテンツを最新版に更新しました（v${up.version}・${up.date || ''}）` }
          }));
        }
      }
    } catch (e) {
      // 配信ファイルが無い/ネットワーク不可 → 同梱+キャッシュで動作継続
      if (window.CONTENT_META.channel !== 'online') window.CONTENT_META.channel = 'offline';
    }

    // ニュースレーダーの取得(独立。失敗してもサイトは動く)
    try {
      const radar = await fetchJson('content/radar.json');
      if (radar && Array.isArray(radar.items)) setRadar(radar);
    } catch (e) { /* radar.json未配置でも問題なし */ }
  }

  start();

  return {
    get version() { return appliedVersion(); },
    merge, apply
  };
})();
