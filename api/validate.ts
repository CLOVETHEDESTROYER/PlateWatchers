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

    // Log key presence for debugging (first 4 chars only for security)
    console.log(`🔑 Key check: ${apiKey.substring(0, 4)}... (Total length: ${apiKey.length})`);

    const genAI = new GoogleGenerativeAI(apiKey);

    try {
        console.log(`🔍 Validating restaurant: "${restaurantName}" in "${location}"`);

        const prompt = `Verify if "${restaurantName}" is a REAL restaurant, cafe, or similar food establishment in ${location}.

CRITICAL REQUIREMENTS:
1. The place MUST have a verified listing on Google Maps.
2. The place MUST be located strictly within Albuquerque, New Mexico. (No Santa Fe, Rio Rancho, Bernalillo, Los Lunas, etc.)
3. The place must NOT be PERMANENTLY CLOSED. However, restaurants that are simply closed for the evening or have limited hours ARE STILL VALID. Do NOT reject a restaurant just because it is outside its current business hours.
4. If you find MULTIPLE locations in Albuquerque, pick the most popular one (highest rated / most reviews).
5. Use the EXACT address as listed on Google Maps. Do NOT guess or approximate addresses.

If the place is VERIFIED on Google Maps and meets ALL criteria, return this EXACT JSON:
{"valid": true, "name": "Official Google Maps Name", "googlePlaceType": "place_type_from_list", "address": "Exact Full Street Address from Google Maps, Albuquerque, NM ZIP", "detail": "Brief description", "latitude": 35.xxxx, "longitude": -106.xxxx}

Category MUST be one of these Google Place Types:
"american_restaurant", "bakery", "bar", "bar_and_grill", "barbecue_restaurant",
"brazilian_restaurant", "breakfast_restaurant", "brunch_restaurant",
"cafe", "chinese_restaurant", "coffee_shop", "deli", "dessert_shop", "diner",
"donut_shop", "fast_food_restaurant", "fine_dining_restaurant", "hamburger_restaurant",
"ice_cream_shop", "indian_restaurant", "italian_restaurant", "japanese_restaurant",
"mexican_restaurant", "pizza_restaurant", "seafood_restaurant", "steak_house",
"sushi_restaurant", "thai_restaurant", "vegetarian_restaurant", "vietnamese_restaurant"

If you cannot find a match on Google Maps, if it's PERMANENTLY closed, if it's outside Albuquerque, or if it's not a food establishment, return:
{"valid": false, "reason": "Explanation of why it failed"}

IMPORTANT: Always include latitude and longitude for valid results.
DO NOT include any text outside the JSON. Use DOUBLE QUOTES only.`;

        // Attempt 1: With Google Search Tool (Experimental - uses v1beta)
        let text = "";
        try {
            console.log("🛠️ Attempting validation WITH Google Search tool (v1beta)...");
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

        console.log("📄 AI Response:", text);

        let cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const firstBrace = cleaned.indexOf('{');
        const lastBrace = cleaned.lastIndexOf('}');

        if (firstBrace === -1 || lastBrace === -1) {
            console.error("❌ Failed to parse JSON from AI response:", text);
            return res.status(200).json({ valid: false, error: "Could not verify restaurant format. AI response was invalid JSON." });
        }

        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
        const parseResult = JSON.parse(cleaned);

        if (!parseResult.valid) {
            return res.status(200).json({ valid: false, error: parseResult.reason || "Restaurant not found" });
        }

        const idBase = `${parseResult.name}-${location}`.toLowerCase().trim();
        const deterministicId = safeBtoa(idBase).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);

        // Server-side geo validation — catches AI mistakes
        const lat = parseFloat(parseResult.latitude) || undefined;
        const lng = parseFloat(parseResult.longitude) || undefined;
        const addr = parseResult.address || '';

        if (!isInABQ(lat, lng, addr)) {
            console.log(`📍 Rejecting non-ABQ suggestion: ${parseResult.name} (${addr})`);
            return res.status(200).json({ valid: false, error: `"${parseResult.name}" does not appear to be in Albuquerque.` });
        }

        const restaurant = {
            id: deterministicId,
            name: parseResult.name,
            category: mapPlaceTypeToCategory(parseResult.googlePlaceType || "Restaurants"),
            googlePlaceType: parseResult.googlePlaceType,
            address: parseResult.address || parseResult.detail || "Albuquerque, NM",
            rating: 4.5,
            userRatingsTotal: 0,
            googleMapsUri: `https://www.google.com/maps/search/${encodeURIComponent(parseResult.name + " " + (parseResult.address || location))}`,
            basePoints: 100,
            source: 'user-submitted',
            submittedAt: Date.now(),
            ...(lat && { latitude: lat }),
            ...(lng && { longitude: lng })
        };

        return res.status(200).json({ valid: true, restaurant });

    } catch (error: any) {
        console.error("❌ Fatal Validation Error in Serverless Function:", {
            message: error.message,
            stack: error.stack,
            status: error.status,
            code: error.code
        });
        return res.status(500).json({
            valid: false,
            error: "Failed to validate restaurant. Internal server error.",
            details: error.message
        });
    }
}
