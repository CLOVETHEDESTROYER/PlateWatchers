
import React, { useState } from 'react';
import { Restaurant } from '../types';

interface RestaurantCardProps {
  restaurant: Restaurant;
  isTopChoice: boolean;
  isRunnerUp: boolean;
  isOverallTopPick: boolean;
  onVote: (id: string, category: string, type: 'top' | 'runnerUp') => void;
  onVoteOverall: (id: string) => void;
  userScore: number;
  globalCommunityPoints?: number;
}

const RestaurantCard: React.FC<RestaurantCardProps> = ({
  restaurant,
  isTopChoice,
  isRunnerUp,
  isOverallTopPick,
  onVote,
  onVoteOverall,
  userScore,
  globalCommunityPoints
}) => {
  const [showCopied, setShowCopied] = useState(false);
  
  // Explicitly calculate total combined points
  const totalDisplayPoints = restaurant.basePoints + userScore + (globalCommunityPoints || 0);

  const handleShare = async () => {
    const shareText = `Check out ${restaurant.name} on Plate Watchers! 🍽️✨\nView on Maps: ${restaurant.googleMapsUri}\nRank your favorites at Plate Watchers.`;
    try {
      await navigator.clipboard.writeText(shareText);
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const isGlobalActive = typeof globalCommunityPoints === 'number';

  return (
    <div className={`bg-white/95 backdrop-blur-sm rounded-xl shadow-sm border p-5 transition-all duration-300 flex flex-col h-full relative ${
      isTopChoice ? 'ring-2 ring-orange-500 border-orange-200 shadow-md bg-orange-50/10' : 
      isRunnerUp ? 'ring-2 ring-amber-400 border-amber-200 shadow-sm' : 
      'border-slate-200 hover:shadow-md'
    }`}>
      
      {isGlobalActive && (globalCommunityPoints || 0) > 500 && (
        <div className="absolute -top-2 left-5 z-10 bg-indigo-600 text-white text-[8px] font-black uppercase tracking-widest px-2 py-1 rounded-full shadow-sm flex items-center gap-1">
          🔥 Community Hot Spot
        </div>
      )}

      <div className="flex justify-between items-start mb-2 mt-1">
        <div className="flex-1 mr-2">
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-block px-2 py-1 rounded-md bg-slate-100 text-slate-700 text-[9px] font-black uppercase tracking-widest">
              {restaurant.category}
            </span>
          </div>
          <h3 className="text-lg font-black text-slate-900 leading-tight">{restaurant.name}</h3>
          <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-tighter line-clamp-1">{restaurant.address}</p>
        </div>
        <div className="text-right flex flex-col items-end">
          <div className="text-2xl font-black text-slate-900 tabular-nums tracking-tighter">
            {totalDisplayPoints.toLocaleString()}
          </div>
          <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-1.5 py-0.5 rounded">Total Pts</div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-1">
         <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest border-b border-slate-50 pb-1">
            <span className="text-slate-400">Base Listing</span>
            <span className="text-slate-600">+{restaurant.basePoints}</span>
         </div>
         <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest border-b border-slate-50 pb-1">
            <span className="text-slate-400">Your Support</span>
            <span className="text-orange-600">+{userScore}</span>
         </div>
         {isGlobalActive && (
           <div className="flex justify-between items-center text-[10px] font-bold uppercase tracking-widest">
              <span className="text-slate-400">Global Rank</span>
              <span className="text-indigo-600">+{globalCommunityPoints}</span>
           </div>
         )}
      </div>

      <div className="flex-grow"></div>

      <div className="grid grid-cols-2 gap-2 mt-6">
        <button
          onClick={() => onVote(restaurant.id, restaurant.category, 'top')}
          className={`py-2 px-1 rounded-xl text-xs font-black transition-all flex flex-col items-center justify-center border-2 ${
            isTopChoice ? 'bg-orange-600 text-white border-orange-600' : 'bg-white text-orange-600 border-orange-100 hover:border-orange-200'
          }`}
        >
          <span>{isTopChoice ? '✓ Voted' : '1st Choice'}</span>
          <span className={`text-[9px] ${isTopChoice ? 'text-orange-100' : 'text-orange-400'}`}>+100 pts</span>
        </button>

        <button
          onClick={() => onVote(restaurant.id, restaurant.category, 'runnerUp')}
          className={`py-2 px-1 rounded-xl text-xs font-black transition-all flex flex-col items-center justify-center border-2 ${
            isRunnerUp ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-amber-600 border-amber-100 hover:border-amber-200'
          }`}
        >
          <span>{isRunnerUp ? '✓ Voted' : '2nd Choice'}</span>
          <span className={`text-[9px] ${isRunnerUp ? 'text-amber-100' : 'text-amber-400'}`}>+25 pts</span>
        </button>
      </div>

      <button
        onClick={() => onVoteOverall(restaurant.id)}
        className={`w-full mt-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border-2 ${
          isOverallTopPick ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-indigo-600 border-indigo-50 hover:bg-indigo-50/50'
        }`}
      >
        {isOverallTopPick ? '★ Ultimate Choice' : 'Vote Ultimate Pick'}
        <span className="block text-[8px] opacity-70 mt-0.5">Worth 500 Global Points</span>
      </button>
      
      <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <a href={restaurant.googleMapsUri} target="_blank" rel="noopener noreferrer" className="text-slate-400 text-[10px] font-black uppercase tracking-widest hover:text-indigo-600 flex items-center group">
            Maps
            <svg className="w-3 h-3 ml-1.5 transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
          </a>
          
          <button onClick={handleShare} className={`text-[10px] font-black uppercase tracking-widest flex items-center ${showCopied ? 'text-green-500' : 'text-slate-400 hover:text-orange-500'}`}>
            {showCopied ? 'Copied!' : 'Share'}
          </button>
        </div>

        <div className="flex items-center text-amber-500 text-xs font-black bg-amber-50 px-2 py-1 rounded-md">
          <span className="mr-1 text-[10px]">★</span>{restaurant.rating.toFixed(1)}
        </div>
      </div>
    </div>
  );
};

export default RestaurantCard;
