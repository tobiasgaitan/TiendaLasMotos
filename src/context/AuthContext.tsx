"use client";

import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from "react";
import {
    onAuthStateChanged,
    User,
    signOut,
    GoogleAuthProvider,
    signInWithPopup
} from "firebase/auth";
import { collection, doc, getDoc, onSnapshot } from "firebase/firestore";
import {
    auth,
    db,
    persistenciaOfflineLista,
    purgarPersistenciaOffline,
    CLAVE_FLAG_ASESOR,
    CLAVE_RECARGA_OFFLINE,
} from "@/lib/firebase";
import { limpiarOutbox } from "@/lib/offline/outbox";
import { limpiarCachesServiceWorker } from "@/lib/offline/purge";
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
import { puedeVerNodo as puedeVerNodoPuro, verGrupoCreditos as verGrupoCreditosPuro, type NodoSidebar } from "@/lib/auth/sidebar-visibility";

// Define the shape of our context
interface AuthContextType {
    user: User | null;
    role: string | null;
    loading: boolean;
    logout: () => Promise<void>;
    loginWithGoogle: () => Promise<void>;
    /** Gating visual por matriz (no es barrera de seguridad; el servidor re-valida). */
    puedeAccion: (coleccion: ColeccionPermiso, accion: Accion) => boolean;
    /** Gating visual de nodos del sidebar (contrato P5 + fail-closed). */
    puedeVerNodo: (nodo: NodoSidebar) => boolean;
    /** Visibilidad del grupo Gestión de Créditos. */
    verGrupoCreditos: () => boolean;
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
    // Permite cortar la suscripción antes de terminar Firestore en logout.
    const matrizDetenerRef = useRef<(() => void) | null>(null);
    const cierreEnCursoRef = useRef(false);

    // Suscripción a sys_permissions_matrix con invalidación automática.
    // WEB-038: espera a que la persistencia offline esté resuelta antes de
    // abrir el primer listener de Firestore.
    useEffect(() => {
        let mounted = true;
        let unsub: (() => void) | null = null;
        let detenido = false;

        const detener = () => {
            if (detenido) return;
            detenido = true;
            if (unsub) {
                try {
                    unsub();
                } catch (error) {
                    console.error(
                        "Error cerrando suscripción de permisos:",
                        error
                    );
                }
            }
            if (matrizDetenerRef.current === detener) {
                matrizDetenerRef.current = null;
            }
        };

        const iniciar = async () => {
            try {
                await persistenciaOfflineLista;
                if (!mounted || cierreEnCursoRef.current) return;

                unsub = onSnapshot(
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
                matrizDetenerRef.current = detener;
            } catch (error) {
                console.error("Error iniciando suscripción de permisos:", error);
            }
        };

        void iniciar();

        return () => {
            mounted = false;
            detener();
        };
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
                cierreEnCursoRef.current = false;
                setUser(currentUser);

                // Fetch Role from Firestore 'sys_admin_users' por docId (get, WEB-031).
                // El docId es el email canónico; no usa list (endurecido por rol).
                try {
                    // WEB-038: la persistencia debe estar lista antes del
                    // primer getDoc para que el rol pueda servirse de caché.
                    await persistenciaOfflineLista;
                    const usuarioActual = auth.currentUser;
                    if (
                        !mounted ||
                        !usuarioActual ||
                        usuarioActual.uid !== currentUser.uid
                    ) {
                        return;
                    }

                    const emailKey = (currentUser.email ?? "").toLowerCase().trim();
                    const docSnap = await getDoc(doc(db, "sys_admin_users", emailKey));

                    if (docSnap.exists() && mounted) {
                        // P5: lectura resiliente rol ?? role (+ legacy vendedor→cobrador)
                        setRole(resolverRol(docSnap.data() as Record<string, unknown>));
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
        const uid = user ? user.uid : "";
        setLoading(true);
        try {
            await signOut(auth);
            setUser(null);
            setRole(null);
        } catch (error) {
            console.error("Error signing out:", error);
        } finally {
            // WEB-038: cortar listeners antes de terminar Firestore y purgar
            // localStorage, IndexedDB (Firestore + outbox) y cachés del SW.
            cierreEnCursoRef.current = true;
            const detenerMatriz = matrizDetenerRef.current;
            if (detenerMatriz) {
                detenerMatriz();
            }

            const resultados = await Promise.allSettled([
                purgarPersistenciaOffline(),
                limpiarOutbox(uid),
                limpiarCachesServiceWorker(),
            ]);

            for (const resultado of resultados) {
                if (resultado.status === "rejected") {
                    console.error(
                        "Error purgando datos offline al cerrar sesión:",
                        resultado.reason
                    );
                }
            }

            setLoading(false);
        }
    };

    // WEB-038: solo asesor activa persistencia offline. El flag se escribe
    // después de resolver el rol y se hace UNA recarga controlada para que
    // src/lib/firebase.ts lo lea antes de inicializar Firestore.
    useEffect(() => {
        if (loading) return;
        if (typeof window === "undefined") return;

        try {
            if (role === "asesor") {
                const flag = window.localStorage.getItem(CLAVE_FLAG_ASESOR);
                if (flag !== "1") {
                    window.localStorage.setItem(CLAVE_FLAG_ASESOR, "1");
                    const recargaHecha =
                        window.sessionStorage.getItem(
                            CLAVE_RECARGA_OFFLINE
                        ) === "1";

                    if (!recargaHecha) {
                        window.sessionStorage.setItem(
                            CLAVE_RECARGA_OFFLINE,
                            "1"
                        );
                        window.location.reload();
                        return;
                    }

                    console.error(
                        "[pwa] El flag offline se activó sin recarga; la persistencia se aplicará en la próxima apertura."
                    );
                }
            } else if (role !== null) {
                window.localStorage.removeItem(CLAVE_FLAG_ASESOR);
                window.sessionStorage.removeItem(CLAVE_RECARGA_OFFLINE);
            }
        } catch (error) {
            console.error(
                "[pwa] No se pudo gestionar el flag offline del asesor:",
                error
            );
        }
    }, [role, loading]);

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

    const puedeVerNodo = useCallback(
        (nodo: NodoSidebar): boolean => {
            // Sin rol resuelto aún: visible (evita parpadeo; el layout ya exige login).
            if (loading || !role) return true;
            return puedeVerNodoPuro(role, matriz, nodo);
        },
        [matriz, role, loading]
    );

    const verGrupoCreditos = useCallback((): boolean => {
        if (loading || !role) return true;
        return verGrupoCreditosPuro(role, matriz);
    }, [matriz, role, loading]);

    return (
        <AuthContext.Provider value={{ user, role, loading, logout, loginWithGoogle, puedeAccion, puedeVerNodo, verGrupoCreditos }}>
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
