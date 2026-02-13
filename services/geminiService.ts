import { Restaurant, SearchResult, Coordinates } from "../types";

/**
 * Fetches restaurants via the secure serverless API route.
 * This keeps the Gemini API key safe on the server.
 */
export const fetchRestaurants = async (query: string, location: string, coords?: Coordinates | null): Promise<SearchResult> => {
  try {
    const response = await fetch('/api/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, location, coords }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to fetch restaurants from API');
    }

    return await response.json();
  } catch (error) {
    console.error("Gemini API Proxy Error:", error);
    throw error;
  }
};

/**
 * Result of restaurant candidate search
 */
export interface CandidateResult {
  candidates: Restaurant[];
  error?: string;
}

/**
 * Searches for restaurant candidates matching a name via the secure serverless API route.
 * Returns multiple candidates for the user to choose from.
 */
export const searchCandidates = async (
  restaurantName: string,
  location: string = "Albuquerque, New Mexico"
): Promise<CandidateResult> => {
  try {
    const response = await fetch('/api/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ restaurantName, location }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to search for restaurants via API');
    }

    return await response.json();
  } catch (error) {
    console.error("Candidate Search Error:", error);
    return { candidates: [], error: "Failed to search for restaurants. Please try again." };
  }
};
