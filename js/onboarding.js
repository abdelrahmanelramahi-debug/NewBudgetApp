/** Onboarding flow: welcome → currency → income → reality → categories → weekly → summary */

var ONBOARDING_STEPS = ['welcome', 'currency', 'income', 'reality', 'categories', 'weekly', 'summary'];
var onboardingStepIndex = 0;
var onboardingCompleteCallback = null;

function getOnboardingEl() { return document.getElementById('onboarding'); }
function getAppShellEl() { return document.getElementById('app-shell'); }

function showOnboarding(onComplete) {
    onboardingCompleteCallback = onComplete;
    onboardingStepIndex = 0;
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
    if (stepId === 'summary') updateOnboardingSummary();
}

function updateOnboardingSummary() {
    var curEl = document.getElementById('onboarding-currency');
    var incEl = document.getElementById('onboarding-income');
    var realityEl = document.getElementById('onboarding-reality');
    var categoriesRadios = document.getElementsByName('onboarding-categories');
    var weeklyRadios = document.getElementsByName('onboarding-weekly');
    var cur = (curEl && curEl.value) ? curEl.value : 'AED';
    var inc = (incEl && incEl.value.trim() !== '') ? incEl.value : '4000';
    var reality = (realityEl && realityEl.value.trim() !== '') ? realityEl.value : '0';
    var cat = 'Template';
    if (categoriesRadios && categoriesRadios.length) {
        for (var i = 0; i < categoriesRadios.length; i++) {
            if (categoriesRadios[i].checked) { cat = categoriesRadios[i].value === 'minimal' ? 'Minimal' : 'Template'; break; }
        }
    }
    var weekly = 'No';
    if (weeklyRadios && weeklyRadios.length) {
        for (var j = 0; j < weeklyRadios.length; j++) {
            if (weeklyRadios[j].checked && weeklyRadios[j].value === 'yes') { weekly = 'Yes'; break; }
        }
    }
    var sumCur = document.getElementById('onboarding-summary-currency');
    var sumInc = document.getElementById('onboarding-summary-income');
    var sumReality = document.getElementById('onboarding-summary-reality');
    var sumCat = document.getElementById('onboarding-summary-categories');
    var sumWeekly = document.getElementById('onboarding-summary-weekly');
    if (sumCur) sumCur.textContent = cur;
    if (sumInc) sumInc.textContent = inc;
    if (sumReality) sumReality.textContent = reality;
    if (sumCat) sumCat.textContent = cat;
    if (sumWeekly) sumWeekly.textContent = weekly;
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
    var categoriesRadios = document.getElementsByName('onboarding-categories');
    var realityEl = document.getElementById('onboarding-reality');
    var weeklyRadios = document.getElementsByName('onboarding-weekly');
    if (state.settings) state.settings.currency = (currencyEl && currencyEl.value) ? currencyEl.value : 'AED';
    var income = 4000;
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
    if (!skipAll && categoriesRadios && categoriesRadios.length) {
        var choice = 'template';
        for (var i = 0; i < categoriesRadios.length; i++) {
            if (categoriesRadios[i].checked) { choice = categoriesRadios[i].value; break; }
        }
        if (choice === 'minimal') {
            state.categories = (state.categories || []).filter(function (s) { return s.isSystem; });
            state.balances = {};
            if (state.accounts) state.accounts.buckets = {};
        }
    }
    var prefillWeeks = false;
    if (!skipAll && weeklyRadios && weeklyRadios.length) {
        for (var k = 0; k < weeklyRadios.length; k++) {
            if (weeklyRadios[k].checked && weeklyRadios[k].value === 'yes') { prefillWeeks = true; break; }
        }
    }
    state._onboardingPrefillWeeks = prefillWeeks;
}

function finishOnboarding() {
    state.onboardingComplete = true;
    hideOnboarding();
    if (typeof ensureSystemSavings === 'function') ensureSystemSavings();
    if (typeof ensureCoreItems === 'function') ensureCoreItems();
    if (typeof ensureWeeklyState === 'function') ensureWeeklyState();
    if (state._onboardingPrefillWeeks && state.accounts && state.accounts.weekly && typeof getWeeklyConfigAmount === 'function') {
        var amt = getWeeklyConfigAmount();
        if (state.accounts.weekly.balances && state.accounts.weekly.balances.length >= 4) {
            state.accounts.weekly.balances[0] = amt;
            state.accounts.weekly.balances[1] = amt;
            state.accounts.weekly.balances[2] = amt;
            state.accounts.weekly.balances[3] = amt;
        }
        state.accounts.weekly.balance = state.accounts.weekly.balances[state.accounts.weekly.week - 1] || amt;
    }
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
    delete state._onboardingPrefillWeeks;
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
