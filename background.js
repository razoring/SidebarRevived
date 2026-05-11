let openSidePanels = 0;

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['sites'], (result) => {
    if (!result.sites) {
      chrome.storage.local.set({
        sites: [],
        tempSites: [],
        activeSiteId: null,
        isSidePanelOpen: false
      });
    } else {
      chrome.storage.local.set({ isSidePanelOpen: false });
    }
  });

  chrome.contextMenus.create({
    id: "send_to_sidebar",
    title: "Send to Sidebar",
    contexts: ["page"]
  });
});

// Reset state on worker startup. Since the worker is kept alive while the panel is open, 
// this only runs on clean startup or extension reload.
chrome.storage.local.set({ isSidePanelOpen: false });

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "send_to_sidebar") {
    if (tab && tab.url && tab.url.startsWith('http')) {
      const title = tab.title || new URL(tab.url).hostname.replace('www.', '');
      const faviconUrl = tab.favIconUrl || `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(tab.url)}`;
      const newSite = {
        id: 'site_' + Date.now(),
        title: title,
        url: tab.url,
        faviconUrl: faviconUrl,
        color: '#f0f0f0',
        initial: title.charAt(0).toUpperCase()
      };
      // Force sidepanel open first
      chrome.sidePanel.open({ windowId: tab.windowId }).then(() => {
        chrome.storage.local.get(['tempSites'], (result) => {
          chrome.storage.local.set({ tempSites: [...(result.tempSites || []), newSite] });
        });
      });
    }
  }
});

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error(error));

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'open_side_panel') {
    chrome.sidePanel.open({ windowId: sender.tab.windowId });
  } else if (message.ping) {
    // Re-affirm open state if background woke up and panel is actually active
    if (openSidePanels > 0) chrome.storage.local.set({ isSidePanelOpen: true });
    sendResponse({ status: 'alive' });
  } else if (message.action === 'add_current_tab') {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (tab && tab.url && tab.url.startsWith('http')) {
        const title = tab.title || new URL(tab.url).hostname.replace('www.', '');
        const faviconUrl = tab.favIconUrl || `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(tab.url)}`;
        const newSite = {
          id: 'site_' + Date.now(),
          title: title,
          url: tab.url,
          faviconUrl: faviconUrl,
          color: '#f0f0f0',
          initial: title.charAt(0).toUpperCase()
        };
        chrome.storage.local.get(['sites'], (result) => {
          chrome.storage.local.set({ sites: [...(result.sites || []), newSite] });
        });
      }
    });
  }
});

// Track side panel lifecycle via port connection
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'sidepanel') {
    openSidePanels++;
    chrome.storage.local.set({ isSidePanelOpen: true });
    port.onDisconnect.addListener(() => {
      openSidePanels--;
      if (openSidePanels <= 0) {
        chrome.storage.local.set({ isSidePanelOpen: false, tempSites: [] });
      }
    });
  }
});
