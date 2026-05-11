// content_idle.js
(() => {
    if (window !== window.top) return;

    let host = null;
    let shadow = null;
    let sidebarContainer = null;
    let sites = [];
    let isSidePanelOpen = false;
    let styleElement = null;

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
        styleElement.textContent = `
      html.revived-sidebar-idle-active {
        margin-right: 48px !important;
        width: calc(100% - 48px) !important;
        box-sizing: border-box !important;
      }
    `;
        document.documentElement.appendChild(styleElement);

        // Initial State Fetch
        chrome.storage.local.get(['sites', 'isSidePanelOpen'], (result) => {
            sites = result.sites || [];
            isSidePanelOpen = !!result.isSidePanelOpen;
            render();
        });

        // Listen for storage changes
        chrome.storage.onChanged.addListener((changes, namespace) => {
            if (namespace === 'local') {
                if (changes.sites) sites = changes.sites.newValue;
                if (changes.isSidePanelOpen) isSidePanelOpen = changes.isSidePanelOpen.newValue;
                render();
            }
        });
    }

    function render() {
        if (isSidePanelOpen) {
            host.style.display = 'none';
            document.documentElement.classList.remove('revived-sidebar-idle-active');
            return;
        }

        host.style.display = 'block';
        document.documentElement.classList.add('revived-sidebar-idle-active');

        sidebarContainer.innerHTML = '';
        sites.forEach(site => {
            const icon = document.createElement('div');
            icon.className = 'edge-sidebar-icon';
            if (site.faviconUrl) {
                icon.innerHTML = `<img src="${site.faviconUrl}" style="width: 20px; height: 20px; pointer-events: none;" />`;
            } else {
                icon.innerText = site.initial || site.title.charAt(0);
            }
            icon.title = site.title;

            icon.onclick = () => {
                // Set active site and trigger side panel open
                chrome.storage.local.set({ activeSiteId: site.id });
                chrome.runtime.sendMessage({ action: 'open_side_panel' });
            };

            sidebarContainer.appendChild(icon);
        });

        const divider = document.createElement('div');
        divider.className = 'edge-sidebar-divider';
        sidebarContainer.appendChild(divider);

        const addBtn = document.createElement('div');
        addBtn.className = 'edge-sidebar-add-btn';
        addBtn.innerText = "+";
        addBtn.title = "Pin Current Tab";
        addBtn.onclick = () => {
            chrome.runtime.sendMessage({ action: 'add_current_tab' });
        };
        sidebarContainer.appendChild(addBtn);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
