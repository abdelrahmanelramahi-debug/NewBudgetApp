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
    var EDIT_LOCK_TTL_MS = 45000;
    var EDIT_LOCK_HEARTBEAT_MS = 12000;
    var EDIT_LOCK_POLL_MS = 10000;

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
    /** Server doc lastUpdated (ms) we last fully applied; skip redundant load+refresh on editLock-only snapshots. */
    var lastAppliedCloudLastUpdatedMs = -1;
    var lockHeartbeatInterval = null;
    var lockPollInterval = null;
    var deviceId = '';
    var deviceLabel = '';
    var editLockState = {
        known: false,
        canEdit: false,
        holderId: '',
        holderLabel: '',
        expiresAt: 0,
        reason: 'unknown'
    };
    var hasShownViewOnlyPrompt = false;
    // Prevent stale-tab overwrites on refresh/close:
    // don't allow any forced "flush" save until we've successfully pulled cloud at least once this session.
    var hasCompletedInitialCloudLoad = false;

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

    function getUserDocRef() {
        var user = getCurrentUser();
        if (!user || !global.firebaseDb) return null;
        return global.firebaseDb.collection('users').doc(user.uid);
    }

    function randomId() {
        return 'dev_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36);
    }

    function initDeviceIdentity() {
        if (!global.localStorage) return;
        if (!deviceId) {
            try {
                deviceId = global.localStorage.getItem(STORAGE_KEYS.DEVICE_ID) || '';
            } catch (e) {}
            if (!deviceId) {
                deviceId = randomId();
                try { global.localStorage.setItem(STORAGE_KEYS.DEVICE_ID, deviceId); } catch (e2) {}
            }
        }
        if (!deviceLabel) {
            try {
                deviceLabel = global.localStorage.getItem(STORAGE_KEYS.DEVICE_LABEL) || '';
            } catch (e3) {}
            if (!deviceLabel) {
                var ua = (global.navigator && global.navigator.userAgent) ? global.navigator.userAgent : '';
                deviceLabel = /Mobile|Android|iPhone|iPad/i.test(ua) ? 'Mobile device' : 'Desktop device';
                try { global.localStorage.setItem(STORAGE_KEYS.DEVICE_LABEL, deviceLabel); } catch (e4) {}
            }
        }
    }

    function normalizeLock(lock) {
        lock = lock || {};
        var now = Date.now();
        var expiresAt = Number(lock.expiresAt) || 0;
        var holderId = lock.holderId || '';
        var holderLabel = lock.holderLabel || 'another device';
        var active = !!holderId && expiresAt > now;
        return {
            holderId: holderId,
            holderLabel: holderLabel,
            expiresAt: expiresAt,
            active: active
        };
    }

    function setEditLockState(next) {
        var prevCanEdit = !!editLockState.canEdit;
        var prevHolderId = editLockState.holderId || '';
        editLockState = {
            known: !!next.known,
            canEdit: !!next.canEdit,
            holderId: next.holderId || '',
            holderLabel: next.holderLabel || '',
            expiresAt: Number(next.expiresAt) || 0,
            reason: next.reason || 'unknown'
        };
        try {
            global.localStorage.setItem(STORAGE_KEYS.EDIT_LOCK_CACHE, JSON.stringify(editLockState));
        } catch (e) {}
        if (typeof global.updateEditLockUI === 'function') global.updateEditLockUI(editLockState);
        if (editLockState.canEdit) {
            hasShownViewOnlyPrompt = false;
        } else if (
            editLockState.known &&
            editLockState.reason === 'locked_by_other' &&
            typeof document !== 'undefined' &&
            document.visibilityState === 'visible' &&
            typeof global.promptEditLockTakeover === 'function' &&
            (!hasShownViewOnlyPrompt || prevCanEdit || prevHolderId !== editLockState.holderId)
        ) {
            hasShownViewOnlyPrompt = true;
            global.promptEditLockTakeover();
        }
    }

    function applyLockFromDoc(docData) {
        initDeviceIdentity();
        var lock = normalizeLock(docData && docData.editLock);
        if (!lock.active) {
            setEditLockState({
                known: true,
                canEdit: true,
                holderId: deviceId,
                holderLabel: deviceLabel,
                expiresAt: 0,
                reason: 'unlocked'
            });
            return;
        }
        if (lock.holderId === deviceId) {
            setEditLockState({
                known: true,
                canEdit: true,
                holderId: lock.holderId,
                holderLabel: lock.holderLabel,
                expiresAt: lock.expiresAt,
                reason: 'owner'
            });
            return;
        }
        setEditLockState({
            known: true,
            canEdit: false,
            holderId: lock.holderId,
            holderLabel: lock.holderLabel,
            expiresAt: lock.expiresAt,
            reason: 'locked_by_other'
        });
    }

    function fetchEditLock() {
        var userDocRef = getUserDocRef();
        if (!userDocRef) return Promise.resolve(editLockState);
        return userDocRef.get({ source: 'server' }).then(function (snap) {
            var data = (snap && snap.exists) ? (snap.data() || {}) : {};
            applyLockFromDoc(data);
            return editLockState;
        }).catch(function (err) {
            console.warn('Edit lock fetch failed:', err);
            setEditLockState({
                known: false,
                canEdit: false,
                holderId: editLockState.holderId,
                holderLabel: editLockState.holderLabel,
                expiresAt: editLockState.expiresAt,
                reason: 'lock_check_failed'
            });
            return editLockState;
        });
    }

    function writeLock(forceTakeover) {
        initDeviceIdentity();
        var userDocRef = getUserDocRef();
        if (!userDocRef || !global.firebaseDb) return Promise.resolve(false);
        var expiresAt = Date.now() + EDIT_LOCK_TTL_MS;
        var nextLock = {
            holderId: deviceId,
            holderLabel: deviceLabel,
            heartbeatAt: Date.now(),
            expiresAt: expiresAt,
            updatedAt: Date.now()
        };
        return global.firebaseDb.runTransaction(function (tx) {
            return tx.get(userDocRef).then(function (snap) {
                var data = (snap && snap.exists) ? (snap.data() || {}) : {};
                var current = normalizeLock(data.editLock);
                if (current.active && current.holderId !== deviceId && !forceTakeover) {
                    return false;
                }
                tx.set(userDocRef, { editLock: nextLock }, { merge: true });
                return true;
            });
        }).then(function (acquired) {
            if (acquired) {
                setEditLockState({
                    known: true,
                    canEdit: true,
                    holderId: deviceId,
                    holderLabel: deviceLabel,
                    expiresAt: expiresAt,
                    reason: forceTakeover ? 'takeover' : 'owner'
                });
            }
            return acquired;
        }).catch(function (err) {
            console.warn('Edit lock write failed:', err);
            // Do not set known:false here: that blocks saveState + saveStateToCloud even when the
            // server still shows the doc unlocked. Re-sync lock from Firestore so canEdit matches reality.
            return fetchEditLock().then(function () {
                return false;
            }).catch(function (fetchErr) {
                console.warn('Edit lock re-fetch after write failed:', fetchErr);
                setEditLockState({
                    known: false,
                    canEdit: false,
                    holderId: editLockState.holderId,
                    holderLabel: editLockState.holderLabel,
                    expiresAt: editLockState.expiresAt,
                    reason: 'lock_write_failed'
                });
                return false;
            });
        });
    }

    function renewEditLock() {
        if (!editLockState.canEdit) return Promise.resolve(false);
        return writeLock(true);
    }

    function acquireEditLock() {
        return writeLock(false);
    }

    function takeOverEditLock() {
        return writeLock(true);
    }

    function releaseEditLock() {
        initDeviceIdentity();
        var userDocRef = getUserDocRef();
        if (!userDocRef) return Promise.resolve();
        return userDocRef.get({ source: 'server' }).then(function (snap) {
            var data = (snap && snap.exists) ? (snap.data() || {}) : {};
            var current = normalizeLock(data.editLock);
            if (!current.holderId || current.holderId !== deviceId) return;
            return userDocRef.set({
                editLock: {
                    holderId: '',
                    holderLabel: '',
                    heartbeatAt: 0,
                    expiresAt: 0,
                    updatedAt: Date.now()
                }
            }, { merge: true });
        }).catch(function () {}).finally(function () {
            setEditLockState({
                known: true,
                canEdit: false,
                holderId: '',
                holderLabel: '',
                expiresAt: 0,
                reason: 'released'
            });
        });
    }

    function canEditNow() {
        if (!getCurrentUser()) return true;
        return !!(editLockState.known && editLockState.canEdit);
    }

    function refreshEditLock() {
        return fetchEditLock().then(function (current) {
            if (current.canEdit) return renewEditLock();
            return false;
        });
    }

    /** First fetch + acquire/renew; must complete before app interaction (canEditNow). Intervals are separate. */
    function primeEditLock() {
        if (!getCurrentUser()) return Promise.resolve();
        initDeviceIdentity();
        return fetchEditLock().then(function (current) {
            if (!current.canEdit) return acquireEditLock();
            return renewEditLock();
        });
    }

    function startEditLockLifecycle() {
        if (!getCurrentUser()) return;
        initDeviceIdentity();
        if (!lockHeartbeatInterval) {
            lockHeartbeatInterval = setInterval(function () {
                if (!getCurrentUser()) return;
                if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
                refreshEditLock();
            }, EDIT_LOCK_HEARTBEAT_MS);
        }
        if (!lockPollInterval) {
            lockPollInterval = setInterval(function () {
                if (!getCurrentUser()) return;
                fetchEditLock();
            }, EDIT_LOCK_POLL_MS);
        }
    }

    function stopEditLockLifecycle() {
        if (lockHeartbeatInterval) {
            clearInterval(lockHeartbeatInterval);
            lockHeartbeatInterval = null;
        }
        if (lockPollInterval) {
            clearInterval(lockPollInterval);
            lockPollInterval = null;
        }
    }

    // --- SAVE TO CLOUD ---
    // options.fromLoad: invoked from loadStateFromCloud while it already holds syncInProgress;
    // must not take/release the outer sync lock (load's finally clears it).
    function saveStateToCloud(options) {
        options = options || {};
        var fromLoad = !!options.fromLoad;
        var user = getCurrentUser();
        if (!user) return Promise.resolve();
        if (!canEditNow()) {
            updateSyncStatus('View-only on this device', false, false);
            return Promise.resolve();
        }
        if (!fromLoad && syncInProgress) {
            pendingPush = true;
            return Promise.resolve();
        }

        if (!fromLoad) {
            try {
                syncInProgress = true;
                pendingPush = false;
                updateSyncStatus('Syncing…', true, false);
            } catch (e) {}
        }

        var userDocRef = global.firebaseDb && global.firebaseDb.collection('users').doc(user.uid);
        if (!userDocRef) {
            if (!fromLoad) syncInProgress = false;
            updateSyncStatus('Sync failed', false, true);
            return Promise.reject(new Error('no_firestore'));
        }

        var serverTimestamp = global.firebase && global.firebase.firestore && global.firebase.firestore.FieldValue && global.firebase.firestore.FieldValue.serverTimestamp();
        if (!serverTimestamp) {
            if (!fromLoad) syncInProgress = false;
            updateSyncStatus('Sync failed', false, true);
            return Promise.reject(new Error('no_timestamp'));
        }

        // Guard against overwriting newer cloud data from an idle/stale tab.
        // If the cloud has changed since we last synced locally, do NOT push automatically.
        // Instead, pull and let the conflict-aware load decide next steps.
        var lastSyncedToCloud = 0;
        var localModified = 0;
        try {
            var modKey0 = STORAGE_KEYS.MODIFIED;
            var syncKey0 = STORAGE_KEYS.LAST_SYNCED;
            var stored0 = global.localStorage.getItem(modKey0);
            var synced0 = global.localStorage.getItem(syncKey0);
            if (stored0) localModified = parseInt(stored0, 10) || 0;
            if (synced0) lastSyncedToCloud = parseInt(synced0, 10) || 0;
        } catch (e0) {}

        // Theme is device-local only: do not sync across devices
        var dataToSave = JSON.parse(JSON.stringify(state));
        if (dataToSave.settings && Object.prototype.hasOwnProperty.call(dataToSave.settings, 'theme')) {
            delete dataToSave.settings.theme;
        }

        return userDocRef.get({ source: 'server' }).then(function (existingSnap) {
            if (existingSnap && existingSnap.exists) {
                var existing = existingSnap.data() || {};
                var cloudTime = 0;
                if (existing.lastUpdated && typeof existing.lastUpdated.toMillis === 'function') {
                    cloudTime = existing.lastUpdated.toMillis();
                }
                var cloudHasData = hasMeaningfulData(existing.data);
                // If cloud is newer than what we *know* we've synced, this device is stale.
                // Never allow an automatic overwrite (common on refresh/pagehide).
                if (cloudHasData && cloudTime > lastSyncedToCloud && localModified <= lastSyncedToCloud) {
                    updateSyncStatus('Cloud newer — pulling…', true, false);
                    // Release save's lock so loadStateFromCloud can run (it takes its own lock).
                    if (!fromLoad) syncInProgress = false;
                    return loadStateFromCloud(0);
                }
            }
            return userDocRef.set({
                data: dataToSave,
                lastUpdated: serverTimestamp,
                version: state.schemaVersion || 2,
                syncProtocolVersion: SYNC_PROTOCOL_VERSION
            }, { merge: true }).then(function () {
                return userDocRef.get({ source: 'server' });
            });
        }).then(function (docSnap) {
            // After a pull instead of a save, docSnap is undefined — do not write fake sync times.
            if (!docSnap || !docSnap.exists) {
                return;
            }
            var savedTime = Date.now();
            if (docSnap.data().lastUpdated) {
                var lastUpdated = docSnap.data().lastUpdated;
                if (typeof lastUpdated.toMillis === 'function') savedTime = lastUpdated.toMillis();
            }
            lastAppliedCloudLastUpdatedMs = savedTime;
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
            if (!fromLoad) {
                saveRetryCount = (saveRetryCount || 0) + 1;
                if (saveRetryCount <= MAX_RETRIES && RETRY_DELAYS_MS[saveRetryCount - 1]) {
                    var delay = RETRY_DELAYS_MS[saveRetryCount - 1];
                    updateSyncStatus('Sync failed, retrying in ' + (delay / 1000) + 's…', false, false);
                    setTimeout(function () { saveStateToCloud(); }, delay);
                } else {
                    updateSyncStatus('Sync failed', false, true);
                }
            }
        }).finally(function () {
            if (!fromLoad) {
                syncInProgress = false;
                if (pendingPush) {
                    pendingPush = false;
                    setTimeout(saveStateToCloud, 400);
                }
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
                return saveStateToCloud({ fromLoad: true }).then(function () {
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
                return saveStateToCloud({ fromLoad: true }).then(function () {
                    if (typeof refreshUI === 'function') refreshUI();
                    updateSyncStatus('Synced', true, false);
                });
            } else if (localModified > lastSyncedToCloud && localHasData && cloudTime <= lastSyncedToCloud) {
                // Local changed since last sync, and cloud hasn't changed since last sync -> push local.
                return saveStateToCloud({ fromLoad: true }).then(function () {
                    if (typeof refreshUI === 'function') refreshUI();
                    updateSyncStatus('Synced (local)', true, false);
                    if (cloudData.lastUpdated) lastSyncTime = cloudData.lastUpdated.toDate ? cloudData.lastUpdated.toDate() : new Date();
                });
            } else {
                // Already in sync (or both empty) -> nothing to do.
                if (cloudTime > 0) lastAppliedCloudLastUpdatedMs = cloudTime;
                updateSyncStatus('Synced', true, false);
                return;
            }

            if (cloudData.data && typeof cloudData.data === 'object' && cloudHasData) {
                var localTheme = (state.settings && state.settings.theme) || (global.localStorage && global.localStorage.getItem('bubudget_theme')) || 'sepia';
                var localDeletedPayables = Array.isArray(state._deletedPayablesBuckets) ? state._deletedPayablesBuckets.slice() : [];
                var localDeletedSavings = Array.isArray(state._deletedSavingsBuckets) ? state._deletedSavingsBuckets.slice() : [];
                var localDeletedTransportation = Array.isArray(state._deletedTransportationBuckets) ? state._deletedTransportationBuckets.slice() : [];
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
                var cloudDeletedTransportation = Array.isArray(cloudData.data._deletedTransportationBuckets) ? cloudData.data._deletedTransportationBuckets : [];
                var mergedTransportation = localDeletedTransportation.concat(cloudDeletedTransportation);
                if (mergedTransportation.length) {
                    var seenT = {};
                    state._deletedTransportationBuckets = mergedTransportation.filter(function (n) {
                        if (!n) return false;
                        if (seenT[n]) return false;
                        seenT[n] = true;
                        return true;
                    });
                }
                if (typeof migrateState === 'function') migrateState();
                if (typeof ensureSystemSavings === 'function') ensureSystemSavings();
                if (typeof ensureCoreItems === 'function') ensureCoreItems();
                if (typeof ensureSettings === 'function') ensureSettings();
                if (typeof normalizeMoneyPrecision === 'function') normalizeMoneyPrecision();
                if (state.settings) state.settings.theme = localTheme;
                if (typeof ensureWeeklyState === 'function') ensureWeeklyState();
                if (typeof purgeDeletedPayablesBuckets === 'function') purgeDeletedPayablesBuckets();
                if (typeof purgeDeletedSavingsBuckets === 'function') purgeDeletedSavingsBuckets();
                if (typeof purgeDeletedTransportationBuckets === 'function') purgeDeletedTransportationBuckets();
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
                    lastAppliedCloudLastUpdatedMs = cloudMillis;
                }
                if (typeof refreshUI === 'function') refreshUI();
                updateSyncStatus('Synced', true, false);
                lastSyncTime = cloudData.lastUpdated && cloudData.lastUpdated.toDate ? cloudData.lastUpdated.toDate() : new Date();
                hasCompletedInitialCloudLoad = true;
            } else {
                updateSyncStatus('Cloud empty, using local', true, false);
                if (typeof updateGlobalUI === 'function') updateGlobalUI();
                if (cloudTime > 0) lastAppliedCloudLastUpdatedMs = cloudTime;
                hasCompletedInitialCloudLoad = true;
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
                    if (typeof normalizeMoneyPrecision === 'function') normalizeMoneyPrecision();
                    if ((state.schemaVersion || 1) < 2 &&
                        state.accounts &&
                        state.accounts.surplus === 0 &&
                        hasMeaningfulData(state) &&
                        typeof recalculateSurplusFromReality === 'function') {
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
        startEditLockLifecycle();
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
        // On refresh/close (pagehide/hidden), avoid pushing until we've pulled at least once this session.
        // This prevents a stale, long-idle tab from overwriting newer cloud/mobile data.
        if (getCurrentUser() && hasCompletedInitialCloudLoad) saveStateToCloud();
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
            try {
                var snapData = snapshot && snapshot.exists ? (snapshot.data() || {}) : {};
                applyLockFromDoc(snapData);
            } catch (e) {}
            if (syncInProgress) return;
            var snapLu = 0;
            if (snapshot && snapshot.exists && snapshot.data()) {
                var sd = snapshot.data();
                if (sd.lastUpdated && typeof sd.lastUpdated.toMillis === 'function') {
                    snapLu = sd.lastUpdated.toMillis();
                }
            }
            // Heartbeat / editLock-only writes do not bump lastUpdated — avoid full pull+refreshUI storm on main thread.
            if (hasCompletedInitialCloudLoad && snapLu > 0 && snapLu === lastAppliedCloudLastUpdatedMs) {
                return;
            }
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
        lastAppliedCloudLastUpdatedMs = -1;
        stopEditLockLifecycle();
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
    global.SYNC_PROTOCOL_VERSION = SYNC_PROTOCOL_VERSION;
    global.startRealtimeSync = startRealtimeSync;
    global.stopRealtimeSync = stopRealtimeSync;
    global.fetchEditLock = fetchEditLock;
    global.acquireEditLock = acquireEditLock;
    global.takeOverEditLock = takeOverEditLock;
    global.releaseEditLock = releaseEditLock;
    global.canEditNow = canEditNow;
    global.getEditLockState = function () { return editLockState; };
    global.refreshEditLock = refreshEditLock;
    global.startEditLockLifecycle = startEditLockLifecycle;
    global.stopEditLockLifecycle = stopEditLockLifecycle;
    global.primeEditLock = primeEditLock;

    /** If cloud load hung past auth timeout, clear the lock so sync can recover. */
    global.forceSyncIdle = function () {
        syncInProgress = false;
    };

})(typeof window !== 'undefined' ? window : this);
