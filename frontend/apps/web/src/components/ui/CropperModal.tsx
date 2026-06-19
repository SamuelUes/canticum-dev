'use client';

import { useState } from 'react';
import Cropper from 'react-easy-crop';

export interface CropperModalProps {
  isOpen: boolean;
  imageSrc: string;
  aspectRatio?: number;
  onConfirm: (croppedFile: File) => void;
  onCancel: () => void;
}

export function CropperModal({
  isOpen,
  imageSrc,
  aspectRatio = 1,
  onConfirm,
  onCancel
}: CropperModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedImage, setCroppedImage] = useState<File | null>(null);

  const handleCropComplete = async (_croppedArea: { x: number; y: number; width: number; height: number }, croppedAreaPixels: { x: number; y: number; width: number; height: number }) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const image = new Image();

    image.onload = () => {
      canvas.width = croppedAreaPixels.width;
      canvas.height = croppedAreaPixels.height;
      ctx?.drawImage(
        image,
        croppedAreaPixels.x,
        croppedAreaPixels.y,
        croppedAreaPixels.width,
        croppedAreaPixels.height,
        0,
        0,
        croppedAreaPixels.width,
        croppedAreaPixels.height
      );

      canvas.toBlob((blob) => {
        if (blob) {
          const croppedFile = new File([blob], 'cropped-image.jpg', { type: 'image/jpeg' });
          setCroppedImage(croppedFile);
        }
      }, 'image/jpeg');
    };

    image.src = imageSrc;
  };

  const handleConfirm = () => {
    if (croppedImage) {
      onConfirm(croppedImage);
    }
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedImage(null);
  };

  const handleCancel = () => {
    onCancel();
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setCroppedImage(null);
  };

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0, 0, 0, 0.8)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        background: 'white',
        padding: '2rem',
        borderRadius: '0.5rem',
        maxWidth: '600px',
        width: '90%',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        <h3 style={{ margin: 0 }}>Recortar Imagen</h3>
        <div style={{ position: 'relative', height: '400px', background: '#f0f0f0', borderRadius: '0.5rem', overflow: 'hidden' }}>
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={aspectRatio}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={handleCropComplete}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <label style={{ fontSize: '14px', color: '#666' }}>Zoom:</label>
          <input
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            style={{ flex: 1 }}
          />
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
          <button
            className="admin-secondary-button"
            onClick={handleCancel}
          >
            Cancelar
          </button>
          <button
            className="admin-primary-button"
            onClick={handleConfirm}
            disabled={!croppedImage}
          >
            Confirmar Recorte
          </button>
        </div>
      </div>
    </div>
  );
}
