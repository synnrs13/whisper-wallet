// background.js - Service Worker for Whisper Wallet

chrome.runtime.onInstalled.addListener(() => {
  // Set default settings saat install
  chrome.storage.local.set({
    settings: {
      enableScamCheck: true,
      showChainIcons: true,
      truncateTxHash: true,
      darkMode: false,
      truncateStart: 10,
      truncateEnd: 8,
      extensionEnabled: true
    }
  });
  
  console.log('Whisper Wallet installed - Default settings saved');
});

// Listen for messages dari content script atau popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  
  // Ambil settings
  if (request.type === 'GET_SETTINGS') {
    chrome.storage.local.get(['settings'], (result) => {
      sendResponse(result.settings || {});
    });
    return true;
  }
  
  // Simpan settings
  if (request.type === 'SAVE_SETTINGS') {
    chrome.storage.local.set({ settings: request.settings }, () => {
      // Kasih tahu semua tab bahwa settings berubah
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          if (tab.url && (tab.url.includes('twitter.com') || tab.url.includes('x.com'))) {
            chrome.tabs.sendMessage(tab.id, { 
              type: 'SETTINGS_UPDATED', 
              settings: request.settings 
            });
          }
        });
      });
      sendResponse({ success: true });
    });
    return true;
  }
  
  // Toggle extension on/off
  if (request.type === 'TOGGLE_EXTENSION') {
    chrome.storage.local.get(['settings'], (result) => {
      const settings = result.settings || {};
      settings.extensionEnabled = !settings.extensionEnabled;
      chrome.storage.local.set({ settings }, () => {
        sendResponse({ enabled: settings.extensionEnabled });
      });
    });
    return true;
  }
});