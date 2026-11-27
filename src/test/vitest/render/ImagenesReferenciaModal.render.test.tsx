import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ImagenesReferenciaModal from '@/app/admin/inventario-repuestos/components/ImagenesReferenciaModal';

const storageMocks = vi.hoisted(() => ({
    ref: vi.fn((_storage: unknown, path: string) => ({ path })),
    uploadBytes: vi.fn(),
    getDownloadURL: vi.fn(),
}));

vi.mock('firebase/storage', () => storageMocks);

vi.mock('@/lib/firebase', () => ({
    storage: {},
}));

vi.mock('@/context/AuthContext', () => ({
    useAuth: () => ({
        user: { email: 'admin@test.com' },
    }),
}));

vi.mock('sonner', () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}));

vi.mock('next/image', () => ({
    default: ({ src, alt }: { src: string; alt: string }) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt} />
    ),
}));

const IMAGEN_1 =
    'https://firebasestorage.googleapis.com/v0/b/tiendalasmotos.appspot.com/o/inventario_repuestos%2Fadmin%40test.com%2Fref-1.jpg?alt=media&token=1';
const IMAGEN_2 =
    'https://firebasestorage.googleapis.com/v0/b/tiendalasmotos.appspot.com/o/inventario_repuestos%2Fadmin%40test.com%2Fref-2.jpg?alt=media&token=2';

const PROPS_BASE = {
    isOpen: true,
    documentoId: 'doc-brk-001',
    referencia: 'BRK-001',
    imagenes: [] as string[],
    onClose: vi.fn(),
    onAplicar: vi.fn(),
};

function archivo(nombre = 'foto.jpg', tipo = 'image/jpeg'): File {
    return new File(['contenido'], nombre, { type: tipo });
}

describe('ImagenesReferenciaModal', () => {
    beforeEach(() => {
        storageMocks.ref.mockClear();
        storageMocks.uploadBytes.mockReset();
        storageMocks.getDownloadURL.mockReset();
        storageMocks.uploadBytes.mockResolvedValue(undefined);
        storageMocks.getDownloadURL.mockImplementation(
            async (storageRef: { path: string }) =>
                `https://firebasestorage.googleapis.com/v0/b/tiendalasmotos.appspot.com/o/${encodeURIComponent(
                    storageRef.path
                )}?alt=media&token=test`
        );
        URL.createObjectURL = vi.fn(() => 'blob:preview');
        URL.revokeObjectURL = vi.fn();
    });

    it('lista las imágenes actuales y permite quitarlas', () => {
        const onAplicar = vi.fn();
        render(
            <ImagenesReferenciaModal
                {...PROPS_BASE}
                imagenes={[IMAGEN_1, IMAGEN_2]}
                onAplicar={onAplicar}
            />
        );

        expect(
            screen.getByAltText('Imagen de referencia 1 de BRK-001')
        ).toBeInTheDocument();
        expect(
            screen.getByAltText('Imagen de referencia 2 de BRK-001')
        ).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole('button', {
                name: 'Quitar imagen de referencia 1',
            })
        );

        expect(onAplicar).toHaveBeenCalledWith([IMAGEN_2]);
    });

    it('previsualiza, sube y aplica una imagen válida', async () => {
        const onAplicar = vi.fn();
        const { container } = render(
            <ImagenesReferenciaModal
                {...PROPS_BASE}
                onAplicar={onAplicar}
            />
        );

        const input = container.querySelector(
            'input[type="file"]'
        ) as HTMLInputElement;
        fireEvent.change(input, {
            target: { files: [archivo()] },
        });

        expect(
            screen.getByAltText('Vista previa 1')
        ).toBeInTheDocument();

        fireEvent.click(
            screen.getByRole('button', { name: /Subir y añadir \(1\)/i })
        );

        await waitFor(() => {
            expect(onAplicar).toHaveBeenCalled();
        });
        const aplicadas = onAplicar.mock.calls[0][0] as string[];
        expect(aplicadas).toHaveLength(1);
        expect(aplicadas[0]).toContain(
            '/inventario_repuestos%2Fadmin%40test.com%2Fref-doc-brk-001-'
        );
        expect(storageMocks.uploadBytes).toHaveBeenCalledTimes(1);
        expect(storageMocks.getDownloadURL).toHaveBeenCalledTimes(1);
        expect(storageMocks.ref).toHaveBeenCalledWith(
            {},
            expect.stringContaining(
                'inventario_repuestos/admin@test.com/ref-doc-brk-001-'
            )
        );
    });

    it('bloquea el cierre mientras sube y muestra estado', async () => {
        let resolver: (() => void) | undefined;
        storageMocks.uploadBytes.mockReturnValue(
            new Promise<void>((resolve) => {
                resolver = resolve;
            })
        );

        const { container } = render(
            <ImagenesReferenciaModal
                {...PROPS_BASE}
                onAplicar={vi.fn()}
            />
        );
        const input = container.querySelector(
            'input[type="file"]'
        ) as HTMLInputElement;
        fireEvent.change(input, {
            target: { files: [archivo()] },
        });
        fireEvent.click(
            screen.getByRole('button', { name: /Subir y añadir \(1\)/i })
        );

        expect(
            (await screen.findAllByText('Subiendo…')).length
        ).toBeGreaterThan(0);
        expect(
            screen.getByRole('button', { name: 'Cerrar' })
        ).toBeDisabled();

        resolver?.();
        await waitFor(() => {
            expect(storageMocks.getDownloadURL).toHaveBeenCalled();
        });
    });

    it('rechaza MIME no permitido sin subir', () => {
        const { container } = render(
            <ImagenesReferenciaModal
                {...PROPS_BASE}
                onAplicar={vi.fn()}
            />
        );
        const input = container.querySelector(
            'input[type="file"]'
        ) as HTMLInputElement;

        fireEvent.change(input, {
            target: { files: [archivo('foto.gif', 'image/gif')] },
        });

        expect(
            screen.getByText(/Formato no permitido/i)
        ).toBeInTheDocument();
        expect(storageMocks.uploadBytes).not.toHaveBeenCalled();
    });

    it('deshabilita la selección al llegar a 5 imágenes', () => {
        const cinco = [1, 2, 3, 4, 5].map(
            (indice) =>
                `https://firebasestorage.googleapis.com/v0/b/tiendalasmotos.appspot.com/o/inventario_repuestos%2Fadmin%40test.com%2Fref-${indice}.jpg?alt=media&token=${indice}`
        );
        const { container } = render(
            <ImagenesReferenciaModal
                {...PROPS_BASE}
                imagenes={cinco}
                onAplicar={vi.fn()}
            />
        );

        const input = container.querySelector(
            'input[type="file"]'
        ) as HTMLInputElement;
        expect(input).toBeDisabled();
        expect(screen.getByText('5 de 5 imágenes')).toBeInTheDocument();
    });
});
