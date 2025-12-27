import { GoogleAuthProvider, signInWithPopup, signOut } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";

const googleProvider = new GoogleAuthProvider();

/**
 * Initiates Google Sign-In and verifies if the user is an allowed administrator.
 * 
 * Flow:
 * 1. Popup login with Google.
 * 2. Checks 'sys_admin_users' Firestore collection for the user's email.
 * 3. Returns ID Token if authorized, throws Error if not.
 * 
 * @returns {Promise<string>} Firebase ID Token for session creation
 * @throws {Error} If user is not found in whitelist or login fails
 */
export async function loginAdminWithGoogle() {
    try {
        const userCredential = await signInWithPopup(auth, googleProvider);
        const user = userCredential.user;

        // Security Check: Verify email in whitelist
        const q = query(
            collection(db, "sys_admin_users"),
            where("email", "==", user.email)
        );

        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            await signOut(auth); // Force logout if not unauthorized
            throw new Error("ACCESO DENEGADO: Tu correo no está registrado como administrador.");
        }

        return await user.getIdToken();
    } catch (error: any) {
        console.error("Error en login administrativo:", error);
        throw error;
    }
}

/**
 * Signs out the current user.
 */
export async function logoutAdmin() {
    await signOut(auth);
}
