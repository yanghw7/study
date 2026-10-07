(function () {
  "use strict";

  const TARGET_TEXT = "무엇이든 물어보세요";
  let scheduled = false;

  function hideAiBox() {
    scheduled = false;

    const walker = document.createTreeWalker(
      document.body || document.documentElement,
      NodeFilter.SHOW_ELEMENT
    );

    const candidates = [];
    let node;
    while ((node = walker.nextNode())) {
      const text = (node.textContent || "").trim();
      if (text === TARGET_TEXT) candidates.push(node);
    }

    for (const el of candidates) {
      let target = el;
      let current = el;

      for (let i = 0; i < 5 && current.parentElement; i++) {
        const parent = current.parentElement;
        const rect = parent.getBoundingClientRect();
        const parentText = (parent.textContent || "").trim();

        if (
          parentText.includes(TARGET_TEXT) &&
          rect.width >= 180 &&
          rect.width <= window.innerWidth * 0.95 &&
          rect.height >= 35 &&
          rect.height <= 350
        ) {
          target = parent;
          break;
        }
        current = parent;
      }

      target.style.setProperty("display", "none", "important");
    }
  }

  function scheduleHide() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(hideAiBox);
  }

  scheduleHide();

  const observer = new MutationObserver(scheduleHide);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
