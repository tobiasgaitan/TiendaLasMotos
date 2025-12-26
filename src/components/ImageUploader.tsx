import { useState } from 'react';
import Image from 'next/image';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '@/lib/firebase';

/**
 * Props for the ImageUploader component.
 */
interface Props {
    /** The current image URL to display as a preview. */
    currentImage?: string;
    /** Callback function triggered when an image is successfully uploaded. */
    onImageUploaded: (url: string) => void;
}

/**
 * ImageUploader component.
 * 
 * Handles uploading images to Firebase Storage (`inventory_images/` path).
 * Displays a preview of the uploaded image or the current image.
 * Uses a fixed height container to avoid Next.js Image height issues.
 * 
 * @param {Props} props - The component props.
 * @returns {JSX.Element} The rendered component.
 */
export default function ImageUploader({ currentImage, onImageUploaded }: Props) {
    const [uploading, setUploading] = useState(false);

    /**
     * Handles the file input change event.
     * Uploads the selected file to Firebase Storage.
     * 
     * @param {React.ChangeEvent<HTMLInputElement>} e - The change event.
     */
    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(true);
        try {
            // Security: Validate file type client-side (redundant to accept="image/*" but good practice)
            if (!file.type.startsWith('image/')) {
                throw new Error("Solo se permiten archivos de imagen.");
            }

            const storageRef = ref(storage, `products/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);
            onImageUploaded(url);
        } catch (error) {
            console.error("Error subiendo imagen:", error);
            alert("Error al subir imagen");
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">Imagen del Producto</label>

            {/* PREVISUALIZACIÓN: Agregamos h-48 w-full relative para evitar el error de height 0 */}
            <div className="relative h-48 w-full bg-gray-900 border-2 border-dashed border-gray-700 rounded-lg overflow-hidden flex items-center justify-center group hover:border-blue-500 transition-colors">
                {currentImage ? (
                    <>
                        <Image
                            src={currentImage}
                            alt="Preview"
                            fill
                            className="object-contain p-2"
                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                        />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                            <span className="text-white text-sm font-bold bg-black/50 px-3 py-1 rounded-full backdrop-blur-sm">
                                Cambiar Imagen
                            </span>
                        </div>
                    </>
                ) : (
                    <div className="flex flex-col items-center justify-center text-gray-500 gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span className="text-xs font-medium">Click para subir imagen</span>
                    </div>
                )}

                <input
                    type="file"
                    accept="image/*"
                    onChange={handleUpload}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    disabled={uploading}
                />

                {uploading && (
                    <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-20">
                        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-2"></div>
                        <div className="text-xs text-blue-400 font-medium animate-pulse">Subiendo...</div>
                    </div>
                )}
            </div>
        </div>
    );
}
