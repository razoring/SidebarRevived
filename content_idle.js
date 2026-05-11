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
    let activeSiteOwner = null;
    let styleElement = null;
    let scrollBlocklist = [];
    let sidepanelBlocklist = [];
    let autoHideEnabled = false;
    let currentTheme = null;
    const { ADD_ICON_SVG, TRASH_ICON_SVG, SETTINGS_ICON_SVG, applyThemeStyles, AutoHideManager } = __SidebarRevived;

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
            activeSiteOwner = result.activeSiteOwner;
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
                if (changes.activeSiteOwner) activeSiteOwner = changes.activeSiteOwner.newValue;
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
                if (changes.customTheme) {
                    currentTheme = changes.customTheme.newValue;
                    applyTheme(currentTheme);
                    render();
                }
                render();
            }
        });
    }

    function applyTheme(theme) {
        // Idle sidebar never blends (user request: ONLY if autohide and in-page)
        applyThemeStyles(host, theme, null);
        if (theme?.accentColor && autoHide) {
            autoHide.updateAccentColor(theme.accentColor);
        }
    }


    let autoHide = null;

    function getAutoHide() {
        if (!autoHide) {
            autoHide = new AutoHideManager({
                onShowBar: () => {
                    render();
                },
                onHideBar: () => {
                    render();
                },
                getPanelWidth: () => 48,
                getAccentColor: () => '#b2d7ef',
                leaveThresholdOffset: 5
            });
        }
        return autoHide;
    }

    function populateIcons() {
        __SidebarRevived.renderIconBar(sidebarContainer, {
            sites: sites,
            tempSites: tempSites || [],
            activeSiteId: activeSiteId,
            getSites: () => sites,
            getTempSites: () => tempSites,
            onSiteClick: (siteId) => {
                if (!chrome.runtime?.id) return;
                chrome.storage.local.set({ activeSiteId: siteId, activeSiteOwner: 'inpage' });
            },
            onAddSite: () => {
                if (!chrome.runtime?.id) return;
                chrome.runtime.sendMessage({ action: 'add_current_tab' });
            },
            onSettingsClick: () => {
                if (!chrome.runtime?.id) return;
                chrome.storage.local.set({ isSettingsOpen: true });
                chrome.runtime.sendMessage({ action: 'open_side_panel' });
            }
        });
    }

    function hideCompletely() {
        host.style.display = 'none';
        document.documentElement.classList.remove('revived-sidebar-idle-active');
        styleElement.textContent = '';
    }

    function showAsOverlay() {
        // Overlay mode: visible but no page offset (auto-hide / future sidepanelOnly)
        if (currentTheme) applyTheme(currentTheme);
        host.style.display = 'block';
        document.documentElement.classList.remove('revived-sidebar-idle-active');
        styleElement.textContent = '';
        populateIcons();
    }

    function showWithOffset() {
        if (currentTheme) applyTheme(currentTheme);
        host.style.display = 'block';
        document.documentElement.classList.add('revived-sidebar-idle-active');

        const hostname = window.location.hostname;
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

    function render() {
        const ah = getAutoHide();
        const hostname = window.location.hostname;
        const isSidepanelBlocked = sidepanelBlocklist.some(d => hostname.includes(d));

        // --- XOR gate: in-page sidebar or browser sidepanel owns the screen ---
        // NOTE: Future "sidepanelOnly" setting bypass goes here.
        if ((activeSiteId && activeSiteOwner === 'inpage') || isSidePanelOpen || isSidepanelBlocked) {
            ah.cleanup();
            hideCompletely();
            return;
        }

        // --- Idle state: no active site, idle sidebar is the authority ---
        if (autoHideEnabled) {
            if (ah.triggered) {
                // Overlays on top of content, no page offset
                showAsOverlay();
            } else {
                hideCompletely();
                ah.setup();
            }
            return;
        }

        // Auto-hide OFF: constant sidebar with page offset
        ah.cleanup();
        showWithOffset();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
