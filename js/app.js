/* ============================================================
   TECHRA アプリケーション本体
   ルーティング / 適応表示 / 各ページ描画
   ============================================================ */
(function () {
  'use strict';

  const $app = document.getElementById('app');
  const TODAY = new Date(); // 情報鮮度判定の基準は常に実日付

  /* ---------- ユーティリティ ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function termById(id) { return (window.TERMS || []).find(t => t.id === id); }

  /* ---------- リンクインデックス(逆リンク・整合性) ----------
     手作業リンクの「張り忘れ」を計算で補い、孤立・リンク切れを検出する */
  let _linkIndex = null;
  function linkIndex() {
    if (_linkIndex) return _linkIndex;
    const ids = new Set((window.TERMS || []).map(t => t.id));
    const inbound = {};   // termId -> [{from, kind}]
    const broken = [];    // 参照先が存在しないリンク
    const push = (to, from, kind) => {
      if (!ids.has(to)) { broken.push({ from, to, kind }); return; }
      (inbound[to] = inbound[to] || []).push({ from, kind });
    };
    (window.TERMS || []).forEach(t => {
      (t.related || []).forEach(r => push(r.id, t.id, 'related'));
      (t.next || []).forEach(id => push(id, t.id, 'next'));
      (t.prereq || []).forEach(id => push(id, t.id, 'prereq'));
    });
    // 孤立 = related/next/prereqの出入りが両方ゼロ
    const orphans = (window.TERMS || []).filter(t => {
      const out = (t.related || []).length + (t.next || []).length + (t.prereq || []).length;
      const inn = (inbound[t.id] || []).length;
      return out === 0 && inn === 0;
    }).map(t => t.id);
    _linkIndex = { inbound, broken, orphans };
    return _linkIndex;
  }

  /* ある用語を参照している他テーマ(その用語のrelated/next/prereqに未掲載のものだけ=張り忘れ補完) */
  function backlinksFor(termId) {
    const t = termById(termId);
    if (!t) return [];
    const forward = new Set([
      ...(t.related || []).map(r => r.id),
      ...(t.next || []),
      ...(t.prereq || [])
    ]);
    const KIND = { related: '関連先として参照', next: '次の一歩として参照', prereq: '前提として参照' };
    const seen = new Set();
    return (linkIndex().inbound[termId] || [])
      .filter(b => !forward.has(b.from))
      .filter(b => { if (seen.has(b.from)) return false; seen.add(b.from); return true; })
      .map(b => ({ id: b.from, reason: KIND[b.kind] || '参照' }));
  }
  function domainById(id) { return (window.DOMAINS || []).find(d => d.id === id); }
  function newsById(id) { return (window.NEWS || []).find(n => n.id === id); }
  function compById(id) { return (window.COMPARISONS || []).find(c => c.id === id); }

  function daysSince(dateStr) {
    return Math.floor((TODAY - new Date(dateStr)) / 86400000);
  }
  function fmtDate(s) {
    const d = new Date(s);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  }

  const LENS_LABEL = { auto: '自動', beginner: 'はじめて', tech: '技術・設備', biz: '事業・市場', reg: '規制・安全' };
  const LENS_DESC = {
    beginner: '全体像と直感的な説明を優先しています',
    tech: '技術・工程・設備の節を優先しています',
    biz: '市場・企業・投資の節を優先しています',
    reg: '規制・制度・リスクの節を優先しています'
  };

  /* 本文マークアップ → HTML
     [[id|label]] / [[id]] → 用語リンク、**x** → 強調、- → 箇条書き */
  function rich(text) {
    if (!text) return '';
    let t = esc(text);
    t = t.replace(/\[\[([a-z0-9-]+)\|([^\]]+)\]\]/g, (m, id, label) => {
      const unread = !UM.isRead(id);
      return `<a class="t-link${unread ? ' unread' : ''}" href="#/term/${id}" data-term="${id}">${label}</a>`;
    });
    t = t.replace(/\[\[([a-z0-9-]+)\]\]/g, (m, id) => {
      const tt = termById(id);
      const label = tt ? esc(tt.name) : id;
      const unread = !UM.isRead(id);
      return `<a class="t-link${unread ? ' unread' : ''}" href="#/term/${id}" data-term="${id}">${label}</a>`;
    });
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // 段落・リスト
    const blocks = t.split(/\n\n+/);
    return blocks.map(b => {
      const lines = b.split('\n');
      const isUl = lines.every(l => l.trim().startsWith('- ') || !l.trim());
      const isOl = lines.every(l => /^\d+\.\s/.test(l.trim()) || !l.trim());
      if (isUl && lines.some(l => l.trim())) {
        return '<ul>' + lines.filter(l => l.trim()).map(l => `<li>${l.trim().slice(2)}</li>`).join('') + '</ul>';
      }
      if (isOl && lines.some(l => l.trim())) {
        return '<ol>' + lines.filter(l => l.trim()).map(l => `<li>${l.trim().replace(/^\d+\.\s/, '')}</li>`).join('') + '</ol>';
      }
      return `<p>${b.replace(/\n/g, '<br>')}</p>`;
    }).join('');
  }

  function termChip(id, extra) {
    const t = termById(id);
    if (!t) return '';
    const d = domainById(t.domain);
    const read = UM.isRead(id);
    return `<a class="chip ${read ? 'ok' : 'outline'}" href="#/term/${id}" title="${esc(t.oneLiner || '')}">${d ? d.icon + ' ' : ''}${esc(shortName(t.name))}${read ? ' ✓' : ''}${extra || ''}</a>`;
  }

  function shortName(name) {
    return name.replace(/（[^）]*）/g, '');
  }

  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.add('hidden'), 3200);
  }

  /* ============================================================
     ホーム
     ============================================================ */
  function renderHome() {
    const stats = UM.stats();
    const first = UM.isFirstVisit();
    const lens = UM.lens();
    let html = '';

    if (first) {
      html += `
      <div class="hero">
        <h1>用語を「点」ではなく、<br>産業・規制・市場の「地図」で理解する。</h1>
        <p>TECHRAは、社会人のための産業技術リテラシー学習基盤です。VOC、EUV、PPA、Scope3——ニュースに出てくる言葉を、技術・工程・規制・市場のつながりごと理解できます。</p>
        <p><strong>設定は不要です。</strong>あなたの読み方から関心と理解度を推定し、説明の順番・深さ・おすすめが自然に変わっていきます。</p>
        <div class="hero-actions">
          <a class="btn primary" href="#/news">📰 ニュースから入る</a>
          <a class="btn ghost" href="#/routes">🗺 学習ルートから入る</a>
          <a class="btn ghost" href="#/library">🔍 気になる用語を調べる</a>
        </div>
        <div class="hero-stats">
          <div class="hero-stat"><b>${(window.TERMS || []).length}</b>収録テーマ</div>
          <div class="hero-stat"><b>${(window.NEWS || []).length}</b>解説付きニュース</div>
          <div class="hero-stat"><b>${(window.COMPARISONS || []).length}</b>比較解説</div>
          <div class="hero-stat"><b>${(window.CANDIDATES || []).length}</b>自動検知された新テーマ候補</div>
        </div>
      </div>`;
    } else {
      // 再訪者向けパーソナライズ
      const tops = UM.topDomains(2).map(domainById).filter(Boolean);
      const lensTxt = UM.lensIsAuto() ? `${LENS_LABEL[lens]}（行動から推定）` : LENS_LABEL[lens];
      html += `
      <div class="persona-strip">
        <span class="ps-icon">👋</span>
        <span>おかえりなさい（${stats.visits}回目の訪問）。
        ${tops.length ? `あなたの関心領域: <strong>${tops.map(d => d.icon + d.name).join('・')}</strong>。` : ''}
        現在のレンズ: <strong>${lensTxt}</strong></span>
        <span class="muted small">読了 ${stats.readCount}/${stats.totalTerms} テーマ（${stats.progress}%）</span>
      </div>`;

      // 前回の続き
      const lastId = UM.raw().lastTermId;
      const lastT = lastId ? termById(lastId) : null;
      const recs = UM.recommendTerms(3).map(termById).filter(Boolean);
      const due = UM.reviewQueue().slice(0, 3);

      html += `<div class="grid-3" style="margin-bottom:18px">`;
      if (lastT) {
        html += `<a class="tile" href="#/term/${lastT.id}">
          <span class="chip brand">前回の続き</span>
          <h3>${esc(lastT.name)}</h3>
          <p>${esc(lastT.oneLiner.slice(0, 60))}…</p>
        </a>`;
      }
      if (recs.length) {
        html += `<a class="tile" href="#/term/${recs[0].id}">
          <span class="chip accent">あなたへのおすすめ</span>
          <h3>${esc(recs[0].name)}</h3>
          <p>${UM.isRead(recs[0].prereq && recs[0].prereq[0]) || !(recs[0].prereq || []).length ? '読んだテーマとつながる次の一歩です。' : '関心領域の重要テーマです。'}</p>
        </a>`;
      }
      if (due.length) {
        const dt = termById(due[0].id);
        html += `<a class="tile" href="#/review">
          <span class="chip warn">復習どき</span>
          <h3>${dt ? esc(shortName(dt.name)) : '復習'} ほか${due.length}件</h3>
          <p>記憶が薄れる前に1問だけ確認しませんか。</p>
        </a>`;
      } else {
        html += `<a class="tile" href="#/map">
          <span class="chip">知識マップ</span>
          <h3>あなたの地図を見る</h3>
          <p>読んだテーマがつながり、地図が灯っていきます。</p>
        </a>`;
      }
      html += `</div>`;

      if (UM.isStruggling()) {
        html += `<div class="adapt-note"><span class="an-icon">🧭</span><span>最近のクイズ結果から、<b>基礎の確認が役立ちそう</b>と推定しています。各ページで「直感的にいうと」を優先表示し、前提知識への導線を増やしています。</span></div>`;
      }
    }

    // あなた向けニュース
    const newsSorted = [...(window.NEWS || [])].sort((a, b) => {
      const sa = UM.newsScore(a), sb = UM.newsScore(b);
      if (sb !== sa) return sb - sa;
      return new Date(b.date) - new Date(a.date);
    }).slice(0, 4);

    html += `<div class="card-head" style="margin-top:8px"><h2 style="font-size:18px">📰 ${first ? '最新ニュース × 学習' : 'あなたの学習とつながるニュース'}</h2><a class="card-link" href="#/news">すべて見る →</a></div>`;
    newsSorted.forEach(n => { html += newsItemHtml(n, !first); });

    // 領域タイル
    html += `<div class="card-head" style="margin-top:30px"><h2 style="font-size:18px">🗺 領域から学ぶ</h2><a class="card-link" href="#/library">用語ライブラリ →</a></div><div class="grid-3">`;
    (window.DOMAINS || []).forEach(d => {
      const dTerms = (window.TERMS || []).filter(t => t.domain === d.id);
      const read = dTerms.filter(t => UM.isRead(t.id)).length;
      const pct = dTerms.length ? Math.round(read / dTerms.length * 100) : 0;
      html += `<a class="tile domain-tile" style="--dcolor:${d.color}" href="#/library?d=${d.id}">
        <span class="d-icon">${d.icon}</span>
        <h3>${esc(d.name)}</h3>
        <p>${esc(d.short)}</p>
        <div class="progress-bar"><span style="width:${pct}%"></span></div>
        <div class="tile-meta"><span class="muted small">${dTerms.length}テーマ${read ? ` / 既読${read}` : ''}</span></div>
      </a>`;
    });
    html += `</div>`;

    // 成長中であることの提示
    const latestGrowth = (window.GROWTH_LOG || [])[0];
    if (latestGrowth) {
      html += `<div class="card" style="margin-top:26px">
        <div class="card-head"><h2><span class="h-icon">🌱</span>このサイトは成長しています</h2><a class="card-link" href="#/growth">成長ログ →</a></div>
        <p style="margin:0;font-size:13.5px"><span class="chip outline small">${esc(latestGrowth.date)}</span> ${esc(latestGrowth.text)}</p>
        <p class="muted small" style="margin:8px 0 0">ニュース出現頻度から <strong>${esc((window.CANDIDATES || [])[0]?.name || '')}</strong> など${(window.CANDIDATES || []).length}件の新規テーマ候補を検知中。</p>
      </div>`;
    }

    $app.innerHTML = html;
  }

  function newsItemHtml(n, showMatch) {
    const score = UM.newsScore(n);
    const doms = (n.domains || []).map(domainById).filter(Boolean);
    return `<a class="news-item" href="#/news/${n.id}">
      <div class="n-meta">
        <span>${fmtDate(n.date)}</span>
        <span>出典: ${esc(n.source)}</span>
        ${doms.map(d => `<span class="chip small" style="background:${d.color}18;color:${d.color}">${d.icon} ${esc(d.name)}</span>`).join('')}
        ${showMatch && score >= 3 ? '<span class="match-badge">あなたの関心と関連</span>' : ''}
        ${UM.raw().news[n.id] ? '<span class="chip ok small">既読</span>' : ''}
      </div>
      <h3>${esc(n.title)}</h3>
      <p>${esc(n.summary.slice(0, 90))}…</p>
      <div class="n-terms">${(n.terms || []).slice(0, 4).map(t => {
        const tt = termById(t.id);
        return tt ? `<span class="chip ${UM.isRead(t.id) ? 'ok' : ''} small">${esc(shortName(tt.name))}</span>` : '';
      }).join('')}</div>
    </a>`;
  }

  /* ============================================================
     ニュース一覧 / 詳細
     ============================================================ */
  function renderNewsList(filterDomain) {
    $app.setAttribute('data-purpose', 'news');
    let list = [...(window.NEWS || [])];
    if (filterDomain) list = list.filter(n => (n.domains || []).includes(filterDomain));
    const personalized = !UM.isFirstVisit();
    list.sort((a, b) => {
      if (personalized) {
        const sa = UM.newsScore(a), sb = UM.newsScore(b);
        if (Math.abs(sb - sa) > 2) return sb - sa;
      }
      return new Date(b.date) - new Date(a.date);
    });

    let html = `<span class="eyebrow">NEWS × LEARNING</span>
    <h1 class="page-title">ニュースは、学習の入口。</h1>
    <p class="page-lead">各記事に「読むための前提知識」「事実と推測の区別」「観点別の解説」が付いています。${personalized ? 'あなたの関心領域に近い記事を優先表示しています。' : ''}</p>
    <div class="filter-bar">
      <button class="filter-btn ${!filterDomain ? 'active' : ''}" data-nav="#/news">すべて</button>
      ${(window.DOMAINS || []).filter(d => (window.NEWS || []).some(n => (n.domains || []).includes(d.id)))
        .map(d => `<button class="filter-btn ${filterDomain === d.id ? 'active' : ''}" data-nav="#/news?d=${d.id}">${d.icon} ${esc(d.name)}</button>`).join('')}
    </div>`;

    // 先頭はフィーチャー記事として大きく見せる（雑誌の表紙）
    if (list.length) {
      const f = list[0];
      const doms = (f.domains || []).map(domainById).filter(Boolean);
      const score = UM.newsScore(f);
      html += `<a class="news-feature" href="#/news/${f.id}">
        <div class="nf-band">
          <div class="nf-meta">
            <span>${fmtDate(f.date)}</span><span>出典: ${esc(f.source)}</span>
            ${doms.map(d => `<span>${d.icon} ${esc(d.name)}</span>`).join('')}
            ${personalized && score >= 3 ? '<span class="match-badge">あなたの関心と関連</span>' : ''}
          </div>
          <h2>${esc(f.title)}</h2>
          <p class="nf-sum">${esc(f.summary)}</p>
        </div>
        <div class="nf-foot">${(f.terms || []).slice(0, 5).map(t => {
          const tt = termById(t.id);
          return tt ? `<span class="chip ${UM.isRead(t.id) ? 'ok' : ''} small">${esc(shortName(tt.name))}</span>` : '';
        }).join('')}</div>
      </a>`;
    }

    html += `<div class="news-list-grid">`;
    list.slice(1).forEach(n => { html += newsItemHtml(n, personalized); });
    html += `</div>`;
    $app.innerHTML = html;
  }

  function renderNewsDetail(id) {
    const n = newsById(id);
    if (!n) { $app.innerHTML = '<p>ニュースが見つかりません。</p>'; return; }
    $app.setAttribute('data-purpose', 'news');
    UM.visitNews(id, n.domains);

    const lens = UM.lens();
    // レンズに応じてタブの初期選択を変える
    const tabOrder = ['beginner', 'tech', 'biz', 'reg', 'risk'].filter(k => n.lenses[k]);
    let initTab = tabOrder[0];
    if (lens === 'tech' && n.lenses.tech) initTab = 'tech';
    else if (lens === 'biz' && n.lenses.biz) initTab = 'biz';
    else if (lens === 'reg' && (n.lenses.reg || n.lenses.risk)) initTab = n.lenses.reg ? 'reg' : 'risk';
    else if (lens === 'beginner' && n.lenses.beginner) initTab = 'beginner';

    const TAB_LABEL = { beginner: '🔰 初学者向け', tech: '⚙️ 技術・設備', biz: '📈 ビジネス・投資', reg: '📜 規制・制度', risk: '⚠️ リスク' };
    const prereqs = (n.prereq || []).map(termById).filter(Boolean);
    const unreadPrereqs = prereqs.filter(t => !UM.isRead(t.id));

    let html = `<div class="crumb"><a href="#/news">ニュース</a><span class="sep">›</span>${esc(n.title.slice(0, 24))}…</div>
    <div class="page-grid"><div>
      <div class="news-head">
        <div class="n-meta"><span class="chip brand">${fmtDate(n.date)}</span><span class="muted small">出典: ${esc(n.source)}</span><span class="muted small">学習コンテンツ反映日: ${fmtDate(n.reflectedAt)}</span></div>
        <h1>${esc(n.title)}</h1>
        <p style="margin:0;font-size:15px">${esc(n.summary)}</p>
        <div class="fact-box"><span class="fs-label">✔ 確認されている事実</span><ul>${n.facts.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>
        <div class="spec-box"><span class="fs-label">？ 推測・不確実な見通し</span><ul>${n.spec.map(f => `<li>${esc(f)}</li>`).join('')}</ul></div>
      </div>`;

    if (unreadPrereqs.length) {
      html += `<div class="card">
        <h2><span class="h-icon">🧩</span>このニュースを読むための前提知識</h2>
        <p class="muted small" style="margin:0 0 10px">未読の基礎テーマがあります。先に3分だけ読むと、このニュースの解像度が大きく変わります。</p>
        <div class="prereq-check">${prereqs.map(t =>
          `<a class="prereq-item ${UM.isRead(t.id) ? 'done' : 'todo'}" href="#/term/${t.id}">
            <span class="pc-mark">${UM.isRead(t.id) ? '✓' : '？'}</span>${esc(t.name)}
            <span class="muted small" style="margin-left:auto">${UM.isRead(t.id) ? '既読' : '約3分'}</span>
          </a>`).join('')}</div>
      </div>`;
    }

    html += `<div class="card">
      <h2><span class="h-icon">💡</span>なぜ重要か</h2><div style="font-size:14.5px">${rich(n.why)}</div>
      <h2 style="margin-top:18px"><span class="h-icon">🏗</span>背景にある構造</h2><div style="font-size:14.5px">${rich(n.background)}</div>
    </div>`;

    // 観点別解説タブ
    html += `<div class="card">
      <h2><span class="h-icon">🔭</span>観点別の解説 <span class="muted small" style="font-weight:400">あなたのレンズに合わせて「${TAB_LABEL[initTab].replace(/^\S+ /, '')}」を先頭にしています</span></h2>
      <div class="view-tabs">${tabOrder.map(k =>
        `<button class="view-tab ${k === initTab ? 'active' : ''}" data-newstab="${k}">${TAB_LABEL[k]}</button>`).join('')}</div>
      ${tabOrder.map(k => `<div class="view-panel ${k === initTab ? '' : 'hidden'}" data-newspanel="${k}">${rich(n.lenses[k])}</div>`).join('')}
    </div>`;

    // 今後の注目点
    html += `<div class="card"><h2><span class="h-icon">👀</span>今後の注目点</h2><ul style="margin:0;padding-left:22px;font-size:14px">${(n.watch || []).map(w => `<li style="margin:5px 0">${esc(w)}</li>`).join('')}</ul></div>`;
    html += `</div><aside>`;

    // 関連用語(理由付き)
    html += `<div class="card"><h2>🔗 このニュースから学ぶ</h2><div class="rel-list">${(n.terms || []).map(t => {
      const tt = termById(t.id);
      if (!tt) return '';
      return `<a class="rel-item" href="#/term/${t.id}">
        <span class="r-name">${UM.isRead(t.id) ? '✅' : '📖'} ${esc(shortName(tt.name))}</span>
        <span class="r-why">${esc(t.rel)}</span></a>`;
    }).join('')}</div></div>`;

    // 関連ニュース(同一ドメイン)
    const relNews = (window.NEWS || []).filter(x => x.id !== n.id && x.domains.some(d => n.domains.includes(d))).slice(0, 3);
    if (relNews.length) {
      html += `<div class="card"><h2>📰 関連する過去ニュース</h2><div class="rel-list">${relNews.map(x =>
        `<a class="rel-item" href="#/news/${x.id}"><span class="r-name">${esc(x.title.slice(0, 32))}…</span><span class="r-why">${fmtDate(x.date)}</span></a>`).join('')}</div></div>`;
    }
    html += `</aside></div>`;
    $app.innerHTML = html;

    // タブ切替
    $app.querySelectorAll('[data-newstab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const k = btn.dataset.newstab;
        $app.querySelectorAll('[data-newstab]').forEach(b => b.classList.toggle('active', b === btn));
        $app.querySelectorAll('[data-newspanel]').forEach(p => p.classList.toggle('hidden', p.dataset.newspanel !== k));
        UM.newsTabViewed(id, k);
        updateLensChip();
      });
    });
  }

  /* ============================================================
     用語ライブラリ
     ============================================================ */
  function renderLibrary(filterDomain) {
    let html = `<span class="eyebrow brand">LIBRARY</span>
    <h1 class="page-title">用語を、関係性ごと理解する。</h1>
    <p class="page-lead">すべての用語は「定義」だけでなく、原理・工程・設備・規制・市場・リスク・ニュースとの関係で解説されています。✓は既読。</p>
    <div class="filter-bar">
      <button class="filter-btn ${!filterDomain ? 'active' : ''}" data-nav="#/library">すべて</button>
      ${(window.DOMAINS || []).map(d => `<button class="filter-btn ${filterDomain === d.id ? 'active' : ''}" data-nav="#/library?d=${d.id}">${d.icon} ${esc(d.name)}</button>`).join('')}
    </div>`;

    const domains = filterDomain ? [domainById(filterDomain)].filter(Boolean) : (window.DOMAINS || []);
    domains.forEach(d => {
      const dTerms = (window.TERMS || []).filter(t => t.domain === d.id);
      if (!dTerms.length && !filterDomain) return;
      html += `<div class="card-head" style="margin-top:22px"><h2 style="font-size:16px;color:${d.color}">${d.icon} ${esc(d.name)}</h2><span class="muted small">${esc(d.short)}</span></div>`;
      if (!dTerms.length) {
        const cands = (window.CANDIDATES || []).filter(c => (c.domains || []).includes(d.id));
        html += `<div class="card"><p class="muted" style="margin:0">この領域のページは現在拡充中です。${cands.length ? `新規候補: ${cands.map(c => esc(c.name)).join('、')}（<a href="#/growth">成長ログ</a>参照）` : ''}</p></div>`;
        return;
      }
      html += `<div class="grid-3">`;
      dTerms.sort((a, b) => (b.importance || 0) - (a.importance || 0)).forEach(t => {
        html += `<a class="tile ${UM.isRead(t.id) ? 'read' : ''}" href="#/term/${t.id}">
          <span class="importance-stars small">${'★'.repeat(t.importance || 3)}</span>
          <h3>${esc(t.name)}</h3>
          <p>${esc(t.oneLiner.slice(0, 58))}…</p>
          <div class="tile-meta">${(t.tags || []).slice(0, 3).map(g => `<span class="chip small outline">${esc(g)}</span>`).join('')}</div>
        </a>`;
      });
      html += `</div>`;
    });

    // 比較解説
    html += `<div class="card-head" style="margin-top:30px"><h2 style="font-size:16px">⚖️ 比較で理解する</h2><span class="muted small">似た概念は並べると分かる</span></div><div class="grid-3">`;
    (window.COMPARISONS || []).forEach(c => {
      html += `<a class="tile" href="#/compare/${c.id}"><span class="chip brand small">比較</span><h3>${esc(c.title)}</h3><p>${esc(c.intro.slice(0, 55))}…</p></a>`;
    });
    html += `</div>`;
    $app.innerHTML = html;
  }

  /* ============================================================
     用語詳細（適応表示の中核）
     ============================================================ */
  function sectionPriority(sec, lens, struggling) {
    const L = sec.lens || [];
    let p = 0;
    if (struggling) { // つまずき推定時は基礎を最優先
      if (L.includes('basic')) p += 10;
    }
    if (lens === 'beginner' && L.includes('basic')) p += 8;
    if (lens === 'tech' && (L.includes('tech') || L.includes('process'))) p += 8;
    if (lens === 'biz' && (L.includes('biz') || L.includes('news'))) p += 8;
    if (lens === 'reg' && (L.includes('reg') || L.includes('risk'))) p += 8;
    if (L.includes('basic')) p += 2; // 基礎は常に少し上
    return p;
  }

  function renderTerm(id) {
    const t = termById(id);
    if (!t) { $app.innerHTML = '<p>用語が見つかりません。</p>'; return; }
    const d = domainById(t.domain);
    const lens = UM.lens();
    const struggling = UM.isStruggling();
    const wasRead = UM.isRead(id);
    const rec = UM.raw().terms[id] || {};
    UM.visitTerm(id, t.domain);

    // 目的別モード: 安全・法規=実務 / 初学者・つまずき=親しみ / それ以外=読書
    const purpose = t.domain === 'safety-reg' ? 'practical'
      : (lens === 'beginner' || struggling) ? 'beginner' : 'reference';
    $app.setAttribute('data-purpose', purpose);

    // セクションの並び替え(レンズ適応)
    const secs = (t.sections || []).map((s, i) => ({ ...s, _i: i, _p: sectionPriority(s, lens, struggling) }));
    secs.sort((a, b) => (b._p - a._p) || (a._i - b._i));
    const adapted = secs.some((s, i) => s._i !== i);

    // 開閉の初期状態: 既読なら全閉(圧縮表示)、未読なら上位2つを開く
    const openCount = wasRead ? 0 : 2;

    const staleDays = daysSince(t.updated);
    const unreadPrereqs = (t.prereq || []).filter(p => !UM.isRead(p));

    const LENS_TAG = { basic: '基礎', tech: '技術', process: '工程・設備', biz: 'ビジネス', reg: '規制', risk: 'リスク', news: 'ニュース' };

    let html = `<div class="crumb"><a href="#/library">用語</a><span class="sep">›</span><a href="#/library?d=${t.domain}">${d ? esc(d.name) : ''}</a><span class="sep">›</span>${esc(shortName(t.name))}</div>
    <div class="page-grid"><div>`;

    // ヘッダ
    html += `<div class="term-head">
      ${d ? `<span class="eyebrow" style="color:${d.color}">${d.icon} ${esc(d.name)}</span>` : ''}
      <div class="chip-row">
        ${(t.tags || []).map(g => `<span class="chip outline small">${esc(g)}</span>`).join('')}
      </div>
      <h1>${esc(t.name)}</h1>
      ${t.en ? `<div class="t-en">${esc(t.en)}</div>` : ''}
      <div class="one-liner">${rich(t.oneLiner)}</div>
      <div class="term-meta-row">
        <span class="importance-stars" title="重要度">${'★'.repeat(t.importance || 3)}${'☆'.repeat(5 - (t.importance || 3))}</span>
        <span>最終更新: ${fmtDate(t.updated)}</span>
        ${t.newsReflected ? `<span>ニュース反映: ${fmtDate(t.newsReflected)}</span>` : ''}
        ${wasRead ? '<span class="chip ok small">既読</span>' : ''}
      </div>
    </div>`;

    // 鮮度警告
    if (staleDays > (window.FRESHNESS?.warnDays || 365)) {
      html += `<div class="stale-note">⚠️ このページの最終更新から${Math.floor(staleDays / 30)}ヶ月が経過しています。規制・市場の記述は最新の一次情報をご確認ください。</div>`;
    }

    // 適応表示の透明な説明
    if (wasRead) {
      html += `<div class="adapt-note"><span class="an-icon">📕</span><span><b>既読のため要点を圧縮表示しています。</b>各節は見出しをクリックで展開できます。${rec.quizOk ? '' : '下部の理解度チェックがまだのようです。'}</span></div>`;
    } else if (adapted && !UM.lensIsAuto()) {
      html += `<div class="adapt-note"><span class="an-icon">🔭</span><span>レンズ「<b>${LENS_LABEL[lens]}</b>」に合わせ、${esc(LENS_DESC[lens] || '')}。</span></div>`;
    } else if (adapted && lens !== 'beginner') {
      html += `<div class="adapt-note"><span class="an-icon">🔭</span><span>あなたの閲覧傾向から「<b>${LENS_LABEL[lens]}</b>」の関心が強いと推定し、${esc(LENS_DESC[lens] || '')}（右上のレンズからいつでも変更できます）。</span></div>`;
    }

    // 前提知識バナー
    if (unreadPrereqs.length && (lens === 'beginner' || struggling || !wasRead)) {
      html += `<div class="prereq-banner"><b>💡 先に読むと理解が速いテーマ:</b> ${unreadPrereqs.map(p => termChip(p)).join(' ')}</div>`;
    }

    // 音声解説
    html += `<div class="audio-box" id="audio-box">
      <span class="a-icon">🎧</span>
      <div class="a-info"><div class="a-title">3分音声解説</div><div class="a-sub">全体像 → 要点3つ → よくある誤解 → 復習。耳だけで概要がつかめます。</div>
      <div class="audio-progress"><span id="audio-bar"></span></div></div>
      <button class="audio-btn" id="audio-play" title="再生">▶</button>
      <button class="audio-btn secondary" id="audio-stop" title="停止">■</button>
    </div>`;

    // 要点
    html += `<div class="key-points"><span class="section-label">まず押さえる3点</span><ol>${(t.keyPoints || []).map(k => `<li>${rich(k).replace(/^<p>|<\/p>$/g, '')}</li>`).join('')}</ol></div>`;

    // なぜ重要か
    html += `<div class="card"><span class="section-label">なぜ重要か</span><div style="font-size:14.5px">${rich(t.why)}</div></div>`;

    // 図解(あれば。早めに置いて理解を助ける)
    if (t.diagram && t.diagram.length && window.Diagram) {
      html += `<div class="card diagram-block"><span class="eyebrow brand">図解でわかる</span>${Diagram.renderAll(t.diagram)}</div>`;
    }

    // セクション(適応順)
    secs.forEach((s, idx) => {
      const isOpen = idx < openCount;
      const isRec = s._p >= 8;
      html += `<details class="t-section ${isRec ? 'recommended' : ''}" ${isOpen ? 'open' : ''} data-seclens="${(s.lens || []).join(',')}">
        <summary>${esc(s.t)}
          ${(s.lens || []).map(l => `<span class="s-lens-tag">${LENS_TAG[l] || l}</span>`).join('')}
          ${isRec ? '<span class="s-lens-tag" style="background:var(--accent-soft);color:var(--accent)">あなた向け</span>' : ''}
          <span class="s-arrow">▶</span>
        </summary>
        <div class="s-body">${rich(s.body)}</div>
      </details>`;
    });

    // 指標
    if (t.metrics && t.metrics.length) {
      html += `<div class="card"><h2><span class="h-icon">📏</span>関連する指標・単位</h2>${t.metrics.map(m => `<p style="margin:6px 0;font-size:14px"><strong>${esc(m.n)}</strong> — ${esc(m.d)}</p>`).join('')}</div>`;
    }

    // 誤解
    if (t.misconceptions && t.misconceptions.length) {
      html += `<div class="card"><h2><span class="h-icon">🚧</span>よくある誤解</h2>${t.misconceptions.map(m =>
        `<div class="miscon"><div class="m-x"><b>✕ 誤解:</b> ${rich(m.x).replace(/^<p>|<\/p>$/g, '')}</div><div class="m-o"><b>◯ 正しくは:</b> ${rich(m.o).replace(/^<p>|<\/p>$/g, '')}</div></div>`).join('')}</div>`;
    }

    // 比較
    const comps = (t.comparisons || []).map(compById).filter(Boolean);
    if (comps.length) {
      html += comps.map(c => compTableHtml(c)).join('');
    }

    // クイズ
    if (t.quiz && t.quiz.length) {
      html += `<div class="card" id="quiz-area"><h2><span class="h-icon">✏️</span>理解度チェック</h2>${t.quiz.map((q, qi) => quizHtml(q, qi)).join('')}</div>`;
    }

    // 出典
    html += `<div class="card"><h2><span class="h-icon">📚</span>主要な参照情報</h2><ul class="source-list">${(t.sources || []).map(s => `<li>${esc(s.n)}</li>`).join('')}</ul>
    ${t.caution ? `<div class="caution-box"><b>⚠ 注意:</b> ${esc(t.caution)}</div>` : ''}
    <p class="muted small" style="margin:12px 0 0">本ページは学習用の解説です。法規・安全・投資の判断は必ず一次情報をご確認ください。</p></div>`;

    html += `</div><aside>`;

    // 位置と関連マップ
    html += `<div class="card pos-box"><h2>📍 いまここ</h2>
      <div class="pos-path">${d ? `${d.icon} ${esc(d.name)}` : ''}<span class="sep">›</span><strong>${esc(shortName(t.name))}</strong></div>
      ${KMap.renderMini(t.id)}
      <p class="muted small" style="margin:8px 0 0">クリックで関連テーマへ。<a href="#/map">全体マップを見る</a></p></div>`;

    // 次に学ぶ
    const nextTerms = (t.next || []).map(termById).filter(Boolean);
    if (nextTerms.length) {
      html += `<div class="card"><h2>🧭 次に学ぶと良いテーマ</h2><div class="rel-list">${nextTerms.map(x =>
        `<a class="rel-item ${UM.isRead(x.id) ? 'dim' : ''}" href="#/term/${x.id}"><span class="r-name">${UM.isRead(x.id) ? '✅' : '→'} ${esc(shortName(x.name))}</span><span class="r-why">${esc(x.oneLiner.slice(0, 38))}…</span></a>`).join('')}</div></div>`;
    }

    // 関連語(理由付き)
    if (t.related && t.related.length) {
      html += `<div class="card"><h2>🔗 関連テーマ</h2><div class="rel-list">${t.related.map(r => {
        const rt = termById(r.id);
        if (!rt) return '';
        return `<a class="rel-item" href="#/term/${r.id}"><span class="r-name">${UM.isRead(r.id) ? '✅' : '📖'} ${esc(shortName(rt.name))}</span><span class="r-why">${esc(r.why)}</span></a>`;
      }).join('')}</div></div>`;
    }

    // 関連ニュース(このページとの関係付き)
    const relNews = (window.NEWS || []).filter(n => (n.terms || []).some(x => x.id === t.id));
    if (relNews.length) {
      html += `<div class="card"><h2>📰 関連ニュース</h2><div class="rel-list">${relNews.map(n => {
        const rel = (n.terms || []).find(x => x.id === t.id);
        return `<a class="rel-item" href="#/news/${n.id}"><span class="r-name">${esc(n.title.slice(0, 30))}…</span><span class="r-why">${fmtDate(n.date)} — ${esc(rel ? rel.rel : '')}</span></a>`;
      }).join('')}</div></div>`;
    }

    // 参照元(自動逆リンク): このテーマを入口にしている他テーマ
    const backs = backlinksFor(id);
    if (backs.length) {
      html += `<div class="card"><h2>↩︎ ここから参照されている</h2>
        <p class="muted small" style="margin:0 0 8px">他テーマがこの語を入口にしています(自動逆リンク)。</p>
        <div class="rel-list">${backs.slice(0, 8).map(b => {
        const bt = termById(b.id);
        if (!bt) return '';
        return `<a class="rel-item ${UM.isRead(b.id) ? 'dim' : ''}" href="#/term/${b.id}"><span class="r-name">${UM.isRead(b.id) ? '✅' : '←'} ${esc(shortName(bt.name))}</span><span class="r-why">${b.reason}</span></a>`;
      }).join('')}</div></div>`;
    }

    html += `</aside></div>`;
    $app.innerHTML = html;

    // ---- イベント配線 ----
    // セクション展開の記録(レンズ学習)
    $app.querySelectorAll('.t-section').forEach(sec => {
      sec.addEventListener('toggle', () => {
        if (sec.open) {
          UM.sectionOpened(id, (sec.dataset.seclens || '').split(',').filter(Boolean));
          updateLensChip();
        }
      });
    });
    // クイズ
    wireQuiz(id);
    // 音声
    wireAudio(t);
  }

  function quizHtml(q, qi) {
    return `<div class="quiz-q" data-qi="${qi}">
      <div class="q-text">Q${qi + 1}. ${esc(q.q)}</div>
      <div class="quiz-choices">${q.c.map((c, ci) => `<button class="quiz-choice" data-ci="${ci}">${esc(c)}</button>`).join('')}</div>
      <div class="quiz-explain hidden"></div>
    </div>`;
  }

  function wireQuiz(termId) {
    const t = termById(termId);
    $app.querySelectorAll('.quiz-q').forEach(qel => {
      const qi = parseInt(qel.dataset.qi, 10);
      const q = t.quiz[qi];
      qel.querySelectorAll('.quiz-choice').forEach(btn => {
        btn.addEventListener('click', () => {
          if (btn.disabled) return;
          const ci = parseInt(btn.dataset.ci, 10);
          const ok = ci === q.a;
          qel.querySelectorAll('.quiz-choice').forEach((b, bi) => {
            b.disabled = true;
            if (bi === q.a) b.classList.add('correct');
            else if (bi === ci && !ok) b.classList.add('wrong');
          });
          const ex = qel.querySelector('.quiz-explain');
          ex.classList.remove('hidden');
          ex.innerHTML = `<b>${ok ? '✔ 正解！' : '✕ 不正解'}</b> ${esc(q.exp)}`;
          UM.quizResult(termId, ok);
          if (!ok) toast('誤答を記録しました。復習ページで再確認できます');
          updateNavBadges();
        });
      });
    });
  }

  function wireAudio(t) {
    const playBtn = document.getElementById('audio-play');
    const stopBtn = document.getElementById('audio-stop');
    const bar = document.getElementById('audio-bar');
    if (!playBtn) return;
    if (!AudioGuide.state().supported) {
      document.getElementById('audio-box').innerHTML = '<span class="a-icon">🎧</span><div class="a-info"><div class="a-title">音声解説</div><div class="a-sub">お使いのブラウザは音声合成に対応していません。</div></div>';
      return;
    }
    let progressTimer = null;
    const approxSec = Math.max(60, AudioGuide.buildScript(t).length / 5.2); // ざっくり読了時間

    playBtn.addEventListener('click', () => {
      const st = AudioGuide.state();
      if (st.playing && st.currentId === t.id) {
        AudioGuide.pause();
        playBtn.textContent = '▶';
      } else {
        AudioGuide.play(t.id);
        playBtn.textContent = '⏸';
        UM.sectionOpened(t.id, ['basic']);
        let elapsed = 0;
        clearInterval(progressTimer);
        progressTimer = setInterval(() => {
          if (!AudioGuide.state().playing) return;
          elapsed += 1;
          if (bar) bar.style.width = Math.min(100, elapsed / approxSec * 100) + '%';
        }, 1000);
      }
    });
    stopBtn.addEventListener('click', () => {
      AudioGuide.stop();
      playBtn.textContent = '▶';
      if (bar) bar.style.width = '0%';
      clearInterval(progressTimer);
    });
    AudioGuide.onChange = (st) => {
      if (!st.playing && playBtn) playBtn.textContent = '▶';
    };
  }

  function compTableHtml(c) {
    return `<div class="card" id="${c.id}">
      <h2><span class="h-icon">⚖️</span>${esc(c.title)}</h2>
      <p class="muted" style="font-size:13px;margin:0 0 12px">${esc(c.intro)}</p>
      <div class="comp-table-wrap"><table class="comp">
        <thead><tr><th></th>${c.items.map(i => `<th>${esc(i)}</th>`).join('')}</tr></thead>
        <tbody>${c.rows.map(r => `<tr><th>${esc(r.label)}</th>${r.cells.map(cell => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>
      <div class="takeaway"><b>要するに:</b> ${esc(c.takeaway)}</div>
    </div>`;
  }

  function renderCompare(id) {
    const c = compById(id);
    if (!c) { $app.innerHTML = '<p>比較が見つかりません。</p>'; return; }
    $app.setAttribute('data-purpose', 'reference');
    let html = `<div class="crumb"><a href="#/library">用語</a><span class="sep">›</span>比較解説</div>`;
    if (c.diagram && c.diagram.length && window.Diagram) {
      html += `<div class="card diagram-block"><span class="eyebrow brand">図解でわかる</span>${Diagram.renderAll(c.diagram)}</div>`;
    }
    html += compTableHtml(c);
    html += `<div class="card"><h2>🔗 関連する用語ページ</h2><div class="chip-row">${(c.terms || []).map(t => termChip(t)).join('')}</div></div>`;
    $app.innerHTML = html;
  }

  /* ============================================================
     知識マップ
     ============================================================ */
  function renderMap() {
    const stats = UM.stats();
    const audit = linkIndex();
    let html = `<span class="eyebrow brand">KNOWLEDGE MAP</span>
    <h1 class="page-title">点を学ぶたび、面が見えてくる。</h1>
    <p class="page-lead">あなたが読んだテーマが灯り、関連(related・next・prereq・逆リンク)が線でつながります。ノードにカーソルを合わせると、そのテーマの“つながり”だけが浮かび上がります。</p>
    <div class="card" style="padding:14px 18px;margin-bottom:14px"><div class="review-stat">
      <div class="rv"><b>${stats.readCount}</b><span>既読テーマ</span></div>
      <div class="rv"><b>${stats.understoodCount}</b><span>理解確認済み</span></div>
      <div class="rv"><b>${stats.progress}%</b><span>マップ進捗</span></div>
      <div class="rv"><b>${stats.newsRead}</b><span>読んだニュース</span></div>
    </div></div>
    <div class="map-wrap">
      <div class="map-filter">
        <button class="filter-btn active" data-mapfilter="">すべての領域</button>
        ${(window.DOMAINS || []).map(d => `<button class="filter-btn" data-mapfilter="${d.id}">${d.icon} ${esc(d.name)}</button>`).join('')}
      </div>
      ${KMap.render({})}
    <div class="map-legend">
      <span class="lg"><span class="lg-dot" style="background:#2b6cb0"></span>既読(塗りつぶし)</span>
      <span class="lg"><span class="lg-dot" style="background:#fff;border:2px solid #2b6cb0"></span>未読(白抜き)</span>
      <span class="lg"><span class="lg-dot" style="background:#fff;border:1px solid #2b6cb0;box-shadow:0 0 0 2px #fff,0 0 0 3px #2b6cb066"></span>二重丸=理解確認済み</span>
      <span class="lg" style="color:var(--accent)">━ オレンジ線=既読同士のつながり</span>
      <span class="lg muted">整合性: 孤立テーマ ${audit.orphans.length} / リンク切れ ${audit.broken.length}</span>
    </div></div>`;
    $app.innerHTML = html;
    wireMapInteractions();
  }

  /* マップのホバーハイライト & 領域フィルタ */
  function wireMapInteractions() {
    const svg = document.getElementById('kmap');
    if (!svg) return;
    const edges = [...svg.querySelectorAll('.kmap-edge')];
    const nodes = [...svg.querySelectorAll('.kmap-node[data-id]')];
    const domainOf = {};
    (window.TERMS || []).forEach(t => domainOf[t.id] = t.domain);

    // 隣接の事前計算
    const neigh = {};
    edges.forEach(e => {
      const a = e.dataset.a, b = e.dataset.b;
      (neigh[a] = neigh[a] || new Set()).add(b);
      (neigh[b] = neigh[b] || new Set()).add(a);
    });

    nodes.forEach(node => {
      const id = node.dataset.id;
      node.addEventListener('mouseenter', () => {
        svg.classList.add('focusing');
        node.classList.add('hot');
        (neigh[id] || new Set()).forEach(nid => {
          const nn = svg.querySelector(`.kmap-node[data-id="${nid}"]`);
          if (nn) nn.classList.add('hot');
        });
        edges.forEach(e => { if (e.dataset.a === id || e.dataset.b === id) e.classList.add('hot'); });
      });
      node.addEventListener('mouseleave', () => {
        svg.classList.remove('focusing');
        svg.querySelectorAll('.hot').forEach(el => el.classList.remove('hot'));
      });
    });

    // 領域フィルタ
    $app.querySelectorAll('[data-mapfilter]').forEach(btn => {
      btn.addEventListener('click', () => {
        const dom = btn.dataset.mapfilter;
        $app.querySelectorAll('[data-mapfilter]').forEach(b => b.classList.toggle('active', b === btn));
        nodes.forEach(n => n.classList.toggle('is-hidden', !!dom && n.dataset.domain !== dom));
        // ハブ(領域ノード)も対象領域以外を薄く隠す
        svg.querySelectorAll('.kmap-hub').forEach(h => {
          const nav = (h.getAttribute('data-nav') || '');
          const hid = nav.split('=')[1] || '';
          h.classList.toggle('is-hidden', !!dom && hid !== dom);
        });
        edges.forEach(e => {
          const keep = !dom || domainOf[e.dataset.a] === dom || domainOf[e.dataset.b] === dom;
          e.classList.toggle('is-hidden', !keep);
        });
      });
    });
  }

  /* ============================================================
     学習ルート
     ============================================================ */
  function renderRoutes() {
    let html = `<h1 class="page-title">学習ルート</h1>
    <p class="page-lead">体系的に学びたい人のための推奨順路です。ルートはニュース動向と閲覧データに応じて再編されます(<a href="#/growth">成長ログ</a>)。</p><div class="grid-2">`;
    (window.ROUTES || []).forEach(r => {
      const done = r.terms.filter(t => UM.isRead(t)).length;
      const pct = Math.round(done / r.terms.length * 100);
      html += `<a class="tile" href="#/route/${r.id}">
        <span style="font-size:22px">${r.icon}</span>
        <h3>${esc(r.title)}</h3>
        <p>${esc(r.desc.slice(0, 70))}…</p>
        <div class="progress-bar"><span style="width:${pct}%"></span></div>
        <div class="tile-meta"><span class="chip small outline">${esc(r.audience)}</span><span class="muted small">${done}/${r.terms.length} 完了</span></div>
      </a>`;
    });
    html += `</div>`;
    $app.innerHTML = html;
  }

  function renderRoute(id) {
    const r = (window.ROUTES || []).find(x => x.id === id);
    if (!r) { $app.innerHTML = '<p>ルートが見つかりません。</p>'; return; }
    UM.startRoute(id);
    const nextUnread = r.terms.find(t => !UM.isRead(t));
    let html = `<div class="crumb"><a href="#/routes">学習ルート</a><span class="sep">›</span>${esc(r.title)}</div>
    <h1 class="page-title">${r.icon} ${esc(r.title)}</h1>
    <p class="page-lead">${esc(r.desc)} <span class="chip small outline">${esc(r.audience)}</span></p>`;
    if (nextUnread) {
      const nt = termById(nextUnread);
      html += `<div class="adapt-note"><span class="an-icon">▶️</span><span>次のステップ: <a href="#/term/${nextUnread}"><b>${nt ? esc(nt.name) : ''}</b></a> から続けましょう。</span></div>`;
    } else {
      html += `<div class="adapt-note"><span class="an-icon">🎉</span><span><b>このルートは完走済みです。</b><a href="#/review">復習ページ</a>で定着を確認しましょう。</span></div>`;
    }
    html += `<div class="card"><div class="route-steps">`;
    r.terms.forEach(tid => {
      const t = termById(tid);
      if (!t) return;
      html += `<div class="route-step ${UM.isRead(tid) ? 'done' : ''}"><div class="rs-body">
        <a href="#/term/${tid}">${esc(t.name)}</a>
        <p>${esc(t.oneLiner.slice(0, 80))}…</p>
      </div></div>`;
    });
    html += `</div></div>`;
    $app.innerHTML = html;
  }

  /* ============================================================
     復習
     ============================================================ */
  let reviewSession = null;

  function renderReview() {
    const stats = UM.stats();
    const queue = UM.reviewQueue();

    let html = `<h1 class="page-title">復習</h1>
    <p class="page-lead">あなたの学習履歴(読んだテーマ・経過日数・誤答)から、いま復習効果が高いものを自動で選んでいます。</p>
    <div class="card"><div class="review-stat">
      <div class="rv"><b>${stats.readCount}</b><span>既読テーマ</span></div>
      <div class="rv"><b>${stats.quizOk}</b><span>クイズ正解</span></div>
      <div class="rv"><b>${stats.quizNg}</b><span>誤答(復習対象)</span></div>
      <div class="rv"><b>${queue.length}</b><span>復習待ち</span></div>
    </div></div>`;

    if (!stats.readCount) {
      html += `<div class="card"><p style="margin:0">まだ既読のテーマがありません。まずは<a href="#/news">ニュース</a>や<a href="#/routes">学習ルート</a>から1テーマ読んでみましょう。読んだ内容がここに復習として現れます。</p></div>`;
      $app.innerHTML = html;
      return;
    }

    // 復習セッション(読了テーマのクイズから出題、誤答・古いものを優先)
    html += `<div class="card"><div class="card-head"><h2><span class="h-icon">⚡</span>クイック復習セッション</h2>
      <button class="btn line small" id="review-start">出題する</button></div>
      <div id="review-area"><p class="muted small" style="margin:0">既読テーマから優先度順に最大5問を出題します。誤答した問題は次回も優先されます。</p></div></div>`;

    // 復習待ちリスト
    if (queue.length) {
      html += `<div class="card"><h2><span class="h-icon">🗂</span>復習待ちのテーマ</h2><div class="rel-list">`;
      queue.slice(0, 8).forEach(q => {
        const t = termById(q.id);
        if (!t) return;
        const rec = UM.raw().terms[q.id] || {};
        const reason = rec.quizNg > rec.quizOk ? '誤答あり' : (rec.quizOk === 0 ? 'クイズ未挑戦' : `${q.days}日前に閲覧`);
        html += `<a class="rel-item" href="#/term/${q.id}"><span class="r-name">${esc(shortName(t.name))}</span><span class="r-why">${reason} — 一言: ${esc(t.oneLiner.slice(0, 44))}…</span></a>`;
      });
      html += `</div></div>`;
    }

    // 誤解チェック(既読テーマの誤解を一覧)
    const readTerms = (window.TERMS || []).filter(t => UM.isRead(t.id) && t.misconceptions && t.misconceptions.length);
    if (readTerms.length) {
      html += `<div class="card"><h2><span class="h-icon">🚧</span>誤解していないかチェック</h2><p class="muted small" style="margin:0 0 10px">既読テーマの「よくある誤解」です。◯×を思い浮かべてから開いてください。</p>`;
      readTerms.slice(0, 6).forEach(t => {
        const m = t.misconceptions[0];
        html += `<details class="t-section"><summary>「${esc(m.x)}」— ◯か✕か？<span class="s-arrow">▶</span></summary>
        <div class="s-body"><div class="miscon"><div class="m-o"><b>✕ 誤解です。</b> ${esc(m.o)}</div></div><p class="small"><a href="#/term/${t.id}">→ ${esc(shortName(t.name))} を読み直す</a></p></div></details>`;
      });
      html += `</div>`;
    }
    $app.innerHTML = html;

    const startBtn = document.getElementById('review-start');
    if (startBtn) startBtn.addEventListener('click', startReviewSession);
  }

  function startReviewSession() {
    // 出題プール: 既読テーマのクイズ。誤答>正解のテーマを先頭に
    const pool = [];
    const queue = UM.reviewQueue();
    const ordered = [...queue.map(q => q.id), ...(window.TERMS || []).filter(t => UM.isRead(t.id)).map(t => t.id)];
    const seen = new Set();
    ordered.forEach(tid => {
      if (seen.has(tid)) return;
      seen.add(tid);
      const t = termById(tid);
      if (t && t.quiz) t.quiz.forEach(q => pool.push({ termId: tid, termName: t.name, q }));
    });
    reviewSession = { pool: pool.slice(0, 5), idx: 0, ok: 0 };
    renderReviewQuestion();
  }

  function renderReviewQuestion() {
    const area = document.getElementById('review-area');
    if (!area || !reviewSession) return;
    const s = reviewSession;
    if (s.idx >= s.pool.length) {
      area.innerHTML = `<div class="flash-card"><div class="f-q">セッション完了！ ${s.ok}/${s.pool.length} 正解</div>
      <p class="muted small">${s.ok === s.pool.length ? '完璧です。新しいテーマに進みましょう。' : '誤答したテーマは「復習待ち」に優先表示されます。'}</p>
      <div><button class="btn line small" id="review-again">もう一度</button></div></div>`;
      document.getElementById('review-again').addEventListener('click', startReviewSession);
      return;
    }
    const item = s.pool[s.idx];
    area.innerHTML = `<p class="muted small" style="margin:0 0 8px">${s.idx + 1} / ${s.pool.length} 問 — 出典テーマ: ${esc(shortName(item.termName))}</p>
    <div class="quiz-q"><div class="q-text">${esc(item.q.q)}</div>
      <div class="quiz-choices">${item.q.c.map((c, ci) => `<button class="quiz-choice" data-ci="${ci}">${esc(c)}</button>`).join('')}</div>
      <div class="quiz-explain hidden"></div>
      <div style="margin-top:10px" class="hidden" id="review-next-wrap"><button class="btn primary small" id="review-next">次へ →</button></div>
    </div>`;
    area.querySelectorAll('.quiz-choice').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        const ci = parseInt(btn.dataset.ci, 10);
        const ok = ci === item.q.a;
        if (ok) s.ok += 1;
        area.querySelectorAll('.quiz-choice').forEach((b, bi) => {
          b.disabled = true;
          if (bi === item.q.a) b.classList.add('correct');
          else if (bi === ci && !ok) b.classList.add('wrong');
        });
        const ex = area.querySelector('.quiz-explain');
        ex.classList.remove('hidden');
        ex.innerHTML = `<b>${ok ? '✔ 正解！' : '✕ 不正解'}</b> ${esc(item.q.exp)} <a href="#/term/${item.termId}">→ テーマを読み直す</a>`;
        UM.quizResult(item.termId, ok);
        document.getElementById('review-next-wrap').classList.remove('hidden');
        document.getElementById('review-next').addEventListener('click', () => { s.idx += 1; renderReviewQuestion(); });
        updateNavBadges();
      });
    });
  }

  /* ============================================================
     成長ログ
     ============================================================ */
  function renderGrowth() {
    let html = `<h1 class="page-title">サイトの成長ログ</h1>
    <p class="page-lead">TECHRAは静的な教材ではなく、ニュース・制度変更・閲覧傾向を取り込んで知識体系そのものを更新し続けます。その過程をすべて公開しています。</p>`;

    // 新規テーマ候補
    html += `<div class="card"><h2><span class="h-icon">📡</span>自動検知された新規テーマ候補</h2>
    <p class="muted small" style="margin:0 0 12px">直近90日のニュース出現頻度と、収録済みページからの関連クリックをもとにスコア化しています。</p>`;
    (window.CANDIDATES || []).forEach(c => {
      html += `<div class="cand-bar"><span class="cb-name">${esc(c.name)}</span>
        <div class="cb-track"><span style="width:${c.mentions}%"></span></div>
        <span class="cb-num">スコア${c.mentions}</span></div>
      <p class="muted small" style="margin:0 0 14px 0">${esc(c.note)}</p>`;
    });
    html += `</div>`;

    // 更新履歴
    const TYPE_LABEL = { new: '新規', update: '更新', reorg: '再編', news: 'ニュース反映' };
    html += `<div class="card"><h2><span class="h-icon">🌱</span>知識体系の更新履歴</h2><div class="timeline">`;
    (window.GROWTH_LOG || []).forEach(g => {
      html += `<div class="tl-item"><span class="tl-dot ${g.type}"></span><div class="tl-body">
        <span class="tl-date">${esc(g.date)} <span class="chip small outline">${TYPE_LABEL[g.type] || g.type}</span></span>
        <p style="margin:4px 0 6px">${esc(g.text)}</p>
        ${(g.terms || []).length ? `<div class="chip-row">${g.terms.map(t => termChip(t)).join('')}</div>` : ''}
      </div></div>`;
    });
    html += `</div></div>`;

    // 情報鮮度ダッシュボード
    const stale = (window.TERMS || []).map(t => ({ t, days: daysSince(t.updated) })).sort((a, b) => b.days - a.days);
    html += `<div class="card"><h2><span class="h-icon">🕰</span>情報鮮度ダッシュボード</h2>
    <p class="muted small" style="margin:0 0 10px">更新から${window.FRESHNESS?.noteDays || 180}日を超えたページは優先的に見直されます。</p><div class="rel-list">`;
    stale.slice(0, 5).forEach(x => {
      const old = x.days > (window.FRESHNESS?.noteDays || 180);
      html += `<a class="rel-item" href="#/term/${x.t.id}"><span class="r-name">${old ? '🟠' : '🟢'} ${esc(shortName(x.t.name))}</span><span class="r-why">最終更新 ${fmtDate(x.t.updated)}（${x.days}日前）${old ? ' — 見直し対象' : ''}</span></a>`;
    });
    html += `</div></div>`;

    // リンク整合性(回遊の健全性)
    const audit = linkIndex();
    html += `<div class="card"><h2><span class="h-icon">🔗</span>リンク整合性チェック</h2>
    <p class="muted small" style="margin:0 0 8px">手作業リンクの張り忘れ・切れを自動検査。逆リンクは各ページで自動補完されます。</p>
    <div class="review-stat">
      <div class="rv"><b>${(window.TERMS || []).length}</b><span>収録テーマ</span></div>
      <div class="rv"><b style="color:${audit.orphans.length ? 'var(--warn)' : 'var(--ok)'}">${audit.orphans.length}</b><span>孤立テーマ</span></div>
      <div class="rv"><b style="color:${audit.broken.length ? 'var(--danger)' : 'var(--ok)'}">${audit.broken.length}</b><span>リンク切れ</span></div>
    </div>
    ${audit.orphans.length ? `<p class="small" style="margin:10px 0 0">孤立(関連リンクなし): ${audit.orphans.map(id => termChip(id)).join(' ')}</p>` : '<p class="small muted" style="margin:10px 0 0">✅ すべてのテーマが関連でつながっています。</p>'}
    </div>`;

    // コンテンツ配信チャネル
    const meta = window.CONTENT_META || {};
    const channelLabel = meta.channel === 'online'
      ? '<span class="chip ok small">オンライン更新 有効</span> ホスティング先の更新を自動チェックしています'
      : meta.channel === 'offline'
        ? '<span class="chip warn small">オフライン</span> 同梱データ＋最後に同期した内容で動作中。オンライン時に自動で最新化されます'
        : '<span class="chip small">確認中</span>';
    html += `<div class="card"><h2><span class="h-icon">📡</span>コンテンツ配信ステータス</h2>
    <p style="font-size:13.5px;margin:0 0 6px">コンテンツバージョン: <strong>v${meta.version || 1}</strong>（基準ビルド ${esc(meta.built || '')}${meta.syncedAt ? ` / 最終同期 ${esc(meta.syncedAt)}` : ''}）</p>
    <p style="font-size:13px;margin:0">${channelLabel}</p>
    <p class="muted small" style="margin:8px 0 0">新しいニュース・用語・成長ログは content/update.json として配信され、サイト本体の再配布なしに全訪問者へ反映されます（自動更新パイプラインは DEPLOY.md 参照）。</p></div>`;

    // 学習データ管理
    const stats = UM.stats();
    html += `<div class="card"><h2><span class="h-icon">🔒</span>あなたの学習データ</h2>
    <p style="font-size:13.5px;margin:0 0 10px">行動データ(閲覧・滞在・クイズ結果)はこのブラウザの localStorage にのみ保存され、外部送信は一切ありません。現在: 訪問${stats.visits}回 / 既読${stats.readCount}テーマ / クイズ${stats.quizOk + stats.quizNg}問回答。</p>
    <div class="chip-row">
      <button class="btn line small" id="export-data">📤 学習データをエクスポート</button>
      <button class="btn line small" id="import-data">📥 インポート</button>
      <button class="btn line small" id="reset-data">学習データをリセット</button>
    </div>
    <input type="file" id="import-file" accept="application/json" class="hidden">
    <p class="muted small" style="margin:10px 0 0">エクスポートしたファイルを別の端末・ブラウザでインポートすると、学習の続き(既読・関心推定・復習キュー)を引き継げます。</p></div>`;

    $app.innerHTML = html;
    document.getElementById('reset-data').addEventListener('click', () => {
      if (confirm('学習履歴・推定された関心・クイズ結果をすべて削除します。よろしいですか？')) {
        UM.reset();
        toast('学習データをリセットしました');
        renderGrowth();
        updateLensChip();
        updateNavBadges();
      }
    });
    document.getElementById('export-data').addEventListener('click', () => {
      const blob = new Blob([UM.exportData()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'techra-learning-data.json';
      a.click();
      URL.revokeObjectURL(a.href);
      toast('学習データをダウンロードしました');
    });
    const importInput = document.getElementById('import-file');
    document.getElementById('import-data').addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', () => {
      const f = importInput.files && importInput.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const ok = UM.importData(JSON.parse(reader.result));
          if (ok) {
            toast('学習データをインポートしました。学習の続きから再開できます');
            renderGrowth(); updateLensChip(); updateNavBadges();
          } else {
            toast('インポート失敗: TECHRAの学習データファイルではありません');
          }
        } catch (e) {
          toast('インポート失敗: ファイルを読み取れませんでした');
        }
        importInput.value = '';
      };
      reader.readAsText(f);
    });
  }

  /* ============================================================
     検索
     ============================================================ */
  function searchAll(q) {
    q = q.toLowerCase().trim();
    if (!q) return { terms: [], news: [], comps: [] };
    const hit = s => (s || '').toLowerCase().includes(q);
    return {
      terms: (window.TERMS || []).filter(t => hit(t.name) || hit(t.en) || (t.tags || []).some(hit) || hit(t.oneLiner)),
      news: (window.NEWS || []).filter(n => hit(n.title) || hit(n.summary)),
      comps: (window.COMPARISONS || []).filter(c => hit(c.title) || hit(c.intro))
    };
  }

  function renderSearch(q) {
    const r = searchAll(q);
    let html = `<h1 class="page-title">「${esc(q)}」の検索結果</h1>
    <p class="page-lead">用語 ${r.terms.length}件 / ニュース ${r.news.length}件 / 比較 ${r.comps.length}件</p>`;
    if (r.terms.length) {
      html += `<h2 style="font-size:16px">📖 用語</h2><div class="grid-3" style="margin-bottom:20px">`;
      r.terms.forEach(t => {
        html += `<a class="tile ${UM.isRead(t.id) ? 'read' : ''}" href="#/term/${t.id}"><h3>${esc(t.name)}</h3><p>${esc(t.oneLiner.slice(0, 60))}…</p></a>`;
      });
      html += `</div>`;
    }
    if (r.comps.length) {
      html += `<h2 style="font-size:16px">⚖️ 比較</h2><div class="grid-3" style="margin-bottom:20px">`;
      r.comps.forEach(c => { html += `<a class="tile" href="#/compare/${c.id}"><h3>${esc(c.title)}</h3><p>${esc(c.intro.slice(0, 60))}…</p></a>`; });
      html += `</div>`;
    }
    if (r.news.length) {
      html += `<h2 style="font-size:16px">📰 ニュース</h2>`;
      r.news.forEach(n => { html += newsItemHtml(n, false); });
    }
    if (!r.terms.length && !r.news.length && !r.comps.length) {
      const cands = (window.CANDIDATES || []).filter(c => c.name.toLowerCase().includes(q));
      html += `<div class="card"><p style="margin:0">該当するページが見つかりませんでした。${cands.length ? `<br><br>📡 ただし「<strong>${esc(cands[0].name)}</strong>」は新規テーマ候補として検知済みです(<a href="#/growth">成長ログ</a>)。ニュース出現頻度が基準を超えると自動的にページ化されます。` : 'この検索語は今後のテーマ候補検知の参考データとして活用されます。'}</p></div>`;
    }
    $app.innerHTML = html;
  }

  /* ============================================================
     ルーター
     ============================================================ */
  function route() {
    UM.endDwell();
    AudioGuide.stop();
    $app.removeAttribute('data-purpose'); // 目的別モードは各ページで再設定
    const hash = location.hash || '#/';
    const [path, query] = hash.slice(2).split('?');
    const parts = path.split('/').filter(Boolean);
    const params = {};
    (query || '').split('&').forEach(kv => {
      const [k, v] = kv.split('=');
      if (k) params[k] = decodeURIComponent(v || '');
    });

    let nav = 'home';
    if (parts[0] === 'news' && parts[1]) { renderNewsDetail(parts[1]); nav = 'news'; }
    else if (parts[0] === 'news') { renderNewsList(params.d); nav = 'news'; }
    else if (parts[0] === 'term' && parts[1]) { renderTerm(parts[1]); nav = 'library'; }
    else if (parts[0] === 'library') { renderLibrary(params.d); nav = 'library'; }
    else if (parts[0] === 'compare' && parts[1]) { renderCompare(parts[1]); nav = 'library'; }
    else if (parts[0] === 'map') { renderMap(); nav = 'map'; }
    else if (parts[0] === 'routes') { renderRoutes(); nav = 'routes'; }
    else if (parts[0] === 'route' && parts[1]) { renderRoute(parts[1]); nav = 'routes'; }
    else if (parts[0] === 'review') { renderReview(); nav = 'review'; }
    else if (parts[0] === 'growth') { renderGrowth(); nav = 'growth'; }
    else if (parts[0] === 'search') { renderSearch(params.q || ''); nav = 'library'; }
    else { renderHome(); nav = 'home'; }

    document.querySelectorAll('#global-nav a').forEach(a => {
      a.classList.toggle('active', a.dataset.nav === nav);
    });
    document.getElementById('global-nav').classList.remove('open');
    window.scrollTo(0, 0);
    updateLensChip();
    updateNavBadges();
  }

  /* ---------- ヘッダUI ---------- */
  function updateLensChip() {
    const label = document.getElementById('lens-label');
    const lens = UM.lens();
    label.textContent = UM.lensIsAuto() ? `${LENS_LABEL[lens]}・自動` : LENS_LABEL[lens];
  }

  function updateNavBadges() {
    const reviewLink = document.querySelector('#global-nav a[data-nav="review"]');
    if (!reviewLink) return;
    const n = UM.reviewQueue().length;
    reviewLink.innerHTML = n > 0 ? `復習<span class="nav-badge">${n}</span>` : '復習';
  }

  function buildLensMenu() {
    const menu = document.getElementById('lens-menu');
    const wrap = menu.querySelector('.lens-options');
    const cur = UM.raw().lensManual;
    wrap.innerHTML = (window.LENSES || []).map(l =>
      `<button class="lens-opt ${cur === l.id ? 'active' : ''}" data-lens="${l.id}" title="${esc(l.desc)}">${esc(l.label)}</button>`).join('');
    wrap.querySelectorAll('.lens-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        UM.setLens(btn.dataset.lens);
        buildLensMenu();
        updateLensChip();
        menu.classList.add('hidden');
        toast(btn.dataset.lens === 'auto' ? 'レンズを自動推定に戻しました' : `レンズを「${btn.textContent}」に変更しました。説明の順序が変わります`);
        route();
      });
    });
  }

  function wireHeader() {
    // レンズメニュー
    const chip = document.getElementById('lens-chip');
    const menu = document.getElementById('lens-menu');
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      buildLensMenu();
      menu.classList.toggle('hidden');
    });
    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target)) menu.classList.add('hidden');
    });

    // モバイルナビ
    document.getElementById('nav-toggle').addEventListener('click', () => {
      document.getElementById('global-nav').classList.toggle('open');
    });

    // 検索
    const input = document.getElementById('global-search');
    const suggest = document.getElementById('search-suggest');
    input.addEventListener('input', () => {
      const q = input.value.trim();
      if (!q) { suggest.classList.add('hidden'); return; }
      const r = searchAll(q);
      const items = [
        ...r.terms.slice(0, 5).map(t => ({ type: '用語', href: `#/term/${t.id}`, label: t.name })),
        ...r.comps.slice(0, 2).map(c => ({ type: '比較', href: `#/compare/${c.id}`, label: c.title })),
        ...r.news.slice(0, 3).map(n => ({ type: 'NEWS', href: `#/news/${n.id}`, label: n.title }))
      ];
      suggest.innerHTML = items.length
        ? items.map(i => `<a class="sg-item" href="${i.href}"><span class="sg-type">${i.type}</span>${esc(i.label)}</a>`).join('')
        : `<div class="sg-empty">該当なし — Enterで全文検索(新テーマ候補の検知にも使われます)</div>`;
      suggest.classList.remove('hidden');
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        location.hash = `#/search?q=${encodeURIComponent(input.value.trim())}`;
        suggest.classList.add('hidden');
        input.blur();
      }
    });
    document.addEventListener('click', (e) => {
      if (!suggest.contains(e.target) && e.target !== input) suggest.classList.add('hidden');
    });
    suggest.addEventListener('click', () => suggest.classList.add('hidden'));
  }

  /* ---------- 用語リンクのツールチップ & data-nav委譲 ---------- */
  function wireGlobalDelegation() {
    const tip = document.getElementById('term-tooltip');

    document.addEventListener('mouseover', (e) => {
      const link = e.target.closest('.t-link');
      if (!link) return;
      const t = termById(link.dataset.term);
      if (!t) return;
      tip.innerHTML = `<b>${esc(t.name)}</b>${esc(t.oneLiner.slice(0, 80))}…<span class="tt-hint">クリックで詳しく ${UM.isRead(t.id) ? '(既読)' : '(未読 — 約3分)'}</span>`;
      tip.classList.remove('hidden');
      const r = link.getBoundingClientRect();
      const tw = 320;
      let x = Math.min(r.left, window.innerWidth - tw - 16);
      let y = r.bottom + 8;
      if (y + 120 > window.innerHeight) y = r.top - 8 - 110;
      tip.style.left = x + 'px';
      tip.style.top = y + 'px';
    });
    document.addEventListener('mouseout', (e) => {
      if (e.target.closest && e.target.closest('.t-link')) tip.classList.add('hidden');
    });

    // SVGノード等のdata-nav
    document.addEventListener('click', (e) => {
      const nav = e.target.closest('[data-nav]');
      if (nav && nav.dataset.nav) {
        location.hash = nav.dataset.nav;
      }
    });
  }

  /* ---------- 起動 ---------- */
  function init() {
    UM.startSession();
    wireHeader();
    wireGlobalDelegation();
    window.addEventListener('hashchange', route);
    window.addEventListener('beforeunload', () => { UM.endDwell(); UM.save(); });
    // 配信コンテンツの更新を受信したら再描画して通知
    window.addEventListener('techra:content-updated', (e) => {
      route();
      if (e.detail && e.detail.message) toast(e.detail.message);
    });
    route();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
