/*
 * Layer 2 (most effective): runs in the PAGE's JS world at document_start.
 * Removes ad payloads from YouTube's data BEFORE the player/renderer sees them:
 *   - JSON.parse results, fetch() responses to /youtubei/v1/*, and the
 *     ytInitialPlayerResponse / ytInitialData globals set on first load.
 */
(() => {
  "use strict";
  if (window.__hishield_main) return;
  Object.defineProperty(window, "__hishield_main", { value: true });

  const state = { enabled: true };

  const PLAYER_AD_FIELDS = ["adPlacements", "playerAds", "adSlots", "adBreakHeartbeatParams"];
  const AD_ITEM_KEYS = [
    "adSlotRenderer", "promotedSparklesWebRenderer", "promotedSparklesTextSearchRenderer",
    "promotedVideoRenderer", "compactPromotedVideoRenderer", "inFeedAdLayoutRenderer",
    "displayAdRenderer", "bannerPromoRenderer", "statementBannerRenderer",
    "mastheadAdRenderer", "videoMastheadAdV3Renderer", "brandVideoSingletonRenderer",
    "brandVideoShelfRenderer", "searchPyvRenderer", "playerLegacyDesktopWatchAdsRenderer",
    "actionCompanionAdRenderer", "companionAdRenderer"
  ];
  const TOP_KEYS = ["responseContext", "playerResponse", "streamingData", "playabilityStatus",
    "contents", "onResponseReceivedActions", "onResponseReceivedCommands", "response", "frameworkUpdates"];

  const hasAdKey = (o) => {
    for (const k of AD_ITEM_KEYS) if (k in o) return true;
    return false;
  };
  const isAdItem = (item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    if (hasAdKey(item)) return true;
    const c = item.richItemRenderer && item.richItemRenderer.content;
    return !!(c && typeof c === "object" && hasAdKey(c));
  };

  let removed = 0;
  function prune(node, depth) {
    if (!node || typeof node !== "object" || depth > 45) return;
    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i--) {
        if (isAdItem(node[i])) { node.splice(i, 1); removed++; }
        else prune(node[i], depth + 1);
      }
      return;
    }
    for (const f of PLAYER_AD_FIELDS) {
      if (f in node) { delete node[f]; removed++; }
    }
    for (const k in node) {
      const v = node[k];
      if (v && typeof v === "object") prune(v, depth + 1);
    }
  }

  function looksLikeYt(v) {
    if (!v || typeof v !== "object") return false;
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length && i < 6; i++) if (looksLikeYt(v[i])) return true;
      return false;
    }
    for (const k of TOP_KEYS) if (k in v) return true;
    return false;
  }

  // Returns number of ad entries removed (0 = untouched).
  function scrub(v) {
    if (!state.enabled) return 0;
    try {
      if (!looksLikeYt(v)) return 0;
      removed = 0;
      prune(v, 0);
      if (removed) report(removed);
      return removed;
    } catch (_) { return 0; }
  }

  let pending = 0, timer = 0;
  function report(n) {
    pending += n;
    if (timer) return;
    timer = setTimeout(() => {
      window.postMessage({ source: "hishield-main", type: "stripped", n: pending }, "*");
      pending = 0; timer = 0;
    }, 1500);
  }

  // ---- hook JSON.parse ----
  const nativeParse = JSON.parse;
  JSON.parse = function parse(text, reviver) {
    const r = nativeParse.call(this, text, reviver);
    if (typeof text === "string" && text.length > 500) scrub(r);
    return r;
  };

  // ---- hook fetch for InnerTube endpoints ----
  const RX = /\/youtubei\/v1\/(player|next|browse|search|reel\/|guide|get_watch)/;
  const nativeFetch = window.fetch;
  window.fetch = function (input, init) {
    const p = nativeFetch.apply(this, arguments);
    if (!state.enabled) return p;
    let url = "";
    try { url = typeof input === "string" ? input : (input instanceof URL ? input.href : input.url); } catch (_) {}
    if (!RX.test(url)) return p;
    return p.then(async (res) => {
      try {
        if (!res || !res.ok) return res;
        if (!(res.headers.get("content-type") || "").includes("json")) return res;
        const data = await res.clone().json();
        if (!scrub(data)) return res;
        const out = new Response(JSON.stringify(data), {
          status: res.status, statusText: res.statusText, headers: res.headers
        });
        try { Object.defineProperty(out, "url", { value: res.url }); } catch (_) {}
        return out;
      } catch (_) { return res; }
    });
  };

  // ---- trap first-load globals ----
  function trap(name) {
    let val;
    try {
      Object.defineProperty(window, name, {
        configurable: true, enumerable: true,
        get() { return val; },
        set(v) { scrub(v); val = v; }
      });
    } catch (_) {}
  }
  trap("ytInitialPlayerResponse");
  trap("ytInitialData");

  // ---- config from isolated world ----
  window.addEventListener("message", (e) => {
    const d = e.data;
    if (e.source !== window || !d || d.source !== "hishield-iso" || d.type !== "config") return;
    state.enabled = !!d.enabled;
  });
})();
