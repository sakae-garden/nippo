// ============================================================
// 共通店舗定義 + 配達経路定義（日報 / 配達商品情報 / サマリー で共用）
// 参照: apps/nippo/index.html, apps/nippo/haitatsu.html, apps/nippo/summary.html
// ※ summary.html は表示用の担当者サブラベルと色クラスだけ自前で上書きする。
//   経路の編成（ラベル・所属・順序）は3画面ともこのファイルが唯一の出典。
// ============================================================
(function(global){
  var STORE_DEFS = {
    yorii:          { name:'ヤオコー寄居店',                  cls:'yaoko',  icon:'🏪', type:'yaoko',        prices:['¥99','¥198','¥398','¥598'] },
    midori:         { name:'ヤオコーみどりが丘店',            cls:'yaoko',  icon:'🏪', type:'yaoko',        prices:['¥99','¥198','¥398','¥598'] },
    obusuma:        { name:'男衾農産物直売所',                cls:'choku',  icon:'🌿', type:'choku',        prices:['¥180','¥200','¥380','¥540'] },
    kawamoto:       { name:'川本農産物直売所',                cls:'choku',  icon:'🌿', type:'choku',        prices:['¥180','¥200','¥380','¥540'] },
    tamaya:         { name:'たまや',                          cls:'others', icon:'🏬', type:'choku',        prices:['¥220（税込）','¥450（税込）'] },
    nourin:         { name:'農林公園',                        cls:'others', icon:'🌳', type:'choku',        prices:['¥180','¥200','¥380','¥500'] },
    michieki:       { name:'道の駅おがわまち',                cls:'others', icon:'🚗', type:'choku',        prices:['¥210','¥420'] },
    minano:         { name:'ヤオコー皆野店',                  cls:'yaoko',  icon:'🏪', type:'yaoko',        prices:['¥99','¥198','¥398','¥598'] },
    kagohara_s:     { name:'ヤオコー籠原店',                  cls:'yaoko',  icon:'🏪', type:'yaoko',        prices:['¥99','¥198','¥398','¥598'] },
    okabe:          { name:'道の駅おかべ',                    cls:'choku',  icon:'🚗', type:'choku',        prices:['¥200','¥216','¥380','¥420'] },
    honjo:          { name:'ヤオコー本庄中央店',              cls:'yaoko',  icon:'🏪', type:'yaoko',        prices:['¥99','¥198','¥398','¥598'] },
    kamisato:       { name:'ヤオコー上里店',                  cls:'yaoko',  icon:'🏪', type:'yaoko',        prices:['¥99','¥198','¥398','¥598'] },
    kodama:         { name:'ヤオコー児玉バイパス店',          cls:'yaoko',  icon:'🏪', type:'yaoko',        prices:['¥99','¥198','¥398','¥598'] },
    sakado_izumi:   { name:'ヤオコー坂戸泉店',               cls:'yaoko',  icon:'🏪', type:'yaoko',        prices:['¥99','¥198','¥398','¥598'] },
    sakado_chiyoda: { name:'ヤオコー坂戸千代田店',           cls:'yaoko',  icon:'🏪', type:'yaoko',        prices:['¥99','¥198','¥398','¥598'] },
    wakaba:         { name:'ヤオコーワカバウォーク店',        cls:'yaoko',  icon:'🏪', type:'yaoko',        prices:['¥99','¥198','¥398','¥598'] },
    ipponmatsu:     { name:'ヤオコー一本松南店',              cls:'yaoko',  icon:'🏪', type:'yaoko',        prices:['¥99','¥198','¥398','¥598'] },
    nagase:         { name:'ヤオコー長瀬店',                  cls:'yaoko',  icon:'🏪', type:'yaoko',        prices:['¥99','¥198','¥398','¥598'] },
    higashimatsuyama_shinjuku: { name:'ヤオコー東松山新宿店',  cls:'yaoko',  icon:'🏪', type:'yaoko',        prices:['¥99','¥198','¥398','¥598'] }
  };

  // ============================================================
  // 経路バージョン切替
  // ------------------------------------------------------------
  // 【切り戻し手順】この 1 行を 'v1' ⇄ 'v2' に書き換えて配信するだけ。
  //   v1 = 現行編成（小川 / 籠原 / 坂戸）
  //   v2 = 旧編成  （籠原 / 皆野 / 坂戸）
  // 他のファイルは一切触らないこと。経路タブのラベル・店舗・順序は
  // すべて下の ROUTE_DEFS から描画される（HTML にベタ書きしない）。
  //
  // 【経路IDについて】id（kagohara / minano / sakado）は
  //   "配達スロットの識別子" であって経路名ではない。両バージョンで不変。
  //   - staff_by_route_v1（localStorage）が id をキーに当日の担当者を保持する。
  //     id をスロットに固定しておけば、版を切り替えた当日も担当者が
  //     別経路へ漏れない（当日限りのデータで翌日リセットされる）。
  //   - GAS 側 SANCHI_ROUTES が同じ id 列を持つ（GAS 変更不要）。
  //   店舗ID（STORE_DEFS のキー）も両バージョンで不変。変わるのは
  //   経路のラベル・所属・順序だけなので、店舗単位の過去データは無傷。
  // ============================================================
  var ROUTE_VERSION = 'v1';

  var ROUTE_DEFS = {
    // ---- v1: 現行編成 -------------------------------------------------
    // 小川 = 皆野→寄居→みどりが丘、籠原 = 籠原→本庄中央→上里→児玉バイパス。
    // ヤオコー以外の店舗は旧編成のスロットに据え置き
    // （旧・籠原枠→小川ルート、旧・皆野枠→籠原ルート）。
    v1: [
      { id:'kagohara', label:'小川ルート', groups:[
        { label:'ヤオコー', stores:['minano','yorii','midori'] },
        { label:'農産物直売所', stores:['obusuma','kawamoto'] },
        { label:'その他', stores:['michieki','nourin','tamaya'] }
      ]},
      { id:'minano', label:'籠原ルート', groups:[
        { label:'ヤオコー', stores:['kagohara_s','honjo','kamisato','kodama'] },
        { label:'直売所', stores:['okabe'] }
      ]},
      { id:'sakado', label:'坂戸ルート', groups:[
        { label:'ヤオコー', stores:['higashimatsuyama_shinjuku','sakado_izumi','sakado_chiyoda','wakaba','ipponmatsu','nagase'] }
      ]}
    ],
    // ---- v2: 旧編成（切り戻し用・改変禁止） ---------------------------
    v2: [
      { id:'kagohara', label:'籠原ルート', groups:[
        { label:'ヤオコー', stores:['kagohara_s','yorii','midori'] },
        { label:'農産物直売所', stores:['obusuma','kawamoto'] },
        { label:'その他', stores:['michieki','nourin','tamaya'] }
      ]},
      { id:'minano', label:'皆野ルート', groups:[
        { label:'ヤオコー', stores:['minano','kodama','kamisato','honjo'] },
        { label:'直売所', stores:['okabe'] }
      ]},
      { id:'sakado', label:'坂戸ルート', groups:[
        { label:'ヤオコー', stores:['higashimatsuyama_shinjuku','sakado_izumi','sakado_chiyoda','wakaba','ipponmatsu','nagase'] }
      ]}
    ]
  };

  // 日報の経路タブ（id 参照）。未知のバージョン指定時は v2（旧編成）に落とす。
  var ROUTES = ROUTE_DEFS[ROUTE_VERSION] || ROUTE_DEFS.v2;

  global.STORE_DEFS = STORE_DEFS;
  global.ROUTES = ROUTES;
  global.ROUTE_DEFS = ROUTE_DEFS;
  global.ROUTE_VERSION = ROUTE_VERSION;
})(window);
