/* ============================================================
   TECHRA コンテンツメタ情報
   version はビルトイン(同梱)コンテンツのバージョン。
   ホスティング環境では content/manifest.json と比較し、
   新しい版があれば content/update.json を取り込んで上書きする。
   ============================================================ */
window.CONTENT_META = {
  version: 1,
  built: '2026-06-12',
  channel: 'unknown'   // 'online' | 'offline' | 'unknown' (sync.jsが設定)
};
