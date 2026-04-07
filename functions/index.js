'use strict';

const { onRequest } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp();
}

function getSharedSecret() {
    return process.env.DASHBOARD_SECRET ? String(process.env.DASHBOARD_SECRET) : '';
}

function getBearerToken(authHeader) {
    if (!authHeader || typeof authHeader !== 'string') return '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : '';
}

function toNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
}

function sumValues(record) {
    if (!record || typeof record !== 'object') return 0;
    return Object.values(record).reduce(function (sum, value) {
        return sum + toNumber(value);
    }, 0);
}

function sortSavingsBucketKeys(savingsBuckets, savingsBucketOrder) {
    const keys = Object.keys(savingsBuckets || {});
    if (!keys.length) return [];

    if (!Array.isArray(savingsBucketOrder) || !savingsBucketOrder.length) {
        return keys.sort(function (a, b) {
            return a.localeCompare(b);
        });
    }

    const seen = new Set();
    const ordered = [];

    savingsBucketOrder.forEach(function (key) {
        if (!Object.prototype.hasOwnProperty.call(savingsBuckets, key) || seen.has(key)) return;
        seen.add(key);
        ordered.push(key);
    });

    keys
        .filter(function (key) { return !seen.has(key); })
        .sort(function (a, b) { return a.localeCompare(b); })
        .forEach(function (key) { ordered.push(key); });

    return ordered;
}

function buildBudgetSummary(userData) {
    const data = userData && typeof userData === 'object' ? userData : {};
    const balances = data.balances && typeof data.balances === 'object' ? data.balances : {};
    const categories = Array.isArray(data.categories) ? data.categories : [];
    const accounts = data.accounts && typeof data.accounts === 'object' ? data.accounts : {};
    const weekly = accounts.weekly && typeof accounts.weekly === 'object' ? accounts.weekly : {};
    const savingsBuckets = accounts.savingsBuckets && typeof accounts.savingsBuckets === 'object'
        ? accounts.savingsBuckets
        : {};
    const savingsBudgetPlan = accounts.savingsBudgetPlan && typeof accounts.savingsBudgetPlan === 'object'
        ? accounts.savingsBudgetPlan
        : {};

    const totalBalance = sumValues(balances);
    const monthlyIncome = toNumber(data.monthlyIncome);
    const monthlyExpenses = categories.reduce(function (sectionSum, category) {
        const items = Array.isArray(category && category.items) ? category.items : [];
        return sectionSum + items.reduce(function (itemSum, item) {
            return itemSum + toNumber(item && item.amount);
        }, 0);
    }, 0);

    const weeklyBalance = toNumber(weekly.balance);
    const savingsKeys = sortSavingsBucketKeys(savingsBuckets, accounts.savingsBucketOrder);
    const subscriptionsCategory = categories.find(function (category) {
        return category && category.id === 'subscriptions';
    });
    const subscriptionItems = Array.isArray(subscriptionsCategory && subscriptionsCategory.items)
        ? subscriptionsCategory.items
        : [];

    return {
        totalBalance: totalBalance,
        monthlyIncome: monthlyIncome,
        monthlyExpenses: monthlyExpenses,
        weeklyAllowance: {
            budget: weeklyBalance,
            used: weeklyBalance - weeklyBalance,
            remaining: weeklyBalance
        },
        savingsBuckets: savingsKeys.map(function (key) {
            return {
                id: key,
                name: key,
                currentAmount: toNumber(savingsBuckets[key]),
                targetAmount: Object.prototype.hasOwnProperty.call(savingsBudgetPlan, key)
                    ? toNumber(savingsBudgetPlan[key])
                    : null,
                deadline: null,
                color: null,
                emoji: null
            };
        }),
        subscriptions: subscriptionItems.map(function (item, index) {
            return {
                id: String(index),
                name: item && item.label ? String(item.label) : '',
                amount: toNumber(item && item.amount),
                nextBillingDate: null,
                category: 'subscriptions'
            };
        })
    };
}

exports.getBudgetSummary = onRequest({ secrets: ['DASHBOARD_SECRET'] }, async function (req, res) {
    res.set('Content-Type', 'application/json; charset=utf-8');

    if (req.method !== 'GET' && req.method !== 'POST') {
        res.set('Allow', 'GET, POST');
        return res.status(405).json({ error: 'Method not allowed.' });
    }

    try {
        const sharedSecret = getSharedSecret();
        const providedSecret = req.get('X-DashBoard-Secret') || '';
        if (!sharedSecret || providedSecret !== sharedSecret) {
            return res.status(401).json({ error: 'Unauthorized.' });
        }

        const idToken = getBearerToken(req.get('Authorization'));
        if (!idToken) {
            return res.status(401).json({ error: 'Unauthorized.' });
        }

        let decodedToken;
        try {
            decodedToken = await admin.auth().verifyIdToken(idToken);
        } catch (authError) {
            return res.status(401).json({ error: 'Unauthorized.' });
        }

        const uid = decodedToken && decodedToken.uid;
        if (!uid) {
            return res.status(401).json({ error: 'Unauthorized.' });
        }

        let snap;
        try {
            snap = await admin.firestore().collection('users').doc(uid).get();
        } catch (firestoreError) {
            console.error('getBudgetSummary Firestore read failed:', firestoreError);
            return res.status(500).json({ error: 'Failed to load budget summary.' });
        }

        const docData = snap.exists ? snap.data() : {};
        const summary = buildBudgetSummary(docData && docData.data ? docData.data : {});

        return res.status(200).json(summary);
    } catch (error) {
        console.error('getBudgetSummary failed:', error);
        return res.status(500).json({ error: 'Failed to load budget summary.' });
    }
});
