import { useState, useCallback, type RefObject } from 'react';

export default function useExportComparison(ref: RefObject<HTMLDivElement | null>) {
  const [exporting, setExporting] = useState(false);

  const exportToPdf = useCallback(async () => {
    const el = ref.current;
    if (!el) return;

    setExporting(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);

      // Hide no-print elements during capture
      const noPrint = el.querySelectorAll('.no-print');
      noPrint.forEach(n => (n as HTMLElement).style.display = 'none');

      const canvas = await html2canvas(el, {
        scale: 1.5,
        useCORS: true,
        logging: false,
        backgroundColor: '#f8fafc',
      });

      noPrint.forEach(n => (n as HTMLElement).style.display = '');

      // A4 landscape
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const usableWidth = pageWidth - margin * 2;
      const usableHeight = pageHeight - margin * 2;

      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = usableWidth / imgWidth;
      const scaledHeight = imgHeight * ratio;

      // Multi-page: slice the image if it's taller than one page
      const pagesNeeded = Math.ceil(scaledHeight / usableHeight);

      for (let page = 0; page < pagesNeeded; page++) {
        if (page > 0) pdf.addPage();

        const sourceY = (page * usableHeight) / ratio;
        const sourceH = Math.min(usableHeight / ratio, imgHeight - sourceY);
        const destH = sourceH * ratio;

        // Create a sub-canvas for this page slice
        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = imgWidth;
        pageCanvas.height = Math.ceil(sourceH);
        const ctx = pageCanvas.getContext('2d')!;
        ctx.drawImage(canvas, 0, -sourceY);

        const pageImg = pageCanvas.toDataURL('image/jpeg', 0.85);
        pdf.addImage(pageImg, 'JPEG', margin, margin, usableWidth, destH);
      }

      pdf.save('property-comparison.pdf');
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('Failed to export PDF. Please try using Print instead.');
    } finally {
      setExporting(false);
    }
  }, [ref]);

  const printComparison = useCallback(() => {
    window.print();
  }, []);

  return { exportToPdf, printComparison, exporting };
}
