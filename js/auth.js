// AUTHENTICATION & CLOUD SYNC

let currentUser = null;
let syncInProgress = false;
let lastSyncTime = null;
var authReady = false;
var authReadyCallbacks = [];

function runAuthReadyCallbacks() {
    if (authReady) return;
    authReady = true;
    authReadyCallbacks.forEach(function (cb) { try { cb(); } catch (e) { console.error(e); } });
    authReadyCallbacks = [];
}

/** Call when app is ready to show (after cloud load if logged in). Use so first paint has correct state and no surplus flash. */
function whenAuthReady(callback) {
    if (authReady) {
        try { callback(); } catch (e) { console.error(e); }
        return;
    }
    authReadyCallbacks.push(callback);
}

// Initialize Firebase Auth
function initAuth() {
    if (!window.firebaseAuth) {
        console.error('Firebase not initialized');
        runAuthReadyCallbacks();
        return;
    }

    window.firebaseAuth.onAuthStateChanged((user) => {
        if (user) {
            currentUser = user;
            updateAuthUI();
            // Load local state FIRST, then sync from cloud (cloud will merge/overwrite if valid)
            var stateKey = STORAGE_KEYS.STATE;
            const localState = localStorage.getItem(stateKey);
            if (localState) {
                try {
                    const local = JSON.parse(localState);
                    if (local.categories && local.categories.length > 0) {
                        state = { ...state, ...local };
                        migrateState();
                        ensureSystemSavings();
                        ensureCoreItems();
                        ensureSettings();
                    }
                } catch (e) {
                    console.error('Failed to load local state:', e);
                }
            }
            user.getIdToken(true).then(function() {
                loadStateFromCloud().then(function() {
                    if (typeof requestAnimationFrame !== 'undefined' && typeof updateGlobalUI === 'function') {
                        requestAnimationFrame(updateGlobalUI);
                    } else if (typeof updateGlobalUI === 'function') updateGlobalUI();
                    startAutoSync();
                }).finally(runAuthReadyCallbacks);
            }).catch(function() {
                loadStateFromCloud().then(function() {
                    if (typeof updateGlobalUI === 'function') updateGlobalUI();
                    startAutoSync();
                }).finally(runAuthReadyCallbacks);
            });
        } else {
            currentUser = null;
            updateAuthUI();
            stopAutoSync();
            runAuthReadyCallbacks();
        }
    });
}

// Convert Firebase auth errors to user-friendly messages
function getAuthErrorMessage(error) {
    const code = error.code || '';
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/invalid-email') {
        return 'Wrong email or password. Check for typos, or use "Forgot password?" to reset.';
    }
    if (code === 'auth/user-not-found') {
        return 'No account with this email. Sign up first, or check the email address.';
    }
    if (code === 'auth/too-many-requests') {
        return 'Too many failed attempts. Try again later or use "Forgot password?".';
    }
    if (code === 'auth/email-already-in-use') {
        return 'This email is already registered. Use Sign In instead.';
    }
    if (code === 'auth/weak-password') {
        return 'Password must be at least 6 characters.';
    }
    return error.message || 'Something went wrong. Try again.';
}

// Sign Up
async function signUp(email, password) {
    const trimmedEmail = (email || '').trim().toLowerCase();
    const trimmedPassword = (password || '').trim();
    if (!trimmedEmail || !trimmedPassword) {
        return { success: false, error: 'Please enter email and password.' };
    }
    if (trimmedPassword.length < 6) {
        return { success: false, error: 'Password must be at least 6 characters.' };
    }
    try {
        const userCredential = await window.firebaseAuth.createUserWithEmailAndPassword(trimmedEmail, trimmedPassword);
        currentUser = userCredential.user;
        
        // Save initial state to cloud
        await saveStateToCloud();
        
        closeAuthModal();
        return { success: true };
    } catch (error) {
        return { success: false, error: getAuthErrorMessage(error) };
    }
}

// Sign In
async function signIn(email, password) {
    const trimmedEmail = (email || '').trim().toLowerCase();
    const trimmedPassword = (password || '').trim();
    if (!trimmedEmail || !trimmedPassword) {
        return { success: false, error: 'Please enter email and password.' };
    }
    try {
        const userCredential = await window.firebaseAuth.signInWithEmailAndPassword(trimmedEmail, trimmedPassword);
        currentUser = userCredential.user;
        
        await loadStateFromCloud();
        closeAuthModal();
        return { success: true };
    } catch (error) {
        return { success: false, error: getAuthErrorMessage(error) };
    }
}

// Sign Out
async function signOut() {
    try {
        await window.firebaseAuth.signOut();
        currentUser = null;
        updateAuthUI();
        // Reload to use local storage
        location.reload();
    } catch (error) {
        console.error('Sign out error:', error);
    }
}

// Save state to Firebase Firestore
async function saveStateToCloud() {
    if (!currentUser || syncInProgress) return;
    
    try {
        syncInProgress = true;
        const userDocRef = window.firebaseDb.collection('users').doc(currentUser.uid);
        
        var serverTimestamp = firebase.firestore.FieldValue.serverTimestamp();
        await userDocRef.set({
            data: state,
            lastUpdated: serverTimestamp,
            version: state.schemaVersion || 2
        }, { merge: true });
        
        // Get the actual timestamp after save
        var docSnap = await userDocRef.get({ source: 'server' });
        var savedTime = Date.now();
        if (docSnap.exists && docSnap.data().lastUpdated) {
            var lastUpdated = docSnap.data().lastUpdated;
            if (typeof lastUpdated.toMillis === 'function') {
                savedTime = lastUpdated.toMillis();
            }
        }
        
        // Update lastSynced timestamp in localStorage
        try {
            var syncKey = STORAGE_KEYS.LAST_SYNCED;
            localStorage.setItem(syncKey, String(savedTime));
        } catch (e) {}
        
        lastSyncTime = new Date(savedTime);
        updateSyncStatus('Synced', true);
    } catch (error) {
        console.error('Save to cloud error:', error);
        updateSyncStatus('Sync failed', false);
    } finally {
        syncInProgress = false;
    }
}

/** Returns true if payload has categories, accounts, or balances worth merging. */
function hasMeaningfulData(data) {
    if (!data || typeof data !== 'object') return false;
    var hasCategories = data.categories && Array.isArray(data.categories) && data.categories.length > 0;
    var hasAccounts = data.accounts && typeof data.accounts === 'object';
    var hasBalances = data.balances && Object.keys(data.balances || {}).length > 0;
    return hasCategories || hasAccounts || hasBalances;
}

// Load state from Firebase Firestore (with retry for timing/auth)
async function loadStateFromCloud(retryCount) {
    if (!currentUser) return;
    retryCount = retryCount || 0;
    
    try {
        var userDocRef = window.firebaseDb.collection('users').doc(currentUser.uid);
        // Force server read so we get the latest data (e.g. from phone), not stale cache that would overwrite other devices
        var docSnap = await userDocRef.get({ source: 'server' });
        
        if (docSnap.exists) {
            const cloudData = docSnap.data();
            
            // Last-write-wins: use whichever is newer (cloud or this device's local)
            // IMPORTANT: Only trust local if we've made changes SINCE last syncing to cloud
            // This prevents stale local state from overwriting cloud on page refresh
            var cloudTime = 0;
            if (cloudData.lastUpdated && typeof cloudData.lastUpdated.toMillis === 'function') {
                cloudTime = cloudData.lastUpdated.toMillis();
            }
            var localModified = 0;
            var lastSyncedToCloud = 0;
            try {
                var modKey = STORAGE_KEYS.MODIFIED;
                var syncKey = STORAGE_KEYS.LAST_SYNCED;
                var stored = localStorage.getItem(modKey);
                var synced = localStorage.getItem(syncKey);
                if (stored) localModified = parseInt(stored, 10) || 0;
                if (synced) lastSyncedToCloud = parseInt(synced, 10) || 0;
            } catch (e) {}
            
            // This device has local changes we haven't synced (or we synced but another tab/device overwrote cloud).
            // Never overwrite local with cloud in that case — push our state so deletes (e.g. "S") stick.
            // Fixes: "S" spawning back when another tab had stale state and pushed, or when visibility triggers pull.
            if (localModified > lastSyncedToCloud && hasMeaningfulData(state)) {
                await saveStateToCloud();
                if (typeof refreshUI === 'function') refreshUI();
                updateSyncStatus('Synced (local was newer)', true);
                if (cloudData.lastUpdated) lastSyncTime = cloudData.lastUpdated.toDate();
                return;
            }
            // Cloud is newer than our last sync and we have no unsynced local changes: use cloud (other device's changes).
            if (cloudTime <= localModified || !hasMeaningfulData(cloudData.data)) {
                await saveStateToCloud();
                if (typeof refreshUI === 'function') refreshUI();
                updateSyncStatus('Synced', true);
                return;
            }

            // Cloud is strictly newer and we have no unsynced changes: use cloud
            // This ensures phone changes aren't overwritten by stale desktop state
            
            if (cloudData.data && typeof cloudData.data === 'object') {
                if (hasMeaningfulData(cloudData.data)) {
                    // Apply cloud state as-is (last-write-wins). Do NOT "restore" surplus or run
                    // recalculateSurplusFromReality here — that overwrites correct cloud data with
                    // device-specific values and causes wrong Extra/Weekly across devices.
                    state = { ...state, ...cloudData.data };
                    migrateState();
                    ensureSystemSavings();
                    ensureCoreItems();
                    ensureSettings();
                    if (typeof ensureWeeklyState === 'function') ensureWeeklyState();

                    var stateKey = STORAGE_KEYS.STATE;
                    var modKey = STORAGE_KEYS.MODIFIED;
                    var syncKey = STORAGE_KEYS.LAST_SYNCED;
                    localStorage.setItem(stateKey, JSON.stringify(state));
                    if (cloudData.lastUpdated && typeof cloudData.lastUpdated.toMillis === 'function') {
                        var cloudMillis = cloudData.lastUpdated.toMillis();
                        try { 
                            localStorage.setItem(modKey, String(cloudMillis)); 
                            localStorage.setItem(syncKey, String(cloudMillis)); // Update lastSynced to match cloud
                        } catch (e) {}
                    }
                    if (typeof refreshUI === 'function') refreshUI();
                    updateSyncStatus('Synced', true);
                } else {
                    console.warn('Cloud data is empty/invalid, keeping local state');
                    updateSyncStatus('Cloud empty, using local', true);
                    if (typeof updateGlobalUI === 'function') updateGlobalUI();
                }
            } else {
                console.warn('No valid cloud data found, keeping local state');
                updateSyncStatus('No cloud data, using local', true);
                if (typeof updateGlobalUI === 'function') updateGlobalUI();
            }
            
            if (cloudData.lastUpdated) {
                lastSyncTime = cloudData.lastUpdated.toDate();
            } else {
                lastSyncTime = new Date();
            }
        } else {
            await saveStateToCloud();
            updateSyncStatus('Synced', true);
            if (typeof updateGlobalUI === 'function') updateGlobalUI();
        }
    } catch (error) {
        console.error('Load from cloud error:', error);
        
        // Retry once after a short delay (fixes auth-token-not-ready)
        if (retryCount < 1) {
            setTimeout(function() {
                loadStateFromCloud(1);
            }, 1500);
            return;
        }
        
        // On error after retry: use local data for this device only. Do NOT call saveState() –
        // that would set MODIFIED and trigger saveStateToCloud, overwriting other devices' newer data.
        try {
            var stateKey = STORAGE_KEYS.STATE;
            var localBackupStr = localStorage.getItem(stateKey);
            if (localBackupStr) {
                var localBackup = JSON.parse(localBackupStr);
                state = { ...state, ...localBackup };
                migrateState();
                ensureSystemSavings();
                ensureCoreItems();
                ensureSettings();
                if (state.accounts && state.accounts.surplus === 0 && hasMeaningfulData(state) && typeof recalculateSurplusFromReality === 'function') {
                    recalculateSurplusFromReality();
                }
                localStorage.setItem(stateKey, JSON.stringify(state));
                if (typeof refreshUI === 'function') refreshUI();
            }
        } catch (e) {
            console.error('Failed to restore local backup:', e);
        }
        updateSyncStatus('Load failed – using local data', false);
    }
}

// Auto-sync every 30 seconds when user is logged in
let autoSyncInterval = null;

function startAutoSync() {
    if (autoSyncInterval) return;
    
    autoSyncInterval = setInterval(() => {
        if (currentUser && !syncInProgress) {
            saveStateToCloud();
        }
    }, 30000); // 30 seconds
}

function stopAutoSync() {
    if (autoSyncInterval) {
        clearInterval(autoSyncInterval);
        autoSyncInterval = null;
    }
}

// Update sync status in UI
function updateSyncStatus(message, isSuccess) {
    const statusEl = document.getElementById('sync-status');
    if (statusEl) {
        statusEl.textContent = message;
        statusEl.className = isSuccess ? 'text-emerald-600 text-[10px]' : 'text-red-500 text-[10px]';
    }
}

// Modify saveState to also save to cloud
const originalSaveState = window.saveState;
window.saveState = function() {
    originalSaveState();
    if (currentUser) {
        // Debounce cloud saves to avoid too many requests
        if (window.saveStateTimeout) clearTimeout(window.saveStateTimeout);
        window.saveStateTimeout = setTimeout(() => {
            saveStateToCloud();
        }, 1000);
    }
};

// When user leaves the app (switch tab, minimize, lock phone), push to cloud immediately so iOS/other device gets latest
function flushCloudSave() {
    if (currentUser && window.saveStateTimeout) {
        clearTimeout(window.saveStateTimeout);
        window.saveStateTimeout = null;
        saveStateToCloud();
    }
}
function pullFromCloudWhenVisible() {
    if (currentUser && document.visibilityState === 'visible' && !syncInProgress) loadStateFromCloud();
}
if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'hidden') flushCloudSave();
        if (document.visibilityState === 'visible') pullFromCloudWhenVisible();
    });
    window.addEventListener('pagehide', flushCloudSave);
}

function isLoggedIn() { return !!currentUser; }
if (typeof window !== 'undefined') window.isLoggedIn = isLoggedIn;

// Auth UI Functions
function openAuthModal() {
    toggleModal('auth-modal', true);
}

function closeAuthModal() {
    toggleModal('auth-modal', false);
    const emailEl = document.getElementById('auth-email');
    const passwordEl = document.getElementById('auth-password');
    const errorEl = document.getElementById('auth-error');
    if (emailEl) emailEl.value = '';
    if (passwordEl) passwordEl.value = '';
    if (errorEl) {
        errorEl.textContent = '';
        errorEl.className = 'text-xs text-red-500 min-h-[20px]';
    }
}

async function handleSignUp() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const errorEl = document.getElementById('auth-error');
    
    if (!email || !password) {
        errorEl.textContent = 'Please enter email and password';
        return;
    }
    
    if (password.trim().length < 6) {
        errorEl.textContent = 'Password must be at least 6 characters';
        return;
    }
    
    errorEl.textContent = 'Creating account...';
    const result = await signUp(email, password);
    
    if (!result.success) {
        errorEl.textContent = result.error || 'Sign up failed';
    }
}

async function handleSignIn() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const errorEl = document.getElementById('auth-error');
    
    if (!email || !password) {
        errorEl.textContent = 'Please enter email and password';
        return;
    }
    
    errorEl.textContent = 'Signing in...';
    const result = await signIn(email, password);
    
    if (!result.success) {
        errorEl.textContent = result.error || 'Sign in failed';
    }
}

// Forgot password – send reset email
async function handleForgotPassword() {
    const email = document.getElementById('auth-email').value.trim().toLowerCase();
    const errorEl = document.getElementById('auth-error');
    
    if (!email) {
        errorEl.textContent = 'Enter your email above, then click Forgot password?';
        return;
    }
    
    try {
        errorEl.textContent = 'Sending reset email...';
        errorEl.className = 'text-xs text-slate-600 min-h-[20px]';
        await window.firebaseAuth.sendPasswordResetEmail(email);
        errorEl.innerHTML = 'Email sent to <strong>' + email + '</strong>. Check <strong>inbox and spam/junk</strong> (wait 2–5 min). Still nothing? See steps below.';
        errorEl.className = 'text-xs text-emerald-600 min-h-[20px]';
    } catch (error) {
        errorEl.textContent = getAuthErrorMessage(error);
        errorEl.className = 'text-xs text-red-500 min-h-[20px]';
    }
}

function updateAuthUI() {
    const authSection = document.getElementById('auth-section');
    const userInfoSection = document.getElementById('user-info-section');
    const userInfo = document.getElementById('user-info');
    const signOutBtn = document.getElementById('sign-out-btn');
    
    if (currentUser) {
        if (authSection) authSection.classList.add('hidden');
        if (userInfoSection) userInfoSection.classList.remove('hidden');
        if (userInfo) userInfo.textContent = currentUser.email;
        if (signOutBtn) signOutBtn.classList.remove('hidden');
    } else {
        if (authSection) authSection.classList.remove('hidden');
        if (userInfoSection) userInfoSection.classList.add('hidden');
        if (signOutBtn) signOutBtn.classList.add('hidden');
    }
}

// Initialize auth on load
if (window.firebaseAuth) {
    initAuth();
} else {
    window.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => {
            if (window.firebaseAuth) {
                initAuth();
            }
        }, 500);
    });
}
