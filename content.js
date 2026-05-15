// content.js - Unified Content Script (Active & Idle)

// ============================================================
// BLOCK 1: Active Sidebar (formerly content.js)
// ============================================================
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
    const hostname = window.location.hostname;

    // Cleanup previous instance listeners
    if (globalThis.__SidebarRevived_Cleanup_Active) {
        globalThis.__SidebarRevived_Cleanup_Active();
    }
    const abortController = new AbortController();
    const { signal } = abortController;
    globalThis.__SidebarRevived_Cleanup_Active = () => abortController.abort();

    var SR = globalThis.__SidebarRevived;
    if (!SR) return;

    var state = {
        sites: [],
        tempSites: [],
        activeSiteId: null,
        activeSiteOwner: null,
        sidebarWidth: 350,
        currentUrls: {},
        sidepanelBlocklist: [],
        autoHideBlocklist: [],
        isSidePanelOpen: false,
        isSettingsOpen: false,
        customTheme: SR.getThemeDefaults(),
        initialized: false
    };
    let currentTheme = null;

    function applyTheme() {
        currentTheme = state.customTheme || SR.getThemeDefaults();
        SR.applyThemeStyles(host, currentTheme);
        if (currentTheme?.accentColor && autoHide) {
            autoHide.updateAccentColor(currentTheme.accentColor);
        }
    }

    function storageGet(keys) {
        return new Promise((resolve) => SR.safeStorage.get(keys, resolve));
    }

    function isOrphaned() {
        return SR.isOrphaned();
    }

    function selfDestruct() {
        document.querySelectorAll('#revived-edge-sidebar-host').forEach(el => el.remove());
        document.querySelectorAll('#revived-sidebar-host-styles').forEach(el => el.remove());
        document.documentElement.classList.remove('revived-sidebar-active');
    }

    function isSafeModeSite() {
        const safeModeSites = ['google.com', 'bing.com', 'duckduckgo.com', 'baidu.com', 'yandex.ru'];
        return safeModeSites.some(s => hostname.includes(s));
    }

    function loadCSS() {
        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
            const sharedLink = document.createElement('link');
            sharedLink.rel = 'stylesheet';
            sharedLink.href = chrome.runtime.getURL('sidepanel.css');
            shadow.appendChild(sharedLink);
        }
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
            html.revived-sidebar-active:not(.revived-sidebar-safe-mode) body {
                width: 100% !important;
                min-width: 0 !important;
            }
            html.revived-sidebar-active:not(.revived-sidebar-safe-mode) body > * {
                max-width: 100% !important;
                min-width: 0 !important;
            }
    `;
        if (window.location.hostname.includes('bing.com')) {
            style.textContent += `
                html.revived-sidebar-active #mmComponent_images_1,
                html.revived-sidebar-active .dg_u,
                html.revived-sidebar-active #b_content,
                html.revived-sidebar-active .b_viewport {
                    padding-right: var(--revived-sidebar-width, 48px) !important;
                    box-sizing: border-box !important;
                }
                html.revived-sidebar-active #id_sc,
                html.revived-sidebar-active #fltIdtLnk,
                html.revived-sidebar-active #id_l,
                html.revived-sidebar-active #id_rh_w,
                html.revived-sidebar-active #sb_feedback,
                html.revived-sidebar-active .acf-button-standard__btn {
                    margin-right: var(--revived-sidebar-width, 48px) !important;
                }
            `;
        }
        document.documentElement.appendChild(style);
    }

    async function init() {
        // Cleanup any existing instances (from previous script injections)
        document.querySelectorAll('#revived-edge-sidebar-host').forEach(el => el.remove());
        document.querySelectorAll('#revived-sidebar-host-styles').forEach(el => el.remove());
        document.documentElement.classList.remove('revived-sidebar-active');
        document.documentElement.setAttribute('data-revived-host', window.location.hostname);

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
            if (isOrphaned()) { return; }
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
            if (isOrphaned()) { /* handle via bridge if possible */ }
            state.activeSiteId = null;
            state.activeSiteOwner = null;
            SR.safeStorage.set({ activeSiteId: null, activeSiteOwner: null });
            render();
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

        window.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const newWidth = window.innerWidth - e.clientX - 48;
            if (newWidth > 200 && newWidth < 800) {
                contentArea.style.width = newWidth + 'px';
            }
        }, { signal });

        window.addEventListener('mouseup', async (e) => {
            if (isResizing) {
                isResizing = false;
                document.body.style.userSelect = '';
                iframe.style.pointerEvents = '';
                const newWidth = window.innerWidth - e.clientX - 48;
                if (newWidth > 200 && newWidth < 800) {
                    const totalWidth = newWidth + 48;
                    const prefs = await storageGet(['siteModePrefs']);
                    const sitePrefs = prefs.siteModePrefs || {};
                    if (sitePrefs[hostname] === 'overlay') {
                        document.documentElement.classList.remove('revived-sidebar-active');
                        document.documentElement.style.removeProperty('--revived-sidebar-width');
                    } else if (isSafeModeSite()) {
                        try {
                            document.documentElement.classList.add('revived-sidebar-safe-mode');
                            document.documentElement.classList.add('revived-sidebar-active');
                            document.documentElement.style.setProperty('--revived-sidebar-width', totalWidth + 'px');
                        } catch (e) { }
                    } else {
                        const candidateCss = `
                            html.revived-sidebar-active {
                              --revived-sidebar-width: ${totalWidth}px;
                              margin-right: var(--revived-sidebar-width, 48px) !important;
                              width: calc(100% - var(--revived-sidebar-width, 48px)) !important;
                              overflow-x: hidden !important;
                              overflow-y: auto !important;
                            }
                            html.revived-sidebar-active body {
                              width: 100% !important;
                              min-width: 0 !important;
                            }
                        `;
                        let reacted = false;
                        try {
                            reacted = await (SR && SR.runLayoutTrial ? SR.runLayoutTrial(candidateCss, 700) : Promise.resolve(false));
                        } catch (err) { reacted = false; }

                        if (!reacted) {
                            document.documentElement.classList.add('revived-sidebar-active');
                            document.documentElement.style.setProperty('--revived-sidebar-width', totalWidth + 'px');
                        } else {
                            document.documentElement.classList.remove('revived-sidebar-active');
                            document.documentElement.style.removeProperty('--revived-sidebar-width');
                        }
                    }
                    SR.safeStorage.set({ sidebarWidth: newWidth });
                }
            }
        }, { signal });

        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
            try {
                chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
                    if (isOrphaned()) { return; }
                    if (msg.type === 'PING') {
                        sendResponse({ type: 'PONG' });
                    }
                });
            } catch (e) {}
        }

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                if (isOrphaned()) { /* Wait for new script to take over */ return; }
                SR.safeStorage.get(['sites', 'tempSites', 'activeSiteId', 'activeSiteOwner', 'sidebarWidth', 'currentUrls', 'sidepanelBlocklist', 'autoHideBlocklist', 'autoHideEnabled', 'customTheme', 'isSidePanelOpen', 'isSettingsOpen'], (result) => {
                    state = { ...state, ...result };
                    if (result.autoHideEnabled !== undefined) autoHideEnabled = result.autoHideEnabled;
                    applyTheme();
                    render();
                });
            }
        }, { signal });

        host.addEventListener('mouseenter', () => {
            if (isOrphaned()) { /* Bridge will handle interactions */ return; }
            SR.safeStorage.get(['sites', 'tempSites', 'activeSiteId', 'activeSiteOwner', 'sidebarWidth', 'currentUrls', 'sidepanelBlocklist', 'autoHideBlocklist', 'autoHideEnabled', 'customTheme', 'isSidePanelOpen', 'isSettingsOpen'], (result) => {
                state = { ...state, ...result };
                if (result.autoHideEnabled !== undefined) autoHideEnabled = result.autoHideEnabled;
                applyTheme();
                render();
            });
        }, { signal });

        // Coordinated Handover + Storage
        const handoverPromise = new Promise(resolve => {
            const hHandler = (e) => {
                if (!state.initialized && e.detail && e.detail.block1) {
                    state = { ...state, ...e.detail.block1, initialized: true };
                    window.removeEventListener('REVIVED_HANDOVER_RES', hHandler);
                    resolve(true);
                }
            };
            window.addEventListener('REVIVED_HANDOVER_RES', hHandler, { signal });
            setTimeout(() => resolve(false), 80);
            window.dispatchEvent(new CustomEvent('REVIVED_HANDOVER_REQ'));
        });

        const storagePromise = new Promise(resolve => {
            SR.safeStorage.get(['sites', 'tempSites', 'activeSiteId', 'activeSiteOwner', 'sidebarWidth', 'currentUrls', 'sidepanelBlocklist', 'autoHideBlocklist', 'autoHideEnabled', 'customTheme', 'isSidePanelOpen', 'isSettingsOpen'], (result) => {
                state = { ...state, ...result, initialized: true };
                if (result.autoHideEnabled !== undefined) autoHideEnabled = result.autoHideEnabled;
                globalThis.__SidebarRevived_CurrentState = globalThis.__SidebarRevived_CurrentState || {};
                globalThis.__SidebarRevived_CurrentState.block1 = { ...state, initialized: true };
                resolve(true);
            });
        });

        await handoverPromise;
        applyTheme();
        render();
        await storagePromise;
        applyTheme();
        render();
    }

        SR.safeStorage.onChanged((changes) => {
            if (isOrphaned()) { return; }
            let needsRender = false;
            if (changes.sites !== undefined) {
                state.sites = changes.sites.newValue;
                lastRenderState = null;
                needsRender = true;
            }
            if (changes.tempSites !== undefined) {
                state.tempSites = changes.tempSites.newValue;
                lastRenderState = null;
                needsRender = true;
            }
            if (changes.autoHideEnabled !== undefined) {
                autoHideEnabled = changes.autoHideEnabled.newValue;
                if (autoHide) {
                    autoHide.cleanup();
                    autoHideArmed = false;
                }
                needsRender = true;
            }
            if (changes.isSidePanelOpen !== undefined) {
                state.isSidePanelOpen = changes.isSidePanelOpen.newValue;
                lastRenderState = null;
                needsRender = true;
            }
            if (changes.activeSiteOwner !== undefined) {
                state.activeSiteOwner = changes.activeSiteOwner.newValue;
                lastRenderState = null;
                needsRender = true;
            }
            if (changes.activeSiteId !== undefined) {
                state.activeSiteId = changes.activeSiteId.newValue;
                lastRenderState = null;
                needsRender = true;
            }
            if (changes.sidepanelBlocklist !== undefined) {
                state.sidepanelBlocklist = changes.sidepanelBlocklist.newValue;
                needsRender = true;
            }
            if (changes.autoHideBlocklist !== undefined) {
                state.autoHideBlocklist = changes.autoHideBlocklist.newValue;
                needsRender = true;
            }
            if (changes.customTheme !== undefined) {
                state.customTheme = changes.customTheme.newValue;
                applyTheme();
                needsRender = true;
            }
            if (changes.isSettingsOpen !== undefined) {
                state.isSettingsOpen = changes.isSettingsOpen.newValue;
                lastRenderState = null;
                needsRender = true;
            }
            if (needsRender) {
                render();
                globalThis.__SidebarRevived_CurrentState = globalThis.__SidebarRevived_CurrentState || {};
                globalThis.__SidebarRevived_CurrentState.block1 = { ...state, initialized: true };
            }
        });

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
                getAccentColor: () => currentTheme?.accentColor || '#b2d7ef',
                leaveThresholdOffset: 10
            });
        }
        return autoHide;
    }

    let lastRenderState = null;
    async function populateIcons() {
        const currentState = JSON.stringify({
            sites: state.sites,
            tempSites: state.tempSites,
            activeSiteId: state.activeSiteId,
            activeSiteOwner: state.activeSiteOwner
        });
        if (currentState === lastRenderState) return;
        lastRenderState = currentState;

        await SR.renderIconBar(iconBar, {
            sites: state.sites,
            tempSites: state.tempSites || [],
            activeSiteId: state.activeSiteId,
            getSites: () => state.sites,
            getTempSites: () => state.tempSites || [],
            onSiteClick: (siteId) => {
                if (isOrphaned()) { /* bridged */ }
                const newActiveId = (state.activeSiteId === siteId) ? null : siteId;
                const newOwner = newActiveId ? 'inpage' : null;
                state.activeSiteId = newActiveId;
                state.activeSiteOwner = newOwner;
                state.isSettingsOpen = false;
                SR.safeStorage.set({ activeSiteId: newActiveId, activeSiteOwner: newOwner, isSettingsOpen: false });
                render();
            },
            onAddSite: () => {
                if (isOrphaned()) { /* SR.safeSendMessage will bridge */ }
                SR.safeSendMessage({ action: 'add_current_tab' });
            },
            onSettingsClick: () => {
                if (isOrphaned()) { /* bridged */ }
                state.isSettingsOpen = true;
                SR.safeStorage.set({ isSettingsOpen: true });
                SR.safeSendMessage({ action: 'open_side_panel' });
                render();
            },
            getIconOpacity: (site) => (site.id === state.activeSiteId) ? '1' : '0.8'
        });
    }

    function render() {
        if (!container) return;
        
        // Apply theme even if not fully initialized to prevent "black icons"
        applyTheme();
        
        if (!state.initialized && !state.sites.length) return;

        const ah = getAutoHide();
        const isBlocked = (state.sidepanelBlocklist || []).some(d => hostname.includes(d)) && !state.activeSiteId;

        if (state.activeSiteId && state.activeSiteOwner === 'inpage') {
            ah.cleanup();
            autoHideArmed = false;
            renderInternal();
            return;
        }

        if (state.isSidePanelOpen || isBlocked || !state.activeSiteId) {
            ah.cleanup();
            autoHideArmed = false;
            hideSidebarCompletely();
            return;
        }

        const isAutoHideForced = (state.autoHideBlocklist || []).some(d => hostname.includes(d));

        if (autoHideEnabled || isAutoHideForced) {
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
        document.documentElement.classList.remove('revived-sidebar-safe-mode');
        document.documentElement.style.removeProperty('--revived-sidebar-width');
    }

    async function renderInternal() {
        if (currentTheme) SR.applyThemeStyles(host, currentTheme);
        
        // Show container immediately to avoid perceived lag
        container.style.display = '';

        const isFullSidebar = state.activeSiteId && state.activeSiteOwner === 'inpage';

        if (isFullSidebar) {
            contentArea.classList.add('active');
            contentArea.style.width = state.sidebarWidth + 'px';
            const activeSite = (state.sites && state.sites.find(s => s.id === state.activeSiteId)) || (state.tempSites && state.tempSites.find(s => s.id === state.activeSiteId));
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

        // Now populate icons (this might be async if SVGs are still fetching)
        await populateIcons();

        const isAutoHideForced = state.autoHideBlocklist && state.autoHideBlocklist.some(d => hostname.includes(d));

        if (autoHideEnabled || isAutoHideForced) {
            document.documentElement.classList.remove('revived-sidebar-active');
            document.documentElement.style.removeProperty('--revived-sidebar-width');
        } else {
            const totalWidth = 48 + (isFullSidebar ? state.sidebarWidth : 0);
            if (isSafeModeSite()) {
                try {
                    document.documentElement.classList.add('revived-sidebar-safe-mode');
                    document.documentElement.classList.add('revived-sidebar-active');
                    document.documentElement.style.setProperty('--revived-sidebar-width', totalWidth + 'px');
                    if (window.location.hostname.includes('bing.com')) {
                        try { document.body.style.setProperty('padding-right', totalWidth + 'px', 'important'); } catch (e) { }
                    }
                } catch (e) { }
            } else {
                const runTrialAndApply = async () => {
                try {
                    const prefs = await storageGet(['siteModePrefs']);
                    const sitePrefs = prefs.siteModePrefs || {};
                    if (sitePrefs[hostname] === 'overlay') {
                        document.documentElement.classList.remove('revived-sidebar-active');
                        document.documentElement.style.removeProperty('--revived-sidebar-width');
                        return;
                    }

                    const candidateCss = `
                        html.revived-sidebar-active { --revived-sidebar-width: ${totalWidth}px; margin-right: var(--revived-sidebar-width, 48px) !important; width: calc(100% - var(--revived-sidebar-width, 48px)) !important; overflow-x: hidden !important; overflow-y: auto !important; }
                        html.revived-sidebar-active body { width: 100% !important; min-width: 0 !important; }
                    `;
                    const reacted = await (SR && SR.runLayoutTrial ? SR.runLayoutTrial(candidateCss, 700) : Promise.resolve(false));
                    if (reacted) {
                        document.documentElement.classList.remove('revived-sidebar-active');
                        document.documentElement.style.removeProperty('--revived-sidebar-width');
                    } else {
                        document.documentElement.classList.add('revived-sidebar-active');
                        document.documentElement.style.setProperty('--revived-sidebar-width', totalWidth + 'px');
                    }
                } catch (e) {
                    document.documentElement.classList.add('revived-sidebar-active');
                    document.documentElement.style.setProperty('--revived-sidebar-width', totalWidth + 'px');
                }
            };

            if (document.readyState !== 'complete') {
                window.addEventListener('load', runTrialAndApply, { once: true });
                setTimeout(runTrialAndApply, 2000);
            } else {
                await runTrialAndApply();
            }
        }
    }
}

    init();
})();

// ============================================================
// BLOCK 2: Idle Sidebar (formerly content_idle.js)
// ============================================================
(() => {
    if (window !== window.top) return;
    const hostname = window.location.hostname;

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
    let autoHideBlocklist = [];

    // Cleanup previous instance listeners
    if (globalThis.__SidebarRevived_Cleanup_Idle) {
        globalThis.__SidebarRevived_Cleanup_Idle();
    }
    const abortController = new AbortController();
    const { signal } = abortController;
    globalThis.__SidebarRevived_Cleanup_Idle = () => abortController.abort();

    let autoHideEnabled = false;
    var SR = globalThis.__SidebarRevived;
    if (!SR) return;
    let currentTheme = SR.getThemeDefaults();
    let initialized = false;
    const { applyThemeStyles, AutoHideManager } = SR;

    const FixedElementManager = {
        active: false,
        adjustedElements: new Map(),
        observer: null,
        timeout: null,

        start() {
            if (this.active) return;
            this.active = true;
            this.scan();
            this.observer = new MutationObserver(() => {
                if (this.timeout) clearTimeout(this.timeout);
                this.timeout = setTimeout(() => this.scan(), 500);
            });
            this.observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
            window.addEventListener('resize', this.handleResize, { signal });
        },

        stop() {
            this.active = false;
            if (this.observer) this.observer.disconnect();
            if (this.timeout) clearTimeout(this.timeout);
            window.removeEventListener('resize', this.handleResize);
            this.restoreAll();
        },

        handleResize: () => {
            if (FixedElementManager.timeout) clearTimeout(FixedElementManager.timeout);
            FixedElementManager.timeout = setTimeout(() => FixedElementManager.scan(), 500);
        },

        scan() {
            if (!this.active) return;
            
            const windowWidth = window.innerWidth;
            const candidates = [];
            
            const collect = (root) => {
                const nodes = root.querySelectorAll('*');
                for (let i = 0; i < nodes.length; i++) {
                    const node = nodes[i];
                    candidates.push(node);
                    if (node.shadowRoot) collect(node.shadowRoot);
                }
            };
            collect(document);
            
            for (let i = 0; i < candidates.length; i++) {
                const el = candidates[i];
                if (el.id && typeof el.id === 'string' && el.id.includes('revived')) continue;
                if (el.id && typeof el.id !== 'string' && String(el.id).includes('revived')) continue;
                if (this.adjustedElements.has(el)) continue;

                try {
                    const style = window.getComputedStyle(el);
                    if (style.position === 'fixed') {
                        const rect = el.getBoundingClientRect();
                        if (rect.right > windowWidth - 48 && rect.left < windowWidth && rect.width > 0 && rect.height > 0) {
                            const isFullWidth = rect.left <= 10 && rect.width >= windowWidth - 30;
                            this.adjust(el, style, isFullWidth);
                        }
                    }
                } catch(e) {}
            }
        },

        adjust(el, style, isFullWidth) {
            const originalStyle = {
                transition: el.style.transition,
                translate: el.style.translate,
                maxWidth: el.style.maxWidth
            };

            this.adjustedElements.set(el, originalStyle);

            el.style.transition = (el.style.transition ? el.style.transition + ', ' : '') + 'translate 0.3s, max-width 0.3s';
            
            if (isFullWidth) {
                el.style.setProperty('max-width', 'calc(100vw - 48px)', 'important');
            } else {
                el.style.setProperty('translate', '-48px 0', 'important');
            }
        },

        restoreAll() {
            this.adjustedElements.forEach((originalStyle, el) => {
                el.style.transition = originalStyle.transition;
                if (originalStyle.translate !== undefined) el.style.translate = originalStyle.translate;
                if (originalStyle.maxWidth !== undefined) el.style.maxWidth = originalStyle.maxWidth;
            });
            this.adjustedElements.clear();
        }
    };


    function isOrphaned() {
        return SR.isOrphaned();
    }

    function selfDestruct() {
        document.querySelectorAll('#revived-idle-sidebar-host').forEach(el => el.remove());
        document.querySelectorAll('#revived-idle-sidebar-styles').forEach(el => el.remove());
        document.documentElement.classList.remove('revived-sidebar-idle-active');
    }

    function init() {
        // Cleanup existing
        document.querySelectorAll('#revived-idle-sidebar-host').forEach(el => el.remove());
        document.querySelectorAll('#revived-idle-sidebar-styles').forEach(el => el.remove());
        document.documentElement.classList.remove('revived-sidebar-idle-active');
        document.documentElement.setAttribute('data-revived-host', window.location.hostname);

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

        if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
            const sharedLink = document.createElement('link');
            sharedLink.rel = 'stylesheet';
            sharedLink.href = chrome.runtime.getURL('sidepanel.css');
            shadow.appendChild(sharedLink);
        }

        sidebarContainer = document.createElement('div');
        sidebarContainer.id = 'revived-idle-sidebar';
        sidebarContainer.ondragover = (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        };
        sidebarContainer.ondragenter = (e) => { e.preventDefault(); };
        shadow.appendChild(sidebarContainer);

        document.documentElement.appendChild(host);

        styleElement = document.createElement('style');
        styleElement.id = 'revived-idle-sidebar-styles';
        document.documentElement.appendChild(styleElement);

        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                if (isOrphaned()) { return; }
                SR.safeStorage.get(['sites', 'tempSites', 'isSidePanelOpen', 'customTheme', 'activeSiteId', 'activeSiteOwner', 'scrollBlocklist', 'sidepanelBlocklist', 'autoHideBlocklist', 'autoHideEnabled'], (result) => {
                    sites = result.sites || [];
                    tempSites = result.tempSites || [];
                    isSidePanelOpen = !!result.isSidePanelOpen;
                    activeSiteId = result.activeSiteId;
                    activeSiteOwner = result.activeSiteOwner || null;
                    if (result.autoHideEnabled !== undefined) autoHideEnabled = result.autoHideEnabled;
                    initialized = true;
                    render();
                });
            }
        }, { signal });

        host.addEventListener('mouseenter', () => {
            if (isOrphaned()) { return; }
            SR.safeStorage.get(['sites', 'tempSites', 'isSidePanelOpen', 'customTheme', 'activeSiteId', 'activeSiteOwner', 'scrollBlocklist', 'sidepanelBlocklist', 'autoHideBlocklist', 'autoHideEnabled'], (result) => {
                sites = result.sites || [];
                tempSites = result.tempSites || [];
                isSidePanelOpen = !!result.isSidePanelOpen;
                activeSiteId = result.activeSiteId;
                activeSiteOwner = result.activeSiteOwner || null;
                if (result.autoHideEnabled !== undefined) autoHideEnabled = result.autoHideEnabled;
                initialized = true;
                render();
            });
        }, { signal });

        const onHandover = (e) => {
            if (!initialized && e.detail && e.detail.block2) {
                const s = e.detail.block2;
                sites = s.sites; tempSites = s.tempSites;
                isSidePanelOpen = s.isSidePanelOpen; activeSiteId = s.activeSiteId;
                activeSiteOwner = s.activeSiteOwner; autoHideEnabled = s.autoHideEnabled;
                currentTheme = s.currentTheme;
                initialized = true;
                applyTheme(currentTheme);
                render();
            }
        };
        window.addEventListener('REVIVED_HANDOVER_RES', onHandover, { signal });
        window.dispatchEvent(new CustomEvent('REVIVED_HANDOVER_REQ'));

        SR.safeStorage.get(['sites', 'tempSites', 'isSidePanelOpen', 'customTheme', 'activeSiteId', 'activeSiteOwner', 'scrollBlocklist', 'sidepanelBlocklist', 'autoHideBlocklist', 'autoHideEnabled'], (result) => {
            sites = result.sites || [];
            tempSites = result.tempSites || [];
            isSidePanelOpen = !!result.isSidePanelOpen;
            activeSiteId = result.activeSiteId;
            activeSiteOwner = result.activeSiteOwner || null;
            scrollBlocklist = result.scrollBlocklist || [];
            sidepanelBlocklist = result.sidepanelBlocklist || [];
            autoHideBlocklist = result.autoHideBlocklist || [];
            if (result.autoHideEnabled !== undefined) autoHideEnabled = result.autoHideEnabled;
            if (result.customTheme) {
                currentTheme = result.customTheme;
                applyTheme(currentTheme);
            }
            initialized = true;
            render();
            // Store for next handover
            globalThis.__SidebarRevived_CurrentState = globalThis.__SidebarRevived_CurrentState || {};
            globalThis.__SidebarRevived_CurrentState.block2 = { sites, tempSites, isSidePanelOpen, activeSiteId, activeSiteOwner, autoHideEnabled, currentTheme };
        });

        SR.safeStorage.onChanged((changes) => {
            if (isOrphaned()) { return; }
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
            if (changes.autoHideBlocklist) {
                autoHideBlocklist = changes.autoHideBlocklist.newValue;
                if (autoHide) autoHide.cleanup();
                idleAutoHideArmed = false;
            }
            if (changes.autoHideEnabled !== undefined) {
                autoHideEnabled = changes.autoHideEnabled.newValue;
                if (autoHide) autoHide.cleanup();
                idleAutoHideArmed = false;
            }
            render();
            globalThis.__SidebarRevived_CurrentState = globalThis.__SidebarRevived_CurrentState || {};
            globalThis.__SidebarRevived_CurrentState.block2 = { sites, tempSites, isSidePanelOpen, activeSiteId, activeSiteOwner, autoHideEnabled, currentTheme };
        });
    }

    function applyTheme(theme) {
        currentTheme = theme || SR.getThemeDefaults();
        applyThemeStyles(host, currentTheme);
        if (currentTheme?.accentColor && autoHide) {
            autoHide.updateAccentColor(currentTheme.accentColor);
        }
    }

    let autoHide = null;
    let idleAutoHideArmed = false;

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
                if (isOrphaned()) { /* bridged */ }
                activeSiteId = siteId;
                activeSiteOwner = 'sidepanel';
                SR.safeStorage.set({ activeSiteId: siteId, activeSiteOwner: 'sidepanel' });
                SR.safeSendMessage({ action: 'open_side_panel' });
                render();
            },
            onAddSite: () => {
                if (isOrphaned()) { /* bridged */ }
                SR.safeSendMessage({ action: 'add_current_tab' });
            },
            onSettingsClick: () => {
                if (isOrphaned()) { /* bridged */ }
                SR.safeStorage.set({ isSettingsOpen: true });
                SR.safeSendMessage({ action: 'open_side_panel' });
            }
        });
    }

    async function render() {
        if (!initialized) return;
        const ah = getAutoHide();
        const isSidepanelBlocked = (sidepanelBlocklist || []).some(d => hostname.includes(d));

        if (currentTheme) applyTheme(currentTheme);

        if (isSidePanelOpen || isSidepanelBlocked || activeSiteId) {
            ah.cleanup();
            idleAutoHideArmed = false;
            FixedElementManager.stop();
            host.style.display = 'none';
            document.documentElement.classList.remove('revived-sidebar-idle-active');
            
            // Force active host visibility if desynced
            const activeHost = document.getElementById('revived-edge-sidebar-host');
            if (activeHost && (activeSiteId && activeSiteOwner === 'inpage')) {
                // Active host is present and should be handling the UI
            }
            return;
        }

        const isAutoHideForced = (autoHideBlocklist || []).some(d => hostname.includes(d));

        if (autoHideEnabled || isAutoHideForced) {
            if (ah.triggered) {
                host.style.removeProperty('display');
                populateIcons();
            } else {
                host.style.display = 'none';
                if (!idleAutoHideArmed) {
                    ah.setup();
                    idleAutoHideArmed = true;
                }
            }
            FixedElementManager.stop();
            document.documentElement.classList.remove('revived-sidebar-idle-active');
            styleElement.textContent = '';
            return;
        }

        host.style.removeProperty('display');
        document.documentElement.classList.add('revived-sidebar-idle-active');
        FixedElementManager.start();

        const isBlocked = (scrollBlocklist || []).some(d => hostname.includes(d));

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
                    position: relative !important;
                    box-sizing: border-box !important;
                }
                #revived-idle-sidebar-host {
                    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }
            `;
        }

        if (hostname.includes('mail.google.com')) {
            styleElement.textContent += `
                html.revived-sidebar-idle-active .gb_Pd.gb_Sd.gb_4d {
                    padding-right: 48px !important;
                }
                html.revived-sidebar-idle-active .brC-aT5-aOt-Jw {
                    right: 48px !important;
                }
                html.revived-sidebar-idle-active .bkK {
                    margin-right: 48px !important;
                }
            `;
        }

        if (hostname.includes('bing.com')) {
            styleElement.textContent += `
                html.revived-sidebar-idle-active #mmComponent_images_1,
                html.revived-sidebar-idle-active .dg_u,
                html.revived-sidebar-idle-active #b_content,
                html.revived-sidebar-idle-active .b_viewport {
                    padding-right: 48px !important;
                    box-sizing: border-box !important;
                }
                html.revived-sidebar-idle-active #id_sc,
                html.revived-sidebar-idle-active #fltIdtLnk,
                html.revived-sidebar-idle-active #id_l,
                html.revived-sidebar-idle-active #id_rh_w,
                html.revived-sidebar-idle-active #sb_feedback,
                html.revived-sidebar-idle-active .acf-button-standard__btn {
                    margin-right: 48px !important;
                }
            `;
        }

        await populateIcons();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();