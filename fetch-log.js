// ============================================================
// 取得の記録（日報・配達商品情報・サマリー・袋出し記録・店舗依頼ボードで共用。2026-10-06）
// ------------------------------------------------------------
// 読み込みエラーの主因が電波か GAS の遅れ・エラーかを数字で判断するため、GAS からの取得の
// 失敗・遅れを端末にためて、次に取得が成功したときにまとめて GAS（action=logFetch → シート「取得記録」）へ送る。
//
// 記録する場面（1回の試行＝1本目と、4秒・すぐエラーで出す2本目までをまとめて1件）
//   fail … 試行が失敗した（2本とも打ち切り・エラー・形の違う応答）
//   slow … 1本目で取れたが4秒を超えた
//   2nd  … 2本目で取れた
//   late … 試行が失敗した後に、遅れて届いた応答を受け取った
//   redo … 取得中に復帰・回線切替などで捨てて出し直した（結果を待たずに打ち切った）
// 4秒以内に1本目で取れたときは記録しない。
// 記録の中身：端末時刻・画面・API 名・結果・所要ms・何本目・失敗の種類・背面から戻った直後か・
// 回線が戻った直後か・オフラインだったか・画面の版。店舗名などの業務データや数値は入れない。
// 端末IDは保存送信ログと同じもの（localStorage の device_id_v1）。
//
// ・端末にためるのは最大200件（古いものから捨てる）
// ・送るのは取得が成功した直後に1回だけ（URL の長さに収まる分。残りは次の成功時）。1端末1日50回まで
// ・送信の失敗・この部品の例外は画面の取得・表示に影響させない（すべて握りつぶす）
// 画面側の使い方：
//   FetchLog.init({ screen:'nippo', api:API_URL, test:IS_TEST_ENV, ver:PAGE_BUILD })
//   var A = FetchLog.attempt('getHaitatsu');   // 試行ごとに1つ
//   jsonp(..., { flog: A.req() })               // 1本出すごとに A.req()。jsonp が打ち切り・エラー・到着を伝える
//   A.ok() 受け取った／A.bad(res) 形の違う応答／A.fail() 試行の失敗／A.abandon() 捨てて出し直し
// ============================================================
(function(global){
  var SLOW_MS = 4000;        // これを超えたら「遅れ」
  var NEAR_MS = 10000;       // 復帰・回線復帰から何ms以内に始めた試行を「直後」とするか
  var MAX_ITEMS = 200;
  var MAX_SENDS_PER_DAY = 50;
  var DATA_BUDGET = 5000;    // 1回の送信で data に使う URL の長さ（エンコード後）
  var SEND_TIMEOUT = 20000, SEND_LATE = 60000, SEND_DELAY = 1500;

  var cfg = null;
  var lastVisAt = 0, lastNetAt = 0;
  var sending = false, sendT = null, cbN = 0;

  function noop(){}
  function safe(fn){ return function(){ try{ return fn.apply(this, arguments); }catch(e){} }; }
  function key(b){ return b + (cfg && cfg.test ? '_test' : ''); }
  function now(){ return Date.now(); }
  function ymd(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }

  function readQ(){
    try{ var a = JSON.parse(localStorage.getItem(key('fetch_log_v1')) || '[]'); return Array.isArray(a) ? a : []; }catch(e){ return []; }
  }
  function writeQ(a){ try{ localStorage.setItem(key('fetch_log_v1'), JSON.stringify(a)); }catch(e){} }
  // 端末ID（日報・配達商品情報・店舗依頼ボードの _deviceId と同じキー・同じ作り方）
  function deviceId(){
    var id = '';
    try{ id = localStorage.getItem(key('device_id_v1')) || ''; }catch(e){}
    if(!/^[0-9a-z]{6,20}$/.test(id)){
      id = Math.random().toString(36).slice(2,8) + Date.now().toString(36).slice(-4);
      try{ localStorage.setItem(key('device_id_v1'), id); }catch(e){}
    }
    return id;
  }

  function push(rec){
    var q = readQ();
    q.push(rec);
    if(q.length > MAX_ITEMS) q = q.slice(q.length - MAX_ITEMS);
    writeQ(q);
  }

  // 1回の試行
  function attempt(action){
    var A = { start: now(), reqs: 0, lastN: 0, kinds: [], state: '' };
    function rec(r, n){
      if(!cfg) return;
      var t = now();
      push({
        id: Math.random().toString(36).slice(2,8) + t.toString(36).slice(-5),
        t: A.start,
        s: cfg.screen,
        a: String(action || ''),
        r: r,
        ms: t - A.start,
        n: n,
        k: A.kinds.join(' '),
        bg: lastVisAt && lastVisAt >= A.start - NEAR_MS ? 1 : 0,
        ol: lastNetAt && lastNetAt >= A.start - NEAR_MS ? 1 : 0,
        off: (typeof navigator !== 'undefined' && navigator.onLine === false) ? 1 : 0,
        v: String(cfg.ver || '')
      });
    }
    var api = {
      // 1本出すごとに呼ぶ。jsonp に渡す
      req: safe(function(){
        var n = ++A.reqs;
        return {
          n: n,
          // kind: timeout（打ち切り）／error（script エラー＝通信エラー・404・5xx）／html（応答は来たがコールバックなし＝HTML 等）
          fail: safe(function(kind){ A.kinds.push(n + ':' + kind); }),
          // 応答が届いた（late=true は打ち切りの後に届いた）
          arrive: safe(function(late){ A.lastN = n; if(late) A.kinds.push(n + ':late'); })
        };
      }),
      // 届いた応答の形が違った（GAS のエラー・まだ用意できていない等）
      bad: safe(function(res){
        var k = (!res || typeof res !== 'object') ? 'bad' : res._pending ? 'pending' : (res.error || res.success === false) ? 'gaserr' : 'bad';
        A.kinds.push((A.lastN || A.reqs) + ':' + k);
      }),
      ok: safe(function(){
        if(A.state === 'ok') return;
        var was = A.state; A.state = 'ok';
        var n = A.lastN || 1, ms = now() - A.start;
        if(was === 'fail') rec('late', n);
        else if(was === '') {
          if(n >= 2) rec('2nd', n);
          else if(ms > SLOW_MS) rec('slow', n);
        }
        flushSoon();
      }),
      fail: safe(function(){
        if(A.state) return;
        A.state = 'fail';
        rec('fail', A.reqs);
      }),
      abandon: safe(function(){
        if(A.state || !A.reqs) return;
        A.state = 'redo';
        rec('redo', A.reqs);
      })
    };
    return api;
  }

  // 成功の直後に1回だけ送る（少し置いて、画面の取得と重ならないように）
  function flushSoon(){
    if(sendT) return;
    sendT = setTimeout(function(){ sendT = null; flush(); }, SEND_DELAY);
  }

  function toRow(r){ return [r.id, r.t, r.s, r.a, r.r, r.ms, r.n, r.k, r.bg, r.ol, r.off, r.v]; }

  var flush = safe(function(){
    if(!cfg || !cfg.api || sending) return;
    var q = readQ();
    if(!q.length) return;
    var today = ymd(new Date()), cnt = { d: today, n: 0 };
    try{ var c = JSON.parse(localStorage.getItem(key('fetch_log_sends_v1')) || 'null'); if(c && c.d === today) cnt = c; }catch(e){}
    if(cnt.n >= MAX_SENDS_PER_DAY) return;
    var rows = [], ids = {}, len = 2;
    for(var i = 0; i < q.length; i++){
      var s = encodeURIComponent(JSON.stringify(toRow(q[i])));
      if(rows.length && len + s.length + 3 > DATA_BUDGET) break;
      rows.push(toRow(q[i])); ids[q[i].id] = true; len += s.length + 3;
    }
    cnt.n++;
    try{ localStorage.setItem(key('fetch_log_sends_v1'), JSON.stringify(cnt)); }catch(e){}
    sending = true;
    var url = cfg.api + (cfg.api.indexOf('?') > -1 ? '&' : '?') + 'action=logFetch'
      + '&dev=' + encodeURIComponent(deviceId())
      + '&b=' + encodeURIComponent(rows[0][0] + '_' + rows.length)
      + '&data=' + encodeURIComponent(JSON.stringify(rows));
    send(url, function(res){
      if(!res || !res.success) return;
      // 送った分だけ消す（送っている間にたまった分は残す）
      writeQ(readQ().filter(function(r){ return !ids[r.id]; }));
    }, function(){ sending = false; });
  });

  // 送信用の JSONP（画面の jsonp とは別。失敗しても何もしない。打ち切りの後に届いた応答も受け取る）
  function send(url, onRes, onEnd){
    var n = 'cb_flog_' + (cbN++) + '_' + now().toString(36), s = document.createElement('script');
    var ended = false, t = null, lt = null;
    function end(){ if(ended) return; ended = true; clearTimeout(t); onEnd(); }
    function cleanup(){
      end(); clearTimeout(lt);
      try{ delete global[n]; }catch(e){ global[n] = undefined; }
      if(s.parentNode) s.parentNode.removeChild(s);
    }
    global[n] = function(d){ cleanup(); try{ onRes(d); }catch(e){} };
    t = setTimeout(function(){ end(); lt = setTimeout(cleanup, SEND_LATE); }, SEND_TIMEOUT);
    s.onerror = function(){ cleanup(); };
    s.src = url + '&callback=' + n;
    (document.body || document.documentElement).appendChild(s);
  }

  var init = safe(function(o){
    cfg = { screen: String(o.screen || ''), api: String(o.api || ''), test: !!o.test, ver: String(o.ver || '') };
  });

  try{
    document.addEventListener('visibilitychange', function(){ lastVisAt = now(); });
    global.addEventListener('pageshow', function(e){ if(e && e.persisted) lastVisAt = now(); });
    global.addEventListener('online', function(){ lastNetAt = now(); });
    global.addEventListener('offline', function(){ lastNetAt = now(); });
  }catch(e){}

  var NOOP_ATTEMPT = { req: function(){ return null; }, bad: noop, ok: noop, fail: noop, abandon: noop };
  global.FetchLog = {
    init: init,
    attempt: function(action){ try{ return attempt(action); }catch(e){ return NOOP_ATTEMPT; } },
    flush: flush,
    NOOP: NOOP_ATTEMPT,
    _peek: function(){ return readQ(); }   // テスト用
  };
})(window);
