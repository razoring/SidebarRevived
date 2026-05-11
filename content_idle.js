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

        // Load Google Fonts into shadow DOM
        const fontLink = document.createElement('link');
        fontLink.rel = 'stylesheet';
        fontLink.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&icon_names=add,delete';
        shadow.appendChild(fontLink);

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
                    btn.innerHTML = '<span class="material-symbols-rounded">delete</span>';
                }
            };
            icon.ondragend = () => {
                icon.style.opacity = '1';
                const btn = shadow.querySelector('.edge-sidebar-add-btn');
                if (btn) {
                    btn.classList.remove('trash-mode');
                    btn.innerHTML = '<span class="material-symbols-rounded">add</span>';
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

        const finalDropIndicator = document.createElement('div');
        finalDropIndicator.className = 'drop-indicator';
        sidebarContainer.appendChild(finalDropIndicator);

        const divider = document.createElement('div');
        divider.className = 'edge-sidebar-divider';
        sidebarContainer.appendChild(divider);

        const addBtn = document.createElement('div');
        addBtn.className = 'edge-sidebar-add-btn';
        addBtn.innerHTML = '<span class="material-symbols-rounded">add</span>';
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
