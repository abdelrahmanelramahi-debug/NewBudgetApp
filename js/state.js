// DATA: account labels for buckets (from constants.js)
const ACCOUNT_LABELS = [ITEM_LABELS.GENERAL_SAVINGS, ITEM_LABELS.PAYABLES, ITEM_LABELS.CAR_FUND, ITEM_LABELS.WEEKLY_MISC];

let state = {
    schemaVersion: 2,
    onboardingComplete: false,
    monthlyIncome: 5000,
    settings: {
        currency: 'AED',
        decimals: 2,
        confirmSurplusEdits: true,
        allowNegativeSurplus: true,
        theme: 'sepia',
        compact: false,
        firstDayOfWeek: 3,
        payDate: 28
    },
    categories: [
        { id: 'sys_savings', label: 'Savings', isSystem: true, items: [
            { label: 'Savings', amount: 1000, isAutoCalculated: false },
            { label: 'Payables', amount: 0, isAutoCalculated: false }
        ] },
        { id: 'core_essentials', label: 'Essentials', isSystem: true, items: [
            { label: 'Weekly Allowance', amount: 400, isCore: true },
            { label: 'Daily Food', amount: 600, isCore: true },
            { label: 'Transportation', amount: 300, isCore: true }
        ]},
        { id: 'health', label: 'Health', isLedgerLinked: true, isSingleAction: true, items: [
            { label: 'Supplements', amount: 50 },
            { label: 'Protein', amount: 75 },
            { label: 'Vitamins', amount: 50 },
            { label: 'Other health', amount: 40 }
        ]},
        { id: 'groceries', label: 'Groceries', isLedgerLinked: true, isSingleAction: true, items: [
            { label: 'Staples', amount: 40 },
            { label: 'Produce', amount: 30 }
        ]},
        { id: 'misc', label: 'Misc', isLedgerLinked: true, isSingleAction: true, items: [
            { label: 'Snacks', amount: 50 },
            { label: 'Misc', amount: 30 },
            { label: 'Personal', amount: 25 },
            { label: 'Household', amount: 15 }
        ]},
        { id: 'subscriptions', label: 'Subscriptions', isLedgerLinked: true, isSingleAction: true, items: [
            { label: 'Streaming', amount: 50 },
            { label: 'App 1', amount: 20 },
            { label: 'App 2', amount: 15 },
            { label: 'Cloud', amount: 5 },
            { label: 'Sub other', amount: 15 }
        ]}
    ],
    accounts: {
        surplus: 0,
        weekly: { balance: 100, week: 1 },
        buckets: {
            'Savings': 1000,
            'Payables': 0,
            'Transportation': 300,
            'Weekly Allowance': 400
        }
    },
    balances: {
        'Supplements': 50, 'Protein': 75, 'Vitamins': 50, 'Other health': 40,
        'Staples': 40, 'Produce': 30,
        'Snacks': 50, 'Misc': 30, 'Personal': 25, 'Household': 15,
        'Streaming': 50, 'App 1': 20, 'App 2': 15, 'Cloud': 5, 'Sub other': 15
    },
    food: { daysTotal: 28, daysUsed: 0, lockedAmount: 0, history: [], viewWeek: 0 },
    histories: {}
};

// GLOBAL VARS
let dragSrc = null;
let dragType = null;
let currentAddSectionId = null;
let itemToDelete = null;
let currentAmort = { sid: null, idx: null };
let activeCat = null;
let undoStack = [];
let redoStack = [];

const WEEKLY_MAX_WEEKS = 4;

let pendingDangerAction = null;
let requiredDangerPhrase = "";
var GENERAL_SAVINGS_BUCKET_NAME = 'General Savings';

// Hard-suppression helpers for payables buckets that must never resurrect once deleted
function markPayablesBucketDeleted(name) {
    if (!name) return;
    if (!Array.isArray(state._deletedPayablesBuckets)) state._deletedPayablesBuckets = [];
    if (!state._deletedPayablesBuckets.includes(name)) state._deletedPayablesBuckets.push(name);
}

function purgeDeletedPayablesBuckets() {
    if (!state.accounts || !state.accounts.payablesBuckets) return;
    if (!Array.isArray(state._deletedPayablesBuckets) || !state._deletedPayablesBuckets.length) return;
    state._deletedPayablesBuckets.forEach(function (name) {
        if (name && state.accounts.payablesBuckets[name] !== undefined) {
            delete state.accounts.payablesBuckets[name];
        }
    });
}

function unmarkPayablesBucketDeleted(name) {
    if (!name || !Array.isArray(state._deletedPayablesBuckets)) return;
    state._deletedPayablesBuckets = state._deletedPayablesBuckets.filter(function (n) { return n !== name; });
}

// Same for savings buckets: prevent deleted/renamed buckets from respawning after sync
function markSavingsBucketDeleted(name) {
    if (!name) return;
    if (!Array.isArray(state._deletedSavingsBuckets)) state._deletedSavingsBuckets = [];
    if (!state._deletedSavingsBuckets.includes(name)) state._deletedSavingsBuckets.push(name);
}

function purgeDeletedSavingsBuckets() {
    if (!state.accounts || !state.accounts.savingsBuckets) return;
    if (!Array.isArray(state._deletedSavingsBuckets) || !state._deletedSavingsBuckets.length) return;
    state._deletedSavingsBuckets.forEach(function (name) {
        if (name && state.accounts.savingsBuckets[name] !== undefined) {
            delete state.accounts.savingsBuckets[name];
        }
    });
}

function unmarkSavingsBucketDeleted(name) {
    if (!name || !Array.isArray(state._deletedSavingsBuckets)) return;
    state._deletedSavingsBuckets = state._deletedSavingsBuckets.filter(function (n) { return n !== name; });
}

function ensureGeneralSavingsBucketState() {
    if (!state.accounts) state.accounts = {};
    if (!state.accounts.savingsBuckets || typeof state.accounts.savingsBuckets !== 'object') {
        state.accounts.savingsBuckets = {};
    }
    var buckets = state.accounts.savingsBuckets;
    // Idempotent migration: if both legacy "Main" and canonical bucket exist,
    // trust the canonical value to avoid re-adding legacy amount on each sync pull.
    var hasGeneral = buckets[GENERAL_SAVINGS_BUCKET_NAME] !== undefined;
    var hasMain = buckets['Main'] !== undefined;
    var migratedAmount = 0;
    if (hasGeneral) {
        migratedAmount = Number(buckets[GENERAL_SAVINGS_BUCKET_NAME]) || 0;
    } else if (hasMain) {
        migratedAmount = Number(buckets['Main']) || 0;
    }
    if (hasMain) delete buckets['Main'];
    buckets[GENERAL_SAVINGS_BUCKET_NAME] = migratedAmount;
    var ordered = {};
    ordered[GENERAL_SAVINGS_BUCKET_NAME] = Number(buckets[GENERAL_SAVINGS_BUCKET_NAME]) || 0;
    Object.keys(buckets).forEach(function (key) {
        if (key === GENERAL_SAVINGS_BUCKET_NAME) return;
        ordered[key] = Number(buckets[key]) || 0;
    });
    state.accounts.savingsBuckets = ordered;
    state.accounts.savingsDefaultBucket = GENERAL_SAVINGS_BUCKET_NAME;
    if (!state.accounts.savingsBudgetPlan || typeof state.accounts.savingsBudgetPlan !== 'object') {
        state.accounts.savingsBudgetPlan = {};
    }
    var planMap = {};
    planMap[GENERAL_SAVINGS_BUCKET_NAME] = Number(state.accounts.savingsBudgetPlan[GENERAL_SAVINGS_BUCKET_NAME]) || Number(state.accounts.savingsBudgetPlan['Main']) || 0;
    Object.keys(ordered).forEach(function (key) {
        if (key === GENERAL_SAVINGS_BUCKET_NAME) return;
        planMap[key] = Number(state.accounts.savingsBudgetPlan[key]) || 0;
    });
    state.accounts.savingsBudgetPlan = planMap;
    if (typeof unmarkSavingsBucketDeleted === 'function') {
        unmarkSavingsBucketDeleted(GENERAL_SAVINGS_BUCKET_NAME);
    }
}

function buildPaycheckPriorityCatalog() {
    var catalog = [];
    var seen = {};
    var fixedName = GENERAL_SAVINGS_BUCKET_NAME || 'General Savings';
    var savingsBuckets = (state.accounts && state.accounts.savingsBuckets) ? state.accounts.savingsBuckets : {};
    Object.keys(savingsBuckets).forEach(function (bucketName) {
        if (!bucketName || bucketName === fixedName) return;
        var entryId = 'savingsBucket:' + bucketName;
        if (seen[entryId]) return;
        seen[entryId] = true;
        catalog.push({
            id: entryId,
            type: 'savingsBucket',
            label: bucketName,
            title: bucketName,
            groupLabel: 'Savings Bucket',
            bucketName: bucketName
        });
    });

    var core = (state.categories || []).find(function (s) { return s && s.id === 'core_essentials'; });
    var coreItems = (core && Array.isArray(core.items)) ? core.items : [];
    coreItems.forEach(function (item) {
        if (!item || !item.label || item.label === 'Savings') return;
        var itemLabel = item.label === 'Food Base' ? 'Daily Food' : item.label;
        var entryId = 'mustHave:' + itemLabel;
        if (seen[entryId]) return;
        seen[entryId] = true;
        catalog.push({
            id: entryId,
            type: 'mustHave',
            label: itemLabel,
            title: itemLabel,
            groupLabel: 'Must Have',
            itemLabel: itemLabel
        });
    });

    (state.categories || []).forEach(function (sec) {
        if (!sec || sec.isSystem || sec.id === 'sys_savings' || sec.id === 'core_essentials') return;
        var entryId = 'mini:' + sec.id;
        if (seen[entryId]) return;
        seen[entryId] = true;
        catalog.push({
            id: entryId,
            type: 'mini',
            label: sec.label || sec.id,
            title: sec.label || sec.id,
            groupLabel: 'Mini-Budget',
            categoryId: sec.id
        });
    });
    return catalog;
}

function normalizePaycheckPriorityOrder() {
    if (!state.accounts || typeof state.accounts !== 'object') state.accounts = {};
    var catalog = buildPaycheckPriorityCatalog();
    var validIds = {};
    catalog.forEach(function (entry) { validIds[entry.id] = true; });

    var raw = Array.isArray(state.accounts.paycheckPriorityOrder) ? state.accounts.paycheckPriorityOrder : [];
    var normalized = [];
    var seen = {};
    raw.forEach(function (id) {
        if (typeof id !== 'string' || !validIds[id] || seen[id]) return;
        seen[id] = true;
        normalized.push(id);
    });
    catalog.forEach(function (entry) {
        if (seen[entry.id]) return;
        seen[entry.id] = true;
        normalized.push(entry.id);
    });
    state.accounts.paycheckPriorityOrder = normalized;
    return normalized;
}

function getPaycheckPriorityEntries() {
    var catalog = buildPaycheckPriorityCatalog();
    var byId = {};
    catalog.forEach(function (entry) { byId[entry.id] = entry; });
    var ordered = normalizePaycheckPriorityOrder();
    return ordered.map(function (id) { return byId[id]; }).filter(Boolean);
}

function markTransportationBucketDeleted(name) {
    if (!name) return;
    if (!Array.isArray(state._deletedTransportationBuckets)) state._deletedTransportationBuckets = [];
    if (!state._deletedTransportationBuckets.includes(name)) state._deletedTransportationBuckets.push(name);
}

function purgeDeletedTransportationBuckets() {
    if (!state.accounts || !state.accounts.transportationBuckets) return;
    if (!Array.isArray(state._deletedTransportationBuckets) || !state._deletedTransportationBuckets.length) return;
    state._deletedTransportationBuckets.forEach(function (name) {
        if (name && state.accounts.transportationBuckets[name] !== undefined) {
            delete state.accounts.transportationBuckets[name];
        }
    });
}

function unmarkTransportationBucketDeleted(name) {
    if (!name || !Array.isArray(state._deletedTransportationBuckets)) return;
    state._deletedTransportationBuckets = state._deletedTransportationBuckets.filter(function (n) { return n !== name; });
}

/** Returns a fresh example budget (generic defaults, not personal). Use for "Load example budget" in Settings. */
function getExampleBudget() {
    return {
        monthlyIncome: 5000,
        categories: [
            { id: 'sys_savings', label: 'Savings', isSystem: true, items: [
                { label: 'Savings', amount: 1000, isAutoCalculated: false },
                { label: 'Payables', amount: 0, isAutoCalculated: false }
            ] },
            { id: 'core_essentials', label: 'Essentials', isSystem: true, items: [
                { label: 'Weekly Allowance', amount: 400, isCore: true },
                { label: 'Daily Food', amount: 600, isCore: true },
                { label: 'Transportation', amount: 300, isCore: true }
            ]},
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
        ],
        buckets: { 'Savings': 1000, 'Payables': 0, 'Transportation': 300, 'Weekly Allowance': 400 },
        balances: {
            'Supplements': 50, 'Protein': 75, 'Vitamins': 50, 'Other health': 40,
            'Staples': 40, 'Produce': 30,
            'Snacks': 50, 'Misc': 30, 'Personal': 25, 'Household': 15,
            'Streaming': 50, 'App 1': 20, 'App 2': 15, 'Cloud': 5, 'Sub other': 15
        },
        weekly: { balance: 100, week: 1 }
    };
}

// PERSISTENCE
function saveState() {
    if (window.currentUser && typeof window.canEditNow === 'function' && !window.canEditNow()) {
        if (typeof window.promptEditLockTakeover === 'function') window.promptEditLockTakeover();
        try {
            var restoreKey = STORAGE_KEYS.STATE;
            var restoreRaw = localStorage.getItem(restoreKey);
            if (restoreRaw) {
                var restored = JSON.parse(restoreRaw);
                state = { ...state, ...restored };
                if (typeof refreshUI === 'function') refreshUI();
            }
        } catch (restoreErr) {}
        return false;
    }
    var stateKey = STORAGE_KEYS.STATE;
    var modKey = STORAGE_KEYS.MODIFIED;
    localStorage.setItem(stateKey, JSON.stringify(state));
    try { localStorage.setItem(modKey, String(Date.now())); } catch (e) {}
    // Cloud sync will be handled by auth.js if user is logged in
    return true;
}
window.saveState = saveState; // Make it globally accessible

function pushAutoBackup() {
    if (!state || typeof getCurrentBalance !== 'function') return;
    try {
        var total = getCurrentBalance();
        var clone = JSON.parse(JSON.stringify(state));
        var key = STORAGE_KEYS.AUTO_BACKUPS;
        var raw = localStorage.getItem(key);
        var list = raw ? JSON.parse(raw) : [];
        list.unshift({ savedAt: Date.now(), bankBalance: total, state: clone });
        list = list.slice(0, 5);
        localStorage.setItem(key, JSON.stringify(list));
    } catch (e) { console.error('Auto-backup failed:', e); }
}
window.pushAutoBackup = pushAutoBackup;

function loadState() {
    var stateKey = STORAGE_KEYS.STATE;
    const saved = localStorage.getItem(stateKey);
    if (saved) {
        try {
            const loaded = JSON.parse(saved);
            state = { ...state, ...loaded };
            // #region agent log
            fetch('http://127.0.0.1:7853/ingest/84e116a3-552a-4446-9ad4-b17912da8656',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9bd46d'},body:JSON.stringify({sessionId:'9bd46d',runId:'pre-fix',hypothesisId:'H4',location:'state.js:loadState:from-localStorage',message:'state loaded from local storage',data:{onboardingComplete:loaded.onboardingComplete,monthlyIncome:loaded.monthlyIncome,transportBucket:loaded.accounts&&loaded.accounts.buckets?loaded.accounts.buckets['Transportation']:null,dailyFoodBalance:loaded.balances?loaded.balances['Daily Food']:null},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
            if(typeof state.monthlyIncome === 'undefined') state.monthlyIncome = 5000;
            // Only treat as onboarding-complete when loaded state explicitly has the flag (existing users).
            // If key is missing (old schema or new device), keep default false so new users see onboarding.
            if ('onboardingComplete' in loaded) state.onboardingComplete = !!loaded.onboardingComplete;
        } catch(e) { console.error("Save data corrupt, using default"); }
    } else {
        // No saved state = first launch; always show onboarding (don't rely on default alone).
        state.onboardingComplete = false;
    }
    migrateState();
    ensureSettings();
    ensureFoodConsumedDays();
    ensureSystemSavings();
    ensureCoreItems();
    normalizePaycheckPriorityOrder();
}

function migrateLabelRename() {
    const buckets = state.accounts && state.accounts.buckets ? state.accounts.buckets : {};
    const updates = {};
    if (buckets['General Savings'] !== undefined && buckets['Savings'] === undefined) { updates['Savings'] = buckets['General Savings']; }
    if (buckets['Weekly Misc'] !== undefined && buckets['Weekly Allowance'] === undefined) { updates['Weekly Allowance'] = buckets['Weekly Misc']; }
    if (buckets['Car Fund'] !== undefined && buckets['Transportation'] === undefined) { updates['Transportation'] = buckets['Car Fund']; }
    Object.keys(updates).forEach(function (k) { state.accounts.buckets[k] = updates[k]; });
    if (buckets['General Savings'] !== undefined) delete state.accounts.buckets['General Savings'];
    if (buckets['Weekly Misc'] !== undefined) delete state.accounts.buckets['Weekly Misc'];
    if (buckets['Car Fund'] !== undefined) delete state.accounts.buckets['Car Fund'];
    (state.categories || []).forEach(function (sec) {
        if (sec.id === 'sys_savings' && sec.label === 'System Savings') sec.label = 'Savings';
        if (sec.id === 'core_essentials' && sec.label === 'Core Essentials') sec.label = 'Essentials';
        (sec.items || []).forEach(function (item) {
            if (item.label === 'General Savings') item.label = 'Savings';
            if (item.label === 'Weekly Misc') item.label = 'Weekly Allowance';
            if (item.label === 'Car Fund') item.label = 'Transportation';
            if (item.label === 'Food Base') item.label = 'Daily Food';
        });
    });
}

function migrateState() {
    const schema = state.schemaVersion || 1;
    if (schema >= 2) {
        if (!state.categories && state.strategy) {
            state.categories = state.strategy;
        }
        if (!state.accounts) {
            state.accounts = {
                surplus: state.surplus || 0,
                weekly: state.weekly || { balance: getWeeklyConfigAmount(), week: 1 },
                buckets: {},
                savingsBuckets: {},
                payablesBuckets: {},
                transportationBuckets: {}
            };
        }
        if (!state.accounts.buckets) state.accounts.buckets = {};
        migrateLabelRename();
        if (!state.accounts.savingsBuckets) {
            const seed = state.accounts.buckets['Savings'] ?? 0;
            state.accounts.savingsBuckets = { 'General Savings': seed };
        }
        if (!state.accounts.savingsDefaultBucket) {
            state.accounts.savingsDefaultBucket = 'General Savings';
        }
        ensureGeneralSavingsBucketState();
        if (!state.accounts.payablesBuckets) {
            const seed = state.accounts.buckets['Payables'] ?? 0;
            state.accounts.payablesBuckets = { Main: seed };
        }
        if (!state.accounts.payablesDefaultBucket) {
            state.accounts.payablesDefaultBucket = 'Main';
        }
        if (!state.accounts.transportationBuckets) {
            const seed = state.accounts.buckets['Transportation'] ?? 0;
            state.accounts.transportationBuckets = { Main: seed };
        }
        if (!state.accounts.transportationDefaultBucket) {
            state.accounts.transportationDefaultBucket = 'Main';
        }
        ACCOUNT_LABELS.forEach(label => {
            if (state.accounts.buckets[label] === undefined) {
                const legacy = state.balances?.[label];
                if (legacy !== undefined) state.accounts.buckets[label] = legacy;
            }
        });
        if (!state.balances) state.balances = {};

        // Initialize deleted-bucket trackers used to hard-suppress resurrected buckets from
        // any stale source (cloud, local backup, or old tabs).
        if (!Array.isArray(state._deletedPayablesBuckets)) state._deletedPayablesBuckets = [];
        if (!Array.isArray(state._deletedSavingsBuckets)) state._deletedSavingsBuckets = [];
        if (!Array.isArray(state._deletedTransportationBuckets)) state._deletedTransportationBuckets = [];
        ACCOUNT_LABELS.forEach(label => {
            if (state.balances[label] !== undefined) delete state.balances[label];
        });
        normalizePaycheckPriorityOrder();
        state.schemaVersion = 2;
        return;
    }

    const legacyStrategy = state.strategy || state.categories || [];
    const legacyBalances = state.balances || {};
    const legacyWeekly = state.weekly || { balance: getWeeklyConfigAmount(), week: 1 };

    const buckets = {
        'Savings': legacyBalances['General Savings'] ?? legacyBalances['Savings'] ?? 0,
        'Payables': legacyBalances['Payables'] ?? 0,
        'Transportation': legacyBalances['Car Fund'] ?? legacyBalances['Transportation'] ?? 0,
        'Weekly Allowance': legacyBalances['Weekly Misc'] ?? legacyBalances['Weekly Allowance'] ?? 0
    };

    state = {
        ...state,
        schemaVersion: 2,
        categories: legacyStrategy,
        accounts: {
            surplus: state.surplus || 0,
            weekly: legacyWeekly,
            buckets: buckets,
            savingsBuckets: {
                'General Savings': buckets['Savings']
            },
            savingsDefaultBucket: 'General Savings',
            savingsBudgetPlan: {
                'General Savings': buckets['Savings']
            },
            payablesBuckets: {
                Main: buckets['Payables'] ?? 0
            },
            payablesDefaultBucket: 'Main',
            transportationBuckets: {
                Main: buckets['Transportation'] ?? 0
            },
            transportationDefaultBucket: 'Main'
        },
        balances: Object.keys(legacyBalances).reduce((acc, key) => {
            if (!ACCOUNT_LABELS.includes(key)) acc[key] = legacyBalances[key];
            return acc;
        }, {}),
        food: state.food || { daysTotal: 28, daysUsed: 0, lockedAmount: 0, history: [], viewWeek: 0 },
        histories: state.histories || {}
    };
    if (!Array.isArray(state._deletedPayablesBuckets)) state._deletedPayablesBuckets = [];
    if (!Array.isArray(state._deletedSavingsBuckets)) state._deletedSavingsBuckets = [];
    if (!Array.isArray(state._deletedTransportationBuckets)) state._deletedTransportationBuckets = [];
    ensureGeneralSavingsBucketState();
    normalizePaycheckPriorityOrder();
}

function isAccountLabel(label) {
    return ACCOUNT_LABELS.includes(label);
}

function ensureSettings() {
    const defaults = {
        currency: 'AED',
        decimals: 2,
        confirmSurplusEdits: true,
        allowNegativeSurplus: true,
        theme: 'sepia',
        compact: false,
        firstDayOfWeek: 3,
        payDate: 28,
        hideEmptyCategories: false,
        categorySort: 'default'
    };
    if(!state.settings) state.settings = { ...defaults };
    state.settings = { ...defaults, ...state.settings };
    if (typeof state.settings.decimals !== 'number' || Number.isNaN(state.settings.decimals)) {
        state.settings.decimals = 2;
    }
    if (typeof state.settings.firstDayOfWeek !== 'number' || state.settings.firstDayOfWeek < 0 || state.settings.firstDayOfWeek > 6) {
        state.settings.firstDayOfWeek = 3;
    }
    var pd = state.settings.payDate;
    if (typeof pd !== 'number' || pd < 1 || pd > 31) {
        state.settings.payDate = 28;
    }
    // These protections are now fixed on.
    state.settings.confirmSurplusEdits = true;
    state.settings.allowNegativeSurplus = true;
}

function ensureFoodConsumedDays() {
    if (!state.food) state.food = { daysTotal: 28, daysUsed: 0, lockedAmount: 0, history: [], viewWeek: 0 };
    if (!Array.isArray(state.food.consumedDays)) {
        var n = Math.max(0, Math.min(28, Math.floor(state.food.daysUsed || 0)));
        state.food.consumedDays = [];
        for (var i = 1; i <= n; i++) state.food.consumedDays.push(i);
    }
    if (!state.food.overflowUsage || typeof state.food.overflowUsage !== 'object') {
        state.food.overflowUsage = {};
    }
    if (typeof state.food.redistributedExtraDays !== 'number' || Number.isNaN(state.food.redistributedExtraDays)) {
        state.food.redistributedExtraDays = 0;
    }
    if (typeof state.food.lastCycleStartKey !== 'string') {
        state.food.lastCycleStartKey = '';
    }
    state.food.daysUsed = state.food.consumedDays.length;
}

function ensureSystemSavings() {
    let sys = state.categories.find(s => s.id === 'sys_savings');
    if(!sys) {
        state.categories.unshift({
            id: 'sys_savings',
            label: 'Savings',
            isSystem: true,
            items: [
                { label: 'Savings', amount: 1000, isAutoCalculated: false },
                { label: 'Payables', amount: 0, isAutoCalculated: false }
            ]
        });
    } else {
        const savings = sys.items.find(i => i.label === 'Savings');
        if (!savings) {
            sys.items.unshift({ label: 'Savings', amount: 1000, isAutoCalculated: false });
        }
        const payables = sys.items.find(i => i.label === 'Payables');
        if (!payables) {
            sys.items.push({ label: 'Payables', amount: 0, isAutoCalculated: false });
        }
    }
}

function ensureCoreItems() {
    var coreId = SECTION_IDS.CORE_ESSENTIALS;
    let core = state.categories.find(s => s.id === coreId);

    if (!core) {
        state.categories.splice(1, 0, {
            id: coreId,
            label: 'Essentials',
            isSystem: true,
            items: [
                { label: 'Weekly Allowance', amount: 400, isCore: true },
                { label: 'Daily Food', amount: 600, isCore: true },
                { label: 'Transportation', amount: 300, isCore: true }
            ]
        });
    } else {
        const car = core.items.find(i => i.label === 'Transportation');
        if (!car) {
            core.items.push({ label: 'Transportation', amount: 300, isCore: true });
        }
    }

    state.categories.forEach(sec => {
        if (sec.id !== coreId) {
            sec.items = sec.items.filter(i =>
                i.label !== ITEM_LABELS.WEEKLY_MISC &&
                i.label !== ITEM_LABELS.FOOD_BASE &&
                i.label !== ITEM_LABELS.CAR_FUND
            );
        }
    });
    normalizePaycheckPriorityOrder();
}

function getWeeklyConfigAmount() {
    var cid = SECTION_IDS.CORE_ESSENTIALS;
    var wlabel = ITEM_LABELS.WEEKLY_MISC;
    const misc = state.categories.find(s=>s.id===cid)?.items.find(i=>i.label===wlabel);
    const fullAmt = misc ? misc.amount : 400;
    return fullAmt / 4;
}

function ensureWeeklyState() {
    const weeklyAmt = getWeeklyConfigAmount();
    if (!state.accounts) {
        state.accounts = { surplus: 0, weekly: { balance: weeklyAmt, week: 1, balances: [weeklyAmt, weeklyAmt, weeklyAmt, weeklyAmt] }, buckets: {} };
    }
    if (!state.accounts.weekly) {
        state.accounts.weekly = { balance: weeklyAmt, week: 1, balances: [weeklyAmt, weeklyAmt, weeklyAmt, weeklyAmt] };
    }
    // Each week has its own allocation; migrate old single-balance to per-week (once only)
    if (!Array.isArray(state.accounts.weekly.balances) || state.accounts.weekly.balances.length !== WEEKLY_MAX_WEEKS) {
        const cur = Math.max(1, Math.min(state.accounts.weekly.week || 1, WEEKLY_MAX_WEEKS));
        const oldBal = typeof state.accounts.weekly.balance === 'number' ? state.accounts.weekly.balance : weeklyAmt;
        state.accounts.weekly.balances = [weeklyAmt, weeklyAmt, weeklyAmt, weeklyAmt];
        state.accounts.weekly.balances[cur - 1] = Math.max(0, oldBal);
    }
    // One-time fix: corrupted all-zero balances from earlier bug (so each week shows its allocation)
    if (!state.accounts.weekly._zeroFixed) {
        const sum = (state.accounts.weekly.balances[0] || 0) + (state.accounts.weekly.balances[1] || 0) + (state.accounts.weekly.balances[2] || 0) + (state.accounts.weekly.balances[3] || 0);
        if (sum === 0 && weeklyAmt > 0) {
            state.accounts.weekly.balances = [weeklyAmt, weeklyAmt, weeklyAmt, weeklyAmt];
        }
        state.accounts.weekly._zeroFixed = true;
    }
    // Source of truth is balances[]; only read from it for display
    state.accounts.weekly.balance = state.accounts.weekly.balances[state.accounts.weekly.week - 1];
    if (typeof state.accounts.weekly.week !== 'number' || Number.isNaN(state.accounts.weekly.week)) {
        state.accounts.weekly.week = 1;
    }
    state.accounts.weekly.week = Math.min(WEEKLY_MAX_WEEKS, Math.max(1, Math.round(state.accounts.weekly.week)));
    if (typeof state.accounts.weekly.lastAutoWeekKey !== 'string') {
        state.accounts.weekly.lastAutoWeekKey = '';
    }
    if (!state.accounts.weekly.pendingRolloverNotice || typeof state.accounts.weekly.pendingRolloverNotice !== 'object') {
        state.accounts.weekly.pendingRolloverNotice = null;
    }
}

/** Current or specified week balance (week 1–4). */
function getWeeklyBalance(weekNum) {
    ensureWeeklyState();
    const w = weekNum != null ? Math.min(WEEKLY_MAX_WEEKS, Math.max(1, Math.round(weekNum))) : state.accounts.weekly.week;
    const bal = state.accounts.weekly.balances[w - 1];
    return typeof bal === 'number' && !Number.isNaN(bal) ? bal : 0;
}

function setWeeklyBalance(weekNum, value) {
    ensureWeeklyState();
    const w = Math.min(WEEKLY_MAX_WEEKS, Math.max(1, Math.round(weekNum)));
    state.accounts.weekly.balances[w - 1] = Math.max(0, value);
    if (w === state.accounts.weekly.week) state.accounts.weekly.balance = state.accounts.weekly.balances[w - 1];
}

function getFoodRemainderInfo() {
    var cid = SECTION_IDS.CORE_ESSENTIALS;
    var fid = SECTION_IDS.FOUNDATIONS;
    var flabel = ITEM_LABELS.FOOD_BASE;
    const fSec = state.categories.find(s=>s.id===cid) || state.categories.find(s=>s.id===fid);
    // Use "Daily Food" for the food budget line.
    const fItem = fSec ? fSec.items.find(i=>i.label===flabel) : null;
    const foodBase = fItem ? fItem.amount : 0;
    var redistributed = Math.max(0, Math.floor((state.food && state.food.redistributedExtraDays) || 0));
    var effectiveDaysTotal = (state.food.daysTotal || 28) + redistributed;
    const daysLeft = Math.max(0, effectiveDaysTotal - state.food.daysUsed);
    const dailyRate = effectiveDaysTotal > 0 ? (foodBase / effectiveDaysTotal) : 0;
    const theoreticalRemainder = daysLeft * dailyRate;
    // Cap by actual Daily Food balance so we don't show "money" until salary has been distributed
    var foodBalance = (state.balances && state.balances['Daily Food'] !== undefined) ? Number(state.balances['Daily Food']) : 0;
    if (foodBalance < 0) foodBalance = 0;
    const remainder = Math.min(theoreticalRemainder, foodBalance);
    return { fItem, foodBase, daysLeft, dailyRate, remainder };
}

function initSurplusFromOpening() {
    let allocated = 0;
    if (!state.accounts) {
        state.accounts = { surplus: 0, weekly: { balance: getWeeklyConfigAmount(), week: 1 }, buckets: {} };
    }
    if (!state.accounts.buckets) state.accounts.buckets = {};
    if (!state.accounts.savingsBuckets) {
        state.accounts.savingsBuckets = { 'General Savings': state.accounts.buckets['Savings'] ?? 0 };
    }
    if (!state.accounts.savingsDefaultBucket) {
        state.accounts.savingsDefaultBucket = 'General Savings';
    }
    ensureGeneralSavingsBucketState();
    if (!state.accounts.payablesBuckets) {
        state.accounts.payablesBuckets = { Main: state.accounts.buckets['Payables'] ?? 0 };
    }
    if (!state.accounts.payablesDefaultBucket) {
        state.accounts.payablesDefaultBucket = 'Main';
    }
    if (!state.accounts.transportationBuckets) {
        state.accounts.transportationBuckets = { Main: state.accounts.buckets['Transportation'] ?? 0 };
    }
    if (!state.accounts.transportationDefaultBucket) {
        state.accounts.transportationDefaultBucket = 'Main';
    }

    // After any ensure/migration, force-remove buckets the user has explicitly deleted.
    purgeDeletedPayablesBuckets();
    if (typeof purgeDeletedSavingsBuckets === 'function') purgeDeletedSavingsBuckets();
    if (typeof purgeDeletedTransportationBuckets === 'function') purgeDeletedTransportationBuckets();

    state.categories.forEach(sec => {
        sec.items.forEach(item => {
            allocated += item.amount;
            if (isAccountLabel(item.label)) {
                if (state.accounts.buckets[item.label] === undefined) {
                    state.accounts.buckets[item.label] = item.amount;
                }
            } else if (state.balances[item.label] === undefined) {
                // Do not pre-fill Daily Food: it is funded by Distribute, so start at 0 until user distributes.
                if (item.label !== ITEM_LABELS.FOOD_BASE && item.label !== 'Daily Food') {
                    state.balances[item.label] = item.amount;
                }
            }
        });
    });
    state.accounts.surplus = state.monthlyIncome - allocated;
}

// UNDO SYSTEM
function pushToUndo() {
    if (undoStack.length > 50) undoStack.shift();
    undoStack.push(JSON.stringify(state));
    redoStack.length = 0;
    updateUndoButtonUI();
    updateRedoButtonUI();
}

function globalUndo() {
    if (undoStack.length === 0) return;
    redoStack.push(JSON.stringify(state));
    const prevState = undoStack.pop();
    state = JSON.parse(prevState);
    saveState();
    if (typeof refreshUI === 'function') refreshUI();
    updateUndoButtonUI();
    updateRedoButtonUI();
    document.querySelectorAll('.modal-overlay').forEach(el => toggleModal(el.id, false));
}

function globalRedo() {
    if (redoStack.length === 0) return;
    undoStack.push(JSON.stringify(state));
    const nextState = redoStack.pop();
    state = JSON.parse(nextState);
    saveState();
    if (typeof refreshUI === 'function') refreshUI();
    updateUndoButtonUI();
    updateRedoButtonUI();
    document.querySelectorAll('.modal-overlay').forEach(el => toggleModal(el.id, false));
}

function updateUndoButtonUI() {
    const btn = document.getElementById('global-undo-btn');
    if(btn) {
        if(undoStack.length > 0) {
            btn.classList.remove('opacity-30', 'pointer-events-none');
        } else {
            btn.classList.add('opacity-30', 'pointer-events-none');
        }
    }
}

function updateRedoButtonUI() {
    const btn = document.getElementById('global-redo-btn');
    if(btn) {
        if(redoStack.length > 0) {
            btn.classList.remove('opacity-30', 'pointer-events-none');
        } else {
            btn.classList.add('opacity-30', 'pointer-events-none');
        }
    }
}

function logHistory(cat, amt, res, note) {
    if(!state.histories[cat]) state.histories[cat] = [];
    state.histories[cat].unshift({amt, res, time: 'Now', note: (note && String(note).trim()) || ''});
}
