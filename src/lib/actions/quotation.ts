import { db } from "@/lib/firebase";
import { doc, runTransaction, serverTimestamp } from "firebase/firestore";

/**
 * Generates the next quotation number in the format COT-YYYY-XXXX.
 * @returns {Promise<string>} The formatted quotation number.
 */
export async function getNextQuoteNumber(): Promise<string> {
    try {
        const year = new Date().getFullYear();
        const counterRef = doc(db, "config", "counters");

        return await runTransaction(db, async (transaction) => {
            const counterDoc = await transaction.get(counterRef);

            let currentCount = 0;
            let currentYear = year;

            if (counterDoc.exists()) {
                const data = counterDoc.data();
                // Check if we need to reset for a new year (optional, but good practice)
                if (data.quotationYear === year) {
                    currentCount = data.quotationCount || 0;
                } else {
                    currentCount = 0; // Reset if year changed
                }
                currentYear = year;
            }

            const nextCount = currentCount + 1;
            const formattedCount = nextCount.toString().padStart(4, '0');
            const quoteId = `COT-${year}-${formattedCount}`;

            transaction.set(counterRef, {
                quotationCount: nextCount,
                quotationYear: year,
                lastUpdated: serverTimestamp()
            }, { merge: true });

            return quoteId;
        });
    } catch (error) {
        console.error("Error generating quote number:", error);
        // Fallback or retry could be implemented here, but for now throw to handle in UI
        throw new Error("Failed to generate quotation number");
    }
}
