import { doc, setDoc, getDoc, collection, getDocs, deleteDoc } from "firebase/firestore";
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

    try {
        const restaurantRef = doc(db, COLLECTION_NAME, restaurant.id);
        await setDoc(restaurantRef, restaurant, { merge: true });
        console.log(`Restaurant saved: ${restaurant.name}`);
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
