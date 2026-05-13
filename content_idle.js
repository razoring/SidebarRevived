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
    let layoutDetectionCompleted = false;
    let layoutDetectionPending = false;
    let isWidthSensitive = false;

    // Early observer to detect size-sensitive resource loads (e.g., Bing Images cw=)
    function initWidthObserver() {
        try {
            const hostname = window.location.hostname;
            const checkUrl = (u) => u && (String(u).includes('cw=') || String(u).includes('/images/search') || String(u).includes('bing.com/images'));

            // Check existing resource entries
            try {
                const existing = performance.getEntriesByType ? performance.getEntriesByType('resource') : [];
                for (const e of existing) {
                    if (checkUrl(e.name)) {
                        isWidthSensitive = true;
                        break;
                    }
                }
            } catch (e) { }

            if (isWidthSensitive) {
                try {
                    chrome.storage.local.get(['siteModePrefs'], (res) => {
                        const prefs = res.siteModePrefs || {};
                        if (!prefs[hostname]) {
                            prefs[hostname] = 'overlay';
                            chrome.storage.local.set({ siteModePrefs: prefs });
                        }
                    });
                } catch (e) { }
                return;
            }

            // Observe new resource entries for a short window
            let po = null;
            try {
                po = new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) {
                        try {
                            if (checkUrl(entry.name)) {
                                isWidthSensitive = true;
                                try {
                                    chrome.storage.local.get(['siteModePrefs'], (res) => {
                                        const prefs = res.siteModePrefs || {};
                                        if (!prefs[hostname]) {
                                            prefs[hostname] = 'overlay';
                                            chrome.storage.local.set({ siteModePrefs: prefs });
                                        }
                                    });
                                } catch (e) { }
                                if (po) try { po.disconnect(); } catch (e) { }
                                return;
                            }
                        } catch (e) { }
                    }
                });
                po.observe({ type: 'resource', buffered: true });
            } catch (e) { po = null; }

            // Stop observing after 3s
            setTimeout(() => { try { if (po) po.disconnect(); } catch (e) { } }, 3000);
        } catch (e) { }
    }

    // Start the observer as early as possible
    try { initWidthObserver(); } catch (e) { }

    function injectHostStyles() {
        try {
            if (document.getElementById('revived-idle-style-tag')) return;
            const style = document.createElement('style');
            style.id = 'revived-idle-style-tag';
            style.textContent = `
                html.revived-sidebar-idle-active {
                    margin-right: 48px !important;
                    width: calc(100% - 48px) !important;
                    box-sizing: border-box !important;
                    overflow-x: hidden !important;
                }

                html.revived-sidebar-idle-active:not(.revived-sidebar-safe-mode) body {
                    max-width: calc(100vw - 48px) !important;
                    width: auto !important;
                    position: relative !important;
                }

                html.revived-sidebar-idle-active:not(.revived-sidebar-safe-mode) * {
                    max-width: inherit !important;
                }

                #revived-idle-sidebar-host { transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
            `;
            document.documentElement.appendChild(style);
        } catch (e) { }
    }

    // Inject base host styles early (matches the Safe-mode commit behavior)
    try { injectHostStyles(); } catch (e) { }

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

    // Helper to promisify chrome.storage.local.get
    function storageGet(keys) {
        return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
    }

    // Run a short, non-destructive trial by applying `candidateCss` and observing
    // outgoing network requests (fetch / XHR) and navigations. Returns true
    // if the page reacted (e.g., requests containing `cw=` or navigation), else false.
    function runLayoutTrial(candidateCss, timeout = 700) {
        return new Promise((resolve) => {
            const recorded = new Set();

            // PerformanceObserver to catch resource loads (images, etc.)
            let perfObserver = null;
            try {
                perfObserver = new PerformanceObserver((list) => {
                    for (const entry of list.getEntries()) {
                        try {
                            const name = entry.name || '';
                            if (name && (name.includes('cw=') || name.includes('/images/search') || name.includes('bing.com/images'))) {
                                recorded.add(name);
                            }
                        } catch (e) { }
                    }
                });
                perfObserver.observe({ type: 'resource', buffered: false });
            } catch (e) { perfObserver = null; }

            // MutationObserver for <img> src/srcset changes and new nodes
            let mutObserver = null;
            try {
                mutObserver = new MutationObserver((mutations) => {
                    for (const m of mutations) {
                        try {
                            if (m.type === 'attributes' && (m.attributeName === 'src' || m.attributeName === 'srcset')) {
                                const url = (m.target && m.target.getAttribute) ? m.target.getAttribute(m.attributeName) : null;
                                if (url && (url.includes('cw=') || url.includes('/images/search') || url.includes('bing.com/images'))) recorded.add(url);
                            } else if (m.type === 'childList') {
                                for (const node of m.addedNodes) {
                                    if (node && node.tagName === 'IMG') {
                                        const s = node.getAttribute && node.getAttribute('src');
                                        if (s && (s.includes('cw=') || s.includes('/images/search') || s.includes('bing.com/images'))) recorded.add(s);
                                    }
                                }
                            }
                        } catch (e) { }
                    }
                });
                mutObserver.observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'srcset'] });
            } catch (e) { mutObserver = null; }

            // Monkeypatch image attribute setters to catch direct assignments
            let origImgSetAttr = null;
            let origSrcDescriptor = null;
            try {
                origImgSetAttr = HTMLImageElement.prototype.setAttribute;
                HTMLImageElement.prototype.setAttribute = function(name, value) {
                    try {
                        if ((name === 'src' || name === 'srcset') && value && (String(value).includes('cw=') || String(value).includes('/images/search') || String(value).includes('bing.com/images'))) {
                            recorded.add(String(value));
                        }
                    } catch (e) { }
                    return origImgSetAttr.apply(this, arguments);
                };
            } catch (e) { origImgSetAttr = null; }

            try {
                origSrcDescriptor = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
                if (origSrcDescriptor && origSrcDescriptor.set) {
                    Object.defineProperty(HTMLImageElement.prototype, 'src', {
                        set: function(val) {
                            try { if (val && String(val).includes('cw=')) recorded.add(String(val)); } catch (e) { }
                            return origSrcDescriptor.set.call(this, val);
                        },
                        get: function() { return origSrcDescriptor.get.call(this); },
                        configurable: true,
                        enumerable: true
                    });
                }
            } catch (e) { origSrcDescriptor = null; }

            // Wrap fetch and XHR as additional signal
            const origFetch = window.fetch;
            let origXhrOpen = null;
            let origXhrSend = null;
            let xhrProto = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
            try {
                if (origFetch) {
                    window.fetch = function(resource, ...args) {
                        try {
                            const url = resource && (resource.url || resource);
                            if (url && (String(url).includes('cw=') || String(url).includes('/images/search') || String(url).includes('bing.com/images'))) recorded.add(String(url));
                        } catch (e) { }
                        return origFetch.apply(this, arguments);
                    };
                }
            } catch (e) { }

            try {
                if (xhrProto) {
                    origXhrOpen = xhrProto.open;
                    origXhrSend = xhrProto.send;
                    xhrProto.open = function(method, url) {
                        try { this.__revived_url = url; } catch (e) { }
                        return origXhrOpen.apply(this, arguments);
                    };
                    xhrProto.send = function(body) {
                        try { if (this.__revived_url && (String(this.__revived_url).includes('cw=') || String(this.__revived_url).includes('/images/search') || String(this.__revived_url).includes('bing.com/images'))) recorded.add(this.__revived_url); } catch (e) { }
                        return origXhrSend.apply(this, arguments);
                    };
                }
            } catch (e) { }

            let navigated = false;
            const onBeforeUnload = () => { navigated = true; };
            const onPageHide = () => { navigated = true; };
            const onPopState = () => { navigated = true; };
            const onHashChange = () => { navigated = true; };
            window.addEventListener('beforeunload', onBeforeUnload, { once: true });
            window.addEventListener('pagehide', onPageHide, { once: true });
            window.addEventListener('popstate', onPopState);
            window.addEventListener('hashchange', onHashChange);

            // Apply candidate CSS transiently
            const trialStyle = document.createElement('style');
            trialStyle.id = 'revived-detector-trial-style';
            trialStyle.textContent = candidateCss || '';
            try { document.documentElement.appendChild(trialStyle); } catch (e) { }

            const finish = () => {
                try { if (origFetch) window.fetch = origFetch; } catch (e) { }
                try {
                    if (xhrProto && origXhrOpen) { xhrProto.open = origXhrOpen; }
                    if (xhrProto && origXhrSend) { xhrProto.send = origXhrSend; }
                } catch (e) { }
                try { window.removeEventListener('beforeunload', onBeforeUnload); } catch (e) { }
                try { window.removeEventListener('pagehide', onPageHide); } catch (e) { }
                try { window.removeEventListener('popstate', onPopState); } catch (e) { }
                try { window.removeEventListener('hashchange', onHashChange); } catch (e) { }
                try { if (trialStyle && trialStyle.parentNode) trialStyle.parentNode.removeChild(trialStyle); } catch (e) { }
                try { if (perfObserver) perfObserver.disconnect(); } catch (e) { }
                try { if (mutObserver) mutObserver.disconnect(); } catch (e) { }
                try { if (origImgSetAttr) HTMLImageElement.prototype.setAttribute = origImgSetAttr; } catch (e) { }
                try {
                    if (origSrcDescriptor) Object.defineProperty(HTMLImageElement.prototype, 'src', origSrcDescriptor);
                } catch (e) { }
            };

            setTimeout(() => {
                finish();
                const matched = Array.from(recorded).some(u => u && (String(u).includes('cw=') || String(u).includes('/images/search') || String(u).includes('bing.com/images')));
                resolve(matched || navigated);
            }, timeout);
        });
    }

    // Decide which handler to use for the current page and apply it.
    // Handlers: 'preserve' (scroll blocklist), 'safe-padding', 'fixed-adjust', 'global-offset', 'overlay'
    async function detectAndApplyLayout(hostname, isSafe, isScrollBlocked) {
        // Respect user scroll blocklist first
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
            return;
        }

        // Check persisted per-site preference
        let storage = await storageGet(['siteModePrefs']);
        const prefs = storage.siteModePrefs || {};
        // If user/site already persisted as 'safe' or 'overlay', honor it
        if (prefs[hostname] === 'safe') {
            try {
                document.documentElement.classList.add('revived-sidebar-idle-active');
                document.documentElement.classList.add('revived-sidebar-safe-mode');
                // ensure CSS variable is present for other scripts
                document.documentElement.style.setProperty('--revived-sidebar-width', '48px');
                // ensure body scrollbar moves left of panel
                if (document.body) document.body.style.setProperty('padding-right', '48px', 'important');
            } catch (e) { }
            return;
        }
        if (prefs[hostname]) {
            applyHandler(prefs[hostname]);
            return;
        }

        // Heuristic: count right-anchored fixed/sticky elements
        let fixedRightCount = 0;
        try {
            const all = Array.from(document.querySelectorAll('*'));
            for (const el of all) {
                try {
                    const cs = window.getComputedStyle(el);
                    if (!(cs.position === 'fixed' || cs.position === 'sticky')) continue;
                    const rect = el.getBoundingClientRect();
                    if (rect.width < 16 || rect.height < 16) continue;
                    if (Math.abs(rect.right - window.innerWidth) <= 8) fixedRightCount++;
                } catch (e) { }
            }
        } catch (e) { }

        // Candidate selection
        let candidate = isSafe ? 'safe-padding' : (fixedRightCount > 0 ? 'fixed-adjust' : 'global-offset');

        // Targeted override: Bing Images sites should use safe-mode that shifts scrollbar
        if (hostname.includes('bing.com')) {
            try {
                // Apply a safe CSS that shifts the viewport and nudges body scrollbar
                styleElement.textContent = `
                    html.revived-sidebar-idle-active {
                        margin-right: 48px !important;
                        width: calc(100% - 48px) !important;
                        box-sizing: border-box !important;
                        overflow-x: hidden !important;
                    }
                    html.revived-sidebar-idle-active:not(.revived-sidebar-safe-mode) body {
                        max-width: calc(100vw - 48px) !important;
                        width: auto !important;
                        position: relative !important;
                    }
                    html.revived-sidebar-idle-active body { padding-right: 48px !important; }
                    #revived-idle-sidebar-host { transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
                `;
                document.documentElement.classList.add('revived-sidebar-idle-active');
                document.documentElement.classList.add('revived-sidebar-safe-mode');
                // persist choice so we don't run trials on subsequent loads
                prefs[hostname] = 'safe';
                try { chrome.storage.local.set({ siteModePrefs: prefs }); } catch (e) { }
            } catch (e) { }
            return;
        }
        // If an early observer detected size-sensitive resource loads, prefer overlay
        if (isWidthSensitive) {
            applyHandler('overlay');
            return;
        }

        // Safe mode: apply the non-invasive margin approach (do not change body width)
        if (candidate === 'safe-padding') {
            applyHandler('safe-padding');
            try { document.documentElement.classList.add('revived-sidebar-safe-mode'); } catch (e) { }
            return;
        }

        // We run a short trial only for the global-offset candidate to detect width-sensitive pages
        if (candidate === 'global-offset') {
            const candidateCss = `
                    html.revived-sidebar-idle-active { margin-right: 0 !important; overflow: hidden !important; }
                    html.revived-sidebar-idle-active body { width: 100vw !important; max-width: calc(100vw - 48px) !important; height: 100vh !important; overflow-y: auto !important; overflow-x: hidden !important; transform: translateX(0) !important; box-sizing: border-box !important; }
                    #revived-idle-sidebar-host { transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
                `;

            let reacted = false;
            try {
                reacted = await runLayoutTrial(candidateCss, 350);
            } catch (e) { reacted = false; }

            if (reacted) {
                // Page reacted badly to layout change; fallback to overlay which does not alter layout
                applyHandler('overlay');
                try { document.documentElement.classList.remove('revived-sidebar-safe-mode'); } catch (e) { }
                return;
            }
            // No reaction; commit candidate
            applyHandler(candidate);
            try { document.documentElement.classList.remove('revived-sidebar-safe-mode'); } catch (e) { }
            return;
        }

        // For fixed-adjust candidate we apply targeted adjustments (safer than global offset)
        if (candidate === 'fixed-adjust') {
            // Simple implementation: nudge right-anchored fixed elements away from edge
            try {
                const css = `
                    html.revived-sidebar-idle-active { box-sizing: border-box !important; }
                    #revived-idle-sidebar-host { transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
                `;
                styleElement.textContent = css;
                const els = Array.from(document.querySelectorAll('*'));
                for (const el of els) {
                    try {
                        const cs = window.getComputedStyle(el);
                        if (!(cs.position === 'fixed' || cs.position === 'sticky')) continue;
                        const rect = el.getBoundingClientRect();
                        if (rect.width < 16 || rect.height < 16) continue;
                        if (Math.abs(rect.right - window.innerWidth) <= 8) {
                            el.style.setProperty('right', '48px', 'important');
                            el.style.setProperty('margin-right', '48px', 'important');
                        }
                    } catch (e) { }
                }
            } catch (e) { }
            return;
        }

        // Fallback: overlay (do nothing to page layout)
        applyHandler('overlay');
    }

    function applyHandler(name) {
        if (!styleElement) return;
        if (name === 'overlay') {
            styleElement.textContent = '';
            return;
        }
        if (name === 'safe-padding') {
            // Keep safe-padding minimal so base injected host styles (above)
            // can perform the width/margin shift without being overridden.
            styleElement.textContent = `
                html.revived-sidebar-idle-active body {
                    min-height: 100vh !important;
                    position: relative !important;
                }
                #revived-idle-sidebar-host { transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
            `;
            return;
        }
        if (name === 'global-offset') {
            styleElement.textContent = `
                html.revived-sidebar-idle-active { margin-right: 0 !important; overflow: hidden !important; }
                html.revived-sidebar-idle-active body { width: 100vw !important; max-width: calc(100vw - 48px) !important; height: 100vh !important; overflow-y: auto !important; overflow-x: hidden !important; transform: translateX(0) !important; box-sizing: border-box !important; }
                #revived-idle-sidebar-host { transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
            `;
            return;
        }
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
            if (document.documentElement) {
                document.documentElement.classList.remove('revived-sidebar-idle-active');
                document.documentElement.classList.remove('revived-sidebar-safe-mode');
            }
            return;
        }

        if (autoHideEnabled) {
            if (!ah.triggered) {
                if (host) host.style.display = 'none';
                ah.setup();
            }
            if (document.documentElement) {
                document.documentElement.classList.remove('revived-sidebar-idle-active');
                document.documentElement.classList.remove('revived-sidebar-safe-mode');
            }
            if (styleElement) styleElement.textContent = '';
            populateIcons();
            return;
        }

        if (host) host.style.removeProperty('display');
        if (document.documentElement) document.documentElement.classList.add('revived-sidebar-idle-active');

        // Detect and apply the best layout handling for this site.
        // Defer layout-affecting changes until after `load` to avoid
        // interfering with pages that compute size parameters on initial load.
        if (!layoutDetectionCompleted) {
            if (document.readyState !== 'complete') {
                if (!layoutDetectionPending) {
                    layoutDetectionPending = true;
                    const runDetect = async () => {
                        try { await detectAndApplyLayout(hostname, isSafe, isScrollBlocked); } catch (e) { }
                        layoutDetectionCompleted = true;
                    };
                    window.addEventListener('load', runDetect, { once: true });
                    // fallback if load doesn't fire
                    setTimeout(runDetect, 2000);
                }
            } else {
                await detectAndApplyLayout(hostname, isSafe, isScrollBlocked);
                layoutDetectionCompleted = true;
            }
        } else {
            // Already completed initial detection — run a lightweight re-check
            // in case the user updated preferences or blocklists.
            try { await detectAndApplyLayout(hostname, isSafe, isScrollBlocked); } catch (e) { }
        }

        await populateIcons();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();