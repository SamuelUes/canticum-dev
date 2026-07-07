'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { PdfViewer } from './PdfViewer';

type SheetFileType = 'musicxml' | 'mxl' | 'pdf' | 'png' | 'jpg' | 'jpeg' | 'doc' | 'musescore' | 'txt' | 'unknown';

interface SheetRendererProps {
  url: string;
  onError?: (error: string) => void;
}

function getProxiedSheetUrl(url: string): string {
  if (!/^https?:\/\/firebasestorage\.googleapis\.com\//i.test(url)) {
    return url;
  }

  return `/api/song-sheet?url=${encodeURIComponent(url)}`;
}

function getFileType(url: string): SheetFileType {
  const extension = url.split('?')[0]?.split('#')[0]?.split('.').pop()?.toLowerCase() ?? '';
  if (extension === 'xml' || extension === 'musicxml') return 'musicxml';
  if (extension === 'mxl') return 'mxl';
  if (extension === 'pdf') return 'pdf';
  if (extension === 'png') return 'png';
  if (extension === 'jpg' || extension === 'jpeg') return 'jpg';
  if (extension === 'doc' || extension === 'docx') return 'doc';
  if (extension === 'mscz' || extension === 'mscx') return 'musescore';
  if (extension === 'txt') return 'txt';
  return 'unknown';
}

export function SheetRenderer({ url, onError }: SheetRendererProps) {
  const fileType = getFileType(url);
  const sheetUrl = getProxiedSheetUrl(url);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [imageZoom, setImageZoom] = useState(1);
  const [xmlContent, setXmlContent] = useState<string | null>(null);
  const [docxHtml, setDocxHtml] = useState<string | null>(null);

  const osmdContainerRef = useRef<HTMLDivElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  // Handle error propagation
  useEffect(() => {
    if (error && onError) {
      onError(error);
    }
  }, [error, onError]);

  // Reset state when URL changes
  useEffect(() => {
    setIsLoading(true);
    setError('');
    setImageZoom(1);
    setXmlContent(null);
    setDocxHtml(null);
  }, [url]);

  // MusicXML/MXL rendering with OpenSheetMusicDisplay
  useEffect(() => {
    if (fileType !== 'musicxml' && fileType !== 'mxl') {
      return;
    }

    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    const container = osmdContainerRef.current;
    if (!container) {
      return;
    }

    container.innerHTML = '';
    // Ensure container has dimensions
    container.style.width = '100%';
    container.style.height = 'auto';

    void (async () => {
      try {
        // Try fetch with CORS
        const response = await fetch(sheetUrl, {
          cache: 'no-store',
          mode: 'cors',
          credentials: 'omit'
        });

        if (!response.ok) {
          const errorMsg = response.status === 404
            ? 'No se encontró el archivo de partitura (404).'
            : response.status === 403
              ? 'No tienes permiso para acceder a la partitura (403).'
              : `Error al cargar la partitura (${response.status}).`;
          throw new Error(errorMsg);
        }

        const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
        const extension = url.split('?')[0]?.split('#')[0]?.split('.').pop()?.toLowerCase() ?? '';
        const arrayBuffer = await response.arrayBuffer();
        const isMxl = extension === 'mxl'
          || contentType.includes('zip')
          || contentType.includes('compressed');

        let source: string;

        if (isMxl) {
          // Extract MXL using JSZip
          const JSZip = (await import('jszip')).default;
          const zip = await JSZip.loadAsync(arrayBuffer);
          
          // console.log('[SheetRenderer] MXL files:', Object.keys(zip.files));
          
          // Find the MusicXML file in the MXL
          // Priority: score.xml > .musicxml > .xml (excluding META-INF/container.xml)
          let xmlFile = Object.keys(zip.files).find(key => 
            key === 'score.xml' || 
            key.endsWith('/score.xml')
          );
          
          if (!xmlFile) {
            xmlFile = Object.keys(zip.files).find(key => 
              key.endsWith('.musicxml') && !key.includes('META-INF')
            );
          }
          
          if (!xmlFile) {
            xmlFile = Object.keys(zip.files).find(key => 
              key.endsWith('.xml') && 
              !key.includes('META-INF') &&
              !key.includes('container.xml')
            );
          }
          
          if (!xmlFile) {
            throw new Error('No se encontró archivo MusicXML dentro del MXL. Archivos encontrados: ' + Object.keys(zip.files).join(', '));
          }
          
          const xmlContent = await zip.file(xmlFile)?.async('string');
          if (!xmlContent) {
            throw new Error('No se pudo extraer el contenido MusicXML del MXL');
          }
          
          // console.log('[SheetRenderer] XML extraído del MXL (primeros 500 chars):', xmlContent.substring(0, 500));
          
          source = xmlContent;
          setXmlContent(xmlContent);
        } else {
          source = new TextDecoder().decode(arrayBuffer);
          setXmlContent(source);
        }

        // console.log('[SheetRenderer] Loading MusicXML/MXL:', { extension, contentType, isMxl, sourceLength: source.length });

        const { OpenSheetMusicDisplay } = await import('opensheetmusicdisplay');
        const osmd = new OpenSheetMusicDisplay(container, {
          autoResize: false,
          drawTitle: true,
          drawSubtitle: true,
          drawComposer: true,
          drawCredits: true,
          drawPartNames: true,
          drawMeasureNumbers: true,
          drawFingerings: true,
          backend: 'svg',
          scale: 1
        });

        await osmd.load(source);

        // Wait for the container to have a non-zero width before rendering.
        // OSMD's SkyBottomLineBatchCalculator warns when measures have width <= 0,
        // which happens if the container hasn't been laid out yet.
        // Using autoResize: false prevents OSMD from rendering before we're ready.
        const waitForWidth = (): Promise<void> => {
          return new Promise((resolve) => {
            if (container.offsetWidth > 0) {
              resolve();
              return;
            }

            let rafId: number;
            const checkWidth = () => {
              if (container.offsetWidth > 0) {
                resolve();
                return;
              }
              rafId = requestAnimationFrame(checkWidth);
            };
            rafId = requestAnimationFrame(checkWidth);

            // Safety timeout: resolve after 2s even if width is still 0
            setTimeout(() => {
              cancelAnimationFrame(rafId);
              resolve();
            }, 2000);
          });
        };

        await waitForWidth();
        if (cancelled) {
          return;
        }

        // Double rAF ensures the browser has completed at least one layout pass
        // after the container has offsetWidth > 0.
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
        if (cancelled) {
          return;
        }

        osmd.render();

        // Manual resize handling (replaces autoResize: true)
        let resizeRafId: number | null = null;
        resizeObserver = new ResizeObserver(() => {
          if (resizeRafId !== null) {
            cancelAnimationFrame(resizeRafId);
          }
          resizeRafId = requestAnimationFrame(() => {
            if (!cancelled && container.offsetWidth > 0) {
              osmd.render();
            }
          });
        });
        resizeObserver.observe(container);

        if (cancelled) {
          return;
        }
        setIsLoading(false);
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Error desconocido.';
          console.error('[SheetRenderer] Error al renderizar MusicXML:', err);
          // For CORS errors, show a helpful message with download link
          if (message.includes('CORS') || message.includes('fetch') || message.includes('ERR_FAILED')) {
            setError('El renderizado inline de MusicXML requiere configuración de CORS. Abre el archivo directamente para verlo.');
          } else if (message.includes('404') || message.includes('403')) {
            setError(`Error de acceso: ${message}`);
          } else if (message.includes('parse') || message.includes('XML') || message.includes('partwise') || message.includes('valid') || message.includes('invalid')) {
            setError('El archivo no es un MusicXML válido. Mostrando contenido como texto plano.');
          } else {
            setError(`No se pudo renderizar la partitura: ${message}`);
          }
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (container) {
        container.innerHTML = '';
      }
    };
  }, [url, fileType, sheetUrl]);

  // Image zoom handlers
  const handleZoomIn = () => setImageZoom((prev) => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setImageZoom((prev) => Math.max(prev - 0.25, 0.5));
  const handleZoomReset = () => setImageZoom(1);

  // TXT loading
  useEffect(() => {
    if (fileType !== 'txt') {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(sheetUrl, {
          cache: 'no-store',
          mode: 'cors',
          credentials: 'omit'
        });

        if (!response.ok) {
          throw new Error(`Error al cargar el archivo de texto (${response.status})`);
        }

        const text = await response.text();

        if (cancelled) {
          return;
        }

        setXmlContent(text);
        setIsLoading(false);
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Error desconocido.';
          console.error('[SheetRenderer] Error al cargar TXT:', err);
          setError(`No se pudo cargar el archivo de texto: ${message}`);
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url, fileType, sheetUrl]);

  // DOCX loading with mammoth
  useEffect(() => {
    if (fileType !== 'doc') {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(sheetUrl, {
          cache: 'no-store',
          mode: 'cors',
          credentials: 'omit'
        });

        if (!response.ok) {
          throw new Error(`Error al cargar el documento (${response.status})`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const mammoth = await import('mammoth');
        const result = await mammoth.convertToHtml({ arrayBuffer });

        if (cancelled) {
          return;
        }

        setDocxHtml(result.value);
        setIsLoading(false);
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : 'Error desconocido.';
          console.error('[SheetRenderer] Error al cargar DOCX:', err);
          setError(`No se pudo cargar el documento: ${message}`);
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url, fileType, sheetUrl]);

  // Render based on file type
  if (fileType === 'musicxml' || fileType === 'mxl') {
    return (
      <div className="sheet-renderer-wrapper">
        {isLoading && <p className="sheet-status">Cargando partitura…</p>}
        {error && (
          <>
            <p className="sheet-error">{error}</p>
            {xmlContent && (
              <div className="sheet-xml-fallback">
                <pre className="sheet-xml-content">{xmlContent}</pre>
              </div>
            )}
            <a href={url} target="_blank" rel="noreferrer" className="sheet-download-link">
              Abrir archivo MusicXML
            </a>
          </>
        )}
        <div className="sheet-canvas" ref={osmdContainerRef} aria-label="Partitura MusicXML renderizada" />
      </div>
    );
  }

  if (fileType === 'pdf') {
    return (
      <div className="sheet-renderer-wrapper">
        {isLoading && <p className="sheet-status">Cargando PDF…</p>}
        {error && <p className="sheet-error">{error}</p>}
        <PdfViewer
          url={sheetUrl}
          onLoad={() => setIsLoading(false)}
          onError={setError}
        />
      </div>
    );
  }

  if (fileType === 'png' || fileType === 'jpg') {
    return (
      <div className="sheet-renderer-wrapper">
        {/* {isLoading && <p className="sheet-status">Cargando imagen…</p>} */}
        {error && <p className="sheet-error">{error}</p>}
        <div className="sheet-image-container" ref={imageContainerRef}>
          <div className="sheet-image-controls">
            <button
              type="button"
              className="sheet-zoom-btn"
              onClick={handleZoomOut}
              disabled={imageZoom <= 0.5}
              aria-label="Reducir zoom"
            >
              <span className="material-symbols-outlined">zoom_out</span>
            </button>
            <span className="sheet-zoom-level">{Math.round(imageZoom * 100)}%</span>
            <button
              type="button"
              className="sheet-zoom-btn"
              onClick={handleZoomIn}
              disabled={imageZoom >= 3}
              aria-label="Aumentar zoom"
            >
              <span className="material-symbols-outlined">zoom_in</span>
            </button>
            <button
              type="button"
              className="sheet-zoom-btn"
              onClick={handleZoomReset}
              aria-label="Restablecer zoom"
            >
              <span className="material-symbols-outlined">refresh</span>
            </button>
          </div>
          <div
            className="sheet-image-wrapper"
            style={{ transform: `scale(${imageZoom})` }}
            onLoad={() => setIsLoading(false)}
            onError={() => setError('No se pudo cargar la imagen.')}
          >
            <Image
              src={sheetUrl}
              alt="Partitura en imagen"
              width={0}
              height={0}
              sizes="100vw"
              style={{ width: '100%', height: 'auto' }}
              unoptimized={url.startsWith('blob:') || url.startsWith('data:')}
              priority
            />
          </div>
        </div>
      </div>
    );
  }

  if (fileType === 'doc') {
    return (
      <div className="sheet-renderer-wrapper">
        {isLoading && <p className="sheet-status">Cargando documento Word…</p>}
        {error && (
          <>
            <p className="sheet-error">{error}</p>
            <a href={url} target="_blank" rel="noreferrer" className="sheet-download-link">
              Abrir documento Word
            </a>
          </>
        )}
        {docxHtml && (
          <div className="sheet-docx-wrapper">
            <div
              className="sheet-docx-content"
              dangerouslySetInnerHTML={{ __html: docxHtml }}
            />
          </div>
        )}
      </div>
    );
  }

  if (fileType === 'musescore') {
    const googleDocsViewerUrl = `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;
    return (
      <div className="sheet-renderer-wrapper">
        {isLoading && <p className="sheet-status">Cargando archivo MuseScore…</p>}
        {error && <p className="sheet-error">{error}</p>}
        <iframe
          src={googleDocsViewerUrl}
          className="sheet-iframe"
          title="Visor de MuseScore"
          onLoad={() => setIsLoading(false)}
          onError={() => setError('No se pudo cargar el archivo en el visor.')}
        />
        <a href={url} target="_blank" rel="noreferrer" className="sheet-download-link">
          Abrir archivo MuseScore
        </a>
      </div>
    );
  }

  if (fileType === 'txt') {
    return (
      <div className="sheet-renderer-wrapper">
        {isLoading && <p className="sheet-status">Cargando archivo de texto…</p>}
        {error && (
          <>
            <p className="sheet-error">{error}</p>
            <a href={url} target="_blank" rel="noreferrer" className="sheet-download-link">
              Abrir archivo de texto
            </a>
          </>
        )}
        {xmlContent && (
          <div className="sheet-xml-fallback">
            <pre className="sheet-xml-content">{xmlContent}</pre>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="sheet-renderer-wrapper">
      <p className="sheet-error">Formato de archivo no soportado para renderizado automático.</p>
      <a href={url} target="_blank" rel="noreferrer" className="sheet-download-link">
        Abrir archivo
      </a>
    </div>
  );
}
