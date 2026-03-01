// AUTHENTICATION & CLOUD SYNC

let currentUser = null;
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
            window.currentUser = user;
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
            window.currentUser = null;
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

// Save state to Firebase Firestore — implemented in sync.js (v2)
// loadStateFromCloud, saveStateToCloud, updateSyncStatus, startAutoSync, stopAutoSync, flushCloudSave, pullFromCloudWhenVisible

/** Call when app is ready to show (after cloud load if logged in). Use so first paint has correct state and no surplus flash. */
const originalSaveState = window.saveState;
window.saveState = function() {
    originalSaveState();
    if (currentUser && typeof scheduleSyncPush === 'function') {
        scheduleSyncPush();
    }
};

// flushCloudSave, pullFromCloudWhenVisible: from sync.js (throttled pull, debounced push)
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
