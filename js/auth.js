// AUTHENTICATION & CLOUD SYNC

let currentUser = null;
let syncInProgress = false;
let lastSyncTime = null;

// Initialize Firebase Auth
function initAuth() {
    if (!window.firebaseAuth) {
        console.error('Firebase not initialized');
        return;
    }
    
    window.firebaseAuth.onAuthStateChanged((user) => {
        if (user) {
            currentUser = user;
            updateAuthUI();
            // Load local state FIRST, then sync from cloud (cloud will merge/overwrite if valid)
            // This ensures we always have local data as fallback
            var stateKey = typeof STORAGE_KEYS !== 'undefined' ? STORAGE_KEYS.STATE : 'financeCmd_state';
            const localState = localStorage.getItem(stateKey);
            if (localState) {
                try {
                    const local = JSON.parse(localState);
                    // Only restore if local has actual data (not empty defaults)
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
            // Wait for auth token to be ready before Firestore (fixes "Load failed")
            user.getIdToken(true).then(function() {
                loadStateFromCloud().then(function() {
                    if (typeof requestAnimationFrame !== 'undefined' && typeof updateGlobalUI === 'function') {
                        requestAnimationFrame(updateGlobalUI);
                    } else if (typeof updateGlobalUI === 'function') updateGlobalUI();
                    startAutoSync();
                });
            }).catch(function() {
                loadStateFromCloud().then(function() {
                    if (typeof requestAnimationFrame !== 'undefined' && typeof updateGlobalUI === 'function') {
                        requestAnimationFrame(updateGlobalUI);
                    } else if (typeof updateGlobalUI === 'function') updateGlobalUI();
                    startAutoSync();
                });
            });
        } else {
            currentUser = null;
            updateAuthUI();
            stopAutoSync();
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
        
        await userDocRef.set({
            data: state,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
            version: state.schemaVersion || 2
        }, { merge: true });
        
        lastSyncTime = new Date();
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
        var docSnap = await userDocRef.get();
        
        if (docSnap.exists) {
            const cloudData = docSnap.data();
            
            // Last-write-wins: use whichever is newer (cloud or this device's local)
            var cloudTime = 0;
            if (cloudData.lastUpdated && typeof cloudData.lastUpdated.toMillis === 'function') {
                cloudTime = cloudData.lastUpdated.toMillis();
            }
            var localModified = 0;
            try {
                var modKey = typeof STORAGE_KEYS !== 'undefined' ? STORAGE_KEYS.MODIFIED : 'financeCmd_state_modified';
                var stored = localStorage.getItem(modKey);
                if (stored) localModified = parseInt(stored, 10) || 0;
            } catch (e) {}
            if (localModified > cloudTime) {
                await saveStateToCloud();
                if (typeof refreshUI === 'function') refreshUI();
                updateSyncStatus('Synced (local was newer)', true);
                if (cloudData.lastUpdated) lastSyncTime = cloudData.lastUpdated.toDate();
                return;
            }
            
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

                    var stateKey = typeof STORAGE_KEYS !== 'undefined' ? STORAGE_KEYS.STATE : 'financeCmd_state';
                    var modKey = typeof STORAGE_KEYS !== 'undefined' ? STORAGE_KEYS.MODIFIED : 'financeCmd_state_modified';
                    localStorage.setItem(stateKey, JSON.stringify(state));
                    if (cloudData.lastUpdated && typeof cloudData.lastUpdated.toMillis === 'function') {
                        try { localStorage.setItem(modKey, String(cloudData.lastUpdated.toMillis())); } catch (e) {}
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
        
        // On error after retry: use local data and show clear status
        try {
            var stateKey = typeof STORAGE_KEYS !== 'undefined' ? STORAGE_KEYS.STATE : 'financeCmd_state';
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
                saveState();
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
if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'hidden') flushCloudSave();
    });
    window.addEventListener('pagehide', flushCloudSave);
}

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
