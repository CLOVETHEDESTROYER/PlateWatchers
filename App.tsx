
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchRestaurants } from './services/geminiService';
import { Restaurant, UserVoteRecord, SearchResult, Coordinates, CategoryVote } from './types';
import RestaurantCard from './components/RestaurantCard';
import { db, isConfigured } from './firebase';
import { doc, onSnapshot, setDoc, increment, collection } from "firebase/firestore";

const App: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [location, setLocation] = useState('Albuquerque, New Mexico');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SearchResult | null>(null);
  const [globalScores, setGlobalScores] = useState<Record<string, number>>({});
  const [error, setError] = useState<{ message: string; type: 'quota' | 'key' | 'generic' } | null>(null);
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [isGlobalLive, setIsGlobalLive] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  
  // Voting state
  const [userVotes, setUserVotes] = useState<UserVoteRecord>(() => {
    const saved = localStorage.getItem('user_votes_v4');
    return saved ? JSON.parse(saved) : { categoryVotes: {}, overallTopPick: null };
  });

  useEffect(() => {
    localStorage.setItem('user_votes_v4', JSON.stringify(userVotes));
  }, [userVotes]);

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        (err) => console.debug("Geolocation disabled", err)
      );
    }
  }, []);

  // Sync global scores from Firebase with error handling
  useEffect(() => {
    if (!data?.restaurants.length || !db || !isConfigured) {
      setIsGlobalLive(false);
      return;
    }

    try {
      const unsubscribe = onSnapshot(collection(db, "global_rankings"), 
        (snapshot) => {
          const scores: Record<string, number> = {};
          snapshot.forEach((doc) => {
            scores[doc.id] = doc.data().points || 0;
          });
          setGlobalScores(scores);
          setIsGlobalLive(true);
        },
        (err) => {
          console.warn("Firestore access denied or project not setup. Switching to Local Mode.");
          setIsGlobalLive(false);
        }
      );
      return () => unsubscribe();
    } catch (e) {
      setIsGlobalLive(false);
    }
  }, [data]);

  const handleSearch = useCallback(async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError(null);
    setSelectedCategories([]);

    try {
      const result = await fetchRestaurants(searchQuery, location, coords);
      if (result.restaurants.length === 0) {
        setError({ 
          message: `No local results found for "${searchQuery || 'best food'}" in ${location}.`,
          type: 'generic'
        });
      } else {
        setData(result);
      }
    } catch (err: any) {
      setError({ message: "Could not fetch restaurant data.", type: 'generic' });
    } finally {
      setLoading(false);
    }
  }, [searchQuery, location, coords]);

  useEffect(() => {
    handleSearch();
  }, [handleSearch]);

  const syncVoteToFirebase = async (id: string, delta: number) => {
    if (!db || !isGlobalLive) return;
    const ref = doc(db, "global_rankings", id);
    try {
      await setDoc(ref, { points: increment(delta) }, { merge: true });
    } catch (e) {
      console.debug("Firebase sync suppressed (Local Mode)");
    }
  };

  const handleVote = (id: string, category: string, type: 'top' | 'runnerUp') => {
    let delta = 0;
    setUserVotes(prev => {
      const current = prev.categoryVotes[category] || { topId: null, runnerUpId: null };
      const next = { ...current };

      if (type === 'top') {
        const isRemoving = next.topId === id;
        delta = isRemoving ? -100 : 100;
        next.topId = isRemoving ? null : id;
        if (!isRemoving && next.runnerUpId === id) {
           next.runnerUpId = null;
           delta += -25;
        }
      } else {
        const isRemoving = next.runnerUpId === id;
        delta = isRemoving ? -25 : 25;
        next.runnerUpId = isRemoving ? null : id;
        if (!isRemoving && next.topId === id) {
           next.topId = null;
           delta += -100;
        }
      }

      return { ...prev, categoryVotes: { ...prev.categoryVotes, [category]: next } };
    });
    syncVoteToFirebase(id, delta);
  };

  const handleVoteOverall = (id: string) => {
    let delta = 0;
    setUserVotes(prev => {
      const isRemoving = prev.overallTopPick === id;
      delta = isRemoving ? -500 : 500;
      return { ...prev, overallTopPick: isRemoving ? null : id };
    });
    syncVoteToFirebase(id, delta);
  };

  const getRestaurantPoints = (restaurant: Restaurant): number => {
    const global: number = Number(globalScores[restaurant.id] || 0);
    const catVote = userVotes.categoryVotes[restaurant.category];
    let userBoost: number = 0;
    if (catVote?.topId === restaurant.id) userBoost += 100;
    if (catVote?.runnerUpId === restaurant.id) userBoost += 25;
    if (userVotes.overallTopPick === restaurant.id) userBoost += 500;
    return Number(restaurant.basePoints) + global + userBoost;
  };

  const groupedRestaurants = useMemo(() => {
    if (!data) return {};
    const groups: Record<string, Restaurant[]> = {};
    data.restaurants.forEach(r => {
      if (!groups[r.category]) groups[r.category] = [];
      groups[r.category].push(r);
    });
    Object.keys(groups).forEach(cat => {
      groups[cat].sort((a, b) => getRestaurantPoints(b) - getRestaurantPoints(a));
    });
    return groups;
  }, [data, userVotes, globalScores]);

  const activeVotesCount = useMemo(() => {
    return (Object.values(userVotes.categoryVotes) as CategoryVote[]).reduce((acc: number, curr: CategoryVote) => {
      let count = acc;
      if (curr.topId) count++;
      if (curr.runnerUpId) count++;
      return count;
    }, 0);
  }, [userVotes.categoryVotes]);

  const totalImpactScore = useMemo(() => {
    const categoryPoints: number = (Object.values(userVotes.categoryVotes) as CategoryVote[]).reduce((acc: number, curr: CategoryVote): number => {
      let sum = 0;
      if (curr.topId) sum += 100;
      if (curr.runnerUpId) sum += 25;
      return acc + sum;
    }, 0);
    const overallPickPoints: number = userVotes.overallTopPick ? 500 : 0;
    return categoryPoints + overallPickPoints;
  }, [userVotes]);

  const filteredCategoryKeys = useMemo(() => {
    const keys = Object.keys(groupedRestaurants).sort((a, b) => a.localeCompare(b));
    if (selectedCategories.length === 0) return keys;
    return keys.filter(key => selectedCategories.includes(key));
  }, [groupedRestaurants, selectedCategories]);

  return (
    <div className="min-h-screen pb-40 relative">
      {/* Background Map Layer - Increased Opacity for "Opaque" look */}
      <div className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden">
        <div className="absolute inset-0 bg-[#faf9f6]/70"></div>
        <img 
          src="https://images.unsplash.com/photo-1548345680-f5475ee511d7?q=80&w=2000&auto=format&fit=crop" 
          className="w-full h-full object-cover grayscale opacity-[0.12] brightness-110 contrast-150" 
          alt="Albuquerque Map Background"
        />
      </div>

      <header className="bg-white/80 backdrop-blur-md border-b border-orange-100 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center gap-6">
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 bg-orange-600 rounded-xl flex items-center justify-center rotate-3 shadow-lg">
              <span className="text-white font-black italic text-xl">PW</span>
            </div>
            <div className="hidden lg:block">
              <h1 className="text-xl font-black tracking-tighter text-slate-900 leading-none">Plate <span className="text-orange-600">Watchers</span></h1>
              <div className="flex items-center gap-1.5 mt-1">
                 <div className={`w-1.5 h-1.5 rounded-full ${isGlobalLive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></div>
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                   {isGlobalLive ? 'Global Live' : 'Personal Mode'}
                 </p>
              </div>
            </div>
          </div>
          
          <form onSubmit={handleSearch} className="flex-1 flex items-center bg-white/60 border border-slate-200 rounded-2xl overflow-hidden group focus-within:ring-4 focus-within:ring-orange-100 transition-all">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Find (Sushi, burgers...)"
              className="w-full pl-6 pr-4 py-3 bg-transparent text-sm font-medium focus:outline-none"
            />
            <div className="w-[1px] h-6 bg-slate-200"></div>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Location"
              className="w-full pl-6 pr-4 py-3 bg-transparent text-sm font-medium focus:outline-none"
            />
            <button type="submit" className="bg-orange-600 text-white px-6 py-3 font-black text-xs uppercase hover:bg-orange-700 transition-colors">Go</button>
          </form>

          <div className="hidden sm:flex items-center gap-4 bg-white/60 border border-slate-100 rounded-2xl px-4 py-2 shrink-0">
            <div className="text-center">
              <div className="text-xs font-black text-slate-800">{activeVotesCount}</div>
              <div className="text-[9px] font-bold text-slate-400 uppercase">Votes</div>
            </div>
            <div className="h-6 w-[1px] bg-slate-200"></div>
            <div className="text-center">
              <div className={`text-xs font-black ${userVotes.overallTopPick ? 'text-indigo-600' : 'text-slate-300'}`}>{userVotes.overallTopPick ? '✓' : '×'}</div>
              <div className="text-[9px] font-bold text-slate-400 uppercase">Top</div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 mt-12">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div className="max-w-2xl">
            <h2 className="text-5xl font-black text-slate-900 tracking-tighter mb-4 italic leading-tight">
               {isGlobalLive ? 'Community' : 'Your Personal'} <span className="text-orange-600">Rankings</span>
            </h2>
            <p className="text-slate-500 text-xl font-medium">
              {isGlobalLive 
                ? `Real-time shared leaderboard for the best of ${location}.`
                : `Ranking the best local gems in ${location}. Set up Firebase for global sync.`}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-40">
            <div className="w-24 h-24 border-8 border-orange-100 border-t-orange-600 rounded-full animate-spin mb-8"></div>
            <p className="text-slate-400 font-black uppercase tracking-[0.3em] text-sm animate-pulse text-center">Finding the best spots...</p>
          </div>
        ) : error ? (
          <div className="py-20 text-center">
             <div className="text-orange-600 font-black text-4xl mb-4">Oops!</div>
             <p className="text-slate-500 font-medium">{error.message}</p>
             <button onClick={() => handleSearch()} className="mt-6 bg-slate-900 text-white px-8 py-3 rounded-xl font-bold">Try Again</button>
          </div>
        ) : (
          <div className="space-y-24">
            {filteredCategoryKeys.map(category => (
              <section key={category}>
                <h3 className="text-3xl font-black text-slate-900 mb-8 px-8 py-2 bg-white/90 border border-slate-100 rounded-full inline-block shadow-sm backdrop-blur-sm">{category}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {groupedRestaurants[category].map((restaurant) => {
                    const catVote = userVotes.categoryVotes[category];
                    return (
                      <RestaurantCard
                        key={restaurant.id}
                        restaurant={restaurant}
                        isTopChoice={catVote?.topId === restaurant.id}
                        isRunnerUp={catVote?.runnerUpId === restaurant.id}
                        isOverallTopPick={userVotes.overallTopPick === restaurant.id}
                        onVote={handleVote}
                        onVoteOverall={handleVoteOverall}
                        userScore={getRestaurantPoints(restaurant) - Number(restaurant.basePoints) - Number(globalScores[restaurant.id] || 0)}
                        globalCommunityPoints={isGlobalLive ? Number(globalScores[restaurant.id] || 0) : undefined}
                      />
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40 w-full max-w-3xl px-6">
        <div className="bg-slate-900/90 backdrop-blur-xl text-white rounded-[32px] p-6 shadow-2xl flex justify-between items-center border border-white/10 ring-1 ring-black/5">
          <div className="flex gap-10 items-center pl-4">
             <div>
               <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Ballot Impact</div>
               <div className="text-2xl font-black text-white tabular-nums">
                  {totalImpactScore.toLocaleString()} <span className="text-orange-500 text-sm italic">pts</span>
               </div>
             </div>
          </div>
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="bg-white text-slate-900 px-8 py-3.5 rounded-2xl font-black text-sm hover:bg-orange-500 hover:text-white transition-all shadow-lg active:scale-95">Scroll to Top</button>
        </div>
      </div>
    </div>
  );
};

export default App;
