/* 통합 AI 검색 · API 공용 모듈 (index 와 관리자 페이지가 함께 사용)
 *
 *  - 어떤 API 를 쓸지(선택·모델·웹검색 여부)는 설정(settings.json)으로 공유되고,
 *    API 키는 "이 기기의 localStorage" 에만 저장됩니다. (GitHub 에는 절대 올라가지 않음)
 *  - 새 API 를 추가하려면 PROVIDERS 에 한 줄 추가하고 CALLERS 에 호출 함수를 하나 만들면 됩니다.
 */
(function(root){
  "use strict";

  var CFG_KEY = "uni_api_cfg_v1";   // [{id,on,model,web,baseUrl,name}]  (비밀 아님)
  var KEY_KEY = "uni_api_keys_v1";  // {openai:"…", gemini:"…", …}        (비밀 · 이 기기에만)

  var PROVIDERS = [
    {id: "openai", label: "ChatGPT", vendor: "OpenAI",    model: "gpt-6.1-sol",       keyHint: "sk-…",     webLabel: "웹 검색 도구 사용"},
    {id: "gemini", label: "Gemini",  vendor: "Google",    model: "gemini-3.8-flash",  keyHint: "AIza…",    webLabel: "Google 검색 연동 사용"},
    {id: "claude", label: "Claude",  vendor: "Anthropic", model: "claude-sonnet-5-5", keyHint: "sk-ant-…", webLabel: "웹 검색 도구 사용"},
    {id: "custom", label: "직접 추가", vendor: "OpenAI 호환 (Grok · DeepSeek · Perplexity 등)", model: "", keyHint: "", custom: true}
  ];

  function provider(id){
    for(var i = 0; i < PROVIDERS.length; i++) if(PROVIDERS[i].id === id) return PROVIDERS[i];
    return null;
  }

  /* ---------- 설정 / 키 저장 ---------- */
  // 어떤 입력이 와도 항상 PROVIDERS 순서의 완전한 목록으로 정리
  function normCfg(arr){
    var by = {};
    (Array.isArray(arr) ? arr : []).forEach(function(c){ if(c && typeof c.id === "string") by[c.id] = c; });
    return PROVIDERS.map(function(p){
      var c = by[p.id] || {};
      return {
        id: p.id,
        on: c.on === true,
        model: (typeof c.model === "string" && c.model.trim()) ? c.model.trim() : p.model,
        web: c.web === true,
        baseUrl: typeof c.baseUrl === "string" ? c.baseUrl.trim() : "",
        name: typeof c.name === "string" ? c.name.trim() : ""
      };
    });
  }
  function getCfg(){
    var raw = null;
    try{ raw = JSON.parse(localStorage.getItem(CFG_KEY)); }catch(e){}
    return normCfg(raw);
  }
  function setCfg(arr){
    var n = normCfg(arr);
    try{ localStorage.setItem(CFG_KEY, JSON.stringify(n)); }catch(e){}
    return n;
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
    if(p && p.custom) return c.name || "직접 추가";
    return p ? p.label : c.id;
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

  async function failFrom(resp){
    var txt = "";
    try{ txt = await resp.text(); }catch(e){}
    var j = parse(txt), msg = "";
    if(j){
      if(typeof j.error === "string") msg = j.error;
      else if(j.error && j.error.message) msg = j.error.message;
      else if(j.message) msg = j.message;
    }
    if(!msg) msg = txt.slice(0, 200);
    var hint = "";
    if(resp.status === 401 || resp.status === 403) hint = " → API 키가 올바른지, 사용 권한이 있는지 확인하세요.";
    else if(resp.status === 404) hint = " → 모델 이름이 맞는지 확인하세요.";
    else if(resp.status === 429) hint = " → 요청 한도 또는 결제 한도를 확인하세요.";
    throw new Error("오류 " + resp.status + (msg ? ": " + msg : "") + hint);
  }

  /* ---------- 서비스별 호출 ---------- */
  // 공통 규약: h.onText(조각) / h.onSource({url,title}) / h.signal
  var CALLERS = {
    // ChatGPT: Responses API
    openai: async function(c, key, text, h){
      var body = {model: c.model, input: text, stream: true};
      if(c.web) body.tools = [{type: "web_search"}];
      var resp = await fetch("https://api.openai.com/v1/responses", {
        method: "POST", signal: h.signal,
        headers: {"Content-Type": "application/json", "Authorization": "Bearer " + key},
        body: JSON.stringify(body)
      });
      if(!resp.ok) await failFrom(resp);
      await readSSE(resp, function(ev, data){
        var j = parse(data); if(!j) return;
        if(j.type === "response.output_text.delta" && j.delta) h.onText(j.delta);
        else if(j.type === "response.output_text.annotation.added" && j.annotation && j.annotation.url) h.onSource({url: j.annotation.url, title: j.annotation.title});
        else if(j.type === "response.failed") throw new Error((j.response && j.response.error && j.response.error.message) || "응답 실패");
        else if(j.type === "error") throw new Error(j.message || "오류");
      });
    },

    // Gemini: generateContent (스트리밍)
    gemini: async function(c, key, text, h){
      var body = {contents: [{role: "user", parts: [{text: text}]}]};
      if(c.web) body.tools = [{google_search: {}}];
      var url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(c.model) + ":streamGenerateContent?alt=sse";
      var resp = await fetch(url, {
        method: "POST", signal: h.signal,
        headers: {"Content-Type": "application/json", "x-goog-api-key": key},
        body: JSON.stringify(body)
      });
      if(!resp.ok) await failFrom(resp);
      await readSSE(resp, function(ev, data){
        var j = parse(data); if(!j) return;
        if(j.error) throw new Error(j.error.message || "오류");
        if(j.promptFeedback && j.promptFeedback.blockReason) throw new Error("요청이 차단됐어요 (" + j.promptFeedback.blockReason + ")");
        var cand = j.candidates && j.candidates[0]; if(!cand) return;
        if(cand.content && cand.content.parts) cand.content.parts.forEach(function(p){ if(p.text && !p.thought) h.onText(p.text); });
        var gm = cand.groundingMetadata;
        if(gm && gm.groundingChunks) gm.groundingChunks.forEach(function(g){ if(g.web && g.web.uri) h.onSource({url: g.web.uri, title: g.web.title}); });
      });
    },

    // Claude: Messages API (브라우저 직접 호출 허용 헤더 필요)
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
      if(!resp.ok) await failFrom(resp);
      await readSSE(resp, function(ev, data){
        var j = parse(data); if(!j) return;
        if(j.type === "content_block_delta" && j.delta){
          if(j.delta.type === "text_delta" && j.delta.text) h.onText(j.delta.text);
          else if(j.delta.type === "citations_delta" && j.delta.citation && j.delta.citation.url) h.onSource({url: j.delta.citation.url, title: j.delta.citation.title});
        } else if(j.type === "content_block_start" && j.content_block && j.content_block.type === "web_search_tool_result" && Array.isArray(j.content_block.content)){
          j.content_block.content.forEach(function(r){ if(r && r.url) h.onSource({url: r.url, title: r.title}); });
        } else if(j.type === "error"){
          throw new Error((j.error && j.error.message) || "오류");
        }
      });
    },

    // 직접 추가: OpenAI 호환 Chat Completions
    custom: async function(c, key, text, h){
      var base = (c.baseUrl || "").replace(/\/+$/, "");
      if(!/^https:\/\//i.test(base)) throw new Error("관리자 페이지에서 https:// 로 시작하는 기본 주소를 입력하세요.");
      var resp = await fetch(base + "/chat/completions", {
        method: "POST", signal: h.signal,
        headers: {"Content-Type": "application/json", "Authorization": "Bearer " + key},
        body: JSON.stringify({model: c.model, stream: true, messages: [{role: "user", content: text}]})
      });
      if(!resp.ok) await failFrom(resp);
      await readSSE(resp, function(ev, data){
        if(data.trim() === "[DONE]") return;
        var j = parse(data); if(!j) return;
        if(j.error) throw new Error(j.error.message || "오류");
        var d = j.choices && j.choices[0] && j.choices[0].delta;
        if(d && typeof d.content === "string" && d.content) h.onText(d.content);
        if(Array.isArray(j.citations)) j.citations.forEach(function(u){ if(typeof u === "string") h.onSource({url: u}); });
      });
    }
  };

  // 한 API 에 질문을 보냄. 끝나면 resolve, 실패하면 Error 로 reject
  async function run(c, text, h){
    var caller = CALLERS[c.id];
    if(!caller) throw new Error("지원하지 않는 API: " + c.id);
    var key = getKey(c.id);
    if(!key) throw new Error("API 키가 없어요. 관리자 페이지에서 키를 입력하세요.");
    if(!c.model) throw new Error("모델 이름이 비어 있어요. 관리자 페이지에서 입력하세요.");
    try{
      await caller(c, key, text, h);
    }catch(e){
      if(e && e.name === "AbortError") throw e;
      if(e instanceof TypeError) throw new Error("네트워크 오류예요. 인터넷 연결을 확인하세요. (이 서비스가 브라우저 직접 호출을 막은 경우에도 나타납니다)");
      throw e;
    }
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
    PROVIDERS: PROVIDERS, provider: provider, displayName: displayName,
    normCfg: normCfg, getCfg: getCfg, setCfg: setCfg,
    getKey: getKey, setKey: setKey,
    run: run, renderMd: renderMd
  };
})(window);
