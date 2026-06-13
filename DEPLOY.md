# TECHRA 公開・自動更新ガイド

このサイトは**専用サーバー不要**で公開・自動更新できる設計です。
アーキテクチャは「静的ホスティング + クライアント側同期 + GitHub Actions更新パイプライン」の3層です。

```
┌──────────────────────────────────────────────────────────┐
│ GitHub Actions (毎日 06:00 JST)                           │
│  tools/update-news.mjs                                    │
│   1. 官公庁・国際機関のRSSを収集 → content/inbox.json      │
│   2. (APIキー設定時) Claudeが解説を起草                    │
│      → content/update.json / manifest.json を更新・commit │
└──────────────┬───────────────────────────────────────────┘
               │ push → 自動デプロイ
┌──────────────▼───────────────────────────────────────────┐
│ GitHub Pages (静的ホスティング・無料)                      │
│  index.html + js/ + content/                              │
└──────────────┬───────────────────────────────────────────┘
               │ 訪問時に manifest.json をチェック
┌──────────────▼───────────────────────────────────────────┐
│ 訪問者のブラウザ (js/sync.js)                              │
│  ・新版があれば update.json を取得しその場でマージ・再描画  │
│  ・差分はlocalStorageにキャッシュ → オフラインでも最新表示  │
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

## 2. 最新情報の自動反映を有効にする

同梱の `.github/workflows/update-content.yml` が毎日動きます。動作は2段階です。

### レベル1: 収集のみ(設定不要・今すぐ動く)

- 経産省・環境省・NEDO・IEAなどのRSS(`tools/sources.json` で追加可能)から新着見出しを収集
- 領域キーワードで分類し、新規テーマ候補の出現スコアを集計
- 結果を `content/inbox.json` に保存(人間がレビューして `content/update.json` へ反映する運用)

### レベル2: AI起草まで自動化(APIキー設定で有効)

1. リポジトリの **Settings → Secrets and variables → Actions** で
   `ANTHROPIC_API_KEY` を登録([Claude Console](https://console.anthropic.com/)で取得)
2. 以後、毎日の実行でClaude(claude-opus-4-8)が新着見出しから
   **TECHRA形式のニュース解説**(前提知識リンク・観点別解説・事実/推測の区別付き)を起草し、
   `content/update.json` に追記・`manifest.json` のversionを+1してcommit
3. Pagesが自動再デプロイされ、**全訪問者のサイトが次回アクセス時に自動で最新化**されます
   (アプリ本体の再配布なし。訪問者には「コンテンツを更新しました」のトーストが出ます)

> スクリプトはプロンプトで「見出しから確実に言えることだけをfactsに、推測はspecに」
> 「収録済み用語IDのみリンク可」と制約し、さらにコード側でID検証を行います。
> それでも公開前レビューをしたい場合は、workflowのcommitステップをPR作成に変えるか、
> APIキーを設定せずレベル1(inbox.jsonレビュー)運用にしてください。

### 手動でコンテンツを更新したい場合

`content/update.json` に差分(用語・ニュース・成長ログ等)を書き、
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
