(() => {
  if (document.getElementById("ig-fav-floating")) return;

  const RESERVED_PATHS = new Set([
    "", "explore", "reels", "direct", "accounts", "p", "reel",
    "stories", "tv", "emails", "about", "developer", "legal", "privacy"
  ]);

  let savedUsers = [];
  let isVisible = false;
  let isDark = true;

  function loadFromAndroid() {
    try {
      if (window.AndroidBridge && typeof window.AndroidBridge.loadFavorites === "function") {
        const raw = window.AndroidBridge.loadFavorites();
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) savedUsers = parsed;
        }
        isDark = window.AndroidBridge.loadThemeDark();
      }
    } catch (e) {}
  }

  function saveToAndroid() {
    try {
      if (window.AndroidBridge && typeof window.AndroidBridge.saveFavorites === "function") {
        window.AndroidBridge.saveFavorites(JSON.stringify(savedUsers));
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

  // 2. 플로팅 즐겨찾기 패널
  const container = document.createElement("div");
  container.id = "ig-fav-floating";
  container.className = "dark";
  container.innerHTML = `
    <div class="ig-fav-top-bar">
      <span class="ig-fav-title">동글 즐겨찾기</span>
      <div class="ig-fav-top-actions">
        <button class="ig-fav-icon-btn" id="ig-fav-theme-btn" type="button">☀️</button>
        <button class="ig-fav-icon-btn" id="ig-fav-close-btn" type="button">✕</button>
      </div>
    </div>
    <div class="ig-fav-list" id="ig-fav-list"></div>
    <div class="ig-fav-toast" id="ig-fav-toast"></div>
  `;
  document.body.appendChild(container);

  const listEl = container.querySelector("#ig-fav-list");
  const toastEl = container.querySelector("#ig-fav-toast");
  const themeBtn = container.querySelector("#ig-fav-theme-btn");
  const closeBtn = container.querySelector("#ig-fav-close-btn");

  let toastTimer = null;
  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 2000);
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
        saveToAndroid();
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
      saveToAndroid();
      renderList();
      showToast(`${profile.username} 추가 완료!`);
    });

    listEl.appendChild(addItem);
  }

  loadFromAndroid();
  applyTheme(isDark);
  renderList();

  // ==========================================
  // 3. 게시물 사진 클릭 시 원본 화질 갤러리 저장 버튼
  // ==========================================
  const saveBtn = document.createElement("button");
  saveBtn.id = "ig-photo-save-btn";
  saveBtn.type = "button";
  saveBtn.innerHTML = `<span>⬇</span><span class="ig-save-label">사진 저장</span>`;
  document.body.appendChild(saveBtn);

  let activePhotoImg = null;
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

  function buildFilename(url, img) {
    let username = "instagram";
    const holder = img.closest('div[role="dialog"]') || img.closest("article");
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
    let ext = "jpg";
    try {
      const pathname = new URL(url).pathname.toLowerCase();
      if (pathname.endsWith(".png")) ext = "png";
      else if (pathname.endsWith(".webp")) ext = "webp";
    } catch (_) {}

    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    return `ig_${safeUser}_${stamp}.${ext}`;
  }

  function findOpenedPhotoImage() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // 1) 팝업 모달 (div[role="dialog"])
    const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'));
    for (let i = dialogs.length - 1; i >= 0; i--) {
      const dialog = dialogs[i];
      const dRect = dialog.getBoundingClientRect();
      if (dRect.width < 200 || dRect.height < 200) continue;

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
        return imgs[0];
      }
    }

    // 2) 게시물 상세 페이지 (/p/... 또는 /{username}/p/... 또는 /reel/...) 및 큰 피드 게시물(<article>)
    const path = window.location.pathname;
    const isPostPage = /\/(p|reel|stories)\//.test(path);
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
      return imgs[0];
    }

    return null;
  }

  let rafScheduled = false;
  function updateSaveButtonPosition() {
    rafScheduled = false;
    const img = findOpenedPhotoImage();

    if (!img) {
      activePhotoImg = null;
      saveBtn.classList.remove("visible");
      return;
    }

    const rect = img.getBoundingClientRect();
    if (rect.width < 140 || rect.height < 140 || rect.bottom < 0 || rect.top > window.innerHeight) {
      activePhotoImg = null;
      saveBtn.classList.remove("visible");
      return;
    }

    activePhotoImg = img;
    saveBtn.classList.add("visible");

    const btnWidth = saveBtn.offsetWidth || 104;
    const top = Math.max(52, Math.min(window.innerHeight - 130, rect.top + 12));
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

  // 안드로이드에서 직접 다운로드 실패 시 JS fetch로 폴백
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
          window.__igOnDownloadResult(false);
        }
      };
      reader.onerror = () => window.__igOnDownloadResult(false);
      reader.readAsDataURL(blob);
    } catch (e) {
      window.__igOnDownloadResult(false);
    }
  };

  window.__igOnDownloadResult = (ok) => {
    const labelEl = saveBtn.querySelector(".ig-save-label");
    saveBtn.disabled = false;
    clearTimeout(btnResetTimer);
    if (ok) {
      labelEl.textContent = "갤러리 저장 완료!";
      saveBtn.classList.add("saved");
    } else {
      labelEl.textContent = "저장 실패";
    }
    btnResetTimer = setTimeout(() => {
      labelEl.textContent = "사진 저장";
      saveBtn.classList.remove("saved");
    }, 1800);
  };

  saveBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!activePhotoImg) return;

    const url = getOriginalImageUrl(activePhotoImg);
    if (!url) return;

    const filename = buildFilename(url, activePhotoImg);
    const labelEl = saveBtn.querySelector(".ig-save-label");
    saveBtn.disabled = true;
    labelEl.textContent = "저장 중...";

    if (window.AndroidBridge && typeof window.AndroidBridge.downloadImage === "function") {
      window.AndroidBridge.downloadImage(url, filename);
    }
  });

  const observer = new MutationObserver(scheduleUpdate);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "srcset", "style"] });
  window.addEventListener("scroll", scheduleUpdate, true);
  window.addEventListener("resize", scheduleUpdate);
  document.addEventListener("touchend", () => setTimeout(scheduleUpdate, 220), true);
  setInterval(scheduleUpdate, 600);
})();
