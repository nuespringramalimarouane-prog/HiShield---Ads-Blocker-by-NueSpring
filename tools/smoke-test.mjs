// Run: node tools/smoke-test.mjs   (loads main-world.js in a sandbox with a fake page)
import vm from "node:vm";
import fs from "node:fs";
import assert from "node:assert/strict";

const code = fs.readFileSync(new URL("../extension/content/main-world.js", import.meta.url), "utf8");
const listeners = [], posted = [];
const adJson = () => ({
  responseContext: { pad: "p".repeat(600) },
  playabilityStatus: { status: "OK" },
  streamingData: {},
  adPlacements: [{ adPlacementRenderer: {} }],
  playerAds: [{ playerLegacyDesktopWatchAdsRenderer: {} }],
  adSlots: [{}],
  contents: { richGridRenderer: { contents: [
    { richItemRenderer: { content: { videoRenderer: { videoId: "keep1" } } } },
    { richItemRenderer: { content: { adSlotRenderer: {} } } },
    { promotedSparklesWebRenderer: {} },
    { richItemRenderer: { content: { videoRenderer: { videoId: "keep2" } } } }
  ] } }
});

const sandbox = {
  console, URL, Response, setTimeout,
  postMessage: (d) => posted.push(d),
  addEventListener: (t, fn) => listeners.push([t, fn]),
  fetch: async () => new Response(JSON.stringify(adJson()), { status: 200, headers: { "content-type": "application/json" } })
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

// 1) JSON.parse hook
const parsed = vm.runInContext(`JSON.parse(${JSON.stringify(JSON.stringify(adJson()))})`, sandbox);
assert.equal(parsed.adPlacements, undefined);
assert.equal(parsed.playerAds, undefined);
assert.equal(parsed.adSlots, undefined);
const ids = parsed.contents.richGridRenderer.contents.map((i) => i.richItemRenderer?.content?.videoRenderer?.videoId);
assert.equal(JSON.stringify(ids), JSON.stringify(["keep1", "keep2"]));

// 2) first-load global trap
vm.runInContext(`var ytInitialPlayerResponse = ${JSON.stringify(adJson())}`, sandbox);
assert.equal(sandbox.ytInitialPlayerResponse.adPlacements, undefined);

// 3) fetch hook
const res = await sandbox.fetch("https://www.youtube.com/youtubei/v1/player?key=x");
const data = await res.json();
assert.equal(data.adPlacements, undefined);
assert.equal(data.playerAds, undefined);

// 4) non-YouTube JSON is untouched
const other = vm.runInContext(`JSON.parse(${JSON.stringify(JSON.stringify({ adPlacements: [1], x: "y".repeat(600) }))})`, sandbox);
assert.equal(JSON.stringify(other.adPlacements), "[1]");

// 5) disabled -> untouched
const cfg = listeners.find(([t]) => t === "message")[1];
cfg({ source: vm.runInContext("window", sandbox), data: { source: "hishield-iso", type: "config", enabled: false } });
const off = vm.runInContext(`JSON.parse(${JSON.stringify(JSON.stringify(adJson()))})`, sandbox);
assert.ok(off.adPlacements);

console.log("all smoke tests passed");
