// content_idle.js
(() => {
    if (window !== window.top) return;

    let host = null;
    let shadow = null;
    let sidebarContainer = null;
    let sites = [];
    let tempSites = [];
    let isSidePanelOpen = false;
    let activeSiteId = null;
    let styleElement = null;
    let scrollBlocklist = [];
    let sidepanelBlocklist = [];
    let autoHideEnabled = false;
    let currentTheme = null;
    const { ADD_ICON_SVG, TRASH_ICON_SVG, SETTINGS_ICON_SVG, PIN_HEADER_SVG, TEMP_HEADER_SVG, applyThemeStyles, AutoHideManager } = __SidebarRevived;

    function init() {
        host = document.createElement('div');
        host.id = 'revived-idle-sidebar-host';
        applyThemeStyles(host, __SidebarRevived.getThemeDefaults());
        shadow = host.attachShadow({ mode: 'closed' });

        // Load styles into shadow DOM
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = chrome.runtime.getURL('content_idle.css');
        shadow.appendChild(link);

        sidebarContainer = document.createElement('div');
        sidebarContainer.id = 'revived-idle-sidebar';
        sidebarContainer.ondragover = (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        };
        sidebarContainer.ondragenter = (e) => { e.preventDefault(); };
        shadow.appendChild(sidebarContainer);

        document.documentElement.appendChild(host);

        // Host style adjustment for idle bar
        styleElement = document.createElement('style');
        document.documentElement.appendChild(styleElement);

        // Initial State Fetch
        chrome.storage.local.get(['sites', 'tempSites', 'isSidePanelOpen', 'customTheme', 'activeSiteId', 'scrollBlocklist', 'sidepanelBlocklist', 'autoHideEnabled'], (result) => {
            sites = result.sites || [];
            tempSites = result.tempSites || [];
            isSidePanelOpen = !!result.isSidePanelOpen;
            activeSiteId = result.activeSiteId;
            scrollBlocklist = result.scrollBlocklist || [];
            sidepanelBlocklist = result.sidepanelBlocklist || [];
            if (result.autoHideEnabled !== undefined) autoHideEnabled = result.autoHideEnabled;
            if (result.customTheme) {
                currentTheme = result.customTheme;
                applyTheme(currentTheme);
            }
            render();
        });

        // Listen for storage changes
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local') {
                if (changes.sites) sites = changes.sites.newValue;
                if (changes.tempSites) tempSites = changes.tempSites.newValue;
                if (changes.isSidePanelOpen) isSidePanelOpen = changes.isSidePanelOpen.newValue;
                if (changes.activeSiteId) activeSiteId = changes.activeSiteId.newValue;
                if (changes.customTheme) {
                    currentTheme = changes.customTheme.newValue;
                    applyTheme(currentTheme);
                }
                if (changes.scrollBlocklist) scrollBlocklist = changes.scrollBlocklist.newValue;
                if (changes.sidepanelBlocklist) sidepanelBlocklist = changes.sidepanelBlocklist.newValue;
                if (changes.autoHideEnabled !== undefined) {
                    autoHideEnabled = changes.autoHideEnabled.newValue;
                    if (autoHide) autoHide.cleanup();
                }
                render();
            }
        });
    }

    function applyTheme(theme) {
        applyThemeStyles(host, theme);
        if (theme?.accentColor && autoHide) {
            autoHide.updateAccentColor(theme.accentColor);
        }
    }

    let autoHide = null;

    function getAutoHide() {
        if (!autoHide) {
            autoHide = new AutoHideManager({
                onShowBar: () => {
                    populateIcons();
                    host.style.display = 'block';
                },
                onHideBar: () => { host.style.display = 'none'; },
                getPanelWidth: () => 48,
                getAccentColor: () => '#b2d7ef',
                leaveThresholdOffset: 5
            });
        }
        return autoHide;
    }

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
        const pinnedPopulated = sites && sites.length > 0;
        const tempPopulated = tempSites && tempSites.length > 0;

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
            const sourceList = data.isTemp ? [...tempSites] : [...sites];
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
            if (site.id === activeSiteId) {
                icon.classList.add('active');
            }
            if (site.faviconUrl) {
                icon.innerHTML = `<img src="${site.faviconUrl}" style="width: 20px; height: 20px; pointer-events: none;" />`;
            } else {
                icon.innerText = site.initial || site.title.charAt(0);
            }
            icon.title = site.title;

            icon.onclick = () => {
                chrome.storage.local.set({ activeSiteId: site.id });
                chrome.runtime.sendMessage({ action: 'open_side_panel' });
            };

            const dropIndicator = makeDropZone();
            sidebarContainer.appendChild(dropIndicator);

            icon.draggable = true;
            icon.ondragstart = (e) => {
                e.dataTransfer.setData('application/json', JSON.stringify({ id: site.id, isTemp: isTempList }));
                e.dataTransfer.effectAllowed = 'move';
                icon.style.opacity = '0.5';
                const btn = shadow.querySelector('.edge-sidebar-add-btn');
                if (btn) {
                    btn.classList.add('trash-mode');
                    btn.innerHTML = TRASH_ICON_SVG;
                }
                setTimeout(() => onAnyDragStart(), 0);
            };
            icon.ondragend = () => {
                icon.style.opacity = '1';
                const btn = shadow.querySelector('.edge-sidebar-add-btn');
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
            };
            icon.ondragleave = () => { dropIndicator.classList.remove('active'); };
            icon.ondrop = (e) => {
                e.preventDefault();
                dropIndicator.classList.remove('active');
                try {
                    const data = JSON.parse(e.dataTransfer.getData('application/json'));
                    if (data.id && data.id !== site.id) {
                        const sourceList = data.isTemp ? [...tempSites] : [...sites];
                        const targetList = isTempList ? [...tempSites] : [...sites];
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

            sidebarContainer.appendChild(icon);
        });

        sidebarContainer.appendChild(makeEndDropZone(siteList, isTempList));
    }

    function populateIcons() {
        sidebarContainer.innerHTML = '';

        // === PINNED SECTION ===
        pinnedHeader = makeSectionHeader(PIN_HEADER_SVG, true);
        sidebarContainer.appendChild(pinnedHeader);
        renderSiteList(sites, false);

        pinDivider = document.createElement('div');
        pinDivider.className = 'edge-sidebar-divider';
        sidebarContainer.appendChild(pinDivider);

        // === TEMP SECTION ===
        tempHeader = makeSectionHeader(TEMP_HEADER_SVG, false);
        sidebarContainer.appendChild(tempHeader);
        renderSiteList(tempSites || [], true);

        tempDivider = document.createElement('div');
        tempDivider.className = 'edge-sidebar-divider';
        sidebarContainer.appendChild(tempDivider);

        updateVisibility(false);

        const addBtn = document.createElement('div');
        addBtn.className = 'edge-sidebar-add-btn';
        addBtn.innerHTML = ADD_ICON_SVG;
        addBtn.title = "Pin Current Tab";
        addBtn.onclick = () => {
            if (addBtn.classList.contains('trash-mode')) return;
            chrome.runtime.sendMessage({ action: 'add_current_tab' });
        };

        addBtn.ondragover = (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (addBtn.classList.contains('trash-mode')) {
                addBtn.classList.add('trash-hover');
            }
        };
        addBtn.ondragenter = (e) => { e.preventDefault(); };
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
                            const currentSites = tempSites.filter(s => s.id !== data.id);
                            chrome.storage.local.set({ tempSites: currentSites });
                        } else {
                            const currentSites = sites.filter(s => s.id !== data.id);
                            chrome.storage.local.set({ sites: currentSites });
                        }
                    }
                } catch (evt) { }
            }
        };

        sidebarContainer.appendChild(addBtn);

        const settingsBtn = document.createElement('div');
        settingsBtn.className = 'edge-sidebar-icon edge-sidebar-add-btn';
        settingsBtn.title = "Settings";
        settingsBtn.style.marginTop = 'auto';
        settingsBtn.innerHTML = SETTINGS_ICON_SVG;
        settingsBtn.onclick = () => {
            chrome.storage.local.set({ isSettingsOpen: true });
            chrome.runtime.sendMessage({ action: 'open_side_panel' });
        };
        sidebarContainer.appendChild(settingsBtn);
    }

    function render() {
        const ah = getAutoHide();
        ah.cleanup();
        const hostname = window.location.hostname;
        const isSidepanelBlocked = sidepanelBlocklist.some(d => hostname.includes(d));

        if (isSidePanelOpen || isSidepanelBlocked) {
            host.style.display = 'none';
            document.documentElement.classList.remove('revived-sidebar-idle-active');
            return;
        }

        if (autoHideEnabled) {
            host.style.display = 'none';
            document.documentElement.classList.remove('revived-sidebar-idle-active');
            styleElement.textContent = '';
            ah.setup();
            return;
        }

        if (currentTheme) applyTheme(currentTheme);
        host.style.display = 'block';
        document.documentElement.classList.add('revived-sidebar-idle-active');

        const isBlocked = scrollBlocklist.some(d => hostname.includes(d));

        if (isBlocked) {
            styleElement.textContent = `
                html.revived-sidebar-idle-active {
                    margin-right: 48px !important;
                    overflow-x: hidden !important;
                    box-sizing: border-box !important;
                }
                html.revived-sidebar-idle-active body {
                    max-width: calc(100% - 48px) !important;
                    padding-right: 48px !important;
                    box-sizing: border-box !important;
                    transform: none !important;
                    height: auto !important;
                    overflow: visible !important;
                }
                #revived-idle-sidebar-host {
                    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }
            `;
        } else {
            styleElement.textContent = `
                html.revived-sidebar-idle-active {
                    margin-right: 0 !important;
                    overflow: hidden !important;
                }
                html.revived-sidebar-idle-active body {
                    width: 100vw !important;
                    max-width: calc(100vw - 48px) !important;
                    height: 100vh !important;
                    overflow-y: auto !important;
                    overflow-x: hidden !important;
                    transform: translateX(0) !important;
                    box-sizing: border-box !important;
                }
                #revived-idle-sidebar-host {
                    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }
            `;
        }

        populateIcons();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
