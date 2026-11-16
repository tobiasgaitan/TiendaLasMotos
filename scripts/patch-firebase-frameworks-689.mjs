/**
 * WEB-BACKPORT-PR689-001 — Backport idempotente de PR #689 a 0.11.8.
 *
 * Solo toca:
 *   .firebase/<site>/functions/node_modules/firebase-frameworks/dist/firebase-aware.js
 *
 * No modifica package.json/package-lock.json de la raíz.
 */
import { createHash } from 'node:crypto';
import {
    chmodSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    renameSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const PROJECT_ROOT = resolve(process.cwd());
const VERSION_VULNERABLE = '0.11.8';
const VERSION_FIXED = '0.11.9';
const BASELINE_SHA256 =
    'd6669094bc3d3faf067e150bd4f4ff622e3220ed1c98496ca22f747727b25e67';
const PATCHED_SHA256 =
    '973a836ed72cab54e39f2ffff6b3ff70bcf2c790fe616f23303aa18f38c457dc';
const SITES = ['tiendalasmotos', 'tiendalasmotos-beta'];
const PACKAGE_REL = 'node_modules/firebase-frameworks/package.json';
const FILE_REL =
    'node_modules/firebase-frameworks/dist/firebase-aware.js';

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

class PatchError extends Error {
    constructor(code, detail) {
        super(`${code}: ${detail}`);
        this.code = code;
        this.detail = detail;
    }
}

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}

function bundleDir(site, root = PROJECT_ROOT) {
    return join(root, '.firebase', site, 'functions');
}

function packagePath(site, root = PROJECT_ROOT) {
    return join(bundleDir(site, root), PACKAGE_REL);
}

function filePath(site, root = PROJECT_ROOT) {
    return join(bundleDir(site, root), FILE_REL);
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
        throw new PatchError(
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

function atomicWrite(path, content) {
    const mode = statSync(path).mode & 0o777;
    const tempPath = `${path}.tmp-${process.pid}-${Date.now()}`;
    try {
        writeFileSync(tempPath, content, { encoding: 'utf8', mode });
        chmodSync(tempPath, mode);
        renameSync(tempPath, path);
    } catch (error) {
        if (existsSync(tempPath)) {
            rmSync(tempPath, { force: true });
        }
        throw error;
    }
}

function emit(payload) {
    console.log(JSON.stringify(payload));
}

function patchSite(site, options = {}) {
    const { checkOnly = false, root = PROJECT_ROOT } = options;
    const pkgPath = packagePath(site, root);
    const targetPath = filePath(site, root);

    if (!existsSync(pkgPath)) {
        throw new PatchError('ABORT_BUNDLE_MISSING', pkgPath);
    }
    if (!existsSync(targetPath)) {
        throw new PatchError('ABORT_FILE_MISSING', targetPath);
    }

    const version = readJson(pkgPath).version;
    if (version === VERSION_FIXED) {
        const payload = {
            site,
            version,
            status: 'DISABLED',
            reason: 'FIREBASE_FRAMEWORKS_PATCH_DISABLED_UPSTREAM_FIX_PRESENT',
            changed: false,
        };
        console.log(
            `FIREBASE_FRAMEWORKS_PATCH_DISABLED_UPSTREAM_FIX_PRESENT site=${site} version=${version}`
        );
        emit(payload);
        return payload;
    }
    if (version !== VERSION_VULNERABLE) {
        throw new PatchError(
            'ABORT_VERSION_MISMATCH',
            `${site}: expected ${VERSION_VULNERABLE}, found ${version}`
        );
    }

    const source = readFileSync(targetPath, 'utf8');
    const currentSha = sha256(source);

    if (currentSha === PATCHED_SHA256) {
        const payload = {
            site,
            version,
            status: 'ALREADY_APPLIED',
            old_sha256: currentSha,
            new_sha256: currentSha,
            changes: 0,
            changed: false,
        };
        console.log(
            `FIREBASE_FRAMEWORKS_PATCH_ALREADY_APPLIED site=${site} sha256=${currentSha}`
        );
        emit(payload);
        return payload;
    }

    if (currentSha !== BASELINE_SHA256) {
        throw new PatchError(
            'ABORT_SHA_MISMATCH',
            `${site}: expected ${BASELINE_SHA256}, found ${currentSha}`
        );
    }

    if (checkOnly) {
        throw new PatchError(
            'CHECK_BASELINE_NOT_PATCHED',
            `${site}: file is baseline 0.11.8`
        );
    }

    const patched = applyAllChanges(source);
    const patchedSha = sha256(patched);
    if (patchedSha !== PATCHED_SHA256) {
        throw new PatchError(
            'ABORT_PATCHED_SHA_MISMATCH',
            `${site}: expected ${PATCHED_SHA256}, computed ${patchedSha}`
        );
    }

    atomicWrite(targetPath, patched);

    const payload = {
        site,
        version,
        status: 'APPLIED',
        old_sha256: currentSha,
        new_sha256: patchedSha,
        changes: 3,
        changed: true,
    };
    console.log(
        `FIREBASE_FRAMEWORKS_PATCH_APPLIED site=${site} old_sha256=${currentSha} new_sha256=${patchedSha}`
    );
    emit(payload);
    return payload;
}

function parseArgs(argv) {
    const options = {
        site: null,
        all: false,
        check: false,
        selfTest: false,
        help: false,
    };
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
        if (arg === '--check') {
            options.check = true;
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
        throw new PatchError('ARG_INVALIDO', arg);
    }
    return options;
}

function printHelp() {
    console.log(
        'Uso: --site=<tiendalasmotos|tiendalasmotos-beta> [--check] | --all [--check] | --self-test'
    );
}

function runSelfTest() {
    const results = [];
    const sourceSite = SITES.find((site) => existsSync(filePath(site)));
    if (!sourceSite) {
        throw new PatchError(
            'SELF_TEST_SOURCE_MISSING',
            'no hay bundle 0.11.8 para usar como fixture'
        );
    }
    const baseline = readFileSync(filePath(sourceSite), 'utf8');
    if (sha256(baseline) !== BASELINE_SHA256) {
        throw new PatchError(
            'SELF_TEST_SOURCE_NOT_BASELINE',
            `${sourceSite}: ${sha256(baseline)}`
        );
    }
    const expectedPatched = applyAllChanges(baseline);
    if (sha256(expectedPatched) !== PATCHED_SHA256) {
        throw new PatchError(
            'SELF_TEST_EXPECTED_SHA_MISMATCH',
            sha256(expectedPatched)
        );
    }

    const tempRoot = mkdtempSync(join(tmpdir(), 'fw689-selftest-'));
    const makeBundle = (site, version, content) => {
        const dir = bundleDir(site, tempRoot);
        const pkg = packagePath(site, tempRoot);
        const target = filePath(site, tempRoot);
        rmSync(join(dir, 'node_modules'), { recursive: true, force: true });
        mkdirSync(join(dir, 'node_modules/firebase-frameworks'), { recursive: true });
        mkdirSync(join(dir, 'node_modules/firebase-frameworks/dist'), {
            recursive: true,
        });
        writeFileSync(pkg, JSON.stringify({ name: 'firebase-frameworks', version }), 'utf8');
        writeFileSync(target, content, 'utf8');
    };

    try {
        // 1. 0.11.8 + baseline -> aplica
        makeBundle('case1', '0.11.8', baseline);
        const case1 = patchSite('case1', { root: tempRoot });
        results.push({
            name: '0.11.8_baseline_applies',
            pass: case1.status === 'APPLIED' && sha256(readFileSync(filePath('case1', tempRoot), 'utf8')) === PATCHED_SHA256,
        });

        // 2. segunda ejecución -> ALREADY_APPLIED
        const case2 = patchSite('case1', { root: tempRoot });
        results.push({
            name: 'second_run_already_applied',
            pass: case2.status === 'ALREADY_APPLIED',
        });

        // 3. 0.11.9 -> DISABLED sin escribir
        makeBundle('case3', '0.11.9', baseline);
        const case3 = patchSite('case3', { root: tempRoot });
        results.push({
            name: '0.11.9_disabled',
            pass: case3.status === 'DISABLED' && sha256(readFileSync(filePath('case3', tempRoot), 'utf8')) === BASELINE_SHA256,
        });

        // 4. versión distinta -> aborto
        makeBundle('case4', '0.11.7', baseline);
        let case4Pass = false;
        try {
            patchSite('case4', { root: tempRoot });
        } catch (error) {
            case4Pass = error instanceof PatchError && error.code === 'ABORT_VERSION_MISMATCH';
        }
        results.push({ name: 'version_mismatch_aborts', pass: case4Pass });

        // 5. SHA distinto -> aborto sin escritura
        makeBundle('case5', '0.11.8', `${baseline}\n`);
        let case5Pass = false;
        try {
            patchSite('case5', { root: tempRoot });
        } catch (error) {
            case5Pass = error instanceof PatchError && error.code === 'ABORT_SHA_MISMATCH';
        }
        results.push({
            name: 'sha_mismatch_aborts_without_write',
            pass: case5Pass && sha256(readFileSync(filePath('case5', tempRoot), 'utf8')) === sha256(`${baseline}\n`),
        });

        // 6. ancla parcial -> aborto de la transformación pura
        let case6Pass = false;
        try {
            applyAllChanges(baseline.replace(CHANGE_1_FROM, ''));
        } catch (error) {
            case6Pass = error instanceof PatchError && error.code === 'ABORT_PATTERN_NOT_FOUND';
        }
        results.push({ name: 'partial_anchor_aborts', pass: case6Pass });

        // 7. error de escritura -> original intacto
        makeBundle('case7', '0.11.8', baseline);
        const case7Target = filePath('case7', tempRoot);
        const case7Dir = join(bundleDir('case7', tempRoot), 'node_modules/firebase-frameworks/dist');
        let case7Pass = false;
        chmodSync(case7Dir, 0o555);
        try {
            const source = readFileSync(case7Target, 'utf8');
            const patched = applyAllChanges(source);
            atomicWrite(case7Target, patched);
        } catch {
            case7Pass = sha256(readFileSync(case7Target, 'utf8')) === BASELINE_SHA256;
        } finally {
            chmodSync(case7Dir, 0o755);
        }
        results.push({ name: 'write_error_preserves_original', pass: case7Pass });
    } finally {
        rmSync(tempRoot, { recursive: true, force: true });
    }

    const passed = results.filter((item) => item.pass).length;
    for (const result of results) {
        console.log(`${result.pass ? 'PASS' : 'FAIL'} ${result.name}`);
    }
    console.log(`SELF_TEST=${passed}/${results.length}`);
    if (passed !== results.length) {
        process.exitCode = 1;
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
        const sites = SITES.filter((site) => existsSync(packagePath(site)));
        if (sites.length === 0) {
            throw new PatchError('ABORT_NO_BUNDLES', 'no hay bundles .firebase');
        }
        for (const site of sites) {
            patchSite(site, { checkOnly: options.check });
        }
        return;
    }
    if (!options.site) {
        throw new PatchError('SITE_REQUERIDO', 'usa --site=<site> o --all');
    }
    if (!SITES.includes(options.site)) {
        throw new PatchError('SITE_NO_AUTORIZADO', options.site);
    }
    patchSite(options.site, { checkOnly: options.check });
}

try {
    main();
} catch (error) {
    if (error instanceof PatchError) {
        console.error(`ERROR ${error.code}: ${error.detail}`);
    } else {
        console.error(
            `ERROR UNEXPECTED: ${error instanceof Error ? error.message : error}`
        );
    }
    process.exitCode = 1;
}
