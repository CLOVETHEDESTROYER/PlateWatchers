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
 * Result of restaurant validation
 */
export interface ValidationResult {
  valid: boolean;
  restaurant?: Restaurant;
  error?: string;
}

/**
 * Validates a user-submitted restaurant name via the secure serverless API route.
 */
export const validateRestaurant = async (
  restaurantName: string,
  location: string = "Albuquerque, New Mexico"
): Promise<ValidationResult> => {
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
      throw new Error(errorData.error || 'Failed to validate restaurant via API');
    }

    return await response.json();
  } catch (error) {
    console.error("Gemini Validation Proxy Error:", error);
    return { valid: false, error: "Failed to validate restaurant. Please try again." };
  }
};
