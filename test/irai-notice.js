// ============================================================
// 店舗依頼ボードのアラート（配達商品情報 haitatsu.html ／ 日報 index.html で共用）
// ------------------------------------------------------------
// データは GAS getHaitatsu の応答の irai（{today, items:[...], total}）。サーバは
// 「削除済みでなく未完了のものすべて」を出荷対応日の近い順に最大50件返す（total は切る前の件数）。
// 期限切れかどうか・残り日数は、ここで端末の今日を基準に判定する（キャッシュが日付をまたいだときのため）。
//   ・依頼を登録した時点から、完了を押すまで出す（出荷対応日が先でも出す）
//   ・出荷対応日を過ぎて未完了のものは「期限切れ・未完了」として赤で出す（色の段階は level() を参照）
//   ・50件を超えたら、帯の件数は total で出し、小窓に「ほか◯件は依頼ボードで」と添える
// 帯は #app の直前に差し込む（配達商品情報・日報の既存の帯と同じ作法）。押すと小窓に内容を出し、
// そこから依頼ボード（irai.html#id=…）の該当行へ飛べる。
// ============================================================
(function(global){
  var WD = ['日','月','火','水','木','金','土'];

  function ymd(d){ return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); }
  function parse(ds){ var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ds||'')); return m ? new Date(+m[1], +m[2]-1, +m[3]) : null; }
  // b − a の日数
  function diff(a, b){ var x=parse(a), y=parse(b); return (x&&y) ? Math.round((y-x)/86400000) : NaN; }
  function md(ds){ var d=parse(ds); return d ? (d.getMonth()+1)+'/'+d.getDate()+'('+WD[d.getDay()]+')' : String(ds||''); }
  function shortStore(name){ return String(name||'').replace(/^ヤオコー/,'').replace(/店$/,'') || 'その他'; }
  function eH(s){ return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function eA(s){ return eH(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

  // 残り日数の表示（あと◯日／明日／今日／期限切れ）
  function dueLabel(shukka, today){
    var n = diff(today, shukka);
    if(isNaN(n)) return '';
    if(n < 0) return '期限切れ（'+(-n)+'日過ぎ）';
    if(n === 0) return '今日';
    if(n === 1) return '明日';
    return 'あと'+n+'日';
  }

  // 色の段階（2026-10-03 杉さん指定。青は使わない）
  //   calm  ：期限まで余裕がある（2日以上先）… 薄いオレンジの背景＋濃いオレンジの文字・枠
  //   urgent：出荷対応日が今日・明日       … 濃いオレンジの塗り＋白文字
  //   late  ：期限切れ・未完了             … 赤
  // 複数件をまとめるときは、含まれる中で一番強い段階にする（late > urgent > calm）
  var LEVELS = ['calm', 'urgent', 'late'];
  var COLORS = {
    calm:   { bg:'#fff3e0', fg:'#a84a00', bd:'#e07b00' },
    urgent: { bg:'#c94c00', fg:'#fff',    bd:'#c94c00' },
    late:   { bg:'#fdecea', fg:'#b71c1c', bd:'#ef9a9a' }
  };
  function level(shukka, today){
    var n = diff(today, shukka);
    return n < 0 ? 'late' : n <= 1 ? 'urgent' : 'calm';
  }
  function maxLevel(list, today){
    var m = 0;
    (list||[]).forEach(function(it){ m = Math.max(m, LEVELS.indexOf(level(it.shukkaDate, today))); });
    return LEVELS[m];
  }

  // 表示する依頼（未完了・削除済みでない）を、出荷対応日の近い順に返す。storeId を渡すとその店舗だけ。
  function visible(items, today, storeId){
    return (items||[]).filter(function(it){
      if(!it || it.deleted || it.status === '完了' || !it.shukkaDate) return false;
      if(storeId && it.storeId !== storeId) return false;
      return !isNaN(diff(today || ymd(new Date()), it.shukkaDate));
    }).sort(function(a,b){ return a.shukkaDate < b.shukkaDate ? -1 : a.shukkaDate > b.shukkaDate ? 1 : 0; });
  }

  // 帯の文言。1件なら「📋 10/6(火) みどりが丘 出荷対応あり（あと3日）›」、
  // 複数なら「📋 出荷対応あり 3件（最短 10/6）›」（期限切れがあれば「（期限切れ・未完了 1件）」）。
  // count は上限で切る前の件数（省略時は list の件数）
  function barText(list, today, count){
    var n = count > list.length ? count : list.length;
    var late = list.filter(function(it){ return diff(today, it.shukkaDate) < 0; }).length;
    if(n === 1){
      var it = list[0];
      return '📋 '+md(it.shukkaDate)+' '+shortStore(it.storeName)
        +(late ? ' 期限切れ・未完了' : ' 出荷対応あり（'+dueLabel(it.shukkaDate, today)+'）')+' ›';
    }
    var d = parse(list[0].shukkaDate);
    return '📋 出荷対応あり '+n+'件'
      +(late ? '（期限切れ・未完了 '+late+'件）' : '（最短 '+(d.getMonth()+1)+'/'+d.getDate()+'）')+' ›';
  }

  var _last = { list: [], today: '', opts: {}, more: 0 };

  // el の id を持つ帯を #app の直前に出す／消す。opts: {id, storeId, boardUrl, onNavigate(href), margin}
  function render(irai, opts){
    opts = opts || {};
    var id = opts.id || 'irai_notice';
    var today = ymd(new Date());
    var list = (opts.hide || !irai) ? [] : visible(irai.items, today, opts.storeId);
    // 上限（50件）で切られたとき：全店なら切られた件数を足して出す。店舗を絞ったときは件数が分からないので小窓で知らせる
    var cut = irai && irai.total > (irai.items||[]).length;
    var more = (cut && !opts.storeId) ? irai.total - irai.items.length : 0;
    var el = document.getElementById(id);
    _last = { list: list, today: today, opts: opts, more: more, cut: !!cut };
    if(!list.length){ if(el && el.parentNode) el.parentNode.removeChild(el); return 0; }
    if(!el){
      el = document.createElement('button');
      el.type = 'button';
      el.id = id;
      el.className = 'irai-notice';
      var app = document.getElementById('app');
      if(app && app.parentNode) app.parentNode.insertBefore(el, app);
    }
    var lv = maxLevel(list, today), c = COLORS[lv];
    el.setAttribute('data-level', lv);
    el.style.cssText = 'display:block;width:calc(100% - 32px);margin:8px 16px 0;padding:9px 12px;border-radius:8px;'
      + 'font-family:inherit;font-size:13px;font-weight:700;text-align:left;cursor:pointer;line-height:1.5;'
      + 'background:'+c.bg+';color:'+c.fg+';border:1.5px solid '+c.bd+';';
    el.textContent = barText(list, today, list.length + more);
    el.onclick = function(){ openPopup(); };
    return list.length;
  }

  function openPopup(){
    var list = _last.list, today = _last.today, opts = _last.opts || {};
    if(!list.length) return;
    var board = opts.boardUrl || 'irai.html';
    var ov = document.createElement('div');
    ov.className = 'irai-pop-ov';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:1000;padding:16px';
    var h = '<div class="irai-pop" style="background:#fff;border-radius:14px;padding:16px;width:100%;max-width:400px;max-height:80vh;overflow:auto;box-shadow:0 8px 24px rgba(0,0,0,.25);font-family:inherit">'
      + '<div style="font-size:15px;font-weight:700;margin-bottom:10px">📋 店舗からの依頼（出荷対応）</div>';
    list.forEach(function(it){
      var lv = level(it.shukkaDate, today), late = lv === 'late', c = COLORS[lv];
      var href = board + '#id=' + encodeURIComponent(it.id);
      h += '<div class="irai-pop-item" style="border:1px solid '+(late?'#ef9a9a':'#e5e1d8')+';background:'+(late?'#fff6f5':'#fff')+';border-radius:10px;padding:10px 12px;margin-bottom:8px">'
        + '<div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">'
        + '<b style="font-size:15px">'+eH(md(it.shukkaDate))+'</b>'
        + '<span style="font-size:14px;font-weight:700">'+eH(shortStore(it.storeName))+'</span>'
        + '<span class="irai-pop-due" data-level="'+lv+'" style="margin-left:auto;font-size:12px;font-weight:700;border-radius:4px;padding:1px 6px;background:'+c.bg+';color:'+c.fg+';border:1px solid '+c.bd+'">'+eH(late ? '期限切れ・未完了' : dueLabel(it.shukkaDate, today))+'</span>'
        + '</div>'
        + '<div style="font-size:14px;line-height:1.6;white-space:pre-wrap;word-break:break-word;margin-top:6px">'+eH(it.content)+'</div>'
        + '<div style="font-size:11px;color:#6c6c70;margin-top:4px">依頼 '+eH(md(it.iraiDate))+(it.staff?'・'+eH(it.staff):'')+'</div>'
        + '<a class="irai-pop-go" href="'+eA(href)+'" style="display:inline-block;margin-top:6px;font-size:13px;font-weight:700;color:#a84a00;text-decoration:none">依頼ボードで開く ›</a>'
        + '</div>';
    });
    if(_last.cut){
      h += '<div class="irai-pop-more" style="font-size:12px;color:#6c6c70;margin:2px 0 10px">'
        + (_last.more ? 'ほか '+_last.more+'件は' : '依頼が多いため、出荷対応日の遠いものは') + '依頼ボードで確認してください。'
        + ' <a class="irai-pop-go" href="'+eA(board)+'" style="font-weight:700;color:#a84a00;text-decoration:none">依頼ボードを開く ›</a></div>';
    }
    h += '<button type="button" class="irai-pop-close" style="width:100%;height:44px;border:none;border-radius:8px;background:#eee;color:#555;font-family:inherit;font-size:15px;font-weight:700;cursor:pointer">閉じる</button></div>';
    ov.innerHTML = h;
    document.body.appendChild(ov);
    function close(){ if(ov.parentNode) ov.parentNode.removeChild(ov); }
    ov.querySelector('.irai-pop-close').onclick = close;
    ov.addEventListener('click', function(e){ if(e.target === ov) close(); });
    if(opts.onNavigate){
      var as = ov.querySelectorAll('.irai-pop-go');
      for(var i=0;i<as.length;i++){
        as[i].addEventListener('click', function(e){ e.preventDefault(); close(); opts.onNavigate(this.getAttribute('href')); });
      }
    }
  }

  global.IraiNotice = { render: render, visible: visible, barText: barText, dueLabel: dueLabel, md: md, shortStore: shortStore, diff: diff, ymd: ymd,
                        level: level, maxLevel: maxLevel };
})(window);
