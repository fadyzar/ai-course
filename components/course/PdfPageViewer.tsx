'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { ChevronRight, ChevronLeft, ZoomIn, ZoomOut, Loader as Loader2, CircleAlert as AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PdfPageViewerProps {
  storagePath: string;
  pageNum?: number | null;
  title?: string | null;
}

declare global {
  interface Window {
    pdfjsLib: any;
  }
}

const PDF_JS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDF_WORKER_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

function loadPdfJs(): Promise<any> {
  return new Promise((resolve, reject) => {
    if (window.pdfjsLib) {
      resolve(window.pdfjsLib);
      return;
    }
    const script = document.createElement('script');
    script.src = PDF_JS_CDN;
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_CDN;
      resolve(window.pdfjsLib);
    };
    script.onerror = () => reject(new Error('Failed to load PDF.js'));
    document.head.appendChild(script);
  });
}

export function PdfPageViewer({ storagePath, pageNum, title }: PdfPageViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1.2);
  const [currentPage, setCurrentPage] = useState(pageNum ?? 1);
  const [totalPages, setTotalPages] = useState(0);
  const pdfDocRef = useRef<any>(null);
  const renderTaskRef = useRef<any>(null);

  const renderPage = useCallback(async (pageNumber: number, zoom: number) => {
    if (!pdfDocRef.current || !canvasRef.current) return;

    if (renderTaskRef.current) {
      renderTaskRef.current.cancel();
    }

    const page = await pdfDocRef.current.getPage(pageNumber);
    const viewport = page.getViewport({ scale: zoom });
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    const renderTask = page.render({ canvasContext: context, viewport });
    renderTaskRef.current = renderTask;

    try {
      await renderTask.promise;
    } catch (e: any) {
      if (e?.name !== 'RenderingCancelledException') {
        console.error('Render error:', e);
      }
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadPdf() {
      setLoading(true);
      setError(null);
      try {
        const { data, error: signedError } = await supabase.storage
          .from('course-assets')
          .createSignedUrl(storagePath, 3600);

        if (signedError || !data?.signedUrl) {
          throw new Error(signedError?.message || 'לא ניתן לטעון את הקובץ');
        }

        const pdfjsLib = await loadPdfJs();
        const pdfDoc = await pdfjsLib.getDocument({ url: data.signedUrl }).promise;

        if (cancelled) return;

        pdfDocRef.current = pdfDoc;
        setTotalPages(pdfDoc.numPages);

        const targetPage = pageNum && pageNum >= 1 && pageNum <= pdfDoc.numPages ? pageNum : 1;
        setCurrentPage(targetPage);

        await renderPage(targetPage, scale);
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'שגיאה בטעינת ה-PDF');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPdf();

    return () => { cancelled = true; };
  }, [storagePath, pageNum]);

  useEffect(() => {
    if (!loading && pdfDocRef.current) {
      renderPage(currentPage, scale);
    }
  }, [currentPage, scale, loading, renderPage]);

  const goTo = (n: number) => {
    if (n >= 1 && n <= totalPages) setCurrentPage(n);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center bg-slate-100 rounded-xl min-h-64 gap-3">
        <Loader2 className="h-10 w-10 text-sky-500 animate-spin" />
        <p className="text-slate-500 text-sm">טוען PDF...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center bg-slate-100 rounded-xl min-h-64 gap-3 border border-red-200">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <p className="text-red-600 text-sm font-medium">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3" dir="rtl">
      {title && <h2 className="text-xl font-bold text-slate-900">{title}</h2>}

      <div className="flex items-center justify-between bg-slate-100 rounded-lg px-3 py-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => setScale((s) => Math.min(s + 0.2, 3))}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <span className="text-xs text-slate-500 w-12 text-center">{Math.round(scale * 100)}%</span>
          <Button variant="ghost" size="sm" onClick={() => setScale((s) => Math.max(s - 0.2, 0.5))}>
            <ZoomOut className="h-4 w-4" />
          </Button>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => goTo(currentPage + 1)} disabled={currentPage >= totalPages}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-slate-600">{currentPage} / {totalPages}</span>
            <Button variant="ghost" size="sm" onClick={() => goTo(currentPage - 1)} disabled={currentPage <= 1}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <div className="overflow-auto rounded-xl border border-slate-200 bg-slate-50 flex justify-center p-4 shadow-inner">
        <canvas ref={canvasRef} className="shadow-md rounded" />
      </div>
    </div>
  );
}
