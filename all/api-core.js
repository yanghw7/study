/* 통합 AI 검색 · API 공용 모듈 (index 와 관리자 페이지가 함께 사용)
 *
 *  - 어떤 API 를 쓸지(선택·모델·웹검색 여부)는 설정(settings.json)으로 공유되고,
 *    API 키는 "이 기기의 localStorage" 에만 저장됩니다. (GitHub 에는 절대 올라가지 않음)
 *  - 새 서비스 추가: PROVIDERS 에 한 줄 추가 (OpenAI 호환이면 format:"compat" + base 만 적으면 끝)
 *  - 형식(format): compat = OpenAI 호환 chat/completions, openai = ChatGPT 공식(Responses),
 *                  claude = Anthropic 공식, gemini = Google 공식
 */
(function(root){
  "use strict";

  var VERSION = "1.15.0";
  var CFG_KEY = "uni_api_cfg_v1";   // [{id,on,model,web,baseUrl,name,format,account}]  (비밀 아님)
  var KEY_KEY = "uni_api_keys_v1";  // {gemini:"…", groq:"…", …}                        (비밀 · 이 기기에만)

  var FORMATS = [
    {id: "compat", label: "OpenAI 호환 (chat/completions)"},
    {id: "openai", label: "ChatGPT 공식 (OpenAI)"},
    {id: "claude", label: "Claude 공식 (Anthropic)"}
  ];
  var WEB_FORMATS = {gemini: "Google 검색 연동 사용", openai: "웹 검색 도구 사용", claude: "웹 검색 도구 사용"};

  var PROVIDERS = [
    // ---- 무료 한도가 있는 서비스 ----
    {id: "gemini", group: "free", label: "Gemini", vendor: "Google AI Studio", format: "gemini", model: "gemini-3.8-flash",
     keyHint: "AIza…", keyUrl: "https://aistudio.google.com/apikey",
     note: "무료 한도 안에서 사용 가능 (모델·계정별 제한). 공부용 질의응답·긴 글 요약에 좋아요."},
    {id: "groq", group: "free", label: "Groq", vendor: "Groq", format: "compat", base: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile",
     keyHint: "gsk_…", keyUrl: "https://console.groq.com/keys",
     note: "응답이 매우 빨라요. 무료 요청 횟수·토큰 한도가 있어요."},
    {id: "openrouter", group: "free", label: "OpenRouter", vendor: "OpenRouter", format: "compat", base: "https://openrouter.ai/api/v1", model: "meta-llama/llama-3.3-70b-instruct:free",
     keyHint: "sk-or-…", keyUrl: "https://openrouter.ai/keys",
     note: "키 하나로 여러 회사 모델을 골라 써요. 이름 끝이 :free 인 모델이 무료예요(요청 횟수 제한)."},
    {id: "cloudflare", group: "free", label: "Cloudflare Workers AI", vendor: "Cloudflare", format: "compat", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", account: true,
     keyHint: "API 토큰", keyUrl: "https://dash.cloudflare.com/profile/api-tokens",
     note: "하루 무료 할당량이 있어요. 계정 ID와 Workers AI 권한이 있는 API 토큰이 필요하고, 브라우저 직접 호출이 막혀 있으면 연결 테스트에서 실패할 수 있어요."},
    // ---- 유료·기타: 직접 추가 ----
    {id: "custom1", group: "paid", custom: true, label: "직접 추가 1", vendor: "ChatGPT · Claude · DeepSeek · Grok 등", model: "", keyHint: "", note: ""},
    {id: "custom2", group: "paid", custom: true, label: "직접 추가 2", vendor: "", model: "", keyHint: "", note: ""},
    {id: "custom3", group: "paid", custom: true, label: "직접 추가 3", vendor: "", model: "", keyHint: "", note: ""}
  ];

  // 직접 추가 칸에서 고를 수 있는 프리셋
  var PRESETS = [
    {id: "", label: "직접 입력"},
    {id: "chatgpt", label: "ChatGPT (OpenAI 공식 · 유료)", name: "ChatGPT", format: "openai", baseUrl: "", keyUrl: "https://platform.openai.com/api-keys"},
    {id: "claude", label: "Claude (Anthropic 공식 · 유료)", name: "Claude", format: "claude", baseUrl: "", keyUrl: "https://console.anthropic.com/settings/keys"},
    {id: "deepseek", label: "DeepSeek (OpenAI 호환 · 유료)", name: "DeepSeek", format: "compat", baseUrl: "https://api.deepseek.com", keyUrl: "https://platform.deepseek.com/api_keys"},
    {id: "grok", label: "Grok (xAI · OpenAI 호환 · 유료)", name: "Grok", format: "compat", baseUrl: "https://api.x.ai/v1", keyUrl: "https://console.x.ai"},
    {id: "mistral", label: "Mistral (OpenAI 호환)", name: "Mistral", format: "compat", baseUrl: "https://api.mistral.ai/v1", keyUrl: "https://console.mistral.ai/api-keys"}
  ];

  function provider(id){
    for(var i = 0; i < PROVIDERS.length; i++) if(PROVIDERS[i].id === id) return PROVIDERS[i];
    return null;
  }
  function formatOf(c){
    var p = provider(c.id);
    if(p && p.custom) return (c.format === "openai" || c.format === "claude") ? c.format : "compat";
    return p ? p.format : "compat";
  }
  function baseOf(c){
    var p = provider(c.id);
    if(!p) return "";
    if(p.custom) return (c.baseUrl || "").replace(/\/+$/, "");
    if(p.account) return c.account ? "https://api.cloudflare.com/client/v4/accounts/" + encodeURIComponent(c.account) + "/ai/v1" : "";
    return p.base || "";
  }
  function webLabelOf(c){ return WEB_FORMATS[formatOf(c)] || ""; }

  /* ---------- 설정 / 키 저장 ---------- */
  // 어떤 입력이 와도 항상 PROVIDERS 순서의 완전한 목록으로 정리 (예전 저장값의 모르는 id 는 버림)
  function normCfg(arr){
    // 입력된 순서를 그대로 유지하고(= 사용자가 정한 표시 순서), 빠진 항목만 기본 순서대로 뒤에 붙임
    var by = {}, order = [];
    (Array.isArray(arr) ? arr : []).forEach(function(c){
      if(c && typeof c.id === "string" && provider(c.id) && !by.hasOwnProperty(c.id)){ by[c.id] = c; order.push(c.id); }
    });
    PROVIDERS.forEach(function(p){ if(!by.hasOwnProperty(p.id)) order.push(p.id); });
    function str(v){ return typeof v === "string" ? v.trim() : ""; }
    return order.map(function(id){
      var p = provider(id), c = by[id] || {};
      return {
        id: p.id,
        on: c.on === true,
        model: str(c.model) || p.model,
        web: c.web === true,
        baseUrl: str(c.baseUrl),
        name: str(c.name),
        format: (c.format === "openai" || c.format === "claude") ? c.format : "compat",
        account: str(c.account)
      };
    });
  }
  function getCfg(){
    var raw = null;
    try{ raw = JSON.parse(localStorage.getItem(CFG_KEY)); }catch(e){}
    return normCfg(raw);
  }
  // 이 기기에서 API 선택을 마지막으로 바꾼 시각. GitHub 의 설정이 이보다 오래됐으면 이 기기 선택을 덮어쓰지 않음
  var CT_KEY = "uni_api_cfg_t_v1";
  function cfgTime(){ try{ return +localStorage.getItem(CT_KEY) || 0; }catch(e){ return 0; } }
  function stampCfg(t){ try{ localStorage.setItem(CT_KEY, String(t || Date.now())); }catch(e){} }
  function storeCfg(arr){
    var n = normCfg(arr);
    try{ localStorage.setItem(CFG_KEY, JSON.stringify(n)); }catch(e){}
    return n;
  }
  // 사용자가 직접 바꾼 값 저장 (변경 시각 기록)
  function setCfg(arr){
    var n = storeCfg(arr);
    stampCfg();
    return n;
  }

  /* ---------- 표시 순서 ---------- */
  var ORD_KEY = "uni_api_order_t_v1";   // 이 기기에서 순서를 마지막으로 바꾼 시각
  function orderTime(){ try{ return +localStorage.getItem(ORD_KEY) || 0; }catch(e){ return 0; } }
  function stampOrder(){ try{ localStorage.setItem(ORD_KEY, String(Date.now())); }catch(e){} }
  // ids 순서대로 정렬해 저장 (목록에 없는 항목은 뒤로)
  function setOrder(ids){
    var pos = {}, arr = getCfg().map(function(c, i){ return {c: c, i: i}; });
    (ids || []).forEach(function(id, i){ pos[id] = i; });
    function rank(x){ return pos.hasOwnProperty(x.c.id) ? pos[x.c.id] : 1e6 + x.i; }
    arr.sort(function(a, b){ return rank(a) - rank(b); });
    return setCfg(arr.map(function(x){ return x.c; }));
  }
  // id 항목을 위(-1)/아래(+1)로 한 칸 이동. onlyOn=true 면 "사용 중" 항목끼리만 자리를 바꿈
  function move(id, dir, onlyOn){
    var arr = getCfg(), idxs = [], k = -1;
    arr.forEach(function(c, i){ if(!onlyOn || c.on) idxs.push(i); });
    idxs.forEach(function(ix, j){ if(arr[ix].id === id) k = j; });
    var t = k + dir;
    if(k < 0 || t < 0 || t >= idxs.length) return false;
    var a = idxs[k], b = idxs[t], tmp = arr[a]; arr[a] = arr[b]; arr[b] = tmp;
    setCfg(arr); stampOrder();
    return true;
  }
  // GitHub 설정을 받아 반영. 이 기기에서 순서를 더 최근에 바꿨다면 그 순서는 유지
  function applyRemoteCfg(arr, updated){
    var remoteT = +updated || 0, localT = cfgTime(), cur = getCfg();
    var localOn = cur.some(function(c){ return c.on; });
    var remoteOn = (Array.isArray(arr) ? arr : []).some(function(c){ return c && c.on === true; });
    // 이 기기의 선택이 GitHub 값보다 최근이거나, (예전 저장값이라 시각이 없는데) 이 기기엔 선택이 있고 GitHub 엔 선택이 하나도 없으면 → 이 기기 선택을 지키지 않고 덮어쓰면 "사용 중 API 가 전부 사라지는" 문제가 생김
    if(localT > remoteT || (!localT && localOn && !remoteOn)) return cur;
    var prev = cur.map(function(c){ return c.id; }), t = orderTime();
    var n = storeCfg(arr);
    stampCfg(remoteT || Date.now());
    if(t > remoteT){ n = storeCfg(setOrderList(prev)); }
    return n;
  }
  // setOrder 와 같지만 저장은 하지 않고 정렬된 목록만 돌려줌
  function setOrderList(ids){
    var pos = {}, arr = getCfg().map(function(c, i){ return {c: c, i: i}; });
    (ids || []).forEach(function(id, i){ pos[id] = i; });
    function rank(x){ return pos.hasOwnProperty(x.c.id) ? pos[x.c.id] : 1e6 + x.i; }
    arr.sort(function(a, b){ return rank(a) - rank(b); });
    return arr.map(function(x){ return x.c; });
  }

  function readKeys(){
    try{ var k = JSON.parse(localStorage.getItem(KEY_KEY)); if(k && typeof k === "object") return k; }catch(e){}
    return {};
  }
  function getKey(id){ var v = readKeys()[id]; return typeof v === "string" ? v : ""; }
  function setKey(id, v){
    var k = readKeys();
    v = (v || "").trim();
    if(v) k[id] = v; else delete k[id];
    try{ localStorage.setItem(KEY_KEY, JSON.stringify(k)); }catch(e){}
  }
  function displayName(c){
    var p = provider(c.id);
    if(p && p.custom) return c.name || p.label;
    return p ? p.label : c.id;
  }
  // 이 설정으로 호출할 준비가 안 된 부분이 있으면 한국어 문장으로 알려줌 (없으면 "")
  function missing(c){
    var p = provider(c.id);
    if(!p) return "지원하지 않는 API";
    if(!c.model) return "모델 이름이 비어 있어요.";
    if(p.account && !c.account) return "Cloudflare 계정 ID를 입력하세요.";
    if(formatOf(c) === "compat" && !/^https:\/\//i.test(baseOf(c))) return "기본 주소(https://…)를 입력하세요.";
    return "";
  }

  /* ---------- 오류를 한국어로 풀어서 설명 ---------- */
  // raw: 서비스가 보낸 원문, status: HTTP 상태(없으면 0), fmt: 형식
  function explain(raw, status, fmt){
    var t = String(raw || "").toLowerCase();
    // 보낸 글(검색어+프롬프트)이 이 모델이 받을 수 있는 길이를 넘은 경우
    if(status === 413 || /context_length_exceeded|maximum context length|context length|context window|prompt is too long|too many tokens|input is too long|input too long|request too large|payload too large|reduce the length|exceeds the maximum|token count.*exceeds|input token count/.test(t)){
      return "✂ 보낸 글(검색어+프롬프트)이 너무 길어서 이 모델이 받지 못했어요. 검색어나 프롬프트를 줄이거나, 더 많은 글을 받을 수 있는 모델로 바꿔 보세요. (무료 모델은 분당 토큰 한도 때문에 짧은 글만 받는 경우도 있어요)";
    }
    var billing = /insufficient_quota|credit_balance|no credits|credits remaining|credit balance is too low|insufficient credits|insufficient funds|payment required|add credits|purchase credits|out of credits|billing_not_active|billing hard limit|plans and billing|requires a paid|upgrade to a paid/.test(t) || status === 402;
    var limit = /resource_exhausted|rate.?limit|too many requests|per.?minute|per.?day|requests per|tokens per|free.?tier|quota/.test(t) || status === 429;
    // Gemini 는 무료 한도를 넘어도 "quota … billing" 문장을 보내므로 결제 부족이 아니라 한도 초과로 안내
    if(fmt === "gemini" && (limit || billing) && status !== 402){
      return "⏳ Gemini 무료 사용 한도를 넘었어요. 1분~하루 정도 기다렸다 다시 시도하거나, 다른 무료 API를 함께 선택해 보세요. 계속 많이 쓰려면 Google AI Studio 에서 결제를 설정하면 한도가 늘어나요.";
    }
    if(billing){
      return "💳 유료 충전이 필요해요. 이 계정에 사용할 크레딧(잔액)이 없어요. 해당 서비스의 결제(Billing) 페이지에서 크레딧을 충전하거나 결제 수단을 등록하세요. 충전 뒤 반영까지 몇 분 걸릴 수 있어요. (ChatGPT·Claude 구독과 API 결제는 별개예요)";
    }
    if(limit){
      return "⏳ 사용 한도(분당·일일)를 넘었어요. 잠시 뒤 다시 시도하거나, 다른 API를 함께 선택해 보세요. 무료 모델은 한도가 작아서 자주 걸려요.";
    }
    if(status === 401 || /invalid api key|incorrect api key|invalid x-api-key|api key not valid|unauthorized|authentication|missing bearer|invalid token/.test(t)){
      return "🔑 API 키가 올바르지 않거나 비어 있어요. 키를 다시 복사해서 [키 저장]을 누르세요. 다른 서비스의 키를 붙이지 않았는지도 확인하세요.";
    }
    if(status === 404 || /model_not_found|does not exist|no such model|not found|unknown model|invalid model/.test(t)){
      return "❓ 모델 이름이 맞지 않거나 이 키로는 쓸 수 없는 모델이에요. [사용 가능한 모델 불러오기]로 목록에서 고르세요.";
    }
    if(status === 403 || /permission|forbidden|not allowed|must be verified|organization/.test(t)){
      return "🚫 이 키로는 이 모델·기능을 쓸 권한이 없어요. 계정 인증, 모델 접근 권한, 지역 제한을 확인하세요.";
    }
    if(status >= 500) return "🛠 서비스 쪽 일시적인 오류예요. 잠시 뒤 다시 시도하세요.";
    return "";
  }
  // 한국어 설명 + 원문
  function fullMsg(kor, orig){
    return kor ? kor + "\n원문: " + orig : orig;
  }

  /* ---------- 스트리밍(SSE) 읽기 ---------- */
  function sseBlock(blk, onEvent){
    var ev = "", data = [];
    blk.split(/\r?\n/).forEach(function(l){
      if(l.indexOf("event:") === 0) ev = l.slice(6).trim();
      else if(l.indexOf("data:") === 0) data.push(l.slice(5).replace(/^ /, ""));
    });
    if(data.length) onEvent(ev, data.join("\n"));
  }
  async function readSSE(resp, onEvent){
    if(!resp.body || !resp.body.getReader){            // 스트리밍을 못 쓰는 환경: 통째로 받아서 처리
      (await resp.text()).split(/\r?\n\r?\n/).forEach(function(b){ if(b.trim()) sseBlock(b, onEvent); });
      return;
    }
    var rd = resp.body.getReader(), dec = new TextDecoder(), buf = "";
    for(;;){
      var r = await rd.read();
      if(r.done) break;
      buf += dec.decode(r.value, {stream: true});
      var parts = buf.split(/\r?\n\r?\n/);
      buf = parts.pop();
      parts.forEach(function(b){ sseBlock(b, onEvent); });
    }
    buf += dec.decode();
    if(buf.trim()) sseBlock(buf, onEvent);
  }
  function parse(s){ try{ return JSON.parse(s); }catch(e){ return null; } }

  // 스트림 중간에 온 오류 이벤트 → 한국어 설명 + 원문
  function errText(j, fallback, fmt){
    var e = j && (j.error || (j.response && (j.response.error || j.response.incomplete_details)) || j);
    var m = e && (e.message || e.reason || e.code || e.type);
    var raw = "";
    try{ raw = JSON.stringify(j).slice(0, 300); }catch(x){}
    var status = (e && (+e.code || +e.status)) || 0;
    var orig = (fallback || "오류") + (m ? ": " + m : "") + (raw ? "  [" + raw + "]" : "");
    return fullMsg(explain(raw + " " + (m || ""), status, fmt), orig);
  }

  async function failFrom(resp, fmt){
    var txt = "";
    try{ txt = await resp.text(); }catch(e){}
    var j = parse(txt), msg = "";
    if(j){
      if(typeof j.error === "string") msg = j.error;
      else if(j.error && j.error.message) msg = j.error.message;
      else if(Array.isArray(j) && j[0] && j[0].error && j[0].error.message) msg = j[0].error.message;
      else if(j.message) msg = j.message;
      else if(Array.isArray(j.errors) && j.errors[0] && j.errors[0].message) msg = j.errors[0].message;   // Cloudflare
    }
    if(!msg) msg = txt.slice(0, 300);
    var where = "";
    try{ where = " (" + new URL(resp.url).pathname + ")"; }catch(e){}
    var orig = "오류 " + resp.status + where + (msg ? ": " + msg : "");
    var err = new Error(fullMsg(explain(txt + " " + msg, resp.status, fmt), orig));
    err.httpStatus = resp.status;
    throw err;
  }

  /* ---------- 형식별 호출 ---------- */
  // 공통 규약: h.onText(조각) / h.onSource({url,title}) / h.onWarn(문장, 선택) / h.signal
  function warn(h, m){ try{ if(h && h.onWarn) h.onWarn(m); }catch(e){} }
  var CUT_MSG = "✂ 답변이 길이 제한에 걸려 중간에서 끊겼어요. 질문(검색어·프롬프트)을 짧게 하거나 나눠서 물어보세요.";

  // ChatGPT 공식: Responses API
  async function openaiResponses(c, key, text, h){
    var body = {model: c.model, input: text, stream: true};
    if(c.web) body.tools = [{type: "web_search"}];
    var resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST", signal: h.signal,
      headers: {"Content-Type": "application/json", "Authorization": "Bearer " + key},
      body: JSON.stringify(body)
    });
    if(!resp.ok) await failFrom(resp, "openai");
    await readSSE(resp, function(ev, data){
      var j = parse(data); if(!j) return;
      if(j.type === "response.output_text.delta" && j.delta) h.onText(j.delta);
      else if(j.type === "response.output_text.annotation.added" && j.annotation && j.annotation.url) h.onSource({url: j.annotation.url, title: j.annotation.title});
      else if(j.type === "response.incomplete"){
        var why = j.response && j.response.incomplete_details && j.response.incomplete_details.reason;
        warn(h, why === "content_filter" ? "🚫 안전 필터 때문에 답변이 중간에서 멈췄어요." : CUT_MSG);
      }
      else if(j.type === "response.failed") throw new Error(errText(j, "응답 실패", "openai"));
      else if(j.type === "error") throw new Error(errText(j, "오류 이벤트", "openai"));
    });
  }

  // OpenAI 호환 chat/completions (Groq · OpenRouter · Cloudflare · DeepSeek · Grok 등, 그리고 ChatGPT 대체 경로)
  async function compatChat(c, key, text, h, base, fmt){
    var resp = await fetch(base + "/chat/completions", {
      method: "POST", signal: h.signal,
      headers: {"Content-Type": "application/json", "Authorization": "Bearer " + key},
      body: JSON.stringify({model: c.model, stream: true, messages: [{role: "user", content: text}]})
    });
    if(!resp.ok) await failFrom(resp, fmt || "compat");
    await readSSE(resp, function(ev, data){
      if(data.trim() === "[DONE]") return;
      var j = parse(data); if(!j) return;
      if(j.error) throw new Error(errText(j, "오류", fmt || "compat"));
      var d = j.choices && j.choices[0] && j.choices[0].delta;
      if(d && typeof d.content === "string" && d.content) h.onText(d.content);
      var fr = j.choices && j.choices[0] && j.choices[0].finish_reason;
      if(fr === "length") warn(h, CUT_MSG);
      else if(fr === "content_filter") warn(h, "🚫 안전 필터 때문에 답변이 중간에서 멈췄어요.");
      if(Array.isArray(j.citations)) j.citations.forEach(function(u){ if(typeof u === "string") h.onSource({url: u}); });
    });
  }

  var CALLERS = {
    // ChatGPT 공식: Responses 먼저, HTTP 오류로 실패하면(결제·한도 제외) Chat Completions 로 한 번 더
    openai: async function(c, key, text, h){
      var got = false;
      var h1 = {signal: h.signal, onSource: h.onSource, onWarn: h.onWarn, onText: function(d){ got = true; h.onText(d); }};
      try{
        await openaiResponses(c, key, text, h1);
      }catch(e){
        var st = e && e.httpStatus;
        if(!st || st === 429 || st === 402 || st === 401 || got || (h.signal && h.signal.aborted)) throw e;
        try{
          await compatChat(c, key, text, h, "https://api.openai.com/v1", "openai");
        }catch(e2){
          if(e2 && e2.name === "AbortError") throw e2;
          throw new Error(e.message + "\n↳ 대체 경로도 실패: " + (e2 && e2.message));
        }
      }
    },

    // Gemini 공식 (스트리밍)
    gemini: async function(c, key, text, h){
      var body = {contents: [{role: "user", parts: [{text: text}]}]};
      if(c.web) body.tools = [{google_search: {}}];
      var url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(c.model) + ":streamGenerateContent?alt=sse";
      var resp = await fetch(url, {
        method: "POST", signal: h.signal,
        headers: {"Content-Type": "application/json", "x-goog-api-key": key},
        body: JSON.stringify(body)
      });
      if(!resp.ok) await failFrom(resp, "gemini");
      await readSSE(resp, function(ev, data){
        var j = parse(data); if(!j) return;
        if(j.error) throw new Error(errText(j, "오류", "gemini"));
        if(j.promptFeedback && j.promptFeedback.blockReason) throw new Error("🚫 요청이 안전 필터에 막혔어요 (" + j.promptFeedback.blockReason + "). 질문 표현을 바꿔 보세요.");
        var cand = j.candidates && j.candidates[0]; if(!cand) return;
        if(cand.content && cand.content.parts) cand.content.parts.forEach(function(p){ if(p.text && !p.thought) h.onText(p.text); });
        if(cand.finishReason === "MAX_TOKENS") warn(h, CUT_MSG);
        else if(/SAFETY|RECITATION|PROHIBITED|BLOCKLIST|SPII/.test(cand.finishReason || "")) warn(h, "🚫 안전 필터 때문에 답변이 중간에서 멈췄어요 (" + cand.finishReason + ").");
        var gm = cand.groundingMetadata;
        if(gm && gm.groundingChunks) gm.groundingChunks.forEach(function(g){ if(g.web && g.web.uri) h.onSource({url: g.web.uri, title: g.web.title}); });
      });
    },

    // Claude 공식 (브라우저 직접 호출 허용 헤더 필요)
    claude: async function(c, key, text, h){
      var body = {model: c.model, max_tokens: 8192, stream: true, messages: [{role: "user", content: text}]};
      if(c.web) body.tools = [{type: "web_search_20250305", name: "web_search", max_uses: 5}];
      var resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST", signal: h.signal,
        headers: {
          "Content-Type": "application/json", "x-api-key": key,
          "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify(body)
      });
      if(!resp.ok) await failFrom(resp, "claude");
      await readSSE(resp, function(ev, data){
        var j = parse(data); if(!j) return;
        if(j.type === "content_block_delta" && j.delta){
          if(j.delta.type === "text_delta" && j.delta.text) h.onText(j.delta.text);
          else if(j.delta.type === "citations_delta" && j.delta.citation && j.delta.citation.url) h.onSource({url: j.delta.citation.url, title: j.delta.citation.title});
        } else if(j.type === "content_block_start" && j.content_block && j.content_block.type === "web_search_tool_result" && Array.isArray(j.content_block.content)){
          j.content_block.content.forEach(function(r){ if(r && r.url) h.onSource({url: r.url, title: r.title}); });
        } else if(j.type === "message_delta" && j.delta && j.delta.stop_reason){
          if(j.delta.stop_reason === "max_tokens" || j.delta.stop_reason === "model_context_window_exceeded") warn(h, CUT_MSG);
        } else if(j.type === "error"){
          throw new Error(errText(j, "오류", "claude"));
        }
      });
    },

    // OpenAI 호환
    compat: async function(c, key, text, h){
      await compatChat(c, key, text, h, baseOf(c), "compat");
    }
  };

  // 한 API 에 질문을 보냄. 끝나면 resolve, 실패하면 Error 로 reject
  // h.idleMs: 이 시간 동안 아무 응답 조각도 안 오면 중단하고 안내 (기본 60초)
  async function run(c, text, h){
    var fmt = formatOf(c), caller = CALLERS[fmt];
    if(!caller || !provider(c.id)) throw new Error("지원하지 않는 API: " + c.id);
    var key = getKey(c.id);
    if(!key) throw new Error("🔑 API 키가 없어요. 관리자 페이지에서 키를 입력하세요.");
    var miss = missing(c);
    if(miss) throw new Error("⚙ " + miss + " 관리자 페이지에서 입력하세요.");
    var idle = h.idleMs || 60000, ctrl = new AbortController(), timer = null, timedOut = false, t0 = Date.now();
    function arm(){
      clearTimeout(timer);
      timer = setTimeout(function(){ timedOut = true; ctrl.abort(); }, idle);
    }
    if(h.signal){
      if(h.signal.aborted) ctrl.abort();
      else h.signal.addEventListener("abort", function(){ ctrl.abort(); });
    }
    var h2 = {
      signal: ctrl.signal,
      onText: function(d){ arm(); h.onText(d); },
      onSource: function(s){ arm(); h.onSource(s); },
      onWarn: function(m){ arm(); if(h.onWarn) h.onWarn(m); }
    };
    arm();
    try{
      await caller(c, key, text, h2);
    }catch(e){
      var sec = Math.round((Date.now() - t0) / 1000);
      if(timedOut) throw new Error("⏳ 서버에서 " + Math.round(idle / 1000) + "초 동안 응답이 없어서 중단했어요. 모델이 너무 느리거나(큰 모델), 이 기기에서 해당 서비스 접속이 막혀 있을 수 있어요. 더 작은 모델로 바꿔 다시 해보세요.");
      if(e && e.name === "AbortError") throw e;
      if(e instanceof TypeError) throw new Error("📡 서버와 통신하지 못했어요 (" + (e.message || "연결 끊김") + " · " + sec + "초 뒤). 인터넷·VPN·광고차단 설정을 확인하세요. 이 서비스가 앱/브라우저 화면에서의 직접 호출(CORS)을 허용하지 않는 경우에도 나타나요.");
      if(e && e.message) throw e;
      throw new Error("알 수 없는 오류 (" + (e && e.name ? e.name : String(e)) + ")");
    }finally{
      clearTimeout(timer);
    }
  }

  /* ---------- 사용 가능한 모델 목록 (키로 직접 조회) ---------- */
  async function listModels(c){
    var key = getKey(c.id);
    if(!key) throw new Error("🔑 API 키를 먼저 저장하세요.");
    var fmt = formatOf(c), p = provider(c.id), resp, j, ids = [];
    if(p.account){ throw new Error("Cloudflare 는 목록 조회를 지원하지 않아요. 문서의 모델 이름(예: @cf/meta/llama-3.3-70b-instruct-fp8-fast)을 직접 입력하세요."); }
    try{
      if(fmt === "openai") resp = await fetch("https://api.openai.com/v1/models", {headers: {"Authorization": "Bearer " + key}});
      else if(fmt === "gemini") resp = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {headers: {"x-goog-api-key": key}});
      else if(fmt === "claude") resp = await fetch("https://api.anthropic.com/v1/models?limit=100", {headers: {"x-api-key": key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true"}});
      else {
        var base = baseOf(c);
        if(!/^https:\/\//i.test(base)) throw new Error("기본 주소(https://…)를 먼저 입력하세요.");
        resp = await fetch(base + "/models", {headers: {"Authorization": "Bearer " + key}});
      }
    }catch(e){
      if(e instanceof TypeError) throw new Error("📡 네트워크 오류예요. 인터넷 연결을 확인하세요.");
      throw e;
    }
    if(!resp.ok) await failFrom(resp, fmt);
    j = await resp.json();
    if(fmt === "gemini"){
      (j.models || []).forEach(function(m){
        if(m.name && (m.supportedGenerationMethods || []).indexOf("generateContent") >= 0) ids.push(m.name.replace(/^models\//, ""));
      });
    } else {
      var arr = (j.data || []).slice();
      if(fmt === "openai"){
        arr = arr.filter(function(m){ return /^(gpt|o\d|chatgpt)/i.test(m.id) && !/(embed|tts|whisper|dall|image|moderation|audio|realtime|transcribe|search-preview|instruct|davinci|babbage)/i.test(m.id); });
        arr.sort(function(a, b){ return (b.created || 0) - (a.created || 0); });
      } else if(c.id === "openrouter"){
        // 이름 끝이 ':free' 인 모델과, 이름엔 없지만 가격이 0 인 모델을 따로 나눔
        var isFree = function(m){ return /:free$/i.test(m.id); };
        var isZero = function(m){ return !isFree(m) && m.pricing && +m.pricing.prompt === 0 && +m.pricing.completion === 0; };
        var gFree = arr.filter(isFree).map(function(m){ return m.id; });
        var gZero = arr.filter(isZero).map(function(m){ return m.id; });
        ids = gFree.concat(gZero);
        ids.groups = [{label: "🆓 :free 모델", ids: gFree}, {label: "가격 0 (이름에 :free 없음)", ids: gZero}];
        return ids;
      }
      ids = arr.map(function(m){ return m.id; });
    }
    return ids;
  }

  /* ---------- 답변 표시용 간단 마크다운 ---------- */
  function esc(s){
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function inline(s){
    s = esc(s);
    var codes = [];
    s = s.replace(/`([^`]+)`/g, function(_, c){ codes.push(c); return "\u0000" + (codes.length - 1) + "\u0000"; });
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    s = s.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
    s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<i>$2</i>");
    s = s.replace(/\u0000(\d+)\u0000/g, function(_, i){ return "<code>" + codes[+i] + "</code>"; });
    return s;
  }
  function cells(line){
    return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(function(x){ return x.trim(); });
  }
  function renderMd(src){
    var lines = String(src || "").replace(/\r\n?/g, "\n").split("\n"), out = [], i = 0, m;
    function isBlockStart(l){
      return /^\s*(```|#{1,6}\s|>\s?|[-*+]\s+|\d+[.)]\s+)/.test(l) || /^\s*([-*_])(\s*\1){2,}\s*$/.test(l);
    }
    while(i < lines.length){
      var l = lines[i];
      if(/^\s*```/.test(l)){                                   // 코드 블록 (스트리밍 중 닫히지 않아도 표시)
        var code = []; i++;
        while(i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
        i++;
        out.push("<pre><code>" + esc(code.join("\n")) + "</code></pre>");
      } else if(!l.trim()){
        i++;
      } else if((m = /^(#{1,6})\s+(.*)$/.exec(l))){
        var lv = Math.min(m[1].length + 1, 5);
        out.push("<h" + lv + ">" + inline(m[2]) + "</h" + lv + ">"); i++;
      } else if(/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)){
        out.push("<hr>"); i++;
      } else if(/^\s*>\s?/.test(l)){
        var q = [];
        while(i < lines.length && /^\s*>\s?/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, ""));
        out.push("<blockquote>" + renderMd(q.join("\n")) + "</blockquote>");
      } else if(/^\s*[-*+]\s+/.test(l) || /^\s*\d+[.)]\s+/.test(l)){
        var ord = /^\s*\d+[.)]\s+/.test(l), items = [];
        var re = ord ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/;
        while(i < lines.length && re.test(lines[i])){
          var it = [lines[i++].replace(re, "")];
          while(i < lines.length && lines[i].trim() && !re.test(lines[i]) && /^\s{2,}\S/.test(lines[i])) it.push(lines[i++].trim());
          items.push("<li>" + inline(it.join(" ")) + "</li>");
        }
        out.push((ord ? "<ol>" : "<ul>") + items.join("") + (ord ? "</ol>" : "</ul>"));
      } else if(l.indexOf("|") >= 0 && i + 1 < lines.length && /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[i + 1])){
        var head = cells(l); i += 2;
        var rows = [];
        while(i < lines.length && lines[i].indexOf("|") >= 0 && lines[i].trim()) rows.push(cells(lines[i++]));
        out.push("<div class='tbl'><table><thead><tr>" + head.map(function(x){ return "<th>" + inline(x) + "</th>"; }).join("") +
          "</tr></thead><tbody>" + rows.map(function(r){ return "<tr>" + r.map(function(x){ return "<td>" + inline(x) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>");
      } else {
        var p = [l]; i++;
        while(i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) p.push(lines[i++]);
        out.push("<p>" + p.map(inline).join("<br>") + "</p>");
      }
    }
    return out.join("");
  }

  root.AiaiApi = {
    VERSION: VERSION, PROVIDERS: PROVIDERS, PRESETS: PRESETS, FORMATS: FORMATS,
    provider: provider, displayName: displayName, formatOf: formatOf, baseOf: baseOf, webLabelOf: webLabelOf, missing: missing,
    normCfg: normCfg, getCfg: getCfg, setCfg: setCfg,
    move: move, setOrder: setOrder, stampOrder: stampOrder, orderTime: orderTime, applyRemoteCfg: applyRemoteCfg,
    getKey: getKey, setKey: setKey,
    run: run, listModels: listModels, renderMd: renderMd, explain: explain
  };
})(window);
