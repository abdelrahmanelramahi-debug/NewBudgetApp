// INIT
window.onload = function() {
    loadState();
    // Decide onboarding: use device-local flag so we don't skip onboarding when state was restored from elsewhere
    var hasSavedState = !!localStorage.getItem(STORAGE_KEYS.STATE);
    var onboardingDoneFlag = localStorage.getItem(STORAGE_KEYS.ONBOARDING_DONE);
    var forceOnboarding = typeof window.location !== 'undefined' && window.location.search.indexOf('onboarding=1') !== -1;

    if (!hasSavedState) state.onboardingComplete = false;
    if (forceOnboarding) {
        state.onboardingComplete = false;
        try { localStorage.removeItem(STORAGE_KEYS.ONBOARDING_DONE); } catch (e) {}
    }
    // Existing users: they have state with onboardingComplete true but no flag yet; set flag once so we don't show onboarding
    if (hasSavedState && state.onboardingComplete && onboardingDoneFlag === null) {
        try { localStorage.setItem(STORAGE_KEYS.ONBOARDING_DONE, '1'); onboardingDoneFlag = '1'; } catch (e) {}
    }
    var shouldShowOnboarding = !onboardingDoneFlag || !state.onboardingComplete || forceOnboarding;
    if (shouldShowOnboarding) {
        if (typeof showOnboarding === 'function') {
            showOnboarding(runAppInit);
        } else {
            // Onboarding script may have failed to load (e.g. 404, error); still show onboarding container, hide app
            var ob = document.getElementById('onboarding');
            var app = document.getElementById('app-shell');
            if (ob) ob.classList.remove('hidden');
            if (app) app.classList.add('hidden');
        }
        return;
    }

    ensureSystemSavings();
    ensureCoreItems();

    // Check for un-migrated savings or zero-balance legacy defaults
    const sys = state.categories.find(s=>s.id==='sys_savings');
    if(sys) {
        const item = sys.items.find(i=>i.label==='Savings');
        // Force update if it's auto-calculated OR if it is sitting at the old default of 0
        if(item && (item.isAutoCalculated || item.amount === 0)) {
            item.isAutoCalculated = false;
            item.amount = 1000;
            // Also update the running balance if it's 0 or undefined
            if(state.accounts?.buckets?.['Savings'] === undefined || state.accounts.buckets['Savings'] === 0) {
                state.accounts.buckets['Savings'] = 1000;
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
        if (typeof initHistoryRouting === 'function') initHistoryRouting();
        var page = (typeof getPageFromHash === 'function') ? getPageFromHash() : 'ledger';
        if (page !== 'ledger' && typeof switchPage === 'function') switchPage(page, { skipHistory: true });
        if (typeof history !== 'undefined' && history.replaceState) {
            var hash = (page === 'ledger') ? '' : '#' + page;
            var url = (window.location.pathname || '/') + (window.location.search || '') + hash;
            history.replaceState({ page: page }, '', url);
        }
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
        // Home page introductory tour: show once for new users (after onboarding)
        setTimeout(function() {
            if (state && !state._sawHomePageTour && typeof startHomeTour === 'function') startHomeTour();
        }, 600);
        // Reformat header surplus on resize (compact vs full)
        var resizeTid;
        window.addEventListener('resize', function() {
            clearTimeout(resizeTid);
            resizeTid = setTimeout(function() { if (typeof updateGlobalUI === 'function') updateGlobalUI(); }, 100);
        });
        // Auto-backup after 5 min idle (last 5 versions in localStorage)
        var idleBackupTimer;
        var activityDebounceTimer;
        function resetIdleBackupTimer() {
            clearTimeout(idleBackupTimer);
            idleBackupTimer = setTimeout(function() {
                if (typeof pushAutoBackup === 'function') pushAutoBackup();
            }, 5 * 60 * 1000);
        }
        function onIdleActivity() {
            clearTimeout(activityDebounceTimer);
            activityDebounceTimer = setTimeout(resetIdleBackupTimer, 1000);
        }
        ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(function(ev) {
            document.addEventListener(ev, onIdleActivity);
        });
        resetIdleBackupTimer();
    }

    // Onboarding complete: ensure app is visible
    var ob = document.getElementById('onboarding');
    var app = document.getElementById('app-shell');
    if (ob) ob.classList.add('hidden');
    if (app) app.classList.remove('hidden');
    // Defer first paint until auth (and cloud load if logged in) so we don't flash stale surplus (e.g. -1175) from localStorage
    if (typeof whenAuthReady === 'function') {
        whenAuthReady(runAppInit);
    } else {
        runAppInit();
    }
};
