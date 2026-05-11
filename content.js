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

    let state = {
        sites: [],
        activeSiteId: null,
        sidebarWidth: 350,
        currentUrls: {}
    };

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
      html {
        --revived-sidebar-width: 48px;
        margin-right: var(--revived-sidebar-width, 48px) !important;
        width: calc(100% - var(--revived-sidebar-width, 48px)) !important;
        box-sizing: border-box !important;
        transition: margin-right 0.1s ease, width 0.1s ease;
      }
      #masthead-container, ytd-app, header, .fixed, [style*="position: fixed"] {
        right: var(--revived-sidebar-width) !important;
        left: 0 !important;
        width: auto !important;
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
                render();
            } else if (msg.type === 'PING') {
                sendResponse({ type: 'PONG' });
            }
        });

        chrome.storage.local.get(['sites', 'activeSiteId', 'sidebarWidth', 'currentUrls'], (result) => {
            if (result.sites) {
                state = { ...state, ...result };
                render();
            }
        });

        // Handle dynamic DOM changes (e.g. YouTube navigating internally)
        setInterval(() => {
            const totalWidth = 48 + (state.activeSiteId ? state.sidebarWidth : 0);
            document.documentElement.style.setProperty('--revived-sidebar-width', totalWidth + 'px');
        }, 2000);
    }

    function updateLayout(width) {
        document.documentElement.style.setProperty('--revived-sidebar-width', width + 'px');
        // Force many elements to respect this if they are fixed
        // YouTube specific and general fixed headers
        const fixedElements = document.querySelectorAll('*');
        // We only want to touch elements that are likely fixed headers or bars
        // This is expensive if done every frame, but we do it conditionally or on interval
    }

    function render() {
        if (!container) return;

        iconBar.innerHTML = '';
        state.sites.forEach(site => {
            const icon = document.createElement('div');
            icon.className = 'edge-sidebar-icon';
            if (site.id === state.activeSiteId) {
                icon.classList.add('active-icon');
            }
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
                icon.style.borderTop = '2px solid #0078D7';
            };
            icon.ondragleave = () => {
                icon.style.borderTop = '';
            };
            icon.ondrop = (e) => {
                e.preventDefault();
                icon.style.borderTop = '';
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
