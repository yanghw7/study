// hide_contents.js
// 구글을 "직접" 열었을 때는 아무것도 숨기지 않고,
// yanghw7.github.io / file:// 등 구글이 아닌 페이지가 iframe으로 불러온 구글 화면에서만 숨깁니다.
(function () {
  'use strict';

  // ── 1) 어디서 열렸는지 판단 ─────────────────────────────────────────
  function isEmbeddedByNonGoogle() {
    if (window === window.top) return false; // 직접 접속 → 숨기지 않음

    const ancestors = location.ancestorOrigins
      ? Array.from(location.ancestorOrigins)
      : [];
    let topOrigin = ancestors.length ? ancestors[ancestors.length - 1] : '';

    if (!topOrigin && document.referrer) {
      try { topOrigin = new URL(document.referrer).origin; } catch (e) {}
    }

    // 부모를 알 수 없으면(file:// 은 "null" 로 보일 수 있음) 구글이 아닌 것으로 간주
    if (!topOrigin) return true;

    const isGoogleParent =
      /^https:\/\/([a-z0-9-]+\.)*google\.(com|co\.kr)$/i.test(topOrigin);
    return !isGoogleParent;
  }

  const shouldHide = isEmbeddedByNonGoogle();
  console.log(
    '[hide_contents] 프레임:', location.href,
    '| 최상위 부모:',
    (location.ancestorOrigins &&
      location.ancestorOrigins[location.ancestorOrigins.length - 1]) ||
      document.referrer || '(없음)',
    '| 숨김 적용:', shouldHide
  );
  if (!shouldHide) return;

  // ── 2) 숨길 대상 ────────────────────────────────────────────────────
  // 상단 컨트롤 / 설정 메뉴 / 입력 영역 전체(.AgWCw)
  const HIDE_SELECTORS = [
    'div[jsname="NlVIob"]',
    'button[aria-label="AI 모드 기록"]',
    'button[aria-label="사이드바 열기"]',
    'button[aria-label="새 대화목록"]',
    'div[role="button"][aria-label="설정"]',
    'button[data-value="manage_public_links"]',
    'a[data-value="my_activity"]',
    'a[data-value="personalization"]',
    'a[data-value="connected_content_apps"]',
    '.AgWCw'
  ];

  // 입력창 관련 요소 → 찾으면 "입력 영역 전체"를 숨김
  const INPUT_SELECTORS = [
    'textarea[aria-label="무엇이든 물어보세요"]',
    'textarea[placeholder="무엇이든 물어보세요"]',
    'button[aria-label="파일 및 도구 추가"]',
    'div[data-is-aim-input-menu="true"]'
  ];

  const HIDE_SELECTOR = HIDE_SELECTORS.join(',');
  const INPUT_SELECTOR = INPUT_SELECTORS.join(',');

  // ── 3) CSS 주입 (깜빡임 방지) ───────────────────────────────────────
  function injectStyle() {
    if (document.getElementById('__hide_contents_style__')) return;
    const style = document.createElement('style');
    style.id = '__hide_contents_style__';
    style.textContent =
      HIDE_SELECTOR + ',' + INPUT_SELECTOR +
      ' { display: none !important; visibility: hidden !important;' +
      ' opacity: 0 !important; pointer-events: none !important; }';
    (document.head || document.documentElement).appendChild(style);
  }

  // ── 4) 인라인 스타일로 확실히 숨기기 (shadow DOM 포함) ──────────────
  function forceHide(el) {
    if (!el || !el.isConnected) return;
    el.style.setProperty('display', 'none', 'important');
    el.style.setProperty('visibility', 'hidden', 'important');
    el.style.setProperty('opacity', '0', 'important');
    el.style.setProperty('pointer-events', 'none', 'important');
  }

  function hideWholeInputBox(el) {
    // 요소 → .Txyg0d → .yaj8zd → .esoFne → 전체 입력 영역 .AgWCw
    const target =
      el.closest('.AgWCw') ||
      el.closest('.esoFne') ||
      el.closest('.yaj8zd') ||
      el.closest('.Txyg0d') ||
      el;
    forceHide(target);
  }

  function scan(root) {
    if (!root || !root.querySelectorAll) return;

    root.querySelectorAll(HIDE_SELECTOR).forEach(forceHide);
    root.querySelectorAll(INPUT_SELECTOR).forEach(hideWholeInputBox);

    for (const host of root.querySelectorAll('*')) {
      if (host.shadowRoot) scan(host.shadowRoot);
    }
  }

  // ── 5) 실행 + 변화 감시 ─────────────────────────────────────────────
  let queued = false;
  function scheduleScan() {
    if (queued) return;
    queued = true;
    const run = () => {
      queued = false;
      injectStyle();
      scan(document);
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else setTimeout(run, 0);
  }

  injectStyle();
  scheduleScan();
  document.addEventListener('DOMContentLoaded', scheduleScan, { once: true });
  window.addEventListener('load', scheduleScan, { once: true });

  const observer = new MutationObserver(scheduleScan);
  function startObserver() {
    if (!document.documentElement) return;
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
  if (document.documentElement) startObserver();
  else document.addEventListener('DOMContentLoaded', startObserver, { once: true });
})();
