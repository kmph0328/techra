/* ============================================================
   TECHRA 図解エンジン
   データ駆動の軽量インラインSVG。外部依存なし・オフライン可。
   KMapと同系統の見た目で「絵でわかる」を補う。

   図種(spec.type):
   - flow     : 横方向の工程フロー(steps:[{t,d?}])。矢印で連結
   - stack    : 下から積層(layers:[{t,d?,c?}])。HBM・ZEB・電池等
   - cycle    : 円環サイクル(steps:[{t,d?}])。ヒートポンプ・水素等
   - spectrum : 段階/グラデーション帯(items:[{t,d?,c?}])。水素3色・Scope等
   - compare  : 2〜3列の対比カラム(cols:[{t, points:[...]}])

   共通: { title?, caption?, accent? }
   ============================================================ */
window.Diagram = (function () {

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* 長文を指定文字数で折り返し、tspan配列を返す */
  function wrapTspans(text, x, y, perLine, lineH) {
    const s = String(text || '');
    const lines = [];
    for (let i = 0; i < s.length; i += perLine) lines.push(s.slice(i, i + perLine));
    return lines.map((ln, i) =>
      `<tspan x="${x}" y="${y + i * lineH}">${esc(ln)}</tspan>`).join('');
  }

  const PALETTE = ['#0f4c81', '#1c8a5a', '#e8702a', '#7b5cd6', '#b7791f', '#17a2b8', '#c0392b'];

  /* ---------- flow ---------- */
  function flow(spec) {
    const steps = spec.steps || [];
    const n = steps.length;
    const W = 1000, boxW = 150, gap = (W - boxW * n) / Math.max(1, n - 1);
    const H = 150;
    let out = '';
    steps.forEach((s, i) => {
      const x = i * (boxW + gap);
      const c = spec.accent || PALETTE[i % PALETTE.length];
      out += `<g>
        <rect x="${x.toFixed(0)}" y="34" width="${boxW}" height="74" rx="10" fill="#fff" stroke="${c}" stroke-width="2"/>
        <circle cx="${(x + 18).toFixed(0)}" cy="54" r="11" fill="${c}"/>
        <text x="${(x + 18).toFixed(0)}" y="58" text-anchor="middle" fill="#fff" font-size="11" font-weight="700">${i + 1}</text>
        <text x="${(x + boxW / 2).toFixed(0)}" y="62" text-anchor="middle" font-size="13" font-weight="700" fill="#1c2330">${wrapTspans(s.t, x + boxW / 2, 62, 8, 16)}</text>
        ${s.d ? `<text x="${(x + boxW / 2).toFixed(0)}" y="${s.t.length > 8 ? 96 : 88}" text-anchor="middle" font-size="10.5" fill="#7b8494">${wrapTspans(s.d, x + boxW / 2, s.t.length > 8 ? 96 : 88, 11, 13)}</text>` : ''}
      </g>`;
      if (i < n - 1) {
        const ax = x + boxW, axe = x + boxW + gap;
        out += `<g stroke="#b8c2d0" stroke-width="2" fill="none">
          <line x1="${ax + 4}" y1="71" x2="${axe - 8}" y2="71"/>
          <path d="M${axe - 12},66 L${axe - 4},71 L${axe - 12},76" fill="#b8c2d0" stroke="none"/>
        </g>`;
      }
    });
    return svg(W, H, out, spec);
  }

  /* ---------- stack ---------- */
  function stack(spec) {
    const layers = spec.layers || [];
    const n = layers.length;
    const W = 620, layerH = 46, gap = 8, padTop = 36;
    const H = padTop + n * (layerH + gap) + 16;
    let out = '';
    // 下から積む(配列の末尾が下)
    layers.forEach((l, idx) => {
      const i = n - 1 - idx; // 描画位置(上から)
      const y = padTop + i * (layerH + gap);
      const c = l.c || spec.accent || PALETTE[idx % PALETTE.length];
      out += `<g>
        <rect x="120" y="${y}" width="380" height="${layerH}" rx="8" fill="${c}" opacity="0.14" stroke="${c}" stroke-width="1.5"/>
        <text x="140" y="${y + 28}" font-size="13.5" font-weight="700" fill="#1c2330">${esc(l.t)}</text>
        ${l.d ? `<text x="495" y="${y + 28}" text-anchor="end" font-size="11" fill="#46505f">${esc(l.d)}</text>` : ''}
      </g>`;
    });
    return svg(W, H, out, spec);
  }

  /* ---------- cycle ---------- */
  function cycle(spec) {
    const steps = spec.steps || [];
    const n = steps.length;
    const W = 560, H = 360, cx = W / 2, cy = 188, R = 118;
    let out = '';
    // 中央ラベル
    if (spec.center) {
      out += `<circle cx="${cx}" cy="${cy}" r="46" fill="${spec.accent || '#0f4c81'}" opacity="0.08"/>
        <text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="13" font-weight="800" fill="${spec.accent || '#0f4c81'}">${wrapTspans(spec.center, cx, cy + 4, 7, 16)}</text>`;
    }
    const pts = steps.map((s, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      return { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), a };
    });
    // 矢印(円弧近似: ノード間を直線+先端)
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % n];
      const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
      out += `<path d="M${p.x.toFixed(0)},${p.y.toFixed(0)} Q${cx},${cy} ${q.x.toFixed(0)},${q.y.toFixed(0)}" fill="none" stroke="#cfd8e3" stroke-width="2" opacity="0.7"/>`;
    });
    pts.forEach((p, i) => {
      const c = spec.accent || PALETTE[i % PALETTE.length];
      const s = steps[i];
      out += `<g>
        <circle cx="${p.x.toFixed(0)}" cy="${p.y.toFixed(0)}" r="30" fill="#fff" stroke="${c}" stroke-width="2.5"/>
        <text x="${p.x.toFixed(0)}" y="${(p.y - 2).toFixed(0)}" text-anchor="middle" font-size="11.5" font-weight="700" fill="#1c2330">${wrapTspans(s.t, p.x, p.y - 2, 6, 13)}</text>
      </g>`;
      if (s.d) {
        const lx = p.x + (p.x < cx ? -36 : 36);
        out += `<text x="${lx.toFixed(0)}" y="${(p.y + 44).toFixed(0)}" text-anchor="middle" font-size="10" fill="#7b8494">${wrapTspans(s.d, lx, p.y + 44, 12, 12)}</text>`;
      }
    });
    return svg(W, H, out, spec);
  }

  /* ---------- spectrum ---------- */
  function spectrum(spec) {
    const items = spec.items || [];
    const n = items.length;
    const W = 900, segW = W / n, H = 150;
    let out = '';
    items.forEach((it, i) => {
      const x = i * segW;
      const c = it.c || PALETTE[i % PALETTE.length];
      out += `<g>
        <rect x="${x.toFixed(0)}" y="36" width="${(segW - 6).toFixed(0)}" height="56" rx="8" fill="${c}"/>
        <text x="${(x + segW / 2).toFixed(0)}" y="70" text-anchor="middle" font-size="14" font-weight="800" fill="#fff">${wrapTspans(it.t, x + segW / 2, 70, 9, 16)}</text>
        ${it.d ? `<text x="${(x + segW / 2).toFixed(0)}" y="116" text-anchor="middle" font-size="11" fill="#46505f">${wrapTspans(it.d, x + segW / 2, 116, Math.floor(segW / 11), 14)}</text>` : ''}
      </g>`;
    });
    return svg(W, H + 16, out, spec);
  }

  /* ---------- compare ---------- */
  function compareCols(spec) {
    const cols = spec.cols || [];
    const n = cols.length;
    const W = 900, colW = (W - (n - 1) * 16) / n;
    let maxPts = 0;
    cols.forEach(c => maxPts = Math.max(maxPts, (c.points || []).length));
    const H = 70 + maxPts * 30 + 16;
    let out = '';
    cols.forEach((col, i) => {
      const x = i * (colW + 16);
      const c = col.c || PALETTE[i % PALETTE.length];
      out += `<rect x="${x.toFixed(0)}" y="34" width="${colW.toFixed(0)}" height="${H - 50}" rx="12" fill="${c}" opacity="0.06" stroke="${c}" stroke-width="1.5"/>
        <rect x="${x.toFixed(0)}" y="34" width="${colW.toFixed(0)}" height="38" rx="12" fill="${c}"/>
        <text x="${(x + colW / 2).toFixed(0)}" y="59" text-anchor="middle" font-size="14" font-weight="800" fill="#fff">${esc(col.t)}</text>`;
      (col.points || []).forEach((p, j) => {
        const py = 92 + j * 30;
        out += `<circle cx="${(x + 20).toFixed(0)}" cy="${(py - 4).toFixed(0)}" r="3" fill="${c}"/>
          <text x="${(x + 32).toFixed(0)}" y="${py}" font-size="11.5" fill="#1c2330">${wrapTspans(p, x + 32, py, Math.floor((colW - 40) / 11), 14)}</text>`;
      });
    });
    return svg(W, H, out, spec);
  }

  /* ---------- 共通ラッパ ---------- */
  function svg(w, h, body, spec) {
    const titleH = spec.title ? 30 : 0;
    const capH = spec.caption ? 26 : 0;
    const total = h + titleH + capH;
    let head = '';
    if (spec.title) head += `<text x="0" y="20" font-size="13" font-weight="800" fill="#0f4c81" letter-spacing="0.04em">${esc(spec.title)}</text>`;
    const inner = `<g transform="translate(0,${titleH})">${body}</g>`;
    let cap = '';
    if (spec.caption) cap += `<text x="0" y="${total - 6}" font-size="11" fill="#7b8494">${esc(spec.caption)}</text>`;
    return `<div class="diagram-wrap"><svg viewBox="0 0 ${w} ${total}" class="diagram-svg" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(spec.title || '図解')}">${head}${inner}${cap}</svg></div>`;
  }

  /* ---------- ディスパッチ ---------- */
  function render(spec) {
    if (!spec || !spec.type) return '';
    switch (spec.type) {
      case 'flow': return flow(spec);
      case 'stack': return stack(spec);
      case 'cycle': return cycle(spec);
      case 'spectrum': return spectrum(spec);
      case 'compare': return compareCols(spec);
      default: return '';
    }
  }

  function renderAll(specs) {
    return (specs || []).map(render).join('');
  }

  return { render, renderAll };
})();
