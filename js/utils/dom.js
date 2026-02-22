/**
 * DOM utilities: cached getElementById, cache clear, and safe HTML/attribute escaping.
 * Use escapeAttr for attribute values, escapeHtml for text content to avoid XSS.
 */

var _domCache = {};

function getEl(id) {
    if (!_domCache[id]) _domCache[id] = document.getElementById(id);
    return _domCache[id];
}

function clearDomCache() {
    _domCache = {};
}

function escapeHtml(s) {
    if (s == null) return '';
    var str = String(s);
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function escapeAttr(s) {
    if (s == null) return '';
    var str = String(s);
    return str
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

if (typeof window !== 'undefined') {
    window.getEl = getEl;
    window.clearDomCache = clearDomCache;
    window.escapeHtml = escapeHtml;
    window.escapeAttr = escapeAttr;
}
