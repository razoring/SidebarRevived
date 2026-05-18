/**
 * Sidebar Revived - Unified Codebase
 * Consolidated background, content (active/idle), shared utilities, and sidepanel script.
 */

// ============================================================
// PART 1: Shared Core Utilities & Constants
// ============================================================
(() => {
    if (globalThis.__SidebarRevived && !globalThis.__SidebarRevived.isOrphaned()) return;

    const S = {};

    S.STORAGE_KEYS = {
        SITES: 'sites',
        TEMP_SITES: 'tempSites',
        ACTIVE_SITE_ID: 'activeSiteId',
        ACTIVE_SITE_OWNER: 'activeSiteOwner',
        IS_SETTINGS_OPEN: 'isSettingsOpen',
        IS_ADD_PAGE_OPEN: 'isAddPageOpen',
        IS_THEME_STORE_OPEN: 'isThemeStoreOpen',
        IS_SIDE_PANEL_OPEN: 'isSidePanelOpen',
        AUTO_HIDE_ENABLED: 'autoHideEnabled',
        SHOW_CATEGORY_ICONS: 'showCategoryIcons',
        SCROLL_BLOCKLIST: 'scrollBlocklist',
        SIDEPANEL_BLOCKLIST: 'sidepanelBlocklist',
        AUTOHIDE_BLOCKLIST: 'autoHideBlocklist',
        CUSTOM_THEME: 'customTheme',
        ENABLE_TAPER: 'enableTaper',
        SIDEBAR_WIDTH: 'sidebarWidth',
        CURRENT_URLS: 'currentUrls',
        SITE_MODE_PREFS: 'siteModePrefs'
    };

    S.isOrphaned = () => {
        try {
            return typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id || !chrome.runtime.getURL;
        } catch (e) {
            return true;
        }
    };

    S.isBlocklistedDomain = function (hostname, list) {
        if (!hostname || !list || !Array.isArray(list)) return false;
        const lowerHost = hostname.toLowerCase().trim();
        return list.some(item => {
            if (!item) return false;
            const lowerItem = item.toLowerCase().trim();
            return lowerHost.includes(lowerItem) || lowerItem.includes(lowerHost);
        });
    };

    S.safeStorage = {
        get: (keys, cb) => {
            if (!S.isOrphaned()) {
                try {
                    chrome.storage.local.get(keys, (res) => {
                        if (chrome && chrome.runtime && chrome.runtime.lastError) return;
                        if (cb) cb(res);
                    });
                    return;
                } catch (e) { }
            }
            if (typeof window !== 'undefined') {
                const requestId = 'req_' + Math.random();
                const handler = (e) => {
                    if (e.data && e.data.type === 'REVIVED_BRIDGE_RES' && e.data.requestId === requestId) {
                        window.removeEventListener('message', handler);
                        if (cb) cb(e.data.result);
                    }
                };
                window.addEventListener('message', handler);
                window.postMessage({ type: 'REVIVED_BRIDGE_REQ', requestId, action: 'get', keys }, '*');
            } else if (cb) {
                cb({});
            }
        },
        set: (obj, cb) => {
            if (!S.isOrphaned()) {
                try {
                    chrome.storage.local.set(obj, cb);
                    return;
                } catch (e) { }
            }
            if (typeof window !== 'undefined') {
                window.postMessage({ type: 'REVIVED_BRIDGE_REQ', action: 'set', obj }, '*');
            }
        },
        onChanged: (cb) => {
            if (!S.isOrphaned()) {
                try {
                    const wrapper = (changes, namespace) => {
                        if (namespace === 'local') cb(changes);
                    };
                    chrome.storage.onChanged.addListener(wrapper);
                    return wrapper;
                } catch (e) { }
            }
            return null;
        },
        removeChanged: (wrapper) => {
            if (wrapper && !S.isOrphaned()) {
                try {
                    chrome.storage.onChanged.removeListener(wrapper);
                } catch (e) { }
            }
        }
    };

    // Cleanup previous shared instance listeners
    if (globalThis.__SidebarRevived_Cleanup_Shared && typeof window !== 'undefined') {
        globalThis.__SidebarRevived_Cleanup_Shared();
    }
    const sharedAbort = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    if (sharedAbort && typeof window !== 'undefined') {
        globalThis.__SidebarRevived_Cleanup_Shared = () => sharedAbort.abort();
    }
    const sharedSignal = sharedAbort ? sharedAbort.signal : null;

    S.safeSendMessage = (msg) => {
        if (!S.isOrphaned()) {
            try {
                chrome.runtime.sendMessage(msg);
                return;
            } catch (e) { }
        }
        if (typeof window !== 'undefined') {
            window.postMessage({ type: 'REVIVED_BRIDGE_REQ', action: 'sendMessage', message: msg }, '*');
        }
    };

    if (typeof window !== 'undefined') {
        window.addEventListener('message', (e) => {
            if (e.data && e.data.type === 'REVIVED_BRIDGE_REQ') {
                try {
                    if (!S.isOrphaned()) {
                        if (e.data.action === 'get') {
                            chrome.storage.local.get(e.data.keys, (result) => {
                                try {
                                    window.postMessage({ type: 'REVIVED_BRIDGE_RES', requestId: e.data.requestId, result }, '*');
                                } catch (err) { }
                            });
                        } else if (e.data.action === 'set') {
                            chrome.storage.local.set(e.data.obj);
                        } else if (e.data.action === 'sendMessage') {
                            chrome.runtime.sendMessage(e.data.message);
                        }
                    }
                } catch (err) { }
            }
        }, { signal: sharedSignal });

        window.addEventListener('REVIVED_HANDOVER_REQ', (e) => {
            if (globalThis.__SidebarRevived_CurrentState) {
                window.dispatchEvent(new CustomEvent('REVIVED_HANDOVER_RES', { 
                    detail: globalThis.__SidebarRevived_CurrentState 
                }));
            }
        }, { signal: sharedSignal });
    }

    const fetchSvg = (path, fallback) => {
        if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.getURL || S.isOrphaned()) {
            return Promise.resolve(fallback || '<svg viewBox="0 0 24 24"></svg>');
        }
        try {
            const url = chrome.runtime.getURL(path);
            return fetch(url)
                .then(r => r.text())
                .catch(err => {
                    console.error(`Failed to load SVG: ${path}`, err);
                    return fallback || '<svg viewBox="0 0 24 24"></svg>';
                });
        } catch (e) {
            return Promise.resolve(fallback || '<svg viewBox="0 0 24 24"></svg>');
        }
    };

    S.svgReady = Promise.all([
        fetchSvg('assets/add_icon.svg', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>'),
        fetchSvg('assets/trash_icon.svg', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>'),
        fetchSvg('assets/settings_icon.svg', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 a2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>'),
        fetchSvg('assets/pin_icon.svg', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"></path></svg>'),
        fetchSvg('assets/temporary_icon.svg', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>'),
        fetchSvg('assets/extension.svg', '<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M346-134H188q-22.73 0-38.36-15.64Q134-165.27 134-188v-146q35-13 54.5-46t19.5-72q0-39-19.5-72T134-570v-148q0-22.72 15.64-38.36Q165.27-772 188-772h150q14-38 45-61t69-23q38 0 69 23t45 61h152q22.72 0 38.36 15.64T772-718v152q38 14 61 45t23 69q0 38-23 69t-61 45v150q0 22.73-15.64 38.36Q740.72-134 718-134H558q-8-41-38-67.5T452-228q-38 0-68 26.5T346-134Zm-158-54h117q15-32 50.5-63t96.5-31q61 0 97.5 31t51.5 63h117v-186h16q35-6 51.5-29t16.5-49q0-26-16.5-49T734-530h-16v-188H530v-16q-6-35-29-51.5T452-802q-26 0-49 16.5T374-734v16H188v114q34 31 54 70t20 82q0 44.3-20 82.65Q222-331 188-302v114Zm264-264Z"/></svg>'),
    ]).then(([add, trash, settings, pin, temp, ext]) => {
        S.ADD_ICON_SVG = add;
        S.TRASH_ICON_SVG = trash;
        S.SETTINGS_ICON_SVG = settings;
        S.PIN_HEADER_SVG = pin;
        S.TEMP_HEADER_SVG = temp;
        S.EXTENSION_ICON_SVG = ext;
    });

    S.detectBrowserState = function () {
        const ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : '';
        return {
            isEdge: ua.includes('Edg'),
            isDark: (typeof window !== 'undefined' && typeof window.matchMedia !== 'undefined')
                ? window.matchMedia('(prefers-color-scheme: dark)').matches
                : true
        };
    };

    S.getThemeDefaults = function () {
        const { isEdge, isDark } = S.detectBrowserState();
        if (isEdge) {
            return {
                fontColor: isDark ? '#ffffff' : '#1a1a1a',
                sidebarBackground: isDark ? '#333333' : '#dddfe2',
                dividerBackground: isDark ? '#555555' : '#c0c0c0',
                accentColor: '#38b3ff',
                midtoneColor: isDark ? '#a4a4a4' : '#6e6e6e',
                panelOpacity: 1,
                panelBlur: 0,
                backgroundImage: '',
                backgroundImageSize: 'fill',
                panelPadding: 0,
                panelRoundness: 0
            };
        }
        return {
            fontColor: isDark ? '#ffffff' : '#1a1a1a',
            sidebarBackground: isDark ? '#3c3c3c' : '#ffffff',
            dividerBackground: isDark ? '#555555' : '#c0c0c0',
            accentColor: '#38b3ff',
            midtoneColor: isDark ? '#a4a4a4' : '#6e6e6e',
            panelOpacity: 1,
            panelBlur: 0,
            backgroundImage: '',
            backgroundImageSize: 'fill',
            panelPadding: 0,
            panelRoundness: 0
        };
    };

    S.hexToRgb = function (hex) {
        const h = hex.replace('#', '');
        return { r: parseInt(h.substring(0, 2), 16), g: parseInt(h.substring(2, 4), 16), b: parseInt(h.substring(4, 6), 16) };
    };

    S.rgbToHsl = function (r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;
        if (max === min) { h = s = 0; }
        else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        return { h, s, l };
    };

    S.hslToRgb = function (h, s, l) {
        let r, g, b;
        if (s === 0) { r = g = b = l; }
        else {
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            const hue2rgb = (p, q, t) => {
                if (t < 0) t += 1; if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
            };
            r = hue2rgb(p, q, h + 1 / 3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1 / 3);
        }
        return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
    };

    S.shiftHue = function (hex, degrees) {
        const rgb = S.hexToRgb(hex);
        const hsl = S.rgbToHsl(rgb.r, rgb.g, rgb.b);
        hsl.h = (hsl.h + (degrees / 360)) % 1;
        if (hsl.h < 0) hsl.h += 1;
        const shiftedRgb = S.hslToRgb(hsl.h, hsl.s, hsl.l);
        return `rgb(${shiftedRgb.r}, ${shiftedRgb.g}, ${shiftedRgb.b})`;
    };

    S.createSiteFromTab = function (tab) {
        let cleanedUrl = tab.url;
        try {
            const u = new URL(tab.url);
            cleanedUrl = u.origin + u.pathname;
        } catch (e) { }

        const title = tab.title || new URL(cleanedUrl).hostname.replace('www.', '');
        const faviconUrl = tab.favIconUrl || `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(cleanedUrl)}`;
        return {
            id: 'site_' + Date.now(),
            title: title,
            url: cleanedUrl,
            faviconUrl: faviconUrl,
            color: '#f0f0f0',
            initial: title.charAt(0).toUpperCase()
        };
    };

    S.applyThemeStyles = function (el, theme) {
        if (theme) {
            if (theme.fontColor) el.style.setProperty('--theme-font-color', theme.fontColor);
            if (theme.sidebarBackground) el.style.setProperty('--theme-sidebar-bg', theme.sidebarBackground);
            if (theme.dividerBackground) el.style.setProperty('--theme-divider-bg', theme.dividerBackground);
            if (theme.accentColor) el.style.setProperty('--theme-accent-color', theme.accentColor);
            if (theme.panelOpacity !== undefined) {
                el.style.setProperty('--theme-panel-opacity', theme.panelOpacity);
                const alpha = Math.max(0.05, theme.panelOpacity);
                const bg = theme.sidebarBackground || '#38393c';
                const rgb = S.hexToRgb(bg);
                const rgba = `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
                el.style.setProperty('--theme-settings-bg', rgba);
                el.style.setProperty('--theme-sidebar-bg-rgba', rgba);
            }
            if (theme.accentColor) {
                const ar = S.hexToRgb(theme.accentColor);
                el.style.setProperty('--theme-accent-color-rgba', `rgba(${ar.r},${ar.g},${ar.b},0.5)`);
            }
            if (theme.midtoneColor) {
                el.style.setProperty('--theme-midtone-color', theme.midtoneColor);
            }
            if (theme.panelBlur !== undefined) el.style.setProperty('--theme-panel-blur', theme.panelBlur + 'px');
            if (theme.panelPadding !== undefined) el.style.setProperty('--theme-sidebar-padding', theme.panelPadding + 'px');
            if (theme.panelRoundness !== undefined) el.style.setProperty('--theme-sidebar-roundness', theme.panelRoundness + 'px');
            
            // Set background image and sizing!
            if (theme.backgroundImage) {
                el.style.setProperty('--theme-bg-image', `url(${JSON.stringify(theme.backgroundImage)})`);
                
                const sizeMap = {
                    stretch: '100% 100%',
                    fit: 'contain',
                    fill: 'cover',
                    repeat: 'auto',
                    center: 'auto'
                };
                const repeatMap = {
                    stretch: 'no-repeat',
                    fit: 'no-repeat',
                    fill: 'no-repeat',
                    repeat: 'repeat',
                    center: 'no-repeat'
                };
                const positionMap = {
                    stretch: 'center',
                    fit: 'center',
                    fill: 'center',
                    repeat: 'top left',
                    center: 'center'
                };
                
                const sizeVal = theme.backgroundImageSize || 'fill';
                el.style.setProperty('--theme-bg-image-size', sizeMap[sizeVal] || 'cover');
                el.style.setProperty('--theme-bg-image-repeat', repeatMap[sizeVal] || 'no-repeat');
                el.style.setProperty('--theme-bg-image-position', positionMap[sizeVal] || 'center');
            } else {
                el.style.removeProperty('--theme-bg-image');
                el.style.removeProperty('--theme-bg-image-size');
                el.style.removeProperty('--theme-bg-image-repeat');
                el.style.removeProperty('--theme-bg-image-position');
            }
        } else {
            const props = [
                '--theme-font-color', '--theme-sidebar-bg', '--theme-divider-bg',
                '--theme-accent-color', '--theme-midtone-color', '--theme-panel-opacity', '--theme-panel-blur',
                '--theme-settings-bg', '--theme-sidebar-bg-rgba', '--theme-accent-color-rgba',
                '--theme-bg-image', '--theme-bg-image-size', '--theme-bg-image-repeat', '--theme-bg-image-position',
                '--theme-sidebar-padding', '--theme-sidebar-roundness'
            ];
            props.forEach(p => el.style.removeProperty(p));
        }
    };

    S.AutoHideManager = class {
        constructor(opts) {
            this.onShowBar = opts.onShowBar;
            this.onHideBar = opts.onHideBar;
            this.getPanelWidth = opts.getPanelWidth;
            this.getAccentColor = opts.getAccentColor || (() => '#38b3ff');
            this.leaveThresholdOffset = opts.leaveThresholdOffset !== undefined ? opts.leaveThresholdOffset : 10;

            this.leaveTimer = null;
            this.mouseHandler = null;
            this.indicator = null;
            this.triggered = false;
            this.accentColor = this.getAccentColor();
            this._enterTime = 0;
            this._rafId = 0;
            this._latestEdgeDist = 0;
            this.inner = null;
        }

        updateAccentColor(color) {
            this.accentColor = color;
            if (this.inner) {
                const color2 = S.shiftHue(color, 50);
                this.inner.style.background = `repeating-linear-gradient(to bottom, ${color}, ${color2} 50%, ${color} 100%)`;
                this.inner.style.backgroundSize = '100% 1000px';
            }
        }

        ensureIndicator() {
            if (!this.indicator || !this.indicator.parentElement) {
                this.indicator = document.createElement('div');
                this.indicator.id = 'revived-auto-hide-indicator-host';
                this.inner = document.createElement('div');
                this.inner.id = 'revived-auto-hide-indicator';
                this.indicator.appendChild(this.inner);

                if (!document.getElementById('revived-wave-anim')) {
                    const style = document.createElement('style');
                    style.id = 'revived-wave-anim';
                    style.textContent = `
                        @keyframes revived-indicator-wave {
                            0%, 100% { transform: scaleX(1); }
                            50% { transform: scaleX(1.5); }
                        }
                        @keyframes revived-indicator-glow {
                            0% { background-position-y: 0; }
                            100% { background-position-y: 1000px; }
                        }
                    `;
                    document.head.appendChild(style);
                }
                document.documentElement.appendChild(this.indicator);
            }

            const color2 = S.shiftHue(this.accentColor, 50);
            this.indicator.style.cssText = `
                position: fixed;
                top: 0;
                right: 0;
                width: ${this.getPanelWidth()}px;
                height: 100vh;
                z-index: 2147483646;
                pointer-events: none;
                opacity: 0;
                visibility: hidden;
                transition: opacity 0.3s ease, visibility 0.3s ease;
            `;

            this.inner.style.cssText = `
                width: 100%;
                height: 100%;
                background: repeating-linear-gradient(to bottom, ${this.accentColor}, ${color2} 50%, ${this.accentColor} 100%);
                background-size: 100% 1000px;
                -webkit-mask-image: linear-gradient(to left, black 0%, rgba(0,0,0,0.6) 20%, rgba(0,0,0,0.3) 40%, rgba(0,0,0,0.1) 60%, transparent 100%);
                mask-image: linear-gradient(to left, black 0%, rgba(0,0,0,0.6) 20%, rgba(0,0,0,0.3) 40%, rgba(0,0,0,0.1) 60%, transparent 100%);
                animation: revived-indicator-wave 5s infinite ease-in-out, revived-indicator-glow 15s infinite linear;
                transform-origin: right center;
                opacity: 0.6;
            `;
            return this.indicator;
        }

        arm() {
            this.setup();
        }

        disarm() {
            this.cleanup();
        }

        showIndicator() {
            const el = this.ensureIndicator();
            el.style.visibility = 'visible';
            requestAnimationFrame(() => { el.style.opacity = '1'; });
        }

        hideIndicator() {
            if (this.indicator && this.indicator.parentElement) {
                this.indicator.style.opacity = '0';
                this.indicator.style.visibility = 'hidden';
            }
        }

        _cancelHover() {
            this._enterTime = 0;
            if (this._rafId) {
                cancelAnimationFrame(this._rafId);
                this._rafId = 0;
            }
        }

        _startHoverTick(panelWidth) {
            if (this._rafId) return;
            this._enterTime = performance.now();
            const tick = () => {
                this._rafId = 0;
                if (this.triggered) return;
                const progress = Math.min(1, this._latestEdgeDist / panelWidth);
                const delay = 250 + progress * (3000 - 250);
                if (performance.now() - this._enterTime >= delay) {
                    this._enterTime = 0;
                    this.hideIndicator();
                    this.triggered = true;
                    this.onShowBar();
                } else {
                    this._rafId = requestAnimationFrame(tick);
                }
            };
            this._rafId = requestAnimationFrame(tick);
        }

        setup() {
            this.cleanup();
            this.triggered = false;
            this.accentColor = this.getAccentColor();
            this.mouseHandler = (e) => {
                const edgeDist = window.innerWidth - e.clientX;
                const panelWidth = this.getPanelWidth();
                this._latestEdgeDist = edgeDist;

                if (this.triggered) {
                    if (edgeDist > panelWidth + this.leaveThresholdOffset) {
                        if (!this.leaveTimer) {
                            this.leaveTimer = setTimeout(() => {
                                this.triggered = false;
                                this.onHideBar();
                            }, 500);
                        }
                    } else {
                        if (this.leaveTimer) {
                            clearTimeout(this.leaveTimer);
                            this.leaveTimer = null;
                        }
                    }
                } else {
                    if (edgeDist <= panelWidth) {
                        this.showIndicator();
                        if (!this._enterTime) {
                            this._startHoverTick(panelWidth);
                        }
                    } else {
                        this._cancelHover();
                        this.hideIndicator();
                    }
                }
            };
            document.addEventListener('mousemove', this.mouseHandler);
        }

        cleanup() {
            if (this.mouseHandler) {
                document.removeEventListener('mousemove', this.mouseHandler);
                this.mouseHandler = null;
            }
            this._cancelHover();
            if (this.leaveTimer) {
                clearTimeout(this.leaveTimer);
                this.leaveTimer = null;
            }
            this.hideIndicator();
            this.triggered = false;
        }
    };

    S.createAutoHideManager = function (opts) {
        return new S.AutoHideManager(opts);
    };

    S.createIconBarOptions = function (context, state, handlers = {}) {
        const baseOptions = {
            sites: state.sites || [],
            tempSites: state.tempSites || [],
            activeSiteId: state.activeSiteId,
            getSites: () => state.sites || [],
            getTempSites: () => state.tempSites || [],
            onSiteClick: handlers.onSiteClick,
            onAddSite: handlers.onAddSite,
            onSettingsClick: handlers.onSettingsClick,
            onExtensionClick: handlers.onExtensionClick,
            showCategoryIcons: !!state.showCategoryIcons
        };

        if (context === 'active') {
            baseOptions.getIconOpacity = (site) => (site.id === state.activeSiteId) ? '1' : '0.8';
        } else if (context === 'idle') {
            // Defaults to full opacity or no setting
        } else if (context === 'sidepanel') {
            baseOptions.getIconOpacity = (site) => {
                const iframeExists = typeof document !== 'undefined' && document.getElementById('iframe-' + site.id);
                return (site.id === state.activeSiteId || iframeExists) ? '1' : '0.5';
            };
        }
        return baseOptions;
    };

    S.renderIconBar = async function (container, {
        sites = [],
        tempSites = [],
        activeSiteId = null,
        getSites,
        getTempSites,
        onSiteClick,
        onAddSite,
        onSettingsClick,
        onExtensionClick,
        getIconOpacity,
        showCategoryIcons
    }) {
        await S.svgReady;

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

        function dropIntoSiteList(e, targetList, isTempList, isBeginning = false) {
            try {
                const data = JSON.parse(e.dataTransfer.getData('application/json'));
                if (!data.id) return;
                const sourceList = data.isTemp ? [...getTempSites()] : [...getSites()];
                const fromIndex = sourceList.findIndex(s => s.id === data.id);
                if (fromIndex === -1) return;
                const [moved] = sourceList.splice(fromIndex, 1);
                if (data.isTemp !== isTempList) {
                    const targetArr = [...targetList];
                    if (isBeginning) {
                        targetArr.unshift(moved);
                    } else {
                        targetArr.push(moved);
                    }
                    if (data.isTemp) {
                        S.safeStorage.set({ tempSites: sourceList, sites: targetArr });
                    } else {
                        S.safeStorage.set({ sites: sourceList, tempSites: targetArr });
                    }
                } else {
                    if (isBeginning) {
                        sourceList.unshift(moved);
                    } else {
                        sourceList.push(moved);
                    }
                    S.safeStorage.set({ [isTempList ? 'tempSites' : 'sites']: sourceList });
                }
            } catch (err) { }
        }

        function setupHeaderDropHandlers(header, indicator, isTempSection) {
            const onHeaderDrop = (e) => {
                e.preventDefault();
                indicator.classList.remove('active');
                const targetList = isTempSection ? (getTempSites() || []) : getSites();
                dropIntoSiteList(e, targetList, isTempSection, true);
            };
            header.ondragover = (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                indicator.classList.add('active');
            };
            header.ondragleave = () => indicator.classList.remove('active');
            header.ondrop = onHeaderDrop;
            indicator.ondrop = onHeaderDrop;
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

        function renderSiteList(siteList, isTempList, headerElement = null) {
            let firstIndicator = null;
            siteList.forEach((site, index) => {
                const dropIndicator = makeDropZone();
                if (index === 0) firstIndicator = dropIndicator;
                dropIndicator.ondragover = (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    dropIndicator.classList.add('active');
                };
                dropIndicator.ondragleave = () => { dropIndicator.classList.remove('active'); };
                dropIndicator.ondrop = (e) => {
                    e.preventDefault();
                    dropIndicator.classList.remove('active');
                    icon.ondrop(e);
                };
                container.appendChild(dropIndicator);

                const icon = document.createElement('div');
                icon.className = 'edge-sidebar-icon';
                if (site.id === activeSiteId) {
                    icon.classList.add('active');
                }
                const opacity = typeof getIconOpacity === 'function' ? getIconOpacity(site) : null;
                if (opacity) icon.style.opacity = opacity;
                if (site.faviconUrl) {
                    icon.innerHTML = `<img src="${site.faviconUrl}" style="width: 20px; height: 20px; pointer-events: none;" />`;
                } else {
                    icon.innerText = site.initial || site.title.charAt(0);
                }
                icon.title = site.title;
                icon.dataset.id = site.id;

                icon.onclick = () => {
                    if (onSiteClick) onSiteClick(site.id, site);
                };

                icon.draggable = true;
                icon.ondragstart = (e) => {
                    e.dataTransfer.setData('application/json', JSON.stringify({ id: site.id, isTemp: isTempList }));
                    e.dataTransfer.effectAllowed = 'move';
                    icon.style.opacity = '0.5';
                    const btn = container.querySelector('.edge-sidebar-add-btn');
                    if (btn) {
                        btn.classList.add('trash-mode');
                        btn.innerHTML = S.TRASH_ICON_SVG;
                    }
                    setTimeout(() => updateVisibility(true), 0);
                };
                icon.ondragend = () => {
                    icon.style.opacity = '1';
                    const btn = container.querySelector('.edge-sidebar-add-btn');
                    if (btn) {
                        btn.classList.remove('trash-mode');
                        btn.innerHTML = S.ADD_ICON_SVG;
                    }
                    updateVisibility(false);
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
                            const currentSites = getSites ? getSites() : [];
                            const currentTempSites = getTempSites ? getTempSites() : [];
                            const sourceList = data.isTemp ? [...currentTempSites] : [...currentSites];
                            const targetList = isTempList ? [...currentTempSites] : [...currentSites];
                            const fromIndex = sourceList.findIndex(s => s.id === data.id);
                            if (fromIndex === -1) return;
                            const [moved] = sourceList.splice(fromIndex, 1);
                            if (data.isTemp !== isTempList) {
                                const toIndex = targetList.findIndex(s => s.id === site.id);
                                targetList.splice(toIndex, 0, moved);
                                if (data.isTemp) {
                                    S.safeStorage.set({ tempSites: sourceList, sites: targetList });
                                } else {
                                    S.safeStorage.set({ sites: sourceList, tempSites: targetList });
                                }
                            } else {
                                let toIndex = sourceList.findIndex(s => s.id === site.id);
                                if (fromIndex < toIndex) toIndex--;
                                sourceList.splice(toIndex, 0, moved);
                                S.safeStorage.set({ [isTempList ? 'tempSites' : 'sites']: sourceList });
                            }
                        }
                    } catch (err) { }
                };

                container.appendChild(icon);
            });

            const endZone = makeEndDropZone(siteList, isTempList);
            container.appendChild(endZone);
            if (!firstIndicator) firstIndicator = endZone;

            if (headerElement && firstIndicator) {
                setupHeaderDropHandlers(headerElement, firstIndicator, isTempList);
            }
        }

        let pinnedHeader, tempHeader, pinDivider, tempDivider;

        function updateVisibility(isDragging = false) {
            if (isDragging) {
                container.classList.add('dragging');
            } else {
                container.classList.remove('dragging');
            }
            const pinnedPopulated = (getSites && getSites()) ? getSites().length > 0 : false;
            const tempPopulated = (getTempSites && getTempSites()) ? getTempSites().length > 0 : false;
            
            const showHeaders = isDragging && showCategoryIcons;

            if (pinnedHeader) pinnedHeader.style.display = showHeaders ? 'flex' : 'none';
            if (tempHeader) tempHeader.style.display = showHeaders ? 'flex' : 'none';
            if (pinDivider) pinDivider.style.display = (isDragging || pinnedPopulated || tempPopulated) ? 'block' : 'none';
            if (tempDivider) tempDivider.style.display = (isDragging || tempPopulated) ? 'block' : 'none';
        }

        const oldRects = new Map();
        container.querySelectorAll('.edge-sidebar-icon').forEach(el => {
            if (el.dataset.id) oldRects.set(el.dataset.id, el.getBoundingClientRect());
        });

        container.innerHTML = '';

        pinnedHeader = makeSectionHeader(S.PIN_HEADER_SVG, true);
        container.appendChild(pinnedHeader);
        renderSiteList(sites, false, pinnedHeader);

        pinDivider = document.createElement('div');
        pinDivider.className = 'edge-sidebar-divider';
        container.appendChild(pinDivider);

        tempHeader = makeSectionHeader(S.TEMP_HEADER_SVG, false);
        container.appendChild(tempHeader);
        renderSiteList(tempSites || [], true, tempHeader);

        tempDivider = document.createElement('div');
        tempDivider.className = 'edge-sidebar-divider';
        container.appendChild(tempDivider);

        updateVisibility(false);

        const addBtn = document.createElement('div');
        addBtn.className = 'edge-sidebar-add-btn';
        addBtn.innerHTML = S.ADD_ICON_SVG;
        addBtn.title = "Pin Current Tab";
        addBtn.onclick = () => {
            if (addBtn.classList.contains('trash-mode')) return;
            if (onAddSite) onAddSite();
        };

        addBtn.ondragover = (e) => {
            e.preventDefault();
            if (addBtn.classList.contains('trash-mode')) {
                addBtn.classList.add('trash-hover');
            }
        };
        addBtn.ondragleave = () => { addBtn.classList.remove('trash-hover'); };
        addBtn.ondrop = (e) => {
            e.preventDefault();
            addBtn.classList.remove('trash-hover');
            if (addBtn.classList.contains('trash-mode')) {
                try {
                    const data = JSON.parse(e.dataTransfer.getData('application/json'));
                    if (data.id) {
                        if (data.isTemp) {
                            S.safeStorage.set({ tempSites: getTempSites().filter(s => s.id !== data.id) });
                        } else {
                            S.safeStorage.set({ sites: getSites().filter(s => s.id !== data.id) });
                        }
                        if (activeSiteId === data.id) {
                            S.safeStorage.set({ activeSiteId: null, activeSiteOwner: null });
                        }
                    }
                } catch (evt) { }
            }
        };

        container.appendChild(addBtn);

        const extensionBtn = document.createElement('div');
        extensionBtn.className = 'edge-sidebar-icon edge-sidebar-add-btn';
        extensionBtn.title = "Theme Store";
        extensionBtn.style.marginTop = 'auto';
        extensionBtn.style.marginBottom = '4px';
        extensionBtn.innerHTML = S.EXTENSION_ICON_SVG;
        extensionBtn.onclick = () => {
            if (onExtensionClick) onExtensionClick();
        };
        container.appendChild(extensionBtn);

        const settingsBtn = document.createElement('div');
        settingsBtn.className = 'edge-sidebar-icon edge-sidebar-add-btn';
        settingsBtn.title = "Settings";
        settingsBtn.style.marginTop = '0px';
        settingsBtn.style.marginBottom = '12px';
        settingsBtn.innerHTML = S.SETTINGS_ICON_SVG;
        settingsBtn.onclick = () => {
            if (onSettingsClick) onSettingsClick();
        };
        container.appendChild(settingsBtn);

        if (oldRects.size > 0) {
            requestAnimationFrame(() => {
                const icons = container.querySelectorAll('.edge-sidebar-icon');
                icons.forEach(icon => {
                    const id = icon.dataset.id;
                    if (!id || !oldRects.has(id)) return;
                    const oldRect = oldRects.get(id);
                    const newRect = icon.getBoundingClientRect();
                    const dx = oldRect.left - newRect.left;
                    const dy = oldRect.top - newRect.top;
                    if (dx || dy) {
                        icon.style.transition = 'none';
                        icon.style.transform = `translate(${dx}px, ${dy}px)`;
                        icon.offsetHeight; 
                        icon.style.transition = 'transform 0.5s cubic-bezier(0.2, 0, 0, 1)';
                        icon.style.transform = '';
                    }
                });
            });
        }
    };

    S.runLayoutTrial = function (candidateCss, timeout = 700) {
        return new Promise((resolve) => {
            const recorded = new Set();
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

            const trialStyle = document.createElement('style');
            trialStyle.id = 'revived-shared-detector-trial-style';
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
    };

    globalThis.__SidebarRevived = S;
})();

// ============================================================
// PART 2: Environment Detection & Context Router
// ============================================================
(() => {
    const isBackground = (typeof window === 'undefined');
    const isExtensionPage = typeof window !== 'undefined' && typeof chrome !== 'undefined' && !!chrome.tabs && !!chrome.sidePanel;
    const isContentScript = typeof window !== 'undefined' && !isExtensionPage;

    const SR = globalThis.__SidebarRevived;
    const STORAGE_KEYS = SR.STORAGE_KEYS;

    if (isBackground) {
        // ============================================================
        // PART 3: Background Service Worker
        // ============================================================
        let openSidePanels = 0;

        async function injectIntoTab(tabId) {
            try {
                const tab = await chrome.tabs.get(tabId);
                if (!tab.url || !tab.url.startsWith('http')) return;

                try {
                    await chrome.tabs.sendMessage(tabId, { type: 'PING' });
                    return;
                } catch (e) { }

                await chrome.scripting.executeScript({
                    target: { tabId: tabId },
                    files: ['unified.js']
                });
                await chrome.scripting.executeScript({
                    target: { tabId: tabId, allFrames: true },
                    files: ['persistence.js']
                });
            } catch (e) { }
        }

        chrome.runtime.onInstalled.addListener(async (details) => {
            const defaults = {
                [STORAGE_KEYS.SITES]: [],
                [STORAGE_KEYS.TEMP_SITES]: [],
                [STORAGE_KEYS.ACTIVE_SITE_ID]: null,
                [STORAGE_KEYS.ACTIVE_SITE_OWNER]: null,
                [STORAGE_KEYS.IS_SETTINGS_OPEN]: false,
                [STORAGE_KEYS.IS_ADD_PAGE_OPEN]: false,
                [STORAGE_KEYS.IS_THEME_STORE_OPEN]: false,
                [STORAGE_KEYS.IS_SIDE_PANEL_OPEN]: false,
                [STORAGE_KEYS.AUTO_HIDE_ENABLED]: false,
                [STORAGE_KEYS.SHOW_CATEGORY_ICONS]: false,
                [STORAGE_KEYS.SCROLL_BLOCKLIST]: [],
                [STORAGE_KEYS.SIDEPANEL_BLOCKLIST]: [],
                [STORAGE_KEYS.AUTOHIDE_BLOCKLIST]: [],
                [STORAGE_KEYS.CUSTOM_THEME]: SR.getThemeDefaults()
            };

            await new Promise(resolve => {
                chrome.storage.local.get(Object.keys(defaults), (result) => {
                    const toSet = {};
                    for (const key in defaults) {
                        if (result[key] === undefined) {
                            toSet[key] = defaults[key];
                        }
                    }
                    if (Object.keys(toSet).length > 0) {
                        chrome.storage.local.set(toSet, resolve);
                    } else {
                        resolve();
                    }
                });
            });

            chrome.contextMenus.removeAll(() => {
                const le = chrome.runtime && chrome.runtime.lastError;
                try {
                    chrome.contextMenus.create({
                        id: "send_to_sidebar",
                        title: "Send to Sidebar",
                        contexts: ["page"]
                    });
                } catch (err) { }
            });

            const tabs = await chrome.tabs.query({});
            for (const tab of tabs) {
                injectIntoTab(tab.id);
            }

            if (details.reason === 'install') {
                const windows = await chrome.windows.getAll({ populate: false });
                if (windows.length > 0) {
                    chrome.sidePanel.open({ windowId: windows[0].id }).catch(() => { });
                }
            }
        });

        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (changeInfo.status === 'complete' && tab.url && tab.url.startsWith('http')) {
                injectIntoTab(tabId);
            }
        });

        chrome.storage.local.set({ [STORAGE_KEYS.IS_SIDE_PANEL_OPEN]: false });

        chrome.contextMenus.onClicked.addListener((info, tab) => {
            if (info.menuItemId === "send_to_sidebar") {
                if (tab && tab.url && tab.url.startsWith('http')) {
                    const newSite = SR.createSiteFromTab(tab);
                    chrome.sidePanel.open({ windowId: tab.windowId }).then(() => {
                        chrome.storage.local.get([STORAGE_KEYS.TEMP_SITES], (result) => {
                            chrome.storage.local.set({
                                [STORAGE_KEYS.TEMP_SITES]: [...(result.tempSites || []), newSite],
                                [STORAGE_KEYS.ACTIVE_SITE_ID]: newSite.id,
                                [STORAGE_KEYS.ACTIVE_SITE_OWNER]: 'sidepanel'
                            });
                        });
                    });
                }
            }
        });

        chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error(error));

        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message.action === 'open_side_panel') {
                if (sender.tab && sender.tab.windowId) {
                    chrome.sidePanel.open({ windowId: sender.tab.windowId }).catch(() => { });
                }
            } else if (message.action === 'add_current_tab') {
                if (sender.tab && sender.tab.windowId) {
                    chrome.sidePanel.open({ windowId: sender.tab.windowId }).catch(() => { });
                    chrome.storage.local.set({ [STORAGE_KEYS.IS_ADD_PAGE_OPEN]: true, [STORAGE_KEYS.IS_SETTINGS_OPEN]: false });
                }
            } else if (message.ping) {
                sendResponse({ status: 'alive' });
            } else if (message.type === 'IFRAME_NAVIGATED') {
                const { siteId, url } = message;
                chrome.storage.local.get([STORAGE_KEYS.CURRENT_URLS], (result) => {
                    const currentUrls = result.currentUrls || {};
                    if (currentUrls[siteId] !== url) {
                        currentUrls[siteId] = url;
                        chrome.storage.local.set({ [STORAGE_KEYS.CURRENT_URLS]: currentUrls });
                    }
                });
            }
            return true;
        });

        chrome.runtime.onConnect.addListener((port) => {
            if (port.name === 'sidepanel') {
                openSidePanels++;
                chrome.storage.local.set({ [STORAGE_KEYS.IS_SIDE_PANEL_OPEN]: true });
                port.onDisconnect.addListener(() => {
                    openSidePanels--;
                    if (openSidePanels <= 0) {
                        chrome.storage.local.set({ 
                            [STORAGE_KEYS.IS_SIDE_PANEL_OPEN]: false, 
                            [STORAGE_KEYS.TEMP_SITES]: [], 
                            [STORAGE_KEYS.ACTIVE_SITE_ID]: null, 
                            [STORAGE_KEYS.ACTIVE_SITE_OWNER]: null,
                            [STORAGE_KEYS.IS_SETTINGS_OPEN]: false,
                            [STORAGE_KEYS.IS_ADD_PAGE_OPEN]: false,
                            [STORAGE_KEYS.IS_THEME_STORE_OPEN]: false
                        });
                    }
                });
            }
        });

    } else if (isExtensionPage) {
        // ============================================================
        // PART 4: Extension Side Panel Page Script
        // ============================================================
        const port = chrome.runtime.connect({ name: 'sidepanel' });
        setInterval(() => chrome.runtime.sendMessage({ ping: true }), 25000);

        let state = {
            sites: [],
            tempSites: [],
            activeSiteId: null,
            currentUrls: {},
            customTheme: null,
            isSettingsOpen: false,
            isThemeStoreOpen: false,
            scrollBlocklist: [],
            sidepanelBlocklist: [],
            autoHideBlocklist: [],
            activeSiteOwner: null,
            collapsedSections: JSON.parse(localStorage.getItem('collapsedSections') || '{}'),
            autoHideEnabled: false,
            showCategoryIcons: false,
            isAddPageOpen: false,
            _loaded: false
        };

        async function searchSites(query) {
            if (!query || query.length < 2) return [];
            try {
                const response = await fetch(`https://autocomplete.clearbit.com/v1/companies/suggest?query=${encodeURIComponent(query)}`);
                const data = await response.json();
                
                const mapped = data.map(item => ({
                    title: item.name,
                    url: 'https://' + item.domain,
                    faviconUrl: item.logo || `https://www.google.com/s2/favicons?domain=${item.domain}&sz=64`,
                    domain: item.domain
                }));

                const checked = await Promise.all(mapped.map(async (item) => {
                    try {
                        const dohResponse = await fetch(`https://family.cloudflare-dns.com/dns-query?name=${encodeURIComponent(item.domain)}&type=A`, {
                            headers: { 'Accept': 'application/dns-json' }
                        });
                        const dohData = await dohResponse.json();
                        const isBlocked = dohData.Answer && dohData.Answer.some(ans => ans.data === '0.0.0.0');
                        return { ...item, isBlocked };
                    } catch (e) {
                        return { ...item, isBlocked: false };
                    }
                }));

                checked.sort((a, b) => (a.isBlocked === b.isBlocked) ? 0 : a.isBlocked ? 1 : -1);
                return checked;
            } catch (err) {
                console.error('Search failed', err);
                return [];
            }
        }

        const { createSiteFromTab, applyThemeStyles, getThemeDefaults } = SR;
        const iconBar = document.getElementById('icon-bar');
        const contentArea = document.getElementById('content-area');

        iconBar.ondragover = (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        };
        iconBar.ondragenter = (e) => { e.preventDefault(); };

        const keysToRetrieve = [
            STORAGE_KEYS.SITES,
            STORAGE_KEYS.TEMP_SITES,
            STORAGE_KEYS.ACTIVE_SITE_ID,
            STORAGE_KEYS.CURRENT_URLS,
            STORAGE_KEYS.CUSTOM_THEME,
            STORAGE_KEYS.IS_SETTINGS_OPEN,
            STORAGE_KEYS.IS_ADD_PAGE_OPEN,
            STORAGE_KEYS.IS_THEME_STORE_OPEN,
            STORAGE_KEYS.SCROLL_BLOCKLIST,
            STORAGE_KEYS.SIDEPANEL_BLOCKLIST,
            STORAGE_KEYS.AUTOHIDE_BLOCKLIST,
            STORAGE_KEYS.AUTO_HIDE_ENABLED,
            STORAGE_KEYS.SHOW_CATEGORY_ICONS,
            STORAGE_KEYS.ENABLE_TAPER,
            STORAGE_KEYS.ACTIVE_SITE_OWNER
        ];

        chrome.storage.local.get(keysToRetrieve, async (result) => {
            // Bypass rendering if this is an OAuth authentication tab context
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('auth_trigger') || urlParams.get('auth')) {
                console.log("ℹ️ [OAuth] Bypassing sidebar rendering inside the OAuth tab.");
                return;
            }

            if (result.sites) state.sites = result.sites;
            if (result.tempSites) state.tempSites = result.tempSites;
            if (result.activeSiteId) state.activeSiteId = result.activeSiteId;
            if (result.currentUrls) state.currentUrls = result.currentUrls;
            if (result.customTheme) state.customTheme = result.customTheme;
            if (result.isSettingsOpen !== undefined) state.isSettingsOpen = result.isSettingsOpen;
            if (result.isAddPageOpen !== undefined) state.isAddPageOpen = result.isAddPageOpen;
            if (result.isThemeStoreOpen !== undefined) state.isThemeStoreOpen = result.isThemeStoreOpen;
            if (result.scrollBlocklist) state.scrollBlocklist = result.scrollBlocklist;
            if (result.sidepanelBlocklist) state.sidepanelBlocklist = result.sidepanelBlocklist;
            if (result.autoHideBlocklist) state.autoHideBlocklist = result.autoHideBlocklist;
            if (result.autoHideEnabled !== undefined) state.autoHideEnabled = result.autoHideEnabled;
            if (result.showCategoryIcons !== undefined) state.showCategoryIcons = result.showCategoryIcons;
            if (result.enableTaper !== undefined) state.enableTaper = result.enableTaper;
            if (result.activeSiteOwner !== undefined) state.activeSiteOwner = result.activeSiteOwner;
            
            state._loaded = true;
            applyTheme();
            await SR.svgReady;
            render();
            if (state.isSettingsOpen || state.isThemeStoreOpen) {
                const barEl = document.getElementById('icon-bar');
                const areaEl = document.getElementById('content-area');
                if (barEl) barEl.style.display = 'none';
                if (areaEl) areaEl.style.display = 'none';
            }
        });

        chrome.storage.onChanged.addListener((changes, namespace) => {
            // Bypass execution if this is an OAuth authentication tab context
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('auth_trigger') || urlParams.get('auth')) return;

            if (namespace === 'local') {
                state._loaded = true;
                if (changes.sites) state.sites = changes.sites.newValue;
                if (changes.tempSites) state.tempSites = changes.tempSites.newValue;
                if (changes.activeSiteId !== undefined) {
                    state.activeSiteId = changes.activeSiteId.newValue;
                }
                if (changes.activeSiteOwner !== undefined) {
                    state.activeSiteOwner = changes.activeSiteOwner.newValue;
                }
                if (changes.currentUrls) state.currentUrls = changes.currentUrls.newValue;
                if (changes.customTheme) {
                    state.customTheme = changes.customTheme.newValue;
                    applyTheme();
                    updateSettingsUI();
                }
                if (changes.isSettingsOpen !== undefined) {
                    state.isSettingsOpen = changes.isSettingsOpen.newValue;
                }
                if (changes.isAddPageOpen !== undefined) {
                    state.isAddPageOpen = changes.isAddPageOpen.newValue;
                }
                if (changes.isThemeStoreOpen !== undefined) {
                    state.isThemeStoreOpen = changes.isThemeStoreOpen.newValue;
                }
                if (changes.scrollBlocklist) {
                    state.scrollBlocklist = changes.scrollBlocklist.newValue;
                    updateSettingsUI();
                }
                if (changes.sidepanelBlocklist) state.sidepanelBlocklist = changes.sidepanelBlocklist.newValue;
                if (changes.autoHideBlocklist) state.autoHideBlocklist = changes.autoHideBlocklist.newValue;
                if (changes.autoHideEnabled) {
                    state.autoHideEnabled = changes.autoHideEnabled.newValue;
                    updateSettingsUI();
                }
                if (changes.showCategoryIcons) {
                    state.showCategoryIcons = changes.showCategoryIcons.newValue;
                    updateSettingsUI();
                }
                if (changes.enableTaper) {
                    state.enableTaper = changes.enableTaper.newValue;
                    updateSettingsUI();
                }
                render();
            }
        });

        function applyTheme() {
            applyThemeStyles(document.documentElement, state.customTheme || SR.getThemeDefaults());
        }

        async function render() {
            const sp = document.getElementById('settings-panel');
            const ap = document.getElementById('add-page-panel');
            const tp = document.getElementById('theme-store-panel');
            const note = document.getElementById('inpage-sidebar-note');

            if (state.isSettingsOpen) {
                updateSettingsUI();
                initCollapsibleSections();
                updateLastSyncRelativeTime();
                
                iconBar.style.display = 'none';
                contentArea.style.display = 'none';
                if (note) note.style.display = 'none';
                if (ap) ap.style.display = 'none';
                if (tp) tp.style.display = 'none';
                if (sp) sp.style.display = 'flex';
                return;
            }

            if (state.isThemeStoreOpen) {
                iconBar.style.display = 'none';
                contentArea.style.display = 'none';
                if (note) note.style.display = 'none';
                if (ap) ap.style.display = 'none';
                if (sp) sp.style.display = 'none';
                if (tp) tp.style.display = 'flex';
                if (window.loadThemeStoreCatalog) {
                    window.loadThemeStoreCatalog();
                }
                return;
            }

            if (state.isAddPageOpen) {
                await updateAddPageUI();
                iconBar.style.display = 'flex';
                contentArea.style.display = 'none';
                if (note) note.style.display = 'none';
                if (sp) sp.style.display = 'none';
                if (tp) tp.style.display = 'none';
                if (ap) ap.style.display = 'flex';
            } else {
                iconBar.style.display = 'flex';
                if (sp) sp.style.display = 'none';
                if (ap) ap.style.display = 'none';
                if (tp) tp.style.display = 'none';

                const inPageActive = state.activeSiteOwner === 'inpage';
                if (note) note.style.display = inPageActive ? 'flex' : 'none';
                contentArea.style.display = (!inPageActive && state.activeSiteId) ? 'flex' : 'none';

                if (state.activeSiteId && !inPageActive) {
                    contentArea.classList.add('active');
                    const activeSite = state.sites.find(s => s.id === state.activeSiteId) || (state.tempSites && state.tempSites.find(s => s.id === state.activeSiteId));
                    if (activeSite) {
                        document.title = activeSite.title;
                        let targetIframe = document.getElementById('iframe-' + activeSite.id);
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
                        const defaultIframe = document.getElementById('app-frame');
                        if (defaultIframe) defaultIframe.remove();
                    }
                } else if (!inPageActive) {
                    contentArea.classList.remove('active');
                    document.title = "Sidebar";
                }
            }

            const iconBarOptions = SR.createIconBarOptions('sidepanel', state, {
                onSiteClick: (siteId, site) => {
                    const newId = state.activeSiteId === siteId ? null : siteId;
                    chrome.storage.local.set({ 
                        [STORAGE_KEYS.ACTIVE_SITE_ID]: newId, 
                        [STORAGE_KEYS.ACTIVE_SITE_OWNER]: newId ? 'sidepanel' : null, 
                        [STORAGE_KEYS.IS_SETTINGS_OPEN]: false, 
                        [STORAGE_KEYS.IS_ADD_PAGE_OPEN]: false,
                        [STORAGE_KEYS.IS_THEME_STORE_OPEN]: false
                    });
                    if (!state.currentUrls[siteId]) {
                        state.currentUrls[siteId] = site.url;
                        chrome.storage.local.set({ [STORAGE_KEYS.CURRENT_URLS]: state.currentUrls });
                    }
                },
                onAddSite: () => {
                    const searchInput = document.getElementById('site-search-input');
                    if (searchInput) {
                        searchInput.value = '';
                        renderSearchResults('');
                    }
                    chrome.storage.local.set({ 
                        [STORAGE_KEYS.IS_ADD_PAGE_OPEN]: true, 
                        [STORAGE_KEYS.IS_SETTINGS_OPEN]: false,
                        [STORAGE_KEYS.IS_THEME_STORE_OPEN]: false
                    });
                },
                onSettingsClick: () => {
                    chrome.storage.local.set({ 
                        [STORAGE_KEYS.IS_SETTINGS_OPEN]: true, 
                        [STORAGE_KEYS.IS_ADD_PAGE_OPEN]: false,
                        [STORAGE_KEYS.IS_THEME_STORE_OPEN]: false
                    });
                },
                onExtensionClick: () => {
                    chrome.storage.local.set({ 
                        [STORAGE_KEYS.IS_THEME_STORE_OPEN]: true, 
                        [STORAGE_KEYS.IS_SETTINGS_OPEN]: false, 
                        [STORAGE_KEYS.IS_ADD_PAGE_OPEN]: false 
                    });
                }
            });

            await SR.renderIconBar(iconBar, iconBarOptions);
        }

        function initCollapsibleSections() {
            document.querySelectorAll('.settings-category-header.collapsible').forEach(header => {
                const targetId = header.dataset.target;
                const isCollapsed = state.collapsedSections[targetId];
                const body = document.getElementById(targetId);
                if (body) {
                    body.style.display = isCollapsed ? 'none' : 'block';
                    header.querySelector('.collapse-arrow').style.transform = isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
                }
                header.onclick = () => {
                    const nowCollapsed = body.style.display !== 'none';
                    body.style.display = nowCollapsed ? 'none' : 'block';
                    header.querySelector('.collapse-arrow').style.transform = nowCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
                    state.collapsedSections[targetId] = nowCollapsed;
                    localStorage.setItem('collapsedSections', JSON.stringify(state.collapsedSections));

                    // Dynamic Hook: Fetch from Theme Store when expanding theme store
                    if (targetId === 'theme-store-section' && !nowCollapsed) {
                        if (window.loadThemeStoreCatalog) {
                            window.loadThemeStoreCatalog();
                        }
                    }
                };
            });
        }

        let currentTabInfo = null;

        function refreshCurrentTab() {
            const faviconImg = document.getElementById('current-tab-favicon');
            const titleSpan = document.getElementById('current-tab-title');
            const urlSpan = document.getElementById('current-tab-url');
            const tabItem = document.getElementById('add-current-tab-item');
            if (!faviconImg || !titleSpan) return;

            chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
                const tab = tabs[0];
                if (tab && tab.url && tab.url.startsWith('http')) {
                    currentTabInfo = tab;
                    let cleanedUrl = tab.url;
                    try {
                        const u = new URL(tab.url);
                        cleanedUrl = u.origin + u.pathname;
                    } catch (e) { }
                    faviconImg.src = tab.favIconUrl || 'assets/pin_icon.svg';
                    titleSpan.innerText = tab.title;
                    if (urlSpan) urlSpan.innerText = cleanedUrl;
                    if (tabItem) { 
                        tabItem.style.opacity = '1'; 
                        tabItem.style.pointerEvents = ''; 
                    }
                } else {
                    currentTabInfo = null;
                    faviconImg.src = 'assets/pin_icon.svg';
                    titleSpan.innerText = 'Internal Page (Cannot Add)';
                    if (urlSpan) urlSpan.innerText = '';
                    if (tabItem) { 
                        tabItem.style.opacity = '0.4'; 
                        tabItem.style.pointerEvents = 'none'; 
                    }
                }
            });
        }

        chrome.tabs.onActivated.addListener(() => {
            if (state.isAddPageOpen) refreshCurrentTab();
        });
        chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
            if (state.isAddPageOpen && changeInfo.status === 'complete') refreshCurrentTab();
        });

        async function updateAddPageUI() {
            await SR.svgReady;
            const tabItem = document.getElementById('add-current-tab-item');
            refreshCurrentTab();

            if (tabItem && !tabItem.dataset.clickBound) {
                tabItem.dataset.clickBound = '1';
                tabItem.onclick = () => {
                    if (currentTabInfo) {
                        const newSite = createSiteFromTab(currentTabInfo);
                        chrome.storage.local.set({ [STORAGE_KEYS.SITES]: [...state.sites, newSite] });
                    }
                };
            }

            const rowIcon = document.getElementById('add-current-tab-icon');
            if (rowIcon && !rowIcon.dataset.iconLoaded) {
                rowIcon.innerHTML = SR.ADD_ICON_SVG;
                rowIcon.dataset.iconLoaded = '1';
            }

            const pinnedGrid = document.getElementById('pinned-apps-grid');
            const pinnedTrash = document.getElementById('pinned-apps-trash');
            
            if (pinnedTrash && !pinnedTrash.dataset.iconLoaded) {
                pinnedTrash.innerHTML = SR.TRASH_ICON_SVG;
                pinnedTrash.dataset.iconLoaded = '1';
                
                pinnedTrash.ondragover = (e) => {
                    e.preventDefault();
                    pinnedTrash.classList.add('trash-hover');
                };
                pinnedTrash.ondragleave = () => {
                    pinnedTrash.classList.remove('trash-hover');
                };
                pinnedTrash.ondrop = (e) => {
                    e.preventDefault();
                    pinnedTrash.classList.remove('trash-hover');
                    pinnedTrash.classList.remove('visible');
                    const siteId = e.dataTransfer.getData('text/plain');
                    if (siteId) {
                        const newSites = state.sites.filter(s => s.id !== siteId);
                        chrome.storage.local.set({ [STORAGE_KEYS.SITES]: newSites });
                    }
                };
            }

            if (pinnedGrid) {
                const oldRects = new Map();
                const gridRect = pinnedGrid.getBoundingClientRect();
                if (gridRect.width > 0 && gridRect.height > 0) {
                    pinnedGrid.querySelectorAll('.pinned-app-item').forEach(el => {
                        if (el.dataset.id) oldRects.set(el.dataset.id, el.getBoundingClientRect());
                    });
                }

                pinnedGrid.innerHTML = '';
                if (state.sites.length === 0) {
                    pinnedGrid.innerHTML = '<div class="empty-state">No pinned apps</div>';
                } else {
                    state.sites.forEach((site) => {
                        const item = document.createElement('div');
                        item.className = 'pinned-app-item';
                        item.draggable = true;
                        item.dataset.id = site.id;
                        item.innerHTML = `<img src="${site.faviconUrl}" alt="${site.title}" title="${site.title}" />`;
                        
                        item.ondragstart = (e) => {
                            e.dataTransfer.setData('text/plain', site.id);
                            item.classList.add('dragging');
                            if (pinnedTrash) pinnedTrash.classList.add('visible');
                        };
                        
                        item.ondragend = () => {
                            item.classList.remove('dragging');
                            if (pinnedTrash) {
                                pinnedTrash.classList.remove('visible');
                                pinnedTrash.classList.remove('trash-hover');
                            }
                            pinnedGrid.querySelectorAll('.drop-target-left, .drop-target-right').forEach(el => {
                                el.classList.remove('drop-target-left', 'drop-target-right');
                            });
                        };
                        pinnedGrid.appendChild(item);
                    });
                }

                pinnedGrid.ondragover = (e) => {
                    e.preventDefault();
                    const draggables = [...pinnedGrid.querySelectorAll('.pinned-app-item:not(.dragging)')];
                    if (draggables.length === 0) return;

                    let closest = { offset: Number.POSITIVE_INFINITY, element: null, side: 'left' };
                    draggables.forEach(child => {
                        const box = child.getBoundingClientRect();
                        const centerX = box.left + box.width / 2;
                        const centerY = box.top + box.height / 2;
                        const distance = Math.sqrt(Math.pow(e.clientX - centerX, 2) + Math.pow(e.clientY - centerY, 2));
                        if (distance < closest.offset) {
                            const side = e.clientX > centerX ? 'right' : 'left';
                            closest = { offset: distance, element: child, side: side };
                        }
                    });

                    pinnedGrid.querySelectorAll('.drop-target-left, .drop-target-right').forEach(el => {
                        el.classList.remove('drop-target-left', 'drop-target-right');
                    });

                    if (closest.element) {
                        closest.element.classList.add(closest.side === 'left' ? 'drop-target-left' : 'drop-target-right');
                    }
                };

                pinnedGrid.ondragleave = (e) => {
                    if (e.target === pinnedGrid) {
                        pinnedGrid.querySelectorAll('.drop-target-left, .drop-target-right').forEach(el => {
                            el.classList.remove('drop-target-left', 'drop-target-right');
                        });
                    }
                };

                pinnedGrid.ondrop = (e) => {
                    e.preventDefault();
                    const siteId = e.dataTransfer.getData('text/plain');
                    const targetEl = pinnedGrid.querySelector('.drop-target-left, .drop-target-right');
                    if (!siteId || !targetEl) return;

                    const isLeft = targetEl.classList.contains('drop-target-left');
                    const targetId = targetEl.dataset.id;
                    const sites = [...state.sites];
                    const fromIndex = sites.findIndex(s => s.id === siteId);
                    if (fromIndex === -1) return;
                    const [moved] = sites.splice(fromIndex, 1);
                    let toIndex = sites.findIndex(s => s.id === targetId);
                    if (!isLeft) toIndex++;
                    sites.splice(toIndex, 0, moved);
                    chrome.storage.local.set({ [STORAGE_KEYS.SITES]: sites });
                };

                if (oldRects.size > 0) {
                    requestAnimationFrame(() => {
                        const items = pinnedGrid.querySelectorAll('.pinned-app-item');
                        items.forEach(item => {
                            const id = item.dataset.id;
                            if (!id || !oldRects.has(id)) return;
                            const oldRect = oldRects.get(id);
                            const newRect = item.getBoundingClientRect();
                            const dx = oldRect.left - newRect.left;
                            const dy = oldRect.top - newRect.top;
                            if (dx || dy) {
                                item.style.transition = 'none';
                                item.style.transform = `translate(${dx}px, ${dy}px)`;
                                item.offsetHeight;
                                item.style.transition = 'transform 0.5s cubic-bezier(0.2, 0, 0, 1)';
                                item.style.transform = '';
                            }
                        });
                    });
                }
            }

            renderMostVisited();
            const backBtn = document.getElementById('add-page-back-btn');
            if (backBtn && !backBtn.dataset.iconLoaded) {
                fetch(chrome.runtime.getURL('assets/close_icon.svg'))
                    .then(r => r.text())
                    .then(svg => { backBtn.innerHTML = svg; backBtn.dataset.iconLoaded = '1'; })
                    .catch(() => { backBtn.innerHTML = '✕'; });
            }
        }

        function isValidUrl(str) {
            try {
                const urlToTest = str.includes('://') ? str : 'https://' + str;
                const u = new URL(urlToTest);
                return u.hostname.includes('.') && u.hostname.replace('www.', '').length >= 3;
            } catch (e) {
                return false;
            }
        }

        function normaliseUrl(str) {
            if (str.includes('://')) return str;
            return 'https://' + str;
        }

        async function renderSearchResults(query) {
            const container = document.getElementById('search-results');
            if (!container) return;
            
            if (!query || query.length < 2) {
                container.innerHTML = '';
                container.classList.remove('visible');
                return;
            }

            container.innerHTML = '<div class="search-status">Searching...</div>';
            const results = await searchSites(query);
            container.innerHTML = '';

            results.forEach(app => {
                const domain = app.url.replace('https://', '').replace('http://', '');
                const item = document.createElement('div');
                item.className = 'search-result-item';
                item.innerHTML = `
                    <img src="${app.faviconUrl}" alt="" />
                    <span class="result-title">${app.title}</span>
                    <span class="result-domain">${domain}</span>
                    <div class="result-add-btn"></div>
                `;
                const addBtn = item.querySelector('.result-add-btn');
                addBtn.innerHTML = SR.ADD_ICON_SVG;

                item.onclick = () => {
                    const site = {
                        id: 'site-' + Date.now() + Math.random().toString(36).substr(2, 5),
                        title: app.title,
                        url: app.url,
                        faviconUrl: app.faviconUrl,
                        initial: app.title.charAt(0)
                    };
                    chrome.storage.local.set({ [STORAGE_KEYS.SITES]: [...state.sites, site] });
                };
                container.appendChild(item);
            });

            if (isValidUrl(query)) {
                const url = normaliseUrl(query);
                let displayTitle = query;
                let faviconUrl = `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(url)}`;
                try {
                    const u = new URL(url);
                    displayTitle = u.hostname.replace('www.', '');
                } catch (e) { }

                const item = document.createElement('div');
                item.className = 'search-result-item search-result-direct';
                item.innerHTML = `
                    <img src="${faviconUrl}" alt="" />
                    <div style="display:flex; flex-direction:column; min-width:0; flex:1;">
                        <span class="result-title" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${displayTitle}</span>
                        <span class="result-domain" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:11px; opacity:0.7;">${url}</span>
                    </div>
                    <div class="result-add-btn"></div>
                `;
                const addBtn = item.querySelector('.result-add-btn');
                addBtn.innerHTML = SR.ADD_ICON_SVG;

                item.onclick = () => {
                    const site = {
                        id: 'site-' + Date.now() + Math.random().toString(36).substr(2, 5),
                        title: displayTitle,
                        url,
                        faviconUrl,
                        initial: displayTitle.charAt(0).toUpperCase()
                    };
                    chrome.storage.local.set({ [STORAGE_KEYS.SITES]: [...state.sites, site] });
                };
                container.appendChild(item);
            }

            if (container.children.length === 0) {
                container.innerHTML = '<div class="search-status">No results found</div>';
            } else {
                const warning = document.createElement('div');
                warning.className = 'search-results-warning';
                warning.style.cssText = 'text-align: center; font-size: 10px; opacity: 0.5; padding: 12px; color: var(--theme-font-color, inherit); font-style: italic; border-top: 1px solid rgba(128, 128, 128, 0.15);';
                warning.textContent = 'Search results are provided by a third-party service.';
                container.appendChild(warning);
            }
            container.classList.add('visible');
        }

        let searchTimeout = null;

        document.addEventListener('DOMContentLoaded', () => {
            // Intercept OAuth Tab parameters for full-screen tab auth handling
            const urlParams = new URLSearchParams(window.location.search);
            const authTrigger = urlParams.get('auth_trigger');
            const authStatus = urlParams.get('auth');

            if (authTrigger) {
                console.log(`🚀 [OAuth] Initiating ${authTrigger} OAuth session in new tab...`);
                if (window.appwriteService) {
                    window.appwriteService.init().then(() => {
                        if (window.settingsSyncEngine) {
                            window.settingsSyncEngine.login(authTrigger);
                        }
                    });
                }
                document.body.innerHTML = `
                    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #1c1c1c; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; overflow: hidden; user-select: none;">
                        <div class="loader-spinner" style="width: 40px; height: 40px; border: 3px solid rgba(255, 255, 255, 0.07); border-top-color: var(--theme-accent-color, #38b3ff); border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 24px;"></div>
                        <h1 style="font-size: 20px; font-weight: 600; margin: 0 0 10px 0; letter-spacing: -0.5px;">Connecting to ${authTrigger.charAt(0).toUpperCase() + authTrigger.slice(1)}...</h1>
                        <p style="font-size: 13px; color: #888; margin: 0;">Please follow the prompts in the popup window to link your workspace.</p>
                        <style>
                            @keyframes spin { to { transform: rotate(360deg); } }
                        </style>
                    </div>
                `;
                return;
            }

            if (authStatus) {
                // Broadcast success notification to all other extension windows (like the sidepanel)
                chrome.runtime.sendMessage({ type: "AUTH_SUCCESS" });
                
                if (authStatus === 'success') {
                    console.log("✅ [OAuth] Connected successfully!");
                    document.body.innerHTML = `
                        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #1c1c1c; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; overflow: hidden; user-select: none;">
                            <div style="font-size: 48px; margin-bottom: 20px; animation: bounce 1s cubic-bezier(0.25, 1, 0.5, 1);">🎉</div>
                            <h1 style="font-size: 20px; font-weight: 600; margin: 0 0 10px 0; color: #2ecc71; letter-spacing: -0.5px;">Connected Successfully!</h1>
                            <p style="font-size: 13px; color: #aaa; margin: 0 0 24px 0;">Your sidebar settings are now fully synchronized.</p>
                            <p style="font-size: 11px; color: #555; margin: 0;">This window will close automatically...</p>
                        </div>
                    `;
                    setTimeout(() => { window.close(); }, 2000);
                } else {
                    console.log("❌ [OAuth] Connection failed.");
                    document.body.innerHTML = `
                        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; background: #1c1c1c; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; overflow: hidden; user-select: none;">
                            <div style="font-size: 48px; margin-bottom: 20px;">⚠️</div>
                            <h1 style="font-size: 20px; font-weight: 600; margin: 0 0 10px 0; color: #e74c3c; letter-spacing: -0.5px;">Connection Failed</h1>
                            <p style="font-size: 13px; color: #aaa; margin: 0 0 24px 0;">Something went wrong during sign-in. Please try again.</p>
                            <p style="font-size: 11px; color: #555; margin: 0;">This window will close automatically...</p>
                        </div>
                    `;
                    setTimeout(() => { window.close(); }, 3000);
                }
                return;
            }

            const backBtn = document.getElementById('add-page-back-btn');
            if (backBtn) {
                backBtn.onclick = () => {
                    chrome.storage.local.set({ [STORAGE_KEYS.IS_ADD_PAGE_OPEN]: false });
                };
            }

            const searchInput = document.getElementById('site-search-input');
            if (searchInput) {
                searchInput.oninput = (e) => {
                    clearTimeout(searchTimeout);
                    const query = e.target.value.trim();
                    searchTimeout = setTimeout(() => {
                        renderSearchResults(query);
                    }, 300);
                };
                searchInput.onblur = () => {
                    setTimeout(() => {
                        const container = document.getElementById('search-results');
                        if (container) container.classList.remove('visible');
                    }, 150);
                };
                searchInput.onfocus = () => {
                    if (searchInput.value.trim().length >= 2) {
                        const container = document.getElementById('search-results');
                        if (container && container.children.length) container.classList.add('visible');
                    }
                };
            }
        });

        function updateSettingsUI() {
            const theme = state.customTheme || {};
            const fields = [
                { input: 'theme-font-color', hex: 'hex-font-color', fallback: '#ffffff' },
                { input: 'theme-sidebar-bg', hex: 'hex-sidebar-bg', fallback: '#38393c' },
                { input: 'theme-divider-bg', hex: 'hex-divider-bg', fallback: '#555555' },
                { input: 'theme-accent-color', hex: 'hex-accent-color', fallback: '#38b3ff' },
                { input: 'theme-midtone-color', hex: 'hex-midtone-color', fallback: '#a4a4a4' }
            ];

            const themeKey = { 
                'theme-font-color': 'fontColor', 
                'theme-sidebar-bg': 'sidebarBackground', 
                'theme-divider-bg': 'dividerBackground', 
                'theme-accent-color': 'accentColor',
                'theme-midtone-color': 'midtoneColor'
            };

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

            const autoInp = document.getElementById('settings-autohide-blocklist');
            if (autoInp && document.activeElement !== autoInp) {
                autoInp.value = (state.autoHideBlocklist || []).join('\n');
            }

            const addBtn = document.getElementById('add-to-blocklist-btn');
            if (addBtn) {
                chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
                    const tab = tabs[0];
                    if (tab && tab.url && tab.url.startsWith('http')) {
                        const hostname = new URL(tab.url).hostname;
                        const currentList = state.scrollBlocklist || [];
                        addBtn.textContent = SR.isBlocklistedDomain(hostname, currentList)
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
                        sideBtn.textContent = SR.isBlocklistedDomain(hostname, currentList)
                            ? 'Remove Current Site from Blocklist'
                            : 'Add Current Site to Blocklist';
                    }
                });
            }

            const autoBtn = document.getElementById('add-to-autohide-blocklist-btn');
            if (autoBtn) {
                chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
                    const tab = tabs[0];
                    if (tab && tab.url && tab.url.startsWith('http')) {
                        const hostname = new URL(tab.url).hostname;
                        const currentList = state.autoHideBlocklist || [];
                        autoBtn.textContent = SR.isBlocklistedDomain(hostname, currentList)
                            ? 'Remove Current Site from Blocklist'
                            : 'Add Current Site to Blocklist';
                    }
                });
            }

            const autoHideChk = document.getElementById('settings-auto-hide');
            if (autoHideChk) autoHideChk.checked = state.autoHideEnabled;

            const showCatChk = document.getElementById('settings-show-category-drag');
            if (showCatChk) showCatChk.checked = state.showCategoryIcons;

            const taperChk = document.getElementById('settings-enable-taper');
            if (taperChk) taperChk.checked = state.enableTaper;

            // Background Image and Sizing
            const bgImage = theme.backgroundImage || '';
            const bgImageSize = theme.backgroundImageSize || 'fill';
            
            const clearBtn = document.getElementById('theme-bg-image-clear-btn');
            const previewContainer = document.getElementById('theme-bg-image-preview-container');
            const previewImg = document.getElementById('theme-bg-image-preview');
            const imageNameText = document.getElementById('theme-bg-image-name');
            const sizeSelect = document.getElementById('theme-bg-image-size');
            const urlInput = document.getElementById('theme-bg-image-url');
            
            if (sizeSelect) sizeSelect.value = bgImageSize;
            if (urlInput && document.activeElement !== urlInput) urlInput.value = bgImage;
            
            if (bgImage) {
                if (previewImg) {
                    previewImg.src = bgImage;
                    previewImg.dataset.bgData = bgImage;
                }
                if (imageNameText) {
                    imageNameText.textContent = bgImage.startsWith('data:') ? 'Local Selected File' : bgImage;
                }
                if (previewContainer) previewContainer.style.display = 'flex';
                if (clearBtn) clearBtn.style.display = 'block';
            } else {
                if (previewImg) {
                    previewImg.removeAttribute('src');
                    delete previewImg.dataset.bgData;
                }
                if (imageNameText) imageNameText.textContent = '';
                if (previewContainer) previewContainer.style.display = 'none';
                if (clearBtn) clearBtn.style.display = 'none';
            }

            // Background Padding and Roundness
            const paddingSlider = document.getElementById('theme-panel-padding');
            const paddingVal = document.getElementById('val-panel-padding');
            const padding = theme.panelPadding !== undefined ? theme.panelPadding : 0;
            if (paddingSlider) paddingSlider.value = padding;
            if (paddingVal) paddingVal.textContent = padding + 'px';

            const roundnessSlider = document.getElementById('theme-panel-roundness');
            const roundnessVal = document.getElementById('val-panel-roundness');
            const roundness = theme.panelRoundness !== undefined ? theme.panelRoundness : 0;
            if (roundnessSlider) roundnessSlider.value = roundness;
            if (roundnessVal) roundnessVal.textContent = roundness + 'px';

            // Update progress fills on all range sliders
            const sliders = document.querySelectorAll('.theme-slider-wrapper input[type="range"]');
            sliders.forEach(s => updateSliderProgress(s));
        }

        document.getElementById('settings-panel').addEventListener('click', (e) => {
            const header = e.target.closest('.settings-category-header.collapsible');
            if (!header) return;
            const targetId = header.dataset.target;
            header.classList.toggle('collapsed');
            state.collapsedSections[targetId] = header.classList.contains('collapsed');
            localStorage.setItem('collapsedSections', JSON.stringify(state.collapsedSections));
        });

        fetch(chrome.runtime.getURL('assets/close_icon.svg'))
            .then(r => r.text())
            .then(svg => {
                const btn = document.getElementById('settings-back-btn');
                if (btn) btn.innerHTML = svg;
                const tsBtn = document.getElementById('theme-store-back-btn');
                if (tsBtn) tsBtn.innerHTML = svg;
            });

        document.getElementById('settings-back-btn').addEventListener('click', () => {
            if (window.settingsSyncEngine) {
                window.settingsSyncEngine.flushPendingSync();
            }
            chrome.storage.local.set({ [STORAGE_KEYS.IS_SETTINGS_OPEN]: false, [STORAGE_KEYS.IS_ADD_PAGE_OPEN]: false, [STORAGE_KEYS.IS_THEME_STORE_OPEN]: false });
        });

        const tsBackBtn = document.getElementById('theme-store-back-btn');
        if (tsBackBtn) {
            tsBackBtn.addEventListener('click', () => {
                chrome.storage.local.set({ [STORAGE_KEYS.IS_THEME_STORE_OPEN]: false });
            });
        }

        function updateSliderProgress(slider) {
            if (!slider) return;
            const min = parseFloat(slider.min) || 0;
            const max = parseFloat(slider.max) || 100;
            const val = parseFloat(slider.value) || 0;
            const pct = (val - min) / (max - min) * 100;
            slider.style.background = `linear-gradient(to right, var(--theme-accent-color, #38b3ff) 0%, var(--theme-accent-color, #38b3ff) ${pct}%, var(--theme-divider-bg, rgba(0, 0, 0, 0.15)) ${pct}%, var(--theme-divider-bg, rgba(0, 0, 0, 0.15)) 100%)`;
        }

        function debounceThemeUpdate() {
            const opacitySlider = document.getElementById('theme-panel-opacity');
            const blurSlider = document.getElementById('theme-panel-blur');
            const sizeSelect = document.getElementById('theme-bg-image-size');
            const urlInput = document.getElementById('theme-bg-image-url');
            const bgImgData = urlInput ? urlInput.value.trim() : '';
            const paddingSlider = document.getElementById('theme-panel-padding');
            const roundnessSlider = document.getElementById('theme-panel-roundness');

            const newTheme = {
                fontColor: document.getElementById('theme-font-color').value,
                sidebarBackground: document.getElementById('theme-sidebar-bg').value,
                dividerBackground: document.getElementById('theme-divider-bg').value,
                accentColor: document.getElementById('theme-accent-color').value,
                midtoneColor: document.getElementById('theme-midtone-color').value,
                panelOpacity: opacitySlider ? parseFloat(opacitySlider.value) : 1,
                panelBlur: blurSlider ? parseInt(blurSlider.value, 10) : 0,
                backgroundImage: bgImgData,
                backgroundImageSize: sizeSelect ? sizeSelect.value : 'fill',
                panelPadding: paddingSlider ? parseInt(paddingSlider.value, 10) : 0,
                panelRoundness: roundnessSlider ? parseInt(roundnessSlider.value, 10) : 0
            };
            chrome.storage.local.set({ [STORAGE_KEYS.CUSTOM_THEME]: newTheme });

            const sliders = document.querySelectorAll('.theme-slider-wrapper input[type="range"]');
            sliders.forEach(s => updateSliderProgress(s));
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
            { input: 'theme-accent-color', hex: 'hex-accent-color' },
            { input: 'theme-midtone-color', hex: 'hex-midtone-color' }
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

        // Background Image Event Listeners
        const fileInput = document.getElementById('theme-bg-image-file');
        const uploadBtn = document.getElementById('theme-bg-image-upload-btn');
        const clearBtn = document.getElementById('theme-bg-image-clear-btn');
        const previewContainer = document.getElementById('theme-bg-image-preview-container');
        const previewImg = document.getElementById('theme-bg-image-preview');
        const imageNameText = document.getElementById('theme-bg-image-name');
        const sizeSelect = document.getElementById('theme-bg-image-size');
        const urlInput = document.getElementById('theme-bg-image-url');

        if (uploadBtn && fileInput) {
            uploadBtn.addEventListener('click', () => fileInput.click());
        }

        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (evt) => {
                    const dataUrl = evt.target.result;
                    if (urlInput) urlInput.value = dataUrl;
                    if (previewImg) {
                        previewImg.src = dataUrl;
                        previewImg.dataset.bgData = dataUrl;
                    }
                    if (imageNameText) imageNameText.textContent = file.name;
                    if (previewContainer) previewContainer.style.display = 'flex';
                    if (clearBtn) clearBtn.style.display = 'block';
                    debounceThemeUpdate();
                };
                reader.readAsDataURL(file);
            });
        }

        if (urlInput) {
            urlInput.addEventListener('input', () => {
                const val = urlInput.value.trim();
                if (previewImg) {
                    if (val) {
                        previewImg.src = val;
                        previewImg.dataset.bgData = val;
                    } else {
                        previewImg.removeAttribute('src');
                        delete previewImg.dataset.bgData;
                    }
                }
                if (imageNameText) {
                    imageNameText.textContent = val.startsWith('data:') ? 'Local Selected File' : val;
                }
                if (previewContainer) {
                    previewContainer.style.display = val ? 'flex' : 'none';
                }
                if (clearBtn) {
                    clearBtn.style.display = val ? 'block' : 'none';
                }
                debounceThemeUpdate();
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                if (fileInput) fileInput.value = '';
                if (urlInput) urlInput.value = '';
                if (previewImg) {
                    previewImg.removeAttribute('src');
                    delete previewImg.dataset.bgData;
                }
                if (imageNameText) imageNameText.textContent = '';
                if (previewContainer) previewContainer.style.display = 'none';
                if (clearBtn) clearBtn.style.display = 'none';
                debounceThemeUpdate();
            });
        }

        if (sizeSelect) {
            sizeSelect.addEventListener('change', () => {
                debounceThemeUpdate();
            });
        }

        const paddingInput = document.getElementById('theme-panel-padding');
        if (paddingInput) {
            paddingInput.addEventListener('input', (e) => {
                const val = document.getElementById('val-panel-padding');
                if (val) val.textContent = e.target.value + 'px';
                debounceThemeUpdate();
            });
        }

        const roundnessInput = document.getElementById('theme-panel-roundness');
        if (roundnessInput) {
            roundnessInput.addEventListener('input', (e) => {
                const val = document.getElementById('val-panel-roundness');
                if (val) val.textContent = e.target.value + 'px';
                debounceThemeUpdate();
            });
        }

        document.getElementById('settings-auto-hide').addEventListener('change', (e) => {
            state.autoHideEnabled = e.target.checked;
            chrome.storage.local.set({ [STORAGE_KEYS.AUTO_HIDE_ENABLED]: state.autoHideEnabled });
        });

        document.getElementById('settings-show-category-drag').addEventListener('change', (e) => {
            state.showCategoryIcons = e.target.checked;
            chrome.storage.local.set({ [STORAGE_KEYS.SHOW_CATEGORY_ICONS]: state.showCategoryIcons });
        });

        document.getElementById('settings-enable-taper').addEventListener('change', (e) => {
            state.enableTaper = e.target.checked;
            chrome.storage.local.set({ [STORAGE_KEYS.ENABLE_TAPER]: state.enableTaper });
        });

        document.getElementById('settings-scroll-blocklist').addEventListener('input', (e) => {
            const list = e.target.value.split('\n').map(s => s.trim()).filter(s => s.length > 0);
            chrome.storage.local.set({ [STORAGE_KEYS.SCROLL_BLOCKLIST]: list });
        });

        document.getElementById('add-to-blocklist-btn').addEventListener('click', () => {
            chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
                const tab = tabs[0];
                if (tab && tab.url && tab.url.startsWith('http')) {
                    const hostname = new URL(tab.url).hostname;
                    const currentList = state.scrollBlocklist || [];
                    if (!SR.isBlocklistedDomain(hostname, currentList)) {
                        chrome.storage.local.set({ [STORAGE_KEYS.SCROLL_BLOCKLIST]: [...currentList, hostname] });
                    } else {
                        chrome.storage.local.set({ [STORAGE_KEYS.SCROLL_BLOCKLIST]: currentList.filter(d => d !== hostname) });
                    }
                }
            });
        });

        document.getElementById('settings-sidepanel-blocklist').addEventListener('input', (e) => {
            const list = e.target.value.split('\n').map(s => s.trim()).filter(s => s.length > 0);
            chrome.storage.local.set({ [STORAGE_KEYS.SIDEPANEL_BLOCKLIST]: list });
        });

        document.getElementById('add-to-sidepanel-blocklist-btn').addEventListener('click', () => {
            chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
                const tab = tabs[0];
                if (tab && tab.url && tab.url.startsWith('http')) {
                    const hostname = new URL(tab.url).hostname;
                    const currentList = state.sidepanelBlocklist || [];
                    if (!SR.isBlocklistedDomain(hostname, currentList)) {
                        chrome.storage.local.set({ [STORAGE_KEYS.SIDEPANEL_BLOCKLIST]: [...currentList, hostname] });
                    } else {
                        chrome.storage.local.set({ [STORAGE_KEYS.SIDEPANEL_BLOCKLIST]: currentList.filter(d => d !== hostname) });
                    }
                }
            });
        });

        document.getElementById('settings-autohide-blocklist').addEventListener('input', (e) => {
            const list = e.target.value.split('\n').map(s => s.trim()).filter(s => s.length > 0);
            chrome.storage.local.set({ [STORAGE_KEYS.AUTOHIDE_BLOCKLIST]: list });
        });

        document.getElementById('add-to-autohide-blocklist-btn').addEventListener('click', () => {
            chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
                const tab = tabs[0];
                if (tab && tab.url && tab.url.startsWith('http')) {
                    const hostname = new URL(tab.url).hostname;
                    const currentList = state.autoHideBlocklist || [];
                    if (!SR.isBlocklistedDomain(hostname, currentList)) {
                        chrome.storage.local.set({ [STORAGE_KEYS.AUTOHIDE_BLOCKLIST]: [...currentList, hostname] });
                    } else {
                        chrome.storage.local.set({ [STORAGE_KEYS.AUTOHIDE_BLOCKLIST]: currentList.filter(d => d !== hostname) });
                    }
                }
            });
        });

        const exportThemeBtn = document.getElementById('export-theme-btn');
        if (exportThemeBtn) {
            exportThemeBtn.addEventListener('click', () => {
                const themeStr = JSON.stringify(state.customTheme || {}, null, 2);
                const blob = new Blob([themeStr], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = "sidebar_theme.json";
                a.click();
                URL.revokeObjectURL(url);
            });
        }

        const importThemeBtn = document.getElementById('import-theme-btn');
        if (importThemeBtn) {
            importThemeBtn.addEventListener('click', () => {
                const fileInput = document.getElementById('import-theme-file');
                if (fileInput) fileInput.click();
            });
        }

        const importThemeFile = document.getElementById('import-theme-file');
        if (importThemeFile) {
            importThemeFile.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    try {
                        const parsed = JSON.parse(ev.target.result);
                        chrome.storage.local.set({ [STORAGE_KEYS.CUSTOM_THEME]: parsed });
                    } catch (err) {
                        alert("Invalid Theme JSON");
                    }
                };
                reader.readAsText(file);
            });
        }

        const resetThemeBtn = document.getElementById('reset-theme-btn');
        if (resetThemeBtn) {
            resetThemeBtn.addEventListener('click', () => {
                chrome.storage.local.set({ [STORAGE_KEYS.CUSTOM_THEME]: getThemeDefaults() });
            });
        }

        function renderMostVisited() {
            const list = document.getElementById('most-visited-list');
            if (!list) return;

            chrome.topSites.get((topSites) => {
                if (!topSites || topSites.length === 0) {
                    list.innerHTML = '<div class="search-status">No frequent sites found</div>';
                    return;
                }
                list.innerHTML = '';
                topSites.slice(0, 10).forEach(site => {
                    const item = document.createElement('div');
                    item.className = 'search-result-item'; 
                    const faviconUrl = `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(site.url)}`;
                    const displayTitle = site.title || new URL(site.url).hostname.replace('www.', '');

                    item.innerHTML = `
                        <img src="${faviconUrl}" alt="" />
                        <div style="display:flex; flex-direction:column; min-width:0; flex:1;">
                            <span class="result-title" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${displayTitle}</span>
                            <span class="result-domain" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:11px; opacity:0.7;">${site.url}</span>
                        </div>
                        <div class="result-add-btn"></div>
                    `;
                    const addBtn = item.querySelector('.result-add-btn');
                    addBtn.innerHTML = SR.ADD_ICON_SVG;

                    item.onclick = () => {
                        const newSite = {
                            id: 'site-' + Date.now() + Math.random().toString(36).substr(2, 5),
                            title: displayTitle,
                            url: site.url,
                            faviconUrl,
                            initial: displayTitle.charAt(0).toUpperCase()
                        };
                        chrome.storage.local.set({ [STORAGE_KEYS.SITES]: [...state.sites, newSite] });
                    };
                    list.appendChild(item);
                });
            });
        }

        // Debug Action Listeners
        const resyncBtn = document.getElementById('debug-resync-btn');
        if (resyncBtn) {
            resyncBtn.addEventListener('click', async () => {
                if (window.settingsSyncEngine && window.settingsSyncEngine.getCurrentUser()) {
                    resyncBtn.disabled = true;
                    resyncBtn.textContent = 'Syncing...';
                    try {
                        await window.settingsSyncEngine.triggerForceSync();
                        alert("Workspace successfully synchronized with the cloud.");
                    } catch (err) {
                        alert("Resync failed: " + err.message);
                    } finally {
                        resyncBtn.disabled = false;
                        resyncBtn.textContent = 'Resync';
                    }
                } else {
                    alert("Resync requires a connected account. Please sign up or log in first.");
                }
            });
        }

        const debugResetThemeBtn = document.getElementById('debug-reset-theme-btn');
        if (debugResetThemeBtn) {
            debugResetThemeBtn.addEventListener('click', () => {
                if (confirm("Reset current theme settings to defaults?")) {
                    chrome.storage.local.set({ [STORAGE_KEYS.CUSTOM_THEME]: getThemeDefaults() }, () => {
                        window.location.reload();
                    });
                }
            });
        }

        const clearCacheBtn = document.getElementById('debug-clear-cache-btn');
        if (clearCacheBtn) {
            clearCacheBtn.addEventListener('click', () => {
                chrome.storage.local.remove(['community_theme_catalog', 'last_catalog_fetch'], () => {
                    alert("Local database cache cleared successfully.");
                });
            });
        }

        const exportAllBtn = document.getElementById('export-all-btn');
        if (exportAllBtn) {
            exportAllBtn.addEventListener('click', () => {
                chrome.storage.local.get(null, (allData) => {
                    const dataStr = JSON.stringify(allData, null, 2);
                    const blob = new Blob([dataStr], { type: "application/json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = "sidebar_backup.json";
                    a.click();
                    URL.revokeObjectURL(url);
                });
            });
        }

        const importAllBtn = document.getElementById('import-all-btn');
        if (importAllBtn) {
            importAllBtn.addEventListener('click', () => {
                const fileInput = document.getElementById('import-all-file');
                if (fileInput) fileInput.click();
            });
        }

        const importAllFile = document.getElementById('import-all-file');
        if (importAllFile) {
            importAllFile.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                    try {
                        const parsed = JSON.parse(ev.target.result);
                        chrome.storage.local.set(parsed, () => {
                            window.location.reload();
                        });
                    } catch (err) {
                        alert("Invalid Backup JSON");
                    }
                };
                reader.readAsText(file);
            });
        }

        const clearAllDataBtn = document.getElementById('clear-all-data-btn');
        if (clearAllDataBtn) {
            clearAllDataBtn.addEventListener('click', () => {
                if (confirm("Are you sure you want to clear ALL data? This will reset your pinned sites, theme, and all settings. This action cannot be undone.")) {
                    chrome.storage.local.clear(() => {
                        window.location.reload();
                    });
                }
            });
        }

        // Initialize Appwrite Cloud Sync Engine if present
        if (window.settingsSyncEngine) {
            window.settingsSyncEngine.init((user) => {
                updateSyncUI(user);
            });
        }

        // Listen for Auth success notifications from the OAuth login tab
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            if (message && message.type === "AUTH_SUCCESS") {
                console.log("🔔 [OAuth] Received AUTH_SUCCESS broadcast from login tab. Re-syncing status...");
                if (window.appwriteService) {
                    window.appwriteService.resolveUserSession().then(() => {
                        const currentUser = window.appwriteService.currentUser;
                        if (window.settingsSyncEngine) {
                            window.settingsSyncEngine.onUserStatusChangedCallback && 
                            window.settingsSyncEngine.onUserStatusChangedCallback(currentUser);

                            // Activate synchronization and download cloud settings immediately!
                            window.settingsSyncEngine.activateSyncForUser();
                        }
                        updateSyncUI(currentUser);
                    });
                }
            }
        });

        // Helper to escape HTML tags to prevent cross-site scripting in theme cards
        function escapeHTML(str) {
            if (!str) return '';
            return str.replace(/[&<>'"]/g, 
                tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
            );
        }

        // Account Profile Update Logic
        function updateSyncUI(user) {
            const guestView = document.getElementById('sync-guest-view');
            const userView = document.getElementById('sync-user-view');
            const avatarImg = document.getElementById('sync-user-avatar');
            const nameInput = document.getElementById('sync-user-name-input');
            const emailSpan = document.getElementById('sync-user-email');
            const storePublishContainer = document.getElementById('store-publish-container');
            const storePublishGuestMsg = document.getElementById('store-publish-guest-msg');
            const logoutBtn = document.getElementById('sync-logout-btn');

            if (user) {
                if (guestView) guestView.style.display = 'none';
                if (userView) userView.style.display = 'block';
                
                const profile = user.profile || {};
                if (avatarImg) {
                    avatarImg.src = profile.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(user.$id)}`;
                }
                if (nameInput) {
                    nameInput.value = profile.displayName || user.name || 'Connected User';
                }
                if (emailSpan) emailSpan.textContent = user.email || '';
                if (storePublishContainer) storePublishContainer.style.display = 'block';
                if (storePublishGuestMsg) storePublishGuestMsg.style.display = 'none';
                if (logoutBtn) logoutBtn.style.display = 'inline-block';
            } else {
                if (guestView) guestView.style.display = 'block';
                if (userView) userView.style.display = 'none';
                if (storePublishContainer) storePublishContainer.style.display = 'none';
                if (storePublishGuestMsg) storePublishGuestMsg.style.display = 'block';
                if (logoutBtn) logoutBtn.style.display = 'none';
            }
        }

        // Helper to format and display friendly relative time for last backup timestamp
        function updateLastSyncRelativeTime() {
            const lastSyncSpan = document.getElementById('sync-last-timestamp');
            if (!lastSyncSpan) return;
            chrome.storage.local.get(['settings_last_synced'], (res) => {
                const ts = res.settings_last_synced;
                if (!ts) {
                    lastSyncSpan.textContent = 'Never';
                    return;
                }
                const now = Date.now();
                const diffMs = now - new Date(ts).getTime();
                if (diffMs < 0) {
                    lastSyncSpan.textContent = 'Just now';
                    return;
                }
                const diffSecs = Math.floor(diffMs / 1000);
                if (diffSecs < 10) {
                    lastSyncSpan.textContent = 'Just now';
                    return;
                }
                if (diffSecs < 60) {
                    lastSyncSpan.textContent = `${diffSecs} seconds ago`;
                    return;
                }
                const diffMins = Math.floor(diffSecs / 60);
                if (diffMins < 60) {
                    lastSyncSpan.textContent = diffMins === 1 ? '1 minute ago' : `${diffMins} minutes ago`;
                    return;
                }
                const diffHours = Math.floor(diffMins / 60);
                if (diffHours < 24) {
                    lastSyncSpan.textContent = diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
                    return;
                }
                const diffDays = Math.floor(diffHours / 24);
                if (diffDays < 7) {
                    lastSyncSpan.textContent = diffDays === 1 ? 'Yesterday' : `${diffDays} days ago`;
                    return;
                }
                lastSyncSpan.textContent = new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
            });
        }

        // Binds Premium Inline Username Editor with Debounced Cloud Saving
        const nameInput = document.getElementById('sync-user-name-input');
        let usernameDebounceTimeout = null;

        async function saveUsernameToServer(newName) {
            try {
                const client = window.appwriteService;
                if (!client || !client.currentUser) return;
                const avatarUrl = client.currentUser.profile?.avatarUrl || '';
                
                console.log("💾 [AppwriteService] Updating username to:", newName);
                await client.updateUserProfile(newName, avatarUrl);
                console.log("✔ [AppwriteService] Username updated successfully!");
            } catch (err) {
                console.error("❌ [AppwriteService] Failed to update username on server:", err);
            }
        }

        if (nameInput) {
            nameInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    nameInput.blur(); // Triggers the blur event to save and exit edit focus
                }
            });

            nameInput.addEventListener('blur', () => {
                const newName = nameInput.value.trim();
                const client = window.appwriteService;
                
                if (!newName) {
                    // Revert to original username if they clear it
                    nameInput.value = client.currentUser?.profile?.displayName || client.currentUser?.name || 'Connected User';
                    return;
                }

                // Debounce saving to the cloud to prevent overwhelming the server with frequent API hits
                if (usernameDebounceTimeout) {
                    clearTimeout(usernameDebounceTimeout);
                }

                usernameDebounceTimeout = setTimeout(() => {
                    saveUsernameToServer(newName);
                }, 1000); // 1.0 second debounce delay
            });
        }

        // Binds Custom Image File Upload for Avatar
        const avatarFileInput = document.getElementById('avatar-file-input');
        if (avatarFileInput) {
            avatarFileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                if (!file.type.startsWith('image/')) {
                    alert('Please select an image file.');
                    return;
                }

                const avatarImg = document.getElementById('sync-user-avatar');
                if (avatarImg) {
                    avatarImg.style.opacity = '0.5';
                }

                try {
                    const client = window.appwriteService;
                    // Reuse the existing asset upload bucket
                    const fileId = await client.uploadThemePreview(file);
                    const customAvatarUrl = client.getThemePreviewUrl(fileId);
                    const currentName = client.currentUser.profile?.displayName || client.currentUser.name || 'Connected User';
                    
                    await client.updateUserProfile(currentName, customAvatarUrl);
                    
                    if (avatarImg) {
                        avatarImg.src = customAvatarUrl;
                    }
                    alert('Custom profile picture uploaded successfully!');
                } catch (err) {
                    console.error(err);
                    alert('Failed to upload custom profile picture: ' + err.message);
                } finally {
                    if (avatarImg) {
                        avatarImg.style.opacity = '1';
                    }
                }
            });
        }

        // Trigger Sync Provider Redirects
        const googleBtn = document.getElementById('sync-google-btn');
        if (googleBtn) {
            googleBtn.addEventListener('click', () => {
                console.log("👉 [OAuth] Opening Google sign-in in a new tab.");
                chrome.tabs.create({ url: chrome.runtime.getURL("sidepanel.html?auth_trigger=google") });
            });
        }

        const microsoftBtn = document.getElementById('sync-microsoft-btn');
        if (microsoftBtn) {
            microsoftBtn.addEventListener('click', () => {
                console.log("👉 [OAuth] Opening Microsoft sign-in in a new tab.");
                chrome.tabs.create({ url: chrome.runtime.getURL("sidepanel.html?auth_trigger=microsoft") });
            });
        }

        const logoutBtn = document.getElementById('sync-logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                if (window.settingsSyncEngine) {
                    window.settingsSyncEngine.logout();
                }
            });
        }

        // Theme Store Catalog Management
        let currentThemeStoreFilter = 'popular';
        let themeStoreSearchQuery = '';

        window.loadThemeStoreCatalog = async function() {
            const grid = document.getElementById('theme-store-grid');
            if (!grid) return;
            grid.innerHTML = '<div class="theme-store-loader">Loading community catalog...</div>';

            try {
                const client = window.appwriteService;
                if (!client) {
                    grid.innerHTML = '<div class="theme-store-loader">Sync Service Uninitialized</div>';
                    return;
                }

                const themes = await client.listThemes(currentThemeStoreFilter, themeStoreSearchQuery);
                grid.innerHTML = '';
                
                if (themes.length === 0) {
                    grid.innerHTML = '<div class="theme-store-loader">No themes found matching your search.</div>';
                    return;
                }

                themes.forEach(themeDoc => {
                    let customData = {};
                    try {
                        customData = JSON.parse(themeDoc.themeData);
                    } catch (e) {
                        console.error("Invalid themeDoc.themeData JSON", themeDoc.themeData);
                    }

                    const card = document.createElement('div');
                    card.className = 'theme-card';
                    
                    const pFont = customData.fontColor || '#ffffff';
                    const pBg = customData.sidebarBackground || '#333333';
                    const pAcc = customData.accentColor || '#38b3ff';
                    const pMid = customData.midtoneColor || '#a4a4a4';

                    card.innerHTML = `
                        <div class="theme-card-header">
                            <div class="theme-card-title-box">
                                <span class="theme-card-title">${escapeHTML(themeDoc.name || 'Unnamed Theme')}</span>
                                <span class="theme-card-author">by ${escapeHTML(themeDoc.authorName || 'Anonymous')}</span>
                            </div>
                        </div>
                        <p class="theme-card-desc">${escapeHTML(themeDoc.description || 'No description provided.')}</p>
                        <div class="theme-card-preview">
                            <div class="preview-swatch" style="background: ${pBg}" title="Background"></div>
                            <div class="preview-swatch" style="background: ${pFont}" title="Font Color"></div>
                            <div class="preview-swatch" style="background: ${pAcc}" title="Accent"></div>
                            <div class="preview-swatch" style="background: ${pMid}" title="Muted Accent"></div>
                        </div>
                        <div class="theme-card-footer">
                            <div class="theme-stats">
                                <span class="stat-item stat-icon-like" id="like-count-${themeDoc.$id}">${themeDoc.likesCount || 0}</span>
                                <span class="stat-item stat-icon-dl" id="dl-count-${themeDoc.$id}">${themeDoc.downloadsCount || 0}</span>
                            </div>
                            <div class="theme-card-actions">
                                <button class="like-btn" data-id="${themeDoc.$id}">Like</button>
                                <button class="install-btn" data-id="${themeDoc.$id}">Install</button>
                            </div>
                        </div>
                    `;

                    const likeBtn = card.querySelector('.like-btn');
                    const installBtn = card.querySelector('.install-btn');

                    likeBtn.onclick = async () => {
                        const currentUser = window.settingsSyncEngine.getCurrentUser();
                        if (!currentUser) {
                            alert('Please link your Google or Microsoft account in the Cloud Sync section to upvote themes!');
                            return;
                        }
                        try {
                            likeBtn.disabled = true;
                            const res = await client.likeTheme(themeDoc.$id, currentUser.id);
                            if (res) {
                                const countSpan = document.getElementById(`like-count-${themeDoc.$id}`);
                                if (countSpan) {
                                    const currentLikes = parseInt(countSpan.textContent, 10) || 0;
                                    countSpan.textContent = currentLikes + 1;
                                }
                            }
                        } catch (err) {
                            alert(err.message || 'Already upvoted this theme!');
                        } finally {
                            likeBtn.disabled = false;
                        }
                    };

                    installBtn.onclick = async () => {
                        if (confirm(`Do you want to install and apply "${themeDoc.name}"? This will overwrite your current custom theme colors.`)) {
                            try {
                                installBtn.disabled = true;
                                installBtn.textContent = 'Applying...';
                                
                                chrome.storage.local.set({ [STORAGE_KEYS.CUSTOM_THEME]: customData });
                                
                                await client.incrementDownloadCount(themeDoc.$id);
                                const countSpan = document.getElementById(`dl-count-${themeDoc.$id}`);
                                if (countSpan) {
                                    const currentDl = parseInt(countSpan.textContent, 10) || 0;
                                    countSpan.textContent = currentDl + 1;
                                }
                            } catch (err) {
                                console.error(err);
                            } finally {
                                installBtn.disabled = false;
                                installBtn.textContent = 'Install';
                            }
                        }
                    };

                    grid.appendChild(card);
                });
            } catch (err) {
                console.error(err);
                grid.innerHTML = `<div class="theme-store-loader error">Error: ${escapeHTML(err.message)}</div>`;
            }
        };

        // Theme Store Controls binding
        const tabPopular = document.getElementById('tab-store-popular');
        const tabNewest = document.getElementById('tab-store-newest');
        const storeSearchInput = document.getElementById('store-search-input');
        const storeSearchBtn = document.getElementById('store-search-btn');

        if (tabPopular) {
            tabPopular.onclick = () => {
                tabPopular.classList.add('active');
                tabNewest.classList.remove('active');
                currentThemeStoreFilter = 'popular';
                window.loadThemeStoreCatalog();
            };
        }

        if (tabNewest) {
            tabNewest.onclick = () => {
                tabNewest.classList.add('active');
                tabPopular.classList.remove('active');
                currentThemeStoreFilter = 'newest';
                window.loadThemeStoreCatalog();
            };
        }

        if (storeSearchBtn && storeSearchInput) {
            storeSearchBtn.onclick = () => {
                themeStoreSearchQuery = storeSearchInput.value.trim();
                window.loadThemeStoreCatalog();
            };
            storeSearchInput.onkeydown = (e) => {
                if (e.key === 'Enter') {
                    themeStoreSearchQuery = storeSearchInput.value.trim();
                    window.loadThemeStoreCatalog();
                }
            };
        }

        // Publish Theme Form binding
        const publishSubmit = document.getElementById('publish-theme-submit');
        const publishName = document.getElementById('publish-theme-name');
        const publishDesc = document.getElementById('publish-theme-desc');
        const publishStatus = document.getElementById('publish-theme-status');

        if (publishSubmit) {
            publishSubmit.onclick = async () => {
                const currentUser = window.settingsSyncEngine.getCurrentUser();
                if (!currentUser) {
                    alert('Please link your account above before publishing a custom theme!');
                    return;
                }

                const nameVal = publishName.value.trim();
                const descVal = publishDesc.value.trim();

                if (!nameVal) {
                    publishStatus.className = 'status-msg error';
                    publishStatus.textContent = 'Please enter a name!';
                    return;
                }

                publishSubmit.disabled = true;
                publishStatus.className = 'status-msg';
                publishStatus.textContent = 'Publishing...';

                try {
                    const client = window.appwriteService;
                    const themeData = state.customTheme || SR.getThemeDefaults();
                    
                    await client.publishTheme(nameVal, descVal, themeData, currentUser);
                    
                    publishStatus.className = 'status-msg success';
                    publishStatus.textContent = 'Successfully published!';
                    publishName.value = '';
                    publishDesc.value = '';
                    
                    window.loadThemeStoreCatalog();
                    setTimeout(() => { publishStatus.textContent = ''; }, 3000);
                } catch (err) {
                    publishStatus.className = 'status-msg error';
                    publishStatus.textContent = err.message || 'Error occurred!';
                } finally {
                    publishSubmit.disabled = false;
                }
            };
        }

        // Trigger loading theme catalog on load if the theme store section is already expanded
        if (!state.collapsedSections['theme-store-section']) {
            setTimeout(() => {
                window.loadThemeStoreCatalog();
            }, 500);
        }

    } else if (isContentScript) {
        // ============================================================
        // PART 5: In-Page Content Script (Active & Idle Sidebar)
        // ============================================================
        
        class BaseSidebar {
            constructor() {
                this.host = null;
                this.shadow = null;
                this.container = null;
                this.iconBar = null;
                this.lastRenderState = null;
            }

            applyTheme(theme) {
                const currentTheme = theme || SR.getThemeDefaults();
                if (this.host) SR.applyThemeStyles(this.host, currentTheme);
                if (this.container) SR.applyThemeStyles(this.container, currentTheme);
                return currentTheme;
            }

            destroyHost(hostId, styleId) {
                document.querySelectorAll(hostId).forEach(el => el.remove());
                document.querySelectorAll(styleId).forEach(el => el.remove());
            }
        }

        class ActiveSidebar extends BaseSidebar {
            constructor(signal) {
                super();
                this.signal = signal;
                this.contentArea = null;
                this.iframe = null;
                this.headerTitle = null;
                this.resizer = null;
                this.isResizing = false;
                this.autoHide = null;
                this.autoHideArmed = false;
            }

            init(state, renderCallback) {
                this.destroy();
                document.documentElement.setAttribute('data-revived-host', window.location.hostname);
                this.injectHostStyles();

                this.host = document.createElement('div');
                this.host.id = 'revived-edge-sidebar-host';
                SR.applyThemeStyles(this.host, SR.getThemeDefaults());
                this.host.style.position = 'fixed';
                this.host.style.top = '0';
                this.host.style.right = '0';
                this.host.style.width = '0';
                this.host.style.height = '100vh';
                this.host.style.zIndex = '2147483647';
                this.host.style.pointerEvents = 'none';
                this.host.style.visibility = 'hidden';

                this.shadow = this.host.attachShadow({ mode: 'closed' });

                this.container = document.createElement('div');
                this.container.id = 'revived-edge-sidebar-container';

                this.iconBar = document.createElement('div');
                this.iconBar.className = 'edge-sidebar-icon-bar';

                this.contentArea = document.createElement('div');
                this.contentArea.className = 'edge-sidebar-content-area';

                this.resizer = document.createElement('div');
                this.resizer.className = 'edge-sidebar-resizer';

                this.resizer.onmousedown = (e) => {
                    if (SR.isOrphaned()) return;
                    this.isResizing = true;
                    document.body.style.userSelect = 'none';
                    this.iframe.style.pointerEvents = 'none';
                };

                const header = document.createElement('div');
                header.className = 'edge-sidebar-header';

                this.headerTitle = document.createElement('div');
                this.headerTitle.className = 'edge-sidebar-header-title';
                this.headerTitle.innerText = "Sidebar";

                const closeBtn = document.createElement('div');
                closeBtn.className = 'edge-sidebar-header-close';
                closeBtn.innerText = "✕";
                closeBtn.onclick = () => {
                    if (SR.isOrphaned()) return;
                    SR.safeStorage.set({
                        [STORAGE_KEYS.ACTIVE_SITE_ID]: null,
                        [STORAGE_KEYS.ACTIVE_SITE_OWNER]: null
                    });
                };

                header.appendChild(this.headerTitle);
                header.appendChild(closeBtn);

                this.iframe = document.createElement('iframe');
                this.iframe.className = 'edge-sidebar-iframe';
                this.iframe.name = 'revived-sidebar-iframe';
                this.iframe.allow = "camera; microphone; geolocation; clipboard-read; clipboard-write; autoplay; fullscreen";

                this.contentArea.appendChild(this.resizer);
                this.contentArea.appendChild(header);
                this.contentArea.appendChild(this.iframe);

                this.container.appendChild(this.iconBar);
                this.container.appendChild(this.contentArea);
                this.shadow.appendChild(this.container);

                document.documentElement.appendChild(this.host);
                this.loadCSS();

                window.addEventListener('mousemove', (e) => {
                    if (!this.isResizing) return;
                    const newWidth = window.innerWidth - e.clientX - 48;
                    if (newWidth > 200 && newWidth < 800) {
                        this.contentArea.style.width = newWidth + 'px';
                    }
                }, { signal: this.signal });

                window.addEventListener('mouseup', async (e) => {
                    if (this.isResizing) {
                        this.isResizing = false;
                        document.body.style.userSelect = '';
                        this.iframe.style.pointerEvents = '';
                        const newWidth = window.innerWidth - e.clientX - 48;
                        if (newWidth > 200 && newWidth < 800) {
                            const totalWidth = newWidth + 48;
                            const prefs = await new Promise((resolve) => SR.safeStorage.get([STORAGE_KEYS.SITE_MODE_PREFS], resolve));
                            const sitePrefs = prefs.siteModePrefs || {};
                            const hostname = window.location.hostname;
                            if (sitePrefs[hostname] === 'overlay') {
                                document.documentElement.classList.remove('revived-sidebar-active');
                                document.documentElement.style.removeProperty('--revived-sidebar-width');
                            } else if (this.isSafeModeSite()) {
                                try {
                                    document.documentElement.classList.add('revived-sidebar-safe-mode');
                                    document.documentElement.classList.add('revived-sidebar-active');
                                    document.documentElement.style.setProperty('--revived-sidebar-width', totalWidth + 'px');
                                } catch (err) { }
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
                            SR.safeStorage.set({ [STORAGE_KEYS.SIDEBAR_WIDTH]: newWidth });
                        }
                    }
                }, { signal: this.signal });
            }

            isSafeModeSite() {
                const safeModeSites = ['google.com', 'bing.com', 'duckduckgo.com', 'baidu.com', 'yandex.ru'];
                return safeModeSites.some(s => window.location.hostname.includes(s));
            }

            injectHostStyles() {
                const style = document.createElement('style');
                style.id = 'revived-sidebar-host-styles';
                style.textContent = `
                    #revived-idle-sidebar-host {
                        display: none !important;
                    }
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

            loadCSS() {
                if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
                    const sharedLink = document.createElement('link');
                    sharedLink.rel = 'stylesheet';
                    sharedLink.href = chrome.runtime.getURL('sidepanel.css');
                    sharedLink.onload = () => {
                        if (this.host) {
                            this.host.style.visibility = 'visible';
                        }
                    };
                    sharedLink.onerror = () => {
                        if (this.host) {
                            this.host.style.visibility = 'visible';
                        }
                    };
                    this.shadow.appendChild(sharedLink);
                } else {
                    if (this.host) {
                        this.host.style.visibility = 'visible';
                    }
                }
            }

            getAutoHide(state, renderCallback, currentTheme) {
                if (!this.autoHide) {
                    this.autoHide = SR.createAutoHideManager({
                        onShowBar: renderCallback,
                        onHideBar: renderCallback,
                        getPanelWidth: () => 48 + (state.activeSiteId && state.activeSiteOwner === 'inpage' ? state.sidebarWidth : 0),
                        getAccentColor: () => currentTheme?.accentColor || '#38b3ff',
                        leaveThresholdOffset: 10
                    });
                }
                return this.autoHide;
            }

            async populateIcons(state, renderCallback) {
                const currentState = JSON.stringify({
                    sites: state.sites,
                    tempSites: state.tempSites,
                    activeSiteId: state.activeSiteId,
                    activeSiteOwner: state.activeSiteOwner
                });
                if (currentState === this.lastRenderState) return;
                this.lastRenderState = currentState;

                const options = SR.createIconBarOptions('active', state, {
                    onSiteClick: (siteId) => {
                        const newActiveId = (state.activeSiteId === siteId) ? null : siteId;
                        const newOwner = newActiveId ? 'inpage' : null;
                        state.activeSiteId = newActiveId;
                        state.activeSiteOwner = newOwner;
                        state.isSettingsOpen = false;
                        state.isAddPageOpen = false;
                        state.isThemeStoreOpen = false;
                        SR.safeStorage.set({
                            [STORAGE_KEYS.ACTIVE_SITE_ID]: newActiveId,
                            [STORAGE_KEYS.ACTIVE_SITE_OWNER]: newOwner,
                            [STORAGE_KEYS.IS_SETTINGS_OPEN]: false,
                            [STORAGE_KEYS.IS_ADD_PAGE_OPEN]: false,
                            [STORAGE_KEYS.IS_THEME_STORE_OPEN]: false
                        });
                        renderCallback();
                    },
                    onAddSite: () => {
                        SR.safeSendMessage({ action: 'add_current_tab' });
                    },
                    onSettingsClick: () => {
                        state.isSettingsOpen = true;
                        state.isThemeStoreOpen = false;
                        SR.safeStorage.set({ [STORAGE_KEYS.IS_SETTINGS_OPEN]: true, [STORAGE_KEYS.IS_THEME_STORE_OPEN]: false });
                        SR.safeSendMessage({ action: 'open_side_panel' });
                        renderCallback();
                    },
                    onExtensionClick: () => {
                        state.isThemeStoreOpen = true;
                        state.isSettingsOpen = false;
                        SR.safeStorage.set({ [STORAGE_KEYS.IS_THEME_STORE_OPEN]: true, [STORAGE_KEYS.IS_SETTINGS_OPEN]: false });
                        SR.safeSendMessage({ action: 'open_side_panel' });
                        renderCallback();
                    }
                });

                await SR.renderIconBar(this.iconBar, options);
            }

            async render(state, renderCallback) {
                if (!this.host) {
                    this.init(state, renderCallback);
                }

                const currentTheme = this.applyTheme(state.customTheme);
                const ah = this.getAutoHide(state, renderCallback, currentTheme);
                const isBlocked = SR.isBlocklistedDomain(window.location.hostname, state.sidepanelBlocklist);

                if (isBlocked && !state.activeSiteId) {
                    ah.cleanup();
                    this.autoHideArmed = false;
                    this.hide();
                    return;
                }

                const isAutoHideForced = SR.isBlocklistedDomain(window.location.hostname, state.autoHideBlocklist);

                if (state.autoHideEnabled || isAutoHideForced) {
                    if (ah.triggered) {
                        await this.renderInternal(state, renderCallback, currentTheme);
                    } else {
                        this.hide();
                        if (!this.autoHideArmed) {
                            ah.arm();
                            this.autoHideArmed = true;
                        }
                    }
                } else {
                    ah.cleanup();
                    this.autoHideArmed = false;
                    await this.renderInternal(state, renderCallback, currentTheme);
                }
            }

            hide() {
                if (!this.container) return;
                this.container.style.display = 'none';
                this.host.style.width = '0';
                this.host.style.pointerEvents = 'none';
                document.documentElement.classList.remove('revived-sidebar-active');
                document.documentElement.classList.remove('revived-sidebar-safe-mode');
                document.documentElement.style.removeProperty('--revived-sidebar-width');
            }

            async renderInternal(state, renderCallback, currentTheme) {
                this.container.style.display = '';
                this.host.style.pointerEvents = 'auto';

                const isFullSidebar = state.activeSiteId && state.activeSiteOwner === 'inpage';

                if (isFullSidebar) {
                    this.contentArea.classList.add('active');
                    this.contentArea.style.width = state.sidebarWidth + 'px';
                    const activeSite = (state.sites && state.sites.find(s => s.id === state.activeSiteId)) || (state.tempSites && state.tempSites.find(s => s.id === state.activeSiteId));
                    if (activeSite) {
                        this.headerTitle.innerText = activeSite.title;
                        this.iframe.name = 'revived-sidebar-iframe-' + activeSite.id;
                        const targetUrl = (state.currentUrls && state.currentUrls[activeSite.id]) || activeSite.url;
                        if (this.iframe.src !== targetUrl) {
                            this.iframe.src = targetUrl;
                        }
                    }
                } else {
                    this.contentArea.classList.remove('active');
                }

                await this.populateIcons(state, renderCallback);
                const totalWidth = 48 + (isFullSidebar ? state.sidebarWidth : 0);

                const isAutoHideForced = SR.isBlocklistedDomain(window.location.hostname, state.autoHideBlocklist);

                if (state.autoHideEnabled || isAutoHideForced) {
                    document.documentElement.classList.remove('revived-sidebar-active');
                    document.documentElement.style.removeProperty('--revived-sidebar-width');
                    this.host.style.width = totalWidth + 'px';
                } else {
                    this.host.style.width = totalWidth + 'px';
                    if (this.isSafeModeSite()) {
                        try {
                            document.documentElement.classList.add('revived-sidebar-safe-mode');
                            document.documentElement.classList.add('revived-sidebar-active');
                            document.documentElement.style.setProperty('--revived-sidebar-width', totalWidth + 'px');
                            if (window.location.hostname.includes('bing.com')) {
                                try { document.body.style.setProperty('padding-right', totalWidth + 'px', 'important'); } catch (err) { }
                            }
                        } catch (err) { }
                    } else {
                        const runTrialAndApply = async () => {
                            try {
                                const prefs = await new Promise((resolve) => SR.safeStorage.get([STORAGE_KEYS.SITE_MODE_PREFS], resolve));
                                const sitePrefs = prefs.siteModePrefs || {};
                                const hostname = window.location.hostname;
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
                            } catch (err) {
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

            destroy() {
                this.hide();
                this.destroyHost('#revived-edge-sidebar-host', '#revived-sidebar-host-styles');
                this.host = null;
                this.shadow = null;
                this.container = null;
                this.iconBar = null;
                this.contentArea = null;
                this.iframe = null;
                this.resizer = null;
                this.lastRenderState = null;
                if (this.autoHide) {
                    this.autoHide.cleanup();
                    this.autoHide = null;
                }
                this.autoHideArmed = false;
            }
        }

        class IdleSidebar extends BaseSidebar {
            constructor(signal) {
                super();
                this.signal = signal;
                this.styleElement = null;
                this.autoHide = null;
                this.autoHideArmed = false;
                this.taperTop = null;
                this.taperBottom = null;
                this.fixedElementManager = null;
            }

            init(state, renderCallback) {
                this.destroy();
                document.documentElement.setAttribute('data-revived-host', window.location.hostname);

                this.host = document.createElement('div');
                this.host.id = 'revived-idle-sidebar-host';
                this.host.style.cssText = `
                    position: fixed;
                    top: 0;
                    right: 0;
                    width: 48px;
                    height: 100vh;
                    z-index: 2147483647;
                    pointer-events: none;
                    display: none;
                    visibility: hidden;
                `;
                SR.applyThemeStyles(this.host, SR.getThemeDefaults());
                this.shadow = this.host.attachShadow({ mode: 'closed' });

                if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
                    const sharedLink = document.createElement('link');
                    sharedLink.rel = 'stylesheet';
                    sharedLink.href = chrome.runtime.getURL('sidepanel.css');
                    sharedLink.onload = () => {
                        if (this.host) {
                            this.host.style.visibility = 'visible';
                        }
                    };
                    sharedLink.onerror = () => {
                        if (this.host) {
                            this.host.style.visibility = 'visible';
                        }
                    };
                    this.shadow.appendChild(sharedLink);
                } else {
                    this.host.style.visibility = 'visible';
                }

                this.container = document.createElement('div');
                this.container.id = 'revived-idle-sidebar';
                this.container.ondragover = (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                };
                this.container.ondragenter = (e) => { e.preventDefault(); };
                this.shadow.appendChild(this.container);

                document.documentElement.appendChild(this.host);

                this.styleElement = document.createElement('style');
                this.styleElement.id = 'revived-idle-sidebar-styles';
                document.documentElement.appendChild(this.styleElement);

                this.fixedElementManager = this.createFixedElementManager();
            }

            createFixedElementManager() {
                const self = this;
                const manager = {
                    active: false,
                    adjustedElements: new Map(),
                    observer: null,
                    timeout: null,

                    start() {
                        if (manager.active) return;
                        manager.active = true;
                        manager.scan();
                        manager.observer = new MutationObserver(() => {
                            if (manager.timeout) clearTimeout(manager.timeout);
                            manager.timeout = setTimeout(() => manager.scan(), 500);
                        });
                        manager.observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
                        window.addEventListener('resize', manager.handleResize, { signal: self.signal });
                    },

                    stop() {
                        manager.active = false;
                        if (manager.observer) manager.observer.disconnect();
                        if (manager.timeout) clearTimeout(manager.timeout);
                        window.removeEventListener('resize', manager.handleResize);
                        manager.restoreAll();
                    },

                    handleResize() {
                        if (manager.timeout) clearTimeout(manager.timeout);
                        manager.timeout = setTimeout(() => manager.scan(), 500);
                    },

                    scan() {
                        if (!manager.active) return;
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
                            if (manager.adjustedElements.has(el)) continue;

                            try {
                                const style = window.getComputedStyle(el);
                                if (style.position === 'fixed') {
                                    const rect = el.getBoundingClientRect();
                                    if (rect.right > windowWidth - 48 && rect.left < windowWidth && rect.width > 0 && rect.height > 0) {
                                        const isFullWidth = rect.left <= 10 && rect.width >= windowWidth - 30;
                                        manager.adjust(el, style, isFullWidth);
                                    }
                                }
                            } catch (err) { }
                        }
                    },

                    adjust(el, style, isFullWidth) {
                        const originalStyle = {
                            transition: el.style.transition,
                            translate: el.style.translate,
                            maxWidth: el.style.maxWidth
                        };
                        manager.adjustedElements.set(el, originalStyle);
                        el.style.transition = (el.style.transition ? el.style.transition + ', ' : '') + 'translate 0.3s, max-width 0.3s';
                        if (isFullWidth) {
                            el.style.setProperty('max-width', 'calc(100vw - 48px)', 'important');
                        } else {
                            el.style.setProperty('translate', '-48px 0', 'important');
                        }
                    },

                    restoreAll() {
                        manager.adjustedElements.forEach((originalStyle, el) => {
                            el.style.transition = originalStyle.transition;
                            if (originalStyle.translate !== undefined) el.style.translate = originalStyle.translate;
                            if (originalStyle.maxWidth !== undefined) el.style.maxWidth = originalStyle.maxWidth;
                        });
                        manager.adjustedElements.clear();
                    }
                };
                return manager;
            }

            getAutoHide(state, renderCallback, currentTheme) {
                if (!this.autoHide) {
                    this.autoHide = SR.createAutoHideManager({
                        onShowBar: () => {
                            this.populateIcons(state, renderCallback);
                            this.host.style.removeProperty('display');
                            this.renderTapers(state, currentTheme);
                        },
                        onHideBar: () => { 
                            this.host.style.display = 'none'; 
                            this.clearTapers();
                        },
                        getPanelWidth: () => 48,
                        getAccentColor: () => currentTheme?.accentColor || '#38b3ff',
                        leaveThresholdOffset: 5
                    });
                }
                return this.autoHide;
            }

            async populateIcons(state, renderCallback) {
                const currentState = JSON.stringify({
                    sites: state.sites,
                    tempSites: state.tempSites,
                    activeSiteId: state.activeSiteId
                });
                if (currentState === this.lastRenderState) return;
                this.lastRenderState = currentState;

                const options = SR.createIconBarOptions('idle', state, {
                    onSiteClick: (siteId) => {
                        SR.safeStorage.set({
                            [STORAGE_KEYS.ACTIVE_SITE_ID]: siteId,
                            [STORAGE_KEYS.ACTIVE_SITE_OWNER]: 'sidepanel',
                            [STORAGE_KEYS.IS_SETTINGS_OPEN]: false,
                            [STORAGE_KEYS.IS_ADD_PAGE_OPEN]: false
                        });
                        SR.safeSendMessage({ action: 'open_side_panel' });
                        renderCallback();
                    },
                    onAddSite: () => {
                        SR.safeSendMessage({ action: 'add_current_tab' });
                    },
                    onSettingsClick: () => {
                        SR.safeStorage.set({ 
                            [STORAGE_KEYS.IS_SETTINGS_OPEN]: true,
                            [STORAGE_KEYS.IS_ADD_PAGE_OPEN]: false,
                            [STORAGE_KEYS.IS_THEME_STORE_OPEN]: false
                        });
                        SR.safeSendMessage({ action: 'open_side_panel' });
                    },
                    onExtensionClick: () => {
                        SR.safeStorage.set({ 
                            [STORAGE_KEYS.IS_THEME_STORE_OPEN]: true,
                            [STORAGE_KEYS.IS_SETTINGS_OPEN]: false,
                            [STORAGE_KEYS.IS_ADD_PAGE_OPEN]: false
                        });
                        SR.safeSendMessage({ action: 'open_side_panel' });
                    }
                });

                await SR.renderIconBar(this.container, options);
            }

            renderTapers(state, currentTheme) {
                const isAutoHideForced = SR.isBlocklistedDomain(window.location.hostname, state.autoHideBlocklist);
                const shouldShowTapers = state.enableTaper && !state.autoHideEnabled && !isAutoHideForced;

                if (shouldShowTapers) {
                    if (this.container) {
                        this.container.classList.add('tapered');
                    }
                    if (!this.taperTop || !this.taperTop.parentElement) {
                        this.taperTop = document.createElement('div');
                        this.taperTop.className = 'revived-taper revived-taper-top';
                        this.taperBottom = document.createElement('div');
                        this.taperBottom.className = 'revived-taper revived-taper-bottom';

                        this.shadow.appendChild(this.taperTop);
                        this.shadow.appendChild(this.taperBottom);
                    }

                    if (currentTheme?.sidebarBackground) {
                        this.host.style.setProperty('--theme-sidebar-bg', currentTheme.sidebarBackground);
                    }
                    if (currentTheme?.dividerBackground) {
                        this.host.style.setProperty('--theme-divider-bg', currentTheme.dividerBackground);
                    }
                } else {
                    this.clearTapers();
                }
            }

            clearTapers() {
                if (this.container) {
                    this.container.classList.remove('tapered');
                }
                if (this.taperTop) this.taperTop.remove();
                if (this.taperBottom) this.taperBottom.remove();
                this.taperTop = null;
                this.taperBottom = null;
            }

            async render(state, renderCallback) {
                if (!this.host) {
                    this.init(state, renderCallback);
                }

                const currentTheme = this.applyTheme(state.customTheme);
                if (currentTheme?.accentColor && this.autoHide) {
                    this.autoHide.updateAccentColor(currentTheme.accentColor);
                }

                const ah = this.getAutoHide(state, renderCallback, currentTheme);
                const isBlocked = SR.isBlocklistedDomain(window.location.hostname, state.sidepanelBlocklist);

                if (state.isSidePanelOpen || isBlocked || state.activeSiteId) {
                    ah.cleanup();
                    this.autoHideArmed = false;
                    this.fixedElementManager.stop();
                    this.hide();
                    return;
                }

                const isAutoHideForced = SR.isBlocklistedDomain(window.location.hostname, state.autoHideBlocklist);

                if (state.autoHideEnabled || isAutoHideForced) {
                    if (ah.triggered) {
                        this.host.style.removeProperty('display');
                        await this.populateIcons(state, renderCallback);
                        this.renderTapers(state, currentTheme);
                    } else {
                        this.host.style.display = 'none';
                        this.clearTapers();
                        if (!this.autoHideArmed) {
                            ah.setup();
                            this.autoHideArmed = true;
                        }
                    }
                    this.fixedElementManager.stop();
                    document.documentElement.classList.remove('revived-sidebar-idle-active');
                    this.styleElement.textContent = '';
                    return;
                }

                ah.cleanup();
                this.autoHideArmed = false;

                this.host.style.removeProperty('display');
                document.documentElement.classList.add('revived-sidebar-idle-active');
                this.fixedElementManager.start();
                this.renderTapers(state, currentTheme);

                const isScrollBlocked = SR.isBlocklistedDomain(window.location.hostname, state.scrollBlocklist);

                if (isScrollBlocked) {
                    this.styleElement.textContent = `
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
                    this.styleElement.textContent = `
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

                const hostname = window.location.hostname;
                if (hostname.includes('mail.google.com')) {
                    this.styleElement.textContent += `
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
                    this.styleElement.textContent += `
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

                await this.populateIcons(state, renderCallback);
            }

            hide() {
                this.clearTapers();
                if (this.host) this.host.style.display = 'none';
                document.documentElement.classList.remove('revived-sidebar-idle-active');
                if (this.styleElement) this.styleElement.textContent = '';
            }

            destroy() {
                this.hide();
                this.destroyHost('#revived-idle-sidebar-host', '#revived-idle-sidebar-styles');
                this.host = null;
                this.shadow = null;
                this.container = null;
                this.styleElement = null;
                this.lastRenderState = null;
                if (this.autoHide) {
                    this.autoHide.cleanup();
                    this.autoHide = null;
                }
                this.autoHideArmed = false;
                if (this.fixedElementManager) {
                    this.fixedElementManager.stop();
                    this.fixedElementManager = null;
                }
            }
        }

        class SidebarController {
            constructor() {
                this.activeInstance = null;
                this.idleInstance = null;
                this.abortController = null;
                this.signal = null;
                this.state = {};
                this.isInitialized = false;
            }

            start() {
                if (SR.isOrphaned()) {
                    this.destroy();
                    return;
                }
                this.abortController = new AbortController();
                this.signal = this.abortController.signal;

                this.activeInstance = new ActiveSidebar(this.signal);
                this.idleInstance = new IdleSidebar(this.signal);

                let receivedHandover = false;

                const hHandler = (e) => {
                    if (SR.isOrphaned()) {
                        this.destroy();
                        return;
                    }
                    if (e.detail && e.detail.controllerState) {
                        this.state = { ...this.state, ...e.detail.controllerState };
                        window.removeEventListener('REVIVED_HANDOVER_RES', hHandler);
                        receivedHandover = true;
                        if (!this.isInitialized) {
                            this.isInitialized = true;
                            this.orchestrate();
                        }
                    }
                };
                window.addEventListener('REVIVED_HANDOVER_RES', hHandler, { signal: this.signal });
                window.dispatchEvent(new CustomEvent('REVIVED_HANDOVER_REQ'));

                const keys = [
                    STORAGE_KEYS.SITES,
                    STORAGE_KEYS.TEMP_SITES,
                    STORAGE_KEYS.ACTIVE_SITE_ID,
                    STORAGE_KEYS.ACTIVE_SITE_OWNER,
                    STORAGE_KEYS.SIDEBAR_WIDTH,
                    STORAGE_KEYS.CURRENT_URLS,
                    STORAGE_KEYS.SCROLL_BLOCKLIST,
                    STORAGE_KEYS.SIDEPANEL_BLOCKLIST,
                    STORAGE_KEYS.AUTOHIDE_BLOCKLIST,
                    STORAGE_KEYS.AUTO_HIDE_ENABLED,
                    STORAGE_KEYS.CUSTOM_THEME,
                    STORAGE_KEYS.IS_SIDE_PANEL_OPEN,
                    STORAGE_KEYS.IS_SETTINGS_OPEN,
                    STORAGE_KEYS.ENABLE_TAPER,
                    STORAGE_KEYS.SHOW_CATEGORY_ICONS
                ];
                SR.safeStorage.get(keys, (result) => {
                    if (SR.isOrphaned()) {
                        this.destroy();
                        return;
                    }
                    this.state = { ...result, ...this.state };
                    globalThis.__SidebarRevived_CurrentState = globalThis.__SidebarRevived_CurrentState || {};
                    globalThis.__SidebarRevived_CurrentState.controllerState = this.state;
                    if (!this.isInitialized) {
                        this.isInitialized = true;
                        this.orchestrate();
                    }
                });

                document.addEventListener('visibilitychange', () => {
                    if (SR.isOrphaned()) {
                        this.destroy();
                        return;
                    }
                    if (!document.hidden && this.isInitialized) {
                        this.syncAndRender();
                    }
                }, { signal: this.signal });

                window.addEventListener('mouseenter', () => {
                    if (SR.isOrphaned()) {
                        this.destroy();
                        return;
                    }
                    if (this.isInitialized) {
                        this.syncAndRender();
                    }
                }, { signal: this.signal });

                SR.safeStorage.onChanged((changes) => {
                    if (SR.isOrphaned()) {
                        this.destroy();
                        return;
                    }
                    if (!this.isInitialized) return;
                    let needsRender = false;
                    for (const key in changes) {
                        this.state[key] = changes[key].newValue;
                        needsRender = true;
                    }
                    if (needsRender) {
                        this.orchestrate();
                    }
                });

                if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
                    try {
                        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
                            if (SR.isOrphaned()) {
                                this.destroy();
                                return;
                            }
                            if (message.type === 'PING') {
                                sendResponse({ status: 'alive' });
                                return true;
                            }
                        });
                    } catch (e) { }
                }
            }

            syncAndRender() {
                if (SR.isOrphaned()) {
                    this.destroy();
                    return;
                }
                if (!this.isInitialized) return;
                const keys = [
                    STORAGE_KEYS.SITES,
                    STORAGE_KEYS.TEMP_SITES,
                    STORAGE_KEYS.ACTIVE_SITE_ID,
                    STORAGE_KEYS.ACTIVE_SITE_OWNER,
                    STORAGE_KEYS.SIDEBAR_WIDTH,
                    STORAGE_KEYS.CURRENT_URLS,
                    STORAGE_KEYS.SCROLL_BLOCKLIST,
                    STORAGE_KEYS.SIDEPANEL_BLOCKLIST,
                    STORAGE_KEYS.AUTOHIDE_BLOCKLIST,
                    STORAGE_KEYS.AUTO_HIDE_ENABLED,
                    STORAGE_KEYS.CUSTOM_THEME,
                    STORAGE_KEYS.IS_SIDE_PANEL_OPEN,
                    STORAGE_KEYS.IS_SETTINGS_OPEN,
                    STORAGE_KEYS.ENABLE_TAPER,
                    STORAGE_KEYS.SHOW_CATEGORY_ICONS
                ];
                SR.safeStorage.get(keys, (result) => {
                    if (SR.isOrphaned()) {
                        this.destroy();
                        return;
                    }
                    this.state = { ...this.state, ...result };
                    globalThis.__SidebarRevived_CurrentState = globalThis.__SidebarRevived_CurrentState || {};
                    globalThis.__SidebarRevived_CurrentState.controllerState = this.state;
                    this.orchestrate();
                });
            }

            orchestrate() {
                if (!this.isInitialized) return;
                const renderCallback = () => this.orchestrate();

                const isBlocked = SR.isBlocklistedDomain(window.location.hostname, this.state.sidepanelBlocklist);
                const isActiveMode = this.state.activeSiteId && this.state.activeSiteOwner === 'inpage';
                const isIdleMode = !this.state.isSidePanelOpen && !isBlocked && !this.state.activeSiteId;

                if (isActiveMode) {
                    this.idleInstance.hide();
                    this.activeInstance.render(this.state, renderCallback);
                } else if (isIdleMode) {
                    this.activeInstance.hide();
                    this.idleInstance.render(this.state, renderCallback);
                } else {
                    this.activeInstance.hide();
                    this.idleInstance.hide();
                }
            }

            destroy() {
                if (this.abortController) {
                    this.abortController.abort();
                }
                if (this.activeInstance) this.activeInstance.destroy();
                if (this.idleInstance) this.idleInstance.destroy();
            }
        }

        if (globalThis.__SidebarRevived_Controller) {
            try { globalThis.__SidebarRevived_Controller.destroy(); } catch (err) { }
        }

        const controller = new SidebarController();
        globalThis.__SidebarRevived_Controller = controller;

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => controller.start());
        } else {
            controller.start();
        }
    }
})();
