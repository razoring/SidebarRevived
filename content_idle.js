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

        if (document.documentElement) document.documentElement.appendChild(host);

        // Host style adjustment for idle bar
        styleElement = document.createElement('style');
        if (document.documentElement) document.documentElement.appendChild(styleElement);

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
                if (changes.sites) sites = changes.sites.newValue;
                if (changes.tempSites) tempSites = changes.tempSites.newValue;
                if (changes.isSidePanelOpen) isSidePanelOpen = changes.isSidePanelOpen.newValue;
                if (changes.activeSiteId !== undefined) activeSiteId = changes.activeSiteId.newValue;
                if (changes.activeSiteOwner !== undefined) activeSiteOwner = changes.activeSiteOwner.newValue;
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
        const currentState = JSON.stringify({ sites, tempSites, activeSiteId });
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

    function isSafeModeSite() {
        const hostname = window.location.hostname;
        const safeModeSites = ['google.com', 'bing.com', 'duckduckgo.com', 'baidu.com', 'yandex.ru'];
        return safeModeSites.some(s => hostname.includes(s));
    }

    async function render() {
        const ah = getAutoHide();
        const hostname = window.location.hostname;
        const isSidepanelBlocked = sidepanelBlocklist.some(d => hostname.includes(d));

        if (currentTheme) applyTheme(currentTheme);

        // Check safe mode FIRST - always allow safe mode sites regardless of sidepanelBlocklist
        const isSafe = isSafeModeSite();
        const isScrollBlocked = scrollBlocklist.some(d => hostname.includes(d));

        // Hide sidebar if sidepanel is open, blocked (and not safe mode), or active site
        const shouldHide = isSidePanelOpen || ((isSidepanelBlocked || (activeSiteId && activeSiteOwner === 'inpage')) && !isSafe);
        
        if (shouldHide) {
            ah.cleanup();
            if (host) host.style.display = 'none';
            if (document.documentElement) document.documentElement.classList.remove('revived-sidebar-idle-active');
            return;
        }

        if (autoHideEnabled) {
            if (!ah.triggered) {
                if (host) host.style.display = 'none';
                ah.setup();
            }
            if (document.documentElement) document.documentElement.classList.remove('revived-sidebar-idle-active');
            if (styleElement) styleElement.textContent = '';
            populateIcons();
            return;
        }

        if (host) host.style.removeProperty('display');
        if (document.documentElement) document.documentElement.classList.add('revived-sidebar-idle-active');

        // scrollBlocklist first - user configured sites use transform: none approach
        if (isScrollBlocked) {
            if (styleElement) {
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
            }
        }
        // Safe mode for search engines - offset using html padding instead of margin
        else if (isSafe) {
            if (styleElement) {
                styleElement.textContent = `
                    html.revived-sidebar-idle-active {
                        padding-right: 48px !important;
                        box-sizing: border-box !important;
                    }
                    html.revived-sidebar-idle-active body {
                        width: 100% !important;
                        max-width: 100% !important;
                    }
                    #revived-idle-sidebar-host {
                        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                    }
                `;
            }
        }
        // Default - aggressive offset (YouTube, Coolors, all other sites)
        else {
            if (styleElement) {
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
        }

        await populateIcons();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();