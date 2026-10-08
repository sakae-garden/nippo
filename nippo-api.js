// 日報系の画面から API を呼ぶ共通部品（GAS → Cloud Run 移行用）。
// 設計：C:\sakae-garden\_backup\20261006_gas移行設計\design.md §3.1
//
// ■ 切り替え表（この1か所で action ごとに経路を選ぶ）
//   'gas'    … 今のまま GAS（JSONP）だけ
//   'shadow' … GAS の結果で画面を動かしつつ、裏で Cloud Run も呼んで結果を比べる（画面の動きは 'gas' と同じ）
//   'run'    … Cloud Run を先に呼び、通信エラー・時間切れ・5xx・401・429・501 なら同じ URL（同じ reqId）で GAS へ送り直す
// 戻すときは下の 'run' を 'gas' にして配信する（2026-10-09 段階1の読み取りを run に切り替え）。
var NIPPO_API_MODE = {
  // 読み取り（段階1）：日報・配達商品情報
  getHaitatsu: 'run',
  getStoreData: 'run',
  getSubmitStatus: 'run',
  getYaokoZaiko: 'run',
  getLabelIssuedTotal: 'run',
  // 読み取り（段階1に前倒し）：サマリー
  getAllData: 'run',
  getDayData: 'run',
  getEsmarcheStatus: 'run',
  // 書き込み（段階2）
  submit: 'gas',
  saveHaitatsu: 'gas',
  issueLabel: 'gas',
  logFetch: 'gas'
};
// Cloud Run の URL。空なら全部 GAS（/test/ の画面はテスト用の窓口が無いので GAS のまま）
var NIPPO_API_BASE = { prod: 'https://nippo-api-77718048938.asia-northeast1.run.app', test: '' };

(function (global) {
  'use strict';
  // 手元の試験（Playwright）だけが使う差し替え口。読み込む前に window.NIPPO_API_OVERRIDE = {mode:{…}, base:{…}} を置く
  var ov = global.NIPPO_API_OVERRIDE;
  if (ov && typeof ov === 'object') {
    if (ov.mode) for (var mk in ov.mode) NIPPO_API_MODE[mk] = ov.mode[mk];
    if (ov.base) for (var bk in ov.base) NIPPO_API_BASE[bk] = ov.base[bk];
  }
  var WRITE = { submit: 1, saveHaitatsu: 1, issueLabel: 1, logFetch: 1, saveFukurodashi: 1, bulkSaveFukurodashi: 1,
                saveIrai: 1, setIraiStatus: 1, saveConfig: 1 };
  var READ_TIMEOUT_MS = 6000, WRITE_TIMEOUT_MS = 8000;
  // 読み取りは Cloud Run が READ_HEDGE_MS 応答しなければ同じ要求を GAS にも出し、先に返ったほうを使う
  // （Cloud Run の要求は READ_TIMEOUT_MS まで生かしておく。遅いだけで正しい応答を捨てない）
  var READ_HEDGE_MS = 2000;
  var FORCE_GAS_KEY = 'nippo_api_force_gas';   // 端末ごとの非常口：'1' なら切り替え表に関係なく全部 GAS

  function isTest() {
    try { return String(global.location && global.location.pathname || '').indexOf('/test/') > -1; } catch (e) { return false; }
  }
  function lsKey(base) { return isTest() ? base + '_test' : base; }   // 本番とテストは同じオリジンなので分ける
  var TOKEN_KEY = 'nippo_api_token';
  function lsGet(k) { try { return global.localStorage.getItem(lsKey(k)); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) global.localStorage.removeItem(lsKey(k)); else global.localStorage.setItem(lsKey(k), v); } catch (e) {} }

  function base() { return (NIPPO_API_BASE && NIPPO_API_BASE[isTest() ? 'test' : 'prod']) || ''; }

  // GAS の URL（?action=…&…&_cb=…）から action と params を取り出す。callback・_cb は除く
  function parseUrl(url) {
    var q = url.indexOf('?') > -1 ? url.slice(url.indexOf('?') + 1) : '';
    var params = {}, action = '';
    q.split('&').forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf('='), k = i > -1 ? kv.slice(0, i) : kv, v = i > -1 ? kv.slice(i + 1) : '';
      try { k = decodeURIComponent(k.replace(/\+/g, ' ')); v = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e) {}
      if (k === 'action') action = v;
      else if (k !== 'callback' && k !== '_cb') params[k] = v;
    });
    return { action: action || 'getAllData', params: params };
  }

  function modeOf(action) {
    if (lsGet(FORCE_GAS_KEY) === '1' || !base()) return 'gas';
    var m = NIPPO_API_MODE[action];
    return m === 'run' || m === 'shadow' ? m : 'gas';
  }

  // Cloud Run への1本。done(kind, status, body)：kind は ok／http／network／timeout／parse
  function runFetch(action, params, timeoutMs, done) {
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var finished = false;
    var t = setTimeout(function () {
      if (finished) return; finished = true;
      try { if (ctrl) ctrl.abort(); } catch (e) {}
      done('timeout', 0, null);
    }, timeoutMs);
    var body = JSON.stringify({ action: action, params: params, token: lsGet(TOKEN_KEY) || undefined });
    // text/plain の POST は「単純リクエスト」なので CORS の事前確認（OPTIONS）が要らない
    global.fetch(base().replace(/\/$/, '') + '/api', {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: body,
      signal: ctrl ? ctrl.signal : undefined, credentials: 'omit', cache: 'no-store'
    }).then(function (r) {
      return r.text().then(function (txt) {
        if (finished) return; finished = true; clearTimeout(t);
        var j = null;
        try { j = JSON.parse(txt); } catch (e) { return done('parse', r.status, null); }
        done(r.status === 200 ? 'ok' : 'http', r.status, j);
      });
    }).catch(function () {
      if (finished) return; finished = true; clearTimeout(t);
      done('network', 0, null);
    });
  }

  // 比較用：先頭が _ の項目（_cacheSource 等）を除いて並べ替えた JSON
  function canon(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    return '{' + Object.keys(v).filter(function (k) { return k.charAt(0) !== '_'; }).sort().map(function (k) {
      return JSON.stringify(k) + ':' + canon(v[k]);
    }).join(',') + '}';
  }

  var shadowLog = [];
  function recordShadow(rec) {
    shadowLog.push(rec);
    if (shadowLog.length > 50) shadowLog.shift();
    if (typeof NippoApi.onShadow === 'function') { try { NippoApi.onShadow(rec); } catch (e) {} }
  }

  // 本体。gasCall(ok, err) は今の jsonp 呼び出しそのもの（同じ URL＝同じ reqId で送る）
  function route(url, gasCall, onOk, onErr, opts) {
    opts = opts || {};
    var p = parseUrl(url), action = p.action, mode = modeOf(action);
    var settled = false;
    function ok(d) { if (settled) return; settled = true; onOk(d); }
    function err() { if (settled) return; settled = true; if (onErr) onErr(); }
    function viaGas(why) { NippoApi.lastVia[action] = why ? 'gas(' + why + ')' : 'gas'; gasCall(ok, err); }

    if (mode === 'gas') return viaGas('');
    var write = !!WRITE[action];
    if (write && !lsGet(TOKEN_KEY)) return viaGas('no-token');   // トークンの無い端末は今の GAS 経由

    var tmo = opts.runTimeoutMs || (write ? WRITE_TIMEOUT_MS : READ_TIMEOUT_MS);
    if (mode === 'shadow') {
      if (write) return viaGas('');   // 書き込みは影で二重に送らない
      var gasRes, runRes, runKind = '', n = 0, t0 = Date.now(), gasMs = -1, runMs = -1;
      var cmp = function () {
        if (++n < 2) return;
        recordShadow({ action: action, at: t0, same: !!(gasRes && runRes && canon(gasRes) === canon(runRes)),
                       gasOk: !!gasRes, run: runRes ? 'ok' : (runKind || 'fail'), gasMs: gasMs, runMs: runMs });
      };
      gasCall(function (d) { gasRes = d; gasMs = Date.now() - t0; ok(d); cmp(); },
              function () { gasMs = Date.now() - t0; err(); cmp(); });
      runFetch(action, p.params, tmo, function (kind, status, body) {
        runRes = kind === 'ok' ? body : null; runKind = kind === 'http' ? String(status) : kind; runMs = Date.now() - t0; cmp();
      });
      NippoApi.lastVia[action] = 'gas(shadow)';
      return;
    }
    // 'run'
    var gasStarted = false, runDone = false, gasDone = false, hedgeT = null;
    function startGas(why) {
      if (gasStarted || settled) return;
      gasStarted = true; clearTimeout(hedgeT);
      NippoApi.lastVia[action] = 'gas(' + why + ')';
      // GAS が失敗しても、Cloud Run がまだ返っていなければそちらを待つ
      gasCall(function (d) { gasDone = true; NippoApi.lastVia[action] = 'gas(' + why + ')'; ok(d); },
              function () { gasDone = true; if (runDone) err(); });
    }
    if (!write) hedgeT = setTimeout(function () { startGas('hedge'); }, opts.hedgeMs || READ_HEDGE_MS);
    runFetch(action, p.params, tmo, function (kind, status, body) {
      runDone = true; clearTimeout(hedgeT);
      if (kind === 'ok') { if (!settled) NippoApi.lastVia[action] = 'run'; return ok(body); }
      if (kind === 'http' && status === 400 && body) { if (!settled) NippoApi.lastVia[action] = 'run'; return ok(body); }  // 入力の誤りは GAS でも同じ
      if (kind === 'http' && status === 401 && body && body.code === 'auth') lsSet(TOKEN_KEY, null);   // 無効なトークンは消す
      if (!gasStarted) return startGas(kind === 'http' ? String(status) : kind);
      if (gasDone) err();   // 両方だめ
    });
  }

  var NippoApi = {
    lastVia: {},
    shadowLog: shadowLog,
    onShadow: null,
    parseUrl: parseUrl,
    modeOf: modeOf,
    // index・haitatsu・fukurodashi・irai の jsonp(url, base, onOk, onErr, timeoutMs, opts) と同じ引数
    jsonp: function (url, cbBase, onOk, onErr, timeoutMs, opts) {
      route(url, function (ok, err) { global.jsonp(url, cbBase, ok, err, timeoutMs, opts); }, onOk, onErr, opts);
    },
    // summary の jsonp(url, ok, err, opts) と同じ引数
    jsonp4: function (url, onOk, onErr, opts) {
      route(url, function (ok, err) { global.jsonp(url, ok, err, opts); }, onOk, onErr, opts);
    },
    route: route,
    hasToken: function () { return !!lsGet(TOKEN_KEY); },
    // 端末で一度だけパスコードを入れる。cb(ok:boolean, errorCode)
    login: function (passcode, cb) {
      if (!base()) return cb && cb(false, 'no_base');
      var dev = lsGet('nippo_api_device') || undefined;
      runFetch('login', { passcode: String(passcode || ''), deviceId: dev }, 10000, function (kind, status, body) {
        if (kind === 'ok' && body && body.success && body.token) {
          lsSet(TOKEN_KEY, body.token); lsSet('nippo_api_device', body.deviceId);
          return cb && cb(true);
        }
        cb && cb(false, (body && body.code) || kind);
      });
    },
    logout: function () { lsSet(TOKEN_KEY, null); },
    _canon: canon
  };
  global.NippoApi = NippoApi;
})(typeof window !== 'undefined' ? window : this);
