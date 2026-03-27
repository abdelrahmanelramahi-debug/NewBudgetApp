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
    const num = parseFloat(val);
    if(!isNaN(num)) {
        state.monthlyIncome = num;
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
    if (profile === 'refresh' && typeof refreshUI === 'function') return refreshUI();
}

// --- STATE TRANSACTIONS ---
function ensureGeneralSavingsBudgetConfig() {
    if (!state.accounts) return;
    var fixedName = 'General Savings';
    var buckets = state.accounts.savingsBuckets || {};
    // Keep migration idempotent: do not sum legacy Main + canonical values repeatedly.
    var hasGeneral = buckets[fixedName] !== undefined;
    var hasMain = buckets.Main !== undefined;
    var moved = 0;
    if (hasGeneral) moved = Number(buckets[fixedName]) || 0;
    else if (hasMain) moved = Number(buckets.Main) || 0;
    if (hasMain) delete buckets.Main;
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
    plans[fixedName] = Number(state.accounts.savingsBudgetPlan[fixedName]) || Number(state.accounts.savingsBudgetPlan.Main) || 0;
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
    ensureAccountsState();
    const target = state.accounts.payablesDefaultBucket || 'Main';
    if (state.accounts.payablesBuckets[target] === undefined) {
        state.accounts.payablesBuckets[target] = 0;
    }
    state.accounts.payablesBuckets[target] += amount;
    syncPayablesTotal();
}

function debitPayables(amount) {
    ensureAccountsState();
    let remaining = amount;
    const target = state.accounts.payablesDefaultBucket || 'Main';
    const keys = Object.keys(state.accounts.payablesBuckets);
    const order = [target, ...keys.filter(k => k !== target)];
    order.forEach(key => {
        if (remaining <= 0) return;
        const available = state.accounts.payablesBuckets[key] || 0;
        const take = Math.min(available, remaining);
        state.accounts.payablesBuckets[key] = available - take;
        remaining -= take;
    });
    syncPayablesTotal();
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
    ensureAccountsState();
    const target = state.accounts.savingsDefaultBucket || 'General Savings';
    if (state.accounts.savingsBuckets[target] === undefined) {
        state.accounts.savingsBuckets[target] = 0;
    }
    state.accounts.savingsBuckets[target] += amount;
    syncSavingsTotal();
}

function debitSavings(amount) {
    ensureAccountsState();
    let remaining = amount;
    const target = state.accounts.savingsDefaultBucket || 'General Savings';
    const keys = Object.keys(state.accounts.savingsBuckets);
    const order = [target, ...keys.filter(k => k !== target)];
    order.forEach(key => {
        if (remaining <= 0) return;
        const available = state.accounts.savingsBuckets[key] || 0;
        const take = Math.min(available, remaining);
        state.accounts.savingsBuckets[key] = available - take;
        remaining -= take;
    });
    syncSavingsTotal();
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
    ensureAccountsState();
    const target = state.accounts.transportationDefaultBucket || 'Main';
    if (state.accounts.transportationBuckets[target] === undefined) {
        state.accounts.transportationBuckets[target] = 0;
    }
    state.accounts.transportationBuckets[target] += amount;
    syncTransportationTotal();
}

function debitTransportation(amount) {
    ensureAccountsState();
    let remaining = amount;
    const target = state.accounts.transportationDefaultBucket || 'Main';
    const keys = Object.keys(state.accounts.transportationBuckets);
    const order = [target, ...keys.filter(k => k !== target)];
    order.forEach(key => {
        if (remaining <= 0) return;
        const available = state.accounts.transportationBuckets[key] || 0;
        const take = Math.min(available, remaining);
        state.accounts.transportationBuckets[key] = available - take;
        remaining -= take;
    });
    syncTransportationTotal();
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
            sec.items.push({ label: tx.label, amount: tx.amount });
            state.accounts.surplus -= tx.amount;
            setItemBalance(tx.label, tx.amount);
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
            const newVal = tx.amount;
            var prevVal = item.amount;
            item.amount = newVal;
            delete item.amortData;
            // #region agent log
            fetch('http://127.0.0.1:7853/ingest/84e116a3-552a-4446-9ad4-b17912da8656',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9bd46d'},body:JSON.stringify({sessionId:'9bd46d',runId:'pre-fix',hypothesisId:'H2_H3',location:'actions.js:applyTransaction:update_item_amount',message:'plan amount updated',data:{sid:tx.sid,idx:tx.idx,label:item.label,prevVal:prevVal,newVal:newVal,transportBucket:state.accounts&&state.accounts.buckets?state.accounts.buckets['Transportation']:null,dailyFoodBalance:state.balances?state.balances['Daily Food']:null},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
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
        case 'weekly_adjust':
            adjustItemBalance('Weekly Allowance', tx.delta);
            setWeeklyBalance(state.accounts.weekly.week, getWeeklyBalance() + tx.delta);
            break;
        case 'food_spend':
            if (typeof ensureFoodConsumedDays === 'function') ensureFoodConsumedDays();
            var preFoodBalance = state.balances ? Number(state.balances['Daily Food'] || 0) : 0;
            var list = state.food.consumedDays || [];
            var todayDay = typeof window.getTodayCycleDay === 'function' ? window.getTodayCycleDay() : 0;
            if (todayDay > 0 && list.indexOf(todayDay) === -1) {
                list.push(todayDay);
                list.sort(function(a, b) { return a - b; });
                state.food.consumedDays = list;
            } else if (todayDay <= 0) {
                var next = (state.food.daysUsed || 0) + 1;
                if (next <= 28 && list.indexOf(next) === -1) {
                    list.push(next);
                    list.sort(function(a, b) { return a - b; });
                    state.food.consumedDays = list;
                }
            }
            state.food.daysUsed = (state.food.consumedDays || []).length;
            state.food.history.unshift({type:'spend', amt: tx.amount});
            // Deduct one day's amount from Daily Food so consume actually reduces balance
            adjustItemBalance('Daily Food', -tx.amount);
            // #region agent log
            fetch('http://127.0.0.1:7853/ingest/84e116a3-552a-4446-9ad4-b17912da8656',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9bd46d'},body:JSON.stringify({sessionId:'9bd46d',runId:'pre-fix',hypothesisId:'H3',location:'actions.js:applyTransaction:food_spend',message:'food spend applied',data:{amount:tx.amount,preFoodBalance:preFoodBalance,postFoodBalance:state.balances?state.balances['Daily Food']:null,daysUsed:state.food?state.food.daysUsed:null},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
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
            state.accounts.surplus += tx.amount;
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
    saveState();

    updateGlobalUI();
    closeRealityCheck();
}

function renameCategory(sid) {
    const sec = state.categories.find(s => s.id === sid);
    if(!sec) return;
    const newName = prompt("Rename Category:", sec.label);
    if(newName && newName.trim() !== "") {
        pushToUndo();
        applyTransaction({ type: 'rename_category', sid, label: newName.trim() });
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
        saveState();
        renderStrategy();
        updateGlobalUI();
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
        saveState();
        renderStrategy();
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
        saveState();
        renderStrategy();
    }
    dragSrc = null; dragType = null;
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
                    <span class="text-[10px] text-slate-400">Available: ${weeklyAvailable.toFixed(0)}</span>
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
                    <span class="text-[10px] text-slate-400">Before: ${foodInfo.dailyRate.toFixed(2)}/day • After: ${postPerDay.toFixed(2)}/day</span>
                </div>
                <button onclick="raidFood(${foodInfo.remainder})" class="bg-indigo-100 text-indigo-600 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase whitespace-nowrap flex-shrink-0">Use</button>
            </div>
        `;
    }

    state.categories.forEach(sec => {
        sec.items.forEach(item => {
            if(['Weekly Allowance', 'Daily Food'].includes(item.label)) return;

            const bal = getItemBalance(item.label, 0);
            if(bal > 0) {
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

function raidBucket(label, available) {
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
    const { fItem } = getFoodRemainderInfo();
    if (take > 0 && fItem) {
        pushToUndo();
        fItem.amount = Math.max(0, fItem.amount - take);
        applyTransaction({ type: 'adjust_surplus', delta: take });
        applyTransaction({ type: 'food_deficit_raid', amount: take });
        logHistory('Daily Food', -take, 'Deficit Cover');
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
            state.food = { daysTotal: 28, daysUsed: 0, lockedAmount: 0, history: [], viewWeek: 0 };
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
        saveState();
        renderStrategy();
        closeAddCategoryTool();
    }
}

// Amortization
function openAmortTool(sid, idx) {
    currentAmort = {sid, idx};
    const item = state.categories.find(s=>s.id===sid).items[idx];
    document.getElementById('amortization-title').innerText = item.label;
    document.getElementById('amort-total').value = item.amortData ? item.amortData.total : item.amount;
    document.getElementById('amort-months').value = item.amortData ? item.amortData.months : 1;
    toggleModal('amortization-tool', true);
    updateAmortCalc();
}

function updateAmortCalc() {
    const t = parseFloat(document.getElementById('amort-total').value)||0;
    const m = parseFloat(document.getElementById('amort-months').value)||1;
    document.getElementById('amort-preview').innerText = (t/m).toFixed(2);
}
function saveAmortization() {
    const t = parseFloat(document.getElementById('amort-total').value);
    const m = parseFloat(document.getElementById('amort-months').value);
    const item = state.categories.find(s=>s.id===currentAmort.sid).items[currentAmort.idx];

    pushToUndo();
    const oldVal = item.amount;
    const newVal = t/m;
    item.amortData = {total: t, months: m};
    applyTransaction({ type: 'update_item_amount', sid: currentAmort.sid, idx: currentAmort.idx, amount: newVal });
    saveState();
    renderStrategy(); toggleModal('amortization-tool', false);
}
function applyDirectCost() {
    const t = parseFloat(document.getElementById('amort-total').value);
    const item = state.categories.find(s=>s.id===currentAmort.sid).items[currentAmort.idx];
    pushToUndo();
    delete item.amortData;
    applyTransaction({ type: 'update_item_amount', sid: currentAmort.sid, idx: currentAmort.idx, amount: t });
    saveState();
    renderStrategy(); toggleModal('amortization-tool', false);
}
function closeAmortizationTool() { toggleModal('amortization-tool', false); }

// Add Items
function openAddItemTool(sid) {
    currentAddSectionId = sid;
    document.getElementById('new-item-label').value = '';
    document.getElementById('new-item-amount').value = '';
    toggleModal('add-item-tool', true);
    document.getElementById('new-item-label').focus();
}
function closeAddItemTool() { toggleModal('add-item-tool', false); }
function confirmAddItem() {
    const label = document.getElementById('new-item-label').value;
    const amount = parseFloat(document.getElementById('new-item-amount').value);
    if(label && !isNaN(amount)) {
        pushToUndo();
        applyTransaction({ type: 'add_item', sid: currentAddSectionId, label, amount });
        saveState();
        renderStrategy();
        closeAddItemTool();
    }
}

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
        saveState();
        renderStrategy();
        closeDeleteModal();
    }
}

// Ledger Actions
function openTool(label, displayTitle, autoTransfer = false, prefillAmount) {
    activeCat = label;
    document.getElementById('tool-title').innerText = displayTitle || label;

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

    std.classList.remove('hidden');
    trf.classList.add('hidden');

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
    pushToUndo();
    applyTransaction({ type: 'adjust_item_balance', label: label, delta: mod });
    logHistory(label, mod, 'Manual');
    saveState();
    if (typeof refreshUI === 'function') refreshUI();
}

function completeTask(label) {
    pushToUndo();
    const current = getItemBalance(label, 0);
    setItemBalance(label, 0);
    logHistory(label, -current, 'Completed');
    saveState();
    renderLedger();
}

// Food
function spendFoodDay() {
    if(state.food.daysUsed < state.food.daysTotal) {
        var info = typeof getFoodRemainderInfo === 'function' ? getFoodRemainderInfo() : null;
        var amount = (info && info.dailyRate > 0) ? info.dailyRate : 30;
        pushToUndo();
        applyTransaction({ type: 'food_spend', amount: amount });
        saveState();
        renderLedger();
    }
}

function setFoodDayFromCalendar(cycleDay, action) {
    var day = Math.max(1, Math.min(28, Math.floor(cycleDay)));
    if (typeof ensureFoodConsumedDays === 'function') ensureFoodConsumedDays();
    var list = state.food.consumedDays || [];
    if (action === 'unmark') {
        if (list.indexOf(day) === -1) return;
    } else {
        if (list.indexOf(day) !== -1) return;
    }
    pushToUndo();
    if (action === 'unmark') {
        state.food.consumedDays = list.filter(function(d) { return d !== day; });
        var infoUnmark = typeof getFoodRemainderInfo === 'function' ? getFoodRemainderInfo() : null;
        var dailyRateUnmark = (infoUnmark && infoUnmark.dailyRate > 0) ? infoUnmark.dailyRate : (600 / 28);
        adjustItemBalance('Daily Food', dailyRateUnmark);
    } else {
        state.food.consumedDays = list.concat([day]).sort(function(a, b) { return a - b; });
        var info = typeof getFoodRemainderInfo === 'function' ? getFoodRemainderInfo() : null;
        var dailyRate = (info && info.dailyRate > 0) ? info.dailyRate : (600 / 28);
        adjustItemBalance('Daily Food', -dailyRate);
    }
    state.food.daysUsed = state.food.consumedDays.length;
    saveState();
    renderLedger();
    updateGlobalUI();
}

// Transfer one day's worth from Daily Food to another category and mark day consumed. Used by food-cycle day popover.
function transferFoodDayTo(cycleDay, targetId) {
    var day = Math.max(1, Math.min(28, Math.floor(cycleDay)));
    if (typeof ensureFoodConsumedDays === 'function') ensureFoodConsumedDays();
    var list = state.food.consumedDays || [];
    if (list.indexOf(day) !== -1) return; // already consumed
    var info = typeof getFoodRemainderInfo === 'function' ? getFoodRemainderInfo() : null;
    var dailyRate = (info && info.dailyRate > 0) ? info.dailyRate : (600 / 28);
    var foodBal = (state.balances && state.balances['Daily Food'] !== undefined) ? Number(state.balances['Daily Food']) : 0;
    var amount = Math.min(dailyRate, Math.max(0, foodBal));
    if (amount <= 0) {
        if (typeof showAppAlert === 'function') showAppAlert('No Daily Food balance to transfer.');
        return;
    }
    pushToUndo();
    applyTransaction({ type: 'transfer', from: 'Daily Food', to: targetId, amount: amount });
    state.food.consumedDays = list.concat([day]).sort(function(a, b) { return a - b; });
    state.food.daysUsed = state.food.consumedDays.length;
    if (typeof logHistory === 'function') logHistory('Daily Food', -amount, 'Day transfer to ' + targetId);
    saveState();
    if (typeof renderLedger === 'function') renderLedger();
    if (typeof updateGlobalUI === 'function') updateGlobalUI();
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
    saveState();
    if (typeof renderLedger === 'function') renderLedger();
    if (typeof updateGlobalUI === 'function') updateGlobalUI();
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

function openFoodDayTransferPopover(cycleDay, anchorEl) {
    var pop = document.getElementById('food-day-transfer-popover');
    var container = document.getElementById('food-day-transfer-targets');
    if (!pop || !container) return;
    if (pop) pop.removeAttribute('data-buffer');
    var anchor = anchorEl && anchorEl.closest ? anchorEl.closest('.food-overview-cell-wrapper') : anchorEl;
    if (anchor && anchor.getBoundingClientRect) {
        var rect = anchor.getBoundingClientRect();
        pop.style.left = rect.left + 'px';
        pop.style.top = (rect.bottom + 4) + 'px';
    }
    pop.setAttribute('data-cycle-day', cycleDay);
    var targets = getFoodDayTransferTargets();
    container.innerHTML = targets.map(function(t) {
        var safeLabel = String(t.label).replace(/</g, '&lt;').replace(/"/g, '&quot;');
        return '<button type="button" class="food-day-transfer-target-btn block w-full text-left px-2 py-1.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 rounded-sm truncate transition-colors" data-target-id="' + String(t.id).replace(/"/g, '&quot;') + '">' + safeLabel + '</button>';
    }).join('');
    pop.classList.remove('hidden');
}
window.openFoodDayTransferPopover = openFoodDayTransferPopover;

function closeFoodDayTransferPopover() {
    var pop = document.getElementById('food-day-transfer-popover');
    if (pop) pop.classList.add('hidden');
}
window.closeFoodDayTransferPopover = closeFoodDayTransferPopover;

(function initFoodDayTransferPopover() {
    document.addEventListener('click', function(e) {
        var btn = e.target.closest('.food-day-transfer-target-btn');
        if (btn) {
            var pop = document.getElementById('food-day-transfer-popover');
            if (!pop || pop.classList.contains('hidden')) return;
            var targetId = btn.getAttribute('data-target-id');
            if (!targetId) return;
            if (pop.getAttribute('data-buffer') === 'true') {
                transferBufferDayTo(targetId);
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

function openDailyFoodActionsMenu() {
    toggleModal('daily-food-actions-modal', true);
}
window.openDailyFoodActionsMenu = openDailyFoodActionsMenu;

function closeDailyFoodActionsMenu() {
    toggleModal('daily-food-actions-modal', false);
}
window.closeDailyFoodActionsMenu = closeDailyFoodActionsMenu;

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
    adjustItemBalance('Daily Food', appliedAmount);
    state.food.consumedDays = (state.food.consumedDays || []).filter(function (d) {
        return daysToApply.indexOf(d) === -1;
    }).sort(function (a, b) { return a - b; });
    state.food.daysUsed = state.food.consumedDays.length;
    if (typeof logHistory === 'function') logHistory('Daily Food', appliedAmount, 'Bulk refill from source');
    saveState();
    renderLedger();
    updateGlobalUI();
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

function deductFromBufferSource(sourceId, amount) {
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
}

function isOverflowDayUsed(dayKey) {
    if (!state.food || !state.food.overflowUsage) return false;
    return !!state.food.overflowUsage[dayKey];
}

function markOverflowDayUsage(dayKey, mode) {
    if (!state.food) state.food = { daysTotal: 28, daysUsed: 0, lockedAmount: 0, history: [], viewWeek: 0 };
    if (!state.food.overflowUsage || typeof state.food.overflowUsage !== 'object') state.food.overflowUsage = {};
    state.food.overflowUsage[dayKey] = mode;
}

function applyOverflowDayFromSource(dayKey, sourceId) {
    if (!dayKey) return;
    if (isOverflowDayUsed(dayKey)) {
        if (typeof showAppAlert === 'function') showAppAlert('This extra day is already accounted for.');
        return;
    }
    var info = typeof getFoodRemainderInfo === 'function' ? getFoodRemainderInfo() : null;
    var dailyRate = (info && info.dailyRate > 0) ? info.dailyRate : (600 / 28);
    var available = getBufferSourceBalance(sourceId || 'surplus');
    if (available < dailyRate) {
        if (typeof showAppAlert === 'function') showAppAlert('Not enough in selected source for 1 extra day.');
        return;
    }
    pushToUndo();
    deductFromBufferSource(sourceId || 'surplus', dailyRate);
    applyTransaction({ type: 'food_lock', amount: dailyRate, label: '+1 Extra Day' });
    markOverflowDayUsage(dayKey, 'source');
    saveState();
    if (typeof renderLedger === 'function') renderLedger();
    if (typeof updateGlobalUI === 'function') updateGlobalUI();
}
window.applyOverflowDayFromSource = applyOverflowDayFromSource;

function applyOverflowDayRedistribution(dayKey) {
    if (!dayKey) return;
    if (isOverflowDayUsed(dayKey)) {
        if (typeof showAppAlert === 'function') showAppAlert('This extra day is already accounted for.');
        return;
    }
    pushToUndo();
    markOverflowDayUsage(dayKey, 'redistributed');
    if (typeof state.food.redistributedExtraDays !== 'number' || Number.isNaN(state.food.redistributedExtraDays)) {
        state.food.redistributedExtraDays = 0;
    }
    state.food.redistributedExtraDays += 1;
    saveState();
    if (typeof renderLedger === 'function') renderLedger();
    if (typeof updateGlobalUI === 'function') updateGlobalUI();
}
window.applyOverflowDayRedistribution = applyOverflowDayRedistribution;

function buyFoodDay() {
    const daysInput = parseFloat(document.getElementById('food-lock-val').value);
    if(!daysInput || daysInput <= 0) return;

    const sourceEl = document.getElementById('food-buffer-source');
    const sourceId = (sourceEl && sourceEl.value) ? sourceEl.value : 'surplus';

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

    saveState();
    renderLedger();
    updateGlobalUI();
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
    saveState();
    renderLedger();
    updateGlobalUI();
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
    saveState();
    renderLedger();
    updateGlobalUI();
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
        saveState();
        renderLedger();
        updateGlobalUI();
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

// Food cycle rollover: move unconsumed Daily Food value to Extra, then reset cycle tracking.
function startNewMonthFoodReset(options) {
    options = options || {};
    if (!options.skipUndo) pushToUndo();
    if (typeof ensureFoodConsumedDays === 'function') ensureFoodConsumedDays();

    var daysUsed = state.food.daysUsed || 0;
    var daysTotal = state.food.daysTotal || 28;
    var unconsumed = Math.max(0, daysTotal - daysUsed);
    var movedToExtra = 0;
    if (unconsumed > 0) {
        var info = typeof getFoodRemainderInfo === 'function' ? getFoodRemainderInfo() : null;
        var dailyRate = (info && info.dailyRate > 0) ? info.dailyRate : (600 / 28);
        var valueToMove = unconsumed * dailyRate;
        var foodBal = (state.balances && state.balances['Daily Food'] !== undefined) ? Number(state.balances['Daily Food']) : 0;
        var takeFromFood = Math.min(valueToMove, Math.max(0, foodBal));
        if (takeFromFood > 0) {
            state.balances['Daily Food'] = (state.balances['Daily Food'] || 0) - takeFromFood;
            if (state.balances['Daily Food'] <= 0) delete state.balances['Daily Food'];
            if (!state.accounts) state.accounts = {};
            state.accounts.surplus = (state.accounts && typeof state.accounts.surplus === 'number' ? state.accounts.surplus : 0) + takeFromFood;
            movedToExtra = takeFromFood;
        }
    }
    state.food.consumedDays = [];
    state.food.daysUsed = 0;
    state.food.history = [];
    state.food.overflowUsage = {};
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
    var notice = state.food && state.food.pendingDistributionExtraNotice;
    if (!notice || !notice.amount || notice.amount <= 0) return;
    var days = Math.max(0, Math.floor(notice.days || 0));
    var msg = formatMoney(notice.amount) + ' ' + getCurrencyLabel() + ' stayed in Extra because ' + days + ' consumed Daily Food day' + (days === 1 ? '' : 's') + ' could not be funded by distribution.';
    if (typeof showAppAlert === 'function') showAppAlert(msg, 'Daily Food distribution');
    delete state.food.pendingDistributionExtraNotice;
    saveState();
    if (typeof updateGlobalUI === 'function') updateGlobalUI();
}
window.showFoodDistributionExtraNotice = showFoodDistributionExtraNotice;

// Legacy combined action (kept for compatibility): weekly rollover + food reset.
function startNewMonth() {
    startNewMonthWeeklyRollover();
    startNewMonthFoodReset();
}
window.startNewMonth = startNewMonth;

function _noopLegacyMonthConfirm() {}

// Legacy global entrypoints retained as no-op shims for backward HTML compatibility.
function openWeeklyNewMonthConfirm() { _noopLegacyMonthConfirm(); }
window.openWeeklyNewMonthConfirm = openWeeklyNewMonthConfirm;

function openFoodNewMonthConfirm() { _noopLegacyMonthConfirm(); }
window.openFoodNewMonthConfirm = openFoodNewMonthConfirm;

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
    const num = parseFloat(val) || 0;
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
            if (label) label.textContent = String(dailyRounded) + ' ' + getCurrencyLabel();
        }
        // Do not overwrite a focused input (it breaks cursor position)
        if(input && document.activeElement !== input && input.value !== String(num)) input.value = String(num);
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
            if (inputW && document.activeElement !== inputW && inputW.value !== String(num)) inputW.value = String(num);
            var badgeW = document.querySelector('.budget-item-badge[data-badge="weekly"][data-sid="' + sid + '"][data-idx="' + idx + '"]');
            if (badgeW) badgeW.textContent = '~' + formatMoney(num / 4) + '/wk';
            var labelW = document.getElementById('weekly-slider-label-' + sid + '-' + idx);
            if (labelW) labelW.textContent = Math.round(num) + ' ' + getCurrencyLabel();
        }
    } else if(item.label === 'Savings') {
        const slider = document.getElementById('general-savings-slider-' + sid + '-' + idx);
        if(slider) {
            // Slider snaps to step, but typed input should remain exact.
            const snapped = Math.round(num / SAVINGS_SLIDER_STEP) * SAVINGS_SLIDER_STEP;
            if(slider.value !== String(snapped)) slider.value = String(snapped);
            var inputS = document.querySelector('.budget-item-input[data-sid="' + sid + '"][data-idx="' + idx + '"]');
            if (inputS && document.activeElement !== inputS && inputS.value !== String(num)) inputS.value = String(num);
            var labelS = document.getElementById('savings-slider-label-' + sid + '-' + idx);
            if (labelS) labelS.textContent = Math.round(num) + ' ' + getCurrencyLabel();
        }
    } else if(item.label === 'Transportation') {
        const slider = document.getElementById('car-fund-slider-' + sid + '-' + idx);
        if(slider) {
            // Slider snaps to step, but typed input should remain exact.
            const snapped = Math.round(num / CAR_SLIDER_STEP) * CAR_SLIDER_STEP;
            if(slider.value !== String(snapped)) slider.value = String(snapped);
            var inputT = document.querySelector('.budget-item-input[data-sid="' + sid + '"][data-idx="' + idx + '"]');
            if (inputT && document.activeElement !== inputT && inputT.value !== String(num)) inputT.value = String(num);
            var badgeT = document.querySelector('.budget-item-badge[data-badge="transport"][data-sid="' + sid + '"][data-idx="' + idx + '"]');
            if (badgeT) badgeT.textContent = '~' + formatMoney(num / 4) + '/wk';
            var labelT = document.getElementById('car-slider-label-' + sid + '-' + idx);
            if (labelT) labelT.textContent = Math.round(num) + ' ' + getCurrencyLabel();
        }
    }
    var obStep = document.getElementById('onboarding-step-categories');
    if (obStep && !obStep.classList.contains('hidden') && typeof updateAllocatedTotalUI === 'function') {
        var total = state.monthlyIncome || 0;
        var allocated = state.categories.reduce(function (sum, sec) {
            return sum + (sec.items || []).reduce(function (s, i) { return s + (i.amount || 0); }, 0);
        }, 0);
        updateAllocatedTotalUI({ total: total, allocated: allocated, prefix: 'onboarding-cat' });
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
        num = parseFloat(raw);
        if (Number.isNaN(num)) num = 0;
    }

    // Never override what the user typed with step rounding.
    // Sliders can still snap (they have step), but the typed number is the source of truth.
    el.value = raw === '' ? '0' : raw;
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
    if (!el) return;
    var raw = String(el.value ?? '');
    if (!isProbablyPartialNumber(raw)) return;
    if (raw.trim() === '' || raw === '-' || raw === '.' || raw === '-.') return;
    var num = parseFloat(raw);
    if (Number.isNaN(num) || num < 0) num = 0;
    syncSavingsBucketBudgetAmount(bucketKey, num);
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
        num = parseFloat(raw);
        if (Number.isNaN(num)) num = 0;
    }
    el.value = String(Math.max(0, num));
    syncSavingsBucketBudgetAmount(bucketKey, num);
    var slider = document.getElementById('savings-bucket-slider-' + bucketIdx);
    if (slider) slider.value = String(Math.round(num / 50) * 50);
    budgetPlanSavingsBucketSyncLabel(bucketIdx, num);
    if (typeof updateBudgetPlanAllocated === 'function') updateBudgetPlanAllocated();
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
    if (label) label.textContent = Math.round(num) + ' ' + getCurrencyLabel();
}
window.budgetPlanSavingsBucketSyncLabel = budgetPlanSavingsBucketSyncLabel;

function budgetPlanSavingsBucketSliderInput(bucketKey, bucketIdx, sliderEl) {
    if (!sliderEl) return;
    var num = parseFloat(sliderEl.value);
    if (Number.isNaN(num) || num < 0) num = 0;
    syncSavingsBucketBudgetAmount(bucketKey, num);
    var input = document.getElementById('savings-bucket-input-' + bucketIdx);
    if (input && document.activeElement !== input) input.value = String(Math.round(num));
    budgetPlanSavingsBucketSyncLabel(bucketIdx, num);
}
window.budgetPlanSavingsBucketSliderInput = budgetPlanSavingsBucketSliderInput;

function syncFoodBaseAmount(sid, idx, val) {
    const num = parseFloat(val) || 0;
    const slider = document.getElementById('food-daily-slider-' + sid + '-' + idx);
    const input = document.querySelector('.budget-item-input[data-sid="' + sid + '"][data-idx="' + idx + '"]');
    if(slider) {
        const dailyRate = state.food.daysTotal > 0 ? (num / state.food.daysTotal) : 0;
        const dailyRounded = Math.round(dailyRate);
        if(slider.value !== String(dailyRounded)) slider.value = String(dailyRounded);
        var label = document.getElementById('food-daily-slider-label-' + sid + '-' + idx);
        if (label) label.textContent = String(dailyRounded) + ' ' + getCurrencyLabel();
    }
    if(input && input.value !== String(num)) input.value = String(num);
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
        if (input && input.value !== String(snapped)) input.value = String(snapped);
        var badge = document.querySelector('.budget-item-badge[data-badge="weekly"][data-sid="' + sid + '"][data-idx="' + idx + '"]');
        if (badge) badge.textContent = '~' + formatMoney(snapped / 4) + '/wk';
        var label = document.getElementById('weekly-slider-label-' + sid + '-' + idx);
        if (label) label.textContent = snapped + ' ' + getCurrencyLabel();
    } catch (e) {}
}
var SAVINGS_SLIDER_STEP = 50;
function syncGeneralSavingsAmount(sid, idx, val) {
    const num = parseFloat(val) || 0;
    const snapped = Math.round(num / SAVINGS_SLIDER_STEP) * SAVINGS_SLIDER_STEP;
    fastUpdateItemAmount(sid, idx, snapped);
    try {
        var input = document.querySelector('.budget-item-input[data-sid="' + sid + '"][data-idx="' + idx + '"]');
        if (input && input.value !== String(snapped)) input.value = String(snapped);
        var label = document.getElementById('savings-slider-label-' + sid + '-' + idx);
        if (label) label.textContent = snapped + ' ' + getCurrencyLabel();
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
        if (input && input.value !== String(snapped)) input.value = String(snapped);
        var badge = document.querySelector('.budget-item-badge[data-badge="transport"][data-sid="' + sid + '"][data-idx="' + idx + '"]');
        if (badge) badge.textContent = '~' + formatMoney(snapped / 4) + '/wk';
        var label = document.getElementById('car-slider-label-' + sid + '-' + idx);
        if (label) label.textContent = snapped + ' ' + getCurrencyLabel();
    } catch (e) {}
    if (typeof syncTransportationTotal === 'function') syncTransportationTotal();
}

// Paycheck + Allocation
function getAllocatableItems() {
    const items = [];
    state.categories.forEach(sec => {
        sec.items.forEach(item => {
            if ((state.settings && state.settings.showFoodPlan === false) && item.label === 'Daily Food') return;
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

function applyPaycheckDistribute() {
    const raw = document.getElementById('paycheck-amount').value;
    const val = parseFloat(raw);
    if (raw === '' || isNaN(val) || val <= 0) {
        if (typeof showAppAlert === 'function') showAppAlert('Enter a positive amount for your paycheck.');
        return;
    }

    if (typeof ensureWeeklyState === 'function') ensureWeeklyState();

    const foodLabelCanonical = 'Daily Food'; // getFoodRemainderInfo() always reads state.balances['Daily Food']
    var excludedFoodAmount = 0;
    var excludedFoodDays = 0;
    const items = getAllocatableItems().map(item => {
        let current;
        const isFood = item.label === foodLabelCanonical;
        if (item.label === 'Weekly Allowance') {
            current = (state.accounts.weekly.balances && state.accounts.weekly.balances.length >= 4)
                ? (state.accounts.weekly.balances[0] || 0) + (state.accounts.weekly.balances[1] || 0) + (state.accounts.weekly.balances[2] || 0) + (state.accounts.weekly.balances[3] || 0)
                : 0;
        } else if (isFood) {
            current = getItemBalance(foodLabelCanonical, 0);
        } else if (item.label === 'Savings' && item.savingsBucket) {
            current = getSavingsBucketAmount(item.savingsBucket);
        } else {
            current = getItemBalance(item.label, 0);
        }
        let deficit = 0;
        if (item.label === 'Savings' && item.savingsBucket) {
            deficit = Math.max(0, item.amount);
        } else if (isFood) {
            var info = (typeof getFoodRemainderInfo === 'function') ? getFoodRemainderInfo() : null;
            var daysTotal = Math.max(1, Math.floor((state.food && state.food.daysTotal) || 28));
            var daysUsed = Math.max(0, Math.floor((state.food && state.food.daysUsed) || 0));
            var daysLeft = Math.max(0, daysTotal - daysUsed);
            var dailyRate = (info && info.dailyRate > 0) ? info.dailyRate : ((Number(item.amount) || 0) / daysTotal);
            var maxFundablePlanAmount = dailyRate * daysLeft;
            var cappedPlannedAmount = Math.min(Number(item.amount) || 0, maxFundablePlanAmount);
            var excludedAmountForItem = Math.max(0, (Number(item.amount) || 0) - cappedPlannedAmount);
            if (excludedAmountForItem > 0) {
                excludedFoodAmount += excludedAmountForItem;
                excludedFoodDays += Math.max(0, Math.floor(excludedAmountForItem / (dailyRate || 1)));
            }
            deficit = Math.max(0, cappedPlannedAmount - current);
        } else {
            deficit = Math.max(0, item.amount - current);
        }
        return { ...item, deficit };
    }).filter(item => item.deficit > 0);

    const totalDeficit = items.reduce((sum, i) => sum + i.deficit, 0);

    pushToUndo();
    applyTransaction({ type: 'adjust_surplus', delta: val });
    if (!state.food || typeof state.food !== 'object') state.food = {};
    if (excludedFoodAmount > 0) {
        state.food.pendingDistributionExtraNotice = {
            amount: excludedFoodAmount,
            days: excludedFoodDays,
            source: 'paycheck',
            at: Date.now()
        };
    } else if (state.food.pendingDistributionExtraNotice) {
        delete state.food.pendingDistributionExtraNotice;
    }

    if (totalDeficit <= 0) {
        showAppAlert('All planned categories are already funded. The paycheck was added to Extra.');
        document.getElementById('paycheck-amount').value = '';
        saveState();
        if (typeof refreshUI === 'function') refreshUI();
        return;
    }

    items.forEach(item => {
        if (item.deficit > 0) {
            const isFood = item.label === foodLabelCanonical;
            const transferTo = isFood ? foodLabelCanonical : item.label;
            if (item.label === 'Weekly Allowance') {
                // Spread across all 4 weeks so it doesn't all land in the current week
                ensureWeeklyState();
                var perWeek = item.deficit / 4;
                for (var w = 1; w <= WEEKLY_MAX_WEEKS; w++) {
                    setWeeklyBalance(w, getWeeklyBalance(w) + perWeek);
                }
                state.accounts.surplus -= item.deficit;
                var sumWeeks = (state.accounts.weekly.balances[0] || 0) + (state.accounts.weekly.balances[1] || 0) + (state.accounts.weekly.balances[2] || 0) + (state.accounts.weekly.balances[3] || 0);
                if (state.accounts.buckets) state.accounts.buckets['Weekly Allowance'] = sumWeeks;
                logHistory(item.label, item.deficit, 'Distribute');
            } else if (item.label === 'Savings' && item.savingsBucket) {
                adjustSavingsBucket(item.savingsBucket, item.deficit);
                applyTransaction({ type: 'adjust_surplus', delta: -item.deficit });
                logHistory('Savings: ' + item.savingsBucket, item.deficit, 'Distribute');
            } else {
                applyTransaction({ type: 'transfer', from: 'Surplus', to: transferTo, amount: item.deficit });
                logHistory(transferTo, item.deficit, 'Distribute');
            }
        }
    });

    const leftoverFromPaycheck = Math.max(0, val - totalDeficit);
    if (leftoverFromPaycheck > 0) {
        showAppAlert('Fully funded all planned categories. ' + formatMoney(leftoverFromPaycheck) + ' ' + getCurrencyLabel() + ' stayed in Extra.');
    } else if (totalDeficit > val) {
        const shortfall = totalDeficit - val;
        showAppAlert('Plan required more than this paycheck. ' + formatMoney(shortfall) + ' ' + getCurrencyLabel() + ' was taken from Extra.');
    }

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
    var entries = Object.entries(state.accounts.savingsBuckets);
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
            '<button type="button" class="bucket-stepper-plus w-7 h-6 flex items-center justify-center text-slate-600 text-sm font-medium hover:bg-slate-200/80 transition leading-none" data-dir="1" aria-label="Add">+</button>' +
            '<button type="button" class="bucket-stepper-minus w-7 h-6 flex items-center justify-center text-slate-600 text-sm font-medium hover:bg-slate-200/80 transition leading-none border-t border-slate-200" data-dir="-1" aria-label="Subtract">−</button>' +
            '</div>' +
            '<button type="button" onclick="var b=this.closest(\'.bucket-row\'); var k=b.getAttribute(\'data-bucket-key\'); var v=b.querySelector(\'.bucket-amount-input\'); openBucketTransferModal(\'savings\', k, v?v.value:\'\');" class="h-8 w-8 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center text-sm font-bold transition" title="Transfer">⋯</button>' +
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
    var el = amountEl || document.getElementById('savings-bucket-amount');
    var val = el ? parseFloat(el.value) : NaN;
    if (!val || val <= 0) return;
    pushToUndo();
    if (dir > 0) {
        if(!canApplySurplusDelta(-val)) return;
        adjustSavingsBucket(bucketKey, val);
        applyTransaction({ type: 'adjust_surplus', delta: -val });
    } else {
        const available = getSavingsBucketAmount(bucketKey);
        const take = Math.min(val, available);
        if (take <= 0) return;
        adjustSavingsBucket(bucketKey, -take);
        applyTransaction({ type: 'adjust_surplus', delta: take });
    }
    saveState();
    updateSavingsBucketRowAmount(bucketKey);
    updateGlobalUI();
    if (typeof renderStrategy === 'function') renderStrategy();
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
    if (state.accounts.savingsDefaultBucket === oldName) {
        state.accounts.savingsDefaultBucket = newName;
    }
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
        if (state.accounts.savingsDefaultBucket === name) {
            state.accounts.savingsDefaultBucket = Object.keys(state.accounts.savingsBuckets)[0];
        }
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
    var total = 0;
    Object.keys(state.accounts.savingsBudgetPlan || {}).forEach(function (k) {
        total += Number(state.accounts.savingsBudgetPlan[k]) || 0;
    });
    item.amount = total;
}

function syncSavingsBucketBudgetAmount(bucketKey, rawValue) {
    ensureGeneralSavingsBudgetConfig();
    if (!bucketKey || state.accounts.savingsBuckets[bucketKey] === undefined) return;
    var amount = Number(rawValue);
    if (Number.isNaN(amount) || amount < 0) amount = 0;
    state.accounts.savingsBudgetPlan[bucketKey] = amount;
    syncSavingsBudgetPlanItemAmount();
    saveState();
    if (typeof updateBudgetPlanAllocated === 'function') updateBudgetPlanAllocated();
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
            '<button type="button" onclick="var b=this.closest(\'.bucket-row\'); var k=b.getAttribute(\'data-bucket-key\'); var v=b.querySelector(\'.bucket-amount-input\'); openBucketTransferModal(\'transportation\', k, v?v.value:\'\');" class="h-8 w-8 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center text-sm font-bold transition" title="Transfer">⋯</button>' +
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
    var el = amountEl || document.getElementById('transportation-bucket-amount');
    var val = el ? parseFloat(el.value) : NaN;
    if (!val || val <= 0) return;
    pushToUndo();
    if (dir > 0) {
        if (!canApplySurplusDelta(-val)) return;
        adjustTransportationBucket(bucketKey, val);
        applyTransaction({ type: 'adjust_surplus', delta: -val });
    } else {
        const available = getTransportationBucketAmount(bucketKey);
        const take = Math.min(val, available);
        if (take <= 0) return;
        adjustTransportationBucket(bucketKey, -take);
        applyTransaction({ type: 'adjust_surplus', delta: take });
    }
    saveState();
    updateTransportationBucketRowAmount(bucketKey);
    updateGlobalUI();
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
    var modal = document.getElementById('bucket-transfer-modal');
    var titleEl = document.getElementById('bucket-transfer-title');
    var toSelect = document.getElementById('bucket-transfer-to');
    var amountInput = document.getElementById('bucket-transfer-amount');
    if (!modal || !toSelect || !amountInput) return;
    var esc = function (s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); };
    modal.setAttribute('data-context', context);
    modal.setAttribute('data-bucket-key', bucketKey);
    if (titleEl) titleEl.textContent = 'Transfer from ' + bucketKey;
    amountInput.value = (prefillAmount !== undefined && prefillAmount !== null && String(prefillAmount).trim() !== '') ? String(prefillAmount).trim() : '';
    var toOpts = '';
    if (context === 'savings') {
        toOpts = '<option value="' + SAVINGS_EXTRA + '">Extra</option><option value="' + SAVINGS_WEEKLY + '">Weekly Allowance</option>';
        (Object.keys(state.accounts.savingsBuckets || {})).forEach(function (k) {
            if (k !== bucketKey) toOpts += '<option value="' + esc(k) + '">' + esc(k) + '</option>';
        });
    } else if (context === 'transportation') {
        toOpts = '<option value="' + TRANSPORTATION_EXTRA + '">Extra</option><option value="' + TRANSPORTATION_WEEKLY + '">Weekly Allowance</option>';
        (Object.keys(state.accounts.transportationBuckets || {})).forEach(function (k) {
            if (k !== bucketKey) toOpts += '<option value="' + esc(k) + '">' + esc(k) + '</option>';
        });
    } else {
        toOpts = '<option value="' + PAYABLES_EXTRA + '">Extra</option><option value="' + PAYABLES_WEEKLY + '">Weekly Allowance</option>';
        (Object.keys(state.accounts.payablesBuckets || {})).forEach(function (k) {
            if (k !== bucketKey) toOpts += '<option value="' + esc(k) + '">' + esc(k) + '</option>';
        });
    }
    toSelect.innerHTML = toOpts;
    toggleModal('bucket-transfer-modal', true);
    var btn = document.getElementById('bucket-transfer-btn');
    if (btn && !modal._transferWired) {
        modal._transferWired = true;
        btn.addEventListener('click', function () {
            var ctx = modal.getAttribute('data-context');
            var fromKey = modal.getAttribute('data-bucket-key');
            var toKey = toSelect.value;
            var amount = amountInput.value;
            if (!fromKey || !toKey || fromKey === toKey) return;
            if (ctx === 'savings') {
                doSavingsTransfer(fromKey, toKey, amount);
                renderSavingsBuckets();
            } else if (ctx === 'transportation') {
                doTransportationTransfer(fromKey, toKey, amount);
                renderTransportationBuckets();
            } else {
                doPayablesTransfer(fromKey, toKey, amount);
                renderPayablesBuckets();
            }
            amountInput.value = '';
            closeBucketTransferModal();
            if (typeof updateGlobalUI === 'function') updateGlobalUI();
        });
    }
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
            '<button type="button" onclick="var b=this.closest(\'.bucket-row\'); var k=b.getAttribute(\'data-bucket-key\'); var v=b.querySelector(\'.bucket-amount-input\'); openBucketTransferModal(\'payables\', k, v?v.value:\'\');" class="h-8 w-8 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center text-sm font-bold transition" title="Transfer">⋯</button>' +
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
    var el = amountEl || document.getElementById('payables-bucket-amount');
    var val = el ? parseFloat(el.value) : NaN;
    if (!val || val <= 0) return;
    pushToUndo();
    if (dir > 0) {
        if (!canApplySurplusDelta(-val)) return;
        adjustPayablesBucket(bucketKey, val);
        applyTransaction({ type: 'adjust_surplus', delta: -val });
    } else {
        const available = getPayablesBucketAmount(bucketKey);
        const take = Math.min(val, available);
        if (take <= 0) return;
        adjustPayablesBucket(bucketKey, -take);
        applyTransaction({ type: 'adjust_surplus', delta: take });
    }
    saveState();
    updatePayablesBucketRowAmount(bucketKey);
    updateGlobalUI();
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
    const decimalsSelect = document.getElementById('settings-decimals');
    const showFoodPlanToggle = document.getElementById('budget-show-food-plan') || document.getElementById('settings-show-food-plan');
    const compactToggle = document.getElementById('settings-compact');
    const firstDaySelect = document.getElementById('settings-first-day-of-week');
    const payDateSelect = document.getElementById('settings-pay-date');

    const currency = currencyInput?.value?.trim() || 'AED';
    const decimals = parseInt(decimalsSelect?.value, 10);
    const firstDayOfWeek = firstDaySelect ? Math.max(0, Math.min(6, parseInt(firstDaySelect.value, 10))) : 3;
    const payDate = payDateSelect ? Math.max(1, Math.min(31, parseInt(payDateSelect.value, 10))) : 28;

    state.settings = {
        ...state.settings,
        currency,
        decimals: Number.isNaN(decimals) ? 2 : decimals,
        confirmSurplusEdits: true,
        allowNegativeSurplus: true,
        showFoodPlan: showFoodPlanToggle ? !!showFoodPlanToggle.checked : (state.settings?.showFoodPlan !== false),
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
