/**
 * nav.js
 * Centralized navigation manager for VendorRisk AI.
 * Dynamically renders public vs authenticated links and manages user logout.
 */

document.addEventListener('DOMContentLoaded', () => {
    const navLinks = document.getElementById('navLinks');
    if (!navLinks) return;
    
    const token = localStorage.getItem('sessionToken');
    const path = window.location.pathname;
    const page = path.substring(path.lastIndexOf('/') + 1) || 'index.html';
    
    // Normalize comparison page checking (handles case sensitivity and legacy names)
    const isCompareActive = (page.toLowerCase() === 'vendor-comparison.html' || page.toLowerCase() === 'compare.html');
    
    const links = token ? [
        { name: 'Home', href: 'index.html' },
        { name: 'Dashboard', href: 'dashboard.html' },
        { name: 'Analyze', href: 'analyze.html' },
        { name: 'Compare', href: 'Vendor-comparison.html', active: isCompareActive },
        { name: 'Monitor', href: 'monitor.html' },
        { name: 'Report', href: 'report.html' },
        { name: 'Profile', href: 'profile.html' },
        { name: 'Logout', href: '#', onclick: 'logout(event)' }
    ] : [
        { name: 'Home', href: 'index.html' },
        { name: 'About', href: 'about.html' },
        { name: 'Login', href: 'login.html' },
        { name: 'Register', href: 'register.html' }
    ];

    const isUL = navLinks.tagName.toLowerCase() === 'ul';
    let html = '';
    
    links.forEach(link => {
        const isActive = (link.active || (page === link.href)) ? 'class="active"' : '';
        const onclickAttr = link.onclick ? `onclick="${link.onclick}"` : '';
        if (isUL) {
            html += `<li><a href="${link.href}" ${isActive} ${onclickAttr}>${link.name}</a></li>`;
        } else {
            html += `<a href="${link.href}" ${isActive} ${onclickAttr}>${link.name}</a>`;
        }
    });
    
    navLinks.innerHTML = html;
});

async function logout(event) {
    if (event) event.preventDefault();
    const token = localStorage.getItem('sessionToken');
    if (token) {
        try {
            await fetch('http://localhost:5001/auth/logout', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch (e) {
            console.error('Logout error:', e);
        }
    }
    localStorage.removeItem('sessionToken');
    localStorage.removeItem('user');
    window.location.href = 'login.html';
}

// Make logout available globally for inline onclick handlers
window.logout = logout;
