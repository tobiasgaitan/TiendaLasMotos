import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

/**
 * Signs out the current user.
 */
export async function logoutAdmin() {
    await signOut(auth);
}
