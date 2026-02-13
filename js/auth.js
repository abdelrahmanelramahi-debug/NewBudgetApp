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
            loadStateFromCloud().then(() => {
                startAutoSync();
            });
        } else {
            currentUser = null;
            updateAuthUI();
            stopAutoSync();
        }
    });
}

// Sign Up
async function signUp(email, password) {
    try {
        const userCredential = await window.firebaseAuth.createUserWithEmailAndPassword(email, password);
        currentUser = userCredential.user;
        
        // Save initial state to cloud
        await saveStateToCloud();
        
        closeAuthModal();
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Sign In
async function signIn(email, password) {
    try {
        const userCredential = await window.firebaseAuth.signInWithEmailAndPassword(email, password);
        currentUser = userCredential.user;
        
        await loadStateFromCloud();
        closeAuthModal();
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
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

// Load state from Firebase Firestore
async function loadStateFromCloud() {
    if (!currentUser) return;
    
    try {
        const userDocRef = window.firebaseDb.collection('users').doc(currentUser.uid);
        const docSnap = await userDocRef.get();
        
        if (docSnap.exists) {
            const cloudData = docSnap.data();
            
            // Merge with local state (cloud takes precedence)
            if (cloudData.data) {
                state = { ...state, ...cloudData.data };
                migrateState();
                ensureSystemSavings();
                ensureCoreItems();
                ensureSettings();
                
                // Save merged state locally as backup
                localStorage.setItem('financeCmd_state', JSON.stringify(state));
                
                // Update UI
                renderLedger();
                renderStrategy();
                updateGlobalUI();
                applySettings();
                renderSettings();
            }
            
            if (cloudData.lastUpdated) {
                lastSyncTime = cloudData.lastUpdated.toDate();
            } else {
                lastSyncTime = new Date();
            }
            updateSyncStatus('Synced', true);
        } else {
            // No cloud data yet, save current state
            await saveStateToCloud();
        }
    } catch (error) {
        console.error('Load from cloud error:', error);
        updateSyncStatus('Load failed', false);
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
    if (errorEl) errorEl.textContent = '';
}

async function handleSignUp() {
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;
    const errorEl = document.getElementById('auth-error');
    
    if (!email || !password) {
        errorEl.textContent = 'Please enter email and password';
        return;
    }
    
    if (password.length < 6) {
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
