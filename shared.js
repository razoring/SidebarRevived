(() => {
    if (globalThis.__SidebarRevived && !globalThis.__SidebarRevived.isOrphaned()) return;
    const S = {};
    S.isOrphaned = () => {
        try {
            return typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id || !chrome.runtime.getURL;
        } catch (e) {
            return true;
        }
    };

    S.safeStorage = {
        get: (keys, cb) => {
            if (!S.isOrphaned()) {
                try {
                    chrome.storage.local.get(keys, (res) => {
                        if (chrome.runtime.lastError) return;
                        if (cb) cb(res);
                    });
                    return;
                } catch (e) { }
            }
            // Orphaned! Try to bridge to a healthy script instance on the same page
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
            // Orphaned! Bridge the set request
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

    // Bridge Listener (for healthy scripts to help orphans)
    if (typeof window !== 'undefined') {
        window.addEventListener('message', (e) => {
            if (e.data && e.data.type === 'REVIVED_BRIDGE_REQ') {
                try {
                    if (!S.isOrphaned()) {
                        if (e.data.action === 'get') {
                            try {
                                chrome.storage.local.get(e.data.keys, (result) => {
                                    try {
                                        window.postMessage({ type: 'REVIVED_BRIDGE_RES', requestId: e.data.requestId, result }, '*');
                                    } catch (e) { }
                                });
                            } catch (e) { }
                        } else if (e.data.action === 'set') {
                            try {
                                chrome.storage.local.set(e.data.obj);
                            } catch (e) { }
                        } else if (e.data.action === 'sendMessage') {
                            try { chrome.runtime.sendMessage(e.data.message); } catch (err) { }
                        }
                    }
                } catch (err) { }
            }
        }, { signal: sharedSignal });

        // Handover Mechanism: New scripts can request state from old (stale) ones
        window.addEventListener('REVIVED_HANDOVER_REQ', (e) => {
            if (globalThis.__SidebarRevived_CurrentState) {
                window.dispatchEvent(new CustomEvent('REVIVED_HANDOVER_RES', { 
                    detail: globalThis.__SidebarRevived_CurrentState 
                }));
            }
        }, { signal: sharedSignal });
    }

    // ============ SVG ICONS ============

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
        fetchSvg('assets/settings_icon.svg', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>'),
        fetchSvg('assets/pin_icon.svg', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="17" x2="12" y2="22"></line><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"></path></svg>'),
        fetchSvg('assets/temporary_icon.svg', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>'),
    ]).then(([add, trash, settings, pin, temp]) => {
        S.ADD_ICON_SVG = add;
        S.TRASH_ICON_SVG = trash;
        S.SETTINGS_ICON_SVG = settings;
        S.PIN_HEADER_SVG = pin;
        S.TEMP_HEADER_SVG = temp;
    });

    // ============ DEFAULT THEME ============

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
                sidebarBackground: isDark ? '#3b3b3b' : '#dddfe2',
                dividerBackground: isDark ? '#555555' : '#c0c0c0',
                accentColor: isDark ? '#b2d7ef' : '#0078d7',
                panelOpacity: 1,
                panelBlur: 0
            };
        }
        return {
            fontColor: isDark ? '#ffffff' : '#1a1a1a',
            sidebarBackground: isDark ? '#3c3c3c' : '#ffffff',
            dividerBackground: isDark ? '#555555' : '#c0c0c0',
            accentColor: isDark ? '#b2d7ef' : '#0078d7',
            panelOpacity: 1,
            panelBlur: 0
        };
    };

    // ============ UTILITY FUNCTIONS ============

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

    // ============ THEME APPLICATION ============

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
            if (theme.panelBlur !== undefined) el.style.setProperty('--theme-panel-blur', theme.panelBlur + 'px');
        } else {
            const props = [
                '--theme-font-color', '--theme-sidebar-bg', '--theme-divider-bg',
                '--theme-accent-color', '--theme-panel-opacity', '--theme-panel-blur',
                '--theme-settings-bg', '--theme-sidebar-bg-rgba', '--theme-accent-color-rgba'
            ];
            props.forEach(p => el.style.removeProperty(p));
        }
    };

    // ============ AUTO-HIDE MANAGER ============

    S.AutoHideManager = class {
        constructor(opts) {
            this.onShowBar = opts.onShowBar;
            this.onHideBar = opts.onHideBar;
            this.getPanelWidth = opts.getPanelWidth;
            this.getAccentColor = opts.getAccentColor || (() => '#b2d7ef');
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

    // ============ ICON BAR RENDERER ============

    S.renderIconBar = async function (container, {
        sites = [],
        tempSites = [],
        activeSiteId = null,
        getSites,
        getTempSites,
        onSiteClick,
        onAddSite,
        onSettingsClick,
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
            } catch (e) { }
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
                    } catch (e) { }
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

        const settingsBtn = document.createElement('div');
        settingsBtn.className = 'edge-sidebar-icon edge-sidebar-add-btn';
        settingsBtn.title = "Settings";
        settingsBtn.style.marginTop = 'auto';
        settingsBtn.innerHTML = S.SETTINGS_ICON_SVG;
        settingsBtn.onclick = () => {
            if (onSettingsClick) onSettingsClick();
        };
        container.appendChild(settingsBtn);

        // Animate icons into position
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
                        icon.offsetHeight; // force reflow
                        icon.style.transition = 'transform 0.5s cubic-bezier(0.2, 0, 0, 1)';
                        icon.style.transform = '';
                    }
                });
            });
        }
    };

    // ============ EXPORT ============
    // Run a short, non-destructive trial by applying `candidateCss` and observing
    // outgoing resource loads and navigations. Returns true if the page reacted
    // (e.g., image/resource URLs containing `cw=`), else false.
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
