// hide_contents.js
// Google AI 모드 상단 컨트롤(AI 모드 기록 / 사이드바 열기 / 새 대화목록 / 설정 메뉴)을 숨깁니다.
// manifest.json 의 content_scripts (run_at: document_start, all_frames: true) 와 함께 사용하세요.

(function () {
  "use strict";

  // 숨길 대상 선택자 (클래스명은 자주 바뀌므로 jsname / aria-label 위주로 지정)
  const SELECTORS = [
    // 붙여넣은 전체 컨테이너
    'div[jsname="NlVIob"]',
    // 개별 버튼 (컨테이너 구조가 바뀌어도 숨겨지도록 보조로 지정)
    'button[aria-label="AI 모드 기록"]',
    'button[aria-label="사이드바 열기"]',
    'button[aria-label="새 대화목록"]',
    'div[role="button"][aria-label="설정"]',
    // 설정 메뉴 항목
    'button[data-value="manage_public_links"]',
    'a[data-value="my_activity"]',
    'a[data-value="personalization"]',
    'a[data-value="connected_content_apps"]'
  ];

  // 1) CSS 주입: 페이지가 그려지기 전에 바로 적용되어 깜빡임이 없음
  const css =
    SELECTORS.join(",\n") +
    ` {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }`;

  function injectStyle() {
    if (document.getElementById("__hide_contents_style__")) return;
    const style = document.createElement("style");
    style.id = "__hide_contents_style__";
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  // 2) 보조: 동적으로 생성되는 요소에 인라인 스타일 직접 적용
  function hideAll() {
    SELECTORS.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => {
        el.style.setProperty("display", "none", "important");
        el.style.setProperty("visibility", "hidden", "important");
        el.style.setProperty("opacity", "0", "important");
        el.style.setProperty("pointer-events", "none", "important");
      });
    });
  }

  injectStyle();

  // 스타일 태그가 지워지는 경우 대비 + 동적 요소 감시
  const observer = new MutationObserver(() => {
    injectStyle();
    hideAll();
  });

  function startObserver() {
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
    hideAll();
  }

  if (document.documentElement) {
    startObserver();
  } else {
    document.addEventListener("DOMContentLoaded", startObserver, { once: true });
  }
})();