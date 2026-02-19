import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface AdminLoginModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const AdminLoginModal: React.FC<AdminLoginModalProps> = ({ isOpen, onClose }) => {
    const { loginWithEmail, resetPassword } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [resetSent, setResetSent] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setResetSent(false);

        try {
            await loginWithEmail(email, password);
            onClose();
        } catch (err: any) {
            setError('Invalid email or password.');
        } finally {
            setLoading(false);
        }
    };

    const handleForgotPassword = async () => {
        if (!email) {
            setError("Please enter your email first to reset your password.");
            return;
        }
        setLoading(true);
        setError(null);
        try {
            await resetPassword(email);
            setResetSent(true);
        } catch (err: any) {
            setError("Failed to send reset email. Verify your email is correct.");
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-[32px] shadow-2xl max-w-sm w-full p-10 relative border border-slate-100 animate-in fade-in zoom-in duration-300">
                <button
                    onClick={onClose}
                    className="absolute top-6 right-6 text-slate-300 hover:text-slate-600 transition-colors"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>

                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center mx-auto mb-4 rotate-3">
                        <span className="text-2xl">🔐</span>
                    </div>
                    <h2 className="text-2xl font-black text-slate-900">Admin Login</h2>
                    <p className="text-slate-500 text-sm mt-2">Secure access for Plate Watchers staff.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 ml-1">
                            Admin Email
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3 text-sm font-bold focus:outline-none focus:ring-4 focus:ring-orange-100 transition-all"
                            placeholder="your@email.com"
                            required
                        />
                    </div>

                    <div>
                        <div className="flex justify-between items-center mb-1.5 ml-1">
                            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400">
                                Secure Password
                            </label>
                            <button
                                type="button"
                                onClick={handleForgotPassword}
                                className="text-[9px] font-black uppercase tracking-widest text-orange-600 hover:underline"
                            >
                                Forgot?
                            </button>
                        </div>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-3 text-sm font-bold focus:outline-none focus:ring-4 focus:ring-orange-100 transition-all font-mono"
                            placeholder="••••••••"
                            required={!resetSent}
                        />
                    </div>

                    {error && (
                        <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-[11px] font-bold text-center">
                            {error}
                        </div>
                    )}

                    {resetSent && (
                        <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-600 text-[11px] font-bold text-center">
                            Reset email sent! Check your inbox.
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-orange-600 transition-all shadow-xl active:scale-95 disabled:opacity-50 mt-4"
                    >
                        {loading ? 'Authenticating...' : 'Sign In'}
                    </button>
                </form>

                <p className="text-center text-[10px] text-slate-400 mt-8 font-medium">
                    This login is restricted to authorized staff only.
                </p>
            </div>
        </div>
    );
};

export default AdminLoginModal;
