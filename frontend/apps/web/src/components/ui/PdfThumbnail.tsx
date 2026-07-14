'use client';

import { useCallback, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

interface PdfThumbnailProps {
  url: string;
  width?: number;
  className?: string;
  title?: string;
}

export function PdfThumbnail({ url, width = 80, className, title }: PdfThumbnailProps) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setModalOpen(true);
  }, []);

  const closeModal = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setModalOpen(false);
  }, []);

  if (failed) {
    return (
      <div className={`pdf-thumbnail pdf-thumbnail--error ${className ?? ''}`.trim()} aria-hidden>
        <span className="material-symbols-outlined">picture_as_pdf</span>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className={`pdf-thumbnail ${className ?? ''}`.trim()}
        onClick={handleClick}
        aria-label={title ? `Vista previa de ${title}` : 'Vista previa de PDF'}
      >
        {!loaded ? (
          <div className="pdf-thumbnail-skeleton" />
        ) : null}
        <Document
          file={url}
          onLoadSuccess={() => setLoaded(true)}
          onLoadError={() => setFailed(true)}
          loading={null}
          error={null}
        >
          <Page
            pageNumber={1}
            width={width}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            className="pdf-thumbnail-page"
          />
        </Document>
        <span className="pdf-thumbnail-zoom-icon" aria-hidden>
          <span className="material-symbols-outlined">zoom_in</span>
        </span>
      </button>

      {modalOpen ? (
        <div className="pdf-preview-overlay" onClick={closeModal}>
          <div className="pdf-preview-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pdf-preview-header">
              <strong>{title ?? 'Vista previa'}</strong>
              <button
                type="button"
                className="pdf-preview-close"
                aria-label="Cerrar"
                onClick={closeModal}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="pdf-preview-body">
              <Document
                file={url}
                loading={<div className="pdf-preview-loading">Cargando…</div>}
                error={<div className="pdf-preview-loading">No se pudo cargar el PDF.</div>}
              >
                <Page
                  pageNumber={1}
                  width={500}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  className="pdf-preview-page"
                />
              </Document>
            </div>
            <div className="pdf-preview-footer">
              <a
                href={url}
                download
                className="pdf-preview-download"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="material-symbols-outlined" aria-hidden>download</span>
                Descargar
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

