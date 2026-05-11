(() => {
    const S = {};

    // ============ SVG ICONS ============

    S.ADD_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M453-454H247q-10.95 0-18.98-8.04-8.02-8.03-8.02-19 0-10.96 8.02-18.96 8.03-8 18.98-8h206v-206q0-10.95 8.04-18.97 8.03-8.03 19-8.03 10.96 0 18.96 8.03 8 8.02 8 18.97v206h206q10.95 0 18.97 8.04 8.03 8.03 8.03 19 0 10.96-8.03 18.96-8.02 8-18.97 8H507v206q0 10.95-8.04 18.98-8.03 8.02-19 8.02-10.96 0-18.96-8.02-8-8.03-8-18.98v-206Z"/></svg>`;

    S.TRASH_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M308-140q-36.75 0-61.37-24.63Q222-189.25 222-226v-498h-26q-10.95 0-18.98-8.04-8.02-8.03-8.02-19 0-10.96 8.02-18.96 8.03-8 18.98-8h162q0-14 10.8-25t25.2-11h174q14.4 0 25.2 10.8Q604-792.4 604-778h162q10.95 0 18.97 8.04 8.03 8.03 8.03 19 0 10.96-8.03 18.96-8.02 8-18.97 8h-26v498q0 36.75-24.62 61.37Q690.75-140 654-140H308Zm378-584H276v498q0 14 9 23t23 9h346q14 0 23-9t9-23v-498ZM427-283.02q8-8.03 8-18.98v-314q0-10.95-8.04-18.97-8.03-8.03-19-8.03-10.96 0-18.96 8.03-8 8.02-8 18.97v314q0 10.95 8.04 18.98 8.03 8.02 19 8.02 10.96 0 18.96-8.02Zm146 0q8-8.03 8-18.98v-314q0-10.95-8.04-18.97-8.03-8.03-19-8.03-10.96 0-18.96 8.03-8 8.02-8 18.97v314q0 10.95 8.04 18.98 8.03 8.02 19 8.02 10.96 0 18.96-8.02ZM276-724v530-530Z"/></svg>`;

    S.SETTINGS_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`;
    S.PIN_HEADER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M616-789v299l64 62q4 4 6 8.5t2 10.17v15.66q0 10.67-8.31 19.17-8.31 8.5-19.69 8.5H507v213q0 10.95-8.04 18.98-8.03 8.02-19 8.02-10.96 0-18.96-8.02-8-8.03-8-18.98v-213H300q-11.37 0-19.69-8.5Q272-383 272-393.67v-15.66q0-5.67 2-10.17t6-8.5l64-62v-299h-26q-6.95-4-11.48-11.04-4.52-7.03-4.52-15 0-10.96 8.02-18.96 8.03-8 18.98-8h302q10.95 0 18.97 8.04 8.03 8.03 8.03 19 0 7.96-4.53 14.96-4.52 7-11.47 11h-26ZM350-420h260l-48-48v-320H398v320l-48 48Zm130 0Z"/></svg>`;
    S.TEMP_HEADER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M211.54-700Q201-710 201-724t10.54-24q10.53-10 24.7-10t23.47 10q9.29 10 9.29 24t-9.29 24q-9.3 10-23.47 10-14.17 0-24.7-10Zm156.48-91.31Q358-800.62 358-813.81t10.02-23.69q10.01-10.5 23-10.5Q404-848 414-837.5t10 23.69q0 13.19-10 22.5T391.02-782q-12.99 0-23-9.31Zm177.98 0q-10-9.31-10-22.5t10-23.69q10-10.5 22.98-10.5 12.99 0 23 10.5Q602-827 602-813.81q0 13.19-10.02 22.5-10.01 9.31-23 9.31-12.98 0-22.98-9.31Zm154.29 89.81Q691-711 691-725.21q0-14.2 9.29-23.5 9.3-9.29 23.5-9.29 14.21 0 23.71 9.29 9.5 9.3 9.5 23.5 0 14.21-9.5 23.71t-23.71 9.5q-14.2 0-23.5-9.5Zm90.23 155.45q-9.52-10.06-9.52-24 0-13.95 9.72-24.45 9.73-10.5 23.5-10.5Q828-605 838-594.45q10 10.56 10 24.5Q848-556 837.95-546q-10.06 10-23.99 10-13.93 0-23.44-10.05Zm.79 178.03q-9.31-10.01-9.31-23 0-12.98 9.31-22.98t22.5-10q13.19 0 23.69 10 10.5 10 10.5 22.98 0 12.99-10.5 23Q827-358 813.81-358q-13.19 0-22.5-10.02ZM700.29-212.5Q691-222 691-236.21q0-14.2 9.29-23.5 9.3-9.29 23.5-9.29 14.21 0 23.71 9.29 9.5 9.3 9.5 23.5 0 14.21-9.5 23.71t-23.71 9.5q-14.2 0-23.5-9.5ZM546-122.5q-10-10.5-10-23.69 0-13.19 10-22.5t22.98-9.31q12.99 0 23 9.31 10.02 9.31 10.02 22.5t-10.02 23.69q-10.01 10.5-23 10.5Q556-112 546-122.5Zm-177.98 0Q358-133 358-146.19q0-13.19 10.02-22.5 10.01-9.31 23-9.31 12.98 0 22.98 9.31t10 22.5q0 13.19-10 23.69-10 10.5-22.98 10.5-12.99 0-23-10.5ZM211-212q-10-10-10-23t10-24q10-11 23-11t24 11q11 11 11 24t-11 23q-11 10-24 10t-23-10Zm-65.22-146q-13.78 0-24.28-9.72-10.5-9.73-10.5-23.5Q111-405 121.55-415q10.56-10 24.49-10 13.93 0 23.44 10.05 9.52 10.06 9.52 23.99 0 13.93-9.72 23.44-9.73 9.52-23.5 9.52Zm.41-178q-13.19 0-23.69-10-10.5-10-10.5-22.98 0-12.99 10.5-23Q133-602 146.19-602q13.19 0 22.5 10.02 9.31 10.01 9.31 23 0 12.98-9.31 22.98t-22.5 10ZM507-489.91 631-366q8 8 7.5 18.5T630-329q-8 8-18.67 8-10.66 0-18.33-8L466-457q-7-6.71-10-14.07T453-487v-153q0-10.95 8.04-18.97 8.03-8.03 19-8.03 10.96 0 18.96 8.03 8 8.02 8 18.97v150.09Z"/></svg>`;

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
                const alpha = 0.1 + theme.panelOpacity * 0.75;
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

            this.TRIGGER_ZONE = 20;
            this.timer = null;
            this.leaveTimer = null;
            this.mouseHandler = null;
            this.indicator = null;
            this.triggered = false;
            this.accentColor = this.getAccentColor();
        }

        updateAccentColor(color) {
            this.accentColor = color;
            if (this.indicator && this.indicator.parentElement) {
                this.indicator.style.background = `linear-gradient(to left, ${this.accentColor}, transparent)`;
            }
        }

        ensureIndicator() {
            if (!this.indicator || !this.indicator.parentElement) {
                this.indicator = document.createElement('div');
                this.indicator.id = 'revived-auto-hide-indicator';
                document.documentElement.appendChild(this.indicator);
            }
            this.indicator.style.cssText = `
                position: fixed;
                top: 0;
                right: 0;
                width: 20px;
                height: 100vh;
                z-index: 2147483646;
                pointer-events: none;
                background: linear-gradient(to left, ${this.accentColor}, transparent);
                opacity: 0;
                transition: opacity 0.3s ease;
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

        setup() {
            this.cleanup();
            this.triggered = false;
            this.accentColor = this.getAccentColor();
            this.mouseHandler = (e) => {
                const edgeDist = window.innerWidth - e.clientX;
                const panelWidth = this.getPanelWidth();

                if (this.triggered) {
                    if (edgeDist > panelWidth + this.leaveThresholdOffset) {
                        if (!this.leaveTimer) {
                            this.leaveTimer = setTimeout(() => {
                                this.onHideBar();
                                this.triggered = false;
                            }, 500);
                        }
                    } else {
                        if (this.leaveTimer) {
                            clearTimeout(this.leaveTimer);
                            this.leaveTimer = null;
                        }
                    }
                } else {
                    if (edgeDist <= this.TRIGGER_ZONE) {
                        this.showIndicator();
                        if (!this.timer) {
                            this.timer = setTimeout(() => {
                                this.hideIndicator();
                                this.onShowBar();
                                this.triggered = true;
                                this.timer = null;
                            }, 1000);
                        }
                    } else {
                        if (this.timer) {
                            clearTimeout(this.timer);
                            this.timer = null;
                            this.hideIndicator();
                        }
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
            if (this.timer) {
                clearTimeout(this.timer);
                this.timer = null;
            }
            if (this.leaveTimer) {
                clearTimeout(this.leaveTimer);
                this.leaveTimer = null;
            }
            this.hideIndicator();
            this.triggered = false;
        }
    };

    // ============ ICON BAR RENDERER ============

    S.renderIconBar = function (container, {
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
                const targetArr = [...targetList];
                const fromIndex = sourceList.findIndex(s => s.id === data.id);
                if (fromIndex === -1) return;
                const [moved] = sourceList.splice(fromIndex, 1);
                if (isBeginning) {
                    targetArr.unshift(moved);
                } else {
                    targetArr.push(moved);
                }
                if (data.isTemp !== isTempList) {
                    if (data.isTemp) {
                        chrome.storage.local.set({ tempSites: sourceList, sites: targetArr });
                    } else {
                        chrome.storage.local.set({ sites: sourceList, tempSites: targetArr });
                    }
                } else {
                    chrome.storage.local.set({ [isTempList ? 'tempSites' : 'sites']: targetArr });
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
            if (pinDivider) pinDivider.style.display = (isDragging || pinnedPopulated) ? 'block' : 'none';
            if (tempDivider) tempDivider.style.display = (isDragging || tempPopulated) ? 'block' : 'none';
        }

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

    globalThis.__SidebarRevived = S;
})();
