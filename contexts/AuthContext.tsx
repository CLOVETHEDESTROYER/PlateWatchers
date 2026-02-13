import React, { createContext, useContext, useEffect, useState } from "react";
import {
    User,
    onAuthStateChanged,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    signOut,
    signInWithEmailAndPassword,
    sendPasswordResetEmail,
    createUserWithEmailAndPassword,
    browserLocalPersistence,
    setPersistence
} from "firebase/auth";
import { auth, facebookProvider, googleProvider } from "../firebase";

interface AuthContextType {
    user: User | null;
    isAdmin: boolean;
    loading: boolean;
    loginWithFacebook: () => Promise<void>;
    loginWithGoogle: () => Promise<void>;
    loginWithEmail: (email: string, pass: string) => Promise<void>;
    registerAdmin: (email: string, pass: string) => Promise<void>;
    resetPassword: (email: string) => Promise<void>;
    logout: () => Promise<void>;
    error: string | null;
    authDebugLog: string[];
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    isAdmin: false,
    loading: true,
    loginWithFacebook: async () => { },
    loginWithGoogle: async () => { },
    loginWithEmail: async () => { },
    registerAdmin: async () => { },
    resetPassword: async () => { },
    logout: async () => { },
    error: null,
    authDebugLog: [],
});

// Detect mobile browsers and PWAs where popups don't work
const isMobile = (): boolean => {
    if (typeof window === 'undefined') return false;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
        || (window.navigator as any).standalone === true;
    if (isStandalone) return true;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [authDebugLog, setAuthDebugLog] = useState<string[]>([]);

    const addLog = (msg: string) => {
        const entry = `[${new Date().toLocaleTimeString()}] ${msg}`;
        setAuthDebugLog(prev => [...prev.slice(-19), entry]);
    };

    // Admin check
    useEffect(() => {
        if (user) {
            addLog(`✅ User set: ${user.displayName || user.uid?.slice(0, 8)} (${user.providerData?.[0]?.providerId || 'unknown'})`);
            const ADMIN_EMAIL = 'analoguepro@gmail.com';
            const isAdminByEmail = user.email === ADMIN_EMAIL;
            const isAdminByProvider = user.providerData.some(p => p.email === ADMIN_EMAIL);
            setIsAdmin(isAdminByEmail || isAdminByProvider);
        } else {
            addLog('👤 User is null (not logged in)');
            setIsAdmin(false);
        }
    }, [user]);

    // Auth initialization
    useEffect(() => {
        if (!auth) {
            addLog('❌ Firebase Auth not initialized');
            setLoading(false);
            return;
        }

        addLog(`🔧 Auth init. isMobile=${isMobile()}, UA=${navigator.userAgent.slice(0, 50)}`);

        let unsubscribe: (() => void) | undefined;

        const initAuth = async () => {
            try {
                // STEP 1: Set persistence FIRST — must complete before anything else
                await setPersistence(auth!, browserLocalPersistence);
                addLog('💾 Persistence set to LOCAL ✅');
            } catch (e: any) {
                addLog(`💾 Persistence FAILED: ${e.code || e.message}`);
            }

            // STEP 2: Check for redirect result (mobile auth returning from Facebook)
            try {
                addLog('🔄 Checking getRedirectResult...');
                const result = await getRedirectResult(auth!);
                if (result?.user) {
                    addLog(`🔄 Redirect SUCCESS: ${result.user.displayName || result.user.uid?.slice(0, 8)}`);
                    setUser(result.user);
                } else {
                    addLog('🔄 Redirect result: null (no pending redirect)');
                }
            } catch (err: any) {
                addLog(`🔄 Redirect ERROR: ${err.code} - ${err.message}`);
                if (err.code === 'auth/account-exists-with-different-credential') {
                    setError("An account already exists with the same email. Try a different sign-in method.");
                }
            }

            // STEP 3: NOW register auth state listener (persistence is guaranteed set)
            unsubscribe = onAuthStateChanged(auth!, (firebaseUser) => {
                addLog(`👂 onAuthStateChanged: ${firebaseUser ? (firebaseUser.displayName || firebaseUser.uid?.slice(0, 8)) : 'null'}`);
                setUser(firebaseUser);
                setLoading(false);
            });
        };

        initAuth();

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, []);

    const loginWithFacebook = async () => {
        setError(null);
        addLog(`🔵 loginWithFacebook called. isMobile=${isMobile()}`);
        try {
            if (!auth) throw new Error("Firebase Auth not initialized");

            if (isMobile()) {
                addLog('🔵 Using signInWithRedirect (mobile)');
                await signInWithRedirect(auth, facebookProvider);
            } else {
                addLog('🔵 Using signInWithPopup (desktop)');
                await signInWithPopup(auth, facebookProvider);
            }
        } catch (err: any) {
            addLog(`🔵 Facebook login ERROR: ${err.code} - ${err.message}`);
            if (err.code === 'auth/account-exists-with-different-credential') {
                setError("An account already exists with the same email address but different sign-in credentials.");
            } else if (err.code === 'auth/popup-closed-by-user') {
                // Ignore
            } else if (err.code === 'auth/popup-blocked') {
                addLog('🔵 Popup blocked, falling back to redirect');
                try {
                    await signInWithRedirect(auth!, facebookProvider);
                } catch { }
            } else {
                setError("Failed to log in with Facebook. Please try again.");
            }
        }
    };

    const loginWithGoogle = async () => {
        setError(null);
        addLog(`🟢 loginWithGoogle called. isMobile=${isMobile()}`);
        try {
            if (!auth) throw new Error("Firebase Auth not initialized");

            if (isMobile()) {
                await signInWithRedirect(auth, googleProvider);
            } else {
                await signInWithPopup(auth, googleProvider);
            }
        } catch (err: any) {
            addLog(`🟢 Google login ERROR: ${err.code} - ${err.message}`);
            if (err.code === 'auth/popup-blocked') {
                try {
                    await signInWithRedirect(auth!, googleProvider);
                } catch { }
            } else {
                setError("Failed to log in with Google.");
            }
        }
    };

    const loginWithEmail = async (email: string, pass: string) => {
        setError(null);
        try {
            if (!auth) throw new Error("Firebase Auth not initialized");
            await signInWithEmailAndPassword(auth, email, pass);
        } catch (err: any) {
            if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
                setError("Invalid email or password.");
            } else if (err.code === 'auth/operation-not-allowed') {
                setError("Email/Password login is not enabled in Firebase Console.");
            } else {
                setError("Login failed. Check console.");
            }
            throw err;
        }
    };

    const registerAdmin = async (email: string, pass: string) => {
        setError(null);
        try {
            if (!auth) throw new Error("Firebase Auth not initialized");
            await createUserWithEmailAndPassword(auth, email, pass);
        } catch (err: any) {
            if (err.code === 'auth/email-already-in-use') {
                setError("Account already exists. Try signing in.");
            } else if (err.code === 'auth/operation-not-allowed') {
                setError("Email/Password login is not enabled in Firebase Console.");
            } else {
                setError("Registration failed. Check console.");
            }
            throw err;
        }
    };

    const resetPassword = async (email: string) => {
        setError(null);
        try {
            if (!auth) throw new Error("Firebase Auth not initialized");
            await sendPasswordResetEmail(auth, email);
        } catch (err: any) {
            if (err.code === 'auth/user-not-found') {
                setError("No account found with that email.");
            } else {
                setError("Failed to send reset email.");
            }
            throw err;
        }
    };

    const logout = async () => {
        addLog('🚪 Logging out...');
        try {
            if (!auth) return;
            await signOut(auth);
        } catch (err) {
            addLog(`🚪 Logout failed`);
        }
    };

    return (
        <AuthContext.Provider value={{ user, isAdmin, loading, loginWithFacebook, loginWithGoogle, loginWithEmail, registerAdmin, resetPassword, logout, error, authDebugLog }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
