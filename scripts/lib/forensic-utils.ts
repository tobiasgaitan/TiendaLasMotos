/**
 * Utilidades compartidas para los scripts forenses y de purga.
 *
 * Centraliza el andamiaje que antes estaba duplicado en cada script:
 *   - Inicialización de Firebase con guardia de proyecto.
 *   - Validación/creación del directorio de evidencias fuera del repo.
 *   - Escritura de JSON + report.md + manifest.json con hashes SHA-256.
 *   - Confirmación interactiva para operaciones destructivas.
 */
import { hash as cryptoHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const CONFIRMATION_WORD = 'CONFIRMAR';

function sha256(value: string): string {
    return cryptoHash('sha256', value, 'hex');
}

export interface InitFirebaseGuardedOptions {
    outDir: string;
    projectId: string;
}

/**
 * Inicializa Firebase Admin y valida que el proyecto sea el esperado.
 *
 * Si `process.env.PROJECT_ID` está definido, debe coincidir con
 * `options.projectId`; si no está definido se usa `options.projectId`
 * (comportamiento previo de los scripts). También se valida el proyecto
 * con el que quedó inicializada la app.
 */
export function initFirebaseGuarded(options: InitFirebaseGuardedOptions): {
    db: ReturnType<typeof getFirestore>;
    storage: ReturnType<typeof getStorage>;
} {
    const envProjectId = process.env.PROJECT_ID?.trim();
    if (envProjectId && envProjectId !== options.projectId) {
        throw new Error(
            `PROYECTO_NO_AUTORIZADO: process.env.PROJECT_ID=${envProjectId} ` +
                `no coincide con ${options.projectId} (outDir=${options.outDir})`
        );
    }

    const app = getApps()[0] ?? initializeApp({ projectId: options.projectId });
    const appProjectId = app.options.projectId;
    if (appProjectId && appProjectId !== options.projectId) {
        throw new Error(
            `PROYECTO_NO_AUTORIZADO: app=${appProjectId}, esperado ${options.projectId}`
        );
    }

    return {
        db: getFirestore(app),
        storage: getStorage(app),
    };
}

/**
 * Resuelve `outDir`, verifica que esté fuera del repositorio y crea el
 * directorio (recursivo) si no existe. Devuelve la ruta absoluta resuelta.
 */
export function assertOutDirOutsideRepo(
    outDir: string,
    repoRoot: string = process.cwd()
): string {
    const resolved = resolve(outDir);
    const repo = resolve(repoRoot);
    if (resolved === repo || resolved.startsWith(`${repo}${sep}`)) {
        throw new Error(
            `OUT_DIR_INVALIDO: --out no puede estar dentro del repositorio: ${resolved}`
        );
    }
    mkdirSync(resolved, { recursive: true });
    return resolved;
}

export interface WriteManifestResult {
    manifest: Record<string, unknown>;
    hashes: Record<string, string>;
}

/**
 * Escribe `fileName` (JSON), los archivos extra opcionales, `report.md` y
 * `manifest.json` con los hashes SHA-256 de todo lo escrito.
 *
 * `extraFiles` permite conservar los artefactos adicionales de cada script
 * (por ejemplo, los 10 JSON del forense P6) sin duplicar la lógica de
 * serialización/hashing. `manifestMeta` se mezcla en el manifest para
 * conservar metadatos como ticket, modo, proyecto o whitelist.
 */
export function writeManifestAndReport(
    outDir: string,
    fileName: string,
    data: unknown,
    reportText: string,
    extraFiles: Record<string, unknown> = {},
    manifestMeta: Record<string, unknown> = {},
    hashField: string = 'hashes'
): WriteManifestResult {
    mkdirSync(outDir, { recursive: true });

    const hashes: Record<string, string> = {};

    const writeFile = (name: string, value: unknown): void => {
        const serialized =
            typeof value === 'string'
                ? value.endsWith('\n')
                    ? value
                    : `${value}\n`
                : `${JSON.stringify(value, null, 2)}\n`;
        writeFileSync(join(outDir, name), serialized, 'utf8');
        hashes[name] = sha256(serialized);
    };

    writeFile(fileName, data);
    for (const [name, value] of Object.entries(extraFiles)) {
        if (name === fileName || name === 'report.md' || name === 'manifest.json') {
            throw new Error(`ARCHIVO_RESERVADO: ${name}`);
        }
        writeFile(name, value);
    }

    const report = `${reportText}\n`;
    writeFileSync(join(outDir, 'report.md'), report, 'utf8');
    hashes['report.md'] = sha256(report);

    const manifest: Record<string, unknown> = {
        ...manifestMeta,
        [hashField]: hashes,
        outputs: [...Object.keys(hashes), 'manifest.json'],
    };
    writeFileSync(
        join(outDir, 'manifest.json'),
        `${JSON.stringify(manifest, null, 2)}\n`,
        'utf8'
    );

    return { manifest, hashes };
}

/**
 * Pide confirmación interactiva antes de una operación destructiva.
 *
 * Devuelve `true` solo si el usuario escribe exactamente la frase esperada
 * (`CONFIRMAR` por defecto). Lanza si no hay TTY para evitar confirmaciones
 * accidentales en pipelines.
 */
export async function requireConfirmation(
    message: string,
    expectedPhrase: string = CONFIRMATION_WORD
): Promise<boolean> {
    if (!input.isTTY) {
        throw new Error(
            'TTY_REQUIRED: se requiere una terminal interactiva para confirmar'
        );
    }

    console.log(`\n${message}`);
    console.log(`Frase requerida: ${expectedPhrase}`);

    const rl = createInterface({ input, output });
    try {
        const answer = await rl.question('> ');
        return answer.trim() === expectedPhrase;
    } finally {
        rl.close();
    }
}
