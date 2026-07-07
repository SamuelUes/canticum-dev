'use client';

import { useCallback, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

interface PdfViewerProps {
  url: string;
  onLoad?: () => void;
  onError?: (error: string) => void;
}

export function PdfViewer({ url, onLoad, onError }: PdfViewerProps) {
  const [numPages, setNumPages] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  const handleDocumentLoadSuccess = useCallback((pdf: { numPages: number }) => {
    setNumPages(pdf.numPages);
    setLoadError(null);
    onLoad?.();
  }, [onLoad]);

  const handleDocumentLoadError = useCallback((err: Error) => {
    const message = err.message || 'No se pudo cargar el PDF.';
    setLoadError(message);
    onError?.(message);
  }, [onError]);

  return (
    <div className="sheet-pdf-container">
      {loadError && <p className="sheet-error">{loadError}</p>}
      <Document
        file={url}
        onLoadSuccess={handleDocumentLoadSuccess}
        onLoadError={handleDocumentLoadError}
        loading={<p className="sheet-status">Cargando PDF…</p>}
        error={<p className="sheet-error">No se pudo cargar el PDF.</p>}
      >
        {Array.from(new Array(numPages), (_, index) => (
          <Page
            key={`page_${index + 1}`}
            pageNumber={index + 1}
            scale={1.6}
            className="sheet-pdf-page"
            renderTextLayer={false}
            renderAnnotationLayer={false}
          />
        ))}
      </Document>
    </div>
  );
}
