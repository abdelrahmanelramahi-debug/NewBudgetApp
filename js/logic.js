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
            if (item.label === _foodBaseLabel || item.label === _weeklyMiscLabel) return;
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

    const weeklyAmt = getWeeklyConfigAmount();
    const currentWeekBalance = Math.max(0, state.accounts.weekly.balance || 0);
    const remainingWeeks = Math.max(0, WEEKLY_MAX_WEEKS - (state.accounts.weekly.week || 1));
    const outstandingWeeks = remainingWeeks * weeklyAmt;

    items.push({ label: 'Weekly (Current Week)', amount: currentWeekBalance });
    totalLiquid += currentWeekBalance;

    if (outstandingWeeks > 0) {
        items.push({ label: 'Weekly (Outstanding)', amount: outstandingWeeks, meta: `${remainingWeeks} week${remainingWeeks === 1 ? '' : 's'}` });
        totalLiquid += outstandingWeeks;
    }

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
