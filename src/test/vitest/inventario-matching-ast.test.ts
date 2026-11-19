import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const MATCHING_PATH = 'src/lib/inventario/matching.ts';
const SCHEMAS_PATH = 'src/lib/actions/inventario-schemas.ts';
const FORM_ASESOR_PATH =
    'src/app/admin/inventario-asesor/ConteoAsesorForm.tsx';

const REFERENCIA_SCHEMA_SHA256 =
    '1be94dea1ccee09e6f72f80be8f413333a6025e8588002547a70e092073ef7f5';

const IMPORT_PERMITIDOS_MATCHING = [
    '@/lib/actions/vision-mapping',
    '@/types/inventario',
];

function parsear(ruta: string, kind: ts.ScriptKind): ts.SourceFile {
    return ts.createSourceFile(
        ruta,
        readFileSync(ruta, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        kind
    );
}

function importsDe(sf: ts.SourceFile): string[] {
    const modulos: string[] = [];
    for (const statement of sf.statements) {
        if (
            ts.isImportDeclaration(statement) &&
            ts.isStringLiteral(statement.moduleSpecifier)
        ) {
            modulos.push(statement.moduleSpecifier.text);
        }
    }
    return modulos;
}

function funcionesExportadas(sf: ts.SourceFile): string[] {
    const nombres: string[] = [];
    for (const statement of sf.statements) {
        if (
            ts.isFunctionDeclaration(statement) &&
            statement.name &&
            statement.modifiers?.some(
                (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
            )
        ) {
            nombres.push(statement.name.text);
        }
    }
    return nombres;
}

function identificadores(sf: ts.SourceFile): string[] {
    const nombres: string[] = [];
    const visitar = (node: ts.Node): void => {
        if (ts.isIdentifier(node)) nombres.push(node.text);
        ts.forEachChild(node, visitar);
    };
    visitar(sf);
    return nombres;
}

function buscarVariable(
    sf: ts.SourceFile,
    nombre: string
): ts.VariableDeclaration | null {
    let encontrada: ts.VariableDeclaration | null = null;
    const visitar = (node: ts.Node): void => {
        if (
            ts.isVariableDeclaration(node) &&
            node.name.getText(sf) === nombre
        ) {
            encontrada = node;
        }
        ts.forEachChild(node, visitar);
    };
    visitar(sf);
    return encontrada;
}

function usaSafeParseDe(
    sf: ts.SourceFile,
    identificador: string
): boolean {
    let encontrado = false;
    const visitar = (node: ts.Node): void => {
        if (
            ts.isCallExpression(node) &&
            ts.isPropertyAccessExpression(node.expression) &&
            ts.isIdentifier(node.expression.expression) &&
            node.expression.expression.text === identificador &&
            node.expression.name.text === 'safeParse'
        ) {
            encontrado = true;
        }
        ts.forEachChild(node, visitar);
    };
    visitar(sf);
    return encontrado;
}

describe('inventario matching AST guard', () => {
    it('matching.ts solo importa la capa permitida y es puro', () => {
        const sf = parsear(MATCHING_PATH, ts.ScriptKind.TS);

        expect(importsDe(sf).sort()).toEqual(
            [...IMPORT_PERMITIDOS_MATCHING].sort()
        );

        expect(funcionesExportadas(sf).sort()).toEqual(
            ['normalizarTexto', 'rankearCandidatos', 'tokenizar'].sort()
        );

        const prohibidos = identificadores(sf).filter((nombre) =>
            ['firebase', 'react', 'document', 'window'].includes(nombre)
        );
        expect(prohibidos).toEqual([]);
    });

    it('congela el byte-intacto de referenciaSchema', () => {
        const sf = parsear(SCHEMAS_PATH, ts.ScriptKind.TS);
        const declaracion = buscarVariable(sf, 'referenciaSchema');

        expect(declaracion).not.toBeNull();
        expect(declaracion?.initializer).toBeTruthy();

        const inicializador = declaracion?.initializer?.getText(sf) ?? '';
        const hash = createHash('sha256')
            .update(inicializador)
            .digest('hex');

        expect(inicializador).toContain('.trim()');
        expect(inicializador).toContain('.toUpperCase()');
        expect(inicializador).toContain(
            '.regex(/^[A-Z0-9][A-Z0-9._-]{0,63}$/'
        );
        expect(hash).toBe(REFERENCIA_SCHEMA_SHA256);

        console.log('MATCHING_AST=PASS');
        console.log(`REFERENCIA_SCHEMA_SHA256=${hash}`);
    });

    it('el formulario offline del asesor usa el schema canónico trim', () => {
        const sf = parsear(FORM_ASESOR_PATH, ts.ScriptKind.TSX);

        expect(importsDe(sf)).toContain(
            '@/lib/actions/inventario-schemas'
        );

        const nombresImportados = sf.statements.flatMap((statement) => {
            if (
                !ts.isImportDeclaration(statement) ||
                !ts.isStringLiteral(statement.moduleSpecifier) ||
                statement.moduleSpecifier.text !==
                    '@/lib/actions/inventario-schemas'
            ) {
                return [];
            }
            const clause = statement.importClause;
            if (!clause?.namedBindings) return [];
            if (!ts.isNamedImports(clause.namedBindings)) return [];
            return clause.namedBindings.elements.map((elemento) =>
                elemento.name.text
            );
        });

        expect(nombresImportados).toContain('referenciaSchema');
        expect(nombresImportados).not.toContain(
            'referenciaRepuestoEstrictaSchema'
        );
        expect(usaSafeParseDe(sf, 'referenciaSchema')).toBe(true);
    });
});
