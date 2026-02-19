import { doc, setDoc, getDoc, collection, getDocs, deleteDoc, query, where, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { Restaurant } from "../types";

const COLLECTION_NAME = "restaurants";

/**
 * Wipes ALL restaurants from Firestore. Admin-only, used before re-seeding
 * with accurate Google Places data.
 */
export const wipeAllRestaurants = async (): Promise<number> => {
    if (!db) return 0;
    try {
        const snapshot = await getDocs(collection(db, COLLECTION_NAME));
        const batch = writeBatch(db);
        snapshot.forEach((docSnap) => batch.delete(docSnap.ref));
        await batch.commit();
        return snapshot.size;
    } catch (error) {
        console.error("Error wiping restaurants:", error);
        throw error;
    }
};

/**
 * Saves a single restaurant to Firestore.
 * Merges with existing data to update fields without overwriting everything.
 */
export const saveRestaurant = async (restaurant: Restaurant) => {
    if (!db) {
        console.warn("Firestore not initialized. Cannot save restaurant.");
        return;
    }

    // Firestore rejects `undefined` values — strip them before saving
    const cleanData = (obj: Record<string, any>): Record<string, any> => {
        const cleaned: Record<string, any> = {};
        for (const [key, value] of Object.entries(obj)) {
            if (value !== undefined) {
                cleaned[key] = value;
            }
        }
        return cleaned;
    };

    try {
        const restaurantRef = doc(db, COLLECTION_NAME, restaurant.id);
        const docSnap = await getDoc(restaurantRef);

        if (docSnap.exists()) {
            // If exists, ONLY update info fields, preserving stats
            const existing = docSnap.data();
            const merged = cleanData({
                ...restaurant,
                // Preserve existing stats if they exist
                rating: existing.rating || restaurant.rating,
                userRatingsTotal: existing.userRatingsTotal || restaurant.userRatingsTotal,
                basePoints: existing.basePoints || restaurant.basePoints,
                source: existing.source || restaurant.source || 'search',
                submittedAt: existing.submittedAt || restaurant.submittedAt || Date.now()
            });
            await setDoc(restaurantRef, merged, { merge: true });

        } else {
            // New restaurant — clean and save
            const cleaned = cleanData({
                ...restaurant,
                source: restaurant.source || 'search',
                submittedAt: restaurant.submittedAt || Date.now()
            });
            await setDoc(restaurantRef, cleaned, { merge: true });

        }
    } catch (error) {
        console.error("Error saving restaurant:", error);
        throw error;
    }
};


/**
 * Deletes a single restaurant from Firestore.
 */
export const deleteRestaurant = async (id: string) => {
    if (!db) return;
    try {
        const batch = writeBatch(db);
        const restaurantRef = doc(db, COLLECTION_NAME, id);
        batch.delete(restaurantRef);

        // Delete associated votes
        const votesRef = collection(db, "user_votes");
        const q = query(votesRef, where("restaurantId", "==", id));
        const voteSnap = await getDocs(q);

        voteSnap.forEach((doc) => {
            batch.delete(doc.ref);
        });

        // Delete from global rankings too
        const rankingRef = doc(db, "global_rankings", id);
        batch.delete(rankingRef);

        await batch.commit();

    } catch (error) {
        console.error("Error deleting restaurant and votes:", error);
        throw error;
    }
};

/**
 * Updates a restaurant's base points manually.
 */
export const updateRestaurantPoints = async (id: string, basePoints: number) => {
    if (!db) return;
    try {
        const restaurantRef = doc(db, COLLECTION_NAME, id);
        await setDoc(restaurantRef, { basePoints }, { merge: true });
    } catch (error) {
        console.error("Error updating points:", error);
        throw error;
    }
};

/**
 * Saves a batch of restaurants to Firestore.
 */
export const saveRestaurantsBatch = async (restaurants: Restaurant[]) => {
    if (!db) return;

    // Firestore batch writes are atomic, but for simple usage we can just loop Promise.all
    // for now to keep it simple, or use a batch if we expect > 500 items (unlikely here).
    try {
        const promises = restaurants.map(r => saveRestaurant(r));
        await Promise.all(promises);

    } catch (error) {
        console.error("Error saving batch:", error);
    }
};

/**
 * Retrieves all restaurants from Firestore.
 */
export const getSavedRestaurants = async (): Promise<Restaurant[]> => {
    if (!db) return [];

    try {
        const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
        const restaurants: Restaurant[] = [];
        querySnapshot.forEach((doc) => {
            restaurants.push(doc.data() as Restaurant);
        });
        return restaurants;
    } catch (error) {
        console.error("Error getting restaurants:", error);
        return [];
    }
};

/**
 * One-time data cleanup: fixes category typos from old AI-generated data.
 * Safe to call multiple times — only updates documents that have typos.
 */
export const fixCategoryTypos = async (): Promise<number> => {
    if (!db) return 0;

    const typoMap: Record<string, string> = {
        "Dalis & Sandwiches": "Delis & Sandwiches",
        "Dalis": "Delis & Sandwiches",
        "Deli": "Delis & Sandwiches",
    };

    try {
        const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
        let fixedCount = 0;

        const batch = writeBatch(db);
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const corrected = typoMap[data.category];
            if (corrected) {
                batch.update(docSnap.ref, { category: corrected });
                fixedCount++;
            }
        });

        if (fixedCount > 0) {
            await batch.commit();
        }
        return fixedCount;
    } catch (error) {
        console.error("Error fixing category typos:", error);
        return 0;
    }
};

/**
 * Deletes all votes for a specific user.
 * Part of Facebook Data Deletion requirement.
 */
export const deleteUserVotes = async (userId: string) => {
    if (!db) return;

    try {
        // We will implement the user_votes collection soon. 
        // This function will clear all docs where userId matches.

        // Implementation will follow when user_votes is wired up.
    } catch (error) {
        console.error("Error deleting user data:", error);
    }
};

/**
 * Saves a new restaurant suggestion to the pending collection.
 */
export const saveSuggestion = async (restaurant: Restaurant) => {
    if (!db) return;
    try {
        const suggestionRef = doc(db, "suggestions", restaurant.id);
        await setDoc(suggestionRef, {
            ...restaurant,
            status: 'pending',
            submittedAt: Date.now()
        });

    } catch (error) {
        console.error("Error saving suggestion:", error);
        throw error;
    }
};

/**
 * Retrieves all pending suggestions from Firestore.
 */
export const getPendingSuggestions = async (): Promise<Restaurant[]> => {
    if (!db) return [];
    try {
        const suggestionsRef = collection(db, "suggestions");
        const querySnapshot = await getDocs(suggestionsRef);
        return querySnapshot.docs.map(doc => doc.data() as Restaurant);
    } catch (error) {
        console.error("Error getting suggestions:", error);
        throw error;
    }
};

/**
 * Approves a suggestion by moving it to the main collection.
 */
export const approveSuggestion = async (restaurant: Restaurant) => {
    if (!db) return;
    try {
        // Save to main collection
        await saveRestaurant(restaurant);
        // Delete from suggestions
        await deleteDoc(doc(db, "suggestions", restaurant.id));

    } catch (error) {
        console.error("Error approving suggestion:", error);
        throw error;
    }
};

/**
 * Rejects a suggestion by deleting it.
 */
export const rejectSuggestion = async (id: string) => {
    if (!db) return;
    try {
        await deleteDoc(doc(db, "suggestions", id));

    } catch (error) {
        console.error("Error rejecting suggestion:", error);
        throw error;
    }
};

/**
 * Updates a restaurant's category and removes conflicting votes.
 */
export const updateRestaurantCategory = async (id: string, newCategory: string, oldCategory: string) => {
    if (!db) return;

    try {
        const batch = writeBatch(db);
        const restaurantRef = doc(db, COLLECTION_NAME, id);
        const votesRef = collection(db, "user_votes");

        // 1. Update restaurant category
        batch.update(restaurantRef, { category: newCategory });

        // 2. Find and delete user votes for this restaurant in the OLD category
        // We query by restaurantId AND category just to be safe, though ID should be unique to restaurant
        const q = query(
            votesRef,
            where("restaurantId", "==", id),
            where("category", "==", oldCategory)
        );

        const votesSnap = await getDocs(q);
        votesSnap.forEach((voteDoc) => {
            batch.delete(voteDoc.ref);
        });

        await batch.commit();


    } catch (error) {
        console.error("Error updating category:", error);
        throw error;
    }
};

/**
 * Submits a request to change a restaurant's category.
 */
export const requestCategoryEdit = async (restaurant: Restaurant, newCategory: string, user: any) => {
    if (!db) return;
    try {
        const requestRef = doc(collection(db, "category_requests"));
        await setDoc(requestRef, {
            id: requestRef.id,
            restaurantId: restaurant.id,
            restaurantName: restaurant.name,
            currentCategory: restaurant.category,
            requestedCategory: newCategory,
            userId: user.uid,
            userName: user.displayName,
            status: 'pending',
            submittedAt: Date.now()
        });
    } catch (error) {
        console.error("Error submitting category request:", error);
        throw error;
    }
};

/**
 * Retrieves all pending category edit requests.
 */
export const getCategoryRequests = async () => {
    if (!db) return [];
    try {
        const q = query(collection(db, "category_requests"), where("status", "==", "pending"));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => doc.data());
    } catch (error) {
        console.error("Error getting category requests:", error);
        return [];
    }
};

/**
 * Resolves a category edit request (approve or reject).
 */
export const resolveCategoryRequest = async (requestId: string, approve: boolean, restaurantId?: string, newCategory?: string, oldCategory?: string) => {
    if (!db) return;
    try {
        const requestRef = doc(db, "category_requests", requestId);

        if (approve && restaurantId && newCategory && oldCategory) {
            // Apply the category change using existing logic
            await updateRestaurantCategory(restaurantId, newCategory, oldCategory);
            // Mark request as approved
            await deleteDoc(requestRef); // Or set status to 'approved' if we want history
        } else {
            // Just delete/reject the request
            await deleteDoc(requestRef);
        }
    } catch (error) {
        console.error("Error resolving category request:", error);
        throw error;
    }
};
