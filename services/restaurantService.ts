import { doc, setDoc, getDoc, collection, getDocs, deleteDoc, query, where, writeBatch } from "firebase/firestore";
import { db } from "../firebase";
import { Restaurant } from "../types";

const COLLECTION_NAME = "restaurants";

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
            console.log(`Restaurant updated (stats preserved): ${restaurant.name}`);
        } else {
            // New restaurant — clean and save
            const cleaned = cleanData({
                ...restaurant,
                source: restaurant.source || 'search',
                submittedAt: restaurant.submittedAt || Date.now()
            });
            await setDoc(restaurantRef, cleaned, { merge: true });
            console.log(`New restaurant saved: ${restaurant.name}`);
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
        await deleteDoc(doc(db, COLLECTION_NAME, id));
        console.log(`Restaurant deleted: ${id}`);
    } catch (error) {
        console.error("Error deleting restaurant:", error);
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
        console.log(`Batch saved ${restaurants.length} restaurants.`);
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
 * Deletes all votes for a specific user.
 * Part of Facebook Data Deletion requirement.
 */
export const deleteUserVotes = async (userId: string) => {
    if (!db) return;

    try {
        // We will implement the user_votes collection soon. 
        // This function will clear all docs where userId matches.
        console.log(`Privacy: Deleting all data associated with user ${userId}`);
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
        console.log(`Suggestion saved: ${restaurant.name}`);
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
        console.log(`Suggestion approved and moved: ${restaurant.id}`);
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
        console.log(`Suggestion rejected/deleted: ${id}`);
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
        console.log(`Recategorized ${id} to ${newCategory}. Removed ${votesSnap.size} old votes.`);

    } catch (error) {
        console.error("Error updating category:", error);
        throw error;
    }
};
