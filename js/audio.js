/* ============================================================
   TECHRA 音声解説エンジン（2エンジン対応）
   - browser : Web Speech API（各PCのOS音声。無料・オフライン・公開サイトでも動く）
   - zunda   : VOICEVOX のローカルAPIで「ずんだもん」を合成（のだ口調）
               ※ http://127.0.0.1:50021 が必要。VOICEVOX起動中＆ローカルhttpで開いた時のみ。
                 公開https サイトでは混在コンテンツでブロックされるため使えない。
   構成: 全体像 → 要点3つ → よくある誤解 → 復習
   ============================================================ */

window.AudioGuide = (function () {
  const VV = 'http://127.0.0.1:50021';   // VOICEVOX ENGINE
  let utter = null;
  let playing = false;
  let currentId = null;
  let onStateChange = null;
  let sentenceCb = null;                  // 一文ごとの進行通知(字幕同期用)
  let engine = loadPref();               // 'browser' | 'zunda'
  let cancelToken = 0;                    // VOICEVOX逐次再生のキャンセル
  let audioEl = null;                     // ずんだもん再生用
  let zundaSpeakerId = null;             // 実行時に解決(なければ3)

  function loadPref() { try { return localStorage.getItem('techra_voice') || 'browser'; } catch (e) { return 'browser'; } }
  function setEngine(e) { engine = e; try { localStorage.setItem('techra_voice', e); } catch (_) { } }
  function getEngine() { return engine; }

  /* リンク記法・装飾を除去 */
  function plain(text) {
    return (text || '')
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/^- /gm, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function relatedNames(t) {
    return (t.related || []).slice(0, 3)
      .map(r => { const rt = (window.TERMS || []).find(x => x.id === r.id); return rt ? plain(rt.name) : null; })
      .filter(Boolean);
  }

  /* ---------- 標準（ていねい体）台本 ---------- */
  function buildScript(t) {
    const parts = [];
    parts.push(`${plain(t.name)}の3分解説です。`);
    parts.push(`一言でいうと。${plain(t.oneLiner)}`);
    parts.push(`なぜ重要なのでしょうか。${plain(t.why)}`);
    if (t.keyPoints && t.keyPoints.length) {
      parts.push(`押さえるべきポイントは${t.keyPoints.length}つです。`);
      t.keyPoints.forEach((k, i) => parts.push(`${i + 1}つ目。${plain(k)}。`));
    }
    if (t.misconceptions && t.misconceptions.length) {
      const m = t.misconceptions[0];
      parts.push(`よくある誤解にも触れておきます。「${plain(m.x)}」と思われがちですが、正しくは。${plain(m.o)}`);
    }
    const names = relatedNames(t);
    if (names.length) parts.push(`関連して学ぶと理解が深まるのは、${names.join('、')}、などです。`);
    parts.push(`最後に復習です。${plain(t.oneLiner)}。以上、${plain(t.name)}の解説でした。`);
    return parts.join(' ');
  }

  /* ---------- ずんだもん（のだ口調）台本 ----------
     ナレーションは完全にのだ口調。本文は安全な範囲で語尾変換（です系のみ）。
     ※「ます」形・体言止めは機械変換が崩れやすいので変換せず、声と全体の口調で雰囲気を出す。 */
  function zundaStyle(s) {
    return (s || '')
      .replace(/でしょうか[。？]?/g, 'のだろうか？')
      .replace(/でしょう[。]?/g, 'はずなのだ。')
      .replace(/でした。/g, 'だったのだ。')
      .replace(/ですが、/g, 'なのだが、')
      .replace(/ですし、/g, 'なのだし、')
      .replace(/ですね[。！]?/g, 'なのだ。')
      .replace(/です。/g, 'なのだ。')
      .replace(/である。/g, 'なのだ。')
      .replace(/ません。/g, 'ないのだ。');
  }

  function buildScriptZunda(t) {
    const P = [];
    P.push(`こんにちはなのだ！ ボクはずんだもん。今日は「${plain(t.name)}」について、ボクと一緒に見ていくのだ。`);
    P.push(`まずは、ざっくり一言で言うのだ。${zundaStyle(plain(t.oneLiner))}`);
    P.push(`どうして大事なのか、説明するのだ。${zundaStyle(plain(t.why))}`);
    if (t.keyPoints && t.keyPoints.length) {
      P.push(`大事なポイントは${t.keyPoints.length}つなのだ！`);
      t.keyPoints.forEach((k, i) => P.push(`${i + 1}つ目なのだ。${zundaStyle(plain(k))}`));
    }
    if (t.misconceptions && t.misconceptions.length) {
      const m = t.misconceptions[0];
      P.push(`よくある勘違いも教えるのだ。「${plain(m.x)}」と思いがちなのだが、本当はちがうのだ。${zundaStyle(plain(m.o))}`);
    }
    const names = relatedNames(t);
    if (names.length) P.push(`関連して、${names.join('、')}、も一緒に学ぶと、もっと分かるのだ。`);
    P.push(`最後におさらいなのだ。${zundaStyle(plain(t.oneLiner))} 以上、ずんだもんがお届けしたのだ！ またね、なのだ！`);
    return P.join(' ');
  }

  function notify() { if (onStateChange) onStateChange({ playing, currentId, engine }); }
  function emitSentence(ev) { if (sentenceCb) sentenceCb(ev); }
  function scriptSentences(t) { return splitSentences(engine === 'zunda' ? buildScriptZunda(t) : buildScript(t)); }
  function state() { return { playing, currentId, engine, supported: ('speechSynthesis' in window) }; }

  /* ============================================================
     browser エンジン（Web Speech API）
     ============================================================ */
  function browserSupported() { return 'speechSynthesis' in window; }
  function pickVoice() {
    const voices = speechSynthesis.getVoices();
    return voices.find(v => v.lang === 'ja-JP' && /Google|Microsoft/.test(v.name))
      || voices.find(v => v.lang === 'ja-JP')
      || voices.find(v => v.lang && v.lang.startsWith('ja')) || null;
  }
  function playBrowser(termId, t) {
    if (currentId === termId && speechSynthesis.paused) { speechSynthesis.resume(); playing = true; notify(); return 'resumed'; }
    hardStop();
    currentId = termId;
    const sentences = splitSentences(buildScript(t));
    const v = pickVoice();
    sentences.forEach((s, i) => {
      const u = new SpeechSynthesisUtterance(s);
      u.lang = 'ja-JP'; u.rate = 1.3; u.pitch = 1.0;   // 標準音声も少し速め
      if (v) u.voice = v;
      u.onstart = () => emitSentence({ index: i, total: sentences.length, text: s });
      if (i === sentences.length - 1) u.onend = () => { playing = false; currentId = null; notify(); emitSentence({ index: -1 }); };
      u.onerror = () => { };
      speechSynthesis.speak(u);
    });
    playing = true; notify(); return 'started';
  }

  /* ============================================================
     zunda エンジン（VOICEVOX ローカルAPI）
     ============================================================ */
  async function vvAvailable() {
    try { const r = await fetch(VV + '/version', { signal: AbortSignal.timeout(2500) }); return r.ok; }
    catch (e) { return false; }
  }
  async function resolveZundaSpeaker() {
    if (zundaSpeakerId != null) return zundaSpeakerId;
    try {
      const r = await fetch(VV + '/speakers', { signal: AbortSignal.timeout(4000) });
      const speakers = await r.json();
      const z = speakers.find(s => /ずんだもん/.test(s.name));
      if (z && z.styles && z.styles.length) {
        const normal = z.styles.find(st => /ノーマル/.test(st.name)) || z.styles[0];
        zundaSpeakerId = normal.id;
      }
    } catch (e) { /* noop */ }
    if (zundaSpeakerId == null) zundaSpeakerId = 3; // 既定: ずんだもん(ノーマル)
    return zundaSpeakerId;
  }
  async function vvSynth(text, speaker) {
    const q = await fetch(`${VV}/audio_query?text=${encodeURIComponent(text)}&speaker=${speaker}`, { method: 'POST' });
    if (!q.ok) throw new Error('audio_query failed');
    const query = await q.json();
    query.speedScale = 1.3;           // 速め(ユーザー要望: 1.3倍)
    query.pauseLengthScale = 0.5;     // 文中の「、」等の間を短く
    query.prePhonemeLength = 0;       // 文頭の無音を削る
    query.postPhonemeLength = 0.05;   // 文末の無音を最小限に(間を詰める)
    const s = await fetch(`${VV}/synthesis?speaker=${speaker}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(query)
    });
    if (!s.ok) throw new Error('synthesis failed');
    return await s.blob();
  }
  function splitSentences(s) { return s.split(/(?<=[。！？])/).map(x => x.trim()).filter(Boolean); }
  function playBlobUrl(url, myToken) {
    return new Promise((resolve) => {
      if (!audioEl) audioEl = new Audio();
      audioEl.src = url;
      audioEl.onended = () => resolve();
      audioEl.onerror = () => resolve();
      audioEl.play().catch(() => resolve());
      // 外部からpause/stopされても、最終的にここで止まる
      const iv = setInterval(() => { if (myToken !== cancelToken) { clearInterval(iv); resolve(); } }, 200);
    });
  }
  async function playZunda(termId, t) {
    const speaker = await resolveZundaSpeaker();
    const myToken = ++cancelToken;
    currentId = termId; playing = true; notify();
    const sentences = splitSentences(buildScriptZunda(t));
    let nextBlob = vvSynth(sentences[0], speaker).catch(() => null);
    for (let i = 0; i < sentences.length; i++) {
      if (myToken !== cancelToken) return;
      const blob = await nextBlob;
      if (i + 1 < sentences.length) nextBlob = vvSynth(sentences[i + 1], speaker).catch(() => null);
      if (myToken !== cancelToken) return;
      emitSentence({ index: i, total: sentences.length, text: sentences[i] });   // 字幕同期
      if (!blob) continue;
      const url = URL.createObjectURL(blob);
      await playBlobUrl(url, myToken);
      URL.revokeObjectURL(url);
    }
    if (myToken === cancelToken) { playing = false; currentId = null; notify(); emitSentence({ index: -1 }); }
  }

  /* ============================================================
     公開API
     ============================================================ */
  function hardStop() {
    cancelToken++;
    if (browserSupported()) speechSynthesis.cancel();
    if (audioEl) { try { audioEl.pause(); audioEl.src = ''; } catch (e) { } }
    playing = false;
  }

  /* play は非同期。戻り値: 'started'|'resumed'|'unavailable'|'unsupported' */
  async function play(termId) {
    const t = (window.TERMS || []).find(x => x.id === termId);
    if (!t) return 'unsupported';

    if (engine === 'zunda') {
      // 再開（一時停止中の同一テーマ）
      if (currentId === termId && audioEl && audioEl.paused && audioEl.src) { audioEl.play().catch(() => { }); playing = true; notify(); return 'resumed'; }
      const ok = await vvAvailable();
      if (!ok) return 'unavailable';
      hardStop();
      playZunda(termId, t);   // 逐次再生（await しない）
      return 'started';
    }
    // browser
    if (!browserSupported()) return 'unsupported';
    return playBrowser(termId, t);
  }

  function pause() {
    if (engine === 'zunda') { if (audioEl && !audioEl.paused) { audioEl.pause(); playing = false; notify(); } return; }
    if (browserSupported() && speechSynthesis.speaking) { speechSynthesis.pause(); playing = false; notify(); }
  }

  function stop() { hardStop(); currentId = null; notify(); }

  return {
    play, pause, stop, state, buildScript, buildScriptZunda, plain,
    setEngine, getEngine, vvAvailable, scriptSentences,
    set onChange(fn) { onStateChange = fn; },
    set onSentence(fn) { sentenceCb = fn; }
  };
})();
