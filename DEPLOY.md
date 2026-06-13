# TECHRA 公開・自動更新ガイド

このサイトは**専用サーバー不要**で公開・自動更新できる設計です。
アーキテクチャは「静的ホスティング + クライアント側同期 + GitHub Actions更新パイプライン」の3層です。

```
┌──────────────────────────────────────────────────────────┐
│ GitHub Actions (毎日 06:00 JST)  tools/update-news.mjs    │
│  A: 経産省＋Googleニュースのトピック別RSSを収集            │
│     → 見出しを既存用語に自動リンク → content/radar.json    │
│     → main へ自動コミット（外部見出しの収集物・安全）      │
│  B: (APIキー設定時) Claudeが解説を起草 → content/drafts.json│
│     → tools/promote-drafts.mjs で update.json 化           │
│     → プルリクエスト作成（人がマージして初めて公開）       │
└──────────────┬───────────────────────────────────────────┘
               │ push / PRマージ → 自動デプロイ
┌──────────────▼───────────────────────────────────────────┐
│ GitHub Pages (静的ホスティング・無料)                      │
│  index.html + js/ + content/                              │
└──────────────┬───────────────────────────────────────────┘
               │ 訪問時に manifest.json / radar.json を取得    │
┌──────────────▼───────────────────────────────────────────┐
│ 訪問者のブラウザ (js/sync.js)                              │
│  ・A: radar.json を取得しニュースレーダーを表示            │
│  ・B: update.json の新版があればその場でマージ・再描画     │
│  ・どちらもlocalStorageにキャッシュ → オフラインでも表示   │
│  ・学習データ(関心推定・既読)は各ブラウザ内のみ ← 多人数対応 │
└──────────────────────────────────────────────────────────┘
```

---

## 1. Webに公開する(10分)

### 方法A: GitHub Pages(推奨・自動更新パイプライン込み)

1. GitHubに新規リポジトリを作成し、このフォルダ一式をpush
   ```sh
   git init
   git add .
   git commit -m "TECHRA initial"
   git branch -M main
   git remote add origin https://github.com/<あなたのID>/<リポジトリ名>.git
   git push -u origin main
   ```
2. リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** に変更
3. 数分で `https://<あなたのID>.github.io/<リポジトリ名>/` で公開されます
   (同梱の `.github/workflows/deploy.yml` がpushのたびに自動デプロイ)

### 方法B: Netlify / Cloudflare Pages(最速)

フォルダをドラッグ&ドロップするだけで公開できます(ビルド設定は不要、公開ディレクトリ=ルート)。
この場合も `content/` の同期は機能しますが、自動更新パイプラインはGitHub連携時のみ動きます。

---

## 2. 最新情報の自動反映（A＋B）

同梱の `.github/workflows/update-content.yml` が毎日動きます。情報源は `tools/sources.json`
（経産省の公式Atom＋Googleニュースのトピック別検索）で、追加・変更できます。

### A: ニュースレーダー（無料・常時・設定不要）

- 各トピックの新着見出しを収集し、**見出しに出た用語だけを既存の学習ページに自動リンク**
- 無関係な見出しを除外し、フィードごとに上限を設けて領域を分散
- 結果を `content/radar.json` として **main へ自動コミット → 自動デプロイ**
- サイトのニュースページ下部に「最新ニュース・レーダー」として表示（**外部見出しであることを明記**。AIは使わずハルシネーションなし）

これは設定なしで今すぐ機能します。`ANTHROPIC_API_KEY` は不要です。

### B: AI下書き → プルリクエストで人がレビュー → マージで公開（課金・任意）

1. リポジトリの **Settings → Secrets and variables → Actions** で
   `ANTHROPIC_API_KEY` を登録（[Claude Console](https://console.anthropic.com/) で取得）
2. 以後、毎日の実行で Claude が収集見出しから **TECHRA形式の解説**（前提知識・観点別・事実/推測の区別付き）を
   `content/drafts.json` に起草 → `tools/promote-drafts.mjs` で公開形式（`update.json`）に変換 →
   **プルリクエストを自動作成**
3. あなたは GitHub上でPRの差分（＝公開される内容そのもの）を確認し、
   問題なければ **Merge** ＝公開。不要なら **Close** で公開されません
4. マージで `main` が更新 → 自動デプロイ → 全訪問者のサイトに反映（本体の再配布なし）

> **Bは「全自動公開」ではありません。** 規制・安全に関わる記述をAIが書く以上、
> 公開前に必ず人が関所になる設計です。スクリプトは「確実に言えることだけfactsに・推測はspecに」
> 「収録済み用語IDのみリンク可」と制約し、コード側でもID検証します。
> モデルを変えてコストを下げたい場合は環境変数 `TECHRA_MODEL`（例 `claude-sonnet-4-6`）で指定できます。

### 手動でコンテンツを更新したい場合

`content/update.json` に差分（用語・ニュース・成長ログ等）を書き、
`content/manifest.json` の `version` を+1してpushするだけです。形式は `js/sync.js` 冒頭のコメント参照。

---

## 3. 多様な訪問者への対応(マルチユーザー)

**サーバー側のユーザー管理は不要**な設計です。

- パーソナライズ(関心レンズ・既読・復習キュー)は各訪問者の**ブラウザ内(localStorage)で独立に動作**します。
  100人が訪問すれば100通りの適応が、互いに干渉せず・個人情報を一切送信せずに成立します
- 端末をまたぎたいユーザーは「成長ログ」ページの**エクスポート/インポート**で学習データを引っ越せます

### 将来サーバーを足したくなったら(拡張ロードマップ)

| やりたいこと | 推奨構成 | 規模感 |
| --- | --- | --- |
| アカウント・複数端末同期 | Supabase / Firebase(無料枠)に学習データJSONを保存。`usermodel.js` のload/saveを差し替えるだけで対応可能な構造にしてある | 小 |
| アクセス解析(匿名) | Cloudflare Web Analytics等のスクリプト1行 | 極小 |
| 全文検索の高度化 | 静的のままPagefind等を追加 | 小 |
| リアルタイム性の高いニュース取込 | Cloudflare Workers / Vercel FunctionsでRSS→update.json生成をエッジ化 | 中 |

いずれも現在のデータ構造(`content/update.json` 差分配信、`UM` のexport/import)が
そのまま土台になるため、**後からの追加が前提の設計**です。

---

## 4. 運用チェックリスト

- [ ] `tools/sources.json` のフィードURLを定期的に見直す(改廃があるため)
- [ ] 成長ログページの「情報鮮度ダッシュボード」で古いページを確認し、`termPatches` で更新日を上げる
- [ ] AI起草を有効にした場合、最初の数回は `content/update.json` の品質を必ず目視確認
- [ ] 法規・安全関連の自動生成記事は特に一次情報と照合する(サイト全体の信頼性要件)
