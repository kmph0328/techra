/* ============================================================
   TECHRA 自律成長データ
   サイトの知識体系がどう更新されてきたか(成長ログ)と、
   ニュース出現頻度から検知された新規テーマ候補
   ============================================================ */

/* 成長ログ: 知識体系の更新履歴 */
window.GROWTH_LOG = [
  { date: '2026-06-12', type: 'reorg', text: '図解エンジンを導入し、主要10テーマに工程図・積層図・サイクル図などを追加。文章だけでなく「絵でわかる」理解を補強。', terms: ['semi-process', 'hbm', 'heatpump-cop', 'hydrogen'] },
  { date: '2026-06-12', type: 'new', text: '薄かった領域を拡充。「ボイラと蒸気」「排熱回収」(熱・設備)、「建築物省エネ基準とBELS」「CASBEE・LEED」(建設)、「経済安全保障と輸出規制」「サプライチェーンリスク」(産業構造)を新規作成し、地図の空白を埋めた。', terms: ['boiler-steam', 'heat-recovery', 'enecons-bels', 'econ-security', 'supply-risk'] },
  { date: '2026-06-12', type: 'new', text: '新規テーマ候補だった「ペロブスカイト太陽電池」を、ニュース出現頻度の高まりと関連クリックの多さを受けて正式ページへ昇格。候補→収録の成長ループが一巡した。', terms: ['perovskite'] },
  { date: '2026-06-10', type: 'news', text: 'IEA電力見通しとNVIDIA液冷ラックのニュース反映に伴い、「データセンター」「冷却方式」のリスク節・関連ニュースを更新。', terms: ['datacenter', 'liquid-cooling'] },
  { date: '2026-06-08', type: 'update', text: 'EU PFAS規制案の審議状況を反映し、「PFAS」の規制節を更新。半導体用途の例外議論を追記。', terms: ['pfas'] },
  { date: '2026-06-08', type: 'update', text: '米HBM輸出規制の定着を受け、「HBM」のビジネス節に輸出管理の観点を追加。', terms: ['hbm'] },
  { date: '2026-06-05', type: 'reorg', text: '半導体領域の学習ルートを再構成。「工程→インフラ→先端技術→産業構造」の順に変更(従来は用語五十音順)。閲覧データで工程理解が先行すると完読率が高いことが判明したため。', terms: ['semi-process'] },
  { date: '2026-06-02', type: 'update', text: 'コーポレートPPA拡大とSSBJ基準確定を受け、「PPA」「Scope1・2・3」のニュース接続を更新。', terms: ['ppa', 'scope123'] },
  { date: '2026-05-28', type: 'new', text: '閲覧需要の高まりを受け「冷却方式(空冷・水冷・液冷)」を独立ページとして新規作成(従来はデータセンター内の1節)。', terms: ['liquid-cooling'] },
  { date: '2026-05-25', type: 'update', text: '省エネ基準適合義務化(2025年4月施行)の定着を反映し、「ZEB」の規制節を全面更新。', terms: ['zeb'] },
  { date: '2026-05-20', type: 'update', text: '化学物質の自律的管理への移行(安衛法改正)を反映し、「SDSとGHS」を制度転換の文脈で書き直し。', terms: ['sds-ghs'] },
  { date: '2026-05-15', type: 'reorg', text: '「データセンター・AIインフラ」を独立領域に昇格。半導体・電力・熱の3領域にまたがる閲覧導線が増加したため、横断領域として新設。', terms: [] },
  { date: '2026-05-10', type: 'new', text: '水素ステーション関連の閲覧増を受け「高圧ガス保安法」を新規作成。', terms: ['kouatsu-gas'] },
  { date: '2026-04-28', type: 'update', text: 'FIP移行の進展と長期脱炭素電源オークションの結果を受け、「FITとFIP」「非化石証書」を更新。', terms: ['fit-fip', 'hikaseki'] },
  { date: '2026-04-15', type: 'new', text: 'プラント事故ニュースからの流入が継続していることを受け、「HAZOP」「防爆」を新規作成し安全領域を拡充。', terms: ['hazop', 'bouhaku'] }
];

/* 新規テーマ候補: ニュース・閲覧傾向から自動検知された未収録テーマ
   mentions = 直近90日のニュース出現スコア(相対値・最大100) */
window.CANDIDATES = [
  { name: 'SAF（持続可能な航空燃料）', mentions: 74, domains: ['energy-gx', 'supplychain'], note: '供給義務化の議論と国内製造プロジェクトの進展で出現頻度が上昇。水素・CCUSページからの関連クリックも多い。次期収録候補の筆頭。' },
  { name: 'SMR（小型モジュール炉）', mentions: 71, domains: ['datacenter-ai', 'power-market'], note: 'データセンター電力確保の文脈で言及が急増。原子力の制度・安全の基礎とセットで収録を検討。' },
  { name: 'ガラス基板（半導体パッケージ）', mentions: 58, domains: ['semicon'], note: '先端パッケージの次世代材料として技術発表が増加。HBM・チップレットページの読者の関心領域。' },
  { name: 'バーチャルパワープラント（VPP）・DR', mentions: 55, domains: ['power-market'], note: '需給調整市場の拡大とともに実装事例が増加。FIP・蓄電池ページからの導線需要が確認されている。' },
  { name: 'データセンターの排熱利用', mentions: 47, domains: ['datacenter-ai', 'thermal-utility'], note: '液冷化で温水回収が現実的になり、地域熱供給との接続事例が登場。「冷却方式」ページの発展テーマ。' },
  { name: 'CBAM（炭素国境調整）', mentions: 45, domains: ['energy-gx', 'supplychain'], note: 'EUの本格適用が近づき、鉄鋼・アルミの輸出実務での言及が増加。Scope1/2/3・LCAの応用編として候補。' },
  { name: '核融合', mentions: 38, domains: ['energy-gx'], note: 'スタートアップ投資と国家戦略のニュースが定常化。時間軸の長いテーマとして「事実と期待の区別」の教材価値が高い。' }
];

/* 情報鮮度ポリシー: この日数を超えた更新日のページには注意表示 */
window.FRESHNESS = {
  warnDays: 365,
  noteDays: 180
};
