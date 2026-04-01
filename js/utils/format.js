/**
 * Formatting utilities. Depends on global `state` (load after state.js).
 * Single source for currency and number display to avoid duplication.
 */

/** All money amounts are stored and compared as cent precision (2 decimals). */
function roundMoney(value) {
    var n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100) / 100;
}

function parseMoney(value) {
    return roundMoney(parseFloat(value));
}

/** Limit fractional digits while typing (paste-safe). Keeps leading "-" and trailing "." for partial input. */
function clampMoneyInputString(raw, maxDecimals) {
    maxDecimals = maxDecimals == null ? 2 : maxDecimals;
    raw = String(raw ?? '');
    if (raw === '' || raw === '-' || raw === '.' || raw === '-.') return raw;
    var neg = raw[0] === '-';
    var body = neg ? raw.slice(1) : raw;
    var dot = body.indexOf('.');
    if (dot === -1) return raw;
    var next = body.slice(0, dot + 1 + maxDecimals);
    return neg ? '-' + next : next;
}

/**
 * Round all monetary fields in global `state` after load/import (eliminates float drift).
 */
function normalizeMoneyPrecision() {
    if (typeof state === 'undefined') return;
    state.monthlyIncome = roundMoney(state.monthlyIncome);
    if (state.accounts) {
        if (typeof state.accounts.surplus === 'number') state.accounts.surplus = roundMoney(state.accounts.surplus);
        if (state.accounts.buckets) {
            Object.keys(state.accounts.buckets).forEach(function (k) {
                state.accounts.buckets[k] = roundMoney(state.accounts.buckets[k]);
            });
        }
        if (state.accounts.savingsBudgetPlan) {
            Object.keys(state.accounts.savingsBudgetPlan).forEach(function (k) {
                state.accounts.savingsBudgetPlan[k] = roundMoney(state.accounts.savingsBudgetPlan[k]);
            });
        }
        function roundBucketMap(map) {
            if (!map) return;
            Object.keys(map).forEach(function (k) {
                map[k] = roundMoney(map[k]);
            });
        }
        roundBucketMap(state.accounts.savingsBuckets);
        roundBucketMap(state.accounts.payablesBuckets);
        roundBucketMap(state.accounts.transportationBuckets);
        if (typeof state.accounts.weekly.balance === 'number') {
            state.accounts.weekly.balance = roundMoney(state.accounts.weekly.balance);
        }
    }
    if (state.food && typeof state.food.lockedAmount === 'number') {
        state.food.lockedAmount = roundMoney(state.food.lockedAmount);
    }
    if (state.balances) {
        Object.keys(state.balances).forEach(function (k) {
            state.balances[k] = roundMoney(state.balances[k]);
        });
    }
    (state.categories || []).forEach(function (sec) {
        (sec.items || []).forEach(function (item) {
            if (typeof item.amount === 'number') item.amount = roundMoney(item.amount);
            if (item.amortData && typeof item.amortData.total === 'number') {
                item.amortData.total = roundMoney(item.amortData.total);
            }
        });
    });
}

function formatMoney(value, decimalsOverride) {
    var decimals = Number.isInteger(decimalsOverride) ? decimalsOverride : 2;
    var num = roundMoney(Number(value) || 0);
    return num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Two decimals, no grouping — safe for text inputs and parseFloat. */
function formatMoneyPlain(value) {
    return roundMoney(Number(value) || 0).toFixed(2);
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
    window.roundMoney = roundMoney;
    window.parseMoney = parseMoney;
    window.clampMoneyInputString = clampMoneyInputString;
    window.normalizeMoneyPrecision = normalizeMoneyPrecision;
    window.formatMoney = formatMoney;
    window.formatMoneyPlain = formatMoneyPlain;
    window.formatSignedMoney = formatSignedMoney;
    window.formatCompactSignedMoney = formatCompactSignedMoney;
    window.getCurrencyLabel = getCurrencyLabel;
}
