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
                    if (autoHide) autoHide.cleanup();
                    render();
                }
                if (changes.isSidePanelOpen !== undefined) {
                    state.isSidePanelOpen = changes.isSidePanelOpen.newValue;
                    render();
                }
                if (changes.activeSiteId !== undefined) {
                    state.activeSiteId = changes.activeSiteId.newValue;
                    if (changes.activeSiteOwner !== undefined) {
                        state.activeSiteOwner = changes.activeSiteOwner.newValue;
                    }
                    render();
                }
                if (changes.activeSiteOwner !== undefined && !changes.activeSiteId) {
                    state.activeSiteOwner = changes.activeSiteOwner.newValue;
                    render();
                }
            }
        });

        setInterval(() => {
            if (autoHideEnabled && autoHide && !autoHide.triggered) return;
            const blocked = isSidepanelBlocked() && !state.activeSiteId;
            const totalWidth = blocked ? 0 : (48 + (state.activeSiteId ? state.sidebarWidth : 0));
            document.documentElement.style.setProperty('--revived-sidebar-width', totalWidth + 'px');
            if (!autoHideEnabled) {
                if (container) container.style.display = blocked ? 'none' : '';
                document.documentElement.classList.toggle('revived-sidebar-active', !blocked);
            }
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

    function getAutoHide() {
        if (!autoHide) {
            autoHide = new SR.AutoHideManager({
                onShowBar: () => {
                    populateIcons();
                    container.style.display = '';
                    if (state.activeSiteId) {
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
                },
                onHideBar: () => { container.style.display = 'none'; },
                getPanelWidth: () => 48 + (state.activeSiteId ? state.sidebarWidth : 0),
                getAccentColor: () => '#b2d7ef',
                leaveThresholdOffset: 10
            });
        }
        return autoHide;
    }

    function makeDropZone() {
        const z = document.createElement('div');
        z.className = 'drop-indicator';
        return z;
    }

    function makeEndDropZone(targetList) {
        const zone = makeDropZone();
        zone.ondragover = (e) => { e.preventDefault(); zone.classList.add('active'); };
        zone.ondragleave = () => { zone.classList.remove('active'); };
        zone.ondrop = (e) => {
            e.preventDefault(); zone.classList.remove('active');
            try {
                const data = JSON.parse(e.dataTransfer.getData('application/json'));
                if (!data.id) return;
                const src = [...state.sites];
                const from = src.findIndex(s => s.id === data.id);
                if (from === -1) return;
                const [moved] = src.splice(from, 1);
                src.push(moved);
                chrome.storage.local.set({ sites: src });
            } catch (e) { }
        };
        return zone;
    }

    function populateIcons() {
        iconBar.innerHTML = '';
        state.sites.forEach(site => {
            const icon = document.createElement('div');
            icon.className = 'edge-sidebar-icon';

            icon.style.backgroundColor = site.color || '#333';
            icon.innerText = site.initial || site.title.charAt(0);
            icon.title = site.title;

            icon.onclick = (e) => {
                e.stopPropagation();
                const newActiveId = (state.activeSiteId === site.id) ? null : site.id;
                chrome.storage.local.set({ activeSiteId: newActiveId, activeSiteOwner: newActiveId ? 'inpage' : null });
            };

            const dropIndicator = makeDropZone();
            dropIndicator.ondragover = (e) => {
                e.preventDefault();
                dropIndicator.classList.add('active');
            };
            dropIndicator.ondragleave = () => {
                dropIndicator.classList.remove('active');
            };
            dropIndicator.ondrop = (e) => {
                e.preventDefault();
                dropIndicator.classList.remove('active');
                icon.ondrop(e);
            };
            iconBar.appendChild(dropIndicator);

            icon.draggable = true;
            icon.ondragstart = (e) => {
                e.dataTransfer.setData('application/json', JSON.stringify({ id: site.id }));
                icon.style.opacity = '0.5';
            };
            icon.ondragend = () => {
                icon.style.opacity = '1';
            };
            icon.ondragover = (e) => {
                e.preventDefault();
                dropIndicator.classList.add('active');
            };
            icon.ondragleave = () => {
                dropIndicator.classList.remove('active');
            };
            icon.ondrop = (e) => {
                e.preventDefault();
                dropIndicator.classList.remove('active');
                try {
                    const data = JSON.parse(e.dataTransfer.getData('application/json'));
                    if (data.id && data.id !== site.id) {
                        const sites = [...state.sites];
                        const fromIndex = sites.findIndex(s => s.id === data.id);
                        if (fromIndex === -1) return;
                        const [moved] = sites.splice(fromIndex, 1);
                        let toIndex = sites.findIndex(s => s.id === site.id);
                        if (fromIndex < toIndex) toIndex--;
                        sites.splice(toIndex, 0, moved);
                        chrome.storage.local.set({ sites });
                    }
                } catch (e) { }
            };

            iconBar.appendChild(icon);
        });

        iconBar.appendChild(makeEndDropZone(state.sites));

        const divider = document.createElement('div');
        divider.className = 'edge-sidebar-divider';
        iconBar.appendChild(divider);

        const addBtn = document.createElement('div');
        addBtn.className = 'edge-sidebar-add-btn';
        addBtn.innerText = "+";
        addBtn.title = "Add current site";
        addBtn.onclick = (e) => {
            e.stopPropagation();
            const newSite = {
                id: 'site_' + Date.now(),
                title: document.title || 'New Site',
                url: window.location.href,
                color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
                initial: (document.title || 'N').charAt(0)
            };
            const updatedSites = [...state.sites, newSite];
            chrome.storage.local.set({ sites: updatedSites });
        };
        iconBar.appendChild(addBtn);
    }

    function render() {
        if (!container) return;

        const ah = getAutoHide();
        ah.cleanup();

        const blocked = isSidepanelBlocked() && !state.activeSiteId;

        if (blocked) {
            container.style.display = 'none';
            document.documentElement.classList.remove('revived-sidebar-active');
            document.documentElement.style.removeProperty('--revived-sidebar-width');
            return;
        }

        if (autoHideEnabled && !ah.triggered) {
            container.style.display = 'none';
            document.documentElement.classList.remove('revived-sidebar-active');
            document.documentElement.style.removeProperty('--revived-sidebar-width');
            ah.setup();
            return;
        }

        if (state.isSidePanelOpen) {
            container.style.display = 'none';
            document.documentElement.classList.remove('revived-sidebar-active');
            document.documentElement.style.removeProperty('--revived-sidebar-width');
            return;
        }

        if (state.activeSiteId && state.activeSiteOwner === 'sidepanel') {
            container.style.display = 'none';
            document.documentElement.classList.remove('revived-sidebar-active');
            document.documentElement.style.removeProperty('--revived-sidebar-width');
            return;
        }

        renderInternal();
    }

    function renderInternal() {
        if (currentTheme) SR.applyThemeStyles(host, currentTheme);
        populateIcons();
        container.style.display = '';
        document.documentElement.classList.add('revived-sidebar-active');

        if (state.activeSiteId) {
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

        const totalWidth = 48 + (state.activeSiteId ? state.sidebarWidth : 0);
        document.documentElement.style.setProperty('--revived-sidebar-width', totalWidth + 'px');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
