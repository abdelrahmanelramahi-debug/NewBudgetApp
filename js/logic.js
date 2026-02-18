// --- LOGIC ---
var _generalSavingsLabel = typeof ITEM_LABELS !== 'undefined' ? ITEM_LABELS.GENERAL_SAVINGS : 'General Savings';
var _foodBaseLabel = typeof ITEM_LABELS !== 'undefined' ? ITEM_LABELS.FOOD_BASE : 'Daily Food';
var _weeklyMiscLabel = typeof ITEM_LABELS !== 'undefined' ? ITEM_LABELS.WEEKLY_MISC : 'Weekly Misc';

function getSavingsTotal() {
    const buckets = state.accounts?.savingsBuckets;
    if (!buckets) return state.accounts?.buckets?.[_generalSavingsLabel] ?? 0;
    return Object.values(buckets).reduce((sum, val) => sum + (val || 0), 0);
}

function getItemBalance(label, fallback = 0) {
    if (label === _generalSavingsLabel) {
        return getSavingsTotal();
    }
    if (isAccountLabel(label)) {
        return state.accounts?.buckets?.[label] ?? fallback;
    }
    return state.balances?.[label] !== undefined ? state.balances[label] : fallback;
}

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
