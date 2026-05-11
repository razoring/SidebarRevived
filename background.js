const defaultSites = [
  { id: 'search', title: 'Search', url: 'https://www.bing.com', color: '#0078D7', initial: 'S' },
  { id: 'shopping', title: 'Shopping', url: 'https://www.amazon.com', color: '#FF9900', initial: 'A' },
  { id: 'tools', title: 'Tools', url: 'https://www.calculator.net', color: '#107C10', initial: 'T' }
];

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['sites', 'activeSiteId'], (result) => {
    if (!result.sites) {
      chrome.storage.local.set({
        sites: defaultSites,
        activeSiteId: null
      });
    }
  });
});

// Configure side panel to open when extension icon is clicked
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error(error));
