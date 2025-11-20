// This file runs on every webpage
// Currently just listening for messages from the background script
// The popup injection happens directly from background.js

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getSelection") {
    const text = window.getSelection().toString();
    sendResponse({ text: text });
  }
  return true;
});
