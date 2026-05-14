// scroll_faker.js
// Runs in the MAIN world to monkey-patch globals for scroll-independent body layouts.
(function() {
    if (window.__revivedScrollFakerActive) return;
    window.__revivedScrollFakerActive = true;
    
    function isFaking() {
        // We only fake if the sidebar is active (offsetting the layout)
        return document.documentElement.classList.contains('revived-sidebar-idle-active') || 
               document.documentElement.classList.contains('revived-sidebar-active');
    }

    function getDescriptor(obj, prop) {
        let current = obj;
        while (current) {
            let desc = Object.getOwnPropertyDescriptor(current, prop);
            if (desc) return desc;
            current = Object.getPrototypeOf(current);
        }
        return null;
    }

    const originalScrollY = getDescriptor(window, 'scrollY');
    const originalPageYOffset = getDescriptor(window, 'pageYOffset');
    const originalScrollTop = getDescriptor(Element.prototype, 'scrollTop');
    const originalInnerWidth = getDescriptor(window, 'innerWidth');
    const originalClientWidth = getDescriptor(document.documentElement, 'clientWidth');

    // IntersectionObserver patching
    if (!window.location.hostname.includes('youtube.com')) {
        const OriginalObserver = window.IntersectionObserver;
        if (OriginalObserver) {
            window.IntersectionObserver = function(callback, options) {
                if (isFaking() && (!options || !options.root)) {
                    options = options || {};
                    options.root = document.body;
                }
                return new OriginalObserver(callback, options);
            };
            window.IntersectionObserver.prototype = OriginalObserver.prototype;
        }
    }

    // Scroll positioning proxy
    Object.defineProperty(window, 'scrollY', {
        get: function() {
            if (isFaking() && document.body) return document.body.scrollTop;
            return originalScrollY ? originalScrollY.get.call(this) : (this.pageYOffset || 0);
        }
    });

    Object.defineProperty(window, 'pageYOffset', {
        get: function() {
            if (isFaking() && document.body) return document.body.scrollTop;
            return originalPageYOffset ? originalPageYOffset.get.call(this) : (this.scrollY || 0);
        }
    });

    Object.defineProperty(document.documentElement, 'scrollTop', {
        get: function() {
            if (isFaking() && document.body) return document.body.scrollTop;
            return originalScrollTop ? originalScrollTop.get.call(this) : 0;
        },
        set: function(val) {
            if (isFaking() && document.body) {
                document.body.scrollTop = val;
            } else if (originalScrollTop && originalScrollTop.set) {
                originalScrollTop.set.call(this, val);
            }
        }
    });

    // Viewport width proxy (hides the sidebar width from the page)
    Object.defineProperty(window, 'innerWidth', {
        get: function() {
            if (isFaking()) {
                const sidebarWidth = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--revived-sidebar-width')) || 48;
                return (originalInnerWidth ? originalInnerWidth.get.call(this) : window.outerWidth) + sidebarWidth;
            }
            return originalInnerWidth ? originalInnerWidth.get.call(this) : window.outerWidth;
        }
    });

    // Event bridging: when body scrolls, tell the window it scrolled
    document.addEventListener('scroll', function(e) {
        if (isFaking() && e.target === document.body) {
            window.dispatchEvent(new Event('scroll'));
        }
    }, { capture: true, passive: true });

})();
