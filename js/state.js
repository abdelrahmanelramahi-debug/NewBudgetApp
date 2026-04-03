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
        showFoodTracker: true,
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
    food: {
        plan: { daysTotal: 28, planBaseAmount: 600, lastCycleStartKey: '', viewWeek: 0 },
        core: { consumedDays: [], fundedAmountByDay: {} },
        overflow: {
            usage: {},
            funded: {},
            fundingSource: {},
            consumedAmounts: {},
            consumedMeta: {},
            redistributedExtraDays: 0
        },
        meta: { history: [], lockedAmount: 0, pendingUnusedTransferNotice: null, _foodFundingMigrated: false }
    },
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
        if (name && state.accounts.savingsBudgetPlan && state.accounts.savingsBudgetPlan[name] !== undefined) {
            delete state.accounts.savingsBudgetPlan[name];
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
    if (!Array.isArray(state.accounts.savingsBucketOrder)) state.accounts.savingsBucketOrder = [];
    var nextOrder = [];
    if (ordered[GENERAL_SAVINGS_BUCKET_NAME] !== undefined) nextOrder.push(GENERAL_SAVINGS_BUCKET_NAME);
    (state.accounts.savingsBucketOrder || []).forEach(function (key) {
        if (!key || key === GENERAL_SAVINGS_BUCKET_NAME) return;
        if (ordered[key] === undefined) return;
        if (nextOrder.indexOf(key) === -1) nextOrder.push(key);
    });
    Object.keys(ordered).forEach(function (key) {
        if (!key || key === GENERAL_SAVINGS_BUCKET_NAME) return;
        if (nextOrder.indexOf(key) === -1) nextOrder.push(key);
    });
    state.accounts.savingsBucketOrder = nextOrder;
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

function getCanonicalSavingsBucketOrder() {
    ensureGeneralSavingsBucketState();
    var order = (state.accounts && Array.isArray(state.accounts.savingsBucketOrder))
        ? state.accounts.savingsBucketOrder.slice()
        : [];
    if (!order.length && state.accounts && state.accounts.savingsBuckets) {
        if (state.accounts.savingsBuckets[GENERAL_SAVINGS_BUCKET_NAME] !== undefined) order.push(GENERAL_SAVINGS_BUCKET_NAME);
        Object.keys(state.accounts.savingsBuckets).forEach(function (key) {
            if (!key || key === GENERAL_SAVINGS_BUCKET_NAME) return;
            if (order.indexOf(key) === -1) order.push(key);
        });
    }
    return order;
}
if (typeof window !== 'undefined') window.getCanonicalSavingsBucketOrder = getCanonicalSavingsBucketOrder;

function getCanonicalSavingsBudgetPlanTotal() {
    ensureGeneralSavingsBucketState();
    var total = 0;
    getCanonicalSavingsBucketOrder().forEach(function (key) {
        total += Number((state.accounts && state.accounts.savingsBudgetPlan && state.accounts.savingsBudgetPlan[key]) || 0);
    });
    return total;
}
if (typeof window !== 'undefined') window.getCanonicalSavingsBudgetPlanTotal = getCanonicalSavingsBudgetPlanTotal;

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
        food: state.food || createDefaultFoodState(),
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

function createDefaultFoodState() {
    return {
        plan: {
            daysTotal: 28,
            planBaseAmount: 600,
            lastCycleStartKey: '',
            viewWeek: 0
        },
        core: {
            consumedDays: [],
            fundedAmountByDay: {}
        },
        overflow: {
            usage: {},
            funded: {},
            fundingSource: {},
            consumedAmounts: {},
            consumedMeta: {},
            redistributedExtraDays: 0
        },
        meta: {
            history: [],
            lockedAmount: 0,
            pendingUnusedTransferNotice: null,
            _foodFundingMigrated: false
        }
    };
}

function cloneFoodObjectMap(map) {
    if (!map || typeof map !== 'object') return {};
    return Object.keys(map).reduce(function (acc, key) {
        acc[key] = map[key];
        return acc;
    }, {});
}

function syncFoodCompatAliases() {
    if (!state.food || typeof state.food !== 'object') state.food = createDefaultFoodState();
    if (!state.food.plan || typeof state.food.plan !== 'object') state.food.plan = createDefaultFoodState().plan;
    if (!state.food.core || typeof state.food.core !== 'object') state.food.core = createDefaultFoodState().core;
    if (!state.food.overflow || typeof state.food.overflow !== 'object') state.food.overflow = createDefaultFoodState().overflow;
    if (!state.food.meta || typeof state.food.meta !== 'object') state.food.meta = createDefaultFoodState().meta;

    state.food.daysTotal = state.food.plan.daysTotal;
    state.food.planBaseAmount = state.food.plan.planBaseAmount;
    state.food.lastCycleStartKey = state.food.plan.lastCycleStartKey;
    state.food.viewWeek = state.food.plan.viewWeek;

    state.food.consumedDays = state.food.core.consumedDays;
    state.food.fundedAmountByDay = state.food.core.fundedAmountByDay;
    state.food.daysUsed = state.food.core.consumedDays.length;

    state.food.overflowUsage = state.food.overflow.usage;
    state.food.overflowFunded = state.food.overflow.funded;
    state.food.overflowFundingSource = state.food.overflow.fundingSource;
    state.food.overflowConsumedAmounts = state.food.overflow.consumedAmounts;
    state.food.overflowConsumedMeta = state.food.overflow.consumedMeta;
    state.food.redistributedExtraDays = state.food.overflow.redistributedExtraDays;
    if (state.food.overflow.redistributedPerSlot !== undefined) state.food.redistributedPerSlot = state.food.overflow.redistributedPerSlot;
    else delete state.food.redistributedPerSlot;

    state.food.history = state.food.meta.history;
    state.food.lockedAmount = state.food.meta.lockedAmount;
    state.food.pendingUnusedTransferNotice = state.food.meta.pendingUnusedTransferNotice;
    state.food._foodFundingMigrated = state.food.meta._foodFundingMigrated;
}

function syncFoodDomainsFromCompat() {
    if (!state.food || typeof state.food !== 'object') return;
    if (!state.food.plan || typeof state.food.plan !== 'object') state.food.plan = createDefaultFoodState().plan;
    if (!state.food.core || typeof state.food.core !== 'object') state.food.core = createDefaultFoodState().core;
    if (!state.food.overflow || typeof state.food.overflow !== 'object') state.food.overflow = createDefaultFoodState().overflow;
    if (!state.food.meta || typeof state.food.meta !== 'object') state.food.meta = createDefaultFoodState().meta;

    if (state.food.daysTotal !== undefined) state.food.plan.daysTotal = Math.max(1, Math.floor(Number(state.food.daysTotal) || state.food.plan.daysTotal || 28));
    if (state.food.planBaseAmount !== undefined) state.food.plan.planBaseAmount = Math.max(0, Number(state.food.planBaseAmount) || 0);
    if (state.food.lastCycleStartKey !== undefined) state.food.plan.lastCycleStartKey = typeof state.food.lastCycleStartKey === 'string' ? state.food.lastCycleStartKey : '';
    if (state.food.viewWeek !== undefined) state.food.plan.viewWeek = Number.isFinite(Number(state.food.viewWeek)) ? Number(state.food.viewWeek) : 0;

    if (Array.isArray(state.food.consumedDays)) state.food.core.consumedDays = state.food.consumedDays;
    if (state.food.fundedAmountByDay && typeof state.food.fundedAmountByDay === 'object') state.food.core.fundedAmountByDay = state.food.fundedAmountByDay;

    if (state.food.overflowUsage && typeof state.food.overflowUsage === 'object') state.food.overflow.usage = state.food.overflowUsage;
    if (state.food.overflowFunded && typeof state.food.overflowFunded === 'object') state.food.overflow.funded = state.food.overflowFunded;
    if (state.food.overflowFundingSource && typeof state.food.overflowFundingSource === 'object') state.food.overflow.fundingSource = state.food.overflowFundingSource;
    if (state.food.overflowConsumedAmounts && typeof state.food.overflowConsumedAmounts === 'object') state.food.overflow.consumedAmounts = state.food.overflowConsumedAmounts;
    if (state.food.overflowConsumedMeta && typeof state.food.overflowConsumedMeta === 'object') state.food.overflow.consumedMeta = state.food.overflowConsumedMeta;
    if (state.food.redistributedExtraDays !== undefined) state.food.overflow.redistributedExtraDays = Number.isFinite(Number(state.food.redistributedExtraDays)) ? Number(state.food.redistributedExtraDays) : 0;
    if (state.food.redistributedPerSlot !== undefined) state.food.overflow.redistributedPerSlot = Number(state.food.redistributedPerSlot);

    if (Array.isArray(state.food.history)) state.food.meta.history = state.food.history;
    if (state.food.lockedAmount !== undefined) state.food.meta.lockedAmount = Math.max(0, Number(state.food.lockedAmount) || 0);
    if (state.food.pendingUnusedTransferNotice !== undefined) state.food.meta.pendingUnusedTransferNotice = state.food.pendingUnusedTransferNotice || null;
    if (state.food._foodFundingMigrated !== undefined) state.food.meta._foodFundingMigrated = !!state.food._foodFundingMigrated;
}

function migrateLegacyFoodState() {
    var defaults = createDefaultFoodState();
    if (!state.food || typeof state.food !== 'object') {
        state.food = defaults;
        syncFoodCompatAliases();
        return state.food;
    }

    if (!state.food.plan || !state.food.core || !state.food.overflow || !state.food.meta) {
        var legacy = state.food;
        state.food = createDefaultFoodState();
        state.food.plan.daysTotal = Math.max(1, Math.floor(Number(legacy.daysTotal) || defaults.plan.daysTotal));
        state.food.plan.planBaseAmount = Math.max(0, Number(legacy.planBaseAmount) || 0);
        state.food.plan.lastCycleStartKey = typeof legacy.lastCycleStartKey === 'string' ? legacy.lastCycleStartKey : '';
        state.food.plan.viewWeek = Number.isFinite(Number(legacy.viewWeek)) ? Number(legacy.viewWeek) : 0;

        var legacyConsumed = Array.isArray(legacy.consumedDays) ? legacy.consumedDays.slice() : [];
        if (!legacyConsumed.length) {
            var used = Math.max(0, Math.min(28, Math.floor(Number(legacy.daysUsed) || 0)));
            for (var i = 1; i <= used; i++) legacyConsumed.push(i);
        }
        state.food.core.consumedDays = legacyConsumed
            .map(function (day) { return Math.max(1, Math.min(28, Math.floor(Number(day) || 0))); })
            .filter(function (day, index, arr) { return day > 0 && arr.indexOf(day) === index; })
            .sort(function (a, b) { return a - b; });
        state.food.core.fundedAmountByDay = cloneFoodObjectMap(legacy.fundedAmountByDay);

        state.food.overflow.usage = cloneFoodObjectMap(legacy.overflowUsage);
        state.food.overflow.funded = cloneFoodObjectMap(legacy.overflowFunded);
        state.food.overflow.fundingSource = cloneFoodObjectMap(legacy.overflowFundingSource);
        state.food.overflow.consumedAmounts = cloneFoodObjectMap(legacy.overflowConsumedAmounts);
        state.food.overflow.consumedMeta = cloneFoodObjectMap(legacy.overflowConsumedMeta);
        state.food.overflow.redistributedExtraDays = Number.isFinite(Number(legacy.redistributedExtraDays)) ? Number(legacy.redistributedExtraDays) : 0;
        if (legacy.redistributedPerSlot !== undefined && !Number.isNaN(Number(legacy.redistributedPerSlot))) {
            state.food.overflow.redistributedPerSlot = Number(legacy.redistributedPerSlot);
        }

        state.food.meta.history = Array.isArray(legacy.history) ? legacy.history.slice() : [];
        state.food.meta.lockedAmount = Math.max(0, Number(legacy.lockedAmount) || 0);
        state.food.meta.pendingUnusedTransferNotice = legacy.pendingUnusedTransferNotice || null;
        state.food.meta._foodFundingMigrated = !!legacy._foodFundingMigrated;
    }

    if (!state.food.plan || typeof state.food.plan !== 'object') state.food.plan = defaults.plan;
    if (!state.food.core || typeof state.food.core !== 'object') state.food.core = defaults.core;
    if (!state.food.overflow || typeof state.food.overflow !== 'object') state.food.overflow = defaults.overflow;
    if (!state.food.meta || typeof state.food.meta !== 'object') state.food.meta = defaults.meta;

    if (!Array.isArray(state.food.core.consumedDays)) state.food.core.consumedDays = [];
    if (!state.food.core.fundedAmountByDay || typeof state.food.core.fundedAmountByDay !== 'object') state.food.core.fundedAmountByDay = {};
    if (!state.food.overflow.usage || typeof state.food.overflow.usage !== 'object') state.food.overflow.usage = {};
    if (!state.food.overflow.funded || typeof state.food.overflow.funded !== 'object') state.food.overflow.funded = {};
    if (!state.food.overflow.fundingSource || typeof state.food.overflow.fundingSource !== 'object') state.food.overflow.fundingSource = {};
    if (!state.food.overflow.consumedAmounts || typeof state.food.overflow.consumedAmounts !== 'object') state.food.overflow.consumedAmounts = {};
    if (!state.food.overflow.consumedMeta || typeof state.food.overflow.consumedMeta !== 'object') state.food.overflow.consumedMeta = {};
    if (typeof state.food.overflow.redistributedExtraDays !== 'number' || Number.isNaN(state.food.overflow.redistributedExtraDays)) state.food.overflow.redistributedExtraDays = 0;
    if (state.food.overflow.redistributedPerSlot !== undefined && (typeof state.food.overflow.redistributedPerSlot !== 'number' || Number.isNaN(state.food.overflow.redistributedPerSlot))) delete state.food.overflow.redistributedPerSlot;

    if (!Array.isArray(state.food.meta.history)) state.food.meta.history = [];
    if (typeof state.food.meta.lockedAmount !== 'number' || Number.isNaN(state.food.meta.lockedAmount)) state.food.meta.lockedAmount = 0;
    if (state.food.meta.pendingUnusedTransferNotice === undefined) state.food.meta.pendingUnusedTransferNotice = null;
    state.food.meta._foodFundingMigrated = !!state.food.meta._foodFundingMigrated;

    state.food.plan.daysTotal = Math.max(1, Math.floor(Number(state.food.plan.daysTotal) || defaults.plan.daysTotal));
    if (typeof state.food.plan.lastCycleStartKey !== 'string') state.food.plan.lastCycleStartKey = '';
    if (typeof state.food.plan.viewWeek !== 'number' || Number.isNaN(state.food.plan.viewWeek)) state.food.plan.viewWeek = 0;
    state.food.plan.planBaseAmount = Math.max(0, Number(state.food.plan.planBaseAmount) || 0);
    if (!state.food.plan.planBaseAmount) state.food.plan.planBaseAmount = defaults.plan.planBaseAmount;

    state.food.core.consumedDays = state.food.core.consumedDays
        .map(function (day) { return Math.max(1, Math.min(28, Math.floor(Number(day) || 0))); })
        .filter(function (day, index, arr) { return day > 0 && arr.indexOf(day) === index; })
        .sort(function (a, b) { return a - b; });

    syncFoodCompatAliases();
    return state.food;
}

function ensureFoodStateShape() {
    migrateLegacyFoodState();
    syncFoodDomainsFromCompat();
    syncFoodCompatAliases();
    return state.food;
}

function ensureFoodConsumedDays() {
    ensureFoodStateShape();
    syncFoodCompatAliases();
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
    ensureFoodStateShape();
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
    ensureFoodStateShape();
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
            var spillToExtra = ledgerBeforeCap - newSum;
            if (spillToExtra > 0.02 && state.accounts) {
                state.accounts.surplus = (Number(state.accounts.surplus) || 0) + spillToExtra;
            }
        }
    }
}

function ensureFoodFundingState() {
    ensureFoodConsumedDays();
    // Legacy field: distribution never incremented excludedFood*; stale saves showed bogus "Dist moved" alerts.
    if (state.food && state.food.pendingDistributionExtraNotice) {
        delete state.food.pendingDistributionExtraNotice;
    }
    getFoodFundingMap();
    var needsMigrationRepair = !state.food._foodFundingMigrated;
    if (needsMigrationRepair) {
        migrateLegacyFoodFunding();
        reconcileFoodFundingWithLedger();
    }
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

function deriveFoodLedgerBalance() {
    ensureFoodFundingState();
    return getOutstandingFoodBalanceTotal();
}
if (typeof window !== 'undefined') window.deriveFoodLedgerBalance = deriveFoodLedgerBalance;

function buildFoodViewModel() {
    ensureFoodStateShape();
    var payCycle = typeof getPayCycleInfo === 'function' ? getPayCycleInfo() : { dates: [], overflowDates: [] };
    var info = getFoodRemainderInfo();
    var totalBal = (state.balances && state.balances['Daily Food'] !== undefined)
        ? (Number(state.balances['Daily Food']) || 0)
        : deriveFoodLedgerBalance();
    var daysUsed = state.food.core.consumedDays.length;
    var daysTotal = state.food.plan.daysTotal || 28;
    var daysLeft = Math.max(0, daysTotal - daysUsed);
    var daily = typeof getDailyFoodEffectiveDisplayRate === 'function' ? getDailyFoodEffectiveDisplayRate() : info.dailyRate;
    var eps = 0.05;
    var tone = 'grey';
    if (!(info.remainder <= eps && info.theoreticalRemainder <= eps)) {
        if (info.remainder + eps < info.theoreticalRemainder && info.theoreticalRemainder > eps) tone = 'red';
        else if (info.remainder + eps >= info.theoreticalRemainder) tone = 'green';
    }
    return {
        payCycle: payCycle,
        remainderInfo: info,
        totalBalance: totalBal,
        dailyRate: daily,
        tone: tone,
        daysUsed: daysUsed,
        daysTotal: daysTotal,
        daysLeft: daysLeft,
        consumedDays: state.food.core.consumedDays.slice(),
        lockedAmount: state.food.meta.lockedAmount || 0,
        overflowUsage: state.food.overflow.usage,
        overflowConsumedAmounts: state.food.overflow.consumedAmounts,
        pendingUnusedTransferNotice: state.food.meta.pendingUnusedTransferNotice
    };
}
if (typeof window !== 'undefined') window.buildFoodViewModel = buildFoodViewModel;

function normalizeFoodDayRef(dayRef) {
    if (typeof dayRef === 'number') return { kind: 'core', day: Math.max(1, Math.min(28, Math.floor(dayRef))) };
    if (!dayRef || typeof dayRef !== 'object') return null;
    if (dayRef.kind === 'overflow') return { kind: 'overflow', key: String(dayRef.key || '') };
    return { kind: 'core', day: Math.max(1, Math.min(28, Math.floor(dayRef.day))) };
}

function getFoodDayState(dayRef) {
    ensureFoodStateShape();
    var ref = normalizeFoodDayRef(dayRef);
    if (!ref) return null;
    if (ref.kind === 'overflow') {
        var key = ref.key;
        var usage = state.food.overflow.usage[key] || '';
        var consumedAmount = Number(state.food.overflow.consumedAmounts[key]) || 0;
        var consumedMeta = state.food.overflow.consumedMeta[key] || null;
        var isConsumed = consumedAmount > 0.001;
        var isTransferred = !!(consumedMeta && consumedMeta.resolution === 'transferred');
        var spendable = 0;
        if (isConsumed) spendable = consumedAmount;
        else if ((Number(state.food.overflow.funded[key]) || 0) > 0.001) spendable = Number(state.food.overflow.funded[key]) || 0;
        else if (usage === 'redistributed') spendable = Number(state.food.overflow.redistributedPerSlot) || 0;
        return {
            ref: ref,
            kind: 'overflow',
            key: key,
            usage: usage,
            isConsumed: isConsumed,
            isTransferred: isTransferred,
            consumedAmount: consumedAmount,
            consumedMeta: consumedMeta,
            spendableAmount: spendable,
            canConsume: !isTransferred && (!!usage || isConsumed),
            canTransfer: !!usage && !isConsumed,
            canFundFromSource: !usage && !isConsumed,
            canRedistribute: !usage && !isConsumed,
            canUndoSource: usage === 'source' && !isConsumed,
            canUndoRedistribute: usage === 'redistributed' && !isConsumed
        };
    }

    var day = ref.day;
    var consumed = state.food.core.consumedDays.indexOf(day) !== -1;
    var funded = getFoodFundedForDay(day);
    var isLocked = !consumed && funded <= 0.001;
    return {
        ref: ref,
        kind: 'core',
        day: day,
        isConsumed: consumed,
        fundedAmount: funded,
        isLocked: isLocked,
        canConsume: consumed || funded > 0.001,
        canTransfer: !consumed && funded > 0.001,
        canRestoreFromSource: consumed
    };
}
if (typeof window !== 'undefined') window.getFoodDayState = getFoodDayState;

function getFoodDayActions(dayRef) {
    var stateInfo = getFoodDayState(dayRef);
    if (!stateInfo) return [];
    if (stateInfo.kind === 'overflow') {
        return [
            { id: stateInfo.isConsumed ? 'unconsume' : 'consume', label: stateInfo.isConsumed ? 'Unmark consumed' : 'Mark consumed', disabled: !stateInfo.canConsume },
            { id: 'transfer', label: 'Transfer day to...', disabled: !stateInfo.canTransfer },
            { id: 'fund_source', label: 'Use source for +1 day', disabled: !stateInfo.canFundFromSource },
            { id: 'redistribute', label: 'Redistribute Daily Food', disabled: !stateInfo.canRedistribute },
            { id: 'undo_source', label: 'De-distribute', disabled: !stateInfo.canUndoSource },
            { id: 'undo_redistribute', label: 'De-distribute', disabled: !stateInfo.canUndoRedistribute }
        ];
    }
    return [
        { id: stateInfo.isConsumed ? 'unconsume' : 'consume', label: stateInfo.isConsumed ? 'Unconsume day' : 'Consume day', disabled: !stateInfo.canConsume },
        { id: 'transfer', label: stateInfo.isConsumed ? 'Restore from source' : 'Transfer day to...', disabled: stateInfo.isConsumed ? false : !stateInfo.canTransfer }
    ];
}
if (typeof window !== 'undefined') window.getFoodDayActions = getFoodDayActions;

function buildFoodDayPanelModel(dayRef) {
    var stateInfo = getFoodDayState(dayRef);
    if (!stateInfo) return null;
    if (stateInfo.kind === 'overflow') {
        return {
            dayRef: stateInfo.ref,
            title: 'Extra',
            subtitle: stateInfo.isTransferred
                ? 'This overflow day was transferred to another fund and is already resolved.'
                : stateInfo.isConsumed
                    ? 'Marked consumed. Unmark to restore the previous overflow funding method for this day.'
                    : stateInfo.usage === 'source'
                        ? 'Funded from your chosen source. De-distribute to undo it, or mark consumed / transfer when you use this extra day.'
                        : stateInfo.usage === 'redistributed'
                            ? 'Daily Food is split across more calendar days. De-distribute to revert, or mark consumed / transfer.'
                            : 'Days between the end of your 28-day plan and your next pay day. Choose how to account for this day.',
            state: stateInfo,
            actions: getFoodDayActions(dayRef)
        };
    }
    var payCycle = typeof getPayCycleInfo === 'function' ? getPayCycleInfo() : null;
    var p = payCycle && payCycle.dates ? payCycle.dates[stateInfo.day - 1] : null;
    return {
        dayRef: stateInfo.ref,
        title: 'Day ' + stateInfo.day,
        subtitle: p ? (p.monthName + ' ' + p.date + ' · Tap an action below') : 'Tap an action below',
        state: stateInfo,
        actions: getFoodDayActions(dayRef)
    };
}
if (typeof window !== 'undefined') window.buildFoodDayPanelModel = buildFoodDayPanelModel;

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
