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
    collapsedSections: JSON.parse(localStorage.getItem('collapsedSections') || '{}'),
    autoHideEnabled: false
};

const { ADD_ICON_SVG, TRASH_ICON_SVG, SETTINGS_ICON_SVG, createSiteFromTab, applyThemeStyles, getThemeDefaults } = __SidebarRevived;

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
chrome.storage.local.get(['sites', 'tempSites', 'activeSiteId', 'currentUrls', 'customTheme', 'isSettingsOpen', 'scrollBlocklist', 'sidepanelBlocklist', 'autoHideEnabled'], (result) => {
    if (result.sites) state.sites = result.sites;
    if (result.tempSites) state.tempSites = result.tempSites;
    if (result.activeSiteId) state.activeSiteId = result.activeSiteId;
    if (result.currentUrls) state.currentUrls = result.currentUrls;
    if (result.customTheme) state.customTheme = result.customTheme;
    if (result.isSettingsOpen !== undefined) state.isSettingsOpen = result.isSettingsOpen;
    if (result.scrollBlocklist) state.scrollBlocklist = result.scrollBlocklist;
    if (result.sidepanelBlocklist) state.sidepanelBlocklist = result.sidepanelBlocklist;
    if (result.autoHideEnabled !== undefined) state.autoHideEnabled = result.autoHideEnabled;
    applyTheme();
    render();
    chrome.storage.local.set({ isSidePanelOpen: true });
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

function render() {
    if (state.isSettingsOpen) {
        iconBar.style.display = 'none';
        contentArea.style.display = 'none';
        const sp = document.getElementById('settings-panel');
        if (sp) sp.style.display = 'flex';
        initCollapsibleSections();
        updateSettingsUI();
        return;
    } else {
        iconBar.style.display = 'flex';
        const sp = document.getElementById('settings-panel');
        if (sp) sp.style.display = 'none';
        contentArea.style.display = state.activeSiteId ? 'flex' : 'none';
    }

    iconBar.innerHTML = '';

    const PIN_HEADER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M616-789v299l64 62q4 4 6 8.5t2 10.17v15.66q0 10.67-8.31 19.17-8.31 8.5-19.69 8.5H507v213q0 10.95-8.04 18.98-8.03 8.02-19 8.02-10.96 0-18.96-8.02-8-8.03-8-18.98v-213H300q-11.37 0-19.69-8.5Q272-383 272-393.67v-15.66q0-5.67 2-10.17t6-8.5l64-62v-299h-26q-6.95-4-11.48-11.04-4.52-7.03-4.52-15 0-10.96 8.02-18.96 8.03-8 18.98-8h302q10.95 0 18.97 8.04 8.03 8.03 8.03 19 0 7.96-4.53 14.96-4.52 7-11.47 11h-26ZM350-420h260l-48-48v-320H398v320l-48 48Zm130 0Z"/></svg>`;

    const TEMP_HEADER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M211.54-700Q201-710 201-724t10.54-24q10.53-10 24.7-10t23.47 10q9.29 10 9.29 24t-9.29 24q-9.3 10-23.47 10-14.17 0-24.7-10Zm156.48-91.31Q358-800.62 358-813.81t10.02-23.69q10.01-10.5 23-10.5Q404-848 414-837.5t10 23.69q0 13.19-10 22.5T391.02-782q-12.99 0-23-9.31Zm177.98 0q-10-9.31-10-22.5t10-23.69q10-10.5 22.98-10.5 12.99 0 23 10.5Q602-827 602-813.81q0 13.19-10.02 22.5-10.01 9.31-23 9.31-12.98 0-22.98-9.31Zm154.29 89.81Q691-711 691-725.21q0-14.2 9.29-23.5 9.3-9.29 23.5-9.29 14.21 0 23.71 9.29 9.5 9.3 9.5 23.5 0 14.21-9.5 23.71t-23.71 9.5q-14.2 0-23.5-9.5Zm90.23 155.45q-9.52-10.06-9.52-24 0-13.95 9.72-24.45 9.73-10.5 23.5-10.5Q828-605 838-594.45q10 10.56 10 24.5Q848-556 837.95-546q-10.06 10-23.99 10-13.93 0-23.44-10.05Zm.79 178.03q-9.31-10.01-9.31-23 0-12.98 9.31-22.98t22.5-10q13.19 0 23.69 10 10.5 10 10.5 22.98 0 12.99-10.5 23Q827-358 813.81-358q-13.19 0-22.5-10.02ZM700.29-212.5Q691-222 691-236.21q0-14.2 9.29-23.5 9.3-9.29 23.5-9.29 14.21 0 23.71 9.29 9.5 9.3 9.5 23.5 0 14.21-9.5 23.71t-23.71 9.5q-14.2 0-23.5-9.5ZM546-122.5q-10-10.5-10-23.69 0-13.19 10-22.5t22.98-9.31q12.99 0 23 9.31 10.02 9.31 10.02 22.5t-10.02 23.69q-10.01 10.5-23 10.5Q556-112 546-122.5Zm-177.98 0Q358-133 358-146.19q0-13.19 10.02-22.5 10.01-9.31 23-9.31 12.98 0 22.98 9.31t10 22.5q0 13.19-10 23.69-10 10.5-22.98 10.5-12.99 0-23-10.5ZM211-212q-10-10-10-23t10-24q10-11 23-11t24 11q11 11 11 24t-11 23q-11 10-24 10t-23-10Zm-65.22-146q-13.78 0-24.28-9.72-10.5-9.73-10.5-23.5Q111-405 121.55-415q10.56-10 24.49-10 13.93 0 23.44 10.05 9.52 10.06 9.52 23.99 0 13.93-9.72 23.44-9.73 9.52-23.5 9.52Zm.41-178q-13.19 0-23.69-10-10.5-10-10.5-22.98 0-12.99 10.5-23Q133-602 146.19-602q13.19 0 22.5 10.02 9.31 10.01 9.31 23 0 12.98-9.31 22.98t-22.5 10ZM507-489.91 631-366q8 8 7.5 18.5T630-329q-8 8-18.67 8-10.66 0-18.33-8L466-457q-7-6.71-10-14.07T453-487v-153q0-10.95 8.04-18.97 8.03-8.03 19-8.03 10.96 0 18.96 8.03 8 8.02 8 18.97v150.09Z"/></svg>`;

    function makeDropZone() {
        const z = document.createElement('div');
        z.className = 'drop-indicator';
        return z;
    }

    function makeSectionHeader(svg, isPinned) {
        const el = document.createElement('div');
        el.className = isPinned ? 'pinned-header' : 'temp-header';
        el.style.cssText = `width: 32px; height: 32px; display: none; align-items: center; justify-content: center; color: var(--theme-font-color, inherit);`;
        const inner = document.createElement('div');
        inner.style.cssText = isPinned ? 'transform: rotate(45deg); display: flex;' : 'display: flex;';
        inner.innerHTML = svg;
        el.appendChild(inner);
        return el;
    }

    let pinnedHeader, tempHeader, pinDivider, tempDivider;

    function updateVisibility(isDragging = false) {
        const pinnedPopulated = state.sites && state.sites.length > 0;
        const tempPopulated = state.tempSites && state.tempSites.length > 0;

        // Hide headers/icons unless dragging
        if (pinnedHeader) pinnedHeader.style.display = isDragging ? 'flex' : 'none';
        if (tempHeader) tempHeader.style.display = isDragging ? 'flex' : 'none';

        // Dividers stay if dragging OR if the section is not empty
        if (pinDivider) pinDivider.style.display = (isDragging || pinnedPopulated) ? 'block' : 'none';
        if (tempDivider) tempDivider.style.display = (isDragging || tempPopulated) ? 'block' : 'none';
    }

    function onAnyDragStart() {
        updateVisibility(true);
    }

    function onAnyDragEnd() {
        updateVisibility(false);
    }

    function dropIntoSiteList(e, targetList, isTempList) {
        try {
            const data = JSON.parse(e.dataTransfer.getData('application/json'));
            if (!data.id) return;
            const sourceList = data.isTemp ? [...state.tempSites] : [...state.sites];
            const targetArr = [...targetList];
            const fromIndex = sourceList.findIndex(s => s.id === data.id);
            if (fromIndex === -1) return;
            const [moved] = sourceList.splice(fromIndex, 1);
            targetArr.push(moved);

            if (data.isTemp !== isTempList) {
                if (data.isTemp) {
                    chrome.storage.local.set({ tempSites: sourceList, sites: targetArr });
                } else {
                    chrome.storage.local.set({ sites: sourceList, tempSites: targetArr });
                }
            } else {
                chrome.storage.local.set({ [isTempList ? 'tempSites' : 'sites']: targetArr });
            }
        } catch (e) { }
    }

    function makeEndDropZone(targetList, isTempList) {
        const zone = makeDropZone();
        zone.ondragover = (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            zone.classList.add('active');
        };
        zone.ondragenter = (e) => { e.preventDefault(); };
        zone.ondragleave = () => { zone.classList.remove('active'); };
        zone.ondrop = (e) => { e.preventDefault(); zone.classList.remove('active'); dropIntoSiteList(e, targetList, isTempList); };
        return zone;
    }

    function renderSiteList(siteList, isTempList) {
        siteList.forEach(site => {
            const icon = document.createElement('div');
            icon.className = 'edge-sidebar-icon';
            if (site.id === state.activeSiteId) {
                icon.classList.add('active');
            }
            icon.style.opacity = (site.id === state.activeSiteId || document.getElementById('iframe-' + site.id)) ? '1' : '0.5';
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

            const dropIndicator = makeDropZone();
            iconBar.appendChild(dropIndicator);

            icon.draggable = true;
            icon.ondragstart = (e) => {
                e.dataTransfer.setData('application/json', JSON.stringify({ id: site.id, isTemp: isTempList }));
                e.dataTransfer.effectAllowed = 'move';
                icon.style.opacity = '0.5';
                const btn = document.querySelector('.edge-sidebar-add-btn');
                if (btn) {
                    btn.classList.add('trash-mode');
                    btn.innerHTML = TRASH_ICON_SVG;
                }
                // Defer visibility change to prevent layout shift from breaking the drag start
                setTimeout(() => onAnyDragStart(), 0);
            };
            icon.ondragend = () => {
                icon.style.opacity = '1';
                const btn = document.querySelector('.edge-sidebar-add-btn');
                if (btn) {
                    btn.classList.remove('trash-mode');
                    btn.innerHTML = ADD_ICON_SVG;
                }
                onAnyDragEnd();
            };
            icon.ondragover = (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                dropIndicator.classList.add('active');
                icon.style.borderTop = '2px solid var(--theme-accent-color, #0078D7)';
            };
            icon.ondragleave = () => {
                dropIndicator.classList.remove('active');
                icon.style.borderTop = '';
            };
            icon.ondrop = (e) => {
                e.preventDefault();
                dropIndicator.classList.remove('active');
                icon.style.borderTop = '';
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
                            let toIndex = sourceList.findIndex(s => s.id === site.id);
                            if (fromIndex < toIndex) toIndex--;
                            sourceList.splice(toIndex, 0, moved);
                            chrome.storage.local.set({ [isTempList ? 'tempSites' : 'sites']: sourceList });
                        }
                    }
                } catch (e) { }
            };
            iconBar.appendChild(icon);
        });

        iconBar.appendChild(makeEndDropZone(siteList, isTempList));
    }

    // === PINNED SECTION ===
    pinnedHeader = makeSectionHeader(PIN_HEADER_SVG, true);
    iconBar.appendChild(pinnedHeader);
    renderSiteList(state.sites, false);

    pinDivider = document.createElement('div');
    pinDivider.className = 'edge-sidebar-divider';
    iconBar.appendChild(pinDivider);

    // === TEMP SECTION ===
    tempHeader = makeSectionHeader(TEMP_HEADER_SVG, false);
    iconBar.appendChild(tempHeader);
    renderSiteList(state.tempSites || [], true);

    tempDivider = document.createElement('div');
    tempDivider.className = 'edge-sidebar-divider';
    iconBar.appendChild(tempDivider);

    updateVisibility(false);


    const addBtn = document.createElement('div');
    addBtn.className = 'edge-sidebar-add-btn';
    addBtn.title = "Add a new site";
    addBtn.innerHTML = ADD_ICON_SVG;
    addBtn.onclick = () => {
        if (addBtn.classList.contains('trash-mode')) return;
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
            const tab = tabs[0];
            if (tab && tab.url && tab.url.startsWith('http')) {
                const newSite = createSiteFromTab(tab);
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
        const activeSite = state.sites.find(s => s.id === state.activeSiteId) || (state.tempSites && state.tempSites.find(s => s.id === state.activeSiteId));
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
