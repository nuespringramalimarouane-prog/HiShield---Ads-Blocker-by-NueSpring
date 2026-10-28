const RULESETS = ["yt_rules", "global_ads"];
const get = (keys) => chrome.storage.local.get(keys);
const set = (obj) => chrome.storage.local.set(obj);

async function setToolbarLogo() {
  try {
    const response = await fetch(chrome.runtime.getURL("icons/hishield-logo.svg"));
    const bitmap = await createImageBitmap(await response.blob());
    const imageData = {};
    for (const size of [16, 32, 48, 128]) {
      const canvas = new OffscreenCanvas(size, size);
      const context = canvas.getContext("2d");
      context.drawImage(bitmap, 0, 0, size, size);
      imageData[size] = context.getImageData(0, 0, size, size);
    }
    await chrome.action.setIcon({ imageData });
    bitmap.close();
  } catch (error) {
    console.warn("HiShield toolbar logo could not be rendered", error);
  }
}

async function initialize() {
  const { enabled } = await get("enabled");
  if (enabled === undefined) await set({ enabled: true });
  await setToolbarLogo();
  await applyRuleset();
}

chrome.runtime.onInstalled.addListener(initialize);
chrome.runtime.onStartup.addListener(initialize);

async function computeState() {
  const { enabled, stats } = await get(["enabled", "stats"]);
  const today = new Date().toISOString().slice(0, 10);
  const currentStats = stats || { total: 0, day: today, today: 0 };
  const isEnabled = enabled !== false;
  return {
    enabled: isEnabled,
    shouldBlock: isEnabled,
    stats: {
      total: currentStats.total || 0,
      today: currentStats.day === today ? currentStats.today || 0 : 0
    }
  };
}

async function applyRuleset() {
  const state = await computeState();
  try {
    await chrome.declarativeNetRequest.updateEnabledRulesets(state.shouldBlock
      ? { enableRulesetIds: RULESETS }
      : { disableRulesetIds: RULESETS });
  } catch (error) {
    console.warn("HiShield ruleset toggle failed", error);
  }
  return state;
}

let statsUpdate = Promise.resolve();
function addBlocked(count) {
  statsUpdate = statsUpdate.then(async () => {
    const today = new Date().toISOString().slice(0, 10);
    const { stats } = await get("stats");
    const currentStats = stats || { total: 0, day: today, today: 0 };
    if (currentStats.day !== today) {
      currentStats.day = today;
      currentStats.today = 0;
    }
    currentStats.total += count;
    currentStats.today += count;
    await set({ stats: currentStats });
  }).catch((error) => {
    console.warn("HiShield blocking statistics could not be saved", error);
  });
}

async function handle(message) {
  switch (message.type) {
    case "getState":
      return computeState();
    case "blocked":
      addBlocked(Math.min(Number(message.n) || 0, 1000));
      return { ok: true };
    case "toggle":
      await set({ enabled: !!message.enabled });
      return applyRuleset();
    default:
      return { error: "Unknown message type." };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handle(message).then(sendResponse).catch((error) => {
    sendResponse({ error: String((error && error.message) || error) });
  });
  return true;
});
