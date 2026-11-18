export class AuthorizationError extends Error {
    constructor(message = 'No autorizado.') {
        super(message);
        this.name = 'AuthorizationError';
    }
}
