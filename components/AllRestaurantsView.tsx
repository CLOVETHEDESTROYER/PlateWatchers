import React, { useMemo } from 'react';
import { Restaurant } from '../types';

interface AllRestaurantsViewProps {
    restaurants: Restaurant[];
    onBack: () => void;
}

const AllRestaurantsView: React.FC<AllRestaurantsViewProps> = ({ restaurants, onBack }) => {
    const [localSearch, setLocalSearch] = React.useState('');

    // Group restaurants by category and search
    const grouped = useMemo((): Record<string, Restaurant[]> => {
        const groups: Record<string, Restaurant[]> = {};
        const query = localSearch.toLowerCase().trim();

        restaurants.forEach(r => {
            if (query && !r.name.toLowerCase().includes(query) && !r.category.toLowerCase().includes(query)) {
                return;
            }
            if (!groups[r.category]) groups[r.category] = [];
            groups[r.category].push(r);
        });
        // Sort categories alphabetically
        return Object.keys(groups).sort().reduce((acc, key) => {
            acc[key] = groups[key].sort((a, b) => a.name.localeCompare(b.name));
            return acc;
        }, {} as Record<string, Restaurant[]>);
    }, [restaurants, localSearch]);

    const highlightText = (text: string, query: string) => {
        if (!query.trim()) return text;
        const parts = text.split(new RegExp(`(${query})`, 'gi'));
        return (
            <span>
                {parts.map((part, i) =>
                    part.toLowerCase() === query.toLowerCase()
                        ? <span key={i} className="bg-orange-100 text-orange-800 rounded px-0.5">{part}</span>
                        : part
                )}
            </span>
        );
    };

    return (
        <div className="min-h-screen pb-40 relative">
            <div className="max-w-7xl mx-auto px-4 mt-8">
                {/* Header with Back Button */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                    <div className="flex items-center gap-4">
                        <button
                            onClick={onBack}
                            className="flex items-center gap-2 text-slate-500 hover:text-orange-600 font-bold transition-colors"
                        >
                            ← Back
                        </button>
                        <h1 className="text-3xl font-black text-slate-900">All Restaurants</h1>
                        <span className="bg-orange-100 text-orange-700 font-bold px-3 py-1 rounded-full text-sm">
                            {restaurants.length} Total
                        </span>
                    </div>

                    <div className="relative w-full md:w-80">
                        <input
                            type="text"
                            placeholder="Filter database..."
                            value={localSearch}
                            onChange={(e) => setLocalSearch(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-2xl px-5 py-2.5 text-sm font-medium focus:outline-none focus:ring-4 focus:ring-orange-100 transition-all"
                        />
                        {localSearch && (
                            <button
                                onClick={() => setLocalSearch('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                                ✕
                            </button>
                        )}
                    </div>
                </div>

                <div className="bg-white/80 backdrop-blur-md border border-slate-200 rounded-3xl p-8 shadow-sm">
                    {Object.keys(grouped).length === 0 ? (
                        <div className="text-center py-20 text-slate-400">
                            {localSearch ? `No results for "${localSearch}"` : "No restaurants found."}
                        </div>
                    ) : (
                        <div className="space-y-12">
                            {Object.entries(grouped).map(([category, items]) => (
                                <section key={category}>
                                    <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-3 border-b border-slate-100 pb-2">
                                        {highlightText(category, localSearch)}
                                        <span className="text-xs font-bold bg-slate-100 text-slate-500 px-2 py-1 rounded-md">{items.length}</span>
                                    </h2>

                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4">
                                        {items.map(r => (
                                            <div key={r.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-orange-50/50 transition-colors group">
                                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-400 shrink-0 group-hover:bg-orange-100 group-hover:text-orange-600 transition-colors">
                                                    {r.name.charAt(0)}
                                                </div>
                                                <div className="min-w-0">
                                                    <div className="font-bold text-slate-900 truncate pr-2">{highlightText(r.name, localSearch)}</div>
                                                    <div className="text-xs text-slate-500 truncate">{r.address}</div>

                                                    <div className="flex items-center gap-3 mt-1 text-[10px] font-medium text-slate-400">
                                                        {r.source === 'user-submitted' && (
                                                            <span className="text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">User Submitted</span>
                                                        )}
                                                        <span>Score: {Math.round(r.basePoints)}</span>
                                                        {r.googleMapsUri && (
                                                            <a href={r.googleMapsUri} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline">
                                                                View Map
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </section>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default AllRestaurantsView;
