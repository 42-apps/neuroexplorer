/* NeuroExplorer — background service worker.
   Opens the full-tab 3D brain explorer when the toolbar icon is clicked.
   This is the only file that touches chrome.* APIs, so the page itself can be
   previewed by serving the folder statically (see .claude/brainexplorer-server.cjs). */
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('brain.html') });
});
