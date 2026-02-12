import { GoogleGenerativeAI } from "@google/generative-ai";

const MAX_RETRIES = 5;
const INITIAL_BACKOFF = 5000;

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
      CRITICAL: Only include restaurants physically located in Albuquerque, New Mexico. 
      Do NOT include places in Santa Fe, Rio Rancho, Bernalillo, or other nearby towns.
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
        [{ "name": "Official Name", "googlePlaceType": "place_type_from_list", "address": "Full Street Address, Albuquerque, NM", "detail": "Short description" }]
      
      DO NOT use backticks for strings. DO NOT include any text outside the JSON array.
      Verify activity and address via Google Search.`;

            let text = "";
            try {
                console.log("🛠️ Attempting search WITH Google Search tool...");
                const modelWithTools = genAI.getGenerativeModel({
                    model: "gemini-1.5-flash",
                    tools: [{ googleSearchRetrieval: {} } as any],
                });
                const result = await modelWithTools.generateContent(prompt);
                text = result.response.text();
                console.log("✅ Tool Success.");
            } catch (toolError: any) {
                console.warn("⚠️ Google Search tool failed, falling back to basic model:", toolError.message);
                const basicModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                const result = await basicModel.generateContent(prompt);
                text = result.response.text();
                console.log("✅ Basic Fallback Success.");
            }

            console.log(`📄 AI Response (Search): ${text.substring(0, 500)}...`);
            const aiRestaurants = extractJson(text);

            const finalRestaurants: any[] = [];
            const categoriesSet = new Set<string>();

            aiRestaurants.forEach((restaurant: any) => {
                const safeName = restaurant.name || "Unknown Spot";
                const idBase = `${safeName}-${location}`.toLowerCase().trim();
                const deterministicId = safeBtoa(idBase).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);

                const fullAddress = (restaurant.address || "").toLowerCase();
                const isABQ = fullAddress.includes('albuquerque') || fullAddress.includes('abq') || fullAddress.includes('871');

                if (!isABQ) return;

                finalRestaurants.push({
                    id: deterministicId,
                    name: safeName,
                    category: mapPlaceTypeToCategory(restaurant.googlePlaceType || ""),
                    googlePlaceType: restaurant.googlePlaceType,
                    address: restaurant.address || restaurant.detail || "Albuquerque, NM",
                    rating: 4 + (Math.random() * 0.9),
                    userRatingsTotal: Math.floor(Math.random() * 1000) + 100,
                    googleMapsUri: `https://www.google.com/maps/search/${encodeURIComponent(safeName + " " + location)}`,
                    basePoints: 100,
                    sourceUrl: `https://www.google.com/maps/search/${encodeURIComponent(safeName + " " + location)}`
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
