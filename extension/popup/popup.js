const $ = (id) => document.getElementById(id);
const send = (message) => chrome.runtime.sendMessage(message);

function say(text, error = false) {
  const message = $("msg");
  message.textContent = text;
  message.classList.toggle("error", error);
}

function setToolbarLogo() {
  const logo = document.querySelector(".brand-logo");
  const paint = () => {
    const imageData = {};
    for (const size of [16, 32, 48, 128]) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const context = canvas.getContext("2d");
      context.drawImage(logo, 0, 0, size, size);
      imageData[size] = context.getImageData(0, 0, size, size);
    }
    chrome.action.setIcon({ imageData });
  };
  if (logo.complete && logo.naturalWidth) paint();
  else logo.addEventListener("load", paint, { once: true });
}

async function render() {
  const state = await send({ type: "getState" });
  if (!state || state.error) {
    say(state?.error || "Could not load HiShield.", true);
    return;
  }

  $("toggle").checked = state.enabled;
  $("badge").dataset.mode = state.enabled ? "on" : "off";
  $("badge").textContent = state.enabled ? "PROTECTION ON" : "PROTECTION OFF";
  $("today").textContent = state.stats.today.toLocaleString();
  $("total").textContent = state.stats.total.toLocaleString();
  $("toggle-caption").textContent = state.enabled
    ? "Protection is on across Chrome"
    : "Protection is paused across Chrome";
  say("Free to use. No account required.");
}

$("toggle").addEventListener("change", async (event) => {
  const result = await send({ type: "toggle", enabled: event.target.checked });
  if (result?.error) say(result.error, true);
  await render();
});

render();
setToolbarLogo();
