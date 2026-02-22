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

function getCurrencyLabel() {
    return (typeof state !== 'undefined' && state.settings && state.settings.currency) ? state.settings.currency : 'AED';
}

if (typeof window !== 'undefined') {
    window.formatMoney = formatMoney;
    window.formatSignedMoney = formatSignedMoney;
    window.getCurrencyLabel = getCurrencyLabel;
}
