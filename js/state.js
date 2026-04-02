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
    food: { daysTotal: 28, daysUsed: 0, lockedAmount: 0, history: [], viewWeek: 0, fundedAmountByDay: {}, _foodFundingMigrated: false },
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
function isLegacySavingsBucketAlias(name) {
    return String(name || '').trim().toLowerCase() === 'savings';
}

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
    var aliasKey = null;
    Object.keys(buckets).forEach(function (key) {
        if (aliasKey) return;
        if (isLegacySavingsBucketAlias(key)) aliasKey = key;
    });
    var hasLegacySavingsAlias = aliasKey !== null;
    var migratedAmount = 0;
    if (hasGeneral) {
        migratedAmount = Number(buckets[GENERAL_SAVINGS_BUCKET_NAME]) || 0;
    } else if (hasMain) {
        migratedAmount = Number(buckets['Main']) || 0;
    } else if (hasLegacySavingsAlias) {
        migratedAmount = Number(buckets[aliasKey]) || 0;
    }
    if (hasMain) delete buckets['Main'];
    if (hasLegacySavingsAlias) delete buckets[aliasKey];
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
    planMap[GENERAL_SAVINGS_BUCKET_NAME] =
        Number(state.accounts.savingsBudgetPlan[GENERAL_SAVINGS_BUCKET_NAME]) ||
        Number(state.accounts.savingsBudgetPlan['Main']) ||
        Number(state.accounts.savingsBudgetPlan['Savings']) ||
        0;
    Object.keys(state.accounts.savingsBudgetPlan || {}).forEach(function (key) {
        if (!isLegacySavingsBucketAlias(key)) return;
        if (key === GENERAL_SAVINGS_BUCKET_NAME) return;
        if (planMap[GENERAL_SAVINGS_BUCKET_NAME] > 0) return;
        planMap[GENERAL_SAVINGS_BUCKET_NAME] = Number(state.accounts.savingsBudgetPlan[key]) || 0;
    });
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
    var savingsBuckets = (state.accounts && state.accounts.savingsBuckets) ? state.accounts.savingsBuckets : {};
    Object.keys(savingsBuckets).forEach(function (bucketName) {
        if (!bucketName) return;
        var canonicalName = isLegacySavingsBucketAlias(bucketName) ? (GENERAL_SAVINGS_BUCKET_NAME || 'General Savings') : bucketName;
        var entryId = 'savingsBucket:' + canonicalName;
        if (seen[entryId]) return;
        seen[entryId] = true;
        catalog.push({
            id: entryId,
            type: 'savingsBucket',
            label: canonicalName,
            // Show real bucket name to avoid confusion with the parent Savings account.
            title: canonicalName,
            groupLabel: 'Savings Bucket',
            bucketName: canonicalName
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
    } else {
        state.settings.payDate = Math.min(28, pd);
    }
    // These protections are now fixed on.
    state.settings.confirmSurplusEdits = true;
    state.settings.allowNegativeSurplus = true;
}

function ensureFoodConsumedDays() {
    if (!state.food) state.food = { daysTotal: 28, daysUsed: 0, lockedAmount: 0, history: [], viewWeek: 0, fundedAmountByDay: {}, _foodFundingMigrated: true };
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
    if (!state.food.overflowFunded || typeof state.food.overflowFunded !== 'object') {
        state.food.overflowFunded = {};
    }
    if (!state.food.overflowFundingSource || typeof state.food.overflowFundingSource !== 'object') {
        state.food.overflowFundingSource = {};
    }
    if (!state.food.overflowConsumedAmounts || typeof state.food.overflowConsumedAmounts !== 'object') {
        state.food.overflowConsumedAmounts = {};
    }
    if (state.food.redistributedPerSlot !== undefined && (typeof state.food.redistributedPerSlot !== 'number' || Number.isNaN(state.food.redistributedPerSlot))) {
        delete state.food.redistributedPerSlot;
    }
    state.food.daysUsed = state.food.consumedDays.length;
}

/** When overflow days use "Redistribute", per-slot funding cap (frozen until undo or cycle reset). */
function ensureRedistributedPerSlotCoherent() {
    ensureFoodConsumedDays();
    var R = countRedistributedOverflowKeys();
    if (R <= 0) {
        if (state.food && state.food.redistributedPerSlot !== undefined) delete state.food.redistributedPerSlot;
        return;
    }
    var slot = state.food && typeof state.food.redistributedPerSlot === 'number' && !Number.isNaN(state.food.redistributedPerSlot) ? state.food.redistributedPerSlot : 0;
    if (slot > 0.001) return;
    var bal = (state.balances && state.balances['Daily Food'] !== undefined) ? Number(state.balances['Daily Food']) : 0;
    if (bal < 0) bal = 0;
    var U = countUnconsumedCoreDays();
    var slots = U + R;
    if (slots <= 0) return;
    state.food.redistributedPerSlot = bal / slots;
}

function getEffectiveFoodSlotDailyCap(core) {
    var R = countRedistributedOverflowKeys();
    var slot = state.food && typeof state.food.redistributedPerSlot === 'number' && !Number.isNaN(state.food.redistributedPerSlot) ? state.food.redistributedPerSlot : 0;
    if (R > 0 && slot > 0.001) return slot;
    return core && typeof core.dailyRate === 'number' ? core.dailyRate : 0;
}

function sumOverflowFunded() {
    ensureFoodConsumedDays();
    var m = state.food.overflowFunded || {};
    var sum = 0;
    Object.keys(m).forEach(function (k) {
        sum += Number(m[k]) || 0;
    });
    return sum;
}

function countUnconsumedCoreDays() {
    ensureFoodConsumedDays();
    var consumed = {};
    ((state.food && state.food.consumedDays) || []).forEach(function (cd) {
        consumed[cd] = true;
    });
    var n = 0;
    for (var d = 1; d <= 28; d++) {
        if (!consumed[d]) n++;
    }
    return n;
}

function countRedistributedOverflowKeys() {
    ensureFoodConsumedDays();
    var usage = state.food.overflowUsage || {};
    var n = 0;
    Object.keys(usage).forEach(function (k) {
        if (usage[k] === 'redistributed') n++;
    });
    return n;
}

/** Count of pay-cycle overflow days: calendar gap after the 28 core days until next pay (see getPayCycleInfo in ui.js), not “end-of-month 29–31” specifically. */
function getPayCycleOverflowDayCount() {
    if (typeof getPayCycleInfo !== 'function') return 0;
    try {
        var info = getPayCycleInfo();
        return Array.isArray(info.overflowDates) ? info.overflowDates.length : 0;
    } catch (e) {
        return 0;
    }
}

/** Daily Food plan rates without touching funding migration (avoid recursion).
 *  Core cycle only (daysTotal, usually 28): pay-cycle overflow days (gap before next pay) do not dilute
 *  the daily rate or inflate “days left” — those days are optional and funded via the overflow UI, not
 *  by spreading the same budget thinner. */
function getFoodPlanItem() {
    var cid = SECTION_IDS.CORE_ESSENTIALS;
    var fid = SECTION_IDS.FOUNDATIONS;
    var flabel = ITEM_LABELS.FOOD_BASE;
    const fSec = state.categories.find(s => s.id === cid) || state.categories.find(s => s.id === fid);
    return fSec ? fSec.items.find(i => i.label === flabel) : null;
}

function getFoodPlanBudgetAmount() {
    if (!state.food || typeof state.food !== 'object') state.food = {};
    var fItem = getFoodPlanItem();
    var itemAmount = fItem ? (Number(fItem.amount) || 0) : 0;
    var stored = Number(state.food.planBaseAmount);
    if (!Number.isFinite(stored) || stored < 0) {
        stored = itemAmount;
        state.food.planBaseAmount = stored;
    }
    return Math.max(0, stored);
}
if (typeof window !== 'undefined') window.getFoodPlanBudgetAmount = getFoodPlanBudgetAmount;

function setFoodPlanBudgetAmount(amount) {
    if (!state.food || typeof state.food !== 'object') state.food = {};
    var normalized = Math.max(0, Number(amount) || 0);
    state.food.planBaseAmount = normalized;
    var fItem = getFoodPlanItem();
    if (fItem) fItem.amount = normalized;
    return normalized;
}
if (typeof window !== 'undefined') window.setFoodPlanBudgetAmount = setFoodPlanBudgetAmount;

function computeFoodPlanCore() {
    const fItem = getFoodPlanItem();
    const foodBase = getFoodPlanBudgetAmount();
    if (fItem && Math.abs((Number(fItem.amount) || 0) - foodBase) > 0.01) {
        fItem.amount = foodBase;
    }
    var coreDays = (state.food && state.food.daysTotal) ? state.food.daysTotal : 28;
    var overflowCalendarDays = typeof getPayCycleOverflowDayCount === 'function' ? getPayCycleOverflowDayCount() : 0;
    const daysUsed = (state.food && state.food.consumedDays) ? state.food.consumedDays.length : 0;
    const dailyRate = coreDays > 0 ? (foodBase / coreDays) : 0;
    const daysLeft = Math.max(0, coreDays - daysUsed);
    const theoreticalRemainder = daysLeft * dailyRate;
    return {
        fItem,
        foodBase,
        daysLeft,
        dailyRate,
        theoreticalRemainder,
        effectiveDaysTotal: coreDays,
        overflowCalendarDays: overflowCalendarDays
    };
}

function getFoodFundingMap() {
    ensureFoodConsumedDays();
    if (!state.food.fundedAmountByDay || typeof state.food.fundedAmountByDay !== 'object') {
        state.food.fundedAmountByDay = {};
    }
    return state.food.fundedAmountByDay;
}

function getFoodFundedForDay(day) {
    var d = Math.max(1, Math.min(28, Math.floor(day)));
    var m = getFoodFundingMap();
    var v = m[String(d)];
    return typeof v === 'number' && !Number.isNaN(v) ? Math.max(0, v) : 0;
}

function setFoodFundedForDay(day, amount) {
    var d = Math.max(1, Math.min(28, Math.floor(day)));
    var m = getFoodFundingMap();
    m[String(d)] = Math.max(0, amount);
}

function sumFoodFundedAll() {
    var sum = 0;
    for (var i = 1; i <= 28; i++) {
        sum += getFoodFundedForDay(i);
    }
    return sum;
}

function sumFoodFundedUnconsumed() {
    var consumed = {};
    ((state.food && state.food.consumedDays) || []).forEach(function (cd) {
        consumed[cd] = true;
    });
    var sum = 0;
    for (var d = 1; d <= 28; d++) {
        if (consumed[d]) continue;
        sum += getFoodFundedForDay(d);
    }
    return sum;
}

function getOutstandingFoodBalanceTotal() {
    var coreOutstanding = sumFoodFundedUnconsumed();
    var overflowOutstanding = typeof sumOverflowFunded === 'function' ? sumOverflowFunded() : 0;
    return Math.max(0, coreOutstanding + overflowOutstanding);
}
if (typeof window !== 'undefined') window.getOutstandingFoodBalanceTotal = getOutstandingFoodBalanceTotal;

function migrateLegacyFoodFunding() {
    ensureFoodConsumedDays();
    getFoodFundingMap();
    var m = state.food.fundedAmountByDay;
    var anyPositive = false;
    Object.keys(m).forEach(function (k) {
        if ((Number(m[k]) || 0) > 0.0001) anyPositive = true;
    });
    var foodBal = (state.balances && state.balances['Daily Food'] !== undefined) ? Number(state.balances['Daily Food']) : 0;
    if (foodBal < 0) foodBal = 0;
    if (anyPositive) {
        state.food._foodFundingMigrated = true;
        return;
    }
    var core = computeFoodPlanCore();
    var dailyRate = core.dailyRate;
    var consumed = {};
    (state.food.consumedDays || []).forEach(function (cd) {
        consumed[cd] = true;
    });
    for (var z = 1; z <= 28; z++) {
        delete m[String(z)];
    }
    var remaining = foodBal;
    for (var d = 1; d <= 28 && remaining > 0.0001; d++) {
        if (consumed[d]) continue;
        var add = Math.min(dailyRate, remaining);
        m[String(d)] = add;
        remaining -= add;
    }
    if (remaining > 0.001) {
        var uncM = [];
        for (var dm = 1; dm <= 28; dm++) {
            if (!consumed[dm]) uncM.push(dm);
        }
        if (uncM.length > 0) {
            var perM = remaining / uncM.length;
            uncM.forEach(function (d2) {
                m[String(d2)] = (Number(m[String(d2)]) || 0) + perM;
            });
        }
    }
    state.food._foodFundingMigrated = true;
}

/**
 * If overflow extras hold balance while some core cycle days are starved (no funding), move from
 * overflowFunded into those core slots up to plan dailyRate. Skips days that already have meaningful
 * funding (e.g. redistribute split below dailyRate) so we do not pull from extras incorrectly.
 */
function fillEmptyCoreDaysFromOverflowFunding(consumed, dailyRate) {
    var eps = 0.02;
    if (dailyRate <= 0) return;
    ensureFoodConsumedDays();
    var of = state.food.overflowFunded || {};
    for (var d = 1; d <= 28; d++) {
        if (consumed[d]) continue;
        var cur = getFoodFundedForDay(d);
        if (cur > eps) continue;
        while (cur < dailyRate - eps) {
            var sumOv2 = sumOverflowFunded();
            if (sumOv2 <= eps) break;
            var need = Math.min(dailyRate - cur, sumOv2);
            var needLeft = need;
            var ovKeys = Object.keys(of).sort();
            for (var oi = ovKeys.length - 1; oi >= 0 && needLeft > 0.001; oi--) {
                var ok = ovKeys[oi];
                var ovAmt = Number(of[ok]) || 0;
                if (ovAmt <= 0) continue;
                var take = Math.min(ovAmt, needLeft);
                of[ok] = ovAmt - take;
                if (of[ok] < 0.001) delete of[ok];
                needLeft -= take;
            }
            var taken = need - needLeft;
            if (taken <= 0.001) break;
            setFoodFundedForDay(d, getFoodFundedForDay(d) + taken);
            cur = getFoodFundedForDay(d);
        }
    }
}

/**
 * When the ledger balances (diff ≈ 0) but core slots are malformed — e.g. some unconsumed days at 0
 * while others exceed dailyRate, with nothing in overflowFunded to move — rebuild unconsumed core
 * funding from targetCore = bal − sumOverflowFunded using the same pattern as migrateLegacyFoodFunding.
 */
function repairCoreFundingZerosFromOverages(consumed, dailyRate, bal) {
    var eps = 0.02;
    if (dailyRate <= 0) return;
    var sumOv = typeof sumOverflowFunded === 'function' ? sumOverflowFunded() : 0;
    if (sumOv > eps) return;
    var hasZero = false;
    for (var di = 1; di <= 28; di++) {
        if (consumed[di]) continue;
        if (getFoodFundedForDay(di) <= eps) {
            hasZero = true;
            break;
        }
    }
    if (!hasZero) return;
    var targetCore = bal - sumOv;
    if (targetCore < 0) targetCore = 0;
    getFoodFundingMap();
    var m = state.food.fundedAmountByDay;
    for (var cz = 1; cz <= 28; cz++) {
        if (consumed[cz]) m[String(cz)] = 0;
    }
    var remaining = targetCore;
    for (var d = 1; d <= 28 && remaining > 0.0001; d++) {
        if (consumed[d]) continue;
        var add = Math.min(dailyRate, remaining);
        m[String(d)] = add;
        remaining -= add;
    }
    if (remaining > 0.001) {
        var uncM = [];
        for (var dm = 1; dm <= 28; dm++) {
            if (!consumed[dm]) uncM.push(dm);
        }
        if (uncM.length > 0) {
            var perM = remaining / uncM.length;
            uncM.forEach(function (d2) {
                m[String(d2)] = (Number(m[String(d2)]) || 0) + perM;
            });
        }
    }
}

function reconcileFoodFundingWithLedger() {
    ensureFoodConsumedDays();
    getFoodFundingMap();
    var core = computeFoodPlanCore();
    ensureRedistributedPerSlotCoherent();
    var dailyRate = getEffectiveFoodSlotDailyCap(core);
    var consumed = {};
    (state.food.consumedDays || []).forEach(function (cd) {
        consumed[cd] = true;
    });
    var sumF = sumFoodFundedAll();
    var sumOv = typeof sumOverflowFunded === 'function' ? sumOverflowFunded() : 0;
    var totalAlloc = sumF + sumOv;
    var recordedBal = (state.balances && state.balances['Daily Food'] !== undefined) ? Number(state.balances['Daily Food']) : 0;
    var bal = Number.isFinite(recordedBal) ? recordedBal : 0;
    if (bal < totalAlloc - 0.02) {
        // Overflow/core day states are the source of truth; avoid destroying valid funding
        // when a stale ledger balance fell behind.
        bal = totalAlloc;
    }
    if (bal < 0) bal = 0;
    var diff = bal - totalAlloc;
    if (Math.abs(diff) >= 0.02) {
        if (diff > 0) {
            var left = diff;
            for (var d = 1; d <= 28 && left > 0.001; d++) {
                if (consumed[d]) continue;
                var cur = getFoodFundedForDay(d);
                var room = Math.max(0, dailyRate - cur);
                if (room <= 0) continue;
                var add = Math.min(room, left);
                setFoodFundedForDay(d, cur + add);
                left -= add;
            }
            if (left > 0.001) {
                var unc = [];
                for (var d2 = 1; d2 <= 28; d2++) {
                    if (!consumed[d2]) unc.push(d2);
                }
                if (unc.length > 0) {
                    var addEach = left / unc.length;
                    unc.forEach(function (dx) {
                        setFoodFundedForDay(dx, getFoodFundedForDay(dx) + addEach);
                    });
                }
            }
        } else {
            var need = -diff;
            var of = state.food.overflowFunded || {};
            var ovKeys = Object.keys(of).sort();
            for (var oi = ovKeys.length - 1; oi >= 0 && need > 0.001; oi--) {
                var ok = ovKeys[oi];
                var ovAmt = Number(of[ok]) || 0;
                if (ovAmt <= 0) continue;
                var take = Math.min(ovAmt, need);
                of[ok] = ovAmt - take;
                if (of[ok] < 0.001) delete of[ok];
                need -= take;
            }
            for (var d3 = 28; d3 >= 1 && need > 0.001; d3--) {
                if (consumed[d3]) continue;
                var cur3 = getFoodFundedForDay(d3);
                if (cur3 <= 0) continue;
                var sub = Math.min(cur3, need);
                setFoodFundedForDay(d3, cur3 - sub);
                need -= sub;
            }
        }
    }
    fillEmptyCoreDaysFromOverflowFunding(consumed, dailyRate);
    repairCoreFundingZerosFromOverages(consumed, dailyRate, bal);
    var cap = core.foodBase;
    if (cap >= 0 && cap < 1e12) {
        var sumAfter = sumFoodFundedAll();
        if (sumAfter > cap + 0.02) {
            var ledgerBeforeCap = (state.balances && state.balances['Daily Food'] !== undefined)
                ? Number(state.balances['Daily Food']) || 0
                : sumAfter;
            // Scale every unconsumed day down proportionally. (Trimming from high day numbers only
            // zeroed the last slots and broke "funds for all 28 days" even when the total was fixable.)
            var scale = cap / sumAfter;
            for (var d4 = 1; d4 <= 28; d4++) {
                if (consumed[d4]) continue;
                var cur4 = getFoodFundedForDay(d4);
                setFoodFundedForDay(d4, Math.max(0, cur4 * scale));
            }
            var newSum = sumFoodFundedAll();
            var drift = cap - newSum;
            if (Math.abs(drift) > 0.02) {
                var uncDr = [];
                for (var d5 = 1; d5 <= 28; d5++) {
                    if (!consumed[d5]) uncDr.push(d5);
                }
                if (uncDr.length > 0) {
                    var driftEach = drift / uncDr.length;
                    uncDr.forEach(function (d6) {
                        setFoodFundedForDay(d6, Math.max(0, getFoodFundedForDay(d6) + driftEach));
                    });
                }
                newSum = sumFoodFundedAll();
            }
            if (state.balances) {
                state.balances['Daily Food'] = newSum;
            }
            var spillToExtra = ledgerBeforeCap - newSum;
            if (spillToExtra > 0.02 && state.accounts) {
                state.accounts.surplus = (Number(state.accounts.surplus) || 0) + spillToExtra;
            }
        }
    }
    if (!state.balances || typeof state.balances !== 'object') state.balances = {};
    state.balances['Daily Food'] = getOutstandingFoodBalanceTotal();
}

function ensureFoodFundingState() {
    ensureFoodConsumedDays();
    // Legacy field: distribution never incremented excludedFood*; stale saves showed bogus "Dist moved" alerts.
    if (state.food && state.food.pendingDistributionExtraNotice) {
        delete state.food.pendingDistributionExtraNotice;
    }
    getFoodFundingMap();
    if (!state.food._foodFundingMigrated) {
        migrateLegacyFoodFunding();
    }
    reconcileFoodFundingWithLedger();
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
    ensureFoodFundingState();
    var core = computeFoodPlanCore();
    var remainder = getOutstandingFoodBalanceTotal();
    var daysLeftFunded = 0;
    var consumedMap = {};
    ((state.food && state.food.consumedDays) || []).forEach(function (cd) {
        consumedMap[cd] = true;
    });
    for (var d = 1; d <= 28; d++) {
        if (consumedMap[d]) continue;
        if (getFoodFundedForDay(d) > 0.001) daysLeftFunded++;
    }
    var overflowUsage = (state.food && state.food.overflowUsage) || {};
    Object.keys(overflowUsage).forEach(function (key) {
        if ((Number(state.food.overflowFunded && state.food.overflowFunded[key]) || 0) > 0.001) {
            daysLeftFunded++;
        }
    });
    return {
        fItem: core.fItem,
        foodBase: core.foodBase,
        daysLeft: core.daysLeft,
        dailyRate: core.dailyRate,
        remainder: remainder,
        theoreticalRemainder: core.theoreticalRemainder,
        daysLeftFunded: daysLeftFunded,
        effectiveDaysTotal: core.effectiveDaysTotal
    };
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
