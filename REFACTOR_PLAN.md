# NewBudgetApp Refactor Plan

## 1. Goals

- **Deduplication**: Merge redundant functions (formatting, escape, allocated/total UI) into reusable utils.
- **Dead code**: Remove unused functions, variables, imports, and commented junk.
- **Modularization**: Reorganize into a clear hierarchy (utils, state, logic, ui, actions).
- **Efficiency**: Optimize loops and data handling; use DOM cache consistently.
- **Documentation**: Add concise comments and README for maintainability.

## 2. Current Structure (Before)

```
js/
  constants.js   – storage/section/item keys
  state.js       – state shape, persistence, migration, undo
  logic.js       – balances, liquidity
  ui.js          – DOM cache, formatMoney, refreshUI, renderLedger, renderStrategy, modals, bank bar
  actions.js     – all user actions (very large)
  onboarding.js  – onboarding flow
  auth.js        – Firebase auth + cloud sync
  main.js        – init
```

## 3. Changes Executed

### 3.1 New `js/utils/` (Deduplication)

- **format.js** – `formatMoney`, `formatSignedMoney`, `getCurrencyLabel` (single source; scripts load in order so no guards).
- **dom.js** – `getEl`, `clearDomCache`, `escapeHtml`, `escapeAttr` for safe HTML/attributes.
- **date.js** – `lastDayOfMonth`, `MONTH_NAMES`, `DAY_NAMES` shared by pay cycle and food UI.

Script order in `index.html`: `constants` → `state` → `logic` → `utils/format` → `utils/dom` → `utils/date` → `ui` → `actions` → `onboarding` → `auth` → `main`.

### 3.2 Constant Guards Removed

- Replaced `typeof STORAGE_KEYS !== 'undefined' ? STORAGE_KEYS.STATE : 'financeCmd_state'` with `STORAGE_KEYS.STATE` everywhere (state.js, auth.js, actions.js).
- Replaced `typeof ITEM_LABELS !== 'undefined' ? ITEM_LABELS.* : '...'` and same for `SECTION_IDS` with direct constants (state.js, logic.js, ui.js, actions.js).

### 3.3 formatMoney / escape Consistency

- All `typeof formatMoney === 'function' ? formatMoney(x) : x.toFixed(2)` replaced with `formatMoney(x)`.
- All inline escape helpers (`safeLabel`, `safeLabelAttr`, `escapeAttr`, `esc`) replaced with `escapeAttr` or `escapeHtml` from `utils/dom.js`.

### 3.4 Allocated/Total UI (Deduplication)

- Extracted **updateAllocatedTotalUI(opts)** used by:
  - Budget plan page (`updateBudgetPlanAllocated`)
  - Onboarding categories step (inside `renderStrategy` when `forOnboarding`)
  - `fastUpdateItemAmount` in actions.js

### 3.5 Dead Code Removed

- **actions.js**: Removed unreferenced functions `setFoodViewWeek`, `undoFood`, `transferSavingsBucketToSurplus`, `moveSavingsBucket`, `transferPayablesBucketToSurplus`, `movePayablesBucket`.
- **ui.js**: `calculateReality()` – removed no-op assignments to `reality-total` / `header-reality` if elements are missing (keep `renderBankBalanceCard()` call).

### 3.6 DOM Cache and Efficiency

- **clearDomCache()** called after `renderLedger()` and `renderStrategy()` so cached refs don’t point to removed nodes.
- No change to full liquidity pass per action (can be a later optimization).

### 3.7 Documentation

- **README.md** at repo root: how to run, Firebase setup link, high-level architecture.
- **constants.js**: Short comment per constant group.
- **logic.js**: JSDoc for each exported function.
- **ui.js**: File-level and section comments for `renderLedger`, `renderStrategy`, `updateFoodUI`, `calculateReality`, `updateGlobalUI`.
- **actions.js**: Top-of-file summary and JSDoc for `applyTransaction` (list transaction types).

## 4. Optional Future Work

- Split **actions.js** by domain (surplus, deficit, buckets, tool, category/item, weekly, food, settings) into `js/actions/*.js` with multiple script tags.
- Split **state.js** into `state/state.js`, `state/persistence.js`, `state/undo.js`.
- Compute liquidity/breakdown once per action batch and pass into `updateGlobalUI` / `renderBankBalanceCard`.
- Remove or archive **budgetappcode/** and legacy hidden grid in `index.html` if no longer needed.
