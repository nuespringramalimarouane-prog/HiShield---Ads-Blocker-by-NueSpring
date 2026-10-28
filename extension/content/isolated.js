/*
 * Layers 3-5 + bridge (extension isolated world):
 *  - applies the local on/off setting
 *  - fallback ad skipper (mute, fast-forward, click Skip)
 *  - anti-adblock wall remover
 *  - relays stats to the service worker
 */
(() => {
  "use strict";
  if (window.__hishield_iso) return;
  window.__hishield_iso = true;

  const S = { on: true };

  function applyConfig() {
    document.documentElement.dataset.hishield = S.on ? "on" : "off";
    window.postMessage({ source: "hishield-iso", type: "config", enabled: S.on }, "*");
  }

  async function loadState() {
    try {
      const st = await chrome.runtime.sendMessage({ type: "getState" });
      if (st && !st.error) { S.on = !!st.shouldBlock; applyConfig(); }
    } catch (_) { /* extension reloaded; page needs refresh */ }
  }

  function bump(n) {
    try { chrome.runtime.sendMessage({ type: "blocked", n }); } catch (_) {}
  }

  window.addEventListener("message", (e) => {
    const d = e.data;
    if (e.source !== window || !d || d.source !== "hishield-main") return;
    if (d.type === "stripped" && Number.isFinite(d.n) && d.n > 0 && d.n < 1000) bump(d.n);
  });
  try { chrome.storage.onChanged.addListener(loadState); } catch (_) {}

  // ---------- Layer 4: fallback ad skipper ----------
  const SKIP_SELECTORS = [
    ".ytp-skip-ad-button", ".ytp-ad-skip-button", ".ytp-ad-skip-button-modern",
    ".ytp-ad-skip-button-container button", ".ytp-ad-skip-button-slot button"
  ];
  let saved = null, counted = false;

  function clickSkip(root) {
    for (const sel of SKIP_SELECTORS) {
      const b = root.querySelector(sel);
      if (b) { b.click(); return true; }
    }
    return false;
  }

  function restore(video) {
    if (!saved) return;
    if (video) {
      video.muted = saved.muted;
      try { video.playbackRate = saved.rate || 1; } catch (_) {}
    }
    saved = null;
  }

  function tick() {
    const player = document.querySelector("#movie_player, .html5-video-player");
    if (!player) return;
    const video = player.querySelector("video.html5-main-video") || player.querySelector("video");
    if (!S.on) { restore(video); counted = false; return; }
    if (!video) return;

    const ad = player.classList.contains("ad-showing") || player.classList.contains("ad-interrupting");
    if (!ad) { restore(video); counted = false; return; }

    if (!saved) saved = { muted: video.muted, rate: video.playbackRate };
    video.muted = true;
    try { video.playbackRate = 16; } catch (_) {}
    const dur = video.duration;
    if (Number.isFinite(dur) && dur > 0 && video.currentTime < dur - 0.25) {
      try { video.currentTime = dur - 0.1; } catch (_) {}
    }
    clickSkip(player);
    if (video.paused) video.play().catch(() => {});
    if (!counted) { counted = true; bump(1); }
  }

  // ---------- Layer 5: anti-adblock wall ----------
  const wallHits = [];
  function handleWall() {
    if (!S.on) return;
    const wall = document.querySelector("ytd-enforcement-message-view-model");
    if (!wall) return;
    (wall.closest("tp-yt-paper-dialog") || wall).remove();
    document.querySelectorAll("tp-yt-iron-overlay-backdrop[opened]").forEach((e) => e.remove());
    if (document.body) document.body.style.removeProperty("overflow");
    const v = document.querySelector("video");
    if (v && v.paused) v.play().catch(() => {});

    const now = Date.now();
    wallHits.push(now);
    while (wallHits.length && now - wallHits[0] > 20000) wallHits.shift();
    let last = 0;
    try { last = Number(sessionStorage.getItem("hishield:reload") || 0); } catch (_) {}
    if (wallHits.length >= 3 && now - last > 120000) {
      try { sessionStorage.setItem("hishield:reload", String(now)); } catch (_) {}
      location.reload();
    }
  }

  setInterval(() => { tick(); handleWall(); }, 250);
  document.documentElement.dataset.hishield = "on";
  loadState();
})();
