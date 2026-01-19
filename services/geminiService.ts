
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
      
      CRITICAL: Categorize EVERY spot into one of: 
      "Restaurants", "New Mexican", "Mexican", "Pizza", "Burgers", "BBQ", "Breakfast & Brunch", "Breweries", "Fine Dining", "Coffee", "Food Trucks", "Tacos".
      
      Output MUST be a RAW JSON array of objects using DOUBLE QUOTES only:
      [{"name": "Name", "category": "Category", "detail": "Short description"}]
      
      DO NOT use backticks for strings. DO NOT include any text outside the JSON array.
      Verify activity via Google Search.`;

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
        
        finalRestaurants.push({
          id: safeBtoa(`${safeName}-${index}-${location}`).slice(0, 16),
          name: safeName,
          category: res.category || "Restaurants",
          address: res.detail || "Duke City Favorite", 
          rating: 4 + (Math.random() * 0.9),
          userRatingsTotal: Math.floor(Math.random() * 1000) + 100,
          googleMapsUri: mapsUri,
          basePoints: Math.floor(Math.random() * 3000) + 500,
          sourceUrl: searchLinks[index % searchLinks.length] || mapsUri
        });
        
        categoriesSet.add(res.category || "Restaurants");
      });

      if (finalRestaurants.length === 0 && mapsChunks.length > 0) {
          mapsChunks.forEach((chunk, index) => {
              const name = chunk.maps.title || "Local Gem";
              finalRestaurants.push({
                  id: safeBtoa(`fallback-${name}-${index}`).slice(0, 16),
                  name: name,
                  category: "Restaurants",
                  address: "Verified Local Business",
                  rating: 4.5,
                  userRatingsTotal: 150,
                  googleMapsUri: chunk.maps.uri,
                  basePoints: 1000,
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
