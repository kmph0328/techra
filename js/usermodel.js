/* ============================================================
   TECHRA ユーザーモデル (行動推定エンジン)
   - 明示的な設定を求めず、閲覧行動から関心・理解状態を推定する
   - すべてのデータはlocalStorageにのみ保存(外部送信なし)
   推定するもの:
   1. レンズ(関心の向き): beginner / tech / biz / reg
   2. 領域ごとの関心スコア
   3. 用語ごとの既読・理解状態(滞在時間・訪問回数・クイズ結果)
   4. つまずきシグナル(短時間離脱・基礎リンクの多用・誤答)
   ============================================================ */

window.UM = (function () {
  const KEY = 'techra_um_v1';

  function defaults() {
    return {
      createdAt: Date.now(),
      visits: 0,
      lastVisit: 0,
      lensManual: 'auto',                  // 利用者が明示選択したレンズ('auto'なら推定)
      lensScores: { beginner: 2, tech: 0, biz: 0, reg: 0 },  // 行動による加点
      domainInterest: {},                  // domainId -> score
      terms: {},                           // termId -> {views, dwell, last, quizOk, quizNg, secOpens}
      news: {},                            // newsId -> {read, last, viewTabs}
      routes: {},                          // routeId -> {startedAt}
      stumbles: 0,                         // つまずきシグナル累計
      quizTotal: { ok: 0, ng: 0 },
      lastTermId: null,
      lastNewsId: null,
      events: []                           // 直近の行動ログ(最大60件)
    };
  }

  let S = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const d = JSON.parse(raw);
        return Object.assign(defaults(), d);
      }
    } catch (e) { /* localStorage不可の環境ではメモリ内のみで動作 */ }
    return defaults();
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* noop */ }
  }

  function logEvent(type, detail) {
    S.events.push({ t: Date.now(), type, detail });
    if (S.events.length > 60) S.events = S.events.slice(-60);
  }

  /* ---------- セッション ---------- */
  function startSession() {
    const now = Date.now();
    const isReturn = S.lastVisit > 0 && (now - S.lastVisit) > 1000 * 60 * 30; // 30分以上空けば再訪
    if (S.lastVisit === 0 || isReturn) S.visits += 1;
    S.lastVisit = now;
    save();
  }

  /* ---------- 用語閲覧の記録 ---------- */
  let dwellTimer = null;
  let currentTerm = null;

  function term(id) {
    if (!S.terms[id]) S.terms[id] = { views: 0, dwell: 0, last: 0, quizOk: 0, quizNg: 0, secOpens: 0 };
    return S.terms[id];
  }

  function visitTerm(id, domainId) {
    endDwell();
    const t = term(id);
    t.views += 1;
    t.last = Date.now();
    S.lastTermId = id;
    if (domainId) S.domainInterest[domainId] = (S.domainInterest[domainId] || 0) + 1;
    logEvent('term', id);
    // 滞在時間の計測(5秒ごと、タブが見えている間のみ、上限10分)
    currentTerm = id;
    dwellTimer = setInterval(() => {
      if (document.hidden) return;
      const tt = term(currentTerm);
      if (tt.dwell < 600) { tt.dwell += 5; save(); }
    }, 5000);
    save();
  }

  function endDwell() {
    if (dwellTimer) { clearInterval(dwellTimer); dwellTimer = null; }
    currentTerm = null;
  }

  /* セクション展開 = そのレンズへの関心シグナル */
  function sectionOpened(termId, lenses) {
    const t = term(termId);
    t.secOpens += 1;
    (lenses || []).forEach(l => {
      if (l === 'basic') S.lensScores.beginner += 1;
      else if (l === 'tech' || l === 'process') S.lensScores.tech += 1;
      else if (l === 'biz' || l === 'news') S.lensScores.biz += 1;
      else if (l === 'reg' || l === 'risk') S.lensScores.reg += 1;
    });
    save();
  }

  /* ニュース閲覧 */
  function visitNews(id, domains) {
    if (!S.news[id]) S.news[id] = { read: 0, last: 0, viewTabs: {} };
    S.news[id].read += 1;
    S.news[id].last = Date.now();
    S.lastNewsId = id;
    (domains || []).forEach(d => { S.domainInterest[d] = (S.domainInterest[d] || 0) + 0.5; });
    logEvent('news', id);
    save();
  }

  function newsTabViewed(newsId, tab) {
    if (!S.news[newsId]) S.news[newsId] = { read: 0, last: 0, viewTabs: {} };
    S.news[newsId].viewTabs[tab] = true;
    if (tab === 'beginner') S.lensScores.beginner += 1;
    if (tab === 'tech') S.lensScores.tech += 1;
    if (tab === 'biz') S.lensScores.biz += 1;
    if (tab === 'reg' || tab === 'risk') S.lensScores.reg += 1;
    save();
  }

  /* クイズ結果 */
  function quizResult(termId, ok) {
    const t = term(termId);
    if (ok) { t.quizOk += 1; S.quizTotal.ok += 1; }
    else { t.quizNg += 1; S.quizTotal.ng += 1; S.stumbles += 1; }
    logEvent('quiz', termId + ':' + (ok ? 'ok' : 'ng'));
    save();
  }

  /* つまずきシグナル(基礎導線のクリック等) */
  function stumble() { S.stumbles += 1; save(); }

  function startRoute(id) {
    if (!S.routes[id]) S.routes[id] = { startedAt: Date.now() };
    save();
  }

  function setLens(l) { S.lensManual = l; save(); }

  /* ---------- 推定 ---------- */

  /* 既読判定: 60秒以上滞在 or 2回以上閲覧 or クイズ正解 */
  function isRead(termId) {
    const t = S.terms[termId];
    if (!t) return false;
    return t.dwell >= 60 || t.views >= 2 || t.quizOk > 0;
  }

  /* 理解済み判定: 既読 + クイズで誤答より正解が多い */
  function isUnderstood(termId) {
    const t = S.terms[termId];
    if (!t) return false;
    return isRead(termId) && t.quizOk > 0 && t.quizOk >= t.quizNg;
  }

  /* 現在のレンズ(手動指定がなければ行動から推定) */
  function lens() {
    if (S.lensManual !== 'auto') return S.lensManual;
    const readCount = Object.keys(S.terms).filter(isRead).length;
    const sc = S.lensScores;
    // 学習初期は「はじめて」扱い
    if (readCount < 2 && sc.tech + sc.biz + sc.reg < 6) return 'beginner';
    const entries = [['beginner', sc.beginner * 0.6], ['tech', sc.tech], ['biz', sc.biz], ['reg', sc.reg]];
    entries.sort((a, b) => b[1] - a[1]);
    return entries[0][1] > 0 ? entries[0][0] : 'beginner';
  }

  function lensIsAuto() { return S.lensManual === 'auto'; }

  /* 領域の習熟レベル: 0=未学習 1=入門 2=学習中 3=理解 */
  function domainLevel(domainId) {
    const ids = (window.TERMS || []).filter(t => t.domain === domainId).map(t => t.id);
    if (!ids.length) return 0;
    const read = ids.filter(isRead).length;
    const understood = ids.filter(isUnderstood).length;
    if (understood >= Math.max(2, ids.length * 0.5)) return 3;
    if (read >= Math.max(2, ids.length * 0.4)) return 2;
    if (read >= 1) return 1;
    return 0;
  }

  /* 関心の強い領域 上位n件 */
  function topDomains(n) {
    const arr = Object.entries(S.domainInterest).sort((a, b) => b[1] - a[1]);
    return arr.slice(0, n || 3).map(e => e[0]);
  }

  /* つまずいていそうか */
  function isStruggling() {
    const total = S.quizTotal.ok + S.quizTotal.ng;
    const errRate = total >= 3 ? S.quizTotal.ng / total : 0;
    return errRate > 0.45 || S.stumbles >= 6;
  }

  /* 次に読むべき用語の推薦
     スコア = 既読用語との関連 + 領域関心 + 重要度 - 既読減点 */
  function recommendTerms(n) {
    const readIds = Object.keys(S.terms).filter(isRead);
    const interest = S.domainInterest;
    const scores = {};
    (window.TERMS || []).forEach(t => {
      if (isRead(t.id)) return;
      let s = (t.importance || 3) * 1.2;
      s += (interest[t.domain] || 0) * 1.5;
      // 既読用語からの関連リンク
      readIds.forEach(rid => {
        const rt = (window.TERMS || []).find(x => x.id === rid);
        if (!rt) return;
        if ((rt.related || []).some(r => r.id === t.id)) s += 4;
        if ((rt.next || []).includes(t.id)) s += 5;
        if ((rt.prereq || []).includes(t.id)) s += 2;
      });
      // 未読の前提を持つ用語はやや後ろへ(つまずき防止)
      const missing = (t.prereq || []).filter(p => !isRead(p)).length;
      s -= missing * 1.5;
      scores[t.id] = s;
    });
    return Object.entries(scores).sort((a, b) => b[1] - a[1]).slice(0, n || 5).map(e => e[0]);
  }

  /* ニュースの関心マッチ度 */
  function newsScore(newsItem) {
    let s = 0;
    (newsItem.domains || []).forEach(d => { s += (S.domainInterest[d] || 0); });
    (newsItem.terms || []).forEach(t => { if (isRead(t.id)) s += 2; });
    return s;
  }

  /* 復習が必要な用語: 既読だが (a)3日以上前 (b)誤答あり (c)クイズ未挑戦 */
  function reviewQueue() {
    const now = Date.now();
    return Object.entries(S.terms)
      .filter(([id, t]) => isRead(id))
      .map(([id, t]) => {
        let urgency = 0;
        const days = (now - t.last) / 86400000;
        if (t.quizNg > t.quizOk) urgency += 3;
        if (t.quizOk === 0 && t.quizNg === 0) urgency += 2;
        if (days > 3) urgency += Math.min(3, days / 3);
        return { id, urgency, days: Math.floor(days) };
      })
      .filter(x => x.urgency > 0)
      .sort((a, b) => b.urgency - a.urgency);
  }

  /* 統計 */
  function stats() {
    const all = (window.TERMS || []).length;
    const read = (window.TERMS || []).filter(t => isRead(t.id)).length;
    const understood = (window.TERMS || []).filter(t => isUnderstood(t.id)).length;
    return {
      visits: S.visits,
      readCount: read,
      understoodCount: understood,
      totalTerms: all,
      progress: all ? Math.round(read / all * 100) : 0,
      quizOk: S.quizTotal.ok,
      quizNg: S.quizTotal.ng,
      newsRead: Object.keys(S.news).length
    };
  }

  function isFirstVisit() {
    return S.visits <= 1 && Object.keys(S.terms).length === 0;
  }

  function reset() {
    S = defaults();
    save();
  }

  /* 学習データのエクスポート/インポート(端末・ブラウザ間の引っ越し用) */
  function exportData() {
    return JSON.stringify({ app: 'techra', kind: 'user-model', exportedAt: new Date().toISOString(), data: S }, null, 2);
  }

  function importData(obj) {
    if (!obj || obj.app !== 'techra' || obj.kind !== 'user-model' || typeof obj.data !== 'object') {
      return false;
    }
    S = Object.assign(defaults(), obj.data);
    save();
    return true;
  }

  function raw() { return S; }

  return {
    startSession, visitTerm, endDwell, sectionOpened, visitNews, newsTabViewed,
    quizResult, stumble, startRoute, setLens,
    isRead, isUnderstood, lens, lensIsAuto, domainLevel, topDomains, isStruggling,
    recommendTerms, newsScore, reviewQueue, stats, isFirstVisit, reset, raw, save,
    exportData, importData
  };
})();
