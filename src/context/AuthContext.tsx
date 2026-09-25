"use client";

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import {
    onAuthStateChanged,
    User,
    signOut,
    GoogleAuthProvider,
    signInWithPopup
} from "firebase/auth";
import { collection, query, where, getDocs, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import {
    DEFAULT_MATRIZ,
    esRolValido,
    puede,
    type Accion,
    type ColeccionPermiso,
    type MatrizRol,
    type Rol,
} from "@/types/roles";
import { resolverRol } from "@/lib/auth/resolve-rol";

// Define the shape of our context
interface AuthContextType {
    user: User | null;
    role: string | null;
    loading: boolean;
    logout: () => Promise<void>;
    loginWithGoogle: () => Promise<void>;
    /** Gating visual por matriz (no es barrera de seguridad; el servidor re-valida). */
    puedeAccion: (coleccion: ColeccionPermiso, accion: Accion) => boolean;
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
    // Matriz de permisos cacheada en memoria (P5); fallback = DEFAULT_MATRIZ.
    const [matriz, setMatriz] = useState<MatrizRol>(DEFAULT_MATRIZ);

    // Suscripción a sys_permissions_matrix con invalidación automática.
    useEffect(() => {
        let mounted = true;
        try {
            const unsub = onSnapshot(
                collection(db, "sys_permissions_matrix"),
                (snap) => {
                    if (!mounted || snap.empty) return;
                    setMatriz((prev) => {
                        const next: MatrizRol = { ...prev };
                        snap.docs.forEach((d) => {
                            const data = d.data() as { rol?: unknown; permisos?: unknown; activo?: boolean };
                            const keyRaw = typeof data.rol === 'string' ? data.rol : d.id;
                            if (!esRolValido(keyRaw)) return;
                            const key = keyRaw.toLowerCase() as Rol;
                            if (data.activo === false) return;
                            if (!data.permisos || typeof data.permisos !== 'object') return;
                            next[key] = data.permisos as MatrizRol[typeof key];
                        });
                        return next;
                    });
                },
                (error) => console.error("Error suscribiendo matriz de permisos:", error)
            );
            return () => {
                mounted = false;
                unsub();
            };
        } catch (error) {
            console.error("Error iniciando suscripción de permisos:", error);
            return () => {
                mounted = false;
            };
        }
    }, []);

    useEffect(() => {
        let mounted = true;

        // Safety timeout: If Firebase auth takes too long (e.g. network issues), force loading to false to allow access as guest
        const safetyTimeout = setTimeout(() => {
            if (mounted && loading) {
                console.warn("Firebase Auth timed out. Defaulting to guest.");
                setLoading(false);
            }
        }, 8000); // 8 seconds timeout

        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (!mounted) return;
            // Clear timeout if auth flow activates
            clearTimeout(safetyTimeout);

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

                    if (!querySnapshot.empty && mounted) {
                        // Assuming email is unique and we take the first match
                        const userDoc = querySnapshot.docs[0].data();
                        // P5: lectura resiliente rol ?? role (+ legacy vendedor→cobrador)
                        setRole(resolverRol(userDoc as Record<string, unknown>));
                    } else if (mounted) {
                        // User exists in Auth but not in our DB
                        setRole("guest");
                    }
                } catch (error) {
                    console.error("Error fetching user role:", error);
                    if (mounted) setRole("guest");
                }
            } else {
                if (mounted) {
                    setUser(null);
                    setRole(null);
                }
            }
            if (mounted) setLoading(false);
        });

        // Cleanup subscription
        return () => {
            mounted = false;
            clearTimeout(safetyTimeout);
            unsubscribe();
        };
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

    const puedeAccion = useCallback(
        (coleccion: ColeccionPermiso, accion: Accion): boolean => {
            const r = (role ?? 'guest').toLowerCase();
            if (!esRolValido(r)) return false;
            return puede(matriz[r as Rol], coleccion, accion);
        },
        [matriz, role]
    );

    return (
        <AuthContext.Provider value={{ user, role, loading, logout, loginWithGoogle, puedeAccion }}>
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
