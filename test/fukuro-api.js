/*
 * 袋詰めアプリの通信部品（fukurozume.html・fukurozume-kanri.html が使う）
 *
 * - 窓口は nippo-api（Cloud Run）。袋詰めには GAS の経路が無いので送り直し先は無い
 * - 従業員（'fukuro'）はパスコードなし（杉さん決定 2026-10-13）。トークンを付けず、端末の印 deviceId を params に付ける
 *     端末の印 fukuro_api_device（初回に作る）
 * - 管理（'fukuroAdmin'）はパスコード → トークン。日報（nippo_api_token）とは別のキー fukuro_admin_token・fukuro_admin_device
 *     /test/ のページでは末尾に _test（nippo-api.js と同じ流儀）
 * - 401（code:auth）ならトークンを消して kind:'auth' を返す。管理画面はパスコード入力に戻す
 *
 * 使い方：
 *   var api = FukuroApi.create('fukuro');          // 管理画面は 'fukuroAdmin'
 *   api.login(passcode).then(function (r) { r.kind === 'ok' … });   // 管理画面だけ
 *   api.call('fukuroNames', {}).then(function (r) { r.kind・r.status・r.body });
 * kind：'ok'（200 で success:true）／'fail'（200 で success:false）／'auth'（トークン無効）／
 *       'bad_passcode'／'rate_limited'／'not_ready'（501・503 auth_disabled）／'bad_request'／
 *       'retry'（503・500：同じ内容で送り直す）／'net'（通信できない・時間切れ）／'http'（その他）
 */
var FUKURO_API_BASE = { prod: 'https://nippo-api-test-77718048938.asia-northeast1.run.app' /* 袋詰めテスト用：本番 URL の代わりにテストの窓口 */,
                        test: 'https://nippo-api-test-77718048938.asia-northeast1.run.app' };

(function (global) {
  'use strict';
  // 手元の試験（Playwright）だけが使う差し替え口。読み込む前に window.FUKURO_API_OVERRIDE = {base:'http://…'} を置く
  var ov = global.FUKURO_API_OVERRIDE;
  var READ_TIMEOUT_MS = 15000, FIRST_TEST_TIMEOUT_MS = 35000;   // テストの窓口は常駐でないので最初の1回だけ長く待つ

  function isTest() {
    try { return String(global.location && global.location.pathname || '').indexOf('/test/') > -1; } catch (e) { return false; }
  }
  function lsKey(base) { return isTest() ? base + '_test' : base; }
  function lsGet(k) { try { return global.localStorage.getItem(lsKey(k)); } catch (e) { return null; } }
  function lsSet(k, v) { try { if (v == null) global.localStorage.removeItem(lsKey(k)); else global.localStorage.setItem(lsKey(k), v); } catch (e) {} }
  function base() {
    if (ov && ov.base) return ov.base;
    return FUKURO_API_BASE[isTest() ? 'test' : 'prod'];
  }

  var firstDone = false;
  function post(body, timeoutMs) {
    var ms = timeoutMs || (isTest() && !firstDone ? FIRST_TEST_TIMEOUT_MS : READ_TIMEOUT_MS);
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    return new Promise(function (resolve) {
      var finished = false;
      var t = setTimeout(function () {
        if (finished) return; finished = true;
        try { if (ctrl) ctrl.abort(); } catch (e) {}
        resolve({ status: 0, body: null });
      }, ms);
      // text/plain の POST は「単純リクエスト」なので CORS の事前確認（OPTIONS）が要らない
      global.fetch(base().replace(/\/$/, '') + '/api', {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify(body),
        signal: ctrl ? ctrl.signal : undefined, credentials: 'omit', cache: 'no-store'
      }).then(function (r) {
        return r.json().catch(function () { return null; }).then(function (b) { return { status: r.status, body: b }; });
      }).then(function (res) {
        if (finished) return; finished = true; clearTimeout(t); firstDone = true;
        resolve(res);
      }, function () {
        if (finished) return; finished = true; clearTimeout(t);
        resolve({ status: 0, body: null });
      });
    });
  }

  function kindOf(status, b) {
    var code = b && b.code;
    if (status === 200) return (b && b.success) ? 'ok' : 'fail';
    if (status === 0) return 'net';
    if (status === 401) return code === 'bad_passcode' ? 'bad_passcode' : 'auth';
    if (status === 429) return 'rate_limited';
    if (status === 501 || code === 'auth_disabled') return 'not_ready';
    if (status === 400 || status === 413) return 'bad_request';
    if (status === 503 || status === 500) return 'retry';
    return 'http';
  }

  function create(realm) {
    var open = realm !== 'fukuroAdmin';
    var pre = open ? 'fukuro_api_' : 'fukuro_admin_';
    var TOKEN = pre + 'token', DEVICE = pre + 'device';
    function deviceId() {
      var d = lsGet(DEVICE);
      if (!d) { d = 'f-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8); lsSet(DEVICE, d); }
      return d;
    }
    function result(res) {
      var k = kindOf(res.status, res.body);
      if (k === 'auth') lsSet(TOKEN, null);
      return { kind: k, status: res.status, body: res.body || {} };
    }
    return {
      hasToken: function () { return open || !!lsGet(TOKEN); },
      clearToken: function () { lsSet(TOKEN, null); },
      login: function (passcode, timeoutMs) {
        var p = { realm: realm, passcode: String(passcode || '') };
        var dev = lsGet(DEVICE); if (dev) p.deviceId = dev;
        return post({ action: 'login', params: p }, timeoutMs).then(function (res) {
          var r = result(res);
          if (r.kind === 'auth') r.kind = 'http';   // login の 401 は bad_passcode だけのはず
          if (r.kind === 'ok' && r.body.token) {
            lsSet(TOKEN, r.body.token);
            if (r.body.deviceId) lsSet(DEVICE, r.body.deviceId);
          } else if (r.kind === 'ok') { r.kind = 'http'; }
          return r;
        });
      },
      call: function (action, params, timeoutMs) {
        if (open) {
          return post({ action: action, params: Object.assign({ deviceId: deviceId() }, params || {}) }, timeoutMs).then(result);
        }
        var tok = lsGet(TOKEN);
        if (!tok) return Promise.resolve({ kind: 'auth', status: 401, body: {} });
        return post({ action: action, params: params || {}, token: tok }, timeoutMs).then(result);
      }
    };
  }

  global.FukuroApi = { create: create, isTest: isTest };
})(typeof window !== 'undefined' ? window : this);
