import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const fuentes = [
    'src/types/inventario.ts',
    'src/lib/offline/outbox.ts',
    'src/lib/offline/outbox-utils.ts',
    'src/lib/actions/inventario-schemas.ts',
    'src/app/admin/inventory/actions/crearConteoPendiente.ts',
    'src/app/admin/inventory/actions/aprobarConteo.ts',
    'src/app/admin/inventory/actions/rechazarConteo.ts',
    'src/app/admin/inventory/actions/listarPendientes.ts',
    'src/app/admin/inventario-repuestos/actions/crearRepuesto.ts',
    'src/app/admin/inventario-repuestos/actions/editarRepuesto.ts',
]
    .map((ruta) => readFileSync(ruta, 'utf8'))
    .join('\n');

const clavesFirestore = [
    'conteos_pendientes_repuestos',
    'fotos_inventario',
    'inventario_repuestos',
    'historial_auditoria_inventario',
    'conteo_id',
    'referencia',
    'sede_id',
    'referencias_alternativas',
    'inventario_documento_id',
    'referencia_confirmada',
    'referencia_sugerida',
    'descripcion',
    'cantidad_contada',
    'ubicacion',
    'anotaciones',
    'foto_url',
    'storage_path',
    'nombre_archivo',
    'mime_type',
    'tamano_bytes',
    'etiquetas_vision',
    'estado',
    'motivo_rechazo',
    'asesor_email',
    'asesor_uid',
    'creado_en',
    'revisado_por',
    'revisado_en',
    'registrado_por',
    'registrado_por_email',
    'documento_id',
    'coleccion_afectada',
    'operacion',
    'datos_anteriores',
    'datos_nuevos',
    'campos_modificados',
    'version',
];

const clavesIndexedDb = [
    'tlm_offline',
    'borradores_conteos',
    'fotos_borrador',
    'propietario_uid',
    'estado_envio',
    'intentos',
    'proximo_intento_en',
    'ultimo_error',
];

describe('NAMING LOCK', () => {
    it.each(clavesFirestore)(
        'conserva la clave Firestore %s',
        (clave) => {
            expect(fuentes).toContain(clave);
        }
    );

    it.each(clavesIndexedDb)(
        'conserva la clave IndexedDB %s',
        (clave) => {
            expect(fuentes).toContain(clave);
        }
    );

    it('no usa revisado_por_email como alias', () => {
        expect(fuentes).not.toContain('revisado_por_email');
    });
});
