import { useState } from 'react';
import Image from 'next/image';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';

interface Props {
    currentImage?: string;
    onImageUploaded: (url: string) => void;
}

export default function ImageUploader({ currentImage, onImageUploaded }: Props) {
    const [uploading, setUploading] = useState(false);
    const [imageSrc, setImageSrc] = useState<string | null>(null);

    // Reset local state when prop changes
    if (currentImage && imageSrc && imageSrc !== '/placeholder-moto.png' && imageSrc !== currentImage) {
        setImageSrc(null);
    }

    // DEBUG: Verificamos si llega la URL
    console.log("ImageUploader recibió:", currentImage);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        try {
            if (!file.type.startsWith('image/')) throw new Error("Solo imagenes");
            const storageRef = ref(storage, `products/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);
            onImageUploaded(url);
        } catch (error) {
            console.error(error);
            alert("Error al subir");
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">Imagen del Producto</label>

            {/* FIX CRÍTICO: style={{ height: '200px' }} fuerza el espacio físico */}
            <div
                className="relative w-full bg-gray-900 border-2 border-dashed border-gray-700 rounded-lg overflow-hidden flex items-center justify-center group hover:border-blue-500 transition-colors"
                style={{ height: '200px', minHeight: '200px' }}
            >
                {currentImage ? (
                    <>
                        {/* Usamos unimg normal (no next/image) temporalmente para descartar problemas de configuración de dominios, o next/image con unfill configurado */}
                        <Image
                            src={imageSrc || currentImage}
                            alt="Preview"
                            fill
                            unoptimized={true}
                            className="object-contain p-2"
                            sizes="(max-width: 768px) 100vw, 50vw"
                            onError={() => setImageSrc('/placeholder-moto.png')} // Fallback visual
                        />

                        {/* Overlay de cambio */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none z-10">
                            <span className="text-white text-sm font-bold bg-black/50 px-3 py-1 rounded-full backdrop-blur-sm">
                                Cambiar Imagen
                            </span>
                        </div>
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center text-gray-500 gap-2">
                        <span className="text-4xl opacity-50">📷</span>
                        <span className="text-xs font-medium">Click para subir imagen</span>
                    </div>
                )}

                <input
                    type="file"
                    accept="image/*"
                    onChange={handleUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                    disabled={uploading}
                />

                {uploading && (
                    <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-30">
                        <div className="text-blue-400 font-bold animate-pulse">Subiendo...</div>
                    </div>
                )}
            </div>
        </div>
    );
}