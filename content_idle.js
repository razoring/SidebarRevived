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
    const { applyThemeStyles, AutoHideManager } = __SidebarRevived;

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
            window.addEventListener('resize', this.handleResize);
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
            
            // Helper to pierce Shadow DOMs (essential for YouTube, Reddit, etc.)
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
                // Ignore our own elements and hidden elements
                if (el.id && el.id.includes('revived')) continue;
                // Elements inside shadow DOM might not have offsetParent natively exposed,
                // but checking getBoundingClientRect is safe enough.
                if (this.adjustedElements.has(el)) continue;

                try {
                    const style = window.getComputedStyle(el);
                    if (style.position === 'fixed') {
                        const rect = el.getBoundingClientRect();
                        
                        // If the element visibly overlaps the right 48px of the screen
                        if (rect.right > windowWidth - 48 && rect.left < windowWidth && rect.width > 0 && rect.height > 0) {
                            // Account for scrollbars (which reduce rect.width by ~15-20px) and check if it anchors to the left
                            const isFullWidth = rect.left <= 10 && rect.width >= windowWidth - 30;
                            this.adjust(el, style, isFullWidth);
                        }
                    }
                } catch(e) {
                    // Ignore errors from disconnected or secure shadow roots
                }
            }
        },

        adjust(el, style, isFullWidth) {
            const originalStyle = {
                transition: el.style.transition,
                transform: el.style.transform,
                maxWidth: el.style.maxWidth
            };

            this.adjustedElements.set(el, originalStyle);

            el.style.transition = (el.style.transition ? el.style.transition + ', ' : '') + 'transform 0.3s, max-width 0.3s';
            
            if (isFullWidth) {
                // Constrain full-width elements so they don't slide under
                el.style.setProperty('max-width', 'calc(100vw - 48px)', 'important');
            } else {
                // Simply shift overlapping right-side elements to the left by 48px
                const currentTransform = style.transform !== 'none' ? style.transform : '';
                el.style.setProperty('transform', currentTransform + (currentTransform ? ' ' : '') + 'translateX(-48px)', 'important');
            }
        },

        restoreAll() {
            this.adjustedElements.forEach((originalStyle, el) => {
                el.style.transition = originalStyle.transition;
                if (originalStyle.transform !== undefined) el.style.transform = originalStyle.transform;
                if (originalStyle.maxWidth !== undefined) el.style.maxWidth = originalStyle.maxWidth;
            });
            this.adjustedElements.clear();
        }
    };


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

        // Host style adjustment for idle bar
        styleElement = document.createElement('style');
        document.documentElement.appendChild(styleElement);

        // Initial State Fetch
        chrome.storage.local.get(['sites', 'tempSites', 'isSidePanelOpen', 'customTheme', 'activeSiteId', 'activeSiteOwner', 'scrollBlocklist', 'sidepanelBlocklist', 'autoHideEnabled'], (result) => {
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
                chrome.storage.local.set({ activeSiteId: siteId, activeSiteOwner: 'sidepanel' });
                chrome.runtime.sendMessage({ action: 'open_side_panel' });
            },
            onAddSite: () => {
                chrome.runtime.sendMessage({ action: 'add_current_tab' });
            },
            onSettingsClick: () => {
                chrome.storage.local.set({ isSettingsOpen: true });
                chrome.runtime.sendMessage({ action: 'open_side_panel' });
            }
        });
    }

    async function render() {
        const ah = getAutoHide();
        const hostname = window.location.hostname;
        const isSidepanelBlocked = sidepanelBlocklist.some(d => hostname.includes(d));

        if (currentTheme) applyTheme(currentTheme);

        if (isSidePanelOpen || isSidepanelBlocked || (activeSiteId && activeSiteOwner === 'inpage')) {
            ah.cleanup();
            FixedElementManager.stop();
            host.style.display = 'none';
            document.documentElement.classList.remove('revived-sidebar-idle-active');
            return;
        }

        if (autoHideEnabled) {
            if (!ah.triggered) {
                host.style.display = 'none';
                ah.setup();
            }
            FixedElementManager.stop();
            document.documentElement.classList.remove('revived-sidebar-idle-active');
            styleElement.textContent = '';
            populateIcons();
            return;
        }

        host.style.removeProperty('display');
        document.documentElement.classList.add('revived-sidebar-idle-active');
        FixedElementManager.start();

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

        await populateIcons();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
