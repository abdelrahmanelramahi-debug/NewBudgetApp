// --- LOGIC: balances and liquidity (depends on constants.js, state.js) ---
var _generalSavingsLabel = ITEM_LABELS.GENERAL_SAVINGS;
var _payablesLabel = ITEM_LABELS.PAYABLES;
var _foodBaseLabel = ITEM_LABELS.FOOD_BASE;
var _weeklyMiscLabel = ITEM_LABELS.WEEKLY_MISC;

/** Total of all savings buckets (or legacy single bucket). */
function getSavingsTotal() {
    const buckets = state.accounts?.savingsBuckets;
    if (!buckets) return state.accounts?.buckets?.[_generalSavingsLabel] ?? 0;
    return Object.values(buckets).reduce((sum, val) => sum + (val || 0), 0);
}

/** Total of all payables buckets (or legacy single bucket). */
function getPayablesTotal() {
    const buckets = state.accounts?.payablesBuckets;
    if (!buckets) return state.accounts?.buckets?.[_payablesLabel] ?? 0;
    return Object.values(buckets).reduce((sum, val) => sum + (val || 0), 0);
}

/** Total of all transportation buckets (or legacy single bucket). */
function getTransportationTotal() {
    const buckets = state.accounts?.transportationBuckets;
    if (!buckets) return state.accounts?.buckets?.['Transportation'] ?? 0;
    return Object.values(buckets).reduce((sum, val) => sum + (val || 0), 0);
}

/** Current balance for an item (savings/payables/transportation/buckets/ledger). */
function getItemBalance(label, fallback = 0) {
    if (label === _generalSavingsLabel) {
        return getSavingsTotal();
    }
    if (label === _payablesLabel) {
        return getPayablesTotal();
    }
    if (label === 'Transportation') {
        return getTransportationTotal();
    }
    if (isAccountLabel(label)) {
        return state.accounts?.buckets?.[label] ?? fallback;
    }
    return state.balances?.[label] !== undefined ? state.balances[label] : fallback;
}

/** Full liquidity breakdown: surplus, buckets, ledger, weekly, food remainder/buffer. Used for bank balance bar and current balance. */
function getLiquidityBreakdown() {
    let totalLiquid = 0;
    const items = [];

    items.push({
        label: 'Extra (Unallocated)',
        amount: state.accounts?.surplus || 0
    });
    totalLiquid += state.accounts?.surplus || 0;

    ensureWeeklyState();

    state.categories.forEach(sec => {
        sec.items.forEach(item => {
            if (item.label === _foodBaseLabel || item.label === 'Food Base' || item.label === _weeklyMiscLabel) return;
            if (item.label === _generalSavingsLabel && state.accounts?.savingsBuckets) {
                Object.entries(state.accounts.savingsBuckets).forEach(([key, amount]) => {
                    items.push({ label: `Savings: ${key}`, amount: amount });
                    totalLiquid += amount;
                });
                return;
            }
            if (item.label === _payablesLabel && state.accounts?.payablesBuckets) {
                Object.entries(state.accounts.payablesBuckets).forEach(([key, amount]) => {
                    items.push({ label: `Payables: ${key}`, amount: amount });
                    totalLiquid += amount;
                });
                return;
            }
            if (item.label === 'Transportation' && state.accounts?.transportationBuckets) {
                Object.entries(state.accounts.transportationBuckets).forEach(([key, amount]) => {
                    items.push({ label: `Transportation: ${key}`, amount: amount });
                    totalLiquid += amount;
                });
                return;
            }

            const currentVal = getItemBalance(item.label, item.amount);
            items.push({ label: item.label, amount: currentVal });
            totalLiquid += currentVal;
        });
    });

    // Each week has its own balance; total weekly = sum of all 4 (so bank balance doesn't change when switching weeks)
    const week1 = Math.max(0, (state.accounts.weekly.balances && state.accounts.weekly.balances[0]) || 0);
    const week2 = Math.max(0, (state.accounts.weekly.balances && state.accounts.weekly.balances[1]) || 0);
    const week3 = Math.max(0, (state.accounts.weekly.balances && state.accounts.weekly.balances[2]) || 0);
    const week4 = Math.max(0, (state.accounts.weekly.balances && state.accounts.weekly.balances[3]) || 0);
    const totalWeekly = week1 + week2 + week3 + week4;

    items.push({ label: 'Weekly Allowance (all weeks)', amount: totalWeekly, meta: 'Week 1–4' });
    totalLiquid += totalWeekly;

    // Food Remainder calculation logic
    const { daysLeft, remainder } = getFoodRemainderInfo();
    items.push({ label: 'Food Remainder', amount: remainder, meta: `${daysLeft} days` });
    totalLiquid += remainder;

    // Food Buffer (locked funds)
    const locked = state.food?.lockedAmount || 0;
    if (locked > 0) {
        items.push({ label: 'Food Buffer', amount: locked, meta: 'Locked' });
        totalLiquid += locked;
    }

    return { totalLiquid, items };
}

/** Sum of all liquid balances (for header “reality” and bank bar total). */
function getCurrentBalance() {
    return getLiquidityBreakdown().totalLiquid;
}

/** Derive surplus from "reality" (sum of ledger balances) so total liquid matches. Call when surplus is 0 but we have balances/buckets. */
function recalculateSurplusFromReality() {
    if (!state.accounts) return;
    var balances = state.balances || {};
    var reality = Object.values(balances).reduce(function (sum, v) { return sum + (Number(v) || 0); }, 0);
    var lb = getLiquidityBreakdown();
    var allocated = lb.totalLiquid - (state.accounts.surplus || 0);
    state.accounts.surplus = reality - allocated;
}
