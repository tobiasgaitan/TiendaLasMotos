/**
 * WEB-FIX-PR689-SEQUENCING-001 — Prepara firebase-frameworks parchado
 * como dependencia local incluida en el source del function.
 *
 * El ZIP de Functions ignora node_modules. Por eso el parche debe viajar
 * como un tarball dentro del source que Cloud Build instala:
 *
 *   .firebase/<site>/functions/vendor/firebase-frameworks-0.11.8-pr689.tgz
 *
 * El hook corre en hosting.predeploy, después de prepareFrameworks/npm i
 * y antes de prepareFunctionsUpload.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
    cpSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    renameSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

const PROJECT_ROOT = resolve(process.cwd());
const VERSION_VULNERABLE = '0.11.8';
const VERSION_FIXED = '0.11.9';
const PATCHED_VERSION = '0.11.8-pr689';
const BASELINE_SHA256 =
    'd6669094bc3d3faf067e150bd4f4ff622e3220ed1c98496ca22f747727b25e67';
const PATCHED_SHA256 =
    '973a836ed72cab54e39f2ffff6b3ff70bcf2c790fe616f23303aa18f38c457dc';
const RUNTIME_MARKER = 'FIREBASE_FRAMEWORKS_PR689_PATCH_ACTIVE=1';
const TARBALL_NAME = `firebase-frameworks-${PATCHED_VERSION}.tgz`;
const TARBALL_REL = `vendor/${TARBALL_NAME}`;
const SITES = ['tiendalasmotos', 'tiendalasmotos-beta'];

const CHANGE_1_FROM = '    allowStale: true,\n';
const CHANGE_1_TO = '';

const CHANGE_2_FROM = `        if (isRevoked)
            return;
        const random = Math.random().toString(36).split(".")[1];
`;
const CHANGE_2_TO = `        if (isRevoked)
            return;
        // A concurrent request may have initialized the app while we awaited
        app = firebaseAppsLRU.get(uid);
    }
    if (!app) {
        const random = Math.random().toString(36).split(".")[1];
`;

const CHANGE_3_FROM = `        await handleAuth(req, res);
        frameworkHandle(req, res);
`;
const CHANGE_3_TO = `        // Auth failure = unauthenticated request
        await handleAuth(req, res).catch((e) => console.error(e.message));
        frameworkHandle(req, res);
`;

class PrepareError extends Error {
    constructor(code, detail) {
        super(`${code}: ${detail}`);
        this.code = code;
        this.detail = detail;
    }
}

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}

function readJson(path) {
    return JSON.parse(readFileSync(path, 'utf8'));
}

function countOccurrences(source, needle) {
    if (!needle) return 0;
    let count = 0;
    let index = source.indexOf(needle);
    while (index !== -1) {
        count += 1;
        index = source.indexOf(needle, index + needle.length);
    }
    return count;
}

function replaceExactlyOnce(source, from, to, label) {
    const count = countOccurrences(source, from);
    if (count !== 1) {
        throw new PrepareError(
            'ABORT_PATTERN_NOT_FOUND',
            `${label}: expected exactly 1 occurrence, found ${count}`
        );
    }
    return source.replace(from, to);
}

function applyAllChanges(source) {
    let result = replaceExactlyOnce(
        source,
        CHANGE_1_FROM,
        CHANGE_1_TO,
        'change_1_allowStale'
    );
    result = replaceExactlyOnce(
        result,
        CHANGE_2_FROM,
        CHANGE_2_TO,
        'change_2_recheck_after_await'
    );
    result = replaceExactlyOnce(
        result,
        CHANGE_3_FROM,
        CHANGE_3_TO,
        'change_3_catch_handleAuth'
    );
    return result;
}

function bundleDir(site, root = PROJECT_ROOT) {
    return join(root, '.firebase', site, 'functions');
}

function installedPackageDir(site, root = PROJECT_ROOT) {
    return join(bundleDir(site, root), 'node_modules', 'firebase-frameworks');
}

function tarballPath(site, root = PROJECT_ROOT) {
    return join(bundleDir(site, root), TARBALL_REL);
}

function ensureMarker(indexSource) {
    if (indexSource.includes(RUNTIME_MARKER)) return indexSource;
    return `console.log('${RUNTIME_MARKER}');\n${indexSource}`;
}

function buildTarball(sourcePackageDir, destinationDir) {
    const tempRoot = mkdtempSync(join(tmpdir(), 'fw689-tarball-'));
    const tempPackage = join(tempRoot, 'package');
    try {
        mkdirSync(join(tempPackage, 'dist'), { recursive: true });
        cpSync(join(sourcePackageDir, 'package.json'), join(tempPackage, 'package.json'));
        cpSync(join(sourcePackageDir, 'dist'), join(tempPackage, 'dist'), {
            recursive: true,
        });

        const sourceFile = join(tempPackage, 'dist', 'firebase-aware.js');
        const source = readFileSync(sourceFile, 'utf8');
        const sourceSha = sha256(source);
        let patched;
        if (sourceSha === PATCHED_SHA256) {
            patched = source;
        } else if (sourceSha === BASELINE_SHA256) {
            patched = applyAllChanges(source);
        } else {
            throw new PrepareError('ABORT_SHA_MISMATCH', sourceSha);
        }
        if (sha256(patched) !== PATCHED_SHA256) {
            throw new PrepareError(
                'ABORT_PATCHED_SHA_MISMATCH',
                sha256(patched)
            );
        }
        writeFileSync(sourceFile, patched, 'utf8');

        const indexPath = join(tempPackage, 'dist', 'index.js');
        const indexSource = readFileSync(indexPath, 'utf8');
        const markedIndex = ensureMarker(indexSource);
        writeFileSync(indexPath, markedIndex, 'utf8');
        if (!readFileSync(indexPath, 'utf8').includes(RUNTIME_MARKER)) {
            throw new PrepareError('ABORT_MARKER_MISSING', indexPath);
        }

        const packageJsonPath = join(tempPackage, 'package.json');
        const packageJson = readJson(packageJsonPath);
        packageJson.version = PATCHED_VERSION;
        writeFileSync(
            packageJsonPath,
            `${JSON.stringify(packageJson, null, 2)}\n`,
            'utf8'
        );

        mkdirSync(destinationDir, { recursive: true });
        const output = execFileSync(
            'npm',
            ['pack', '--pack-destination', destinationDir],
            {
                cwd: tempPackage,
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'pipe'],
            }
        ).trim();
        const generatedName = output.split('\n').filter(Boolean).pop();
        if (!generatedName) {
            throw new PrepareError('NPM_PACK_FAILED', output);
        }
        const generated = join(destinationDir, basename(generatedName));
        if (!existsSync(generated)) {
            throw new PrepareError('NPM_PACK_FAILED', generated);
        }
        const finalPath = join(destinationDir, TARBALL_NAME);
        if (resolve(generated) !== resolve(finalPath)) {
            renameSync(generated, finalPath);
        }
        const tarballSha = sha256(readFileSync(finalPath));
        return { tarballPath: finalPath, tarballSha };
    } finally {
        rmSync(tempRoot, { recursive: true, force: true });
    }
}

function updatePackageJsonAndLock(site) {
    const dir = bundleDir(site);
    const packageJsonPath = join(dir, 'package.json');
    const lockPath = join(dir, 'package-lock.json');
    const packageJson = readJson(packageJsonPath);
    packageJson.dependencies = packageJson.dependencies || {};
    packageJson.dependencies['firebase-frameworks'] = `file:${TARBALL_REL}`;
    writeFileSync(
        packageJsonPath,
        `${JSON.stringify(packageJson, null, 2)}\n`,
        'utf8'
    );

    execFileSync(
        'npm',
        [
            'install',
            '--package-lock-only',
            '--ignore-scripts',
            '--no-audit',
        ],
        {
            cwd: dir,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        }
    );

    const lock = readJson(lockPath);
    const rootDeps = lock.packages?.['']?.dependencies ?? {};
    const locked = lock.packages?.['node_modules/firebase-frameworks'] ?? {};
    if (rootDeps['firebase-frameworks'] !== `file:${TARBALL_REL}`) {
        throw new PrepareError(
            'LOCK_ROOT_DEP_MISMATCH',
            String(rootDeps['firebase-frameworks'])
        );
    }
    if (locked.version !== PATCHED_VERSION) {
        throw new PrepareError(
            'LOCK_VERSION_MISMATCH',
            String(locked.version)
        );
    }
    if (locked.resolved !== `file:${TARBALL_REL}`) {
        throw new PrepareError(
            'LOCK_RESOLVED_MISMATCH',
            String(locked.resolved)
        );
    }
    return { packageJsonPath, lockPath };
}

function prepareSite(site) {
    const dir = bundleDir(site);
    const pkgDir = installedPackageDir(site);
    if (!existsSync(join(dir, 'package.json'))) {
        throw new PrepareError('BUNDLE_MISSING', dir);
    }
    if (!existsSync(join(pkgDir, 'package.json'))) {
        throw new PrepareError('PACKAGE_MISSING', pkgDir);
    }

    const installed = readJson(join(pkgDir, 'package.json'));
    if (installed.version === VERSION_FIXED) {
        const result = {
            site,
            status: 'DISABLED',
            reason: 'FIREBASE_FRAMEWORKS_PATCH_DISABLED_UPSTREAM_FIX_PRESENT',
            version: installed.version,
        };
        console.log(
            `FIREBASE_FRAMEWORKS_PATCH_DISABLED_UPSTREAM_FIX_PRESENT site=${site} version=${installed.version}`
        );
        console.log(JSON.stringify(result));
        return result;
    }
    if (installed.version !== VERSION_VULNERABLE) {
        throw new PrepareError(
            'ABORT_VERSION_MISMATCH',
            `${site}: ${installed.version}`
        );
    }

    const target = join(dir, TARBALL_REL);
    const packageJson = readJson(join(dir, 'package.json'));
    const lock = readJson(join(dir, 'package-lock.json'));
    const alreadyDeclared =
        packageJson.dependencies?.['firebase-frameworks'] ===
        `file:${TARBALL_REL}`;
    const alreadyLocked =
        lock.packages?.['node_modules/firebase-frameworks']?.version ===
        PATCHED_VERSION;
    if (alreadyDeclared && alreadyLocked && existsSync(target)) {
        const tarballSha = sha256(readFileSync(target));
        const result = {
            site,
            status: 'ALREADY_PREPARED',
            tarball_sha256: tarballSha,
            patched_sha256: PATCHED_SHA256,
            runtime_marker: RUNTIME_MARKER,
        };
        console.log(
            `FIREBASE_FRAMEWORKS_TARBALL_ALREADY_PREPARED site=${site} tarball_sha256=${tarballSha}`
        );
        console.log(JSON.stringify(result));
        return result;
    }

    const { tarballPath: builtPath, tarballSha } = buildTarball(
        pkgDir,
        join(dir, 'vendor')
    );
    if (basename(builtPath) !== TARBALL_NAME) {
        throw new PrepareError('TARBALL_NAME_MISMATCH', basename(builtPath));
    }
    updatePackageJsonAndLock(site);

    const result = {
        site,
        status: 'PREPARED',
        tarball: TARBALL_REL,
        tarball_sha256: tarballSha,
        patched_sha256: PATCHED_SHA256,
        runtime_marker: RUNTIME_MARKER,
    };
    console.log(
        `FIREBASE_FRAMEWORKS_TARBALL_PREPARED site=${site} tarball_sha256=${tarballSha} patched_sha256=${PATCHED_SHA256}`
    );
    console.log(JSON.stringify(result));
    return result;
}

function parseArgs(argv) {
    const options = { site: null, all: false, selfTest: false, help: false };
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--help' || arg === '-h') {
            options.help = true;
            continue;
        }
        if (arg === '--all') {
            options.all = true;
            continue;
        }
        if (arg === '--self-test') {
            options.selfTest = true;
            continue;
        }
        if (arg === '--site') {
            options.site = (argv[index + 1] ?? '').trim();
            index += 1;
            continue;
        }
        if (arg.startsWith('--site=')) {
            options.site = arg.slice('--site='.length).trim();
            continue;
        }
        throw new PrepareError('ARG_INVALIDO', arg);
    }
    return options;
}

function printHelp() {
    console.log(
        'Uso: --site=<site> | --all | --self-test. Sites: tiendalasmotos, tiendalasmotos-beta'
    );
}

function runSelfTest() {
    const site = SITES.find((candidate) =>
        existsSync(installedPackageDir(candidate))
    );
    if (!site) {
        throw new PrepareError('SELF_TEST_SOURCE_MISSING', 'sin bundle');
    }
    const tempRoot = mkdtempSync(join(tmpdir(), 'fw689-selftest-'));
    try {
        const { tarballPath: builtPath, tarballSha } = buildTarball(
            installedPackageDir(site),
            join(tempRoot, 'vendor')
        );
        if (!existsSync(builtPath)) {
            throw new PrepareError('SELF_TEST_TARBALL_MISSING', builtPath);
        }
        if (!tarballSha) {
            throw new PrepareError('SELF_TEST_TARBALL_SHA_MISSING', '');
        }
        console.log(`SELF_TEST_SITE=${site}`);
        console.log(`SELF_TEST_TARBALL=${basename(builtPath)}`);
        console.log(`SELF_TEST_TARBALL_SHA256=${tarballSha}`);
        console.log(`SELF_TEST_PATCHED_SHA256=${PATCHED_SHA256}`);
        console.log('SELF_TEST=PASS');
    } finally {
        rmSync(tempRoot, { recursive: true, force: true });
    }
}

function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        printHelp();
        return;
    }
    if (options.selfTest) {
        runSelfTest();
        return;
    }
    if (options.all) {
        const sites = SITES.filter((site) =>
            existsSync(installedPackageDir(site))
        );
        if (sites.length === 0) {
            throw new PrepareError('NO_BUNDLES', 'no hay bundles .firebase');
        }
        for (const site of sites) prepareSite(site);
        return;
    }
    if (!options.site) {
        throw new PrepareError('SITE_REQUERIDO', 'usa --site=<site> o --all');
    }
    if (!SITES.includes(options.site)) {
        throw new PrepareError('SITE_NO_AUTORIZADO', options.site);
    }
    prepareSite(options.site);
}

try {
    main();
} catch (error) {
    if (error instanceof PrepareError) {
        console.error(`ERROR ${error.code}: ${error.detail}`);
    } else {
        console.error(
            `ERROR UNEXPECTED: ${error instanceof Error ? error.message : error}`
        );
    }
    process.exitCode = 1;
}
