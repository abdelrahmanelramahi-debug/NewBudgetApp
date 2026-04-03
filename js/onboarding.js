/** Onboarding flow: welcome → currency → income → categories → priority → summary */

function isMobileDevice() {
    return (typeof navigator !== 'undefined') &&
        /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}

var ONBOARDING_STEPS = ['welcome', 'currency', 'income', 'categories', 'priority', 'summary'];
var onboardingStepIndex = 0;
var onboardingCompleteCallback = null;
var onboardingCategoriesInitialized = false;
var onboardingBudgetTipIndex = 0;
var onboardingBudgetTipPhase = 'must';

var ONBOARDING_BUDGET_TIPS_MUST_HAVES = [
    {
        title: 'Watch Your Total',
        body: 'Keep your plan at or under 100% of your monthly income.',
        target: '#onboarding-cat-header',
        scrollBlock: 'nearest',
        cardPlacement: 'below'
    },
    {
        title: 'Savings',
        body: 'Give Savings its share before moving on to the rest of your plan.',
        target: '#onboarding-savings-block',
        scrollBlock: 'start',
        cardPlacement: 'above',
        cardOverlapPx: 14
    },
    {
        title: 'Must Haves',
        body: 'Fund Weekly Allowance, Daily Food, and Transportation first so your essential spending is covered.',
        target: '#onboarding-must-haves-block',
        scrollBlock: 'start',
        cardPlacement: 'above',
        cardOverlapPx: 14
    }
];

var ONBOARDING_BUDGET_TIPS_MINI_BUDGETS = [
    {
        title: 'Add Flexible Spending',
        body: 'Use mini-budgets for flexible spending, and adjust or reorder them anytime later.',
        target: '#onboarding-mini-budgets-block',
        scrollBlock: 'start',
        cardPlacement: 'above',
        cardOverlapPx: 14
    }
];

function getActiveOnboardingBudgetTips() {
    return onboardingBudgetTipPhase === 'mini' ? ONBOARDING_BUDGET_TIPS_MINI_BUDGETS : ONBOARDING_BUDGET_TIPS_MUST_HAVES;
}

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
            if (typeof onboardingOpenAuth === 'function') onboardingOpenAuth();
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
    var catTotal = document.getElementById('onboarding-cat-total-input');
    if (cur && state.settings && state.settings.currency) cur.value = state.settings.currency;
    if (inc && typeof state.monthlyIncome === 'number') inc.value = state.monthlyIncome > 0 ? state.monthlyIncome : '';
    if (catTotal && typeof state.monthlyIncome === 'number') catTotal.value = state.monthlyIncome > 0 ? state.monthlyIncome : 0;
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
    if (stepId === 'priority') renderOnboardingPriorityStep();
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

function syncOnboardingBudgetTotalInputs() {
    if (typeof state === 'undefined') return;
    var incomeValue = typeof state.monthlyIncome === 'number' && !isNaN(state.monthlyIncome) ? state.monthlyIncome : 0;
    var incomeEl = document.getElementById('onboarding-income');
    var totalInputEl = document.getElementById('onboarding-cat-total-input');
    if (incomeEl) incomeEl.value = incomeValue > 0 ? incomeValue : '';
    if (totalInputEl) totalInputEl.value = incomeValue;
}

function updateOnboardingBudgetTotal(rawValue) {
    if (typeof state === 'undefined') return;
    var parsed = parseFloat(rawValue);
    if (isNaN(parsed) || parsed < 0) parsed = 0;
    state.monthlyIncome = parsed;
    syncOnboardingBudgetTotalInputs();
    if (typeof renderStrategy === 'function') {
        renderStrategy({ containerId: 'onboarding-strategy-sections', onboarding: true, force: true });
    }
    if (typeof updateOnboardingSummary === 'function') updateOnboardingSummary();
    var overlay = document.getElementById('onboarding-budget-tips-overlay');
    if (overlay && !overlay.classList.contains('hidden')) {
        showBudgetPlanTip(onboardingBudgetTipIndex);
    }
}

function renderOnboardingPriorityStep() {
    var host = document.getElementById('onboarding-priority-content');
    if (!host) return;
    if (typeof normalizePaycheckPriorityOrder === 'function') normalizePaycheckPriorityOrder();
    if (typeof renderFundingPriorityCard === 'function') {
        host.innerHTML = renderFundingPriorityCard();
    }
}

function startBudgetPlanTips() {
    if (typeof state !== 'undefined' && state._sawBudgetPlanTips) return;
    onboardingBudgetTipPhase = 'must';
    onboardingBudgetTipIndex = 0;
    var overlay = document.getElementById('onboarding-budget-tips-overlay');
    var card = document.getElementById('onboarding-tip-card');
    var step = document.getElementById('onboarding-step-categories');
    if (!overlay || !card) return;
    if (step) step.classList.add('onboarding-tip-active');
    overlay.classList.remove('hidden');
    card.classList.remove('hidden');
    showBudgetPlanTip(0);

    if (!window._onboardingTipResize) {
        window._onboardingTipResize = function () {
            var step = document.getElementById('onboarding-step-categories');
            if (!step) return;
            var tips = getActiveOnboardingBudgetTips();
            var currentTip = tips[onboardingBudgetTipIndex];
            if (!currentTip || !currentTip.target) return;
            var targetEl = step.querySelector(currentTip.target);
            if (targetEl) {
                positionBudgetPlanTipCard(targetEl, currentTip);
            }
        };
        window.addEventListener('resize', window._onboardingTipResize);
    }
}

function positionBudgetPlanTipCard(targetEl, tip) {
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

    var overlapPx = Math.max(0, Number((tip && tip.cardOverlapPx) || 0) || 0);
    var preferredAboveTop = targetRect.top - cardHeight + overlapPx;
    var placement = (tip && tip.cardPlacement) || 'auto';
    var finalTop = preferredTop;
    if (placement === 'above') {
        // Keep "above" placement truly above; clamp to top edge if needed rather than flipping below.
        finalTop = Math.min(Math.max(preferredAboveTop, minTop), maxTop);
    } else if (placement === 'below') {
        finalTop = (preferredTop + cardHeight <= maxTop)
            ? Math.min(Math.max(preferredTop, minTop), maxTop)
            : Math.min(Math.max(preferredAboveTop, minTop), maxTop);
    } else if (finalTop + cardHeight > maxTop) {
        finalTop = Math.min(Math.max(preferredAboveTop, minTop), maxTop);
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
    var skipBtn = document.getElementById('onboarding-tip-skip');
    if (!titleEl || !bodyEl || !nextBtn) return;
    var tips = getActiveOnboardingBudgetTips();
    var tip = tips[index];
    if (!tip) return;

    titleEl.textContent = tip.title;
    bodyEl.textContent = tip.body;
    var isLastInPhase = index >= tips.length - 1;
    var hasMiniPhase = ONBOARDING_BUDGET_TIPS_MINI_BUDGETS.length > 0;
    var isFinalTip = onboardingBudgetTipPhase !== 'must' && isLastInPhase;
    if (!isFinalTip && onboardingBudgetTipPhase === 'must' && isLastInPhase && !hasMiniPhase) isFinalTip = true;
    nextBtn.textContent = isFinalTip ? 'Done' : 'Next';
    if (skipBtn) {
        skipBtn.textContent = 'Skip Tips';
    }

    var step = document.getElementById('onboarding-step-categories');
    if (!step) return;

    // Clear previous highlights
    step.querySelectorAll('.onboarding-tip-highlight').forEach(function (el) {
        el.classList.remove('onboarding-tip-highlight');
        el.classList.remove('onboarding-tip-highlight-contrast');
        el.classList.remove('onboarding-tip-highlight-ancestor');
    });

    var targetEl = null;
    if (tip.target) {
        targetEl = step.querySelector(tip.target);
    }

    if (targetEl) {
        var ancestorEls = [];
        var strategySections = document.getElementById('onboarding-strategy-sections');
        if (strategySections && strategySections.contains(targetEl)) {
            var blockAncestor = targetEl.closest('[id$="-block"]');
            if (blockAncestor) ancestorEls.push(blockAncestor);
        }

        ancestorEls.forEach(function (el) {
            el.classList.add('onboarding-tip-highlight');
            el.classList.add('onboarding-tip-highlight-contrast');
            el.classList.add('onboarding-tip-highlight-ancestor');
        });
        targetEl.classList.add('onboarding-tip-highlight');
        targetEl.classList.add('onboarding-tip-highlight-contrast');

        var vw = window.innerWidth || document.documentElement.clientWidth || 0;
        var isMobile = vw <= 640;

        var scrollBlock = tip.scrollBlock || 'center';
        try {
            targetEl.scrollIntoView({ behavior: 'auto', block: scrollBlock });
        } catch (e) {
            targetEl.scrollIntoView(true);
        }

        window.requestAnimationFrame(function () {
            positionBudgetPlanTipCard(targetEl, tip);
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
    var tips = getActiveOnboardingBudgetTips();
    onboardingBudgetTipIndex++;
    if (onboardingBudgetTipIndex >= tips.length) {
        if (onboardingBudgetTipPhase === 'must' && ONBOARDING_BUDGET_TIPS_MINI_BUDGETS.length > 0) {
            onboardingBudgetTipPhase = 'mini';
            onboardingBudgetTipIndex = 0;
            showBudgetPlanTip(0);
            return;
        }
        finishBudgetPlanTips();
        return;
    }
    showBudgetPlanTip(onboardingBudgetTipIndex);
}
function skipBudgetPlanTips() {
    skipAllGuidance();
}
function finishBudgetPlanTips() {
    if (window._onboardingTipResize) {
        window.removeEventListener('resize', window._onboardingTipResize);
        window._onboardingTipResize = null;
    }
    var overlay = document.getElementById('onboarding-budget-tips-overlay');
    var card = document.getElementById('onboarding-tip-card');
    var step = document.getElementById('onboarding-step-categories');
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
    if (step) step.classList.remove('onboarding-tip-active');
    if (step) {
        step.querySelectorAll('.onboarding-tip-highlight').forEach(function (el) {
            el.classList.remove('onboarding-tip-highlight');
            el.classList.remove('onboarding-tip-highlight-contrast');
            el.classList.remove('onboarding-tip-highlight-ancestor');
        });
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
        title: 'Check Your Balance',
        body: 'This shows the balance your account should have based on your current plan.',
        target: '.bank-balance-card'
    },
    {
        title: 'Use Weekly Spending',
        body: 'This is your safe-to-spend amount for the current week.',
        target: '.weekly-hero'
    },
    {
        title: 'Track Food Days',
        body: 'Mark the days you use your food budget so it stays paced through the month.',
        target: '#food-tracker-card',
        includeWhen: function () {
            return !(typeof state !== 'undefined' && state.settings && state.settings.showFoodTracker === false);
        }
    },
    {
        title: 'Manage Categories',
        body: 'Each category works like a mini-budget that you can spend from or adjust.',
        target: '#ledger-categories'
    }
];
var homeTourStepIndex = 0;

function getActiveHomeTourSteps() {
    return HOME_TOUR_STEPS.filter(function (step) {
        if (!step) return false;
        if (typeof step.includeWhen === 'function' && !step.includeWhen()) return false;
        return true;
    });
}

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
    var activeSteps = getActiveHomeTourSteps();
    var first = activeSteps[0];
    if (first && first.target && !document.querySelector(first.target)) {
        return;
    }
    if (!first) return;
    showHomeTourStep(0);
    overlay.classList.remove('hidden');
    card.classList.remove('hidden');
}
function showHomeTourStep(index) {
    var activeSteps = getActiveHomeTourSteps();
    var stepLabel = document.getElementById('home-tour-step');
    var stepNum = document.getElementById('home-tour-step-num');
    var titleEl = document.getElementById('home-tour-title');
    var bodyEl = document.getElementById('home-tour-body');
    var nextBtn = document.getElementById('home-tour-next-btn');
    var skipBtn = document.getElementById('home-tour-skip-btn');
    if (!titleEl || !bodyEl) return;
    var step = activeSteps[index];
    if (!step) return;
    if (stepNum) stepNum.textContent = index + 1;
    if (stepLabel) stepLabel.textContent = 'Step ' + (index + 1) + ' of ' + activeSteps.length;
    titleEl.textContent = step.title;
    bodyEl.textContent = step.body;
    if (nextBtn) nextBtn.textContent = index >= activeSteps.length - 1 ? 'Done' : 'Next';
    if (skipBtn) skipBtn.textContent = 'Skip Tour';

    // Scroll and highlight the relevant area on the home screen
    if (step.target) {
        var root = document;

        // Clear previous highlights
        root.querySelectorAll('.home-tour-highlight').forEach(function (el) {
            el.classList.remove('home-tour-highlight');
            el.classList.remove('home-tour-highlight-contrast');
        });
        root.querySelectorAll('.home-tour-highlight-ancestor').forEach(function (el) {
            el.classList.remove('home-tour-highlight-ancestor');
            el.classList.remove('home-tour-active-scope');
        });

        var targetEl = root.querySelector(step.target);
        if (!targetEl) {
            finishHomeTour();
            return;
        }

        var page = document.getElementById('page-ledger');
        if (page && page.contains(targetEl)) {
            var directSection = targetEl;
            while (directSection && directSection.parentElement !== page) {
                directSection = directSection.parentElement;
            }
            if (directSection && directSection !== targetEl) {
                directSection.classList.add('home-tour-highlight-ancestor');
                directSection.classList.add('home-tour-active-scope');
            }
        }

        targetEl.classList.add('home-tour-highlight');
        if (index <= 2) targetEl.classList.add('home-tour-highlight-contrast');

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
    var activeSteps = getActiveHomeTourSteps();
    homeTourStepIndex++;
    if (homeTourStepIndex >= activeSteps.length) {
        finishHomeTour();
        return;
    }
    showHomeTourStep(homeTourStepIndex);
}
function skipHomeTour() {
    skipAllGuidance();
}
function finishHomeTour() {
    var overlay = document.getElementById('home-tour-overlay');
    var card = document.getElementById('home-tour-card');
    document.querySelectorAll('.home-tour-highlight').forEach(function (el) {
        el.classList.remove('home-tour-highlight');
        el.classList.remove('home-tour-highlight-contrast');
    });
    document.querySelectorAll('.home-tour-highlight-ancestor').forEach(function (el) {
        el.classList.remove('home-tour-highlight-ancestor');
        el.classList.remove('home-tour-active-scope');
    });
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
function skipAllGuidance() {
    finishBudgetPlanTips();
    finishHomeTour();
}
window.startHomeTour = startHomeTour;
window.nextHomeTourStep = nextHomeTourStep;
window.skipHomeTour = skipHomeTour;
window.skipAllGuidance = skipAllGuidance;

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

        // On onboarding, keep the full default category/subcategory structure but start
        // planning from zero so users allocate intentionally from scratch.
        (state.categories || []).forEach(function (sec) {
            (sec.items || []).forEach(function (item) {
                item.amount = 0;
                if (item.amortData) delete item.amortData;
            });
        });

        // Seed helpful default savings buckets for first-time users.
        // General Savings stays first and acts as the required protected bucket.
        if (!state.accounts) state.accounts = {};
        var existingSavings = state.accounts.savingsBuckets || {};
        var existingKeys = Object.keys(existingSavings);
        var shouldSeedDefaultBuckets =
            !existingKeys.length ||
            (existingKeys.length === 1 && (existingKeys[0] === 'General Savings' || existingKeys[0] === 'Main'));
        if (shouldSeedDefaultBuckets) {
            state.accounts.savingsBuckets = {
                'General Savings': 0,
                'Emergency Fund': 0,
                'Travel': 0,
                'Big Purchase': 0
            };
            state.accounts.savingsDefaultBucket = 'General Savings';
        }
        if (!state.accounts.savingsBudgetPlan || typeof state.accounts.savingsBudgetPlan !== 'object') {
            state.accounts.savingsBudgetPlan = {};
        }
        var seededPlan = {};
        Object.keys(state.accounts.savingsBuckets || {}).forEach(function (bucketName) {
            seededPlan[bucketName] = 0;
        });
        state.accounts.savingsBudgetPlan = seededPlan;
        if (typeof syncSavingsBudgetPlanItemAmount === 'function') syncSavingsBudgetPlanItemAmount();
    }
    var obInc = document.getElementById('onboarding-income');
    if (obInc && obInc.value.trim() !== '' && typeof state !== 'undefined') {
        var parsed = parseFloat(obInc.value);
        if (!isNaN(parsed) && parsed >= 0) state.monthlyIncome = parsed;
    }
    syncOnboardingBudgetTotalInputs();
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
    var cur = (curEl && curEl.value) ? curEl.value : 'AED';
    var inc = (incEl && incEl.value.trim() !== '') ? incEl.value : '5000';
    var cat = 'Custom';
    if (typeof state !== 'undefined' && state.categories && state.categories.length) {
        var customCount = state.categories.filter(function (s) { return !s.isSystem; }).length;
        cat = customCount ? customCount + ' categories' : 'Must Haves only';
    }
    var sumCur = document.getElementById('onboarding-summary-currency');
    var sumInc = document.getElementById('onboarding-summary-income');
    var sumCat = document.getElementById('onboarding-summary-categories');
    if (sumCur) sumCur.textContent = cur;
    if (sumInc) sumInc.textContent = inc;
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
    if (state.settings) state.settings.currency = (currencyEl && currencyEl.value) ? currencyEl.value : 'AED';
    var income = 5000;
    if (!skipAll && incomeEl && incomeEl.value.trim() !== '') {
        var parsed = parseFloat(incomeEl.value);
        if (!isNaN(parsed) && parsed >= 0) income = parsed;
    }
    state.monthlyIncome = income;
    delete state._onboardingReality;
}

function seedBalancesFromOnboardingPlan() {
    if (typeof state === 'undefined') return;
    if (!state.accounts) state.accounts = {};
    if (!state.accounts.buckets) state.accounts.buckets = {};
    if (!state.balances || typeof state.balances !== 'object') state.balances = {};

    // On first-run completion, live balances should mirror the plan the user just set.
    state.balances = {};

    var plannedWeekly = 0;
    var plannedSavings = 0;
    var plannedPayables = 0;
    var plannedTransportation = 0;

    (state.categories || []).forEach(function (sec) {
        (sec.items || []).forEach(function (item) {
            var amount = Number(item && item.amount) || 0;
            if (!item || !item.label) return;
            if (item.label === 'Weekly Allowance') {
                plannedWeekly = amount;
                return;
            }
            if (item.label === 'Savings') {
                plannedSavings = amount;
                return;
            }
            if (item.label === 'Payables') {
                plannedPayables = amount;
                return;
            }
            if (item.label === 'Transportation') {
                plannedTransportation = amount;
                return;
            }
            state.balances[item.label] = amount;
        });
    });

    state.accounts.buckets['Weekly Allowance'] = plannedWeekly;
    state.accounts.buckets['Savings'] = plannedSavings;
    state.accounts.buckets['Payables'] = plannedPayables;
    state.accounts.buckets['Transportation'] = plannedTransportation;

    if (!state.accounts.savingsBuckets || typeof state.accounts.savingsBuckets !== 'object') {
        state.accounts.savingsBuckets = {};
    }
    if (!state.accounts.savingsDefaultBucket) state.accounts.savingsDefaultBucket = 'General Savings';
    var savingsPlan = state.accounts.savingsBudgetPlan || {};
    var savingsPlanKeys = Object.keys(savingsPlan);
    if (savingsPlanKeys.length) {
        var nextSavings = {};
        savingsPlanKeys.forEach(function (key) {
            nextSavings[key] = Math.max(0, Number(savingsPlan[key]) || 0);
        });
        if (nextSavings[state.accounts.savingsDefaultBucket] === undefined) {
            nextSavings[state.accounts.savingsDefaultBucket] = 0;
        }
        state.accounts.savingsBuckets = nextSavings;
    } else {
        Object.keys(state.accounts.savingsBuckets).forEach(function (key) {
            state.accounts.savingsBuckets[key] = 0;
        });
        state.accounts.savingsBuckets[state.accounts.savingsDefaultBucket] = plannedSavings;
    }

    if (!state.accounts.payablesBuckets || typeof state.accounts.payablesBuckets !== 'object') {
        state.accounts.payablesBuckets = {};
    }
    if (!state.accounts.payablesDefaultBucket) state.accounts.payablesDefaultBucket = 'Main';
    Object.keys(state.accounts.payablesBuckets).forEach(function (key) {
        state.accounts.payablesBuckets[key] = 0;
    });
    state.accounts.payablesBuckets[state.accounts.payablesDefaultBucket] = plannedPayables;

    if (!state.accounts.transportationBuckets || typeof state.accounts.transportationBuckets !== 'object') {
        state.accounts.transportationBuckets = {};
    }
    if (!state.accounts.transportationDefaultBucket) state.accounts.transportationDefaultBucket = 'Main';
    Object.keys(state.accounts.transportationBuckets).forEach(function (key) {
        state.accounts.transportationBuckets[key] = 0;
    });
    state.accounts.transportationBuckets[state.accounts.transportationDefaultBucket] = plannedTransportation;

    if (typeof ensureWeeklyState === 'function') ensureWeeklyState();
    var weeklyPerBucket = plannedWeekly / 4;
    if (state.accounts.weekly && Array.isArray(state.accounts.weekly.balances)) {
        for (var w = 0; w < 4; w++) state.accounts.weekly.balances[w] = weeklyPerBucket;
        var activeWeek = Math.max(1, Math.min(4, Math.round(state.accounts.weekly.week || 1)));
        state.accounts.weekly.balance = state.accounts.weekly.balances[activeWeek - 1];
    }

    if (!state.food || typeof state.food !== 'object') state.food = {};
    state.food.daysTotal = state.food.daysTotal || 28;
    state.food.consumedDays = [];
    state.food.daysUsed = 0;
    state.food.history = [];
    state.food.lockedAmount = 0;
    state.food.overflowUsage = {};
    state.food.overflowFunded = {};
    state.food.overflowFundingSource = {};
    state.food.overflowConsumedAmounts = {};
    if (state.food.redistributedPerSlot !== undefined) delete state.food.redistributedPerSlot;
    state.food.redistributedExtraDays = 0;
    state.food.fundedAmountByDay = {};
    state.food._foodFundingMigrated = true;

    if (typeof syncSavingsTotal === 'function') syncSavingsTotal();
    if (typeof syncPayablesTotal === 'function') syncPayablesTotal();
    if (typeof syncTransportationTotal === 'function') syncTransportationTotal();
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
    seedBalancesFromOnboardingPlan();
    if (typeof initSurplusFromOpening === 'function') initSurplusFromOpening();
    state._showFirstActionPrompt = true;
    delete state._onboardingReality;
    if (typeof saveState === 'function') saveState();
    if (onboardingCompleteCallback) {
        onboardingCompleteCallback();
        onboardingCompleteCallback = null;
    }
}

// Open auth from onboarding without completing the flow first.
function onboardingSignInAndSkip() {
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
window.updateOnboardingBudgetTotal = updateOnboardingBudgetTotal;

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
