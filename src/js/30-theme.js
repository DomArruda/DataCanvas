// ---------------- Theme toggle ----------------


function toggleTheme() {
    const goingDark = document.documentElement.getAttribute('data-theme') !== 'dark';
    if (goingDark) {
        document.documentElement.setAttribute('data-theme', 'dark');
        currentTheme = 'dracula';
    } else {
        document.documentElement.removeAttribute('data-theme');
        currentTheme = 'default';
    }
    Object.values(editors).forEach(cm => cm.setOption('theme', currentTheme));
    document.getElementById('themeToggleBtn').textContent = goingDark ? 'Light mode' : 'Dark mode';
}
