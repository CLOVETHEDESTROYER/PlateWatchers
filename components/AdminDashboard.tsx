import React, { useState } from 'react';
import { Coordinates, Restaurant, SearchResult, CategoryRequest } from '../types';

interface AdminDashboardProps {
    onBack: () => void;
    onSeed: () => Promise<void>;
    onCleanup: () => Promise<void>;
    onApprove: (r: Restaurant) => Promise<void>;
    onReject: (id: string) => Promise<void>;
    onRecategorize: (id: string, newCat: string, oldCat: string) => Promise<void>;
    suggestions: Restaurant[];
    restaurants: Restaurant[];
    isSeeding: boolean;
    seedingStatus: string;
    loading: boolean;
    categoryRequests: CategoryRequest[];
    onResolveRequest: (req: CategoryRequest, approve: boolean) => Promise<void>;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({
    onBack,
    onSeed,
    onCleanup,
    onApprove,
    onReject,
    onRecategorize,
    suggestions,
    restaurants,
    isSeeding,
    seedingStatus,
    loading,
    categoryRequests,
    onResolveRequest
}) => {
    const [activeTab, setActiveTab] = useState<'tools' | 'approvals' | 'edit' | 'requests'>('approvals');
    const [editSearch, setEditSearch] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [newCategory, setNewCategory] = useState('');

    const filteredRestaurants = React.useMemo(() => {
        if (!editSearch) return [];
        const q = editSearch.toLowerCase();
        return restaurants.filter(r =>
            r.name.toLowerCase().includes(q) ||
            r.category.toLowerCase().includes(q) ||
            r.googlePlaceType?.toLowerCase().includes(q)
        ).slice(0, 50); // Limit results
    }, [restaurants, editSearch]);

    const handleStartEdit = (r: Restaurant) => {
        setEditingId(r.id);
        setNewCategory(r.category);
    };

    const handleSaveCategory = async (r: Restaurant) => {
        if (!newCategory.trim() || newCategory === r.category) {
            setEditingId(null);
            return;
        }
        if (confirm(`Change category from "${r.category}" to "${newCategory}"?\n\nWARNING: This will remove existing votes for this restaurant in the "${r.category}" category to prevent data inconsistency.`)) {
            await onRecategorize(r.id, newCategory.trim(), r.category);
            setEditingId(null);
        }
    };

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
                        <h1 className="text-xl sm:text-3xl font-black text-slate-900 ml-2 sm:ml-4">Admin Console</h1>
                    </div>

                    <div className="flex bg-slate-100 p-1 rounded-2xl overflow-x-auto">
                        <button
                            onClick={() => setActiveTab('approvals')}
                            className={`px-3 py-2 sm:px-6 sm:py-2 rounded-xl text-[10px] sm:text-sm font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'approvals' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            Approvals {suggestions.length > 0 && <span className="ml-2 bg-orange-600 text-white px-2 py-0.5 rounded-full text-[10px]">{suggestions.length}</span>}
                        </button>
                        <button
                            onClick={() => setActiveTab('requests')}
                            className={`px-3 py-2 sm:px-6 sm:py-2 rounded-xl text-[10px] sm:text-sm font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'requests' ? 'bg-white text-purple-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            Requests {categoryRequests.length > 0 && <span className="ml-2 bg-purple-600 text-white px-2 py-0.5 rounded-full text-[10px]">{categoryRequests.length}</span>}
                        </button>
                        <button
                            onClick={() => setActiveTab('edit')}
                            className={`px-3 py-2 sm:px-6 sm:py-2 rounded-xl text-[10px] sm:text-sm font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'edit' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            Edit Data
                        </button>
                        <button
                            onClick={() => setActiveTab('tools')}
                            className={`px-3 py-2 sm:px-6 sm:py-2 rounded-xl text-[10px] sm:text-sm font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'tools' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            Tools
                        </button>
                    </div>
                </div>

                {activeTab === 'tools' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Database Management Card */}
                        <div className="bg-white/80 backdrop-blur-md border border-slate-200 rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-sm">
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
                        <div className="bg-white/80 backdrop-blur-md border border-slate-200 rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-sm">
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
                        </div>
                    </div>
                )}

                {activeTab === 'edit' && (
                    <div className="bg-white/80 backdrop-blur-md border border-slate-200 rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-sm">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600 text-2xl">
                                ✏️
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-slate-800">Edit Restaurants</h2>
                                <p className="text-sm text-slate-500 font-medium">Search and update restaurant categories.</p>
                            </div>
                        </div>

                        <div className="mb-8">
                            <input
                                type="text"
                                placeholder="Search by name or category..."
                                value={editSearch}
                                onChange={(e) => setEditSearch(e.target.value)}
                                className="w-full bg-white border border-slate-200 rounded-2xl px-5 py-3 text-sm font-medium focus:outline-none focus:ring-4 focus:ring-blue-100 transition-all"
                            />
                        </div>

                        {editSearch && filteredRestaurants.length === 0 && (
                            <div className="text-center py-8 text-slate-400">No restaurants found.</div>
                        )}

                        <div className="space-y-4">
                            {filteredRestaurants.map(r => (
                                <div key={r.id} className="p-4 bg-slate-50 border border-slate-100 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div>
                                        <h3 className="font-bold text-slate-900">{r.name}</h3>
                                        <p className="text-xs text-slate-500">{r.address}</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {editingId === r.id ? (
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="text"
                                                    value={newCategory}
                                                    onChange={(e) => setNewCategory(e.target.value)}
                                                    className="bg-white border border-slate-300 rounded-lg px-3 py-1 text-sm w-40"
                                                    autoFocus
                                                />
                                                <button
                                                    onClick={() => handleSaveCategory(r)}
                                                    className="bg-green-600 text-white px-3 py-1 rounded-lg text-xs font-bold hover:bg-green-700"
                                                >
                                                    Save
                                                </button>
                                                <button
                                                    onClick={() => setEditingId(null)}
                                                    className="bg-slate-200 text-slate-600 px-3 py-1 rounded-lg text-xs font-bold hover:bg-slate-300"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <span className="text-xs font-bold bg-slate-200 text-slate-600 px-2 py-1 rounded">
                                                    {r.category}
                                                </span>
                                                <button
                                                    onClick={() => handleStartEdit(r)}
                                                    className="text-blue-600 hover:text-blue-800 text-xs font-bold underline"
                                                >
                                                    Edit Category
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {activeTab === 'approvals' && (
                    <div className="space-y-6">
                        <div className="bg-white/80 backdrop-blur-md border border-slate-200 rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-sm">
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
                {activeTab === 'requests' && (
                    <div className="space-y-6">
                        <div className="bg-white/80 backdrop-blur-md border border-slate-200 rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-sm">
                            <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-3">
                                <span className="text-2xl">🗳️</span> Category Change Requests
                            </h2>

                            {categoryRequests.length === 0 ? (
                                <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                    <p className="text-slate-400 font-bold uppercase tracking-widest text-sm">No pending requests</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-4">
                                    {categoryRequests.map((req) => (
                                        <div key={req.id} className="p-6 bg-white border border-slate-100 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-6 hover:shadow-md transition-all">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                                        Requested by {req.userName}
                                                    </span>
                                                    <span className="text-[10px] text-slate-300">•</span>
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                                        {new Date(req.submittedAt).toLocaleDateString()}
                                                    </span>
                                                </div>
                                                <h3 className="text-lg font-black text-slate-800 mb-1">{req.restaurantName}</h3>
                                                <div className="flex items-center gap-3 text-sm font-medium">
                                                    <span className="text-slate-500 line-through decoration-red-400/50">{req.currentCategory}</span>
                                                    <span className="text-slate-300">→</span>
                                                    <span className="text-purple-600 font-bold bg-purple-50 px-2 py-0.5 rounded">{req.requestedCategory}</span>
                                                </div>
                                            </div>
                                            <div className="flex gap-3">
                                                <button
                                                    onClick={() => {
                                                        if (confirm("Reject this request?")) {
                                                            onResolveRequest(req, false);
                                                        }
                                                    }}
                                                    className="px-6 py-2 bg-slate-100 text-slate-600 rounded-xl font-black text-xs uppercase hover:bg-red-50 hover:text-red-600 transition-all active:scale-95"
                                                    disabled={loading}
                                                >
                                                    Reject
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        if (confirm(`Approve change to "${req.requestedCategory}"?\n\nThis will update the restaurant and reset any votes for the old category.`)) {
                                                            onResolveRequest(req, true);
                                                        }
                                                    }}
                                                    className="px-8 py-2 bg-purple-600 text-white rounded-xl font-black text-xs uppercase hover:bg-purple-700 transition-all shadow-md active:scale-95"
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
