// ============================================================
// 送信・保存ボタンを押したのに、サーバに届いたか確かめられないものの扱い（2026-10-06 杉さん要望）
// ------------------------------------------------------------
// 日報・配達商品情報・袋出し記録・店舗依頼ボードで共通。サマリーは保存が無いので使わない。
//   ・下書き（ボタンを押していない入力）は端末に残さない。アプリを消したら破棄
//   ・ボタンを押したものは端末に残し、画面には何も出さずに裏で自動で送り直す（届いたら端末から消す）
//   ・何度送っても届かないときだけ、目立たない一行（例「10/6 長瀬店の日報がサーバに届いていません」）を出す
// 設定はこのファイルの上の3つだけ。読み込めなかった端末では「送り直す・一行は出さない」で動く（各画面の既定）。
// 【2026-10-06 追補】照合（届いたかの確認）が GAS の不調で失敗しても「届いていない」とは数えない。
//   保存送信ログ（9/30〜10/6）では、押したものは日報101件・配達商品情報98件・店舗依頼6件のすべてが
//   最初の1回でサーバに届いていた。照合や応答が返らないことを「未着」とみなすと誤判定になる。
//   ・回数（AFTER_TRIES）は「照合でサーバに無いと確定した回数」だけを数える（照合の失敗・応答なしは数えない）
//   ・24時間（AFTER_MS）は、この画面を開いてから照合を1回以上終えたものだけに使う
//     （閉じていた間に24時間たっても、開いた直後の照合の前には出さない）
//   ・再送と照合が動くのはアプリを開いている間だけ（起動時・前面に戻ったとき・電波が戻ったとき・開いている間は数分おき）
// ============================================================
var Unsent = (function(){
  // ★ 一行を出すか（杉さんの最終判断待ち。初期値：出す）。出さないなら false
  var SHOW = true;
  // ★ 押したものを端末に残して裏で送り直すか。「全部捨ててよい」なら false
  //   （false にすると、各画面は起動時に残っている分を消し、送り直さない。押したその場の送信・確認は従来どおり）
  var RESEND = true;
  // ★ 一行を出す条件：最初に押してから24時間たっても、または照合で「サーバに無い」と5回確定しても、
  //   届いたと確認できない（どちらか早いほう）。
  //   サーバが受け付けなかった（入力の不正など。送り直しても変わらない）ものはすぐ出す
  var AFTER_MS    = 24 * 3600 * 1000;
  var AFTER_TRIES = 5;
  // 端末に残しておく上限。これを過ぎたものは送り直さずに消す（一行も消える）
  var KEEP_MS     = 7 * 24 * 3600 * 1000;

  // firstAt：最初に押した時刻(ms)／misses：照合でサーバに無いと確定した回数（照合の失敗は含めない）
  // stuck：サーバが受け付けなかった／seen：この画面を開いてから照合（または送り直し）を1回以上終えた
  function due(firstAt, misses, stuck, now, seen){
    if(!SHOW) return false;
    if(stuck) return true;
    now = now || Date.now();
    return (!!seen && firstAt > 0 && now - firstAt >= AFTER_MS) || (misses || 0) >= AFTER_TRIES;
  }
  function expired(firstAt, now){
    return firstAt > 0 && (now || Date.now()) - firstAt >= KEEP_MS;
  }
  // 'M/D'。ms でも 'YYYY-MM-DD' でもよい
  function md(v){
    if(typeof v === 'number'){ var d = new Date(v); return (d.getMonth()+1) + '/' + d.getDate(); }
    var m = /^\d{4}-(\d{2})-(\d{2})/.exec(String(v || ''));
    return m ? (parseInt(m[1],10) + '/' + parseInt(m[2],10)) : String(v || '');
  }
  function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  // #app の直前に出す（無ければ消す）。lines は文字列の配列
  function render(lines){
    var el = document.getElementById('unsent_line');
    if(!SHOW || !lines || !lines.length){
      if(el && el.parentNode) el.parentNode.removeChild(el);
      return;
    }
    if(!el){
      el = document.createElement('div');
      el.id = 'unsent_line';
      el.style.cssText = 'margin:0 16px 6px;font-size:11px;color:#8a8f98;text-align:center;line-height:1.6';
      var app = document.getElementById('app');
      if(app && app.parentNode) app.parentNode.insertBefore(el, app);
    }
    el.innerHTML = lines.map(function(s){ return '<div>' + esc(s) + '</div>'; }).join('');
  }
  return { SHOW: SHOW, RESEND: RESEND, AFTER_MS: AFTER_MS, AFTER_TRIES: AFTER_TRIES, KEEP_MS: KEEP_MS,
           due: due, expired: expired, md: md, render: render };
})();
