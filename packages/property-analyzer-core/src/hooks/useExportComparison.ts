import { useState, useCallback, type RefObject } from 'react';
import { usePropertyAnalyzerCore } from '../context.js';

const HEADER_HEIGHT = 14; // mm reserved for header on each page
const FOOTER_HEIGHT = 6;  // mm reserved for footer
const CAPTURE_TIMEOUT = 30_000;

const BLANK =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function neutralizeCrossOrigin(el: HTMLElement) {
  const undos: (() => void)[] = [];

  // Rewrite <style> textContent to strip @import url(...) lines
  document.querySelectorAll('style').forEach(style => {
    const original = style.textContent || '';
    if (/@import\s/i.test(original)) {
      style.textContent = original.replace(/@import\s+url\([^)]*\)\s*;?/gi, '');
      undos.push(() => { style.textContent = original; });
    }
  });

  // Disable cross-origin <link rel="stylesheet">
  document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]').forEach(link => {
    const href = link.href || '';
    if (href.startsWith('http') && !href.startsWith(window.location.origin)) {
      link.dataset.origMedia = link.media;
      link.media = 'not all';
      undos.push(() => { link.media = link.dataset.origMedia || ''; delete link.dataset.origMedia; });
    }
  });

  // Remove cross-origin <script> tags
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

  // Swap every <img> src in the full document to an inline data URI
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

  // Swap <canvas> to static images or hide
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

export default function useExportComparison(ref: RefObject<HTMLDivElement | null>) {
  const { adapters } = usePropertyAnalyzerCore();
  const [exporting, setExporting] = useState(false);

  const exportToPdf = useCallback(async () => {
    const el = ref.current;
    if (!el) return;

    adapters.events?.exportStarted?.('comparison-pdf');
    setExporting(true);
    let restore: (() => void) | null = null;
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ]);

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
          // Kill all animations so nothing is mid-fade
          const reset = doc.createElement('style');
          reset.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; opacity: 1 !important; transform: none !important; }';
          doc.head.appendChild(reset);

          clonedEl.querySelectorAll('.no-print').forEach(n => {
            (n as HTMLElement).style.display = 'none';
          });
          const ph = clonedEl.querySelector('.print-header') as HTMLElement | null;
          if (ph) ph.style.display = 'none';
          const ch = clonedEl.querySelector('.comparison-dashboard__header') as HTMLElement | null;
          if (ch) ch.style.display = 'none';
        },
      });

      const timeoutPromise = new Promise<never>((_resolve, reject) =>
        setTimeout(() => reject(new Error('html2canvas timed out')), CAPTURE_TIMEOUT),
      );

      const canvas = await Promise.race([capturePromise, timeoutPromise]);

      restore(); restore = null;

      // Build title from property addresses
      const addresses = Array.from(el.querySelectorAll('.print-header__property'))
        .map(el => el.textContent?.trim())
        .filter(Boolean);
      const title = 'Property Comparison Report';
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
        pdf.setTextColor(30, 41, 59); // slate-800
        pdf.text(title, margin, margin + 5);

        // Addresses on first page header
        if (page === 0 && addresses.length > 0) {
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(7.5);
          pdf.setTextColor(100, 116, 139); // slate-500
          pdf.text(addresses.join('  •  '), margin, margin + 9);
        }

        // Date on right
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.5);
        pdf.setTextColor(100, 116, 139);
        pdf.text(dateStr, pageWidth - margin, margin + 5, { align: 'right' });

        // Header underline
        pdf.setDrawColor(102, 126, 234); // #667eea
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
        pdf.setTextColor(148, 163, 184); // slate-400
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

      pdf.save('property-comparison.pdf');
    } catch (err) {
      console.error('PDF export failed:', err);
      adapters.events?.error?.({
        code: 'export-failed',
        message: 'Failed to export comparison PDF.',
        cause: err,
        retryable: true,
      });
      alert('Failed to export PDF. Please try using Print instead.');
    } finally {
      if (restore) restore();
      setExporting(false);
    }
  }, [adapters.events, ref]);

  const printComparison = useCallback(() => {
    adapters.events?.exportStarted?.('comparison-print');
    window.print();
  }, [adapters.events]);

  return { exportToPdf, printComparison, exporting };
}
