(() => {
    const S = {};

    // ============ SVG ICONS ============

    const svgReady = Promise.all([
        fetch(chrome.runtime.getURL('assets/add_icon.svg')).then(r => r.text()),
        fetch(chrome.runtime.getURL('assets/trash_icon.svg')).then(r => r.text()),
        fetch(chrome.runtime.getURL('assets/settings_icon.svg')).then(r => r.text()),
        fetch(chrome.runtime.getURL('assets/pin_icon.svg')).then(r => r.text()),
        fetch(chrome.runtime.getURL('assets/temporary_icon.svg')).then(r => r.text()),
    ]).then(([add, trash, settings, pin, temp]) => {
        S.ADD_ICON_SVG = add;
        S.TRASH_ICON_SVG = trash;
        S.SETTINGS_ICON_SVG = settings;
        S.PIN_HEADER_SVG = pin;
        S.TEMP_HEADER_SVG = temp;
    });

    // ============ DEFAULT THEME ============

    S.detectBrowserState = function () {
        const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
        return {
            isEdge: ua.includes('Edg'),
            isDark: typeof matchMedia !== 'undefined'
                ? matchMedia('(prefers-color-scheme: dark)').matches
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

    S.createSiteFromTab = function (tab) {
        const title = tab.title || new URL(tab.url).hostname.replace('www.', '');
        const faviconUrl = tab.favIconUrl || `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(tab.url)}`;
        return {
            id: 'site_' + Date.now(),
            title: title,
            url: tab.url,
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
        }

        updateAccentColor(color) {
            this.accentColor = color;
            if (this.indicator && this.indicator.parentElement) {
                const rgb = S.hexToRgb(color);
                this.indicator.style.background = `linear-gradient(to left, 
                    rgba(${rgb.r},${rgb.g},${rgb.b},1) 0%, 
                    rgba(${rgb.r},${rgb.g},${rgb.b},0.6) 20%, 
                    rgba(${rgb.r},${rgb.g},${rgb.b},0.3) 40%, 
                    rgba(${rgb.r},${rgb.g},${rgb.b},0.12) 60%, 
                    rgba(${rgb.r},${rgb.g},${rgb.b},0.04) 80%, 
                    transparent 100%)`;
            }
        }

        ensureIndicator() {
            if (!this.indicator || !this.indicator.parentElement) {
                this.indicator = document.createElement('div');
                this.indicator.id = 'revived-auto-hide-indicator';

                // Inject animation keyframes if not present
                if (!document.getElementById('revived-wave-anim')) {
                    const style = document.createElement('style');
                    style.id = 'revived-wave-anim';
                    style.textContent = `
                        @keyframes revived-indicator-wave {
                            0%, 100% { transform: translateX(0) scaleX(1); }
                            50% { transform: translateX(4px) scaleX(1.1); }
                        }
                    `;
                    document.head.appendChild(style);
                }

                document.documentElement.appendChild(this.indicator);
            }
            const rgb = S.hexToRgb(this.accentColor);
            this.indicator.style.cssText = `
                position: fixed;
                top: 0;
                right: 0;
                width: ${this.getPanelWidth()}px;
                height: 100vh;
                z-index: 2147483646;
                pointer-events: none;
                background: linear-gradient(to left,
                    rgba(${rgb.r},${rgb.g},${rgb.b},1) 0%,
                    rgba(${rgb.r},${rgb.g},${rgb.b},0.6) 20%,
                    rgba(${rgb.r},${rgb.g},${rgb.b},0.3) 40%,
                    rgba(${rgb.r},${rgb.g},${rgb.b},0.12) 60%,
                    rgba(${rgb.r},${rgb.g},${rgb.b},0.04) 80%,
                    transparent 100%);
                opacity: 0;
                transition: opacity 0.3s ease, transform 0.3s ease;
                animation: revived-indicator-wave 3s infinite ease-in-out;
                transform-origin: right center;
            `;
            return this.indicator;
        }

        showIndicator() {
            const el = this.ensureIndicator();
            requestAnimationFrame(() => { el.style.opacity = '0.6'; });
        }

        hideIndicator() {
            if (this.indicator && this.indicator.parentElement) {
                this.indicator.style.opacity = '0';
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
        getIconOpacity
    }) {
        await svgReady;
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
                        chrome.storage.local.set({ tempSites: sourceList, sites: targetArr });
                    } else {
                        chrome.storage.local.set({ sites: sourceList, tempSites: targetArr });
                    }
                } else {
                    if (isBeginning) {
                        sourceList.unshift(moved);
                    } else {
                        sourceList.push(moved);
                    }
                    chrome.storage.local.set({ [isTempList ? 'tempSites' : 'sites']: sourceList });
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
                                    chrome.storage.local.set({ tempSites: sourceList, sites: targetList });
                                } else {
                                    chrome.storage.local.set({ sites: sourceList, tempSites: targetList });
                                }
                            } else {
                                let toIndex = sourceList.findIndex(s => s.id === site.id);
                                if (fromIndex < toIndex) toIndex--;
                                sourceList.splice(toIndex, 0, moved);
                                chrome.storage.local.set({ [isTempList ? 'tempSites' : 'sites']: sourceList });
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
            const pinnedPopulated = getSites && getSites().length > 0;
            const tempPopulated = getTempSites && getTempSites().length > 0;
            if (pinnedHeader) pinnedHeader.style.display = isDragging ? 'flex' : 'none';
            if (tempHeader) tempHeader.style.display = isDragging ? 'flex' : 'none';
            if (pinDivider) pinDivider.style.display = (isDragging || pinnedPopulated || tempPopulated) ? 'block' : 'none';
            if (tempDivider) tempDivider.style.display = (isDragging || tempPopulated) ? 'block' : 'none';
        }

        container.innerHTML = '';

        pinnedHeader = makeSectionHeader(S.PIN_HEADER_SVG, true);
        container.appendChild(pinnedHeader);
        renderSiteList(sites, false, pinnedHeader);

        pinDivider = document.createElement('div');
        pinDivider.className = 'edge-sidebar-divider edge-sidebar-divider-pinned';
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
                            chrome.storage.local.set({ tempSites: getTempSites().filter(s => s.id !== data.id) });
                        } else {
                            chrome.storage.local.set({ sites: getSites().filter(s => s.id !== data.id) });
                        }
                        if (activeSiteId === data.id) {
                            chrome.storage.local.set({ activeSiteId: null, activeSiteOwner: null });
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
