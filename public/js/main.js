document.addEventListener('DOMContentLoaded', () => {
    // Theme Toggle
    const themeBtn = document.getElementById('theme-toggle');
    const themeBtnGuest = document.getElementById('theme-toggle-guest');
    const applyTheme = (light) => {
        document.body.classList.toggle('light-mode', light);
        localStorage.setItem('theme', light ? 'light' : 'dark');
    };
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') applyTheme(true);
    const toggle = () => applyTheme(!document.body.classList.contains('light-mode'));
    if (themeBtn) themeBtn.addEventListener('click', toggle);
    if (themeBtnGuest) themeBtnGuest.addEventListener('click', toggle);

    // Mobile and Desktop Sidebar
    const sidebar = document.getElementById('sidebar');
    const toggleMenu = document.getElementById('toggle-menu');
    const mobileClose = document.getElementById('mobile-close');
    
    if (toggleMenu && sidebar) {
        toggleMenu.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                sidebar.classList.add('open');
            } else {
                document.body.classList.toggle('sidebar-hidden');
            }
        });
    }
    if (mobileClose && sidebar) mobileClose.addEventListener('click', () => sidebar.classList.remove('open'));

    // Active nav link highlight
    const currentPath = window.location.pathname;
    document.querySelectorAll('.nav-link').forEach(link => {
        if (link.getAttribute('href') === currentPath) {
            link.style.background = 'rgba(234, 88, 12, 0.1)';
            link.style.color = '#f97316';
            link.style.borderLeftColor = '#ea580c';
        }
    });

    // Hash focus helper
    const focusHash = () => {
        if (!window.location.hash) return;
        const target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)));
        if (target) { target.scrollIntoView({ behavior: 'smooth' }); const f = target.querySelector('input, select'); if (f) f.focus({ preventScroll: true }); }
    };
    focusHash();
    window.addEventListener('hashchange', focusHash);

    // Auto-refresh functionality for real-time updates
    window.setupAutoRefresh = function(intervalSeconds = 30) {
        const refreshInterval = intervalSeconds * 1000;
        console.log(`Auto-refresh enabled: ${intervalSeconds} seconds`);
        setInterval(() => {
            location.reload();
        }, refreshInterval);
    };

    // Manual refresh button
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            location.reload();
        });
    }
});

