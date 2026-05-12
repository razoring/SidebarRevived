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
    let _loaded = false;
    const { applyThemeStyles, AutoHideManager } = __SidebarRevived;

    function init() {
        host = document.createElement('div');
        host.id = 'revived-idle-sidebar-host';
        host.style.cssText = `
            position: fixed;
            top: 0;
            right: 0;
            width: 48px;
            height: 100vh;
            z-index: 2147483647;
            pointer-events: none;
            display: none;
        `;
        applyThemeStyles(host, __SidebarRevived.getThemeDefaults());
        shadow = host.attachShadow({ mode: 'closed' });

        // Load styles into shadow DOM
        const sharedLink = document.createElement('link');
        sharedLink.rel = 'stylesheet';
        sharedLink.href = chrome.runtime.getURL('assets/sidebar_shared.css');
        shadow.appendChild(sharedLink);

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

        // Initial State Fetch
        chrome.storage.local.get(['sites', 'tempSites', 'isSidePanelOpen', 'customTheme', 'activeSiteId', 'activeSiteOwner', 'scrollBlocklist', 'sidepanelBlocklist', 'autoHideEnabled'], (result) => {
            if (_loaded) return;
            _loaded = true;
            sites = result.sites || [];
            tempSites = result.tempSites || [];
            isSidePanelOpen = !!result.isSidePanelOpen;
            activeSiteId = result.activeSiteId;
            activeSiteOwner = result.activeSiteOwner || null;
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
                if (changes.isSidePanelOpen !== undefined) isSidePanelOpen = changes.isSidePanelOpen.newValue;
                if (changes.activeSiteId !== undefined) activeSiteId = changes.activeSiteId.newValue;
                if (changes.activeSiteOwner !== undefined) activeSiteOwner = changes.activeSiteOwner.newValue;
                if (changes.sites) sites = changes.sites.newValue;
                if (changes.tempSites) tempSites = changes.tempSites.newValue;
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
                    host.style.removeProperty('display');
                },
                onHideBar: () => { host.style.display = 'none'; },
                getPanelWidth: () => 48,
                getAccentColor: () => currentTheme?.accentColor || '#b2d7ef',
                leaveThresholdOffset: 5
            });
        }
        return autoHide;
    }

    let lastRenderState = null;
    async function populateIcons() {
        const currentState = JSON.stringify({ sites, tempSites, activeSiteId, activeSiteOwner });
        if (currentState === lastRenderState) return;
        lastRenderState = currentState;

        await __SidebarRevived.renderIconBar(sidebarContainer, {
            sites: sites,
            tempSites: tempSites || [],
            activeSiteId: activeSiteId,
            getSites: () => sites,
            getTempSites: () => tempSites,
            onSiteClick: (siteId) => {
                try { chrome.storage.local.set({ activeSiteId: siteId, activeSiteOwner: 'sidepanel' }); } catch (e) { }
                try { chrome.runtime.sendMessage({ action: 'open_side_panel' }); } catch (e) { }
            },
            onAddSite: () => {
                try { chrome.runtime.sendMessage({ action: 'add_current_tab' }); } catch (e) { }
            },
            onSettingsClick: () => {
                try { chrome.storage.local.set({ isSettingsOpen: true }); } catch (e) { }
                try { chrome.runtime.sendMessage({ action: 'open_side_panel' }); } catch (e) { }
            }
        });
    }

    function injectHostStyles() {
        if (document.getElementById('revived-idle-style-tag')) return;
        const style = document.createElement('style');
        style.id = 'revived-idle-style-tag';
        style.textContent = `
            html.revived-sidebar-idle-active {
                margin-right: 48px !important;
                box-sizing: border-box !important;
                overflow-x: hidden !important;
            }

            html.revived-sidebar-idle-active body {
                min-height: 100vh !important;
                position: relative !important;
            }

            html.revived-sidebar-idle-active:not(.revived-sidebar-safe-mode) body {
                width: calc(100vw - 48px) !important;
                max-width: calc(100vw - 48px) !important;
            }
        `;
        document.documentElement.appendChild(style);
    }

    function isSafeModeSite() {
        const hostname = window.location.hostname;
        const safeModeSites = ['google.com', 'bing.com', 'duckduckgo.com', 'baidu.com', 'yandex.ru'];
        return safeModeSites.some(s => hostname.includes(s));
    }

    // Immediate injection for layout stability
    injectHostStyles();

    async function render() {
        const ah = getAutoHide();
        const hostname = window.location.hostname;
        const isSidepanelBlocked = sidepanelBlocklist.some(d => hostname.includes(d));

        if (currentTheme) applyTheme(currentTheme);

        if (isSidePanelOpen || isSidepanelBlocked || (activeSiteId && activeSiteOwner === 'inpage')) {
            ah.cleanup();
            if (host) host.style.display = 'none';
            document.documentElement.classList.remove('revived-sidebar-idle-active');
            document.documentElement.classList.remove('revived-sidebar-safe-mode');
            return;
        }

        if (autoHideEnabled) {
            if (!ah.triggered) {
                if (host) host.style.display = 'none';
                ah.setup();
            }
            document.documentElement.classList.remove('revived-sidebar-idle-active');
            document.documentElement.classList.remove('revived-sidebar-safe-mode');
            populateIcons();
            return;
        }

        if (host) host.style.removeProperty('display');
        document.documentElement.classList.add('revived-sidebar-idle-active');

        // Apply safe mode (limit shift to html only) for search engines
        if (isSafeModeSite()) {
            document.documentElement.classList.add('revived-sidebar-safe-mode');
        } else {
            document.documentElement.classList.remove('revived-sidebar-safe-mode');
        }

        await populateIcons();
    }

    init();
})();
