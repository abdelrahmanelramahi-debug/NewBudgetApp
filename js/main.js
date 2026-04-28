// INIT
window.onload = function() {
    var byId = (typeof getEl === 'function')
        ? getEl
        : function(id) { return document.getElementById(id); };

    function bindClick(id, handler) {
        var el = byId(id);
        if (!el) return;
        el.addEventListener('click', handler);
    }

    function bindInput(id, handler) {
        var el = byId(id);
        if (!el) return;
        el.addEventListener('input', handler);
    }

    function getWeeklyTransferPrefillValue() {
        var input = byId('weekly-inline-val');
        return input ? input.value : '';
    }

    function wireStaticClickActions() {
        bindClick('onboarding-currency-back', function () { onboardingBack(); });
        bindClick('onboarding-currency-next', function () { onboardingNext(); });
        bindClick('onboarding-income-back', function () { onboardingBack(); });
        bindClick('onboarding-income-next', function () { onboardingNext(); });
        bindInput('onboarding-cat-total-input', function (event) { updateOnboardingBudgetTotal(event.target.value); });
        bindClick('onboarding-categories-back', function () { onboardingBack(); });
        bindClick('onboarding-categories-next', function () { onboardingNext(); });
        bindClick('onboarding-priority-back', function () { onboardingBack(); });
        bindClick('onboarding-priority-next', function () { onboardingNext(); });
        bindClick('onboarding-summary-edit-currency', function () { showOnboardingStep(1); });
        bindClick('onboarding-summary-edit-income', function () { showOnboardingStep(2); });
        bindClick('onboarding-summary-edit-categories', function () { showOnboardingStep(3); });
        bindClick('onboarding-summary-edit-priority', function () { showOnboardingStep(4); });
        bindClick('onboarding-summary-signin', function () { onboardingOpenAuth(); });
        bindClick('onboarding-summary-skip', function () { onboardingSkipAccount(); });
        bindClick('onboarding-summary-complete', function () { onboardingComplete(); });
        bindClick('onboarding-tip-skip', function () { skipBudgetPlanTips(); });
        bindClick('onboarding-tip-next', function () { nextBudgetPlanTip(); });

        document.querySelectorAll('[data-nav-page]').forEach(function (el) {
            el.addEventListener('click', function () {
                switchPage(el.getAttribute('data-nav-page'));
                closeSideMenu();
            });
        });

        document.querySelectorAll('[data-theme-value]').forEach(function (el) {
            el.addEventListener('click', function () {
                setThemeFromSidebar(el.getAttribute('data-theme-value'));
            });
        });

        bindClick('desktop-bug-report', function () { openBugReportModal(); closeSideMenu(); });
        bindClick('desktop-sign-out-btn', function () { signOut(); });
        bindClick('mobile-menu-open', function () { toggleSideMenu(); });
        bindClick('side-menu-backdrop', function () { closeSideMenu(); });
        bindClick('mobile-menu-close', function () { closeSideMenu(); });
        bindClick('mobile-bug-report', function () { openBugReportModal(); closeSideMenu(); });
        bindClick('home-tour-skip-btn', function () { skipHomeTour(); });
        bindClick('home-tour-next-btn', function () { nextHomeTourStep(); });

        bindClick('paycheck-trigger-btn', function () { togglePaycheckPanel(); });
        bindClick('paycheck-distribute-btn', function () { applyPaycheckDistribute(); });
        bindClick('paycheck-close-btn', function () { togglePaycheckPanel(); });
        bindClick('food-unused-transfer-btn', function (event) { openFoodRolloverNoticePopover(event); });
        bindClick('food-actions-btn', function (event) { openDailyFoodActionsMenu(event); });
        bindClick('food-actions-set-start-date', function () { openDailyFoodPayDayModal(); });
        bindClick('food-actions-refund-days', function () { openDailyFoodBulkRefillModal(); });
        bindClick('food-actions-close', function () { closeDailyFoodActionsMenu(); });
        bindClick('food-day-mobile-backdrop', function () { closeFoodDayMobileModal(); });
        bindClick('food-day-mobile-close', function () { closeFoodDayMobileModal(); });
        bindClick('food-overflow-mobile-backdrop', function () { closeOverflowDayMobileModal(); });
        bindClick('food-overflow-mobile-close', function () { closeOverflowDayMobileModal(); });
        bindClick('daily-food-actions-backdrop', function () { closeDailyFoodActionsMenu(); });
        bindClick('daily-food-actions-close-icon', function () { closeDailyFoodActionsMenu(); });
        bindClick('daily-food-actions-bulk-refill', function () { openDailyFoodBulkRefillModal(); });
        bindClick('daily-food-actions-close-btn', function () { closeDailyFoodActionsMenu(); });
        bindClick('daily-food-bulk-backdrop', function () { closeDailyFoodBulkRefillModal(); });
        bindClick('daily-food-bulk-close', function () { closeDailyFoodBulkRefillModal(); });
        bindClick('daily-food-select-all-btn', function () { selectAllConsumedDaysForBulkRefill(); });
        bindClick('daily-food-bulk-cancel', function () { closeDailyFoodBulkRefillModal(); });
        bindClick('daily-food-bulk-apply', function () { applyDailyFoodBulkRefill(); });
        bindClick('daily-food-payday-backdrop', function () { closeDailyFoodPayDayModal(); });
        bindClick('daily-food-payday-close', function () { closeDailyFoodPayDayModal(); });
        bindClick('daily-food-payday-cancel', function () { closeDailyFoodPayDayModal(); });
        bindClick('daily-food-payday-apply', function () { applyFoodStartDateFromMenu(); });

        bindClick('budget-plan-back-btn', function () { switchPage('ledger'); });
        bindClick('profile-back-btn', function () { switchPage('ledger'); });
        bindClick('settings-back-btn', function () { switchPage('ledger'); });
        bindClick('profile-auth-open-btn', function () { openAuthModal(); });
        bindClick('sign-out-btn', function () { signOut(); });
        bindClick('settings-setup-again-btn', function () { showOnboarding(function () { refreshUI(); }); });
        bindClick('settings-export-btn', function () { exportState(); });
        bindClick('settings-import-btn', function () { triggerImport(); });
        bindClick('settings-rebuild-btn', function () { rebuildTotals(); });
        bindClick('settings-reset-btn', function () { resetAppData(); });
        bindClick('bug-report-close-btn', function () { closeBugReportModal(); });
        bindClick('bug-report-submit', function () { submitBugReport(); });
        bindClick('import-backup-close-btn', function () { closeImportBackupModal(); });
        bindClick('import-backup-open-file-btn', function () { document.getElementById('settings-import-file').click(); });
        bindClick('reality-check-close-btn', function () { closeRealityCheck(); });
        bindClick('reality-check-confirm-btn', function () { confirmRealityCheck(); });
        bindClick('liquidity-breakdown-close-btn', function () { closeLiquidityBreakdown(); });
        bindClick('savings-buckets-close-btn', function () { closeSavingsBuckets(); });
        bindClick('savings-buckets-create-btn', function () { createSavingsBucket(); });
        bindClick('transportation-buckets-close-btn', function () { closeTransportationBuckets(); });
        bindClick('transportation-buckets-create-btn', function () { createTransportationBucket(); });
        bindClick('payables-buckets-close-btn', function () { closePayablesBuckets(); });
        bindClick('payables-buckets-create-btn', function () { createPayablesBucket(); });
        bindClick('bucket-transfer-close-btn', function () { closeBucketTransferModal(); });
        bindClick('bucket-transfer-delete-btn', function () { deleteBucketFromTransferModal(); });
        bindClick('deficit-close-btn', function () { closeDeficitModal(); });
        bindClick('tool-close-btn', function () { closeTool(); });
        bindClick('amortization-close-btn', function () { closeAmortizationTool(); });
        bindClick('amortization-save-btn', function () { confirmEditItem(); });
        bindClick('danger-cancel-btn', function () { closeDangerModal(); });
        bindClick('danger-confirm-btn', function () { confirmDangerAction(); });
        bindClick('delete-cancel-btn', function () { closeDeleteModal(); });
        bindClick('delete-confirm-btn', function () { confirmDelete(); });
        bindClick('auth-close-btn', function () { closeAuthModal(); });
        bindClick('auth-forgot-password-btn', function () { handleForgotPassword(); });
        bindClick('auth-sign-in-btn', function () { handleSignIn(); });
        bindClick('auth-sign-up-btn', function () { handleSignUp(); });
        bindClick('add-item-close-btn', function () { closeAddItemTool(); });
        bindClick('add-item-confirm-btn', function () { confirmAddItem(); });
        bindClick('add-category-close-btn', function () { closeAddCategoryTool(); });
        bindClick('add-category-confirm-btn', function () { confirmAddCategory(); });

        bindClick('deficit-trigger-resolve-btn', function () { openDeficitModal(); });
        bindClick('surplus-controls-toggle', function () { toggleSurplusControls(); });
        bindClick('global-undo-btn', function () { globalUndo(); });
        bindClick('global-redo-btn', function () { globalRedo(); });
        bindClick('surplus-add-btn', function () { adjustGlobalSurplus(1); });
        bindClick('surplus-deduct-btn', function () { adjustGlobalSurplus(-1); });
        bindClick('surplus-transfer-btn', function () { openTool('Surplus', 'Extra Fund', true); });
        bindClick('surplus-controls-resolve', function () { openDeficitModal(); });

        bindClick('bank-balance-info-btn', function () {
            var info = byId('bank-balance-info');
            if (info) info.classList.toggle('hidden');
        });
        bindClick('bank-balance-filter-btn', function () { toggleBankBalanceFilterDropdown(); });
        bindClick('bank-balance-breakdown-btn', function () { openLiquidityBreakdown(); });
        bindClick('bank-balance-select-all-btn', function () { bankBalanceFilterSelectAll(); });
        var bankBalanceGroupsRoot = byId('bank-balance-bar') ? byId('bank-balance-bar').parentElement : null;
        if (bankBalanceGroupsRoot) {
            bankBalanceGroupsRoot.addEventListener('change', function (event) {
                var input = event.target;
                if (!input || input.tagName !== 'INPUT' || input.type !== 'checkbox') return;
                if (!input.id || input.id.indexOf('bb-filter-') !== 0) return;
                var group = input.id.replace('bb-filter-', '');
                if (!group) return;
                onBankBalanceFilterChanged(group, input.checked);
            });
            bankBalanceGroupsRoot.addEventListener('click', function (event) {
                var trigger = event.target.closest('[data-bb-group]');
                if (!trigger || !bankBalanceGroupsRoot.contains(trigger)) return;
                var group = trigger.getAttribute('data-bb-group');
                if (!group) return;
                if (event.target.closest('input, label') && trigger.tagName === 'DIV') return;
                toggleBankBalanceGroup(group);
            });
        }

        bindClick('weekly-rollover-notice-btn', function () { showWeeklyRolloverNotice(); });
        bindClick('prev-week-btn', function () { prevWeek(); });
        bindClick('next-week-btn', function () { nextWeek(); });
        bindClick('weekly-manage-btn', function () { openTool('Weekly Allowance', 'Weekly Allowance'); });
        bindClick('weekly-spend-btn', function () { inlineWeeklyAdjust(-1); });
        bindClick('weekly-transfer-btn', function () { openTool('Weekly Allowance', 'Weekly Allowance', true, getWeeklyTransferPrefillValue()); });

        bindClick('tool-action-deduct-btn', function () { executeAction('deduct'); });
        bindClick('tool-action-add-btn', function () { executeAction('add'); });
        bindClick('tool-action-transfer-btn', function () { toggleTransferMode(); });
        bindClick('tool-action-receive-btn', function () { executeAction('receive'); });
    }

    loadState();
    normalizeMoneyPrecision();
    applySettings();
    wireStaticClickActions();
    var forceOnboarding = typeof window.location !== 'undefined' && window.location.search.indexOf('onboarding=1') !== -1;

    function prepareAppStateBeforeRender() {
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
        if ((state.schemaVersion || 1) < 2 &&
            state.accounts.surplus === 0 &&
            (hasBalances || hasBuckets || hasCategories) &&
            typeof recalculateSurplusFromReality === 'function') {
            recalculateSurplusFromReality();
        } else if (state.accounts.surplus === 0 && !hasBalances && !hasBuckets) {
            state.accounts.surplus = state.monthlyIncome;
            initSurplusFromOpening();
        }
    }

    function shouldShowOnboardingAfterAuth() {
        // Decide onboarding after auth/cloud load, so returning signed-in users do not briefly see setup.
        var hasSavedState = !!localStorage.getItem(STORAGE_KEYS.STATE);
        var onboardingDoneFlag = localStorage.getItem(STORAGE_KEYS.ONBOARDING_DONE);

        if (forceOnboarding) {
            state.onboardingComplete = false;
            try { localStorage.removeItem(STORAGE_KEYS.ONBOARDING_DONE); } catch (e) {}
            return true;
        }
        if (!hasSavedState && !window.currentUser) state.onboardingComplete = false;
        if (state.onboardingComplete) {
            if (onboardingDoneFlag === null) {
                try { localStorage.setItem(STORAGE_KEYS.ONBOARDING_DONE, '1'); } catch (e2) {}
            }
            return false;
        }
        return !onboardingDoneFlag || !state.onboardingComplete;
    }

    function renderInitialShell() {
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
    }

    function wireAmortizationInputs() {
        var amortTotal = byId('amort-total');
        var amortMonths = byId('amort-months');
        if (amortTotal) amortTotal.oninput = updateAmortCalc;
        if (amortMonths) amortMonths.oninput = updateAmortCalc;
    }

    function wireAddItemInputs() {
        var amt = byId('new-item-amount');
        var mo = byId('new-item-split-months');
        if (amt && typeof updateAddItemCalc === 'function') amt.oninput = updateAddItemCalc;
        if (mo && typeof updateAddItemCalc === 'function') mo.oninput = updateAddItemCalc;
    }

    function wireFirstActionPrompt() {
        if (!state._showFirstActionPrompt) return;
        var banner = byId('first-action-prompt');
        var dismissBtn = byId('first-action-dismiss');
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

    function wireResizeRefresh() {
        var resizeTid;
        window.addEventListener('resize', function() {
            clearTimeout(resizeTid);
            resizeTid = setTimeout(function() { if (typeof updateGlobalUI === 'function') updateGlobalUI(); }, 100);
        });
    }

    function scheduleHomeTour() {
        setTimeout(function() {
            if (state && !state._sawHomePageTour && typeof startHomeTour === 'function') startHomeTour();
        }, 600);
    }

    function wireIdleRefreshAndBackup() {
        // Auto-backup + "refresh recommended" after 5 min idle.
        // Goal: when you return after laptop sleep / tab idling, refresh so we pull latest cloud state
        // and avoid accidental stale-session edits overwriting other device inputs.
        var idleBackupTimer;
        var idleRefreshTimer;
        var activityDebounceTimer;
        var lastInteractionAt = Date.now();
        var refreshPromptRecentlyShown = false;
        var IDLE_MS = 5 * 60 * 1000;
        var REFRESH_PROMPT_KEY = 'bubudget_refresh_prompt_shown_at_v1';

        function resetIdleBackupTimer() {
            clearTimeout(idleBackupTimer);
            idleBackupTimer = setTimeout(function() {
                if (typeof pushAutoBackup === 'function') pushAutoBackup();
            }, IDLE_MS);
        }

        function maybeShowRefreshPrompt() {
            if (refreshPromptRecentlyShown) return;
            if (typeof showAppConfirm !== 'function') return;
            if (typeof document === 'undefined') return;
            if (document.visibilityState !== 'visible') return;

            var now = Date.now();
            var lastShown = 0;
            try {
                lastShown = parseInt((sessionStorage && sessionStorage.getItem(REFRESH_PROMPT_KEY)) || '0', 10) || 0;
            } catch (e) {}

            if (lastShown && (now - lastShown) < IDLE_MS) return;
            refreshPromptRecentlyShown = true;
            try { sessionStorage && sessionStorage.setItem(REFRESH_PROMPT_KEY, String(now)); } catch (e2) {}

            showAppConfirm(
                'You have been away for a while. Refresh to load the latest budget and clear any saved draft changes.',
                function onConfirm() {
                    try { window.location.reload(); } catch (e) {}
                },
                null,
                {
                    title: 'Refresh needed',
                    confirmLabel: 'Refresh',
                    hideIcon: true,
                    hideCancel: true
                }
            );
        }

        function resetIdleRefreshTimer() {
            clearTimeout(idleRefreshTimer);
            idleRefreshTimer = setTimeout(function() {
                maybeShowRefreshPrompt();
            }, IDLE_MS);
        }

        function onIdleActivity() {
            lastInteractionAt = Date.now();
            clearTimeout(activityDebounceTimer);
            activityDebounceTimer = setTimeout(function() {
                resetIdleBackupTimer();
                resetIdleRefreshTimer();
            }, 1000);
        }

        ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(function(ev) {
            document.addEventListener(ev, onIdleActivity);
        });
        document.addEventListener('visibilitychange', function() {
            if (document.visibilityState !== 'visible') return;
            if (refreshPromptRecentlyShown) return;
            var idleMs = Date.now() - lastInteractionAt;
            if (idleMs >= IDLE_MS) maybeShowRefreshPrompt();
        });
        resetIdleBackupTimer();
        resetIdleRefreshTimer();
    }

    function runAppInit() {
        prepareAppStateBeforeRender();
        var ob = byId('onboarding');
        var app = byId('app-shell');
        if (ob) ob.classList.add('hidden');
        if (app) app.classList.remove('hidden');
        if (typeof initHistoryRouting === 'function') initHistoryRouting();
        var page = (typeof getPageFromHash === 'function') ? getPageFromHash() : 'ledger';
        if (page !== 'ledger' && typeof switchPage === 'function') switchPage(page, { skipHistory: true });
        if (typeof history !== 'undefined' && history.replaceState) {
            var hash = (page === 'ledger') ? '' : '#' + page;
            var url = (window.location.pathname || '/') + (window.location.search || '') + hash;
            history.replaceState({ page: page }, '', url);
        }
        renderInitialShell();
        wireAmortizationInputs();
        wireAddItemInputs();
        wireFirstActionPrompt();
        scheduleHomeTour();
        wireResizeRefresh();
        wireIdleRefreshAndBackup();
    }

    var ob = byId('onboarding');
    var app = byId('app-shell');
    if (ob) ob.classList.add('hidden');
    if (app) app.classList.add('hidden');
    function decideOnboardingAndStart() {
        if (shouldShowOnboardingAfterAuth()) {
            if (typeof showOnboarding === 'function') {
                showOnboarding(runAppInit);
            } else {
                runAppInit();
            }
            return;
        }
        runAppInit();
    }
    // Defer first paint until auth (and cloud load if logged in) so we don't flash stale surplus (e.g. -1175) from localStorage
    if (typeof whenAuthReady === 'function') {
        whenAuthReady(decideOnboardingAndStart);
    } else {
        decideOnboardingAndStart();
    }
};
