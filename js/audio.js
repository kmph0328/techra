/* ============================================================
   TECHRA 音声解説エンジン
   用語データから「聞くだけで全体像がつかめる」台本を自動生成し、
   Web Speech API (speechSynthesis) で読み上げる。
   構成: 全体像 → 要点3つ → 誤解の補正 → 復習ポイント
   ============================================================ */

window.AudioGuide = (function () {
  let utter = null;
  let playing = false;
  let currentId = null;
  let onStateChange = null;

  /* 本文からリンク記法・装飾を除去 */
  function plain(text) {
    return (text || '')
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/^- /gm, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* 用語データ → 約3分の台本 */
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
    if (t.related && t.related.length) {
      const names = t.related.slice(0, 3).map(r => {
        const rt = (window.TERMS || []).find(x => x.id === r.id);
        return rt ? plain(rt.name) : null;
      }).filter(Boolean);
      if (names.length) parts.push(`関連して学ぶと理解が深まるのは、${names.join('、')}、などです。`);
    }
    parts.push(`最後に復習です。${plain(t.oneLiner)}。以上、${plain(t.name)}の解説でした。`);
    return parts.join(' ');
  }

  function supported() {
    return 'speechSynthesis' in window;
  }

  function pickVoice() {
    const voices = speechSynthesis.getVoices();
    return voices.find(v => v.lang === 'ja-JP' && /Google|Microsoft/.test(v.name))
      || voices.find(v => v.lang === 'ja-JP')
      || voices.find(v => v.lang && v.lang.startsWith('ja'))
      || null;
  }

  function play(termId) {
    if (!supported()) return false;
    const t = (window.TERMS || []).find(x => x.id === termId);
    if (!t) return false;

    if (currentId === termId && speechSynthesis.paused) {
      speechSynthesis.resume();
      playing = true;
      notify();
      return true;
    }
    stop();
    currentId = termId;
    utter = new SpeechSynthesisUtterance(buildScript(t));
    utter.lang = 'ja-JP';
    utter.rate = 1.0;
    utter.pitch = 1.0;
    const v = pickVoice();
    if (v) utter.voice = v;
    utter.onend = () => { playing = false; currentId = null; notify(); };
    utter.onerror = () => { playing = false; currentId = null; notify(); };
    speechSynthesis.speak(utter);
    playing = true;
    notify();
    return true;
  }

  function pause() {
    if (supported() && speechSynthesis.speaking) {
      speechSynthesis.pause();
      playing = false;
      notify();
    }
  }

  function stop() {
    if (supported()) speechSynthesis.cancel();
    playing = false;
    currentId = null;
    notify();
  }

  function notify() { if (onStateChange) onStateChange({ playing, currentId }); }

  function state() { return { playing, currentId, supported: supported() }; }

  return {
    play, pause, stop, state, buildScript, plain,
    set onChange(fn) { onStateChange = fn; }
  };
})();
