// Albuquerque bounding box (generous to include edges of metro)
const ABQ_BOUNDS = {
    north: 35.22,
    south: 34.94,
    west: -106.82,
    east: -106.47
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

const mapPlaceTypeToCategory = (types: string[]): string => {
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
        "sandwich_shop": "Delis & Sandwiches",
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
        "korean_restaurant": "Korean",
        "mediterranean_restaurant": "Mediterranean",
        "mexican_restaurant": "Mexican",
        "middle_eastern_restaurant": "Middle Eastern",
        "pizza_restaurant": "Pizza",
        "ramen_restaurant": "Ramen",
        "seafood_restaurant": "Seafood",
        "spanish_restaurant": "Spanish",
        "steak_house": "Steakhouse",
        "sushi_restaurant": "Sushi",
        "taco_restaurant": "Tacos",
        "thai_restaurant": "Thai",
        "turkish_restaurant": "Turkish",
        "vegetarian_restaurant": "Vegetarian",
        "vegan_restaurant": "Vegan",
        "vietnamese_restaurant": "Vietnamese"
    };

    // The FIRST type in the array is always the primaryType (passed in by the caller).
    // This is the most accurate category from Google Maps.
    // Only fall through to secondary types if primaryType has no mapping.
    for (const type of types) {
        if (mapping[type]) return mapping[type];
    }
    return "Restaurants";
};


// ─── Firestore REST Cache Helpers ───
// Uses Firestore REST API to cache Places results (no firebase-admin dependency needed)
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const FIRESTORE_PROJECT_ID = 'gen-lang-client-0758776695';
const FIRESTORE_DB = 'platewatchers';

function normalizeCacheKey(query: string, location: string): string {
    return `${query.toLowerCase().trim()}|${location.toLowerCase().trim()}`
        .replace(/[^a-z0-9| ]/g, '')
        .replace(/\s+/g, '-')
        .slice(0, 128);
}

async function getCachedResults(cacheKey: string): Promise<any[] | null> {
    try {
        const encodedKey = encodeURIComponent(cacheKey);
        const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/${FIRESTORE_DB}/documents/placesCache/${encodedKey}`;
        const response = await fetch(url);
        if (!response.ok) return null;

        const doc = await response.json();
        if (!doc.fields) return null;

        // Check TTL
        const cachedAt = parseInt(doc.fields.cachedAt?.integerValue || '0');
        if (Date.now() - cachedAt > CACHE_TTL_MS) return null;

        // Parse cached candidates
        const candidatesJson = doc.fields.candidates?.stringValue;
        if (!candidatesJson) return null;

        return JSON.parse(candidatesJson);
    } catch {
        return null; // Cache miss on any error
    }
}

async function setCachedResults(cacheKey: string, candidates: any[]): Promise<void> {
    try {
        const encodedKey = encodeURIComponent(cacheKey);
        const url = `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/${FIRESTORE_DB}/documents/placesCache/${encodedKey}`;
        await fetch(url, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                fields: {
                    candidates: { stringValue: JSON.stringify(candidates) },
                    cachedAt: { integerValue: String(Date.now()) },
                    query: { stringValue: cacheKey }
                }
            })
        });
    } catch {
        // Silently fail — caching is best-effort
    }
}

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Rate limit: 30 requests/minute per IP
    const { applyRateLimit } = await import('./_rateLimit');
    if (applyRateLimit(req, res, 30, 60_000)) return;

    const { restaurantName, location = "Albuquerque, New Mexico" } = req.body;
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
        console.error("❌ GOOGLE_MAPS_API_KEY is missing from environment variables.");
        return res.status(500).json({
            candidates: [],
            error: 'GOOGLE_MAPS_API_KEY not configured. Add it in Vercel Environment Variables.'
        });
    }

    try {
        // ─── Check cache first ───
        const cacheKey = normalizeCacheKey(restaurantName, location);
        const cached = await getCachedResults(cacheKey);
        if (cached) {
            return res.status(200).json({ candidates: cached, cached: true });
        }


        // Call Google Places API Text Search (New)
        const placesResponse = await fetch('https://places.googleapis.com/v1/places:searchText', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask': [
                    'places.id',
                    'places.displayName',
                    'places.formattedAddress',
                    'places.location',
                    'places.rating',
                    'places.userRatingCount',
                    'places.types',
                    'places.googleMapsUri',
                    'places.businessStatus',
                    'places.primaryType'
                ].join(',')
            },
            body: JSON.stringify({
                textQuery: `${restaurantName} ${location}`,
                locationBias: {
                    rectangle: {
                        low: {
                            latitude: ABQ_BOUNDS.south,
                            longitude: ABQ_BOUNDS.west
                        },
                        high: {
                            latitude: ABQ_BOUNDS.north,
                            longitude: ABQ_BOUNDS.east
                        }
                    }
                },
                pageSize: 10
            })
        });

        if (!placesResponse.ok) {
            const errorData = await placesResponse.json();
            console.error("❌ Places API Error:", errorData);
            return res.status(200).json({
                candidates: [],
                error: `Google Places API error: ${errorData.error?.message || 'Unknown error'}`
            });
        }

        const data = await placesResponse.json();
        const places = data.places || [];



        // Filter and map results
        const candidates = places
            .filter((place: any) => {
                // Filter out permanently closed
                if (place.businessStatus === 'CLOSED_PERMANENTLY') {

                    return false;
                }

                // Filter out non-food places (e.g., actual gardens, parks, museums)
                const types = place.types || [];
                const primaryType = place.primaryType || '';
                const foodTypes = new Set([
                    'restaurant', 'food', 'cafe', 'bakery', 'bar', 'meal_delivery',
                    'meal_takeaway', 'coffee_shop', 'ice_cream_shop', 'dessert_shop',
                    'american_restaurant', 'barbecue_restaurant', 'brazilian_restaurant',
                    'breakfast_restaurant', 'brunch_restaurant', 'chinese_restaurant',
                    'fast_food_restaurant', 'fine_dining_restaurant', 'hamburger_restaurant',
                    'indian_restaurant', 'italian_restaurant', 'japanese_restaurant',
                    'mexican_restaurant', 'pizza_restaurant', 'seafood_restaurant',
                    'steak_house', 'sushi_restaurant', 'thai_restaurant', 'diner',
                    'vegetarian_restaurant', 'vietnamese_restaurant', 'vegan_restaurant',
                    'bar_and_grill', 'donut_shop', 'deli', 'sandwich_shop',
                    'taco_restaurant', 'ramen_restaurant', 'korean_restaurant',
                    'greek_restaurant', 'turkish_restaurant', 'middle_eastern_restaurant',
                    'spanish_restaurant', 'french_restaurant', 'asian_restaurant',
                    'indonesian_restaurant', 'lebanese_restaurant', 'mediterranean_restaurant'
                ]);

                const isFoodPlace = foodTypes.has(primaryType) || types.some((t: string) => foodTypes.has(t));
                if (!isFoodPlace) {

                    return false;
                }

                // Check if address mentions Albuquerque or is within ABQ bounds
                const addr = (place.formattedAddress || '').toLowerCase();
                const lat = place.location?.latitude;
                const lng = place.location?.longitude;

                const inABQ = addr.includes('albuquerque') || addr.includes('abq') ||
                    (lat && lng &&
                        lat >= ABQ_BOUNDS.south && lat <= ABQ_BOUNDS.north &&
                        lng >= ABQ_BOUNDS.west && lng <= ABQ_BOUNDS.east);

                if (!inABQ) {

                }
                return inABQ;
            })
            .map((place: any) => {
                const name = place.displayName?.text || "Unknown Spot";
                const idBase = `${name}-${location}`.toLowerCase().trim();
                const deterministicId = safeBtoa(idBase).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
                const types = place.types || [];
                const primaryType = place.primaryType || '';

                return {
                    id: deterministicId,
                    name: name,
                    category: mapPlaceTypeToCategory(primaryType ? [primaryType, ...types] : types),
                    googlePlaceType: primaryType || types[0] || 'restaurant',
                    address: place.formattedAddress || "Albuquerque, NM",
                    detail: types.filter((t: string) => t.includes('restaurant') || t.includes('cafe') || t.includes('bakery')).join(', '),
                    rating: place.rating || 0,
                    reviewCount: place.userRatingCount || 0,
                    userRatingsTotal: place.userRatingCount || 0,
                    googleMapsUri: place.googleMapsUri || `https://www.google.com/maps/search/${encodeURIComponent(name + " " + place.formattedAddress)}`,
                    basePoints: 100,
                    source: 'user-submitted',
                    submittedAt: Date.now(),
                    latitude: place.location?.latitude,
                    longitude: place.location?.longitude,
                    googlePlaceId: place.id
                };
            });

        // ─── Cache results for future lookups ───
        if (candidates.length > 0) {
            await setCachedResults(cacheKey, candidates);
        }

        return res.status(200).json({ candidates });

    } catch (error: any) {
        console.error("❌ Fatal Error in Places API search:", {
            message: error.message,
            stack: error.stack
        });
        return res.status(500).json({
            candidates: [],
            error: "Failed to search for restaurants. Please try again."
        });
    }
}
