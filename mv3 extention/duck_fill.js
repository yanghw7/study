// Duck.ai 화면(iframe) 안에서 앱이 보낸 검색어를 입력창에 넣고 전송까지 눌러 주는 스크립트
(function(){
  var ALLOWED_PARENTS = ["https://yanghw7.github.io", "null"]; // null = file:// 로 연 로컬 테스트
  var state = {}; // id -> "run" | "done"

  function findInput(){
    return document.querySelector('textarea[name="user-prompt"]') ||
           document.querySelector("textarea") ||
           document.querySelector('[contenteditable="true"]');
  }
  function waitFor(fn, ms, cb){
    var t0 = Date.now();
    (function tick(){
      var v = fn();
      if(v) return cb(v);
      if(Date.now() - t0 > ms) return cb(null);
      setTimeout(tick, 250);
    })();
  }
  function setText(el, text){
    el.focus();
    if(el.tagName === "TEXTAREA"){
      var setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
      setter.call(el, text);
      el.dispatchEvent(new InputEvent("input", {bubbles: true, inputType: "insertText", data: text}));
      el.dispatchEvent(new Event("change", {bubbles: true}));
    }else{
      document.execCommand("selectAll", false, null);
      document.execCommand("insertText", false, text);
    }
  }
  function log(){ try{ console.log.apply(console, ["[duck_fill]"].concat([].slice.call(arguments))); }catch(e){} }
  function visible(b){ return !!(b.offsetWidth || b.offsetHeight || b.getClientRects().length); }
  function sent(el){
    if(!el.isConnected) return true; // 화면이 채팅 화면으로 바뀌어 입력창이 새로 만들어짐
    var v = el.tagName === "TEXTAREA" ? el.value : el.textContent;
    return !v || !v.trim();
  }
  // 입력창 주변(위로 6단계)의 버튼 중 전송 버튼 찾기
  function findSendButton(el){
    var seen = [], node = el, list = [];
    for(var i = 0; i < 6 && node; i++, node = node.parentElement){
      var bs = node.querySelectorAll ? node.querySelectorAll("button, [role='button']") : [];
      for(var j = 0; j < bs.length; j++) if(seen.indexOf(bs[j]) < 0){ seen.push(bs[j]); list.push(bs[j]); }
    }
    list = list.filter(function(b){ return visible(b) && !b.disabled && b.getAttribute("aria-disabled") !== "true"; });
    var re = /물어보기|보내기|전송|send|submit|ask/i;
    var byType = list.filter(function(b){ return b.type === "submit"; });
    if(byType.length) return byType[byType.length - 1];
    var byText = list.filter(function(b){
      return re.test((b.getAttribute("aria-label") || "") + " " + (b.getAttribute("title") || "") + " " + (b.textContent || ""));
    });
    return byText.length ? byText[byText.length - 1] : null;
  }
  function pressEnter(el){
    el.focus();
    ["keydown", "keypress", "keyup"].forEach(function(type){
      el.dispatchEvent(new KeyboardEvent(type, {key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true, cancelable: true, composed: true}));
    });
  }
  function clickReal(b){
    ["pointerdown", "mousedown", "pointerup", "mouseup", "click"].forEach(function(type){
      var C = type.indexOf("pointer") === 0 ? PointerEvent : MouseEvent;
      b.dispatchEvent(new C(type, {bubbles: true, cancelable: true, composed: true, view: window}));
    });
  }
  // 전송 방법을 차례로 시도: 각 시도 뒤 0.8초 안에 입력창이 비워지면(=전송됨) 멈춤
  function submit(el, done){
    var steps = [
      function(){ var b = findSendButton(el); log("버튼 click", b); if(b) b.click(); else return false; },
      function(){ var b = findSendButton(el); log("버튼 이벤트 클릭", b); if(b) clickReal(b); else return false; },
      function(){ var f = el.closest && el.closest("form"); log("form.requestSubmit", f); if(f && f.requestSubmit) f.requestSubmit(); else return false; },
      function(){ log("Enter 키"); pressEnter(el); }
    ];
    var i = 0;
    (function next(){
      if(sent(el)){ log("전송 확인됨"); return done(); }
      if(i >= steps.length){ log("자동 전송 실패 - 입력창에 글만 채워 둠"); return done(); }
      var r = steps[i++]();
      setTimeout(next, r === false ? 0 : 800);
    })();
  }
  function ack(id){
    try{ window.parent.postMessage({type: "aiai-duck-ack", id: id}, "*"); }catch(e){}
  }

  window.addEventListener("message", function(ev){
    var d = ev.data;
    if(!d || d.type !== "aiai-duck-query" || typeof d.text !== "string" || !d.id) return;
    if(ev.source !== window.parent || window === window.top) return;
    if(ALLOWED_PARENTS.indexOf(ev.origin) < 0) return;
    if(state[d.id] === "done"){ ack(d.id); return; }
    if(state[d.id]) return;
    state[d.id] = "run";
    waitFor(findInput, 15000, function(el){
      if(!el){ delete state[d.id]; return; } // 아직 화면이 안 떴으면 앱이 다시 보냄
      setText(el, d.text);
      setTimeout(function(){
        submit(el, function(){ state[d.id] = "done"; ack(d.id); });
      }, 700);
    });
  });
})();
