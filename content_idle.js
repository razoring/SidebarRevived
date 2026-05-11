// content_idle.js
(() => {
    if (window !== window.top) return;

    let host = null;
    let shadow = null;
    let sidebarContainer = null;
    let sites = [];
    let isSidePanelOpen = false;
    let styleElement = null;

    const ADD_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M453-454H247q-10.95 0-18.98-8.04-8.02-8.03-8.02-19 0-10.96 8.02-18.96 8.03-8 18.98-8h206v-206q0-10.95 8.04-18.97 8.03-8.03 19-8.03 10.96 0 18.96 8.03 8 8.02 8 18.97v206h206q10.95 0 18.97 8.04 8.03 8.03 8.03 19 0 10.96-8.03 18.96-8.02 8-18.97 8H507v206q0 10.95-8.04 18.98-8.03 8.02-19 8.02-10.96 0-18.96-8.02-8-8.03-8-18.98v-206Z"/></svg>`;
    const TRASH_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M308-140q-36.75 0-61.37-24.63Q222-189.25 222-226v-498h-26q-10.95 0-18.98-8.04-8.02-8.03-8.02-19 0-10.96 8.02-18.96 8.03-8 18.98-8h162q0-14 10.8-25t25.2-11h174q14.4 0 25.2 10.8Q604-792.4 604-778h162q10.95 0 18.97 8.04 8.03 8.03 8.03 19 0 10.96-8.03 18.96-8.02 8-18.97 8h-26v498q0 36.75-24.62 61.37Q690.75-140 654-140H308Zm378-584H276v498q0 14 9 23t23 9h346q14 0 23-9t9-23v-498ZM427-283.02q8-8.03 8-18.98v-314q0-10.95-8.04-18.97-8.03-8.03-19-8.03-10.96 0-18.96 8.03-8 8.02-8 18.97v314q0 10.95 8.04 18.98 8.03 8.02 19 8.02 10.96 0 18.96-8.02Zm146 0q8-8.03 8-18.98v-314q0-10.95-8.04-18.97-8.03-8.03-19-8.03-10.96 0-18.96 8.03-8 8.02-8 18.97v314q0 10.95 8.04 18.98 8.03 8.02 19 8.02 10.96 0 18.96-8.02ZM276-724v530-530Z"/></svg>`;

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

            const dropIndicator = document.createElement('div');
            dropIndicator.className = 'drop-indicator';
            sidebarContainer.appendChild(dropIndicator);

            icon.draggable = true;
            icon.ondragstart = (e) => {
                e.dataTransfer.setData('text/plain', site.id);
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
                const draggedId = e.dataTransfer.getData('text/plain');
                if (draggedId && draggedId !== site.id) {
                    const currentSites = [...sites];
                    const fromIndex = currentSites.findIndex(s => s.id === draggedId);
                    const toIndex = currentSites.findIndex(s => s.id === site.id);
                    const [moved] = currentSites.splice(fromIndex, 1);
                    currentSites.splice(toIndex, 0, moved);
                    chrome.storage.local.set({ sites: currentSites });
                }
            };

            sidebarContainer.appendChild(icon);
        });

        if (sites.length > 0) {
            const finalDropIndicator = document.createElement('div');
            finalDropIndicator.className = 'drop-indicator';
            sidebarContainer.appendChild(finalDropIndicator);
        }

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
                const draggedId = e.dataTransfer.getData('text/plain');
                if (draggedId) {
                    const currentSites = sites.filter(s => s.id !== draggedId);
                    chrome.storage.local.set({ sites: currentSites });
                }
            }
        };

        sidebarContainer.appendChild(addBtn);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
