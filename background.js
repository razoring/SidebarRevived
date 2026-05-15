importScripts('shared.js');

let openSidePanels = 0;

chrome.runtime.onInstalled.addListener(async (details) => {
    const defaults = {
    sites: [],
    tempSites: [],
    activeSiteId: null,
    activeSiteOwner: null,
    isSettingsOpen: false,
    isAddPageOpen: false,
    isSidePanelOpen: false,
    autoHideEnabled: false,
    showCategoryIcons: false,
    scrollBlocklist: [],
    sidepanelBlocklist: [],
    autoHideBlocklist: [],
    customTheme: __SidebarRevived.getThemeDefaults()
  };

  await new Promise(resolve => {
    chrome.storage.local.get(Object.keys(defaults), (result) => {
      const toSet = {};
      for (const key in defaults) {
        if (result[key] === undefined) {
          toSet[key] = defaults[key];
        }
      }
      if (Object.keys(toSet).length > 0) {
        chrome.storage.local.set(toSet, resolve);
      } else {
        resolve();
      }
    });
  });

  chrome.contextMenus.create({
    id: "send_to_sidebar",
    title: "Send to Sidebar",
    contexts: ["page"]
  });

  // Inject into existing tabs
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.url || !tab.url.startsWith('http')) continue;
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['shared.js', 'content.js']
    }).catch(() => { });

    chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      files: ['persistence.js']
    }).catch(() => { });
  }

  if (details.reason === 'install') {
    const windows = await chrome.windows.getAll({ populate: false });
    if (windows.length > 0) {
      chrome.sidePanel.open({ windowId: windows[0].id }).catch(() => {});
    }
  }
});

// Reset state on worker startup. Since the worker is kept alive while the panel is open, 
// this only runs on clean startup or extension reload.
chrome.storage.local.set({ isSidePanelOpen: false });

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "send_to_sidebar") {
    if (tab && tab.url && tab.url.startsWith('http')) {
      const newSite = __SidebarRevived.createSiteFromTab(tab);
      // Force sidepanel open first
      chrome.sidePanel.open({ windowId: tab.windowId }).then(() => {
        chrome.storage.local.get(['tempSites'], (result) => {
          chrome.storage.local.set({
            tempSites: [...(result.tempSites || []), newSite],
            activeSiteId: newSite.id,
            activeSiteOwner: 'sidepanel'
          });
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
    chrome.sidePanel.open({ windowId: sender.tab.windowId }).then(() => {
      chrome.storage.local.set({ isAddPageOpen: true, isSettingsOpen: false });
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
        chrome.storage.local.set({ isSidePanelOpen: false, tempSites: [], activeSiteId: null, activeSiteOwner: null });
      }
    });
  }
});
