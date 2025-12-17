const FLASK_BASE = "http://127.0.0.1:3000";

// ---------- 1) Setup: context menus + hotkey ----------
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "th_open",
    title: "Text Helper: Open panel",
    contexts: ["all"],
  });
  chrome.contextMenus.create({
    id: "th_read",
    title: "Text Helper: Read selection",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id) return;
  if (info.menuItemId === "th_open") {
    await openPanel(tab.id, "home");
  } else if (info.menuItemId === "th_read") {
    await openPanel(tab.id, "read");
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "feature-picker") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  await openPanel(tab.id, "home");
});

// ---------- 2) Message handler: proxy API calls ----------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg?.type !== "AI_REQUEST") return;

    const url = `${FLASK_BASE}${msg.endpoint}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(msg.payload || {}),
    });

    const data = await res.json();
    sendResponse({ ok: true, data });
  })().catch((err) => {
    sendResponse({ ok: false, error: String(err) });
  });

  return true;
});

// ---------- 3) Inject the UI panel ----------
async function openPanel(tabId, mode) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: injectedPanel,
    args: [mode],
  });
}

// ---------- 4) The injected panel ----------
function injectedPanel(mode) {
  // ===== SAFE STATE INIT =====
  window.__th_state = window.__th_state || {};
  if (!Array.isArray(window.__th_state.chat)) window.__th_state.chat = [];
  if (typeof window.__th_state.ttsRate !== "number" || Number.isNaN(window.__th_state.ttsRate))
    window.__th_state.ttsRate = 1;
  if (typeof window.__th_state.targetLang !== "string" || !window.__th_state.targetLang.trim())
    window.__th_state.targetLang = "Spanish";
  if (typeof window.__th_state.autoSpeak !== "boolean") window.__th_state.autoSpeak = true;
  if (typeof window.__th_state.lastSpoken !== "string") window.__th_state.lastSpoken = "";

  // ----- Helpers -----
  const getSelectedText = () => (window.getSelection?.().toString() || "").trim();

  const speak = (text, opts = {}) => {
    window.__th_state.lastSpoken = String(text || "");
    const rate = Number(opts.rate ?? 1);
    const lang = String(opts.lang ?? "en-US");
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    u.lang = lang;
    window.speechSynthesis.speak(u);
  };

  const stopSpeak = () => window.speechSynthesis.cancel();

  const askBackend = (endpoint, payload) =>
    new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: "AI_REQUEST", endpoint, payload }, (resp) => {
        if (!resp?.ok) reject(new Error(resp?.error || "Request failed"));
        else resolve(resp.data);
      });
    });

  // ----- Remove old panel -----
  const old = document.getElementById("th-panel");
  if (old) old.remove();

  // ----- Theme colors -----
  const colors = {
    bgCard: "#f9fafb",
    bgBody: "#ffffff",
    borderCard: "#e5e7eb",

    headerBg: "#e5f2ff",

    // Primary: sky blue / light cerulean
    primaryBg: "#38bdf8",
    primaryBgHover: "#0ea5e9",
    primaryBgActive: "#0284c7",
    primaryText: "#0f172a",

    // Accent: soft yellow / goldenrod
    accentBg: "#facc15",
    accentBgHover: "#fde047",
    accentText: "#111827",

    // Text
    textMain: "#111827",
    textSub: "#4b5563",

    // Danger
    dangerBg: "#ef4444",
    dangerBgHover: "#dc2626",
    dangerBgActive: "#b91c1c",
  };

  // ----- Create root -----
  const root = document.createElement("div");
  root.id = "th-panel";
  root.style.cssText = `
    position: fixed;
    right: 16px;
    bottom: 16px;
    width: 380px;
    max-height: 70vh;
    background: ${colors.bgCard};
    border: 1px solid ${colors.borderCard};
    border-radius: 16px;
    box-shadow: 0 18px 45px rgba(15,23,42,0.28);
    z-index: 2147483647;
    overflow: hidden;
    font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    color: ${colors.textMain};
    font-weight: 400;
  `;

  root.innerHTML = `
    <div style="
      display:flex;align-items:center;justify-content:space-between;
      padding:10px 14px;background:${colors.headerBg};border-bottom:1px solid ${colors.borderCard};
    ">
      <div style="display:flex;flex-direction:column;">
        <div style="font-weight:600;font-size:13px;color:${colors.textMain};">Text Helper</div>
        <div style="font-size:11px;font-weight:400;color:${colors.textSub};margin-top:2px;">
          Summarize • Define • Translate • Paraphrase • Chat • Read
        </div>
      </div>
      <button id="th_close" style="
        all:unset;cursor:pointer;padding:4px 10px;border-radius:999px;
        background:${colors.primaryBg};color:${colors.primaryText};
        font-size:11px;font-weight:600;
      ">Close</button>
    </div>

    <div style="padding:10px 12px;display:flex;flex-wrap:wrap;gap:8px;">
      <button class="th_btn" data-act="summarize">Summarize</button>
      <button class="th_btn" data-act="define">Define</button>
      <button class="th_btn" data-act="translate">Translate</button>
      <button class="th_btn" data-act="paraphrase">Paraphrase</button>
      <button class="th_btn" data-act="chat">Chat</button>
      <button class="th_btn" data-act="read">Read</button>
      <button class="th_btn th_btn-secondary" data-act="stop">Stop</button>
    </div>

    <div style="padding:0 12px 10px 12px;display:flex;gap:10px;align-items:center;">
      <label style="font-size:12px;font-weight:500;color:${colors.textSub};">TTS rate</label>
      <input id="th_rate" type="range" min="0.7" max="1.4" value="${window.__th_state.ttsRate}" step="0.05" style="flex:1;">
      <label style="font-size:12px;font-weight:500;color:${colors.textSub};display:flex;gap:6px;align-items:center;">
        <input id="th_autospeak" type="checkbox" ${window.__th_state.autoSpeak ? "checked" : ""}>
        Auto
      </label>
    </div>

    <div id="th_body" style="
      padding:10px 12px;border-top:1px solid ${colors.borderCard};
      overflow:auto;max-height:45vh;background:${colors.bgBody};
      font-weight:400;
    "></div>
  `;

  document.body.appendChild(root);

  // ----- Button styling -----
  root.querySelectorAll(".th_btn").forEach((b) => {
    const secondary = b.classList.contains("th_btn-secondary");

    if (secondary) {
      b.style.cssText = `
        all: unset;
        cursor:pointer;
        padding:7px 10px;
        border-radius:999px;
        border:1px solid ${colors.borderCard};
        background:#f3f4f6;
        font-size:12px;
        color:${colors.textMain};
        font-weight:500;
        transition:background 150ms;
      `;
      b.addEventListener("mouseenter", () => (b.style.background = "#e5e7eb"));
      b.addEventListener("mouseleave", () => (b.style.background = "#f3f4f6"));
      b.addEventListener("mousedown", () => (b.style.background = "#d1d5db"));
    } else {
      b.style.cssText = `
        all: unset;
        cursor:pointer;
        padding:7px 10px;
        border-radius:999px;
        border:none;
        background:${colors.primaryBg};
        font-size:12px;
        color:${colors.primaryText};
        font-weight:600;
        box-shadow:0 1px 0 rgba(15,23,42,0.10);
        transition:background 150ms,transform 80ms,box-shadow 80ms;
      `;
      b.addEventListener("mouseenter", () => (b.style.background = colors.primaryBgHover));
      b.addEventListener("mouseleave", () => {
        b.style.background = colors.primaryBg;
        b.style.transform = "translateY(0)";
        b.style.boxShadow = "0 1px 0 rgba(15,23,42,0.10)";
      });
      b.addEventListener("mousedown", () => {
        b.style.background = colors.primaryBgActive;
        b.style.transform = "translateY(1px)";
        b.style.boxShadow = "0 0 0 rgba(15,23,42,0.10)";
      });
    }
  });

  // ----- Refs -----
  const body = root.querySelector("#th_body");
  const closeBtn = root.querySelector("#th_close");
  const rateEl = root.querySelector("#th_rate");
  const autoEl = root.querySelector("#th_autospeak");

  // Close hover states
  closeBtn.addEventListener("mouseenter", () => (closeBtn.style.background = colors.primaryBgHover));
  closeBtn.addEventListener("mouseleave", () => (closeBtn.style.background = colors.primaryBg));
  closeBtn.addEventListener("mousedown", () => (closeBtn.style.background = colors.primaryBgActive));

  closeBtn.onclick = () => root.remove();
  rateEl.oninput = () => {
    window.__th_state.ttsRate = Number(rateEl.value);
  };
  autoEl.onchange = () => {
    window.__th_state.autoSpeak = !!autoEl.checked;
  };

  // ----- Render helpers -----
  const esc = (s) =>
    String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

  const showResult = (title, text, extraHTML = "") => {
    body.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;">
        <div style="font-weight:600;color:${colors.textMain};font-size:13px;">${esc(title)}</div>
        <button id="th_play" style="
          all:unset;cursor:pointer;padding:6px 10px;border-radius:999px;border:none;
          background:${colors.accentBg};color:${colors.accentText};
          font-size:12px;font-weight:600;
          box-shadow:0 1px 0 rgba(15,23,42,0.10);
          transition:background 150ms,transform 80ms,box-shadow 80ms;
        ">Play</button>
      </div>
      <div style="margin-top:4px;white-space:pre-wrap;line-height:1.5;color:${colors.textMain};font-size:13px;font-weight:400;">
        ${esc(text)}
      </div>
      ${extraHTML}
    `;

    const playBtn = body.querySelector("#th_play");
    playBtn.addEventListener("mouseenter", () => (playBtn.style.background = colors.accentBgHover));
    playBtn.addEventListener("mouseleave", () => {
      playBtn.style.background = colors.accentBg;
      playBtn.style.transform = "translateY(0)";
      playBtn.style.boxShadow = "0 1px 0 rgba(15,23,42,0.10)";
    });
    playBtn.addEventListener("mousedown", () => {
      playBtn.style.transform = "translateY(1px)";
      playBtn.style.boxShadow = "0 0 0 rgba(15,23,42,0.10)";
    });

    playBtn.onclick = () => speak(text, { rate: window.__th_state.ttsRate });
  };

  const showTranslateUI = () => {
    body.innerHTML = `
      <div style="font-weight:600;color:${colors.textMain};margin-bottom:8px;font-size:13px;">Translate</div>
      <div style="display:flex;gap:8px;align-items:center;">
        <input id="th_lang" value="${esc(window.__th_state.targetLang)}" placeholder="e.g., Spanish, Hindi, Japanese"
          style="flex:1;padding:8px 10px;border:1px solid ${colors.borderCard};border-radius:999px;font-size:12px;font-weight:400;color:${colors.textMain};background:#f9fafb;">
        <button id="th_do_translate" style="
          all:unset;cursor:pointer;padding:8px 10px;border-radius:999px;border:none;
          background:${colors.primaryBg};color:${colors.primaryText};
          font-size:12px;font-weight:600;
          box-shadow:0 1px 0 rgba(15,23,42,0.10);
          transition:background 150ms,transform 80ms,box-shadow 80ms;
        ">Translate</button>
      </div>
      <div style="margin-top:8px;color:${colors.textSub};font-size:11px;font-weight:400;">
        Type any language name (Spanish, Hindi, Japanese, etc.)
      </div>
    `;

    const translateBtn = body.querySelector("#th_do_translate");
    translateBtn.addEventListener("mouseenter", () => (translateBtn.style.background = colors.primaryBgHover));
    translateBtn.addEventListener("mouseleave", () => {
      translateBtn.style.background = colors.primaryBg;
      translateBtn.style.transform = "translateY(0)";
      translateBtn.style.boxShadow = "0 1px 0 rgba(15,23,42,0.10)";
    });
    translateBtn.addEventListener("mousedown", () => {
      translateBtn.style.background = colors.primaryBgActive;
      translateBtn.style.transform = "translateY(1px)";
      translateBtn.style.boxShadow = "0 0 0 rgba(15,23,42,0.10)";
    });

    translateBtn.onclick = async () => {
      const text = getSelectedText();
      const target = (body.querySelector("#th_lang").value || "Spanish").trim();
      window.__th_state.targetLang = target;

      if (!text) return showResult("Translate", "No text selected.");

      showResult("Translate", "Working…");
      try {
        const data = await askBackend("/translate", { text, target_language: target });
        showResult(`Translated (${target})`, data.result);
        if (window.__th_state.autoSpeak) speak(data.result, { rate: window.__th_state.ttsRate });
      } catch (e) {
        showResult("Error", String(e));
      }
    };
  };

  const showChatUI = () => {
    const render = () => {
      const msgs = window.__th_state.chat;
      const rows = msgs
        .map((m) => {
          const isUser = m.role === "user";
          const bg = isUser ? "#e0f2fe" : "#fef9c3";
          const align = isUser ? "flex-end" : "flex-start";
          const label = isUser ? "You" : "AI";
          return `
            <div style="display:flex;justify-content:${align};margin:6px 0;">
              <div style="max-width:85%;background:${bg};padding:8px 10px;border-radius:14px;font-size:12px;font-weight:400;white-space:pre-wrap;line-height:1.4;border:1px solid ${colors.borderCard};">
                <strong style="font-weight:600;">${label}:</strong><br>${esc(m.content)}
              </div>
            </div>
          `;
        })
        .join("");

      body.innerHTML = `
        <div style="font-weight:600;color:${colors.textMain};margin-bottom:8px;font-size:13px;">Chat</div>
        <div id="th_msgs" style="border:1px solid ${colors.borderCard};border-radius:12px;padding:8px;max-height:220px;overflow:auto;background:#f9fafb;">
          ${
            rows ||
            `<div style="color:${colors.textSub};font-size:12px;font-weight:400;padding:8px;">Ask about the selection or anything else.</div>`
          }
        </div>
        <textarea id="th_in" placeholder="Type a message…" style="margin-top:8px;width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid ${colors.borderCard};border-radius:12px;font-size:12px;font-weight:400;min-height:70px;color:${colors.textMain};background:#ffffff;"></textarea>
        <div style="display:flex;gap:8px;margin-top:8px;">
          <button id="th_send" style="
            all:unset;cursor:pointer;padding:8px 10px;border-radius:999px;border:none;
            background:${colors.primaryBg};color:${colors.primaryText};
            font-size:12px;font-weight:600;box-shadow:0 1px 0 rgba(15,23,42,0.10);
            transition:background 150ms,transform 80ms,box-shadow 80ms;
          ">Send</button>
          <button id="th_clear" style="
            all:unset;cursor:pointer;padding:8px 10px;border-radius:999px;border:none;
            background:${colors.dangerBg};color:#fff;
            font-size:12px;font-weight:600;box-shadow:0 1px 0 rgba(15,23,42,0.10);
            transition:background 150ms,transform 80ms,box-shadow 80ms;
          ">Clear</button>
        </div>
      `;

      const msgsEl = body.querySelector("#th_msgs");
      if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight;

      const sendBtn = body.querySelector("#th_send");
      sendBtn.addEventListener("mouseenter", () => (sendBtn.style.background = colors.primaryBgHover));
      sendBtn.addEventListener("mouseleave", () => (sendBtn.style.background = colors.primaryBg));
      sendBtn.addEventListener("mousedown", () => (sendBtn.style.background = colors.primaryBgActive));

      const clearBtn = body.querySelector("#th_clear");
      clearBtn.addEventListener("mouseenter", () => (clearBtn.style.background = colors.dangerBgHover));
      clearBtn.addEventListener("mouseleave", () => (clearBtn.style.background = colors.dangerBg));
      clearBtn.addEventListener("mousedown", () => (clearBtn.style.background = colors.dangerBgActive));

      body.querySelector("#th_clear").onclick = () => {
        window.__th_state.chat = [];
        render();
      };

      body.querySelector("#th_send").onclick = async () => {
        const input = body.querySelector("#th_in");
        const text = (input.value || "").trim();
        if (!text) return;

        input.value = "";
        window.__th_state.chat.push({ role: "user", content: text });
        render();

        const selected_text = getSelectedText();

        try {
          const data = await askBackend("/chat", {
            messages: window.__th_state.chat,
            selected_text,
          });

          window.__th_state.chat.push({ role: "assistant", content: data.result });
          render();

          if (window.__th_state.autoSpeak) {
            speak(data.result, { rate: window.__th_state.ttsRate });
          }
        } catch (e) {
          window.__th_state.chat.push({ role: "assistant", content: "Error: " + String(e) });
          render();
        }
      };
    };

    render();
  };

  const runAction = async (act) => {
    if (act === "stop") return stopSpeak();
    if (act === "translate") return showTranslateUI();
    if (act === "chat") return showChatUI();

    if (act === "read") {
      const sel = getSelectedText();
      if (!sel) return showResult("Read", "No text selected.");
      showResult("Selection", sel);
      return speak(sel, { rate: window.__th_state.ttsRate });
    }

    const sel = getSelectedText();
    if (!sel) return showResult(act, "No text selected.");

    const endpointMap = {
      summarize: "/summarize",
      define: "/define",
      paraphrase: "/paraphrase",
    };

    showResult(act, "Working…");
    try {
      const data = await askBackend(endpointMap[act], { text: sel });
      const niceTitle = act.charAt(0).toUpperCase() + act.slice(1);
      showResult(niceTitle, data.result);
      if (window.__th_state.autoSpeak) speak(data.result, { rate: window.__th_state.ttsRate });
    } catch (e) {
      showResult("Error", String(e));
    }
  };

  root.querySelectorAll(".th_btn").forEach((b) => {
    b.onclick = () => runAction(b.dataset.act);
  });

  body.innerHTML = `<div style="color:${colors.textSub};font-size:13px;font-weight:400;">Select text on the page, then choose an action.</div>`;

  if (mode === "read") runAction("read");
}
