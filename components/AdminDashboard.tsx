import React from 'react';
import { Coordinates, Restaurant, SearchResult } from '../types';

interface AdminDashboardProps {
    onBack: () => void;
    onSeed: () => Promise<void>;
    onCleanup: () => Promise<void>;
    onApprove: (r: Restaurant) => Promise<void>;
    onReject: (id: string) => Promise<void>;
    suggestions: Restaurant[];
    isSeeding: boolean;
    seedingStatus: string;
    loading: boolean;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({
    onBack,
    onSeed,
    onCleanup,
    onApprove,
    onReject,
    suggestions,
    isSeeding,
    seedingStatus,
    loading
}) => {
    const [activeTab, setActiveTab] = React.useState<'tools' | 'approvals'>('approvals');
    return (
        <div className="min-h-screen pb-40 relative">
            <div className="max-w-7xl mx-auto px-4 mt-8">
                {/* Header with Back Button */}
                <div className="flex flex-col md:flex-row md:items-center gap-6 mb-8">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={onBack}
                            className="flex items-center gap-2 text-slate-500 hover:text-orange-600 font-bold transition-colors"
                        >
                            ← Back
                        </button>
                        <h1 className="text-3xl font-black text-slate-900 ml-4">Admin Console</h1>
                    </div>

                    <div className="flex bg-slate-100 p-1 rounded-2xl">
                        <button
                            onClick={() => setActiveTab('approvals')}
                            className={`px-6 py-2 rounded-xl text-sm font-black uppercase tracking-widest transition-all ${activeTab === 'approvals' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            Approvals {suggestions.length > 0 && <span className="ml-2 bg-orange-600 text-white px-2 py-0.5 rounded-full text-[10px]">{suggestions.length}</span>}
                        </button>
                        <button
                            onClick={() => setActiveTab('tools')}
                            className={`px-6 py-2 rounded-xl text-sm font-black uppercase tracking-widest transition-all ${activeTab === 'tools' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            Tools
                        </button>
                    </div>
                </div>

                {activeTab === 'tools' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Database Management Card */}
                        <div className="bg-white/80 backdrop-blur-md border border-slate-200 rounded-3xl p-8 shadow-sm">
                            <div className="flex items-center gap-4 mb-6">
                                <div className="w-12 h-12 bg-orange-100 rounded-2xl flex items-center justify-center text-orange-600 text-2xl">
                                    🗄️
                                </div>
                                <div>
                                    <h2 className="text-xl font-black text-slate-800">Database Tools</h2>
                                    <p className="text-sm text-slate-500 font-medium">Manage restaurant data seeding and hydration.</p>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                                    <h3 className="font-bold text-slate-800 mb-2">Hydrate Database</h3>
                                    <p className="text-xs text-slate-500 mb-4">
                                        This will trigger a comprehensive scrape of Albuquerque restaurants across multiple categories using the Gemini Service and save them to Firestore.
                                    </p>

                                    <button
                                        onClick={onSeed}
                                        disabled={loading || isSeeding}
                                        className="w-full bg-orange-600 text-white py-3 rounded-xl font-black text-sm uppercase tracking-widest hover:bg-orange-700 transition-all shadow-md active:scale-95 disabled:opacity-50"
                                    >
                                        {isSeeding ? (
                                            <div className="flex items-center justify-center gap-3">
                                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                                {seedingStatus || 'Hydrating...'}
                                            </div>
                                        ) : 'Run Full Hydration'}
                                    </button>
                                </div>

                                <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                                    <h3 className="font-bold text-slate-800 mb-2 text-red-600">Database Cleanup</h3>
                                    <p className="text-xs text-slate-500 mb-4">
                                        Scans all saved restaurants and deletes any that are not located in Albuquerque (e.g. Santa Fe or Rio Rancho spots).
                                    </p>
                                    <button
                                        onClick={onCleanup}
                                        disabled={loading || isSeeding}
                                        className="w-full bg-slate-900 text-white py-3 rounded-xl font-black text-sm uppercase tracking-widest hover:bg-red-600 transition-all shadow-md active:scale-95 disabled:opacity-50"
                                    >
                                        Purge non-ABQ Spots
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* System Info Card */}
                        <div className="bg-white/80 backdrop-blur-md border border-slate-200 rounded-3xl p-8 shadow-sm">
                            <div className="flex items-center gap-4 mb-6">
                                <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600 text-2xl">
                                    🛠️
                                </div>
                                <div>
                                    <h2 className="text-xl font-black text-slate-800">System Status</h2>
                                    <p className="text-sm text-slate-500 font-medium">Diagnostics and environment configuration.</p>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex justify-between items-center py-3 border-b border-slate-100">
                                    <span className="text-sm font-bold text-slate-600">Firebase Firestore</span>
                                    <span className="text-xs font-black text-emerald-500 uppercase">Connected</span>
                                </div>
                                <div className="flex justify-between items-center py-3 border-b border-slate-100">
                                    <span className="text-sm font-bold text-slate-600">Gemini Pro API</span>
                                    <span className="text-xs font-black text-emerald-500 uppercase">Active</span>
                                </div>
                                <div className="flex justify-between items-center py-3 border-b border-slate-100">
                                    <span className="text-sm font-bold text-slate-600">Facebook Auth</span>
                                    <span className="text-xs font-black text-emerald-500 uppercase">Operational</span>
                                </div>
                            </div>

                            <div className="mt-8 p-4 bg-blue-50 border border-blue-100 rounded-xl">
                                <h4 className="text-xs font-black text-blue-800 uppercase mb-2">Notice</h4>
                                <p className="text-[10px] text-blue-600 leading-relaxed font-medium">
                                    If you are having trouble seeing admin settings after logging in with Facebook, check the browser console for "🔒 Auth User Info" to verify your identifier matches the admin list.
                                </p>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="bg-white/80 backdrop-blur-md border border-slate-200 rounded-3xl p-8 shadow-sm">
                            <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-3">
                                <span className="text-2xl">📥</span> Pending Suggestions
                            </h2>

                            {suggestions.length === 0 ? (
                                <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                    <p className="text-slate-400 font-bold uppercase tracking-widest text-sm">No pending approvals</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-4">
                                    {suggestions.map((suggestion) => (
                                        <div key={suggestion.id} className="p-6 bg-white border border-slate-100 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-6 hover:shadow-md transition-all">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="text-[10px] font-black uppercase px-2 py-0.5 bg-orange-100 text-orange-600 rounded-md">
                                                        {suggestion.category}
                                                    </span>
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                                        {new Date((suggestion as any).submittedAt || Date.now()).toLocaleDateString()}
                                                    </span>
                                                </div>
                                                <h3 className="text-lg font-black text-slate-800">{suggestion.name}</h3>
                                                <p className="text-sm text-slate-500 font-medium">{suggestion.address}</p>
                                            </div>
                                            <div className="flex gap-3">
                                                <button
                                                    onClick={() => onReject(suggestion.id)}
                                                    className="px-6 py-2 bg-slate-100 text-slate-600 rounded-xl font-black text-xs uppercase hover:bg-red-50 hover:text-red-600 transition-all active:scale-95"
                                                    disabled={loading}
                                                >
                                                    Reject
                                                </button>
                                                <button
                                                    onClick={() => onApprove(suggestion)}
                                                    className="px-8 py-2 bg-orange-600 text-white rounded-xl font-black text-xs uppercase hover:bg-orange-700 transition-all shadow-md active:scale-95"
                                                    disabled={loading}
                                                >
                                                    Approve
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminDashboard;
