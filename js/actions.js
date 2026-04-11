/**
 * User actions: income, state transactions (applyTransaction), deficit, tools/transfers,
 * savings/payables buckets, weekly, food, settings, export/import, danger/delete, amortization, add item/category.
 * Depends on: constants, state, logic, utils (format), ui.
 */

// --- INCOME LOGIC ---
function ensureEditControlBeforeMutation() {
    if (!window.currentUser) return true;
    if (typeof window.canEditNow === 'function' && window.canEditNow()) return true;
    if (typeof window.promptEditLockTakeover === 'function') window.promptEditLockTakeover();
    else if (typeof window.showAppAlert === 'function') window.showAppAlert('This device is in view-only mode. Resume control to edit.');
    return false;
}

function updateIncome(val) {
    if (!ensureEditControlBeforeMutation()) return;
    const raw = parseFloat(val);
    if (!isNaN(raw)) {
        state.monthlyIncome = typeof parseMoney === 'function' ? parseMoney(val) : Math.round(raw * 100) / 100;
        renderStrategy();
        saveState();
        if (typeof updateBudgetPlanAllocated === 'function') updateBudgetPlanAllocated();
    }
}

// Refactor hotspot notes:
// - Many actions repeat save -> render/update chains.
// - Savings/Transportation/Payables share near-identical bucket mutations.
// Keep wrapper/global API names stable and centralize shared internals only.
function commitUI(profile) {
    saveState();
    if (profile === 'ledger') return renderLedger();
    if (profile === 'strategy') return renderStrategy();
    if (profile === 'global') return updateGlobalUI();
    if (profile === 'ledgerGlobal') {
        renderLedger();
        return updateGlobalUI();
    }
    if (profile === 'strategyGlobal') {
        renderStrategy();
        return updateGlobalUI();
    }
    if (profile === 'refresh') return refreshUI();
}

function commitFullRefresh() {
    return commitUI('refresh');
}

function commitLedgerAndGlobal() {
    return commitUI('ledgerGlobal');
}

function commitStrategyAndGlobal() {
    return commitUI('strategyGlobal');
}

function getBucketStoreMeta(kind) {
    if (kind === 'savings') {
        return {
            bucketsKey: 'savingsBuckets',
            defaultBucketKey: 'savingsDefaultBucket',
            defaultBucketName: 'General Savings',
            syncTotal: syncSavingsTotal
        };
    }
    if (kind === 'payables') {
        return {
            bucketsKey: 'payablesBuckets',
            defaultBucketKey: 'payablesDefaultBucket',
            defaultBucketName: 'Main',
            syncTotal: syncPayablesTotal
        };
    }
    if (kind === 'transportation') {
        return {
            bucketsKey: 'transportationBuckets',
            defaultBucketKey: 'transportationDefaultBucket',
            defaultBucketName: 'Main',
            syncTotal: syncTransportationTotal
        };
    }
    return null;
}

function creditBucketStore(kind, amount) {
    ensureAccountsState();
    var meta = getBucketStoreMeta(kind);
    if (!meta) return;
    var buckets = state.accounts[meta.bucketsKey];
    var target = state.accounts[meta.defaultBucketKey] || meta.defaultBucketName;
    if (buckets[target] === undefined) buckets[target] = 0;
    buckets[target] += amount;
    meta.syncTotal();
}

function debitBucketStore(kind, amount) {
    ensureAccountsState();
    var meta = getBucketStoreMeta(kind);
    if (!meta) return;
    var buckets = state.accounts[meta.bucketsKey];
    var target = state.accounts[meta.defaultBucketKey] || meta.defaultBucketName;
    var keys = Object.keys(buckets);
    var order = [target].concat(keys.filter(function (key) { return key !== target; }));
    var remaining = amount;
    order.forEach(function (key) {
        if (remaining <= 0) return;
        var available = buckets[key] || 0;
        var take = Math.min(available, remaining);
        buckets[key] = available - take;
        remaining -= take;
    });
    meta.syncTotal();
}

// --- STATE TRANSACTIONS ---
function ensureGeneralSavingsBudgetConfig() {
    if (!state.accounts) return;
    var fixedName = 'General Savings';
    var isAlias = function (name) {
        return String(name || '').trim().toLowerCase() === 'savings';
    };
    var buckets = state.accounts.savingsBuckets || {};
    // Keep migration idempotent: do not sum legacy Main + canonical values repeatedly.
    var hasGeneral = buckets[fixedName] !== undefined;
    var hasMain = buckets.Main !== undefined;
    var aliasKey = null;
    Object.keys(buckets).forEach(function (key) {
        if (aliasKey) return;
        if (isAlias(key)) aliasKey = key;
    });
    var hasLegacySavingsAlias = aliasKey !== null;
    var moved = 0;
    if (hasGeneral) moved = Number(buckets[fixedName]) || 0;
    else if (hasMain) moved = Number(buckets.Main) || 0;
    else if (hasLegacySavingsAlias) moved = Number(buckets[aliasKey]) || 0;
    if (hasMain) delete buckets.Main;
    if (hasLegacySavingsAlias) delete buckets[aliasKey];
    buckets[fixedName] = moved;
    var ordered = {};
    ordered[fixedName] = Number(buckets[fixedName]) || 0;
    Object.keys(buckets).forEach(function (k) {
        if (k === fixedName) return;
        ordered[k] = Number(buckets[k]) || 0;
    });
    state.accounts.savingsBuckets = ordered;
    state.accounts.savingsDefaultBucket = fixedName;
    if (!state.accounts.savingsBudgetPlan || typeof state.accounts.savingsBudgetPlan !== 'object') {
        state.accounts.savingsBudgetPlan = {};
    }
    var plans = {};
    plans[fixedName] =
        Number(state.accounts.savingsBudgetPlan[fixedName]) ||
        Number(state.accounts.savingsBudgetPlan.Main) ||
        Number(state.accounts.savingsBudgetPlan.Savings) ||
        0;
    Object.keys(state.accounts.savingsBudgetPlan || {}).forEach(function (key) {
        if (!isAlias(key)) return;
        if (key === fixedName) return;
        if (plans[fixedName] > 0) return;
        plans[fixedName] = Number(state.accounts.savingsBudgetPlan[key]) || 0;
    });
    Object.keys(ordered).forEach(function (k) {
        if (k === fixedName) return;
        plans[k] = Number(state.accounts.savingsBudgetPlan[k]) || 0;
    });
    state.accounts.savingsBudgetPlan = plans;
}

function ensureAccountsState() {
    if (!state.accounts) {
        state.accounts = { surplus: 0, weekly: { balance: getWeeklyConfigAmount(), week: 1 }, buckets: {} };
    }
    if (!state.accounts.weekly) {
        state.accounts.weekly = { balance: getWeeklyConfigAmount(), week: 1 };
    }
    if (!state.accounts.buckets) state.accounts.buckets = {};
    if (!state.accounts.savingsBuckets) {
        const seed = state.accounts.buckets['Savings'] ?? 0;
        state.accounts.savingsBuckets = { 'General Savings': seed };
    }
    if (!state.accounts.savingsDefaultBucket) {
        state.accounts.savingsDefaultBucket = 'General Savings';
    }
    if (!state.accounts.savingsBudgetPlan) {
        state.accounts.savingsBudgetPlan = { 'General Savings': 0 };
    }
    if (!state.accounts.payablesBuckets) {
        const seed = state.accounts.buckets['Payables'] ?? 0;
        state.accounts.payablesBuckets = { Main: seed };
    }
    if (!state.accounts.payablesDefaultBucket) {
        state.accounts.payablesDefaultBucket = 'Main';
    }
    if (!state.accounts.transportationBuckets) {
        const seed = state.accounts.buckets['Transportation'] ?? 0;
        state.accounts.transportationBuckets = { Main: seed };
    }
    if (!state.accounts.transportationDefaultBucket) {
        state.accounts.transportationDefaultBucket = 'Main';
    }
    ensureGeneralSavingsBudgetConfig();
    if (typeof normalizePaycheckPriorityOrder === 'function') normalizePaycheckPriorityOrder();
}

function setItemBalance(label, value) {
    ensureAccountsState();
    if (label === 'Savings') {
        const target = state.accounts.savingsDefaultBucket || 'General Savings';
        if (state.accounts.savingsBuckets[target] === undefined) {
            state.accounts.savingsBuckets[target] = 0;
        }
        state.accounts.savingsBuckets[target] = value;
        syncSavingsTotal();
    } else if (label === 'Payables') {
        const target = state.accounts.payablesDefaultBucket || 'Main';
        if (state.accounts.payablesBuckets[target] === undefined) {
            state.accounts.payablesBuckets[target] = 0;
        }
        state.accounts.payablesBuckets[target] = value;
        syncPayablesTotal();
    } else if (label === 'Transportation') {
        const target = state.accounts.transportationDefaultBucket || 'Main';
        if (state.accounts.transportationBuckets[target] === undefined) {
            state.accounts.transportationBuckets[target] = 0;
        }
        state.accounts.transportationBuckets[target] = value;
        syncTransportationTotal();
    } else if (isAccountLabel(label)) {
        state.accounts.buckets[label] = value;
    } else {
        state.balances[label] = value;
    }
    if (label === 'Daily Food' && typeof ensureFoodFundingState === 'function') {
        ensureFoodFundingState();
    }
}

function removeItemBalance(label) {
    if (isAccountLabel(label)) {
        // Keep account buckets, zero them instead of deleting
        ensureAccountsState();
        if (label === 'Savings') {
            Object.keys(state.accounts.savingsBuckets).forEach(key => {
                state.accounts.savingsBuckets[key] = 0;
            });
            syncSavingsTotal();
        } else if (label === 'Payables') {
            Object.keys(state.accounts.payablesBuckets).forEach(key => {
                state.accounts.payablesBuckets[key] = 0;
            });
            syncPayablesTotal();
        } else if (label === 'Transportation') {
            Object.keys(state.accounts.transportationBuckets).forEach(key => {
                state.accounts.transportationBuckets[key] = 0;
            });
            syncTransportationTotal();
        } else {
            state.accounts.buckets[label] = 0;
        }
    } else if (state.balances[label] !== undefined) {
        delete state.balances[label];
    }
}

/** Find first category item with this label (balances are keyed by label). */
function getItemByLabel(label) {
    if (!label || !Array.isArray(state.categories)) return null;
    for (var si = 0; si < state.categories.length; si++) {
        var sec = state.categories[si];
        if (!sec || !Array.isArray(sec.items)) continue;
        for (var ii = 0; ii < sec.items.length; ii++) {
            var it = sec.items[ii];
            if (it && it.label === label) return { sec: sec, item: it, idx: ii };
        }
    }
    return null;
}

/** True when item has a split savings goal and ledger balance is still below the goal total. */
function isSplitGoalLocked(label) {
    var found = getItemByLabel(label);
    if (!found || !found.item.amortData) return false;
    var goal = Number(found.item.amortData.total);
    if (!goal || goal <= 0) return false;
    var bal = getItemBalance(label, 0);
    return bal < goal - 0.005;
}

function adjustItemBalance(label, delta) {
    if (label === 'Savings') {
        adjustSavingsTotal(delta);
        return;
    }
    if (label === 'Payables') {
        adjustPayablesTotal(delta);
        return;
    }
    if (label === 'Transportation') {
        adjustTransportationTotal(delta);
        return;
    }
    const current = getItemBalance(label, 0);
    setItemBalance(label, current + delta);
}

function syncSavingsTotal() {
    ensureAccountsState();
    state.accounts.buckets['Savings'] = getSavingsTotal();
}

function syncPayablesTotal() {
    ensureAccountsState();
    state.accounts.buckets['Payables'] = getPayablesTotal();
}

function syncTransportationTotal() {
    ensureAccountsState();
    state.accounts.buckets['Transportation'] = getTransportationTotal();
}

function adjustPayablesTotal(delta) {
    if (delta === 0) return;
    if (delta > 0) {
        creditPayables(delta);
    } else {
        debitPayables(Math.abs(delta));
    }
}

function creditPayables(amount) {
    creditBucketStore('payables', amount);
}

function debitPayables(amount) {
    debitBucketStore('payables', amount);
}

function adjustSavingsTotal(delta) {
    if (delta === 0) return;
    if (delta > 0) {
        creditSavings(delta);
    } else {
        debitSavings(Math.abs(delta));
    }
}

function creditSavings(amount) {
    creditBucketStore('savings', amount);
}

function debitSavings(amount) {
    debitBucketStore('savings', amount);
}

function adjustTransportationTotal(delta) {
    if (delta === 0) return;
    if (delta > 0) {
        creditTransportation(delta);
    } else {
        debitTransportation(Math.abs(delta));
    }
}

function creditTransportation(amount) {
    creditBucketStore('transportation', amount);
}

function debitTransportation(amount) {
    debitBucketStore('transportation', amount);
}

function applyTransaction(tx) {
    if (!ensureEditControlBeforeMutation()) return false;
    ensureAccountsState();

    switch (tx.type) {
        case 'adjust_surplus':
            state.accounts.surplus += tx.delta;
            break;
        case 'adjust_item_balance':
            adjustItemBalance(tx.label, tx.delta);
            break;
        case 'set_item_balance':
            setItemBalance(tx.label, tx.value);
            break;
        case 'transfer': {
            const toWeekMatch = tx.to && String(tx.to).match(/^weekly_week_([1-4])$/);
            if (toWeekMatch) {
                const toWeek = parseInt(toWeekMatch[1], 10);
                if (tx.from === 'Surplus') {
                    state.accounts.surplus -= tx.amount;
                } else if (tx.from === 'Weekly Allowance') {
                    setWeeklyBalance(state.accounts.weekly.week, getWeeklyBalance() - tx.amount);
                } else {
                    adjustItemBalance(tx.from, -tx.amount);
                }
                setWeeklyBalance(toWeek, getWeeklyBalance(toWeek) + tx.amount);
                break;
            }
            if (tx.from === 'Surplus') {
                state.accounts.surplus -= tx.amount;
            } else {
                adjustItemBalance(tx.from, -tx.amount);
                if (tx.from === 'Weekly Allowance') {
                    setWeeklyBalance(state.accounts.weekly.week, getWeeklyBalance() - tx.amount);
                }
            }
            if (tx.to === 'Surplus') {
                state.accounts.surplus += tx.amount;
            } else {
                adjustItemBalance(tx.to, tx.amount);
                if (tx.to === 'Weekly Allowance') {
                    setWeeklyBalance(state.accounts.weekly.week, getWeeklyBalance() + tx.amount);
                }
            }
            break;
        }
        case 'add_item': {
            const sec = state.categories.find(s=>s.id===tx.sid);
            if (!sec) break;
            const splitMonths = Math.max(1, Math.floor(Number(tx.splitMonths) || 1));
            const totalPrice = Number(tx.totalPrice);
            const expectedPaymentDay = typeof normalizeExpectedPaymentDay === 'function'
                ? normalizeExpectedPaymentDay(tx.expectedPaymentDay)
                : null;
            const useSplit =
                tx.splitMonths != null &&
                splitMonths > 1 &&
                !Number.isNaN(totalPrice) &&
                totalPrice > 0;
            if (useSplit) {
                const rm = typeof roundMoney === 'function' ? roundMoney : function (x) { return Math.round(Number(x) * 100) / 100; };
                const monthly = rm(totalPrice / splitMonths);
                sec.items.push({
                    label: tx.label,
                    amount: monthly,
                    amortData: { total: rm(totalPrice), months: splitMonths },
                    expectedPaymentDay: expectedPaymentDay || undefined
                });
                setItemBalance(tx.label, 0);
            } else {
                const amt = typeof roundMoney === 'function' ? roundMoney(tx.amount) : Number(tx.amount);
                if (Number.isNaN(amt)) break;
                sec.items.push({ label: tx.label, amount: amt, expectedPaymentDay: expectedPaymentDay || undefined });
                state.accounts.surplus -= amt;
                setItemBalance(tx.label, amt);
            }
            break;
        }
        case 'release_split_goal': {
            const take = Math.min(Number(tx.amount) || 0, getItemBalance(tx.label, 0));
            if (take <= 0) break;
            const cur = getItemBalance(tx.label, 0);
            setItemBalance(tx.label, cur - take);
            state.accounts.surplus += take;
            var rel = getItemByLabel(tx.label);
            if (rel && rel.item && rel.item.amortData && getItemBalance(tx.label, 0) <= 0.005) {
                delete rel.item.amortData;
            }
            break;
        }
        case 'delete_item': {
            const sec = state.categories.find(s=>s.id===tx.sid);
            if (!sec) break;
            const item = sec.items[tx.idx];
            if (!item) break;
            const currentBalance = getItemBalance(item.label, item.amount);
            state.accounts.surplus += currentBalance;
            removeItemBalance(item.label);
            sec.items.splice(tx.idx, 1);
            break;
        }
        case 'delete_category': {
            const idx = state.categories.findIndex(s => s.id === tx.sid);
            if (idx === -1) break;
            const sec = state.categories[idx];
            sec.items.forEach(i => {
                const bal = getItemBalance(i.label, i.amount);
                state.accounts.surplus += bal;
                removeItemBalance(i.label);
            });
            state.categories.splice(idx, 1);
            break;
        }
        case 'rename_category': {
            const sec = state.categories.find(s => s.id === tx.sid);
            if (sec) sec.label = tx.label;
            break;
        }
        case 'update_item_amount': {
            const sec = state.categories.find(s => s.id === tx.sid);
            if (!sec) break;
            const item = sec.items[tx.idx];
            if (!item) break;
            const rm = typeof roundMoney === 'function' ? roundMoney : function (x) { return Math.round(Number(x) * 100) / 100; };
            const newVal = rm(tx.amount);
            var prevVal = item.amount;
            item.amount = newVal;
            delete item.amortData;
            if ((item.label === 'Daily Food' || item.label === 'Food Base') && typeof setFoodPlanBudgetAmount === 'function') {
                setFoodPlanBudgetAmount(newVal);
            }
            if (isAccountLabel(item.label)) {
                if (item.label === 'Savings') {
                    ensureGeneralSavingsBudgetConfig();
                    state.accounts.savingsBudgetPlan['General Savings'] = newVal;
                    syncSavingsBudgetPlanItemAmount();
                }
                break;
            }
            // Budget Plan is plan-only: editing amounts must not touch live ledger balances or Extra.
            break;
        }
        case 'update_item_expected_payment_day': {
            const sec = state.categories.find(s => s.id === tx.sid);
            if (!sec) break;
            const item = sec.items[tx.idx];
            if (!item) break;
            const normalizedDay = typeof normalizeExpectedPaymentDay === 'function'
                ? normalizeExpectedPaymentDay(tx.expectedPaymentDay)
                : null;
            if (normalizedDay) item.expectedPaymentDay = normalizedDay;
            else delete item.expectedPaymentDay;
            break;
        }
        case 'weekly_adjust':
            adjustItemBalance('Weekly Allowance', tx.delta);
            setWeeklyBalance(state.accounts.weekly.week, getWeeklyBalance() + tx.delta);
            break;
        case 'food_spend':
            if (typeof ensureFoodConsumedDays === 'function') ensureFoodConsumedDays();
            if (typeof ensureFoodFundingState === 'function') ensureFoodFundingState();
            var list0 = state.food.consumedDays || [];
            var todayDay0 = typeof window.getTodayCycleDay === 'function' ? window.getTodayCycleDay() : 0;
            var spentDay = 0;
            if (todayDay0 > 0 && list0.indexOf(todayDay0) === -1) {
                spentDay = todayDay0;
            } else if (todayDay0 <= 0) {
                spentDay = (state.food.daysUsed || 0) + 1;
                if (spentDay > 28 || list0.indexOf(spentDay) !== -1) {
                    return false;
                }
            } else {
                return false;
            }
            var fundedSpend = (typeof getFoodFundedForDay === 'function') ? getFoodFundedForDay(spentDay) : 0;
            if (fundedSpend <= 0.001) {
                return false;
            }
            var list = list0.slice();
            if (list.indexOf(spentDay) === -1) {
                list.push(spentDay);
                list.sort(function(a, b) { return a - b; });
                state.food.consumedDays = list;
            }
            state.food.daysUsed = (state.food.consumedDays || []).length;
            state.food.history.unshift({type:'spend', amt: fundedSpend});
            if (typeof setFoodFundedForDay === 'function') setFoodFundedForDay(spentDay, 0);
            if (typeof countRedistributedOverflowKeys === 'function' && countRedistributedOverflowKeys() > 0) {
                _recomputeOverflowRedistributionSplit();
            }
            if (typeof ensureFoodFundingState === 'function') ensureFoodFundingState();
            break;
        case 'food_lock':
            state.food.lockedAmount += tx.amount;
            state.food.history.unshift({type:'lock', amt: tx.amount, label: tx.label});
            break;
        case 'food_release_all':
            state.accounts.surplus += state.food.lockedAmount;
            state.food.lockedAmount = 0;
            break;
        case 'food_release_partial':
            // Return a portion of locked food buffer back to Extra without touching consumed days.
            // Amount is precomputed by caller based on daily rate * daysToRelease.
            if (tx.amount > 0 && state.food.lockedAmount > 0) {
                var releaseAmt = Math.min(state.food.lockedAmount, tx.amount);
                state.accounts.surplus += releaseAmt;
                state.food.lockedAmount -= releaseAmt;
                state.food.history.unshift({ type: 'release', amt: releaseAmt, days: tx.days || 0 });
            }
            break;
        case 'food_deficit_raid':
            state.food.history.unshift({type:'deficit', amt: tx.amount});
            break;
        default:
            break;
    }
    return true;
}

// --- REALITY CHECK ---
function openRealityCheck() {
    const { totalLiquid } = getLiquidityBreakdown();
    document.getElementById('rc-system-val').innerText = formatMoney(totalLiquid);
    document.getElementById('rc-user-val').value = '';
    toggleModal('reality-check-modal', true);
}

function closeRealityCheck() { toggleModal('reality-check-modal', false); }

function openLiquidityBreakdown() {
    const { totalLiquid, items } = getLiquidityBreakdown();
    document.getElementById('liquidity-breakdown-total').innerText = formatMoney(totalLiquid);

    const list = document.getElementById('liquidity-breakdown-list');
    list.innerHTML = items.map(item => `
        <div class="flex justify-between items-center p-3 bg-slate-50 rounded-xl">
            <div>
                <span class="block text-xs font-bold text-slate-800">${item.label}</span>
                ${item.meta ? `<span class="text-[10px] text-slate-400">${item.meta}</span>` : ''}
            </div>
            <span class="text-xs font-black text-slate-700">${formatMoney(item.amount)}</span>
        </div>
    `).join('') || '<div class="text-center text-[10px] text-slate-300 py-2">No liquidity items</div>';

    toggleModal('liquidity-breakdown-modal', true);
}

function closeLiquidityBreakdown() { toggleModal('liquidity-breakdown-modal', false); }

function confirmRealityCheck() {
    const userVal = parseFloat(document.getElementById('rc-user-val').value);
    if(isNaN(userVal)) return;
    const { totalLiquid } = getLiquidityBreakdown();
    const delta = userVal - totalLiquid;

    pushToUndo();
    applyTransaction({ type: 'adjust_surplus', delta });
    commitUI('global');
    closeRealityCheck();
}

function renameCategory(sid) {
    const sec = state.categories.find(s => s.id === sid);
    if(!sec) return;
    const newName = prompt("Rename Category:", sec.label);
    if(newName && newName.trim() !== "") {
        pushToUndo();
        applyTransaction({ type: 'rename_category', sid, label: newName.trim() });
        if (typeof normalizePaycheckPriorityOrder === 'function') normalizePaycheckPriorityOrder();
        saveState();
        renderStrategy();
        renderLedger();
    }
}

function deleteCategory(sid) {
    const idx = state.categories.findIndex(s => s.id === sid);
    if(idx === -1) return;
    const sec = state.categories[idx];

    showAppConfirm('Delete category "' + sec.label + '" and refund ' + sec.items.length + ' items to Extra?', function () {
        pushToUndo();
        applyTransaction({ type: 'delete_category', sid });
        if (typeof normalizePaycheckPriorityOrder === 'function') normalizePaycheckPriorityOrder();
        commitStrategyAndGlobal();
    }, null, { confirmLabel: 'Delete' });
}

// --- DRAG FUNCTIONS ---
function handleDragOver(e) { e.preventDefault(); }

function handleItemDragStart(e, sid, idx) {
    dragType = 'item';
    dragSrc = { sid, idx };
    e.stopPropagation();
    e.target.style.opacity = '0.5';
}
function handleItemDrop(e, targetSid, targetIdx) {
    e.preventDefault();
    e.stopPropagation();
    if (dragType === 'item' && dragSrc && dragSrc.sid === targetSid && dragSrc.idx !== targetIdx) {
        pushToUndo();
        const items = state.categories.find(s => s.id === targetSid).items;
        const moved = items.splice(dragSrc.idx, 1)[0];
        items.splice(targetIdx, 0, moved);
        commitUI('strategy');
    }
    dragSrc = null; dragType = null;
}

function handleCatDragStart(e, idx) {
    if(dragType === 'item') return;
    const sec = state.categories[idx];
    if(sec.isSystem) return;
    dragType = 'category';
    dragSrc = { idx };
    e.target.style.opacity = '0.5';
}
function handleCatDrop(e, targetIdx) {
    e.preventDefault();
    if (dragType === 'category' && dragSrc && dragSrc.idx !== targetIdx) {
        pushToUndo();
        const moved = state.categories.splice(dragSrc.idx, 1)[0];
        state.categories.splice(targetIdx, 0, moved);
        commitUI('strategy');
    }
    dragSrc = null; dragType = null;
}

function handlePriorityDragStart(e, priorityId) {
    if (!priorityId) return;
    dragType = 'priority';
    dragSrc = { priorityId: priorityId };
    if (e && e.target && e.target.style) e.target.style.opacity = '0.5';
}

function handlePriorityDragEnd(e) {
    if (e && e.target && e.target.style) e.target.style.opacity = '';
}

function handlePriorityDrop(e, targetPriorityId) {
    e.preventDefault();
    if (dragType !== 'priority' || !dragSrc || !dragSrc.priorityId || !targetPriorityId || dragSrc.priorityId === targetPriorityId) {
        dragSrc = null;
        dragType = null;
        return;
    }
    ensureAccountsState();
    var order = Array.isArray(state.accounts.paycheckPriorityOrder) ? state.accounts.paycheckPriorityOrder.slice() : [];
    if (!order.length) {
        if (typeof normalizePaycheckPriorityOrder === 'function') normalizePaycheckPriorityOrder();
        order = Array.isArray(state.accounts.paycheckPriorityOrder) ? state.accounts.paycheckPriorityOrder.slice() : [];
    }
    var fromIdx = order.indexOf(dragSrc.priorityId);
    var toIdx = order.indexOf(targetPriorityId);
    if (fromIdx === -1 || toIdx === -1) {
        dragSrc = null;
        dragType = null;
        return;
    }
    pushToUndo();
    var moved = order.splice(fromIdx, 1)[0];
    order.splice(toIdx, 0, moved);
    state.accounts.paycheckPriorityOrder = order;
    commitUI('strategy');
    dragSrc = null;
    dragType = null;
}

// --- DEFICIT MANAGEMENT ---
function openDeficitModal() {
    const list = document.getElementById('deficit-list');
    list.innerHTML = '';

    const deficit = Math.abs(state.accounts.surplus);
    ensureWeeklyState();
    const weeklyAvailable = Math.max(0, getWeeklyBalance() || 0);
    if (weeklyAvailable > 0) {
        list.innerHTML += `
            <div class="flex justify-between items-center gap-2 p-3 bg-slate-50 rounded-xl min-w-0">
                <div class="min-w-0 flex-1">
                    <span class="block text-xs font-bold text-slate-800 truncate">Weekly Allowance</span>
                    <span class="text-[10px] text-slate-400">Available: ${formatMoney(weeklyAvailable)}</span>
                </div>
                <button onclick="raidWeekly(${weeklyAvailable})" class="bg-indigo-100 text-indigo-600 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase whitespace-nowrap flex-shrink-0">Use</button>
            </div>
        `;
    }

    const foodInfo = getFoodRemainderInfo();
    if (foodInfo.remainder > 0) {
        const take = Math.min(deficit, foodInfo.remainder);
        const postRemainder = Math.max(0, foodInfo.remainder - take);
        const postPerDay = foodInfo.daysLeft > 0 ? (postRemainder / foodInfo.daysLeft) : 0;
        list.innerHTML += `
            <div class="flex justify-between items-center gap-2 p-3 bg-slate-50 rounded-xl min-w-0">
                <div class="min-w-0 flex-1">
                    <span class="block text-xs font-bold text-slate-800 truncate">Food Remainder</span>
                    <span class="text-[10px] text-slate-400">Before: ${formatMoney(foodInfo.dailyRate)}/day • After: ${formatMoney(postPerDay)}/day</span>
                </div>
                <button onclick="raidFood(${foodInfo.remainder})" class="bg-indigo-100 text-indigo-600 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase whitespace-nowrap flex-shrink-0">Use</button>
            </div>
        `;
    }

    state.categories.forEach(sec => {
        sec.items.forEach(item => {
            if(['Weekly Allowance', 'Daily Food'].includes(item.label)) return;

            if (item.label === 'Savings') {
                ensureAccountsState();
                var generalSavingsKey = (typeof GENERAL_SAVINGS_BUCKET_NAME !== 'undefined' && GENERAL_SAVINGS_BUCKET_NAME) ? GENERAL_SAVINGS_BUCKET_NAME : 'General Savings';
                var generalSavingsBal = Number((state.accounts && state.accounts.savingsBuckets && state.accounts.savingsBuckets[generalSavingsKey]) || 0);
                list.innerHTML += `
                    <div class="flex justify-between items-center gap-2 p-3 bg-slate-50 rounded-xl min-w-0">
                        <div class="min-w-0 flex-1">
                            <span class="block text-xs font-bold text-slate-800 truncate">Savings</span>
                            <span class="text-[10px] text-slate-400">General Savings bucket: ${formatMoney(generalSavingsBal)}</span>
                        </div>
                        <button onclick="raidGeneralSavingsForDeficit()" class="bg-indigo-100 text-indigo-600 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase whitespace-nowrap flex-shrink-0">Use</button>
                    </div>
                `;
                return;
            }

            const bal = getItemBalance(item.label, 0);
            if(bal > 0) {
                if (typeof isSplitGoalLocked === 'function' && isSplitGoalLocked(item.label)) return;
                const safeLabel = String(item.label).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                list.innerHTML += `
                    <div class="flex justify-between items-center gap-2 p-3 bg-slate-50 rounded-xl min-w-0">
                        <div class="min-w-0 flex-1">
                            <span class="block text-xs font-bold text-slate-800 truncate">${item.label}</span>
                            <span class="text-[10px] text-slate-400">Available: ${bal}</span>
                        </div>
                        <button onclick="raidBucket('${safeLabel}', ${bal})" class="bg-indigo-100 text-indigo-600 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase whitespace-nowrap flex-shrink-0">Use</button>
                    </div>
                `;
            }
        });
    });
    toggleModal('deficit-modal', true);
}
function closeDeficitModal() { toggleModal('deficit-modal', false); }

function raidGeneralSavingsForDeficit() {
    ensureAccountsState();
    var generalSavingsKey = (typeof GENERAL_SAVINGS_BUCKET_NAME !== 'undefined' && GENERAL_SAVINGS_BUCKET_NAME) ? GENERAL_SAVINGS_BUCKET_NAME : 'General Savings';
    if (!state.accounts.savingsBuckets) state.accounts.savingsBuckets = {};
    if (state.accounts.savingsBuckets[generalSavingsKey] === undefined) {
        state.accounts.savingsBuckets[generalSavingsKey] = 0;
    }
    const deficit = Math.abs(state.accounts.surplus);
    if (deficit <= 0) return;

    pushToUndo();
    state.accounts.savingsBuckets[generalSavingsKey] = Number(state.accounts.savingsBuckets[generalSavingsKey] || 0) - deficit;
    if (typeof syncSavingsTotal === 'function') syncSavingsTotal();
    applyTransaction({ type: 'adjust_surplus', delta: deficit });

    logHistory('Savings', -deficit, 'Deficit Cover');
    saveState();
    renderLedger();
    if(state.accounts.surplus >= 0) closeDeficitModal();
    else openDeficitModal();
}
window.raidGeneralSavingsForDeficit = raidGeneralSavingsForDeficit;

function raidBucket(label, available) {
    if (typeof isSplitGoalLocked === 'function' && isSplitGoalLocked(label)) {
        if (typeof showAppAlert === 'function') {
            showAppAlert('This line is a locked split goal. Use Unlock early on the ledger, or wait until the goal is reached.');
        }
        return;
    }
    const deficit = Math.abs(state.accounts.surplus);
    const take = Math.min(deficit, available);

    if(take > 0) {
        pushToUndo();
        if(getItemBalance(label, undefined) === undefined) setItemBalance(label, available);
        applyTransaction({ type: 'adjust_item_balance', label, delta: -take });
        applyTransaction({ type: 'adjust_surplus', delta: take });

        logHistory(label, -take, 'Deficit Cover');
        saveState();
        renderLedger();
        if(state.accounts.surplus >= 0) closeDeficitModal();
        else openDeficitModal();
    }
}

function raidWeekly(available) {
    const deficit = Math.abs(state.accounts.surplus);
    const take = Math.min(deficit, available);
    if (take > 0) {
        pushToUndo();
        if(getItemBalance('Weekly Allowance', undefined) === undefined) {
            const fullAmt = getWeeklyConfigAmount() * 4;
            setItemBalance('Weekly Allowance', fullAmt);
        }
        setWeeklyBalance(state.accounts.weekly.week, getWeeklyBalance() - take);
        applyTransaction({ type: 'adjust_item_balance', label: 'Weekly Allowance', delta: -take });
        applyTransaction({ type: 'adjust_surplus', delta: take });
        logHistory('Weekly Allowance', -take, 'Deficit Cover');
        saveState();
        renderLedger();
        if(state.accounts.surplus >= 0) closeDeficitModal();
        else openDeficitModal();
    }
}

function raidFood(available) {
    const deficit = Math.abs(state.accounts.surplus);
    const take = Math.min(deficit, available);
    if (take > 0) {
        pushToUndo();
        if (typeof ensureFoodFundingState === 'function') ensureFoodFundingState();
        var released = 0;
        var remaining = take;
        var overflowFunded = (state.food && state.food.overflowFunded) ? state.food.overflowFunded : {};
        Object.keys(overflowFunded).sort().reverse().forEach(function (key) {
            if (remaining <= 0.001) return;
            var current = Number(overflowFunded[key]) || 0;
            if (current <= 0) return;
            var cut = Math.min(current, remaining);
            overflowFunded[key] = current - cut;
            if (overflowFunded[key] < 0.001) delete overflowFunded[key];
            remaining -= cut;
            released += cut;
        });
        for (var day = 28; day >= 1 && remaining > 0.001; day--) {
            if ((state.food.consumedDays || []).indexOf(day) !== -1) continue;
            var funded = (typeof getFoodFundedForDay === 'function') ? getFoodFundedForDay(day) : 0;
            if (funded <= 0) continue;
            var sub = Math.min(funded, remaining);
            if (typeof setFoodFundedForDay === 'function') setFoodFundedForDay(day, funded - sub);
            remaining -= sub;
            released += sub;
        }
        if (!state.balances || typeof state.balances !== 'object') state.balances = {};
        state.balances['Daily Food'] = typeof getOutstandingFoodBalanceTotal === 'function'
            ? getOutstandingFoodBalanceTotal()
            : Math.max(0, (Number(state.balances['Daily Food']) || 0) - released);
        if (released > 0) {
            applyTransaction({ type: 'adjust_surplus', delta: released });
            applyTransaction({ type: 'food_deficit_raid', amount: released });
            logHistory('Daily Food', -released, 'Deficit Cover');
        }
        saveState();
        renderLedger();
        if(state.accounts.surplus >= 0) closeDeficitModal();
        else openDeficitModal();
    }
}

// --- MODALS ---
function toggleModal(id, show) {
    const el = document.getElementById(id);
    if(show) { el.classList.remove('hidden'); setTimeout(()=>el.classList.add('modal-open'), 10); }
    else { el.classList.remove('modal-open'); setTimeout(()=>el.classList.add('hidden'), 300); }
}

// DANGER ZONE
function openDangerModal(type, targetId) {
    const input = document.getElementById('danger-input');
    const phraseSpan = document.getElementById('danger-phrase');
    const msg = document.getElementById('danger-msg');

    input.value = '';

    if(type === 'global') {
        requiredDangerPhrase = "DELETE ALL";
        msg.innerText = "You are about to delete ALL budget categories and items. This will wipe your strategy.";
        pendingDangerAction = function() {
            state.categories = [];
            ensureSystemSavings();
            ensureCoreItems();
            state.balances = {};
            ensureAccountsState();
            state.accounts.buckets = {};
            initSurplusFromOpening();
            state.food = { daysTotal: 28, daysUsed: 0, lockedAmount: 0, history: [], viewWeek: 0, fundedAmountByDay: {}, _foodFundingMigrated: true };
            state.accounts.weekly = { balance: getWeeklyConfigAmount(), week: 1 };
            state.histories = {};
        };
    } else if (type === 'section') {
        requiredDangerPhrase = "CLEAR ITEMS";
        msg.innerText = "You are about to remove all items from this category.";
        pendingDangerAction = function() {
            const sec = state.categories.find(s=>s.id === targetId);
            if(sec) {
                sec.items.forEach(i => {
                    const bal = getItemBalance(i.label, i.amount);
                    state.accounts.surplus += bal;
                    removeItemBalance(i.label);
                });
                sec.items = [];
            }
        };
    }

    phraseSpan.innerText = requiredDangerPhrase;
    toggleModal('danger-modal', true);
}

function closeDangerModal() { toggleModal('danger-modal', false); }

function confirmDangerAction() {
    const val = document.getElementById('danger-input').value.toUpperCase();
    if(val === requiredDangerPhrase && pendingDangerAction) {
        pushToUndo();
        pendingDangerAction();
        saveState();
        renderStrategy();
        closeDangerModal();
    } else {
        showAppAlert('Incorrect phrase.');
    }
}

// Add Category
function openAddCategoryTool() {
    document.getElementById('new-cat-label').value = '';
    document.getElementById('new-cat-single').checked = false;
    toggleModal('add-category-tool', true);
}
function closeAddCategoryTool() { toggleModal('add-category-tool', false); }

function confirmAddCategory() {
    const label = document.getElementById('new-cat-label').value;
    const isSingle = document.getElementById('new-cat-single').checked;

    if(label) {
        pushToUndo();
        const newId = 'cat_' + Date.now().toString(36);
        state.categories.push({
            id: newId,
            label: label,
            isLedgerLinked: true,
            isSingleAction: isSingle,
            items: []
        });
        if (typeof normalizePaycheckPriorityOrder === 'function') normalizePaycheckPriorityOrder();
        saveState();
        renderStrategy();
        closeAddCategoryTool();
    }
}

// Edit item (same flow as New Entry: amount + split; one save)
function openAmortTool(sid, idx) {
    currentAmort = { sid: sid, idx: idx };
    const item = state.categories.find(s => s.id === sid).items[idx];
    var labelEl = document.getElementById('amort-label');
    if (labelEl) {
        labelEl.value = item.label;
        var nameLocked = item.isCore || (typeof isAccountLabel === 'function' && isAccountLabel(item.label));
        labelEl.disabled = !!nameLocked;
        labelEl.classList.toggle('opacity-60', !!nameLocked);
    }
    document.getElementById('amort-total').value = typeof formatMoneyPlain === 'function'
        ? formatMoneyPlain(item.amortData ? item.amortData.total : item.amount)
        : String(item.amortData ? item.amortData.total : item.amount);
    var mo = document.getElementById('amort-months');
    if (mo) mo.value = String(item.amortData ? item.amortData.months : 1);
    toggleModal('amortization-tool', true);
    updateAmortCalc();
    if (labelEl && !labelEl.disabled) labelEl.focus();
    else document.getElementById('amort-total').focus();
}

function updateAmortCalc() {
    var totalEl = document.getElementById('amort-total');
    var monthsEl = document.getElementById('amort-months');
    var previewEl = document.getElementById('amort-preview');
    if (!previewEl) return;
    var t = parseFloat(totalEl && totalEl.value);
    var m = Math.max(1, Math.floor(parseFloat(monthsEl && monthsEl.value) || 1));
    if (!totalEl || totalEl.value === '' || isNaN(t) || t <= 0) {
        previewEl.textContent = '—';
        return;
    }
    if (m <= 1) {
        previewEl.textContent = formatMoney(t) + ' ' + (typeof getCurrencyLabel === 'function' ? getCurrencyLabel() : '') + ' / cycle';
        return;
    }
    previewEl.textContent = formatMoney(t / m) + ' ' + (typeof getCurrencyLabel === 'function' ? getCurrencyLabel() : '') + ' / month · ' + m + ' mo';
}

function confirmEditItem() {
    if (!ensureEditControlBeforeMutation()) return;
    if (!currentAmort) return;
    var sec = state.categories.find(function (s) { return s.id === currentAmort.sid; });
    if (!sec) return;
    var item = sec.items[currentAmort.idx];
    if (!item) return;

    var labelInput = document.getElementById('amort-label');
    var newName = (labelInput && !labelInput.disabled && (labelInput.value || '').trim()) || item.label;
    var canRename = !item.isCore && typeof isAccountLabel === 'function' && !isAccountLabel(item.label);
    if (canRename && (!(labelInput && (labelInput.value || '').trim()))) {
        if (typeof showAppAlert === 'function') showAppAlert('Enter an item name.');
        return;
    }

    var t = typeof parseMoney === 'function' ? parseMoney(document.getElementById('amort-total').value) : Math.round((parseFloat(document.getElementById('amort-total').value) || 0) * 100) / 100;
    var m = Math.max(1, Math.floor(parseFloat(document.getElementById('amort-months').value) || 1));
    if (isNaN(t) || t <= 0) return;

    pushToUndo();

    if (canRename && newName !== item.label) {
        var oldLabel = item.label;
        var bal = getItemBalance(oldLabel, item.amount);
        if (state.balances && state.balances[oldLabel] !== undefined) delete state.balances[oldLabel];
        item.label = newName;
        setItemBalance(newName, bal);
    }

    var rm = typeof roundMoney === 'function' ? roundMoney : function (x) { return Math.round(Number(x) * 100) / 100; };
    if (m <= 1) {
        applyTransaction({ type: 'update_item_amount', sid: currentAmort.sid, idx: currentAmort.idx, amount: t });
    } else {
        var newVal = rm(t / m);
        applyTransaction({ type: 'update_item_amount', sid: currentAmort.sid, idx: currentAmort.idx, amount: newVal });
        item.amortData = { total: rm(t), months: m };
    }
    saveState();
    renderStrategy();
    toggleModal('amortization-tool', false);
}

function saveAmortization() {
    confirmEditItem();
}

function applyDirectCost() {
    confirmEditItem();
}

function closeAmortizationTool() { toggleModal('amortization-tool', false); }

// Add Items
function updateAddItemCalc() {
    var totalEl = document.getElementById('new-item-amount');
    var monthsEl = document.getElementById('new-item-split-months');
    var previewEl = document.getElementById('new-item-split-preview');
    if (!previewEl) return;
    var t = parseFloat(totalEl && totalEl.value);
    var m = Math.max(1, Math.floor(parseFloat(monthsEl && monthsEl.value) || 1));
    if (!totalEl || totalEl.value === '' || isNaN(t) || t <= 0) {
        previewEl.textContent = '—';
        return;
    }
    if (m <= 1) {
        previewEl.textContent = formatMoney(t) + ' ' + (typeof getCurrencyLabel === 'function' ? getCurrencyLabel() : '') + ' / cycle';
        return;
    }
    previewEl.textContent = formatMoney(t / m) + ' ' + (typeof getCurrencyLabel === 'function' ? getCurrencyLabel() : '') + ' / month · ' + m + ' mo';
}

function openAddItemTool(sid, opts) {
    opts = opts || {};
    var explicitSid = sid || '';
    document.getElementById('new-item-label').value = '';
    document.getElementById('new-item-amount').value = '';
    populateExpectedPaymentDaySelect(document.getElementById('new-item-payment-day'), null, true);
    var monthsEl = document.getElementById('new-item-split-months');
    if (monthsEl) monthsEl.value = '1';
    var catRow = document.getElementById('new-item-category-row');
    var catSel = document.getElementById('new-item-category');
    var showPicker = opts.showCategoryPicker === true || !explicitSid;
    if (catRow && catSel) {
        catRow.classList.toggle('hidden', !showPicker);
        if (showPicker) {
            catSel.innerHTML = '';
            (state.categories || []).forEach(function (sec) {
                if (!sec || sec.isSystem || sec.id === 'sys_savings' || sec.id === 'core_essentials') return;
                var opt = document.createElement('option');
                opt.value = sec.id;
                opt.textContent = sec.label || sec.id;
                catSel.appendChild(opt);
            });
            if (explicitSid) {
                for (var ci = 0; ci < catSel.options.length; ci++) {
                    if (catSel.options[ci].value === explicitSid) {
                        catSel.selectedIndex = ci;
                        break;
                    }
                }
            }
            currentAddSectionId = catSel.value || '';
            catSel.onchange = function () { currentAddSectionId = this.value; };
        } else {
            currentAddSectionId = explicitSid;
        }
    } else {
        currentAddSectionId = explicitSid;
    }
    updateAddItemCalc();
    toggleModal('add-item-tool', true);
    document.getElementById('new-item-label').focus();
}
function closeAddItemTool() { toggleModal('add-item-tool', false); }
function confirmAddItem() {
    const label = (document.getElementById('new-item-label').value || '').trim();
    const amtRaw = document.getElementById('new-item-amount').value;
    const totalRounded = typeof parseMoney === 'function' ? parseMoney(amtRaw) : Math.round((parseFloat(amtRaw) || 0) * 100) / 100;
    const monthsEl = document.getElementById('new-item-split-months');
    const months = Math.max(1, Math.floor(parseFloat(monthsEl && monthsEl.value) || 1));
    const paymentDayEl = document.getElementById('new-item-payment-day');
    const expectedPaymentDay = paymentDayEl ? normalizeExpectedPaymentDay(paymentDayEl.value) : null;
    var catSel = document.getElementById('new-item-category');
    var catRow = document.getElementById('new-item-category-row');
    if (catRow && !catRow.classList.contains('hidden') && catSel && catSel.value) {
        currentAddSectionId = catSel.value;
    }
    if (!label || isNaN(totalRounded) || totalRounded <= 0 || !currentAddSectionId) return;
    pushToUndo();
    if (months > 1) {
        applyTransaction({ type: 'add_item', sid: currentAddSectionId, label, splitMonths: months, totalPrice: totalRounded, expectedPaymentDay: expectedPaymentDay });
    } else {
        applyTransaction({ type: 'add_item', sid: currentAddSectionId, label, amount: totalRounded, expectedPaymentDay: expectedPaymentDay });
    }
    commitFullRefresh();
    closeAddItemTool();
}

function populateExpectedPaymentDaySelect(selectEl, selectedDay, includeNoneOption) {
    if (!selectEl) return;
    var normalizedDay = typeof normalizeExpectedPaymentDay === 'function'
        ? normalizeExpectedPaymentDay(selectedDay)
        : null;
    var html = '';
    if (includeNoneOption !== false) {
        html += '<option value="">No expected date</option>';
    }
    for (var day = 1; day <= 31; day++) {
        var label = typeof getOrdinalDayLabel === 'function' ? getOrdinalDayLabel(day) : String(day);
        html += '<option value="' + day + '"' + (normalizedDay === day ? ' selected' : '') + '>' + label + ' of each month</option>';
    }
    selectEl.innerHTML = html;
    if (!normalizedDay && includeNoneOption !== false) selectEl.value = '';
}

function openMiniBudgetPaymentDayModal(sid, idx) {
    var sec = (state.categories || []).find(function (entry) { return entry && entry.id === sid; });
    var item = sec && sec.items ? sec.items[idx] : null;
    if (!item) return;
    currentPaymentDayTarget = { sid: sid, idx: idx };
    var titleEl = document.getElementById('mini-budget-payment-day-title');
    var subtitleEl = document.getElementById('mini-budget-payment-day-subtitle');
    var selectEl = document.getElementById('mini-budget-payment-day-select');
    if (titleEl) titleEl.textContent = item.label || 'Mini-budget';
    if (subtitleEl) {
        var status = typeof getExpectedPaymentStatus === 'function' ? getExpectedPaymentStatus(item.expectedPaymentDay) : null;
        subtitleEl.textContent = status
            ? ('Saved for ' + status.nextDateLabel + '. This is a reminder date only and does not change balances.')
            : 'Choose the day of the month you expect this payment.';
    }
    var modal = document.getElementById('mini-budget-payment-day-modal');
    var closeBtn = modal ? modal.querySelector('button[aria-label="Close"]') : null;
    if (closeBtn) closeBtn.textContent = 'x';
    populateExpectedPaymentDaySelect(selectEl, item.expectedPaymentDay, true);
    toggleModal('mini-budget-payment-day-modal', true);
}

function closeMiniBudgetPaymentDayModal() {
    toggleModal('mini-budget-payment-day-modal', false);
}

function applyMiniBudgetPaymentDay() {
    var sid = currentPaymentDayTarget && currentPaymentDayTarget.sid;
    var idx = currentPaymentDayTarget && currentPaymentDayTarget.idx;
    if (sid == null || idx == null) return;
    var selectEl = document.getElementById('mini-budget-payment-day-select');
    var expectedPaymentDay = selectEl ? normalizeExpectedPaymentDay(selectEl.value) : null;
    pushToUndo();
    applyTransaction({ type: 'update_item_expected_payment_day', sid: sid, idx: idx, expectedPaymentDay: expectedPaymentDay });
    saveState();
    if (typeof refreshUI === 'function') refreshUI();
    closeMiniBudgetPaymentDayModal();
}

function clearMiniBudgetPaymentDay() {
    var sid = currentPaymentDayTarget && currentPaymentDayTarget.sid;
    var idx = currentPaymentDayTarget && currentPaymentDayTarget.idx;
    if (sid == null || idx == null) return;
    pushToUndo();
    applyTransaction({ type: 'update_item_expected_payment_day', sid: sid, idx: idx, expectedPaymentDay: null });
    saveState();
    if (typeof refreshUI === 'function') refreshUI();
    closeMiniBudgetPaymentDayModal();
}

/** Move funds from a locked split-goal line to Extra (surplus). Full release clears amortData when balance hits zero. */
function releaseSplitGoalFunds(label) {
    if (!ensureEditControlBeforeMutation()) return;
    if (!isSplitGoalLocked(label)) {
        if (typeof showAppAlert === 'function') showAppAlert('Unlock early applies to active split goals that are still below target.');
        return;
    }
    var bal = getItemBalance(label, 0);
    if (bal <= 0) return;
    pushToUndo();
    applyTransaction({ type: 'release_split_goal', label: label, amount: bal });
    if (typeof logHistory === 'function') logHistory(label, -bal, 'Unlock early');
    commitFullRefresh();
}
window.releaseSplitGoalFunds = releaseSplitGoalFunds;
window.updateAddItemCalc = updateAddItemCalc;
window.openAddItemTool = openAddItemTool;
window.openMiniBudgetPaymentDayModal = openMiniBudgetPaymentDayModal;
window.closeMiniBudgetPaymentDayModal = closeMiniBudgetPaymentDayModal;
window.applyMiniBudgetPaymentDay = applyMiniBudgetPaymentDay;
window.clearMiniBudgetPaymentDay = clearMiniBudgetPaymentDay;

// Delete Items
function openDeleteModal(sid, idx) {
    itemToDelete = {sid, idx};
    toggleModal('delete-modal', true);
}
function closeDeleteModal() { toggleModal('delete-modal', false); }
function confirmDelete() {
    if(itemToDelete) {
        pushToUndo();
        applyTransaction({ type: 'delete_item', sid: itemToDelete.sid, idx: itemToDelete.idx });
        commitFullRefresh();
        closeDeleteModal();
    }
}

// Ledger Actions
function openTool(label, displayTitle, autoTransfer = false, prefillAmount, sid, idx) {
    activeCat = label;
    currentToolItemContext = { sid: sid != null ? sid : null, idx: idx != null ? idx : null };
    document.getElementById('tool-title').innerText = displayTitle || label;
    var toolCloseBtn = document.getElementById('tool-close-btn');
    if (toolCloseBtn) toolCloseBtn.textContent = 'x';

    var amountInput = document.getElementById('tool-value');
    if (label === 'Surplus' && autoTransfer) {
        var headerVal = document.getElementById('surplus-adjust-val');
        if (headerVal && headerVal.value && String(headerVal.value).trim() !== '') {
            amountInput.value = String(headerVal.value).trim();
        } else {
            amountInput.value = '';
        }
    } else if (prefillAmount !== undefined && prefillAmount !== null && String(prefillAmount).trim() !== '') {
        amountInput.value = String(prefillAmount).trim();
    } else {
        amountInput.value = '';
    }

    // Reset UI state
    const std = document.getElementById('tool-actions-standard');
    const trf = document.getElementById('tool-transfer-interface');
    const paymentBtn = document.getElementById('tool-payment-day-btn');

    std.classList.remove('hidden');
    trf.classList.add('hidden');
    if (paymentBtn) {
        var sec = sid != null ? (state.categories || []).find(function (entry) { return entry && entry.id === sid; }) : null;
        var item = (sec && sec.items && idx != null) ? sec.items[idx] : null;
        var shouldShow = !!(item && !item.isCore && label !== 'Savings' && label !== 'Payables' && label !== 'Transportation' && label !== 'Weekly Allowance' && label !== 'Daily Food');
        if (shouldShow) {
            var status = typeof getExpectedPaymentStatus === 'function' ? getExpectedPaymentStatus(item.expectedPaymentDay) : null;
            paymentBtn.textContent = status ? 'Edit expected date' : 'Set expected date';
            paymentBtn.classList.remove('hidden');
            paymentBtn.onclick = function () {
                openMiniBudgetPaymentDayModal(sid, idx);
            };
        } else {
            paymentBtn.classList.add('hidden');
            paymentBtn.onclick = null;
        }
    }

    toggleModal('input-tool', true);
    renderCategoryHistory();

    // Auto Open Transfer Mode if requested
    if(autoTransfer) {
        toggleTransferMode();
    }
}
function closeTool() { toggleModal('input-tool', false); }

function toggleTransferMode() {
    const std = document.getElementById('tool-actions-standard');
    const trf = document.getElementById('tool-transfer-interface');
    const list = document.getElementById('transfer-target-list');

    if(trf.classList.contains('hidden')) {
        std.classList.add('hidden');
        trf.classList.remove('hidden');
        renderTransferTargets(list);
    } else {
        std.classList.remove('hidden');
        trf.classList.add('hidden');
    }
}

function renderTransferTargets(container) {
    container.innerHTML = '';

    // When transferring from Weekly Allowance, show "Transfer to another week" first
    if (activeCat === 'Weekly Allowance') {
        const curWeek = state.accounts.weekly?.week || 1;
        container.innerHTML += `<p class="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Transfer to week</p>`;
        for (let w = 1; w <= WEEKLY_MAX_WEEKS; w++) {
            if (w === curWeek) continue;
            const id = 'weekly_week_' + w;
            const bal = typeof getWeeklyBalance === 'function' ? getWeeklyBalance(w) : 0;
            container.innerHTML += `
                <button onclick="executeTransfer('${id}')" class="w-full text-left p-2.5 rounded-lg border flex justify-between items-center bg-indigo-50 text-indigo-800 border-indigo-200 font-bold text-[11px] mb-1 hover:bg-indigo-100 transition">
                    <span>Week ${w}</span>
                    <span class="opacity-70">${formatMoney(bal)} →</span>
                </button>
            `;
        }
        container.innerHTML += `<div class="h-px bg-slate-200 my-2"></div>`;
    }

    // Define Priority Targets
    const priorities = [
        { id: 'Weekly Allowance', label: 'Weekly Allowance', bg: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
        { id: 'Savings', label: 'Savings', bg: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
        { id: 'Surplus', label: 'Extra (Unallocated)', bg: 'bg-slate-200 text-slate-700 border-slate-300' }
    ];

    // Render Priorities
    priorities.forEach(p => {
        if(p.id !== activeCat) {
            container.innerHTML += `
                <button onclick="executeTransfer('${p.id}')" class="w-full text-left p-3 rounded-lg border flex justify-between items-center ${p.bg} font-bold text-xs mb-1 hover:brightness-95 transition">
                    <span>${p.label}</span>
                    <span class="opacity-50">→</span>
                </button>
            `;
        }
    });

    // Divider
    container.innerHTML += `<div class="h-px bg-slate-200 my-2"></div>`;

    // Render Other Categories
    state.categories.forEach(sec => {
        sec.items.forEach(item => {
            // Skip if it is the current active category, or if it's already in priority list
            if(item.label === activeCat || ['Weekly Allowance', 'Savings'].includes(item.label)) return;
            if(item.label === 'Daily Food') return; // Usually locked/automated

            container.innerHTML += `
                <button onclick="executeTransfer('${item.label}')" class="w-full text-left p-2.5 rounded-lg bg-white border border-slate-200 flex justify-between items-center text-slate-600 font-bold text-[11px] hover:bg-slate-50 transition">
                    <span>${item.label}</span>
                    <span class="text-slate-300">+</span>
                </button>
            `;
        });
    });
}

function executeTransfer(targetId) {
    const val = parseFloat(document.getElementById('tool-value').value);
    if(!val || val <= 0) return;

    if (typeof isSplitGoalLocked === 'function' && isSplitGoalLocked(activeCat)) {
        if (typeof showAppAlert === 'function') {
            showAppAlert('This line is a locked split goal. Reach the target, or use Unlock early on the ledger.');
        }
        return;
    }

    pushToUndo();
    const isTransferToWeek = String(targetId).startsWith('weekly_week_');

    applyTransaction({ type: 'transfer', from: activeCat, to: targetId, amount: val });

    const toLabel = isTransferToWeek ? ('Week ' + (targetId.replace('weekly_week_', ''))) : targetId;
    logHistory(activeCat, -val, 'Trf to ' + toLabel);
    if (targetId !== 'Surplus') {
        logHistory(targetId, val, 'Trf from ' + activeCat);
    }

    saveState();
    if (typeof refreshUI === 'function') refreshUI();
    closeTool();
}

function executeAction(type) {
    const val = parseFloat(document.getElementById('tool-value').value);
    if(val) {
        if (activeCat === 'Surplus') {
            const delta = type === 'deduct' ? -val : val;
            if(!canApplySurplusDelta(delta)) return;
            if(shouldConfirmSurplusEdit()) {
                const actionLabel = type === 'deduct' ? 'deduct' : 'add';
                showAppConfirm('You are about to ' + actionLabel + ' funds directly to Extra. This creates or removes money from thin air. Continue?', function () {
                    pushToUndo();
                    applySurplusOrItemFromTool(type, val);
                });
                return;
            }
        }
        pushToUndo();
        applySurplusOrItemFromTool(type, val);
    }
}

function applySurplusOrItemFromTool(type, val) {
    var mod = type === 'deduct' ? -val : val;
    if (mod < 0 && typeof isSplitGoalLocked === 'function' && isSplitGoalLocked(activeCat)) {
        if (typeof showAppAlert === 'function') {
            showAppAlert('This line is a locked split goal. Reach the target, or use Unlock early on the ledger.');
        }
        return;
    }
    if (activeCat === 'Surplus') {
        applyTransaction({ type: 'adjust_surplus', delta: mod });
    } else {
        applyTransaction({ type: 'adjust_item_balance', label: activeCat, delta: mod });
    }
    logHistory(activeCat, mod, 'Manual');
    saveState();
    if (typeof refreshUI === 'function') refreshUI();
    closeTool();
}

function applyItemAdjustment(label, amountStr, type) {
    var val = parseFloat(amountStr);
    if (!val || val <= 0) return;
    var mod = type === 'deduct' ? -val : val;
    if (mod < 0 && typeof isSplitGoalLocked === 'function' && isSplitGoalLocked(label)) {
        if (typeof showAppAlert === 'function') {
            showAppAlert('This line is a locked split goal. Reach the target, or use Unlock early on the ledger.');
        }
        return;
    }
    pushToUndo();
    applyTransaction({ type: 'adjust_item_balance', label: label, delta: mod });
    logHistory(label, mod, 'Manual');
    saveState();
    if (typeof refreshUI === 'function') refreshUI();
}

function completeTask(label) {
    if (typeof isSplitGoalLocked === 'function' && isSplitGoalLocked(label)) {
        if (typeof showAppAlert === 'function') {
            showAppAlert('Complete is available once this split goal is fully funded.');
        }
        return;
    }
    pushToUndo();
    const current = getItemBalance(label, 0);
    setItemBalance(label, 0);
    var doneItem = getItemByLabel(label);
    if (doneItem && doneItem.item && doneItem.item.amortData) delete doneItem.item.amortData;
    logHistory(label, -current, 'Completed');
    commitUI('ledger');
}

// Food
function spendFoodDay() {
    if (state.food.daysUsed < state.food.daysTotal) {
        if (typeof ensureFoodFundingState === 'function') ensureFoodFundingState();
        var todayDay = typeof window.getTodayCycleDay === 'function' ? window.getTodayCycleDay() : 0;
        var list = state.food.consumedDays || [];
        var targetDay = 0;
        if (todayDay > 0 && list.indexOf(todayDay) === -1) {
            targetDay = todayDay;
        } else if (todayDay <= 0) {
            targetDay = (state.food.daysUsed || 0) + 1;
        }
        if (targetDay > 0 && targetDay <= 28) {
            var fd = (typeof getFoodFundedForDay === 'function') ? getFoodFundedForDay(targetDay) : 0;
            if (fd <= 0.001) {
                if (typeof showAppAlert === 'function') {
                    showAppAlert('No funds allocated for this day yet. Use Paycheck Distribute to fund Daily Food, or Refund Days to restore consumed days.', 'Daily Food');
                }
                return;
            }
        }
        var info = typeof getFoodRemainderInfo === 'function' ? getFoodRemainderInfo() : null;
        var amount = (info && info.dailyRate > 0) ? info.dailyRate : 30;
        pushToUndo();
        if (!applyTransaction({ type: 'food_spend', amount: amount })) {
            return;
        }
        commitLedgerAndGlobal();
    }
}

function setFoodDayFromCalendar(cycleDay, action) {
    var day = Math.max(1, Math.min(28, Math.floor(cycleDay)));
    if (typeof ensureFoodConsumedDays === 'function') ensureFoodConsumedDays();
    if (typeof ensureFoodFundingState === 'function') ensureFoodFundingState();
    var list = state.food.consumedDays || [];
    if (action === 'unmark') {
        if (list.indexOf(day) === -1) return;
    } else {
        if (list.indexOf(day) !== -1) return;
    }
    pushToUndo();
    if (action === 'unmark') {
        state.food.consumedDays = list.filter(function(d) { return d !== day; });
        var core = typeof computeFoodPlanCore === 'function' ? computeFoodPlanCore() : null;
        var dailyRateUnmark = (core && core.dailyRate > 0) ? core.dailyRate : (600 / 28);
        if (typeof setFoodFundedForDay === 'function') setFoodFundedForDay(day, dailyRateUnmark);
        if (typeof countRedistributedOverflowKeys === 'function' && countRedistributedOverflowKeys() > 0) {
            _recomputeOverflowRedistributionSplit();
        }
    } else {
        var funded = (typeof getFoodFundedForDay === 'function') ? getFoodFundedForDay(day) : 0;
        if (funded <= 0.001) {
            if (typeof showAppAlert === 'function') {
                showAppAlert('No funds allocated for this day yet. Use Paycheck Distribute to fund Daily Food.', 'Daily Food');
            }
            return;
        }
        state.food.consumedDays = list.concat([day]).sort(function(a, b) { return a - b; });
        if (typeof setFoodFundedForDay === 'function') setFoodFundedForDay(day, 0);
        if (typeof countRedistributedOverflowKeys === 'function' && countRedistributedOverflowKeys() > 0) {
            _recomputeOverflowRedistributionSplit();
        }
    }
    state.food.daysUsed = state.food.consumedDays.length;
    if (typeof ensureFoodFundingState === 'function') ensureFoodFundingState();
    commitLedgerAndGlobal();
}

// Transfer one day's worth from Daily Food to another category and mark day consumed. Used by food-cycle day popover.
function transferFoodDayTo(cycleDay, targetId) {
    var day = Math.max(1, Math.min(28, Math.floor(cycleDay)));
    if (typeof ensureFoodConsumedDays === 'function') ensureFoodConsumedDays();
    if (typeof ensureFoodFundingState === 'function') ensureFoodFundingState();
    var list = state.food.consumedDays || [];
    if (list.indexOf(day) !== -1) return; // already consumed
    var funded = (typeof getFoodFundedForDay === 'function') ? getFoodFundedForDay(day) : 0;
    var foodBal = (state.balances && state.balances['Daily Food'] !== undefined) ? Number(state.balances['Daily Food']) : 0;
    if (funded <= 0.001) {
        if (typeof showAppAlert === 'function') showAppAlert('No funds allocated for this day yet. Use Paycheck Distribute to fund Daily Food.', 'Daily Food');
        return;
    }
    var amount = Math.min(funded, Math.max(0, foodBal));
    if (amount <= 0) {
        if (typeof showAppAlert === 'function') showAppAlert('No Daily Food balance to transfer.');
        return;
    }
    pushToUndo();
    if (typeof setFoodFundedForDay === 'function') setFoodFundedForDay(day, 0);
    applyTransaction({ type: 'transfer', from: 'Daily Food', to: targetId, amount: amount });
    state.food.consumedDays = list.concat([day]).sort(function(a, b) { return a - b; });
    state.food.daysUsed = state.food.consumedDays.length;
    if (typeof logHistory === 'function') logHistory('Daily Food', -amount, 'Day transfer to ' + targetId);
    commitLedgerAndGlobal();
    if (typeof closeFoodDayTransferPopover === 'function') closeFoodDayTransferPopover();
}
window.transferFoodDayTo = transferFoodDayTo;

function getFoodDayTransferTargets() {
    var targets = [
        { id: 'Surplus', label: 'Extra' },
        { id: 'Savings', label: 'Savings' },
        { id: 'Weekly Allowance', label: 'Weekly Allowance' }
    ];
    (state.categories || []).forEach(function(sec) {
        (sec.items || []).forEach(function(item) {
            if (item.label === 'Daily Food' || item.label === 'Weekly Allowance' || item.label === 'Savings') return;
            targets.push({ id: item.label, label: item.label });
        });
    });
    return targets;
}

// Release one buffer day's value to a destination (used by buffer-day transfer popover).
function transferBufferDayTo(targetId) {
    if (!state.food) return;
    var info = typeof getFoodRemainderInfo === 'function' ? getFoodRemainderInfo() : null;
    var dailyRate = (info && info.dailyRate > 0) ? info.dailyRate : (600 / 28);
    var locked = state.food.lockedAmount || 0;
    if (dailyRate <= 0 || locked < dailyRate) {
        if (typeof showAppAlert === 'function') showAppAlert('No buffer day to transfer.');
        return;
    }
    pushToUndo();
    state.food.lockedAmount = locked - dailyRate;
    state.accounts.surplus += dailyRate;
    if (targetId !== 'Surplus') {
        applyTransaction({ type: 'transfer', from: 'Surplus', to: targetId, amount: dailyRate });
    }
    if (typeof logHistory === 'function') logHistory('Buffer', -dailyRate, 'Released to ' + targetId);
    commitLedgerAndGlobal();
    closeFoodDayTransferPopover();
}
window.transferBufferDayTo = transferBufferDayTo;

function openBufferDayTransferPopover(anchorEl) {
    var pop = document.getElementById('food-day-transfer-popover');
    var container = document.getElementById('food-day-transfer-targets');
    if (!pop || !container) return;
    pop.removeAttribute('data-cycle-day');
    pop.setAttribute('data-buffer', 'true');
    if (anchorEl && anchorEl.closest) {
        var anchor = anchorEl.closest('.food-overview-cell-wrapper');
        if (anchor && anchor.getBoundingClientRect) {
            var rect = anchor.getBoundingClientRect();
            pop.style.left = rect.left + 'px';
            pop.style.top = (rect.bottom + 4) + 'px';
        }
    }
    var targets = getFoodDayTransferTargets();
    container.innerHTML = targets.map(function(t) {
        var safeLabel = String(t.label).replace(/</g, '&lt;').replace(/"/g, '&quot;');
        return '<button type="button" class="food-day-transfer-target-btn block w-full text-left px-2 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 rounded-sm truncate transition-colors" data-target-id="' + String(t.id).replace(/"/g, '&quot;') + '">' + safeLabel + '</button>';
    }).join('');
    pop.classList.remove('hidden');
}
window.openBufferDayTransferPopover = openBufferDayTransferPopover;

function openFoodDayTransferPopover(cycleDay, anchorEl, intoConsumedDay) {
    var pop = document.getElementById('food-day-transfer-popover');
    var container = document.getElementById('food-day-transfer-targets');
    if (!pop || !container) return;
    if (pop) {
        pop.removeAttribute('data-buffer');
        pop.removeAttribute('data-overflow-key');
        pop.removeAttribute('data-transfer-into-day');
    }
    var anchor = anchorEl && anchorEl.closest ? anchorEl.closest('.food-overview-cell-wrapper') : anchorEl;
    if (anchor && anchor.getBoundingClientRect) {
        var rect = anchor.getBoundingClientRect();
        pop.style.left = rect.left + 'px';
        pop.style.top = (rect.bottom + 4) + 'px';
    }
    pop.setAttribute('data-cycle-day', cycleDay);
    var titleEl = pop.querySelector('p');
    if (intoConsumedDay) {
        pop.setAttribute('data-transfer-into-day', 'true');
        if (titleEl) titleEl.textContent = 'From';
        var sources = getDailyFoodBulkSourceOptions();
        container.innerHTML = sources.map(function(s) {
            var safeLabel = String(s.label).replace(/</g, '&lt;').replace(/"/g, '&quot;');
            return '<button type="button" class="food-day-transfer-target-btn block w-full text-left px-2 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 rounded-sm truncate transition-colors" data-source-value="' + String(s.value).replace(/"/g, '&quot;') + '">' + safeLabel + '</button>';
        }).join('');
    } else {
        if (titleEl) titleEl.textContent = 'To';
        var targets = getFoodDayTransferTargets();
        container.innerHTML = targets.map(function(t) {
            var safeLabel = String(t.label).replace(/</g, '&lt;').replace(/"/g, '&quot;');
            return '<button type="button" class="food-day-transfer-target-btn block w-full text-left px-2 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 rounded-sm truncate transition-colors" data-target-id="' + String(t.id).replace(/"/g, '&quot;') + '">' + safeLabel + '</button>';
        }).join('');
    }
    pop.classList.remove('hidden');
}
window.openFoodDayTransferPopover = openFoodDayTransferPopover;

function openFoodOverflowTransferPopover(dayKey, anchorElOrRect) {
    var pop = document.getElementById('food-day-transfer-popover');
    var container = document.getElementById('food-day-transfer-targets');
    if (!pop || !container || !dayKey) return;
    pop.removeAttribute('data-buffer');
    pop.removeAttribute('data-cycle-day');
    pop.removeAttribute('data-transfer-into-day');
    pop.setAttribute('data-overflow-key', dayKey);
    var rect = null;
    if (anchorElOrRect && typeof anchorElOrRect.left === 'number' && typeof anchorElOrRect.bottom === 'number') {
        rect = anchorElOrRect;
    } else if (anchorElOrRect && anchorElOrRect.getBoundingClientRect) {
        rect = anchorElOrRect.getBoundingClientRect();
    } else if (anchorElOrRect && anchorElOrRect.closest) {
        var wrap = anchorElOrRect.closest('.food-overview-cell-wrapper');
        if (wrap && wrap.getBoundingClientRect) rect = wrap.getBoundingClientRect();
    }
    if (rect) {
        pop.style.transform = '';
        pop.style.left = rect.left + 'px';
        pop.style.top = (rect.bottom + 4) + 'px';
    }
    var titleEl = pop.querySelector('p');
    if (titleEl) titleEl.textContent = 'To';
    var targets = getFoodDayTransferTargets();
    container.innerHTML = targets.map(function(t) {
        var safeLabel = String(t.label).replace(/</g, '&lt;').replace(/"/g, '&quot;');
        return '<button type="button" class="food-day-transfer-target-btn block w-full text-left px-2 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 rounded-sm truncate transition-colors" data-target-id="' + String(t.id).replace(/"/g, '&quot;') + '">' + safeLabel + '</button>';
    }).join('');
    pop.classList.remove('hidden');
}
window.openFoodOverflowTransferPopover = openFoodOverflowTransferPopover;

function closeFoodDayTransferPopover() {
    var pop = document.getElementById('food-day-transfer-popover');
    if (pop) {
        pop.classList.add('hidden');
        pop.removeAttribute('data-overflow-key');
        pop.removeAttribute('data-transfer-into-day');
        var titleEl = pop.querySelector('p');
        if (titleEl) titleEl.textContent = 'To';
    }
}
window.closeFoodDayTransferPopover = closeFoodDayTransferPopover;

(function initFoodDayTransferPopover() {
    document.addEventListener('click', function(e) {
        var btn = e.target.closest('.food-day-transfer-target-btn');
        if (btn) {
            var pop = document.getElementById('food-day-transfer-popover');
            if (!pop || pop.classList.contains('hidden')) return;
            if (pop.getAttribute('data-transfer-into-day') === 'true') {
                var sourceValue = btn.getAttribute('data-source-value');
                var cycleDayInto = parseInt(pop.getAttribute('data-cycle-day'), 10);
                if (cycleDayInto && sourceValue) fundConsumedFoodDayFromSource(cycleDayInto, sourceValue);
                return;
            }
            var targetId = btn.getAttribute('data-target-id');
            if (!targetId) return;
            if (pop.getAttribute('data-buffer') === 'true') {
                transferBufferDayTo(targetId);
            } else if (pop.getAttribute('data-overflow-key')) {
                var ovK = pop.getAttribute('data-overflow-key');
                if (ovK && typeof transferFoodOverflowDayTo === 'function') transferFoodOverflowDayTo(ovK, targetId);
            } else {
                var cycleDay = parseInt(pop.getAttribute('data-cycle-day'), 10);
                if (cycleDay) transferFoodDayTo(cycleDay, targetId);
            }
            return;
        }
        if (!e.target.closest('#food-day-transfer-popover')) closeFoodDayTransferPopover();
    });
})();

var _dailyFoodBulkSelectedDays = [];

function openDailyFoodPayDayModal() {
    closeDailyFoodActionsMenu();
    var sel = document.getElementById('daily-food-pay-day-select');
    if (sel) {
        var d = typeof state.settings?.payDate === 'number' ? Math.max(1, Math.min(28, state.settings.payDate)) : 28;
        sel.value = String(d);
    }
    toggleModal('daily-food-pay-day-modal', true);
}
window.openDailyFoodPayDayModal = openDailyFoodPayDayModal;

function closeDailyFoodPayDayModal() {
    toggleModal('daily-food-pay-day-modal', false);
}
window.closeDailyFoodPayDayModal = closeDailyFoodPayDayModal;

function openDailyFoodActionsMenu(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
    var menu = document.getElementById('daily-food-actions-menu');
    var btn = document.getElementById('food-actions-btn');
    if (!menu || !btn) return;
    var isOpen = !menu.classList.contains('hidden');
    if (isOpen) {
        closeDailyFoodActionsMenu();
        return;
    }
    var rect = btn.getBoundingClientRect();
    var menuWidth = 260;
    var left = Math.max(10, rect.right - menuWidth);
    var top = rect.bottom + 8;
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    menu.classList.remove('hidden');
}
window.openDailyFoodActionsMenu = openDailyFoodActionsMenu;

function closeDailyFoodActionsMenu() {
    var menu = document.getElementById('daily-food-actions-menu');
    if (menu) menu.classList.add('hidden');
}
window.closeDailyFoodActionsMenu = closeDailyFoodActionsMenu;

function applyFoodStartDateFromMenu() {
    var modalSel = document.getElementById('daily-food-pay-day-select');
    if (!modalSel || !modalSel.value) {
        if (typeof showAppAlert === 'function') showAppAlert('Pick a day of the month first.');
        return;
    }
    var dayOfMonth = Math.max(1, Math.min(28, parseInt(modalSel.value, 10)));
    if (Number.isNaN(dayOfMonth)) {
        if (typeof showAppAlert === 'function') showAppAlert('Invalid day.');
        return;
    }
    var payDateSelect = document.getElementById('settings-pay-date');
    if (payDateSelect) payDateSelect.value = String(dayOfMonth);
    saveSettingsFromUI();
    closeDailyFoodPayDayModal();
    if (typeof showAppAlert === 'function') {
        showAppAlert('Pay date is set to day ' + dayOfMonth + ' (same as Settings).');
    }
}
window.applyFoodStartDateFromMenu = applyFoodStartDateFromMenu;

function openDailyFoodBulkRefillModal() {
    if (typeof ensureFoodConsumedDays === 'function') ensureFoodConsumedDays();
    closeDailyFoodActionsMenu();
    _dailyFoodBulkSelectedDays = [];
    renderDailyFoodBulkSourceOptions();
    renderDailyFoodBulkDaysGrid();
    toggleModal('daily-food-bulk-refill-modal', true);
}
window.openDailyFoodBulkRefillModal = openDailyFoodBulkRefillModal;

function closeDailyFoodBulkRefillModal() {
    toggleModal('daily-food-bulk-refill-modal', false);
}
window.closeDailyFoodBulkRefillModal = closeDailyFoodBulkRefillModal;

(function initDailyFoodActionsMenuDismiss() {
    if (document._dailyFoodActionsDismissWired) return;
    document._dailyFoodActionsDismissWired = true;
    document.addEventListener('click', function (e) {
        if (e.target.closest('#daily-food-actions-menu') || e.target.closest('#food-actions-btn')) return;
        closeDailyFoodActionsMenu();
    });
    window.addEventListener('resize', function () { closeDailyFoodActionsMenu(); });
    window.addEventListener('scroll', function () { closeDailyFoodActionsMenu(); }, true);
})();

function getDailyFoodBulkSourceOptions() {
    ensureAccountsState();
    var out = [{
        value: 'surplus::Extra',
        label: 'Extra',
        amount: Number((state.accounts && state.accounts.surplus) || 0)
    }];
    Object.keys(state.accounts.savingsBuckets || {}).forEach(function (key) {
        out.push({ value: 'savings::' + encodeURIComponent(key), label: 'Savings - ' + key, amount: Number(state.accounts.savingsBuckets[key]) || 0 });
    });
    Object.keys(state.accounts.transportationBuckets || {}).forEach(function (key) {
        out.push({ value: 'transportation::' + encodeURIComponent(key), label: 'Transportation - ' + key, amount: Number(state.accounts.transportationBuckets[key]) || 0 });
    });
    Object.keys(state.accounts.payablesBuckets || {}).forEach(function (key) {
        out.push({ value: 'payables::' + encodeURIComponent(key), label: 'Payables - ' + key, amount: Number(state.accounts.payablesBuckets[key]) || 0 });
    });
    return out;
}

function renderDailyFoodBulkSourceOptions() {
    var sel = document.getElementById('daily-food-bulk-source');
    if (!sel) return;
    var options = getDailyFoodBulkSourceOptions();
    sel.innerHTML = options.map(function (o) {
        return '<option value="' + o.value + '">' + o.label + ' (' + formatMoney(o.amount) + ' ' + getCurrencyLabel() + ')</option>';
    }).join('');
}

function renderDailyFoodBulkDaysGrid() {
    if (typeof ensureFoodConsumedDays === 'function') ensureFoodConsumedDays();
    var grid = document.getElementById('daily-food-bulk-days-grid');
    if (!grid) return;
    var consumed = (state.food && state.food.consumedDays) ? state.food.consumedDays.slice().sort(function (a, b) { return a - b; }) : [];
    var consumedSet = {};
    consumed.forEach(function (d) { consumedSet[d] = true; });
    var info = (typeof getPayCycleInfo === 'function') ? getPayCycleInfo() : null;
    var days = [];
    for (var dayNum = 1; dayNum <= 28; dayNum++) days.push(dayNum);
    grid.innerHTML = days.map(function (day) {
        var dateLabel = 'Day ' + day;
        if (info && Array.isArray(info.dates) && info.dates[day - 1]) {
            var d = info.dates[day - 1];
            dateLabel = d.monthName + ' ' + d.date;
        }
        var isConsumed = !!consumedSet[day];
        var active = _dailyFoodBulkSelectedDays.indexOf(day) !== -1;
        var cls = '';
        if (!isConsumed) cls = 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-80';
        else cls = active ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-indigo-50';
        var clickAttr = isConsumed ? 'onclick="toggleDailyFoodBulkDay(' + day + ')"' : '';
        return '<button type="button" ' + clickAttr + ' class="h-11 rounded-lg border text-[10px] font-black transition ' + cls + '" title="' + dateLabel + '"' + (isConsumed ? '' : ' disabled') + '>' + day + '</button>';
    }).join('');
    updateDailyFoodBulkSelectedCount();
}

function toggleDailyFoodBulkDay(day) {
    var n = Math.max(1, Math.min(28, Math.floor(day)));
    var idx = _dailyFoodBulkSelectedDays.indexOf(n);
    if (idx === -1) _dailyFoodBulkSelectedDays.push(n);
    else _dailyFoodBulkSelectedDays.splice(idx, 1);
    _dailyFoodBulkSelectedDays.sort(function (a, b) { return a - b; });
    renderDailyFoodBulkDaysGrid();
}
window.toggleDailyFoodBulkDay = toggleDailyFoodBulkDay;

function selectAllConsumedDaysForBulkRefill() {
    if (typeof ensureFoodConsumedDays === 'function') ensureFoodConsumedDays();
    _dailyFoodBulkSelectedDays = (state.food.consumedDays || []).slice().sort(function (a, b) { return a - b; });
    renderDailyFoodBulkDaysGrid();
}
window.selectAllConsumedDaysForBulkRefill = selectAllConsumedDaysForBulkRefill;

function updateDailyFoodBulkSelectedCount() {
    var el = document.getElementById('daily-food-bulk-selected-count');
    if (!el) return;
    el.textContent = _dailyFoodBulkSelectedDays.length + ' selected';
}

function getDailyFoodBulkSourceAvailable(sourceValue) {
    if (!sourceValue) return 0;
    var parts = sourceValue.split('::');
    if (parts.length !== 2) return 0;
    var group = parts[0];
    if (group === 'surplus') return Number((state.accounts && state.accounts.surplus) || 0);
    var key = decodeURIComponent(parts[1]);
    if (group === 'savings') return Number((state.accounts && state.accounts.savingsBuckets && state.accounts.savingsBuckets[key]) || 0);
    if (group === 'transportation') return Number((state.accounts && state.accounts.transportationBuckets && state.accounts.transportationBuckets[key]) || 0);
    if (group === 'payables') return Number((state.accounts && state.accounts.payablesBuckets && state.accounts.payablesBuckets[key]) || 0);
    return 0;
}

function deductDailyFoodBulkSource(sourceValue, amount) {
    var parts = sourceValue.split('::');
    if (parts.length !== 2) return false;
    var group = parts[0];
    var take = Math.max(0, Number(amount) || 0);
    if (take <= 0) return false;
    if (group === 'surplus') {
        applyTransaction({ type: 'adjust_surplus', delta: -take });
        return true;
    }
    var key = decodeURIComponent(parts[1]);
    if (group === 'savings') {
        adjustSavingsBucket(key, -take);
        return true;
    }
    if (group === 'transportation') {
        adjustTransportationBucket(key, -take);
        return true;
    }
    if (group === 'payables') {
        adjustPayablesBucket(key, -take);
        return true;
    }
    return false;
}

function fundConsumedFoodDayFromSource(day, sourceValue) {
    if (typeof ensureFoodConsumedDays === 'function') ensureFoodConsumedDays();
    var targetDay = Math.max(1, Math.min(28, Math.floor(day)));
    var consumedList = (state.food && state.food.consumedDays) ? state.food.consumedDays.slice() : [];
    if (consumedList.indexOf(targetDay) === -1) return;
    if (!sourceValue) {
        if (typeof showAppAlert === 'function') showAppAlert('Choose a source bucket.');
        return;
    }
    var core = typeof computeFoodPlanCore === 'function' ? computeFoodPlanCore() : null;
    var dailyRate = (core && core.dailyRate > 0) ? core.dailyRate : (600 / 28);
    if (dailyRate <= 0) {
        if (typeof showAppAlert === 'function') showAppAlert('Daily Food plan amount is zero.');
        return;
    }
    var available = getDailyFoodBulkSourceAvailable(sourceValue);
    if (available + 0.001 < dailyRate) {
        if (typeof showAppAlert === 'function') showAppAlert('Selected source does not have enough funds.');
        return;
    }
    pushToUndo();
    if (!deductDailyFoodBulkSource(sourceValue, dailyRate)) return;
    state.food.consumedDays = consumedList.filter(function (d) { return d !== targetDay; }).sort(function (a, b) { return a - b; });
    state.food.daysUsed = state.food.consumedDays.length;
    if (typeof setFoodFundedForDay === 'function') setFoodFundedForDay(targetDay, dailyRate);
    if (typeof countRedistributedOverflowKeys === 'function' && countRedistributedOverflowKeys() > 0) {
        _recomputeOverflowRedistributionSplit();
    }
    if (typeof ensureFoodFundingState === 'function') ensureFoodFundingState();
    commitLedgerAndGlobal();
    closeFoodDayTransferPopover();
}
window.fundConsumedFoodDayFromSource = fundConsumedFoodDayFromSource;

function applyDailyFoodBulkRefill() {
    if (typeof ensureFoodConsumedDays === 'function') ensureFoodConsumedDays();
    var selected = _dailyFoodBulkSelectedDays.slice().sort(function (a, b) { return a - b; }).filter(function (d) {
        return (state.food.consumedDays || []).indexOf(d) !== -1;
    });
    if (!selected.length) {
        if (typeof showAppAlert === 'function') showAppAlert('Select at least one consumed day.');
        return;
    }
    var sourceSel = document.getElementById('daily-food-bulk-source');
    var sourceValue = sourceSel ? sourceSel.value : '';
    if (!sourceValue) {
        if (typeof showAppAlert === 'function') showAppAlert('Choose a source bucket.');
        return;
    }
    var info = (typeof getFoodRemainderInfo === 'function') ? getFoodRemainderInfo() : null;
    var daysTotal = Math.max(1, Math.floor((state.food && state.food.daysTotal) || 28));
    var dailyRate = (info && info.dailyRate > 0) ? info.dailyRate : ((Number(info && info.foodBase) || 600) / daysTotal);
    if (dailyRate <= 0) {
        if (typeof showAppAlert === 'function') showAppAlert('Daily Food plan amount is zero.');
        return;
    }
    var available = getDailyFoodBulkSourceAvailable(sourceValue);
    var fundedDays = Math.max(0, Math.min(selected.length, Math.floor(available / dailyRate)));
    if (fundedDays <= 0) {
        if (typeof showAppAlert === 'function') showAppAlert('Selected source does not have enough funds.');
        return;
    }
    var daysToApply = selected.slice(0, fundedDays);
    var appliedAmount = daysToApply.length * dailyRate;
    pushToUndo();
    if (!deductDailyFoodBulkSource(sourceValue, appliedAmount)) return;
    state.food.consumedDays = (state.food.consumedDays || []).filter(function (d) {
        return daysToApply.indexOf(d) === -1;
    }).sort(function (a, b) { return a - b; });
    state.food.daysUsed = state.food.consumedDays.length;
    var curFood = getItemBalance('Daily Food', 0);
    if (!state.balances) state.balances = {};
    state.balances['Daily Food'] = curFood + appliedAmount;
    for (var bi = 0; bi < daysToApply.length; bi++) {
        if (typeof setFoodFundedForDay === 'function') setFoodFundedForDay(daysToApply[bi], dailyRate);
    }
    if (typeof ensureFoodFundingState === 'function') ensureFoodFundingState();
    if (typeof logHistory === 'function') logHistory('Daily Food', appliedAmount, 'Bulk refill from source');
    commitLedgerAndGlobal();
    _dailyFoodBulkSelectedDays = [];
    renderDailyFoodBulkSourceOptions();
    renderDailyFoodBulkDaysGrid();
    if (fundedDays < selected.length) {
        var left = selected.length - fundedDays;
        if (typeof showAppAlert === 'function') showAppAlert('Applied ' + fundedDays + ' day(s). ' + left + ' day(s) could not be funded from this source.');
    } else if (typeof showAppAlert === 'function') {
        showAppAlert('Funded ' + fundedDays + ' consumed day(s) from selected source.');
    }
}
window.applyDailyFoodBulkRefill = applyDailyFoodBulkRefill;

function getBufferSourceBalance(sourceId) {
    if (sourceId === 'surplus') return (state.accounts && typeof state.accounts.surplus === 'number') ? state.accounts.surplus : 0;
    if (sourceId === 'savings') return getSavingsTotal();
    if (sourceId === 'weekly') {
        return Math.max(0, getWeeklyBalance() || 0);
    }
    return getItemBalance(sourceId, 0);
}

function creditToBufferSource(sourceId, amount) {
    if (!amount || amount <= 0) return true;
    if (sourceId && sourceId !== 'surplus' && sourceId !== 'savings' && sourceId !== 'weekly') {
        if (typeof isSplitGoalLocked === 'function' && isSplitGoalLocked(sourceId)) {
            if (typeof showAppAlert === 'function') {
                showAppAlert('This line is a locked split goal. Use Unlock early on the ledger to move funds to Extra.');
            }
            return false;
        }
    }
    if (sourceId === 'surplus') {
        applyTransaction({ type: 'adjust_surplus', delta: amount });
    } else if (sourceId === 'savings') {
        creditSavings(amount);
    } else if (sourceId === 'weekly') {
        setWeeklyBalance(state.accounts.weekly.week, Math.max(0, getWeeklyBalance() + amount));
        applyTransaction({ type: 'adjust_item_balance', label: 'Weekly Allowance', delta: amount });
    } else {
        const current = getItemBalance(sourceId, 0);
        if (getItemBalance(sourceId, undefined) === undefined) setItemBalance(sourceId, current);
        applyTransaction({ type: 'adjust_item_balance', label: sourceId, delta: amount });
    }
    return true;
}

function deductFromBufferSource(sourceId, amount) {
    if (sourceId && sourceId !== 'surplus' && sourceId !== 'savings' && sourceId !== 'weekly') {
        if (typeof isSplitGoalLocked === 'function' && isSplitGoalLocked(sourceId)) {
            if (typeof showAppAlert === 'function') {
                showAppAlert('This line is a locked split goal. Use Unlock early on the ledger to move funds to Extra.');
            }
            return false;
        }
    }
    if (sourceId === 'surplus') {
        applyTransaction({ type: 'adjust_surplus', delta: -amount });
    } else if (sourceId === 'savings') {
        debitSavings(amount);
    } else if (sourceId === 'weekly') {
        setWeeklyBalance(state.accounts.weekly.week, Math.max(0, getWeeklyBalance() - amount));
        applyTransaction({ type: 'adjust_item_balance', label: 'Weekly Allowance', delta: -amount });
    } else {
        const current = getItemBalance(sourceId, 0);
        if (getItemBalance(sourceId, undefined) === undefined) setItemBalance(sourceId, current);
        applyTransaction({ type: 'adjust_item_balance', label: sourceId, delta: -amount });
    }
    return true;
}

function isOverflowDayUsed(dayKey) {
    if (!state.food || !state.food.overflowUsage) return false;
    return !!state.food.overflowUsage[dayKey];
}

function markOverflowDayUsage(dayKey, mode) {
    if (!state.food) state.food = { daysTotal: 28, daysUsed: 0, lockedAmount: 0, history: [], viewWeek: 0, fundedAmountByDay: {}, _foodFundingMigrated: true };
    if (!state.food.overflowUsage || typeof state.food.overflowUsage !== 'object') state.food.overflowUsage = {};
    state.food.overflowUsage[dayKey] = mode;
}

function applyOverflowDayFromSource(dayKey, sourceId) {
    if (!dayKey) return;
    ensureFoodConsumedDays();
    if (state.food.overflowConsumedAmounts && Number(state.food.overflowConsumedAmounts[dayKey]) > 0.001) {
        if (typeof showAppAlert === 'function') showAppAlert('Unmark consumed for this day first, then you can fund it again.', 'Daily Food');
        return;
    }
    var src = sourceId || 'surplus';
    if (src !== 'surplus' && src !== 'savings' && src !== 'weekly' && typeof isSplitGoalLocked === 'function' && isSplitGoalLocked(src)) {
        if (typeof showAppAlert === 'function') showAppAlert('This line is a locked split goal. Use Unlock early on the ledger first.');
        return;
    }
    if (isOverflowDayUsed(dayKey)) {
        if (typeof showAppAlert === 'function') showAppAlert('This overflow day is already accounted for.');
        return;
    }
    var info = typeof getFoodRemainderInfo === 'function' ? getFoodRemainderInfo() : null;
    var dailyRate = (info && info.dailyRate > 0) ? info.dailyRate : (600 / 28);
    var available = getBufferSourceBalance(sourceId || 'surplus');
    if (available < dailyRate) {
        if (typeof showAppAlert === 'function') showAppAlert('Not enough in selected source for one overflow day.');
        return;
    }
    pushToUndo();
    if (!deductFromBufferSource(sourceId || 'surplus', dailyRate)) return;
    adjustItemBalance('Daily Food', dailyRate);
    if (!state.food.overflowFunded || typeof state.food.overflowFunded !== 'object') state.food.overflowFunded = {};
    state.food.overflowFunded[dayKey] = dailyRate;
    if (!state.food.overflowFundingSource || typeof state.food.overflowFundingSource !== 'object') state.food.overflowFundingSource = {};
    state.food.overflowFundingSource[dayKey] = src;
    markOverflowDayUsage(dayKey, 'source');
    if (typeof countRedistributedOverflowKeys === 'function' && countRedistributedOverflowKeys() > 0) {
        _recomputeOverflowRedistributionSplit();
    }
    if (typeof ensureFoodFundingState === 'function') ensureFoodFundingState();
    commitLedgerAndGlobal();
}
window.applyOverflowDayFromSource = applyOverflowDayFromSource;

function applyOverflowDaySourceUndo(dayKey) {
    if (!dayKey) return;
    ensureFoodConsumedDays();
    var usage = state.food.overflowUsage && state.food.overflowUsage[dayKey];
    if (usage !== 'source') return;
    var src = (state.food.overflowFundingSource && state.food.overflowFundingSource[dayKey]) || 'surplus';
    var amount = Number(state.food.overflowFunded && state.food.overflowFunded[dayKey]) || 0;
    if (amount <= 0.001) {
        var info = typeof getFoodRemainderInfo === 'function' ? getFoodRemainderInfo() : null;
        amount = (info && info.dailyRate > 0) ? info.dailyRate : (600 / 28);
    }
    pushToUndo();
    creditToBufferSource(src, amount);
    adjustItemBalance('Daily Food', -amount);
    delete state.food.overflowUsage[dayKey];
    if (state.food.overflowFunded) delete state.food.overflowFunded[dayKey];
    if (state.food.overflowFundingSource) delete state.food.overflowFundingSource[dayKey];
    if (typeof countRedistributedOverflowKeys === 'function' && countRedistributedOverflowKeys() > 0) {
        _recomputeOverflowRedistributionSplit();
    }
    if (typeof ensureFoodFundingState === 'function') ensureFoodFundingState();
    commitLedgerAndGlobal();
}
window.applyOverflowDaySourceUndo = applyOverflowDaySourceUndo;

function getOverflowDaySpendableAmount(dayKey) {
    if (!dayKey) return 0;
    ensureFoodConsumedDays();
    var usage = state.food.overflowUsage && state.food.overflowUsage[dayKey];
    if (!usage) return 0;
    var amt = Number(state.food.overflowFunded && state.food.overflowFunded[dayKey]) || 0;
    if (amt > 0.001) return amt;
    if (usage === 'source') {
        var info = typeof getFoodRemainderInfo === 'function' ? getFoodRemainderInfo() : null;
        var dailyRate = (info && info.dailyRate > 0) ? info.dailyRate : (600 / 28);
        return dailyRate > 0.001 ? dailyRate : 0;
    }
    if (usage === 'redistributed') {
        var slot = state.food && typeof state.food.redistributedPerSlot === 'number' && !Number.isNaN(state.food.redistributedPerSlot) ? state.food.redistributedPerSlot : 0;
        return slot > 0.001 ? slot : 0;
    }
    return 0;
}

function getOverflowConsumedMeta(dayKey) {
    if (!state.food || !dayKey) return null;
    var metaMap = state.food.overflowConsumedMeta;
    if (!metaMap || typeof metaMap !== 'object') return null;
    return metaMap[dayKey] || null;
}

function setOverflowFoodDayConsumed(dayKey, action) {
    if (!dayKey) return;
    ensureFoodConsumedDays();
    var consumedMap = state.food.overflowConsumedAmounts || {};
    if (!state.food.overflowConsumedMeta || typeof state.food.overflowConsumedMeta !== 'object') {
        state.food.overflowConsumedMeta = {};
    }
    var consumedMetaMap = state.food.overflowConsumedMeta;
    if (action === 'unmark') {
        var refund = Number(consumedMap[dayKey]) || 0;
        if (refund <= 0.001) return;
        var meta = getOverflowConsumedMeta(dayKey) || {};
        if (meta.resolution === 'transferred') {
            if (typeof showAppAlert === 'function') showAppAlert('This overflow day was transferred to another fund. Move it back manually if you want to re-open this day.', 'Daily Food');
            return;
        }
        pushToUndo();
        adjustItemBalance('Daily Food', refund);
        delete consumedMap[dayKey];
        state.food.overflowConsumedAmounts = consumedMap;
        delete consumedMetaMap[dayKey];
        if (meta.usage === 'source') {
            if (!state.food.overflowUsage || typeof state.food.overflowUsage !== 'object') state.food.overflowUsage = {};
            state.food.overflowUsage[dayKey] = 'source';
            if (!state.food.overflowFunded || typeof state.food.overflowFunded !== 'object') state.food.overflowFunded = {};
            state.food.overflowFunded[dayKey] = refund;
            if (!state.food.overflowFundingSource || typeof state.food.overflowFundingSource !== 'object') state.food.overflowFundingSource = {};
            state.food.overflowFundingSource[dayKey] = meta.sourceId || 'surplus';
            if (typeof countRedistributedOverflowKeys === 'function' && countRedistributedOverflowKeys() > 0) {
                _recomputeOverflowRedistributionSplit();
            }
        } else if (meta.usage === 'redistributed') {
            markOverflowDayUsage(dayKey, 'redistributed');
            _recomputeOverflowRedistributionSplit();
        }
        if (!Object.keys(consumedMetaMap).length) delete state.food.overflowConsumedMeta;
        if (typeof ensureFoodFundingState === 'function') ensureFoodFundingState();
        commitLedgerAndGlobal();
        if (typeof updateFoodUI === 'function') updateFoodUI();
        return;
    }
    if (Number(consumedMap[dayKey]) > 0.001) return;
    var usage = state.food.overflowUsage && state.food.overflowUsage[dayKey];
    if (!usage) {
        if (typeof showAppAlert === 'function') showAppAlert('Fund this overflow day first (source or redistribute).', 'Daily Food');
        return;
    }
    var amount = getOverflowDaySpendableAmount(dayKey);
    if (amount <= 0.001) {
        if (typeof showAppAlert === 'function') showAppAlert('This extra day is set up, but its Daily Food amount is missing. Fund it again or de-distribute it first.', 'Daily Food');
        return;
    }
    pushToUndo();
    adjustItemBalance('Daily Food', -amount);
    consumedMetaMap[dayKey] = {
        resolution: 'consumed',
        usage: usage,
        sourceId: (state.food.overflowFundingSource && state.food.overflowFundingSource[dayKey]) || ''
    };
    delete state.food.overflowUsage[dayKey];
    if (state.food.overflowFunded) delete state.food.overflowFunded[dayKey];
    if (state.food.overflowFundingSource) delete state.food.overflowFundingSource[dayKey];
    if (usage === 'redistributed' || (typeof countRedistributedOverflowKeys === 'function' && countRedistributedOverflowKeys() > 0)) {
        _recomputeOverflowRedistributionSplit();
    }
    consumedMap[dayKey] = amount;
    state.food.overflowConsumedAmounts = consumedMap;
    if (typeof ensureFoodFundingState === 'function') ensureFoodFundingState();
    commitLedgerAndGlobal();
    if (typeof updateFoodUI === 'function') updateFoodUI();
}
window.setOverflowFoodDayConsumed = setOverflowFoodDayConsumed;

function transferFoodOverflowDayTo(dayKey, targetId) {
    if (!dayKey || !targetId) return;
    ensureFoodConsumedDays();
    var usage = state.food.overflowUsage && state.food.overflowUsage[dayKey];
    if (!usage) {
        if (typeof showAppAlert === 'function') showAppAlert('Fund this overflow day first.', 'Daily Food');
        return;
    }
    if (state.food.overflowConsumedAmounts && Number(state.food.overflowConsumedAmounts[dayKey]) > 0.001) return;
    var amount = getOverflowDaySpendableAmount(dayKey);
    if (amount <= 0.001) {
        if (typeof showAppAlert === 'function') showAppAlert('No Daily Food balance to transfer for this overflow day.', 'Daily Food');
        return;
    }
    var foodBal = (state.balances && state.balances['Daily Food'] !== undefined) ? Number(state.balances['Daily Food']) : 0;
    var useAmt = Math.min(amount, Math.max(0, foodBal));
    if (useAmt <= 0.001) {
        if (typeof showAppAlert === 'function') showAppAlert('No Daily Food balance to transfer.', 'Daily Food');
        return;
    }
    pushToUndo();
    if (!state.food.overflowConsumedMeta || typeof state.food.overflowConsumedMeta !== 'object') {
        state.food.overflowConsumedMeta = {};
    }
    applyTransaction({ type: 'transfer', from: 'Daily Food', to: targetId, amount: useAmt });
    state.food.overflowConsumedMeta[dayKey] = {
        resolution: 'transferred',
        usage: usage,
        sourceId: (state.food.overflowFundingSource && state.food.overflowFundingSource[dayKey]) || '',
        targetId: targetId
    };
    delete state.food.overflowUsage[dayKey];
    if (state.food.overflowFunded) delete state.food.overflowFunded[dayKey];
    if (state.food.overflowFundingSource) delete state.food.overflowFundingSource[dayKey];
    if (usage === 'redistributed' || (typeof countRedistributedOverflowKeys === 'function' && countRedistributedOverflowKeys() > 0)) {
        _recomputeOverflowRedistributionSplit();
    }
    if (!state.food.overflowConsumedAmounts || typeof state.food.overflowConsumedAmounts !== 'object') state.food.overflowConsumedAmounts = {};
    state.food.overflowConsumedAmounts[dayKey] = useAmt;
    if (typeof ensureFoodFundingState === 'function') ensureFoodFundingState();
    commitLedgerAndGlobal();
    if (typeof updateFoodUI === 'function') updateFoodUI();
    if (typeof closeFoodDayTransferPopover === 'function') closeFoodDayTransferPopover();
}
window.transferFoodOverflowDayTo = transferFoodOverflowDayTo;

function _anyOverflowDayFromSource() {
    var u = state.food && state.food.overflowUsage;
    if (!u || typeof u !== 'object') return false;
    return Object.keys(u).some(function (k) {
        return u[k] === 'source';
    });
}

function _recomputeOverflowRedistributionSplit() {
    var pool = typeof getItemBalance === 'function' ? getItemBalance('Daily Food', 0) : 0;
    if (pool < 0) pool = 0;
    var U = typeof countUnconsumedCoreDays === 'function' ? countUnconsumedCoreDays() : 0;
    var usage = (state.food && state.food.overflowUsage) || {};
    var activeKeys = Object.keys(usage).filter(function (k) {
        return usage[k] === 'redistributed' || usage[k] === 'source';
    });
    var redistKeys = Object.keys(usage).filter(function (k) {
        return usage[k] === 'redistributed';
    });
    var R = redistKeys.length;
    var slots = U + activeKeys.length;
    if (slots <= 0) return;
    var perSlot = pool / slots;
    var consumed = {};
    ((state.food && state.food.consumedDays) || []).forEach(function (cd) {
        consumed[cd] = true;
    });
    for (var d = 1; d <= 28; d++) {
        if (consumed[d]) continue;
        if (typeof setFoodFundedForDay === 'function') setFoodFundedForDay(d, perSlot);
    }
    if (!state.food.overflowFunded || typeof state.food.overflowFunded !== 'object') state.food.overflowFunded = {};
    activeKeys.forEach(function (k) {
        state.food.overflowFunded[k] = perSlot;
    });
    if (R > 0) {
        state.food.redistributedPerSlot = perSlot;
    } else if (state.food) {
        delete state.food.redistributedPerSlot;
    }
    var sumAfter =
        (typeof sumFoodFundedUnconsumed === 'function' ? sumFoodFundedUnconsumed() : 0) +
        (typeof sumOverflowFunded === 'function' ? sumOverflowFunded() : 0);
    var drift = pool - sumAfter;
    if (Math.abs(drift) > 0.05 && typeof setFoodFundedForDay === 'function' && typeof getFoodFundedForDay === 'function') {
        var uncDr = [];
        for (var d2 = 1; d2 <= 28; d2++) {
            if (!consumed[d2]) uncDr.push(d2);
        }
        var slotTargets = uncDr.length + activeKeys.length;
        if (slotTargets > 0) {
            var driftEach = drift / slotTargets;
            uncDr.forEach(function (d3) {
                setFoodFundedForDay(d3, getFoodFundedForDay(d3) + driftEach);
            });
            activeKeys.forEach(function (k2) {
                state.food.overflowFunded[k2] = Math.max(0, (Number(state.food.overflowFunded[k2]) || 0) + driftEach);
            });
        }
    }
}

function applyOverflowDayRedistribution(dayKey) {
    if (!dayKey) return;
    ensureFoodConsumedDays();
    if (state.food.overflowConsumedAmounts && Number(state.food.overflowConsumedAmounts[dayKey]) > 0.001) {
        if (typeof showAppAlert === 'function') showAppAlert('Unmark consumed for this day first.', 'Daily Food');
        return;
    }
    if (isOverflowDayUsed(dayKey)) {
        if (typeof showAppAlert === 'function') showAppAlert('This overflow day is already accounted for.');
        return;
    }
    var pool = typeof getItemBalance === 'function' ? getItemBalance('Daily Food', 0) : 0;
    if (pool <= 0.001) {
        if (typeof showAppAlert === 'function') showAppAlert('No Daily Food balance to spread.');
        return;
    }
    var U = typeof countUnconsumedCoreDays === 'function' ? countUnconsumedCoreDays() : 0;
    var usage = (state.food && state.food.overflowUsage) || {};
    var activeOverflowCount = Object.keys(usage).filter(function (k) {
        return usage[k] === 'redistributed' || usage[k] === 'source';
    }).length;
    if (U + activeOverflowCount + 1 <= 0) {
        if (typeof showAppAlert === 'function') showAppAlert('Nothing to spread across.');
        return;
    }
    pushToUndo();
    markOverflowDayUsage(dayKey, 'redistributed');
    _recomputeOverflowRedistributionSplit();
    if (typeof ensureFoodFundingState === 'function') ensureFoodFundingState();
    commitLedgerAndGlobal();
}
window.applyOverflowDayRedistribution = applyOverflowDayRedistribution;

function applyOverflowRedistributionUndo(dayKey) {
    if (!dayKey) return;
    var usage = state.food && state.food.overflowUsage;
    if (!usage || usage[dayKey] !== 'redistributed') return;
    pushToUndo();
    delete usage[dayKey];
    if (state.food.overflowFunded) delete state.food.overflowFunded[dayKey];
    if (state.food.overflowFundingSource) delete state.food.overflowFundingSource[dayKey];
    _recomputeOverflowRedistributionSplit();
    if (typeof ensureFoodFundingState === 'function') ensureFoodFundingState();
    commitLedgerAndGlobal();
}
window.applyOverflowRedistributionUndo = applyOverflowRedistributionUndo;

function buyFoodDay() {
    const daysInput = parseFloat(document.getElementById('food-lock-val').value);
    if(!daysInput || daysInput <= 0) return;

    const sourceEl = document.getElementById('food-buffer-source');
    const sourceId = (sourceEl && sourceEl.value) ? sourceEl.value : 'surplus';

    if (sourceId && sourceId !== 'surplus' && sourceId !== 'savings' && sourceId !== 'weekly' && typeof isSplitGoalLocked === 'function' && isSplitGoalLocked(sourceId)) {
        if (typeof showAppAlert === 'function') showAppAlert('This line is a locked split goal. Use Unlock early on the ledger first.');
        return;
    }

    const info = typeof getFoodRemainderInfo === 'function' ? getFoodRemainderInfo() : null;
    const dailyRate = (info && info.dailyRate > 0) ? info.dailyRate : (600 / 28);
    const totalCost = dailyRate * daysInput;

    const available = getBufferSourceBalance(sourceId);
    if (available < totalCost) {
        showAppAlert('Not enough in selected source. Need ' + formatMoney(totalCost) + ' ' + getCurrencyLabel() + '.');
        return;
    }

    pushToUndo();
    deductFromBufferSource(sourceId, totalCost);
    applyTransaction({ type: 'food_lock', amount: totalCost, label: `+${daysInput} Days` });
    document.getElementById('food-lock-val').value = '';

    commitLedgerAndGlobal();
}

// Consume a single buffer day: reduce locked buffer by one daily-rate chunk (no money back to Extra).
function consumeBufferDay() {
    if (!state.food) return;
    var info = typeof getFoodRemainderInfo === 'function' ? getFoodRemainderInfo() : null;
    var dailyRate = (info && info.dailyRate > 0) ? info.dailyRate : (600 / 28);
    var locked = state.food.lockedAmount || 0;
    if (dailyRate <= 0 || locked <= 0) return;
    if (locked < dailyRate - 0.001) return; // not enough to fund one full buffer day
    pushToUndo();
    state.food.lockedAmount = locked - dailyRate;
    if (!state.food.history) state.food.history = [];
    state.food.history.unshift({ type: 'buffer_spend', amt: dailyRate });
    commitLedgerAndGlobal();
}

// Release a specific number of buffer days (partial release) back to Extra (refund unused buffer).
function releaseBufferDays(days) {
    var n = Math.floor(Number(days) || 0);
    if (n <= 0) return;
    if (!state.food) return;
    var info = typeof getFoodRemainderInfo === 'function' ? getFoodRemainderInfo() : null;
    var dailyRate = (info && info.dailyRate > 0) ? info.dailyRate : (600 / 28);
    var locked = state.food.lockedAmount || 0;
    if (dailyRate <= 0 || locked <= 0) return;
    var maxDays = Math.floor(locked / dailyRate);
    if (maxDays <= 0) return;
    if (n > maxDays) n = maxDays;
    var amount = dailyRate * n;
    if (!amount || amount <= 0) return;
    pushToUndo();
    applyTransaction({ type: 'food_release_partial', amount: amount, days: n });
    commitLedgerAndGlobal();
}

// Release handler for the UI button: if a day count is entered, release that many days;
// otherwise fall back to releasing the entire buffer.
function handleBufferRelease() {
    var input = document.getElementById('food-lock-val');
    var raw = input ? input.value : '';
    var n = Math.floor(parseFloat(raw) || 0);
    if (n > 0) {
        releaseBufferDays(n);
        if (input) input.value = '';
    } else {
        releaseAllBuffer();
    }
}

function releaseAllBuffer() {
    if(state.food.lockedAmount > 0) {
        pushToUndo();
        applyTransaction({ type: 'food_release_all' });
        commitLedgerAndGlobal();
    }
}

// Weekly
function getWeeklyInlineNote() {
    var el = document.getElementById('weekly-inline-note');
    return el ? (el.value || '').trim() : '';
}
function inlineWeeklyAdjust(dir) {
    const inputEl = document.getElementById('weekly-inline-val');
    const raw = inputEl ? inputEl.value : '';
    const val = parseFloat(raw);
    if (!val) return;

    // Spending path (dir === -1)
    if (dir < 0) {
        ensureWeeklyState();
        const current = getWeeklyBalance();

        // Overspend: more than current weekly allowance
        if (val > current) {
            const over = val - current;
            // Check Extra (surplus) can actually cover the overspend
            if (!canApplySurplusDelta(-over)) return;

            const msg =
                'You only have ' + formatMoney(current) + ' ' + getCurrencyLabel() + ' left this week. ' +
                'Spending ' + formatMoney(val) + ' will also take ' + formatMoney(over) + ' from Extra. Continue?';

            showAppConfirm(msg, function () {
                pushToUndo();
                // Take everything that is left in this week
                if (current !== 0) {
                    applyTransaction({ type: 'weekly_adjust', delta: -current });
                    logHistory('Weekly Allowance', -current, 'Spend', getWeeklyInlineNote());
                }
                // And cover the remainder from Extra
                applyTransaction({ type: 'adjust_surplus', delta: -over });

                if (inputEl) inputEl.value = '';
                var noteEl = document.getElementById('weekly-inline-note');
                if (noteEl) noteEl.value = '';
                saveState();
                renderLedger();
            }, null, { confirmLabel: 'Spend anyway' });
            return;
        }
    }

    // Normal spend / top up within available weekly amount
    pushToUndo();
    applyTransaction({ type: 'weekly_adjust', delta: val * dir });
    logHistory('Weekly Allowance', val * dir, 'Spend', getWeeklyInlineNote());
    if (inputEl) inputEl.value = '';
    var noteEl = document.getElementById('weekly-inline-note');
    if (noteEl) noteEl.value = '';
    saveState();
    renderLedger();
}
function topUpWeeklyInline() {
    const val = parseFloat(document.getElementById('weekly-inline-val').value);
    if(val) {
        pushToUndo();
        applyTransaction({ type: 'adjust_surplus', delta: -val });
        applyTransaction({ type: 'weekly_adjust', delta: val });
        logHistory('Weekly Allowance', val, 'Top Up', getWeeklyInlineNote());
        document.getElementById('weekly-inline-val').value = '';
        var noteEl = document.getElementById('weekly-inline-note');
        if (noteEl) noteEl.value = '';
        saveState();
        renderLedger();
    }
}

function nextWeek() {
    ensureWeeklyState();
    if (state.accounts.weekly.week >= WEEKLY_MAX_WEEKS) return;
    state.accounts.weekly.week += 1;
    state.accounts.weekly.balance = getWeeklyBalance();
    saveState();
    renderLedger();
}

function maybeAutoAdvanceWeeklyWeek(payCycleInfo) {
    if (typeof ensureWeeklyState === 'function') ensureWeeklyState();
    var info = payCycleInfo || (typeof getPayCycleInfo === 'function' ? getPayCycleInfo() : null);
    if (!info || !Array.isArray(info.dates) || !info.dates.length) return false;
    // Match Daily Food week buckets exactly:
    // Week 1 = cycle slots 1-7 from settings payDate start, then +7 day buckets.
    var today = new Date();
    var tDate = today.getDate();
    var tMonth = today.getMonth();
    var tYear = today.getFullYear();
    var todaySlot = info.dates.findIndex(function (p) {
        return p && p.date === tDate && p.month === tMonth && p.year === tYear;
    });
    var targetWeek = 0;
    if (todaySlot >= 0) {
        targetWeek = Math.max(1, Math.min(4, Math.floor(todaySlot / 7) + 1));
    } else {
        // Overflow days (after day 28 and before next cycle start) stay on Week 4.
        var overflow = Array.isArray(info.overflowDates) ? info.overflowDates : [];
        var isOverflowDay = overflow.some(function (p) {
            return p && p.date === tDate && p.month === tMonth && p.year === tYear;
        });
        if (!isOverflowDay) return false;
        targetWeek = 4;
    }
    var cycleKey = getPayCycleStartKey(info);
    var weekPhase = todaySlot >= 0 ? 'core' : 'overflow';
    var weekKey = cycleKey ? (cycleKey + ':W' + targetWeek + ':' + weekPhase) : ('W' + targetWeek + ':' + weekPhase);

    if (!state.accounts || !state.accounts.weekly) return false;
    if (!state.accounts.weekly.lastAutoWeekKey) {
        state.accounts.weekly.week = targetWeek;
        state.accounts.weekly.balance = getWeeklyBalance(targetWeek);
        state.accounts.weekly.lastAutoWeekKey = weekKey;
        return false;
    }
    // Only auto-advance when the derived calendar week key changes.
    // This keeps manual arrow navigation usable within the current week.
    if (state.accounts.weekly.lastAutoWeekKey === weekKey) return false;

    var currentWeek = Math.max(1, Math.min(4, Math.round(state.accounts.weekly.week || 1)));
    var moved = 0;
    var hops = 0;
    while (currentWeek !== targetWeek && hops < 6) {
        var next = currentWeek >= 4 ? 1 : (currentWeek + 1);
        var carry = Math.max(0, getWeeklyBalance(currentWeek) || 0);
        if (carry > 0) {
            setWeeklyBalance(next, getWeeklyBalance(next) + carry);
            setWeeklyBalance(currentWeek, 0);
            moved += carry;
        }
        currentWeek = next;
        hops += 1;
    }
    state.accounts.weekly.week = targetWeek;
    state.accounts.weekly.balance = getWeeklyBalance(targetWeek);
    state.accounts.weekly.lastAutoWeekKey = weekKey;
    if (moved > 0) {
        state.accounts.weekly.pendingRolloverNotice = {
            amount: moved,
            toWeek: targetWeek
        };
    } else {
        state.accounts.weekly.pendingRolloverNotice = null;
    }
    saveState();
    return true;
}
window.maybeAutoAdvanceWeeklyWeek = maybeAutoAdvanceWeeklyWeek;

function showWeeklyRolloverNotice() {
    if (!state.accounts || !state.accounts.weekly || !state.accounts.weekly.pendingRolloverNotice) return;
    var notice = state.accounts.weekly.pendingRolloverNotice;
    var msg = formatMoney(notice.amount || 0) + ' ' + getCurrencyLabel() + ' rolled into Week ' + (notice.toWeek || state.accounts.weekly.week || 1) + '.';
    if (typeof showAppAlert === 'function') showAppAlert(msg, 'Weekly rollover');
    state.accounts.weekly.pendingRolloverNotice = null;
    saveState();
    if (typeof updateGlobalUI === 'function') updateGlobalUI();
}
window.showWeeklyRolloverNotice = showWeeklyRolloverNotice;

// Weekly-only "new month": roll Week 4 leftover into Week 1 and reset Weeks 2–4 to 0. No new money.
function startNewMonthWeeklyRollover() {
    pushToUndo();
    if (typeof ensureWeeklyState === 'function') ensureWeeklyState();

    var week4Bal = typeof getWeeklyBalance === 'function' ? getWeeklyBalance(4) : 0;
    if (week4Bal > 0) {
        setWeeklyBalance(1, getWeeklyBalance(1) + week4Bal);
        setWeeklyBalance(4, 0);
    }
    setWeeklyBalance(2, 0);
    setWeeklyBalance(3, 0);
    if (state.accounts.weekly) state.accounts.weekly._zeroFixed = true;
    state.accounts.weekly.week = 1;
    state.accounts.weekly.balance = getWeeklyBalance(1);
    saveState();
    if (typeof renderLedger === 'function') renderLedger();
    if (typeof updateGlobalUI === 'function') updateGlobalUI();
}
window.startNewMonthWeeklyRollover = startNewMonthWeeklyRollover;

function getPayCycleStartKey(payCycleInfo) {
    var info = payCycleInfo || (typeof getPayCycleInfo === 'function' ? getPayCycleInfo() : null);
    if (!info || !info.cycleStart) return '';
    var d = info.cycleStart;
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
}

// Food cycle rollover: move remaining Daily Food ledger to Extra, then reset cycle tracking.
// Rollover never injects income; only Paycheck Distribute (and explicit transfers) fund categories.
function startNewMonthFoodReset(options) {
    options = options || {};
    if (!options.skipUndo) pushToUndo();
    if (typeof ensureFoodConsumedDays === 'function') ensureFoodConsumedDays();

    var daysUsed = state.food.daysUsed || 0;
    var daysTotal = state.food.daysTotal || 28;
    var unconsumed = Math.max(0, daysTotal - daysUsed);
    var movedToExtra = 0;
    if (typeof ensureFoodFundingState === 'function') ensureFoodFundingState();
    var foodBal = (state.balances && state.balances['Daily Food'] !== undefined) ? Number(state.balances['Daily Food']) : 0;
    if (foodBal > 0.001) {
        if (!state.accounts) state.accounts = {};
        state.accounts.surplus = (state.accounts && typeof state.accounts.surplus === 'number' ? state.accounts.surplus : 0) + foodBal;
        delete state.balances['Daily Food'];
        movedToExtra = foodBal;
    }
    if (typeof getFoodFundingMap === 'function') {
        var fm = getFoodFundingMap();
        for (var z = 1; z <= 28; z++) {
            fm[String(z)] = 0;
        }
    }
    state.food.consumedDays = [];
    state.food.daysUsed = 0;
    state.food.history = [];
    state.food.overflowUsage = {};
    state.food.overflowFunded = {};
    state.food.overflowFundingSource = {};
    state.food.overflowConsumedAmounts = {};
    if (state.food.redistributedPerSlot !== undefined) delete state.food.redistributedPerSlot;
    state.food.redistributedExtraDays = 0;
    state.food.lastCycleStartKey = getPayCycleStartKey(options.payCycleInfo);
    if (movedToExtra > 0) {
        state.food.pendingUnusedTransferNotice = {
            amount: movedToExtra,
            days: unconsumed
        };
    } else {
        delete state.food.pendingUnusedTransferNotice;
    }
    saveState();
    if (!options.silent) {
        if (typeof renderLedger === 'function') renderLedger();
        if (typeof refreshUI === 'function') refreshUI();
        if (typeof updateGlobalUI === 'function') updateGlobalUI();
    }
    return movedToExtra;
}
window.startNewMonthFoodReset = startNewMonthFoodReset;

function maybeAutoAdvanceFoodCycle(payCycleInfo) {
    if (typeof ensureFoodConsumedDays === 'function') ensureFoodConsumedDays();
    var currentKey = getPayCycleStartKey(payCycleInfo);
    if (!currentKey) return false;
    if (!state.food.lastCycleStartKey) {
        state.food.lastCycleStartKey = currentKey;
        return false;
    }
    if (state.food.lastCycleStartKey === currentKey) return false;
    startNewMonthFoodReset({ skipUndo: true, silent: true, payCycleInfo: payCycleInfo });
    return true;
}
window.maybeAutoAdvanceFoodCycle = maybeAutoAdvanceFoodCycle;

function showFoodUnusedTransferNotice() {
    if (typeof openFoodRolloverNoticePopover === 'function') {
        openFoodRolloverNoticePopover();
        return;
    }
    var notice = state.food && state.food.pendingUnusedTransferNotice;
    if (!notice || !notice.amount || notice.amount <= 0) return;
    var days = Math.max(0, Math.floor(notice.days || 0));
    var msg = formatMoney(notice.amount) + ' ' + getCurrencyLabel() + ' from ' + days + ' unused Daily Food day' + (days === 1 ? '' : 's') + ' was moved to Extra.';
    if (typeof showAppAlert === 'function') showAppAlert(msg, 'Food cycle updated');
    delete state.food.pendingUnusedTransferNotice;
    saveState();
    if (typeof updateGlobalUI === 'function') updateGlobalUI();
}
window.showFoodUnusedTransferNotice = showFoodUnusedTransferNotice;

function showFoodDistributionExtraNotice() {
    if (state.food && state.food.pendingDistributionExtraNotice) {
        delete state.food.pendingDistributionExtraNotice;
        saveState();
        if (typeof updateGlobalUI === 'function') updateGlobalUI();
    }
}
window.showFoodDistributionExtraNotice = showFoodDistributionExtraNotice;

// Legacy combined action (kept for compatibility): weekly rollover + food reset.
function startNewMonth() {
    startNewMonthWeeklyRollover();
    startNewMonthFoodReset();
}
window.startNewMonth = startNewMonth;

// Old header button entrypoint (now unused)
function openNewMonthConfirm() {
    showAppConfirm(
        'Weekly: Week 4 → Week 1. Food: calendar resets. Total balance stays the same.',
        function () { startNewMonth(); },
        null,
        { confirmLabel: 'Start new month', hideIcon: true }
    );
}
window.openNewMonthConfirm = openNewMonthConfirm;

function prevWeek() {
    ensureWeeklyState();
    if (state.accounts.weekly.week <= 1) return;
    state.accounts.weekly.week -= 1;
    state.accounts.weekly.balance = getWeeklyBalance();
    saveState();
    renderLedger();
}

// Surplus
function toggleSurplusControls() {
    const el = document.getElementById('surplus-controls');
    if(el.classList.contains('hidden')) el.classList.remove('hidden'); else el.classList.add('hidden');
}
function shouldConfirmSurplusEdit() {
    return true;
}
function canApplySurplusDelta(delta) {
    return true;
}
function adjustGlobalSurplus(dir) {
    const val = parseFloat(document.getElementById('surplus-adjust-val').value);
    if(val) {
        const delta = val * dir;
        if(!canApplySurplusDelta(delta)) return;
        if(shouldConfirmSurplusEdit()) {
            const actionLabel = dir > 0 ? 'add' : 'deduct';
            showAppConfirm('You are about to ' + actionLabel + ' funds directly to Extra. This creates or removes money from thin air. Continue?', function () {
                pushToUndo();
                applyTransaction({ type: 'adjust_surplus', delta: delta });
                document.getElementById('surplus-adjust-val').value = '';
                saveState();
                if (typeof refreshUI === 'function') refreshUI();
                if (typeof updateGlobalUI === 'function') updateGlobalUI();
            });
            return;
        }
        pushToUndo();
        applyTransaction({ type: 'adjust_surplus', delta });
        document.getElementById('surplus-adjust-val').value = '';
        saveState();
        updateGlobalUI();
    }
}

// Fast Update (Budget Plan) - FIXED: No full re-render on input
function fastUpdateItemAmount(sid, idx, val) {
    const num = typeof parseMoney === 'function' ? parseMoney(val) : Math.round((parseFloat(val) || 0) * 100) / 100;
    const sec = state.categories.find(s => s.id === sid);
    const item = sec.items[idx];

    applyTransaction({ type: 'update_item_amount', sid, idx, amount: num });

    saveState();

    // UI UPDATES (Without calling renderStrategy)
    updateGlobalUI();
    if (typeof updateBudgetPlanAllocated === 'function') updateBudgetPlanAllocated();

    // Update Section Percentage
    const secTotal = sec.items.reduce((a, b) => a + b.amount, 0);
    const perc = state.monthlyIncome > 0 ? Math.round((secTotal/state.monthlyIncome)*100) : 0;
    const percEl = document.getElementById(`sec-perc-${sid}`);
    if(percEl) percEl.innerText = perc + "%";

    if(item.label === 'Daily Food') {
        const slider = document.getElementById('food-daily-slider-' + sid + '-' + idx);
        const input = document.querySelector('.budget-item-input[data-sid="' + sid + '"][data-idx="' + idx + '"]');
        if(slider) {
            const dailyRate = state.food.daysTotal > 0 ? (num / state.food.daysTotal) : 0;
            const dailyRounded = Math.round(dailyRate);
            if(slider.value !== String(dailyRounded)) slider.value = String(dailyRounded);
            var label = document.getElementById('food-daily-slider-label-' + sid + '-' + idx);
            if (label) label.textContent = formatMoney(dailyRate) + ' ' + getCurrencyLabel();
        }
        // Do not overwrite a focused input (it breaks cursor position)
        var plain = typeof formatMoneyPlain === 'function' ? formatMoneyPlain(num) : String(num);
        if(input && document.activeElement !== input && input.value !== plain) input.value = plain;
        const badge = document.querySelector('.budget-item-badge[data-badge="food"][data-sid="' + sid + '"][data-idx="' + idx + '"]');
        if(badge) {
            const dailyRate = state.food.daysTotal > 0 ? (num / state.food.daysTotal) : 0;
            badge.innerText = `${formatMoney(dailyRate)}/day`;
        }
    } else if(item.label === 'Weekly Allowance') {
        const slider = document.getElementById('weekly-amount-slider-' + sid + '-' + idx);
        if(slider) {
            // Slider snaps to step, but typed input should remain exact.
            const snapped = Math.round(num / WEEKLY_SLIDER_STEP) * WEEKLY_SLIDER_STEP;
            if(slider.value !== String(snapped)) slider.value = String(snapped);
            var inputW = document.querySelector('.budget-item-input[data-sid="' + sid + '"][data-idx="' + idx + '"]');
            var plainW = typeof formatMoneyPlain === 'function' ? formatMoneyPlain(num) : String(num);
            if (inputW && document.activeElement !== inputW && inputW.value !== plainW) inputW.value = plainW;
            var badgeW = document.querySelector('.budget-item-badge[data-badge="weekly"][data-sid="' + sid + '"][data-idx="' + idx + '"]');
            if (badgeW) badgeW.textContent = '~' + formatMoney(num / 4) + '/wk';
            var labelW = document.getElementById('weekly-slider-label-' + sid + '-' + idx);
            if (labelW) labelW.textContent = formatMoney(num) + ' ' + getCurrencyLabel();
        }
    } else if(item.label === 'Savings') {
        const slider = document.getElementById('general-savings-slider-' + sid + '-' + idx);
        if(slider) {
            // Slider snaps to step, but typed input should remain exact.
            const snapped = Math.round(num / SAVINGS_SLIDER_STEP) * SAVINGS_SLIDER_STEP;
            if(slider.value !== String(snapped)) slider.value = String(snapped);
            var inputS = document.querySelector('.budget-item-input[data-sid="' + sid + '"][data-idx="' + idx + '"]');
            var plainS = typeof formatMoneyPlain === 'function' ? formatMoneyPlain(num) : String(num);
            if (inputS && document.activeElement !== inputS && inputS.value !== plainS) inputS.value = plainS;
            var labelS = document.getElementById('savings-slider-label-' + sid + '-' + idx);
            if (labelS) labelS.textContent = formatMoney(num) + ' ' + getCurrencyLabel();
        }
    } else if(item.label === 'Transportation') {
        const slider = document.getElementById('car-fund-slider-' + sid + '-' + idx);
        if(slider) {
            // Slider snaps to step, but typed input should remain exact.
            const snapped = Math.round(num / CAR_SLIDER_STEP) * CAR_SLIDER_STEP;
            if(slider.value !== String(snapped)) slider.value = String(snapped);
            var inputT = document.querySelector('.budget-item-input[data-sid="' + sid + '"][data-idx="' + idx + '"]');
            var plainT = typeof formatMoneyPlain === 'function' ? formatMoneyPlain(num) : String(num);
            if (inputT && document.activeElement !== inputT && inputT.value !== plainT) inputT.value = plainT;
            var badgeT = document.querySelector('.budget-item-badge[data-badge="transport"][data-sid="' + sid + '"][data-idx="' + idx + '"]');
            if (badgeT) badgeT.textContent = '~' + formatMoney(num / 4) + '/wk';
            var labelT = document.getElementById('car-slider-label-' + sid + '-' + idx);
            if (labelT) labelT.textContent = formatMoney(num) + ' ' + getCurrencyLabel();
        }
    }
    var obStep = document.getElementById('onboarding-step-categories');
    if (obStep && !obStep.classList.contains('hidden') && typeof updateAllocatedTotalUI === 'function') {
        var rm3 = typeof roundMoney === 'function' ? roundMoney : function (v) { return Math.round(Number(v) * 100) / 100; };
        var total = rm3(state.monthlyIncome || 0);
        var allocated = state.categories.reduce(function (sum, sec) {
            return sum + (sec.items || []).reduce(function (s, i) { return s + rm3(i.amount || 0); }, 0);
        }, 0);
        updateAllocatedTotalUI({ total: total, allocated: rm3(allocated), prefix: 'onboarding-cat' });
    }
}

function isProbablyPartialNumber(s) {
    // Allow normal typing states: "", "-", ".", "-.", "12.", "12.3"
    if (s == null) return true;
    s = String(s);
    if (s.trim() === '') return true;
    return /^-?\d*(\.\d*)?$/.test(s);
}

function budgetPlanAmountInput(sid, idx, el) {
    if (!el) return;
    var raw = String(el.value ?? '');
    if (typeof clampMoneyInputString === 'function') {
        var clamped = clampMoneyInputString(raw);
        if (clamped !== raw) {
            el.value = clamped;
            raw = clamped;
        }
    }
    // Don't force "0" while typing (this is what made it impossible to type when the field was 0)
    if (!isProbablyPartialNumber(raw)) return;
    if (raw.trim() === '' || raw === '-' || raw === '.' || raw === '-.') {
        // user is mid-typing; don't update state yet
        return;
    }
    // Intentionally do NOT update state on every keystroke.
    // Updating state triggers global UI updates that can interfere with selection/caret (Ctrl+A).
}
window.budgetPlanAmountInput = budgetPlanAmountInput;

function budgetPlanAmountCommit(sid, idx, el) {
    if (!el) return;
    var raw = String(el.value ?? '').trim();
    var num = 0;
    if (raw === '' || raw === '-' || raw === '.' || raw === '-.') {
        num = 0;
    } else {
        num = typeof parseMoney === 'function' ? parseMoney(raw) : (function () {
            var p = parseFloat(raw);
            return Number.isNaN(p) ? 0 : Math.round(p * 100) / 100;
        })();
    }

    el.value = typeof formatMoneyPlain === 'function' ? formatMoneyPlain(num) : num.toFixed(2);
    fastUpdateItemAmount(sid, idx, num);
}
window.budgetPlanAmountCommit = budgetPlanAmountCommit;

function budgetPlanAmountKeydown(e, sid, idx, el) {
    if (!e) return;
    // Prevent browser/native "select all then immediately change" oddities
    // by not triggering any commit logic on Ctrl/Cmd+A.
    if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
        return;
    }
    if (e.key === 'Enter') {
        e.preventDefault();
        try { el && el.blur && el.blur(); } catch (err) {}
    }
}
window.budgetPlanAmountKeydown = budgetPlanAmountKeydown;

function budgetPlanSavingsBucketInput(bucketKey, bucketIdx, el) {
    if (typeof beginBudgetPlanEditing === 'function') beginBudgetPlanEditing();
    if (!el) return;
    var raw = String(el.value ?? '');
    if (typeof clampMoneyInputString === 'function') {
        var c = clampMoneyInputString(raw);
        if (c !== raw) {
            el.value = c;
            raw = c;
        }
    }
    if (!isProbablyPartialNumber(raw)) return;
    if (raw.trim() === '' || raw === '-' || raw === '.' || raw === '-.') {
        budgetPlanSavingsBucketSyncLabel(bucketIdx, 0);
        return;
    }
    var num = typeof parseMoney === 'function' ? parseMoney(raw) : Math.round((parseFloat(raw) || 0) * 100) / 100;
    if (Number.isNaN(num) || num < 0) num = 0;
    var slider = document.getElementById('savings-bucket-slider-' + bucketIdx);
    if (slider) slider.value = String(Math.round(num / 50) * 50);
    budgetPlanSavingsBucketSyncLabel(bucketIdx, num);
}
window.budgetPlanSavingsBucketInput = budgetPlanSavingsBucketInput;

function budgetPlanSavingsBucketCommit(bucketKey, bucketIdx, el) {
    if (!el) return;
    var raw = String(el.value ?? '').trim();
    var num = 0;
    if (raw === '' || raw === '-' || raw === '.' || raw === '-.') {
        num = 0;
    } else {
        num = typeof parseMoney === 'function' ? parseMoney(raw) : Math.round((parseFloat(raw) || 0) * 100) / 100;
        if (Number.isNaN(num)) num = 0;
    }
    num = Math.max(0, num);
    el.value = typeof formatMoneyPlain === 'function' ? formatMoneyPlain(num) : String(num);
    syncSavingsBucketBudgetAmount(bucketKey, num);
    var slider = document.getElementById('savings-bucket-slider-' + bucketIdx);
    if (slider) slider.value = String(Math.round(num / 50) * 50);
    budgetPlanSavingsBucketSyncLabel(bucketIdx, num);
    if (typeof scheduleBudgetPlanAllocatedRefresh === 'function') scheduleBudgetPlanAllocatedRefresh();
}
window.budgetPlanSavingsBucketCommit = budgetPlanSavingsBucketCommit;

function budgetPlanSavingsBucketKeydown(e, bucketKey, bucketIdx, el) {
    if (!e) return;
    if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) return;
    if (e.key === 'Enter') {
        e.preventDefault();
        try { el && el.blur && el.blur(); } catch (err) {}
    }
}
window.budgetPlanSavingsBucketKeydown = budgetPlanSavingsBucketKeydown;

function budgetPlanSavingsBucketSyncLabel(bucketIdx, rawValue) {
    var num = Number(rawValue);
    if (Number.isNaN(num) || num < 0) num = 0;
    var label = document.getElementById('savings-bucket-slider-label-' + bucketIdx);
    if (label) label.textContent = formatMoney(num) + ' ' + getCurrencyLabel();
}
window.budgetPlanSavingsBucketSyncLabel = budgetPlanSavingsBucketSyncLabel;

function refreshSavingsPlanTotalsUI() {
    var rm = typeof roundMoney === 'function' ? roundMoney : function (x) { return Math.round(Number(x) * 100) / 100; };
    var total = (typeof getCanonicalSavingsBudgetPlanTotal === 'function')
        ? getCanonicalSavingsBudgetPlanTotal()
        : 0;
    total = rm(total);
    var nodes = document.querySelectorAll('.budget-savings-total');
    if (!nodes || !nodes.length) return;
    for (var i = 0; i < nodes.length; i++) {
        nodes[i].textContent = formatMoney(total) + ' ' + getCurrencyLabel();
    }
}
window.refreshSavingsPlanTotalsUI = refreshSavingsPlanTotalsUI;

function budgetPlanSavingsBucketSliderInput(bucketKey, bucketIdx, sliderEl) {
    if (typeof beginBudgetPlanEditing === 'function') beginBudgetPlanEditing();
    if (!sliderEl) return;
    var num = typeof parseMoney === 'function' ? parseMoney(sliderEl.value) : Math.round((parseFloat(sliderEl.value) || 0) * 100) / 100;
    if (Number.isNaN(num) || num < 0) num = 0;
    syncSavingsBucketBudgetAmount(bucketKey, num, { save: false });
    var input = document.getElementById('savings-bucket-input-' + bucketIdx);
    if (input && document.activeElement !== input) input.value = typeof formatMoneyPlain === 'function' ? formatMoneyPlain(num) : String(num);
    budgetPlanSavingsBucketSyncLabel(bucketIdx, num);
}
window.budgetPlanSavingsBucketSliderInput = budgetPlanSavingsBucketSliderInput;

function syncFoodBaseAmount(sid, idx, val) {
    const num = typeof parseMoney === 'function' ? parseMoney(val) : Math.round((parseFloat(val) || 0) * 100) / 100;
    const slider = document.getElementById('food-daily-slider-' + sid + '-' + idx);
    const input = document.querySelector('.budget-item-input[data-sid="' + sid + '"][data-idx="' + idx + '"]');
    if(slider) {
        const dailyRate = state.food.daysTotal > 0 ? (num / state.food.daysTotal) : 0;
        const dailyRounded = Math.round(dailyRate);
        if(slider.value !== String(dailyRounded)) slider.value = String(dailyRounded);
        var label = document.getElementById('food-daily-slider-label-' + sid + '-' + idx);
        if (label) label.textContent = formatMoney(dailyRate) + ' ' + getCurrencyLabel();
    }
    var plainF = typeof formatMoneyPlain === 'function' ? formatMoneyPlain(num) : String(num);
    if(input && input.value !== plainF) input.value = plainF;
    fastUpdateItemAmount(sid, idx, num);
    try {
        var badge = document.querySelector('.budget-item-badge[data-badge="food"][data-sid="' + sid + '"][data-idx="' + idx + '"]');
        if (badge) {
            const dailyRate = state.food.daysTotal > 0 ? (num / state.food.daysTotal) : 0;
            badge.textContent = formatMoney(dailyRate) + '/day';
        }
    } catch (e) {}
}

function syncFoodDailyRate(sid, idx, val) {
    const dailyRate = parseFloat(val) || 0;
    const total = dailyRate * (state.food.daysTotal || 0);
    syncFoodBaseAmount(sid, idx, total);
}

var WEEKLY_SLIDER_STEP = 20;
function syncWeeklyAmount(sid, idx, val) {
    const num = parseFloat(val) || 0;
    const snapped = Math.round(num / WEEKLY_SLIDER_STEP) * WEEKLY_SLIDER_STEP;
    fastUpdateItemAmount(sid, idx, snapped);
    try {
        var input = document.querySelector('.budget-item-input[data-sid="' + sid + '"][data-idx="' + idx + '"]');
        var plainW2 = typeof formatMoneyPlain === 'function' ? formatMoneyPlain(snapped) : String(snapped);
        if (input && input.value !== plainW2) input.value = plainW2;
        var badge = document.querySelector('.budget-item-badge[data-badge="weekly"][data-sid="' + sid + '"][data-idx="' + idx + '"]');
        if (badge) badge.textContent = '~' + formatMoney(snapped / 4) + '/wk';
        var label = document.getElementById('weekly-slider-label-' + sid + '-' + idx);
        if (label) label.textContent = formatMoney(snapped) + ' ' + getCurrencyLabel();
    } catch (e) {}
}
var SAVINGS_SLIDER_STEP = 50;
function syncGeneralSavingsAmount(sid, idx, val) {
    const num = parseFloat(val) || 0;
    const snapped = Math.round(num / SAVINGS_SLIDER_STEP) * SAVINGS_SLIDER_STEP;
    fastUpdateItemAmount(sid, idx, snapped);
    // Keep paycheck distribution source-of-truth (savingsBudgetPlan) aligned with
    // the Savings plan slider. Otherwise distribute can use stale bucket plan totals.
    ensureGeneralSavingsBudgetConfig();
    var defaultBucket = state.accounts.savingsDefaultBucket || 'General Savings';
    if (state.accounts.savingsBudgetPlan[defaultBucket] === undefined) {
        state.accounts.savingsBudgetPlan[defaultBucket] = 0;
    }
    var currentDefault = Number(state.accounts.savingsBudgetPlan[defaultBucket]) || 0;
    var totalPlan = 0;
    Object.keys(state.accounts.savingsBudgetPlan || {}).forEach(function (k) {
        totalPlan += Number(state.accounts.savingsBudgetPlan[k]) || 0;
    });
    var othersTotal = Math.max(0, totalPlan - currentDefault);
    state.accounts.savingsBudgetPlan[defaultBucket] = Math.max(0, snapped - othersTotal);
    syncSavingsBudgetPlanItemAmount();
    try {
        var input = document.querySelector('.budget-item-input[data-sid="' + sid + '"][data-idx="' + idx + '"]');
        var plainS2 = typeof formatMoneyPlain === 'function' ? formatMoneyPlain(snapped) : String(snapped);
        if (input && input.value !== plainS2) input.value = plainS2;
        var label = document.getElementById('savings-slider-label-' + sid + '-' + idx);
        if (label) label.textContent = formatMoney(snapped) + ' ' + getCurrencyLabel();
    } catch (e) {}
    if (typeof syncSavingsTotal === 'function') syncSavingsTotal();
}
var CAR_SLIDER_STEP = 20;
function syncCarFundAmount(sid, idx, val) {
    const num = parseFloat(val) || 0;
    const snapped = Math.round(num / CAR_SLIDER_STEP) * CAR_SLIDER_STEP;
    fastUpdateItemAmount(sid, idx, snapped);
    try {
        var input = document.querySelector('.budget-item-input[data-sid="' + sid + '"][data-idx="' + idx + '"]');
        var plainC = typeof formatMoneyPlain === 'function' ? formatMoneyPlain(snapped) : String(snapped);
        if (input && input.value !== plainC) input.value = plainC;
        var badge = document.querySelector('.budget-item-badge[data-badge="transport"][data-sid="' + sid + '"][data-idx="' + idx + '"]');
        if (badge) badge.textContent = '~' + formatMoney(snapped / 4) + '/wk';
        var label = document.getElementById('car-slider-label-' + sid + '-' + idx);
        if (label) label.textContent = formatMoney(snapped) + ' ' + getCurrencyLabel();
    } catch (e) {}
    if (typeof syncTransportationTotal === 'function') syncTransportationTotal();
}

// Paycheck + Allocation
function getAllocatableItems() {
    const items = [];
    state.categories.forEach(sec => {
        sec.items.forEach(item => {
            if (item.label === 'Savings') {
                ensureGeneralSavingsBudgetConfig();
                Object.keys(state.accounts.savingsBudgetPlan || {}).forEach(function (bucketName) {
                    var amount = Number(state.accounts.savingsBudgetPlan[bucketName]) || 0;
                    if (amount > 0) items.push({ label: 'Savings', amount: amount, savingsBucket: bucketName });
                });
                return;
            }
            if (item.amount > 0) {
                items.push({ label: item.label, amount: item.amount });
            }
        });
    });
    return items;
}

function applyPaycheckAdd() {
    const val = parseFloat(document.getElementById('paycheck-amount').value);
    if(!val || val <= 0) return;
    pushToUndo();
    applyTransaction({ type: 'adjust_surplus', delta: val });
    document.getElementById('paycheck-amount').value = '';
    saveState();
    renderLedger();
    renderStrategy();
    updateGlobalUI();
}

function getFoodPaycheckDeficitDetails(plannedAmount) {
    var amount = Number(plannedAmount) || 0;
    var current = getItemBalance('Daily Food', 0);
    return {
        deficit: Math.max(0, amount - current),
        excludedAmount: 0,
        excludedDays: 0
    };
}

function allocateFromSurplusToTarget(targetLabel, amount) {
    var val = Number(amount) || 0;
    if (val <= 0) return 0;
    if (targetLabel === 'Weekly Allowance') {
        ensureWeeklyState();
        var perWeek = val / 4;
        for (var w = 1; w <= WEEKLY_MAX_WEEKS; w++) {
            setWeeklyBalance(w, getWeeklyBalance(w) + perWeek);
        }
        state.accounts.surplus -= val;
        var sumWeeks = (state.accounts.weekly.balances[0] || 0) + (state.accounts.weekly.balances[1] || 0) + (state.accounts.weekly.balances[2] || 0) + (state.accounts.weekly.balances[3] || 0);
        if (state.accounts.buckets) state.accounts.buckets['Weekly Allowance'] = sumWeeks;
        logHistory(targetLabel, val, 'Distribute');
        return val;
    }
    if (targetLabel === 'Daily Food') {
        ensureAccountsState();
        if (typeof ensureFoodFundingState === 'function') ensureFoodFundingState();
        state.accounts.surplus -= val;
        adjustItemBalance('Daily Food', val);
        logHistory(targetLabel, val, 'Distribute');
        return val;
    }
    applyTransaction({ type: 'transfer', from: 'Surplus', to: targetLabel, amount: val });
    logHistory(targetLabel, val, 'Distribute');
    return val;
}

function applyPaycheckDistribute() {
    const raw = document.getElementById('paycheck-amount').value;
    const val = parseFloat(raw);
    if (raw === '' || isNaN(val) || val <= 0) {
        if (typeof showAppAlert === 'function') showAppAlert('Enter a positive amount for your paycheck.');
        return;
    }

    if (typeof ensureWeeklyState === 'function') ensureWeeklyState();
    ensureAccountsState();
    if (typeof normalizePaycheckPriorityOrder === 'function') normalizePaycheckPriorityOrder();
    // One-time self-heal for older states where Savings slider changed item.amount
    // but did not update savingsBudgetPlan used by paycheck distribution.
    (function reconcileSavingsPlanBeforeDistribution() {
        ensureGeneralSavingsBudgetConfig();
        var sec = (state.categories || []).find(function (s) { return s && s.id === 'sys_savings'; });
        var savingsItem = sec && Array.isArray(sec.items)
            ? sec.items.find(function (i) { return i && i.label === 'Savings'; })
            : null;
        if (!savingsItem) return;
        var savingsPlanTotal = 0;
        Object.keys(state.accounts.savingsBudgetPlan || {}).forEach(function (k) {
            savingsPlanTotal += Number(state.accounts.savingsBudgetPlan[k]) || 0;
        });
        var savingsItemAmount = Number(savingsItem.amount) || 0;
        if (Math.abs(savingsItemAmount - savingsPlanTotal) < 0.01) return;
        var defaultBucket = state.accounts.savingsDefaultBucket || 'General Savings';
        if (state.accounts.savingsBudgetPlan[defaultBucket] === undefined) {
            state.accounts.savingsBudgetPlan[defaultBucket] = 0;
        }
        var currentDefault = Number(state.accounts.savingsBudgetPlan[defaultBucket]) || 0;
        var othersTotal = Math.max(0, savingsPlanTotal - currentDefault);
        state.accounts.savingsBudgetPlan[defaultBucket] = Math.max(0, savingsItemAmount - othersTotal);
        syncSavingsBudgetPlanItemAmount();
    })();

    var allocatableItems = getAllocatableItems();
    var savingsPlanByBucket = {};
    var mustHavePlanByLabel = {};
    allocatableItems.forEach(function (item) {
        if (!item) return;
        if (item.label === 'Savings' && item.savingsBucket) {
            savingsPlanByBucket[item.savingsBucket] = Number(item.amount) || 0;
            return;
        }
        mustHavePlanByLabel[item.label] = Number(item.amount) || 0;
    });

    var coreSec = state.categories.find(function (s) { return s && s.id === 'core_essentials'; });
    var coreLabels = {};
    (coreSec && coreSec.items ? coreSec.items : []).forEach(function (item) {
        if (!item || !item.label) return;
        var normalizedLabel = item.label === 'Food Base' ? 'Daily Food' : item.label;
        if (normalizedLabel === 'Savings') return;
        coreLabels[normalizedLabel] = true;
    });

    function getCurrentForLabel(label) {
        if (label === 'Weekly Allowance') {
            // Use canonical bucket total for comparison so paycheck math matches UI totals.
            return getItemBalance('Weekly Allowance', 0);
        }
        if (label === 'Daily Food') {
            // Compare against cycle-available food remainder, not raw stored balance.
            // Raw food balance can contain stale carryover that is not actually usable this cycle.
            var info = (typeof getFoodRemainderInfo === 'function') ? getFoodRemainderInfo() : null;
            if (info && typeof info.remainder === 'number' && !Number.isNaN(info.remainder)) {
                return Math.max(0, info.remainder);
            }
        }
        return getItemBalance(label, 0);
    }
    function getDeficitForLabel(label, plannedAmount) {
        var planned = Number(plannedAmount) || 0;
        if (planned <= 0) return 0;
        if (label === 'Daily Food') {
            if (typeof ensureFoodFundingState === 'function') ensureFoodFundingState();
            var finfo = (typeof getFoodRemainderInfo === 'function') ? getFoodRemainderInfo() : null;
            var targetAmt = finfo && typeof finfo.theoreticalRemainder === 'number' ? finfo.theoreticalRemainder : 0;
            var currentAmt = finfo && typeof finfo.remainder === 'number' ? finfo.remainder : 0;
            return Math.max(0, targetAmt - currentAmt);
        }
        var current = getCurrentForLabel(label);
        return Math.max(0, planned - current);
    }

    var priorityEntries = (typeof getPaycheckPriorityEntries === 'function') ? getPaycheckPriorityEntries() : [];
    var totalRequested = 0;
    priorityEntries.forEach(function (entry) {
        if (!entry || !entry.type) return;
        if (entry.type === 'savingsBucket') {
            var planned = Number(savingsPlanByBucket[entry.bucketName]) || 0;
            // Savings plan is a cycle contribution target, not a top-up target.
            // Do not subtract existing bucket balance here.
            var deficit = Math.max(0, planned);
            totalRequested += deficit;
            return;
        }
        if (entry.type === 'mustHave') {
            if (!coreLabels[entry.itemLabel]) return;
            totalRequested += getDeficitForLabel(entry.itemLabel, mustHavePlanByLabel[entry.itemLabel]);
            return;
        }
        if (entry.type === 'mini') {
            var sec = state.categories.find(function (s) { return s && s.id === entry.categoryId; });
            if (!sec || !Array.isArray(sec.items)) return;
            sec.items.forEach(function (item) {
                if (!item || item.label === 'Payables' || item.label === 'Savings') return;
                totalRequested += getDeficitForLabel(item.label, item.amount);
            });
        }
    });

    pushToUndo();
    applyTransaction({ type: 'adjust_surplus', delta: val });
    if (!state.food || typeof state.food !== 'object') state.food = {};
    if (state.food.pendingDistributionExtraNotice) {
        delete state.food.pendingDistributionExtraNotice;
    }

    if (totalRequested <= 0) {
        showAppAlert('All planned categories are already funded. The paycheck was added to Extra.');
        document.getElementById('paycheck-amount').value = '';
        saveState();
        if (typeof refreshUI === 'function') refreshUI();
        return;
    }

    var distributedTotal = 0;
    var allocationsThisPaycheck = [];
    var remainingAvailable = Math.max(0, Number(state.accounts.surplus) || 0);
    priorityEntries.forEach(function (entry) {
        if (!entry || remainingAvailable <= 0) return;
        if (entry.type === 'savingsBucket') {
            var bucketPlanned = Number(savingsPlanByBucket[entry.bucketName]) || 0;
            // Savings contribution per cycle should ignore current stored balance.
            var bucketDeficit = Math.max(0, bucketPlanned);
            var bucketTake = Math.min(bucketDeficit, remainingAvailable);
            if (bucketTake > 0) {
                adjustSavingsBucket(entry.bucketName, bucketTake);
                applyTransaction({ type: 'adjust_surplus', delta: -bucketTake });
                logHistory('Savings: ' + entry.bucketName, bucketTake, 'Distribute');
                distributedTotal += bucketTake;
                remainingAvailable -= bucketTake;
                allocationsThisPaycheck.push({ label: 'Savings: ' + entry.bucketName, amount: bucketTake });
            }
            return;
        }
        if (entry.type === 'mustHave') {
            if (!coreLabels[entry.itemLabel]) return;
            var mhDeficit = getDeficitForLabel(entry.itemLabel, mustHavePlanByLabel[entry.itemLabel]);
            var mhTake = Math.min(mhDeficit, remainingAvailable);
            if (mhTake > 0) {
                allocateFromSurplusToTarget(entry.itemLabel, mhTake);
                distributedTotal += mhTake;
                remainingAvailable -= mhTake;
                allocationsThisPaycheck.push({ label: entry.itemLabel, amount: mhTake });
            }
            return;
        }
        if (entry.type === 'mini') {
            var sec = state.categories.find(function (s) { return s && s.id === entry.categoryId; });
            if (!sec || !Array.isArray(sec.items)) return;
            sec.items.forEach(function (item) {
                if (!item || remainingAvailable <= 0 || item.label === 'Payables' || item.label === 'Savings') return;
                var itemDeficit = getDeficitForLabel(item.label, item.amount);
                var itemTake = Math.min(itemDeficit, remainingAvailable);
                if (itemTake <= 0) return;
                allocateFromSurplusToTarget(item.label, itemTake);
                distributedTotal += itemTake;
                remainingAvailable -= itemTake;
                allocationsThisPaycheck.push({ label: item.label, amount: itemTake });
            });
        }
    });

    var unfunded = Math.max(0, totalRequested - distributedTotal);
    var extraAfter = Number(state.accounts.surplus) || 0;
    var paycheckUnallocated = Math.max(0, val - distributedTotal);
    var epsilon = 0.005;
    var statusLine = '';
    if (val + epsilon < totalRequested) {
        statusLine = 'Paycheck is below this cycle plan by ' + formatMoney(unfunded) + ' ' + getCurrencyLabel() + '.';
    } else {
        statusLine = 'All planned targets for this cycle were fully funded.';
    }
    var statusToneClass = (val + epsilon < totalRequested) ? 'text-amber-700 bg-amber-50 border-amber-100' : 'text-emerald-700 bg-emerald-50 border-emerald-100';
    function esc(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    function getDisplayPlannedForLine(label) {
        if (label.indexOf('Savings: ') === 0) {
            var bn = label.slice('Savings: '.length);
            return Number(savingsPlanByBucket[bn]) || 0;
        }
        if (label === 'Daily Food') {
            var finfo = typeof getFoodRemainderInfo === 'function' ? getFoodRemainderInfo() : null;
            return finfo && typeof finfo.theoreticalRemainder === 'number' ? finfo.theoreticalRemainder : 0;
        }
        if (Object.prototype.hasOwnProperty.call(mustHavePlanByLabel, label)) {
            return Number(mustHavePlanByLabel[label]) || 0;
        }
        var found = 0;
        (state.categories || []).forEach(function (sec) {
            if (!sec || !Array.isArray(sec.items)) return;
            sec.items.forEach(function (it) {
                if (it && it.label === label) found = Number(it.amount) || 0;
            });
        });
        return found;
    }
    function getRemainingAfterForLine(label) {
        if (label.indexOf('Savings: ') === 0) {
            var bn = label.slice('Savings: '.length);
            var plannedSav = Number(savingsPlanByBucket[bn]) || 0;
            var add = 0;
            allocationsThisPaycheck.forEach(function (a) {
                if (a.label === 'Savings: ' + bn) add += a.amount;
            });
            return Math.max(0, plannedSav - add);
        }
        var pl = getDisplayPlannedForLine(label);
        return getDeficitForLabel(label, pl);
    }
    var leftRows = [];
    priorityEntries.forEach(function (entry) {
        if (!entry || !entry.type) return;
        if (entry.type === 'savingsBucket') {
            var plannedB = Number(savingsPlanByBucket[entry.bucketName]) || 0;
            if (plannedB <= epsilon) return;
            var labS = 'Savings: ' + entry.bucketName;
            var remS = getRemainingAfterForLine(labS);
            if (remS > epsilon) leftRows.push({ label: labS, remaining: remS, planned: plannedB });
            return;
        }
        if (entry.type === 'mustHave') {
            if (!coreLabels[entry.itemLabel]) return;
            var plM = getDisplayPlannedForLine(entry.itemLabel);
            var remM = getRemainingAfterForLine(entry.itemLabel);
            if (remM > epsilon) leftRows.push({ label: entry.itemLabel, remaining: remM, planned: plM });
            return;
        }
        if (entry.type === 'mini') {
            var secL = state.categories.find(function (s) { return s && s.id === entry.categoryId; });
            if (!secL || !Array.isArray(secL.items)) return;
            secL.items.forEach(function (item) {
                if (!item || item.label === 'Payables' || item.label === 'Savings') return;
                var plI = Number(item.amount) || 0;
                if (plI <= epsilon) return;
                var remI = getRemainingAfterForLine(item.label);
                if (remI > epsilon) leftRows.push({ label: item.label, remaining: remI, planned: plI });
            });
        }
    });
    function renderProgressBar(remaining, planned) {
        if (planned <= epsilon) return '';
        var funded = Math.max(0, planned - remaining);
        var pct = Math.min(100, Math.round((100 * funded) / planned));
        return '<div class="mt-2 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">' +
            '<div class="h-full rounded-full bg-indigo-500 transition-all" style="width:' + pct + '%"></div></div>';
    }
    function renderFractionPill(remaining, planned) {
        if (planned > epsilon) {
            return '<span class="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-800 tabular-nums">' +
                esc(formatMoney(remaining)) + '<span class="text-slate-400 font-normal">/</span>' + esc(formatMoney(planned)) +
                '</span><span class="text-slate-400 text-[11px] ml-0.5">left</span>';
        }
        return '<span class="text-[11px] font-semibold text-amber-800 tabular-nums">' + esc(formatMoney(remaining)) + ' <span class="text-slate-400 font-normal">left</span></span>';
    }
    var addedSectionHtml = '';
    if (allocationsThisPaycheck.length) {
        addedSectionHtml = allocationsThisPaycheck.map(function (a) {
            var plannedA = getDisplayPlannedForLine(a.label);
            var remA = getRemainingAfterForLine(a.label);
            return '<div class="py-2.5 border-b border-slate-100 last:border-0">' +
                '<div class="text-sm font-semibold text-slate-800">' + esc(a.label) + '</div>' +
                '<div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">' +
                    '<span class="inline-flex items-center rounded-md bg-emerald-50 border border-emerald-200 text-emerald-900 px-2 py-0.5 text-xs font-black tabular-nums">+' +
                    esc(formatMoney(a.amount)) + ' ' + esc(getCurrencyLabel()) + '</span>' +
                    '<span class="text-slate-300 select-none">·</span>' +
                    renderFractionPill(remA, plannedA) +
                '</div>' +
                renderProgressBar(remA, plannedA) +
                '</div>';
        }).join('');
    } else {
        addedSectionHtml = '<div class="text-xs text-slate-500 py-2">Nothing was allocated to categories this time (nothing left to fund in priority order, or Extra ran out before any line).</div>';
    }
    var leftSectionHtml = '';
    if (leftRows.length) {
        leftSectionHtml = leftRows.map(function (r) {
            return '<div class="py-2.5 border-b border-slate-100 last:border-0">' +
                '<div class="text-sm font-semibold text-slate-800">' + esc(r.label) + '</div>' +
                '<div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">' +
                    renderFractionPill(r.remaining, r.planned) +
                '</div>' +
                renderProgressBar(r.remaining, r.planned) +
                '</div>';
        }).join('');
    } else {
        leftSectionHtml = '<div class="text-xs text-slate-500 py-2">Nothing left to fund for this cycle—every target is covered.</div>';
    }
    var summaryHtml =
        '<div class="space-y-3 text-left">' +
            '<div class="p-3 rounded-xl border ' + statusToneClass + '">' +
                '<div class="text-[11px] font-black uppercase tracking-wider mb-1">Summary</div>' +
                '<div class="text-sm font-semibold">' + esc(statusLine) + '</div>' +
            '</div>' +
            '<div class="grid grid-cols-2 gap-2 text-xs">' +
                '<div class="p-2 rounded-lg bg-slate-50 border border-slate-100"><div class="text-slate-400 uppercase font-bold text-[10px]">You added</div><div class="text-slate-800 font-black">' + esc(formatMoney(val)) + ' ' + esc(getCurrencyLabel()) + '</div></div>' +
                '<div class="p-2 rounded-lg bg-slate-50 border border-slate-100"><div class="text-slate-400 uppercase font-bold text-[10px]">Allocated this time</div><div class="text-slate-800 font-black">' + esc(formatMoney(distributedTotal)) + ' ' + esc(getCurrencyLabel()) + '</div></div>' +
                '<div class="p-2 rounded-lg bg-slate-50 border border-slate-100"><div class="text-slate-400 uppercase font-bold text-[10px]">Plan needs (this cycle)</div><div class="text-slate-800 font-black">' + esc(formatMoney(totalRequested)) + ' ' + esc(getCurrencyLabel()) + '</div></div>' +
                '<div class="p-2 rounded-lg bg-slate-50 border border-slate-100"><div class="text-slate-400 uppercase font-bold text-[10px]">Extra balance now</div><div class="text-slate-800 font-black">' + esc(formatMoney(extraAfter)) + ' ' + esc(getCurrencyLabel()) + '</div></div>' +
            '</div>' +
            '<div class="p-3 rounded-xl border border-slate-200 bg-white max-h-72 overflow-y-auto">' +
                '<div class="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2">1 · What was added <span class="text-slate-400 font-normal normal-case">(priority order)</span></div>' +
                addedSectionHtml +
            '</div>' +
            '<div class="p-3 rounded-xl border border-slate-200 bg-white max-h-72 overflow-y-auto">' +
                '<div class="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2">2 · What is left <span class="text-slate-400 font-normal normal-case">(priority order)</span></div>' +
                leftSectionHtml +
            '</div>';
    if (paycheckUnallocated > epsilon) {
        summaryHtml += '<div class="text-xs text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg p-2">Extra above plan kept in Extra: <span class="font-black">' + esc(formatMoney(paycheckUnallocated)) + ' ' + esc(getCurrencyLabel()) + '</span>.</div>';
    }
    summaryHtml += '<div class="text-[11px] text-slate-500">Funding follows your current priority order. Edit priorities on the <span class="font-semibold">Budget Plan</span> page.</div>';
    summaryHtml += '</div>';
    var paycheckModalWide = true;
    showAppAlert({
        title: 'Paycheck Distribution',
        html: summaryHtml,
        wide: paycheckModalWide,
        leftAligned: true
    });

    document.getElementById('paycheck-amount').value = '';
    saveState();
    renderLedger();
    renderStrategy();
    updateGlobalUI();
    togglePaycheckPanel(); // collapse after successful distribute
}

function togglePaycheckPanel() {
    const panel = document.getElementById('paycheck-panel');
    const trigger = document.getElementById('paycheck-trigger-btn');
    if (!panel || !trigger) return;
    const isOpen = !panel.classList.contains('hidden');
    panel.classList.toggle('hidden', isOpen);
    panel.setAttribute('aria-hidden', isOpen ? 'true' : 'false');
    trigger.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
    const chevron = trigger.querySelector('.paycheck-chevron');
    if (chevron) chevron.textContent = isOpen ? '▼' : '▲';
}
window.togglePaycheckPanel = togglePaycheckPanel;

// Savings Buckets (source/dest options for "outside" buckets)
var SAVINGS_EXTRA = '__extra__';
var SAVINGS_WEEKLY = '__weekly__';
function getWeeklyLabel() { return ITEM_LABELS.WEEKLY_MISC; }

function getBucketContext(contextName) {
    if (contextName === 'savings') {
        return {
            bucketsKey: 'savingsBuckets',
            defaultKey: 'savingsDefaultBucket',
            defaultName: 'General Savings',
            extraKey: SAVINGS_EXTRA,
            weeklyKey: SAVINGS_WEEKLY,
            syncTotal: syncSavingsTotal
        };
    }
    if (contextName === 'transportation') {
        return {
            bucketsKey: 'transportationBuckets',
            defaultKey: 'transportationDefaultBucket',
            defaultName: 'Main',
            extraKey: TRANSPORTATION_EXTRA,
            weeklyKey: TRANSPORTATION_WEEKLY,
            syncTotal: syncTransportationTotal
        };
    }
    return {
        bucketsKey: 'payablesBuckets',
        defaultKey: 'payablesDefaultBucket',
        defaultName: 'Main',
        extraKey: PAYABLES_EXTRA,
        weeklyKey: PAYABLES_WEEKLY,
        syncTotal: syncPayablesTotal
    };
}

function getBucketStore(ctx) {
    ensureAccountsState();
    if (!state.accounts[ctx.bucketsKey]) state.accounts[ctx.bucketsKey] = {};
    return state.accounts[ctx.bucketsKey];
}

function getBucketContextLabel(contextName) {
    if (contextName === 'savings') return 'Savings';
    if (contextName === 'transportation') return 'Transportation';
    return 'Payables';
}

function getBucketHistoryKey(contextName, bucketKey) {
    return getBucketContextLabel(contextName) + ': ' + bucketKey;
}

function moveBucketHistoryKey(contextName, oldName, newName) {
    if (!state.histories) state.histories = {};
    var oldKey = getBucketHistoryKey(contextName, oldName);
    var newKey = getBucketHistoryKey(contextName, newName);
    if (!state.histories[oldKey]) return;
    state.histories[newKey] = state.histories[oldKey];
    delete state.histories[oldKey];
}

function getBucketAmountByContext(contextName, bucketKey) {
    return getBucketValue(getBucketContext(contextName), bucketKey);
}

function renderBucketsForContext(contextName) {
    if (contextName === 'savings') renderSavingsBuckets();
    else if (contextName === 'transportation') renderTransportationBuckets();
    else renderPayablesBuckets();
}

function refreshBucketContextUI(contextName) {
    saveState();
    renderBucketsForContext(contextName);
    if (typeof updateGlobalUI === 'function') updateGlobalUI();
    if (typeof renderStrategy === 'function') renderStrategy();
}

function logBucketHistory(contextName, bucketKey, amt, res, note) {
    logHistory(getBucketHistoryKey(contextName, bucketKey), amt, res, note);
}

function burnBucketAmount(contextName, bucketKey, rawAmount) {
    var val = parseFloat(rawAmount);
    if (!val || val <= 0) {
        if (typeof showAppAlert === 'function') showAppAlert('Enter an amount to deduct from this bucket.');
        return false;
    }
    var available = getBucketAmountByContext(contextName, bucketKey);
    if (available <= 0.001) {
        if (typeof showAppAlert === 'function') showAppAlert('This bucket is already at 0.00.');
        return false;
    }
    var take = Math.min(val, available);
    pushToUndo();
    adjustBucketValue(getBucketContext(contextName), bucketKey, -take);
    logBucketHistory(contextName, bucketKey, -take, 'Deduct');
    refreshBucketContextUI(contextName);
    return true;
}

function adjustBucketValue(ctx, bucketKey, delta) {
    var store = getBucketStore(ctx);
    if (store[bucketKey] === undefined) store[bucketKey] = 0;
    store[bucketKey] += delta;
    if (store[bucketKey] < 0) store[bucketKey] = 0;
    ctx.syncTotal();
}

function getBucketValue(ctx, bucketKey) {
    var store = getBucketStore(ctx);
    return store[bucketKey] || 0;
}

function transferBetweenBuckets(ctx, fromKey, toKey, amount) {
    if (!fromKey || !toKey || fromKey === toKey) return false;
    var val = parseFloat(amount);
    if (!val || val <= 0) return false;
    ensureAccountsState();
    var store = getBucketStore(ctx);
    if (fromKey === ctx.extraKey && toKey !== ctx.extraKey) {
        if (!canApplySurplusDelta(-val)) return false;
        pushToUndo();
        adjustBucketValue(ctx, toKey, val);
        applyTransaction({ type: 'adjust_surplus', delta: -val });
        return true;
    }
    if (fromKey !== ctx.extraKey && toKey === ctx.extraKey) {
        var availableToExtra = getBucketValue(ctx, fromKey);
        var takeToExtra = Math.min(val, availableToExtra);
        if (takeToExtra <= 0) return false;
        pushToUndo();
        adjustBucketValue(ctx, fromKey, -takeToExtra);
        applyTransaction({ type: 'adjust_surplus', delta: takeToExtra });
        return true;
    }
    var available = getBucketValue(ctx, fromKey);
    var take = Math.min(val, available);
    if (take <= 0) return false;
    pushToUndo();
    store[fromKey] = available - take;
    store[toKey] = (store[toKey] || 0) + take;
    ctx.syncTotal();
    return true;
}

function transferWeeklyToBucket(ctx, toBucketKey, amount) {
    var val = parseFloat(amount);
    if (!val || val <= 0) return false;
    var wlabel = getWeeklyLabel();
    var available = getItemBalance(wlabel, 0);
    var take = Math.min(val, available);
    if (take <= 0) return false;
    pushToUndo();
    adjustItemBalance(wlabel, -take);
    adjustBucketValue(ctx, toBucketKey, take);
    return true;
}

function transferBucketToWeekly(ctx, fromBucketKey, amount) {
    var val = parseFloat(amount);
    if (!val || val <= 0) return false;
    var available = getBucketValue(ctx, fromBucketKey);
    var take = Math.min(val, available);
    if (take <= 0) return false;
    pushToUndo();
    adjustBucketValue(ctx, fromBucketKey, -take);
    adjustItemBalance(getWeeklyLabel(), take);
    return true;
}

function getBucketTransferModalElements() {
    return {
        modal: document.getElementById('bucket-transfer-modal'),
        title: document.getElementById('bucket-transfer-title'),
        name: document.getElementById('bucket-transfer-name'),
        amount: document.getElementById('bucket-transfer-amount'),
        balance: document.getElementById('bucket-transfer-balance'),
        currency: document.getElementById('bucket-transfer-currency'),
        sendBtn: document.getElementById('bucket-transfer-send-btn'),
        receiveBtn: document.getElementById('bucket-transfer-receive-btn'),
        pickerTitle: document.getElementById('bucket-transfer-picker-title'),
        pickerHint: document.getElementById('bucket-transfer-picker-hint'),
        targets: document.getElementById('bucket-transfer-targets'),
        empty: document.getElementById('bucket-transfer-empty'),
        history: document.getElementById('bucket-transfer-history')
    };
}

function getBucketTransferGroupData(contextName, bucketKey, mode) {
    ensureAccountsState();
    var groups = [];
    var store = getBucketStore(getBucketContext(contextName));
    var sameStoreLabel = getBucketContextLabel(contextName) + ' Buckets';
    var otherBuckets = Object.keys(store).filter(function (key) { return key !== bucketKey; }).map(function (key) {
        return {
            type: 'bucket',
            key: key,
            label: key,
            amount: Number(store[key]) || 0
        };
    }).filter(function (entry) {
        return mode !== 'receive' || entry.amount > 0.001;
    });
    if (otherBuckets.length) {
        groups.push({
            id: 'same-store',
            title: sameStoreLabel,
            subtitle: otherBuckets.length + ' option' + (otherBuckets.length === 1 ? '' : 's'),
            options: otherBuckets
        });
    }

    var extraAmount = Number((state.accounts && state.accounts.surplus) || 0);
    if (mode === 'send' || extraAmount > 0.001) {
        groups.push({
            id: 'extra',
            title: 'Extra',
            subtitle: mode === 'send' ? 'Move money into Extra' : formatMoney(extraAmount) + ' available',
            options: [{
                type: 'extra',
                label: 'Extra',
                amount: extraAmount
            }]
        });
    }

    var weeklyOptions = [];
    for (var week = 1; week <= WEEKLY_MAX_WEEKS; week++) {
        var weeklyBal = getWeeklyBalance(week);
        if (mode === 'send' || weeklyBal > 0.001) {
            weeklyOptions.push({
                type: 'weekly_week',
                week: week,
                label: 'Week ' + week,
                amount: weeklyBal
            });
        }
    }
    if (weeklyOptions.length) {
        groups.push({
            id: 'weekly',
            title: 'Weekly Allowance',
            subtitle: 'Pick a week',
            options: weeklyOptions
        });
    }

    (state.categories || []).forEach(function (sec) {
        if (!sec || !Array.isArray(sec.items)) return;
        if (String(sec.id || '').indexOf('sys_') === 0) return;
        var options = sec.items.filter(function (item) {
            if (!item || !item.label) return false;
            if (item.label === 'Savings' || item.label === 'Transportation' || item.label === 'Payables' || item.label === 'Daily Food' || item.label === getWeeklyLabel()) return false;
            var amount = getItemBalance(item.label, item.amount || 0);
            return mode === 'send' || amount > 0.001;
        }).map(function (item) {
            return {
                type: 'item',
                label: item.label,
                amount: getItemBalance(item.label, item.amount || 0)
            };
        });
        if (!options.length) return;
        groups.push({
            id: 'category-' + sec.id,
            title: sec.label || 'Mini-Budget',
            subtitle: options.length + ' item' + (options.length === 1 ? '' : 's'),
            options: options
        });
    });

    return groups;
}

function renderBucketTransferHistory(contextName, bucketKey) {
    var ui = getBucketTransferModalElements();
    if (!ui.history) return;
    var historyKey = getBucketHistoryKey(contextName, bucketKey);
    var data = (state.histories && state.histories[historyKey]) ? state.histories[historyKey] : [];
    if (!data.length) {
        ui.history.innerHTML = '<div class="text-center text-slate-300 text-[10px] py-2">No History</div>';
        return;
    }
    ui.history.innerHTML = data.map(function (entry) {
        var amtClass = entry.amt < 0 ? 'is-negative' : 'is-positive';
        var noteHtml = entry.note ? '<div class="bucket-detail-history-note">' + escapeHtml(entry.note) + '</div>' : '';
        return '<div class="bucket-detail-history-item">' +
            '<div><div class="bucket-detail-history-res">' + escapeHtml(entry.res || 'Update') + '</div>' + noteHtml + '</div>' +
            '<div class="bucket-detail-history-amt ' + amtClass + '">' + formatMoney(entry.amt || 0) + '</div>' +
        '</div>';
    }).join('');
}

function renderBucketTransferGroups(contextName, bucketKey, mode) {
    var ui = getBucketTransferModalElements();
    if (!ui.targets || !ui.empty || !ui.modal) return;
    var groups = getBucketTransferGroupData(contextName, bucketKey, mode);
    ui.modal._bucketTransferGroups = groups;
    if (!ui.modal._bucketTransferExpanded) ui.modal._bucketTransferExpanded = {};
    if (groups.length && Object.keys(ui.modal._bucketTransferExpanded).length === 0) {
        ui.modal._bucketTransferExpanded[groups[0].id] = true;
    }
    if (!groups.length) {
        ui.targets.innerHTML = '';
        ui.empty.classList.remove('hidden');
        return;
    }
    ui.empty.classList.add('hidden');
    ui.targets.innerHTML = groups.map(function (group, groupIndex) {
        var isOpen = !!ui.modal._bucketTransferExpanded[group.id];
        var optionsHtml = group.options.map(function (option, optionIndex) {
            var idx = String(groupIndex) + ':' + String(optionIndex);
            return '<button type="button" class="bucket-transfer-option" data-option-ref="' + idx + '">' +
                '<span class="bucket-transfer-option-label">' + escapeHtml(option.label) + '</span>' +
                '<span class="bucket-transfer-option-meta">' + formatMoney(option.amount || 0) + '</span>' +
            '</button>';
        }).join('');
        return '<div class="bucket-transfer-group ' + (isOpen ? 'is-open' : '') + '" data-group-id="' + escapeAttr(group.id) + '">' +
            '<button type="button" class="bucket-transfer-group-toggle" data-group-toggle="' + escapeAttr(group.id) + '">' +
                '<span class="bucket-transfer-group-meta">' +
                    '<span class="bucket-transfer-group-title">' + escapeHtml(group.title) + '</span>' +
                    '<span class="bucket-transfer-group-subtitle">' + escapeHtml(group.subtitle) + '</span>' +
                '</span>' +
                '<span class="bucket-transfer-group-chevron">></span>' +
            '</button>' +
            '<div class="bucket-transfer-group-items">' + optionsHtml + '</div>' +
        '</div>';
    }).join('');
}

function renderBucketTransferModal() {
    var ui = getBucketTransferModalElements();
    var modal = ui.modal;
    if (!modal) return;
    var contextName = modal.getAttribute('data-context');
    var bucketKey = modal.getAttribute('data-bucket-key');
    var mode = modal.getAttribute('data-mode') || 'send';
    if (!contextName || !bucketKey) return;
    var amount = getBucketAmountByContext(contextName, bucketKey);
    if (ui.title) ui.title.textContent = getBucketContextLabel(contextName);
    if (ui.name) ui.name.textContent = bucketKey;
    if (ui.balance) ui.balance.textContent = formatMoney(amount);
    if (ui.currency) ui.currency.textContent = getCurrencyLabel();
    if (ui.sendBtn) ui.sendBtn.classList.toggle('is-active', mode === 'send');
    if (ui.receiveBtn) ui.receiveBtn.classList.toggle('is-active', mode === 'receive');
    if (ui.pickerTitle) ui.pickerTitle.textContent = mode === 'send' ? 'Send to' : 'Receive from';
    if (ui.pickerHint) ui.pickerHint.textContent = mode === 'send'
        ? 'Choose a destination group, then select a bucket or category item.'
        : 'Choose a source group, then select where funds should come from.';
    renderBucketTransferGroups(contextName, bucketKey, mode);
    renderBucketTransferHistory(contextName, bucketKey);
}

function setBucketTransferMode(mode) {
    var ui = getBucketTransferModalElements();
    if (!ui.modal) return;
    ui.modal.setAttribute('data-mode', mode === 'receive' ? 'receive' : 'send');
    renderBucketTransferModal();
}

function getBucketTransferAmountInputValue() {
    var ui = getBucketTransferModalElements();
    return ui.amount ? ui.amount.value : '';
}

function getBucketTransferOptionFromRef(ref) {
    var ui = getBucketTransferModalElements();
    var parts = String(ref || '').split(':');
    if (!ui.modal || parts.length !== 2) return null;
    var groups = ui.modal._bucketTransferGroups || [];
    var group = groups[parseInt(parts[0], 10)];
    if (!group) return null;
    return group.options[parseInt(parts[1], 10)] || null;
}

function executeBucketTransferSelection(option) {
    var ui = getBucketTransferModalElements();
    if (!ui.modal || !option) return;
    var contextName = ui.modal.getAttribute('data-context');
    var bucketKey = ui.modal.getAttribute('data-bucket-key');
    var mode = ui.modal.getAttribute('data-mode') || 'send';
    var rawAmount = getBucketTransferAmountInputValue();
    var amount = parseFloat(rawAmount);
    if (!amount || amount <= 0) {
        if (typeof showAppAlert === 'function') showAppAlert('Enter an amount before choosing where funds should move.');
        return;
    }
    if (!runBucketTransferSelection(contextName, bucketKey, mode, option, amount)) return;
    if (ui.amount) ui.amount.value = '';
    refreshBucketContextUI(contextName);
    renderBucketTransferModal();
}

function runBucketTransferSelection(contextName, bucketKey, mode, option, amount) {
    var ctx = getBucketContext(contextName);
    var store = getBucketStore(ctx);
    var currentAmount = Number(store[bucketKey]) || 0;
    var take = 0;
    var sourceTitle = getBucketHistoryKey(contextName, bucketKey);
    var targetTitle = option.type === 'item'
        ? option.label
        : option.type === 'weekly_week'
            ? ('Weekly Allowance - Week ' + option.week)
            : option.type === 'extra'
                ? 'Extra'
                : getBucketHistoryKey(contextName, option.key);

    if (mode === 'send') {
        if (currentAmount <= 0.001) {
            if (typeof showAppAlert === 'function') showAppAlert('This bucket is already at 0.00.');
            return false;
        }
        take = Math.min(amount, currentAmount);
        pushToUndo();
        if (option.type === 'bucket') {
            store[bucketKey] = currentAmount - take;
            store[option.key] = (Number(store[option.key]) || 0) + take;
            ctx.syncTotal();
            logBucketHistory(contextName, bucketKey, -take, 'Send to', option.key);
            logBucketHistory(contextName, option.key, take, 'Receive from', bucketKey);
            return true;
        }
        if (option.type === 'extra') {
            adjustBucketValue(ctx, bucketKey, -take);
            applyTransaction({ type: 'adjust_surplus', delta: take });
            logBucketHistory(contextName, bucketKey, -take, 'Send to', 'Extra');
            return true;
        }
        if (option.type === 'weekly_week') {
            adjustBucketValue(ctx, bucketKey, -take);
            setWeeklyBalance(option.week, getWeeklyBalance(option.week) + take);
            adjustItemBalance(getWeeklyLabel(), take);
            logBucketHistory(contextName, bucketKey, -take, 'Send to', 'Week ' + option.week);
            logHistory(getWeeklyLabel(), take, 'Trf from ' + sourceTitle);
            return true;
        }
        adjustBucketValue(ctx, bucketKey, -take);
        adjustItemBalance(option.label, take);
        logBucketHistory(contextName, bucketKey, -take, 'Send to', option.label);
        logHistory(option.label, take, 'Trf from ' + sourceTitle);
        return true;
    }

    if (option.type === 'bucket') {
        var sourceBucketAmount = Number(store[option.key]) || 0;
        if (sourceBucketAmount <= 0.001) {
            if (typeof showAppAlert === 'function') showAppAlert('There is nothing available in that bucket right now.');
            return false;
        }
        take = Math.min(amount, sourceBucketAmount);
        pushToUndo();
        store[option.key] = sourceBucketAmount - take;
        store[bucketKey] = currentAmount + take;
        ctx.syncTotal();
        logBucketHistory(contextName, option.key, -take, 'Send to', bucketKey);
        logBucketHistory(contextName, bucketKey, take, 'Receive from', option.key);
        return true;
    }
    if (option.type === 'extra') {
        var surplus = Number((state.accounts && state.accounts.surplus) || 0);
        if (surplus <= 0.001) {
            if (typeof showAppAlert === 'function') showAppAlert('Extra has no funds available right now.');
            return false;
        }
        take = Math.min(amount, surplus);
        pushToUndo();
        adjustBucketValue(ctx, bucketKey, take);
        applyTransaction({ type: 'adjust_surplus', delta: -take });
        logBucketHistory(contextName, bucketKey, take, 'Receive from', 'Extra');
        return true;
    }
    if (option.type === 'weekly_week') {
        var weekAvailable = getWeeklyBalance(option.week);
        if (weekAvailable <= 0.001) {
            if (typeof showAppAlert === 'function') showAppAlert('That week has no available balance right now.');
            return false;
        }
        take = Math.min(amount, weekAvailable);
        pushToUndo();
        setWeeklyBalance(option.week, weekAvailable - take);
        adjustItemBalance(getWeeklyLabel(), -take);
        adjustBucketValue(ctx, bucketKey, take);
        logHistory(getWeeklyLabel(), -take, 'Trf to ' + sourceTitle);
        logBucketHistory(contextName, bucketKey, take, 'Receive from', 'Week ' + option.week);
        return true;
    }
    if (typeof isSplitGoalLocked === 'function' && isSplitGoalLocked(option.label)) {
        if (typeof showAppAlert === 'function') showAppAlert('This line is a locked split goal. Use Unlock early on the ledger first.');
        return false;
    }
    var itemAvailable = getItemBalance(option.label, 0);
    if (itemAvailable <= 0.001) {
        if (typeof showAppAlert === 'function') showAppAlert('There is nothing available in that item right now.');
        return false;
    }
    take = Math.min(amount, itemAvailable);
    pushToUndo();
    adjustItemBalance(option.label, -take);
    adjustBucketValue(ctx, bucketKey, take);
    logHistory(option.label, -take, 'Trf to ' + sourceTitle);
    logBucketHistory(contextName, bucketKey, take, 'Receive from', option.label);
    return true;
}

function openSavingsBuckets() {
    renderSavingsBuckets();
    toggleModal('savings-buckets-modal', true);
}
window.openSavingsBuckets = openSavingsBuckets;

function closeSavingsBuckets() {
    toggleModal('savings-buckets-modal', false);
}
window.closeSavingsBuckets = closeSavingsBuckets;

function adjustSavingsBucket(bucketKey, delta) {
    adjustBucketValue(getBucketContext('savings'), bucketKey, delta);
}

function getSavingsBucketAmount(bucketKey) {
    return getBucketValue(getBucketContext('savings'), bucketKey);
}

function doSavingsTransfer(fromKey, toKey, amount) {
    if (!transferBetweenBuckets(getBucketContext('savings'), fromKey, toKey, amount)) return;
    commitUI('global');
    renderSavingsBuckets();
    if (typeof renderStrategy === 'function') renderStrategy();
}

function doSavingsAddFromWeekly(toBucketKey, amount) {
    if (!transferWeeklyToBucket(getBucketContext('savings'), toBucketKey, amount)) return;
    commitUI('global');
    renderSavingsBuckets();
    if (typeof renderStrategy === 'function') renderStrategy();
}

function doSavingsSendToWeekly(fromBucketKey, amount) {
    if (!transferBucketToWeekly(getBucketContext('savings'), fromBucketKey, amount)) return;
    commitUI('global');
    renderSavingsBuckets();
    if (typeof renderStrategy === 'function') renderStrategy();
}

function renderSavingsBuckets() {
    ensureGeneralSavingsBudgetConfig();
    var orderedKeys = (typeof getCanonicalSavingsBucketOrder === 'function')
        ? getCanonicalSavingsBucketOrder()
        : Object.keys(state.accounts.savingsBuckets || {});
    var entries = orderedKeys.map(function (key) {
        return [key, state.accounts.savingsBuckets[key]];
    }).filter(function (entry) {
        return entry[0] && state.accounts.savingsBuckets[entry[0]] !== undefined;
    });
    var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); };
    var bucketOpts = entries.map(function (e) { return '<option value="' + esc(e[0]) + '">' + esc(e[0]) + '</option>'; }).join('');
    var fromToOpts = '<option value="' + SAVINGS_EXTRA + '">Extra</option><option value="' + SAVINGS_WEEKLY + '">Weekly Allowance</option>' + bucketOpts;

    var moveFrom = document.getElementById('savings-move-from');
    var moveTo = document.getElementById('savings-move-to');
    if (moveFrom) moveFrom.innerHTML = fromToOpts;
    if (moveTo) moveTo.innerHTML = fromToOpts;

    var list = document.getElementById('savings-buckets-list');
    if (!list) return;
    if (!entries.length) {
        list.innerHTML = '<div class="text-center text-[10px] text-slate-400 py-4">No buckets yet. Create one below.</div>';
        return;
    }
    list.innerHTML = entries.map(function (e) {
        var key = e[0], amount = e[1];
        var isGeneral = key === 'General Savings';
        return '<div class="bucket-row bucket-row-card ledger-bar flex items-center gap-2 sm:gap-3 w-full py-2.5 px-3 sm:px-4 rounded-xl border border-slate-100 bg-white hover:border-slate-200 transition-all" data-bucket-key="' + esc(key) + '" data-context="savings">' +
            '<div class="flex-1 min-w-0 flex flex-col gap-0.5">' +
            '<div class="bucket-row-label-wrap ' + (isGeneral ? 'bucket-row-label-wrap-locked' : '') + '" role="button" tabindex="0" title="' + (isGeneral ? 'General Savings is locked' : 'Tap to rename') + '">' +
            '<span class="bucket-row-label text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate">' + esc(key) + '</span>' +
            '<input type="text" class="bucket-row-name-edit" maxlength="80" aria-label="Rename bucket" autocomplete="off">' +
            '<span class="bucket-row-label-line" aria-hidden="true"></span>' +
            '</div>' +
            '<div class="h-1.5 w-full max-w-[100px] rounded-full bg-slate-100 overflow-hidden"><div class="ledger-bar-fill h-full rounded-full bg-indigo-400 transition-all" style="width:100%"></div></div>' +
            '</div>' +
            '<div class="flex items-center gap-1.5 flex-shrink-0 text-right">' +
            '<p class="bucket-row-balance bucket-amount text-base sm:text-lg font-black text-slate-800">' + formatMoney(amount) + '</p>' +
            '</div>' +
            '<div class="ledger-bar-actions bucket-row-controls flex items-center gap-1.5 flex-shrink-0">' +
            '<input type="number" class="bucket-amount-input ledger-bar-amount w-14 sm:w-16 h-8 rounded-lg border border-slate-200 px-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200" placeholder="0" min="0" step="any" inputmode="decimal" autocomplete="off">' +
            '<div class="flex flex-col gap-0 rounded-lg border border-slate-200 overflow-hidden bg-slate-50/80">' +
            '<button type="button" class="bucket-stepper-minus w-7 h-6 flex items-center justify-center text-slate-600 text-sm font-medium hover:bg-slate-200/80 transition leading-none border-t border-slate-200" data-dir="-1" aria-label="Subtract">−</button>' +
            '</div>' +
            '<button type="button" onclick="var b=this.closest(\'.bucket-row\'); var k=b.getAttribute(\'data-bucket-key\'); var v=b.querySelector(\'.bucket-amount-input\'); openBucketTransferModal(\'savings\', k, v?v.value:\'\');" class="h-8 w-8 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center text-sm font-bold transition" title="Open bucket options">⋯</button>' +
            '<button type="button" class="bucket-row-apply ledger-bar-complete flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center text-sm font-bold hover:bg-emerald-600 transition shadow-sm" title="Apply amount">✓</button>' +
            '</div></div>';
    }).join('');

    if (!list._savingsDelegation) {
        list._savingsDelegation = true;
        list.addEventListener('click', function (e) {
            var row = e.target.closest('.bucket-row');
            if (!row) return;
            var key = row.getAttribute('data-bucket-key');
            if (!key) return;

            var labelWrap = e.target.closest('.bucket-row-label-wrap');
            if (labelWrap && !e.target.closest('.bucket-row-name-edit')) {
                if (key === 'General Savings') return;
                e.preventDefault();
                var editInput = labelWrap.querySelector('.bucket-row-name-edit');
                if (editInput) {
                    labelWrap.classList.add('editing');
                    editInput.value = key;
                    editInput.focus();
                    editInput.select();
                }
                return;
            }

            var stepperBtn = e.target.closest('.bucket-stepper-plus, .bucket-stepper-minus');
            if (stepperBtn) {
                var dir = parseInt(stepperBtn.getAttribute('data-dir'), 10);
                var input = row.querySelector('.bucket-amount-input');
                if (dir && input) applySavingsBucketDelta(key, dir, input);
                return;
            }

            var applyBtn = e.target.closest('.bucket-row-apply');
            if (applyBtn) {
                var input = row.querySelector('.bucket-amount-input');
                if (input) applySavingsBucketDelta(key, 1, input);
                return;
            }
        });
        list.addEventListener('blur', function (e) {
            var editInput = e.target.closest && e.target.closest('.bucket-row-name-edit');
            if (!editInput) return;
            var row = editInput.closest('.bucket-row');
            var wrap = editInput.closest('.bucket-row-label-wrap');
            if (!row || !wrap) return;
            if (!list.contains(row)) return; // Row was removed by re-render (e.g. after delete) — don't run rename with stale data
            var key = row.getAttribute('data-bucket-key');
            var newName = editInput.value.trim();
            wrap.classList.remove('editing');
            if (newName && newName !== key) renameSavingsBucket(key, newName);
        }, true);
        list.addEventListener('keydown', function (e) {
            var editInput = e.target.closest && e.target.closest('.bucket-row-name-edit');
            if (!editInput) return;
            var row = editInput.closest('.bucket-row');
            var wrap = editInput.closest('.bucket-row-label-wrap');
            if (!row || !wrap) return;
            if (!list.contains(row)) return; // Row was removed by re-render — don't run rename with stale data
            var key = row.getAttribute('data-bucket-key');
            if (e.key === 'Enter') {
                e.preventDefault();
                var newName = editInput.value.trim();
                wrap.classList.remove('editing');
                if (newName && newName !== key) renameSavingsBucket(key, newName);
                editInput.blur();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                editInput.value = key;
                wrap.classList.remove('editing');
                editInput.blur();
            }
        });
    }

    var moveBtn = document.getElementById('savings-move-btn');
    if (moveBtn && !moveBtn._wired) {
        moveBtn._wired = true;
        moveBtn.addEventListener('click', function () {
            var fromEl = document.getElementById('savings-move-from');
            var toEl = document.getElementById('savings-move-to');
            var amountEl = document.getElementById('savings-move-amount');
            if (!fromEl || !toEl || !amountEl) return;
            var from = fromEl.value, to = toEl.value, amount = amountEl.value;
            if (from === to) return;
            if (from === SAVINGS_WEEKLY && to !== SAVINGS_EXTRA && to !== SAVINGS_WEEKLY) {
                doSavingsAddFromWeekly(to, amount);
            } else if (to === SAVINGS_WEEKLY && from !== SAVINGS_EXTRA && from !== SAVINGS_WEEKLY) {
                doSavingsSendToWeekly(from, amount);
            } else {
                doSavingsTransfer(from, to, amount);
            }
            amountEl.value = '';
        });
    }
}

function applySavingsBucketDelta(bucketKey, dir, amountEl) {
    if (dir >= 0) {
        if (typeof showAppAlert === 'function') showAppAlert('Use Receive from in the bucket menu to add money into this bucket.');
        return;
    }
    burnBucketAmount('savings', bucketKey, amountEl ? amountEl.value : '');
}

function updateSavingsBucketRowAmount(bucketKey) {
    var list = document.getElementById('savings-buckets-list');
    if (!list) return;
    var rows = list.querySelectorAll('.bucket-row');
    for (var i = 0; i < rows.length; i++) {
        if (rows[i].getAttribute('data-bucket-key') === bucketKey) {
            var el = rows[i].querySelector('.bucket-row-balance') || rows[i].querySelector('.bucket-amount');
            if (el) el.textContent = formatMoney(getSavingsBucketAmount(bucketKey));
            return;
        }
    }
}

function createSavingsBucket() {
    const input = document.getElementById('savings-bucket-name');
    const name = input?.value?.trim();
    if (!name) return;
    ensureAccountsState();
    if (state.accounts.savingsBuckets[name] !== undefined) {
        showAppAlert('Bucket already exists.');
        return;
    }
    pushToUndo();
    if (typeof unmarkSavingsBucketDeleted === 'function') unmarkSavingsBucketDeleted(name);
    state.accounts.savingsBuckets[name] = 0;
    state.accounts.savingsBudgetPlan[name] = 0;
    if (!Array.isArray(state.accounts.savingsBucketOrder)) state.accounts.savingsBucketOrder = ['General Savings'];
    if (state.accounts.savingsBucketOrder.indexOf(name) === -1) state.accounts.savingsBucketOrder.push(name);
    if (typeof normalizePaycheckPriorityOrder === 'function') normalizePaycheckPriorityOrder();
    syncSavingsTotal();
    input.value = '';
    saveState();
    renderSavingsBuckets();
    updateGlobalUI();
    if (typeof renderStrategy === 'function') renderStrategy();
}

function updateSavingsDefaultBucket(value) {
    if (!value) return;
    ensureAccountsState();
    state.accounts.savingsDefaultBucket = value;
    saveState();
}

function renameSavingsBucket(oldName, newNameFromInline) {
    const newName = newNameFromInline !== undefined ? String(newNameFromInline).trim() : prompt('Rename bucket:', oldName);
    if (!newName || newName === oldName) return;
    if (oldName === 'General Savings') {
        showAppAlert('"General Savings" name is locked.');
        return;
    }
    ensureAccountsState();
    if (state.accounts.savingsBuckets[newName] !== undefined) {
        showAppAlert('Bucket already exists.');
        return;
    }
    pushToUndo();
    if (typeof markSavingsBucketDeleted === 'function') markSavingsBucketDeleted(oldName);
    if (typeof unmarkSavingsBucketDeleted === 'function') unmarkSavingsBucketDeleted(newName);
    state.accounts.savingsBuckets[newName] = state.accounts.savingsBuckets[oldName] || 0;
    delete state.accounts.savingsBuckets[oldName];
    state.accounts.savingsBudgetPlan[newName] = Number(state.accounts.savingsBudgetPlan[oldName]) || 0;
    delete state.accounts.savingsBudgetPlan[oldName];
    if (Array.isArray(state.accounts.savingsBucketOrder)) {
        state.accounts.savingsBucketOrder = state.accounts.savingsBucketOrder.map(function (key) {
            return key === oldName ? newName : key;
        });
    }
    if (state.accounts.savingsDefaultBucket === oldName) {
        state.accounts.savingsDefaultBucket = newName;
    }
    moveBucketHistoryKey('savings', oldName, newName);
    if (typeof normalizePaycheckPriorityOrder === 'function') normalizePaycheckPriorityOrder();
    syncSavingsTotal();
    saveState();
    renderSavingsBuckets();
    updateGlobalUI();
    if (typeof renderStrategy === 'function') renderStrategy();
}

function deleteSavingsBucket(name) {
    if (name === 'General Savings') {
        showAppAlert('"General Savings" cannot be deleted.');
        return;
    }
    ensureAccountsState();
    const remaining = Object.keys(state.accounts.savingsBuckets).length;
    if (remaining <= 1) {
        showAppAlert('You must keep at least one bucket.');
        return;
    }
    showAppConfirm('Delete "' + name + '" bucket and move its funds to Extra?', function () {
        const amount = state.accounts.savingsBuckets[name] || 0;
        pushToUndo();
        if (typeof markSavingsBucketDeleted === 'function') markSavingsBucketDeleted(name);
        delete state.accounts.savingsBuckets[name];
        delete state.accounts.savingsBudgetPlan[name];
        if (Array.isArray(state.accounts.savingsBucketOrder)) {
            state.accounts.savingsBucketOrder = state.accounts.savingsBucketOrder.filter(function (key) { return key !== name; });
        }
        if (state.accounts.savingsDefaultBucket === name) {
            state.accounts.savingsDefaultBucket = (typeof getCanonicalSavingsBucketOrder === 'function' ? getCanonicalSavingsBucketOrder() : Object.keys(state.accounts.savingsBuckets))[0];
        }
        if (typeof normalizePaycheckPriorityOrder === 'function') normalizePaycheckPriorityOrder();
        syncSavingsTotal();
        applyTransaction({ type: 'adjust_surplus', delta: amount });
        saveState();
        renderSavingsBuckets();
        updateGlobalUI();
        if (typeof renderStrategy === 'function') renderStrategy();
    }, null, { confirmLabel: 'Delete' });
}

function syncSavingsBudgetPlanItemAmount() {
    var sec = state.categories.find(function (s) { return s && s.id === 'sys_savings'; });
    if (!sec) return;
    var item = (sec.items || []).find(function (i) { return i && i.label === 'Savings'; });
    if (!item) return;
    var rm = typeof roundMoney === 'function' ? roundMoney : function (x) { return Math.round(Number(x) * 100) / 100; };
    var total = (typeof getCanonicalSavingsBudgetPlanTotal === 'function')
        ? getCanonicalSavingsBudgetPlanTotal()
        : 0;
    item.amount = rm(total);
    if (typeof refreshSavingsPlanTotalsUI === 'function') refreshSavingsPlanTotalsUI();
}

function syncSavingsBucketBudgetAmount(bucketKey, rawValue, opts) {
    opts = opts || {};
    ensureGeneralSavingsBudgetConfig();
    if (!bucketKey || state.accounts.savingsBuckets[bucketKey] === undefined) return;
    var amount = typeof roundMoney === 'function' ? roundMoney(rawValue) : Number(rawValue);
    if (Number.isNaN(amount) || amount < 0) amount = 0;
    state.accounts.savingsBudgetPlan[bucketKey] = amount;
    syncSavingsBudgetPlanItemAmount();
    if (opts.save !== false) saveState();
    if (typeof scheduleBudgetPlanAllocatedRefresh === 'function') scheduleBudgetPlanAllocatedRefresh();
    if (typeof updateAllocatedTotalUI === 'function') {
        var rm2 = typeof roundMoney === 'function' ? roundMoney : function (v) { return Math.round(Number(v) * 100) / 100; };
        var total = rm2(typeof state.monthlyIncome === 'number' ? state.monthlyIncome : 0);
        var allocated = 0;
        (state.categories || []).forEach(function (sec) {
            (sec.items || []).forEach(function (item) {
                if (!item || item.label === 'Payables') return;
                if ((state.settings && state.settings.showFoodPlan === false) && item.label === 'Daily Food') return;
                allocated += typeof item.amount === 'number' ? rm2(item.amount) : 0;
            });
        });
        updateAllocatedTotalUI({ total: total, allocated: rm2(allocated), prefix: 'onboarding-cat' });
    }
}
window.syncSavingsBucketBudgetAmount = syncSavingsBucketBudgetAmount;

function createSavingsBucketFromBudgetPlan() {
    var input = document.getElementById('budget-plan-savings-bucket-name');
    if (!input) return;
    var value = String(input.value || '').trim();
    if (!value) return;
    var legacyInput = document.getElementById('savings-bucket-name');
    if (legacyInput) legacyInput.value = value;
    createSavingsBucket();
    input.value = '';
    if (typeof renderStrategy === 'function') renderStrategy();
}
window.createSavingsBucketFromBudgetPlan = createSavingsBucketFromBudgetPlan;

// Transportation Buckets (same interface as Savings / Payables)
var TRANSPORTATION_EXTRA = '__extra__';
var TRANSPORTATION_WEEKLY = '__weekly__';

function openTransportationBuckets() {
    renderTransportationBuckets();
    toggleModal('transportation-buckets-modal', true);
}
window.openTransportationBuckets = openTransportationBuckets;

function closeTransportationBuckets() {
    toggleModal('transportation-buckets-modal', false);
}
window.closeTransportationBuckets = closeTransportationBuckets;

function adjustTransportationBucket(bucketKey, delta) {
    adjustBucketValue(getBucketContext('transportation'), bucketKey, delta);
}

function getTransportationBucketAmount(bucketKey) {
    return getBucketValue(getBucketContext('transportation'), bucketKey);
}

function doTransportationTransfer(fromKey, toKey, amount) {
    if (!transferBetweenBuckets(getBucketContext('transportation'), fromKey, toKey, amount)) return;
    commitUI('global');
    renderTransportationBuckets();
}

function doTransportationAddFromWeekly(toBucketKey, amount) {
    if (!transferWeeklyToBucket(getBucketContext('transportation'), toBucketKey, amount)) return;
    commitUI('global');
    renderTransportationBuckets();
}

function doTransportationSendToWeekly(fromBucketKey, amount) {
    if (!transferBucketToWeekly(getBucketContext('transportation'), fromBucketKey, amount)) return;
    commitUI('global');
    renderTransportationBuckets();
}

function renderTransportationBuckets() {
    ensureAccountsState();
    var entries = Object.entries(state.accounts.transportationBuckets || {});
    if (Array.isArray(state._deletedTransportationBuckets) && state._deletedTransportationBuckets.length) {
        entries = entries.filter(function (e) { return state._deletedTransportationBuckets.indexOf(e[0]) === -1; });
    }
    var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); };
    var bucketOpts = entries.map(function (e) { return '<option value="' + esc(e[0]) + '">' + esc(e[0]) + '</option>'; }).join('');
    var fromToOpts = '<option value="' + TRANSPORTATION_EXTRA + '">Extra</option><option value="' + TRANSPORTATION_WEEKLY + '">Weekly Allowance</option>' + bucketOpts;

    var moveFrom = document.getElementById('transportation-move-from');
    var moveTo = document.getElementById('transportation-move-to');
    if (moveFrom) moveFrom.innerHTML = fromToOpts;
    if (moveTo) moveTo.innerHTML = fromToOpts;

    var list = document.getElementById('transportation-buckets-list');
    if (!list) return;
    if (!entries.length) {
        list.innerHTML = '<div class="text-center text-[10px] text-slate-400 py-4">No buckets yet. Create one below.</div>';
        return;
    }
    list.innerHTML = entries.map(function (e) {
        var key = e[0], amount = e[1];
        return '<div class="bucket-row bucket-row-card ledger-bar flex items-center gap-2 sm:gap-3 w-full py-2.5 px-3 sm:px-4 rounded-xl border border-slate-100 bg-white hover:border-slate-200 transition-all" data-bucket-key="' + esc(key) + '" data-context="transportation">' +
            '<div class="flex-1 min-w-0 flex flex-col gap-0.5">' +
            '<div class="bucket-row-label-wrap" role="button" tabindex="0" title="Tap to rename">' +
            '<span class="bucket-row-label text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate">' + esc(key) + '</span>' +
            '<input type="text" class="bucket-row-name-edit" maxlength="80" aria-label="Rename bucket" autocomplete="off">' +
            '<span class="bucket-row-label-line" aria-hidden="true"></span>' +
            '</div>' +
            '<div class="h-1.5 w-full max-w-[100px] rounded-full bg-slate-100 overflow-hidden"><div class="ledger-bar-fill h-full rounded-full bg-slate-400 transition-all" style="width:100%"></div></div>' +
            '</div>' +
            '<div class="flex items-center gap-1.5 flex-shrink-0 text-right">' +
            '<p class="bucket-row-balance bucket-amount text-base sm:text-lg font-black text-slate-800">' + formatMoney(amount) + '</p>' +
            '</div>' +
            '<div class="ledger-bar-actions bucket-row-controls flex items-center gap-1.5 flex-shrink-0">' +
            '<input type="number" class="bucket-amount-input ledger-bar-amount w-14 sm:w-16 h-8 rounded-lg border border-slate-200 px-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-slate-200" placeholder="0" min="0" step="any" inputmode="decimal" autocomplete="off">' +
            '<div class="flex flex-col gap-0 rounded-lg border border-slate-200 overflow-hidden bg-slate-50/80">' +
            '<button type="button" class="bucket-stepper-plus w-7 h-6 flex items-center justify-center text-slate-600 text-sm font-medium hover:bg-slate-200/80 transition leading-none" data-dir="1" aria-label="Add">+</button>' +
            '<button type="button" class="bucket-stepper-minus w-7 h-6 flex items-center justify-center text-slate-600 text-sm font-medium hover:bg-slate-200/80 transition leading-none border-t border-slate-200" data-dir="-1" aria-label="Subtract">−</button>' +
            '</div>' +
            '<button type="button" onclick="var b=this.closest(\'.bucket-row\'); var k=b.getAttribute(\'data-bucket-key\'); var v=b.querySelector(\'.bucket-amount-input\'); openBucketTransferModal(\'transportation\', k, v?v.value:\'\');" class="h-8 w-8 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center text-sm font-bold transition" title="Open bucket options">⋯</button>' +
            '<button type="button" class="bucket-row-apply ledger-bar-complete flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center text-sm font-bold hover:bg-emerald-600 transition shadow-sm" title="Apply amount">✓</button>' +
            '</div></div>';
    }).join('');

    if (!list._transportationDelegation) {
        list._transportationDelegation = true;
        list.addEventListener('click', function (e) {
            var row = e.target.closest('.bucket-row');
            if (!row) return;
            var key = row.getAttribute('data-bucket-key');
            if (!key) return;

            var labelWrap = e.target.closest('.bucket-row-label-wrap');
            if (labelWrap && !e.target.closest('.bucket-row-name-edit')) {
                e.preventDefault();
                var editInput = labelWrap.querySelector('.bucket-row-name-edit');
                if (editInput) {
                    labelWrap.classList.add('editing');
                    editInput.value = key;
                    editInput.focus();
                    editInput.select();
                }
                return;
            }

            var stepperBtn = e.target.closest('.bucket-stepper-plus, .bucket-stepper-minus');
            if (stepperBtn) {
                var dir = parseInt(stepperBtn.getAttribute('data-dir'), 10);
                var input = row.querySelector('.bucket-amount-input');
                if (dir && input) applyTransportationBucketDelta(key, dir, input);
                return;
            }

            var applyBtn = e.target.closest('.bucket-row-apply');
            if (applyBtn) {
                var input = row.querySelector('.bucket-amount-input');
                if (input) applyTransportationBucketDelta(key, 1, input);
                return;
            }
        });
        list.addEventListener('blur', function (e) {
            var editInput = e.target.closest && e.target.closest('.bucket-row-name-edit');
            if (!editInput) return;
            var row = editInput.closest('.bucket-row');
            var wrap = editInput.closest('.bucket-row-label-wrap');
            if (!row || !wrap) return;
            if (!list.contains(row)) return;
            var key = row.getAttribute('data-bucket-key');
            var newName = editInput.value.trim();
            wrap.classList.remove('editing');
            if (newName && newName !== key) renameTransportationBucket(key, newName);
        }, true);
        list.addEventListener('keydown', function (e) {
            var editInput = e.target.closest && e.target.closest('.bucket-row-name-edit');
            if (!editInput) return;
            var row = editInput.closest('.bucket-row');
            var wrap = editInput.closest('.bucket-row-label-wrap');
            if (!row || !wrap) return;
            if (!list.contains(row)) return;
            var key = row.getAttribute('data-bucket-key');
            if (e.key === 'Enter') {
                e.preventDefault();
                var newName = editInput.value.trim();
                wrap.classList.remove('editing');
                if (newName && newName !== key) renameTransportationBucket(key, newName);
                editInput.blur();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                editInput.value = key;
                wrap.classList.remove('editing');
                editInput.blur();
            }
        });
    }

    var moveBtn = document.getElementById('transportation-move-btn');
    if (moveBtn && !moveBtn._wired) {
        moveBtn._wired = true;
        moveBtn.addEventListener('click', function () {
            var fromEl = document.getElementById('transportation-move-from');
            var toEl = document.getElementById('transportation-move-to');
            var amountEl = document.getElementById('transportation-move-amount');
            if (!fromEl || !toEl || !amountEl) return;
            var from = fromEl.value, to = toEl.value, amount = amountEl.value;
            if (from === to) return;
            if (from === TRANSPORTATION_WEEKLY && to !== TRANSPORTATION_EXTRA && to !== TRANSPORTATION_WEEKLY) {
                doTransportationAddFromWeekly(to, amount);
            } else if (to === TRANSPORTATION_WEEKLY && from !== TRANSPORTATION_EXTRA && from !== TRANSPORTATION_WEEKLY) {
                doTransportationSendToWeekly(from, amount);
            } else {
                doTransportationTransfer(from, to, amount);
            }
            amountEl.value = '';
        });
    }
}

function applyTransportationBucketDelta(bucketKey, dir, amountEl) {
    if (dir >= 0) {
        if (typeof showAppAlert === 'function') showAppAlert('Use Receive from in the bucket menu to add money into this bucket.');
        return;
    }
    burnBucketAmount('transportation', bucketKey, amountEl ? amountEl.value : '');
}

function updateTransportationBucketRowAmount(bucketKey) {
    var list = document.getElementById('transportation-buckets-list');
    if (!list) return;
    var rows = list.querySelectorAll('.bucket-row');
    for (var i = 0; i < rows.length; i++) {
        if (rows[i].getAttribute('data-bucket-key') === bucketKey) {
            var el = rows[i].querySelector('.bucket-row-balance') || rows[i].querySelector('.bucket-amount');
            if (el) el.textContent = formatMoney(getTransportationBucketAmount(bucketKey));
            return;
        }
    }
}

function createTransportationBucket() {
    const input = document.getElementById('transportation-bucket-name');
    const name = input?.value?.trim();
    if (!name) return;
    ensureAccountsState();
    if (state.accounts.transportationBuckets[name] !== undefined) {
        showAppAlert('Subcategory already exists.');
        return;
    }
    pushToUndo();
    if (typeof unmarkTransportationBucketDeleted === 'function') unmarkTransportationBucketDeleted(name);
    state.accounts.transportationBuckets[name] = 0;
    syncTransportationTotal();
    input.value = '';
    saveState();
    renderTransportationBuckets();
    updateGlobalUI();
}

function updateTransportationDefaultBucket(value) {
    if (!value) return;
    ensureAccountsState();
    state.accounts.transportationDefaultBucket = value;
    saveState();
}

function renameTransportationBucket(oldName, newNameFromInline) {
    const newName = newNameFromInline !== undefined ? String(newNameFromInline).trim() : prompt('Rename subcategory:', oldName);
    if (!newName || newName === oldName) return;
    ensureAccountsState();
    if (state.accounts.transportationBuckets[newName] !== undefined) {
        showAppAlert('Subcategory already exists.');
        return;
    }
    pushToUndo();
    if (typeof markTransportationBucketDeleted === 'function') markTransportationBucketDeleted(oldName);
    if (typeof unmarkTransportationBucketDeleted === 'function') unmarkTransportationBucketDeleted(newName);
    state.accounts.transportationBuckets[newName] = state.accounts.transportationBuckets[oldName] || 0;
    delete state.accounts.transportationBuckets[oldName];
    if (state.accounts.transportationDefaultBucket === oldName) {
        state.accounts.transportationDefaultBucket = newName;
    }
    moveBucketHistoryKey('transportation', oldName, newName);
    syncTransportationTotal();
    saveState();
    renderTransportationBuckets();
    updateGlobalUI();
}

function deleteTransportationBucket(name) {
    ensureAccountsState();
    const remaining = Object.keys(state.accounts.transportationBuckets).length;
    if (remaining <= 1) {
        showAppAlert('You must keep at least one subcategory.');
        return;
    }
    showAppConfirm('Delete "' + name + '" and move its funds to Extra?', function () {
        const amount = state.accounts.transportationBuckets[name] || 0;
        pushToUndo();
        if (typeof markTransportationBucketDeleted === 'function') markTransportationBucketDeleted(name);
        delete state.accounts.transportationBuckets[name];
        if (state.accounts.transportationDefaultBucket === name) {
            state.accounts.transportationDefaultBucket = Object.keys(state.accounts.transportationBuckets)[0];
        }
        syncTransportationTotal();
        applyTransaction({ type: 'adjust_surplus', delta: amount });
        saveState();
        renderTransportationBuckets();
        updateGlobalUI();
    }, null, { confirmLabel: 'Delete' });
}

// Payables Buckets (source/dest options for "outside" buckets)
var PAYABLES_EXTRA = '__extra__';
var PAYABLES_WEEKLY = '__weekly__';

function openPayablesBuckets() {
    renderPayablesBuckets();
    toggleModal('payables-buckets-modal', true);
}
window.openPayablesBuckets = openPayablesBuckets;

function closePayablesBuckets() {
    toggleModal('payables-buckets-modal', false);
}
window.closePayablesBuckets = closePayablesBuckets;

function openBucketTransferModal(context, bucketKey, prefillAmount) {
    ensureAccountsState();
    var ui = getBucketTransferModalElements();
    if (!ui.modal) return;
    ui.modal.setAttribute('data-context', context);
    ui.modal.setAttribute('data-bucket-key', bucketKey);
    ui.modal.setAttribute('data-mode', 'send');
    ui.modal._bucketTransferExpanded = {};
    if (ui.amount) {
        ui.amount.value = (prefillAmount !== undefined && prefillAmount !== null && String(prefillAmount).trim() !== '') ? String(prefillAmount).trim() : '';
    }
    if (!ui.modal._bucketTransferWired) {
        ui.modal._bucketTransferWired = true;
        if (ui.sendBtn) ui.sendBtn.addEventListener('click', function () { setBucketTransferMode('send'); });
        if (ui.receiveBtn) ui.receiveBtn.addEventListener('click', function () { setBucketTransferMode('receive'); });
        ui.modal.addEventListener('click', function (e) {
            var groupToggle = e.target.closest('[data-group-toggle]');
            if (groupToggle) {
                var groupId = groupToggle.getAttribute('data-group-toggle');
                if (!ui.modal._bucketTransferExpanded) ui.modal._bucketTransferExpanded = {};
                ui.modal._bucketTransferExpanded[groupId] = !ui.modal._bucketTransferExpanded[groupId];
                renderBucketTransferModal();
                return;
            }
            var optionBtn = e.target.closest('[data-option-ref]');
            if (optionBtn) {
                var option = getBucketTransferOptionFromRef(optionBtn.getAttribute('data-option-ref'));
                executeBucketTransferSelection(option);
            }
        });
    }
    toggleModal('bucket-transfer-modal', true);
    renderBucketTransferModal();
}
window.openBucketTransferModal = openBucketTransferModal;

function closeBucketTransferModal() {
    toggleModal('bucket-transfer-modal', false);
}
window.closeBucketTransferModal = closeBucketTransferModal;

function deleteBucketFromTransferModal() {
    var modal = document.getElementById('bucket-transfer-modal');
    if (!modal) return;
    var ctx = modal.getAttribute('data-context');
    var key = modal.getAttribute('data-bucket-key');
    if (!key) return;
    closeBucketTransferModal();
    if (ctx === 'savings') deleteSavingsBucket(key);
    else if (ctx === 'payables') deletePayablesBucket(key);
    else if (ctx === 'transportation') deleteTransportationBucket(key);
}
window.deleteBucketFromTransferModal = deleteBucketFromTransferModal;

function adjustPayablesBucket(bucketKey, delta) {
    adjustBucketValue(getBucketContext('payables'), bucketKey, delta);
}

function getPayablesBucketAmount(bucketKey) {
    return getBucketValue(getBucketContext('payables'), bucketKey);
}

function doPayablesTransfer(fromKey, toKey, amount) {
    if (!transferBetweenBuckets(getBucketContext('payables'), fromKey, toKey, amount)) return;
    commitUI('global');
    renderPayablesBuckets();
}

function doPayablesAddFromWeekly(toBucketKey, amount) {
    if (!transferWeeklyToBucket(getBucketContext('payables'), toBucketKey, amount)) return;
    commitUI('global');
    renderPayablesBuckets();
}

function doPayablesSendToWeekly(fromBucketKey, amount) {
    if (!transferBucketToWeekly(getBucketContext('payables'), fromBucketKey, amount)) return;
    commitUI('global');
    renderPayablesBuckets();
}

function renderPayablesBuckets() {
    ensureAccountsState();
    var entries = Object.entries(state.accounts.payablesBuckets || {});
    // Hard filter: never show buckets the user has explicitly deleted, even if some stale source
    // (cloud, backup, old tab) tried to re-insert them.
    if (Array.isArray(state._deletedPayablesBuckets) && state._deletedPayablesBuckets.length) {
        entries = entries.filter(function (e) { return state._deletedPayablesBuckets.indexOf(e[0]) === -1; });
    }
    var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); };
    var bucketOpts = entries.map(function (e) { return '<option value="' + esc(e[0]) + '">' + esc(e[0]) + '</option>'; }).join('');
    var fromToOpts = '<option value="' + PAYABLES_EXTRA + '">Extra</option><option value="' + PAYABLES_WEEKLY + '">Weekly Allowance</option>' + bucketOpts;

    var moveFrom = document.getElementById('payables-move-from');
    var moveTo = document.getElementById('payables-move-to');
    if (moveFrom) moveFrom.innerHTML = fromToOpts;
    if (moveTo) moveTo.innerHTML = fromToOpts;

    var list = document.getElementById('payables-buckets-list');
    if (!list) return;
    if (!entries.length) {
        list.innerHTML = '<div class="text-center text-[10px] text-slate-400 py-4">No buckets yet. Create one below.</div>';
        return;
    }
    list.innerHTML = entries.map(function (e) {
        var key = e[0], amount = e[1];
        return '<div class="bucket-row bucket-row-card ledger-bar flex items-center gap-2 sm:gap-3 w-full py-2.5 px-3 sm:px-4 rounded-xl border border-slate-100 bg-white hover:border-slate-200 transition-all" data-bucket-key="' + esc(key) + '" data-context="payables">' +
            '<div class="flex-1 min-w-0 flex flex-col gap-0.5">' +
            '<div class="bucket-row-label-wrap" role="button" tabindex="0" title="Tap to rename">' +
            '<span class="bucket-row-label text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate">' + esc(key) + '</span>' +
            '<input type="text" class="bucket-row-name-edit" maxlength="80" aria-label="Rename bucket" autocomplete="off">' +
            '<span class="bucket-row-label-line" aria-hidden="true"></span>' +
            '</div>' +
            '<div class="h-1.5 w-full max-w-[100px] rounded-full bg-slate-100 overflow-hidden"><div class="ledger-bar-fill h-full rounded-full bg-amber-400 transition-all" style="width:100%"></div></div>' +
            '</div>' +
            '<div class="flex items-center gap-1.5 flex-shrink-0 text-right">' +
            '<p class="bucket-row-balance bucket-amount text-base sm:text-lg font-black text-slate-800">' + formatMoney(amount) + '</p>' +
            '</div>' +
            '<div class="ledger-bar-actions bucket-row-controls flex items-center gap-1.5 flex-shrink-0">' +
            '<input type="number" class="bucket-amount-input ledger-bar-amount w-14 sm:w-16 h-8 rounded-lg border border-slate-200 px-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-amber-200" placeholder="0" min="0" step="any" inputmode="decimal" autocomplete="off">' +
            '<div class="flex flex-col gap-0 rounded-lg border border-slate-200 overflow-hidden bg-slate-50/80">' +
            '<button type="button" class="bucket-stepper-plus w-7 h-6 flex items-center justify-center text-slate-600 text-sm font-medium hover:bg-slate-200/80 transition leading-none" data-dir="1" aria-label="Add">+</button>' +
            '<button type="button" class="bucket-stepper-minus w-7 h-6 flex items-center justify-center text-slate-600 text-sm font-medium hover:bg-slate-200/80 transition leading-none border-t border-slate-200" data-dir="-1" aria-label="Subtract">−</button>' +
            '</div>' +
            '<button type="button" onclick="var b=this.closest(\'.bucket-row\'); var k=b.getAttribute(\'data-bucket-key\'); var v=b.querySelector(\'.bucket-amount-input\'); openBucketTransferModal(\'payables\', k, v?v.value:\'\');" class="h-8 w-8 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center text-sm font-bold transition" title="Open bucket options">⋯</button>' +
            '<button type="button" class="bucket-row-apply ledger-bar-complete flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center text-sm font-bold hover:bg-emerald-600 transition shadow-sm" title="Apply amount">✓</button>' +
            '</div></div>';
    }).join('');

    if (!list._payablesDelegation) {
        list._payablesDelegation = true;
        list.addEventListener('click', function (e) {
            var row = e.target.closest('.bucket-row');
            if (!row) return;
            var key = row.getAttribute('data-bucket-key');
            if (!key) return;

            var labelWrap = e.target.closest('.bucket-row-label-wrap');
            if (labelWrap && !e.target.closest('.bucket-row-name-edit')) {
                e.preventDefault();
                var editInput = labelWrap.querySelector('.bucket-row-name-edit');
                if (editInput) {
                    labelWrap.classList.add('editing');
                    editInput.value = key;
                    editInput.focus();
                    editInput.select();
                }
                return;
            }

            var stepperBtn = e.target.closest('.bucket-stepper-plus, .bucket-stepper-minus');
            if (stepperBtn) {
                var dir = parseInt(stepperBtn.getAttribute('data-dir'), 10);
                var input = row.querySelector('.bucket-amount-input');
                if (dir && input) applyPayablesBucketDelta(key, dir, input);
                return;
            }

            var applyBtn = e.target.closest('.bucket-row-apply');
            if (applyBtn) {
                var input = row.querySelector('.bucket-amount-input');
                if (input) applyPayablesBucketDelta(key, 1, input);
                return;
            }
        });
        list.addEventListener('blur', function (e) {
            var editInput = e.target.closest && e.target.closest('.bucket-row-name-edit');
            if (!editInput) return;
            var row = editInput.closest('.bucket-row');
            var wrap = editInput.closest('.bucket-row-label-wrap');
            if (!row || !wrap) return;
            if (!list.contains(row)) return; // Row was removed by re-render (e.g. after delete) — don't run rename with stale data
            var key = row.getAttribute('data-bucket-key');
            var newName = editInput.value.trim();
            wrap.classList.remove('editing');
            if (newName && newName !== key) renamePayablesBucket(key, newName);
        }, true);
        list.addEventListener('keydown', function (e) {
            var editInput = e.target.closest && e.target.closest('.bucket-row-name-edit');
            if (!editInput) return;
            var row = editInput.closest('.bucket-row');
            var wrap = editInput.closest('.bucket-row-label-wrap');
            if (!row || !wrap) return;
            if (!list.contains(row)) return; // Row was removed by re-render — don't run rename with stale data
            var key = row.getAttribute('data-bucket-key');
            if (e.key === 'Enter') {
                e.preventDefault();
                var newName = editInput.value.trim();
                wrap.classList.remove('editing');
                if (newName && newName !== key) renamePayablesBucket(key, newName);
                editInput.blur();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                editInput.value = key;
                wrap.classList.remove('editing');
                editInput.blur();
            }
        });
    }

    var moveBtn = document.getElementById('payables-move-btn');
    if (moveBtn && !moveBtn._wired) {
        moveBtn._wired = true;
        moveBtn.addEventListener('click', function () {
            var fromEl = document.getElementById('payables-move-from');
            var toEl = document.getElementById('payables-move-to');
            var amountEl = document.getElementById('payables-move-amount');
            if (!fromEl || !toEl || !amountEl) return;
            var from = fromEl.value, to = toEl.value, amount = amountEl.value;
            if (from === to) return;
            if (from === PAYABLES_WEEKLY && to !== PAYABLES_EXTRA && to !== PAYABLES_WEEKLY) {
                doPayablesAddFromWeekly(to, amount);
            } else if (to === PAYABLES_WEEKLY && from !== PAYABLES_EXTRA && from !== PAYABLES_WEEKLY) {
                doPayablesSendToWeekly(from, amount);
            } else {
                doPayablesTransfer(from, to, amount);
            }
            amountEl.value = '';
        });
    }
}

function applyPayablesBucketDelta(bucketKey, dir, amountEl) {
    if (dir >= 0) {
        if (typeof showAppAlert === 'function') showAppAlert('Use Receive from in the bucket menu to add money into this bucket.');
        return;
    }
    burnBucketAmount('payables', bucketKey, amountEl ? amountEl.value : '');
}

function updatePayablesBucketRowAmount(bucketKey) {
    var list = document.getElementById('payables-buckets-list');
    if (!list) return;
    var rows = list.querySelectorAll('.bucket-row');
    for (var i = 0; i < rows.length; i++) {
        if (rows[i].getAttribute('data-bucket-key') === bucketKey) {
            var el = rows[i].querySelector('.bucket-row-balance') || rows[i].querySelector('.bucket-amount');
            if (el) el.textContent = formatMoney(getPayablesBucketAmount(bucketKey));
            return;
        }
    }
}

function createPayablesBucket() {
    const input = document.getElementById('payables-bucket-name');
    const name = input?.value?.trim();
    if (!name) return;
    ensureAccountsState();
    if (state.accounts.payablesBuckets[name] !== undefined) {
        showAppAlert('Subcategory already exists.');
        return;
    }
    pushToUndo();
    if (typeof unmarkPayablesBucketDeleted === 'function') unmarkPayablesBucketDeleted(name);
    state.accounts.payablesBuckets[name] = 0;
    syncPayablesTotal();
    input.value = '';
    saveState();
    renderPayablesBuckets();
    updateGlobalUI();
}

function updatePayablesDefaultBucket(value) {
    if (!value) return;
    ensureAccountsState();
    state.accounts.payablesDefaultBucket = value;
    saveState();
}

function renamePayablesBucket(oldName, newNameFromInline) {
    const newName = newNameFromInline !== undefined ? String(newNameFromInline).trim() : prompt('Rename subcategory:', oldName);
    if (!newName || newName === oldName) return;
    ensureAccountsState();
    if (state.accounts.payablesBuckets[newName] !== undefined) {
        showAppAlert('Subcategory already exists.');
        return;
    }
    pushToUndo();
    if (typeof markPayablesBucketDeleted === 'function') markPayablesBucketDeleted(oldName);
    if (typeof unmarkPayablesBucketDeleted === 'function') unmarkPayablesBucketDeleted(newName);
    state.accounts.payablesBuckets[newName] = state.accounts.payablesBuckets[oldName] || 0;
    delete state.accounts.payablesBuckets[oldName];
    if (state.accounts.payablesDefaultBucket === oldName) {
        state.accounts.payablesDefaultBucket = newName;
    }
    moveBucketHistoryKey('payables', oldName, newName);
    syncPayablesTotal();
    saveState();
    renderPayablesBuckets();
    updateGlobalUI();
}

function deletePayablesBucket(name) {
    ensureAccountsState();
    const remaining = Object.keys(state.accounts.payablesBuckets).length;
    if (remaining <= 1) {
        showAppAlert('You must keep at least one subcategory.');
        return;
    }
    showAppConfirm('Delete "' + name + '" and move its funds to Extra?', function () {
        const amount = state.accounts.payablesBuckets[name] || 0;
        pushToUndo();
        if (typeof markPayablesBucketDeleted === 'function') markPayablesBucketDeleted(name);
        delete state.accounts.payablesBuckets[name];
        if (state.accounts.payablesDefaultBucket === name) {
            state.accounts.payablesDefaultBucket = Object.keys(state.accounts.payablesBuckets)[0];
        }
        syncPayablesTotal();
        applyTransaction({ type: 'adjust_surplus', delta: amount });
        saveState();
        renderPayablesBuckets();
        updateGlobalUI();
    }, null, { confirmLabel: 'Delete' });
}

// Settings
function saveSettingsFromUI() {
    const currencyInput = document.getElementById('settings-currency');
    const showFoodPlanToggle = document.getElementById('budget-show-food-plan') || document.getElementById('settings-show-food-plan');
    const compactToggle = document.getElementById('settings-compact');
    const firstDaySelect = document.getElementById('settings-first-day-of-week');
    const payDateSelect = document.getElementById('settings-pay-date');

    const currency = currencyInput?.value?.trim() || 'AED';
    const firstDayOfWeek = firstDaySelect ? Math.max(0, Math.min(6, parseInt(firstDaySelect.value, 10))) : 3;
    const payDate = payDateSelect ? Math.max(1, Math.min(28, parseInt(payDateSelect.value, 10))) : 28;

    state.settings = {
        ...state.settings,
        currency,
        decimals: 2,
        confirmSurplusEdits: true,
        allowNegativeSurplus: true,
        showFoodPlan: showFoodPlanToggle ? !!showFoodPlanToggle.checked : (state.settings?.showFoodPlan !== false),
        showFoodTracker: state.settings?.showFoodTracker !== false,
        theme: state.settings?.theme || 'sepia',
        compact: !!compactToggle?.checked,
        firstDayOfWeek: Number.isNaN(firstDayOfWeek) ? 3 : firstDayOfWeek,
        payDate: Number.isNaN(payDate) ? 28 : payDate
    };

    saveState();
    applySettings();
    renderLedger();
    renderStrategy();
    updateGlobalUI();
    renderSettings();
}

// --- BUG REPORTS ---
var BUG_REPORT_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSfbVSZGgXr3N9m8Xa_gtzbsHNgmhJAifpYNFP3s2lJDysi0Xg/viewform?usp=publish-editor';

function openBugReportModal() {
    if (!BUG_REPORT_FORM_URL) {
        if (typeof showAppAlert === 'function') showAppAlert('Bug report form URL is not configured.');
        return;
    }
    window.open(BUG_REPORT_FORM_URL, '_blank', 'noopener,noreferrer');
}
window.openBugReportModal = openBugReportModal;

function closeBugReportModal() {
    toggleModal('bug-report-modal', false);
}
window.closeBugReportModal = closeBugReportModal;

function submitBugReport() {
    openBugReportModal();
}
window.submitBugReport = submitBugReport;

function rebuildTotals() {
    pushToUndo();
    ensureAccountsState();
    state.categories.forEach(sec => {
        sec.items.forEach(item => {
            if (isAccountLabel(item.label)) {
                if (item.label === 'Savings') {
                    if (state.accounts.savingsBuckets['General Savings'] === undefined) {
                        state.accounts.savingsBuckets['General Savings'] = item.amount;
                    }
                    syncSavingsTotal();
                } else if (item.label === 'Payables') {
                    if (state.accounts.payablesBuckets.Main === undefined) {
                        state.accounts.payablesBuckets.Main = item.amount;
                    }
                    syncPayablesTotal();
                } else if (item.label === 'Transportation') {
                    if (state.accounts.transportationBuckets.Main === undefined) {
                        state.accounts.transportationBuckets.Main = item.amount;
                    }
                    syncTransportationTotal();
                } else if (state.accounts.buckets[item.label] === undefined) {
                    state.accounts.buckets[item.label] = item.amount;
                }
            } else if (state.balances[item.label] === undefined) {
                if (item.label !== ITEM_LABELS.FOOD_BASE && item.label !== 'Daily Food') {
                    state.balances[item.label] = item.amount;
                }
            }
        });
    });
    saveState();
    renderLedger();
    renderStrategy();
    updateGlobalUI();
}

function exportState() {
    const payload = JSON.stringify(state, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `finance-command-backup-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function openImportBackupModal() {
    renderAutoBackupList();
    toggleModal('import-backup-modal', true);
}
window.openImportBackupModal = openImportBackupModal;

function closeImportBackupModal() {
    toggleModal('import-backup-modal', false);
}
window.closeImportBackupModal = closeImportBackupModal;

function renderAutoBackupList() {
    const listEl = document.getElementById('import-auto-backup-list');
    if (!listEl) return;
    const key = STORAGE_KEYS.AUTO_BACKUPS;
    const raw = localStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    if (!list.length) {
        listEl.innerHTML = '<p class="text-xs text-slate-400">No auto-saved versions available.</p>';
        return;
    }
    const currency = (typeof getCurrencyLabel === 'function') ? getCurrencyLabel() : '';
    listEl.innerHTML = list.map(function (entry, idx) {
        const savedAt = entry.savedAt ? new Date(entry.savedAt) : new Date();
        const dateStr = savedAt.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
        const balanceStr = (typeof formatMoney === 'function') ? formatMoney(entry.bankBalance || 0) : String(entry.bankBalance || 0);
        return '<div class="flex items-center justify-between gap-3 py-2 px-3 rounded-lg bg-slate-50 border border-slate-100">' +
            '<div class="min-w-0 flex-1">' +
            '<p class="text-xs font-bold text-slate-700 truncate">' + dateStr + '</p>' +
            '<p class="text-[10px] text-slate-500">Bank balance: ' + balanceStr + ' ' + currency + '</p>' +
            '</div>' +
            '<button type="button" onclick="restoreFromAutoBackup(' + idx + ')" class="shrink-0 py-2 px-3 bg-indigo-600 text-white rounded-lg text-[10px] font-bold uppercase">Restore</button>' +
            '</div>';
    }).join('');
}

function restoreFromAutoBackup(index) {
    const key = STORAGE_KEYS.AUTO_BACKUPS;
    const raw = localStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    const entry = list[index];
    if (!entry || !entry.state) {
        showAppAlert('That version is no longer available.');
        return;
    }
    showAppConfirm('Restore this version? Current state will be replaced and the page will reload.', function () {
        state = entry.state;
        migrateState();
        ensureSystemSavings();
        ensureCoreItems();
        ensureSettings();
        if (typeof normalizeMoneyPrecision === 'function') normalizeMoneyPrecision();
        saveState();
        closeImportBackupModal();
        location.reload();
    }, null, { confirmLabel: 'Restore' });
}
window.restoreFromAutoBackup = restoreFromAutoBackup;

function triggerImport() {
    openImportBackupModal();
}

function importStateFile(file) {
    if(!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const imported = JSON.parse(e.target.result);
            state = imported;
            migrateState();
            ensureSystemSavings();
            ensureCoreItems();
            ensureSettings();
            if (typeof normalizeMoneyPrecision === 'function') normalizeMoneyPrecision();
            saveState();
            if (typeof closeImportBackupModal === 'function') closeImportBackupModal();
            location.reload();
        } catch (err) {
            showAppAlert('Import failed. The file is not valid JSON.');
        }
    };
    reader.readAsText(file);
}

function recoverLocalData() {
    var stateKey = STORAGE_KEYS.STATE;
    const localBackup = localStorage.getItem(stateKey);
    if (!localBackup) {
        showAppAlert('No local backup found in browser storage. Your data may have been cleared.');
        return;
    }
    
    try {
        const recovered = JSON.parse(localBackup);
        // Check if recovered data has actual content
        const hasData = (recovered.categories && recovered.categories.length > 0) || 
                       (recovered.accounts && Object.keys(recovered.accounts).length > 0) ||
                       (recovered.balances && Object.keys(recovered.balances).length > 0);
        
        if (!hasData) {
            showAppAlert('Local backup exists but appears empty. Your data may have been overwritten by empty cloud data.');
            return;
        }
        showAppConfirm('Found local backup data. Restore it? This will overwrite current state.', function () {
            pushToUndo();
            state = recovered;
            migrateState();
            ensureSystemSavings();
            ensureCoreItems();
            ensureSettings();
            if (typeof normalizeMoneyPrecision === 'function') normalizeMoneyPrecision();
            saveState();
            if (currentUser && window.saveStateToCloud) {
                showAppConfirm('Save recovered data to cloud?', function () {
                    window.saveStateToCloud();
                    showAppAlert('Data recovered successfully!');
                }, null, { confirmLabel: 'Save to Cloud' });
            } else {
                showAppAlert('Data recovered successfully!');
            }
            if (typeof refreshUI === 'function') refreshUI();
        }, null, { confirmLabel: 'Restore' });
    } catch (e) {
        showAppAlert('Failed to recover data: ' + e.message);
        console.error('Recovery error:', e);
    }
}

function loadExampleBudget() {
    if (typeof getExampleBudget !== 'function') return;
    showAppConfirm('Replace your current budget plan and amounts with the example budget? Your settings, currency, and account link will be kept.', function () {
        var ex = getExampleBudget();
        state.monthlyIncome = ex.monthlyIncome;
        state.categories = JSON.parse(JSON.stringify(ex.categories));
        if (state.accounts) {
            state.accounts.buckets = JSON.parse(JSON.stringify(ex.buckets));
            state.accounts.weekly = { balance: ex.weekly.balance, week: ex.weekly.week || 1 };
            if (!state.accounts.weekly.balances) state.accounts.weekly.balances = [ex.weekly.balance, ex.weekly.balance, ex.weekly.balance, ex.weekly.balance];
            else state.accounts.weekly.balances[0] = state.accounts.weekly.balances[1] = state.accounts.weekly.balances[2] = state.accounts.weekly.balances[3] = ex.weekly.balance;
        }
        state.balances = JSON.parse(JSON.stringify(ex.balances));
        if (typeof ensureSystemSavings === 'function') ensureSystemSavings();
        if (typeof ensureCoreItems === 'function') ensureCoreItems();
        if (typeof ensureWeeklyState === 'function') ensureWeeklyState();
        if (typeof initSurplusFromOpening === 'function') initSurplusFromOpening();
        if (typeof normalizeMoneyPrecision === 'function') normalizeMoneyPrecision();
        if (typeof saveState === 'function') saveState();
        if (typeof refreshUI === 'function') refreshUI();
        showAppAlert('Example budget loaded. You can edit it in Budget Plan.');
    }, null, { confirmLabel: 'Load example' });
}

function resetAppData() {
    showAppConfirm('This will delete all local data and reload the app. Continue?', function () {
        var stateKey = STORAGE_KEYS.STATE;
        var modKey = STORAGE_KEYS.MODIFIED;
        localStorage.removeItem(stateKey);
        try { localStorage.removeItem(modKey); } catch (e) {}
        location.reload();
    }, null, { confirmLabel: 'Delete & Reload' });
}
