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
    isSettingsOpen: false,
    scrollBlocklist: [],
    sidepanelBlocklist: [],
    activeSiteOwner: null,
    collapsedSections: JSON.parse(localStorage.getItem('collapsedSections') || '{}'),
    autoHideEnabled: false,
    _loaded: false
};

const { createSiteFromTab, applyThemeStyles, getThemeDefaults } = __SidebarRevived;

const iconBar = document.getElementById('icon-bar');
const contentArea = document.getElementById('content-area');

iconBar.ondragover = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
};
iconBar.ondragenter = (e) => {
    e.preventDefault();
};

// Initial load
chrome.storage.local.get(['sites', 'tempSites', 'activeSiteId', 'currentUrls', 'customTheme', 'isSettingsOpen', 'scrollBlocklist', 'sidepanelBlocklist', 'autoHideEnabled', 'activeSiteOwner'], (result) => {
    if (state._loaded) { render(); return; }
    state._loaded = true;
    if (result.sites) state.sites = result.sites;
    if (result.tempSites) state.tempSites = result.tempSites;
    if (result.activeSiteId) state.activeSiteId = result.activeSiteId;
    if (result.currentUrls) state.currentUrls = result.currentUrls;
    if (result.customTheme) state.customTheme = result.customTheme;
    if (result.isSettingsOpen !== undefined) state.isSettingsOpen = result.isSettingsOpen;
    if (result.scrollBlocklist) state.scrollBlocklist = result.scrollBlocklist;
    if (result.sidepanelBlocklist) state.sidepanelBlocklist = result.sidepanelBlocklist;
    if (result.autoHideEnabled !== undefined) state.autoHideEnabled = result.autoHideEnabled;
    if (result.activeSiteOwner !== undefined) state.activeSiteOwner = result.activeSiteOwner;
    applyTheme();
    // Always render, even if sites is empty - this ensures settings opens on first click
    render();
    // If settings was set to open before storage loaded, ensure it shows
    if (state.isSettingsOpen) {
        document.getElementById('icon-bar').style.display = 'none';
        document.getElementById('content-area').style.display = 'none';
    }
});

chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
        state._loaded = true;
        if (changes.sites) state.sites = changes.sites.newValue;
        if (changes.tempSites) state.tempSites = changes.tempSites.newValue;
        if (changes.activeSiteId !== undefined) {
            state.activeSiteId = changes.activeSiteId.newValue;
        }
        if (changes.activeSiteOwner !== undefined) {
            state.activeSiteOwner = changes.activeSiteOwner.newValue;
        }
        if (changes.currentUrls) state.currentUrls = changes.currentUrls.newValue;
        if (changes.customTheme) {
            state.customTheme = changes.customTheme.newValue;
            applyTheme();
            updateSettingsUI();
        }
        if (changes.isSettingsOpen !== undefined) {
            state.isSettingsOpen = changes.isSettingsOpen.newValue;
        }
        if (changes.scrollBlocklist) {
            state.scrollBlocklist = changes.scrollBlocklist.newValue;
            updateSettingsUI();
        }
        if (changes.sidepanelBlocklist) {
            state.sidepanelBlocklist = changes.sidepanelBlocklist.newValue;
            updateSettingsUI();
        }
        if (changes.autoHideEnabled) {
            state.autoHideEnabled = changes.autoHideEnabled.newValue;
            updateSettingsUI();
        }
        render();
    }
});

function applyTheme() {
    applyThemeStyles(document.documentElement, state.customTheme);
}

async function render() {
    if (state.isSettingsOpen) {
        iconBar.style.display = 'none';
        contentArea.style.display = 'none';
        const note = document.getElementById('inpage-sidebar-note');
        if (note) note.style.display = 'none';
        const sp = document.getElementById('settings-panel');
        if (sp) sp.style.display = 'flex';
        initCollapsibleSections();
        updateSettingsUI();
        return;
    }

    iconBar.style.display = 'flex';
    const sp = document.getElementById('settings-panel');
    if (sp) sp.style.display = 'none';

    const inPageActive = state.activeSiteOwner === 'inpage';
    const note = document.getElementById('inpage-sidebar-note');
    if (note) note.style.display = inPageActive ? 'flex' : 'none';
    contentArea.style.display = (!inPageActive && state.activeSiteId) ? 'flex' : 'none';

    const iconBarOptions = {
        sites: state.sites,
        tempSites: state.tempSites || [],
        activeSiteId: state.activeSiteId,
        getSites: () => state.sites,
        getTempSites: () => state.tempSites,
            onSiteClick: (siteId, site) => {
                const newId = state.activeSiteId === siteId ? null : siteId;
                chrome.storage.local.set({ activeSiteId: newId, activeSiteOwner: newId ? 'sidepanel' : null, isSettingsOpen: false });
                if (!state.currentUrls[siteId]) {
                    state.currentUrls[siteId] = site.url;
                    chrome.storage.local.set({ currentUrls: state.currentUrls });
                }
            },
        onAddSite: () => {
            chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
                const tab = tabs[0];
                if (tab && tab.url && tab.url.startsWith('http')) {
                    const newSite = createSiteFromTab(tab);
                    chrome.storage.local.set({ sites: [...state.sites, newSite] });
                } else {
                    alert("Cannot pin browser internal pages. Please open a regular website.");
                }
            });
        },
        onSettingsClick: () => {
            chrome.storage.local.set({ isSettingsOpen: true });
        },
        getIconOpacity: (site) => (site.id === state.activeSiteId || document.getElementById('iframe-' + site.id)) ? '1' : '0.5'
    };

    await __SidebarRevived.renderIconBar(iconBar, iconBarOptions);

    if (inPageActive) return;

    // Content Area: Persistent Multi-Iframe state
    if (state.activeSiteId) {
        contentArea.classList.add('active');
        const activeSite = state.sites.find(s => s.id === state.activeSiteId) || (state.tempSites && state.tempSites.find(s => s.id === state.activeSiteId));
        if (activeSite) {
            document.title = activeSite.title;

            let targetIframe = document.getElementById('iframe-' + activeSite.id);

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

            const defaultIframe = document.getElementById('app-frame');
            if (defaultIframe) defaultIframe.remove();
        }
    } else {
        contentArea.classList.remove('active');
        document.title = "Sidebar";
    }
}

function initCollapsibleSections() {
    document.querySelectorAll('.settings-category-header.collapsible').forEach(header => {
        const targetId = header.dataset.target;
        const isCollapsed = state.collapsedSections[targetId];
        if (isCollapsed) header.classList.add('collapsed');
    });
}

function updateSettingsUI() {
    const theme = state.customTheme || {};
    const fields = [
        { input: 'theme-font-color', hex: 'hex-font-color', fallback: '#ffffff' },
        { input: 'theme-sidebar-bg', hex: 'hex-sidebar-bg', fallback: '#38393c' },
        { input: 'theme-divider-bg', hex: 'hex-divider-bg', fallback: '#555555' },
        { input: 'theme-accent-color', hex: 'hex-accent-color', fallback: '#b2d7ef' }
    ];

    const themeKey = { 'theme-font-color': 'fontColor', 'theme-sidebar-bg': 'sidebarBackground', 'theme-divider-bg': 'dividerBackground', 'theme-accent-color': 'accentColor' };

    fields.forEach(f => {
        const inp = document.getElementById(f.input);
        const hex = document.getElementById(f.hex);
        const val = theme[themeKey[f.input]] || f.fallback;
        if (inp) inp.value = val;
        if (hex && document.activeElement !== hex) hex.value = val;
    });

    const opacitySlider = document.getElementById('theme-panel-opacity');
    const opacityVal = document.getElementById('val-panel-opacity');
    const opacity = theme.panelOpacity !== undefined ? theme.panelOpacity : 1;
    if (opacitySlider) opacitySlider.value = opacity;
    if (opacityVal) opacityVal.textContent = Math.round(opacity * 100) + '%';

    const blurSlider = document.getElementById('theme-panel-blur');
    const blurVal = document.getElementById('val-panel-blur');
    const blur = theme.panelBlur !== undefined ? theme.panelBlur : 0;
    if (blurSlider) blurSlider.value = blur;
    if (blurVal) blurVal.textContent = blur + 'px';

    const scrollInp = document.getElementById('settings-scroll-blocklist');
    if (scrollInp && document.activeElement !== scrollInp) {
        scrollInp.value = (state.scrollBlocklist || []).join('\n');
    }

    const sideInp = document.getElementById('settings-sidepanel-blocklist');
    if (sideInp && document.activeElement !== sideInp) {
        sideInp.value = (state.sidepanelBlocklist || []).join('\n');
    }

    const addBtn = document.getElementById('add-to-blocklist-btn');
    if (addBtn) {
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
            const tab = tabs[0];
            if (tab && tab.url && tab.url.startsWith('http')) {
                const hostname = new URL(tab.url).hostname;
                const currentList = state.scrollBlocklist || [];
                addBtn.textContent = currentList.includes(hostname)
                    ? 'Remove Current Site from Blocklist'
                    : 'Add Current Site to Blocklist';
            }
        });
    }

    const sideBtn = document.getElementById('add-to-sidepanel-blocklist-btn');
    if (sideBtn) {
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
            const tab = tabs[0];
            if (tab && tab.url && tab.url.startsWith('http')) {
                const hostname = new URL(tab.url).hostname;
                const currentList = state.sidepanelBlocklist || [];
                sideBtn.textContent = currentList.includes(hostname)
                    ? 'Remove Current Site from Blocklist'
                    : 'Add Current Site to Blocklist';
            }
        });
    }

    const autoHideChk = document.getElementById('settings-auto-hide');
    if (autoHideChk) autoHideChk.checked = state.autoHideEnabled;
}

// Collapsible section toggle
document.getElementById('settings-panel').addEventListener('click', (e) => {
    const header = e.target.closest('.settings-category-header.collapsible');
    if (!header) return;
    const targetId = header.dataset.target;
    header.classList.toggle('collapsed');
    state.collapsedSections[targetId] = header.classList.contains('collapsed');
    localStorage.setItem('collapsedSections', JSON.stringify(state.collapsedSections));
});

fetch(chrome.runtime.getURL('assets/close_icon.svg'))
    .then(r => r.text())
    .then(svg => {
        const btn = document.getElementById('settings-back-btn');
        if (btn) btn.innerHTML = svg;
    });

document.getElementById('settings-back-btn').addEventListener('click', () => {
    chrome.storage.local.set({ isSettingsOpen: false });
});

function debounceThemeUpdate() {
    const opacitySlider = document.getElementById('theme-panel-opacity');
    const blurSlider = document.getElementById('theme-panel-blur');
    const newTheme = {
        fontColor: document.getElementById('theme-font-color').value,
        sidebarBackground: document.getElementById('theme-sidebar-bg').value,
        dividerBackground: document.getElementById('theme-divider-bg').value,
        accentColor: document.getElementById('theme-accent-color').value,
        panelOpacity: opacitySlider ? parseFloat(opacitySlider.value) : 1,
        panelBlur: blurSlider ? parseInt(blurSlider.value, 10) : 0
    };
    chrome.storage.local.set({ customTheme: newTheme });
}

function updateSwatchFromInput(inputId, hexId) {
    const inp = document.getElementById(inputId);
    const hex = document.getElementById(hexId);
    if (inp && hex) hex.value = inp.value;
    debounceThemeUpdate();
}

const colorFields = [
    { input: 'theme-font-color', hex: 'hex-font-color' },
    { input: 'theme-sidebar-bg', hex: 'hex-sidebar-bg' },
    { input: 'theme-divider-bg', hex: 'hex-divider-bg' },
    { input: 'theme-accent-color', hex: 'hex-accent-color' }
];

colorFields.forEach(f => {
    document.getElementById(f.input).addEventListener('input', () => {
        updateSwatchFromInput(f.input, f.hex);
    });
    document.getElementById(f.hex).addEventListener('input', (e) => {
        const val = e.target.value.trim();
        if (/^#[0-9a-fA-F]{6}$/.test(val)) {
            const inp = document.getElementById(f.input);
            if (inp) inp.value = val;
            debounceThemeUpdate();
        }
    });
    document.getElementById(f.hex).addEventListener('blur', (e) => {
        const val = e.target.value.trim();
        if (!/^#[0-9a-fA-F]{6}$/.test(val)) {
            const inp = document.getElementById(f.input);
            if (inp) e.target.value = inp ? inp.value : '';
        }
    });
});

document.getElementById('theme-panel-opacity').addEventListener('input', (e) => {
    const val = document.getElementById('val-panel-opacity');
    const pct = Math.round(parseFloat(e.target.value) * 100);
    if (val) val.textContent = pct + '%';
    debounceThemeUpdate();
});

document.getElementById('theme-panel-blur').addEventListener('input', (e) => {
    const val = document.getElementById('val-panel-blur');
    const px = parseInt(e.target.value, 10);
    if (val) val.textContent = px + 'px';
    debounceThemeUpdate();
});

document.getElementById('settings-auto-hide').addEventListener('change', (e) => {
    state.autoHideEnabled = e.target.checked;
    chrome.storage.local.set({ autoHideEnabled: state.autoHideEnabled });
});

document.getElementById('settings-scroll-blocklist').addEventListener('input', (e) => {
    const list = e.target.value.split('\n').map(s => s.trim()).filter(s => s.length > 0);
    chrome.storage.local.set({ scrollBlocklist: list });
});

document.getElementById('add-to-blocklist-btn').addEventListener('click', () => {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (tab && tab.url && tab.url.startsWith('http')) {
            const hostname = new URL(tab.url).hostname;
            const currentList = state.scrollBlocklist || [];
            if (!currentList.includes(hostname)) {
                chrome.storage.local.set({ scrollBlocklist: [...currentList, hostname] });
            } else {
                chrome.storage.local.set({ scrollBlocklist: currentList.filter(d => d !== hostname) });
            }
        }
    });
});

document.getElementById('settings-sidepanel-blocklist').addEventListener('input', (e) => {
    const list = e.target.value.split('\n').map(s => s.trim()).filter(s => s.length > 0);
    chrome.storage.local.set({ sidepanelBlocklist: list });
});

document.getElementById('add-to-sidepanel-blocklist-btn').addEventListener('click', () => {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (tab && tab.url && tab.url.startsWith('http')) {
            const hostname = new URL(tab.url).hostname;
            const currentList = state.sidepanelBlocklist || [];
            if (!currentList.includes(hostname)) {
                chrome.storage.local.set({ sidepanelBlocklist: [...currentList, hostname] });
            } else {
                chrome.storage.local.set({ sidepanelBlocklist: currentList.filter(d => d !== hostname) });
            }
        }
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

document.getElementById('reset-theme-btn').addEventListener('click', () => {
    chrome.storage.local.set({ customTheme: getThemeDefaults() });
});
