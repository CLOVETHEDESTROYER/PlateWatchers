
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
