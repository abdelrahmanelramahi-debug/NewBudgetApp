# Budgetation (NewBudgetApp)

A budget and ledger app: track monthly income, categories, weekly allowance, food days, savings/payables buckets, and current balance. Data is stored locally (localStorage) and can sync to Firebase when signed in.

## How to run

- **Local**: Open `index.html` in a browser, or serve the folder (e.g. `npx serve .`) and open the given URL.
- **Firebase**: Replace the Firebase config in `index.html` (in the `<script>` block) with your own. See [FIREBASE_SETUP.md](FIREBASE_SETUP.md) for setup steps.

## Architecture (high level)

- **constants.js** – Storage keys, section IDs, item labels (single source of truth).
- **state.js** – Global state shape, persistence (save/load), migration, undo.
- **logic.js** – Pure balance/liquidity: item balance, savings/payables totals, current balance, surplus recalculation.
- **utils/** – format.js (currency/number), dom.js (getEl, escapeAttr), date.js (month/day names, lastDayOfMonth).
- **ui.js** – Refresh, pages, budget plan, ledger, modals, bank balance bar, food UI.
- **actions.js** – User actions: surplus, deficit, tools, transfers, buckets, weekly, food, settings, export/import.
- **onboarding.js** – First-run flow; **auth.js** – Firebase auth and cloud sync; **main.js** – Init and entry.

Script load order in `index.html`: constants → state → logic → utils (format, dom, date) → ui → actions → onboarding → auth → main.
