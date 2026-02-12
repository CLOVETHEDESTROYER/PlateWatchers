import { GoogleGenerativeAI } from "@google/generative-ai";

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

    const { restaurantName, location = "Albuquerque, New Mexico" } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        console.error("❌ GEMINI_API_KEY is missing from environment variables.");
        return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        tools: [
            { googleSearchRetrieval: {} } as any
        ],
    });

    try {
        console.log(`🔍 Validating restaurant: ${restaurantName} in ${location}`);

        const prompt = `Verify if "${restaurantName}" is a REAL, CURRENTLY OPERATING restaurant, cafe, or similar food establishment in ${location}.

CRITICAL REQUIREMENTS:
1. The place MUST have a verified listing on Google Maps. 
2. The place MUST be located strictly within Albuquerque, New Mexico. (No Santa Fe, Rio Rancho, etc.)
3. The place MUST be open and currently in business.
4. If you find multiple locations, pick the one in Albuquerque.

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

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

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

        const restaurant = {
            id: deterministicId,
            name: parseResult.name,
            category: mapPlaceTypeToCategory(parseResult.googlePlaceType || "Restaurants"),
            googlePlaceType: parseResult.googlePlaceType,
            address: parseResult.address || parseResult.detail || "Albuquerque, NM",
            rating: 4.5,
            userRatingsTotal: 0,
            googleMapsUri: `https://www.google.com/maps/search/${encodeURIComponent(parseResult.name + " " + location)}`,
            basePoints: 100,
            source: 'user-submitted',
            submittedAt: Date.now(),
        };

        res.status(200).json({ valid: true, restaurant });

    } catch (error: any) {
        console.error("❌ Validation Error in Serverless Function:", error);
        res.status(500).json({ valid: false, error: "Failed to validate restaurant. Internal server error." });
    }
}
