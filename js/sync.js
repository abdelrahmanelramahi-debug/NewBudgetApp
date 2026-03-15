/**
 * Sync v2: non-blocking, throttled pull, debounced push, retry with backoff.
 * Keeps same Firestore doc shape (data, lastUpdated, version) for existing users.
 */

(function (global) {
    'use strict';

    var SYNC_PROTOCOL_VERSION = 2;
    var PUSH_DEBOUNCE_MS = 1000;
    var PULL_THROTTLE_MS = 8000;
    var AUTO_SYNC_INTERVAL_MS = 45000;
    var MIN_SAVED_AGO_MS = 20000;
    var RETRY_DELAYS_MS = [2000, 4000, 8000];
    var MAX_RETRIES = 3;

    var syncInProgress = false;
    var lastSyncTime = null;
    var lastPullTime = 0;
    var lastSuccessfulSaveTime = 0;
    var pendingPush = false;
    var pushTimeoutId = null;
    var autoSyncInterval = null;
    var saveRetryCount = 0;
    var loadRetryCount = 0;
    var realtimeUnsubscribe = null;
    var realtimePullTimeoutId = null;

    function getCurrentUser() {
        return global.currentUser || null;
    }

    function hasMeaningfulData(data) {
        if (!data || typeof data !== 'object') return false;
        var hasCategories = data.categories && Array.isArray(data.categories) && data.categories.length > 0;
        var hasAccounts = data.accounts && typeof data.accounts === 'object';
        var hasBalances = data.balances && Object.keys(data.balances || {}).length > 0;
        return hasCategories || hasAccounts || hasBalances;
    }

    function updateSyncStatus(message, isSuccess, showRetry) {
        var statusEl = document.getElementById('sync-status');
        if (!statusEl) return;
        statusEl.textContent = message;
        statusEl.className = isSuccess ? 'text-emerald-600 text-[10px]' : 'text-red-500 text-[10px]';
        var wrap = document.getElementById('sync-status-wrap');
        if (wrap) {
            var retryBtn = document.getElementById('sync-retry-btn');
            if (showRetry) {
                if (!retryBtn) {
                    retryBtn = document.createElement('button');
                    retryBtn.id = 'sync-retry-btn';
                    retryBtn.className = 'text-[10px] font-bold text-indigo-600 hover:text-indigo-700 ml-1';
                    retryBtn.textContent = 'Retry';
                    retryBtn.type = 'button';
                    retryBtn.onclick = function () {
                        if (typeof loadStateFromCloud === 'function') loadStateFromCloud();
                        if (typeof saveStateToCloud === 'function') saveStateToCloud();
                    };
                    wrap.appendChild(retryBtn);
                }
                retryBtn.classList.remove('hidden');
            } else if (retryBtn) {
                retryBtn.classList.add('hidden');
            }
        }
    }

    function formatSyncTime(date) {
        if (!date || !date.getHours) return '';
        var h = date.getHours();
        var m = date.getMinutes();
        var am = h < 12;
        h = h % 12 || 12;
        return h + ':' + (m < 10 ? '0' : '') + m + (am ? 'a' : 'p');
    }

    // --- SAVE TO CLOUD ---
    function saveStateToCloud() {
        var user = getCurrentUser();
        if (!user) return;
        if (syncInProgress) {
            pendingPush = true;
            return;
        }

        try {
            syncInProgress = true;
            pendingPush = false;
            updateSyncStatus('Syncing…', true, false);
        } catch (e) {}

        var userDocRef = global.firebaseDb && global.firebaseDb.collection('users').doc(user.uid);
        if (!userDocRef) {
            syncInProgress = false;
            updateSyncStatus('Sync failed', false, true);
            return;
        }

        var serverTimestamp = global.firebase && global.firebase.firestore && global.firebase.firestore.FieldValue && global.firebase.firestore.FieldValue.serverTimestamp();
        if (!serverTimestamp) {
            syncInProgress = false;
            updateSyncStatus('Sync failed', false, true);
            return;
        }

        // Theme is device-local only: do not sync across devices
        var dataToSave = JSON.parse(JSON.stringify(state));
        if (dataToSave.settings && Object.prototype.hasOwnProperty.call(dataToSave.settings, 'theme')) {
            delete dataToSave.settings.theme;
        }
        return userDocRef.set({
            data: dataToSave,
            lastUpdated: serverTimestamp,
            version: state.schemaVersion || 2,
            syncProtocolVersion: SYNC_PROTOCOL_VERSION
        }, { merge: true }).then(function () {
            return userDocRef.get({ source: 'server' });
        }).then(function (docSnap) {
            var savedTime = Date.now();
            if (docSnap && docSnap.exists && docSnap.data().lastUpdated) {
                var lastUpdated = docSnap.data().lastUpdated;
                if (typeof lastUpdated.toMillis === 'function') savedTime = lastUpdated.toMillis();
            }
            try {
                var modKey = STORAGE_KEYS.MODIFIED;
                var syncKey = STORAGE_KEYS.LAST_SYNCED;
                global.localStorage.setItem(modKey, String(savedTime));
                global.localStorage.setItem(syncKey, String(savedTime));
            } catch (e) {}
            lastSyncTime = savedTime ? new Date(savedTime) : new Date();
            lastSuccessfulSaveTime = Date.now();
            saveRetryCount = 0;
            updateSyncStatus('Saved ' + formatSyncTime(lastSyncTime), true, false);
            if (typeof refreshUI === 'function') refreshUI();
        }).catch(function (error) {
            console.error('Save to cloud error:', error);
            saveRetryCount = (saveRetryCount || 0) + 1;
            if (saveRetryCount <= MAX_RETRIES && RETRY_DELAYS_MS[saveRetryCount - 1]) {
                var delay = RETRY_DELAYS_MS[saveRetryCount - 1];
                updateSyncStatus('Sync failed, retrying in ' + (delay / 1000) + 's…', false, false);
                setTimeout(function () { saveStateToCloud(); }, delay);
            } else {
                updateSyncStatus('Sync failed', false, true);
            }
        }).finally(function () {
            syncInProgress = false;
            if (pendingPush) {
                pendingPush = false;
                setTimeout(saveStateToCloud, 400);
            }
        });
    }

    // --- LOAD FROM CLOUD ---
    function loadStateFromCloud(retryCount) {
        var user = getCurrentUser();
        if (!user) return Promise.resolve();
        if (syncInProgress) return Promise.resolve();

        retryCount = retryCount || 0;
        try {
            syncInProgress = true;
            updateSyncStatus('Syncing…', true, false);
        } catch (e) {}

        var userDocRef = global.firebaseDb && global.firebaseDb.collection('users').doc(user.uid);
        if (!userDocRef) {
            syncInProgress = false;
            updateSyncStatus('Sync failed', false, true);
            return Promise.resolve();
        }

        return userDocRef.get({ source: 'server' }).then(function (docSnap) {
            if (!docSnap.exists) {
                return saveStateToCloud().then(function () {
                    updateSyncStatus('Synced', true, false);
                    if (typeof updateGlobalUI === 'function') updateGlobalUI();
                });
            }

            var cloudData = docSnap.data();
            var cloudTime = 0;
            if (cloudData.lastUpdated && typeof cloudData.lastUpdated.toMillis === 'function') {
                cloudTime = cloudData.lastUpdated.toMillis();
            }
            var localModified = 0;
            var lastSyncedToCloud = 0;
            try {
                var modKey = STORAGE_KEYS.MODIFIED;
                var syncKey = STORAGE_KEYS.LAST_SYNCED;
                var stored = global.localStorage.getItem(modKey);
                var synced = global.localStorage.getItem(syncKey);
                if (stored) localModified = parseInt(stored, 10) || 0;
                if (synced) lastSyncedToCloud = parseInt(synced, 10) || 0;
            } catch (e) {}

            // Core rule:
            // - If cloud has meaningful data and is newer than what we've last synced locally, pull cloud (even if local "modified" time is newer).
            // - Only push local if (a) local has changed since last sync AND (b) cloud has not changed since last sync.
            var cloudHasData = hasMeaningfulData(cloudData.data);
            var localHasData = hasMeaningfulData(state);

            if (cloudHasData && cloudTime > lastSyncedToCloud) {
                // Cloud is newer than our last known synced version -> pull cloud below.
            } else if (!cloudHasData && localHasData) {
                // Cloud empty but local has data -> seed cloud from local.
                return saveStateToCloud().then(function () {
                    if (typeof refreshUI === 'function') refreshUI();
                    updateSyncStatus('Synced', true, false);
                });
            } else if (localModified > lastSyncedToCloud && localHasData && cloudTime <= lastSyncedToCloud) {
                // Local changed since last sync, and cloud hasn't changed since last sync -> push local.
                return saveStateToCloud().then(function () {
                    if (typeof refreshUI === 'function') refreshUI();
                    updateSyncStatus('Synced (local)', true, false);
                    if (cloudData.lastUpdated) lastSyncTime = cloudData.lastUpdated.toDate ? cloudData.lastUpdated.toDate() : new Date();
                });
            } else {
                // Already in sync (or both empty) -> nothing to do.
                updateSyncStatus('Synced', true, false);
                return;
            }

            if (cloudData.data && typeof cloudData.data === 'object' && cloudHasData) {
                var localTheme = (state.settings && state.settings.theme) || (global.localStorage && global.localStorage.getItem('bubudget_theme')) || 'light';
                var localDeletedPayables = Array.isArray(state._deletedPayablesBuckets) ? state._deletedPayablesBuckets.slice() : [];
                var localDeletedSavings = Array.isArray(state._deletedSavingsBuckets) ? state._deletedSavingsBuckets.slice() : [];
                state = { ...state, ...cloudData.data };
                var cloudDeletedPayables = Array.isArray(cloudData.data._deletedPayablesBuckets) ? cloudData.data._deletedPayablesBuckets : [];
                var mergedPayables = localDeletedPayables.concat(cloudDeletedPayables);
                if (mergedPayables.length) {
                    var seen = {};
                    state._deletedPayablesBuckets = mergedPayables.filter(function (n) {
                        if (!n) return false;
                        if (seen[n]) return false;
                        seen[n] = true;
                        return true;
                    });
                }
                var cloudDeletedSavings = Array.isArray(cloudData.data._deletedSavingsBuckets) ? cloudData.data._deletedSavingsBuckets : [];
                var mergedSavings = localDeletedSavings.concat(cloudDeletedSavings);
                if (mergedSavings.length) {
                    var seenS = {};
                    state._deletedSavingsBuckets = mergedSavings.filter(function (n) {
                        if (!n) return false;
                        if (seenS[n]) return false;
                        seenS[n] = true;
                        return true;
                    });
                }
                if (typeof migrateState === 'function') migrateState();
                if (typeof ensureSystemSavings === 'function') ensureSystemSavings();
                if (typeof ensureCoreItems === 'function') ensureCoreItems();
                if (typeof ensureSettings === 'function') ensureSettings();
                if (state.settings) state.settings.theme = localTheme;
                if (typeof ensureWeeklyState === 'function') ensureWeeklyState();
                if (typeof purgeDeletedPayablesBuckets === 'function') purgeDeletedPayablesBuckets();
                if (typeof purgeDeletedSavingsBuckets === 'function') purgeDeletedSavingsBuckets();
                var stateKey = STORAGE_KEYS.STATE;
                var modKey = STORAGE_KEYS.MODIFIED;
                var syncKey = STORAGE_KEYS.LAST_SYNCED;
                global.localStorage.setItem(stateKey, JSON.stringify(state));
                if (cloudData.lastUpdated && typeof cloudData.lastUpdated.toMillis === 'function') {
                    var cloudMillis = cloudData.lastUpdated.toMillis();
                    try {
                        global.localStorage.setItem(modKey, String(cloudMillis));
                        global.localStorage.setItem(syncKey, String(cloudMillis));
                    } catch (e) {}
                }
                if (typeof refreshUI === 'function') refreshUI();
                updateSyncStatus('Synced', true, false);
                lastSyncTime = cloudData.lastUpdated && cloudData.lastUpdated.toDate ? cloudData.lastUpdated.toDate() : new Date();
            } else {
                updateSyncStatus('Cloud empty, using local', true, false);
                if (typeof updateGlobalUI === 'function') updateGlobalUI();
            }
            loadRetryCount = 0;
        }).catch(function (error) {
            console.error('Load from cloud error:', error);
            loadRetryCount = (loadRetryCount || 0) + 1;
            if (retryCount < MAX_RETRIES && RETRY_DELAYS_MS[retryCount]) {
                var delay = RETRY_DELAYS_MS[retryCount];
                updateSyncStatus('Load failed, retrying…', false, false);
                setTimeout(function () { loadStateFromCloud(retryCount + 1); }, delay);
                return;
            }
            try {
                var stateKey = STORAGE_KEYS.STATE;
                var localBackupStr = global.localStorage.getItem(stateKey);
                if (localBackupStr) {
                    var localBackup = JSON.parse(localBackupStr);
                    state = { ...state, ...localBackup };
                    if (typeof migrateState === 'function') migrateState();
                    if (typeof ensureSystemSavings === 'function') ensureSystemSavings();
                    if (typeof ensureCoreItems === 'function') ensureCoreItems();
                    if (typeof ensureSettings === 'function') ensureSettings();
                    if (state.accounts && state.accounts.surplus === 0 && hasMeaningfulData(state) && typeof recalculateSurplusFromReality === 'function') {
                        recalculateSurplusFromReality();
                    }
                    global.localStorage.setItem(stateKey, JSON.stringify(state));
                    if (typeof refreshUI === 'function') refreshUI();
                }
            } catch (e) {
                console.error('Failed to restore local backup:', e);
            }
            updateSyncStatus('Load failed – using local', false, true);
        }).finally(function () {
            syncInProgress = false;
            lastPullTime = Date.now();
        });
    }

    function schedulePush() {
        if (!getCurrentUser()) return;
        if (pushTimeoutId) clearTimeout(pushTimeoutId);
        pushTimeoutId = setTimeout(function () {
            pushTimeoutId = null;
            saveStateToCloud();
        }, PUSH_DEBOUNCE_MS);
    }

    function startAutoSync() {
        if (autoSyncInterval) return;
        autoSyncInterval = setInterval(function () {
            if (!getCurrentUser() || syncInProgress) return;
            var now = Date.now();
            if (lastSuccessfulSaveTime && (now - lastSuccessfulSaveTime) < MIN_SAVED_AGO_MS) return;
            // Use the conflict-aware load logic for auto-sync so idle tabs
            // don't push stale local state over newer cloud/mobile changes.
            loadStateFromCloud(0);
        }, AUTO_SYNC_INTERVAL_MS);
    }

    function flushCloudSave() {
        if (pushTimeoutId) {
            clearTimeout(pushTimeoutId);
            pushTimeoutId = null;
        }
        if (getCurrentUser()) saveStateToCloud();
    }

    function pullFromCloudWhenVisible() {
        if (!getCurrentUser() || syncInProgress) return;
        var now = Date.now();
        if ((now - lastPullTime) < PULL_THROTTLE_MS) return;
        loadStateFromCloud(0);
    }

    function startRealtimeSync() {
        var user = getCurrentUser();
        if (!user || !global.firebaseDb) return;
        if (realtimeUnsubscribe) return;
        var userDocRef = global.firebaseDb.collection('users').doc(user.uid);
        realtimeUnsubscribe = userDocRef.onSnapshot(function (snapshot) {
            if (syncInProgress) return;
            if (realtimePullTimeoutId) clearTimeout(realtimePullTimeoutId);
            realtimePullTimeoutId = setTimeout(function () {
                realtimePullTimeoutId = null;
                loadStateFromCloud(0);
            }, 1200);
        });
    }

    function stopRealtimeSync() {
        if (realtimeUnsubscribe) {
            try { realtimeUnsubscribe(); } catch (e) {}
            realtimeUnsubscribe = null;
        }
        if (realtimePullTimeoutId) {
            clearTimeout(realtimePullTimeoutId);
            realtimePullTimeoutId = null;
        }
    }

    function stopAutoSync() {
        if (autoSyncInterval) {
            clearInterval(autoSyncInterval);
            autoSyncInterval = null;
        }
        if (pushTimeoutId) {
            clearTimeout(pushTimeoutId);
            pushTimeoutId = null;
        }
        stopRealtimeSync();
    }

    global.saveStateToCloud = saveStateToCloud;
    global.loadStateFromCloud = loadStateFromCloud;
    global.updateSyncStatus = updateSyncStatus;
    global.startAutoSync = startAutoSync;
    global.stopAutoSync = stopAutoSync;
    global.flushCloudSave = flushCloudSave;
    global.pullFromCloudWhenVisible = pullFromCloudWhenVisible;
    global.scheduleSyncPush = schedulePush;
    global.startRealtimeSync = startRealtimeSync;
    global.stopRealtimeSync = stopRealtimeSync;

})(typeof window !== 'undefined' ? window : this);
