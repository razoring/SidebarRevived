// content_idle.js
(() => {
    if (window !== window.top) return;

    let host = null;
    let shadow = null;
    let sidebarContainer = null;
    let sites = [];
    let isSidePanelOpen = false;
    let activeSiteId = null;
    let styleElement = null;
    let scrollBlocklist = [];
    let sidepanelBlocklist = [];
    let autoHideEnabled = false;
    let autoHideTimer = null;
    let autoHideLeaveTimer = null;
    let autoHideMouseHandler = null;
    let autoHideIndicator = null;
    let autoHideTriggered = false;
    let autoHideAccentColor = '#b2d7ef';
    const AUTO_HIDE_TRIGGER_ZONE = 20;

    const ADD_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M453-454H247q-10.95 0-18.98-8.04-8.02-8.03-8.02-19 0-10.96 8.02-18.96 8.03-8 18.98-8h206v-206q0-10.95 8.04-18.97 8.03-8.03 19-8.03 10.96 0 18.96 8.03 8 8.02 8 18.97v206h206q10.95 0 18.97 8.04 8.03 8.03 8.03 19 0 10.96-8.03 18.96-8.02 8-18.97 8H507v206q0 10.95-8.04 18.98-8.03 8.02-19 8.02-10.96 0-18.96-8.02-8-8.03-8-18.98v-206Z"/></svg>`;
    const TRASH_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M308-140q-36.75 0-61.37-24.63Q222-189.25 222-226v-498h-26q-10.95 0-18.98-8.04-8.02-8.03-8.02-19 0-10.96 8.02-18.96 8.03-8 18.98-8h162q0-14 10.8-25t25.2-11h174q14.4 0 25.2 10.8Q604-792.4 604-778h162q10.95 0 18.97 8.04 8.03 8.03 8.03 19 0 10.96-8.03 18.96-8.02 8-18.97 8h-26v498q0 36.75-24.62 61.37Q690.75-140 654-140H308Zm378-584H276v498q0 14 9 23t23 9h346q14 0 23-9t9-23v-498ZM427-283.02q8-8.03 8-18.98v-314q0-10.95-8.04-18.97-8.03-8.03-19-8.03-10.96 0-18.96 8.03-8 8.02-8 18.97v314q0 10.95 8.04 18.98 8.03 8.02 19 8.02 10.96 0 18.96-8.02Zm146 0q8-8.03 8-18.98v-314q0-10.95-8.04-18.97-8.03-8.03-19-8.03-10.96 0-18.96 8.03-8 8.02-8 18.97v314q0 10.95 8.04 18.98 8.03 8.02 19 8.02 10.96 0 18.96-8.02ZM276-724v530-530Z"/></svg>`;
    const SETTINGS_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`;

    function init() {
        host = document.createElement('div');
        host.id = 'revived-idle-sidebar-host';
        shadow = host.attachShadow({ mode: 'closed' });

        // Load styles into shadow DOM
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = chrome.runtime.getURL('content_idle.css');
        shadow.appendChild(link);

        sidebarContainer = document.createElement('div');
        sidebarContainer.id = 'revived-idle-sidebar';
        shadow.appendChild(sidebarContainer);

        document.documentElement.appendChild(host);

        // Host style adjustment for idle bar
        styleElement = document.createElement('style');
        document.documentElement.appendChild(styleElement);

        // Initial State Fetch
        chrome.storage.local.get(['sites', 'isSidePanelOpen', 'customTheme', 'activeSiteId', 'scrollBlocklist', 'sidepanelBlocklist', 'autoHideEnabled'], (result) => {
            sites = result.sites || [];
            isSidePanelOpen = !!result.isSidePanelOpen;
            activeSiteId = result.activeSiteId;
            scrollBlocklist = result.scrollBlocklist || [];
            sidepanelBlocklist = result.sidepanelBlocklist || [];
            if (result.autoHideEnabled !== undefined) autoHideEnabled = result.autoHideEnabled;
            if (result.customTheme) {
                applyTheme(result.customTheme);
            }
            render();
        });

        // Listen for storage changes
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local') {
                if (changes.sites) sites = changes.sites.newValue;
                if (changes.isSidePanelOpen) isSidePanelOpen = changes.isSidePanelOpen.newValue;
                if (changes.activeSiteId) activeSiteId = changes.activeSiteId.newValue;
                if (changes.customTheme) applyTheme(changes.customTheme.newValue);
                if (changes.scrollBlocklist) scrollBlocklist = changes.scrollBlocklist.newValue;
                if (changes.sidepanelBlocklist) sidepanelBlocklist = changes.sidepanelBlocklist.newValue;
                if (changes.autoHideEnabled !== undefined) {
                    autoHideEnabled = changes.autoHideEnabled.newValue;
                    cleanupAutoHide();
                }
                render();
            }
        });
    }

    function applyTheme(theme) {
        if (theme) {
            if (theme.fontColor) host.style.setProperty('--theme-font-color', theme.fontColor);
            if (theme.sidebarBackground) host.style.setProperty('--theme-sidebar-bg', theme.sidebarBackground);
            if (theme.dividerBackground) host.style.setProperty('--theme-divider-bg', theme.dividerBackground);
            if (theme.accentColor) {
                host.style.setProperty('--theme-accent-color', theme.accentColor);
                autoHideAccentColor = theme.accentColor;
                if (autoHideIndicator && autoHideIndicator.parentElement) {
                    autoHideIndicator.style.background = `linear-gradient(to left, ${autoHideAccentColor}, transparent)`;
                }
            }
            if (theme.panelOpacity !== undefined) {
                host.style.setProperty('--theme-panel-opacity', theme.panelOpacity);
                const alpha = 0.1 + theme.panelOpacity * 0.75;
                const bg = theme.sidebarBackground || '#38393c';
                const h = bg.replace('#', '');
                const rgb = { r: parseInt(h.substring(0, 2), 16), g: parseInt(h.substring(2, 4), 16), b: parseInt(h.substring(4, 6), 16) };
                const rgba = `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
                host.style.setProperty('--theme-settings-bg', rgba);
                host.style.setProperty('--theme-sidebar-bg-rgba', rgba);
            }
            if (theme.accentColor) {
                const h2 = theme.accentColor.replace('#', '');
                const ar = { r: parseInt(h2.substring(0, 2), 16), g: parseInt(h2.substring(2, 4), 16), b: parseInt(h2.substring(4, 6), 16) };
                host.style.setProperty('--theme-accent-color-rgba', `rgba(${ar.r},${ar.g},${ar.b},0.5)`);
            }
            if (theme.panelBlur !== undefined) host.style.setProperty('--theme-panel-blur', theme.panelBlur + 'px');
        } else {
            host.style.removeProperty('--theme-font-color');
            host.style.removeProperty('--theme-sidebar-bg');
            host.style.removeProperty('--theme-divider-bg');
            host.style.removeProperty('--theme-accent-color');
            host.style.removeProperty('--theme-panel-opacity');
            host.style.removeProperty('--theme-panel-blur');
        }
    }

    function showAutoHideBar() {
        populateIcons();
        host.style.display = 'block';
    }

    function hideAutoHideBar() {
        host.style.display = 'none';
        if (autoHideLeaveTimer) {
            clearTimeout(autoHideLeaveTimer);
            autoHideLeaveTimer = null;
        }
    }

    function ensureIndicator() {
        if (!autoHideIndicator || !autoHideIndicator.parentElement) {
            autoHideIndicator = document.createElement('div');
            autoHideIndicator.id = 'revived-auto-hide-indicator';
            document.documentElement.appendChild(autoHideIndicator);
        }
        autoHideIndicator.style.cssText = `
            position: fixed;
            top: 0;
            right: 0;
            width: 20px;
            height: 100vh;
            z-index: 2147483646;
            pointer-events: none;
            background: linear-gradient(to left, ${autoHideAccentColor}, transparent);
            opacity: 0;
            transition: opacity 0.3s ease;
        `;
        return autoHideIndicator;
    }

    function showAutoHideIndicator() {
        const el = ensureIndicator();
        requestAnimationFrame(() => { el.style.opacity = '0.6'; });
    }

    function hideAutoHideIndicator() {
        if (autoHideIndicator && autoHideIndicator.parentElement) {
            autoHideIndicator.style.opacity = '0';
        }
    }

    function setupAutoHide() {
        cleanupAutoHide();
        autoHideTriggered = false;
        autoHideMouseHandler = (e) => {
            const edgeDist = window.innerWidth - e.clientX;
            const panelWidth = 48;

            if (autoHideTriggered) {
                if (edgeDist > panelWidth + 5) {
                    if (!autoHideLeaveTimer) {
                        autoHideLeaveTimer = setTimeout(() => {
                            hideAutoHideBar();
                            autoHideTriggered = false;
                        }, 500);
                    }
                } else {
                    if (autoHideLeaveTimer) {
                        clearTimeout(autoHideLeaveTimer);
                        autoHideLeaveTimer = null;
                    }
                }
            } else {
                if (edgeDist <= AUTO_HIDE_TRIGGER_ZONE) {
                    showAutoHideIndicator();
                    if (!autoHideTimer) {
                        autoHideTimer = setTimeout(() => {
                            hideAutoHideIndicator();
                            showAutoHideBar();
                            autoHideTriggered = true;
                            autoHideTimer = null;
                        }, 1000);
                    }
                } else {
                    if (autoHideTimer) {
                        clearTimeout(autoHideTimer);
                        autoHideTimer = null;
                        hideAutoHideIndicator();
                    }
                }
            }
        };
        document.addEventListener('mousemove', autoHideMouseHandler);
    }

    function cleanupAutoHide() {
        if (autoHideMouseHandler) {
            document.removeEventListener('mousemove', autoHideMouseHandler);
            autoHideMouseHandler = null;
        }
        if (autoHideTimer) {
            clearTimeout(autoHideTimer);
            autoHideTimer = null;
        }
        if (autoHideLeaveTimer) {
            clearTimeout(autoHideLeaveTimer);
            autoHideLeaveTimer = null;
        }
        hideAutoHideIndicator();
        autoHideTriggered = false;
    }

    function renderSiteList(siteList, isTempList) {
        siteList.forEach(site => {
            const icon = document.createElement('div');
            icon.className = 'edge-sidebar-icon';
            if (site.faviconUrl) {
                icon.innerHTML = `<img src="${site.faviconUrl}" style="width: 20px; height: 20px; pointer-events: none;" />`;
            } else {
                icon.innerText = site.initial || site.title.charAt(0);
            }
            icon.title = site.title;

            icon.onclick = () => {
                chrome.storage.local.set({ activeSiteId: site.id });
                chrome.runtime.sendMessage({ action: 'open_side_panel' });
            };

            const dropIndicator = document.createElement('div');
            dropIndicator.className = 'drop-indicator';
            sidebarContainer.appendChild(dropIndicator);

            icon.draggable = true;
            icon.ondragstart = (e) => {
                e.dataTransfer.setData('application/json', JSON.stringify({ id: site.id, isTemp: isTempList }));
                icon.style.opacity = '0.5';
                const btn = shadow.querySelector('.edge-sidebar-add-btn');
                if (btn) {
                    btn.classList.add('trash-mode');
                    btn.innerHTML = TRASH_ICON_SVG;
                }
            };
            icon.ondragend = () => {
                icon.style.opacity = '1';
                const btn = shadow.querySelector('.edge-sidebar-add-btn');
                if (btn) {
                    btn.classList.remove('trash-mode');
                    btn.innerHTML = ADD_ICON_SVG;
                }
            };
            icon.ondragover = (e) => {
                e.preventDefault();
                dropIndicator.classList.add('active');
            };
            icon.ondragleave = () => { dropIndicator.classList.remove('active'); };
            icon.ondrop = (e) => {
                e.preventDefault();
                dropIndicator.classList.remove('active');
                try {
                    const data = JSON.parse(e.dataTransfer.getData('application/json'));
                    if (data.id && data.id !== site.id) {
                    }
                } catch (evt) { }
            };

            sidebarContainer.appendChild(icon);
        });

        if (siteList.length > 0) {
            const finalDropIndicator = document.createElement('div');
            finalDropIndicator.className = 'drop-indicator';
            sidebarContainer.appendChild(finalDropIndicator);
        }
    }

    function populateIcons() {
        sidebarContainer.innerHTML = '';
        renderSiteList(sites, false);

        const divider = document.createElement('div');
        divider.className = 'edge-sidebar-divider';
        sidebarContainer.appendChild(divider);

        const addBtn = document.createElement('div');
        addBtn.className = 'edge-sidebar-add-btn';
        addBtn.innerHTML = ADD_ICON_SVG;
        addBtn.title = "Pin Current Tab";
        addBtn.onclick = () => {
            if (addBtn.classList.contains('trash-mode')) return;
            chrome.runtime.sendMessage({ action: 'add_current_tab' });
        };

        addBtn.ondragover = (e) => {
            e.preventDefault();
            if (addBtn.classList.contains('trash-mode')) {
                addBtn.classList.add('trash-hover');
            }
        };
        addBtn.ondragleave = () => {
            addBtn.classList.remove('trash-hover');
        };
        addBtn.ondrop = (e) => {
            e.preventDefault();
            addBtn.classList.remove('trash-hover');
            if (addBtn.classList.contains('trash-mode')) {
                try {
                    const data = JSON.parse(e.dataTransfer.getData('application/json'));
                    if (data.id && !data.isTemp) {
                        const currentSites = sites.filter(s => s.id !== data.id);
                        chrome.storage.local.set({ sites: currentSites });
                    }
                } catch (evt) { }
            }
        };

        sidebarContainer.appendChild(addBtn);

        const settingsBtn = document.createElement('div');
        settingsBtn.className = 'edge-sidebar-icon edge-sidebar-add-btn';
        settingsBtn.title = "Settings";
        settingsBtn.style.marginTop = 'auto';
        settingsBtn.innerHTML = SETTINGS_ICON_SVG;
        settingsBtn.onclick = () => {
            chrome.storage.local.set({ isSettingsOpen: true });
            chrome.runtime.sendMessage({ action: 'open_side_panel' });
        };
        sidebarContainer.appendChild(settingsBtn);
    }

    function render() {
        cleanupAutoHide();
        const hostname = window.location.hostname;
        const isSidepanelBlocked = sidepanelBlocklist.some(d => hostname.includes(d));

        if (isSidePanelOpen || isSidepanelBlocked) {
            host.style.display = 'none';
            document.documentElement.classList.remove('revived-sidebar-idle-active');
            return;
        }

        if (autoHideEnabled) {
            host.style.display = 'none';
            document.documentElement.classList.remove('revived-sidebar-idle-active');
            styleElement.textContent = '';
            setupAutoHide();
            return;
        }

        host.style.display = 'block';
        document.documentElement.classList.add('revived-sidebar-idle-active');

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
                    transform: translateX(0) !important;
                    box-sizing: border-box !important;
                }
                #revived-idle-sidebar-host {
                    transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                }
            `;
        }

        populateIcons();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
