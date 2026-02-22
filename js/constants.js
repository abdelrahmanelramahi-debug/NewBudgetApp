// Shared constants: storage keys, section IDs, item labels. Load first; other scripts depend on these.
const STORAGE_KEYS = {
    STATE: 'financeCmd_state',
    MODIFIED: 'financeCmd_state_modified',
    LAST_SYNCED: 'financeCmd_last_synced_to_cloud'
};

// Section IDs for system/core categories (used by state and logic).
const SECTION_IDS = {
    SYS_SAVINGS: 'sys_savings',
    CORE_ESSENTIALS: 'core_essentials',
    FOUNDATIONS: 'foundations'
};

// Item labels for major funds and core items (used across state, logic, ui, actions).
const ITEM_LABELS = {
    GENERAL_SAVINGS: 'General Savings',
    PAYABLES: 'Payables',
    CAR_FUND: 'Car Fund',
    WEEKLY_MISC: 'Weekly Misc',
    FOOD_BASE: 'Daily Food'
};

// Items rendered as Major Funds or excluded from ledger category grids.
const MAJOR_FUND_LABELS = [
    ITEM_LABELS.WEEKLY_MISC,
    ITEM_LABELS.FOOD_BASE,
    ITEM_LABELS.GENERAL_SAVINGS,
    ITEM_LABELS.CAR_FUND,
    ITEM_LABELS.PAYABLES
];
