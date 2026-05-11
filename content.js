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
    let autoHideTimer = null;
    let autoHideLeaveTimer = null;
    let autoHideMouseHandler = null;
    let autoHideIndicator = null;
    let autoHideTriggered = false;
    let autoHideAccentColor = '#b2d7ef';
    const AUTO_HIDE_TRIGGER_ZONE = 20;

    let state = {
        sites: [],
        activeSiteId: null,
        sidebarWidth: 350,
        currentUrls: {},
        sidepanelBlocklist: [],
        customTheme: null
    };

    function applyTheme() {
        if (state.customTheme) {
            const theme = state.customTheme;
            if (theme.fontColor) host.style.setProperty('--theme-font-color', theme.fontColor);
            if (theme.sidebarBackground) host.style.setProperty('--theme-sidebar-bg', theme.sidebarBackground);
            if (theme.dividerBackground) host.style.setProperty('--theme-divider-bg', theme.dividerBackground);
            if (theme.accentColor) {
                host.style.setProperty('--theme-accent-color', theme.accentColor);
                autoHideAccentColor = theme.accentColor;
            }
            if (theme.panelOpacity !== undefined) {
                const alpha = 0.1 + theme.panelOpacity * 0.75;
                const bg = theme.sidebarBackground || '#38393c';
                const h = bg.replace('#', '');
                const rgb = { r: parseInt(h.substring(0, 2), 16), g: parseInt(h.substring(2, 4), 16), b: parseInt(h.substring(4, 6), 16) };
                const rgba = `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
                host.style.setProperty('--theme-sidebar-bg-rgba', rgba);
            }
            if (theme.accentColor) {
                const h2 = theme.accentColor.replace('#', '');
                const ar = { r: parseInt(h2.substring(0, 2), 16), g: parseInt(h2.substring(2, 4), 16), b: parseInt(h2.substring(4, 6), 16) };
                host.style.setProperty('--theme-accent-color-rgba', `rgba(${ar.r},${ar.g},${ar.b},0.5)`);
            }
            if (theme.panelBlur !== undefined) host.style.setProperty('--theme-panel-blur', theme.panelBlur + 'px');
        }
        if (autoHideIndicator && autoHideIndicator.parentElement) {
            autoHideIndicator.style.background = `linear-gradient(to left, ${autoHideAccentColor}, transparent)`;
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
            chrome.storage.local.set({ activeSiteId: null });
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

        chrome.storage.local.get(['sites', 'activeSiteId', 'sidebarWidth', 'currentUrls', 'sidepanelBlocklist', 'autoHideEnabled', 'customTheme'], (result) => {
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
                    cleanupAutoHide();
                    render();
                }
            }
        });

        setInterval(() => {
            if (autoHideEnabled && !autoHideTriggered) return;
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

    function showAutoHideBar() {
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
    }

    function hideAutoHideBar() {
        container.style.display = 'none';
        if (autoHideLeaveTimer) {
            clearTimeout(autoHideLeaveTimer);
            autoHideLeaveTimer = null;
        }
    }

    function setupAutoHide() {
        cleanupAutoHide();
        autoHideTriggered = false;
        autoHideMouseHandler = (e) => {
            const edgeDist = window.innerWidth - e.clientX;
            const panelWidth = 48 + (state.activeSiteId ? state.sidebarWidth : 0);

            if (autoHideTriggered) {
                if (edgeDist > panelWidth + 10) {
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
                chrome.storage.local.set({ activeSiteId: newActiveId });
            };

            icon.draggable = true;
            icon.ondragstart = (e) => {
                e.dataTransfer.setData('text/plain', site.id);
                icon.style.opacity = '0.5';
            };
            icon.ondragend = () => {
                icon.style.opacity = '1';
            };
            icon.ondragover = (e) => {
                e.preventDefault();
                icon.classList.add('drag-over');
            };
            icon.ondragleave = () => {
                icon.classList.remove('drag-over');
            };
            icon.ondrop = (e) => {
                e.preventDefault();
                icon.classList.remove('drag-over');
                const draggedId = e.dataTransfer.getData('text/plain');
                if (draggedId && draggedId !== site.id) {
                    const sites = [...state.sites];
                    const fromIndex = sites.findIndex(s => s.id === draggedId);
                    const toIndex = sites.findIndex(s => s.id === site.id);
                    const [moved] = sites.splice(fromIndex, 1);
                    sites.splice(toIndex, 0, moved);
                    chrome.storage.local.set({ sites });
                }
            };

            iconBar.appendChild(icon);
        });

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

        cleanupAutoHide();

        const blocked = isSidepanelBlocked() && !state.activeSiteId;

        if (blocked) {
            container.style.display = 'none';
            document.documentElement.classList.remove('revived-sidebar-active');
            document.documentElement.style.removeProperty('--revived-sidebar-width');
            return;
        }

        if (autoHideEnabled && !autoHideTriggered) {
            container.style.display = 'none';
            document.documentElement.classList.remove('revived-sidebar-active');
            document.documentElement.style.removeProperty('--revived-sidebar-width');
            setupAutoHide();
            return;
        }

        renderInternal();
    }

    function renderInternal() {
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
