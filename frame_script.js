// frame_script.js
(() => {
    // We only care about reporting URLs if we are inside the sidebar iframe
    // The content script will give our iframe a specific name
    if (window.name.startsWith('revived-sidebar-iframe-')) {
        const siteId = window.name.replace('revived-sidebar-iframe-', '');

        // Report URL on load and on any potential navigation
        const reportUrl = () => {
            chrome.runtime.sendMessage({
                type: 'IFRAME_NAVIGATED',
                siteId: siteId,
                url: window.location.href
            });
        };

        reportUrl();

        // Also catch hash changes and dynamic state changes if possible
        window.addEventListener('popstate', reportUrl);
        window.addEventListener('hashchange', reportUrl);
    }
})();
