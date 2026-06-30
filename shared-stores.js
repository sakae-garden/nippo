// ============================================================
// 共通店舗定義（配達日報 / 配達商品情報アプリ で共用）
// 参照: apps/nippo/index.html, apps/nippo/haitatsu.html
// ※ apps/nippo/summary.html は独自の ROUTE_GROUPS 構造を維持する
//   （store オブジェクトを直接埋め込む形式のため、共通化対象外）
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

  // 日報の経路タブ（id 参照）
  var ROUTES = [
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
  ];

  global.STORE_DEFS = STORE_DEFS;
  global.ROUTES = ROUTES;
})(window);
