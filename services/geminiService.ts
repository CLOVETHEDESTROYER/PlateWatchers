
import { GoogleGenAI } from "@google/genai";
import { Restaurant, SearchResult, Coordinates } from "../types";

const MAX_RETRIES = 5;
const INITIAL_BACKOFF = 5000; // Increased to 5s for better quota recovery

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

/**
 * Safely converts a string to base64, handling UTF-8 characters.
 */
const safeBtoa = (str: string): string => {
  try {
    const input = String(str || "");
    const byteString = encodeURIComponent(input).replace(/%([0-9A-F]{2})/g, (_, p1) =>
      String.fromCharCode(parseInt(p1, 16))
    );
    return btoa(byteString);
  } catch (e) {
    console.warn("safeBtoa failed for string:", str, e);
    return Math.random().toString(36).substring(2, 15);
  }
};

/**
 * Robustly extracts and cleans JSON from AI response text.
 */
const extractJson = (text: string): any[] => {
  try {
    let cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const firstBracket = cleaned.indexOf('[');
    const lastBracket = cleaned.lastIndexOf(']');
    if (firstBracket === -1 || lastBracket === -1) return [];
    cleaned = cleaned.substring(firstBracket, lastBracket + 1);
    cleaned = cleaned.replace(/`([^`]+)`/g, '"$1"');
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("Failed to parse JSON from AI response:", e, "\nOriginal Text:", text);
    return [];
  }
};

export const fetchRestaurants = async (query: string, location: string, coords?: Coordinates | null): Promise<SearchResult> => {
  let attempt = 0;

  const executeSearch = async (): Promise<SearchResult> => {
    // Re-initialize AI client right before each request to ensure fresh instance
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    try {
      const searchTerm = query.trim() || "the best local food and hidden gems";
      const prompt = `Search for "${searchTerm}" in ${location}. 
      If a specific restaurant name is provided, include it and its top-tier competitors/similar spots in the area.
      Return a diverse mix of at least 25-30 spots.
      
      CRITICAL: For "googlePlaceType", you MUST select ONE from this OFFICIAL Google Places list:
      "american_restaurant", "bakery", "bar", "bar_and_grill", "barbecue_restaurant", 
      "brazilian_restaurant", "breakfast_restaurant", "brunch_restaurant", 
      "cafe", "chinese_restaurant", "coffee_shop", "deli", "dessert_shop", "diner", 
      "donut_shop", "fast_food_restaurant", "fine_dining_restaurant", "hamburger_restaurant", 
      "ice_cream_shop", "indian_restaurant", "italian_restaurant", "japanese_restaurant", 
      "mexican_restaurant", "pizza_restaurant", "seafood_restaurant", "steak_house", 
      "sushi_restaurant", "thai_restaurant", "vegetarian_restaurant", "vietnamese_restaurant".
      
      If none fit perfectly, choose the closest match (e.g. "gastropub" -> "bar_and_grill").

      Output MUST be a RAW JSON array of objects using DOUBLE QUOTES only:
      [{"name": "Official Name", "googlePlaceType": "place_type_from_list", "address": "Full Street Address", "detail": "Short description"}]
      
      DO NOT use backticks for strings. DO NOT include any text outside the JSON array.
      Verify activity and address via Google Search.`;

      // Use gemini-2.5-flash which is the standard model family for Google Maps grounding as per guidelines.
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          tools: [{ googleMaps: {} }, { googleSearch: {} }],
          toolConfig: coords ? {
            retrievalConfig: {
              latLng: {
                latitude: coords.latitude,
                longitude: coords.longitude
              }
            }
          } : undefined
        },
      });

      // Directly access .text property as it's a getter, not a method.
      const text = response.text || "";
      const aiRestaurants = extractJson(text);

      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
      const searchLinks = chunks.filter(c => c.web?.uri).map(c => c.web.uri);
      const mapsChunks = chunks.filter(c => c.maps?.uri);

      // Helper to map Google Place Types to Display Categories
      const mapPlaceTypeToCategory = (type: string): string => {
        const mapping: Record<string, string> = {
          "american_restaurant": "American",
          "bakery": "Bakery",
          "bar": "Bars & Pubs",
          "bar_and_grill": "Bars & Pubs",
          "barbecue_restaurant": "BBQ",
          "brazilian_restaurant": "Brazilian",
          "breakfast_restaurant": "Breakfast & Brunch",
          "brunch_restaurant": "Breakfast & Brunch",
          "cafe": "Cafes",
          "chinese_restaurant": "Chinese",
          "coffee_shop": "Coffee Shops",
          "deli": "Dalis & Sandwiches",
          "dessert_shop": "Dessert",
          "diner": "Diners",
          "donut_shop": "Donuts",
          "fast_food_restaurant": "Fast Food",
          "fine_dining_restaurant": "Fine Dining",
          "hamburger_restaurant": "Burgers",
          "ice_cream_shop": "Ice Cream",
          "indian_restaurant": "Indian",
          "italian_restaurant": "Italian",
          "japanese_restaurant": "Japanese",
          "mexican_restaurant": "Mexican",
          "pizza_restaurant": "Pizza",
          "seafood_restaurant": "Seafood",
          "steak_house": "Steakhouse",
          "sushi_restaurant": "Sushi",
          "thai_restaurant": "Thai",
          "vegetarian_restaurant": "Vegetarian",
          "vietnamese_restaurant": "Vietnamese"
        };
        return mapping[type] || "Restaurants";
      };

      const finalRestaurants: Restaurant[] = [];
      const categoriesSet = new Set<string>();

      aiRestaurants.forEach((res: any, index: number) => {
        const matchedMap = mapsChunks.find(c =>
          c.maps?.title && res.name && (
            c.maps.title.toLowerCase().includes(res.name.toLowerCase()) ||
            res.name.toLowerCase().includes(c.maps.title.toLowerCase())
          )
        );

        const safeName = res.name || "Unknown Spot";
        const mapsUri = matchedMap?.maps?.uri || `https://www.google.com/maps/search/${encodeURIComponent(safeName + " " + location)}`;

        // Create a deterministic ID based on name and location to avoid duplicates
        // We strip non-alphanumeric chars from the base64 to be safe for document IDs
        const idBase = `${safeName}-${location}`.toLowerCase().trim();
        const deterministicId = safeBtoa(idBase).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);

        finalRestaurants.push({
          id: deterministicId,
          name: safeName,
          category: mapPlaceTypeToCategory(res.googlePlaceType || ""),
          googlePlaceType: res.googlePlaceType,
          address: res.address || res.detail || "Albuquerque, NM",
          rating: 4 + (Math.random() * 0.9), // Keep random rating for visual variety or fetch real if available
          userRatingsTotal: Math.floor(Math.random() * 1000) + 100,
          googleMapsUri: mapsUri,
          basePoints: 100, // Fixed baseline as requested
          sourceUrl: searchLinks[index % searchLinks.length] || mapsUri
        });

        categoriesSet.add(mapPlaceTypeToCategory(res.googlePlaceType || ""));
      });

      if (finalRestaurants.length === 0 && mapsChunks.length > 0) {
        mapsChunks.forEach((chunk, index) => {
          const name = chunk.maps.title || "Local Gem";
          const idBase = `${name}-${location}`.toLowerCase().trim();
          const deterministicId = safeBtoa(idBase).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);

          finalRestaurants.push({
            id: deterministicId,
            name: name,
            category: "Restaurants",
            address: "Verified Local Business",
            rating: 4.5,
            userRatingsTotal: 150,
            googleMapsUri: chunk.maps.uri,
            basePoints: 100, // Fixed baseline
            sourceUrl: chunk.maps.uri
          });
          categoriesSet.add("Restaurants");
        });
      }

      return {
        restaurants: finalRestaurants.sort((a, b) => b.basePoints - a.basePoints),
        categories: Array.from(categoriesSet).sort()
      };
    } catch (error: any) {
      const errorMsg = typeof error === 'string' ? error : (error?.message || JSON.stringify(error));
      const status = error?.status || (errorMsg.includes("429") ? 429 : null);

      const isQuota =
        status === 429 ||
        errorMsg.includes("429") ||
        errorMsg.includes("RESOURCE_EXHAUSTED") ||
        errorMsg.toLowerCase().includes("quota");

      const isInternal =
        status === 500 ||
        errorMsg.includes("500") ||
        errorMsg.includes("INTERNAL");

      if ((isQuota || isInternal) && attempt < MAX_RETRIES) {
        attempt++;
        // Aggressive backoff for quota issues
        const backoff = INITIAL_BACKOFF * Math.pow(2, attempt - 1);
        console.warn(`Retryable error (${status}). Attempt ${attempt}/${MAX_RETRIES}. Backing off ${backoff}ms...`);
        await delay(backoff);
        return executeSearch();
      }

      console.error("Gemini Service Error:", error);
      throw error;
    }
  };

  return executeSearch();
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
 * Validates a user-submitted restaurant name against Google Maps.
 * Returns the restaurant data if valid, or an error message if not.
 */
export const validateRestaurant = async (
  restaurantName: string,
  location: string = "Albuquerque, New Mexico"
): Promise<ValidationResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  try {
    const prompt = `Verify if "${restaurantName}" is a REAL, CURRENTLY OPERATING restaurant, cafe, or similar food establishment in ${location}.

CRITICAL REQUIREMENTS:
1. The place MUST have a verified listing on Google Maps. 
2. The place MUST be located in or very near ${location}.
3. The place MUST be open and currently in business.
4. If you find multiple locations, pick the one closest to ${location} city center or the primary location.

If the place is VERIFIED on Google Maps and meets ALL criteria, return this EXACT JSON:
{"valid": true, "name": "Official Name", "googlePlaceType": "place_type_from_list", "address": "Full Street Address", "detail": "Brief description"}

Category MUST be one of these Google Place Types:
"american_restaurant", "bakery", "bar", "bar_and_grill", "barbecue_restaurant", 
"brazilian_restaurant", "breakfast_restaurant", "brunch_restaurant", 
"cafe", "chinese_restaurant", "coffee_shop", "deli", "dessert_shop", "diner", 
"donut_shop", "fast_food_restaurant", "fine_dining_restaurant", "hamburger_restaurant", 
"ice_cream_shop", "indian_restaurant", "italian_restaurant", "japanese_restaurant", 
"mexican_restaurant", "pizza_restaurant", "seafood_restaurant", "steak_house", 
"sushi_restaurant", "thai_restaurant", "vegetarian_restaurant", "vietnamese_restaurant"

If you cannot find an EXACT match on Google Maps, if it's permanently closed, or if it's not a food establishment, return:
{"valid": false, "reason": "Explanation of why it failed (e.g. 'Could not find a Google Maps listing for this name in Albuquerque')"}

DO NOT include any text outside the JSON. Use DOUBLE QUOTES only.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }, { googleSearch: {} }],
      },
    });

    const text = response.text || "";

    // Extract JSON from response
    let cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1) {
      return { valid: false, error: "Could not verify restaurant. Please try again." };
    }
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);

    const result = JSON.parse(cleaned);

    if (!result.valid) {
      return { valid: false, error: result.reason || "Restaurant not found in " + location };
    }

    // Create a deterministic ID
    const idBase = `${result.name}-${location}`.toLowerCase().trim();
    const deterministicId = safeBtoa(idBase).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);

    // Helper to map (reused for validation)
    const mapPlaceTypeToCategory = (type: string): string => {
      const mapping: Record<string, string> = {
        "american_restaurant": "American",
        "bakery": "Bakery",
        "bar": "Bars & Pubs",
        "bar_and_grill": "Bars & Pubs",
        "barbecue_restaurant": "BBQ",
        "brazilian_restaurant": "Brazilian",
        "breakfast_restaurant": "Breakfast & Brunch",
        "brunch_restaurant": "Breakfast & Brunch",
        "cafe": "Cafes",
        "chinese_restaurant": "Chinese",
        "coffee_shop": "Coffee Shops",
        "deli": "Dalis & Sandwiches",
        "dessert_shop": "Dessert",
        "diner": "Diners",
        "donut_shop": "Donuts",
        "fast_food_restaurant": "Fast Food",
        "fine_dining_restaurant": "Fine Dining",
        "hamburger_restaurant": "Burgers",
        "ice_cream_shop": "Ice Cream",
        "indian_restaurant": "Indian",
        "italian_restaurant": "Italian",
        "japanese_restaurant": "Japanese",
        "mexican_restaurant": "Mexican",
        "pizza_restaurant": "Pizza",
        "seafood_restaurant": "Seafood",
        "steak_house": "Steakhouse",
        "sushi_restaurant": "Sushi",
        "thai_restaurant": "Thai",
        "vegetarian_restaurant": "Vegetarian",
        "vietnamese_restaurant": "Vietnamese"
      };
      return mapping[type] || "Restaurants";
    };

    const restaurant: Restaurant = {
      id: deterministicId,
      name: result.name,
      category: mapPlaceTypeToCategory(result.googlePlaceType || "Restaurants"),
      googlePlaceType: result.googlePlaceType,
      address: result.address || result.detail || "Albuquerque, NM",
      rating: 4.5,
      userRatingsTotal: 0,
      googleMapsUri: `https://www.google.com/maps/search/${encodeURIComponent(result.name + " " + location)}`,
      basePoints: 100,
      source: 'user-submitted',
      submittedAt: Date.now(),
    };

    return { valid: true, restaurant };

  } catch (error: any) {
    console.error("Validation error:", error);
    return { valid: false, error: "Failed to validate restaurant. Please try again." };
  }
};
