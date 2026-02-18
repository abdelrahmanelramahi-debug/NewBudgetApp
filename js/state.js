// DATA (uses ITEM_LABELS from constants.js when available)
const ACCOUNT_LABELS = typeof ITEM_LABELS !== 'undefined'
    ? [ITEM_LABELS.GENERAL_SAVINGS, ITEM_LABELS.PAYABLES, ITEM_LABELS.CAR_FUND, ITEM_LABELS.WEEKLY_MISC]
    : ['General Savings', 'Payables', 'Car Fund', 'Weekly Misc'];

let state = {
    schemaVersion: 2,
    onboardingComplete: false,
    monthlyIncome: 5000,
    settings: {
        currency: 'AED',
        decimals: 2,
        confirmSurplusEdits: true,
        allowNegativeSurplus: true,
        theme: 'light',
        compact: false,
        firstDayOfWeek: 3,
        payDate: 28
    },
    categories: [
        { id: 'sys_savings', label: 'System Savings', isSystem: true, items: [
            { label: 'General Savings', amount: 1000, isAutoCalculated: false },
            { label: 'Payables', amount: 0, isAutoCalculated: false }
        ] },
        { id: 'core_essentials', label: 'Core Essentials', isSystem: true, items: [
            { label: 'Weekly Misc', amount: 400, isCore: true },
            { label: 'Daily Food', amount: 600, isCore: true },
            { label: 'Car Fund', amount: 300, isCore: true }
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
            'General Savings': 1000,
            'Payables': 0,
            'Car Fund': 300,
            'Weekly Misc': 400
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

/** Returns a fresh example budget (generic defaults, not personal). Use for "Load example budget" in Settings. */
function getExampleBudget() {
    return {
        monthlyIncome: 5000,
        categories: [
            { id: 'sys_savings', label: 'System Savings', isSystem: true, items: [
                { label: 'General Savings', amount: 1000, isAutoCalculated: false },
                { label: 'Payables', amount: 0, isAutoCalculated: false }
            ] },
            { id: 'core_essentials', label: 'Core Essentials', isSystem: true, items: [
                { label: 'Weekly Misc', amount: 400, isCore: true },
                { label: 'Daily Food', amount: 600, isCore: true },
                { label: 'Car Fund', amount: 300, isCore: true }
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
        buckets: { 'General Savings': 1000, 'Payables': 0, 'Car Fund': 300, 'Weekly Misc': 400 },
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
    var stateKey = typeof STORAGE_KEYS !== 'undefined' ? STORAGE_KEYS.STATE : 'financeCmd_state';
    var modKey = typeof STORAGE_KEYS !== 'undefined' ? STORAGE_KEYS.MODIFIED : 'financeCmd_state_modified';
    localStorage.setItem(stateKey, JSON.stringify(state));
    try { localStorage.setItem(modKey, String(Date.now())); } catch (e) {}
    // Cloud sync will be handled by auth.js if user is logged in
}
window.saveState = saveState; // Make it globally accessible

function loadState() {
    var stateKey = typeof STORAGE_KEYS !== 'undefined' ? STORAGE_KEYS.STATE : 'financeCmd_state';
    const saved = localStorage.getItem(stateKey);
    if (saved) {
        try {
            const loaded = JSON.parse(saved);
            state = { ...state, ...loaded };
            if(typeof state.monthlyIncome === 'undefined') state.monthlyIncome = 5000;
            if(!('onboardingComplete' in loaded)) state.onboardingComplete = true;
        } catch(e) { console.error("Save data corrupt, using default"); }
    }
    migrateState();
    ensureSettings();
    ensureFoodConsumedDays();
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
                savingsBuckets: {}
            };
        }
        if (!state.accounts.buckets) state.accounts.buckets = {};
        if (!state.accounts.savingsBuckets) {
            const seed = state.accounts.buckets['General Savings'] ?? 0;
            state.accounts.savingsBuckets = { Main: seed };
        }
        if (!state.accounts.savingsDefaultBucket) {
            state.accounts.savingsDefaultBucket = 'Main';
        }
        ACCOUNT_LABELS.forEach(label => {
            if (state.accounts.buckets[label] === undefined) {
                const legacy = state.balances?.[label];
                if (legacy !== undefined) state.accounts.buckets[label] = legacy;
            }
        });
        if (!state.balances) state.balances = {};
        ACCOUNT_LABELS.forEach(label => {
            if (state.balances[label] !== undefined) delete state.balances[label];
        });
        state.schemaVersion = 2;
        return;
    }

    const legacyStrategy = state.strategy || state.categories || [];
    const legacyBalances = state.balances || {};
    const legacyWeekly = state.weekly || { balance: getWeeklyConfigAmount(), week: 1 };

    const buckets = {};
    ACCOUNT_LABELS.forEach(label => {
        const bal = legacyBalances[label];
        if (bal !== undefined) buckets[label] = bal;
    });

    state = {
        ...state,
        schemaVersion: 2,
        categories: legacyStrategy,
        accounts: {
            surplus: state.surplus || 0,
            weekly: legacyWeekly,
            buckets: {
                'General Savings': buckets['General Savings'] ?? 0,
                'Payables': buckets['Payables'] ?? 0,
                'Car Fund': buckets['Car Fund'] ?? 0,
                'Weekly Misc': buckets['Weekly Misc'] ?? 0
            },
            savingsBuckets: {
                Main: buckets['General Savings'] ?? 0
            },
            savingsDefaultBucket: 'Main'
        },
        balances: Object.keys(legacyBalances).reduce((acc, key) => {
            if (!ACCOUNT_LABELS.includes(key)) acc[key] = legacyBalances[key];
            return acc;
        }, {}),
        food: state.food || { daysTotal: 28, daysUsed: 0, lockedAmount: 0, history: [], viewWeek: 0 },
        histories: state.histories || {}
    };
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
        theme: 'light',
        compact: false,
        firstDayOfWeek: 3,
        payDate: 28
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
}

function ensureFoodConsumedDays() {
    if (!state.food) state.food = { daysTotal: 28, daysUsed: 0, lockedAmount: 0, history: [], viewWeek: 0 };
    if (!Array.isArray(state.food.consumedDays)) {
        var n = Math.max(0, Math.min(28, Math.floor(state.food.daysUsed || 0)));
        state.food.consumedDays = [];
        for (var i = 1; i <= n; i++) state.food.consumedDays.push(i);
    }
    state.food.daysUsed = state.food.consumedDays.length;
}

function ensureSystemSavings() {
    let sys = state.categories.find(s => s.id === 'sys_savings');
    if(!sys) {
        state.categories.unshift({
            id: 'sys_savings',
            label: 'System Savings',
            isSystem: true,
            items: [
                { label: 'General Savings', amount: 1000, isAutoCalculated: false },
                { label: 'Payables', amount: 0, isAutoCalculated: false }
            ]
        });
    } else {
        const savings = sys.items.find(i => i.label === 'General Savings');
        if (!savings) {
            sys.items.unshift({ label: 'General Savings', amount: 1000, isAutoCalculated: false });
        }
        const payables = sys.items.find(i => i.label === 'Payables');
        if (!payables) {
            sys.items.push({ label: 'Payables', amount: 0, isAutoCalculated: false });
        }
    }
}

function ensureCoreItems() {
    var coreId = typeof SECTION_IDS !== 'undefined' ? SECTION_IDS.CORE_ESSENTIALS : 'core_essentials';
    let core = state.categories.find(s => s.id === coreId);

    if (!core) {
        state.categories.splice(1, 0, {
            id: coreId,
            label: 'Core Essentials',
            isSystem: true,
            items: [
                { label: 'Weekly Misc', amount: 400, isCore: true },
                { label: 'Daily Food', amount: 600, isCore: true },
                { label: 'Car Fund', amount: 300, isCore: true }
            ]
        });
    } else {
        const car = core.items.find(i => i.label === 'Car Fund');
        if (!car) {
            core.items.push({ label: 'Car Fund', amount: 300, isCore: true });
        }
    }

    state.categories.forEach(sec => {
        if (sec.id !== coreId) {
            sec.items = sec.items.filter(i =>
                i.label !== (typeof ITEM_LABELS !== 'undefined' ? ITEM_LABELS.WEEKLY_MISC : 'Weekly Misc') &&
                i.label !== (typeof ITEM_LABELS !== 'undefined' ? ITEM_LABELS.FOOD_BASE : 'Daily Food') &&
                i.label !== (typeof ITEM_LABELS !== 'undefined' ? ITEM_LABELS.CAR_FUND : 'Car Fund')
            );
        }
    });
}

function getWeeklyConfigAmount() {
    var cid = typeof SECTION_IDS !== 'undefined' ? SECTION_IDS.CORE_ESSENTIALS : 'core_essentials';
    var wlabel = typeof ITEM_LABELS !== 'undefined' ? ITEM_LABELS.WEEKLY_MISC : 'Weekly Misc';
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
    var cid = typeof SECTION_IDS !== 'undefined' ? SECTION_IDS.CORE_ESSENTIALS : 'core_essentials';
    var fid = typeof SECTION_IDS !== 'undefined' ? SECTION_IDS.FOUNDATIONS : 'foundations';
    var flabel = typeof ITEM_LABELS !== 'undefined' ? ITEM_LABELS.FOOD_BASE : 'Daily Food';
    const fSec = state.categories.find(s=>s.id===cid) || state.categories.find(s=>s.id===fid);
    const fItem = fSec ? fSec.items.find(i=>i.label===flabel) : null;
    const foodBase = fItem ? fItem.amount : 0;
    const daysLeft = state.food.daysTotal - state.food.daysUsed;
    const dailyRate = state.food.daysTotal > 0 ? (foodBase / state.food.daysTotal) : 0;
    const remainder = daysLeft * dailyRate;
    return { fItem, foodBase, daysLeft, dailyRate, remainder };
}

function initSurplusFromOpening() {
    let allocated = 0;
    if (!state.accounts) {
        state.accounts = { surplus: 0, weekly: { balance: getWeeklyConfigAmount(), week: 1 }, buckets: {} };
    }
    if (!state.accounts.buckets) state.accounts.buckets = {};
    if (!state.accounts.savingsBuckets) {
        state.accounts.savingsBuckets = { Main: state.accounts.buckets['General Savings'] ?? 0 };
    }
    if (!state.accounts.savingsDefaultBucket) {
        state.accounts.savingsDefaultBucket = 'Main';
    }

    state.categories.forEach(sec => {
        sec.items.forEach(item => {
            allocated += item.amount;
            if (isAccountLabel(item.label)) {
                if (state.accounts.buckets[item.label] === undefined) {
                    state.accounts.buckets[item.label] = item.amount;
                }
            } else if(state.balances[item.label] === undefined) {
                state.balances[item.label] = item.amount;
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
