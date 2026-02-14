// Shared constants to avoid magic strings and reduce duplication
const STORAGE_KEYS = {
    STATE: 'financeCmd_state',
    MODIFIED: 'financeCmd_state_modified'
};

const SECTION_IDS = {
    SYS_SAVINGS: 'sys_savings',
    CORE_ESSENTIALS: 'core_essentials',
    FOUNDATIONS: 'foundations'
};

const ITEM_LABELS = {
    GENERAL_SAVINGS: 'General Savings',
    PAYABLES: 'Payables',
    CAR_FUND: 'Car Fund',
    WEEKLY_MISC: 'Weekly Misc',
    FOOD_BASE: 'Daily Food'
};

// Items that are rendered separately (Major Funds) or skipped in ledger category grids
const MAJOR_FUND_LABELS = [
    ITEM_LABELS.WEEKLY_MISC,
    ITEM_LABELS.FOOD_BASE,
    ITEM_LABELS.GENERAL_SAVINGS,
    ITEM_LABELS.CAR_FUND,
    ITEM_LABELS.PAYABLES
];
