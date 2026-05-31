'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export function useBlobUrl() {
  const [blobUrl, setBlobUrl] = useState('');
  const currentBlobRef = useRef('');

  const revokeCurrentBlob = useCallback(() => {
    if (!currentBlobRef.current) {
      return;
    }

    URL.revokeObjectURL(currentBlobRef.current);
    currentBlobRef.current = '';
  }, []);

  const setBlobFromFile = useCallback((file: File | null) => {
    revokeCurrentBlob();

    if (!file) {
      setBlobUrl('');
      return;
    }

    const nextBlobUrl = URL.createObjectURL(file);
    currentBlobRef.current = nextBlobUrl;
    setBlobUrl(nextBlobUrl);
  }, [revokeCurrentBlob]);

  const setBlobFromUrl = useCallback((url: string) => {
    revokeCurrentBlob();
    setBlobUrl(url);
  }, [revokeCurrentBlob]);

  const clearBlobUrl = useCallback(() => {
    revokeCurrentBlob();
    setBlobUrl('');
  }, [revokeCurrentBlob]);

  useEffect(() => {
    return () => {
      revokeCurrentBlob();
    };
  }, [revokeCurrentBlob]);

  return {
    blobUrl,
    setBlobFromFile,
    setBlobFromUrl,
    clearBlobUrl
  };
}
