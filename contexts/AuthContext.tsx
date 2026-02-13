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
});

// Detect mobile browsers and PWAs where popups don't work
const isMobile = (): boolean => {
    if (typeof window === 'undefined') return false;
    // Check if running as a PWA (standalone mode)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
        || (window.navigator as any).standalone === true;
    if (isStandalone) return true;
    // Check for mobile user agent
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Diagnostics and Admin logic
    useEffect(() => {
        if (user) {
            // Hardcoded Admin Email
            const ADMIN_EMAIL = 'analoguepro@gmail.com';
            const isAdminByEmail = user.email === ADMIN_EMAIL;

            // Fallback: Check provider data as Facebook sometimes hides email
            const isAdminByProvider = user.providerData.some(p => p.email === ADMIN_EMAIL);

            setIsAdmin(isAdminByEmail || isAdminByProvider);
        } else {
            setIsAdmin(false);
        }
    }, [user]);

    useEffect(() => {
        if (!auth) {
            setLoading(false);
            return;
        }

        // Ensure persistence is set to LOCAL (survives page reloads & PWA restarts)
        setPersistence(auth, browserLocalPersistence).catch(() => { });

        // Handle redirect result on app load (for mobile auth)
        getRedirectResult(auth)
            .then((result) => {
                if (result?.user) {
                    setUser(result.user);
                }
            })
            .catch((err) => {
                if (err.code === 'auth/account-exists-with-different-credential') {
                    setError("An account already exists with the same email. Try a different sign-in method.");
                }
            });

        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setUser(user);
            setLoading(false);
        });
        return unsubscribe;
    }, []);

    const loginWithFacebook = async () => {
        setError(null);
        try {
            if (!auth) throw new Error("Firebase Auth not initialized");

            if (isMobile()) {
                // Mobile: use redirect (popups are blocked on mobile browsers & PWAs)
                await signInWithRedirect(auth, facebookProvider);
                // Page will redirect — no code runs after this
            } else {
                // Desktop: use popup (faster, no page reload)
                await signInWithPopup(auth, facebookProvider);
            }
        } catch (err: any) {
            console.error("Facebook Login failed", err);
            if (err.code === 'auth/account-exists-with-different-credential') {
                setError("An account already exists with the same email address but different sign-in credentials. Sign in using a provider associated with this email address.");
            } else if (err.code === 'auth/popup-closed-by-user') {
                // Ignore
            } else if (err.code === 'auth/popup-blocked') {
                // Popup blocked — fall back to redirect
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
        try {
            if (!auth) throw new Error("Firebase Auth not initialized");

            if (isMobile()) {
                await signInWithRedirect(auth, googleProvider);
            } else {
                await signInWithPopup(auth, googleProvider);
            }
        } catch (err: any) {
            console.error("Google Login failed", err);
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
            console.error("Email Login failed", err);
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
            console.error("Admin Registration failed", err);
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
            console.error("Password reset failed", err);
            if (err.code === 'auth/user-not-found') {
                setError("No account found with that email.");
            } else {
                setError("Failed to send reset email.");
            }
            throw err;
        }
    };

    const logout = async () => {
        try {
            if (!auth) return;
            await signOut(auth);
        } catch (err) {
            console.error("Logout failed", err);
        }
    };

    return (
        <AuthContext.Provider value={{ user, isAdmin, loading, loginWithFacebook, loginWithGoogle, loginWithEmail, registerAdmin, resetPassword, logout, error }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
