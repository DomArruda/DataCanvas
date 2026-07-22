// ---------------- Dropdown menus ----------------
function closeAllMenus() {
    document.querySelectorAll('.menu-list.open').forEach(m => m.classList.remove('open'));
}
function setupMenu(btnId, listId) {
    const btn = document.getElementById(btnId);
    const list = document.getElementById(listId);
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const wasOpen = list.classList.contains('open');
        closeAllMenus();
        if (!wasOpen) list.classList.add('open');
    });
    // Close after any item is chosen (file dialogs open regardless)
    list.addEventListener('click', () => setTimeout(closeAllMenus, 0));
}
setupMenu('importMenuBtn', 'importMenuList');
setupMenu('exportMenuBtn', 'exportMenuList');
document.addEventListener('click', closeAllMenus);
