chrome.commands.onCommand.addListener(async (command) => {
  // Get active tab, block system URLs
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];

  if (!tab || !tab.id || !tab.url ||
      tab.url.startsWith('chrome://') ||
      tab.url.startsWith('chrome-extension://') ||
      tab.url.startsWith('edge://') ||
      tab.url === 'about:blank') return;

  // --- The code injected for the popup and picker ---
  function injectedScript() {
    // Remove any previous popup
    const old = document.getElementById('gpt-popup');
    if (old) old.remove();

    // Setup base history for picker navigation
    window.gptPopupHistory = [];
    window.gptPopupIndex = -1;

    // Font: Inter, Segoe UI, Helvetica Neue, Arial, sans-serif
    const popupStyle = {
      position: 'fixed',
      bottom: '18px',
      right: '18px',
      background: '#f4f6f8',
      border: '1px solid #E9E9EF',
      padding: '18px 16px 16px 16px',
      boxShadow: '0 2px 10px rgba(60,80,140,.07)',
      maxWidth: '350px',
      zIndex: '999999',
      borderRadius: '16px',
      fontFamily: 'Inter, Segoe UI, Helvetica Neue, Arial, sans-serif',
      fontSize: '14px',
      color: '#232425',
    };

    // Main picker UI builder
    function featurePickerHTML() {
      return `
        <div style="display:flex;flex-wrap:wrap;gap:7px;">
          ${[
            { id: 'summarize', label: 'Summarize', color: '#ececec', tcolor: '#2363d1' },
            { id: 'paraphrase', label: 'Paraphrase', color: '#ececec', tcolor: '#2363d1' },
            { id: 'rewrite', label: 'Rewrite', color: '#ececec', tcolor: '#2363d1' },
            { id: 'define', label: 'Define', color: '#ececec', tcolor: '#2363d1' },
          ].map(btn =>
            `<button id="btn-${btn.id}" style="
              flex:1;min-width:110px;height:32px;background:${btn.color};color:${btn.tcolor};border:none;
              border-radius:15px;font-weight:600;box-shadow:0 1px 4px rgba(40,55,120,0.04);font-size:14px;cursor:pointer;">
              ${btn.label}
            </button>`
          ).join('')}
        </div>
      `;
    }

    // Core rendering function for all popup
    window.renderGptPopup = (html, label = '', opts = {}) => {
      const old = document.getElementById('gpt-popup');
      if (old) old.remove();

      const div = document.createElement('div');
      div.id = 'gpt-popup';
      div.innerHTML = `
        <div style="font-size:15px;font-weight:600;color:#232425;padding-bottom:7px;">${label}</div>
        <div id="gpt-popup-content" style="margin-bottom:11px;">${html}</div>
        <div style="display:flex;align-items:center;gap:7px;">
          <button id="popup-back" style="height:30px;background:#ececec;color:#2363d1;border:none;border-radius:15px;font-size:15px;">←</button>
          <button id="popup-copy" style="height:30px;background:#2363d1;color:#fff;border:none;border-radius:15px;padding:0 10px;font-weight:600;font-size:13px;">Copy</button>
          <button id="popup-close" style="height:30px;background:#fff;color:#2363d1;border:none;border-radius:15px;padding:0 9px;font-size:18px;">×</button>
        </div>
      `;
      Object.assign(div.style, popupStyle);
      document.body.appendChild(div);

      // Back: always go to picker
      document.getElementById('popup-back').onclick = () => {
        window.gptPopupIndex = 0;
        const page = window.gptPopupHistory[0];
        window.renderGptPopup(page.html, page.label, page.opts);
        window.attachPickerEvents(); // Make buttons alive every time!
      };
      document.getElementById('popup-copy').onclick = () => {
        const txt = document.getElementById('gpt-popup-content').innerText;
        navigator.clipboard.writeText(txt);
      };
      document.getElementById('popup-close').onclick = () => div.remove();
    };

    // Store main picker globally
    window.featurePickerHTML = featurePickerHTML;

    // Attach picker events every time picker rendered
    window.attachPickerEvents = () => {
      ['summarize', 'paraphrase', 'rewrite', 'define'].forEach(feature => {
        const el = document.getElementById('btn-' + feature);
        if (el) el.onclick = () => {
          const selected = window.getSelection().toString();
          if (!selected) {
            window.renderGptPopup(`<span style="color:#e74c3c;">Please select some text first!</span>`, 'Error');
            return;
          }
          window.gptPopupIndex++;
          window.gptPopupHistory[window.gptPopupIndex] = { html: '<span>Processing...</span>', label: feature.charAt(0).toUpperCase() + feature.slice(1) };
          window.renderGptPopup('<span>Processing...</span>', feature.charAt(0).toUpperCase() + feature.slice(1));
          chrome.runtime.sendMessage({ feature, selected });
        };
      });
    };

    // FIRST SHOW: Picker page (index 0 in history!)
    window.gptPopupHistory = [{
      html: window.featurePickerHTML(),
      label: 'Choose an action:',
      opts: {}
    }];
    window.gptPopupIndex = 0;
    window.renderGptPopup(window.featurePickerHTML(), 'Choose an action:');
    window.attachPickerEvents();
  }

  // Inject picker/logic
  if (command === 'feature-picker') {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: injectedScript
    });
    return;
  }

  // Keyboard actions (optional extension point)
  // ...
});

// Background listens for result and displays it
chrome.runtime.onMessage.addListener(async (req, sender, sendResponse) => {
  if (!sender.tab || !sender.tab.id) return;

  // Backend endpoint mapping
  function getEndpoint(feature) {
    const map = {
      summarize: 'http://127.0.0.1:3000/summarize',
      paraphrase: 'http://127.0.0.1:3000/paraphrase',
      rewrite: 'http://127.0.0.1:3000/rewrite',
      define: 'http://127.0.0.1:3000/define'
    };
    return map[feature];
  }
  const endpoint = getEndpoint(req.feature);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: req.selected })
    });
    const data = await response.json();
    const result = data.result || data.text || 'No response';
    await chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      func: (output, label) => {
        window.gptPopupIndex++;
        window.gptPopupHistory[window.gptPopupIndex] = { html: output, label };
        window.renderGptPopup(output, label);
      },
      args: [result, req.feature.charAt(0).toUpperCase() + req.feature.slice(1)]
    });
  } catch (err) {
    await chrome.scripting.executeScript({
      target: { tabId: sender.tab.id },
      func: (errorMsg) => {
        window.renderGptPopup(`<span style="color:#e74c3c;">${errorMsg}</span>`, 'Error');
      },
      args: [err.message]
    });
  }
});
