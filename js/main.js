// INIT
window.onload = function() {
    loadState();
    if (typeof window.location !== 'undefined' && window.location.search.indexOf('onboarding=1') !== -1) {
        state.onboardingComplete = false;
    }
    ensureSystemSavings();
    ensureCoreItems();

    // Check for un-migrated savings or zero-balance legacy defaults
    const sys = state.categories.find(s=>s.id==='sys_savings');
    if(sys) {
        const item = sys.items.find(i=>i.label==='General Savings');
        // Force update if it's auto-calculated OR if it is sitting at the old default of 0
        if(item && (item.isAutoCalculated || item.amount === 0)) {
            item.isAutoCalculated = false;
            item.amount = 1457;
            // Also update the running balance if it's 0 or undefined
            if(state.accounts?.buckets?.['General Savings'] === undefined || state.accounts.buckets['General Savings'] === 0) {
                state.accounts.buckets['General Savings'] = 1457;
            }
        }
        const payables = sys.items.find(i=>i.label==='Payables');
        if(!payables) {
            sys.items.push({ label: 'Payables', amount: 0, isAutoCalculated: false });
        }
        if(state.accounts?.buckets?.['Payables'] === undefined) {
            state.accounts.buckets['Payables'] = 0;
        }
    }

    // Ensure Weekly logic exists
    ensureWeeklyState();

    const hasBalances = Object.keys(state.balances || {}).length > 0;
    const hasBuckets = Object.values(state.accounts?.buckets || {}).some(v => v !== 0);
    const hasCategories = state.categories && state.categories.length > 0;
    if (state.accounts.surplus === 0 && (hasBalances || hasBuckets || hasCategories) && typeof recalculateSurplusFromReality === 'function') {
        recalculateSurplusFromReality();
    } else if (state.accounts.surplus === 0 && !hasBalances && !hasBuckets) {
        state.accounts.surplus = state.monthlyIncome;
        initSurplusFromOpening();
    }

    function runAppInit() {
        renderLedger();
        renderStrategy();
        updateUndoButtonUI();
        updateRedoButtonUI();
        applySettings();
        renderSettings();
        requestAnimationFrame(function() {
            updateGlobalUI();
            requestAnimationFrame(updateGlobalUI);
        });
        setTimeout(function() { requestAnimationFrame(updateGlobalUI); }, 0);
        setTimeout(function() { requestAnimationFrame(updateGlobalUI); }, 450);
        const amortTotal = document.getElementById('amort-total');
        const amortMonths = document.getElementById('amort-months');
        if (amortTotal) amortTotal.oninput = updateAmortCalc;
        if (amortMonths) amortMonths.oninput = updateAmortCalc;
        // First-action prompt: only shown once after new-user onboarding (existing users never have _showFirstActionPrompt)
        if (state._showFirstActionPrompt) {
            var banner = document.getElementById('first-action-prompt');
            var dismissBtn = document.getElementById('first-action-dismiss');
            if (banner) banner.classList.remove('hidden');
            if (dismissBtn) {
                dismissBtn.onclick = function() {
                    state._showFirstActionPrompt = false;
                    state.sawFirstActionPrompt = true;
                    if (banner) banner.classList.add('hidden');
                    if (typeof saveState === 'function') saveState();
                };
            }
        }
    }

    if (!state.onboardingComplete && typeof showOnboarding === 'function') {
        showOnboarding(runAppInit);
        return;
    }
    runAppInit();
};
