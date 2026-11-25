(() => {
  if (window.__igMediaHookInstalled) return;
  window.__igMediaHookInstalled = true;

  const store = (window.__igVideoStore = window.__igVideoStore || {
    byCode: Object.create(null),
    byPk: Object.create(null),
    byThumbKey: Object.create(null),
    recent: []
  });

  function extractThumbKey(url) {
    if (!url || typeof url !== "string") return "";
    try {
      const p = new URL(url).pathname;
      const seg = p.split("/").pop() || "";
      return seg.split("?")[0];
    } catch (_) {
      return "";
    }
  }

  function pickBestVideoUrl(obj) {
    if (!obj || typeof obj !== "object") return "";
    if (Array.isArray(obj.video_versions) && obj.video_versions.length > 0) {
      const sorted = obj.video_versions
        .filter((v) => v && typeof v.url === "string" && v.url.startsWith("http"))
        .sort((a, b) => ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0)));
      if (sorted.length > 0) return sorted[0].url;
    }
    if (typeof obj.video_url === "string" && obj.video_url.startsWith("http")) {
      return obj.video_url;
    }
    return "";
  }

  function registerVideoEntry(obj, videoUrl) {
    if (!videoUrl) return;
    const code = obj.code || obj.shortcode || "";
    const pk = obj.pk || obj.id || "";
    if (code) store.byCode[String(code)] = videoUrl;
    if (pk) store.byPk[String(pk).split("_")[0]] = videoUrl;

    // 썸네일 키로도 매핑 (릴스 피드에서 URL에 code가 없을 때 매칭용)
    const thumbs = [];
    if (obj.image_versions2 && Array.isArray(obj.image_versions2.candidates)) {
      obj.image_versions2.candidates.forEach((c) => c && c.url && thumbs.push(c.url));
    }
    if (typeof obj.display_url === "string") thumbs.push(obj.display_url);
    if (typeof obj.thumbnail_src === "string") thumbs.push(obj.thumbnail_src);

    thumbs.forEach((tUrl) => {
      const key = extractThumbKey(tUrl);
      if (key) store.byThumbKey[key] = videoUrl;
    });

    const entry = { code: String(code), url: videoUrl, ts: Date.now() };
    store.recent.unshift(entry);
    if (store.recent.length > 60) store.recent.length = 60;
  }

  function scanJsonObject(node, depth) {
    if (!node || typeof node !== "object" || depth > 18) return;
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        scanJsonObject(node[i], depth + 1);
      }
      return;
    }

    const vUrl = pickBestVideoUrl(node);
    if (vUrl) {
      registerVideoEntry(node, vUrl);
    }

    for (const k in node) {
      if (!Object.prototype.hasOwnProperty.call(node, k)) continue;
      const val = node[k];
      if (val && typeof val === "object") {
        scanJsonObject(val, depth + 1);
      }
    }
  }

  function scanRawText(text) {
    if (!text || text.length < 40) return;
    if (!text.includes("video_versions") && !text.includes("video_url")) return;
    try {
      const cleaned = text.startsWith("for (;;);") ? text.slice(9) : text;
      const parsed = JSON.parse(cleaned);
      scanJsonObject(parsed, 0);
    } catch (_) {
      // 스트리밍 JSON 라인별 파싱 시도
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith("{") && (line.includes("video_versions") || line.includes("video_url"))) {
          try {
            scanJsonObject(JSON.parse(line), 0);
          } catch (__) {}
        }
      }
    }
  }

  window.__igScanDocumentScripts = () => {
    try {
      const scripts = document.querySelectorAll('script[type="application/json"]');
      scripts.forEach((s) => {
        if (s.dataset.igScanned) return;
        s.dataset.igScanned = "1";
        scanRawText(s.textContent || "");
      });
    } catch (_) {}
  };

  window.__igExtractThumbKey = extractThumbKey;
  window.__igScanJsonObject = (obj) => scanJsonObject(obj, 0);
  window.__igScanRawText = scanRawText;

  // fetch 후킹
  const origFetch = window.fetch;
  if (typeof origFetch === "function") {
    window.fetch = function (...args) {
      const promise = origFetch.apply(this, args);
      promise
        .then((res) => {
          try {
            const ct = (res.headers && res.headers.get("content-type")) || "";
            if (ct.includes("json") || ct.includes("text") || ct.includes("javascript")) {
              res.clone().text().then(scanRawText).catch(() => {});
            }
          } catch (_) {}
        })
        .catch(() => {});
      return promise;
    };
  }

  // XMLHttpRequest 후킹
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener("load", function () {
      try {
        if (this.responseType === "" || this.responseType === "text") {
          scanRawText(this.responseText);
        }
      } catch (_) {}
    });
    return origSend.apply(this, args);
  };
})();
