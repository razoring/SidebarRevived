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

    let fakeScroll = { el: null, thumb: null, track: null, isDragging: false, dragStartY: 0, dragStartScroll: 0, updatePending: false };

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
        if (fakeScroll.thumb) {
            fakeScroll.thumb.style.background = theme?.accentColor || '#b2d7ef';
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

    // --- Fake Scrollbar ---

    function createFakeScrollbar() {
        if (document.getElementById('revived-fake-scrollbar')) return;

        const el = document.createElement('div');
        el.id = 'revived-fake-scrollbar';

        const track = document.createElement('div');
        track.id = 'revived-fake-scrollbar-track';

        const thumb = document.createElement('div');
        thumb.id = 'revived-fake-scrollbar-thumb';

        track.appendChild(thumb);
        el.appendChild(track);
        document.documentElement.appendChild(el);

        fakeScroll.el = el;
        fakeScroll.track = track;
        fakeScroll.thumb = thumb;

        if (currentTheme?.accentColor) {
            thumb.style.background = currentTheme.accentColor;
        }

        thumb.addEventListener('mousedown', onFakeThumbDragStart);
        track.addEventListener('click', onFakeTrackClick);

        window.addEventListener('scroll', requestFakeUpdate, { passive: true });
        window.addEventListener('resize', requestFakeUpdate, { passive: true });

        requestFakeUpdate();
    }

    function removeFakeScrollbar() {
        window.removeEventListener('scroll', requestFakeUpdate);
        window.removeEventListener('resize', requestFakeUpdate);
        if (fakeScroll.el && fakeScroll.el.parentNode) {
            fakeScroll.el.parentNode.removeChild(fakeScroll.el);
        }
        fakeScroll.el = null;
        fakeScroll.track = null;
        fakeScroll.thumb = null;
        fakeScroll.updatePending = false;
    }

    function requestFakeUpdate() {
        if (!fakeScroll.updatePending) {
            fakeScroll.updatePending = true;
            requestAnimationFrame(applyFakeUpdate);
        }
    }

    function applyFakeUpdate() {
        fakeScroll.updatePending = false;
        if (!fakeScroll.thumb || !fakeScroll.track) return;

        const scrollY = window.scrollY;
        const scrollHeight = document.documentElement.scrollHeight;
        const viewportHeight = window.innerHeight;
        const maxScroll = Math.max(0, scrollHeight - viewportHeight);

        if (maxScroll <= 0) {
            fakeScroll.thumb.style.display = 'none';
            return;
        }

        fakeScroll.thumb.style.display = 'block';

        const trackHeight = fakeScroll.track.clientHeight;
        const thumbHeight = Math.max(20, (viewportHeight / scrollHeight) * trackHeight);
        const thumbTop = (scrollY / maxScroll) * (trackHeight - thumbHeight);

        fakeScroll.thumb.style.height = thumbHeight + 'px';
        fakeScroll.thumb.style.top = thumbTop + 'px';
    }

    function onFakeThumbDragStart(e) {
        e.preventDefault();
        fakeScroll.isDragging = true;
        fakeScroll.dragStartY = e.clientY;
        fakeScroll.dragStartScroll = window.scrollY;
        fakeScroll.el.classList.add('dragging');
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onFakeThumbDrag);
        document.addEventListener('mouseup', onFakeThumbDragEnd);
    }

    function onFakeThumbDrag(e) {
        if (!fakeScroll.isDragging) return;
        const delta = e.clientY - fakeScroll.dragStartY;
        const scrollHeight = document.documentElement.scrollHeight;
        const viewportHeight = window.innerHeight;
        const maxScroll = Math.max(0, scrollHeight - viewportHeight);
        const trackHeight = fakeScroll.track.clientHeight;
        const thumbHeight = parseFloat(fakeScroll.thumb.style.height) || 20;
        const pixelsPerScroll = (trackHeight - thumbHeight) / maxScroll;

        window.scrollTo(0, fakeScroll.dragStartScroll + delta / pixelsPerScroll);
    }

    function onFakeThumbDragEnd() {
        fakeScroll.isDragging = false;
        fakeScroll.el.classList.remove('dragging');
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onFakeThumbDrag);
        document.removeEventListener('mouseup', onFakeThumbDragEnd);
    }

    function onFakeTrackClick(e) {
        if (e.target === fakeScroll.thumb || !fakeScroll.thumb) return;
        const rect = fakeScroll.track.getBoundingClientRect();
        const clickY = e.clientY - rect.top;
        const scrollHeight = document.documentElement.scrollHeight;
        const viewportHeight = window.innerHeight;
        const maxScroll = Math.max(0, scrollHeight - viewportHeight);
        const trackHeight = fakeScroll.track.clientHeight;
        const thumbHeight = parseFloat(fakeScroll.thumb.style.height) || 20;
        const ratio = Math.max(0, Math.min(1, (clickY - thumbHeight / 2) / (trackHeight - thumbHeight)));

        window.scrollTo({ top: ratio * maxScroll, behavior: 'smooth' });
    }

    // --- Host Styles ---

    function injectHostStyles() {
        if (document.getElementById('revived-idle-style-tag')) return;
        const style = document.createElement('style');
        style.id = 'revived-idle-style-tag';
        style.textContent = `
            #revived-idle-sidebar-host {
                position: fixed !important;
                right: 0 !important;
                left: auto !important;
                top: 0 !important;
                width: 48px !important;
                height: 100vh !important;
                z-index: 2147483647 !important;
                transform: none !important;
                pointer-events: none !important;
            }

            html.revived-sidebar-idle-active:not(.revived-sidebar-fixed-mode)::-webkit-scrollbar,
            html.revived-sidebar-idle-active:not(.revived-sidebar-fixed-mode)::-webkit-scrollbar-track,
            html.revived-sidebar-idle-active:not(.revived-sidebar-fixed-mode)::-webkit-scrollbar-thumb {
                display: none !important;
            }

            html.revived-sidebar-idle-active:not(.revived-sidebar-fixed-mode) {
                scrollbar-width: none !important;
                -ms-overflow-style: none !important;
            }

            html.revived-sidebar-idle-active.revived-sidebar-fixed-mode {
                scrollbar-width: none !important;
                -ms-overflow-style: none !important;
            }

            html.revived-sidebar-idle-active.revived-sidebar-fixed-mode::-webkit-scrollbar,
            html.revived-sidebar-idle-active.revived-sidebar-fixed-mode::-webkit-scrollbar-track,
            html.revived-sidebar-idle-active.revived-sidebar-fixed-mode::-webkit-scrollbar-thumb {
                display: none !important;
            }


            #revived-fake-scrollbar {
                position: fixed !important;
                top: 0 !important;
                right: 48px !important;
                width: 10px !important;
                height: 100vh !important;
                z-index: 2147483646 !important;
                pointer-events: auto !important;
                display: none;
            }

            #revived-fake-scrollbar-track {
                position: absolute !important;
                top: 0 !important;
                right: 0 !important;
                width: 10px !important;
                height: 100% !important;
                cursor: pointer !important;
            }

            #revived-fake-scrollbar-thumb {
                position: absolute !important;
                right: 1px !important;
                width: 8px !important;
                border-radius: 4px !important;
                background: #b2d7ef !important;
                cursor: grab !important;
                opacity: 0.5 !important;
                transition: opacity 0.15s !important;
                top: 0;
            }

            #revived-fake-scrollbar:hover #revived-fake-scrollbar-thumb,
            #revived-fake-scrollbar.dragging #revived-fake-scrollbar-thumb {
                opacity: 1 !important;
            }
        `;
        document.documentElement.appendChild(style);
    }

    function isSafeModeSite() {
        const hostname = window.location.hostname;
        const safeModeSites = ['google.com', 'bing.com', 'duckduckgo.com', 'baidu.com', 'yandex.ru'];
        return safeModeSites.some(s => hostname.includes(s));
    }

    function isFixedPositionSite() {
        const hostname = window.location.hostname;
        const fixedPositionSites = [
            'youtube.com', 'youtu.be',
            'twitch.tv', 'player.twitch.tv',
            'vimeo.com',
            'dailymotion.com',
            'bilibili.com', 'bilibili.tv'
        ];
        return fixedPositionSites.some(s => hostname.includes(s));
    }

    function adjustFixedElements() {
        if (!document.documentElement.classList.contains('revived-sidebar-fixed-mode')) return;
        const fixedElements = document.querySelectorAll('*');
        fixedElements.forEach(el => {
            if (el.getAttribute('id') && el.getAttribute('id').includes('revived')) return;
            const style = window.getComputedStyle(el);
            if (style.position === 'fixed' && !el.dataset.sidebarAdjusted) {
                el.dataset.sidebarAdjusted = 'true';
                const currentRight = parseFloat(style.right);
                if (!isNaN(currentRight) && currentRight >= 0) {
                    el.style.right = (currentRight + 48) + 'px';
                }
            }
        });
    }

    let fixedAdjustmentInterval = null;

    function startFixedAdjustmentInterval() {
        if (fixedAdjustmentInterval) return;
        fixedAdjustmentInterval = setInterval(adjustFixedElements, 500);
    }

    function cleanupFixedAdjustments() {
        if (fixedAdjustmentInterval) {
            clearInterval(fixedAdjustmentInterval);
            fixedAdjustmentInterval = null;
        }
        document.querySelectorAll('[data-sidebar-adjusted="true"]').forEach(el => {
            el.removeAttribute('data-sidebar-adjusted');
            el.style.right = '';
        });
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
            document.documentElement.classList.remove('revived-sidebar-fixed-mode');
            cleanupFixedAdjustments();
            removeFakeScrollbar();
            return;
        }

        if (autoHideEnabled) {
            if (!ah.triggered) {
                if (host) host.style.display = 'none';
                ah.setup();
            }
            document.documentElement.classList.remove('revived-sidebar-idle-active');
            document.documentElement.classList.remove('revived-sidebar-safe-mode');
            document.documentElement.classList.remove('revived-sidebar-fixed-mode');
            cleanupFixedAdjustments();
            removeFakeScrollbar();
            populateIcons();
            return;
        }

        if (host) host.style.removeProperty('display');
        document.documentElement.classList.add('revived-sidebar-idle-active');
        createFakeScrollbar();
        if (fakeScroll.el) fakeScroll.el.style.display = 'block';

        // Apply safe mode (limit shift to html only) for search engines
        // Apply fixed position mode for video sites that have fixed headers/overlays
        const isFixedSite = isFixedPositionSite();
        const isBlocked = scrollBlocklist.some(d => hostname.includes(d));

        if (isSafeModeSite()) {
            document.documentElement.classList.add('revived-sidebar-safe-mode');
            document.documentElement.classList.remove('revived-sidebar-fixed-mode');
            cleanupFixedAdjustments();
        } else if (isFixedSite || isBlocked) {
            document.documentElement.classList.remove('revived-sidebar-safe-mode');
            document.documentElement.classList.add('revived-sidebar-fixed-mode');
            cleanupFixedAdjustments();
            adjustFixedElements();
            startFixedAdjustmentInterval();
        } else {
            document.documentElement.classList.remove('revived-sidebar-safe-mode');
            document.documentElement.classList.remove('revived-sidebar-fixed-mode');
            cleanupFixedAdjustments();
        }

        await populateIcons();
    }

    init();
})();
