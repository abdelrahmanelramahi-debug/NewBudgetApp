/**
 * UI layer: refresh, pages, budget plan, ledger, modals, bank balance bar, food calendar.
 * Depends on: constants, state, logic, utils (format, dom, date). DOM cache and formatting from utils.
 */

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
    var hideIcon = options.hideIcon === true;
    var titleEl = getEl('app-alert-title');
    var messageEl = getEl('app-alert-message');
    var iconWrap = getEl('app-alert-icon');
    var okBtn = getEl('app-alert-ok');
    var cancelBtn = getEl('app-alert-cancel');
    if (!messageEl || !okBtn) return;
    if (iconWrap) iconWrap.classList.toggle('hidden', hideIcon);
    var modalEl = getEl('app-alert-modal');
    if (modalEl) modalEl.classList.toggle('app-confirm-compact', hideIcon);
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
    var hideEmpty = document.getElementById('ledger-hide-empty');
    if (hideEmpty) hideEmpty.checked = !!state.settings?.hideEmptyCategories;
    var sortSelect = document.getElementById('ledger-sort');
    if (sortSelect) sortSelect.value = state.settings?.categorySort || 'default';
}

function setLedgerViewOptions() {
    var hideEl = document.getElementById('ledger-hide-empty');
    var sortEl = document.getElementById('ledger-sort');
    if (!state.settings) state.settings = {};
    if (hideEl) state.settings.hideEmptyCategories = hideEl.checked;
    if (sortEl) state.settings.categorySort = sortEl.value || 'default';
    if (typeof saveState === 'function') saveState();
    if (typeof renderLedger === 'function') renderLedger();
}
if (typeof window !== 'undefined') window.setLedgerViewOptions = setLedgerViewOptions;

function renderSettings() {
    const currencyInput = document.getElementById('settings-currency');
    if (currencyInput) currencyInput.value = getCurrencyLabel();
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

function switchPage(page, options) {
    options = options || {};
    if(page === 'strategy') page = 'budget';
    const pages = {
        ledger: document.getElementById('page-ledger'),
        budget: document.getElementById('page-budget-plan'),
        profile: document.getElementById('page-profile'),
        settings: document.getElementById('page-settings')
    };
    const tabs = {
        ledger: document.getElementById('nav-ledger'),
        budget: document.getElementById('nav-budget'),
        profile: document.getElementById('nav-profile'),
        settings: document.getElementById('nav-settings')
    };

    Object.keys(pages).forEach(key => {
        if(pages[key]) pages[key].classList.add('hidden');
        if(key === 'ledger') {
            document.querySelectorAll('.nav-ledger-pill').forEach(el => { el.classList.remove('tab-active'); el.classList.add('tab-inactive'); });
        } else if(tabs[key]) {
            tabs[key].classList.remove('tab-active');
            tabs[key].classList.add('tab-inactive');
        }
    });

    if(pages[page]) pages[page].classList.remove('hidden');
    if(page === 'ledger') {
        document.querySelectorAll('.nav-ledger-pill').forEach(el => { el.classList.remove('tab-inactive'); el.classList.add('tab-active'); });
    } else if(tabs[page]) {
        tabs[page].classList.remove('tab-inactive');
        tabs[page].classList.add('tab-active');
    }

    var appHeader = document.getElementById('app-header');
    if (appHeader) appHeader.classList.toggle('hidden', page !== 'ledger');

    var mainContent = document.getElementById('main-content');
    if (mainContent) mainContent.classList.toggle('main-content--budget', page === 'budget');

    if(page === 'ledger') renderLedger();
    if(page === 'budget') {
        renderStrategy();
        updateBudgetPlanAllocated();
    }
    if(page === 'profile' && typeof updateAuthUI === 'function') updateAuthUI();
    if(page === 'settings') renderSettings();

    if (!options.skipHistory && typeof history !== 'undefined' && history.pushState) {
        var hash = (page === 'ledger') ? '' : '#' + page;
        var url = (window.location.pathname || '/') + (window.location.search || '') + hash;
        history.pushState({ page: page }, '', url);
    }
}

function getPageFromHash() {
    var hash = (typeof location !== 'undefined' && location.hash) ? location.hash.slice(1).toLowerCase() : '';
    if (hash === 'budget' || hash === 'profile' || hash === 'settings') return hash;
    if (hash === 'ledger' || hash === '') return 'ledger';
    return 'ledger';
}

var _historyRoutingInitialized = false;
function initHistoryRouting() {
    if (_historyRoutingInitialized) return;
    _historyRoutingInitialized = true;
    if (typeof window === 'undefined') return;
    window.addEventListener('popstate', function () {
        var page = getPageFromHash();
        if (typeof switchPage === 'function') switchPage(page, { skipHistory: true });
    });
}

// --- BUDGET PLAN (page) ---
function openBudgetPlan() {
    switchPage('budget');
}
function closeBudgetPlan() {
    switchPage('ledger');
}
/**
 * Updates allocated/total and unallocated/overallocated alerts for a given container.
 * opts: { total, allocated, prefix } where prefix is the element id prefix (e.g. 'budget-plan' or 'onboarding-cat').
 */
function updateAllocatedTotalUI(opts) {
    var total = opts.total != null ? Number(opts.total) : 0;
    var allocated = opts.allocated != null ? Number(opts.allocated) : 0;
    var prefix = opts.prefix || 'budget-plan';
    var totalDisplayEl = document.getElementById(prefix + '-total');
    var allocEl = document.getElementById(prefix + '-allocated-val');
    var totalValEl = document.getElementById(prefix + '-total-val');
    if (totalDisplayEl) totalDisplayEl.textContent = formatMoney(total);
    if (allocEl) allocEl.textContent = formatMoney(allocated);
    if (totalValEl) totalValEl.textContent = formatMoney(total);

    var alertEl = document.getElementById(prefix + '-unallocated-alert');
    var amountEl = document.getElementById(prefix + '-unallocated-amount');
    var overEl = document.getElementById(prefix + '-overallocated-alert');
    var overAmountEl = document.getElementById(prefix + '-overallocated-amount');
    if (alertEl && amountEl && total > 0) {
        var unallocated = total - allocated;
        if (unallocated > 0.001) {
            amountEl.textContent = formatMoney(unallocated);
            alertEl.classList.remove('hidden');
        } else {
            alertEl.classList.add('hidden');
        }
    } else if (alertEl) {
        alertEl.classList.add('hidden');
    }
    if (overEl && overAmountEl && total > 0) {
        if (allocated > total + 0.001) {
            overAmountEl.textContent = formatMoney(allocated - total);
            overEl.classList.remove('hidden');
        } else {
            overEl.classList.add('hidden');
        }
    } else if (overEl) {
        overEl.classList.add('hidden');
    }
}

function updateBudgetPlanAllocated() {
    var total = typeof state.monthlyIncome === 'number' ? state.monthlyIncome : 0;
    var allocated = 0;
    if (state.categories && state.categories.length) {
        state.categories.forEach(function (sec) {
            sec.items.forEach(function (item) { allocated += (typeof item.amount === 'number' ? item.amount : 0); });
        });
    }
    updateAllocatedTotalUI({ total: total, allocated: allocated, prefix: 'budget-plan' });
}
window.openBudgetPlan = openBudgetPlan;
window.closeBudgetPlan = closeBudgetPlan;
window.updateBudgetPlanAllocated = updateBudgetPlanAllocated;
window.updateAllocatedTotalUI = updateAllocatedTotalUI;

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

// --- STRATEGY RENDER: budget plan cards (system + custom), sliders, allocated/total. Optional onboarding container. Calls clearDomCache. ---
function renderStrategy(opts) {
    opts = opts || {};
    var containerId = opts.containerId || 'strategy-sections';
    var forOnboarding = !!opts.onboarding;
    var container = document.getElementById(containerId);
    if (!container) return;
    if (!forOnboarding) {
        var incomeInput = document.getElementById('monthly-income-input');
        if (incomeInput) incomeInput.value = state.monthlyIncome;
    } else {
        var obInc = document.getElementById('onboarding-income');
        if (obInc && obInc.value.trim() !== '') {
            var parsed = parseFloat(obInc.value);
            if (!isNaN(parsed) && parsed >= 0) state.monthlyIncome = parsed;
        }
    }

    let systemHtml = '';
    let customHtml = '';

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
            const isFoodBase = item.label === 'Daily Food' || item.label === 'Food Base';

            // SMART BADGES FOR CORE ITEMS
            if (item.label === 'Daily Food' || item.label === 'Food Base') {
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
            const WEEKLY_SLIDER_STEP = 20;
            const weeklyAmountMax = Math.max(400, Math.ceil((item.amount || 400) / WEEKLY_SLIDER_STEP) * WEEKLY_SLIDER_STEP + WEEKLY_SLIDER_STEP);
            const weeklySnapped = Math.round((item.amount || 0) / WEEKLY_SLIDER_STEP) * WEEKLY_SLIDER_STEP;
            const weeklySliderHtml = isWeeklyMisc ? `
                <div class="px-6 pb-3">
                    <div class="flex justify-between text-[9px] font-bold uppercase text-slate-300 mb-1">
                        <span>Monthly (4 weeks)</span>
                        <span>${weeklySnapped} ${getCurrencyLabel()}</span>
                    </div>
                    <input type="range" id="weekly-amount-slider" min="0" max="${weeklyAmountMax}" step="${WEEKLY_SLIDER_STEP}" value="${weeklySnapped}" oninput="syncWeeklyAmount('${sec.id}', ${idx}, this.value)" class="w-full">
                    <div class="flex justify-between text-[9px] font-bold uppercase text-slate-300 mt-1">
                        <span>0</span>
                        <span>${weeklyAmountMax}</span>
                    </div>
                </div>
            ` : '';
            const isGeneralSavings = item.label === 'General Savings';
            const SAVINGS_SLIDER_STEP = 50;
            const savingsMax = Math.max(2000, Math.ceil((state.monthlyIncome || 5000) * 0.6 / SAVINGS_SLIDER_STEP) * SAVINGS_SLIDER_STEP);
            const savingsSnapped = Math.round((item.amount || 0) / SAVINGS_SLIDER_STEP) * SAVINGS_SLIDER_STEP;
            const generalSavingsSliderHtml = isGeneralSavings ? `
                <div class="px-6 pb-3">
                    <div class="flex justify-between text-[9px] font-bold uppercase text-slate-300 mb-1">
                        <span>Monthly</span>
                        <span>${savingsSnapped} ${getCurrencyLabel()}</span>
                    </div>
                    <input type="range" id="general-savings-slider" min="0" max="${savingsMax}" step="${SAVINGS_SLIDER_STEP}" value="${savingsSnapped}" oninput="syncGeneralSavingsAmount('${sec.id}', ${idx}, this.value)" class="w-full">
                    <div class="flex justify-between text-[9px] font-bold uppercase text-slate-300 mt-1">
                        <span>0</span>
                        <span>${savingsMax}</span>
                    </div>
                </div>
            ` : '';
            const isCarFund = item.label === 'Car Fund';
            const CAR_SLIDER_STEP = 20;
            const carMax = Math.max(400, Math.ceil((item.amount || 300) / CAR_SLIDER_STEP) * CAR_SLIDER_STEP + CAR_SLIDER_STEP);
            const carSnapped = Math.round((item.amount || 0) / CAR_SLIDER_STEP) * CAR_SLIDER_STEP;
            const carFundSliderHtml = isCarFund ? `
                <div class="px-6 pb-3">
                    <div class="flex justify-between text-[9px] font-bold uppercase text-slate-300 mb-1">
                        <span>Monthly (4 weeks)</span>
                        <span>${carSnapped} ${getCurrencyLabel()}</span>
                    </div>
                    <input type="range" id="car-fund-slider" min="0" max="${carMax}" step="${CAR_SLIDER_STEP}" value="${carSnapped}" oninput="syncCarFundAmount('${sec.id}', ${idx}, this.value)" class="w-full">
                    <div class="flex justify-between text-[9px] font-bold uppercase text-slate-300 mt-1">
                        <span>0</span>
                        <span>${carMax}</span>
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
                        <input type="number" value="${displayAmount}" class="input-pill text-slate-900" autocomplete="off" ${inputAttr}>
                        ${actions}
                    </div>
                </div>
                ${foodSliderHtml}
                ${weeklySliderHtml}
                ${generalSavingsSliderHtml}
                ${carFundSliderHtml}
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

    var toolBarHtml = forOnboarding
        ? `<div class="flex gap-2 mb-6"><button onclick="openAddCategoryTool()" class="flex-1 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest">Add Category</button></div>`
        : `<div class="flex gap-2 mb-6">
            <button onclick="openAddCategoryTool()" class="flex-1 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest">Add Category</button>
            <button onclick="openDangerModal('global', null)" class="flex-1 py-3 bg-red-50 text-red-500 hover:bg-red-100 rounded-xl text-[10px] font-black uppercase tracking-widest">Clear All</button>
        </div>`;

    container.innerHTML = systemHtml + toolBarHtml + customHtml;

    if(!systemHtml && !customHtml) {
         container.innerHTML = toolBarHtml + '<div class="text-center py-10 text-slate-300 font-bold uppercase tracking-widest">No Strategies Yet</div>';
    }
    clearDomCache();
    if (forOnboarding) {
        var total = state.monthlyIncome || 0;
        var allocated = state.categories.reduce(function (sum, sec) {
            return sum + (sec.items || []).reduce(function (s, i) { return s + (i.amount || 0); }, 0);
        }, 0);
        updateAllocatedTotalUI({ total: total, allocated: allocated, prefix: 'onboarding-cat' });
    } else {
        calculateReality();
        if (typeof updateBudgetPlanAllocated === 'function') updateBudgetPlanAllocated();
        var obStep = document.getElementById('onboarding-step-categories');
        if (obStep && !obStep.classList.contains('hidden') && document.getElementById('onboarding-strategy-sections')) {
            renderStrategy({ containerId: 'onboarding-strategy-sections', onboarding: true });
        }
    }
}

// --- LEDGER RENDER: builds ledger-categories (weekly, major funds, category sections with bars). Calls updateFoodUI, updateGlobalUI, clearDomCache. ---
function renderLedger() {
    const container = document.getElementById('ledger-categories');
    container.innerHTML = '';

    // WEEKLY: ensure synced then show current week's balance
    if (typeof ensureWeeklyState === 'function') ensureWeeklyState();
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
            nextBtn.title = 'Next week';
            nextBtn.disabled = false;
        }
    }
    const prevBtn = document.getElementById('prev-week-btn');
    if (prevBtn) {
        if ((state.accounts.weekly?.week || 1) <= 1) {
            prevBtn.classList.add('opacity-50', 'pointer-events-none');
            prevBtn.title = 'Already at week 1';
            prevBtn.disabled = true;
        } else {
            prevBtn.classList.remove('opacity-50', 'pointer-events-none');
            prevBtn.title = 'Previous week';
            prevBtn.disabled = false;
        }
    }
    const weeklyMiniEl = document.getElementById('weekly-mini-totals');
    if (state.accounts?.weekly?.balances && state.accounts.weekly.balances.length >= 4) {
        const totalLeft =
            (state.accounts.weekly.balances[0] || 0) +
            (state.accounts.weekly.balances[1] || 0) +
            (state.accounts.weekly.balances[2] || 0) +
            (state.accounts.weekly.balances[3] || 0);

        let perWeekAllocated = 0;
        if (typeof getWeeklyConfigAmount === 'function') {
            try { perWeekAllocated = Number(getWeeklyConfigAmount()) || 0; } catch (e) {}
        }
        const totalAllocated = Math.max(0, perWeekAllocated) * 4;

        // Small badge beside title
        if (weeklyMiniEl) {
            weeklyMiniEl.textContent =
                formatMoney(totalLeft) + ' left / ' + formatMoney(totalAllocated);
        }
    } else {
        if (weeklyMiniEl) weeklyMiniEl.textContent = '—';
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
                        <button onclick="openPayablesBuckets()" class="py-1.5 px-2.5 rounded-lg bg-white text-amber-900 hover:bg-amber-50 text-[10px] font-black uppercase">Manage</button>
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
                    <button onclick="openPayablesBuckets()" class="w-full py-2 mt-2 bg-white text-amber-900 hover:bg-amber-50 rounded-lg text-[10px] font-black uppercase transition text-center">Manage</button>
                </div>
            </div>
        </div>
    `;
    container.innerHTML += majorHtml;

    // Create categorical dropdowns matching the strategy structure
    var majorLabels = typeof MAJOR_FUND_LABELS !== 'undefined' ? MAJOR_FUND_LABELS : ['Weekly Misc', 'Daily Food', 'General Savings', 'Car Fund', 'Payables'];
    var skipLabels = majorLabels.concat(['Food Base']);
    var hideEmpty = !!state.settings?.hideEmptyCategories;
    var sortBy = state.settings?.categorySort || 'default';

    state.categories.forEach(sec => {
        const relevantItems = sec.items.filter(item => !skipLabels.includes(item.label));

        let items = relevantItems.slice();
        if (hideEmpty) {
            items = items.filter(item => getItemBalance(item.label, item.amount) !== 0);
        }
        if (sortBy !== 'default') {
            items = items.slice().sort(function (a, b) {
                var balA = getItemBalance(a.label, a.amount);
                var balB = getItemBalance(b.label, b.amount);
                if (sortBy === 'balanceDesc') return balB - balA;
                if (sortBy === 'balanceAsc') return balA - balB;
                if (sortBy === 'nameAsc') return String(a.label).localeCompare(b.label);
                if (sortBy === 'nameDesc') return String(b.label).localeCompare(a.label);
                return 0;
            });
        }

        if (items.length === 0) return;

        const secId = `ledger-sec-${sec.id}`;
        let sumLeft = 0;
        let sumAllocated = 0;
        items.forEach(item => {
            sumLeft += getItemBalance(item.label, item.amount);
            sumAllocated += (typeof item.amount === 'number' ? item.amount : 0);
        });

        let barsHtml = '';
        items.forEach(item => {
            let bal = getItemBalance(item.label, item.amount);
            const planned = typeof item.amount === 'number' && item.amount > 0 ? item.amount : 1;
            const pct = Math.min(100, Math.max(0, (bal / planned) * 100));
            const safeLabel = escapeAttr(item.label);
            const safeLabelAttr = escapeAttr(item.label);

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
                        <input type="number" class="ledger-bar-amount w-14 sm:w-16 h-8 rounded-lg border border-slate-200 px-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200" placeholder="0" min="0" step="any" autocomplete="off">
                        <div class="flex flex-col gap-0 rounded-lg border border-slate-200 overflow-hidden bg-slate-50/80">
                            <button type="button" onclick="var b=this.closest('.ledger-bar'); var v=b.querySelector('.ledger-bar-amount').value; applyItemAdjustment('${safeLabel}', v, 'add'); b.querySelector('.ledger-bar-amount').value='';" class="w-7 h-6 flex items-center justify-center text-slate-600 text-sm font-medium hover:bg-slate-200/80 transition leading-none">+</button>
                            <button type="button" onclick="var b=this.closest('.ledger-bar'); var v=b.querySelector('.ledger-bar-amount').value; applyItemAdjustment('${safeLabel}', v, 'deduct'); b.querySelector('.ledger-bar-amount').value='';" class="w-7 h-6 flex items-center justify-center text-slate-600 text-sm font-medium hover:bg-slate-200/80 transition leading-none border-t border-slate-200">−</button>
                        </div>
                        <button type="button" onclick="var b=this.closest('.ledger-bar'); var v=b&&b.querySelector('.ledger-bar-amount')?b.querySelector('.ledger-bar-amount').value:''; openTool('${safeLabel}', undefined, false, v);" class="h-8 w-8 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center text-sm font-bold transition" title="Transfer">⋯</button>
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

    clearDomCache();
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
    const names = typeof DAY_NAMES !== 'undefined' ? DAY_NAMES : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
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
    var monthNames = typeof MONTH_NAMES !== 'undefined' ? MONTH_NAMES : ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
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
    var monthNames = typeof MONTH_NAMES !== 'undefined' ? MONTH_NAMES : ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return { year: year, month: month, lastDay: lastDay, pad: pad, monthName: monthNames[month], firstDow: firstDow, start: start };
}

// Updates food panel: daily rate, locked funds, days left, buffer source dropdown, pay-cycle calendar.
function updateFoodUI() {
    var cid = SECTION_IDS.CORE_ESSENTIALS;
    var fid = SECTION_IDS.FOUNDATIONS;
    var flabel = ITEM_LABELS.FOOD_BASE;
    var fSec = state.categories.find(s=>s.id===cid) || state.categories.find(s=>s.id===fid);
    // Match same item as getFoodRemainderInfo (Daily Food or Food Base) so rate and remainder stay in sync
    var fItem = fSec ? fSec.items.find(i=>i.label===flabel || i.label==='Food Base') : null;
    var foodBase = fItem ? fItem.amount : 600;
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
                var cls = 'food-overview-cell rounded-md flex items-center justify-center text-[10px] font-black min-h-[2rem] transition cursor-pointer ';
                if (consumed) cls += 'bg-slate-200 text-slate-500 hover:bg-slate-300';
                else if (isToday) cls += 'bg-indigo-500 text-white shadow-md hover:bg-indigo-600';
                else if (futureInCycle) cls += 'bg-slate-100 text-slate-400 border border-slate-200 hover:bg-slate-200';
                else cls += 'bg-white text-slate-400 border border-slate-200';
                var label = consumed ? '✓' : p.date;
                var clickAttr = ' onclick="event.stopPropagation(); setFoodDayFromCalendar(' + cycleDay + ', \'' + action + '\')" role="button"';
                var cellContent = '<div' + clickAttr + ' class="' + cls + '" data-cycle-day="' + cycleDay + '" data-date="' + p.date + '" title="' + (consumed ? 'Click to unmark' : 'Click to mark consumed') + ' · ' + p.monthName + ' ' + p.date + '">' + label + '</div>';
                var hoverActions = '';
                if (futureInCycle || consumed) {
                    var tickTitle = consumed ? 'Unmark' : 'Mark consumed';
                    var transferTitle = 'Transfer day to...';
                    hoverActions = '<div class="food-day-hover-actions absolute inset-0 flex rounded-md overflow-hidden opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">' +
                        '<span class="pointer-events-auto flex-1 flex items-center justify-center min-w-0 food-day-consume-panel" title="' + tickTitle + '" onclick="event.stopPropagation(); setFoodDayFromCalendar(' + cycleDay + ', \'' + action + '\')" role="button" aria-label="' + tickTitle + '">' +
                        '<span class="text-white text-[10px] font-black">✓</span></span>';
                    if (!consumed) {
                        hoverActions += '<span class="pointer-events-auto flex-1 flex items-center justify-center min-w-0 food-day-transfer-panel" title="' + transferTitle + '" onclick="event.stopPropagation(); openFoodDayTransferPopover(' + cycleDay + ', this)" role="button" aria-label="' + transferTitle + '">' +
                            '<span class="text-white text-[10px] font-black">↗</span></span>';
                    } else {
                        hoverActions += '<span class="flex-1 food-day-transfer-panel opacity-50"></span>';
                    }
                    hoverActions += '</div>';
                }
                rowHtml += '<div class="food-overview-cell-wrapper group relative overflow-hidden">' + cellContent + hoverActions + '</div>';
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
                        var bufCellCls = 'food-overview-cell rounded-md flex items-center justify-center text-[10px] font-black min-h-[2rem] bg-emerald-500 text-white border border-emerald-600 cursor-pointer transition';
                        var bufCellContent = '<div class="' + bufCellCls + '" data-date="' + b.date + '" title="' + b.monthName + ' ' + b.date + '">' + b.date + '</div>';
                        var bufHover = '<div class="food-day-hover-actions absolute inset-0 flex rounded-md overflow-hidden opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">' +
                            '<span class="pointer-events-auto flex-1 flex items-center justify-center min-w-0 food-day-consume-panel" title="Consume" onclick="event.stopPropagation(); consumeBufferDay()" role="button" aria-label="Consume">' +
                            '<span class="text-white text-[10px] font-black">✓</span></span>' +
                            '<span class="pointer-events-auto flex-1 flex items-center justify-center min-w-0 food-day-transfer-panel" title="Transfer day to..." onclick="event.stopPropagation(); openBufferDayTransferPopover(this)" role="button" aria-label="Transfer">' +
                            '<span class="text-white text-[10px] font-black">↗</span></span>' +
                            '</div>';
                        bufRow += '<div class="food-overview-cell-wrapper group relative overflow-hidden">' + bufCellContent + bufHover + '</div>';
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

function toggleBufferDropdown() {
    var body = document.getElementById('food-buffer-dropdown-body');
    var chevron = document.getElementById('food-buffer-chevron');
    if (!body) return;
    body.classList.toggle('hidden');
    if (chevron) chevron.classList.toggle('rotate-180', !body.classList.contains('hidden'));
}
window.toggleBufferDropdown = toggleBufferDropdown;

// High-level segments for the bank balance bar: overarching categories + standalone major funds (no micro items, no "Other").
function getBankBalanceBarSegments() {
    var segments = [];
    var getBal = typeof getItemBalance === 'function' ? getItemBalance : function() { return 0; };
    var getSavings = typeof getSavingsTotal === 'function' ? getSavingsTotal() : (state.accounts?.buckets?.['General Savings'] ?? 0);
    var gsLabel = ITEM_LABELS.GENERAL_SAVINGS;
    var payLabel = ITEM_LABELS.PAYABLES;
    var carLabel = ITEM_LABELS.CAR_FUND;
    var foodLabel = ITEM_LABELS.FOOD_BASE;
    var weeklyLabel = ITEM_LABELS.WEEKLY_MISC;

    var surplus = (state.accounts && state.accounts.surplus !== undefined) ? state.accounts.surplus : 0;
    if (surplus > 0) segments.push({ label: 'Extra (Unallocated)', amount: surplus });

    if (getSavings > 0) segments.push({ label: gsLabel, amount: getSavings });
    if (getBal(payLabel, 0) > 0) segments.push({ label: payLabel, amount: getBal(payLabel, 0) });
    if (getBal(carLabel, 0) > 0) segments.push({ label: carLabel, amount: getBal(carLabel, 0) });

    if (typeof ensureWeeklyState === 'function') ensureWeeklyState();
    var w1 = Math.max(0, (state.accounts.weekly.balances && state.accounts.weekly.balances[0]) || 0);
    var w2 = Math.max(0, (state.accounts.weekly.balances && state.accounts.weekly.balances[1]) || 0);
    var w3 = Math.max(0, (state.accounts.weekly.balances && state.accounts.weekly.balances[2]) || 0);
    var w4 = Math.max(0, (state.accounts.weekly.balances && state.accounts.weekly.balances[3]) || 0);
    var totalWeekly = w1 + w2 + w3 + w4;
    if (totalWeekly > 0) segments.push({ label: 'Weekly Allowance', amount: totalWeekly, meta: 'Week 1–4' });

    if (typeof getFoodRemainderInfo === 'function') {
        var foodInfo = getFoodRemainderInfo();
        if (foodInfo.remainder > 0) segments.push({ label: 'Food Remainder', amount: foodInfo.remainder, meta: foodInfo.daysLeft + ' days' });
    }
    var locked = state.food?.lockedAmount || 0;
    if (locked > 0) segments.push({ label: 'Food Buffer', amount: locked, meta: 'Locked' });

    // One segment per category section (Health, Groceries, Misc, Subscriptions, etc.) – not per item.
    var skipLabels = [foodLabel, 'Food Base', weeklyLabel, gsLabel, payLabel, carLabel];
    (state.categories || []).forEach(function (sec) {
        if (!sec.items || !sec.items.length) return;
        var sectionSum = 0;
        sec.items.forEach(function (item) {
            if (skipLabels.indexOf(item.label) !== -1) return;
            sectionSum += getBal(item.label, 0);
        });
        if (sectionSum > 0) segments.push({ label: sec.label, amount: sectionSum });
    });

    return segments;
}

var _bankBalanceColorMap = {
    'extra (unallocated)': 'bg-emerald-400',
    'general savings': 'bg-sky-400',
    'payables': 'bg-rose-400',
    'car fund': 'bg-violet-400',
    'weekly allowance': 'bg-indigo-400',
    'food remainder': 'bg-amber-400',
    'food buffer': 'bg-amber-300',
    'health': 'bg-teal-400',
    'groceries': 'bg-orange-400',
    'misc': 'bg-cyan-400',
    'subscriptions': 'bg-fuchsia-400'
};
var _bankBalanceColorFallbacks = ['bg-lime-400', 'bg-pink-400', 'bg-rose-300', 'bg-violet-300', 'bg-teal-300'];
var _bankBalanceColorFallbackIndex = 0;

function getBankBalanceSegmentColor(label) {
    if (!label) return _bankBalanceColorFallbacks[0];
    var key = (label || '').toLowerCase().trim();
    if (_bankBalanceColorMap[key]) return _bankBalanceColorMap[key];
    var fallback = _bankBalanceColorFallbacks[_bankBalanceColorFallbackIndex % _bankBalanceColorFallbacks.length];
    _bankBalanceColorFallbackIndex += 1;
    return fallback;
}

function renderBankBalanceCard() {
    var total = getCurrentBalance();
    var totalEl = getEl('bank-balance-total');
    var barEl = getEl('bank-balance-bar');
    if (totalEl) totalEl.innerText = typeof formatMoney === 'function' ? formatMoney(total) : total.toFixed(2);
    if (!barEl) return;

    _bankBalanceColorFallbackIndex = 0;
    var segments = typeof getBankBalanceBarSegments === 'function' ? getBankBalanceBarSegments() : [];
    segments = segments.filter(function (s) { return s.amount > 0; });
    if (segments.length === 0 || total <= 0) {
        barEl.innerHTML = '<div class="flex-1 rounded-lg bg-slate-200" title="No balance"></div>';
        return;
    }
    var totalAmount = segments.reduce(function (sum, s) { return sum + s.amount; }, 0);
    if (totalAmount <= 0) totalAmount = total;
    var currency = getCurrencyLabel();
    var html = segments.map(function (item) {
        var pct = Math.max(0, (item.amount / totalAmount) * 100);
        var width = pct < 0.5 ? '0.5' : pct.toFixed(1);
        var color = getBankBalanceSegmentColor(item.label);
        var labelEsc = escapeAttr(item.label);
        var metaEsc = escapeAttr(item.meta || '');
        var amountStr = formatMoney(item.amount);
        return '<div class="bank-balance-segment ' + color + ' transition-all duration-200 hover:opacity-90 cursor-pointer" style="width:' + width + '%" data-label="' + labelEsc + '" data-meta="' + metaEsc + '" data-amount="' + amountStr + '" data-segment-currency="' + escapeAttr(getCurrencyLabel()) + '" role="button" tabindex="0"> </div>';
    }).join('');
    barEl.innerHTML = html || '<div class="flex-1 rounded-lg bg-slate-200" title="No balance"></div>';

    var tooltipEl = getEl('bank-balance-tooltip');
    if (tooltipEl) {
        tooltipEl.classList.add('hidden');
        tooltipEl.setAttribute('aria-hidden', 'true');
    }
    function showSegmentTooltip(segment) {
        if (!segment || !tooltipEl) return;
        var label = segment.getAttribute('data-label') || '';
        var meta = segment.getAttribute('data-meta') || '';
        var amount = segment.getAttribute('data-amount') || '';
        var currency = segment.getAttribute('data-segment-currency') || '';
        var line2 = amount + ' ' + currency;
        if (meta) line2 = meta + ' · ' + line2;
        tooltipEl.innerHTML = '<span class="bank-balance-tooltip-label">' + label + '</span><span class="bank-balance-tooltip-amount">' + line2 + '</span>';
        tooltipEl.style.opacity = '0';
        tooltipEl.classList.remove('hidden');
        tooltipEl.setAttribute('aria-hidden', 'false');
        var rect = segment.getBoundingClientRect();
        requestAnimationFrame(function () {
            var ttRect = tooltipEl.getBoundingClientRect();
            var left = rect.left + (rect.width / 2) - (ttRect.width / 2);
            var top = rect.top - ttRect.height - 8;
            if (left < 8) left = 8;
            if (left + ttRect.width > window.innerWidth - 8) left = window.innerWidth - ttRect.width - 8;
            if (top < 8) top = rect.bottom + 8;
            tooltipEl.style.left = left + 'px';
            tooltipEl.style.top = top + 'px';
            tooltipEl.style.opacity = '1';
        });
    }
    function hideSegmentTooltip() {
        if (tooltipEl) {
            tooltipEl.classList.add('hidden');
            tooltipEl.setAttribute('aria-hidden', 'true');
        }
    }
    barEl.removeEventListener('mouseenter', barEl._bankBalanceTooltipEnter);
    barEl.removeEventListener('mouseleave', barEl._bankBalanceTooltipLeave);
    barEl.removeEventListener('click', barEl._bankBalanceTooltipClick);
    barEl._bankBalanceTooltipEnter = function (e) {
        var seg = e.target.closest && e.target.closest('.bank-balance-segment');
        if (seg) showSegmentTooltip(seg);
    };
    barEl._bankBalanceTooltipLeave = function (e) {
        var seg = e.target.closest && e.target.closest('.bank-balance-segment');
        if (seg) hideSegmentTooltip();
    };
    barEl._bankBalanceTooltipClick = function (e) {
        var seg = e.target.closest && e.target.closest('.bank-balance-segment');
        if (seg) {
            if (tooltipEl && !tooltipEl.classList.contains('hidden')) hideSegmentTooltip();
            else showSegmentTooltip(seg);
        }
    };
    barEl.addEventListener('mouseenter', barEl._bankBalanceTooltipEnter, true);
    barEl.addEventListener('mouseleave', barEl._bankBalanceTooltipLeave, true);
    barEl.addEventListener('click', barEl._bankBalanceTooltipClick);
    if (!window._bankBalanceTooltipDocClick) {
        window._bankBalanceTooltipDocClick = function (e) {
            var tooltip = document.getElementById('bank-balance-tooltip');
            if (!tooltip || tooltip.classList.contains('hidden')) return;
            if (e.target.closest && (e.target.closest('#bank-balance-bar') || e.target.closest('#bank-balance-tooltip'))) return;
            tooltip.classList.add('hidden');
            tooltip.setAttribute('aria-hidden', 'true');
        };
        document.addEventListener('click', window._bankBalanceTooltipDocClick);
    }
}

// Writes current balance to reality elements (if present) and refreshes bank balance bar.
function calculateReality() {
    var total = getCurrentBalance();
    var realityTotal = getEl('reality-total');
    var headerReality = getEl('header-reality');
    if (realityTotal) realityTotal.innerText = formatMoney(total);
    if (headerReality) headerReality.innerText = formatMoney(total);
    if (typeof renderBankBalanceCard === 'function') renderBankBalanceCard();
}

// Updates surplus display, deficit trigger visibility, and calls calculateReality.
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

    var headerDateEl = getEl('header-today-date');
    if (headerDateEl) {
        var d = new Date();
        var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        headerDateEl.textContent = monthNames[d.getMonth()] + ' ' + d.getDate();
    }
}

function renderCategoryHistory() {
    // FIX: Use global 'activeCat'
    const data = state.histories[activeCat] || [];
    document.getElementById('category-history-log').innerHTML = data.map(i => {
        const noteHtml = (i.note && i.note.trim()) ? '<div class="text-slate-500 text-[9px] mt-0.5 truncate" title="' + escapeAttr(i.note) + '">' + escapeHtml(i.note) + '</div>' : '';
        return `
        <div class="py-2 border-b border-slate-50 last:border-0 text-[10px]">
            <div class="flex justify-between items-center">
                <span class="font-bold text-slate-400 uppercase">${i.res}</span>
                <span class="${i.amt < 0 ? 'text-red-500' : 'text-emerald-500'} font-black">${formatMoney(i.amt)}</span>
            </div>
            ${noteHtml}
        </div>`;
    }).join('') || '<div class="text-center text-slate-300 text-[10px] py-2">No History</div>';
}
