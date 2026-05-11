// Establish a connection to the background script for lifecycle tracking
const port = chrome.runtime.connect({ name: 'sidepanel' });


// Keep background worker completely alive while side panel is open to ensure onDisconnect fires reliably.
setInterval(() => chrome.runtime.sendMessage({ ping: true }), 25000);

let state = {
    sites: [],
    tempSites: [],
    activeSiteId: null,
    currentUrls: {},
    customTheme: null,
    isSettingsOpen: false
};

const SETTINGS_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`;

const ADD_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M453-454H247q-10.95 0-18.98-8.04-8.02-8.03-8.02-19 0-10.96 8.02-18.96 8.03-8 18.98-8h206v-206q0-10.95 8.04-18.97 8.03-8.03 19-8.03 10.96 0 18.96 8.03 8 8.02 8 18.97v206h206q10.95 0 18.97 8.04 8.03 8.03 8.03 19 0 10.96-8.03 18.96-8.02 8-18.97 8H507v206q0 10.95-8.04 18.98-8.03 8.02-19 8.02-10.96 0-18.96-8.02-8-8.03-8-18.98v-206Z"/></svg>`;
const TRASH_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M308-140q-36.75 0-61.37-24.63Q222-189.25 222-226v-498h-26q-10.95 0-18.98-8.04-8.02-8.03-8.02-19 0-10.96 8.02-18.96 8.03-8 18.98-8h162q0-14 10.8-25t25.2-11h174q14.4 0 25.2 10.8Q604-792.4 604-778h162q10.95 0 18.97 8.04 8.03 8.03 8.03 19 0 10.96-8.03 18.96-8.02 8-18.97 8h-26v498q0 36.75-24.62 61.37Q690.75-140 654-140H308Zm378-584H276v498q0 14 9 23t23 9h346q14 0 23-9t9-23v-498ZM427-283.02q8-8.03 8-18.98v-314q0-10.95-8.04-18.97-8.03-8.03-19-8.03-10.96 0-18.96 8.03-8 8.02-8 18.97v314q0 10.95 8.04 18.98 8.03 8.02 19 8.02 10.96 0 18.96-8.02Zm146 0q8-8.03 8-18.98v-314q0-10.95-8.04-18.97-8.03-8.03-19-8.03-10.96 0-18.96 8.03-8 8.02-8 18.97v314q0 10.95 8.04 18.98 8.03 8.02 19 8.02 10.96 0 18.96-8.02ZM276-724v530-530Z"/></svg>`;

const iconBar = document.getElementById('icon-bar');
const contentArea = document.getElementById('content-area');

// Initial load
chrome.storage.local.get(['sites', 'tempSites', 'activeSiteId', 'currentUrls', 'customTheme', 'isSettingsOpen'], (result) => {
    if (result.sites) state.sites = result.sites;
    if (result.tempSites) state.tempSites = result.tempSites;
    if (result.activeSiteId) state.activeSiteId = result.activeSiteId;
    if (result.currentUrls) state.currentUrls = result.currentUrls;
    if (result.customTheme) state.customTheme = result.customTheme;
    if (result.isSettingsOpen !== undefined) state.isSettingsOpen = result.isSettingsOpen;
    applyTheme();
    render();
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        if (changes.sites) state.sites = changes.sites.newValue;
        if (changes.tempSites) state.tempSites = changes.tempSites.newValue;
        if (changes.activeSiteId) state.activeSiteId = changes.activeSiteId.newValue;
        if (changes.currentUrls) state.currentUrls = changes.currentUrls.newValue;
        if (changes.customTheme) {
            state.customTheme = changes.customTheme.newValue;
            applyTheme();
            updateSettingsUI();
        }
        if (changes.isSettingsOpen) {
            state.isSettingsOpen = changes.isSettingsOpen.newValue;
        }
        render();
    }
});

function applyTheme() {
    if (state.customTheme) {
        if (state.customTheme.fontColor) document.documentElement.style.setProperty('--theme-font-color', state.customTheme.fontColor);
        if (state.customTheme.sidebarBackground) document.documentElement.style.setProperty('--theme-sidebar-bg', state.customTheme.sidebarBackground);
        if (state.customTheme.dividerBackground) document.documentElement.style.setProperty('--theme-divider-bg', state.customTheme.dividerBackground);
        if (state.customTheme.accentColor) document.documentElement.style.setProperty('--theme-accent-color', state.customTheme.accentColor);
    } else {
        document.documentElement.style.removeProperty('--theme-font-color');
        document.documentElement.style.removeProperty('--theme-sidebar-bg');
        document.documentElement.style.removeProperty('--theme-divider-bg');
        document.documentElement.style.removeProperty('--theme-accent-color');
    }
}

function render() {
    if (state.isSettingsOpen) {
        iconBar.style.display = 'none';
        contentArea.style.display = 'none';
        const sp = document.getElementById('settings-panel');
        if (sp) sp.style.display = 'flex';
        updateSettingsUI();
        return;
    } else {
        iconBar.style.display = 'flex';
        const sp = document.getElementById('settings-panel');
        if (sp) sp.style.display = 'none';
        contentArea.style.display = state.activeSiteId ? 'flex' : 'none';
    }

    iconBar.innerHTML = '';

    // Render site icons using helper
    function renderSiteList(siteList, isTempList) {
        siteList.forEach(site => {
            const icon = document.createElement('div');
            icon.className = 'edge-sidebar-icon';
            if (site.id === state.activeSiteId) {
                icon.classList.add('active');
            }
            if (site.faviconUrl) {
                icon.innerHTML = `<img src="${site.faviconUrl}" style="width: 20px; height: 20px; pointer-events: none;" />`;
            } else {
                icon.innerText = site.initial || site.title.charAt(0);
            }
            icon.title = site.title;

            icon.onclick = () => {
                chrome.storage.local.set({ activeSiteId: (state.activeSiteId === site.id ? null : site.id) });
                if (!state.currentUrls[site.id]) {
                    state.currentUrls[site.id] = site.url;
                    chrome.storage.local.set({ currentUrls: state.currentUrls });
                }
            };

            const dropIndicator = document.createElement('div');
            dropIndicator.className = 'drop-indicator';
            iconBar.appendChild(dropIndicator);

            icon.draggable = true;
            icon.ondragstart = (e) => {
                e.dataTransfer.setData('application/json', JSON.stringify({ id: site.id, isTemp: isTempList }));
                icon.style.opacity = '0.5';
                const btn = document.querySelector('.edge-sidebar-add-btn');
                if (btn) {
                    btn.classList.add('trash-mode');
                    btn.innerHTML = TRASH_ICON_SVG;
                }
            };
            icon.ondragend = () => {
                icon.style.opacity = '1';
                const btn = document.querySelector('.edge-sidebar-add-btn');
                if (btn) {
                    btn.classList.remove('trash-mode');
                    btn.innerHTML = ADD_ICON_SVG;
                }
            };
            icon.ondragover = (e) => {
                e.preventDefault();
                dropIndicator.classList.add('active');
            };
            icon.ondragleave = () => { dropIndicator.classList.remove('active'); };
            icon.ondrop = (e) => {
                e.preventDefault();
                dropIndicator.classList.remove('active');
                try {
                    const data = JSON.parse(e.dataTransfer.getData('application/json'));
                    if (data.id && data.id !== site.id) {
                        const sourceList = data.isTemp ? [...state.tempSites] : [...state.sites];
                        const targetList = isTempList ? [...state.tempSites] : [...state.sites];
                        const fromIndex = sourceList.findIndex(s => s.id === data.id);
                        if (fromIndex === -1) return;
                        const [moved] = sourceList.splice(fromIndex, 1);

                        if (data.isTemp !== isTempList) {
                            const toIndex = targetList.findIndex(s => s.id === site.id);
                            targetList.splice(toIndex, 0, moved);
                            if (data.isTemp) {
                                chrome.storage.local.set({ tempSites: sourceList, sites: targetList });
                            } else {
                                chrome.storage.local.set({ sites: sourceList, tempSites: targetList });
                            }
                        } else {
                            const toIndex = sourceList.findIndex(s => s.id === site.id);
                            sourceList.splice(toIndex, 0, moved);
                            chrome.storage.local.set({ [isTempList ? 'tempSites' : 'sites']: sourceList });
                        }
                    }
                } catch (e) { }
            };
            iconBar.appendChild(icon);
        });

        if (siteList.length > 0) {
            const finalDropIndicator = document.createElement('div');
            finalDropIndicator.className = 'drop-indicator';
            iconBar.appendChild(finalDropIndicator);
        }
    }

    renderSiteList(state.sites, false);

    if (state.tempSites && state.tempSites.length > 0) {
        const groupDivider = document.createElement('div');
        groupDivider.className = 'edge-sidebar-divider';
        iconBar.appendChild(groupDivider);
        renderSiteList(state.tempSites, true);
    }

    const divider = document.createElement('div');
    divider.className = 'edge-sidebar-divider';
    iconBar.appendChild(divider);

    const addBtn = document.createElement('div');
    addBtn.className = 'edge-sidebar-add-btn';
    addBtn.title = "Add a new site";
    addBtn.innerHTML = ADD_ICON_SVG;
    addBtn.onclick = () => {
        if (addBtn.classList.contains('trash-mode')) return;
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
                chrome.storage.local.set({ sites: [...state.sites, newSite] });
            } else {
                alert("Cannot pin browser internal pages. Please open a regular website.");
            }
        });
    };

    // Trash drop zone
    addBtn.ondragover = (e) => {
        e.preventDefault();
        if (addBtn.classList.contains('trash-mode')) {
            addBtn.classList.add('trash-hover');
        }
    };
    addBtn.ondragleave = () => {
        addBtn.classList.remove('trash-hover');
    };
    addBtn.ondrop = (e) => {
        e.preventDefault();
        addBtn.classList.remove('trash-hover');
        if (addBtn.classList.contains('trash-mode')) {
            try {
                const data = JSON.parse(e.dataTransfer.getData('application/json'));
                if (data.id) {
                    if (data.isTemp) {
                        const currentSites = state.tempSites.filter(s => s.id !== data.id);
                        chrome.storage.local.set({ tempSites: currentSites });
                    } else {
                        const currentSites = state.sites.filter(s => s.id !== data.id);
                        chrome.storage.local.set({ sites: currentSites });
                    }
                    if (state.activeSiteId === data.id) {
                        chrome.storage.local.set({ activeSiteId: null });
                    }
                }
            } catch (evt) { }
        }
    };

    iconBar.appendChild(addBtn);

    // Add Settings Icon at the bottom (Divider removed)
    const settingsBtn = document.createElement('div');
    settingsBtn.className = 'edge-sidebar-icon edge-sidebar-add-btn';
    settingsBtn.title = "Settings";
    settingsBtn.style.marginTop = 'auto'; // push to bottom or let flex manage
    settingsBtn.innerHTML = SETTINGS_ICON_SVG;
    settingsBtn.onclick = () => {
        chrome.storage.local.set({ isSettingsOpen: true });
    };
    iconBar.appendChild(settingsBtn);

    // Content Area: Persistent Multi-Iframe state
    if (state.activeSiteId) {
        contentArea.classList.add('active');
        const activeSite = state.sites.find(s => s.id === state.activeSiteId);
        if (activeSite) {
            // Update browser sidepanel title
            document.title = activeSite.title;

            // Ensure iframe exists for the active site
            let targetIframe = document.getElementById('iframe-' + activeSite.id);

            // Hide all other iframes to preserve their state in background
            const allIframes = document.querySelectorAll('.app-frame-instance');
            allIframes.forEach(f => f.style.display = 'none');

            if (!targetIframe) {
                targetIframe = document.createElement('iframe');
                targetIframe.id = 'iframe-' + activeSite.id;
                targetIframe.className = 'app-frame-instance';
                targetIframe.style.flex = '1';
                targetIframe.style.border = 'none';
                targetIframe.style.width = '100%';
                targetIframe.style.height = '100%';
                targetIframe.allow = "camera; microphone; geolocation; clipboard-read; clipboard-write; autoplay; fullscreen";
                targetIframe.src = activeSite.url;
                contentArea.appendChild(targetIframe);
            } else {
                targetIframe.style.display = 'block';
            }

            // Cleanup placeholder if it exists
            const defaultIframe = document.getElementById('app-frame');
            if (defaultIframe) defaultIframe.remove();
        }
    } else {
        contentArea.classList.remove('active');
        document.title = "Sidebar";
    }
}

function updateSettingsUI() {
    const theme = state.customTheme || {};
    const fontInp = document.getElementById('theme-font-color');
    const bgInp = document.getElementById('theme-sidebar-bg');
    const divInp = document.getElementById('theme-divider-bg');
    const accentInp = document.getElementById('theme-accent-color');

    // Set colors, fallback to standard defaults
    fontInp.value = theme.fontColor || '#ffffff';
    bgInp.value = theme.sidebarBackground || '#2b2b2b';
    divInp.value = theme.dividerBackground || '#555555';
    accentInp.value = theme.accentColor || '#0078d7';

    // Update labels
    document.getElementById('val-font-color').textContent = fontInp.value;
    document.getElementById('val-sidebar-bg').textContent = bgInp.value;
    document.getElementById('val-divider-bg').textContent = divInp.value;
    document.getElementById('val-accent-color').textContent = accentInp.value;
}

document.getElementById('settings-back-btn').addEventListener('click', () => {
    chrome.storage.local.set({ isSettingsOpen: false });
});

function debounceThemeUpdate() {
    const newTheme = {
        fontColor: document.getElementById('theme-font-color').value,
        sidebarBackground: document.getElementById('theme-sidebar-bg').value,
        dividerBackground: document.getElementById('theme-divider-bg').value,
        accentColor: document.getElementById('theme-accent-color').value
    };
    chrome.storage.local.set({ customTheme: newTheme });
}

['font-color', 'sidebar-bg', 'divider-bg', 'accent-color'].forEach(id => {
    document.getElementById('theme-' + id).addEventListener('input', (e) => {
        document.getElementById('val-' + id).textContent = e.target.value;
        debounceThemeUpdate();
    });
});

document.getElementById('export-theme-btn').addEventListener('click', () => {
    const themeStr = JSON.stringify(state.customTheme || {}, null, 2);
    const blob = new Blob([themeStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "sidebar_theme.json";
    a.click();
    URL.revokeObjectURL(url);
});

document.getElementById('import-theme-btn').addEventListener('click', () => {
    document.getElementById('import-theme-file').click();
});

document.getElementById('import-theme-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
        try {
            const parsed = JSON.parse(ev.target.result);
            chrome.storage.local.set({ customTheme: parsed });
        } catch (err) {
            alert("Invalid Theme JSON");
        }
    };
    reader.readAsText(file);
});
