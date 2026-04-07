# BuBudget (NewBudgetApp)

A budget and ledger app: track monthly income, categories, weekly allowance, food days, savings/payables buckets, and current balance. Data is stored locally (localStorage) and can sync to Firebase when signed in.

## How to run

- **Local**: Open `index.html` in a browser, or serve the folder (e.g. `npx serve .`) and open the given URL.
- **Firebase**: Replace the Firebase config in `index.html` (in the `<script>` block) with your own. See [FIREBASE_SETUP.md](FIREBASE_SETUP.md) for setup steps.

## DashYourBoard API

This repo includes a Firebase Cloud Function named `getBudgetSummary` for read-only DashYourBoard integration.

### What it requires

- `Authorization: Bearer <Firebase ID token>`
- `X-DashBoard-Secret: <shared secret>`

### 1. Setting the shared secret via Firebase Functions config

From the repo root, run:

```bash
firebase.cmd functions:secrets:set DASHBOARD_SECRET
```

When prompted, enter your shared secret value. Redeploy the function after changing the secret so the new secret version is picked up.

### 2. Install Functions dependencies

The Functions backend lives in [functions/package.json](C:\Users\awvnn\Documents\OneDrive (a.w.vnn2)\OneDrive\Desktop\NewBudgetApp\NewBudgetApp\functions\package.json). Install it before local testing or deployment:

```bash
cd functions
npm install
cd ..
```

### 3. Local emulator testing with `firebase emulators:start`

For local emulator testing, set the secret in the shell before starting the emulator:

```bash
$env:DASHBOARD_SECRET="YOUR_SHARED_SECRET"
```

From the repo root, start the emulators:

```bash
firebase.cmd emulators:start
```

This project is configured for:

- Functions emulator on port `5001`
- Firestore emulator on port `8080`

The local endpoint will be:

```text
http://127.0.0.1:5001/YOUR_PROJECT_ID/us-central1/getBudgetSummary
```

To test locally:

1. Sign in through the app and obtain a Firebase ID token from the browser console:

```js
const token = await firebase.auth().currentUser.getIdToken(true);
console.log(token);
```

2. Call the local endpoint with both required headers:

```bash
curl -X GET "http://127.0.0.1:5001/YOUR_PROJECT_ID/us-central1/getBudgetSummary" \
  -H "Authorization: Bearer YOUR_FIREBASE_ID_TOKEN" \
  -H "X-DashBoard-Secret: YOUR_SHARED_SECRET"
```

### 4. Deploy command

From the repo root, deploy the Functions backend with:

```bash
firebase.cmd deploy --only functions
```

### Response shape

```json
{
  "totalBalance": 0,
  "monthlyIncome": 0,
  "monthlyExpenses": 0,
  "weeklyAllowance": {
    "budget": 0,
    "used": 0,
    "remaining": 0
  },
  "savingsBuckets": [
    {
      "id": "General Savings",
      "name": "General Savings",
      "currentAmount": 0,
      "targetAmount": null,
      "deadline": null,
      "color": null,
      "emoji": null
    }
  ],
  "subscriptions": [
    {
      "id": "0",
      "name": "Streaming",
      "amount": 0,
      "nextBillingDate": null,
      "category": "subscriptions"
    }
  ]
}
```

## Architecture (high level)

- **constants.js** – Storage keys, section IDs, item labels (single source of truth).
- **state.js** – Global state shape, persistence (save/load), migration, undo.
- **logic.js** – Pure balance/liquidity: item balance, savings/payables totals, current balance, surplus recalculation.
- **utils/** – format.js (currency/number), dom.js (getEl, escapeAttr), date.js (month/day names, lastDayOfMonth).
- **ui.js** – Refresh, pages, budget plan, ledger, modals, bank balance bar, food UI.
- **actions.js** – User actions: surplus, deficit, tools, transfers, buckets, weekly, food, settings, export/import.
- **onboarding.js** – First-run flow; **auth.js** – Firebase auth and cloud sync; **main.js** – Init and entry.

Script load order in `index.html`: constants → state → logic → utils (format, dom, date) → ui → actions → onboarding → auth → main.
