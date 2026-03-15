import { useState, useCallback, type RefObject } from 'react';

const HEADER_HEIGHT = 14; // mm reserved for header on each page
const FOOTER_HEIGHT = 6;  // mm reserved for footer
const CAPTURE_TIMEOUT = 30_000;

const BLANK =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

/**
 * Temporarily mutate the LIVE document so that when html2canvas deep-clones it
 * into a hidden iframe, the clone contains zero cross-origin resources.
 *
 * html2canvas clones <style> elements by their textContent — NOT via the CSSOM.
 * So we must rewrite textContent to strip @import lines; deleteRule() alone is
 * invisible to the clone.
 */
function neutralizeCrossOrigin(el: HTMLElement) {
  const undos: (() => void)[] = [];

  // 1. Rewrite <style> textContent to strip @import url(...) lines.
  //    This is the only way to stop the clone from fetching Google Fonts etc.
  document.querySelectorAll('style').forEach(style => {
    const original = style.textContent || '';
    if (/@import\s/i.test(original)) {
      style.textContent = original.replace(/@import\s+url\([^)]*\)\s*;?/gi, '');
      undos.push(() => { style.textContent = original; });
    }
  });

  // 2. Disable cross-origin <link rel="stylesheet"> (e.g. Google Fonts CDN)
  document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]').forEach(link => {
    const href = link.href || '';
    if (href.startsWith('http') && !href.startsWith(window.location.origin)) {
      link.dataset.origMedia = link.media;
      link.media = 'not all';
      undos.push(() => { link.media = link.dataset.origMedia || ''; delete link.dataset.origMedia; });
    }
  });

  // 3. Remove cross-origin <script> tags (Google Tag Manager etc.)
  document.querySelectorAll('script[src]').forEach(script => {
    const src = script.getAttribute('src') || '';
    if (src.startsWith('http') && !src.startsWith(window.location.origin)) {
      const origType = script.getAttribute('type');
      script.setAttribute('type', 'text/blocked');
      undos.push(() => {
        if (origType) script.setAttribute('type', origType);
        else script.removeAttribute('type');
      });
    }
  });

  // 4. Swap every <img> src in the ENTIRE document to an inline data URI.
  //    html2canvas clones the full document, not just the target element.
  document.querySelectorAll('img').forEach(img => {
    const origSrc = img.getAttribute('src');
    const origSrcset = img.getAttribute('srcset');
    if (!img.style.width) img.style.width = (img.offsetWidth || 60) + 'px';
    if (!img.style.height) img.style.height = (img.offsetHeight || 40) + 'px';
    img.style.backgroundColor = '#e2e8f0';
    img.style.borderRadius = '4px';
    img.setAttribute('src', BLANK);
    if (origSrcset) img.removeAttribute('srcset');
    undos.push(() => {
      if (origSrc) img.setAttribute('src', origSrc); else img.removeAttribute('src');
      if (origSrcset) img.setAttribute('srcset', origSrcset);
      img.style.width = '';
      img.style.height = '';
      img.style.backgroundColor = '';
      img.style.borderRadius = '';
    });
  });

  // 5. Swap <canvas> to static images or hide
  el.querySelectorAll('canvas').forEach(c => {
    try {
      const dataUrl = (c as HTMLCanvasElement).toDataURL();
      const img = document.createElement('img');
      img.src = dataUrl;
      img.style.cssText = `width:${c.clientWidth}px;height:${c.clientHeight}px;`;
      (c as HTMLElement).style.display = 'none';
      c.insertAdjacentElement('afterend', img);
      undos.push(() => { img.remove(); (c as HTMLElement).style.display = ''; });
    } catch {
      (c as HTMLElement).style.display = 'none';
      undos.push(() => { (c as HTMLElement).style.display = ''; });
    }
  });

  return () => undos.forEach(fn => fn());
}

export default function useExportAnalysis(ref: RefObject<HTMLDivElement | null>) {
  const [exporting, setExporting] = useState(false);

  const exportToPdf = useCallback(async () => {
    const el = ref.current;
    if (!el) return;

    setExporting(true);
    let restore: (() => void) | null = null;
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);

      // Neutralize cross-origin resources BEFORE html2canvas clones the DOM
      restore = neutralizeCrossOrigin(el);

      const capturePromise = html2canvas(el, {
        scale: 1.5,
        logging: false,
        backgroundColor: '#ffffff',
        useCORS: false,
        allowTaint: false,
        foreignObjectRendering: false,
        scrollY: -window.scrollY,
        windowHeight: el.scrollHeight + 200,
        height: el.scrollHeight,
        onclone: (doc, clonedEl) => {
          // Kill ALL animations/transitions so nothing is mid-fade or invisible
          const reset = doc.createElement('style');
          reset.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; opacity: 1 !important; transform: none !important; }';
          doc.head.appendChild(reset);

          // Show print header, hide interactive elements
          const ph = clonedEl.querySelector('.analysis-print-header') as HTMLElement | null;
          if (ph) ph.style.display = 'block';
          clonedEl.querySelectorAll('.no-print').forEach(n => {
            (n as HTMLElement).style.display = 'none';
          });
        },
      });

      const timeoutPromise = new Promise<never>((_resolve, reject) =>
        setTimeout(() => reject(new Error('html2canvas timed out')), CAPTURE_TIMEOUT),
      );

      const canvas = await Promise.race([capturePromise, timeoutPromise]);

      // Restore DOM immediately after capture completes
      restore(); restore = null;

      const address = el.querySelector('.results__property-address')?.textContent?.trim() || 'Property';
      const title = `Investment Analysis — ${address}`;
      const dateStr = new Date().toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      });

      // A4 portrait
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const usableWidth = pageWidth - margin * 2;
      const contentTop = margin + HEADER_HEIGHT;
      const contentHeight = pageHeight - contentTop - margin - FOOTER_HEIGHT;

      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const ratio = usableWidth / imgWidth;
      const scaledHeight = imgHeight * ratio;

      const pagesNeeded = Math.ceil(scaledHeight / contentHeight);

      for (let page = 0; page < pagesNeeded; page++) {
        if (page > 0) pdf.addPage();

        // ── Page header ──
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(12);
        pdf.setTextColor(30, 41, 59);
        pdf.text(page === 0 ? title : 'Investment Analysis (cont.)', margin, margin + 5);

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.5);
        pdf.setTextColor(100, 116, 139);
        pdf.text(dateStr, pageWidth - margin, margin + 5, { align: 'right' });

        // Header underline
        pdf.setDrawColor(102, 126, 234);
        pdf.setLineWidth(0.5);
        pdf.line(margin, contentTop - 2, pageWidth - margin, contentTop - 2);

        // ── Content slice ──
        const sourceY = (page * contentHeight) / ratio;
        const sourceH = Math.min(contentHeight / ratio, imgHeight - sourceY);
        const destH = sourceH * ratio;

        const pageCanvas = document.createElement('canvas');
        pageCanvas.width = imgWidth;
        pageCanvas.height = Math.ceil(sourceH);
        const ctx = pageCanvas.getContext('2d')!;
        ctx.drawImage(canvas, 0, -sourceY);

        const pageImg = pageCanvas.toDataURL('image/jpeg', 0.85);
        pdf.addImage(pageImg, 'JPEG', margin, contentTop, usableWidth, destH);

        // ── Page footer ──
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7);
        pdf.setTextColor(148, 163, 184);
        pdf.text(
          `Page ${page + 1} of ${pagesNeeded}`,
          pageWidth / 2,
          pageHeight - margin,
          { align: 'center' },
        );
        pdf.text(
          'Generated by Property Analyzer',
          pageWidth - margin,
          pageHeight - margin,
          { align: 'right' },
        );
      }

      const safeAddress = address.replace(/[^a-zA-Z0-9 ]/g, '').replace(/\s+/g, '-').toLowerCase();
      pdf.save(`analysis-${safeAddress}.pdf`);
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('Failed to export PDF. Please try using Print instead.');
    } finally {
      if (restore) restore();
      setExporting(false);
    }
  }, [ref]);

  const printAnalysis = useCallback(() => {
    window.print();
  }, []);

  return { exportToPdf, printAnalysis, exporting };
}
