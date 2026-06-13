/* ============================================================
   TECHRA データ: 領域(ドメイン)定義 & 学習ルート
   分類は固定ではなく、ニュース動向・閲覧傾向により再編される
   (再編履歴は growth.js の GROWTH_LOG を参照)
   ============================================================ */

window.DOMAINS = [
  {
    id: 'env-chem', name: '環境・化学物質管理', icon: '🧪', color: '#3a9d5d',
    short: 'VOC・PFAS・SDS・PRTRなど、化学物質と環境規制の常識',
    desc: '工場・製品・サプライチェーンに関わる化学物質の管理と環境規制。ニュースでは規制強化・代替材料・訴訟リスクとして頻出する。'
  },
  {
    id: 'semicon', name: '半導体・電子部品', icon: '🔬', color: '#2b6cb0',
    short: '製造工程・装置・材料・クリーンルームから産業構造まで',
    desc: '前工程・後工程、EUV、クリーンルーム、超純水などの製造技術と、ファウンドリ・装置・材料からなる産業構造。経済安全保障の中心テーマ。'
  },
  {
    id: 'energy-gx', name: 'エネルギー・GX', icon: '🌱', color: '#0ca678',
    short: '水素・CCUS・Scope1/2/3・LCAなど脱炭素の基礎概念',
    desc: 'カーボンニュートラルに向けた技術と制度。水素・CCUS・排出量算定は、企業の開示・投資・調達のニュースを読むうえで必須。'
  },
  {
    id: 'power-market', name: '電力・再エネ制度', icon: '⚡', color: '#e8a020',
    short: 'PPA・FIT/FIP・非化石証書など電力調達の制度知識',
    desc: '再エネ電力をどう調達し、環境価値をどう扱うか。制度の組み合わせで意味が大きく変わるため、用語の関係理解が特に重要な領域。'
  },
  {
    id: 'thermal-utility', name: '熱・設備・ユーティリティ', icon: '♨️', color: '#e06030',
    short: 'ヒートポンプ・COP・冷却・蒸気など工場インフラの基礎',
    desc: '工場やビルを支える熱源・冷却・用水・排気のインフラ。省エネ投資・電化・脱炭素の議論はほぼこの領域に着地する。'
  },
  {
    id: 'battery-mobility', name: '電池・モビリティ', icon: '🔋', color: '#7b5cd6',
    short: 'リチウムイオン電池・全固体電池・EVのサプライチェーン',
    desc: '電池の方式・材料・製造と、EV・定置用蓄電池の市場。材料調達や安全性のニュースを技術構造から理解する。'
  },
  {
    id: 'datacenter-ai', name: 'データセンター・AIインフラ', icon: '🖥️', color: '#17a2b8',
    short: 'GPU・PUE・液冷・電力調達などAI時代のインフラ常識',
    desc: '生成AIの拡大で電力・冷却・半導体・立地が一体の論点に。複数領域が交差する、いま最も「横断理解」が問われるテーマ。'
  },
  {
    id: 'safety-reg', name: '安全・法規・リスク', icon: '🦺', color: '#c0392b',
    short: '高圧ガス・防爆・HAZOPなどプラント安全と法規の基礎',
    desc: '事故・許認可・保安のニュースを読むための基礎。実務では設備投資や工期を左右する重要な制約条件になる。'
  },
  {
    id: 'construction-city', name: '建設・都市・インフラ', icon: '🏙️', color: '#6c8e3a',
    short: 'ZEB・省エネ基準・建築設備と都市エネルギー',
    desc: '建築物の省エネ・環境認証と都市インフラ。不動産価値やテナント誘致と直結するため、ビジネス文脈での出現頻度が高い。'
  },
  {
    id: 'supplychain', name: '産業構造・サプライチェーン', icon: '🌐', color: '#5d6d7e',
    short: '輸出規制・補助金・地政学リスクと産業政策',
    desc: '個々の技術を「誰が・どこで・何に依存して」作っているかという視点。経済安全保障ニュースの読解に不可欠。'
  }
];

/* ---------- 学習ルート（体系学習用） ----------
   ルートは固定ではなく、ニュース動向・閲覧傾向で再編される */
window.ROUTES = [
  {
    id: 'route-semicon',
    title: '半導体ニュースが読めるようになる',
    audience: '初学者〜事業開発',
    desc: '工場新設・輸出規制・装置材料のニュースを構造から理解する。製造の流れ→支えるインフラ→最先端技術→産業構造の順に積み上げる。',
    terms: ['semi-process', 'cleanroom', 'upw', 'cvd-pvd-ald', 'euv', 'hbm', 'foundry-model'],
    icon: '🔬'
  },
  {
    id: 'route-gx',
    title: 'GX・脱炭素の開示と調達を理解する',
    audience: 'ビジネス・経営企画',
    desc: 'Scope1/2/3の算定から、再エネ調達(PPA・証書)、水素・CCUSまで。企業の統合報告書・GX投資ニュースを読み解く土台を作る。',
    terms: ['scope123', 'lca', 'ppa', 'fit-fip', 'hikaseki', 'hydrogen', 'ccus'],
    icon: '🌱'
  },
  {
    id: 'route-dc',
    title: 'データセンターとAI電力問題',
    audience: '横断テーマ・投資視点',
    desc: 'AIインフラのニュースは半導体×電力×冷却×不動産の交差点。GPUから電力調達までを一本の線でつなぐ。',
    terms: ['datacenter', 'pue', 'liquid-cooling', 'hbm', 'heatpump-cop', 'ppa'],
    icon: '🖥️'
  },
  {
    id: 'route-chem',
    title: '化学物質管理の実務常識',
    audience: '実務者・調達・工場',
    desc: 'SDSの読み方からPRTR届出、VOC対策、PFAS問題まで。製造業の環境コンプライアンスの全体像をつかむ。',
    terms: ['sds-ghs', 'prtr', 'voc', 'pfas'],
    icon: '🧪'
  },
  {
    id: 'route-battery',
    title: '電池のニュースを材料から理解する',
    audience: '技術・市場分析',
    desc: 'リチウムイオン電池の仕組みと材料の違い(LFP/NMC)を押さえ、全固体電池の実用化ニュースを正しく評価できるようになる。',
    terms: ['lib', 'solid-state', 'hydrogen'],
    icon: '🔋'
  },
  {
    id: 'route-safety',
    title: 'プラント安全と保安法規の入口',
    audience: '設備・保安・営業',
    desc: '高圧ガス・防爆・HAZOPという3つの柱から、工場の安全管理と許認可の構造を理解する。事故ニュースの背景が読めるようになる。',
    terms: ['kouatsu-gas', 'bouhaku', 'hazop', 'voc'],
    icon: '🦺'
  }
];

/* レンズ定義（利用者の関心モード） */
window.LENSES = [
  { id: 'auto',     label: '自動',        desc: '閲覧行動から自動推定' },
  { id: 'beginner', label: 'はじめて',    desc: '全体像と直感的な説明を優先' },
  { id: 'tech',     label: '技術・設備',  desc: '原理・工程・装置を深く' },
  { id: 'biz',      label: '事業・市場',  desc: '市場構造・企業・投資を厚く' },
  { id: 'reg',      label: '規制・安全',  desc: '法規・制度・リスク対応を優先' }
];
