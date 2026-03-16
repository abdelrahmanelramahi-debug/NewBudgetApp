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
        title: 'Total Budget',
        body: "See how much of your monthly income you've assigned. Stay within 100% for a balanced plan.",
        target: '#onboarding-cat-header'
    },
    {
        title: 'Set Your Categories',
        body: 'Use sliders or type amounts. Add new categories anytime and fine-tune later.',
        target: '#onboarding-strategy-sections'
    }
];

function getOnboardingEl() { return document.getElementById('onboarding'); }
function getAppShellEl() { return document.getElementById('app-shell'); }

function showOnboarding(onComplete) {
    onboardingCompleteCallback = onComplete;
    onboardingStepIndex = 0;
    onboardingCategoriesInitialized = false;
    if (typeof state !== 'undefined') state.onboardingComplete = false;
    var el = getOnboardingEl();
    var app = getAppShellEl();
    if (el) el.classList.remove('hidden');
    if (app) app.classList.add('hidden');
    prefillOnboardingFromState();
    showOnboardingStep(0);
    wireOnboardingWelcomeButtons();
}

function wireOnboardingWelcomeButtons() {
    var getStarted = document.getElementById('onboarding-welcome-get-started');
    var signIn = document.getElementById('onboarding-welcome-signin');
    if (getStarted && !getStarted._wired) {
        getStarted._wired = true;
        getStarted.addEventListener('click', function (e) {
            e.preventDefault();
            if (typeof onboardingNext === 'function') onboardingNext(e);
        });
    }
    if (signIn && !signIn._wired) {
        signIn._wired = true;
        signIn.addEventListener('click', function (e) {
            e.preventDefault();
            if (typeof onboardingSignInAndSkip === 'function') onboardingSignInAndSkip();
        });
    }
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
    // Keep onboarding visible and app hidden while moving between steps (guard against any other code flipping them)
    var ob = getOnboardingEl();
    var app = getAppShellEl();
    if (ob) ob.classList.remove('hidden');
    if (app) app.classList.add('hidden');
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

    if (card.classList.contains('hidden')) {
        card.classList.remove('hidden');
    }

    var stepRect = step.getBoundingClientRect();
    var targetRect = targetEl.getBoundingClientRect();
    var cardRect = card.getBoundingClientRect();

    var padding = 16;
    var viewportWidth = window.innerWidth || document.documentElement.clientWidth || stepRect.width;
    var viewportHeight = window.innerHeight || document.documentElement.clientHeight || stepRect.height;

    var isMobile = viewportWidth <= 640;
    var cardWidth = cardRect.width || Math.min(360, stepRect.width - padding * 2);
    if (isMobile) {
        cardWidth = Math.min(stepRect.width - padding * 2, 480);
    }

    // Position card relative to target (overlay near the element it discusses), same for mobile and desktop
    var cardHeight = cardRect.height || 0;
    var preferredTop = targetRect.bottom + 12;
    var preferredLeft = targetRect.left + (targetRect.width / 2) - (cardWidth / 2);

    var minLeft = Math.max(padding, stepRect.left + padding);
    var maxLeft = Math.min(viewportWidth - padding - cardWidth, stepRect.right - padding - cardWidth);
    var finalLeft = Math.min(Math.max(preferredLeft, minLeft), maxLeft);

    var minTop = Math.max(padding, stepRect.top + padding);
    var maxTop = Math.min(viewportHeight - padding - cardHeight, stepRect.bottom - padding - cardHeight);

    var finalTop = preferredTop;
    if (finalTop + cardHeight > maxTop) {
        finalTop = Math.min(Math.max(targetRect.top - cardHeight - 12, minTop), maxTop);
    } else {
        finalTop = Math.min(Math.max(finalTop, minTop), maxTop);
    }

    card.style.position = '';
    card.style.bottom = '';
    card.style.transform = '';
    card.style.width = '';

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

        var vw = window.innerWidth || document.documentElement.clientWidth || 0;
        var isMobile = vw <= 640;

        try {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (e) {
            targetEl.scrollIntoView(true);
        }

        window.requestAnimationFrame(function () {
            positionBudgetPlanTipCard(targetEl);
            var card = document.getElementById('onboarding-tip-card');
            if (card) {
                window.requestAnimationFrame(function () {
                    try {
                        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    } catch (e) {
                        card.scrollIntoView(true);
                    }
                });
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
        card.style.position = '';
        card.style.bottom = '';
        card.style.transform = '';
        card.style.width = '';
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
        title: 'Bank Balance',
        body: 'What your bank balance should show if you\'re following your plan. The bar shows how your money is split across sections.',
        target: '.bank-balance-card'
    },
    {
        title: 'Weekly Allowance',
        body: 'Your safe-to-spend amount for this week. Record purchases or move money when needed.',
        target: '.weekly-hero'
    },
    {
        title: 'Food Tracker',
        body: 'Tap a day when you use your food budget. Buffer days help you stretch the month.',
        target: '#food-tracker-card'
    },
    {
        title: 'Categories',
        body: 'Each category is its own mini-budget. Tap to spend from it or move money between categories.',
        target: '#ledger-categories'
    }
];
var homeTourStepIndex = 0;

function positionHomeTourCard(targetEl) {
    var page = document.getElementById('page-ledger');
    var card = document.getElementById('home-tour-card');
    if (!page || !card || !targetEl) return;

    if (card.classList.contains('hidden')) {
        card.classList.remove('hidden');
    }

    var pageRect = page.getBoundingClientRect();
    var targetRect = targetEl.getBoundingClientRect();
    var cardRect = card.getBoundingClientRect();

    var padding = 16;
    var viewportWidth = window.innerWidth || document.documentElement.clientWidth || pageRect.width;
    var viewportHeight = window.innerHeight || document.documentElement.clientHeight || pageRect.height;

    var isMobile = viewportWidth <= 640;
    var cardWidth = cardRect.width || Math.min(360, pageRect.width - padding * 2);
    if (isMobile) {
        cardWidth = Math.min(pageRect.width - padding * 2, 480);
    }

    if (isMobile) {
        card.style.position = 'fixed';
        card.style.bottom = padding + 'px';
        card.style.left = '50%';
        card.style.transform = 'translateX(-50%)';
        card.style.top = 'auto';
        card.style.maxWidth = cardWidth + 'px';
        card.style.width = 'calc(100% - ' + (padding * 2) + 'px)';
        return;
    }

    var cardHeight = cardRect.height || 0;
    var preferredTop = targetRect.bottom + 12;
    var preferredLeft = targetRect.left + (targetRect.width / 2) - (cardWidth / 2);

    var minLeft = Math.max(padding, pageRect.left + padding);
    var maxLeft = Math.min(viewportWidth - padding - cardWidth, pageRect.right - padding - cardWidth);
    var finalLeft = Math.min(Math.max(preferredLeft, minLeft), maxLeft);

    var minTop = Math.max(padding, pageRect.top + padding);
    var maxTop = Math.min(viewportHeight - padding - cardHeight, pageRect.bottom - padding - cardHeight);

    var finalTop = preferredTop;
    if (finalTop + cardHeight > maxTop) {
        finalTop = targetRect.top - cardHeight - 12;
    }
    finalTop = Math.min(Math.max(finalTop, minTop), maxTop);

    card.style.position = '';
    card.style.bottom = '';
    card.style.transform = '';
    card.style.width = '';

    var relativeTop = finalTop - pageRect.top;
    var relativeLeft = finalLeft - pageRect.left;

    card.style.top = relativeTop + 'px';
    card.style.left = relativeLeft + 'px';
    card.style.maxWidth = cardWidth + 'px';
}

function startHomeTour() {
    if (typeof state !== 'undefined' && state._sawHomePageTour) return;
    homeTourStepIndex = 0;
    var overlay = document.getElementById('home-tour-overlay');
    var card = document.getElementById('home-tour-card');
    if (!overlay || !card) return;
    showHomeTourStep(0);
    overlay.classList.remove('hidden');
    card.classList.remove('hidden');
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

        var isMobile = (window.innerWidth || document.documentElement.clientWidth || 0) <= 640;
        if (isMobile) {
            try {
                targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } catch (e) {
                targetEl.scrollIntoView(true);
            }
        } else {
            try {
                targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } catch (e) {
                targetEl.scrollIntoView(true);
            }
        }

        window.requestAnimationFrame(function () {
            positionHomeTourCard(targetEl);
            if (!isMobile) {
                var card = document.getElementById('home-tour-card');
                if (card) {
                    window.requestAnimationFrame(function () {
                        try {
                            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        } catch (e) {
                            card.scrollIntoView(true);
                        }
                    });
                }
            }
        });
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
    var card = document.getElementById('home-tour-card');
    if (overlay) overlay.classList.add('hidden');
    if (card) {
        card.classList.add('hidden');
        card.style.top = '';
        card.style.left = '';
        card.style.position = '';
        card.style.bottom = '';
        card.style.transform = '';
        card.style.width = '';
    }
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
        // Keep preset categories (Health, Groceries, Misc, Subscriptions with their sub-items); only ensure system sections exist
        if (typeof ensureSystemSavings === 'function') ensureSystemSavings();
        if (typeof ensureCoreItems === 'function') ensureCoreItems();
        // If state has no non-system categories (e.g. old saved state), add default presets so onboarding shows them
        var hasPresets = (state.categories || []).some(function (s) { return !s.isSystem && s.items && s.items.length > 0; });
        if (!hasPresets && state.categories) {
            state.categories.push(
                { id: 'health', label: 'Health', isLedgerLinked: true, isSingleAction: true, items: [
                    { label: 'Supplements', amount: 50 }, { label: 'Protein', amount: 75 }, { label: 'Vitamins', amount: 50 }, { label: 'Other health', amount: 40 }
                ]},
                { id: 'groceries', label: 'Groceries', isLedgerLinked: true, isSingleAction: true, items: [
                    { label: 'Staples', amount: 40 }, { label: 'Produce', amount: 30 }
                ]},
                { id: 'misc', label: 'Misc', isLedgerLinked: true, isSingleAction: true, items: [
                    { label: 'Snacks', amount: 50 }, { label: 'Misc', amount: 30 }, { label: 'Personal', amount: 25 }, { label: 'Household', amount: 15 }
                ]},
                { id: 'subscriptions', label: 'Subscriptions', isLedgerLinked: true, isSingleAction: true, items: [
                    { label: 'Streaming', amount: 50 }, { label: 'App 1', amount: 20 }, { label: 'App 2', amount: 15 }, { label: 'Cloud', amount: 5 }, { label: 'Sub other', amount: 15 }
                ]}
            );
        }
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

function onboardingNext(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (e && e.stopPropagation) e.stopPropagation();
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
    try {
        if (typeof STORAGE_KEYS !== 'undefined' && STORAGE_KEYS.ONBOARDING_DONE && localStorage.setItem) {
            localStorage.setItem(STORAGE_KEYS.ONBOARDING_DONE, '1');
        }
    } catch (e) {}
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
    try {
        if (typeof STORAGE_KEYS !== 'undefined' && STORAGE_KEYS.ONBOARDING_DONE && localStorage.setItem) {
            localStorage.setItem(STORAGE_KEYS.ONBOARDING_DONE, '1');
        }
    } catch (e) {}
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
window.onboardingSignInAndSkip = onboardingSignInAndSkip;
window.updateOnboardingSummary = updateOnboardingSummary;
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

(function () {
    function wireWelcome() {
        if (typeof wireOnboardingWelcomeButtons === 'function') wireOnboardingWelcomeButtons();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', wireWelcome);
    } else {
        wireWelcome();
    }
})();
