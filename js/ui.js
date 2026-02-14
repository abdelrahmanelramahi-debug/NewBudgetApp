// Cached DOM refs for header and frequent elements (avoids repeated getElementById)
var _domCache = {};
function getEl(id) {
    if (!_domCache[id]) _domCache[id] = document.getElementById(id);
    return _domCache[id];
}
function clearDomCache() { _domCache = {}; }

/** Single entry point to refresh all UI after state change. Use instead of calling renderLedger + renderStrategy + updateGlobalUI + applySettings + renderSettings separately. */
function refreshUI() {
    if (typeof renderLedger === 'function') renderLedger();
    if (typeof renderStrategy === 'function') renderStrategy();
    if (typeof updateGlobalUI === 'function') updateGlobalUI();
    if (typeof applySettings === 'function') applySettings();
    if (typeof renderSettings === 'function') renderSettings();
}
if (typeof window !== 'undefined') window.refreshUI = refreshUI;

// --- In-app Alert / Confirm (replaces browser alert/confirm) ---
var _appAlertConfirmCallback = null;
var _appAlertCancelCallback = null;

function _showAppAlertModal(show) {
    var el = getEl('app-alert-modal');
    if (!el) return;
    if (show) {
        el.classList.remove('hidden');
        setTimeout(function () { el.classList.add('modal-open'); }, 10);
    } else {
        el.classList.remove('modal-open');
        setTimeout(function () { el.classList.add('hidden'); }, 300);
    }
}

function _closeAppAlertModal() {
    _showAppAlertModal(false);
    _appAlertConfirmCallback = null;
    _appAlertCancelCallback = null;
}

/** Show an in-app alert (one OK button). Replaces alert(message). */
function showAppAlert(message, title) {
    var titleEl = getEl('app-alert-title');
    var messageEl = getEl('app-alert-message');
    var okBtn = getEl('app-alert-ok');
    var cancelBtn = getEl('app-alert-cancel');
    if (!messageEl || !okBtn) return;
    if (titleEl) {
        titleEl.textContent = title || '';
        titleEl.classList.toggle('hidden', !title);
    }
    messageEl.textContent = message || '';
    okBtn.textContent = 'OK';
    if (cancelBtn) cancelBtn.classList.add('hidden');
    _appAlertConfirmCallback = null;
    _appAlertCancelCallback = null;
    okBtn.onclick = function () { _closeAppAlertModal(); };
    _showAppAlertModal(true);
}

/** Show an in-app confirm (Cancel + primary button). Replaces confirm(message). Callbacks are called when user clicks. */
function showAppConfirm(message, onConfirm, onCancel, options) {
    options = options || {};
    var title = options.title;
    var confirmLabel = options.confirmLabel || 'Continue';
    var titleEl = getEl('app-alert-title');
    var messageEl = getEl('app-alert-message');
    var okBtn = getEl('app-alert-ok');
    var cancelBtn = getEl('app-alert-cancel');
    if (!messageEl || !okBtn) return;
    if (titleEl) {
        titleEl.textContent = title || '';
        titleEl.classList.toggle('hidden', !title);
    }
    messageEl.textContent = message || '';
    okBtn.textContent = confirmLabel;
    if (cancelBtn) cancelBtn.classList.remove('hidden');
    _appAlertConfirmCallback = onConfirm || null;
    _appAlertCancelCallback = onCancel || null;
    okBtn.onclick = function () {
        var cb = _appAlertConfirmCallback;
        _closeAppAlertModal();
        if (typeof cb === 'function') cb();
    };
    cancelBtn.onclick = function () {
        var cb = _appAlertCancelCallback;
        _closeAppAlertModal();
        if (typeof cb === 'function') cb();
    };
    _showAppAlertModal(true);
}

function getCurrencyLabel() {
    return state.settings?.currency || 'AED';
}

function formatMoney(value, decimalsOverride) {
    const decimals = Number.isInteger(decimalsOverride)
        ? decimalsOverride
        : (typeof state.settings?.decimals === 'number' ? state.settings.decimals : 2);
    const num = Number(value) || 0;
    return num.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function formatSignedMoney(value) {
    const prefix = value >= 0 ? '+' : '';
    return prefix + formatMoney(value);
}

function updateCurrencyLabels() {
    const label = getCurrencyLabel();
    document.querySelectorAll('[data-currency]').forEach(el => {
        el.textContent = label;
    });
    document.querySelectorAll('[data-currency-placeholder]').forEach(el => {
        el.setAttribute('placeholder', `${label}...`);
    });
}

function applySettings() {
    const body = document.body;
    if(!body) return;
    const theme = state.settings?.theme || 'light';
    body.classList.toggle('theme-dark', theme === 'dark');
    body.classList.toggle('compact', !!state.settings?.compact);
    updateCurrencyLabels();
}

function renderSettings() {
    const currencyInput = document.getElementById('settings-currency');
    if (currencyInput) currencyInput.value = typeof getCurrencyLabel === 'function' ? getCurrencyLabel() : (state.settings?.currency || 'AED');
    const decimalsSelect = document.getElementById('settings-decimals');
    if(decimalsSelect) decimalsSelect.value = String(state.settings?.decimals ?? 2);
    const confirmSurplus = document.getElementById('settings-confirm-surplus');
    if(confirmSurplus) confirmSurplus.checked = !!state.settings?.confirmSurplusEdits;
    const allowNegative = document.getElementById('settings-allow-negative');
    if(allowNegative) allowNegative.checked = !!state.settings?.allowNegativeSurplus;
    const themeSelect = document.getElementById('settings-theme');
    if(themeSelect) themeSelect.value = state.settings?.theme || 'light';
    const compactToggle = document.getElementById('settings-compact');
    if(compactToggle) compactToggle.checked = !!state.settings?.compact;
    const firstDaySelect = document.getElementById('settings-first-day-of-week');
    if(firstDaySelect) firstDaySelect.value = String(state.settings?.firstDayOfWeek ?? 3);
    const payDateSelect = document.getElementById('settings-pay-date');
    if(payDateSelect) payDateSelect.value = String(state.settings?.payDate ?? 28);
}

function switchPage(page) {
    const pages = {
        ledger: document.getElementById('page-ledger'),
        profile: document.getElementById('page-profile'),
        settings: document.getElementById('page-settings')
    };
    const tabs = {
        ledger: document.getElementById('nav-ledger'),
        profile: document.getElementById('nav-profile'),
        settings: document.getElementById('nav-settings')
    };

    Object.keys(pages).forEach(key => {
        if(pages[key]) pages[key].classList.add('hidden');
        if(key === 'ledger') {
            document.querySelectorAll('.nav-ledger-pill').forEach(el => { el.classList.remove('tab-active'); el.classList.add('tab-inactive'); });
        } else if(tabs[key]) tabs[key].className = 'tab-btn tab-inactive';
    });

    if(page === 'strategy') {
        openBudgetPlan();
        return;
    }
    if(pages[page]) pages[page].classList.remove('hidden');
    if(page === 'ledger') {
        document.querySelectorAll('.nav-ledger-pill').forEach(el => { el.classList.remove('tab-inactive'); el.classList.add('tab-active'); });
    } else if(tabs[page]) tabs[page].className = 'tab-btn tab-active';

    if(page === 'ledger') renderLedger();
    if(page === 'strategy') openBudgetPlan();
    if(page === 'profile' && typeof updateAuthUI === 'function') updateAuthUI();
    if(page === 'settings') {
        renderSettings();
    }
}

// --- BUDGET PLAN POPOUT ---
function openBudgetPlan() {
    const modal = document.getElementById('budget-plan-modal');
    if (modal) modal.classList.remove('hidden');
    renderStrategy();
    updateBudgetPlanAllocated();
}
function closeBudgetPlan() {
    const modal = document.getElementById('budget-plan-modal');
    if (modal) modal.classList.add('hidden');
}
function updateBudgetPlanAllocated() {
    const total = typeof state.monthlyIncome === 'number' ? state.monthlyIncome : 0;
    let allocated = 0;
    if (state.categories && state.categories.length) {
        state.categories.forEach(function (sec) {
            sec.items.forEach(function (item) { allocated += (typeof item.amount === 'number' ? item.amount : 0); });
        });
    }
    const allocEl = document.getElementById('budget-plan-allocated-val');
    const totalEl = document.getElementById('budget-plan-total-val');
    if (allocEl) allocEl.textContent = typeof formatMoney === 'function' ? formatMoney(allocated) : allocated.toFixed(0);
    if (totalEl) totalEl.textContent = typeof formatMoney === 'function' ? formatMoney(total) : total.toFixed(0);
}
window.openBudgetPlan = openBudgetPlan;
window.closeBudgetPlan = closeBudgetPlan;
window.updateBudgetPlanAllocated = updateBudgetPlanAllocated;

function toggleSideMenu() {
    const el = document.getElementById('side-menu');
    if (el) el.classList.toggle('hidden');
}
function closeSideMenu() {
    const el = document.getElementById('side-menu');
    if (el) el.classList.add('hidden');
}
window.toggleSideMenu = toggleSideMenu;
window.closeSideMenu = closeSideMenu;

// --- STRATEGY RENDER ---
function renderStrategy() {
    const container = document.getElementById('strategy-sections');
    if (!container) return;
    const incomeInput = document.getElementById('monthly-income-input');
    if (incomeInput) incomeInput.value = state.monthlyIncome;

    let systemHtml = '';
    let customHtml = '';
    let fullHtml = ''; // For fallback check

    state.categories.forEach((sec, secIdx) => {
        const secTotal = sec.items.reduce((a, b) => a + b.amount, 0);
        const perc = state.monthlyIncome > 0 ? Math.round((secTotal/state.monthlyIncome)*100) : 0;

        let controls;

        if (sec.isSystem) {
            controls = `<span class="text-[9px] font-bold text-slate-300 bg-slate-50 px-2 py-1 rounded-lg">LOCKED</span>`;
        } else {
            controls = `
            <div class="flex items-center gap-2">
                <span id="sec-perc-${sec.id}" class="text-[10px] font-bold text-indigo-500 bg-indigo-50 px-2 py-1 rounded-lg section-perc" data-sid="${sec.id}">${perc}%</span>
                <button onclick="renameCategory('${sec.id}')" class="bg-indigo-50 text-indigo-500 w-6 h-6 flex items-center justify-center rounded-lg hover:bg-indigo-100" title="Rename">
                   <span class="text-xs">✎</span>
                </button>
                <button onclick="deleteCategory('${sec.id}')" class="bg-red-50 text-red-500 w-6 h-6 flex items-center justify-center rounded-lg hover:bg-red-100" title="Delete Category">
                    <span class="text-xs">🗑</span>
                </button>
                <button onclick="openAddItemTool('${sec.id}')" class="bg-slate-900 text-white w-6 h-6 flex items-center justify-center rounded-lg text-lg leading-none pb-1 hover:bg-slate-700">+</button>
            </div>`;
        }

        let rowsHtml = '';
        sec.items.forEach((item, idx) => {
            let amortLabel = item.amortData ? `<span class="text-[9px] bg-indigo-50 text-indigo-600 px-1 rounded font-bold ml-2">${item.amortData.total}/${item.amortData.months}mo</span>` : '';
            const isFoodBase = item.label === 'Daily Food';

            // SMART BADGES FOR CORE ITEMS
            if (item.label === 'Daily Food') {
                const dailyRate = item.amount / state.food.daysTotal;
                amortLabel = `<span id="food-base-daily-badge" class="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold ml-2">${formatMoney(dailyRate)}/day</span>`;
            } else if (item.label === 'Weekly Misc') {
                const weeklyRate = item.amount / 4;
                amortLabel = `<span class="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold ml-2">~${formatMoney(weeklyRate)}/wk</span>`;
            } else if (item.label === 'Car Fund') {
                const weeklyRate = item.amount / 4;
                amortLabel = `<span class="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold ml-2">~${formatMoney(weeklyRate)}/wk</span>`;
            }

            const inputAttr = isFoodBase
                ? `id="food-base-input" onfocus="pushToUndo()" oninput="syncFoodBaseAmount('${sec.id}', ${idx}, this.value)"`
                : `onfocus="pushToUndo()" oninput="fastUpdateItemAmount('${sec.id}', ${idx}, this.value)"`;

            // Logic to disable delete for Core items
            const deleteBtnClass = (item.isCore) ? 'text-slate-200 cursor-not-allowed' : 'text-slate-300 hover:text-red-500 hover:bg-red-50 cursor-pointer';
            const deleteAction = (item.isCore) ? '' : `onclick="openDeleteModal('${sec.id}', ${idx})"`;

            const actions = `
                <button onclick="openAmortTool('${sec.id}', ${idx})" class="p-1.5 text-indigo-400 hover:bg-indigo-50 rounded">✎</button>
                <button ${deleteAction} class="p-1.5 ${deleteBtnClass} rounded">×</button>
            `;

            const displayAmount = item.amount.toFixed(0);
            const dailyRateVal = state.food.daysTotal > 0 ? (item.amount / state.food.daysTotal) : 0;
            const dailyRateDisplay = dailyRateVal.toFixed(0);
            const dailyRateMax = Math.max(100, Math.ceil(dailyRateVal));
            const foodSliderHtml = isFoodBase ? `
                <div class="px-6 pb-3">
                    <div class="flex justify-between text-[9px] font-bold uppercase text-slate-300 mb-1">
                        <span>Daily Rate</span>
                        <span>${dailyRateDisplay} ${getCurrencyLabel()}</span>
                    </div>
                    <input type="range" id="food-daily-slider" min="0" max="${dailyRateMax}" step="1" value="${dailyRateDisplay}" oninput="syncFoodDailyRate('${sec.id}', ${idx}, this.value)" class="w-full">
                    <div class="flex justify-between text-[9px] font-bold uppercase text-slate-300 mt-1">
                        <span>0</span>
                        <span>${dailyRateMax}</span>
                    </div>
                </div>
            ` : '';
            const isWeeklyMisc = item.label === 'Weekly Misc';
            const weeklyAmountMax = Math.max(500, Math.ceil((item.amount || 320) / 4) * 4 + 100);
            const weeklySliderHtml = isWeeklyMisc ? `
                <div class="px-6 pb-3">
                    <div class="flex justify-between text-[9px] font-bold uppercase text-slate-300 mb-1">
                        <span>Monthly (4 weeks)</span>
                        <span>${displayAmount} ${getCurrencyLabel()}</span>
                    </div>
                    <input type="range" id="weekly-amount-slider" min="0" max="${weeklyAmountMax}" step="4" value="${displayAmount}" oninput="syncWeeklyAmount('${sec.id}', ${idx}, this.value)" class="w-full">
                    <div class="flex justify-between text-[9px] font-bold uppercase text-slate-300 mt-1">
                        <span>0</span>
                        <span>${weeklyAmountMax}</span>
                    </div>
                </div>
            ` : '';

            rowsHtml += `
                <div class="draggable-row flex justify-between items-center py-3 border-b border-slate-50 last:border-0"
                     draggable="${!item.isCore}"
                     ondragstart="handleItemDragStart(event, '${sec.id}', ${idx})"
                     ondragover="handleDragOver(event)"
                     ondrop="handleItemDrop(event, '${sec.id}', ${idx})">
                    <div class="flex items-center gap-3">
                        <span class="text-slate-300 ${item.isCore ? 'opacity-0' : 'cursor-move'}">::</span>
                        <span class="text-xs font-bold text-slate-600">${item.label} ${amortLabel}</span>
                    </div>
                    <div class="flex items-center gap-2 no-drag" onmousedown="event.stopPropagation()">
                        <input type="number" value="${displayAmount}" class="input-pill text-slate-900" ${inputAttr}>
                        ${actions}
                    </div>
                </div>
                ${foodSliderHtml}
                ${weeklySliderHtml}
            `;
        });

        const cardHtml = `
            <div class="premium-card p-6 mb-6 draggable-card ${sec.isSystem ? 'bg-indigo-50/50 border-indigo-100' : ''}"
                 draggable="${!sec.isSystem}"
                 ondragstart="handleCatDragStart(event, ${secIdx})"
                 ondragover="handleDragOver(event)"
                 ondrop="handleCatDrop(event, ${secIdx})">
                <div class="flex justify-between items-center mb-4 pb-4 border-b border-slate-100">
                    <div class="flex flex-col gap-0.5">
                        <div class="flex items-center gap-2">
                            <span class="text-slate-300 ${sec.isSystem ? 'opacity-0' : 'cursor-move'} text-xs">☰</span>
                            <span class="text-[11px] font-black text-slate-800 uppercase tracking-widest">${sec.label}</span>
                        </div>
                        <span class="text-[10px] font-bold text-slate-500 pl-5">${formatMoney(secTotal)} ${getCurrencyLabel()} allocated</span>
                    </div>
                    ${controls}
                </div>
                <div class="space-y-1">${rowsHtml}</div>
            </div>
        `;

        if(sec.isSystem) systemHtml += cardHtml;
        else customHtml += cardHtml;
    });

    const toolBarHtml = `
        <div class="flex gap-2 mb-6">
            <button onclick="openAddCategoryTool()" class="flex-1 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest">Add Category</button>
            <button onclick="openDangerModal('global', null)" class="flex-1 py-3 bg-red-50 text-red-500 hover:bg-red-100 rounded-xl text-[10px] font-black uppercase tracking-widest">Clear All</button>
        </div>
    `;

    container.innerHTML = systemHtml + toolBarHtml + customHtml;

    if(!systemHtml && !customHtml) {
         container.innerHTML = toolBarHtml + '<div class="text-center py-10 text-slate-300 font-bold uppercase tracking-widest">No Strategies Yet</div>';
    }
    calculateReality();
    if (typeof updateBudgetPlanAllocated === 'function') updateBudgetPlanAllocated();
}

// --- LEDGER RENDER ---
function renderLedger() {
    const container = document.getElementById('ledger-categories');
    container.innerHTML = '';

    // WEEKLY LOGIC UPDATE: Use Weekly State
    document.getElementById('bal-weekly').innerText = formatMoney(state.accounts.weekly.balance || 0);
    const weekCount = document.getElementById('weekly-week-count');
    if (weekCount) weekCount.innerText = state.accounts.weekly?.week || 1;
    const nextBtn = document.getElementById('next-week-btn');
    if (nextBtn) {
        if ((state.accounts.weekly?.week || 1) >= WEEKLY_MAX_WEEKS) {
            nextBtn.classList.add('opacity-50', 'pointer-events-none');
            nextBtn.title = 'Week limit reached';
            nextBtn.disabled = true;
        } else {
            nextBtn.classList.remove('opacity-50', 'pointer-events-none');
            nextBtn.title = 'Start Next Week';
            nextBtn.disabled = false;
        }
    }

    // --- NEW: MAJOR FUNDS SECTION (Savings & Car) ---
    // Extract values safely
    const getBal = (lbl) => {
        // Fallback to planned amount if no live balance
        for(let s of state.categories) {
            const i = s.items.find(x=>x.label===lbl);
            if(i) return getItemBalance(lbl, i.amount);
        }
        return getItemBalance(lbl, 0);
    };

    const savBal = getBal('General Savings');
    const carBal = getBal('Car Fund');
    const payBal = getBal('Payables');

    const majorHtml = `
        <div class="major-funds mb-4 sm:mb-6">
            <!-- Mobile: compact bars (one row per fund), hidden from sm up -->
            <div class="space-y-1.5 max-sm:block sm:hidden">
                <div class="major-fund-bar flex items-center justify-between gap-2 py-2.5 px-3 rounded-xl bg-indigo-600 text-white border border-indigo-500">
                    <div class="flex items-center gap-2 min-w-0">
                        <span class="flex-shrink-0 w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                        </span>
                        <span class="text-[11px] font-bold uppercase tracking-wider truncate">General Savings</span>
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0">
                        <span class="text-base font-black">${formatMoney(savBal)}</span>
                        <button onclick="openSavingsBuckets()" class="py-1.5 px-2.5 rounded-lg bg-white/20 hover:bg-white/30 text-[10px] font-black uppercase">Manage</button>
                    </div>
                </div>
                <div class="major-fund-bar flex items-center justify-between gap-2 py-2.5 px-3 rounded-xl bg-slate-800 text-white border border-slate-700">
                    <div class="flex items-center gap-2 min-w-0">
                        <span class="flex-shrink-0 w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>
                        </span>
                        <span class="text-[11px] font-bold uppercase tracking-wider truncate">Car Fund</span>
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0">
                        <span class="text-base font-black">${formatMoney(carBal)}</span>
                        <button onclick="openTool('Car Fund')" class="py-1.5 px-2.5 rounded-lg bg-white text-slate-800 hover:bg-slate-100 text-[10px] font-black uppercase">Manage</button>
                    </div>
                </div>
                <div class="major-fund-bar flex items-center justify-between gap-2 py-2.5 px-3 rounded-xl bg-amber-500 text-white border border-amber-400">
                    <div class="flex items-center gap-2 min-w-0">
                        <span class="flex-shrink-0 w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8V4H8"/><path d="M4 8h16"/><path d="M6 12h12"/><path d="M8 16h8"/><path d="M10 20h4"/></svg>
                        </span>
                        <span class="text-[11px] font-bold uppercase tracking-wider truncate">Payables</span>
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0">
                        <span class="text-base font-black">${formatMoney(payBal)}</span>
                        <button onclick="openTool('Payables')" class="py-1.5 px-2.5 rounded-lg bg-white text-amber-900 hover:bg-amber-50 text-[10px] font-black uppercase">Manage</button>
                    </div>
                </div>
            </div>
            <!-- Desktop: 3 cards, show at sm breakpoint and up -->
            <div class="max-sm:hidden sm:grid grid-cols-3 gap-3">
                <div class="premium-card p-4 bg-indigo-600 text-white border-indigo-500 shadow-md flex flex-col justify-between min-h-0 relative overflow-hidden group rounded-xl">
                    <div class="absolute top-0 right-0 p-2 opacity-10 pointer-events-none">
                        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                    </div>
                    <div class="flex-shrink-0">
                        <span class="text-[10px] font-bold uppercase tracking-widest text-indigo-200">General Savings</span>
                        <div class="text-2xl font-black mt-0.5">${formatMoney(savBal)} <span class="text-xs text-indigo-300">${getCurrencyLabel()}</span></div>
                    </div>
                    <button onclick="openSavingsBuckets()" class="w-full py-2 mt-2 bg-white/20 hover:bg-white/30 rounded-lg text-[10px] font-black uppercase transition text-center backdrop-blur-sm">Manage</button>
                </div>
                <div class="premium-card p-4 bg-slate-800 text-white border-slate-700 shadow-md flex flex-col justify-between min-h-0 relative overflow-hidden group rounded-xl">
                    <div class="absolute top-0 right-0 p-2 opacity-10 pointer-events-none">
                        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>
                    </div>
                    <div class="flex-shrink-0">
                        <span class="text-[10px] font-bold uppercase tracking-widest text-slate-400">Car Fund</span>
                        <div class="text-2xl font-black mt-0.5">${formatMoney(carBal)} <span class="text-xs text-slate-500">${getCurrencyLabel()}</span></div>
                    </div>
                    <button onclick="openTool('Car Fund')" class="w-full py-2 mt-2 bg-white text-slate-800 hover:bg-slate-100 rounded-lg text-[10px] font-black uppercase transition text-center">Manage</button>
                </div>
                <div class="premium-card p-4 bg-amber-500 text-white border-amber-400 shadow-md flex flex-col justify-between min-h-0 relative overflow-hidden group rounded-xl">
                    <div class="absolute top-0 right-0 p-2 opacity-10 pointer-events-none">
                        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8V4H8"/><path d="M4 8h16"/><path d="M6 12h12"/><path d="M8 16h8"/><path d="M10 20h4"/></svg>
                    </div>
                    <div class="flex-shrink-0">
                        <span class="text-[10px] font-bold uppercase tracking-widest text-amber-100">Payables</span>
                        <div class="text-2xl font-black mt-0.5">${formatMoney(payBal)} <span class="text-xs text-amber-100">${getCurrencyLabel()}</span></div>
                    </div>
                    <button onclick="openTool('Payables')" class="w-full py-2 mt-2 bg-white text-amber-900 hover:bg-amber-50 rounded-lg text-[10px] font-black uppercase transition text-center">Manage</button>
                </div>
            </div>
        </div>
    `;
    container.innerHTML += majorHtml;

    // Create categorical dropdowns matching the strategy structure
    state.categories.forEach(sec => {
        // Filter items to skip Major Funds (Food Base/Daily Food live in Food Cycle; others have their own cards)
        var majorLabels = typeof MAJOR_FUND_LABELS !== 'undefined' ? MAJOR_FUND_LABELS : ['Weekly Misc', 'Daily Food', 'General Savings', 'Car Fund', 'Payables'];
        var skipLabels = majorLabels.concat(['Food Base']);
        const relevantItems = sec.items.filter(item => !skipLabels.includes(item.label));

        if (relevantItems.length === 0) return;

        const secId = `ledger-sec-${sec.id}`;
        let sumLeft = 0;
        let sumAllocated = 0;
        relevantItems.forEach(item => {
            sumLeft += getItemBalance(item.label, item.amount);
            sumAllocated += (typeof item.amount === 'number' ? item.amount : 0);
        });

        let barsHtml = '';
        relevantItems.forEach(item => {
            let bal = getItemBalance(item.label, item.amount);
            const planned = typeof item.amount === 'number' && item.amount > 0 ? item.amount : 1;
            const pct = Math.min(100, Math.max(0, (bal / planned) * 100));
            const safeLabel = String(item.label).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
            const safeLabelAttr = String(item.label).replace(/"/g, '&quot;');

            let actionBtn = '';
            if (sec.isSingleAction && bal !== 0) {
                actionBtn = `<button type="button" onclick="event.stopPropagation(); completeTask('${safeLabel}')" class="ledger-bar-complete flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center text-sm font-bold hover:bg-emerald-600 transition shadow-sm" title="Mark used">✓</button>`;
            }

            barsHtml += `
                <div class="ledger-bar flex items-center gap-2 sm:gap-3 w-full py-2.5 px-3 sm:px-4 rounded-xl border border-slate-100 bg-white hover:border-slate-200 hover:shadow-sm transition-all group ${bal === 0 ? 'opacity-70' : ''}">
                    <div class="flex-1 min-w-0 flex flex-col gap-0.5">
                        <span class="text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate" title="${safeLabelAttr}">${item.label}</span>
                        <div class="h-1.5 w-full max-w-[100px] rounded-full bg-slate-100 overflow-hidden">
                            <div class="ledger-bar-fill h-full rounded-full transition-all duration-300" style="width:${pct}%"></div>
                        </div>
                    </div>
                    <div class="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 text-right">
                        <p class="text-base sm:text-lg font-black text-slate-800 leading-tight">${formatMoney(bal)}</p>
                        <p class="text-[9px] font-bold text-slate-400 uppercase hidden sm:block">${getCurrencyLabel()} left</p>
                    </div>
                    <div class="ledger-bar-actions flex items-center gap-1.5 flex-shrink-0" onclick="event.stopPropagation()">
                        <input type="number" class="ledger-bar-amount w-14 sm:w-16 h-8 rounded-lg border border-slate-200 px-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200" placeholder="0" min="0" step="any">
                        <div class="flex flex-col gap-0 rounded-lg border border-slate-200 overflow-hidden bg-slate-50/80">
                            <button type="button" onclick="var b=this.closest('.ledger-bar'); var v=b.querySelector('.ledger-bar-amount').value; applyItemAdjustment('${safeLabel}', v, 'add'); b.querySelector('.ledger-bar-amount').value='';" class="w-7 h-6 flex items-center justify-center text-slate-600 text-sm font-medium hover:bg-slate-200/80 transition leading-none">+</button>
                            <button type="button" onclick="var b=this.closest('.ledger-bar'); var v=b.querySelector('.ledger-bar-amount').value; applyItemAdjustment('${safeLabel}', v, 'deduct'); b.querySelector('.ledger-bar-amount').value='';" class="w-7 h-6 flex items-center justify-center text-slate-600 text-sm font-medium hover:bg-slate-200/80 transition leading-none border-t border-slate-200">−</button>
                        </div>
                        <button type="button" onclick="openTool('${safeLabel}')" class="h-8 w-8 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center text-sm font-bold transition" title="Transfer">⋯</button>
                        ${actionBtn}
                    </div>
                </div>
            `;
        });

        // Section HTML with Toggle + category total (left / allocated)
        const sectionHtml = `
            <div class="mb-4">
                <button onclick="toggleLedgerSection('${secId}')" class="flex justify-between items-center w-full py-2.5 px-1 hover:bg-slate-50 rounded-lg transition group">
                    <span class="text-[11px] font-black text-slate-800 uppercase tracking-widest">${sec.label}</span>
                    <span class="flex items-center gap-2">
                        <span class="text-[10px] font-bold text-slate-500">${formatMoney(sumLeft)} / ${formatMoney(sumAllocated)} <span class="text-slate-400">${getCurrencyLabel()}</span></span>
                        <svg id="icon-${secId}" class="w-4 h-4 text-slate-400 transform transition-transform group-hover:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                    </span>
                </button>
                <div id="${secId}" class="space-y-1.5 mt-1 transition-all">
                    ${barsHtml}
                </div>
            </div>
        `;
        container.innerHTML += sectionHtml;
    });

    updateFoodUI();
    updateGlobalUI();
}

function toggleLedgerSection(id) {
    const el = document.getElementById(id);
    const icon = document.getElementById('icon-' + id);
    if (el.classList.contains('hidden')) {
        el.classList.remove('hidden');
        icon.classList.remove('-rotate-90');
    } else {
        el.classList.add('hidden');
        icon.classList.add('-rotate-90');
    }
}

function getFoodDayNames() {
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const start = typeof state.settings?.firstDayOfWeek === 'number' ? state.settings.firstDayOfWeek % 7 : 3;
    const out = [];
    for (let i = 0; i < 7; i++) out.push(names[(start + i) % 7]);
    return out;
}

/** Last day of month (1–31) for given year/month. */
function lastDayOfMonth(y, m) {
    return new Date(y, m + 1, 0).getDate();
}

/**
 * Current 28-day pay cycle: pay day = first slot, no empty leading cells.
 * Returns { cycleStart (Date), dates: [ { date, monthName, dayOfWeek, cycleDay } ] } for 28 days.
 */
function getPayCycleInfo() {
    var payDate = typeof state.settings?.payDate === 'number' ? Math.max(1, Math.min(31, state.settings.payDate)) : 28;
    var now = new Date();
    var todayYear = now.getFullYear();
    var todayMonth = now.getMonth();
    var todayDate = now.getDate();
    var lastDay = lastDayOfMonth(todayYear, todayMonth);
    var thisMonthPayDay = Math.min(payDate, lastDay);
    var cycleStartYear = todayYear;
    var cycleStartMonth = todayMonth;
    if (todayDate < thisMonthPayDay) {
        cycleStartMonth = todayMonth - 1;
        if (cycleStartMonth < 0) {
            cycleStartMonth += 12;
            cycleStartYear -= 1;
        }
    }
    var cycleStartLastDay = lastDayOfMonth(cycleStartYear, cycleStartMonth);
    var cycleStartDay = Math.min(payDate, cycleStartLastDay);
    var cycleStart = new Date(cycleStartYear, cycleStartMonth, cycleStartDay);
    var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var dates = [];
    for (var i = 0; i < 28; i++) {
        var d = new Date(cycleStartYear, cycleStartMonth, cycleStartDay + i);
        dates.push({
            date: d.getDate(),
            monthName: monthNames[d.getMonth()],
            dayOfWeek: d.getDay(),
            cycleDay: i + 1,
            year: d.getFullYear(),
            month: d.getMonth()
        });
    }
    return { cycleStart: cycleStart, dates: dates, monthNames: monthNames };
}

function getTodayCycleDay() {
    var info = getPayCycleInfo();
    var today = new Date();
    var d = today.getDate();
    var m = today.getMonth();
    var y = today.getFullYear();
    for (var i = 0; i < info.dates.length; i++) {
        if (info.dates[i].date === d && info.dates[i].month === m && info.dates[i].year === y)
            return i + 1;
    }
    return 0;
}
if (typeof window !== 'undefined') window.getTodayCycleDay = getTodayCycleDay;

function getMonthCalendarInfo() {
    var now = new Date();
    var year = now.getFullYear();
    var month = now.getMonth();
    var lastDay = new Date(year, month + 1, 0).getDate();
    var firstDow = new Date(year, month, 1).getDay();
    var start = typeof state.settings?.firstDayOfWeek === 'number' ? state.settings.firstDayOfWeek % 7 : 3;
    var pad = (firstDow - start + 7) % 7;
    var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return { year: year, month: month, lastDay: lastDay, pad: pad, monthName: monthNames[month], firstDow: firstDow, start: start };
}

function updateFoodUI() {
    var cid = typeof SECTION_IDS !== 'undefined' ? SECTION_IDS.CORE_ESSENTIALS : 'core_essentials';
    var fid = typeof SECTION_IDS !== 'undefined' ? SECTION_IDS.FOUNDATIONS : 'foundations';
    var flabel = typeof ITEM_LABELS !== 'undefined' ? ITEM_LABELS.FOOD_BASE : 'Daily Food';
    var fSec = state.categories.find(s=>s.id===cid) || state.categories.find(s=>s.id===fid);
    var fItem = fSec ? fSec.items.find(i=>i.label===flabel) : null;
    var foodBase = fItem ? fItem.amount : 840;
    var daily = foodBase / (state.food.daysTotal || 28);
    if (typeof ensureFoodConsumedDays === 'function') ensureFoodConsumedDays();
    var consumedDays = state.food.consumedDays || [];
    var daysUsed = consumedDays.length;
    var daysTotal = state.food.daysTotal || 28;
    var lockedAmount = state.food.lockedAmount || 0;
    var bufferCount = daily > 0 ? Math.floor(lockedAmount / daily) : 0;
    var currentDayInCycle = daysUsed + 1;

    document.getElementById('daily-food-rate').innerText = formatMoney(daily);
    document.getElementById('locked-funds-display').innerText = formatMoney(lockedAmount);
    document.getElementById('food-days-count').innerText = (daysTotal - daysUsed) + ' Days Left';

    var bufferSourceSel = document.getElementById('food-buffer-source');
    if (bufferSourceSel) {
        var currentVal = bufferSourceSel.value;
        var opts = '<option value="surplus">Extra</option><option value="savings">General Savings</option><option value="weekly">Weekly Allowance</option>';
        var buckets = state.accounts && state.accounts.buckets ? Object.keys(state.accounts.buckets) : [];
        buckets.forEach(function(label) {
            if (label === 'General Savings') return;
            var bal = typeof getItemBalance === 'function' ? getItemBalance(label, 0) : 0;
            if (bal > 0) opts += '<option value="' + String(label).replace(/"/g, '&quot;') + '">' + String(label).replace(/</g, '&lt;') + '</option>';
        });
        bufferSourceSel.innerHTML = opts;
        if (currentVal) bufferSourceSel.value = currentVal;
    }
    var macroUsed = document.getElementById('food-macro-used');
    if (macroUsed) macroUsed.textContent = daysUsed + ' of 28 used';
    var weekDayLabel = document.getElementById('food-week-day-label');
    if (weekDayLabel) {
        var today = new Date();
        var payCycle = getPayCycleInfo();
        var todayDate = today.getDate();
        var todayMonth = today.getMonth();
        var todayYear = today.getFullYear();
        var dayNamesShort = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        var idx = payCycle.dates.findIndex(function(p) { return p.date === todayDate && p.month === todayMonth && p.year === todayYear; });
        if (idx >= 0) {
            weekDayLabel.textContent = payCycle.dates[idx].monthName.toUpperCase() + ' ' + todayDate + ' (Day ' + (idx + 1) + ')';
        } else {
            weekDayLabel.textContent = dayNamesShort[todayMonth].toUpperCase() + ' ' + todayDate;
        }
    }
    var progressBar = document.getElementById('food-progress-bar');
    if (progressBar) progressBar.style.width = (daysUsed / 28 * 100) + '%';

    var payCycle = getPayCycleInfo();
    var dayNamesLong = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var headerRow = document.getElementById('food-overview-header');
    if (headerRow) {
        var headerGrid = headerRow.querySelector('.grid');
        if (headerGrid) {
            var headerLetters = payCycle.dates.slice(0, 7).map(function(p) { return dayNamesLong[p.dayOfWeek].charAt(0); });
            headerGrid.innerHTML = headerLetters.map(function(l) { return '<span>' + l + '</span>'; }).join('');
        }
    }

    var today = new Date();
    var todayDate = today.getDate();
    var todayMonth = today.getMonth();
    var todayYear = today.getFullYear();
    var rowsContainer = document.getElementById('food-overview-rows');
    if (rowsContainer) {
        rowsContainer.innerHTML = '';
        var dates = payCycle.dates;
        // 28-day core: pay day = first slot, no empty cells; each row = 7 consecutive days (pay day + 0..6, etc.)
        var coreWrapper = document.createElement('div');
        coreWrapper.className = 'food-calendar-core';
        var coreHtml = '';
        for (var r = 0; r < 4; r++) {
            var weekNum = r + 1;
            var weekLabel = 'Week ' + weekNum;
            var rowHtml = '<div class="food-week-row flex gap-2 items-stretch rounded-lg"><div class="w-12 flex-shrink-0 flex items-center text-[10px] font-black uppercase tracking-wider text-slate-400">' + weekLabel + '</div><div class="grid grid-cols-7 gap-1 flex-1">';
            for (var col = 0; col < 7; col++) {
                var slot = r * 7 + col;
                var p = dates[slot];
                var cycleDay = slot + 1;
                var consumed = consumedDays.indexOf(cycleDay) !== -1;
                var isToday = p.date === todayDate && p.month === todayMonth && p.year === todayYear;
                var futureInCycle = !consumed && cycleDay <= 28;
                var action = consumed ? 'unmark' : 'mark';
                var clickAttr = ' onclick="setFoodDayFromCalendar(' + cycleDay + ', \'' + action + '\')" role="button"';
                var cls = 'food-overview-cell rounded-md flex items-center justify-center text-[10px] font-black min-h-[2rem] transition cursor-pointer ';
                if (consumed) cls += 'bg-slate-200 text-slate-500 hover:bg-slate-300';
                else if (isToday) cls += 'bg-indigo-500 text-white shadow-md hover:bg-indigo-600';
                else if (futureInCycle) cls += 'bg-slate-100 text-slate-400 border border-slate-200 hover:bg-slate-200';
                else cls += 'bg-white text-slate-400 border border-slate-200';
                var label = consumed ? '✓' : p.date;
                rowHtml += '<div' + clickAttr + ' class="' + cls + '" data-cycle-day="' + cycleDay + '" data-date="' + p.date + '" title="' + (consumed ? 'Click to unmark' : 'Click to mark consumed') + ' · ' + p.monthName + ' ' + p.date + '">' + label + '</div>';
            }
            rowHtml += '</div></div>';
            coreHtml += rowHtml;
        }
        coreWrapper.innerHTML = coreHtml;
        rowsContainer.appendChild(coreWrapper);

        // Buffer row: only when at least 1 day extended; only show extended days (no unfunded slots)
        if (bufferCount > 0) {
            var cycleStart = payCycle.cycleStart;
            var bMonthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
            var bufferDates = [];
            for (var b = 0; b < bufferCount; b++) {
                var bd = new Date(cycleStart.getFullYear(), cycleStart.getMonth(), cycleStart.getDate() + 28 + b);
                bufferDates.push({
                    date: bd.getDate(),
                    monthName: bMonthNames[bd.getMonth()]
                });
            }
            var bufferWrapper = document.createElement('div');
            bufferWrapper.className = 'food-calendar-buffer';
            var bufHtml = '';
            for (var br = 0; br < Math.ceil(bufferDates.length / 7); br++) {
                var bufRow = '<div class="food-buffer-row flex gap-2 items-stretch rounded-lg"><div class="w-12 flex-shrink-0 flex items-center text-[9px] font-bold text-emerald-600 uppercase">' + (br === 0 ? 'Buffer' : '') + '</div><div class="grid grid-cols-7 gap-1 flex-1">';
                for (var c = 0; c < 7; c++) {
                    var idx = br * 7 + c;
                    if (idx < bufferDates.length) {
                        var b = bufferDates[idx];
                        bufRow += '<div class="food-overview-cell rounded-md flex items-center justify-center text-[10px] font-black min-h-[2rem] bg-emerald-500 text-white border border-emerald-600" title="' + b.monthName + ' ' + b.date + '">' + b.date + '</div>';
                    } else {
                        bufRow += '<div class="food-overview-cell rounded-md min-h-[2rem] bg-transparent"></div>';
                    }
                }
                bufRow += '</div></div>';
                bufHtml += bufRow;
            }
            bufferWrapper.innerHTML = bufHtml;
            rowsContainer.appendChild(bufferWrapper);
        }
    }

    var markBtn = document.getElementById('food-mark-day-btn');
    if (markBtn) markBtn.disabled = daysUsed >= daysTotal;
}

function calculateReality() {
    var total = getCurrentBalance();
    var realityTotal = getEl('reality-total');
    var headerReality = getEl('header-reality');
    if (realityTotal) realityTotal.innerText = formatMoney(total);
    if (headerReality) headerReality.innerText = formatMoney(total);
}

function updateGlobalUI() {
    var surplus = (state.accounts && state.accounts.surplus !== undefined) ? state.accounts.surplus : 0;
    var surpEl = getEl('global-surplus');
    var dTrigger = getEl('deficit-trigger');
    if (surpEl) surpEl.innerText = formatSignedMoney(surplus);

    if (dTrigger && surpEl) {
        if (surplus < 0) {
            dTrigger.classList.remove('hidden');
            surpEl.classList.remove('text-emerald-600');
            surpEl.classList.add('text-red-600');
        } else {
            dTrigger.classList.add('hidden');
            surpEl.classList.add('text-emerald-600');
            surpEl.classList.remove('text-red-600');
        }
    }

    calculateReality();
    var headerRealityEl = getEl('header-reality');
    if (headerRealityEl) void headerRealityEl.offsetHeight;
    if (surpEl) void surpEl.offsetHeight;
}

function renderCategoryHistory() {
    // FIX: Use global 'activeCat'
    const data = state.histories[activeCat] || [];
    document.getElementById('category-history-log').innerHTML = data.map(i => `
        <div class="flex justify-between items-center py-2 border-b border-slate-50 last:border-0 text-[10px]">
            <span class="font-bold text-slate-400 uppercase">${i.res}</span>
            <span class="${i.amt < 0 ? 'text-red-500' : 'text-emerald-500'} font-black">${formatMoney(i.amt)}</span>
        </div>
    `).join('') || '<div class="text-center text-slate-300 text-[10px] py-2">No History</div>';
}
