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
    var modalBody = getEl('app-alert-modal-body');
    var modalEl = getEl('app-alert-modal');
    var okBtn = getEl('app-alert-ok');
    var cancelBtn = getEl('app-alert-cancel');
    if (!messageEl || !okBtn) return;
    var payload = {};
    if (message && typeof message === 'object') payload = message;
    var finalTitle = payload.title || title || '';
    var useHtml = typeof payload.html === 'string';
    var textMessage = useHtml ? '' : (payload.message || message || '');
    var isWide = !!payload.wide;
    var isLeftAligned = !!payload.leftAligned;
    if (modalBody) {
        modalBody.classList.toggle('max-w-sm', !isWide);
        modalBody.classList.toggle('max-w-4xl', isWide);
        modalBody.classList.toggle('text-center', !isLeftAligned);
        modalBody.classList.toggle('text-left', isLeftAligned);
    }
    if (modalEl) {
        modalEl.classList.toggle('app-alert-rich', useHtml);
    }
    if (titleEl) {
        titleEl.textContent = finalTitle;
        titleEl.classList.toggle('hidden', !finalTitle);
    }
    if (useHtml) messageEl.innerHTML = payload.html;
    else messageEl.textContent = textMessage;
    okBtn.textContent = 'OK';
    if (cancelBtn) cancelBtn.classList.add('hidden');
    _appAlertConfirmCallback = null;
    _appAlertCancelCallback = null;
    okBtn.onclick = function () { _closeAppAlertModal(); };
    _showAppAlertModal(true);
}

/** Show an in-app confirm (Cancel + primary button, unless hidden). Replaces confirm(message). Callbacks are called when user clicks. */
function showAppConfirm(message, onConfirm, onCancel, options) {
    options = options || {};
    var title = options.title;
    var confirmLabel = options.confirmLabel || 'Continue';
    var hideIcon = options.hideIcon === true;
    var hideCancel = options.hideCancel === true;
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
    if (cancelBtn) {
        if (hideCancel) cancelBtn.classList.add('hidden');
        else cancelBtn.classList.remove('hidden');
    }
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

function updateEditLockUI(lockState) {
    var statusEl = getEl('edit-lock-status');
    if (!statusEl) return;
    lockState = lockState || {};
    if (!window.currentUser) {
        statusEl.textContent = '';
        statusEl.className = 'hidden';
        return;
    }
    if (!lockState.known) {
        statusEl.textContent = 'View-only: checking lock...';
        statusEl.className = 'text-[10px] text-amber-600 mt-0.5';
        return;
    }
    if (lockState.canEdit) {
        statusEl.textContent = 'Editing enabled on this device';
        statusEl.className = 'text-[10px] text-emerald-600 mt-0.5';
        return;
    }
    var holder = lockState.holderLabel || 'another device';
    statusEl.textContent = 'View-only: active on ' + holder;
    statusEl.className = 'text-[10px] text-amber-600 mt-0.5';
}
if (typeof window !== 'undefined') window.updateEditLockUI = updateEditLockUI;

function promptEditLockTakeover() {
    var lockState = (typeof window.getEditLockState === 'function') ? window.getEditLockState() : {};
    var holder = lockState && lockState.holderLabel ? lockState.holderLabel : 'another device';
    var msg = 'This budget is currently being edited on ' + holder + '.\n\nTo make changes here, click Resume control. The other session becomes view-only.';
    showAppConfirm(msg, function () {
        if (typeof window.takeOverEditLock !== 'function') {
            showAppAlert('Takeover is unavailable right now.');
            return;
        }
        window.takeOverEditLock().then(function (ok) {
            if (ok) {
                if (typeof window.updateSyncStatus === 'function') window.updateSyncStatus('Control resumed on this device', true, false);
                if (typeof window.updateEditLockUI === 'function' && typeof window.getEditLockState === 'function') {
                    window.updateEditLockUI(window.getEditLockState());
                }
            } else {
                showAppAlert('Unable to resume control right now. Please check connection and try again.');
            }
        });
    }, null, {
        title: 'View-only mode',
        confirmLabel: 'Resume control'
    });
}
if (typeof window !== 'undefined') window.promptEditLockTakeover = promptEditLockTakeover;

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
    const theme = state.settings?.theme || 'sepia';
    body.classList.toggle('theme-dark', theme === 'dark');
    body.classList.toggle('theme-sepia', theme === 'sepia');
    body.classList.toggle('compact', !!state.settings?.compact);
    updateCurrencyLabels();
    var hideEmpty = getEl('ledger-hide-empty');
    if (hideEmpty) hideEmpty.checked = !!state.settings?.hideEmptyCategories;
    var sortSelect = getEl('ledger-sort');
    if (sortSelect) sortSelect.value = state.settings?.categorySort || 'default';

    // Sync sidebar toggle thumb position (simple visual cue)
    var thumb = getEl('sidebar-theme-thumb');
    var thumbMobile = getEl('mobile-sidebar-theme-thumb');
    var isDark = theme === 'dark';
    // Update sidebar theme chips (desktop + mobile)
    var chipLight = getEl('theme-chip-light');
    var chipDark = getEl('theme-chip-dark');
    var chipSepia = getEl('theme-chip-sepia');
    var mobileChips = [getEl('mobile-theme-chip-light'), getEl('mobile-theme-chip-dark'), getEl('mobile-theme-chip-sepia')];
    [chipLight, chipDark, chipSepia].forEach(function (chip) {
        if (!chip) return;
        chip.classList.remove('bg-slate-200', 'bg-indigo-600', 'bg-amber-500', 'text-white', 'text-slate-600');
        chip.classList.add('text-slate-600', 'bg-slate-100');
    });
    mobileChips.forEach(function (chip) {
        if (!chip) return;
        chip.classList.remove('bg-indigo-600', 'bg-amber-500', 'text-white', 'text-slate-800');
        chip.classList.add('text-slate-800', 'bg-slate-100');
    });
    var activeChip = theme === 'dark' ? chipDark : theme === 'sepia' ? chipSepia : chipLight;
    if (activeChip) {
        activeChip.classList.remove('bg-slate-100', 'text-slate-600');
        activeChip.classList.add(theme === 'sepia' ? 'bg-amber-500' : 'bg-indigo-600', 'text-white');
    }
    var activeMobile = theme === 'dark' ? getEl('mobile-theme-chip-dark') : theme === 'sepia' ? getEl('mobile-theme-chip-sepia') : getEl('mobile-theme-chip-light');
    if (activeMobile) {
        activeMobile.classList.remove('bg-slate-100', 'text-slate-800');
        activeMobile.classList.add(theme === 'sepia' ? 'bg-amber-500' : 'bg-indigo-600', 'text-white');
    }
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

function setThemeFromSidebar(theme) {
    if (typeof state === 'undefined') return;
    if (!state.settings) state.settings = {};
    if (state.settings.theme === theme) return;
    state.settings.theme = theme;
    try {
        window.localStorage && localStorage.setItem('bubudget_theme', theme);
    } catch (e) {}
    if (typeof saveState === 'function') saveState();
    applySettings();
}
if (typeof window !== 'undefined') window.setThemeFromSidebar = setThemeFromSidebar;

function renderSettings() {
    const currencyInput = getEl('settings-currency');
    if (currencyInput) currencyInput.value = getCurrencyLabel();
    const compactToggle = getEl('settings-compact');
    if(compactToggle) compactToggle.checked = !!state.settings?.compact;
    const firstDaySelect = getEl('settings-first-day-of-week');
    if(firstDaySelect) firstDaySelect.value = String(state.settings?.firstDayOfWeek ?? 3);
    const payDateSelect = getEl('settings-pay-date');
    if(payDateSelect) payDateSelect.value = String(state.settings?.payDate ?? 28);
    const budgetShowFoodPlan = getEl('budget-show-food-plan');
    if (budgetShowFoodPlan) budgetShowFoodPlan.checked = state.settings?.showFoodPlan !== false;

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
    const mobileTabs = {
        ledger: document.getElementById('mobile-nav-ledger'),
        budget: document.getElementById('mobile-nav-budget'),
        profile: document.getElementById('mobile-nav-profile'),
        settings: document.getElementById('mobile-nav-settings')
    };

    Object.keys(pages).forEach(key => {
        if(pages[key]) pages[key].classList.add('hidden');
        if(key === 'ledger') {
            document.querySelectorAll('.nav-ledger-pill').forEach(el => { el.classList.remove('tab-active'); el.classList.add('tab-inactive'); });
        } else if(tabs[key]) {
            tabs[key].classList.remove('tab-active');
            tabs[key].classList.add('tab-inactive');
        }
        if(mobileTabs[key]) {
            mobileTabs[key].classList.remove('tab-active');
            mobileTabs[key].classList.add('tab-inactive');
        }
    });

    if(pages[page]) pages[page].classList.remove('hidden');
    if(page === 'ledger') {
        document.querySelectorAll('.nav-ledger-pill').forEach(el => { el.classList.remove('tab-inactive'); el.classList.add('tab-active'); });
    } else if(tabs[page]) {
        tabs[page].classList.remove('tab-inactive');
        tabs[page].classList.add('tab-active');
    }
    if(mobileTabs[page]) {
        mobileTabs[page].classList.remove('tab-inactive');
        mobileTabs[page].classList.add('tab-active');
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
    var rm = typeof roundMoney === 'function' ? roundMoney : function (v) { return Math.round(Number(v) * 100) / 100; };
    var total = rm(opts.total != null ? Number(opts.total) : 0);
    var allocated = rm(opts.allocated != null ? Number(opts.allocated) : 0);
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
        var unallocated = rm(total - allocated);
        if (unallocated > 0) {
            amountEl.textContent = formatMoney(unallocated);
            alertEl.classList.remove('hidden');
        } else {
            alertEl.classList.add('hidden');
        }
    } else if (alertEl) {
        alertEl.classList.add('hidden');
    }
    if (overEl && overAmountEl && total > 0) {
        var overAmt = rm(allocated - total);
        if (overAmt > 0) {
            overAmountEl.textContent = formatMoney(overAmt);
            overEl.classList.remove('hidden');
        } else {
            overEl.classList.add('hidden');
        }
    } else if (overEl) {
        overEl.classList.add('hidden');
    }
}

function updateBudgetPlanAllocated() {
    var rm = typeof roundMoney === 'function' ? roundMoney : function (v) { return Math.round(Number(v) * 100) / 100; };
    var total = typeof state.monthlyIncome === 'number' ? rm(state.monthlyIncome) : 0;
    var allocated = 0;
    if (state.categories && state.categories.length) {
        state.categories.forEach(function (sec) {
            sec.items.forEach(function (item) {
                if (item.label === 'Payables') return;
                if ((state.settings && state.settings.showFoodPlan === false) && item.label === 'Daily Food') return;
                allocated += typeof item.amount === 'number' ? rm(item.amount) : 0;
            });
        });
    }
    allocated = rm(allocated);
    updateAllocatedTotalUI({ total: total, allocated: allocated, prefix: 'budget-plan' });
}
window.openBudgetPlan = openBudgetPlan;
window.closeBudgetPlan = closeBudgetPlan;
window.updateBudgetPlanAllocated = updateBudgetPlanAllocated;
window.updateAllocatedTotalUI = updateAllocatedTotalUI;

function toggleSideMenu() {
    const el = getEl('side-menu');
    if (el) el.classList.toggle('hidden');
}
function closeSideMenu() {
    const el = getEl('side-menu');
    if (el) el.classList.add('hidden');
}
window.toggleSideMenu = toggleSideMenu;
window.closeSideMenu = closeSideMenu;

// --- STRATEGY RENDER: budget plan cards (system + custom), sliders, allocated/total. Optional onboarding container. Calls clearDomCache. ---
function renderFundingPriorityCard() {
    if (typeof getPaycheckPriorityEntries !== 'function') return '';
    var entries = getPaycheckPriorityEntries();
    var rows = entries.map(function (entry) {
        var safeId = String(entry.id || '').replace(/"/g, '&quot;');
        return `
            <div class="funding-priority-row flex justify-between items-center py-2 px-3 border-b border-slate-100 last:border-0"
                 draggable="true"
                 data-priority-id="${safeId}"
                 ondragstart="handlePriorityDragStart(event, '${String(entry.id || '').replace(/\\/g, '\\\\').replace(/'/g, '\\\'')}')"
                 ondragend="handlePriorityDragEnd(event)"
                 ondragover="handleDragOver(event)"
                 ondrop="handlePriorityDrop(event, '${String(entry.id || '').replace(/\\/g, '\\\\').replace(/'/g, '\\\'')}')">
                <div class="flex items-center gap-2 min-w-0">
                    <span class="text-slate-300 cursor-move text-xs">☰</span>
                    <span class="text-[11px] font-bold text-slate-700 truncate">${escapeHtml(entry.title || entry.label || '')}</span>
                </div>
                <span class="text-[9px] font-black uppercase tracking-widest text-indigo-500 bg-indigo-50 px-2 py-1 rounded-lg">${escapeHtml(entry.groupLabel || 'Priority')}</span>
            </div>
        `;
    }).join('');

    var empty = '<div class="text-[10px] text-slate-400 py-3 px-3">No priority targets yet. Add savings buckets, must-haves, or mini-budgets.</div>';
    return `
        <div class="funding-priority-region" role="region" aria-labelledby="funding-priority-heading">
            <section class="funding-priority-section mb-5">
                <header class="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-4">
                    <div class="min-w-0">
                        <h2 id="funding-priority-heading" class="funding-priority-title text-xl sm:text-2xl font-black uppercase tracking-[0.14em] text-slate-900 leading-tight">Funding Priority</h2>
                        <p class="text-[11px] font-semibold text-slate-500 mt-2 uppercase tracking-wider">Paycheck funds flow top-to-bottom — order matters.</p>
                    </div>
                    <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest shrink-0">Drag to reorder</span>
                </header>
                <div class="funding-priority-list rounded-xl border border-slate-100 bg-white overflow-hidden">
                    ${rows || empty}
                </div>
            </section>
        </div>
    `;
}

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
    if (typeof syncSavingsBudgetPlanItemAmount === 'function') syncSavingsBudgetPlanItemAmount();

    let systemHtml = '';
    let savingsCardHtml = '';
    let customHtml = '';

    var sysSavingsSec = state.categories.find(function (s) { return s && s.id === 'sys_savings'; }) || null;
    var savingsItemInSys = null;
    if (sysSavingsSec && Array.isArray(sysSavingsSec.items)) {
        var savingsIdxInSys = sysSavingsSec.items.findIndex(function (i) { return i && i.label === 'Savings'; });
        if (savingsIdxInSys >= 0) savingsItemInSys = sysSavingsSec.items[savingsIdxInSys];
    }

    function buildSavingsPlanCardHtml() {
        if (typeof ensureGeneralSavingsBudgetConfig === 'function') ensureGeneralSavingsBudgetConfig();
        var savingsBuckets = Object.keys((state.accounts && state.accounts.savingsBuckets) || {});
        var savingsPlannedTotal = 0;
        savingsBuckets.forEach(function (bucketName) {
            savingsPlannedTotal += Number((state.accounts && state.accounts.savingsBudgetPlan && state.accounts.savingsBudgetPlan[bucketName]) || 0);
        });
        if (!savingsBuckets.length) return '';

        var rowsHtml = `
            <div class="budget-savings-section border-b border-slate-100 pb-3 mb-2">
                <div class="budget-savings-title-row flex items-center justify-between gap-2">
                    <span class="budget-savings-title">Savings</span>
                    <span class="budget-savings-total">${formatMoney(savingsPlannedTotal)} ${getCurrencyLabel()}</span>
                </div>
                <div class="flex items-center gap-2 mt-2 mb-3">
                    <input id="budget-plan-savings-bucket-name" type="text" maxlength="80" class="input-pill text-left flex-1" placeholder="New savings bucket">
                    <button onclick="createSavingsBucketFromBudgetPlan()" class="px-3 py-2 rounded-lg bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider">Add</button>
                    <button onclick="openSavingsBuckets()" class="px-3 py-2 rounded-lg bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-wider">Manage</button>
                </div>
        `;

        savingsBuckets.forEach(function (bucketName, bucketIdx) {
            var planned = Number((state.accounts && state.accounts.savingsBudgetPlan && state.accounts.savingsBudgetPlan[bucketName]) || 0);
            var totalBudget = state.monthlyIncome || 0;
            var step = 50;
            var budgetCap = totalBudget > 0
                ? Math.ceil(totalBudget / step) * step
                : Math.ceil((state.monthlyIncome || 10000) * 1.2 / step) * step;
            var max = Math.max(step, Math.ceil((planned || 0) / step) * step + step * 2, budgetCap);
            var snapped = Math.round((planned || 0) / step) * step;
            var bucketArg = '\'' + String(bucketName).replace(/\\/g, '\\\\').replace(/'/g, '\\\'') + '\'';
            rowsHtml += `
                <div class="pb-2 budget-savings-bucket-row">
                    <div class="draggable-row flex justify-between items-center py-2">
                        <div class="flex items-center gap-3">
                            <span class="text-xs font-bold text-slate-600">${escapeHtml(bucketName)}</span>
                        </div>
                        <div class="flex items-center gap-2 no-drag" onmousedown="event.stopPropagation()">
                            <input id="savings-bucket-input-${bucketIdx}" type="text" inputmode="decimal" value="${formatMoneyPlain(planned)}" class="input-pill text-slate-900 budget-item-input" onfocus="pushToUndo()" oninput="budgetPlanSavingsBucketInput(${bucketArg}, ${bucketIdx}, this)" onblur="budgetPlanSavingsBucketCommit(${bucketArg}, ${bucketIdx}, this)" onkeydown="budgetPlanSavingsBucketKeydown(event, ${bucketArg}, ${bucketIdx}, this)" autocomplete="off">
                            <button onclick="openSavingsBuckets()" class="p-1.5 text-slate-300 hover:text-slate-600 hover:bg-slate-50 rounded">⋯</button>
                        </div>
                    </div>
                    <div class="px-6 pb-1">
                        <div class="flex justify-between text-[9px] font-bold uppercase text-slate-300 mb-1">
                            <span>Monthly</span>
                            <span id="savings-bucket-slider-label-${bucketIdx}">${Math.round(planned)} ${getCurrencyLabel()}</span>
                        </div>
                        <input type="range" id="savings-bucket-slider-${bucketIdx}" min="0" max="${max}" step="${step}" value="${snapped}" oninput="budgetPlanSavingsBucketSliderInput(${bucketArg}, ${bucketIdx}, this)" class="w-full">
                        <div class="flex justify-between text-[9px] font-bold uppercase text-slate-300 mt-1">
                            <span>0</span>
                            <span>${max}</span>
                        </div>
                    </div>
                </div>
            `;
        });
        rowsHtml += `</div>`;

        return `
            <div class="premium-card p-6 mb-6 bg-indigo-50/50 border-indigo-100">
                <div class="flex justify-between items-center mb-4 pb-4 border-b border-slate-100">
                    <div class="flex flex-col gap-0.5">
                        <div class="flex items-center gap-2">
                            <span class="text-[11px] font-black text-slate-800 uppercase tracking-widest">Savings</span>
                        </div>
                        <span class="text-[10px] font-bold text-slate-500">${formatMoney(savingsPlannedTotal)} ${getCurrencyLabel()} allocated</span>
                    </div>
                    <span class="text-[9px] font-bold text-slate-300 bg-slate-50 px-2 py-1 rounded-lg">LOCKED</span>
                </div>
                <div class="space-y-1">${rowsHtml}</div>
            </div>
        `;
    }

    state.categories.forEach((sec, secIdx) => {
        if (sec && sec.id === 'sys_savings') return;
        const budgetPlanItems = sec.items.filter(i => i.label !== 'Payables');
        const plannedTotalForRow = (item) => {
            if (item && item.amortData && typeof item.amortData.total === 'number') return Number(item.amortData.total) || 0;
            return typeof item.amount === 'number' ? item.amount : 0;
        };
        const secTotalBase = budgetPlanItems.reduce((a, b) => a + plannedTotalForRow(b), 0);
        const secTotal = secTotalBase;
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
            if (item.label === 'Payables') return;
            rowsHtml += buildBudgetPlanRowHtml(sec.id, idx, item, { hideFoodWhenOff: true });
        });

        function buildBudgetPlanRowHtml(sid, idx, item, optsRow) {
            optsRow = optsRow || {};
            const itemLabel = item.label === 'Food Base' ? 'Daily Food' : item.label;
            let amortLabel = item.amortData ? `<span class="text-[9px] bg-indigo-50 text-indigo-600 px-1 rounded font-bold ml-2">${item.amortData.total}/${item.amortData.months}mo</span>` : '';
            const isFoodBase = itemLabel === 'Daily Food';
            const isFoodPlanOff = isFoodBase && state.settings && state.settings.showFoodPlan === false;
            const isSavings = itemLabel === 'Savings';
            const isDragAllowed = (!item.isCore) && !isSavings;

            // SMART BADGES FOR CORE ITEMS
            if (itemLabel === 'Daily Food') {
                const foodAmount = isFoodPlanOff ? 0 : item.amount;
                const dailyRate = foodAmount / state.food.daysTotal;
                amortLabel = `<span class="budget-item-badge text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold ml-2" data-sid="${sid}" data-idx="${idx}" data-badge="food">${formatMoney(dailyRate)}/day</span>`;
            } else if (itemLabel === 'Weekly Allowance') {
                const weeklyRate = item.amount / 4;
                amortLabel = `<span class="budget-item-badge text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold ml-2" data-sid="${sid}" data-idx="${idx}" data-badge="weekly">~${formatMoney(weeklyRate)}/wk</span>`;
            } else if (itemLabel === 'Transportation') {
                const weeklyRate = item.amount / 4;
                amortLabel = `<span class="budget-item-badge text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold ml-2" data-sid="${sid}" data-idx="${idx}" data-badge="transport">~${formatMoney(weeklyRate)}/wk</span>`;
            }

            const inputAttr = isFoodBase
                ? `onfocus="pushToUndo()" oninput="budgetPlanAmountInput('${sid}', ${idx}, this)" onblur="budgetPlanAmountCommit('${sid}', ${idx}, this)" onkeydown="budgetPlanAmountKeydown(event, '${sid}', ${idx}, this)"`
                : `onfocus="pushToUndo()" oninput="budgetPlanAmountInput('${sid}', ${idx}, this)" onblur="budgetPlanAmountCommit('${sid}', ${idx}, this)" onkeydown="budgetPlanAmountKeydown(event, '${sid}', ${idx}, this)"`;

            // Core "Must Have" lines are locked: no edit/delete controls (amounts use sliders/inputs only)
            const actions = item.isCore
                ? ''
                : `
                <button onclick="openAmortTool('${sec.id}', ${idx})" class="p-1.5 text-indigo-400 hover:bg-indigo-50 rounded">✎</button>
                <button onclick="openDeleteModal('${sid}', ${idx})" class="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 cursor-pointer rounded">×</button>
            `;

            const effectiveAmount = isFoodPlanOff ? 0 : item.amount;
            const displayAmount = formatMoneyPlain(effectiveAmount);
            const dailyRateVal = state.food.daysTotal > 0 ? (effectiveAmount / state.food.daysTotal) : 0;
            const dailyRateRounded = Math.round(dailyRateVal);
            const dailyRateLabel = formatMoneyPlain(dailyRateVal);
            var totalBudget = state.monthlyIncome || 0;
            const dailyBudgetCap = (totalBudget > 0 && state.food.daysTotal > 0)
                ? Math.ceil(totalBudget / state.food.daysTotal)
                : Math.ceil((state.monthlyIncome || 10000) / 28 * 1.5);
            const dailyRateMax = Math.max(Math.ceil(dailyRateVal), dailyBudgetCap);
            const foodSliderHtml = isFoodBase ? `
                <div class="px-6 pb-3">
                    <div class="flex justify-between text-[9px] font-bold uppercase text-slate-300 mb-1">
                        <span>Daily Rate</span>
                        <span id="food-daily-slider-label-${sid}-${idx}">${dailyRateLabel} ${getCurrencyLabel()}</span>
                    </div>
                    <input type="range" id="food-daily-slider-${sid}-${idx}" min="0" max="${dailyRateMax}" step="1" value="${dailyRateRounded}" oninput="syncFoodDailyRate('${sid}', ${idx}, this.value)" class="w-full" ${isFoodPlanOff ? 'disabled' : ''}>
                    <div class="flex justify-between text-[9px] font-bold uppercase text-slate-300 mt-1">
                        <span>0</span>
                        <span>${dailyRateMax}</span>
                    </div>
                </div>
            ` : '';
            const isWeeklyMisc = itemLabel === 'Weekly Allowance';
            const WEEKLY_SLIDER_STEP = 20;
            const weeklyBudgetCap = totalBudget > 0
                ? Math.ceil(totalBudget / WEEKLY_SLIDER_STEP) * WEEKLY_SLIDER_STEP
                : Math.ceil((state.monthlyIncome || 10000) / WEEKLY_SLIDER_STEP) * WEEKLY_SLIDER_STEP;
            const weeklyAmountMax = Math.max(
                WEEKLY_SLIDER_STEP,
                Math.ceil((item.amount || 0) / WEEKLY_SLIDER_STEP) * WEEKLY_SLIDER_STEP + WEEKLY_SLIDER_STEP,
                weeklyBudgetCap
            );
            const weeklySnapped = Math.round((item.amount || 0) / WEEKLY_SLIDER_STEP) * WEEKLY_SLIDER_STEP;
            const weeklySliderHtml = isWeeklyMisc ? `
                <div class="px-6 pb-3">
                    <div class="flex justify-between text-[9px] font-bold uppercase text-slate-300 mb-1">
                        <span>Monthly (4 weeks)</span>
                        <span id="weekly-slider-label-${sid}-${idx}">${displayAmount} ${getCurrencyLabel()}</span>
                    </div>
                    <input type="range" id="weekly-amount-slider-${sid}-${idx}" min="0" max="${weeklyAmountMax}" step="${WEEKLY_SLIDER_STEP}" value="${weeklySnapped}" oninput="syncWeeklyAmount('${sid}', ${idx}, this.value)" class="w-full">
                    <div class="flex justify-between text-[9px] font-bold uppercase text-slate-300 mt-1">
                        <span>0</span>
                        <span>${weeklyAmountMax}</span>
                    </div>
                </div>
            ` : '';
            const isGeneralSavings = itemLabel === 'Savings';
            const SAVINGS_SLIDER_STEP = 50;
            const savingsBudgetCap = totalBudget > 0
                ? Math.ceil(totalBudget / SAVINGS_SLIDER_STEP) * SAVINGS_SLIDER_STEP
                : Math.ceil((state.monthlyIncome || 10000) * 1.2 / SAVINGS_SLIDER_STEP) * SAVINGS_SLIDER_STEP;
            const savingsMax = Math.max(
                SAVINGS_SLIDER_STEP,
                Math.ceil((item.amount || 0) / SAVINGS_SLIDER_STEP) * SAVINGS_SLIDER_STEP + SAVINGS_SLIDER_STEP * 2,
                savingsBudgetCap
            );
            const savingsSnapped = Math.round((item.amount || 0) / SAVINGS_SLIDER_STEP) * SAVINGS_SLIDER_STEP;
            const generalSavingsSliderHtml = isGeneralSavings ? `
                <div class="px-6 pb-3">
                    <div class="flex justify-between text-[9px] font-bold uppercase text-slate-300 mb-1">
                        <span>Monthly</span>
                        <span id="savings-slider-label-${sid}-${idx}">${displayAmount} ${getCurrencyLabel()}</span>
                    </div>
                    <input type="range" id="general-savings-slider-${sid}-${idx}" min="0" max="${savingsMax}" step="${SAVINGS_SLIDER_STEP}" value="${savingsSnapped}" oninput="syncGeneralSavingsAmount('${sid}', ${idx}, this.value)" class="w-full">
                    <div class="flex justify-between text-[9px] font-bold uppercase text-slate-300 mt-1">
                        <span>0</span>
                        <span>${savingsMax}</span>
                    </div>
                </div>
            ` : '';
            const isCarFund = itemLabel === 'Transportation';
            const CAR_SLIDER_STEP = 20;
            const carBudgetCap = totalBudget > 0
                ? Math.ceil(totalBudget / CAR_SLIDER_STEP) * CAR_SLIDER_STEP
                : Math.ceil((state.monthlyIncome || 10000) / CAR_SLIDER_STEP) * CAR_SLIDER_STEP;
            const carMax = Math.max(
                CAR_SLIDER_STEP,
                Math.ceil((item.amount || 0) / CAR_SLIDER_STEP) * CAR_SLIDER_STEP + CAR_SLIDER_STEP,
                carBudgetCap
            );
            const carSnapped = Math.round((item.amount || 0) / CAR_SLIDER_STEP) * CAR_SLIDER_STEP;
            const carFundSliderHtml = isCarFund ? `
                <div class="px-6 pb-3">
                    <div class="flex justify-between text-[9px] font-bold uppercase text-slate-300 mb-1">
                        <span>Monthly (4 weeks)</span>
                        <span id="car-slider-label-${sid}-${idx}">${displayAmount} ${getCurrencyLabel()}</span>
                    </div>
                    <input type="range" id="car-fund-slider-${sid}-${idx}" min="0" max="${carMax}" step="${CAR_SLIDER_STEP}" value="${carSnapped}" oninput="syncCarFundAmount('${sid}', ${idx}, this.value)" class="w-full">
                    <div class="flex justify-between text-[9px] font-bold uppercase text-slate-300 mt-1">
                        <span>0</span>
                        <span>${carMax}</span>
                    </div>
                </div>
            ` : '';

            return `
                <div class="draggable-row flex justify-between items-center py-3 border-b border-slate-50 last:border-0 ${isFoodPlanOff ? 'opacity-50 grayscale' : ''}"
                     draggable="${isDragAllowed}"
                     ondragstart="${isDragAllowed ? `handleItemDragStart(event, '${sid}', ${idx})` : ''}"
                     ondragover="handleDragOver(event)"
                     ondrop="handleItemDrop(event, '${sid}', ${idx})">
                    <div class="flex items-center gap-3">
                        <span class="text-slate-300 ${isDragAllowed ? 'cursor-move' : 'opacity-0'}">::</span>
                        <span class="text-xs font-bold text-slate-600">${itemLabel} ${amortLabel}</span>
                    </div>
                    <div class="flex items-center gap-2 no-drag" onmousedown="event.stopPropagation()">
                        ${isFoodBase ? `<input type="checkbox" id="budget-show-food-plan" class="w-4 h-4 accent-amber-500 rounded" ${(state.settings && state.settings.showFoodPlan === false) ? '' : 'checked'} onchange="toggleBudgetFoodPlan(this, '${sid}', ${idx})">` : ''}
                        <input type="text" inputmode="decimal" value="${displayAmount}" class="input-pill text-slate-900 budget-item-input" data-sid="${sid}" data-idx="${idx}" autocomplete="off" ${inputAttr} ${isFoodPlanOff ? 'disabled' : ''}>
                        ${actions}
                    </div>
                </div>
                ${foodSliderHtml}
                ${weeklySliderHtml}
                ${generalSavingsSliderHtml}
                ${carFundSliderHtml}
            `;
        }

        var displayLabel = (sec && sec.id === 'core_essentials') ? 'Must Haves' : sec.label;
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
                            <span class="text-[11px] font-black text-slate-800 uppercase tracking-widest">${displayLabel}</span>
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
    if (savingsItemInSys) {
        savingsCardHtml = buildSavingsPlanCardHtml();
    }

    var toolBarHtml = forOnboarding
        ? `<div class="flex gap-2 mb-4"><button onclick="openAddCategoryTool()" class="flex-1 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest">Add Category</button></div>`
        : `<div class="flex gap-2 mb-4">
            <button onclick="openAddCategoryTool()" class="flex-1 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest">Add Category</button>
            <button onclick="openDangerModal('global', null)" class="flex-1 py-3 bg-red-50 text-red-500 hover:bg-red-100 rounded-xl text-[10px] font-black uppercase tracking-widest">Clear All</button>
        </div>`;

    var miniBudgetsHeading = (!forOnboarding && customHtml)
        ? `<div class="flex items-center justify-between px-1 mb-3">
                <span class="text-[12px] font-black text-slate-900 uppercase tracking-[0.2em]">Mini-Budgets</span>
           </div>`
        : '';

    var fundingPriorityHtml = (!forOnboarding) ? renderFundingPriorityCard() : '';
    if (forOnboarding) {
        var savingsBlock = savingsCardHtml
            ? `<div id="onboarding-savings-block" class="space-y-2 mb-4">
                    <div id="onboarding-savings-section">${savingsCardHtml}</div>
               </div>`
            : '';
        var mustHavesBlock = systemHtml
            ? `<div id="onboarding-must-haves-block" class="space-y-2 mb-4">
                    <div id="onboarding-must-haves-heading" class="px-1">
                        <p class="text-[12px] font-black text-slate-900 uppercase tracking-[0.2em]">Must Haves</p>
                        <p class="text-[10px] font-semibold text-slate-500 mt-1">Cover these essentials first each month.</p>
                    </div>
                    <div id="onboarding-must-haves-section">${systemHtml}</div>
               </div>`
            : '';
        var miniBudgetsBlock = customHtml
            ? `<div id="onboarding-mini-budgets-block" class="space-y-2 mb-2">
                    <div id="onboarding-mini-budgets-heading" class="px-1">
                        <p class="text-[12px] font-black text-slate-900 uppercase tracking-[0.2em]">Mini-Budgets</p>
                        <p class="text-[10px] font-semibold text-slate-500 mt-1">Flexible categories you can fine-tune over time.</p>
                    </div>
                    <div id="onboarding-mini-budgets-section">${customHtml}</div>
               </div>`
            : '';
        container.innerHTML = savingsBlock + mustHavesBlock + miniBudgetsBlock + toolBarHtml;
    } else {
        // Toolbar belongs to Mini-Budgets; Funding Priority is a separate section below it.
        container.innerHTML = savingsCardHtml + systemHtml + miniBudgetsHeading + customHtml + toolBarHtml + fundingPriorityHtml;
    }

    if(!systemHtml && !customHtml) {
         container.innerHTML = toolBarHtml + '<div class="text-center py-10 text-slate-300 font-bold uppercase tracking-widest">No Strategies Yet</div>';
    }
    clearDomCache();
    if (forOnboarding) {
        var rm = typeof roundMoney === 'function' ? roundMoney : function (v) { return Math.round(Number(v) * 100) / 100; };
        var total = rm(state.monthlyIncome || 0);
        var allocated = state.categories.reduce(function (sum, sec) {
            return sum + (sec.items || []).reduce(function (s, i) { return s + rm(i.amount || 0); }, 0);
        }, 0);
        updateAllocatedTotalUI({ total: total, allocated: rm(allocated), prefix: 'onboarding-cat' });
    } else {
        calculateReality();
        if (typeof updateBudgetPlanAllocated === 'function') updateBudgetPlanAllocated();
        var obStep = document.getElementById('onboarding-step-categories');
        if (obStep && !obStep.classList.contains('hidden') && document.getElementById('onboarding-strategy-sections')) {
            renderStrategy({ containerId: 'onboarding-strategy-sections', onboarding: true });
        }
    }
}

function toggleBudgetFoodPlan(el, sid, idx) {
    if (typeof state === 'undefined') return;
    if (!state.settings) state.settings = {};
    var enabled = !!(el && el.checked);
    state.settings.showFoodPlan = enabled;
    if (!enabled) {
        var sec = (state.categories || []).find(function (s) { return s && s.id === sid; });
        var item = sec && sec.items ? sec.items[idx] : null;
        if (item && (item.label === 'Daily Food' || item.label === 'Food Base')) {
            item.amount = 0;
        }
    }
    if (typeof saveState === 'function') saveState();
    renderStrategy();
    updateBudgetPlanAllocated();
}
if (typeof window !== 'undefined') window.toggleBudgetFoodPlan = toggleBudgetFoodPlan;

// --- LEDGER RENDER: builds ledger-categories (weekly, major funds, category sections with bars). Calls updateFoodUI, updateGlobalUI, clearDomCache. ---
function renderLedger() {
    const container = document.getElementById('ledger-categories');
    container.innerHTML = '';

    // WEEKLY: ensure synced then show current week's balance
    if (typeof ensureWeeklyState === 'function') ensureWeeklyState();
    if (typeof maybeAutoAdvanceWeeklyWeek === 'function') maybeAutoAdvanceWeeklyWeek();
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

    const savBal = getBal('Savings');
    const carBal = getBal('Transportation');
    const payBal = getBal('Payables');

    const majorHtml = `
        <div class="major-funds mb-3 sm:mb-4">
            <!-- Mobile: compact bars (one row per fund), hidden from sm up -->
            <div class="space-y-1.5 max-sm:block sm:hidden">
                <div class="major-fund-bar flex items-center justify-between gap-2 py-2.5 px-3 rounded-xl bg-indigo-600 text-white border border-indigo-500">
                    <div class="flex items-center gap-2 min-w-0">
                        <span class="flex-shrink-0 w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                        </span>
                        <span class="text-[12px] font-black uppercase tracking-[0.18em] truncate">Savings</span>
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0">
                        <span class="text-base font-black" data-major-fund="savings">${formatMoney(savBal)}</span>
                        <button onclick="openSavingsBuckets()" class="py-1.5 px-2.5 rounded-lg bg-white/20 hover:bg-white/30 text-[10px] font-black uppercase">Manage</button>
                    </div>
                </div>
                <div class="major-fund-bar flex items-center justify-between gap-2 py-2.5 px-3 rounded-xl bg-slate-800 text-white border border-slate-700">
                    <div class="flex items-center gap-2 min-w-0">
                        <span class="flex-shrink-0 w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>
                        </span>
                        <span class="text-[11px] font-bold uppercase tracking-wider truncate">Transportation</span>
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0">
                        <span class="text-base font-black" data-major-fund="transportation">${formatMoney(carBal)}</span>
                        <button onclick="openTransportationBuckets()" class="py-1.5 px-2.5 rounded-lg bg-white text-slate-800 hover:bg-slate-100 text-[10px] font-black uppercase">Manage</button>
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
                        <span class="text-base font-black" data-major-fund="payables">${formatMoney(payBal)}</span>
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
                        <span class="text-[12px] font-black uppercase tracking-[0.18em] text-slate-900">Savings</span>
                        <div class="text-2xl font-black mt-0.5 major-fund-amount"><span data-major-fund="savings">${formatMoney(savBal)}</span> <span class="text-xs text-indigo-300">${getCurrencyLabel()}</span></div>
                    </div>
                    <button onclick="openSavingsBuckets()" class="w-full py-2 mt-2 bg-white text-slate-900 hover:bg-indigo-50 rounded-lg text-[10px] font-black uppercase transition text-center">Manage</button>
                </div>
                <div class="premium-card p-4 bg-slate-800 text-white border-slate-700 shadow-md flex flex-col justify-between min-h-0 relative overflow-hidden group rounded-xl">
                    <div class="absolute top-0 right-0 p-2 opacity-10 pointer-events-none">
                        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>
                    </div>
                    <div class="flex-shrink-0">
                        <span class="text-[10px] font-bold uppercase tracking-widest text-slate-400">Transportation</span>
                        <div class="text-2xl font-black mt-0.5 major-fund-amount"><span data-major-fund="transportation">${formatMoney(carBal)}</span> <span class="text-xs text-slate-500">${getCurrencyLabel()}</span></div>
                    </div>
                    <button onclick="openTransportationBuckets()" class="w-full py-2 mt-2 bg-white text-slate-800 hover:bg-slate-100 rounded-lg text-[10px] font-black uppercase transition text-center">Manage</button>
                </div>
                <div class="premium-card p-4 bg-amber-500 text-white border-amber-400 shadow-md flex flex-col justify-between min-h-0 relative overflow-hidden group rounded-xl">
                    <div class="absolute top-0 right-0 p-2 opacity-10 pointer-events-none">
                        <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8V4H8"/><path d="M4 8h16"/><path d="M6 12h12"/><path d="M8 16h8"/><path d="M10 20h4"/></svg>
                    </div>
                    <div class="flex-shrink-0">
                        <span class="text-[10px] font-bold uppercase tracking-widest text-amber-100">Payables</span>
                        <div class="text-2xl font-black mt-0.5 major-fund-amount"><span data-major-fund="payables">${formatMoney(payBal)}</span> <span class="text-xs text-amber-100">${getCurrencyLabel()}</span></div>
                    </div>
                    <button onclick="openPayablesBuckets()" class="w-full py-2 mt-2 bg-white text-amber-900 hover:bg-amber-50 rounded-lg text-[10px] font-black uppercase transition text-center">Manage</button>
                </div>
            </div>
        </div>
    `;
    container.innerHTML += majorHtml;

    // Category view options (above creatable categories, below Savings / Transportation / Payables)
    var optionsBarHtml = `
        <div id="ledger-options-bar" class="flex flex-wrap items-center justify-between gap-3 py-3 px-1 mb-2">
            <div class="flex items-center gap-2">
                <span class="text-[12px] font-black text-slate-900 uppercase tracking-[0.2em]">Mini-Budgets</span>
                <button type="button" onclick="openAddItemTool(null, { showCategoryPicker: true })" class="bg-slate-900 text-white w-7 h-7 flex items-center justify-center rounded-lg text-lg leading-none pb-0.5 hover:bg-slate-700" title="Add item">+</button>
            </div>
            <div class="flex flex-wrap items-center gap-3">
                <label class="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" id="ledger-hide-empty" class="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" onchange="setLedgerViewOptions()">
                    <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Hide empty</span>
                </label>
                <div class="flex items-center gap-2">
                    <span class="text-[10px] font-bold uppercase tracking-wider text-slate-500">Sort:</span>
                    <select id="ledger-sort" class="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-bold text-slate-800 bg-white outline-none focus:ring-2 focus:ring-indigo-200" onchange="setLedgerViewOptions()">
                        <option value="default">Default</option>
                        <option value="balanceDesc">Highest first</option>
                        <option value="balanceAsc">Lowest first</option>
                        <option value="nameAsc">A–Z</option>
                        <option value="nameDesc">Z–A</option>
                    </select>
                </div>
            </div>
        </div>
    `;
    container.innerHTML += optionsBarHtml;

    // Create categorical dropdowns matching the strategy structure
    var majorLabels = typeof MAJOR_FUND_LABELS !== 'undefined' ? MAJOR_FUND_LABELS : ['Weekly Allowance', 'Daily Food', 'Savings', 'Transportation', 'Payables'];
    var skipLabels = majorLabels.slice();
    var hideEmpty = !!state.settings?.hideEmptyCategories;
    var sortBy = state.settings?.categorySort || 'default';

    state.categories.forEach(sec => {
        const relevantItems = sec.items.filter(item => !skipLabels.includes(item.label));

        let items = relevantItems.slice();
        if (hideEmpty) {
            items = items.filter(item => getItemBalance(item.label, 0) !== 0);
        }
        if (sortBy !== 'default') {
            items = items.slice().sort(function (a, b) {
                var balA = getItemBalance(a.label, 0);
                var balB = getItemBalance(b.label, 0);
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
        const plannedTotalForLedger = (item) => {
            if (item && item.amortData && typeof item.amortData.total === 'number') return Number(item.amortData.total) || 0;
            return typeof item.amount === 'number' ? item.amount : 0;
        };
        items.forEach(item => {
            sumLeft += getItemBalance(item.label, 0);
            sumAllocated += plannedTotalForLedger(item);
        });

        let barsHtml = '';
        items.forEach(item => {
            let bal = getItemBalance(item.label, 0);
            const goalTotal = plannedTotalForLedger(item);
            const plannedDenom = goalTotal > 0 ? goalTotal : (typeof item.amount === 'number' && item.amount > 0 ? item.amount : 1);
            const pct = Math.min(100, Math.max(0, (bal / plannedDenom) * 100));
            const safeLabel = escapeAttr(item.label);
            const safeLabelAttr = escapeAttr(item.label);
            const safeLabelText = escapeHtml(item.label);
            const splitLocked = !!(item.amortData && goalTotal > 0 && bal < goalTotal - 0.005);
            const splitBadge = item.amortData
                ? (splitLocked
                    ? '<span class="ml-1 text-[8px] font-black uppercase text-amber-800 bg-amber-100 px-1 py-0.5 rounded">Locked</span>'
                    : '<span class="ml-1 text-[8px] font-black uppercase text-emerald-800 bg-emerald-100 px-1 py-0.5 rounded">Unlocked</span>')
                : '';

            let actionBtn = '';
            if (sec.isSingleAction && bal !== 0 && !splitLocked) {
                actionBtn = `<button type="button" onclick="event.stopPropagation(); completeTask('${safeLabel}')" class="ledger-bar-complete flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center text-sm font-bold hover:bg-emerald-600 transition shadow-sm" title="Mark used">✓</button>`;
            }

            const unlockBtn = splitLocked && bal > 0
                ? `<button type="button" onclick="event.stopPropagation(); releaseSplitGoalFunds('${safeLabel}')" class="flex-shrink-0 px-2 py-1 rounded-lg bg-amber-100 text-amber-900 text-[9px] font-black uppercase tracking-wide hover:bg-amber-200" title="Move balance to Extra">Unlock early</button>`
                : '';

            const amountSub = item.amortData && goalTotal > 0
                ? `<p class="text-[9px] font-bold text-slate-500">${formatMoney(bal)} / ${formatMoney(goalTotal)}</p>`
                : `<p class="text-[9px] font-bold text-slate-400 uppercase hidden sm:block">${getCurrencyLabel()} left</p>`;

            barsHtml += `
                <div class="ledger-bar flex items-center gap-2 sm:gap-3 w-full py-2.5 px-3 sm:px-4 rounded-xl border border-slate-100 bg-white hover:border-slate-200 hover:shadow-sm transition-all group ${bal === 0 ? 'opacity-70' : ''}">
                    <div class="flex-1 min-w-0 flex flex-col gap-0.5">
                        <span class="text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate" title="${safeLabelAttr}">${safeLabelText}${splitBadge}</span>
                        <div class="h-1.5 w-full max-w-[100px] rounded-full bg-slate-100 overflow-hidden">
                            <div class="ledger-bar-fill h-full rounded-full transition-all duration-300" style="width:${pct}%"></div>
                        </div>
                    </div>
                    <div class="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 text-right">
                        <p class="text-base sm:text-lg font-black text-slate-800 leading-tight">${formatMoney(bal)}</p>
                        ${amountSub}
                    </div>
                    <div class="ledger-bar-actions flex items-center gap-1.5 flex-shrink-0" onclick="event.stopPropagation()">
                        <input type="number" class="ledger-bar-amount w-14 sm:w-16 h-8 rounded-lg border border-slate-200 px-2 text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-200" placeholder="0" min="0" step="any" autocomplete="off">
                        <div class="flex flex-col gap-0 rounded-lg border border-slate-200 overflow-hidden bg-slate-50/80">
                            <button type="button" onclick="var b=this.closest('.ledger-bar'); var v=b.querySelector('.ledger-bar-amount').value; applyItemAdjustment('${safeLabel}', v, 'add'); b.querySelector('.ledger-bar-amount').value='';" class="w-7 h-6 flex items-center justify-center text-slate-600 text-sm font-medium hover:bg-slate-200/80 transition leading-none">+</button>
                            <button type="button" onclick="var b=this.closest('.ledger-bar'); var v=b.querySelector('.ledger-bar-amount').value; applyItemAdjustment('${safeLabel}', v, 'deduct'); b.querySelector('.ledger-bar-amount').value='';" class="w-7 h-6 flex items-center justify-center text-slate-600 text-sm font-medium hover:bg-slate-200/80 transition leading-none border-t border-slate-200">−</button>
                        </div>
                        <button type="button" onclick="var b=this.closest('.ledger-bar'); var v=b&&b.querySelector('.ledger-bar-amount')?b.querySelector('.ledger-bar-amount').value:''; openTool('${safeLabel}', undefined, false, v);" class="h-8 w-8 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center text-sm font-bold transition" title="Transfer">⋯</button>
                        ${unlockBtn}
                        ${actionBtn}
                    </div>
                </div>
            `;
        });

        // Section HTML with Toggle + category total (left / allocated)
        var expandedMap = getLedgerExpandedSections();
        var isExpanded = !!expandedMap[secId];
        var safeSectionLabel = escapeHtml(sec.label);
        const sectionHtml = `
            <div class="mb-4">
                <button onclick="toggleLedgerSection('${secId}')" class="flex justify-between items-center w-full py-2.5 px-1 hover:bg-slate-50 rounded-lg transition group">
                    <span class="text-[11px] font-black text-slate-800 uppercase tracking-widest">${safeSectionLabel}</span>
                    <span class="flex items-center gap-2">
                        <span class="text-[10px] font-bold text-slate-500">${formatMoney(sumLeft)} / ${formatMoney(sumAllocated)} <span class="text-slate-400">${getCurrencyLabel()}</span></span>
                        <svg id="icon-${secId}" class="w-4 h-4 text-slate-400 transform ${isExpanded ? '' : '-rotate-90'} transition-transform group-hover:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                    </span>
                </button>
                <div id="${secId}" class="space-y-1.5 mt-1 transition-all ${isExpanded ? '' : 'hidden'}">
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

function getLedgerExpandedSections() {
    // In-memory expanded state so re-renders don't auto-collapse sections after +/− adjustments.
    // Stored on window so it's shared across modules and survives renderLedger re-entry.
    if (typeof window === 'undefined') return {};
    if (!window.__ledgerExpandedSections || typeof window.__ledgerExpandedSections !== 'object') {
        window.__ledgerExpandedSections = {};
    }
    return window.__ledgerExpandedSections;
}

function toggleLedgerSection(id) {
    const el = document.getElementById(id);
    const icon = document.getElementById('icon-' + id);
    if (el.classList.contains('hidden')) {
        el.classList.remove('hidden');
        icon.classList.remove('-rotate-90');
        try { getLedgerExpandedSections()[id] = true; } catch (e) {}
    } else {
        el.classList.add('hidden');
        icon.classList.add('-rotate-90');
        try { delete getLedgerExpandedSections()[id]; } catch (e) {}
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
 * Returns { cycleStart, dates (28 core days), overflowDates, monthNames }.
 *
 * overflowDates: every calendar day from the day *after* the 28th core day until (but not including)
 * the next pay day. That gap exists because a real month does not line up with exactly 28 budget
 * slots—these are not “the 29th–31st of the month” as a rule; they are whatever dates fall between
 * the end of the 28-day block and the next payday (e.g. mid-month days depending on pay settings).
 */
function getPayCycleInfo() {
    var payDate = typeof state.settings?.payDate === 'number' ? Math.max(1, Math.min(28, state.settings.payDate)) : 28;
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
    var nextCycleMonth = cycleStartMonth + 1;
    var nextCycleYear = cycleStartYear;
    if (nextCycleMonth > 11) {
        nextCycleMonth = 0;
        nextCycleYear += 1;
    }
    var nextCycleStartDay = Math.min(payDate, lastDayOfMonth(nextCycleYear, nextCycleMonth));
    var nextCycleStart = new Date(nextCycleYear, nextCycleMonth, nextCycleStartDay);
    var overflowDates = [];
    var dayAfterCore = new Date(cycleStartYear, cycleStartMonth, cycleStartDay + 28);
    for (var od = new Date(dayAfterCore); od < nextCycleStart; od = new Date(od.getFullYear(), od.getMonth(), od.getDate() + 1)) {
        overflowDates.push({
            key: od.getFullYear() + '-' + (od.getMonth() + 1) + '-' + od.getDate(),
            date: od.getDate(),
            monthName: monthNames[od.getMonth()],
            dayOfWeek: od.getDay(),
            year: od.getFullYear(),
            month: od.getMonth()
        });
    }
    return { cycleStart: cycleStart, dates: dates, overflowDates: overflowDates, monthNames: monthNames };
}

function getOverflowFundingSources() {
    var options = [{ id: 'surplus', label: 'Extra' }, { id: 'savings', label: 'Savings' }, { id: 'weekly', label: 'Weekly Allowance' }];
    var buckets = state.accounts && state.accounts.buckets ? Object.keys(state.accounts.buckets) : [];
    buckets.forEach(function(label) {
        if (label === 'Savings') return;
        var bal = typeof getItemBalance === 'function' ? getItemBalance(label, 0) : 0;
        if (bal > 0) options.push({ id: label, label: label });
    });
    return options;
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
    if (typeof ensureFoodConsumedDays === 'function') ensureFoodConsumedDays();
    var payCycle = getPayCycleInfo();
    if (typeof maybeAutoAdvanceFoodCycle === 'function') {
        var didAutoAdvance = maybeAutoAdvanceFoodCycle(payCycle);
        if (didAutoAdvance) {
            if (typeof ensureFoodConsumedDays === 'function') ensureFoodConsumedDays();
        }
    }
    if (typeof ensureFoodFundingState === 'function') ensureFoodFundingState();
    var daily = typeof getDailyFoodEffectiveDisplayRate === 'function' ? getDailyFoodEffectiveDisplayRate() : 0;
    var fundedBalEl = document.getElementById('daily-food-funded-balance');
    var fundedWrap = document.getElementById('daily-food-funded-wrap');
    if (fundedBalEl && typeof getFoodRemainderInfo === 'function' && typeof getItemBalance === 'function') {
        var fr = getFoodRemainderInfo();
        var totalBal = getItemBalance('Daily Food', 0);
        fundedBalEl.textContent = formatMoney(typeof totalBal === 'number' && !Number.isNaN(totalBal) ? totalBal : 0);
        var rem = fr && typeof fr.remainder === 'number' ? fr.remainder : 0;
        var target = fr && typeof fr.theoreticalRemainder === 'number' ? fr.theoreticalRemainder : 0;
        var eps = 0.05;
        var tone = 'grey';
        if (rem <= eps && target <= eps) {
            tone = 'grey';
        } else if (rem + eps < target && target > eps) {
            tone = 'red';
        } else if (rem + eps >= target) {
            tone = 'green';
        } else {
            tone = 'grey';
        }
        fundedBalEl.classList.remove('text-emerald-600', 'text-red-600', 'text-slate-400');
        if (tone === 'green') fundedBalEl.classList.add('text-emerald-600');
        else if (tone === 'red') fundedBalEl.classList.add('text-red-600');
        else fundedBalEl.classList.add('text-slate-400');
        var curEl = document.getElementById('daily-food-funded-currency');
        if (curEl) {
            curEl.classList.remove('text-emerald-600', 'text-red-600', 'text-slate-400');
            if (tone === 'green') curEl.classList.add('text-emerald-600');
            else if (tone === 'red') curEl.classList.add('text-red-600');
            else curEl.classList.add('text-slate-400');
        }
        if (fundedWrap) {
            var statusWord = tone === 'green' ? 'On track' : (tone === 'red' ? 'Below plan' : '—');
            fundedWrap.setAttribute('title', statusWord + ' · ' + formatMoney(totalBal) + ' ' + (typeof getCurrencyLabel === 'function' ? getCurrencyLabel() : ''));
            fundedWrap.setAttribute('aria-label', 'Daily Food balance ' + formatMoney(totalBal) + ', ' + statusWord);
        }
    }
    var consumedDays = state.food.consumedDays || [];
    var daysUsed = consumedDays.length;
    var daysTotal = state.food.daysTotal || 28;
    var effectiveDaysTotal = daysTotal;
    var daysLeftEffective = Math.max(0, effectiveDaysTotal - daysUsed);
    var lockedAmount = state.food.lockedAmount || 0;
    var currentDayInCycle = daysUsed + 1;

    document.getElementById('daily-food-rate').innerText = formatMoney(daily);
    var lockedDisplayEl = document.getElementById('locked-funds-display');
    if (lockedDisplayEl) lockedDisplayEl.innerText = formatMoney(lockedAmount);
    document.getElementById('food-days-count').innerText = daysLeftEffective + ' Days Left';
    var macroUsed = document.getElementById('food-macro-used');
    if (macroUsed) macroUsed.textContent = daysUsed + ' of ' + effectiveDaysTotal + ' used';
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
    if (progressBar) {
        var denom = effectiveDaysTotal > 0 ? effectiveDaysTotal : 28;
        progressBar.style.width = (Math.min(1, daysUsed / denom) * 100) + '%';
    }

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
        closeOverflowDayPopover();
        closeFoodDayActionPopover();
        rowsContainer.innerHTML = '';
        var dates = payCycle.dates;
        var todaySlot = dates.findIndex(function(p) { return p.date === todayDate && p.month === todayMonth && p.year === todayYear; });
        var currentWeekRowIndex = todaySlot >= 0 ? Math.floor(todaySlot / 7) : -1;
        // 28-day core: pay day = first slot, no empty cells; each row = 7 consecutive days (pay day + 0..6, etc.)
        var coreWrapper = document.createElement('div');
        coreWrapper.className = 'food-calendar-core';
        var coreHtml = '';
        for (var r = 0; r < 4; r++) {
            var weekNum = r + 1;
            var weekLabel = 'Week ' + weekNum;
            var rowClass = 'food-week-row flex gap-2 items-stretch rounded-lg';
            if (r === currentWeekRowIndex) rowClass += ' food-row-current';
            var rowHtml = '<div class="' + rowClass + '"><div class="w-12 flex-shrink-0 flex items-center text-[10px] font-black uppercase tracking-wider text-slate-400">' + weekLabel + '</div><div class="grid grid-cols-7 gap-1 flex-1">';
            for (var col = 0; col < 7; col++) {
                var slot = r * 7 + col;
                var p = dates[slot];
                var cycleDay = slot + 1;
                var consumed = consumedDays.indexOf(cycleDay) !== -1;
                var isToday = p.date === todayDate && p.month === todayMonth && p.year === todayYear;
                var hasFunding = (typeof getFoodFundedForDay === 'function') ? (getFoodFundedForDay(cycleDay) > 0.001) : true;
                var isLocked = !consumed && !hasFunding && cycleDay <= 28;
                var futureInCycle = !consumed && cycleDay <= 28 && !isLocked;
                var cls = 'food-overview-cell rounded-md flex items-center justify-center text-[10px] font-black min-h-[2rem] transition cursor-pointer ';
                if (consumed) cls += 'bg-slate-200 text-slate-500 hover:bg-slate-300';
                else if (isLocked) cls += 'bg-slate-50 text-slate-400 border border-dashed border-slate-300 hover:bg-slate-100';
                else if (isToday) cls += 'bg-indigo-500 text-white shadow-md hover:bg-indigo-600 food-cell-today';
                else if (futureInCycle) cls += 'bg-slate-100 text-slate-400 border border-slate-200 hover:bg-slate-200';
                else cls += 'bg-white text-slate-400 border border-slate-200';
                if (isToday && consumed) cls += ' food-cell-today';
                var label = consumed ? '✓' : (isLocked ? '🔒' : p.date);
                var cellTitle = isLocked
                    ? ('No funds allocated yet · ' + p.monthName + ' ' + p.date)
                    : ('Click for actions · ' + p.monthName + ' ' + p.date);
                var cellContent = '<div class="' + cls + '" data-cycle-day="' + cycleDay + '" data-date="' + p.date + '" title="' + cellTitle + '" role="button" tabindex="0">' + label + '</div>';
                var hoverActions = '';
                if (consumed) {
                    var tickTitleU = 'Unmark';
                    hoverActions = '<div class="food-day-hover-actions absolute inset-0 flex rounded-md overflow-hidden opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto">' +
                        '<span class="pointer-events-auto flex-1 flex items-center justify-center min-w-0 food-day-consume-panel" title="' + tickTitleU + '" onclick="event.stopPropagation(); setFoodDayFromCalendar(' + cycleDay + ', \'unmark\')" role="button" aria-label="' + tickTitleU + '">' +
                        '<span class="text-white text-[10px] font-black">✓</span></span>';
                    hoverActions += '<span class="pointer-events-auto flex-1 flex items-center justify-center min-w-0 food-day-transfer-panel" title="Transfer into day..." onclick="event.stopPropagation(); openFoodDayTransferPopover(' + cycleDay + ', this, true)" role="button" aria-label="Transfer into day...">' +
                        '<span class="text-white text-[10px] font-black">↗</span></span>';
                    hoverActions += '</div>';
                } else if (hasFunding) {
                    var tickTitle = 'Mark consumed';
                    var transferTitle = 'Transfer day to...';
                    hoverActions = '<div class="food-day-hover-actions absolute inset-0 flex rounded-md overflow-hidden opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto">' +
                        '<span class="pointer-events-auto flex-1 flex items-center justify-center min-w-0 food-day-consume-panel" title="' + tickTitle + '" onclick="event.stopPropagation(); setFoodDayFromCalendar(' + cycleDay + ', \'mark\')" role="button" aria-label="' + tickTitle + '">' +
                        '<span class="text-white text-[10px] font-black">✓</span></span>';
                    hoverActions += '<span class="pointer-events-auto flex-1 flex items-center justify-center min-w-0 food-day-transfer-panel" title="' + transferTitle + '" onclick="event.stopPropagation(); openFoodDayTransferPopover(' + cycleDay + ', this, false)" role="button" aria-label="' + transferTitle + '">' +
                        '<span class="text-white text-[10px] font-black">↗</span></span>';
                    hoverActions += '</div>';
                }
                var wrapperClass = 'food-overview-cell-wrapper group relative overflow-hidden';
                if (isToday) wrapperClass += ' food-cell-today-wrapper';
                var dataAttrs = ' data-cycle-day="' + cycleDay + '" data-consumed="' + (consumed ? '1' : '0') + '" data-locked="' + (isLocked ? '1' : '0') + '"';
                rowHtml += '<div class="' + wrapperClass + '"' + dataAttrs + '>' + cellContent + hoverActions + '</div>';
            }
            rowHtml += '</div></div>';
            coreHtml += rowHtml;
        }
        coreWrapper.innerHTML = coreHtml;
        rowsContainer.appendChild(coreWrapper);

        var overflowDates = payCycle.overflowDates || [];
        if (overflowDates.length > 0) {
            var overflowUsage = (state.food && state.food.overflowUsage) ? state.food.overflowUsage : {};
            var overflowConsumedMap = (state.food && state.food.overflowConsumedAmounts) ? state.food.overflowConsumedAmounts : {};
            var fundedOverflowCount = overflowDates.reduce(function (sum, ex) {
                var isFunded = !!(overflowUsage[ex.key]) || (Number(overflowConsumedMap[ex.key]) > 0.001);
                return sum + (isFunded ? 1 : 0);
            }, 0);
            var overflowFundingRatio = overflowDates.length ? (fundedOverflowCount / overflowDates.length) : 0;
            var allOverflowResolved = overflowDates.every(function (ex) {
                return !!(overflowUsage[ex.key]) || (Number(overflowConsumedMap[ex.key]) > 0.001);
            });
            var rowExtraClass = 'food-week-row food-overflow-row flex gap-2 items-stretch rounded-xl border transition';
            if (fundedOverflowCount > 0) rowExtraClass += ' food-overflow-row-funded';
            if (allOverflowResolved) rowExtraClass += ' food-overflow-row-complete';
            var labelExtraClass = 'w-12 flex-shrink-0 flex items-center text-[10px] font-black uppercase tracking-wider food-overflow-label';
            var rowTint = (0.14 + (overflowFundingRatio * 0.32)).toFixed(3);
            var rowBorder = (0.18 + (overflowFundingRatio * 0.44)).toFixed(3);
            var labelTint = (0.72 + (overflowFundingRatio * 0.24)).toFixed(3);
            var extraHtml = '<div class="' + rowExtraClass + '" style="--food-overflow-row-tint:' + rowTint + '; --food-overflow-row-border:' + rowBorder + '; --food-overflow-label-tint:' + labelTint + ';">' +
                '<div class="' + labelExtraClass + '" title="Calendar days after your 28-day plan until your next pay day">Extra</div>' +
                '<div class="grid grid-cols-7 gap-1 flex-1">';
            for (var ec = 0; ec < 7; ec++) {
                if (ec < overflowDates.length) {
                    var ex = overflowDates[ec];
                    var ovConsumed = Number(overflowConsumedMap[ex.key]) > 0.001;
                    var usageMode = overflowUsage[ex.key] || '';
                    var funded = ovConsumed || usageMode === 'source' || usageMode === 'redistributed';
                    var cellTone = funded
                        ? ' food-overflow-cell-funded bg-emerald-500 text-white border border-emerald-600 shadow-sm'
                        : ' food-overflow-cell-unfunded bg-rose-50 text-rose-800 border border-rose-200';
                    var badge = '';
                    if (!ovConsumed && usageMode) {
                        badge = '<span class="absolute top-0.5 right-1 text-[7px] font-black uppercase tracking-wide ' + (funded ? 'text-emerald-100' : 'text-rose-700') + '">' + (usageMode === 'redistributed' ? 'R' : 'S') + '</span>';
                    }
                    extraHtml += '<div class="food-overview-cell-wrapper group relative overflow-hidden" data-overflow-day="true" data-overflow-key="' + ex.key + '">' +
                        '<div class="food-overview-cell food-overflow-cell rounded-md flex items-center justify-center text-[9px] font-black min-h-[2rem] cursor-pointer transition' + cellTone + '" role="button" title="Pay-cycle overflow: ' + ex.monthName + ' ' + ex.date + '">' +
                        (ovConsumed ? '✓' : ex.date) + badge + '</div></div>';
                } else {
                    extraHtml += '<div class="food-overview-cell rounded-md min-h-[2rem] bg-transparent"></div>';
                }
            }
            extraHtml += '</div></div>';
            var extraWrap = document.createElement('div');
            extraWrap.innerHTML = extraHtml;
            rowsContainer.appendChild(extraWrap.firstChild);
        }

        if (!rowsContainer._foodDayActionWired) {
            rowsContainer._foodDayActionWired = true;
            rowsContainer.addEventListener('click', function(e) {
                var wrapper = e.target.closest('.food-overview-cell-wrapper');
                if (!wrapper) return;
                if (wrapper.getAttribute('data-overflow-day') === 'true') {
                    e.preventDefault();
                    e.stopPropagation();
                    openOverflowDayPopover(wrapper.getAttribute('data-overflow-key'), wrapper);
                    return;
                }
                var cycleDay = wrapper.getAttribute('data-cycle-day');
                if (!cycleDay) return;
                var consumed = wrapper.getAttribute('data-consumed') === '1';
                var locked = wrapper.getAttribute('data-locked') === '1';
                if (locked) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (typeof showFoodDayLockedNotice === 'function') showFoodDayLockedNotice();
                    return;
                }
                if (isTouchOrSmall()) {
                    e.preventDefault();
                    e.stopPropagation();
                    openFoodDayMobileModal(parseInt(cycleDay, 10), consumed);
                }
            }, true);
            document.addEventListener('click', function(e) {
                if (e.target.closest('#food-day-action-popover') || e.target.closest('#food-overflow-popover') || e.target.closest('#food-overflow-mobile-modal')) return;
                closeFoodDayActionPopover();
                closeOverflowDayPopover();
            });
        }
    }

    var markBtn = document.getElementById('food-mark-day-btn');
    if (markBtn) markBtn.disabled = daysUsed >= daysTotal;
}

// --- Pay-cycle rollover notice (anchored popover; dismiss clears pendingUnusedTransferNotice) ---
function _positionFoodRolloverNoticePopover() {
    var pop = document.getElementById('food-rollover-notice-popover');
    var anchor = document.getElementById('food-unused-transfer-btn');
    if (!pop || pop.classList.contains('hidden') || !anchor || !anchor.getBoundingClientRect) return;
    var rect = anchor.getBoundingClientRect();
    var vw = typeof window.innerWidth === 'number' ? window.innerWidth : 400;
    var w = pop.offsetWidth || 280;
    var left = rect.right - w;
    if (left < 8) left = 8;
    if (left + w + 8 > vw) left = Math.max(8, vw - w - 8);
    pop.style.left = left + 'px';
    pop.style.top = (rect.bottom + 6) + 'px';
}

function openFoodRolloverNoticePopover(evt) {
    var notice = state.food && state.food.pendingUnusedTransferNotice;
    if (!notice || !notice.amount || notice.amount <= 0) return;
    var pop = document.getElementById('food-rollover-notice-popover');
    var body = document.getElementById('food-rollover-notice-body');
    if (!pop || !body) return;
    var days = Math.max(0, Math.floor(notice.days || 0));
    var cur = typeof getCurrencyLabel === 'function' ? getCurrencyLabel() : '';
    body.textContent = formatMoney(notice.amount) + ' ' + cur + ' from ' + days + ' unused Daily Food day' + (days === 1 ? '' : 's') + ' was moved to Extra when your pay cycle rolled over. Nothing is funded automatically except through Paycheck Distribute.';
    pop.classList.remove('hidden');
    requestAnimationFrame(function () {
        requestAnimationFrame(function () {
            _positionFoodRolloverNoticePopover();
        });
    });
    var dismiss = document.getElementById('food-rollover-notice-dismiss');
    if (dismiss) {
        dismiss.onclick = function () {
            dismissFoodRolloverNoticeAndSave();
        };
    }
    _attachFoodRolloverOutsideClose();
    if (evt && typeof evt.stopPropagation === 'function') evt.stopPropagation();
}
window.openFoodRolloverNoticePopover = openFoodRolloverNoticePopover;

function dismissFoodRolloverNoticeAndSave() {
    var pop = document.getElementById('food-rollover-notice-popover');
    if (pop) pop.classList.add('hidden');
    if (window._foodRolloverOutsideHandler) {
        document.removeEventListener('click', window._foodRolloverOutsideHandler, true);
        window._foodRolloverOutsideHandler = null;
    }
    if (state.food) delete state.food.pendingUnusedTransferNotice;
    if (typeof saveState === 'function') saveState();
    if (typeof updateGlobalUI === 'function') updateGlobalUI();
}
window.dismissFoodRolloverNoticeAndSave = dismissFoodRolloverNoticeAndSave;

function _attachFoodRolloverOutsideClose() {
    if (window._foodRolloverOutsideHandler) {
        document.removeEventListener('click', window._foodRolloverOutsideHandler, true);
    }
    window._foodRolloverOutsideHandler = function (e) {
        var pop = document.getElementById('food-rollover-notice-popover');
        if (!pop || pop.classList.contains('hidden')) return;
        if (e.target.closest('#food-rollover-notice-popover') || e.target.closest('#food-unused-transfer-btn')) return;
        dismissFoodRolloverNoticeAndSave();
        document.removeEventListener('click', window._foodRolloverOutsideHandler, true);
        window._foodRolloverOutsideHandler = null;
    };
    setTimeout(function () {
        document.addEventListener('click', window._foodRolloverOutsideHandler, true);
    }, 0);
}

var _overflowDayPopoverAnchor = null;
var _overflowPopoverScrollAttached = false;

function _detachOverflowPopoverScrollListeners() {
    if (!_overflowPopoverScrollAttached) return;
    var handler = window._overflowPopoverPositionHandler;
    if (typeof handler === 'function') {
        window.removeEventListener('scroll', handler, true);
        window.removeEventListener('resize', handler);
    }
    _overflowPopoverScrollAttached = false;
}

function _positionOverflowDayPopover() {
    var pop = document.getElementById('food-overflow-popover');
    var anchorEl = _overflowDayPopoverAnchor;
    if (!pop || pop.classList.contains('hidden')) return;
    if (!anchorEl || !document.body.contains(anchorEl)) {
        closeOverflowDayPopover();
        return;
    }
    var rect = anchorEl.getBoundingClientRect();
    var vw = typeof window.innerWidth === 'number' ? window.innerWidth : 400;
    var pad = 8;
    var w = pop.offsetWidth || 220;
    var left = rect.left;
    if (left + w + pad > vw) left = Math.max(pad, vw - w - pad);
    if (left < pad) left = pad;
    pop.style.left = left + 'px';
    pop.style.top = (rect.bottom + 4) + 'px';
}

/** Shared wiring for desktop overflow popover and touch bottom-sheet modal. */
function _bindOverflowDayPanel(dayKey, ui) {
    if (!dayKey || !ui || !ui.rootEl) return;
    ui.rootEl.setAttribute('data-overflow-key', dayKey);
    var usage = (state.food && state.food.overflowUsage && state.food.overflowUsage[dayKey]) || '';
    var consumedAmt = Number((state.food && state.food.overflowConsumedAmounts && state.food.overflowConsumedAmounts[dayKey]) || 0) || 0;
    var consumedMeta = (state.food && state.food.overflowConsumedMeta && state.food.overflowConsumedMeta[dayKey]) ? state.food.overflowConsumedMeta[dayKey] : null;
    var isConsumed = consumedAmt > 0.001;
    var isTransferred = !!(consumedMeta && consumedMeta.resolution === 'transferred');

    if (ui.sourceWrap) ui.sourceWrap.classList.toggle('hidden', !!usage || isConsumed);
    if (ui.sourceBtn) ui.sourceBtn.classList.toggle('hidden', !!usage || isConsumed);
    if (ui.redistributeBtn) ui.redistributeBtn.classList.toggle('hidden', !!usage || isConsumed);
    if (ui.undoBtn) {
        ui.undoBtn.classList.toggle('hidden', !usage || isConsumed);
        ui.undoBtn.textContent = 'De-distribute';
        ui.undoBtn.onclick = function () {
            var key = ui.rootEl.getAttribute('data-overflow-key');
            if (!key) return;
            if (usage === 'source') {
                if (typeof applyOverflowDaySourceUndo === 'function') applyOverflowDaySourceUndo(key);
            } else if (usage === 'redistributed') {
                if (typeof applyOverflowRedistributionUndo === 'function') applyOverflowRedistributionUndo(key);
            } else {
                return;
            }
            if (typeof ui.close === 'function') ui.close();
            if (typeof updateFoodUI === 'function') updateFoodUI();
        };
    }
    var sourceSel = ui.sourceSel;
    if (sourceSel) {
        var currentVal = sourceSel.value;
        var options = getOverflowFundingSources();
        sourceSel.innerHTML = options.map(function(opt) {
            return '<option value="' + String(opt.id).replace(/"/g, '&quot;') + '">' + String(opt.label).replace(/</g, '&lt;') + '</option>';
        }).join('');
        if (currentVal && options.some(function(opt) { return opt.id === currentVal; })) sourceSel.value = currentVal;
    }
    if (ui.subtitleEl) {
        if (isTransferred) ui.subtitleEl.textContent = 'This overflow day was transferred to another fund and is already resolved.';
        else if (isConsumed) ui.subtitleEl.textContent = 'Marked consumed. Unmark to restore the previous overflow funding method for this day.';
        else if (usage === 'source') ui.subtitleEl.textContent = 'Funded from your chosen source. De-distribute to undo it, or mark consumed / transfer when you use this extra day.';
        else if (usage === 'redistributed') ui.subtitleEl.textContent = 'Daily Food is split across more calendar days. De-distribute to revert, or mark consumed / transfer.';
        else ui.subtitleEl.textContent = 'Days between the end of your 28-day plan and your next pay day. Choose how to account for this day.';
    }
    if (ui.consumeBtn) {
        ui.consumeBtn.disabled = isTransferred || (!isConsumed && !usage);
        ui.consumeBtn.textContent = isConsumed ? 'Unmark consumed' : 'Mark consumed';
        ui.consumeBtn.classList.toggle('opacity-40', ui.consumeBtn.disabled);
        ui.consumeBtn.classList.toggle('cursor-not-allowed', ui.consumeBtn.disabled);
        ui.consumeBtn.onclick = function() {
            if (ui.consumeBtn.disabled) return;
            var key = ui.rootEl.getAttribute('data-overflow-key');
            if (!key) return;
            if (typeof setOverflowFoodDayConsumed === 'function') setOverflowFoodDayConsumed(key, isConsumed ? 'unmark' : 'mark');
            if (typeof ui.close === 'function') ui.close();
            if (typeof updateFoodUI === 'function') updateFoodUI();
        };
    }
    if (ui.transferBtn) {
        var canTransfer = !!usage && !isConsumed;
        ui.transferBtn.disabled = !canTransfer;
        ui.transferBtn.classList.toggle('opacity-40', !canTransfer);
        ui.transferBtn.classList.toggle('cursor-not-allowed', !canTransfer);
        ui.transferBtn.onclick = function() {
            if (ui.transferBtn.disabled) return;
            var key = ui.rootEl.getAttribute('data-overflow-key');
            if (!key) return;
            var anchor = _overflowDayPopoverAnchor || ui.anchorEl;
            var anchorRect = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : null;
            if (typeof closeOverflowDayPopover === 'function') closeOverflowDayPopover();
            else if (typeof ui.close === 'function') ui.close();
            if (typeof openFoodOverflowTransferPopover === 'function') openFoodOverflowTransferPopover(key, anchorRect);
        };
    }
    if (ui.sourceBtn) {
        ui.sourceBtn.onclick = function() {
            var key = ui.rootEl.getAttribute('data-overflow-key');
            if (!key) return;
            if (typeof applyOverflowDayFromSource === 'function') applyOverflowDayFromSource(key, (sourceSel && sourceSel.value) || 'surplus');
            if (typeof ui.close === 'function') ui.close();
            if (typeof updateFoodUI === 'function') updateFoodUI();
        };
    }
    if (ui.redistributeBtn) {
        ui.redistributeBtn.onclick = function() {
            var key = ui.rootEl.getAttribute('data-overflow-key');
            if (!key) return;
            if (typeof applyOverflowDayRedistribution === 'function') applyOverflowDayRedistribution(key);
            if (typeof ui.close === 'function') ui.close();
            if (typeof updateFoodUI === 'function') updateFoodUI();
        };
    }
    if (ui.closeBtn) {
        ui.closeBtn.onclick = function() {
            if (typeof ui.close === 'function') ui.close();
        };
    }
}

function openOverflowDayMobileModal(dayKey) {
    var popDesk = document.getElementById('food-overflow-popover');
    if (popDesk) popDesk.classList.add('hidden');
    _overflowDayPopoverAnchor = null;
    _detachOverflowPopoverScrollListeners();
    var modal = document.getElementById('food-overflow-mobile-modal');
    var sourceSel = document.getElementById('food-overflow-mobile-source');
    var sourceBtn = document.getElementById('food-overflow-mobile-source-add-btn');
    var redistributeBtn = document.getElementById('food-overflow-mobile-redistribute-btn');
    var undoBtn = document.getElementById('food-overflow-mobile-undo-btn');
    var doneBtn = document.getElementById('food-overflow-mobile-done-btn');
    var removeSourceBtn = document.getElementById('food-overflow-mobile-remove-source-btn');
    var consumeBtn = document.getElementById('food-overflow-mobile-consume-btn');
    var transferBtn = document.getElementById('food-overflow-mobile-transfer-btn');
    if (!modal || !sourceSel || !sourceBtn || !redistributeBtn || !dayKey) return;
    _bindOverflowDayPanel(dayKey, {
        rootEl: modal,
        sourceSel: sourceSel,
        sourceBtn: sourceBtn,
        redistributeBtn: redistributeBtn,
        undoBtn: undoBtn,
        removeSourceBtn: removeSourceBtn,
        consumeBtn: consumeBtn,
        transferBtn: transferBtn,
        sourceWrap: document.getElementById('food-overflow-mobile-source-wrap'),
        subtitleEl: document.getElementById('food-overflow-mobile-subtitle'),
        closeBtn: doneBtn,
        anchorEl: modal,
        close: closeOverflowDayMobileModal
    });
    if (typeof toggleModal === 'function') toggleModal('food-overflow-mobile-modal', true);
    else modal.classList.remove('hidden');
}
window.openOverflowDayMobileModal = openOverflowDayMobileModal;

function closeOverflowDayMobileModal() {
    var modal = document.getElementById('food-overflow-mobile-modal');
    if (typeof toggleModal === 'function') toggleModal('food-overflow-mobile-modal', false);
    else if (modal) modal.classList.add('hidden');
}
window.closeOverflowDayMobileModal = closeOverflowDayMobileModal;

function openOverflowDayPopover(dayKey, anchorEl) {
    var pop = document.getElementById('food-overflow-popover');
    var sourceSel = document.getElementById('food-overflow-source');
    var sourceBtn = document.getElementById('food-overflow-source-add-btn');
    var redistributeBtn = document.getElementById('food-overflow-redistribute-btn');
    var undoBtn = document.getElementById('food-overflow-undo-btn');
    var doneBtn = document.getElementById('food-overflow-close-btn');
    var removeSourceBtn = document.getElementById('food-overflow-remove-source-btn');
    var consumeBtn = document.getElementById('food-overflow-consume-btn');
    var transferBtn = document.getElementById('food-overflow-transfer-btn');
    if (!dayKey || !sourceSel || !sourceBtn || !redistributeBtn) return;
    closeFoodDayActionPopover();
    if (typeof closeFoodDayMobileModal === 'function') closeFoodDayMobileModal();
    if (isTouchOrSmall()) {
        openOverflowDayMobileModal(dayKey);
        return;
    }
    if (!pop) return;
    _detachOverflowPopoverScrollListeners();
    _overflowDayPopoverAnchor = anchorEl;
    _bindOverflowDayPanel(dayKey, {
        rootEl: pop,
        sourceSel: sourceSel,
        sourceBtn: sourceBtn,
        redistributeBtn: redistributeBtn,
        undoBtn: undoBtn,
        removeSourceBtn: removeSourceBtn,
        consumeBtn: consumeBtn,
        transferBtn: transferBtn,
        sourceWrap: document.getElementById('food-overflow-source-wrap'),
        subtitleEl: document.getElementById('food-overflow-popover-subtitle'),
        closeBtn: doneBtn,
        anchorEl: anchorEl,
        close: closeOverflowDayPopover
    });
    pop.classList.remove('hidden');
    requestAnimationFrame(function () {
        requestAnimationFrame(function () {
            _positionOverflowDayPopover();
        });
    });
    if (!_overflowPopoverScrollAttached) {
        window._overflowPopoverPositionHandler = function () {
            _positionOverflowDayPopover();
        };
        window.addEventListener('scroll', window._overflowPopoverPositionHandler, true);
        window.addEventListener('resize', window._overflowPopoverPositionHandler);
        _overflowPopoverScrollAttached = true;
    }
}
window.openOverflowDayPopover = openOverflowDayPopover;

function closeOverflowDayPopover() {
    var pop = document.getElementById('food-overflow-popover');
    if (pop) pop.classList.add('hidden');
    _overflowDayPopoverAnchor = null;
    _detachOverflowPopoverScrollListeners();
    closeOverflowDayMobileModal();
}
window.closeOverflowDayPopover = closeOverflowDayPopover;

function isTouchOrSmall() {
    return (typeof window !== 'undefined' && window.matchMedia && (window.matchMedia('(max-width: 768px)').matches || window.matchMedia('(pointer: coarse)').matches));
}

function showFoodDayLockedNotice() {
    if (typeof showAppAlert === 'function') {
        showAppAlert('No funds have been allocated for this day yet. Use Paycheck Distribute to fund Daily Food, or Refund Days to restore consumed days.', 'Daily Food');
    }
}
window.showFoodDayLockedNotice = showFoodDayLockedNotice;

function openFoodDayMobileModal(cycleDay, consumed) {
    var modal = document.getElementById('food-day-mobile-modal');
    if (!modal) return;
    if (typeof closeOverflowDayPopover === 'function') closeOverflowDayPopover();
    var overflowRBtn = document.getElementById('food-day-mobile-overflow-redistribute-btn');
    if (overflowRBtn) overflowRBtn.classList.add('hidden');

    var day = Math.max(1, Math.min(28, Math.floor(cycleDay)));
    if (!consumed && typeof getFoodFundedForDay === 'function' && getFoodFundedForDay(day) <= 0.001) {
        showFoodDayLockedNotice();
        return;
    }
    var payCycle = getPayCycleInfo();
    var p = payCycle && payCycle.dates ? payCycle.dates[day - 1] : null;
    var titleEl = document.getElementById('food-day-mobile-title');
    var subtitleEl = document.getElementById('food-day-mobile-subtitle');
    if (titleEl) titleEl.textContent = 'Day ' + day;
    if (subtitleEl) {
        subtitleEl.textContent = p ? (p.monthName + ' ' + p.date + ' · ' + 'Tap an action below') : 'Tap an action below';
    }

    modal.setAttribute('data-cycle-day', String(day));
    modal.setAttribute('data-consumed', consumed ? '1' : '0');

    var consumeBtn = document.getElementById('food-day-mobile-consume-btn');
    if (consumeBtn) {
        consumeBtn.textContent = consumed ? 'Unconsume day' : 'Consume day';
        consumeBtn.className = 'w-full py-3 rounded-2xl text-[12px] font-black uppercase tracking-widest transition ' +
            (consumed ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-emerald-600 text-white hover:bg-emerald-700');
        consumeBtn.onclick = function () {
            var d = parseInt(modal.getAttribute('data-cycle-day'), 10);
            var isConsumed = modal.getAttribute('data-consumed') === '1';
            if (typeof setFoodDayFromCalendar === 'function') setFoodDayFromCalendar(d, isConsumed ? 'unmark' : 'mark');
            closeFoodDayMobileModal();
        };
    }

    var transferTargets = document.getElementById('food-day-mobile-transfer-targets');
    var transferDisabled = document.getElementById('food-day-mobile-transfer-disabled');
    var transferHint = document.getElementById('food-day-mobile-transfer-hint');
    if (transferTargets) {
        transferTargets.innerHTML = '';
        if (consumed) {
            if (transferHint) transferHint.textContent = 'Funds the day from a source';
            if (transferDisabled) transferDisabled.classList.add('hidden');
            transferTargets.classList.remove('opacity-50', 'pointer-events-none');
            var sources = (typeof getDailyFoodBulkSourceOptions === 'function') ? getDailyFoodBulkSourceOptions() : [];
            transferTargets.innerHTML = (sources || []).map(function (s) {
                var safeLabel = String(s.label).replace(/</g, '&lt;').replace(/"/g, '&quot;');
                var sourceValue = String(s.value).replace(/"/g, '&quot;');
                return (
                    '<button type="button" class="w-full text-left px-4 py-3 text-[12px] font-bold text-slate-800 hover:bg-slate-50 active:bg-slate-100 transition truncate" ' +
                    'onclick="fundConsumedFoodDayFromSource(' + day + ', \'' + sourceValue + '\'); closeFoodDayMobileModal();">' +
                    safeLabel +
                    '</button>'
                );
            }).join('');
        } else {
            if (transferHint) transferHint.textContent = 'Moves 1 day from Daily Food';
            if (transferDisabled) transferDisabled.classList.add('hidden');
            transferTargets.classList.remove('opacity-50', 'pointer-events-none');
            var targets = (typeof getFoodDayTransferTargets === 'function') ? getFoodDayTransferTargets() : [];
            transferTargets.innerHTML = (targets || []).map(function (t) {
                var safeLabel = String(t.label).replace(/</g, '&lt;').replace(/"/g, '&quot;');
                var tid = String(t.id).replace(/"/g, '&quot;');
                return (
                    '<button type="button" class="w-full text-left px-4 py-3 text-[12px] font-bold text-slate-800 hover:bg-slate-50 active:bg-slate-100 transition truncate" ' +
                    'onclick="transferFoodDayTo(' + day + ', \'' + tid + '\'); closeFoodDayMobileModal();">' +
                    safeLabel +
                    '</button>'
                );
            }).join('');
        }
    }

    if (typeof toggleModal === 'function') toggleModal('food-day-mobile-modal', true);
    else modal.classList.remove('hidden');
}
window.openFoodDayMobileModal = openFoodDayMobileModal;

function closeFoodDayMobileModal() {
    var modal = document.getElementById('food-day-mobile-modal');
    if (!modal) return;
    if (typeof toggleModal === 'function') toggleModal('food-day-mobile-modal', false);
    else modal.classList.add('hidden');
}
window.closeFoodDayMobileModal = closeFoodDayMobileModal;

function openOverflowDayMobileModal(dayKey) {
    var modal = document.getElementById('food-day-mobile-modal');
    if (!modal || !dayKey) return;

    // Prevent competing overflow-specific panels from staying open.
    if (typeof closeOverflowDayMobileModal === 'function') closeOverflowDayMobileModal();
    if (typeof closeOverflowDayPopover === 'function') closeOverflowDayPopover();

    var payCycle = (typeof getPayCycleInfo === 'function') ? getPayCycleInfo() : null;
    var p = payCycle && Array.isArray(payCycle.overflowDates) ? payCycle.overflowDates.find(function (x) { return x.key === dayKey; }) : null;

    var titleEl = document.getElementById('food-day-mobile-title');
    var subtitleEl = document.getElementById('food-day-mobile-subtitle');
    if (titleEl) titleEl.textContent = 'Overflow';
    if (subtitleEl) subtitleEl.textContent = p ? (p.monthName + ' ' + p.date) : 'Overflow day';

    var consumedAmt = Number((state.food && state.food.overflowConsumedAmounts && state.food.overflowConsumedAmounts[dayKey]) || 0);
    var isConsumed = consumedAmt > 0.001;
    modal.setAttribute('data-overflow-key', dayKey);
    modal.setAttribute('data-overflow-consumed', isConsumed ? '1' : '0');

    var consumeBtn = document.getElementById('food-day-mobile-consume-btn');
    if (consumeBtn) {
        consumeBtn.textContent = isConsumed ? 'Unconsume day' : 'Consume day';
        consumeBtn.className = 'w-full py-3 rounded-2xl text-[12px] font-black uppercase tracking-widest transition ' +
            (isConsumed ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-emerald-600 text-white hover:bg-emerald-700');
        consumeBtn.onclick = function () {
            if (typeof setOverflowFoodDayConsumed === 'function') {
                setOverflowFoodDayConsumed(dayKey, isConsumed ? 'unmark' : 'mark');
            }
            closeFoodDayMobileModal();
            if (typeof updateFoodUI === 'function') updateFoodUI();
            if (typeof renderLedger === 'function') renderLedger();
            if (typeof updateGlobalUI === 'function') updateGlobalUI();
        };
    }

    var rBtn = document.getElementById('food-day-mobile-overflow-redistribute-btn');
    if (rBtn) {
        rBtn.classList.remove('hidden');
        var usage = state.food && state.food.overflowUsage ? state.food.overflowUsage[dayKey] : '';
        rBtn.textContent = usage === 'redistributed' ? 'Undo distribute' : 'Distribute';
        rBtn.onclick = function () {
            if (usage === 'redistributed') {
                if (typeof applyOverflowRedistributionUndo === 'function') applyOverflowRedistributionUndo(dayKey);
            } else {
                if (typeof applyOverflowDayRedistribution === 'function') applyOverflowDayRedistribution(dayKey);
            }
            closeFoodDayMobileModal();
        };
    }

    var transferTargets = document.getElementById('food-day-mobile-transfer-targets');
    var transferDisabled = document.getElementById('food-day-mobile-transfer-disabled');
    if (transferTargets) {
        transferTargets.innerHTML = '';
        if (transferDisabled) {
            if (isConsumed) {
                transferDisabled.classList.remove('hidden');
                transferTargets.classList.add('opacity-50', 'pointer-events-none');
            } else {
                transferDisabled.classList.add('hidden');
                transferTargets.classList.remove('opacity-50', 'pointer-events-none');
            }
        }
        if (!isConsumed) {
            var targets = (typeof getFoodDayTransferTargets === 'function') ? getFoodDayTransferTargets() : [];
            transferTargets.innerHTML = (targets || []).map(function (t) {
                var safeLabel = String(t.label).replace(/</g, '&lt;').replace(/"/g, '&quot;');
                var tid = String(t.id).replace(/"/g, '&quot;');
                return (
                    '<button type="button" class="w-full text-left px-4 py-3 text-[12px] font-bold text-slate-800 hover:bg-slate-50 active:bg-slate-100 transition truncate" ' +
                    'onclick="transferFoodOverflowDayTo(' + '\'' + dayKey + '\'' + ', \'' + tid + '\'); closeFoodDayMobileModal();">' +
                    safeLabel +
                    '</button>'
                );
            }).join('');
        }
    }

    if (typeof toggleModal === 'function') toggleModal('food-day-mobile-modal', true);
    else modal.classList.remove('hidden');
}
window.openOverflowDayMobileModal = openOverflowDayMobileModal;

function openOverflowDayActionPopover(dayKey, anchorEl) {
    if (isTouchOrSmall()) {
        openOverflowDayMobileModal(dayKey);
        return;
    }

    var pop = document.getElementById('food-day-action-popover');
    var consumeBtn = document.getElementById('food-day-action-consume');
    var transferBtn = document.getElementById('food-day-action-transfer');
    var rBtn = document.getElementById('food-day-action-overflow-redistribute');
    if (!pop || !consumeBtn || !transferBtn || !rBtn) return;

    var consumedAmt = Number((state.food && state.food.overflowConsumedAmounts && state.food.overflowConsumedAmounts[dayKey]) || 0);
    var isConsumed = consumedAmt > 0.001;
    var usage = state.food && state.food.overflowUsage ? state.food.overflowUsage[dayKey] : '';

    rBtn.classList.remove('hidden');
    var rLabel = document.getElementById('food-day-action-overflow-redistribute-label');
    if (rLabel) rLabel.textContent = usage === 'redistributed' ? 'Undo distribute' : 'Distribute';

    pop.setAttribute('data-overflow-key', dayKey);

    var consumeLabel = consumeBtn.querySelector('.food-day-action-consume-label');
    if (consumeLabel) consumeLabel.textContent = isConsumed ? 'Unmark' : 'Mark consumed'; else consumeBtn.textContent = isConsumed ? 'Unmark' : 'Mark consumed';

    consumeBtn.onclick = function () {
        if (typeof setOverflowFoodDayConsumed === 'function') setOverflowFoodDayConsumed(dayKey, isConsumed ? 'unmark' : 'mark');
        closeFoodDayActionPopover();
        if (typeof updateFoodUI === 'function') updateFoodUI();
        if (typeof renderLedger === 'function') renderLedger();
        if (typeof updateGlobalUI === 'function') updateGlobalUI();
    };

    transferBtn.onclick = function () {
        closeFoodDayActionPopover();
        if (typeof openFoodOverflowTransferPopover === 'function') {
            var rect = anchorEl && anchorEl.getBoundingClientRect ? anchorEl.getBoundingClientRect() : null;
            openFoodOverflowTransferPopover(dayKey, rect);
        }
    };

    rBtn.onclick = function () {
        if (usage === 'redistributed') {
            if (typeof applyOverflowRedistributionUndo === 'function') applyOverflowRedistributionUndo(dayKey);
        } else {
            if (typeof applyOverflowDayRedistribution === 'function') applyOverflowDayRedistribution(dayKey);
        }
        closeFoodDayActionPopover();
        if (typeof updateFoodUI === 'function') updateFoodUI();
        if (typeof renderLedger === 'function') renderLedger();
        if (typeof updateGlobalUI === 'function') updateGlobalUI();
    };

    if (anchorEl && anchorEl.getBoundingClientRect) {
        var rect = anchorEl.getBoundingClientRect();
        pop.style.left = rect.left + 'px';
        pop.style.top = (rect.bottom + 4) + 'px';
    }
    pop.classList.remove('hidden');
}
window.openOverflowDayActionPopover = openOverflowDayActionPopover;

var _foodDayActionPopoverAnchor = null;

function openFoodDayActionPopover(cycleDay, consumed, anchorEl) {
    var dCheck = Math.max(1, Math.min(28, Math.floor(cycleDay)));
    if (!consumed && typeof getFoodFundedForDay === 'function' && getFoodFundedForDay(dCheck) <= 0.001) {
        showFoodDayLockedNotice();
        return;
    }
    if (isTouchOrSmall()) {
        openFoodDayMobileModal(cycleDay, consumed);
        return;
    }
    var pop = document.getElementById('food-day-action-popover');
    var consumeBtn = document.getElementById('food-day-action-consume');
    var transferBtn = document.getElementById('food-day-action-transfer');
    var overflowRBtn = document.getElementById('food-day-action-overflow-redistribute');
    if (overflowRBtn) overflowRBtn.classList.add('hidden');
    if (!pop || !consumeBtn || !transferBtn) return;
    _foodDayActionPopoverAnchor = anchorEl;
    pop.removeAttribute('data-buffer');
    pop.setAttribute('data-cycle-day', String(cycleDay));
    var consumeLabel = consumeBtn.querySelector('.food-day-action-consume-label');
    if (consumeLabel) consumeLabel.textContent = consumed ? 'Unmark' : 'Mark consumed'; else consumeBtn.textContent = consumed ? 'Unmark' : 'Mark consumed';
    consumeBtn.onclick = function() {
        if (typeof setFoodDayFromCalendar === 'function') setFoodDayFromCalendar(cycleDay, consumed ? 'unmark' : 'mark');
        closeFoodDayActionPopover();
        if (typeof updateFoodUI === 'function') updateFoodUI();
        if (typeof renderLedger === 'function') renderLedger();
        if (typeof updateGlobalUI === 'function') updateGlobalUI();
    };
    transferBtn.onclick = function() {
        closeFoodDayActionPopover();
        if (typeof openFoodDayTransferPopover === 'function') openFoodDayTransferPopover(cycleDay, _foodDayActionPopoverAnchor);
    };
    if (anchorEl && anchorEl.getBoundingClientRect) {
        var rect = anchorEl.getBoundingClientRect();
        pop.style.left = rect.left + 'px';
        pop.style.top = (rect.bottom + 4) + 'px';
    }
    pop.classList.remove('hidden');
}

function closeFoodDayActionPopover() {
    var pop = document.getElementById('food-day-action-popover');
    if (pop) pop.classList.add('hidden');
    _foodDayActionPopoverAnchor = null;
}
window.closeFoodDayActionPopover = closeFoodDayActionPopover;

// High-level segments for the bank balance bar: overarching categories + standalone major funds (no micro items, no "Other").
function getBankBalanceBarSegments() {
    var segments = [];
    var getBal = typeof getItemBalance === 'function' ? getItemBalance : function() { return 0; };
    var getSavings = typeof getSavingsTotal === 'function' ? getSavingsTotal() : (state.accounts?.buckets?.['Savings'] ?? 0);
    var gsLabel = ITEM_LABELS.GENERAL_SAVINGS;
    var payLabel = ITEM_LABELS.PAYABLES;
    var carLabel = ITEM_LABELS.CAR_FUND;
    var foodLabel = ITEM_LABELS.FOOD_BASE;
    var weeklyLabel = ITEM_LABELS.WEEKLY_MISC;

    var surplus = (state.accounts && state.accounts.surplus !== undefined) ? state.accounts.surplus : 0;
    if (surplus !== 0) {
        var extraColor = surplus > 0 ? 'bg-emerald-400' : 'bg-red-700';
        segments.push({ label: 'Extra (Unallocated)', amount: surplus, group: 'extra', colorClass: extraColor });
    }

    if (getSavings > 0) segments.push({ label: gsLabel, amount: getSavings, group: 'savings' });
    if (getBal(payLabel, 0) > 0) segments.push({ label: payLabel, amount: getBal(payLabel, 0), group: 'payables' });
    if (getBal(carLabel, 0) > 0) segments.push({ label: carLabel, amount: getBal(carLabel, 0), group: 'car' });

    if (typeof ensureWeeklyState === 'function') ensureWeeklyState();
    var w1 = Math.max(0, (state.accounts.weekly.balances && state.accounts.weekly.balances[0]) || 0);
    var w2 = Math.max(0, (state.accounts.weekly.balances && state.accounts.weekly.balances[1]) || 0);
    var w3 = Math.max(0, (state.accounts.weekly.balances && state.accounts.weekly.balances[2]) || 0);
    var w4 = Math.max(0, (state.accounts.weekly.balances && state.accounts.weekly.balances[3]) || 0);
    var totalWeekly = w1 + w2 + w3 + w4;
    if (totalWeekly > 0) segments.push({ label: 'Weekly Allowance', amount: totalWeekly, meta: 'Week 1–4', group: 'weekly' });

    if (typeof getFoodRemainderInfo === 'function') {
        var foodInfo = getFoodRemainderInfo();
        if (foodInfo.remainder > 0) segments.push({ label: 'Food Remainder', amount: foodInfo.remainder, meta: foodInfo.daysLeft + ' days', group: 'food' });
    }
    var locked = state.food?.lockedAmount || 0;
    if (locked > 0) segments.push({ label: 'Food Buffer', amount: locked, meta: 'Locked', group: 'food' });

    // One segment per category section (Health, Groceries, Misc, Subscriptions, etc.) – not per item.
    var skipLabels = [foodLabel, weeklyLabel, gsLabel, payLabel, carLabel];
    (state.categories || []).forEach(function (sec) {
        if (!sec.items || !sec.items.length) return;
        var sectionSum = 0;
        sec.items.forEach(function (item) {
            if (skipLabels.indexOf(item.label) !== -1) return;
            sectionSum += getBal(item.label, 0);
        });
        if (sectionSum > 0) segments.push({ label: sec.label, amount: sectionSum, group: 'categories' });
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
var _bankBalanceHiddenGroups = _bankBalanceHiddenGroups || {};

function syncBankBalanceFilterUI() {
    var groups = ['extra', 'savings', 'payables', 'car', 'weekly', 'food', 'categories'];
    if (!_bankBalanceHiddenGroups || typeof _bankBalanceHiddenGroups !== 'object') {
        _bankBalanceHiddenGroups = {};
    }
    groups.forEach(function (group) {
        var cb = document.getElementById('bb-filter-' + group);
        if (!cb) return;
        cb.checked = !_bankBalanceHiddenGroups[group];
    });
}

function onBankBalanceFilterChanged(group, isChecked) {
    if (!_bankBalanceHiddenGroups || typeof _bankBalanceHiddenGroups !== 'object') {
        _bankBalanceHiddenGroups = {};
    }
    if (isChecked) {
        delete _bankBalanceHiddenGroups[group];
    } else {
        _bankBalanceHiddenGroups[group] = true;
    }
    renderBankBalanceCard();
    syncBankBalanceFilterUI();
}

function toggleBankBalanceGroup(group) {
    if (!_bankBalanceHiddenGroups || typeof _bankBalanceHiddenGroups !== 'object') {
        _bankBalanceHiddenGroups = {};
    }
    var isCurrentlyVisible = !_bankBalanceHiddenGroups[group];
    onBankBalanceFilterChanged(group, !isCurrentlyVisible);
}

function bankBalanceFilterSelectAll() {
    if (!_bankBalanceHiddenGroups || typeof _bankBalanceHiddenGroups !== 'object') {
        _bankBalanceHiddenGroups = {};
    }
    var groups = ['extra', 'savings', 'payables', 'car', 'weekly', 'food', 'categories'];
    var allVisible = groups.every(function (g) { return !_bankBalanceHiddenGroups[g]; });
    if (allVisible) {
        groups.forEach(function (g) { _bankBalanceHiddenGroups[g] = true; });
    } else {
        _bankBalanceHiddenGroups = {};
    }
    renderBankBalanceCard();
    syncBankBalanceFilterUI();
}

function toggleBankBalanceFilterDropdown() {
    var dropdown = document.getElementById('bank-balance-filter-dropdown');
    var btn = document.getElementById('bank-balance-filter-btn');
    if (!dropdown || !btn) return;
    var isHidden = dropdown.classList.contains('hidden');
    if (isHidden) {
        syncBankBalanceFilterUI();
        dropdown.classList.remove('hidden');
        if (!window._bankBalanceFilterDocClick) {
            window._bankBalanceFilterDocClick = function (e) {
                if (e.target.closest && (e.target.closest('#bank-balance-filter-dropdown') || e.target.closest('#bank-balance-filter-btn'))) return;
                var dd = document.getElementById('bank-balance-filter-dropdown');
                if (!dd) return;
                dd.classList.add('hidden');
            };
            document.addEventListener('click', window._bankBalanceFilterDocClick);
        }
    } else {
        dropdown.classList.add('hidden');
    }
}
window.toggleBankBalanceFilterDropdown = toggleBankBalanceFilterDropdown;
window.bankBalanceFilterSelectAll = bankBalanceFilterSelectAll;
window.onBankBalanceFilterChanged = onBankBalanceFilterChanged;
window.toggleBankBalanceGroup = toggleBankBalanceGroup;

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
    if (!barEl) return;

    _bankBalanceColorFallbackIndex = 0;
    var segments = typeof getBankBalanceBarSegments === 'function' ? getBankBalanceBarSegments() : [];
    // Apply group-level filters (treat unset as "all selected")
    if (_bankBalanceHiddenGroups && typeof _bankBalanceHiddenGroups === 'object') {
        segments = segments.filter(function (s) {
            if (!s.group) return true;
            return !_bankBalanceHiddenGroups[s.group];
        });
    }
    // Keep segments with non-zero amounts (can be positive or negative)
    segments = segments.filter(function (s) { return s.amount !== 0; });

    // Net total (including negatives) and absolute total for sizing
    var visibleNetTotal = segments.reduce(function (sum, s) { return sum + s.amount; }, 0);
    var visibleAbsTotal = segments.reduce(function (sum, s) { return sum + Math.abs(s.amount); }, 0);

    if (totalEl) {
        // If nothing is shown, fall back to overall total
        var displayTotal = visibleAbsTotal > 0 ? visibleNetTotal : total;
        totalEl.innerText = typeof formatMoney === 'function' ? formatMoney(displayTotal) : displayTotal.toFixed(2);
    }

    if (segments.length === 0 || visibleAbsTotal <= 0 || total <= 0) {
        barEl.innerHTML = '<div class="flex-1 rounded-lg bg-slate-200" title="No balance"></div>';
        return;
    }
    var totalAmount = visibleAbsTotal;
    var currency = getCurrencyLabel();
    var html = segments.map(function (item) {
        var pct = Math.max(0, (Math.abs(item.amount) / totalAmount) * 100);
        var width = pct < 0.5 ? '0.5' : pct.toFixed(1);
        var color = item.colorClass || getBankBalanceSegmentColor(item.label);
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
    syncBankBalanceFilterUI();
}

// Writes current balance to reality elements (if present) and refreshes bank balance bar.
// Header bank balance uses full total (getCurrentBalance); not affected by bank balance card filters.
function calculateReality() {
    var total = getCurrentBalance();
    var realityTotal = getEl('reality-total');
    var headerReality = getEl('header-reality');
    var headerBank = getEl('header-bank-balance');
    if (realityTotal) realityTotal.innerText = formatMoney(total);
    if (headerReality) headerReality.innerText = formatMoney(total);
    if (headerBank) {
        var currencyLabelEl = document.querySelector('#bank-balance-total + [data-currency]');
        var currencyLabel = currencyLabelEl ? currencyLabelEl.textContent || '' : '';
        headerBank.innerHTML = 'Balance: <span class=\"font-normal text-slate-700\">' + formatMoney(total) + (currencyLabel ? ' ' + currencyLabel : '') + '</span>';
    }
    if (typeof renderBankBalanceCard === 'function') renderBankBalanceCard();
}

function getCurrentPayCycleDay() {
    if (typeof getPayCycleInfo !== 'function') return null;
    try {
        var info = getPayCycleInfo();
        if (!info || !Array.isArray(info.dates)) return null;
        var now = new Date();
        var y = now.getFullYear();
        var m = now.getMonth();
        var d = now.getDate();
        for (var i = 0; i < info.dates.length; i++) {
            var it = info.dates[i];
            if (it && it.year === y && it.month === m && it.date === d) return it.cycleDay;
        }
        // Fallback: compute from cycleStart
        if (info.cycleStart && info.cycleStart.getTime) {
            var diffDays = Math.floor((now.getTime() - info.cycleStart.getTime()) / 86400000);
            return diffDays + 1;
        }
    } catch (e) {}
    return null;
}

function isLastWeekOfPayCycle() {
    var day = getCurrentPayCycleDay();
    return typeof day === 'number' && day >= 22 && day <= 28;
}

// Updates surplus display, deficit trigger visibility, and calls calculateReality.
function updateGlobalUI() {
    var surplus = (state.accounts && state.accounts.surplus !== undefined) ? state.accounts.surplus : 0;
    var surpEl = getEl('global-surplus');
    var dTrigger = getEl('deficit-trigger');
    if (surpEl) {
        var isNarrow = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
        surpEl.innerText = isNarrow && typeof formatCompactSignedMoney === 'function' ? formatCompactSignedMoney(surplus) : formatSignedMoney(surplus);
        surpEl.title = formatSignedMoney(surplus) + ' ' + (typeof getCurrencyLabel === 'function' ? getCurrencyLabel() : '');
    }

    var surplusResolveInDropdown = getEl('surplus-controls-resolve');
    var surplusToggleBtn = getEl('surplus-controls-toggle');
    var surpCurrencyEl = getEl('global-surplus-currency');
    if (dTrigger && surpEl) {
        if (surplus < 0) {
            dTrigger.classList.remove('hidden');
            if (surplusResolveInDropdown) surplusResolveInDropdown.classList.remove('hidden');
            if (surplusToggleBtn) surplusToggleBtn.classList.add('home-header-extra-chevron-negative');
            surpEl.classList.remove('text-emerald-600');
            surpEl.classList.add('text-red-600');
            if (surpCurrencyEl) {
                surpCurrencyEl.classList.remove('text-emerald-600');
                surpCurrencyEl.classList.add('text-red-600');
            }
        } else {
            dTrigger.classList.add('hidden');
            if (surplusResolveInDropdown) surplusResolveInDropdown.classList.add('hidden');
            if (surplusToggleBtn) surplusToggleBtn.classList.remove('home-header-extra-chevron-negative');
            surpEl.classList.add('text-emerald-600');
            surpEl.classList.remove('text-red-600');
            if (surpCurrencyEl) {
                surpCurrencyEl.classList.add('text-emerald-600');
                surpCurrencyEl.classList.remove('text-red-600');
            }
        }
    }

    calculateReality();
    var headerRealityEl = getEl('header-reality');
    if (headerRealityEl) void headerRealityEl.offsetHeight;
    if (surpEl) void surpEl.offsetHeight;

    var headerDateEl = getEl('header-today-date');
    var dateStr = (function () {
        var d = new Date();
        var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return monthNames[d.getMonth()] + ' ' + d.getDate();
    })();
    if (headerDateEl) headerDateEl.textContent = dateStr;

    // End-of-cycle actions: weekly + food rollovers are automatic.
    var wBtn = getEl('weekly-rollover-notice-btn');
    var fBtn = getEl('food-unused-transfer-btn');
    var pendingWeeklyNotice = !!(state.accounts && state.accounts.weekly && state.accounts.weekly.pendingRolloverNotice && state.accounts.weekly.pendingRolloverNotice.amount > 0);
    if (wBtn) wBtn.classList.toggle('hidden', !pendingWeeklyNotice);
    var pendingFoodNotice = !!(state.food && state.food.pendingUnusedTransferNotice && state.food.pendingUnusedTransferNotice.amount > 0);
    if (fBtn) fBtn.classList.toggle('hidden', !pendingFoodNotice);
    updateMajorFundTotalsUI();
}

function updateMajorFundTotalsUI() {
    var root = document.getElementById('ledger-categories');
    if (!root) return;
    var map = {
        savings: 'Savings',
        transportation: 'Transportation',
        payables: 'Payables'
    };
    Object.keys(map).forEach(function (key) {
        var amount = getItemBalance(map[key], 0);
        root.querySelectorAll('[data-major-fund="' + key + '"]').forEach(function (el) {
            el.textContent = formatMoney(amount);
        });
    });
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
