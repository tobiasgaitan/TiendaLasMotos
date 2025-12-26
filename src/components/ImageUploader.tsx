import { useState } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';
import Image from 'next/image';

interface Props {
    currentImage?: string;
    onImageUploaded: (url: string) => void;
}

export default function ImageUploader({ currentImage, onImageUploaded }: Props) {
    const [uploading, setUploading] = useState(false);
    const [preview, setPreview] = useState(currentImage || '');

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        try {
            // Guardamos en carpeta 'inventory_images' con timestamp para que el nombre sea único
            const filename = `inventory_images/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
            const storageRef = ref(storage, filename);

            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);

            setPreview(url);
            onImageUploaded(url); // ¡Éxito! Devolvemos el link al padre
        } catch (error) {
            console.error("Error subiendo imagen:", error);
            alert("Error al subir. Revisa tu conexión.");
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="space-y-3">
            <label className="block text-xs text-gray-500 font-medium uppercase tracking-wide">
                Imagen del Producto
            </label>

            <div className="flex items-start gap-4 p-3 bg-gray-800/50 rounded-lg border border-gray-700">
                {/* Vista Previa */}
                <div className="relative h-20 w-20 bg-gray-900 rounded border border-gray-600 overflow-hidden flex-shrink-0">
                    {preview ? (
                        <Image src={preview} alt="Preview" fill className="object-cover" />
                    ) : (
                        <div className="flex items-center justify-center h-full text-gray-600 text-[10px] text-center p-1">
                            Sin Imagen
                        </div>
                    )}
                    {uploading && (
                        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-10">
                            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    )}
                </div>

                {/* Input */}
                <div className="flex-1 space-y-2">
                    <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        disabled={uploading}
                        className="block w-full text-xs text-gray-400
              file:mr-3 file:py-1.5 file:px-3
              file:rounded-md file:border-0
              file:text-xs file:font-semibold
              file:bg-blue-600 file:text-white
              hover:file:bg-blue-500
              cursor-pointer bg-gray-900 rounded border border-gray-700 focus:outline-none"
                    />
                    <p className="text-[10px] text-gray-500">
                        {uploading ? 'Subiendo a la nube...' : 'Formatos: JPG, PNG, WEBP.'}
                    </p>
                </div>
            </div>
        </div>
    );
}
