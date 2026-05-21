function setupMobileNav() {
    document.querySelectorAll('nav, header').forEach((bar) => {
        const menu = bar.querySelector('.nav-links, .navbar-right');
        if (!menu || bar.querySelector('.mobile-menu-toggle, .menu-toggle')) return;
        const menuParent = menu.parentElement;
        if (!menuParent) return;

        const toggle = document.createElement('button');
        toggle.className = 'mobile-menu-toggle';
        toggle.type = 'button';
        toggle.setAttribute('aria-label', 'Open menu');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.innerHTML = '<span></span><span></span><span></span>';

        menuParent.insertBefore(toggle, menu);

        toggle.addEventListener('click', () => {
            const isOpen = menu.classList.toggle('is-open');
            toggle.classList.toggle('is-open', isOpen);
            toggle.setAttribute('aria-expanded', String(isOpen));
            toggle.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
        });

        menu.querySelectorAll('a, button').forEach((item) => {
            item.addEventListener('click', () => {
                menu.classList.remove('is-open');
                toggle.classList.remove('is-open');
                toggle.setAttribute('aria-expanded', 'false');
                toggle.setAttribute('aria-label', 'Open menu');
            });
        });
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupMobileNav);
} else {
    setupMobileNav();
}
