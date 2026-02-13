import { GoogleGenerativeAI } from "@google/generative-ai";

const MAX_RETRIES = 5;
const INITIAL_BACKOFF = 5000;

// Albuquerque bounding box (generous to include edges of metro)
const ABQ_BOUNDS = {
    north: 35.22,
    south: 34.94,
    west: -106.82,
    east: -106.47
};

// Valid Albuquerque zip codes
const ABQ_ZIPS = new Set([
    '87101', '87102', '87103', '87104', '87105', '87106', '87107', '87108', '87109', '87110',
    '87111', '87112', '87113', '87114', '87116', '87117', '87119', '87120', '87121', '87122',
    '87123', '87124', '87125', '87131', '87153', '87154', '87158', '87176', '87181', '87187',
    '87190', '87191', '87192', '87193', '87194', '87195', '87196', '87197', '87198', '87199'
]);

const isInABQ = (lat?: number, lng?: number, address?: string): boolean => {
    // Check 1: Coordinates within bounding box (most reliable)
    if (lat && lng) {
        if (lat >= ABQ_BOUNDS.south && lat <= ABQ_BOUNDS.north &&
            lng >= ABQ_BOUNDS.west && lng <= ABQ_BOUNDS.east) {
            return true;
        }
    }
    // Check 2: Address contains "albuquerque" or "abq"
    const addr = (address || '').toLowerCase();
    if (addr.includes('albuquerque') || addr.includes('abq')) return true;
    // Check 3: Valid ABQ zip code in address
    const zipMatch = addr.match(/\b(\d{5})\b/);
    if (zipMatch && ABQ_ZIPS.has(zipMatch[1])) return true;
    return false;
};

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

const safeBtoa = (str: string): string => {
    try {
        const input = String(str || "");
        const byteString = encodeURIComponent(input).replace(/%([0-9A-F]{2})/g, (_, p1) =>
            String.fromCharCode(parseInt(p1, 16))
        );
        return btoa(byteString);
    } catch (e) {
        return Math.random().toString(36).substring(2, 15);
    }
};

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
        return [];
    }
};

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
        "deli": "Delis & Sandwiches",
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

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { query, location, coords } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        console.error("❌ GEMINI_API_KEY is missing.");
        return res.status(500).json({ error: 'GEMINI_API_KEY not configured in Vercel settings.' });
    }

    console.log(`🔑 Key check: ${apiKey.substring(0, 4)}... (Total length: ${apiKey.length})`);

    const genAI = new GoogleGenerativeAI(apiKey);
    let attempt = 0;

    const executeSearch = async (): Promise<any> => {
        try {
            const searchTerm = query?.trim() || "the best local food and hidden gems";
            console.log(`🔍 AI Search Attempt ${attempt + 1}: "${searchTerm}" in "${location}"`);

            const prompt = `Search for "${searchTerm}" in ${location}.
      CRITICAL RULES:
      1. ONLY include restaurants physically located in Albuquerque, New Mexico.
      2. Do NOT include places in Santa Fe, Rio Rancho, Bernalillo, Los Lunas, or other nearby towns.
      3. Do NOT include restaurants that are PERMANENTLY CLOSED on Google Maps.
      4. Restaurants that are simply closed for the evening or have limited hours ARE STILL VALID. Do NOT exclude a restaurant just because it is outside its current business hours.
      5. Return a diverse mix of at least 25-30 spots.
      6. Use the EXACT address as listed on Google Maps for each restaurant. Do NOT guess or approximate addresses.

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
        [{ "name": "Official Google Maps Name", "googlePlaceType": "place_type_from_list", "address": "Exact Full Street Address from Google Maps, Albuquerque, NM ZIP", "detail": "Short description", "latitude": 35.xxxx, "longitude": -106.xxxx, "permanentlyClosed": false }]
      
      IMPORTANT: Include latitude and longitude coordinates for each restaurant.
      DO NOT use backticks for strings. DO NOT include any text outside the JSON array.
      Verify activity and address via Google Search.`;

            // Attempt 1: With Google Search Tool (Experimental - uses v1beta)
            let text = "";
            try {
                console.log("🛠️ Attempting search WITH Google Search tool (v1beta)...");
                const genAIBeta = new GoogleGenerativeAI(apiKey);
                const modelWithTools = genAIBeta.getGenerativeModel({
                    model: "gemini-2.5-flash",
                    tools: [{ googleSearchRetrieval: {} } as any],
                }, { apiVersion: 'v1beta' });

                const result = await modelWithTools.generateContent(prompt);
                text = result.response.text();
                console.log("✅ Tool Success.");
            } catch (toolError: any) {
                console.warn("⚠️ Google Search tool failed or not supported, falling back to STABLE v1 model:", toolError.message);
                // Attempt 2: Fallback to STABLE basic model without tools
                const genAIStable = new GoogleGenerativeAI(apiKey);
                const basicModel = genAIStable.getGenerativeModel({
                    model: "gemini-2.5-flash"
                }, { apiVersion: 'v1' });

                const result = await basicModel.generateContent(prompt);
                text = result.response.text();
                console.log("✅ Stable Fallback Success.");
            }

            console.log(`📄 AI Response (Search): ${text.substring(0, 500)}...`);
            const aiRestaurants = extractJson(text);

            const finalRestaurants: any[] = [];
            const categoriesSet = new Set<string>();

            aiRestaurants.forEach((restaurant: any) => {
                const safeName = restaurant.name || "Unknown Spot";
                const idBase = `${safeName}-${location}`.toLowerCase().trim();
                const deterministicId = safeBtoa(idBase).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);

                // Skip permanently closed restaurants
                if (restaurant.permanentlyClosed === true) {
                    console.log(`🚫 Skipping closed restaurant: ${safeName}`);
                    return;
                }

                // Geo validation: check coordinates + address + zip
                const lat = parseFloat(restaurant.latitude) || undefined;
                const lng = parseFloat(restaurant.longitude) || undefined;
                const addr = restaurant.address || '';

                if (!isInABQ(lat, lng, addr)) {
                    console.log(`📍 Skipping non-ABQ restaurant: ${safeName} (${addr})`);
                    return;
                }

                finalRestaurants.push({
                    id: deterministicId,
                    name: safeName,
                    category: mapPlaceTypeToCategory(restaurant.googlePlaceType || ""),
                    googlePlaceType: restaurant.googlePlaceType,
                    address: restaurant.address || restaurant.detail || "Albuquerque, NM",
                    rating: 4 + (Math.random() * 0.9),
                    userRatingsTotal: Math.floor(Math.random() * 1000) + 100,
                    googleMapsUri: `https://www.google.com/maps/search/${encodeURIComponent(safeName + " " + (restaurant.address || location))}`,
                    basePoints: 100,
                    sourceUrl: `https://www.google.com/maps/search/${encodeURIComponent(safeName + " " + location)}`,
                    ...(lat && { latitude: lat }),
                    ...(lng && { longitude: lng })
                });

                categoriesSet.add(mapPlaceTypeToCategory(restaurant.googlePlaceType || ""));
            });

            return {
                restaurants: finalRestaurants.sort((a, b) => b.basePoints - a.basePoints),
                categories: Array.from(categoriesSet).sort()
            };
        } catch (error: any) {
            console.error(`❌ Search Attempt ${attempt + 1} Fatal Error:`, {
                message: error.message,
                stack: error.stack
            });
            if (attempt < MAX_RETRIES) {
                attempt++;
                const backoff = INITIAL_BACKOFF * Math.pow(2, attempt - 1);
                console.log(`🔄 Retrying in ${backoff}ms...`);
                await delay(backoff);
                return executeSearch();
            }
            throw error;
        }
    };

    try {
        const result = await executeSearch();
        res.status(200).json(result);
    } catch (error: any) {
        res.status(500).json({
            error: error.message || 'AI Search failed',
            details: error.stack
        });
    }
}
