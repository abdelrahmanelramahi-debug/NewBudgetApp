/** Onboarding flow: welcome → currency → income → reality → categories → summary */

function isMobileDevice() {
    return (typeof navigator !== 'undefined') &&
        /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}

var ONBOARDING_STEPS = ['welcome', 'currency', 'income', 'reality', 'categories', 'summary'];
var onboardingStepIndex = 0;
var onboardingCompleteCallback = null;
var onboardingCategoriesInitialized = false;
var onboardingBudgetTipIndex = 0;

var ONBOARDING_BUDGET_TIPS = [
    {
        title: 'Watch the total',
        body: 'This box shows how much of your monthly income is allocated. We’ll flag it if you go under or over your total. You can change these amounts any time in Budget Plan.',
        target: '#onboarding-cat-total-card'
    },
    {
        title: 'Set your amounts',
        body: 'Use the number or the slider under each row to choose how much you want to spend or save in that section. Start with these core sections first.',
        target: '#onboarding-strategy-sections'
    },
    {
        title: 'Add and fill categories',
        body: 'Use + Health, + Groceries, and Add Category to create sections that match your life. Inside each category, use the + button and amount fields to add items. It’s fine to leave anything at 0 for now.',
        target: '#onboarding-suggestions-row'
    }
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
    var card = document.getElementById('onboarding-tip-card');
    if (!overlay || !card) return;
    overlay.classList.remove('hidden');
    card.classList.remove('hidden');
    showBudgetPlanTip(0);

    if (!window._onboardingTipResize) {
        window._onboardingTipResize = function () {
            var step = document.getElementById('onboarding-step-categories');
            if (!step) return;
            var currentTip = ONBOARDING_BUDGET_TIPS[onboardingBudgetTipIndex];
            if (!currentTip || !currentTip.target) return;
            var targetEl = step.querySelector(currentTip.target);
            if (targetEl) {
                positionBudgetPlanTipCard(targetEl);
            }
        };
        window.addEventListener('resize', window._onboardingTipResize);
    }
}

function positionBudgetPlanTipCard(targetEl) {
    var step = document.getElementById('onboarding-step-categories');
    var card = document.getElementById('onboarding-tip-card');
    if (!step || !card || !targetEl) return;

    // Ensure the card has a width for measurement
    if (card.classList.contains('hidden')) {
        card.classList.remove('hidden');
    }

    var stepRect = step.getBoundingClientRect();
    var targetRect = targetEl.getBoundingClientRect();
    var cardRect = card.getBoundingClientRect();

    var padding = 16;
    var viewportWidth = window.innerWidth || document.documentElement.clientWidth || stepRect.width;
    var viewportHeight = window.innerHeight || document.documentElement.clientHeight || stepRect.height;

    var cardWidth = cardRect.width || Math.min(360, stepRect.width - padding * 2);
    var cardHeight = cardRect.height || 0;

    // Preferred position: below the target, centered horizontally
    var preferredTop = targetRect.bottom + 12;
    var preferredLeft = targetRect.left + (targetRect.width / 2) - (cardWidth / 2);

    // Clamp horizontally within viewport and within the onboarding step
    var minLeft = Math.max(padding, stepRect.left + padding);
    var maxLeft = Math.min(viewportWidth - padding - cardWidth, stepRect.right - padding - cardWidth);
    var finalLeft = Math.min(Math.max(preferredLeft, minLeft), maxLeft);

    // Vertical clamping: keep within viewport and within the onboarding step
    var minTop = Math.max(padding, stepRect.top + padding);
    var maxTop = Math.min(viewportHeight - padding - cardHeight, stepRect.bottom - padding - cardHeight);

    var finalTop = preferredTop;
    if (finalTop + cardHeight > maxTop) {
        // Try placing above the target instead
        finalTop = targetRect.top - cardHeight - 12;
    }
    finalTop = Math.min(Math.max(finalTop, minTop), maxTop);

    // Convert from viewport coordinates to step-relative coordinates
    var relativeTop = finalTop - stepRect.top;
    var relativeLeft = finalLeft - stepRect.left;

    card.style.top = relativeTop + 'px';
    card.style.left = relativeLeft + 'px';
    card.style.maxWidth = cardWidth + 'px';
}

function showBudgetPlanTip(index) {
    var titleEl = document.getElementById('onboarding-tip-title');
    var bodyEl = document.getElementById('onboarding-tip-body');
    var nextBtn = document.getElementById('onboarding-tip-next');
    if (!titleEl || !bodyEl || !nextBtn) return;
    var tip = ONBOARDING_BUDGET_TIPS[index];
    if (!tip) return;

    titleEl.textContent = tip.title;
    bodyEl.textContent = tip.body;
    nextBtn.textContent = index >= ONBOARDING_BUDGET_TIPS.length - 1 ? 'Got it' : 'Next';

    var step = document.getElementById('onboarding-step-categories');
    if (!step) return;

    // Clear previous highlights
    step.querySelectorAll('.onboarding-tip-highlight').forEach(function (el) {
        el.classList.remove('onboarding-tip-highlight');
    });

    var targetEl = null;
    if (tip.target) {
        targetEl = step.querySelector(tip.target);
    }

    if (targetEl) {
        targetEl.classList.add('onboarding-tip-highlight');

        // Smooth scroll so the target is near the center of the screen
        try {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (e) {
            targetEl.scrollIntoView(true);
        }

        // After scroll settles, position the tip card near the target and ensure it is visible
        window.requestAnimationFrame(function () {
            positionBudgetPlanTipCard(targetEl);
            var card = document.getElementById('onboarding-tip-card');
            if (card) {
                try {
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                } catch (e) {
                    card.scrollIntoView(true);
                }
            }
        });
    } else {
        // If we don't have a specific target, fall back to centering the card
        var card = document.getElementById('onboarding-tip-card');
        if (card) {
            card.style.top = '';
            card.style.left = '';
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
    var overlay = document.getElementById('onboarding-budget-tips-overlay');
    var card = document.getElementById('onboarding-tip-card');
    if (overlay) overlay.classList.add('hidden');
    if (card) {
        card.classList.add('hidden');
        card.style.top = '';
        card.style.left = '';
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
    {
        title: 'Weekly allowance',
        body: 'This shows what you can spend this week. Enter an amount and tap Spend to record it, or Top Up to add more from Extra.',
        target: '.weekly-hero'
    },
    {
        title: 'Food tracker',
        body: 'Use \"Mark Day Consumed\" and the calendar to track food spending by day. Buffer days let you stretch the month when you need to.',
        target: '#page-ledger .premium-card:nth-of-type(2)'
    },
    {
        title: 'Categories',
        body: 'Each category (like Health or Groceries) is a mini budget. Tap a category to spend from it or move money between categories.',
        target: '#ledger-categories'
    },
    {
        title: 'Bank balance',
        body: 'This is what your bank account should read if everything matches the plan. The colored bar shows how it’s split across Extra, Weekly, Food, and categories.',
        target: '.bank-balance-card'
    }
];
var homeTourStepIndex = 0;
function startHomeTour() {
    // Disable home tour on mobile – desktop only
    if (isMobileDevice()) {
        if (typeof state !== 'undefined') {
            state._sawHomePageTour = true;
            if (typeof saveState === 'function') saveState();
        }
        return;
    }
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

    // Scroll and highlight the relevant area on the home screen
    if (step.target) {
        var root = document;

        // Clear previous highlights
        root.querySelectorAll('.home-tour-highlight').forEach(function (el) {
            el.classList.remove('home-tour-highlight');
        });

        var targetEl = root.querySelector(step.target);
        if (!targetEl) return;

        targetEl.classList.add('home-tour-highlight');
        try {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (e) {
            targetEl.scrollIntoView(true);
        }
    }
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

// Allow user to sign in and skip the remainder of onboarding in one action.
function onboardingSignInAndSkip() {
    if (typeof state !== 'undefined') {
        state.onboardingComplete = true;
        if (typeof saveState === 'function') saveState();
    }
    hideOnboarding();
    if (onboardingCompleteCallback) {
        onboardingCompleteCallback();
        onboardingCompleteCallback = null;
    }
    if (typeof openAuthModal === 'function') openAuthModal();
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
