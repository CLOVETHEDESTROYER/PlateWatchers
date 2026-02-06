
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchRestaurants } from './services/geminiService';
import { saveRestaurantsBatch, getSavedRestaurants, deleteUserVotes } from './services/restaurantService';
import { Restaurant, UserVoteRecord, SearchResult, Coordinates, CategoryVote } from './types';
import RestaurantCard from './components/RestaurantCard';
import SuggestModal from './components/SuggestModal';
import AllRestaurantsView from './components/AllRestaurantsView';
import { useAuth } from './contexts/AuthContext';
import { db, isConfigured } from './firebase';
import { doc, onSnapshot, setDoc, deleteDoc, increment, collection, query, where, getDocs } from "firebase/firestore";

const App: React.FC = () => {
  const { user, loginWithFacebook, logout, loading: authLoading } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [location, setLocation] = useState('Albuquerque, New Mexico');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SearchResult | null>(null);
  const [globalScores, setGlobalScores] = useState<Record<string, number>>({});
  const [error, setError] = useState<{ message: string; type: 'quota' | 'key' | 'generic' } | null>(null);
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [isGlobalLive, setIsGlobalLive] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [isSeeding, setIsSeeding] = useState(false);
  const [seedingStatus, setSeedingStatus] = useState("");
  const [isSuggestModalOpen, setIsSuggestModalOpen] = useState(false);
  const [view, setView] = useState<'dashboard' | 'list'>('dashboard');

  // Voting state
  const [userVotes, setUserVotes] = useState<UserVoteRecord>(() => {
    const saved = localStorage.getItem('user_votes_v4');
    return saved ? JSON.parse(saved) : { categoryVotes: {}, overallTopPick: null };
  });

  useEffect(() => {
    localStorage.setItem('user_votes_v4', JSON.stringify(userVotes));
  }, [userVotes]);

  // Sync Authenticated Votes from Firestore
  useEffect(() => {
    if (!db || !user) return;

    const vRef = collection(db, "user_votes");
    const q = query(vRef, where("userId", "==", user.uid));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const votes: UserVoteRecord = { categoryVotes: {}, overallTopPick: null };
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.voteType === 'overall') {
          votes.overallTopPick = data.restaurantId;
        } else {
          if (!votes.categoryVotes[data.category]) {
            votes.categoryVotes[data.category] = { topId: null, runnerUpId: null };
          }
          if (data.voteType === 'top') {
            votes.categoryVotes[data.category].topId = data.restaurantId;
          } else if (data.voteType === 'runnerUp') {
            votes.categoryVotes[data.category].runnerUpId = data.restaurantId;
          }
        }
      });
      setUserVotes(votes);
    });

    return unsubscribe;
  }, [user]);

  useEffect(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setCoords({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
        (err) => console.debug("Geolocation disabled", err)
      );
    }
  }, []);

  // Load from Firestore on mount
  useEffect(() => {
    const loadFromDb = async () => {
      if (!isConfigured) return;
      setLoading(true);
      try {
        const saved = await getSavedRestaurants();
        if (saved && saved.length > 0) {
          const cats = new Set<string>();
          saved.forEach(r => cats.add(r.category));
          setData({
            restaurants: saved,
            categories: Array.from(cats).sort()
          });
          console.log("Loaded from Firestore:", saved.length);
        } else {
          console.log("No data in Firestore. Ready to seed.");
        }
      } catch (e) {
        console.error("Failed to load from DB", e);
      } finally {
        setLoading(false);
      }
    };
    loadFromDb();
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
        if (isConfigured) {
          // Save search results to Firestore (this is how manual seeding works!)
          console.log(`Saving ${result.restaurants.length} restaurants from search...`);
          await saveRestaurantsBatch(result.restaurants);
          console.log("Saved! Reloading full database...");

          // Reload ALL restaurants from DB to include previous + new
          const allRestaurants = await getSavedRestaurants();
          const cats = new Set<string>();
          allRestaurants.forEach(r => cats.add(r.category));
          setData({
            restaurants: allRestaurants,
            categories: Array.from(cats).sort()
          });
        } else {
          console.warn("Skipping save: Firebase not configured.");
          setData(result);
        }
      }
    } catch (err: any) {
      setError({ message: "Could not fetch restaurant data.", type: 'generic' });
    } finally {
      setLoading(false);
    }
  }, [searchQuery, location, coords]);

  const handleSeed = async () => {
    setIsSeeding(true);
    setLoading(true);
    // Comprehensive category list for ABQ restaurant seeding
    const categoriesToSeed = [
      "Top Rated Restaurants",
      "New Mexican Food",
      "Best Burgers",
      "Best Pizza",
      "Fine Dining",
      "Coffee Shops",
      "Ice Cream Shops",
      "Breakfast Brunch",
      "Tacos",
      "BBQ"
    ];
    try {
      for (const cat of categoriesToSeed) {
        setSeedingStatus(`Scraping: ${cat}...`);
        console.log("Seeding:", cat);
        const result = await fetchRestaurants(cat, location, coords);
        if (result.restaurants.length > 0 && isConfigured) {
          setSeedingStatus(`Saving ${result.restaurants.length} spots...`);
          await saveRestaurantsBatch(result.restaurants);
        }
      }
      setSeedingStatus("Finalizing...");
      // Final Reload
      const saved = await getSavedRestaurants();
      const cats = new Set<string>();
      saved.forEach(r => cats.add(r.category));
      setData({
        restaurants: saved,
        categories: Array.from(cats).sort()
      });
    } catch (e) {
      console.error("Seeding failed", e);
      setError({ message: "Seeding failed. Check console.", type: 'generic' });
    } finally {
      setIsSeeding(false);
      setLoading(false);
      setSeedingStatus("");
    }
  };

  useEffect(() => {
    // Only search if not loading from DB initially
    // handleSearch(); 
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

  const handleVote = async (id: string, category: string, type: 'top' | 'runnerUp') => {
    if (!user) {
      if (confirm("Please log in with Facebook to cast your vote!")) {
        loginWithFacebook();
      }
      return;
    }

    if (!db) return;

    const voteId = `${user.uid}_${category}_${type}`;
    const voteRef = doc(db, "user_votes", voteId);

    // Check if toggling off
    const current = userVotes.categoryVotes[category];
    const isRemoving = (type === 'top' && current?.topId === id) ||
      (type === 'runnerUp' && current?.runnerUpId === id);

    try {
      if (isRemoving) {
        await deleteDoc(voteRef);
        await syncVoteToFirebase(id, type === 'top' ? -100 : -25);
      } else {
        // If they had a different vote in this slot, we'd need to clear it.
        // But our schema handles this by making document ID unique per user_category_type slot.
        const prevId = type === 'top' ? current?.topId : current?.runnerUpId;
        if (prevId && prevId !== id) {
          await syncVoteToFirebase(prevId, type === 'top' ? -100 : -25);
        }

        // Handle swapping between top/runnerup (ensure they don't have the same place in both)
        const otherType = type === 'top' ? 'runnerUp' : 'top';
        const otherVoteId = `${user.uid}_${category}_${otherType}`;
        const otherRef = doc(db, "user_votes", otherVoteId);
        const otherId = type === 'top' ? current?.runnerUpId : current?.topId;

        if (otherId === id) {
          await deleteDoc(otherRef);
          await syncVoteToFirebase(id, otherType === 'top' ? -100 : -25);
        }

        await setDoc(voteRef, {
          userId: user.uid,
          userName: user.displayName,
          restaurantId: id,
          category,
          voteType: type,
          timestamp: Date.now()
        });
        await syncVoteToFirebase(id, type === 'top' ? 100 : 25);
      }
    } catch (e) {
      console.error("Vote sync failed", e);
    }
  };

  const handleVoteOverall = async (id: string) => {
    if (!user) {
      if (confirm("Please log in with Facebook to cast your vote!")) {
        loginWithFacebook();
      }
      return;
    }

    if (!db) return;

    const voteId = `${user.uid}_overall`;
    const voteRef = doc(db, "user_votes", voteId);
    const isRemoving = userVotes.overallTopPick === id;

    try {
      if (isRemoving) {
        await deleteDoc(voteRef);
        await syncVoteToFirebase(id, -500);
      } else {
        const prevId = userVotes.overallTopPick;
        if (prevId && prevId !== id) {
          await syncVoteToFirebase(prevId, -500);
        }
        await setDoc(voteRef, {
          userId: user.uid,
          userName: user.displayName,
          restaurantId: id,
          voteType: 'overall',
          timestamp: Date.now()
        });
        await syncVoteToFirebase(id, 500);
      }
    } catch (e) {
      console.error("Overall vote sync failed", e);
    }
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
    const query = searchQuery.toLowerCase().trim();

    data.restaurants.forEach(r => {
      // Instant Local Filter
      if (query && !r.name.toLowerCase().includes(query) && !r.category.toLowerCase().includes(query)) {
        return;
      }

      if (!groups[r.category]) groups[r.category] = [];
      groups[r.category].push(r);
    });

    Object.keys(groups).forEach(cat => {
      groups[cat].sort((a, b) => getRestaurantPoints(b) - getRestaurantPoints(a));
    });
    return groups;
  }, [data, userVotes, globalScores, searchQuery]);

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

  // Top 10 restaurants overall for "Best This Week" widget
  const topRestaurants = useMemo(() => {
    if (!data?.restaurants) return [];
    const query = searchQuery.toLowerCase().trim();
    return [...data.restaurants]
      .filter(r => !query || r.name.toLowerCase().includes(query) || r.category.toLowerCase().includes(query))
      .sort((a, b) => getRestaurantPoints(b) - getRestaurantPoints(a))
      .slice(0, 10);
  }, [data, globalScores, userVotes, searchQuery]);

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
                <div className={`w-1.5 h-1.5 rounded-full ${user ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  {user ? `Logged in as ${user.displayName?.split(' ')[0]}` : 'Guest Mode'}
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
            <button
              onClick={() => setIsSuggestModalOpen(true)}
              className="text-xs font-bold text-emerald-600 uppercase hover:underline mr-2"
            >
              + Suggest
            </button>
            {user?.email === 'analoguepro@gmail.com' && (
              <>
                <div className="h-6 w-[1px] bg-slate-200"></div>
                <button onClick={handleSeed} disabled={loading || isSeeding} className="text-xs font-bold text-orange-600 uppercase hover:underline disabled:opacity-50 mx-2">
                  {isSeeding ? 'Hydrating...' : 'Hydrate DB'}
                </button>
              </>
            )}
            <div className="h-6 w-[1px] bg-slate-200"></div>
            <button
              onClick={() => setView(view === 'dashboard' ? 'list' : 'dashboard')}
              className="text-xs font-bold text-slate-500 uppercase hover:text-slate-800 mx-2"
            >
              {view === 'dashboard' ? 'View All' : 'Dashboard'}
            </button>
            <div className="text-center">
              <div className="text-xs font-black text-slate-800">{activeVotesCount}</div>
              <div className="text-[9px] font-bold text-slate-400 uppercase">Votes</div>
            </div>
            <div className="h-6 w-[1px] bg-slate-200"></div>

            {user ? (
              <div className="flex items-center gap-3">
                {user.photoURL && (
                  <img src={user.photoURL} alt="User" className="w-8 h-8 rounded-full border-2 border-orange-100 shadow-sm" />
                )}
                <div className="flex flex-col items-end">
                  <button onClick={logout} className="text-[10px] font-black uppercase text-slate-400 hover:text-orange-600 transition-colors leading-none mb-1">Logout</button>
                  <button
                    onClick={async () => {
                      if (window.confirm("Are you sure you want to delete all your voting data? This cannot be undone.")) {
                        try {
                          await deleteUserVotes(user.uid);
                          await logout();
                          alert("Your data has been deleted and you have been logged out.");
                        } catch (e) {
                          alert("Failed to delete data. Please try again later.");
                        }
                      }
                    }}
                    className="text-[8px] font-bold uppercase text-red-300 hover:text-red-500 transition-colors leading-none"
                  >
                    Delete My Data
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={loginWithFacebook}
                disabled={authLoading}
                className="bg-[#1877F2] text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 hover:bg-[#166fe5] transition-all shadow-md active:scale-95 disabled:opacity-50"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
                Facebook Login
              </button>
            )}
          </div>
        </div>
      </header>

      {view === 'list' && data ? (
        <AllRestaurantsView
          restaurants={data.restaurants}
          onBack={() => setView('dashboard')}
        />
      ) : (
        <main className="max-w-7xl mx-auto px-4 mt-12">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
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

          {/* Best This Week Widget - Compact */}
          {!loading && !error && topRestaurants.length > 0 && (
            <div className="mb-12 bg-white/60 backdrop-blur-md border border-orange-100 rounded-3xl p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></div>
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest">The Best This Week</h3>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {topRestaurants.slice(0, 5).map((r, i) => (
                  <div key={r.id} className="group relative bg-white border border-slate-100 rounded-xl p-3 hover:shadow-md transition-all cursor-default">
                    <div className="absolute -top-3 -left-2 w-6 h-6 bg-slate-900 text-white rounded-lg flex items-center justify-center font-black text-xs shadow-lg transform -rotate-6 z-10">
                      #{i + 1}
                    </div>
                    <div className="text-xs font-bold text-slate-400 uppercase mb-1 truncate">{r.category}</div>
                    <div className="font-black text-slate-800 leading-tight mb-1 truncate" title={r.name}>{r.name}</div>
                    <div className="text-xs font-bold text-orange-600">
                      {(getRestaurantPoints(r) - Number(r.basePoints)).toLocaleString()} <span className="text-[9px] text-orange-400">votes</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center py-40">
              <div className="w-24 h-24 border-8 border-orange-100 border-t-orange-600 rounded-full animate-spin mb-8"></div>
              <p className="text-slate-400 font-black uppercase tracking-[0.3em] text-sm animate-pulse text-center">
                {isSeeding ? seedingStatus : "Finding the best spots..."}
              </p>
            </div>
          ) : error ? (
            <div className="py-20 text-center">
              {/* Error UI */}
              <div className="text-orange-600 font-black text-4xl mb-4">Oops!</div>
              <p className="text-slate-500 font-medium">{error.message}</p>
              <button onClick={() => handleSearch()} className="mt-6 bg-slate-900 text-white px-8 py-3 rounded-xl font-bold">Try Again</button>
            </div>
          ) : Object.keys(groupedRestaurants).length === 0 ? (
            <div className="py-20 text-center">
              <div className="text-slate-300 font-black text-6xl mb-4">No Matches</div>
              <p className="text-slate-500 font-medium mb-8">
                {searchQuery
                  ? `No local results for "${searchQuery}". Try a different term or search online.`
                  : "No restaurants found in the database. Click Hydrate."
                }
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                {searchQuery && (
                  <button onClick={() => handleSearch()} className="bg-orange-600 text-white px-8 py-4 rounded-xl font-black text-lg shadow-xl hover:bg-orange-700 transition-all">Search Online for "{searchQuery}"</button>
                )}
                {user?.email === 'analoguepro@gmail.com' && (
                  <button onClick={handleSeed} className="bg-slate-900 text-white px-8 py-4 rounded-xl font-black text-lg shadow-xl hover:bg-slate-800 transition-all">Hydrate Full Database</button>
                )}
              </div>
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
                          searchTerm={searchQuery}
                        />
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </main>
      )}

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

      {/* Suggest Restaurant Modal */}
      <SuggestModal
        isOpen={isSuggestModalOpen}
        onClose={() => setIsSuggestModalOpen(false)}
        location={location}
        existingRestaurants={data?.restaurants || []}
        onSuccess={(newRestaurant) => {
          // Add the new restaurant to the local state
          setData(prev => {
            if (!prev) {
              return {
                restaurants: [newRestaurant],
                categories: [newRestaurant.category]
              };
            }
            // Check if already exists
            if (prev.restaurants.find(r => r.id === newRestaurant.id)) {
              return prev;
            }
            const newCats = new Set(prev.categories);
            newCats.add(newRestaurant.category);
            return {
              restaurants: [...prev.restaurants, newRestaurant],
              categories: Array.from(newCats).sort()
            };
          });
        }}
      />
    </div>
  );
};

export default App;
