/* ============================================================
   TECHRA 知識マップ描画 (SVG)
   領域ごとのクラスタを円環状に配置し、用語ノードを領域の周囲に置く。
   既読ノードは塗りつぶし、関連リンクは既読同士なら強調表示。
   学習が進むほど「自分の地図」が灯っていく可視化。
   ============================================================ */

window.KMap = (function () {

  /* レイアウト計算: 領域ハブを円環配置、用語をハブ周囲に放射配置 */
  function layout(width, height) {
    const domains = window.DOMAINS || [];
    const terms = window.TERMS || [];
    const cx = width / 2, cy = height / 2;
    const R = Math.min(width, height) * 0.30;
    const pos = { hubs: {}, terms: {} };

    domains.forEach((d, i) => {
      const ang = (i / domains.length) * Math.PI * 2 - Math.PI / 2;
      pos.hubs[d.id] = { x: cx + R * Math.cos(ang), y: cy + R * Math.sin(ang), ang };
    });

    domains.forEach(d => {
      const dTerms = terms.filter(t => t.domain === d.id);
      const hub = pos.hubs[d.id];
      const n = dTerms.length;
      const spread = Math.min(Math.PI * 0.8, 0.5 * Math.max(n, 2));
      dTerms.forEach((t, i) => {
        // ハブの外側(中心と反対方向)に扇状に配置
        const base = hub.ang;
        const off = n === 1 ? 0 : (i / (n - 1) - 0.5) * spread;
        const r = 78 + (i % 2) * 38;
        pos.terms[t.id] = {
          x: hub.x + r * Math.cos(base + off),
          y: hub.y + r * Math.sin(base + off)
        };
      });
    });
    return pos;
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* 用語名の短縮表示 */
  function shortName(name) {
    let n = name.replace(/（[^）]*）/g, '');
    if (n.length > 11) n = n.slice(0, 10) + '…';
    return n;
  }

  function render(opts) {
    opts = opts || {};
    const width = opts.width || 1100;
    const height = opts.height || 760;
    const highlightId = opts.highlight || null;
    const pos = layout(width, height);
    const domains = window.DOMAINS || [];
    const terms = window.TERMS || [];
    const domainColor = {};
    domains.forEach(d => domainColor[d.id] = d.color);

    let edges = '';
    const seen = new Set();
    function addEdge(aId, bId) {
      if (aId === bId) return;
      const key = [aId, bId].sort().join('|');
      if (seen.has(key)) return;
      seen.add(key);
      const a = pos.terms[aId], b = pos.terms[bId];
      if (!a || !b) return;
      const lit = UM.isRead(aId) && UM.isRead(bId);
      edges += `<line class="kmap-edge${lit ? ' lit' : ''}" data-a="${aId}" data-b="${bId}" x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}"/>`;
    }
    // related・next・prereq をすべて辺として描く(逆リンクも線でつながる)
    terms.forEach(t => {
      (t.related || []).forEach(r => addEdge(t.id, r.id));
      (t.next || []).forEach(id => addEdge(t.id, id));
      (t.prereq || []).forEach(id => addEdge(t.id, id));
    });

    let hubs = '';
    domains.forEach(d => {
      const h = pos.hubs[d.id];
      const lvl = UM.domainLevel(d.id);
      hubs += `<g class="kmap-node kmap-hub" data-nav="#/library?d=${d.id}">
        <circle cx="${h.x.toFixed(1)}" cy="${h.y.toFixed(1)}" r="20" fill="${d.color}" opacity="${lvl > 0 ? 0.92 : 0.45}" stroke="#fff" stroke-width="2.5"/>
        <text x="${h.x.toFixed(1)}" y="${(h.y + 4).toFixed(1)}" text-anchor="middle" fill="#fff" style="font-size:13px;font-weight:800">${esc(d.icon)}</text>
        <text x="${h.x.toFixed(1)}" y="${(h.y + 38).toFixed(1)}" text-anchor="middle">${esc(d.name)}</text>
      </g>`;
    });

    let nodes = '';
    terms.forEach(t => {
      const p = pos.terms[t.id];
      if (!p) return;
      const read = UM.isRead(t.id);
      const understood = UM.isUnderstood(t.id);
      const c = domainColor[t.domain] || '#888';
      const isHl = highlightId === t.id;
      const r = isHl ? 11 : 7.5;
      nodes += `<g class="kmap-node" data-nav="#/term/${t.id}" data-id="${t.id}" data-domain="${t.domain}">
        <circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r}"
          fill="${read ? c : '#ffffff'}" stroke="${c}" stroke-width="${isHl ? 3 : 2}" opacity="${read ? 1 : 0.85}"/>
        ${understood ? `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r + 4}" fill="none" stroke="${c}" stroke-width="1" opacity=".5"/>` : ''}
        <text x="${p.x.toFixed(1)}" y="${(p.y - r - 5).toFixed(1)}" text-anchor="middle">${esc(shortName(t.name))}</text>
      </g>`;
    });

    return `<svg id="kmap" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="知識マップ">
      <rect width="${width}" height="${height}" fill="transparent"/>
      ${edges}${hubs}${nodes}
    </svg>`;
  }

  /* 用語ページ用ミニマップ: その用語と関連語のみ */
  function renderMini(termId, width, height) {
    width = width || 280; height = height || 180;
    const terms = window.TERMS || [];
    const t = terms.find(x => x.id === termId);
    if (!t) return '';
    const rel = (t.related || []).map(r => terms.find(x => x.id === r.id)).filter(Boolean);
    const cx = width / 2, cy = height / 2;
    const domains = window.DOMAINS || [];
    const dc = {};
    domains.forEach(d => dc[d.id] = d.color);

    let out = '';
    rel.forEach((r, i) => {
      const ang = (i / rel.length) * Math.PI * 2 - Math.PI / 2;
      const x = cx + 70 * Math.cos(ang), y = cy + 55 * Math.sin(ang);
      const read = UM.isRead(r.id);
      out += `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="#cdd6e2" stroke-width="1"/>`;
      out += `<g class="kmap-node" data-nav="#/term/${r.id}">
        <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="6" fill="${read ? (dc[r.domain] || '#888') : '#fff'}" stroke="${dc[r.domain] || '#888'}" stroke-width="1.6"/>
        <text x="${x.toFixed(1)}" y="${(y - 10).toFixed(1)}" text-anchor="middle" style="font-size:9px;fill:#46505f;font-weight:600">${esc(shortName(r.name))}</text>
      </g>`;
    });
    out += `<circle cx="${cx}" cy="${cy}" r="9" fill="${dc[t.domain] || '#888'}" stroke="#fff" stroke-width="2"/>
      <text x="${cx}" y="${cy + 22}" text-anchor="middle" style="font-size:10px;font-weight:800;fill:#1c2330">${esc(shortName(t.name))}</text>`;
    return `<svg class="minimap" viewBox="0 0 ${width} ${height}" width="100%" xmlns="http://www.w3.org/2000/svg">${out}</svg>`;
  }

  return { render, renderMini };
})();
