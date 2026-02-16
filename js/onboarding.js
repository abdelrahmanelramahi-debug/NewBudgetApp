/** Onboarding flow: welcome → currency → income → reality → categories → summary */

var ONBOARDING_STEPS = ['welcome', 'currency', 'income', 'reality', 'categories', 'summary'];
var onboardingStepIndex = 0;
var onboardingCompleteCallback = null;
var onboardingCategoriesInitialized = false;
var onboardingBudgetTipIndex = 0;

var ONBOARDING_BUDGET_TIPS = [
    { title: 'Watch the total', body: 'The box above shows how much you\'ve allocated. We\'ll nudge you if you\'re under or over. You can change anything later in Budget Plan.', target: '#onboarding-cat-total-card' },
    { title: 'Start here', body: 'Change amounts with the number or the slider under each row. Savings and core spending are your base—you can tweak them later in Budget Plan.', target: '#onboarding-strategy-sections .premium-card' },
    { title: 'Add categories', body: 'Tap + Health, + Groceries, and so on to add more, or use Add Category for your own.', target: '#onboarding-suggestions-row' }
];

/** Suggested categories (emptied: amounts at 0 so user can fill). Same structure as template. */
var ONBOARDING_SUGGESTIONS = {
    health: { id: 'health', label: 'Health', isLedgerLinked: true, isSingleAction: true, items: [
        { label: 'Supplements', amount: 0 }, { label: 'Protein', amount: 0 }, { label: 'Vitamins', amount: 0 }, { label: 'Other health', amount: 0 }
    ]},
    groceries: { id: 'groceries', label: 'Groceries', isLedgerLinked: true, isSingleAction: true, items: [
        { label: 'Staples', amount: 0 }, { label: 'Produce', amount: 0 }
    ]},
    misc: { id: 'misc', label: 'Misc', isLedgerLinked: true, isSingleAction: true, items: [
        { label: 'Snacks', amount: 0 }, { label: 'Misc', amount: 0 }, { label: 'Personal', amount: 0 }, { label: 'Household', amount: 0 }
    ]},
    subscriptions: { id: 'subscriptions', label: 'Subscriptions', isLedgerLinked: true, isSingleAction: true, items: [
        { label: 'Streaming', amount: 0 }, { label: 'App 1', amount: 0 }, { label: 'App 2', amount: 0 }, { label: 'Cloud', amount: 0 }, { label: 'Sub other', amount: 0 }
    ]}
};

function getOnboardingEl() { return document.getElementById('onboarding'); }
function getAppShellEl() { return document.getElementById('app-shell'); }

function showOnboarding(onComplete) {
    onboardingCompleteCallback = onComplete;
    onboardingStepIndex = 0;
    onboardingCategoriesInitialized = false;
    var el = getOnboardingEl();
    var app = getAppShellEl();
    if (el) el.classList.remove('hidden');
    if (app) app.classList.add('hidden');
    prefillOnboardingFromState();
    showOnboardingStep(0);
}

function hideOnboarding() {
    var el = getOnboardingEl();
    var app = getAppShellEl();
    if (el) el.classList.add('hidden');
    if (app) app.classList.remove('hidden');
}

function prefillOnboardingFromState() {
    if (typeof state === 'undefined') return;
    var cur = document.getElementById('onboarding-currency');
    var inc = document.getElementById('onboarding-income');
    var realityEl = document.getElementById('onboarding-reality');
    if (cur && state.settings && state.settings.currency) cur.value = state.settings.currency;
    if (inc && typeof state.monthlyIncome === 'number') inc.value = state.monthlyIncome > 0 ? state.monthlyIncome : '';
    if (realityEl) realityEl.value = '';
}

function showOnboardingStep(index) {
    onboardingStepIndex = index;
    var stepId = ONBOARDING_STEPS[index];
    document.querySelectorAll('.onboarding-step').forEach(function (el) {
        el.classList.add('hidden');
    });
    var panel = document.getElementById('onboarding-step-' + stepId);
    if (panel) panel.classList.remove('hidden');
    if (stepId === 'categories') initAndRenderOnboardingCategories();
    if (stepId === 'summary') {
        updateOnboardingSummary();
        var card = document.getElementById('onboarding-account-card');
        if (card && (typeof isLoggedIn !== 'function' || !isLoggedIn())) card.classList.remove('hidden');
    }
}

function startBudgetPlanTips() {
    if (typeof state !== 'undefined' && state._sawBudgetPlanTips) return;
    onboardingBudgetTipIndex = 0;
    var overlay = document.getElementById('onboarding-budget-tips-overlay');
    var step = document.getElementById('onboarding-step-categories');
    if (!overlay || !step) return;
    overlay.classList.remove('hidden');
    overlay.classList.add('onboarding-tips-active');
    step.classList.add('tips-active');
    showBudgetPlanTip(0);
}
function showBudgetPlanTip(index) {
    var titleEl = document.getElementById('onboarding-tip-title');
    var bodyEl = document.getElementById('onboarding-tip-body');
    var nextBtn = document.getElementById('onboarding-tip-next');
    if (!titleEl || !bodyEl || !nextBtn) return;
    var tip = ONBOARDING_BUDGET_TIPS[index];
    if (!tip) return;
    
    /* Remove highlight from previous target */
    var step = document.getElementById('onboarding-step-categories');
    if (step) {
        step.querySelectorAll('.onboarding-tip-highlight').forEach(function(el) { el.classList.remove('onboarding-tip-highlight'); });
        step.querySelectorAll('.onboarding-tip-highlight-card').forEach(function(el) { el.classList.remove('onboarding-tip-highlight-card'); });
        step.querySelectorAll('.onboarding-tip-raise').forEach(function(el) { el.classList.remove('onboarding-tip-raise'); });
    }
    
    titleEl.textContent = tip.title;
    bodyEl.textContent = tip.body;
    nextBtn.textContent = index >= ONBOARDING_BUDGET_TIPS.length - 1 ? 'Got it' : 'Next';

    var overlay = document.getElementById('onboarding-budget-tips-overlay');
    var card = document.getElementById('onboarding-tip-card');
    if (tip.target && step && overlay && card) {
        var targetEl = step.querySelector(tip.target);
        if (targetEl) {
            // Highlight: prefer the card container if present
            var highlightEl = targetEl.closest('.premium-card') || targetEl;
            highlightEl.classList.add('onboarding-tip-highlight');
            if (highlightEl.classList.contains('premium-card')) highlightEl.classList.add('onboarding-tip-highlight-card');

            // If target lives inside the sticky header, raise that stacking context above the dim overlay
            var sticky = highlightEl.closest('.sticky');
            if (sticky) sticky.classList.add('onboarding-tip-raise');
            
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
            var positionTip = function () {
                var tr = highlightEl.getBoundingClientRect();
                var or = overlay.getBoundingClientRect();
                var cr = card.getBoundingClientRect();
                var pad = 16;
                var gap = 12;
                
                /* Try positions: below, above, right, left */
                var positions = [
                    { side: 'below', top: tr.bottom - or.top + gap, left: tr.left - or.left + (tr.width / 2) - (cr.width / 2) },
                    { side: 'above', top: tr.top - or.top - cr.height - gap, left: tr.left - or.left + (tr.width / 2) - (cr.width / 2) },
                    { side: 'right', top: tr.top - or.top + (tr.height / 2) - (cr.height / 2), left: tr.right - or.left + gap },
                    { side: 'left', top: tr.top - or.top + (tr.height / 2) - (cr.height / 2), left: tr.left - or.left - cr.width - gap }
                ];
                
                var bestPos = null;
                for (var i = 0; i < positions.length; i++) {
                    var p = positions[i];
                    var fits = p.top >= pad && p.top + cr.height <= or.height - pad &&
                                p.left >= pad && p.left + cr.width <= or.width - pad;
                    if (fits && (!bestPos || (p.side === 'below' || p.side === 'above'))) {
                        bestPos = p;
                        if (p.side === 'below' || p.side === 'above') break;
                    }
                }
                
                if (!bestPos) {
                    /* Fallback: center near target */
                    bestPos = {
                        top: Math.max(pad, Math.min(or.height - cr.height - pad, tr.top - or.top + (tr.height / 2) - (cr.height / 2))),
                        left: Math.max(pad, Math.min(or.width - cr.width - pad, tr.left - or.left + (tr.width / 2) - (cr.width / 2)))
                    };
                }
                
                card.style.left = bestPos.left + 'px';
                card.style.top = bestPos.top + 'px';
            };
            if (window._onboardingTipResize) {
                window.removeEventListener('resize', window._onboardingTipResize);
                window._onboardingTipResize = null;
            }
            window._onboardingTipResize = positionTip;
            window.addEventListener('resize', positionTip);
            // Smooth scroll is async; re-position a few times so the card follows the target
            setTimeout(positionTip, 50);
            setTimeout(positionTip, 200);
            setTimeout(positionTip, 400);
        }
    }
}
function nextBudgetPlanTip() {
    onboardingBudgetTipIndex++;
    if (onboardingBudgetTipIndex >= ONBOARDING_BUDGET_TIPS.length) {
        finishBudgetPlanTips();
        return;
    }
    showBudgetPlanTip(onboardingBudgetTipIndex);
}
function skipBudgetPlanTips() {
    finishBudgetPlanTips();
}
function finishBudgetPlanTips() {
    if (window._onboardingTipResize) {
        window.removeEventListener('resize', window._onboardingTipResize);
        window._onboardingTipResize = null;
    }
    var step = document.getElementById('onboarding-step-categories');
    if (step) {
        step.classList.remove('tips-active');
        step.querySelectorAll('.onboarding-tip-highlight').forEach(function(el) { el.classList.remove('onboarding-tip-highlight'); });
        step.querySelectorAll('.onboarding-tip-highlight-card').forEach(function(el) { el.classList.remove('onboarding-tip-highlight-card'); });
        step.querySelectorAll('.onboarding-tip-raise').forEach(function(el) { el.classList.remove('onboarding-tip-raise'); });
    }
    var overlay = document.getElementById('onboarding-budget-tips-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
        overlay.classList.remove('onboarding-tips-active');
    }
    if (typeof state !== 'undefined') {
        state._sawBudgetPlanTips = true;
        if (typeof saveState === 'function') saveState();
    }
}
window.startBudgetPlanTips = startBudgetPlanTips;
window.nextBudgetPlanTip = nextBudgetPlanTip;
window.skipBudgetPlanTips = skipBudgetPlanTips;

var HOME_TOUR_STEPS = [
    { title: 'Weekly Allowance', body: 'Track your weekly spending here. Enter an amount and tap Spend, or Top Up from Extra. Use Transfer to move between weeks.' },
    { title: 'Food Tracker', body: 'Mark days you\'ve eaten to use your food budget. Use "Mark Day Consumed" and the calendar below. You can extend your cycle with buffer days.' },
    { title: 'Categories', body: 'Spend from your budget categories (Health, Groceries, etc.). Tap a category to deduct or add. Single-action items can be checked off when done.' },
    { title: 'Bank Balance', body: 'The header shows your reality check — what should be in your bank. Extra is unallocated funds. Tap the balance for a breakdown.' }
];
var homeTourStepIndex = 0;
function startHomeTour() {
    if (typeof state !== 'undefined' && state._sawHomePageTour) return;
    homeTourStepIndex = 0;
    var overlay = document.getElementById('home-tour-overlay');
    if (!overlay) return;
    showHomeTourStep(0);
    overlay.classList.remove('hidden');
}
function showHomeTourStep(index) {
    var stepNum = document.getElementById('home-tour-step-num');
    var titleEl = document.getElementById('home-tour-title');
    var bodyEl = document.getElementById('home-tour-body');
    var nextBtn = document.getElementById('home-tour-next-btn');
    if (!titleEl || !bodyEl) return;
    var step = HOME_TOUR_STEPS[index];
    if (!step) return;
    if (stepNum) stepNum.textContent = index + 1;
    titleEl.textContent = step.title;
    bodyEl.textContent = step.body;
    if (nextBtn) nextBtn.textContent = index >= HOME_TOUR_STEPS.length - 1 ? 'Got it' : 'Next';
}
function nextHomeTourStep() {
    homeTourStepIndex++;
    if (homeTourStepIndex >= HOME_TOUR_STEPS.length) {
        finishHomeTour();
        return;
    }
    showHomeTourStep(homeTourStepIndex);
}
function skipHomeTour() {
    finishHomeTour();
}
function finishHomeTour() {
    var overlay = document.getElementById('home-tour-overlay');
    if (overlay) overlay.classList.add('hidden');
    if (typeof state !== 'undefined') {
        state._sawHomePageTour = true;
        if (typeof saveState === 'function') saveState();
    }
}
window.startHomeTour = startHomeTour;
window.nextHomeTourStep = nextHomeTourStep;
window.skipHomeTour = skipHomeTour;

function initAndRenderOnboardingCategories() {
    if (!onboardingCategoriesInitialized && typeof state !== 'undefined') {
        onboardingCategoriesInitialized = true;
        state.categories = (state.categories || []).filter(function (s) { return s.isSystem; });
        /* Pre-create generic categories with items (user can edit amounts) */
        var keys = Object.keys(ONBOARDING_SUGGESTIONS);
        for (var i = 0; i < keys.length; i++) {
            var template = ONBOARDING_SUGGESTIONS[keys[i]];
            if (template && !state.categories.some(function (s) { return s.id === template.id; })) {
                state.categories.push(JSON.parse(JSON.stringify(template)));
            }
        }
        if (state.balances) {
            var balKeys = Object.keys(state.balances);
            balKeys.forEach(function (k) { delete state.balances[k]; });
        }
        if (state.accounts && state.accounts.buckets) {
            var sysLabels = ['General Savings', 'Payables', 'Car Fund', 'Weekly Misc'];
            var bucketKeys = Object.keys(state.accounts.buckets);
            bucketKeys.forEach(function (k) {
                if (sysLabels.indexOf(k) === -1) delete state.accounts.buckets[k];
            });
        }
        if (typeof ensureSystemSavings === 'function') ensureSystemSavings();
        if (typeof ensureCoreItems === 'function') ensureCoreItems();
    }
    var obInc = document.getElementById('onboarding-income');
    if (obInc && obInc.value.trim() !== '' && typeof state !== 'undefined') {
        var parsed = parseFloat(obInc.value);
        if (!isNaN(parsed) && parsed >= 0) state.monthlyIncome = parsed;
    }
    if (typeof renderStrategy === 'function') {
        renderStrategy({ containerId: 'onboarding-strategy-sections', onboarding: true });
    }
    setTimeout(function () {
        if (typeof state !== 'undefined' && !state._sawBudgetPlanTips) startBudgetPlanTips();
    }, 300);
}

function addOnboardingSuggestion(key) {
    var template = ONBOARDING_SUGGESTIONS[key];
    if (!template || typeof state === 'undefined') return;
    if (state.categories.some(function (s) { return s.id === template.id; })) return;
    var clone = JSON.parse(JSON.stringify(template));
    state.categories.push(clone);
    if (typeof saveState === 'function') saveState();
    if (typeof renderStrategy === 'function') {
        renderStrategy({ containerId: 'onboarding-strategy-sections', onboarding: true });
    }
}

function updateOnboardingSummary() {
    var curEl = document.getElementById('onboarding-currency');
    var incEl = document.getElementById('onboarding-income');
    var realityEl = document.getElementById('onboarding-reality');
    var cur = (curEl && curEl.value) ? curEl.value : 'AED';
    var inc = (incEl && incEl.value.trim() !== '') ? incEl.value : '5000';
    var reality = (realityEl && realityEl.value.trim() !== '') ? realityEl.value : '0';
    var cat = 'Custom';
    if (typeof state !== 'undefined' && state.categories && state.categories.length) {
        var customCount = state.categories.filter(function (s) { return !s.isSystem; }).length;
        cat = customCount ? customCount + ' categories' : 'Essentials only';
    }
    var sumCur = document.getElementById('onboarding-summary-currency');
    var sumInc = document.getElementById('onboarding-summary-income');
    var sumReality = document.getElementById('onboarding-summary-reality');
    var sumCat = document.getElementById('onboarding-summary-categories');
    if (sumCur) sumCur.textContent = cur;
    if (sumInc) sumInc.textContent = inc;
    if (sumReality) sumReality.textContent = reality;
    if (sumCat) sumCat.textContent = cat;
}

function onboardingNext() {
    var step = ONBOARDING_STEPS[onboardingStepIndex];
    if (step === 'income') {
        var input = document.getElementById('onboarding-income');
        var err = document.getElementById('onboarding-income-error');
        var raw = input ? input.value.trim() : '';
        if (raw !== '') {
            var val = parseFloat(raw);
            if (isNaN(val) || val < 0) {
                if (err) { err.classList.remove('hidden'); err.textContent = 'Please enter a valid number (0 or more).'; }
                return;
            }
        }
        if (err) err.classList.add('hidden');
    }
    if (onboardingStepIndex >= ONBOARDING_STEPS.length - 1) return;
    showOnboardingStep(onboardingStepIndex + 1);
}

function onboardingBack() {
    if (onboardingStepIndex <= 0) return;
    showOnboardingStep(onboardingStepIndex - 1);
}

function onboardingSkipAll() {
    applyOnboardingValues(true);
    finishOnboarding();
}

function onboardingComplete() {
    applyOnboardingValues(false);
    finishOnboarding();
}

function applyOnboardingValues(skipAll) {
    if (typeof state === 'undefined') return;
    var currencyEl = document.getElementById('onboarding-currency');
    var incomeEl = document.getElementById('onboarding-income');
    var realityEl = document.getElementById('onboarding-reality');
    if (state.settings) state.settings.currency = (currencyEl && currencyEl.value) ? currencyEl.value : 'AED';
    var income = 5000;
    if (!skipAll && incomeEl && incomeEl.value.trim() !== '') {
        var parsed = parseFloat(incomeEl.value);
        if (!isNaN(parsed) && parsed >= 0) income = parsed;
    }
    state.monthlyIncome = income;
    var reality = null;
    if (!skipAll && realityEl && realityEl.value.trim() !== '') {
        var ex = parseFloat(realityEl.value);
        if (!isNaN(ex) && ex >= 0) reality = ex;
    }
    state._onboardingReality = reality;
}

function finishOnboarding() {
    state.onboardingComplete = true;
    hideOnboarding();
    if (typeof ensureSystemSavings === 'function') ensureSystemSavings();
    if (typeof ensureCoreItems === 'function') ensureCoreItems();
    if (typeof ensureWeeklyState === 'function') ensureWeeklyState();
    if (typeof initSurplusFromOpening === 'function') initSurplusFromOpening();
    var reality = state._onboardingReality;
    if (typeof reality === 'number' && reality >= 0 && typeof getLiquidityBreakdown === 'function') {
        var lb = getLiquidityBreakdown();
        var allocated = lb.totalLiquid - (state.accounts.surplus || 0);
        state.accounts.surplus = Math.max(0, reality - allocated);
    } else if (typeof reality === 'number' && reality >= 0) {
        state.accounts.surplus = reality;
    }
    state._showFirstActionPrompt = true;
    delete state._onboardingReality;
    if (typeof saveState === 'function') saveState();
    if (onboardingCompleteCallback) {
        onboardingCompleteCallback();
        onboardingCompleteCallback = null;
    }
}

window.showOnboarding = showOnboarding;
window.hideOnboarding = hideOnboarding;
window.onboardingNext = onboardingNext;
window.onboardingBack = onboardingBack;
window.onboardingSkipAll = onboardingSkipAll;
window.onboardingComplete = onboardingComplete;
window.updateOnboardingSummary = updateOnboardingSummary;
window.addOnboardingSuggestion = addOnboardingSuggestion;
window.initAndRenderOnboardingCategories = initAndRenderOnboardingCategories;

function onboardingOpenAuth() {
    if (typeof openAuthModal === 'function') openAuthModal();
}
function onboardingSkipAccount() {
    var card = document.getElementById('onboarding-account-card');
    if (card) card.classList.add('hidden');
}
window.onboardingOpenAuth = onboardingOpenAuth;
window.onboardingSkipAccount = onboardingSkipAccount;
