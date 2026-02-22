// --- INCOME LOGIC ---
function updateIncome(val) {
    const num = parseFloat(val);
    if(!isNaN(num)) {
        state.monthlyIncome = num;
        renderStrategy();
        saveState();
        if (typeof updateBudgetPlanAllocated === 'function') updateBudgetPlanAllocated();
    }
}

// --- STATE TRANSACTIONS ---
function ensureAccountsState() {
    if (!state.accounts) {
        state.accounts = { surplus: 0, weekly: { balance: getWeeklyConfigAmount(), week: 1 }, buckets: {} };
    }
    if (!state.accounts.weekly) {
        state.accounts.weekly = { balance: getWeeklyConfigAmount(), week: 1 };
    }
    if (!state.accounts.buckets) state.accounts.buckets = {};
    if (!state.accounts.savingsBuckets) {
        const seed = state.accounts.buckets['General Savings'] ?? 0;
        state.accounts.savingsBuckets = { Main: seed };
    }
    if (!state.accounts.savingsDefaultBucket) {
        state.accounts.savingsDefaultBucket = 'Main';
    }
    if (!state.accounts.payablesBuckets) {
        const seed = state.accounts.buckets['Payables'] ?? 0;
        state.accounts.payablesBuckets = { Main: seed };
    }
    if (!state.accounts.payablesDefaultBucket) {
        state.accounts.payablesDefaultBucket = 'Main';
    }
}

function setItemBalance(label, value) {
    ensureAccountsState();
    if (label === 'General Savings') {
        const target = state.accounts.savingsDefaultBucket || 'Main';
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
        if (label === 'General Savings') {
            Object.keys(state.accounts.savingsBuckets).forEach(key => {
                state.accounts.savingsBuckets[key] = 0;
            });
            syncSavingsTotal();
        } else if (label === 'Payables') {
            Object.keys(state.accounts.payablesBuckets).forEach(key => {
                state.accounts.payablesBuckets[key] = 0;
            });
            syncPayablesTotal();
        } else {
            state.accounts.buckets[label] = 0;
        }
    } else if (state.balances[label] !== undefined) {
        delete state.balances[label];
    }
}

function adjustItemBalance(label, delta) {
    if (label === 'General Savings') {
        adjustSavingsTotal(delta);
        return;
    }
    if (label === 'Payables') {
        adjustPayablesTotal(delta);
        return;
    }
    const current = getItemBalance(label, 0);
    setItemBalance(label, current + delta);
}

function syncSavingsTotal() {
    ensureAccountsState();
    state.accounts.buckets['General Savings'] = getSavingsTotal();
}

function syncPayablesTotal() {
    ensureAccountsState();
    state.accounts.buckets['Payables'] = getPayablesTotal();
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
    const target = state.accounts.savingsDefaultBucket || 'Main';
    if (state.accounts.savingsBuckets[target] === undefined) {
        state.accounts.savingsBuckets[target] = 0;
    }
    state.accounts.savingsBuckets[target] += amount;
    syncSavingsTotal();
}

function debitSavings(amount) {
    ensureAccountsState();
    let remaining = amount;
    const target = state.accounts.savingsDefaultBucket || 'Main';
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

function getPlanAmount(label) {
    for (let s of state.categories) {
        const it = s.items.find(i => i.label === label);
        if (it) return it.amount;
    }
    return 0;
}

function applyTransaction(tx) {
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
                } else if (tx.from === 'Weekly Misc') {
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
                if (tx.from === 'Weekly Misc') {
                    setWeeklyBalance(state.accounts.weekly.week, getWeeklyBalance() - tx.amount);
                }
            }
            if (tx.to === 'Surplus') {
                state.accounts.surplus += tx.amount;
            } else {
                adjustItemBalance(tx.to, tx.amount);
                if (tx.to === 'Weekly Misc') {
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
            const oldVal = item.amount;
            const newVal = tx.amount;
            item.amount = newVal;
            delete item.amortData;
            if (isAccountLabel(item.label)) {
                break;
            }
            const delta = newVal - oldVal;
            state.accounts.surplus -= delta;
            if (state.balances[item.label] !== undefined) {
                adjustItemBalance(item.label, delta);
            } else {
                setItemBalance(item.label, newVal);
            }
            break;
        }
        case 'weekly_adjust':
            adjustItemBalance('Weekly Misc', tx.delta);
            setWeeklyBalance(state.accounts.weekly.week, getWeeklyBalance() + tx.delta);
            break;
        case 'food_spend':
            if (typeof ensureFoodConsumedDays === 'function') ensureFoodConsumedDays();
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
            break;
        case 'food_lock':
            state.food.lockedAmount += tx.amount;
            state.food.history.unshift({type:'lock', amt: tx.amount, label: tx.label});
            break;
        case 'food_release_all':
            state.accounts.surplus += state.food.lockedAmount;
            state.food.lockedAmount = 0;
            break;
        case 'food_deficit_raid':
            state.accounts.surplus += tx.amount;
            state.food.history.unshift({type:'deficit', amt: tx.amount});
            break;
        default:
            break;
    }
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
            if(['Weekly Misc', 'Daily Food'].includes(item.label)) return;

            const bal = getItemBalance(item.label, item.amount);
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
        if(getItemBalance('Weekly Misc', undefined) === undefined) {
            const fullAmt = getWeeklyConfigAmount() * 4;
            setItemBalance('Weekly Misc', fullAmt);
        }
        setWeeklyBalance(state.accounts.weekly.week, getWeeklyBalance() - take);
        applyTransaction({ type: 'adjust_item_balance', label: 'Weekly Misc', delta: -take });
        applyTransaction({ type: 'adjust_surplus', delta: take });
        logHistory('Weekly Misc', -take, 'Deficit Cover');
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
function openTool(label, displayTitle, autoTransfer = false) {
    activeCat = label;
    document.getElementById('tool-title').innerText = displayTitle || label;
    document.getElementById('tool-value').value = '';

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
    if (activeCat === 'Weekly Misc') {
        const curWeek = state.accounts.weekly?.week || 1;
        container.innerHTML += `<p class="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Transfer to week</p>`;
        for (let w = 1; w <= WEEKLY_MAX_WEEKS; w++) {
            if (w === curWeek) continue;
            const id = 'weekly_week_' + w;
            const bal = typeof getWeeklyBalance === 'function' ? getWeeklyBalance(w) : 0;
            container.innerHTML += `
                <button onclick="executeTransfer('${id}')" class="w-full text-left p-2.5 rounded-lg border flex justify-between items-center bg-indigo-50 text-indigo-800 border-indigo-200 font-bold text-[11px] mb-1 hover:bg-indigo-100 transition">
                    <span>Week ${w}</span>
                    <span class="opacity-70">${typeof formatMoney === 'function' ? formatMoney(bal) : bal} →</span>
                </button>
            `;
        }
        container.innerHTML += `<div class="h-px bg-slate-200 my-2"></div>`;
    }

    // Define Priority Targets
    const priorities = [
        { id: 'Weekly Misc', label: 'Weekly Allowance', bg: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
        { id: 'General Savings', label: 'General Savings', bg: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
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
            if(item.label === activeCat || ['Weekly Misc', 'General Savings'].includes(item.label)) return;
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

    if (activeCat !== 'Surplus' && !String(activeCat).startsWith('weekly_week_') && getItemBalance(activeCat, undefined) === undefined) {
        setItemBalance(activeCat, getPlanAmount(activeCat));
    }
    const isTransferToWeek = String(targetId).startsWith('weekly_week_');
    if (targetId !== 'Surplus' && !isTransferToWeek && getItemBalance(targetId, undefined) === undefined) {
        setItemBalance(targetId, getPlanAmount(targetId));
    }

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
        if (getItemBalance(activeCat, undefined) === undefined) {
            setItemBalance(activeCat, getPlanAmount(activeCat));
        }
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
    if (getItemBalance(label, undefined) === undefined) {
        setItemBalance(label, getPlanAmount(label));
    }
    applyTransaction({ type: 'adjust_item_balance', label: label, delta: mod });
    logHistory(label, mod, 'Manual');
    saveState();
    if (typeof refreshUI === 'function') refreshUI();
}

function completeTask(label) {
    pushToUndo();
    if (getItemBalance(label, undefined) === undefined) {
         setItemBalance(label, getPlanAmount(label));
    }

    const current = getItemBalance(label, 0);
    setItemBalance(label, 0);
    logHistory(label, -current, 'Completed');
    saveState();
    renderLedger();
}

// Food
function setFoodViewWeek(weekIndexOrDelta) {
    if (!state.food) state.food = { daysTotal: 28, daysUsed: 0, lockedAmount: 0, history: [], viewWeek: 0 };
    var current = state.food.viewWeek || 0;
    var next = (weekIndexOrDelta === -1 || weekIndexOrDelta === 1) ? current + weekIndexOrDelta : weekIndexOrDelta;
    state.food.viewWeek = Math.max(0, Math.min(3, next));
    saveState();
    renderLedger();
}

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
    } else {
        state.food.consumedDays = list.concat([day]).sort(function(a, b) { return a - b; });
    }
    state.food.daysUsed = state.food.consumedDays.length;
    saveState();
    renderLedger();
    updateGlobalUI();
}

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
        applyTransaction({ type: 'adjust_item_balance', label: 'Weekly Misc', delta: -amount });
    } else {
        const current = getItemBalance(sourceId, 0);
        if (getItemBalance(sourceId, undefined) === undefined) setItemBalance(sourceId, current);
        applyTransaction({ type: 'adjust_item_balance', label: sourceId, delta: -amount });
    }
}

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

function releaseAllBuffer() {
    if(state.food.lockedAmount > 0) {
        pushToUndo();
        applyTransaction({ type: 'food_release_all' });
        saveState();
        renderLedger();
        updateGlobalUI();
    }
}
function undoFood(idx) {
    const h = state.food.history[idx];
    pushToUndo();
    if(h.type==='spend') {
        if (typeof ensureFoodConsumedDays === 'function') ensureFoodConsumedDays();
        var list = state.food.consumedDays || [];
        if (list.length > 0) {
            var maxDay = Math.max.apply(null, list);
            state.food.consumedDays = list.filter(function(d) { return d !== maxDay; });
        }
        state.food.daysUsed = (state.food.consumedDays || []).length;
    } else {
        state.food.lockedAmount -= h.amt;
        state.accounts.surplus += h.amt;
    }
    state.food.history.splice(idx, 1);
    saveState();
    renderLedger();
    updateGlobalUI();
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
                    logHistory('Weekly Misc', -current, 'Spend', getWeeklyInlineNote());
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
    logHistory('Weekly Misc', val * dir, 'Spend', getWeeklyInlineNote());
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
        logHistory('Weekly Misc', val, 'Top Up', getWeeklyInlineNote());
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
    return state.settings?.confirmSurplusEdits !== false;
}
function canApplySurplusDelta(delta) {
    if(state.settings?.allowNegativeSurplus === false && (state.accounts.surplus + delta) < 0) {
        showAppAlert('This would make Extra negative. Enable "Allow negative Extra" in Settings to proceed.');
        return false;
    }
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
                if (typeof refreshUI === 'function') refreshUI();
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
        const slider = document.getElementById('food-daily-slider');
        const input = document.getElementById('food-base-input');
        if(slider) {
            const dailyRate = state.food.daysTotal > 0 ? (num / state.food.daysTotal) : 0;
            const dailyRounded = Math.round(dailyRate);
            if(slider.value !== String(dailyRounded)) slider.value = String(dailyRounded);
        }
        if(input && input.value !== String(num)) input.value = String(num);
        const badge = document.getElementById('food-base-daily-badge');
        if(badge) {
            const dailyRate = state.food.daysTotal > 0 ? (num / state.food.daysTotal) : 0;
            badge.innerText = `${formatMoney(dailyRate)}/day`;
        }
    }
    var obStep = document.getElementById('onboarding-step-categories');
    if (obStep && !obStep.classList.contains('hidden')) {
        var total = state.monthlyIncome || 0;
        var allocated = state.categories.reduce(function (sum, sec) {
            return sum + (sec.items || []).reduce(function (s, i) { return s + (i.amount || 0); }, 0);
        }, 0);
        var totalEl = document.getElementById('onboarding-cat-total');
        var totalValEl = document.getElementById('onboarding-cat-total-val');
        var allocValEl = document.getElementById('onboarding-cat-allocated-val');
        if (totalEl) totalEl.textContent = typeof formatMoney === 'function' ? formatMoney(total) : total;
        if (totalValEl) totalValEl.textContent = typeof formatMoney === 'function' ? formatMoney(total) : total;
        if (allocValEl) allocValEl.textContent = typeof formatMoney === 'function' ? formatMoney(allocated) : allocated;
        var unallocAlert = document.getElementById('onboarding-cat-unallocated-alert');
        var unallocAmount = document.getElementById('onboarding-cat-unallocated-amount');
        var overAlert = document.getElementById('onboarding-cat-overallocated-alert');
        var overAmount = document.getElementById('onboarding-cat-overallocated-amount');
        if (unallocAlert && unallocAmount && total > 0) {
            var unallocated = total - allocated;
            if (unallocated > 0.001) {
                unallocAmount.textContent = typeof formatMoney === 'function' ? formatMoney(unallocated) : unallocated.toFixed(2);
                unallocAlert.classList.remove('hidden');
            } else {
                unallocAlert.classList.add('hidden');
            }
        } else if (unallocAlert) {
            unallocAlert.classList.add('hidden');
        }
        if (overAlert && overAmount && total > 0) {
            if (allocated > total + 0.001) {
                var over = allocated - total;
                overAmount.textContent = typeof formatMoney === 'function' ? formatMoney(over) : over.toFixed(2);
                overAlert.classList.remove('hidden');
            } else {
                overAlert.classList.add('hidden');
            }
        } else if (overAlert) {
            overAlert.classList.add('hidden');
        }
    }
}

function syncFoodBaseAmount(sid, idx, val) {
    const num = parseFloat(val) || 0;
    const slider = document.getElementById('food-daily-slider');
    const input = document.getElementById('food-base-input');
    if(slider) {
        const dailyRate = state.food.daysTotal > 0 ? (num / state.food.daysTotal) : 0;
        const dailyRounded = Math.round(dailyRate);
        if(slider.value !== String(dailyRounded)) slider.value = String(dailyRounded);
    }
    if(input && input.value !== String(num)) input.value = String(num);
    fastUpdateItemAmount(sid, idx, num);
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
}
var SAVINGS_SLIDER_STEP = 50;
function syncGeneralSavingsAmount(sid, idx, val) {
    const num = parseFloat(val) || 0;
    const snapped = Math.round(num / SAVINGS_SLIDER_STEP) * SAVINGS_SLIDER_STEP;
    fastUpdateItemAmount(sid, idx, snapped);
    if (typeof syncSavingsTotal === 'function') syncSavingsTotal();
}
var CAR_SLIDER_STEP = 20;
function syncCarFundAmount(sid, idx, val) {
    const num = parseFloat(val) || 0;
    const snapped = Math.round(num / CAR_SLIDER_STEP) * CAR_SLIDER_STEP;
    fastUpdateItemAmount(sid, idx, snapped);
}

// Paycheck + Allocation
function getAllocatableItems() {
    const items = [];
    state.categories.forEach(sec => {
        sec.items.forEach(item => {
            if (item.label === 'Daily Food') return;
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
    const val = parseFloat(document.getElementById('paycheck-amount').value);
    if(!val || val <= 0) return;

    const items = getAllocatableItems().map(item => {
        const current = getItemBalance(item.label, 0);
        const deficit = Math.max(0, item.amount - current);
        return { ...item, deficit };
    }).filter(item => item.deficit > 0);

    const totalDeficit = items.reduce((sum, i) => sum + i.deficit, 0);

    pushToUndo();
    applyTransaction({ type: 'adjust_surplus', delta: val });

    if (totalDeficit <= 0) {
        showAppAlert('All planned categories are already funded. The paycheck was added to Extra.');
        document.getElementById('paycheck-amount').value = '';
        saveState();
        if (typeof refreshUI === 'function') refreshUI();
        return;
    }

    items.forEach(item => {
        if (item.deficit > 0) {
            applyTransaction({ type: 'transfer', from: 'Surplus', to: item.label, amount: item.deficit });
            logHistory(item.label, item.deficit, 'Distribute');
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
}

// Savings Buckets (source/dest options for "outside" buckets)
var SAVINGS_EXTRA = '__extra__';
var SAVINGS_WEEKLY = '__weekly__';
function getWeeklyLabel() { return (typeof ITEM_LABELS !== 'undefined' ? ITEM_LABELS.WEEKLY_MISC : 'Weekly Misc'); }

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
    ensureAccountsState();
    if (state.accounts.savingsBuckets[bucketKey] === undefined) {
        state.accounts.savingsBuckets[bucketKey] = 0;
    }
    state.accounts.savingsBuckets[bucketKey] += delta;
    if (state.accounts.savingsBuckets[bucketKey] < 0) {
        state.accounts.savingsBuckets[bucketKey] = 0;
    }
    syncSavingsTotal();
}

function getSavingsBucketAmount(bucketKey) {
    ensureAccountsState();
    return state.accounts.savingsBuckets[bucketKey] || 0;
}

function doSavingsTransfer(fromKey, toKey, amount) {
    if (!fromKey || !toKey || fromKey === toKey) return;
    var val = parseFloat(amount);
    if (!val || val <= 0) return;
    ensureAccountsState();
    if (fromKey === SAVINGS_EXTRA && toKey !== SAVINGS_EXTRA) {
        if (!canApplySurplusDelta(-val)) return;
        pushToUndo();
        adjustSavingsBucket(toKey, val);
        applyTransaction({ type: 'adjust_surplus', delta: -val });
    } else if (fromKey !== SAVINGS_EXTRA && toKey === SAVINGS_EXTRA) {
        var available = getSavingsBucketAmount(fromKey);
        var take = Math.min(val, available);
        if (take <= 0) return;
        pushToUndo();
        adjustSavingsBucket(fromKey, -take);
        applyTransaction({ type: 'adjust_surplus', delta: take });
    } else {
        var available = getSavingsBucketAmount(fromKey);
        var take = Math.min(val, available);
        if (take <= 0) return;
        pushToUndo();
        state.accounts.savingsBuckets[fromKey] = available - take;
        state.accounts.savingsBuckets[toKey] = (state.accounts.savingsBuckets[toKey] || 0) + take;
        syncSavingsTotal();
    }
    saveState();
    renderSavingsBuckets();
    updateGlobalUI();
}

function doSavingsAddFromWeekly(toBucketKey, amount) {
    var val = parseFloat(amount);
    if (!val || val <= 0) return;
    var wlabel = getWeeklyLabel();
    var available = getItemBalance(wlabel, 0);
    var take = Math.min(val, available);
    if (take <= 0) return;
    pushToUndo();
    adjustItemBalance(wlabel, -take);
    adjustSavingsBucket(toBucketKey, take);
    saveState();
    renderSavingsBuckets();
    updateGlobalUI();
}

function doSavingsSendToWeekly(fromBucketKey, amount) {
    var val = parseFloat(amount);
    if (!val || val <= 0) return;
    var available = getSavingsBucketAmount(fromBucketKey);
    var take = Math.min(val, available);
    if (take <= 0) return;
    pushToUndo();
    adjustSavingsBucket(fromBucketKey, -take);
    adjustItemBalance(getWeeklyLabel(), take);
    saveState();
    renderSavingsBuckets();
    updateGlobalUI();
}

function renderSavingsBuckets() {
    ensureAccountsState();
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
        return '<div class="bucket-row bucket-row-card" data-bucket-key="' + esc(key) + '">' +
            '<span class="bucket-row-label">' + esc(key) + '</span>' +
            '<span class="bucket-row-balance bucket-amount">' + formatMoney(amount) + '</span>' +
            '<input type="number" class="bucket-amount-input" placeholder="0" min="0" step="any" inputmode="decimal">' +
            '<div class="bucket-stepper">' +
            '<button type="button" class="bucket-stepper-plus" data-dir="1" aria-label="Add">+</button>' +
            '<button type="button" class="bucket-stepper-minus" data-dir="-1" aria-label="Subtract">−</button>' +
            '</div>' +
            '<div class="bucket-more-wrap">' +
            '<button type="button" class="bucket-more-btn" aria-label="More options">⋯</button>' +
            '<div class="bucket-dropdown">' +
            '<button type="button" data-action="rename">Rename</button>' +
            '<button type="button" data-action="delete">Delete</button>' +
            '</div></div></div>';
    }).join('');
    }).join('');

    if (!list._savingsDelegation) {
        list._savingsDelegation = true;
        list.addEventListener('click', function (e) {
            var row = e.target.closest('.bucket-row');
            if (!row) return;
            var key = row.getAttribute('data-bucket-key');
            if (!key) return;

            var stepperBtn = e.target.closest('.bucket-stepper-plus, .bucket-stepper-minus');
            if (stepperBtn) {
                var dir = parseInt(stepperBtn.getAttribute('data-dir'), 10);
                var input = row.querySelector('.bucket-amount-input');
                if (dir && input) applySavingsBucketDelta(key, dir, input);
                return;
            }

            var moreBtn = e.target.closest('.bucket-more-btn');
            if (moreBtn) {
                e.stopPropagation();
                var wrap = row.querySelector('.bucket-more-wrap');
                var drop = wrap && wrap.querySelector('.bucket-dropdown');
                list.querySelectorAll('.bucket-dropdown.open').forEach(function (d) {
                    if (d !== drop) d.classList.remove('open');
                });
                if (drop) drop.classList.toggle('open');
                return;
            }

            var menuAction = e.target.closest('.bucket-dropdown button[data-action]');
            if (menuAction) {
                var action = menuAction.getAttribute('data-action');
                row.querySelectorAll('.bucket-dropdown').forEach(function (d) { d.classList.remove('open'); });
                if (action === 'rename') renameSavingsBucket(key);
                else if (action === 'delete') deleteSavingsBucket(key);
            }
        });
        document.addEventListener('click', function closeSavingsDropdown() {
            list.querySelectorAll('.bucket-dropdown.open').forEach(function (d) { d.classList.remove('open'); });
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
}

function transferSavingsBucketToSurplus(bucketKey) {
    var el = document.getElementById('savings-bucket-amount');
    var val = el ? parseFloat(el.value) : NaN;
    if (!val || val <= 0) return;
    pushToUndo();
    const available = getSavingsBucketAmount(bucketKey);
    const take = Math.min(val, available);
    if (take <= 0) return;
    adjustSavingsBucket(bucketKey, -take);
    applyTransaction({ type: 'adjust_surplus', delta: take });
    saveState();
    updateSavingsBucketRowAmount(bucketKey);
    updateGlobalUI();
}

function moveSavingsBucket(fromKey, toKey) {
    if (!fromKey || !toKey || fromKey === toKey) return;
    var el = document.getElementById('savings-bucket-amount');
    var val = el ? parseFloat(el.value) : NaN;
    if (!val || val <= 0) return;
    ensureAccountsState();
    const available = getSavingsBucketAmount(fromKey);
    const take = Math.min(val, available);
    if (take <= 0) return;
    pushToUndo();
    state.accounts.savingsBuckets[fromKey] = available - take;
    state.accounts.savingsBuckets[toKey] = (state.accounts.savingsBuckets[toKey] || 0) + take;
    syncSavingsTotal();
    saveState();
    updateSavingsBucketRowAmount(fromKey);
    updateSavingsBucketRowAmount(toKey);
    updateGlobalUI();
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
    state.accounts.savingsBuckets[name] = 0;
    syncSavingsTotal();
    input.value = '';
    saveState();
    renderSavingsBuckets();
    updateGlobalUI();
}

function updateSavingsDefaultBucket(value) {
    if (!value) return;
    ensureAccountsState();
    state.accounts.savingsDefaultBucket = value;
    saveState();
}

function renameSavingsBucket(oldName) {
    const newName = prompt('Rename bucket:', oldName);
    if (!newName || newName.trim() === '' || newName === oldName) return;
    ensureAccountsState();
    if (state.accounts.savingsBuckets[newName] !== undefined) {
        showAppAlert('Bucket already exists.');
        return;
    }
    pushToUndo();
    state.accounts.savingsBuckets[newName] = state.accounts.savingsBuckets[oldName] || 0;
    delete state.accounts.savingsBuckets[oldName];
    if (state.accounts.savingsDefaultBucket === oldName) {
        state.accounts.savingsDefaultBucket = newName;
    }
    syncSavingsTotal();
    saveState();
    renderSavingsBuckets();
    updateGlobalUI();
}

function deleteSavingsBucket(name) {
    ensureAccountsState();
    const remaining = Object.keys(state.accounts.savingsBuckets).length;
    if (remaining <= 1) {
        showAppAlert('You must keep at least one bucket.');
        return;
    }
    showAppConfirm('Delete "' + name + '" bucket and move its funds to Extra?', function () {
        const amount = state.accounts.savingsBuckets[name] || 0;
        pushToUndo();
        delete state.accounts.savingsBuckets[name];
        if (state.accounts.savingsDefaultBucket === name) {
            state.accounts.savingsDefaultBucket = Object.keys(state.accounts.savingsBuckets)[0];
        }
        syncSavingsTotal();
        applyTransaction({ type: 'adjust_surplus', delta: amount });
        saveState();
        renderSavingsBuckets();
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

function adjustPayablesBucket(bucketKey, delta) {
    ensureAccountsState();
    if (state.accounts.payablesBuckets[bucketKey] === undefined) {
        state.accounts.payablesBuckets[bucketKey] = 0;
    }
    state.accounts.payablesBuckets[bucketKey] += delta;
    if (state.accounts.payablesBuckets[bucketKey] < 0) {
        state.accounts.payablesBuckets[bucketKey] = 0;
    }
    syncPayablesTotal();
}

function getPayablesBucketAmount(bucketKey) {
    ensureAccountsState();
    return state.accounts.payablesBuckets[bucketKey] || 0;
}

function doPayablesTransfer(fromKey, toKey, amount) {
    if (!fromKey || !toKey || fromKey === toKey) return;
    var val = parseFloat(amount);
    if (!val || val <= 0) return;
    ensureAccountsState();
    if (fromKey === PAYABLES_EXTRA && toKey !== PAYABLES_EXTRA) {
        if (!canApplySurplusDelta(-val)) return;
        pushToUndo();
        adjustPayablesBucket(toKey, val);
        applyTransaction({ type: 'adjust_surplus', delta: -val });
    } else if (fromKey !== PAYABLES_EXTRA && toKey === PAYABLES_EXTRA) {
        var available = getPayablesBucketAmount(fromKey);
        var take = Math.min(val, available);
        if (take <= 0) return;
        pushToUndo();
        adjustPayablesBucket(fromKey, -take);
        applyTransaction({ type: 'adjust_surplus', delta: take });
    } else {
        var available = getPayablesBucketAmount(fromKey);
        var take = Math.min(val, available);
        if (take <= 0) return;
        pushToUndo();
        state.accounts.payablesBuckets[fromKey] = available - take;
        state.accounts.payablesBuckets[toKey] = (state.accounts.payablesBuckets[toKey] || 0) + take;
        syncPayablesTotal();
    }
    saveState();
    renderPayablesBuckets();
    updateGlobalUI();
}

function doPayablesAddFromWeekly(toBucketKey, amount) {
    var val = parseFloat(amount);
    if (!val || val <= 0) return;
    var wlabel = getWeeklyLabel();
    var available = getItemBalance(wlabel, 0);
    var take = Math.min(val, available);
    if (take <= 0) return;
    pushToUndo();
    adjustItemBalance(wlabel, -take);
    adjustPayablesBucket(toBucketKey, take);
    saveState();
    renderPayablesBuckets();
    updateGlobalUI();
}

function doPayablesSendToWeekly(fromBucketKey, amount) {
    var val = parseFloat(amount);
    if (!val || val <= 0) return;
    var available = getPayablesBucketAmount(fromBucketKey);
    var take = Math.min(val, available);
    if (take <= 0) return;
    pushToUndo();
    adjustPayablesBucket(fromBucketKey, -take);
    adjustItemBalance(getWeeklyLabel(), take);
    saveState();
    renderPayablesBuckets();
    updateGlobalUI();
}

function renderPayablesBuckets() {
    ensureAccountsState();
    var entries = Object.entries(state.accounts.payablesBuckets);
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
        return '<div class="bucket-row bucket-row-card" data-bucket-key="' + esc(key) + '">' +
            '<span class="bucket-row-label">' + esc(key) + '</span>' +
            '<span class="bucket-row-balance bucket-amount">' + formatMoney(amount) + '</span>' +
            '<input type="number" class="bucket-amount-input" placeholder="0" min="0" step="any" inputmode="decimal">' +
            '<div class="bucket-stepper">' +
            '<button type="button" class="bucket-stepper-plus" data-dir="1" aria-label="Add">+</button>' +
            '<button type="button" class="bucket-stepper-minus" data-dir="-1" aria-label="Subtract">−</button>' +
            '</div>' +
            '<div class="bucket-more-wrap">' +
            '<button type="button" class="bucket-more-btn" aria-label="More options">⋯</button>' +
            '<div class="bucket-dropdown">' +
            '<button type="button" data-action="rename">Rename</button>' +
            '<button type="button" data-action="delete">Delete</button>' +
            '</div></div></div>';
    }).join('');

    if (!list._payablesDelegation) {
        list._payablesDelegation = true;
        list.addEventListener('click', function (e) {
            var row = e.target.closest('.bucket-row');
            if (!row) return;
            var key = row.getAttribute('data-bucket-key');
            if (!key) return;

            var stepperBtn = e.target.closest('.bucket-stepper-plus, .bucket-stepper-minus');
            if (stepperBtn) {
                var dir = parseInt(stepperBtn.getAttribute('data-dir'), 10);
                var input = row.querySelector('.bucket-amount-input');
                if (dir && input) applyPayablesBucketDelta(key, dir, input);
                return;
            }

            var moreBtn = e.target.closest('.bucket-more-btn');
            if (moreBtn) {
                e.stopPropagation();
                var wrap = row.querySelector('.bucket-more-wrap');
                var drop = wrap && wrap.querySelector('.bucket-dropdown');
                list.querySelectorAll('.bucket-dropdown.open').forEach(function (d) {
                    if (d !== drop) d.classList.remove('open');
                });
                if (drop) drop.classList.toggle('open');
                return;
            }

            var menuAction = e.target.closest('.bucket-dropdown button[data-action]');
            if (menuAction) {
                var action = menuAction.getAttribute('data-action');
                row.querySelectorAll('.bucket-dropdown').forEach(function (d) { d.classList.remove('open'); });
                if (action === 'rename') renamePayablesBucket(key);
                else if (action === 'delete') deletePayablesBucket(key);
            }
        });
        document.addEventListener('click', function closePayablesDropdown() {
            list.querySelectorAll('.bucket-dropdown.open').forEach(function (d) { d.classList.remove('open'); });
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

function transferPayablesBucketToSurplus(bucketKey) {
    var el = document.getElementById('payables-bucket-amount');
    var val = el ? parseFloat(el.value) : NaN;
    if (!val || val <= 0) return;
    pushToUndo();
    const available = getPayablesBucketAmount(bucketKey);
    const take = Math.min(val, available);
    if (take <= 0) return;
    adjustPayablesBucket(bucketKey, -take);
    applyTransaction({ type: 'adjust_surplus', delta: take });
    saveState();
    updatePayablesBucketRowAmount(bucketKey);
    updateGlobalUI();
}

function movePayablesBucket(fromKey, toKey) {
    if (!fromKey || !toKey || fromKey === toKey) return;
    var el = document.getElementById('payables-bucket-amount');
    var val = el ? parseFloat(el.value) : NaN;
    if (!val || val <= 0) return;
    ensureAccountsState();
    const available = getPayablesBucketAmount(fromKey);
    const take = Math.min(val, available);
    if (take <= 0) return;
    pushToUndo();
    state.accounts.payablesBuckets[fromKey] = available - take;
    state.accounts.payablesBuckets[toKey] = (state.accounts.payablesBuckets[toKey] || 0) + take;
    syncPayablesTotal();
    saveState();
    updatePayablesBucketRowAmount(fromKey);
    updatePayablesBucketRowAmount(toKey);
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

function renamePayablesBucket(oldName) {
    const newName = prompt('Rename subcategory:', oldName);
    if (!newName || newName.trim() === '' || newName === oldName) return;
    ensureAccountsState();
    if (state.accounts.payablesBuckets[newName] !== undefined) {
        showAppAlert('Subcategory already exists.');
        return;
    }
    pushToUndo();
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
    const confirmSurplus = document.getElementById('settings-confirm-surplus');
    const allowNegative = document.getElementById('settings-allow-negative');
    const themeSelect = document.getElementById('settings-theme');
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
        confirmSurplusEdits: !!confirmSurplus?.checked,
        allowNegativeSurplus: !!allowNegative?.checked,
        theme: themeSelect?.value || 'light',
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

function rebuildTotals() {
    pushToUndo();
    ensureAccountsState();
    state.categories.forEach(sec => {
        sec.items.forEach(item => {
            if (isAccountLabel(item.label)) {
                if (item.label === 'General Savings') {
                    if (state.accounts.savingsBuckets.Main === undefined) {
                        state.accounts.savingsBuckets.Main = item.amount;
                    }
                    syncSavingsTotal();
                } else if (item.label === 'Payables') {
                    if (state.accounts.payablesBuckets.Main === undefined) {
                        state.accounts.payablesBuckets.Main = item.amount;
                    }
                    syncPayablesTotal();
                } else if (state.accounts.buckets[item.label] === undefined) {
                    state.accounts.buckets[item.label] = item.amount;
                }
            } else if (state.balances[item.label] === undefined) {
                state.balances[item.label] = item.amount;
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

function triggerImport() {
    const input = document.getElementById('settings-import-file');
    if(input) input.click();
}

function importStateFile(file) {
    if(!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const imported = JSON.parse(e.target.result);
            state = { ...state, ...imported };
            migrateState();
            ensureSystemSavings();
            ensureCoreItems();
            ensureSettings();
            saveState();
            location.reload();
        } catch (err) {
            showAppAlert('Import failed. The file is not valid JSON.');
        }
    };
    reader.readAsText(file);
}

function recoverLocalData() {
    var stateKey = typeof STORAGE_KEYS !== 'undefined' ? STORAGE_KEYS.STATE : 'financeCmd_state';
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
            state = { ...state, ...recovered };
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
        var stateKey = typeof STORAGE_KEYS !== 'undefined' ? STORAGE_KEYS.STATE : 'financeCmd_state';
        var modKey = typeof STORAGE_KEYS !== 'undefined' ? STORAGE_KEYS.MODIFIED : 'financeCmd_state_modified';
        localStorage.removeItem(stateKey);
        try { localStorage.removeItem(modKey); } catch (e) {}
        location.reload();
    }, null, { confirmLabel: 'Delete & Reload' });
}
