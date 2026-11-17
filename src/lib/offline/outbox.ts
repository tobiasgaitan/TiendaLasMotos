/**
 * Barrel público del outbox offline.
 *
 * Mantiene la API histórica de `@/lib/offline/outbox` y delega la
 * implementación en los módulos de types, db, images y sync.
 */
export * from './outbox/types';
export * from './outbox/db';
export { prepararFotoConteo } from './outbox/images';
export * from './outbox/sync';
