import React, { useState } from 'react';
import { searchCandidates } from '../services/geminiService';
import { saveSuggestion } from '../services/restaurantService';
import { Restaurant } from '../types';

interface SuggestModalProps {
    isOpen: boolean;
    onClose: () => void;
    location: string;
    onSuccess: (restaurant: Restaurant) => void;
    existingRestaurants: Restaurant[];
    isAdmin?: boolean;
}

type Step = 'search' | 'results' | 'success';

const SuggestModal: React.FC<SuggestModalProps> = ({ isOpen, onClose, location, onSuccess, existingRestaurants, isAdmin = false }) => {
    const [restaurantName, setRestaurantName] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [step, setStep] = useState<Step>('search');
    const [candidates, setCandidates] = useState<Restaurant[]>([]);
    const [selectedName, setSelectedName] = useState('');

    // Rate limiting: max 3 submissions per 24 hours
    const checkRateLimit = (): boolean => {
        const key = 'pw_submission_timestamps_v2';
        const now = Date.now();
        const oneDay = 24 * 60 * 60 * 1000;

        const timestamps: number[] = JSON.parse(localStorage.getItem(key) || '[]');
        const recentTimestamps = timestamps.filter(t => now - t < oneDay);

        if (recentTimestamps.length >= 3) {
            return false;
        }

        recentTimestamps.push(now);
        localStorage.setItem(key, JSON.stringify(recentTimestamps));
        return true;
    };

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!restaurantName.trim()) {
            setError('Please enter a restaurant name');
            return;
        }

        setIsSearching(true);
        setError(null);

        try {
            const result = await searchCandidates(restaurantName, location);

            if (result.error && (!result.candidates || result.candidates.length === 0)) {
                setError(result.error);
                setIsSearching(false);
                return;
            }

            if (!result.candidates || result.candidates.length === 0) {
                setError(`No restaurants matching "${restaurantName}" found on Google Maps in ${location}. Check the spelling and try again.`);
                setIsSearching(false);
                return;
            }

            setCandidates(result.candidates);
            setStep('results');
        } catch (err: any) {
            setError('Something went wrong. Please try again.');
            console.error('Search error:', err);
        } finally {
            setIsSearching(false);
        }
    };

    const handleSelect = async (candidate: Restaurant) => {
        // Rate limit check (skip for admin)
        if (!isAdmin && !checkRateLimit()) {
            setError('Daily limit reached (3 suggestions per day). Please try again tomorrow.');
            return;
        }

        // Check if already on leaderboard
        const exists = existingRestaurants.some(
            r => r.id === candidate.id || r.name.toLowerCase() === candidate.name.toLowerCase()
        );
        if (exists) {
            setError(`"${candidate.name}" is already on the leaderboard!`);
            return;
        }

        setIsSaving(true);
        setError(null);

        try {
            await saveSuggestion(candidate);
            setSelectedName(candidate.name);
            setStep('success');
            onSuccess(candidate);

            // Auto-close after delay
            setTimeout(() => {
                handleClose();
            }, 2500);
        } catch (err: any) {
            setError('Failed to save suggestion. Please try again.');
            console.error('Save error:', err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleBack = () => {
        setStep('search');
        setCandidates([]);
        setError(null);
    };

    const handleClose = () => {
        setRestaurantName('');
        setError(null);
        setStep('search');
        setCandidates([]);
        setSelectedName('');
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
            <div className="bg-white rounded-t-[24px] sm:rounded-3xl shadow-2xl max-w-lg w-full relative max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="p-5 sm:p-8 pb-0 shrink-0">
                    <button
                        onClick={handleClose}
                        className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-2xl font-bold z-10"
                    >
                        ×
                    </button>

                    <div className="mb-4">
                        <h2 className="text-2xl font-black text-slate-900 mb-1">
                            {step === 'results' ? 'Select Restaurant' : 'Suggest a Restaurant'}
                        </h2>
                        <p className="text-slate-500 text-sm">
                            {step === 'results'
                                ? `Found ${candidates.length} result${candidates.length !== 1 ? 's' : ''} for "${restaurantName}"`
                                : `Know a great spot in ${location}? Search for it below!`
                            }
                        </p>
                    </div>
                </div>

                {/* Content */}
                <div className="overflow-y-auto flex-1 px-5 sm:px-8 pb-5 sm:pb-8">
                    {step === 'success' ? (
                        <div className="text-center py-8">
                            <div className="text-6xl mb-4">🎉</div>
                            <p className="text-xl font-bold text-orange-600">Suggestion Shared!</p>
                            <p className="text-slate-500 text-sm mt-2">
                                Thanks! An admin will review "{selectedName}" shortly.
                            </p>
                        </div>
                    ) : step === 'results' ? (
                        <div>
                            {/* Back button */}
                            <button
                                onClick={handleBack}
                                className="flex items-center gap-1 text-slate-500 hover:text-slate-700 text-sm font-bold mb-4 transition-colors"
                            >
                                ← Search Again
                            </button>

                            {error && (
                                <div className="mb-4 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
                                    {error}
                                </div>
                            )}

                            {/* Candidate list */}
                            <div className="space-y-3">
                                {candidates.map((candidate, i) => (
                                    <div
                                        key={candidate.id || i}
                                        className="border border-slate-200 rounded-2xl p-4 hover:border-orange-300 hover:shadow-md transition-all"
                                    >
                                        <div className="flex justify-between items-start gap-3">
                                            <div className="flex-1 min-w-0">
                                                <h3 className="font-black text-slate-900 text-base leading-tight">
                                                    {candidate.name}
                                                </h3>
                                                <p className="text-slate-500 text-sm mt-1 flex items-center gap-1.5">
                                                    <span>📍</span>
                                                    <span className="truncate">{candidate.address}</span>
                                                </p>
                                                <div className="flex items-center gap-3 mt-2">
                                                    <span className="text-xs font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">
                                                        {candidate.category}
                                                    </span>
                                                    {(candidate as any).rating > 0 && (
                                                        <span className="text-xs text-slate-500">
                                                            ⭐ {(candidate as any).rating}
                                                            {(candidate as any).reviewCount > 0 && (
                                                                <span className="text-slate-400"> ({(candidate as any).reviewCount})</span>
                                                            )}
                                                        </span>
                                                    )}
                                                </div>
                                                {(candidate as any).detail && (
                                                    <p className="text-slate-400 text-xs mt-1.5">{(candidate as any).detail}</p>
                                                )}
                                            </div>

                                            <button
                                                onClick={() => handleSelect(candidate)}
                                                disabled={isSaving}
                                                className="shrink-0 bg-orange-600 text-white px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-orange-700 transition-all active:scale-95 disabled:opacity-50"
                                            >
                                                {isSaving ? '...' : 'Select'}
                                            </button>
                                        </div>

                                        {/* Google Maps link */}
                                        <a
                                            href={candidate.googleMapsUri || `https://www.google.com/maps/search/${encodeURIComponent(candidate.name + ' ' + candidate.address)}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 mt-2 font-medium"
                                        >
                                            🗺️ View on Google Maps
                                        </a>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <form onSubmit={handleSearch}>
                            <div className="mb-6">
                                <label className="block text-sm font-bold text-slate-700 mb-2">
                                    Restaurant Name
                                </label>
                                <input
                                    type="text"
                                    value={restaurantName}
                                    onChange={(e) => setRestaurantName(e.target.value)}
                                    placeholder="e.g., Rose Garden, Golden Pride..."
                                    className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-4 focus:ring-orange-100 focus:border-orange-400 outline-none transition-all text-lg"
                                    disabled={isSearching}
                                    autoFocus
                                />
                                <p className="text-xs text-slate-400 mt-2">
                                    We'll search Google Maps in {location} and show you what we find.
                                </p>
                            </div>

                            {error && (
                                <div className="mb-4 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
                                    {error}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={isSearching}
                                className="w-full bg-orange-600 text-white py-4 rounded-xl font-black text-lg hover:bg-orange-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isSearching ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                        Searching Google Maps...
                                    </>
                                ) : (
                                    '🔍 Search'
                                )}
                            </button>
                        </form>
                    )}

                    <p className="text-center text-xs text-slate-400 mt-6">
                        Results are sourced from Google Maps to ensure accuracy.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default SuggestModal;
