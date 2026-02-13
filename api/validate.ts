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

    // Find the first matching type
    for (const type of types) {
        if (mapping[type]) return mapping[type];
    }
    return "Restaurants";
};

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

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
        console.log(`🔍 Places API search for: "${restaurantName}" in "${location}"`);

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

        console.log(`📍 Places API returned ${places.length} results`);

        // Filter and map results
        const candidates = places
            .filter((place: any) => {
                // Filter out permanently closed
                if (place.businessStatus === 'CLOSED_PERMANENTLY') {
                    console.log(`🚫 Skipping permanently closed: ${place.displayName?.text}`);
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
                    console.log(`🌿 Skipping non-food place: ${place.displayName?.text} (types: ${types.join(', ')})`);
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
                    console.log(`📍 Skipping non-ABQ result: ${place.displayName?.text} (${place.formattedAddress})`);
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

        console.log(`✅ Returning ${candidates.length} verified candidates for "${restaurantName}"`);
        return res.status(200).json({ candidates });

    } catch (error: any) {
        console.error("❌ Fatal Error in Places API search:", {
            message: error.message,
            stack: error.stack
        });
        return res.status(500).json({
            candidates: [],
            error: "Failed to search for restaurants. Please try again.",
            details: error.message
        });
    }
}
