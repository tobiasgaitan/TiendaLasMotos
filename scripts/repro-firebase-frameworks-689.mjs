/**
 * WEB-BACKPORT-PR689-001 — Reproducibilidad beta del race app/app-deleted.
 *
 * Hace N GET autenticados concurrentes con la misma cookie __session y mide:
 *   - status counts, tasa de 500, latencia media/p95
 *   - ocurrencias de app/app-deleted en Cloud Logging
 *   - fallas del hook de patch en el log de deploy
 *
 * No escribe en Firestore. Solo lecturas HTTP y consultas de logs.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const DEFAULT_PATH = '/admin/inventario-asesor';
const DEFAULT_N = 8;
const DEFAULT_PROJECT = 'tiendalasmotos';
const DEFAULT_SERVICE = 'ssrtiendalasmotosbeta';

function parseArgs(argv) {
    const options = {
        url: '',
        path: DEFAULT_PATH,
        cookie: '',
        n: DEFAULT_N,
        project: DEFAULT_PROJECT,
        service: DEFAULT_SERVICE,
        waitIdle: 0,
        out: '',
        deployLog: '',
        logJson: '',
        since: '',
        timeoutMs: 30000,
        help: false,
    };
    for (const arg of argv) {
        if (arg === '--help' || arg === '-h') {
            options.help = true;
            continue;
        }
        if (!arg.startsWith('--')) {
            throw new Error(`ARG_INVALIDO: ${arg}`);
        }
        const [key, ...rest] = arg.slice(2).split('=');
        const value = rest.join('=');
        switch (key) {
            case 'url':
                options.url = value;
                break;
            case 'path':
                options.path = value;
                break;
            case 'cookie':
                options.cookie = value;
                break;
            case 'n':
                options.n = Number(value);
                break;
            case 'project':
                options.project = value;
                break;
            case 'service':
                options.service = value;
                break;
            case 'wait-idle':
                options.waitIdle = Number(value);
                break;
            case 'out':
                options.out = value;
                break;
            case 'deploy-log':
                options.deployLog = value;
                break;
            case 'log-json':
                options.logJson = value;
                break;
            case 'since':
                options.since = value;
                break;
            case 'timeout-ms':
                options.timeoutMs = Number(value);
                break;
            default:
                throw new Error(`FLAG_NO_RECONOCIDO: --${key}`);
        }
    }
    return options;
}

function printHelp() {
    console.log(
        'Uso: --url=<base> --cookie="__session=..." [--path=/admin/inventario-asesor] [--n=8] [--wait-idle=0] [--deploy-log=<file>] [--log-json=<file>] [--out=<file>]'
    );
}

function percentile(values, p) {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.min(
        sorted.length - 1,
        Math.ceil((p / 100) * sorted.length) - 1
    );
    return Number(sorted[index].toFixed(2));
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function countAppDeleted(value) {
    if (typeof value === 'string') {
        return (value.match(/app\/app-deleted/g) ?? []).length;
    }
    if (Array.isArray(value)) {
        return value.reduce((total, item) => total + countAppDeleted(item), 0);
    }
    if (value && typeof value === 'object') {
        return Object.values(value).reduce(
            (total, item) => total + countAppDeleted(item),
            0
        );
    }
    return 0;
}

function queryCloudLogging(options, since) {
    if (options.logJson) {
        if (!existsSync(options.logJson)) {
            return { count: null, status: 'LOG_JSON_MISSING' };
        }
        const parsed = JSON.parse(readFileSync(options.logJson, 'utf8'));
        return { count: countAppDeleted(parsed), status: 'OK' };
    }
    const filter = [
        'resource.type="cloud_run_revision"',
        `resource.labels.service_name="${options.service}"`,
        `timestamp>="${since}"`,
        '(textPayload:"app/app-deleted" OR jsonPayload.message:"app/app-deleted")',
    ].join(' AND ');
    try {
        const output = execFileSync(
            'gcloud',
            [
                'logging',
                'read',
                filter,
                '--project',
                options.project,
                '--limit',
                '100',
                '--format',
                'json',
            ],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
        );
        return { count: countAppDeleted(output), status: 'OK' };
    } catch (error) {
        return {
            count: null,
            status: 'GCLOUD_ERROR',
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

function queryRuntimeMarker(options, since) {
    const markerWindow = new Date(
        new Date(since).getTime() - 2 * 60 * 60 * 1000
    ).toISOString();
    if (options.logJson) {
        if (!existsSync(options.logJson)) {
            return { present: null, status: 'LOG_JSON_MISSING' };
        }
        const parsed = JSON.parse(readFileSync(options.logJson, 'utf8'));
        const present = JSON.stringify(parsed).includes(
            'FIREBASE_FRAMEWORKS_PR689_PATCH_ACTIVE=1'
        );
        return { present, status: 'OK' };
    }
    const filter = [
        'resource.type="cloud_run_revision"',
        `resource.labels.service_name="${options.service}"`,
        `timestamp>="${markerWindow}"`,
        'textPayload:"FIREBASE_FRAMEWORKS_PR689_PATCH_ACTIVE=1"',
    ].join(' AND ');
    try {
        const output = execFileSync(
            'gcloud',
            [
                'logging',
                'read',
                filter,
                '--project',
                options.project,
                '--limit',
                '20',
                '--format',
                'json',
            ],
            { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
        );
        return {
            present: output.includes(
                'FIREBASE_FRAMEWORKS_PR689_PATCH_ACTIVE=1'
            ),
            status: 'OK',
            window_start_utc: markerWindow,
        };
    } catch (error) {
        return {
            present: null,
            status: 'GCLOUD_ERROR',
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

function checkDeployLog(path) {
    if (!path) return { failures: null, status: 'NOT_PROVIDED' };
    if (!existsSync(path)) return { failures: null, status: 'MISSING' };
    const content = readFileSync(path, 'utf8');
    const hasPrepared = content.includes(
        'FIREBASE_FRAMEWORKS_TARBALL_PREPARED'
    );
    const hasAlreadyPrepared = content.includes(
        'FIREBASE_FRAMEWORKS_TARBALL_ALREADY_PREPARED'
    );
    const hasApplied =
        hasPrepared || content.includes('FIREBASE_FRAMEWORKS_PATCH_APPLIED');
    const hasAlready =
        hasAlreadyPrepared ||
        content.includes('FIREBASE_FRAMEWORKS_PATCH_ALREADY_APPLIED');
    const hasPredeployError = /predeploy error/i.test(content);
    return {
        failures: hasPredeployError || (!hasApplied && !hasAlready) ? 1 : 0,
        status: 'OK',
        has_applied: hasApplied,
        has_already: hasAlready,
        has_prepared: hasPrepared,
        has_already_prepared: hasAlreadyPrepared,
        has_predeploy_error: hasPredeployError,
    };
}

async function main() {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
        printHelp();
        return;
    }
    if (!options.url) throw new Error('URL_REQUERIDA');
    if (!options.cookie.startsWith('__session=')) {
        throw new Error('COOKIE_INVALIDA: debe iniciar con __session=');
    }
    if (!Number.isInteger(options.n) || options.n < 5) {
        throw new Error('N_INVALIDO: debe ser entero >= 5');
    }
    if (!Number.isFinite(options.waitIdle) || options.waitIdle < 0) {
        throw new Error('WAIT_IDLE_INVALIDO');
    }

    if (options.waitIdle > 0) {
        console.log(`WAIT_IDLE_SECONDS=${options.waitIdle}`);
        await sleep(options.waitIdle * 1000);
    }

    const target = new URL(options.path, options.url).toString();
    const startedAt = new Date();
    const since = options.since || new Date(startedAt.getTime() - 10000).toISOString();
    console.log(`REPRO_URL=${target}`);
    console.log(`REPRO_N=${options.n}`);
    console.log(`REPRO_STARTED_AT_UTC=${startedAt.toISOString()}`);

    const requests = Array.from({ length: options.n }, async () => {
        const begin = performance.now();
        try {
            const response = await fetch(target, {
                method: 'GET',
                headers: {
                    Cookie: options.cookie,
                    'Cache-Control': 'no-cache',
                    Pragma: 'no-cache',
                },
                redirect: 'manual',
                signal: AbortSignal.timeout(options.timeoutMs),
            });
            await response.text();
            return {
                status: response.status,
                latency_ms: Number((performance.now() - begin).toFixed(2)),
                error: null,
            };
        } catch (error) {
            return {
                status: 0,
                latency_ms: Number((performance.now() - begin).toFixed(2)),
                error: error instanceof Error ? error.message : String(error),
            };
        }
    });

    const responses = await Promise.all(requests);
    const finishedAt = new Date();

    const statusCounts = {};
    for (const response of responses) {
        const key = String(response.status);
        statusCounts[key] = (statusCounts[key] ?? 0) + 1;
    }
    const latencies = responses.map((response) => response.latency_ms);
    const mean =
        latencies.length > 0
            ? Number(
                  (
                      latencies.reduce((total, value) => total + value, 0) /
                      latencies.length
                  ).toFixed(2)
              )
            : null;
    const rate500 = Number(
        ((statusCounts['500'] ?? 0) / options.n).toFixed(4)
    );

    const logs = queryCloudLogging(options, since);
    const runtime = queryRuntimeMarker(options, since);
    const deploy = checkDeployLog(options.deployLog);

    const ok200 = (statusCounts['200'] ?? 0) === options.n;
    const pass =
        ok200 &&
        rate500 === 0 &&
        logs.count === 0 &&
        runtime.present === true &&
        deploy.failures === 0;

    const report = {
        ticket: 'WEB-BACKPORT-PR689-001',
        mode: options.waitIdle > 0 ? 'idle' : 'cold',
        url: target,
        n: options.n,
        status_counts: statusCounts,
        rate_500: rate500,
        mean_latency_ms: mean,
        p95_latency_ms: percentile(latencies, 95),
        app_app_deleted_count: logs.count,
        log_query_status: logs.status,
        log_query_error: logs.error ?? null,
        runtime_marker_present: runtime.present,
        runtime_marker_status: runtime.status,
        runtime_marker_error: runtime.error ?? null,
        runtime_marker_window_start_utc: runtime.window_start_utc ?? null,
        hook_failures: deploy.failures,
        hook_status: deploy.status,
        hook_has_applied: deploy.has_applied ?? null,
        hook_has_already: deploy.has_already ?? null,
        hook_has_prepared: deploy.has_prepared ?? null,
        hook_has_already_prepared: deploy.has_already_prepared ?? null,
        hook_has_predeploy_error: deploy.has_predeploy_error ?? null,
        wait_idle_seconds: options.waitIdle,
        started_at_utc: startedAt.toISOString(),
        finished_at_utc: finishedAt.toISOString(),
        since_utc: since,
        pass,
        response_errors: responses
            .filter((response) => response.error)
            .map((response) => response.error),
    };

    console.log(`REPRO_200=${statusCounts['200'] ?? 0}`);
    console.log(`REPRO_500=${statusCounts['500'] ?? 0}`);
    console.log(`REPRO_APP_DELETED=${logs.count === null ? 'UNKNOWN' : logs.count}`);
    console.log(
        `REPRO_RUNTIME_MARKER=${runtime.present === null ? 'UNKNOWN' : runtime.present}`
    );
    console.log(
        `REPRO_HOOK_FAILURES=${deploy.failures === null ? 'UNKNOWN' : deploy.failures}`
    );
    console.log(`REPRO_RESULT=${pass ? 'PASS' : 'FAIL'}`);
    const serialized = `${JSON.stringify(report, null, 2)}\n`;
    console.log(serialized);

    if (options.out) {
        writeFileSync(options.out, serialized, 'utf8');
        console.log(`REPRO_OUT=${options.out}`);
    }
    if (!pass) {
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error(
        '[repro] ERROR:',
        error instanceof Error ? error.message : error
    );
    process.exitCode = 1;
});
