"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import {
    onAuthStateChanged,
    User,
    signOut,
    GoogleAuthProvider,
    signInWithPopup
} from "firebase/auth";
import { collection, query, where, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

// Define the shape of our context
interface AuthContextType {
    user: User | null;
    role: string | null;
    loading: boolean;
    logout: () => Promise<void>;
    loginWithGoogle: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Proveedor de contexto de autenticación global.
 * 
 * Escucha cambios en el estado de autenticación de Firebase (Observer).
 * Si un usuario se autentica, consulta Firestore ('sys_admin_users') para obtener su rol.
 * Expone el usuario, su rol y el estado de carga a toda la aplicación.
 */
export const AuthProvider = ({ children }: { children: ReactNode }) => {
    const [user, setUser] = useState<User | null>(null);
    const [role, setRole] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setLoading(true);
            if (currentUser) {
                setUser(currentUser);

                // Fetch Role from Firestore 'sys_admin_users'
                try {
                    const q = query(
                        collection(db, "sys_admin_users"),
                        where("email", "==", currentUser.email)
                    );
                    const querySnapshot = await getDocs(q);

                    if (!querySnapshot.empty) {
                        // Assuming email is unique and we take the first match
                        const userDoc = querySnapshot.docs[0].data();
                        setRole(userDoc.rol || "guest");
                    } else {
                        // User exists in Auth but not in our DB
                        setRole("guest");
                    }
                } catch (error) {
                    console.error("Error fetching user role:", error);
                    setRole("guest");
                }
            } else {
                setUser(null);
                setRole(null);
            }
            setLoading(false);
        });

        // Cleanup subscription
        return () => unsubscribe();
    }, []);

    const logout = async () => {
        setLoading(true);
        try {
            await signOut(auth);
            setUser(null);
            setRole(null);
        } catch (error) {
            console.error("Error signing out:", error);
        } finally {
            setLoading(false);
        }
    };

    const loginWithGoogle = async () => {
        try {
            const provider = new GoogleAuthProvider();
            await signInWithPopup(auth, provider);
        } catch (error) {
            console.error("Error logging in with Google:", error);
            throw error;
        }
    };

    return (
        <AuthContext.Provider value={{ user, role, loading, logout, loginWithGoogle }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
};
