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
    onDelete: (id: string) => Promise<void>;
    onAdd: () => void;
    onUpdatePoints: (id: string, points: number) => Promise<void>;
    standardCategories: string[];
    globalScores: Record<string, number>;
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
    onResolveRequest,
    onDelete,
    onAdd,
    onUpdatePoints,
    standardCategories,
    globalScores
}) => {
    const [activeTab, setActiveTab] = useState<'tools' | 'approvals' | 'edit' | 'requests' | 'rankings'>('approvals');
    const [editSearch, setEditSearch] = useState('');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [newCategory, setNewCategory] = useState('');
    const [isCreatingNew, setIsCreatingNew] = useState(false);
    const [customCategory, setCustomCategory] = useState('');
    const [newBasePoints, setNewBasePoints] = useState<number>(100);

    const filteredRestaurants = React.useMemo(() => {
        if (!editSearch) return [];
        const q = editSearch.toLowerCase();
        return restaurants.filter(r =>
            r.name.toLowerCase().includes(q) ||
            r.category.toLowerCase().includes(q) ||
            r.googlePlaceType?.toLowerCase().includes(q)
        ).slice(0, 50); // Limit results
    }, [restaurants, editSearch]);

    // Top 50 rankings
    const top50 = React.useMemo(() => {
        return [...restaurants]
            .map(r => ({
                ...r,
                communityPts: globalScores[r.id] || 0,
                totalPts: Number(r.basePoints) + (globalScores[r.id] || 0)
            }))
            .sort((a, b) => b.totalPts - a.totalPts)
            .slice(0, 50);
    }, [restaurants, globalScores]);

    const handleStartEdit = (r: Restaurant) => {
        setEditingId(r.id);
        setNewCategory(r.category);
        setNewBasePoints(r.basePoints);
        setIsCreatingNew(false);
        setCustomCategory('');
    };

    const handleSaveCategory = async (r: Restaurant) => {
        const finalCategory = isCreatingNew ? customCategory.trim() : newCategory.trim();
        const categoryChanged = finalCategory !== r.category;
        const pointsChanged = newBasePoints !== r.basePoints;

        if (!finalCategory || (!categoryChanged && !pointsChanged)) {
            setEditingId(null);
            return;
        }

        if (categoryChanged) {
            const communityPoints = globalScores[r.id] || 0;
            if (confirm(`Change category from "${r.category}" to "${finalCategory}"?\n\nWARNING: You are about to clear individual vote history (worth ${communityPoints} pts) for this category.\n\nYou can manually add these points back to the "Base Points" field to preserve the restaurant's total impact.`)) {
                await onRecategorize(r.id, finalCategory, r.category);
                if (pointsChanged) {
                    await onUpdatePoints(r.id, newBasePoints);
                }
                setEditingId(null);
            }
        } else if (pointsChanged) {
            await onUpdatePoints(r.id, newBasePoints);
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
                        <button
                            onClick={onAdd}
                            className="bg-emerald-500 text-white p-2 rounded-full hover:bg-emerald-600 transition-colors shadow-sm active:scale-95"
                            title="Manually Add Restaurant"
                        >
                            <span className="text-xl font-bold">+</span>
                        </button>
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
                            onClick={() => setActiveTab('rankings')}
                            className={`px-3 py-2 sm:px-6 sm:py-2 rounded-xl text-[10px] sm:text-sm font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'rankings' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            Top 50
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
                                    <div className="flex-1">
                                        <h3 className="font-bold text-slate-900">{r.name}</h3>
                                        <div className="flex items-center gap-2">
                                            <p className="text-xs text-slate-500">{r.address}</p>
                                            <span className="text-[10px] font-black text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded leading-none">
                                                {(Number(r.basePoints) + (globalScores[r.id] || 0)).toLocaleString()} pts
                                            </span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {editingId === r.id ? (
                                            <div className="flex flex-col gap-2">
                                                <div className="flex items-center gap-2">
                                                    {isCreatingNew ? (
                                                        <input
                                                            type="text"
                                                            value={customCategory}
                                                            onChange={(e) => setCustomCategory(e.target.value)}
                                                            placeholder="New category name..."
                                                            className="bg-white border border-blue-300 rounded-lg px-3 py-1 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-blue-200"
                                                            autoFocus
                                                        />
                                                    ) : (
                                                        <select
                                                            value={newCategory}
                                                            onChange={(e) => setNewCategory(e.target.value)}
                                                            className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-blue-200 cursor-pointer"
                                                        >
                                                            {standardCategories.map(cat => (
                                                                <option key={cat} value={cat}>{cat}</option>
                                                            ))}
                                                        </select>
                                                    )}
                                                    <div className="flex flex-col gap-1">
                                                        <label className="text-[10px] font-bold text-slate-400 uppercase">Base Points</label>
                                                        <input
                                                            type="number"
                                                            value={newBasePoints}
                                                            onChange={(e) => setNewBasePoints(parseInt(e.target.value) || 0)}
                                                            className="bg-white border border-slate-300 rounded-lg px-3 py-1 text-sm w-24 focus:outline-none focus:ring-2 focus:ring-blue-200"
                                                        />
                                                    </div>
                                                    <div className="flex flex-col gap-1 items-center">
                                                        <label className="text-[10px] font-bold text-slate-400 uppercase">Comm. Points</label>
                                                        <span className="text-sm font-bold text-slate-600 py-1">{globalScores[r.id] || 0}</span>
                                                    </div>
                                                    <button
                                                        onClick={() => handleSaveCategory(r)}
                                                        className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-green-700 transition-colors h-fit mt-5"
                                                    >
                                                        Save
                                                    </button>
                                                    <button
                                                        onClick={() => setEditingId(null)}
                                                        className="bg-slate-200 text-slate-600 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-300 transition-colors h-fit mt-5"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                                <button
                                                    onClick={() => { setIsCreatingNew(!isCreatingNew); setCustomCategory(''); }}
                                                    className="text-[10px] font-bold text-blue-500 hover:text-blue-700 uppercase tracking-widest transition-colors self-start"
                                                >
                                                    {isCreatingNew ? '← Pick from list' : '+ New Category'}
                                                </button>
                                            </div>
                                        ) : (
                                            <>
                                                <span className="text-xs font-bold bg-slate-200 text-slate-600 px-2 py-1 rounded">
                                                    {r.category}
                                                </span>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => handleStartEdit(r)}
                                                        className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                                                        title="Edit Category"
                                                    >
                                                        ✏️
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            if (confirm(`Are you sure you want to DELETE "${r.name}"?\n\nThis will also remove all associated votes. This action cannot be undone.`)) {
                                                                onDelete(r.id);
                                                            }
                                                        }}
                                                        className="p-2 text-red-400 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
                                                        title="Delete Restaurant"
                                                    >
                                                        🗑️
                                                    </button>
                                                </div>
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
                {activeTab === 'rankings' && (
                    <div className="bg-white/80 backdrop-blur-md border border-slate-200 rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-sm">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600 text-2xl">
                                🏆
                            </div>
                            <div>
                                <h2 className="text-xl font-black text-slate-800">Top 50 Rankings</h2>
                                <p className="text-sm text-slate-500 font-medium">
                                    {restaurants.length} total restaurants · {Object.keys(globalScores).length} with community votes
                                </p>
                            </div>
                        </div>

                        {/* Summary stats */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                            <div className="bg-indigo-50 rounded-2xl p-4 text-center">
                                <div className="text-2xl font-black text-indigo-700">
                                    {(Object.values(globalScores) as number[]).reduce((a: number, b: number) => a + b, 0).toLocaleString()}
                                </div>
                                <div className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mt-1">Total Community Pts</div>
                            </div>
                            <div className="bg-orange-50 rounded-2xl p-4 text-center">
                                <div className="text-2xl font-black text-orange-700">
                                    {(Object.values(globalScores) as number[]).filter((v: number) => v > 0).length}
                                </div>
                                <div className="text-[10px] font-black text-orange-400 uppercase tracking-widest mt-1">Restaurants Voted On</div>
                            </div>
                            <div className="bg-emerald-50 rounded-2xl p-4 text-center">
                                <div className="text-2xl font-black text-emerald-700">
                                    {top50.length > 0 ? top50[0].totalPts.toLocaleString() : '—'}
                                </div>
                                <div className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mt-1">#1 Total Score</div>
                            </div>
                            <div className="bg-slate-50 rounded-2xl p-4 text-center">
                                <div className="text-2xl font-black text-slate-700">
                                    {Object.values(globalScores).length > 0
                                        ? Math.round((Object.values(globalScores) as number[]).filter((v: number) => v > 0).reduce((a: number, b: number) => a + b, 0) / Math.max((Object.values(globalScores) as number[]).filter((v: number) => v > 0).length, 1))
                                        : '—'}
                                </div>
                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Avg Community Pts</div>
                            </div>
                        </div>

                        {/* Rankings table */}
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b-2 border-slate-200">
                                        <th className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400 py-3 px-2 w-12">#</th>
                                        <th className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400 py-3 px-2">Restaurant</th>
                                        <th className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400 py-3 px-2 hidden md:table-cell">Category</th>
                                        <th className="text-right text-[10px] font-black uppercase tracking-widest text-slate-400 py-3 px-2">Base</th>
                                        <th className="text-right text-[10px] font-black uppercase tracking-widest text-slate-400 py-3 px-2">Community</th>
                                        <th className="text-right text-[10px] font-black uppercase tracking-widest text-slate-400 py-3 px-2">Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {top50.map((r, i) => (
                                        <tr
                                            key={r.id}
                                            className={`border-b border-slate-50 hover:bg-orange-50/40 transition-colors ${i < 3 ? 'bg-amber-50/30' : ''
                                                }`}
                                        >
                                            <td className="py-3 px-2">
                                                <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg font-black text-xs ${i === 0 ? 'bg-amber-500 text-white shadow-md' :
                                                    i === 1 ? 'bg-slate-400 text-white shadow-sm' :
                                                        i === 2 ? 'bg-amber-700 text-white shadow-sm' :
                                                            'bg-slate-100 text-slate-500'
                                                    }`}>
                                                    {i + 1}
                                                </span>
                                            </td>
                                            <td className="py-3 px-2">
                                                <div className="font-bold text-slate-900 text-sm">{r.name}</div>
                                                <div className="text-[10px] text-slate-400 truncate max-w-[200px]">{r.address}</div>
                                            </td>
                                            <td className="py-3 px-2 hidden md:table-cell">
                                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 bg-slate-100 px-2 py-1 rounded-md">
                                                    {r.category}
                                                </span>
                                            </td>
                                            <td className="py-3 px-2 text-right">
                                                <span className="text-sm font-bold text-slate-500">{Number(r.basePoints).toLocaleString()}</span>
                                            </td>
                                            <td className="py-3 px-2 text-right">
                                                <span className={`text-sm font-black ${r.communityPts > 0 ? 'text-indigo-600' : 'text-slate-300'}`}>
                                                    {r.communityPts > 0 ? `+${r.communityPts.toLocaleString()}` : '0'}
                                                </span>
                                            </td>
                                            <td className="py-3 px-2 text-right">
                                                <span className="text-sm font-black text-orange-600">{r.totalPts.toLocaleString()}</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {top50.length === 0 && (
                            <div className="text-center py-12 text-slate-400 font-bold uppercase tracking-widest text-sm">
                                No restaurants found
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminDashboard;
