import { escapeHtml, safeJsonForScript } from './relayUtils.ts';
import type { ResolvedRelayConfig } from './relayUtils.ts';

const SHARED_STYLES = `
*{box-sizing:border-box}
body{margin:0;background:#f8fafc;color:#0f172a;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;line-height:1.5}
.top{position:sticky;top:0;z-index:20;background:rgba(255,255,255,.95);border-bottom:1px solid #e2e8f0;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px}
.brand{font-weight:700;font-size:15px;color:#0f172a}
.badge{font-size:11px;font-weight:700;color:#0f766e;background:#f0fdfa;border:1px solid #99f6e4;padding:4px 10px;border-radius:8px;white-space:nowrap}
.wrap{max-width:680px;margin:0 auto;padding:16px;display:flex;flex-direction:column;gap:16px}
.card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:18px}
h1,h2{margin:0;font-size:17px;font-weight:700;color:#0f172a}
.sub{margin:4px 0 0;font-size:13px;color:#475569}
.lbl{display:block;font-size:12px;font-weight:600;color:#475569;margin-bottom:6px}
input,textarea{width:100%;border:1px solid #cbd5e1;border-radius:12px;background:#f8fafc;padding:11px 13px;font-size:14px;color:#0f172a;font-family:inherit}
input.mono,code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
input:focus,textarea:focus{outline:2px solid #0f766e;background:#fff;border-color:#0f766e}
.row{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;padding:0 16px;border-radius:12px;border:1px solid #cbd5e1;background:#fff;color:#0f172a;font-size:13px;font-weight:700;cursor:pointer;text-decoration:none}
.btn:hover{background:#f1f5f9}
.btn-primary{background:#0f766e;border-color:#0f766e;color:#fff}
.btn-primary:hover{background:#115e59}
.btn-dark{background:#0f172a;border-color:#0f172a;color:#fff}
.btn-dark:hover{background:#1e293b}
.btn-danger{background:#fff;border-color:#fecaca;color:#b91c1c}
.chip{min-height:38px;padding:0 12px;border-radius:10px;border:1px solid #cbd5e1;background:#f8fafc;font-size:12px;font-weight:700;color:#0f172a;cursor:pointer;font-family:ui-monospace,monospace}
.chip.active{background:#0f172a;color:#fff;border-color:#0f172a}
.status{margin-top:10px;font-size:13px;font-weight:600;color:#0f766e}
.err{margin-top:10px;font-size:13px;font-weight:600;color:#b91c1c}
.result-box{margin-top:10px;border:1px solid #99f6e4;background:#f0fdfa;border-radius:12px;padding:14px;font-size:13px}
.result-pre{margin:8px 0 0;white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,monospace;font-size:13px;color:#0f172a}
.hidden{display:none!important}
.shot-img{margin-top:10px;max-height:240px;width:100%;object-fit:contain;border-radius:10px;border:1px solid #e2e8f0;background:#fff}
`;

export function buildStandaloneApp1Html(
  relay: ResolvedRelayConfig,
  tinyInstallUrl: string
): string {
  const safeTitle = escapeHtml('App 1 Controller — TinyConnect (>20km)');
  const relayJson = safeJsonForScript(relay);
  const tinyUrlJson = safeJsonForScript(tinyInstallUrl);

  return `<!doctype html>
<html lang="am">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${safeTitle}</title>
<style>${SHARED_STYLES}</style>
</head>
<body>
<header class="top">
  <div class="brand">App 1 Controller (አዛዥ)</div>
  <div class="badge" id="connBadge">Cloud Relay Active</div>
</header>

<main class="wrap">
  <section class="card">
    <h1>ቋሚ የርቀት Relay URL (>20km · 24/7)</h1>
    <p class="sub">ይህ App 1 ያለ AI Studio Preview በቀጥታ ከስልክዎ ከ Tiny (App 2) ጋር ይገናኛል።</p>
    <div style="margin-top:12px">
      <label class="lbl" for="relayInput">Relay URL (ntfy.sh / Firebase / JSONBlob)</label>
      <input id="relayInput" class="mono" type="url" />
    </div>
    <div class="row">
      <button type="button" class="btn" id="applyRelayBtn">URL አዘምን</button>
      <button type="button" class="btn" id="copyTinyBtn">የ Tiny (App 2) Install Link ቅዳ</button>
    </div>
    <div id="relayMsg" class="status hidden"></div>
  </section>

  <section class="card">
    <h2>1. USSD ኮድ በርቀት ላክ (ለምሳሌ *804#)</h2>
    <p class="sub">እዚህ ሲልኩ 20km+ ርቀት ላይ ያለው Tiny (App 2) ፈቃድ ጠይቆ ኮዱን ያስጀምራል፣ ውጤቱንም ወደዚህ ይመልሳል።</p>
    <div class="row" style="margin-top:12px">
      <button type="button" class="chip" data-ussd="*804#">*804#</button>
      <button type="button" class="chip" data-ussd="*111#">*111#</button>
      <button type="button" class="chip" data-ussd="*805#">*805#</button>
      <button type="button" class="chip" data-ussd="*999#">*999#</button>
    </div>
    <div style="margin-top:10px">
      <input id="ussdInput" class="mono" type="text" value="*804#" placeholder="*804#" />
    </div>
    <div class="row">
      <button type="button" class="btn btn-primary" id="sendUssdBtn" style="flex:1">USSD ትዕዛዝ ወደ Tiny ላክ (*804#)</button>
    </div>
    <div id="ussdMsg" class="status hidden"></div>
  </section>

  <section class="card">
    <h2>2. የጽሁፍ ማስታወሻ እና Screenshot ትዕዛዝ</h2>
    <p class="sub">ከ App 1 ጽሁፍ መላክ፣ ማረም፣ ማጽዳት ወይም የስክሪን ፎቶ መጠየቅ።</p>
    <div class="row" id="actionTabs">
      <button type="button" class="chip active" data-act="edit">edit</button>
      <button type="button" class="chip" data-act="append">append</button>
      <button type="button" class="chip" data-act="replace">replace</button>
      <button type="button" class="chip" data-act="clear">clear</button>
      <button type="button" class="chip" data-act="screenshot">screenshot</button>
      <button type="button" class="chip" data-act="cast">cast</button>
      <button type="button" class="chip" data-act="stop">stop</button>
    </div>
    <div style="margin-top:10px">
      <textarea id="noteInput" rows="3" placeholder="ወደ Tiny የሚላክ ጽሁፍ..."></textarea>
    </div>
    <div class="row">
      <button type="button" class="btn btn-dark" id="sendNoteBtn" style="flex:1">ትዕዛዝ ወደ Tiny ላክ</button>
      <button type="button" class="btn btn-danger hidden" id="quickStopCastBtn">ካስት አቁም (Stop)</button>
    </div>
    <div id="noteMsg" class="status hidden"></div>
  </section>

  <section class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
      <h2>3. ከ Tiny (App 2) የደረሰ ውጤት / መልስ</h2>
      <button type="button" class="btn" id="refreshResBtn" style="min-height:36px;padding:0 12px;font-size:12px">አድስ</button>
    </div>
    <div id="resultEmpty" class="sub" style="margin-top:10px">ገና ከ Tiny መልስ አልደረሰም — ትዕዛዝ ሲላክና Tiny ሲመልስ እዚህ በቀጥታ ይታያል።</div>
    <div id="resultBox" class="result-box hidden">
      <div style="display:flex;justify-content:space-between;gap:8px;font-weight:700">
        <span id="resStatus">status: ok</span>
        <span id="resTime" style="font-weight:500;color:#475569"></span>
      </div>
      <pre id="resText" class="result-pre"></pre>
      <img id="resImg" class="shot-img hidden" alt="Returned screenshot" />
      <div class="row">
        <button type="button" class="btn" id="copyResBtn" style="min-height:36px;font-size:12px">ውጤቱን ቅዳ</button>
      </div>
    </div>
  </section>
</main>

<script>
(function(){
  var INITIAL_RELAY = ${relayJson};
  var TINY_URL = ${tinyUrlJson};
  var currentRelay = INITIAL_RELAY;
  var activeAction = 'edit';
  var sse = null;
  var lastResId = '';

  function safeSetStorage(k, v){ try{ localStorage.setItem(k, v); }catch(e){} }
  function safeGetStorage(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }

  function parseRelay(raw){
    if(!raw) return null;
    try{
      var u = new URL(raw.trim());
      if(u.protocol !== 'https:' || u.username || u.password) return null;
      var h = u.hostname.toLowerCase();
      if(h === 'localhost' || h === '127.0.0.1' || h === '0.0.0.0' || h.indexOf('10.') === 0 || h.indexOf('192.168.') === 0) return null;
      if(h === 'ntfy.sh' || h.slice(-8) === '.ntfy.sh'){
        var seg = u.pathname.split('/').filter(Boolean)[0] || '';
        seg = seg.replace(/-(cmd|res)$/i, '').replace(/[^a-zA-Z0-9_-]/g, '');
        if(seg.length < 6) return null;
        var base = 'https://' + h + '/' + seg;
        return {
          kind:'ntfy', displayUrl:base,
          cmdPostUrl:base+'-cmd', cmdPollUrl:base+'-cmd/json?poll=1&since=30m', cmdSseUrl:base+'-cmd/sse?since=30m',
          resPostUrl:base+'-res', resPollUrl:base+'-res/json?poll=1&since=30m', resSseUrl:base+'-res/sse?since=30m'
        };
      }
      if(h.slice(-15) === '.firebaseio.com' || h.slice(-21) === '.firebasedatabase.app'){
        var cp = u.pathname.replace(/\\.json$/i,'').replace(/\\/+$/,'') || '/tinyconnect';
        var fb = 'https://' + h + cp;
        return {
          kind:'firebase', displayUrl:fb,
          cmdPostUrl:fb+'/command.json', cmdPollUrl:fb+'/command.json', cmdSseUrl:fb+'/command.json',
          resPostUrl:fb+'/result.json', resPollUrl:fb+'/result.json', resSseUrl:fb+'/result.json'
        };
      }
      if((h === 'jsonblob.com' || h === 'www.jsonblob.com') && /^\\/api\\/jsonBlob\\/[a-zA-Z0-9_-]{8,80}$/.test(u.pathname)){
        var jb = 'https://' + h + u.pathname;
        return {
          kind:'jsonblob', displayUrl:jb,
          cmdPostUrl:jb, cmdPollUrl:jb, cmdSseUrl:jb,
          resPostUrl:jb, resPollUrl:jb, resSseUrl:jb
        };
      }
    }catch(e){}
    return null;
  }

  var relayInput = document.getElementById('relayInput');
  var saved = safeGetStorage('app1_downloaded_relay');
  if(saved){
    var parsedSaved = parseRelay(saved);
    if(parsedSaved) currentRelay = parsedSaved;
  }
  relayInput.value = currentRelay.displayUrl;

  function showMsg(elId, msg, isErr){
    var el = document.getElementById(elId);
    el.textContent = msg;
    el.className = isErr ? 'err' : 'status';
    setTimeout(function(){ el.classList.add('hidden'); }, 3500);
  }

  function renderResult(res){
    if(!res || !res.status) return;
    if(res.id && res.id === lastResId) return;
    if(res.id) lastResId = res.id;
    document.getElementById('resultEmpty').classList.add('hidden');
    var box = document.getElementById('resultBox');
    box.classList.remove('hidden');
    document.getElementById('resStatus').textContent = 'ሁኔታ (Status): ' + res.status;
    var t = res.ts || res.createdAt;
    document.getElementById('resTime').textContent = t ? new Date(t).toLocaleTimeString() : '';
    document.getElementById('resText').textContent = res.text || '(ባዶ መልስ)';
    var stopBtn = document.getElementById('quickStopCastBtn');
    if(res.status === 'cast-live'){ stopBtn.classList.remove('hidden'); }
    else { stopBtn.classList.add('hidden'); }
    var img = document.getElementById('resImg');
    if(res.screenshotUrl){
      img.src = res.screenshotUrl;
      img.classList.remove('hidden');
    } else {
      img.classList.add('hidden');
    }
  }

  function sendCommand(action, text, code, feedbackElId){
    var id = Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    var payload = { id:id, action:action, text:text || '', ts:Date.now() };
    if(code) payload.code = code;

    var sendPromise;
    if(currentRelay.kind === 'jsonblob'){
      sendPromise = fetch(currentRelay.cmdPollUrl).then(function(r){ return r.ok ? r.json() : {}; }).catch(function(){ return {}; }).then(function(ex){
        var merged = Object.assign({}, ex || {}, { command: payload });
        return fetch(currentRelay.cmdPostUrl, {
          method:'PUT',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify(merged)
        });
      });
    } else {
      var method = currentRelay.kind === 'firebase' ? 'PUT' : 'POST';
      var headers = currentRelay.kind === 'ntfy' ? {} : {'Content-Type':'application/json'};
      sendPromise = fetch(currentRelay.cmdPostUrl, {
        method:method,
        headers:headers,
        body:JSON.stringify(payload)
      });
    }

    sendPromise.then(function(r){
      if(r.ok){
        showMsg(feedbackElId, 'ትዕዛዙ (' + (code || action) + ') በቋሚ Cloud ተልኳል! Tiny ሲመልስ ከታች ይታያል።', false);
      } else {
        showMsg(feedbackElId, 'መላክ አልተቻለም (HTTP ' + r.status + ')', true);
      }
    }).catch(function(){
      showMsg(feedbackElId, 'ኢንተርኔት ወይም Relay URL-ን ያረጋግጡ።', true);
    });
  }

  function pollResults(){
    fetch(currentRelay.resPollUrl).then(function(r){ return r.ok ? r.text() : ''; }).then(function(txt){
      if(!txt) return;
      if(currentRelay.kind === 'ntfy'){
        var lines = txt.trim().split('\\n');
        for(var i=0;i<lines.length;i++){
          var ln = lines[i].trim();
          if(!ln || ln[0] !== '{') continue;
          try{
            var env = JSON.parse(ln);
            if(env.event === 'message' && typeof env.message === 'string' && env.message[0] === '{'){
              var inner = JSON.parse(env.message);
              if(!inner.id && env.id) inner.id = String(env.id);
              renderResult(inner);
            }
          }catch(e){}
        }
      } else {
        try{
          var obj = JSON.parse(txt);
          if(currentRelay.kind === 'jsonblob' && obj && obj.result) renderResult(obj.result);
          else if(currentRelay.kind === 'server' && obj && obj.latestResult) renderResult(obj.latestResult);
          else if(obj && obj.status) renderResult(obj);
        }catch(e){}
      }
    }).catch(function(){});
  }

  function startListening(){
    if(sse){ try{ sse.close(); }catch(e){} sse = null; }
    document.getElementById('connBadge').textContent = currentRelay.kind.toUpperCase() + ' · Active';
    pollResults();
    if(currentRelay.kind === 'ntfy' && typeof EventSource !== 'undefined'){
      sse = new EventSource(currentRelay.resSseUrl);
      sse.onmessage = function(ev){
        try{
          var env = JSON.parse(ev.data);
          if(env.event === 'message' && typeof env.message === 'string' && env.message[0] === '{'){
            var inner = JSON.parse(env.message);
            if(!inner.id && env.id) inner.id = String(env.id);
            renderResult(inner);
          }
        }catch(e){}
      };
    } else if(currentRelay.kind === 'server' && typeof EventSource !== 'undefined'){
      sse = new EventSource(currentRelay.resSseUrl);
      sse.addEventListener('result', function(ev){
        try{ renderResult(JSON.parse(ev.data)); }catch(e){}
      });
      sse.addEventListener('state', function(ev){
        try{ var d = JSON.parse(ev.data); if(d.latestResult) renderResult(d.latestResult); }catch(e){}
      });
    }
  }

  document.querySelectorAll('[data-ussd]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var c = btn.getAttribute('data-ussd');
      document.getElementById('ussdInput').value = c;
      document.getElementById('sendUssdBtn').textContent = 'USSD ትዕዛዝ ወደ Tiny ላክ (' + c + ')';
    });
  });

  document.getElementById('ussdInput').addEventListener('input', function(e){
    var v = e.target.value.trim() || '*804#';
    document.getElementById('sendUssdBtn').textContent = 'USSD ትዕዛዝ ወደ Tiny ላክ (' + v + ')';
  });

  document.getElementById('sendUssdBtn').addEventListener('click', function(){
    var raw = document.getElementById('ussdInput').value.trim();
    if(!/^[0-9*#+]{2,32}$/.test(raw)){
      showMsg('ussdMsg', 'ትክክለኛ USSD ኮድ ያስገቡ (ለምሳሌ *804#)', true);
      return;
    }
    sendCommand('ussd', raw, raw, 'ussdMsg');
  });

  document.querySelectorAll('#actionTabs [data-act]').forEach(function(btn){
    btn.addEventListener('click', function(){
      document.querySelectorAll('#actionTabs [data-act]').forEach(function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
      activeAction = btn.getAttribute('data-act') || 'edit';
    });
  });

  document.getElementById('sendNoteBtn').addEventListener('click', function(){
    var txt = (activeAction === 'clear' || activeAction === 'screenshot' || activeAction === 'cast' || activeAction === 'stop') ? '' : document.getElementById('noteInput').value;
    sendCommand(activeAction, txt, null, 'noteMsg');
  });

  document.getElementById('quickStopCastBtn').addEventListener('click', function(){
    sendCommand('stop', '', null, 'noteMsg');
  });

  document.getElementById('applyRelayBtn').addEventListener('click', function(){
    var p = parseRelay(relayInput.value);
    if(!p){
      showMsg('relayMsg', 'ትክክለኛ https:// ntfy.sh፣ Firebase ወይም jsonblob.com URL ያስገቡ።', true);
      return;
    }
    currentRelay = p;
    safeSetStorage('app1_downloaded_relay', p.displayUrl);
    lastResId = '';
    startListening();
    showMsg('relayMsg', 'Relay URL ተዘምኗል!', false);
  });

  document.getElementById('copyTinyBtn').addEventListener('click', function(){
    var url = TINY_URL;
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(url).then(function(){
        showMsg('relayMsg', 'የ Tiny (App 2) Link ተቀድቷል!', false);
      }).catch(function(){ showMsg('relayMsg', url, false); });
    } else {
      showMsg('relayMsg', url, false);
    }
  });

  document.getElementById('refreshResBtn').addEventListener('click', pollResults);
  document.getElementById('copyResBtn').addEventListener('click', function(){
    var t = document.getElementById('resText').textContent || '';
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(t);
    }
  });

  startListening();
  setInterval(pollResults, 5000);
})();
</script>
</body>
</html>`;
}

export function buildStandaloneTinyHtml(relay: ResolvedRelayConfig, serverOrigin = ''): string {
  const safeTitle = escapeHtml('TinyConnect (App 2) — Offline & >20km Receiver');
  const relayJson = safeJsonForScript(relay);
  const originJson = safeJsonForScript(serverOrigin);

  return `<!doctype html>
<html lang="am">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${safeTitle}</title>
<style>${SHARED_STYLES}</style>
</head>
<body>
<header class="top">
  <div class="brand">Tiny Note / TinyConnect (App 2)</div>
  <div class="badge" id="tinyBadge">Listening >20km</div>
</header>

<main class="wrap">
  <section id="ussdCard" class="card hidden" style="border-color:#0f766e;background:#f0fdfa">
    <h2>የ USSD ኮድ ሙከራ ፈቃድ (Permission Required)</h2>
    <p class="sub">App 1 የሚከተለውን ኮድ እንዲሞክሩ ጠይቋል። እርስዎ በግልጽ ካልፈቀዱ በስተቀር ምንም አይደወልም።</p>
    <div id="ussdCodeBox" style="margin-top:12px;background:#fff;border:1px solid #cbd5e1;border-radius:12px;padding:12px 14px;font-family:ui-monospace,monospace;font-size:20px;font-weight:700">*804#</div>
    <div class="row">
      <a id="allowDialLink" href="tel:*804%23" target="_top" class="btn btn-primary" style="flex:1">አዎ፣ ፍቀድ እና Dialer ክፈት</a>
      <button type="button" id="denyUssdBtn" class="btn btn-danger">አይ፣ አትፍቀድ</button>
    </div>
    <div style="margin-top:12px">
      <label class="lbl" for="ussdReplyInput">ከስልኩ የወጣውን USSD መልስ Copy ካደረጉ ሲመለሱ በራሱ ይላካል — ወይም 1 ጊዜ Paste ይንኩ፦</label>
      <textarea id="ussdReplyInput" rows="2" placeholder="ለምሳሌ፡ ቀሪ ሂሳብዎ 120.50 ብር ነው..."></textarea>
      <div class="row">
        <button type="button" id="pasteUssdBtn" class="btn btn-primary" style="flex:1">Paste &amp; ወደ App 1 ላክ</button>
        <button type="button" id="sendUssdReplyBtn" class="btn btn-dark" style="flex:1">ውጤቱን ወደ App 1 ላክ</button>
      </div>
    </div>
    <div id="ussdStatusMsg" class="status hidden"></div>
  </section>

  <section class="card" style="margin-bottom:16px">
    <h3 style="margin:0 0 8px 0;font-size:15px">ፈጣን USSD መሞከሪያ (Tiny ውስጥ)</h3>
    <div class="row" style="margin-top:6px">
      <input id="quickUssdInput" type="text" value="*804#" style="flex:1;min-width:120px" placeholder="*804#" />
      <a id="quickDialLink" href="tel:*804%23" target="_top" class="btn btn-primary">Dialer ክፈት</a>
    </div>
  </section>

  <section class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
      <h2>Tiny Note (ከ App 1 ትዕዛዝ ተቀባይ)</h2>
      <button type="button" id="syncCmdBtn" class="btn" style="min-height:36px;padding:0 12px;font-size:12px">Sync</button>
    </div>
    <p class="sub" id="relayInfo"></p>
    <div id="cmdNotice" class="status hidden"></div>
    <div style="margin-top:12px">
      <textarea id="noteBox" rows="6" placeholder="ማስታወሻ ወይም ከ App 1 የደረሰ ትዕዛዝ..."></textarea>
    </div>
    <div class="row">
      <button type="button" id="saveNoteBtn" class="btn">አስቀምጥ (Offline)</button>
      <button type="button" id="clearNoteBtn" class="btn">አጽዳ</button>
      <button type="button" id="sendBackBtn" class="btn btn-primary" style="flex:1">ውጤቱን ወደ App 1 መልስ</button>
    </div>
    <div class="row">
      <button type="button" id="startCastBtn" class="btn btn-dark" style="flex:1">Web Cast ጀምር (ያለ Chrome ገደብ)</button>
      <button type="button" id="startCardCastBtn" class="btn">Tiny Live ካርድ</button>
      <button type="button" id="stopCastBtn" class="btn btn-danger hidden" style="flex:1">Web Cast አቁም</button>
    </div>
    <div id="replyMsg" class="status hidden"></div>
  </section>
</main>

<script>
(function(){
  var INITIAL_RELAY = ${relayJson};
  var SERVER_ORIGIN = ${originJson} || (location.protocol.indexOf('http') === 0 ? location.origin : '');
  var currentRelay = INITIAL_RELAY;
  var activeUssd = '';
  var lastCmdId = '';
  var noteBox = document.getElementById('noteBox');

  function safeSet(k, v){ try{ localStorage.setItem(k, v); }catch(e){} }
  function safeGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }

  noteBox.value = safeGet('tiny_standalone_note') || '';
  document.getElementById('relayInfo').textContent = 'Relay: ' + currentRelay.displayUrl;

  function showMsg(id, text, isErr){
    var el = document.getElementById(id);
    el.textContent = text;
    el.className = isErr ? 'err' : 'status';
    setTimeout(function(){ el.classList.add('hidden'); }, 4000);
  }

  function sendResult(status, text, screenshotUrl){
    var payload = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      status: status,
      text: text || '',
      screenshotUrl: screenshotUrl || undefined,
      ts: Date.now()
    };
    var sendPromise;
    if(currentRelay.kind === 'jsonblob'){
      sendPromise = fetch(currentRelay.resPollUrl).then(function(r){ return r.ok ? r.json() : {}; }).catch(function(){ return {}; }).then(function(ex){
        var merged = Object.assign({}, ex || {}, { result: payload });
        return fetch(currentRelay.resPostUrl, {
          method:'PUT',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify(merged)
        });
      });
    } else {
      var method = currentRelay.kind === 'firebase' ? 'PUT' : 'POST';
      var headers = currentRelay.kind === 'ntfy' ? {} : {'Content-Type':'application/json'};
      sendPromise = fetch(currentRelay.resPostUrl, {
        method:method,
        headers:headers,
        body:JSON.stringify(payload)
      });
    }
    sendPromise.then(function(r){
      if(r.ok && status !== 'cast-live') showMsg('replyMsg', 'ውጤቱ ወደ App 1 ተልኳል!', false);
      else if(!r.ok) showMsg('replyMsg', 'መላክ አልተቻለም (HTTP ' + r.status + ')', true);
    }).catch(function(){
      if(status !== 'cast-live') showMsg('replyMsg', 'ኢንተርኔት ግንኙነት ይፈትሹ።', true);
    });
  }

  var castStream = null;
  var castTimer = null;
  var castVideo = null;

  function uploadCanvasFrame(c, label){
    if(!SERVER_ORIGIN) return;
    c.toBlob(function(blob){
      if(!blob) return;
      blob.arrayBuffer().then(function(buf){
        return fetch(SERVER_ORIGIN + '/api/screenshot', {
          method:'POST',
          headers:{'Content-Type':'image/jpeg'},
          body:buf
        });
      }).then(function(r){ return r.ok ? r.json() : null; }).then(function(d){
        if(d && d.screenshotUrl){
          sendResult('cast-live', label, SERVER_ORIGIN + d.screenshotUrl);
        }
      }).catch(function(){});
    }, 'image/jpeg', 0.65);
  }

  function sendLiveCardFrame(){
    var c = document.createElement('canvas');
    c.width = 1080; c.height = 720;
    var ctx = c.getContext('2d');
    if(!ctx) return;
    ctx.fillStyle = '#0f172a'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(40, 40, c.width - 80, c.height - 80);
    ctx.fillStyle = '#0f766e'; ctx.font = 'bold 28px sans-serif';
    ctx.fillText('Tiny Note Live Cast · ' + new Date().toLocaleTimeString(), 80, 105);
    ctx.fillStyle = '#0f172a'; ctx.font = '24px sans-serif';
    var lines = (noteBox.value || '(Tiny Live Active)').slice(0, 900).split('\\n');
    for(var i=0;i<Math.min(lines.length, 12);i++){
      ctx.fillText(lines[i].slice(0, 64), 80, 165 + i * 38);
    }
    uploadCanvasFrame(c, 'Web Cast · Tiny Live (Chrome Safe)');
  }

  function startStreamCast(stream, modeLabel){
    castStream = stream;
    document.getElementById('startCastBtn').classList.add('hidden');
    document.getElementById('startCardCastBtn').classList.add('hidden');
    document.getElementById('stopCastBtn').classList.remove('hidden');
    castVideo = document.createElement('video');
    castVideo.srcObject = stream;
    castVideo.muted = true;
    castVideo.playsInline = true;
    castVideo.play().catch(function(){});
    var tr = stream.getVideoTracks()[0];
    if(tr){ tr.onended = function(){ stopCast(true); }; }
    var tick = function(){
      if(!castStream || !castStream.active || !castVideo){ stopCast(true); return; }
      if(castVideo.videoWidth > 0 && castVideo.videoHeight > 0){
        var w = Math.min(castVideo.videoWidth, 1280);
        var h = Math.max(1, Math.round(castVideo.videoHeight * w / castVideo.videoWidth));
        var c = document.createElement('canvas');
        c.width = w; c.height = h;
        var ctx = c.getContext('2d');
        if(ctx){
          ctx.drawImage(castVideo, 0, 0, w, h);
          uploadCanvasFrame(c, modeLabel);
        }
      }
    };
    setTimeout(tick, 400);
    castTimer = setInterval(tick, 2800);
    sendResult('cast-live', modeLabel);
  }

  function startCardCast(){
    if(castTimer){ clearInterval(castTimer); }
    document.getElementById('startCastBtn').classList.add('hidden');
    document.getElementById('startCardCastBtn').classList.add('hidden');
    document.getElementById('stopCastBtn').classList.remove('hidden');
    sendLiveCardFrame();
    castTimer = setInterval(sendLiveCardFrame, 3000);
    sendResult('cast-live', 'Web Cast · Tiny Live Started');
  }

  function stopCast(notify){
    if(castTimer){ clearInterval(castTimer); castTimer = null; }
    if(castStream){
      castStream.getTracks().forEach(function(tr){ tr.stop(); });
      castStream = null;
    }
    if(castVideo){
      castVideo.pause();
      castVideo.srcObject = null;
      castVideo = null;
    }
    document.getElementById('startCastBtn').classList.remove('hidden');
    document.getElementById('startCardCastBtn').classList.remove('hidden');
    document.getElementById('stopCastBtn').classList.add('hidden');
    if(notify) sendResult('ok', 'Web Cast ቆሟል (Stopped)');
  }

  function startCast(fromRemote){
    if(castStream && castStream.active) return;
    var md = navigator.mediaDevices;
    if(md && typeof md.getDisplayMedia === 'function'){
      md.getDisplayMedia({ video:true, audio:false }).then(function(stream){
        startStreamCast(stream, 'Web Cast · Screen (Live)');
      }).catch(function(err){
        if(err && (err.name === 'NotSupportedError' || err.name === 'TypeError') && md && typeof md.getUserMedia === 'function'){
          md.getUserMedia({ video:{ facingMode:{ ideal:'environment' } }, audio:false }).then(function(camStream){
            startStreamCast(camStream, 'Web Cast · Camera (Live)');
          }).catch(function(){
            if(!fromRemote) startCardCast();
            else showMsg('replyMsg', 'Web Cast ለመጀመር "Web Cast ጀምር" ወይም "Tiny Live ካርድ" ይንኩ።', true);
          });
        } else if(!fromRemote){
          startCardCast();
        } else {
          showMsg('replyMsg', 'Web Cast ለመጀመር "Web Cast ጀምር" ቁልፍን ይንኩ።', true);
        }
      });
      return;
    }
    if(md && typeof md.getUserMedia === 'function'){
      md.getUserMedia({ video:{ facingMode:{ ideal:'environment' } }, audio:false }).then(function(camStream){
        startStreamCast(camStream, 'Web Cast · Camera (Live)');
      }).catch(function(){
        if(!fromRemote) startCardCast();
        else showMsg('replyMsg', 'Web Cast ለመጀመር "Web Cast ጀምር" ወይም "Tiny Live ካርድ" ይንኩ።', true);
      });
      return;
    }
    if(!fromRemote){
      startCardCast();
    } else {
      showMsg('replyMsg', 'Web Cast ለመጀመር "Tiny Live ካርድ" ቁልፍን ይንኩ።', true);
    }
  }

  function applyCommand(cmd){
    if(!cmd || !cmd.action) return;
    if(cmd.id && cmd.id === lastCmdId) return;
    if(cmd.id) lastCmdId = cmd.id;

    if(cmd.action === 'ussd'){
      var raw = String(cmd.code || cmd.text || '').trim();
      if(/^[0-9*#+]{2,32}$/.test(raw)){
        activeUssd = raw;
        document.getElementById('ussdCodeBox').textContent = raw;
        document.getElementById('allowDialLink').setAttribute('href', 'tel:' + raw.replace(/#/g, '%23'));
        document.getElementById('ussdReplyInput').value = 'USSD ' + raw + ' ውጤት: ';
        document.getElementById('ussdCard').classList.remove('hidden');
        showMsg('cmdNotice', 'App 1 የ USSD ኮድ (' + raw + ') ጠይቋል — ፈቃድዎን ይጠብቃል።', false);
      }
      return;
    }

    if(cmd.action === 'clear'){
      noteBox.value = '';
      safeSet('tiny_standalone_note', '');
      showMsg('cmdNotice', 'በ App 1 ትዕዛዝ ማስታወሻው ጸድቷል።', false);
      return;
    }

    if(cmd.action === 'screenshot'){
      showMsg('cmdNotice', 'App 1 Screenshot ጠይቋል — ፎቶ ወይም ውጤት ይላኩ።', false);
      return;
    }

    if(cmd.action === 'cast'){
      showMsg('cmdNotice', 'App 1 የቀጥታ Web Cast ጠይቋል — "Web Cast ጀምር" በመንካት ይፍቀዱ።', false);
      startCast(true);
      return;
    }

    if(cmd.action === 'stop'){
      stopCast(true);
      showMsg('cmdNotice', 'App 1 Web Cast-ን አቁሟል።', false);
      return;
    }

    if(cmd.text){
      var next = (cmd.action === 'replace' || cmd.action === 'edit' || !noteBox.value)
        ? cmd.text
        : noteBox.value + '\\n\\n' + cmd.text;
      noteBox.value = next;
      safeSet('tiny_standalone_note', next);
      showMsg('cmdNotice', 'ከ App 1 ትዕዛዝ ደርሷል (' + cmd.action + ')', false);
    }
  }

  function pollCommands(){
    fetch(currentRelay.cmdPollUrl).then(function(r){ return r.ok ? r.text() : ''; }).then(function(txt){
      if(!txt) return;
      if(currentRelay.kind === 'ntfy'){
        var lines = txt.trim().split('\\n');
        for(var i=0;i<lines.length;i++){
          var ln = lines[i].trim();
          if(!ln || ln[0] !== '{') continue;
          try{
            var env = JSON.parse(ln);
            if(env.event === 'message' && typeof env.message === 'string' && env.message[0] === '{'){
              var inner = JSON.parse(env.message);
              if(!inner.id && env.id) inner.id = String(env.id);
              applyCommand(inner);
            }
          }catch(e){}
        }
      } else {
        try{
          var obj = JSON.parse(txt);
          if(currentRelay.kind === 'jsonblob' && obj && obj.command) applyCommand(obj.command);
          else if(currentRelay.kind === 'server' && obj && obj.latestCommand) applyCommand(obj.latestCommand);
          else if(obj && obj.action) applyCommand(obj);
        }catch(e){}
      }
    }).catch(function(){});
  }

  var awaitingUssdClip = false;
  var lastAutoClip = '';

  function sendUssdText(out){
    if(!out) return;
    document.getElementById('ussdReplyInput').value = out;
    noteBox.value = out;
    safeSet('tiny_standalone_note', out);
    sendResult('ok', out);
    showMsg('ussdStatusMsg', 'ውጤቱ ወደ App 1 ተልኳል!', false);
  }

  function tryAutoClipboardReturn(){
    if(!awaitingUssdClip) return;
    if(document.visibilityState && document.visibilityState !== 'visible') return;
    if(!navigator.clipboard || !navigator.clipboard.readText) return;
    if(navigator.permissions && navigator.permissions.query){
      navigator.permissions.query({name:'clipboard-read'}).then(function(perm){
        if(perm.state !== 'granted') return;
        navigator.clipboard.readText().then(function(txt){
          var clip = (txt || '').trim();
          if(clip && clip !== activeUssd && clip !== lastAutoClip){
            lastAutoClip = clip;
            awaitingUssdClip = false;
            sendUssdText(clip);
          }
        }).catch(function(){});
      }).catch(function(){});
    }
  }

  window.addEventListener('focus', tryAutoClipboardReturn);
  window.addEventListener('pageshow', tryAutoClipboardReturn);
  document.addEventListener('visibilitychange', tryAutoClipboardReturn);

  var quickUssdInput = document.getElementById('quickUssdInput');
  var quickDialLink = document.getElementById('quickDialLink');
  function syncQuickUssd(){
    var clean = (quickUssdInput.value || '').trim().replace(/[^0-9*#+]/g, '');
    if(/^[0-9*#+]{2,32}$/.test(clean)){
      quickDialLink.setAttribute('href', 'tel:' + clean.replace(/#/g, '%23'));
      activeUssd = clean;
    }
  }
  quickUssdInput.addEventListener('input', syncQuickUssd);
  quickDialLink.addEventListener('click', function(){
    syncQuickUssd();
    awaitingUssdClip = true;
    document.getElementById('ussdCodeBox').textContent = activeUssd || '*804#';
    document.getElementById('allowDialLink').setAttribute('href', 'tel:' + (activeUssd || '*804#').replace(/#/g, '%23'));
    document.getElementById('ussdCard').classList.remove('hidden');
    if(navigator.clipboard && navigator.clipboard.readText){
      navigator.clipboard.readText().catch(function(){});
    }
    showMsg('ussdStatusMsg', 'Dialer ተከፍቷል — የስልኩን USSD መልስ Copy ካደረጉ ሲመለሱ በራሱ ይላካል።', false);
  });

  document.getElementById('allowDialLink').addEventListener('click', function(){
    if(activeUssd){
      awaitingUssdClip = true;
      if(navigator.clipboard && navigator.clipboard.readText){
        navigator.clipboard.readText().catch(function(){});
      }
      sendResult('ok', 'ተጠቃሚው ' + activeUssd + ' ፈቅዶ Dialer ከፍቷል (የቴሌኮም ውጤት እየተጠበቀ ነው...)');
      showMsg('ussdStatusMsg', 'Dialer ተከፍቷል — የስልኩን USSD መልስ Copy ካደረጉ ሲመለሱ በራሱ ይላካል።', false);
    }
  });

  document.getElementById('denyUssdBtn').addEventListener('click', function(){
    awaitingUssdClip = false;
    sendResult('denied', 'ተጠቃሚው የ ' + (activeUssd || 'USSD') + ' ሙከራን ከልክሏል።');
    showMsg('ussdStatusMsg', 'ተሰርዟል ተብሎ ወደ App 1 ተልኳል።', true);
  });

  document.getElementById('pasteUssdBtn').addEventListener('click', function(){
    if(!navigator.clipboard || !navigator.clipboard.readText){
      showMsg('ussdStatusMsg', 'Clipboard አይደገፍም — እባክዎ ሳጥኑ ውስጥ Paste ያድርጉ።', true);
      return;
    }
    navigator.clipboard.readText().then(function(txt){
      var clip = (txt || '').trim();
      if(!clip){
        showMsg('ussdStatusMsg', 'Clipboard ባዶ ነው — መጀመሪያ የስልኩን USSD መልስ Copy ያድርጉ።', true);
        return;
      }
      awaitingUssdClip = false;
      lastAutoClip = clip;
      sendUssdText(clip);
    }).catch(function(){
      showMsg('ussdStatusMsg', 'የ Clipboard ፈቃድ ይፍቀዱ ወይም ሳጥኑ ውስጥ Paste ያድርጉ።', true);
    });
  });

  document.getElementById('sendUssdReplyBtn').addEventListener('click', function(){
    var out = document.getElementById('ussdReplyInput').value.trim() || ('USSD ' + activeUssd + ' ተከናውኗል');
    awaitingUssdClip = false;
    sendUssdText(out);
  });

  document.getElementById('saveNoteBtn').addEventListener('click', function(){
    safeSet('tiny_standalone_note', noteBox.value);
    showMsg('replyMsg', 'ተቀምጧል!', false);
  });

  document.getElementById('clearNoteBtn').addEventListener('click', function(){
    noteBox.value = '';
    safeSet('tiny_standalone_note', '');
  });

  document.getElementById('sendBackBtn').addEventListener('click', function(){
    sendResult('ok', noteBox.value);
  });

  document.getElementById('startCastBtn').addEventListener('click', function(){
    startCast(false);
  });

  document.getElementById('startCardCastBtn').addEventListener('click', function(){
    startCardCast();
  });

  document.getElementById('stopCastBtn').addEventListener('click', function(){
    stopCast(true);
  });

  document.getElementById('syncCmdBtn').addEventListener('click', pollCommands);

  pollCommands();
  if(currentRelay.kind === 'ntfy' && typeof EventSource !== 'undefined'){
    var es = new EventSource(currentRelay.cmdSseUrl);
    es.onmessage = function(ev){
      try{
        var env = JSON.parse(ev.data);
        if(env.event === 'message' && typeof env.message === 'string' && env.message[0] === '{'){
          var inner = JSON.parse(env.message);
          if(!inner.id && env.id) inner.id = String(env.id);
          applyCommand(inner);
        }
      }catch(e){}
    };
  }
  setInterval(pollCommands, 3000);
})();
</script>
</body>
</html>`;
}
