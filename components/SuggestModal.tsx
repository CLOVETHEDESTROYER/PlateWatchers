import React, { useState } from 'react';
import { validateRestaurant, ValidationResult } from '../services/geminiService';
import { saveSuggestion } from '../services/restaurantService';
import { Restaurant } from '../types';

interface SuggestModalProps {
    isOpen: boolean;
    onClose: () => void;
    location: string;
    onSuccess: (restaurant: Restaurant) => void;
    existingRestaurants: Restaurant[];
}

const SuggestModal: React.FC<SuggestModalProps> = ({ isOpen, onClose, location, onSuccess, existingRestaurants }) => {
    const [restaurantName, setRestaurantName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [lastSuggestedName, setLastSuggestedName] = useState('');

    // Rate limiting: max 5 submissions per hour
    const checkRateLimit = (): boolean => {
        const key = 'pw_submission_timestamps';
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;

        const timestamps: number[] = JSON.parse(localStorage.getItem(key) || '[]');
        const recentTimestamps = timestamps.filter(t => now - t < oneHour);

        if (recentTimestamps.length >= 5) {
            return false;
        }

        recentTimestamps.push(now);
        localStorage.setItem(key, JSON.stringify(recentTimestamps));
        return true;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!restaurantName.trim()) {
            setError('Please enter a restaurant name');
            return;
        }

        if (!checkRateLimit()) {
            setError('Too many submissions. Please try again in an hour.');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            // Local check 1: Exact Name Match (case-insensitive)
            const exists = existingRestaurants.some(r => r.name.toLowerCase() === restaurantName.toLowerCase().trim());
            if (exists) {
                setError(`"${restaurantName}" is already on the leaderboard!`);
                setIsSubmitting(false);
                return;
            }

            const result: ValidationResult = await validateRestaurant(restaurantName, location);

            if (!result.valid || !result.restaurant) {
                setError(result.error || 'Restaurant not found. Make sure it exists on Google Maps in ' + location);
                setIsSubmitting(false);
                return;
            }

            // Local check 2: ID Match (Deterministic ID match)
            const idExists = existingRestaurants.some(r => r.id === result.restaurant?.id);
            if (idExists) {
                setError(`"${result.restaurant.name}" is already on the leaderboard!`);
                setIsSubmitting(false);
                return;
            }

            // Save to Suggestions collection instead of main restaurants
            await saveSuggestion(result.restaurant);

            setSuccess(true);
            setLastSuggestedName(result.restaurant.name);
            setRestaurantName('');

            // Notify parent of success
            onSuccess(result.restaurant);

            // Close modal after brief delay
            setTimeout(() => {
                setSuccess(false);
                onClose();
            }, 2000);

        } catch (err: any) {
            setError('Something went wrong. Please try again.');
            console.error('Submission error:', err);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleClose = () => {
        setRestaurantName('');
        setError(null);
        setSuccess(false);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-t-[24px] sm:rounded-3xl shadow-2xl max-w-md w-full p-5 sm:p-8 relative">
                {/* Close button */}
                <button
                    onClick={handleClose}
                    className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-2xl font-bold"
                >
                    ×
                </button>

                {/* Header */}
                <div className="mb-6">
                    <h2 className="text-2xl font-black text-slate-900 mb-2">Suggest a Restaurant</h2>
                    <p className="text-slate-500 text-sm">
                        Know a great spot in {location}? Add it to the leaderboard!
                    </p>
                </div>

                {success ? (
                    <div className="text-center py-8">
                        <div className="text-6xl mb-4">🎉</div>
                        <p className="text-xl font-bold text-orange-600">Suggestion Shared!</p>
                        <p className="text-slate-500 text-sm mt-2">Thanks! An admin will review "{lastSuggestedName}" shortly to ensure it's in Albuquerque.</p>
                    </div>
                ) : (
                    <form onSubmit={handleSubmit}>
                        <div className="mb-6">
                            <label className="block text-sm font-bold text-slate-700 mb-2">
                                Restaurant Name
                            </label>
                            <input
                                type="text"
                                value={restaurantName}
                                onChange={(e) => setRestaurantName(e.target.value)}
                                placeholder="e.g., Golden Pride BBQ"
                                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-4 focus:ring-orange-100 focus:border-orange-400 outline-none transition-all text-lg"
                                disabled={isSubmitting}
                            />
                            <p className="text-xs text-slate-400 mt-2">
                                Must be on Google Maps in {location}
                            </p>
                        </div>

                        {error && (
                            <div className="mb-4 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full bg-orange-600 text-white py-4 rounded-xl font-black text-lg hover:bg-orange-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {isSubmitting ? (
                                <>
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    Verifying on Google Maps...
                                </>
                            ) : (
                                'Add Restaurant'
                            )}
                        </button>
                    </form>
                )}

                <p className="text-center text-xs text-slate-400 mt-6">
                    Submissions are verified against Google Maps to ensure accuracy.
                </p>
            </div>
        </div>
    );
};

export default SuggestModal;
