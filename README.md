# HiShield - Ads Blocker by NueSpring

HiShield is a free Chrome extension that blocks requests to a curated set of common advertising and tracking domains, hides familiar ad placements, and includes YouTube-specific ad cleanup and skip behavior. It works locally in Chrome; no account, subscription, backend, or payment is required.

## Project layout

```
extension/
  background.js                  local protection toggle and statistics
  manifest.json                  Chrome permissions and content-script scope
  rules/global_ads.json          curated cross-site ad/tracker network rules
  rules/youtube_rules.json       YouTube request rules
  content/                       generic ad placement cleanup and YouTube behavior
  popup/                         Chrome popup dashboard
tools/
  gen_rules.py                   YouTube rules generator
  smoke-test.mjs                 YouTube content-hook smoke test
```

## Function reference

The extension's browser code is organized by where it runs: the service worker manages extension-wide state, the popup displays it, and content scripts apply page-level blocking.

### `extension/background.js`

- `get(keys)` and `set(obj)` read and write settings and statistics in Chrome's local extension storage.
- `setToolbarLogo()` renders the extension logo at the sizes Chrome uses for its toolbar icon.
- `initialize()` supplies the default enabled setting on first install, updates the toolbar icon, and applies the current network rules.
- `computeState()` combines the stored enabled setting and local statistics into the state shown to the popup and content scripts.
- `applyRuleset()` enables or disables both bundled declarative network rule sets to match the saved setting.
- `addBlocked(count)` serializes updates to the local daily and lifetime YouTube cleanup counters.
- `handle(message)` processes popup and content-script requests for state, counter updates, and protection toggling.
- The runtime message listener passes each request to `handle()` and returns its result to the sender.

### `extension/popup/popup.js`

- `$(id)` looks up a popup element by its HTML ID; `send(message)` sends a request to the service worker.
- `say(text, error)` displays a status message and optionally styles it as an error.
- `setToolbarLogo()` creates toolbar icon image data from the popup logo; its `paint()` helper draws the image at Chrome's supported icon sizes.
- `render()` reads the current state and updates the protection toggle, status badge, statistics, and free-use message.
- The toggle change handler saves the user's choice and refreshes the popup display.

### `extension/content/isolated.js`

- `applyConfig()` applies the enabled state to the page and sends it to the YouTube page-world script.
- `loadState()` reads protection state from the service worker and reapplies it; it runs at startup and when extension storage changes.
- `bump(n)` reports locally removed YouTube ad entries to the service worker for counting.
- `clickSkip(root)` clicks the first matching YouTube skip-ad button inside the player.
- `restore(video)` restores the video's original muted and playback-speed settings after an ad ends or protection is paused.
- `tick()` detects a YouTube video ad, mutes and speeds up playback, seeks toward its end when possible, and clicks the skip button.
- `handleWall()` removes a detected YouTube anti-adblock overlay and limits page reload attempts if the overlay repeatedly returns.
- The window message handler validates and counts events from the page-world script. A timer runs `tick()` and `handleWall()` periodically.

### `extension/content/main-world.js`

- `hasAdKey(object)` checks whether an object contains one of the known YouTube ad-renderer keys.
- `isAdItem(item)` identifies an ad entry, including ad content nested in a rich-item renderer.
- `prune(node, depth)` recursively removes recognized ad fields and ad entries from YouTube response data, with a depth limit.
- `looksLikeYt(value)` checks whether parsed data has the shape of a YouTube response before modifying it.
- `scrub(value)` applies the response cleanup when protection is enabled and reports how many entries were removed.
- `report(count)` batches cleanup counts and posts them to the isolated content script.
- The `JSON.parse` hook cleans sufficiently large parsed YouTube response objects. The `fetch` hook cleans JSON responses from YouTube's player and browsing endpoints.
- `trap(name)` intercepts first assignments to YouTube's initial response globals so their data can be cleaned before the page reads it.
- The window message handler receives the enabled setting from the isolated content script.

### `tools/gen_rules.py` and `tools/smoke-test.mjs`

- `gen_rules.py` builds the YouTube network-blocking rules from the curated URL filters and writes them to `extension/rules/youtube_rules.json`; it uses a top-level generation script rather than defining functions.
- `smoke-test.mjs` uses `adJson()` to create representative YouTube response data and a sandboxed fake page to exercise the page-world cleanup hooks. Its assertions cover parsed JSON, initial page globals, YouTube fetch responses, unrelated JSON, and disabled protection.

The manifest, rule JSON files, stylesheets, and icon assets are declarative resources rather than files with project-defined functions.

## Install in Chrome

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Choose **Load unpacked** and select the `extension/` folder.
4. The extension starts protecting pages right away. Use the popup toggle to pause or resume protection.

## Blocking coverage

The cross-site network list and generic cosmetic selectors cover common ad delivery patterns; they cannot remove every ad. Ads served from a website's own domain or inserted directly into a media stream may remain. YouTube protection uses request filtering, ad-data stripping, cosmetic hiding, and a fallback skipper.

Ad blocking requires broad Chrome host access, which Chrome Web Store review may scrutinize. Review the extension's requested permissions and the applicable Chrome and website policies before publication. Blocking statistics and the protection setting are stored locally in Chrome; no browsing history or account data is sent to a service.

## Local checks

```powershell
node tools/smoke-test.mjs
```

The smoke test exercises the YouTube JSON stripping hook. It does not verify Chrome Web Store acceptance or every site's ad behavior.
