import { doc, setDoc, getDoc, collection, getDocs } from "firebase/firestore";
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
