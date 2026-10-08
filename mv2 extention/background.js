// MV2 방식: 응답 헤더에서 iframe 막는 헤더 제거
chrome.webRequest.onHeadersReceived.addListener(
  function (details) {
    const headers = details.responseHeaders || [];
    const filtered = headers.filter(function (h) {
      const name = (h.name || "").toLowerCase();
      return name !== "x-frame-options" &&
             name !== "content-security-policy" &&
             name !== "content-security-policy-report-only";
    });
    return { responseHeaders: filtered };
  },
  {
    urls: [
      "*://*.google.com/*",
      "*://*.google.co.kr/*",
      "*://*.naver.com/*"
    ],
    types: ["sub_frame"]
  },
  ["blocking", "responseHeaders"]
);