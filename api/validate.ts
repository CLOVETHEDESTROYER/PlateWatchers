import { GoogleGenerativeAI } from "@google/generative-ai";

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
    if (lat && lng) {
        if (lat >= ABQ_BOUNDS.south && lat <= ABQ_BOUNDS.north &&
            lng >= ABQ_BOUNDS.west && lng <= ABQ_BOUNDS.east) {
            return true;
        }
    }
    const addr = (address || '').toLowerCase();
    if (addr.includes('albuquerque') || addr.includes('abq')) return true;
    const zipMatch = addr.match(/\b(\d{5})\b/);
    if (zipMatch && ABQ_ZIPS.has(zipMatch[1])) return true;
    return false;
};

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

    const { restaurantName, location = "Albuquerque, New Mexico" } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        console.error("❌ GEMINI_API_KEY is missing from environment variables.");
        return res.status(500).json({ error: 'GEMINI_API_KEY not configured in Vercel settings.' });
    }

    console.log(`🔑 Key check: ${apiKey.substring(0, 4)}... (Total length: ${apiKey.length})`);

    const genAI = new GoogleGenerativeAI(apiKey);

    try {
        console.log(`🔍 Searching candidates for: "${restaurantName}" in "${location}"`);

        const prompt = `Search Google Maps for ALL restaurants, cafes, or food establishments matching "${restaurantName}" in ${location}.

CRITICAL REQUIREMENTS:
1. Search Google Maps for the query "${restaurantName}" in Albuquerque, New Mexico.
2. Return ALL matching locations in Albuquerque — do NOT pick just one.
3. Each result must NOT be PERMANENTLY CLOSED. Restaurants closed for the evening are STILL VALID.
4. Only include places within Albuquerque, NM (no Santa Fe, Rio Rancho, Bernalillo, etc.)
5. Use the EXACT name and EXACT street address as shown on Google Maps. Do NOT guess addresses.
6. Include the Google Maps rating and review count if available.

Return a JSON array of ALL matches:
[
  {
    "name": "Exact Google Maps Name",
    "address": "Exact street address from Google Maps, Albuquerque, NM ZIP",
    "googlePlaceType": "type_from_list",
    "detail": "Brief description (cuisine type, vibe, etc.)",
    "rating": 4.2,
    "reviewCount": 382,
    "latitude": 35.xxxx,
    "longitude": -106.xxxx
  }
]

"googlePlaceType" MUST be one of:
"american_restaurant", "bakery", "bar", "bar_and_grill", "barbecue_restaurant",
"brazilian_restaurant", "breakfast_restaurant", "brunch_restaurant",
"cafe", "chinese_restaurant", "coffee_shop", "deli", "dessert_shop", "diner",
"donut_shop", "fast_food_restaurant", "fine_dining_restaurant", "hamburger_restaurant",
"ice_cream_shop", "indian_restaurant", "italian_restaurant", "japanese_restaurant",
"mexican_restaurant", "pizza_restaurant", "seafood_restaurant", "steak_house",
"sushi_restaurant", "thai_restaurant", "vegetarian_restaurant", "vietnamese_restaurant"

If NO matches are found in Albuquerque, return: []
DO NOT include any text outside the JSON array. Use DOUBLE QUOTES only.`;

        // Attempt 1: With Google Search Tool (uses v1beta for grounded results)
        let text = "";
        try {
            console.log("🛠️ Attempting candidate search WITH Google Search tool (v1beta)...");
            const genAIBeta = new GoogleGenerativeAI(apiKey);
            const modelWithTools = genAIBeta.getGenerativeModel({
                model: "gemini-2.5-flash",
                tools: [{ googleSearchRetrieval: {} } as any],
            }, { apiVersion: 'v1beta' });

            const result = await modelWithTools.generateContent(prompt);
            text = result.response.text();
            console.log("✅ Tool Success.");
        } catch (toolError: any) {
            console.warn("⚠️ Google Search tool failed, falling back to STABLE v1 model:", toolError.message);
            const genAIStable = new GoogleGenerativeAI(apiKey);
            const basicModel = genAIStable.getGenerativeModel({
                model: "gemini-2.5-flash"
            }, { apiVersion: 'v1' });

            const result = await basicModel.generateContent(prompt);
            text = result.response.text();
            console.log("✅ Stable Fallback Success.");
        }

        console.log("📄 AI Response:", text);

        // Parse JSON array from response
        let cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const firstBracket = cleaned.indexOf('[');
        const lastBracket = cleaned.lastIndexOf(']');

        if (firstBracket === -1 || lastBracket === -1) {
            console.log("⚠️ No JSON array found in response");
            return res.status(200).json({ candidates: [] });
        }

        cleaned = cleaned.substring(firstBracket, lastBracket + 1);
        const aiResults = JSON.parse(cleaned);

        if (!Array.isArray(aiResults) || aiResults.length === 0) {
            return res.status(200).json({ candidates: [] });
        }

        // Build candidate list, filtering by ABQ bounds
        const candidates = aiResults
            .map((r: any) => {
                const lat = parseFloat(r.latitude) || undefined;
                const lng = parseFloat(r.longitude) || undefined;
                const addr = r.address || '';

                if (!isInABQ(lat, lng, addr)) {
                    console.log(`📍 Skipping non-ABQ candidate: ${r.name} (${addr})`);
                    return null;
                }

                const safeName = r.name || "Unknown Spot";
                const idBase = `${safeName}-${location}`.toLowerCase().trim();
                const deterministicId = safeBtoa(idBase).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);

                return {
                    id: deterministicId,
                    name: safeName,
                    category: mapPlaceTypeToCategory(r.googlePlaceType || ""),
                    googlePlaceType: r.googlePlaceType,
                    address: addr || "Albuquerque, NM",
                    detail: r.detail || "",
                    rating: r.rating || 0,
                    reviewCount: r.reviewCount || 0,
                    userRatingsTotal: r.reviewCount || 0,
                    googleMapsUri: `https://www.google.com/maps/search/${encodeURIComponent(safeName + " " + (addr || location))}`,
                    basePoints: 100,
                    source: 'user-submitted',
                    submittedAt: Date.now(),
                    ...(lat && { latitude: lat }),
                    ...(lng && { longitude: lng })
                };
            })
            .filter(Boolean);

        console.log(`✅ Returning ${candidates.length} candidates for "${restaurantName}"`);
        return res.status(200).json({ candidates });

    } catch (error: any) {
        console.error("❌ Fatal Validation Error in Serverless Function:", {
            message: error.message,
            stack: error.stack,
            status: error.status,
            code: error.code
        });
        return res.status(500).json({
            candidates: [],
            error: "Failed to search for restaurants. Internal server error.",
            details: error.message
        });
    }
}
