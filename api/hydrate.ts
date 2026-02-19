// Google Places API-based hydration endpoint
// Searches for restaurants by category in Albuquerque and returns accurate data

// Albuquerque bounding box
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

    for (const type of types) {
        if (mapping[type]) return mapping[type];
    }
    return "Restaurants";
};

// Food-related types for filtering
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

export default async function handler(req: any, res: any) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Rate limit: 10 requests/minute per IP (admin seeding only)
    const { applyRateLimit } = await import('./_rateLimit');
    if (applyRateLimit(req, res, 10, 60_000)) return;

    const { category, location = "Albuquerque, New Mexico" } = req.body;
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'GOOGLE_MAPS_API_KEY not configured.' });
    }

    if (!category) {
        return res.status(400).json({ error: 'Category is required.' });
    }

    try {
        const searchQuery = `${category} in ${location}`;

        const placesResponse = await fetch('https://places.googleapis.com/v1/places:searchText', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': apiKey,
                'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.types,places.primaryType,places.location,places.businessStatus,places.googleMapsUri,places.id'
            },
            body: JSON.stringify({
                textQuery: searchQuery,
                locationBias: {
                    rectangle: {
                        low: { latitude: ABQ_BOUNDS.south, longitude: ABQ_BOUNDS.west },
                        high: { latitude: ABQ_BOUNDS.north, longitude: ABQ_BOUNDS.east }
                    }
                },
                maxResultCount: 20,
                languageCode: "en"
            })
        });

        if (!placesResponse.ok) {
            const errorText = await placesResponse.text();
            console.error("Places API error:", errorText);
            return res.status(placesResponse.status).json({ error: 'Places API request failed' });
        }

        const data = await placesResponse.json();
        const places = data.places || [];

        const restaurants = places
            .filter((place: any) => {
                if (place.businessStatus === 'CLOSED_PERMANENTLY') return false;

                const types = place.types || [];
                const primaryType = place.primaryType || '';
                const isFoodPlace = foodTypes.has(primaryType) || types.some((t: string) => foodTypes.has(t));
                if (!isFoodPlace) return false;

                // ABQ bounds check
                const lat = place.location?.latitude;
                const lng = place.location?.longitude;
                if (lat && lng) {
                    return (lat >= ABQ_BOUNDS.south && lat <= ABQ_BOUNDS.north &&
                        lng >= ABQ_BOUNDS.west && lng <= ABQ_BOUNDS.east);
                }
                const addr = (place.formattedAddress || '').toLowerCase();
                return addr.includes('albuquerque') || addr.includes('abq') || addr.includes(', nm');
            })
            .map((place: any) => {
                const name = place.displayName?.text || "Unknown";
                const idBase = `${name}-${location}`.toLowerCase().trim();
                const deterministicId = safeBtoa(idBase).replace(/[^a-zA-Z0-9]/g, '').slice(0, 24);
                const types = place.types || [];
                const primaryType = place.primaryType || '';

                return {
                    id: deterministicId,
                    name,
                    category: mapPlaceTypeToCategory(primaryType ? [primaryType, ...types] : types),
                    googlePlaceType: primaryType || types[0] || 'restaurant',
                    address: place.formattedAddress || "Albuquerque, NM",
                    detail: types.filter((t: string) => t.includes('restaurant') || t.includes('cafe') || t.includes('bakery')).join(', '),
                    rating: place.rating || 0,
                    reviewCount: place.userRatingCount || 0,
                    userRatingsTotal: place.userRatingCount || 0,
                    googleMapsUri: place.googleMapsUri || `https://www.google.com/maps/search/${encodeURIComponent(name + " " + place.formattedAddress)}`,
                    basePoints: 100,
                    source: 'places-hydrate',
                    submittedAt: Date.now(),
                    latitude: place.location?.latitude,
                    longitude: place.location?.longitude,
                    googlePlaceId: place.id
                };
            });

        return res.status(200).json({
            restaurants,
            categories: [...new Set(restaurants.map((r: any) => r.category))].sort()
        });

    } catch (error: any) {
        console.error("Hydrate error:", error.message);
        return res.status(500).json({ error: 'Hydration failed.' });
    }
}
