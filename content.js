// content.js
(() => {
    if (window !== window.top) return;

    let host = null;
    let shadow = null;
    let container = null;
    let iconBar = null;
    let contentArea = null;
    let iframe = null;
    let headerTitle = null;
    let resizer = null;
    let isResizing = false;
    let autoHideEnabled = false;

    let state = {
        sites: [],
        activeSiteId: null,
        activeSiteOwner: null,
        sidebarWidth: 350,
        currentUrls: {},
        sidepanelBlocklist: [],
        isSidePanelOpen: false,
        customTheme: null
    };

    const SR = __SidebarRevived;
    let currentTheme = null;

    function applyTheme() {
        currentTheme = state.customTheme;
        SR.applyThemeStyles(host, currentTheme);
        if (currentTheme?.accentColor && autoHide) {
            autoHide.updateAccentColor(currentTheme.accentColor);
        }
    }

    function isSidepanelBlocked() {
        const hostname = window.location.hostname;
        return (state.sidepanelBlocklist || []).some(d => hostname.includes(d));
    }

    async function loadCSS() {
        const response = await fetch(chrome.runtime.getURL('sidebar.css'));
        const css = await response.text();
        const style = document.createElement('style');
        style.textContent = css;
        shadow.appendChild(style);
    }

    function injectHostStyles() {
        const style = document.createElement('style');
        style.id = 'revived-sidebar-host-styles';
        style.textContent = `
      html.revived-sidebar-active {
        --revived-sidebar-width: 48px;
        margin-right: var(--revived-sidebar-width, 48px) !important;
        width: calc(100% - var(--revived-sidebar-width, 48px)) !important;
        overflow-x: hidden !important;
        overflow-y: auto !important;
      }
      html.revived-sidebar-active body {
        width: 100% !important;
        min-width: 0 !important;
      }
      html.revived-sidebar-active body > * {
        max-width: 100% !important;
        min-width: 0 !important;
      }
    `;
        document.documentElement.appendChild(style);
    }

    function init() {
        injectHostStyles();
        // Create Shadow Host
        host = document.createElement('div');
        host.id = 'revived-edge-sidebar-host';
        SR.applyThemeStyles(host, SR.getThemeDefaults());
        host.style.position = 'fixed';
        host.style.top = '0';
        host.style.right = '0';
        host.style.width = '0';
        host.style.height = '100vh';
        host.style.zIndex = '2147483647';
        host.style.pointerEvents = 'none';

        shadow = host.attachShadow({ mode: 'closed' });

        container = document.createElement('div');
        container.id = 'revived-edge-sidebar-container';

        iconBar = document.createElement('div');
        iconBar.className = 'edge-sidebar-icon-bar';

        contentArea = document.createElement('div');
        contentArea.className = 'edge-sidebar-content-area';

        resizer = document.createElement('div');
        resizer.className = 'edge-sidebar-resizer';

        resizer.onmousedown = (e) => {
            isResizing = true;
            document.body.style.userSelect = 'none';
            iframe.style.pointerEvents = 'none';
        };

        const header = document.createElement('div');
        header.className = 'edge-sidebar-header';

        headerTitle = document.createElement('div');
        headerTitle.className = 'edge-sidebar-header-title';
        headerTitle.innerText = "Sidebar";

        const closeBtn = document.createElement('div');
        closeBtn.className = 'edge-sidebar-header-close';
        closeBtn.innerText = "✕";
        closeBtn.onclick = () => {
            chrome.storage.local.set({ activeSiteId: null, activeSiteOwner: null });
        };

        header.appendChild(headerTitle);
        header.appendChild(closeBtn);

        iframe = document.createElement('iframe');
        iframe.className = 'edge-sidebar-iframe';
        iframe.name = 'revived-sidebar-iframe';
        // Allow everything inside this iframe
        iframe.allow = "camera; microphone; geolocation; clipboard-read; clipboard-write; autoplay; fullscreen";

        contentArea.appendChild(resizer);
        contentArea.appendChild(header);
        contentArea.appendChild(iframe);

        container.appendChild(iconBar);
        container.appendChild(contentArea);

        shadow.appendChild(container);

        document.documentElement.appendChild(host);

        loadCSS();

        // Resize logic
        window.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const newWidth = window.innerWidth - e.clientX - 48;
            if (newWidth > 200 && newWidth < 800) {
                contentArea.style.width = newWidth + 'px';
                updateLayout(newWidth + 48);
            }
        });

        window.addEventListener('mouseup', (e) => {
            if (isResizing) {
                isResizing = false;
                document.body.style.userSelect = '';
                iframe.style.pointerEvents = '';
                const newWidth = window.innerWidth - e.clientX - 48;
                if (newWidth > 200 && newWidth < 800) {
                    chrome.storage.local.set({ sidebarWidth: newWidth });
                }
            }
        });

        // Listen for state changes
        chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
            if (msg.type === 'STATE_CHANGED') {
                const changes = msg.changes;
                if (changes.sites) state.sites = changes.sites.newValue;
                if (changes.activeSiteId) state.activeSiteId = changes.activeSiteId.newValue;
                if (changes.sidebarWidth) state.sidebarWidth = changes.sidebarWidth.newValue;
                if (changes.currentUrls) state.currentUrls = changes.currentUrls.newValue;
                if (changes.sidepanelBlocklist) state.sidepanelBlocklist = changes.sidepanelBlocklist.newValue;
                if (changes.activeSiteOwner) state.activeSiteOwner = changes.activeSiteOwner.newValue;
                if (changes.customTheme) {
                    state.customTheme = changes.customTheme.newValue;
                    applyTheme();
                }
                render();
            } else if (msg.type === 'PING') {
                sendResponse({ type: 'PONG' });
            }
        });

        chrome.storage.local.get(['sites', 'activeSiteId', 'activeSiteOwner', 'sidebarWidth', 'currentUrls', 'sidepanelBlocklist', 'autoHideEnabled', 'customTheme', 'isSidePanelOpen'], (result) => {
            if (result.sites) {
                state = { ...state, ...result };
                if (result.autoHideEnabled !== undefined) autoHideEnabled = result.autoHideEnabled;
                applyTheme();
                render();
            }
        });

        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local') {
                if (changes.autoHideEnabled !== undefined) {
                    autoHideEnabled = changes.autoHideEnabled.newValue;
                    if (autoHide) {
                        autoHide.cleanup();
                        autoHideArmed = false;
                    }
                    render();
                }
                if (changes.isSidePanelOpen !== undefined) {
                    state.isSidePanelOpen = changes.isSidePanelOpen.newValue;
                    render();
                }
                if (changes.activeSiteOwner !== undefined) {
                    state.activeSiteOwner = changes.activeSiteOwner.newValue;
                    render();
                }
                if (changes.activeSiteId !== undefined) {
                    state.activeSiteId = changes.activeSiteId.newValue;
                    render();
                }
            }
        });

        setInterval(() => {
            render();
        }, 1000);
    }

    function updateLayout(width) {
        document.documentElement.style.setProperty('--revived-sidebar-width', width + 'px');
        // Force many elements to respect this if they are fixed
        // YouTube specific and general fixed headers
        const fixedElements = document.querySelectorAll('*');
        // We only want to touch elements that are likely fixed headers or bars
        // This is expensive if done every frame, but we do it conditionally or on interval
    }

    let autoHide = null;
    let autoHideArmed = false;

    function getAutoHide() {
        if (!autoHide) {
            autoHide = new SR.AutoHideManager({
                onShowBar: () => {
                    render();
                },
                onHideBar: () => {
                    render();
                },
                getPanelWidth: () => 48 + (state.activeSiteId && state.activeSiteOwner === 'inpage' ? state.sidebarWidth : 0),
                getAccentColor: () => '#b2d7ef',
                leaveThresholdOffset: 10
            });
        }
        return autoHide;
    }

    let lastRenderState = null;
    function populateIcons() {
        const currentState = JSON.stringify({
            sites: state.sites,
            tempSites: state.tempSites,
            activeSiteId: state.activeSiteId,
            owner: state.activeSiteOwner
        });
        if (currentState === lastRenderState) return;
        lastRenderState = currentState;

        SR.renderIconBar(iconBar, {
            sites: state.sites,
            tempSites: state.tempSites || [],
            activeSiteId: state.activeSiteId,
            getSites: () => state.sites,
            getTempSites: () => state.tempSites || [],
            onSiteClick: (siteId) => {
                const newActiveId = (state.activeSiteId === siteId) ? null : siteId;
                chrome.storage.local.set({ activeSiteId: newActiveId, activeSiteOwner: newActiveId ? 'inpage' : null });
            },
            onAddSite: () => {
                chrome.runtime.sendMessage({ action: 'add_current_tab' });
            },
            onSettingsClick: () => {
                chrome.storage.local.set({ isSettingsOpen: true });
                chrome.runtime.sendMessage({ action: 'open_side_panel' });
            },
            getIconOpacity: (site) => (site.id === state.activeSiteId) ? '1' : '0.8'
        });
    }

    function render() {
        if (!container) return;

        const ah = getAutoHide();
        const hostname = window.location.hostname;
        const isBlocked = state.sidepanelBlocklist.some(d => hostname.includes(d)) && !state.activeSiteId;

        if (state.isSidePanelOpen || isBlocked) {
            ah.cleanup();
            autoHideArmed = false;
            hideSidebarCompletely();
            return;
        }

        // If any site is active, we stay open (ignore auto-hide trigger for visibility)
        if (state.activeSiteId) {
            ah.cleanup();
            autoHideArmed = false;
            renderInternal();
            return;
        }

        // Handle Idle Auto-Hide
        if (autoHideEnabled) {
            if (ah.triggered) {
                renderInternal();
            } else {
                hideSidebarCompletely();
                if (!autoHideArmed) {
                    ah.setup();
                    autoHideArmed = true;
                }
            }
            return;
        }

        renderInternal();
    }

    function hideSidebarCompletely() {
        if (!container) return;
        container.style.display = 'none';
        document.documentElement.classList.remove('revived-sidebar-active');
        document.documentElement.style.removeProperty('--revived-sidebar-width');
    }

    function renderInternal() {
        if (currentTheme) SR.applyThemeStyles(host, currentTheme);
        populateIcons();
        container.style.display = '';
        document.documentElement.classList.add('revived-sidebar-active');

        const isFullSidebar = state.activeSiteId && state.activeSiteOwner === 'inpage';

        if (isFullSidebar) {
            contentArea.classList.add('active');
            contentArea.style.width = state.sidebarWidth + 'px';
            const activeSite = state.sites.find(s => s.id === state.activeSiteId);
            if (activeSite) {
                headerTitle.innerText = activeSite.title;
                iframe.name = 'revived-sidebar-iframe-' + activeSite.id;
                const targetUrl = (state.currentUrls && state.currentUrls[activeSite.id]) || activeSite.url;
                if (iframe.src !== targetUrl) {
                    iframe.src = targetUrl;
                }
            }
        } else {
            contentArea.classList.remove('active');
        }

        const totalWidth = 48 + (isFullSidebar ? state.sidebarWidth : 0);
        document.documentElement.style.setProperty('--revived-sidebar-width', totalWidth + 'px');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
