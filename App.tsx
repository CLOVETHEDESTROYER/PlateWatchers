
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { fetchRestaurants } from './services/geminiService';
import { saveRestaurantsBatch, getSavedRestaurants, deleteUserVotes, approveSuggestion, rejectSuggestion, getPendingSuggestions, deleteRestaurant, updateRestaurantCategory, fixCategoryTypos, wipeAllRestaurants, requestCategoryEdit, getCategoryRequests, resolveCategoryRequest } from './services/restaurantService';
import { Restaurant, UserVoteRecord, SearchResult, Coordinates, CategoryVote, CategoryRequest } from './types';
import RestaurantCard from './components/RestaurantCard';
import SuggestModal from './components/SuggestModal';
import AllRestaurantsView from './components/AllRestaurantsView';
import AdminDashboard from './components/AdminDashboard';
import AdminLoginModal from './components/AdminLoginModal';
import TutorialModal from './components/TutorialModal';
import MobileNav from './components/MobileNav';
import { useAuth } from './contexts/AuthContext';

import { db, isConfigured } from './firebase';
import { doc, onSnapshot, setDoc, deleteDoc, increment, collection, query, where, getDocs } from "firebase/firestore";

const App: React.FC = () => {
  const { user, isAdmin, loginWithFacebook, loginWithGoogle, logout, loading: authLoading, authDebugLog } = useAuth();
  const [showDebug, setShowDebug] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [location] = useState('Albuquerque, New Mexico');

  const [errorLog, setErrorLog] = useState<string[]>([]);

  useEffect(() => {
    const onError = (e: ErrorEvent) => setErrorLog(p => [...p.slice(-49), `🛑 ${e.message}`]);
    const onRejection = (e: PromiseRejectionEvent) => setErrorLog(p => [...p.slice(-49), `⚠️ ${e.reason}`]);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);
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
  const [isLoginPromptOpen, setIsLoginPromptOpen] = useState(false);
  const [isAdminLoginOpen, setIsAdminLoginOpen] = useState(false);
  const [view, setView] = useState<'dashboard' | 'list' | 'admin'>('dashboard');
  const [pendingSuggestions, setPendingSuggestions] = useState<Restaurant[]>([]);
  const [categoryRequests, setCategoryRequests] = useState<CategoryRequest[]>([]);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [isEditRequestOpen, setIsEditRequestOpen] = useState(false);
  const [editRequestRestaurant, setEditRequestRestaurant] = useState<Restaurant | null>(null);

  // Auth gate for suggesting: require login first
  const handleSuggestClick = useCallback(() => {
    if (!user) {
      setIsLoginPromptOpen(true);
      return;
    }
    setIsSuggestModalOpen(true);
  }, [user]);

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
        // One-time fix: correct any category typos from old AI data
        await fixCategoryTypos();
        if (saved && saved.length > 0) {
          const cats = new Set<string>();
          saved.forEach(r => cats.add(r.category));
          setData({
            restaurants: saved,
            categories: Array.from(cats).sort()
          });

        } else {

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

          await saveRestaurantsBatch(result.restaurants);


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
    if (!window.confirm("⚠️ This will WIPE all existing restaurants and re-seed from Google Places API.\n\nAll votes will be reset. Continue?")) {
      return;
    }
    setIsSeeding(true);
    setLoading(true);

    // Comprehensive Google Places search queries for ABQ
    const categoriesToSeed = [
      "Best restaurants",
      "Mexican food",
      "New Mexican food",
      "Burgers",
      "Pizza",
      "BBQ barbecue",
      "Breakfast brunch",
      "Coffee shops cafes",
      "Tacos",
      "Ice cream frozen treats",
      "Sushi Japanese",
      "Chinese food",
      "Thai food",
      "Italian restaurants",
      "Seafood",
      "Steakhouse",
      "Sandwich shops delis",
      "Fine dining"
    ];

    try {
      // Step 1: Wipe old AI-generated data
      setSeedingStatus("Wiping old data...");
      await wipeAllRestaurants();

      // Step 2: Seed from Google Places API
      let totalAdded = 0;
      for (let i = 0; i < categoriesToSeed.length; i++) {
        const cat = categoriesToSeed[i];
        setSeedingStatus(`[${i + 1}/${categoriesToSeed.length}] Searching: ${cat}...`);

        try {
          const response = await fetch('/api/hydrate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ category: cat, location })
          });

          if (response.ok) {
            const result = await response.json();
            if (result.restaurants?.length > 0 && isConfigured) {
              setSeedingStatus(`Saving ${result.restaurants.length} ${cat} spots...`);
              await saveRestaurantsBatch(result.restaurants);
              totalAdded += result.restaurants.length;
            }
          }
        } catch (catError) {
          // Continue with next category if one fails
        }
      }

      setSeedingStatus(`✅ Done! Added ${totalAdded} restaurants. Loading...`);

      // Step 3: Reload everything
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
      loginWithFacebook();
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
      loginWithFacebook();
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
    return Number(restaurant.basePoints) + global;
  };

  const groupedRestaurants = useMemo(() => {
    if (!data) return {};
    const groups: Record<string, Restaurant[]> = {};
    const query = searchQuery.toLowerCase().trim();
    const terms = query.split(/\s+/).filter(t => t.length > 0);

    data.restaurants.forEach(r => {
      // Instant Local Filter
      if (terms.length > 0) {
        const searchable = `${r.name} ${r.category} ${r.googlePlaceType || ''} ${r.address}`.toLowerCase();
        // Check if ALL search terms are present in the searchable string (AND logic)
        const matches = terms.every(term => searchable.includes(term));
        if (!matches) return;
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
    return [...data.restaurants]
      .sort((a, b) => getRestaurantPoints(b) - getRestaurantPoints(a))
      .slice(0, 10);
  }, [data, userVotes, globalScores]);

  const fetchSuggestions = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const suggestions = await getPendingSuggestions();
      setPendingSuggestions(suggestions);
    } catch (e) {
      console.error("Failed to fetch suggestions", e);
    }
  }, [isAdmin]);

  const fetchCategoryRequestsData = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const reqs = await getCategoryRequests();
      setCategoryRequests(reqs as CategoryRequest[]);
    } catch (e) {
      console.error("Failed to fetch category requests", e);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (view === 'admin') {
      fetchSuggestions();
      fetchCategoryRequestsData();
    }
  }, [view, fetchSuggestions, fetchCategoryRequestsData]);

  const handleApproveSuggestion = async (restaurant: Restaurant) => {
    setLoading(true);
    try {
      await approveSuggestion(restaurant);
      await fetchSuggestions();
      // Refresh main data
      const saved = await getSavedRestaurants();
      const cats = new Set<string>();
      saved.forEach(r => cats.add(r.category));
      setData({
        restaurants: saved,
        categories: Array.from(cats).sort()
      });
    } catch (e) {
      console.error("Approval failed", e);
    } finally {
      setLoading(false);
    }
  };

  const handleRejectSuggestion = async (id: string) => {
    try {
      await rejectSuggestion(id);
      await fetchSuggestions();
    } catch (e) {
      console.error("Rejection failed", e);
    }
  };

  const handleResolveRequest = async (req: CategoryRequest, approve: boolean) => {
    setLoading(true);
    try {
      await resolveCategoryRequest(req.id, approve, req.restaurantId, req.requestedCategory, req.currentCategory);
      await fetchCategoryRequestsData();
      if (approve) {
        // Refresh main data because a category changed
        const saved = await getSavedRestaurants();
        const cats = new Set<string>();
        saved.forEach(r => cats.add(r.category));
        setData({
          restaurants: saved,
          categories: Array.from(cats).sort()
        });
      }
    } catch (e) {
      console.error("Failed to resolve request", e);
    } finally {
      setLoading(false);
    }
  };

  const handleCleanup = async () => {
    if (!data) return;
    setLoading(true);

    // Valid ABQ zip codes
    const ABQ_ZIPS = new Set([
      '87101', '87102', '87103', '87104', '87105', '87106', '87107', '87108', '87109', '87110',
      '87111', '87112', '87113', '87114', '87116', '87117', '87119', '87120', '87121', '87122',
      '87123', '87124', '87125', '87131', '87153', '87154', '87158', '87176', '87181', '87187',
      '87190', '87191', '87192', '87193', '87194', '87195', '87196', '87197', '87198', '87199'
    ]);

    // ABQ bounding box
    const ABQ_BOUNDS = { north: 35.22, south: 34.94, west: -106.82, east: -106.47 };

    const isInABQ = (r: typeof data.restaurants[0]): boolean => {
      // Check coordinates
      if (r.latitude && r.longitude) {
        if (r.latitude >= ABQ_BOUNDS.south && r.latitude <= ABQ_BOUNDS.north &&
          r.longitude >= ABQ_BOUNDS.west && r.longitude <= ABQ_BOUNDS.east) {
          return true;
        }
      }
      // Check address text
      const addr = (r.address || '').toLowerCase();
      if (addr.includes('albuquerque') || addr.includes('abq')) return true;
      // Check zip code
      const zipMatch = addr.match(/\b(\d{5})\b/);
      if (zipMatch && ABQ_ZIPS.has(zipMatch[1])) return true;
      return false;
    };

    try {
      const toDelete = data.restaurants.filter(r => !isInABQ(r));

      if (toDelete.length === 0) {
        alert("Database is already clean! All restaurants are in Albuquerque.");
        return;
      }

      if (confirm(`Found ${toDelete.length} restaurants not in ABQ. Delete them?\n\nExamples:\n${toDelete.slice(0, 5).map(r => `• ${r.name} (${r.address})`).join('\n')}`)) {
        for (const r of toDelete) {
          await deleteRestaurant(r.id);
        }
        const saved = await getSavedRestaurants();
        const cats = new Set<string>();
        saved.forEach(r => cats.add(r.category));
        setData({
          restaurants: saved,
          categories: Array.from(cats).sort()
        });
        alert(`Cleaned up ${toDelete.length} entries.`);
      }
    } catch (e) {
      console.error("Cleanup failed", e);
    } finally {
      setLoading(false);
    }
  };

  const handleEditRequestClick = (r: Restaurant) => {
    if (!user) {
      setIsLoginPromptOpen(true);
      return;
    }
    setEditRequestRestaurant(r);
    setIsEditRequestOpen(true);
  };

  const submitEditRequest = async (newCategory: string) => {
    if (!editRequestRestaurant || !user) return;
    setLoading(true);
    try {
      await requestCategoryEdit(editRequestRestaurant, newCategory, user);
      setIsEditRequestOpen(false);
      setEditRequestRestaurant(null);
      alert("Request submitted! An admin will review your suggestion.");
    } catch (e) {
      console.error("Failed to submit request", e);
      alert("Failed to submit request. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans select-none relative">
      <div className="bg-mesh" />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 bg-white/70 backdrop-blur-2xl z-50 border-b border-slate-100/50">
        <div className="max-w-7xl mx-auto px-3 py-2.5 sm:px-6 sm:py-4">
          <div className="flex items-center justify-between gap-2 sm:gap-6">
            <div className="flex items-center gap-3 sm:gap-8 shrink-0">
              <h1 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight cursor-pointer font-display" onClick={() => { setView('dashboard'); setSelectedCategories([]); setSearchQuery(''); }}>
                PLATE<span className="text-orange-600">WATCHERS</span>
              </h1>

              <div className="hidden md:flex bg-slate-100/80 p-1 rounded-2xl">
                <button
                  onClick={() => setView('dashboard')}
                  className={`px-6 py-2 rounded-xl text-sm font-black uppercase tracking-widest transition-all ${view === 'dashboard' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  Leaderboards
                </button>
                <button
                  onClick={() => setView('list')}
                  className={`px-6 py-2 rounded-xl text-sm font-black uppercase tracking-widest transition-all ${view === 'list' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  All Spots
                </button>
              </div>
            </div>


            <div className="flex items-center gap-1.5 sm:gap-4">
              {/* Albuquerque Badge - desktop only */}
              <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-orange-50 border border-orange-100 rounded-lg text-orange-600 font-bold text-[10px] uppercase tracking-wider">
                <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse"></span>
                ABQ Only
              </div>

              <button
                onClick={() => setIsTutorialOpen(true)}
                className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold text-[10px] uppercase tracking-wider rounded-lg transition-colors"
                title="How it works"
              >
                ❓ How it works
              </button>

              {isAdmin && (
                <button
                  onClick={() => setView('admin')}
                  className={`hidden md:block p-2 rounded-xl transition-all ${view === 'admin' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                  title="Admin Console"
                >
                  ⚙️
                </button>
              )}

              {/* + Suggest - hidden on mobile (FAB handles it) */}
              <button
                onClick={handleSuggestClick}
                className="hidden md:block bg-orange-600 text-white px-3 py-2 sm:px-5 sm:py-2.5 rounded-xl font-black text-[10px] sm:text-xs uppercase tracking-widest hover:bg-orange-700 transition-all shadow-lg active:scale-95"
              >
                + Suggest
              </button>

              <div className="w-[1px] h-6 bg-slate-200 ml-1 sm:ml-2 hidden md:block"></div>

              {user ? (
                <div className="flex items-center gap-3">
                  <div className="text-right hidden sm:block">
                    <div className="text-xs font-black text-slate-900 leading-tight">{user.displayName}</div>
                    <button onClick={logout} className="text-[9px] font-bold text-slate-400 hover:text-orange-600 uppercase tracking-widest transition-colors">Sign Out</button>
                  </div>
                  {user.photoURL && <img src={user.photoURL} alt="" className="w-8 h-8 sm:w-9 sm:h-9 rounded-full border-2 border-white shadow-md" />}
                  {/* Mobile sign-out (no photo) */}
                  {!user.photoURL && <button onClick={logout} className="sm:hidden text-[9px] font-bold text-slate-400 uppercase">Out</button>}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 sm:gap-3">
                  <button
                    onClick={loginWithFacebook}
                    disabled={authLoading}
                    className="flex items-center gap-1.5 bg-[#1877F2] text-white px-2.5 py-1.5 sm:px-4 sm:py-2 rounded-lg sm:rounded-xl font-bold text-[10px] sm:text-xs hover:opacity-90 transition-all whitespace-nowrap"
                  >
                    📘 <span className="hidden sm:inline">Login with Facebook</span>
                    <span className="sm:hidden">Sign In</span>
                  </button>
                  <button
                    onClick={() => setIsAdminLoginOpen(true)}
                    className="hidden sm:block p-2 text-slate-400 hover:text-slate-900 transition-colors"
                    title="Staff Login"
                  >
                    🔑
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Search Bar - Below Header */}
      {view !== 'admin' && (
        <div className="fixed top-[52px] sm:top-[72px] left-0 right-0 bg-white/70 backdrop-blur-2xl z-40 border-b border-slate-100/50 px-3 sm:px-6 py-2.5 sm:py-3 transition-all duration-300">
          <div className="max-w-7xl mx-auto flex items-center gap-4">
            <form onSubmit={(e) => { e.preventDefault(); handleSearch(); }} className="relative flex-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search BBQ, Pizza, Burgers..."
                className="w-full pl-11 pr-4 py-2 bg-slate-100/80 border-transparent rounded-2xl focus:bg-white focus:ring-4 focus:ring-orange-100 focus:border-orange-400 outline-none transition-all font-medium text-sm"
              />
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-base">🔍</span>
            </form>
            <button
              onClick={handleSuggestClick}
              className="whitespace-nowrap px-4 py-2 bg-orange-50 text-orange-600 text-xs font-bold rounded-xl hover:bg-orange-100 transition-colors hidden sm:block"
            >
              + Suggest New
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className={`transition-all duration-300 ${view === 'admin' ? 'pt-20' : 'pt-32 sm:pt-40'} pb-32`}>

        {view === 'list' ? (
          <AllRestaurantsView
            restaurants={data?.restaurants || []}
            onBack={() => setView('dashboard')}
            onSuggest={() => setIsSuggestModalOpen(true)}
          />
        ) : view === 'admin' ? (
          <AdminDashboard
            onBack={() => setView('dashboard')}
            restaurants={data?.restaurants || []}
            onSeed={handleSeed}
            onCleanup={handleCleanup}
            onApprove={handleApproveSuggestion}
            onReject={handleRejectSuggestion}
            onRecategorize={async (id, newCat, oldCat) => {
              await updateRestaurantCategory(id, newCat, oldCat);
              // Refresh
              const saved = await getSavedRestaurants();
              const cats = new Set<string>();
              saved.forEach(r => cats.add(r.category));
              setData({ restaurants: saved, categories: Array.from(cats).sort() });
            }}
            suggestions={pendingSuggestions}
            isSeeding={isSeeding}
            seedingStatus={seedingStatus}
            loading={loading}
            categoryRequests={categoryRequests}
            onResolveRequest={handleResolveRequest}
          />
        ) : (
          <main className="max-w-7xl mx-auto px-4 mt-6 sm:px-6 sm:mt-16">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 sm:gap-10 mb-8 sm:mb-16">
              <div className="max-w-3xl">
                <h2 className="text-4xl sm:text-5xl md:text-7xl font-black text-slate-900 tracking-tight mb-3 sm:mb-6 leading-[0.9] font-display">
                  {isGlobalLive ? 'Community' : 'Your Personal'} <br />
                  <span className="text-orange-600 italic">Rankings</span>
                </h2>
                <p className="text-slate-500 text-base sm:text-xl font-medium max-w-xl">
                  {isGlobalLive
                    ? `Real-time shared leaderboard for the best of Albuquerque.`
                    : `Ranking the best local gems in Albuquerque. Set up Firebase for global sync.`}
                </p>
              </div>

              {/* Mobile Search removed - using fixed search bar instead */}
            </div>

            {/* Best This Week Widget - Moved Above Categories */}
            {!loading && !error && topRestaurants.length > 0 && searchQuery === "" && selectedCategories.length === 0 && (
              <div className="mb-8 sm:mb-16 bg-white/60 backdrop-blur-md border border-orange-100 rounded-2xl sm:rounded-[32px] p-4 sm:p-8 shadow-sm">
                <div className="flex items-center gap-2 mb-6">
                  <div className="w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse"></div>
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">The Best This Week</h3>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 sm:gap-6">
                  {topRestaurants.slice(0, 5).map((r, i) => (
                    <div key={r.id} className="group relative bg-white border border-slate-100 rounded-2xl p-4 hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer">
                      <div className="absolute -top-3 -left-2 w-8 h-8 bg-slate-900 text-white rounded-xl flex items-center justify-center font-black text-sm shadow-lg transform -rotate-12 z-10 group-hover:rotate-0 transition-transform">
                        #{i + 1}
                      </div>
                      <div className="text-[10px] font-black text-orange-600 uppercase mb-1 tracking-wider">{r.category}</div>
                      <div className="font-black text-slate-800 leading-tight mb-2 line-clamp-2" title={r.name}>{r.name}</div>
                      <div className="flex items-center justify-between mt-auto">
                        <div className="text-xs font-black text-slate-400 uppercase">
                          {(getRestaurantPoints(r) - Number(r.basePoints)).toLocaleString()} <span className="text-[9px] opacity-60">pts</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Category Pills - Moved Below Widget */}
            {data && data.categories.length > 0 && (
              <div className="flex gap-2 mb-6 sm:mb-12 overflow-x-auto pb-2 sm:flex-wrap sm:overflow-visible scrollbar-hide">
                <button
                  onClick={() => setSelectedCategories([])}
                  className={`px-3 py-2 sm:px-5 sm:py-2.5 rounded-full text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap shrink-0 ${selectedCategories.length === 0 ? 'bg-orange-600 text-white shadow-lg scale-105' : 'bg-white text-slate-500 border border-slate-100 hover:border-orange-200 hover:text-orange-600'}`}
                >
                  All Categories
                </button>
                {data.categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => {
                      if (selectedCategories.includes(cat)) {
                        setSelectedCategories(prev => prev.filter(c => c !== cat));
                      } else {
                        setSelectedCategories(prev => [...prev, cat]);
                      }
                    }}
                    className={`px-3 py-2 sm:px-5 sm:py-2.5 rounded-full text-[10px] sm:text-xs font-black uppercase tracking-widest transition-all whitespace-nowrap shrink-0 ${selectedCategories.includes(cat) ? 'bg-slate-900 text-white shadow-lg' : 'bg-white text-slate-500 border border-slate-100 hover:border-slate-300 hover:text-slate-900'}`}
                  >
                    {cat}
                  </button>
                ))}
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
                <div className="text-orange-600 font-black text-4xl mb-4 text-gradient">Oops!</div>
                <p className="text-slate-500 font-medium">{error.message}</p>
                <button onClick={() => handleSearch()} className="mt-6 bg-slate-900 text-white px-8 py-3 rounded-xl font-bold hover:bg-orange-600 transition-all">Try Again</button>
              </div>
            ) : Object.keys(groupedRestaurants).length === 0 ? (
              <div className="py-20 text-center">
                <div className="text-slate-300 font-black text-6xl mb-4">No Matches</div>
                <p className="text-slate-500 font-medium mb-8">
                  {searchQuery
                    ? `No local results for "${searchQuery}". Try a different term or suggest it!`
                    : "No restaurants found in the database."
                  }
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  {searchQuery && (
                    <button onClick={handleSuggestClick} className="bg-orange-600 text-white px-8 py-4 rounded-xl font-black text-lg shadow-xl hover:bg-orange-700 transition-all active:scale-95">Suggest "{searchQuery}"</button>
                  )}
                  {isAdmin && (
                    <button onClick={() => setView('admin')} className="bg-slate-900 text-white px-8 py-4 rounded-xl font-black text-lg shadow-xl hover:bg-slate-800 transition-all active:scale-95">Go to Admin Console</button>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-12 sm:space-y-24">
                {filteredCategoryKeys.map(category => (
                  <section key={category}>
                    <div className="flex items-baseline gap-3 sm:gap-4 mb-4 sm:mb-10">
                      <h3 className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-900 tracking-tighter">{category}</h3>
                      <div className="h-[2px] flex-1 bg-slate-100 rounded-full"></div>
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{groupedRestaurants[category].length} Spots</span>
                    </div>

                    {/* Category Top 5 Widget */}
                    {groupedRestaurants[category].length >= 3 && (
                      <div className="mb-6 sm:mb-12 bg-white/40 backdrop-blur-sm border border-slate-100 rounded-2xl sm:rounded-[24px] p-3 sm:p-6 shadow-sm">
                        <div className="flex items-center gap-2 mb-6">
                          <div className="w-2 h-2 rounded-full bg-slate-400"></div>
                          <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{category} Leaderboard</h3>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 sm:gap-4">
                          {groupedRestaurants[category].slice(0, 5).map((r, i) => (
                            <div key={r.id} className="group relative bg-white border border-slate-50 p-3 rounded-xl hover:shadow-md transition-all cursor-pointer">
                              <div className="absolute -top-2 -left-2 w-6 h-6 bg-slate-900 text-white rounded-lg flex items-center justify-center font-black text-[10px] shadow-md z-10">
                                #{i + 1}
                              </div>
                              <div className="font-black text-slate-800 text-xs leading-tight mb-1 line-clamp-1">{r.name}</div>
                              <div className="text-[9px] font-black text-orange-600 uppercase tracking-wider">
                                {getRestaurantPoints(r).toLocaleString()} <span className="opacity-60">pts</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-10">
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
                            onRequestEdit={handleEditRequestClick}
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
      </div>

      <div className="fixed bottom-4 sm:bottom-8 left-1/2 -translate-x-1/2 z-40 w-full max-w-3xl px-3 sm:px-6">
        <div className="bg-slate-900/90 backdrop-blur-xl text-white rounded-2xl sm:rounded-[32px] px-4 py-3 sm:p-6 shadow-2xl flex justify-between items-center border border-white/10 ring-1 ring-black/5">
          <div className="flex gap-4 sm:gap-10 items-center sm:pl-4">
            <div>
              <div className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-widest mb-0.5 sm:mb-1">Ballot Impact</div>
              <div className="text-lg sm:text-2xl font-black text-white tabular-nums">
                {totalImpactScore.toLocaleString()} <span className="text-orange-500 text-xs sm:text-sm italic">pts</span>
              </div>
            </div>
            <button
              onClick={() => setIsTutorialOpen(true)}
              className="md:hidden text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-orange-400 transition-colors"
            >
              ❓ How it works
            </button>
          </div>
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="bg-white text-slate-900 px-4 py-2.5 sm:px-8 sm:py-3.5 rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm hover:bg-orange-500 hover:text-white transition-all shadow-lg active:scale-95">Top ↑</button>
        </div>
      </div>

      {/* Mobile Navigation */}
      <MobileNav
        currentView={view}
        setView={setView}
        isAdmin={isAdmin}
        onAdminLogin={() => setIsAdminLoginOpen(true)}
      />

      {/* Floating Action Button for Mobile Suggest */}
      <button
        onClick={handleSuggestClick}
        className="sm:hidden fixed bottom-24 right-6 w-14 h-14 bg-orange-600 text-white rounded-full shadow-2xl flex items-center justify-center text-2xl z-40 active:scale-95 transition-transform"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      >
        +
      </button>

      {/* TEMPORARY: Auth Debug Panel - remove after fixing mobile auth */}
      {isAdmin && (
        <div className="fixed bottom-0 left-0 right-0 z-[9999]" style={{ marginBottom: 'env(safe-area-inset-bottom)' }}>
          <button
            onClick={() => setShowDebug(!showDebug)}
            className="absolute bottom-20 left-2 w-8 h-8 bg-red-600 text-white rounded-full text-xs font-bold shadow-lg z-50 flex items-center justify-center"
          >
            🐛
          </button>
          {showDebug && (
            <div className="bg-black/95 text-green-400 text-[10px] font-mono p-3 max-h-[50vh] overflow-y-auto border-t-2 border-red-500">
              <div className="flex justify-between items-center mb-2">
                <span className="text-red-400 font-bold">DEBUG LOG</span>
                <span className="text-yellow-400">user={user ? '✅' : '❌'} mobile={/iPhone|Android/i.test(navigator.userAgent) ? 'Y' : 'N'}</span>
              </div>

              {/* Errors */}
              {errorLog.length > 0 && (
                <div className="mb-2 border-b border-red-900 pb-2">
                  <div className="text-red-500 font-bold mb-1">ERRORS:</div>
                  {errorLog.map((err, i) => (
                    <div key={`err-${i}`} className="text-red-300 py-0.5">{err}</div>
                  ))}
                </div>
              )}

              {authDebugLog.length === 0 ? (
                <div className="text-gray-500">No auth events yet...</div>
              ) : (
                authDebugLog.map((log, i) => (
                  <div key={i} className="py-0.5 border-b border-gray-800">{log}</div>
                ))
              )}
            </div>
          )}
        </div>
      )}
      {/* Login Prompt Modal (shown when non-logged-in user tries to Suggest) */}
      {isLoginPromptOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setIsLoginPromptOpen(false)}>
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-2xl font-black text-slate-800 mb-2">Sign In to Suggest</h2>
            <p className="text-slate-500 text-sm mb-6">You need to sign in before suggesting a restaurant. This helps us keep the community trustworthy.</p>
            <div className="space-y-3">
              <button
                onClick={async () => {
                  try {
                    await loginWithFacebook();
                    setIsLoginPromptOpen(false);
                    setIsSuggestModalOpen(true);
                  } catch { }
                }}
                className="w-full py-3 bg-[#1877F2] text-white rounded-xl font-bold text-sm hover:bg-[#166FE5] transition-colors flex items-center justify-center gap-2"
              >
                <span>📘</span> Continue with Facebook
              </button>
            </div>
            <button
              onClick={() => setIsLoginPromptOpen(false)}
              className="w-full mt-4 py-2 text-slate-400 text-sm font-medium hover:text-slate-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Admin Login Modal */}
      <AdminLoginModal
        isOpen={isAdminLoginOpen}
        onClose={() => setIsAdminLoginOpen(false)}
      />


      {/* Suggest Restaurant Modal */}
      <SuggestModal
        isOpen={isSuggestModalOpen}
        onClose={() => setIsSuggestModalOpen(false)}
        location={location}
        existingRestaurants={data?.restaurants || []}
        isAdmin={isAdmin}
        onSuccess={() => {

          // Success is handled by the "Shared" message in the modal
        }}
      />

      {/* Tutorial Modal */}
      <TutorialModal
        isOpen={isTutorialOpen}
        onClose={() => setIsTutorialOpen(false)}
      />
      {/* Category Edit Request Modal */}
      {isEditRequestOpen && editRequestRestaurant && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl skew-y-0 transform transition-all">
            <h3 className="text-2xl font-black text-slate-900 mb-2">Suggest Edit</h3>
            <p className="text-slate-500 mb-6 font-medium">
              Is <span className="font-bold text-slate-800">{editRequestRestaurant.name}</span> in the wrong category?
            </p>

            <div className="space-y-3 mb-8 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
              {data?.categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => submitEditRequest(cat)}
                  className={`w-full text-left px-4 py-3 rounded-xl font-bold transition-all flex items-center justify-between ${editRequestRestaurant.category === cat
                    ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    : 'bg-white border-2 border-slate-100 text-slate-600 hover:border-orange-200 hover:text-orange-600 hover:bg-orange-50'
                    }`}
                  disabled={editRequestRestaurant.category === cat}
                >
                  {cat}
                  {editRequestRestaurant.category === cat && <span className="text-xs uppercase tracking-widest">Current</span>}
                </button>
              ))}
            </div>

            <button
              onClick={() => { setIsEditRequestOpen(false); setEditRequestRestaurant(null); }}
              className="w-full py-4 text-slate-400 font-black uppercase tracking-widest hover:text-slate-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

    </div>
  );
};

export default App;
