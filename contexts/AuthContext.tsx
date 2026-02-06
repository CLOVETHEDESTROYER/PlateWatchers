import React, { createContext, useContext, useEffect, useState } from "react";
import { User, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth, facebookProvider, googleProvider } from "../firebase";

interface AuthContextType {
    user: User | null;
    loading: boolean;
    loginWithFacebook: () => Promise<void>;
    loginWithGoogle: () => Promise<void>;
    logout: () => Promise<void>;
    error: string | null;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    loading: true,
    loginWithFacebook: async () => { },
    loginWithGoogle: async () => { },
    logout: async () => { },
    error: null,
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!auth) {
            setLoading(false);
            return;
        }
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
            await signInWithPopup(auth, facebookProvider);
        } catch (err: any) {
            console.error("Facebook Login failed", err);
            // Friendly messaging for common errors
            if (err.code === 'auth/account-exists-with-different-credential') {
                setError("An account already exists with the same email address but different sign-in credentials. Sign in using a provider associated with this email address.");
            } else if (err.code === 'auth/popup-closed-by-user') {
                // Ignore
            } else {
                setError("Failed to log in with Facebook. Please check console.");
            }
        }
    };

    const loginWithGoogle = async () => {
        setError(null);
        try {
            if (!auth) throw new Error("Firebase Auth not initialized");
            await signInWithPopup(auth, googleProvider);
        } catch (err: any) {
            console.error("Google Login failed", err);
            setError("Failed to log in with Google.");
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
        <AuthContext.Provider value={{ user, loading, loginWithFacebook, loginWithGoogle, logout, error }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);
