
export interface Restaurant {
  id: string;
  name: string;
  category: string;
  address: string;
  rating: number;
  userRatingsTotal: number;
  googleMapsUri: string;
  basePoints: number; // Simulated community points
  sourceUrl?: string; // URL from search grounding
  source?: 'seeded' | 'user-submitted'; // How the restaurant was added
  submittedAt?: number; // Timestamp when user submitted
  googlePlaceType?: string; // Official Google Place Type (e.g. hamburger_restaurant)
}

export interface AuthenticatedVote {
  userId: string;
  userName: string;
  restaurantId: string;
  category: string;
  voteType: 'top' | 'runnerUp';
  timestamp: number;
}

export interface CategoryVote {
  topId: string | null;
  runnerUpId: string | null;
}

export interface UserVoteRecord {
  categoryVotes: Record<string, CategoryVote>; // categoryName -> { topId, runnerUpId }
  overallTopPick: string | null; // restaurantId
}

export interface SearchResult {
  restaurants: Restaurant[];
  categories: string[];
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}
