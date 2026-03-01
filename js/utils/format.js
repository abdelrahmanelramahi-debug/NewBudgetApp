/**
 * Formatting utilities. Depends on global `state` (load after state.js).
 * Single source for currency and number display to avoid duplication.
 */

function formatMoney(value, decimalsOverride) {
    var decimals = Number.isInteger(decimalsOverride)
        ? decimalsOverride
        : (typeof state !== 'undefined' && typeof state.settings?.decimals === 'number' ? state.settings.decimals : 2);
    var num = Number(value) || 0;
    return num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatSignedMoney(value) {
    var prefix = value >= 0 ? '+' : '';
    return prefix + formatMoney(value);
}

/** Compact format for tight spaces (e.g. header): "+1.2K", "-500", "0" */
function formatCompactSignedMoney(value) {
    var num = Number(value) || 0;
    var prefix = num >= 0 ? '+' : '';
    var abs = Math.abs(num);
    if (abs >= 1000000) return prefix + (abs / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (abs >= 1000) return prefix + (abs / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return prefix + formatMoney(num);
}

function getCurrencyLabel() {
    return (typeof state !== 'undefined' && state.settings && state.settings.currency) ? state.settings.currency : 'AED';
}

if (typeof window !== 'undefined') {
    window.formatMoney = formatMoney;
    window.formatSignedMoney = formatSignedMoney;
    window.formatCompactSignedMoney = formatCompactSignedMoney;
    window.getCurrencyLabel = getCurrencyLabel;
}
