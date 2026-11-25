(() => {
  if (document.getElementById("ig-fav-floating")) return;

  const RESERVED_PATHS = new Set([
    "", "explore", "reels", "direct", "accounts", "p", "reel",
    "stories", "tv", "emails", "about", "developer", "legal", "privacy"
  ]);

  let savedUsers = []; // [{ username, avatar }]
  let isVisible = false;
  let isDark = true;
  let syncUrl = "";

  function loadFromAndroid() {
    try {
      if (window.AndroidBridge) {
        if (typeof window.AndroidBridge.loadFavorites === "function") {
          const raw = window.AndroidBridge.loadFavorites();
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) savedUsers = parsed;
          }
        }
        if (typeof window.AndroidBridge.loadThemeDark === "function") {
          isDark = window.AndroidBridge.loadThemeDark();
        }
        if (typeof window.AndroidBridge.getSyncUrl === "function") {
          syncUrl = window.AndroidBridge.getSyncUrl() || "";
        }
      }
    } catch (e) {}
  }

  function saveToAndroid(pushCloud = true) {
    try {
      const json = JSON.stringify(savedUsers);
      if (window.AndroidBridge && typeof window.AndroidBridge.saveFavorites === "function") {
        window.AndroidBridge.saveFavorites(json);
      }
      if (pushCloud && syncUrl && window.AndroidBridge && typeof window.AndroidBridge.syncPush === "function") {
        window.AndroidBridge.syncPush(json);
      }
    } catch (e) {}
  }

  // 1. 플로팅 토글 동글 버튼 (FAB)
  const fab = document.createElement("button");
  fab.id = "ig-fav-fab";
  fab.type = "button";
  fab.textContent = "★";
  fab.title = "인스타 동글 즐겨찾기 열기/닫기";
  document.body.appendChild(fab);

  let fabDragging = false;
  let fabMoved = false;
  let fabStartX = 0, fabStartY = 0, fabOrigLeft = 0, fabOrigTop = 0;

  fab.addEventListener("touchstart", (e) => {
    const t = e.touches[0];
    const rect = fab.getBoundingClientRect();
    fabDragging = true;
    fabMoved = false;
    fabStartX = t.clientX;
    fabStartY = t.clientY;
    fabOrigLeft = rect.left;
    fabOrigTop = rect.top;
  }, { passive: true });

  fab.addEventListener("touchmove", (e) => {
    if (!fabDragging) return;
    const t = e.touches[0];
    const dx = t.clientX - fabStartX;
    const dy = t.clientY - fabStartY;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
      fabMoved = true;
      const newLeft = Math.min(Math.max(8, fabOrigLeft + dx), window.innerWidth - 56);
      const newTop = Math.min(Math.max(48, fabOrigTop + dy), window.innerHeight - 64);
      fab.style.right = "auto";
      fab.style.bottom = "auto";
      fab.style.left = `${newLeft}px`;
      fab.style.top = `${newTop}px`;
    }
  }, { passive: true });

  fab.addEventListener("touchend", () => {
    fabDragging = false;
  });

  fab.addEventListener("click", (e) => {
    if (fabMoved) {
      fabMoved = false;
      return;
    }
    e.stopPropagation();
    isVisible = !isVisible;
    container.classList.toggle("visible", isVisible);
  });

  // 2. 플로팅 즐겨찾기 패널 (구글 드라이브 동기화 포함)
  const container = document.createElement("div");
  container.id = "ig-fav-floating";
  container.className = "dark";
  container.innerHTML = `
    <div class="ig-fav-top-bar">
      <span class="ig-fav-title">
        <span class="ig-sync-dot" id="ig-sync-dot"></span>
        <span>동글 즐겨찾기</span>
      </span>
      <div class="ig-fav-top-actions">
        <button class="ig-fav-icon-btn" id="ig-fav-sync-btn" type="button" title="구글 드라이브 연동">☁️</button>
        <button class="ig-fav-icon-btn" id="ig-fav-theme-btn" type="button" title="테마 변경">☀️</button>
        <button class="ig-fav-icon-btn" id="ig-fav-close-btn" type="button" title="닫기">✕</button>
      </div>
    </div>
    <div class="ig-fav-list" id="ig-fav-list"></div>
    <div class="ig-sync-panel" id="ig-sync-panel">
      <div class="ig-sync-label">구글 드라이브 연동 주소 (내 구글 아이디 동기화)</div>
      <input class="ig-sync-input" id="ig-sync-input" type="url" placeholder="https://script.google.com/macros/s/.../exec" />
      <div class="ig-sync-btn-row">
        <button class="ig-sync-btn" id="ig-sync-save-btn" type="button">연결 & 불러오기</button>
        <button class="ig-sync-btn secondary" id="ig-sync-now-btn" type="button">지금 동기화</button>
      </div>
    </div>
    <div class="ig-fav-toast" id="ig-fav-toast"></div>
  `;
  document.body.appendChild(container);

  const listEl = container.querySelector("#ig-fav-list");
  const toastEl = container.querySelector("#ig-fav-toast");
  const themeBtn = container.querySelector("#ig-fav-theme-btn");
  const closeBtn = container.querySelector("#ig-fav-close-btn");
  const syncToggleBtn = container.querySelector("#ig-fav-sync-btn");
  const syncDot = container.querySelector("#ig-sync-dot");
  const syncPanel = container.querySelector("#ig-sync-panel");
  const syncInput = container.querySelector("#ig-sync-input");
  const syncSaveBtn = container.querySelector("#ig-sync-save-btn");
  const syncNowBtn = container.querySelector("#ig-sync-now-btn");

  let toastTimer = null;
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2400);
  }

  function updateSyncIndicator() {
    syncDot.classList.toggle("connected", Boolean(syncUrl));
    syncInput.value = syncUrl;
  }

  function applyTheme(dark) {
    isDark = dark;
    container.classList.toggle("dark", isDark);
    themeBtn.textContent = isDark ? "☀️" : "🌙";
    try {
      if (window.AndroidBridge && typeof window.AndroidBridge.saveThemeDark === "function") {
        window.AndroidBridge.saveThemeDark(isDark);
      }
    } catch (e) {}
  }

  themeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    applyTheme(!isDark);
  });

  closeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    isVisible = false;
    container.classList.remove("visible");
  });

  syncToggleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = syncPanel.classList.toggle("open");
    syncToggleBtn.classList.toggle("active", isOpen);
  });

  syncSaveBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const url = (syncInput.value || "").trim();
    if (url && !url.startsWith("https://")) {
      showToast("https:// 로 시작하는 주소를 넣어주세요");
      return;
    }
    syncUrl = url;
    if (window.AndroidBridge && typeof window.AndroidBridge.setSyncUrl === "function") {
      window.AndroidBridge.setSyncUrl(syncUrl);
    }
    updateSyncIndicator();
    if (!syncUrl) {
      showToast("구글 드라이브 연동이 해제되었어요");
      return;
    }
    showToast("구글 드라이브에서 목록 불러오는 중...");
    if (window.AndroidBridge && typeof window.AndroidBridge.syncPull === "function") {
      window.AndroidBridge.syncPull();
    }
  });

  syncNowBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!syncUrl) {
      showToast("먼저 연동 주소를 입력하고 연결해 주세요!");
      return;
    }
    showToast("구글 드라이브와 동기화 중...");
    if (window.AndroidBridge && typeof window.AndroidBridge.syncPull === "function") {
      window.AndroidBridge.syncPull();
    }
  });

  // 안드로이드에서 구글 드라이브 동기화 결과 콜백
  window.__igOnSyncPullResult = (ok, remoteJson) => {
    if (!ok) {
      showToast("동기화 실패! 주소를 다시 확인해 주세요");
      return;
    }
    try {
      const remoteList = JSON.parse(remoteJson);
      if (Array.isArray(remoteList)) {
        // 원격 목록과 로컬 목록 병합 (중복 제거)
        const map = new Map();
        remoteList.forEach((u) => {
          if (u && u.username) map.set(u.username, u);
        });
        savedUsers.forEach((u) => {
          if (u && u.username && !map.has(u.username)) {
            map.set(u.username, u);
          }
        });
        savedUsers = Array.from(map.values());
        saveToAndroid(true);
        renderList();
        showToast("구글 드라이브 동기화 완료!");
      }
    } catch (e) {
      showToast("목록 형식 오류가 발생했어요");
    }
  };

  window.__igOnSyncPushResult = (ok) => {
    if (!ok) {
      showToast("클라우드 저장 실패 (기기는 저장됨)");
    }
  };

  function getCurrentProfile() {
    const segments = window.location.pathname.split("/").filter(Boolean);
    if (segments.length === 0) return null;

    const username = segments[0];
    if (RESERVED_PATHS.has(username.toLowerCase())) return null;

    const headerImg =
      document.querySelector('header img[alt*="프로필"]') ||
      document.querySelector('header img[alt*="profile" i]') ||
      document.querySelector("header img");

    const avatar = headerImg ? headerImg.src : "";
    return { username, avatar };
  }

  function createFallbackAvatar(username) {
    const div = document.createElement("div");
    div.className = "ig-fav-avatar ig-fav-fallback";
    div.textContent = username.charAt(0).toUpperCase();
    return div;
  }

  function renderList() {
    listEl.innerHTML = "";

    savedUsers.forEach((user) => {
      const item = document.createElement("div");
      item.className = "ig-fav-item";

      const avatarWrap = document.createElement("div");
      avatarWrap.className = "ig-fav-avatar-wrap";

      if (user.avatar) {
        const img = document.createElement("img");
        img.src = user.avatar;
        img.alt = user.username;
        img.className = "ig-fav-avatar";
        img.onerror = () => img.replaceWith(createFallbackAvatar(user.username));
        avatarWrap.appendChild(img);
      } else {
        avatarWrap.appendChild(createFallbackAvatar(user.username));
      }

      const delBtn = document.createElement("button");
      delBtn.className = "ig-fav-del";
      delBtn.type = "button";
      delBtn.textContent = "×";
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        savedUsers = savedUsers.filter((u) => u.username !== user.username);
        saveToAndroid(true);
        renderList();
      });

      const name = document.createElement("span");
      name.className = "ig-fav-name";
      name.textContent = user.username;

      item.appendChild(avatarWrap);
      item.appendChild(delBtn);
      item.appendChild(name);

      item.addEventListener("click", () => {
        isVisible = false;
        container.classList.remove("visible");
        window.location.href = `https://www.instagram.com/${user.username}/`;
      });

      listEl.appendChild(item);
    });

    const addItem = document.createElement("div");
    addItem.className = "ig-fav-item";
    addItem.innerHTML = `
      <div class="ig-fav-add-circle">+</div>
      <span class="ig-fav-name">추가</span>
    `;
    addItem.addEventListener("click", () => {
      const profile = getCurrentProfile();
      if (!profile) {
        showToast("프로필 페이지에서 눌러주세요!");
        return;
      }
      if (savedUsers.some((u) => u.username === profile.username)) {
        showToast("이미 추가된 계정이에요");
        return;
      }
      savedUsers.push(profile);
      saveToAndroid(true);
      renderList();
      showToast(`${profile.username} 추가 완료!`);
    });

    listEl.appendChild(addItem);
  }

  loadFromAndroid();
  applyTheme(isDark);
  updateSyncIndicator();
  renderList();

  // 앱 시작 시 구글 연동이 설정되어 있으면 1회 자동 동기화
  if (syncUrl && !window.__igInitialSyncDone) {
    window.__igInitialSyncDone = true;
    setTimeout(() => {
      if (window.AndroidBridge && typeof window.AndroidBridge.syncPull === "function") {
        window.AndroidBridge.syncPull();
      }
    }, 1200);
  }

  // ==========================================
  // 3. 게시물 사진 + 동영상/릴스 원본 갤러리 저장 버튼
  // ==========================================
  const saveBtn = document.createElement("button");
  saveBtn.id = "ig-photo-save-btn";
  saveBtn.type = "button";
  saveBtn.innerHTML = `<span>⬇</span><span class="ig-save-label">사진 저장</span>`;
  document.body.appendChild(saveBtn);

  let activeMedia = null; // { type: "video" | "image", el: HTMLElement }
  let btnResetTimer = null;

  function isProfileAvatar(img) {
    if (!img) return true;
    const alt = (img.alt || "").toLowerCase();
    if (alt.includes("프로필 사진") || alt.includes("profile picture")) return true;
    const r = img.getBoundingClientRect();
    if (img.closest("header") && r.width < 180) return true;
    if (img.closest("#ig-fav-floating")) return true;
    return false;
  }

  function getOriginalImageUrl(img) {
    const srcset = img.getAttribute("srcset");
    if (srcset) {
      const candidates = srcset
        .split(",")
        .map((part) => {
          const tokens = part.trim().split(/\s+/);
          return { url: tokens[0], width: parseInt(tokens[1] || "0", 10) || 0 };
        })
        .filter((c) => c.url);
      if (candidates.length > 0) {
        candidates.sort((a, b) => b.width - a.width);
        return candidates[0].url;
      }
    }
    return img.currentSrc || img.src || "";
  }

  function extractShortcodeNear(el) {
    // 1) 현재 주소에서 추출 (/reel/CODE, /reels/CODE, /p/CODE, /tv/CODE)
    const m = window.location.pathname.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
    if (m && m[1]) return m[1];

    // 2) 요소 주변 article / dialog / section 내 링크에서 추출
    const containerEl =
      (el && (el.closest('div[role="dialog"]') || el.closest("article") || el.closest("section"))) ||
      document;
    const links = containerEl.querySelectorAll('a[href*="/reel/"], a[href*="/p/"], a[href*="/tv/"]');
    for (let i = 0; i < links.length; i++) {
      const href = links[i].getAttribute("href") || "";
      const lm = href.match(/\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
      if (lm && lm[1]) return lm[1];
    }
    return "";
  }

  function shortcodeToMediaId(shortcode) {
    if (!shortcode) return "";
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    try {
      let id = 0n;
      for (let i = 0; i < shortcode.length; i++) {
        const idx = alphabet.indexOf(shortcode[i]);
        if (idx < 0) return "";
        id = id * 64n + BigInt(idx);
      }
      return id.toString();
    } catch (_) {
      return "";
    }
  }

  function pickBestVideoFromItem(item) {
    if (!item) return "";
    if (Array.isArray(item.video_versions) && item.video_versions.length > 0) {
      const sorted = item.video_versions
        .filter((v) => v && v.url)
        .sort((a, b) => ((b.width || 0) * (b.height || 0)) - ((a.width || 0) * (a.height || 0)));
      if (sorted[0]) return sorted[0].url;
    }
    if (Array.isArray(item.carousel_media)) {
      for (const c of item.carousel_media) {
        const u = pickBestVideoFromItem(c);
        if (u) return u;
      }
    }
    return item.video_url || "";
  }

  async function resolveVideoUrl(videoEl) {
    if (typeof window.__igScanDocumentScripts === "function") {
      window.__igScanDocumentScripts();
    }

    // 1) 직접 http(s) URL을 가진 <video> 또는 <source>
    const directCandidates = [videoEl.currentSrc, videoEl.src];
    const sources = videoEl.querySelectorAll("source");
    sources.forEach((s) => s.src && directCandidates.push(s.src));
    for (const c of directCandidates) {
      if (c && typeof c === "string" && c.startsWith("http")) {
        return c;
      }
    }

    const store = window.__igVideoStore || { byCode: {}, byThumbKey: {}, recent: [] };
    const code = extractShortcodeNear(videoEl);

    // 2) 후킹된 네트워크/SSR JSON 캐시에서 shortcode로 조회
    if (code && store.byCode[code]) {
      return store.byCode[code];
    }

    // 3) 썸네일(poster 또는 인접 img) 키로 캐시 조회
    const extractKey = window.__igExtractThumbKey;
    if (typeof extractKey === "function") {
      const posterKey = extractKey(videoEl.getAttribute("poster") || "");
      if (posterKey && store.byThumbKey[posterKey]) {
        return store.byThumbKey[posterKey];
      }
      const parent = videoEl.parentElement && videoEl.parentElement.parentElement;
      if (parent) {
        const imgs = parent.querySelectorAll("img");
        for (let i = 0; i < imgs.length; i++) {
          const k = extractKey(imgs[i].currentSrc || imgs[i].src || "");
          if (k && store.byThumbKey[k]) {
            return store.byThumbKey[k];
          }
        }
      }
    }

    // 4) Instagram 내부 Media Info API로 원본 MP4 직접 조회 (로그인 쿠키 자동 포함)
    if (code) {
      const codeCandidates = code.length > 11 ? [code, code.slice(0, 11)] : [code];
      for (const cd of codeCandidates) {
        const mediaId = shortcodeToMediaId(cd);
        if (!mediaId) continue;
        try {
          const res = await fetch(`https://www.instagram.com/api/v1/media/${mediaId}/info/`, {
            credentials: "include",
            headers: {
              "X-IG-App-ID": "936619743392459",
              "X-Requested-With": "XMLHttpRequest",
              "Accept": "*/*"
            }
          });
          if (res.ok) {
            const data = await res.json();
            if (window.__igScanJsonObject) window.__igScanJsonObject(data);
            const item = data && Array.isArray(data.items) ? data.items[0] : null;
            const url = pickBestVideoFromItem(item);
            if (url) return url;
          }
        } catch (_) {}
      }

      // 5) 게시물/릴스 페이지 HTML에서 video_versions / video_url 추출 폴백
      try {
        const res = await fetch(`https://www.instagram.com/reel/${code}/`, { credentials: "include" });
        if (res.ok) {
          const html = await res.text();
          const m = html.match(/"video_versions"\s*:\s*(\[[\s\S]*?\])/);
          if (m && m[1]) {
            const arr = JSON.parse(m[1]);
            const u = pickBestVideoFromItem({ video_versions: arr });
            if (u) return u;
          }
          const m2 = html.match(/"video_url"\s*:\s*"(https:[^"]+)"/);
          if (m2 && m2[1]) {
            return m2[1].replace(/\\u0026/g, "&").replace(/\\\//g, "/");
          }
        }
      } catch (_) {}
    }

    // 6) 최후 폴백: 가장 최근 감지된 릴스 영상 URL
    if (store.recent && store.recent.length > 0 && Date.now() - store.recent[0].ts < 60000) {
      return store.recent[0].url;
    }

    return "";
  }

  function buildFilename(url, el, isVideo) {
    let username = "instagram";
    const holder = el.closest('div[role="dialog"]') || el.closest("article");
    if (holder) {
      const authorLink = holder.querySelector("header a[href^='/']");
      if (authorLink) {
        const seg = authorLink.getAttribute("href").split("/").filter(Boolean)[0];
        if (seg && !RESERVED_PATHS.has(seg.toLowerCase())) username = seg;
      }
    }
    if (username === "instagram") {
      const prof = getCurrentProfile();
      if (prof && prof.username) username = prof.username;
    }
    const safeUser = username.replace(/[^a-zA-Z0-9._-]/g, "_");
    let ext = isVideo ? "mp4" : "jpg";
    if (!isVideo) {
      try {
        const pathname = new URL(url).pathname.toLowerCase();
        if (pathname.endsWith(".png")) ext = "png";
        else if (pathname.endsWith(".webp")) ext = "webp";
      } catch (_) {}
    }

    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    return `ig_${safeUser}_${stamp}.${ext}`;
  }

  function findVisibleVideo(root, containerRect) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const videos = Array.from(root.querySelectorAll("video")).filter((v) => {
      const r = v.getBoundingClientRect();
      if (r.width < 160 || r.height < 160) return false;
      const leftBound = containerRect ? Math.max(containerRect.left, 0) : 0;
      const rightBound = containerRect ? Math.min(containerRect.right, vw) : vw;
      const visibleW = Math.min(r.right, rightBound) - Math.max(r.left, leftBound);
      if (visibleW < r.width * 0.4) return false;
      const visibleH = Math.min(r.bottom, vh - 50) - Math.max(r.top, 40);
      return visibleH > r.height * 0.35;
    });

    if (videos.length === 0) return null;

    const vpCenterY = vh / 2;
    videos.sort((a, b) => {
      // 재생 중인 영상 우선, 그 다음 화면 중앙에 가장 가까운 영상
      const playingDiff = Number(a.paused) - Number(b.paused);
      if (playingDiff !== 0) return playingDiff;
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      return Math.abs((ra.top + ra.height / 2) - vpCenterY) - Math.abs((rb.top + rb.height / 2) - vpCenterY);
    });
    return videos[0];
  }

  function findActiveMedia() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // 1) 팝업 모달 (div[role="dialog"])
    const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'));
    for (let i = dialogs.length - 1; i >= 0; i--) {
      const dialog = dialogs[i];
      const dRect = dialog.getBoundingClientRect();
      if (dRect.width < 200 || dRect.height < 200) continue;

      const vid = findVisibleVideo(dialog, dRect);
      if (vid) return { type: "video", el: vid };

      const imgs = Array.from(dialog.querySelectorAll("img")).filter((img) => {
        if (isProfileAvatar(img)) return false;
        const r = img.getBoundingClientRect();
        if (r.width < 180 || r.height < 180) return false;
        const visibleWidth = Math.min(r.right, dRect.right, vw) - Math.max(r.left, dRect.left, 0);
        return visibleWidth > r.width * 0.45;
      });

      if (imgs.length > 0) {
        const cx = dRect.left + dRect.width / 2;
        imgs.sort((a, b) => {
          const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
          return Math.abs((ra.left + ra.width / 2) - cx) - Math.abs((rb.left + rb.width / 2) - cx);
        });
        return { type: "image", el: imgs[0] };
      }
    }

    // 2) 화면 중앙에 보이는 릴스/동영상 감지
    const pageVideo = findVisibleVideo(document, null);
    if (pageVideo) {
      return { type: "video", el: pageVideo };
    }

    // 3) 게시물 상세 페이지 및 큰 피드 게시물 사진 감지
    const path = window.location.pathname;
    const isPostPage = /\/(p|reel|reels|stories|tv)\//.test(path);
    const minW = Math.min(260, vw * 0.65);

    const selector = isPostPage ? "article img, main img, section img" : "article img";
    const imgs = Array.from(document.querySelectorAll(selector)).filter((img) => {
      if (isProfileAvatar(img)) return false;
      const r = img.getBoundingClientRect();
      if (r.width < minW || r.height < 180) return false;
      const visibleLeft = Math.max(r.left, 0);
      const visibleRight = Math.min(r.right, vw);
      if (visibleRight - visibleLeft < r.width * 0.45) return false;
      return r.bottom > 80 && r.top < vh - 80;
    });

    if (imgs.length > 0) {
      const vpCenterY = vh / 2;
      imgs.sort((a, b) => {
        const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        return Math.abs((ra.top + ra.height / 2) - vpCenterY) - Math.abs((rb.top + rb.height / 2) - vpCenterY);
      });
      return { type: "image", el: imgs[0] };
    }

    return null;
  }

  let rafScheduled = false;
  function updateSaveButtonPosition() {
    rafScheduled = false;
    const media = findActiveMedia();

    if (!media) {
      activeMedia = null;
      saveBtn.classList.remove("visible", "video-mode");
      return;
    }

    const rect = media.el.getBoundingClientRect();
    if (rect.width < 140 || rect.height < 140 || rect.bottom < 0 || rect.top > window.innerHeight) {
      activeMedia = null;
      saveBtn.classList.remove("visible", "video-mode");
      return;
    }

    activeMedia = media;
    saveBtn.classList.add("visible");

    const isVideo = media.type === "video";
    saveBtn.classList.toggle("video-mode", isVideo);

    if (!saveBtn.disabled && !saveBtn.classList.contains("saved")) {
      const labelEl = saveBtn.querySelector(".ig-save-label");
      labelEl.textContent = isVideo ? "영상 저장" : "사진 저장";
    }

    const btnWidth = saveBtn.offsetWidth || 104;
    const top = Math.max(52, Math.min(window.innerHeight - 140, rect.top + 12));
    const left = Math.min(window.innerWidth - btnWidth - 12, Math.max(12, rect.right - btnWidth - 12));

    saveBtn.style.top = `${top}px`;
    saveBtn.style.left = `${left}px`;
  }

  function scheduleUpdate() {
    if (!rafScheduled) {
      rafScheduled = true;
      requestAnimationFrame(updateSaveButtonPosition);
    }
  }

  // 안드로이드에서 직접 다운로드 실패 시 JS fetch 폴백 (사진용)
  window.__igFallbackFetch = async (url, filename) => {
    try {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("fetch failed");
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result;
        if (typeof dataUrl === "string" && window.AndroidBridge && window.AndroidBridge.saveBase64Image) {
          window.AndroidBridge.saveBase64Image(dataUrl, filename);
        } else {
          window.__igOnDownloadResult(false, false);
        }
      };
      reader.onerror = () => window.__igOnDownloadResult(false, false);
      reader.readAsDataURL(blob);
    } catch (e) {
      window.__igOnDownloadResult(false, false);
    }
  };

  window.__igOnDownloadResult = (ok, isVideo) => {
    const labelEl = saveBtn.querySelector(".ig-save-label");
    saveBtn.disabled = false;
    clearTimeout(btnResetTimer);
    if (ok) {
      labelEl.textContent = isVideo ? "영상 저장 완료!" : "갤러리 저장 완료!";
      saveBtn.classList.add("saved");
    } else {
      labelEl.textContent = "저장 실패";
    }
    btnResetTimer = setTimeout(() => {
      saveBtn.classList.remove("saved");
      labelEl.textContent = activeMedia && activeMedia.type === "video" ? "영상 저장" : "사진 저장";
    }, 2000);
  };

  saveBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!activeMedia) return;

    const isVideo = activeMedia.type === "video";
    const labelEl = saveBtn.querySelector(".ig-save-label");
    saveBtn.disabled = true;
    labelEl.textContent = isVideo ? "영상 찾는 중..." : "저장 중...";

    let url = "";
    if (isVideo) {
      url = await resolveVideoUrl(activeMedia.el);
    } else {
      url = getOriginalImageUrl(activeMedia.el);
    }

    if (!url) {
      window.__igOnDownloadResult(false, isVideo);
      return;
    }

    labelEl.textContent = isVideo ? "영상 저장 중..." : "저장 중...";
    const filename = buildFilename(url, activeMedia.el, isVideo);

    if (window.AndroidBridge && typeof window.AndroidBridge.downloadMedia === "function") {
      window.AndroidBridge.downloadMedia(url, filename, isVideo);
    } else if (window.AndroidBridge && typeof window.AndroidBridge.downloadImage === "function") {
      window.AndroidBridge.downloadImage(url, filename);
    } else {
      window.__igOnDownloadResult(false, isVideo);
    }
  });

  const observer = new MutationObserver(scheduleUpdate);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "srcset", "style"] });
  window.addEventListener("scroll", scheduleUpdate, true);
  window.addEventListener("resize", scheduleUpdate);
  document.addEventListener("touchend", () => setTimeout(scheduleUpdate, 220), true);
  setInterval(scheduleUpdate, 600);
})();
