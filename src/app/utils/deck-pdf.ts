import { Deck, DeckCard } from '../models/deck';

const JSPDF_CDN = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js';
// Served locally from public/ so no CORS — fetched + canvas-rasterized at PDF time.
const LOGO_URL = '/yugioh-logo.svg';

const SECTION_TITLES: Record<'main' | 'extra' | 'side', string> = {
  main: 'Main Deck',
  extra: 'Extra Deck',
  side: 'Side Deck',
};

let jspdfPromise: Promise<unknown> | null = null;

function loadJsPdf(): Promise<unknown> {
  // already loaded
  if ((window as unknown as { jspdf?: unknown }).jspdf) {
    return Promise.resolve((window as unknown as { jspdf: unknown }).jspdf);
  }
  if (jspdfPromise) return jspdfPromise;
  jspdfPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = JSPDF_CDN;
    s.async = true;
    s.onload = () =>
      resolve((window as unknown as { jspdf: unknown }).jspdf);
    s.onerror = () => {
      jspdfPromise = null;
      reject(new Error('jsPDF CDN load failed'));
    };
    document.head.appendChild(s);
  });
  return jspdfPromise;
}

async function fetchLogoPng(targetWidth: number): Promise<string | null> {
  try {
    const res = await fetch(LOGO_URL);
    if (!res.ok) return null;
    const svgText = await res.text();
    const blob = new Blob([svgText], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    return await new Promise<string | null>((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const w = img.naturalWidth || 800;
          const h = img.naturalHeight || 240;
          const scale = targetWidth / w;
          canvas.width = targetWidth;
          canvas.height = Math.round(h * scale);
          const ctx = canvas.getContext('2d');
          if (!ctx) { URL.revokeObjectURL(url); resolve(null); return; }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL('image/png'));
        } catch {
          URL.revokeObjectURL(url);
          resolve(null);
        }
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  } catch {
    return null;
  }
}

export async function exportDeckPdf(deck: Deck): Promise<boolean> {
  try {
    const ns = await loadJsPdf() as { jsPDF: new (opts: object) => PdfDoc };
    const doc = new ns.jsPDF({ unit: 'mm', format: 'a4' });

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 18;
    const contentW = pageW - 2 * margin;
    let y = margin;

    // ---- Logo or stylized header ----
    const logoPng = await fetchLogoPng(800);
    if (logoPng) {
      const logoWmm = 50;
      const aspect = imageAspectFromDataUrl(logoPng);
      const logoHmm = logoWmm / (aspect || 3.3);
      doc.addImage(logoPng, 'PNG', margin, y, logoWmm, logoHmm);
      y += logoHmm + 4;
    } else {
      doc.setFontSize(22);
      doc.setTextColor(180, 26, 44);
      doc.setFont('helvetica', 'bold');
      doc.text('Yu-Gi-Oh!', margin, y + 8);
      y += 12;
    }

    // ---- Deck name ----
    doc.setTextColor(20, 20, 20);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(deck.name, margin, y + 6);
    y += 8;

    // ---- Subtitle / date ----
    doc.setFontSize(9);
    doc.setTextColor(110, 110, 110);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Liste générée le ${new Date().toLocaleString('fr-FR')}`,
      margin,
      y + 4,
    );
    y += 9;

    // ---- Sections ----
    for (const id of ['main', 'extra', 'side'] as const) {
      if (y > pageH - 40) { doc.addPage(); y = margin; }
      y = drawSection(doc, SECTION_TITLES[id], deck[id], margin, y, contentW, pageH);
      y += 4;
    }

    doc.save(`${slugify(deck.name)}.pdf`);
    return true;
  } catch (err) {
    console.error('PDF export failed:', err);
    return false;
  }
}

function imageAspectFromDataUrl(_dataUrl: string): number | null {
  // We don't decode the data URL here; the caller will use the natural ratio
  // computed at canvas creation time. Returning null falls back to the default.
  // (The fetchLogoPng() canvas already preserves the natural aspect.)
  return null;
}

interface PdfDoc {
  internal: { pageSize: { getWidth(): number; getHeight(): number } };
  addImage(data: string, format: string, x: number, y: number, w: number, h: number): void;
  setFontSize(n: number): void;
  setTextColor(r: number, g: number, b: number): void;
  setFillColor(r: number, g: number, b: number): void;
  setFont(family: string, style?: string): void;
  text(s: string, x: number, y: number, opts?: object): void;
  rect(x: number, y: number, w: number, h: number, style?: string): void;
  addPage(): void;
  save(filename: string): void;
}

function drawSection(
  doc: PdfDoc,
  title: string,
  cards: DeckCard[],
  x: number,
  y: number,
  w: number,
  pageH: number,
): number {
  const total = cards.reduce((s, c) => s + c.count, 0);

  // Title frame — red bg (dominant) + thin black accent stripe on the left
  const headerH = 9;
  doc.setFillColor(184, 26, 44);
  doc.rect(x, y, w, headerH, 'F');
  doc.setFillColor(20, 20, 20);
  doc.rect(x, y, 3, headerH, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`${title}`, x + 7, y + 6);

  // count on the right of the title frame
  doc.setTextColor(255, 250, 220);
  doc.setFontSize(10);
  doc.text(`${total}`, x + w - 4, y + 6, { align: 'right' } as object);

  y += headerH + 3;

  if (cards.length === 0) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(150, 150, 150);
    doc.text('— vide —', x + 4, y + 3);
    return y + 6;
  }

  // Rows
  doc.setFontSize(9.5);
  for (const c of cards) {
    if (y > pageH - 14) { doc.addPage(); y = 18; }

    // count
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(184, 26, 44);
    doc.text(`${c.count}×`, x + 4, y + 4);

    // name
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(25, 25, 25);
    doc.text(c.snapshot.name, x + 14, y + 4);

    // set code (right-aligned)
    doc.setTextColor(120, 120, 120);
    doc.text(c.snapshot.set_code ?? '—', x + w - 2, y + 4, { align: 'right' } as object);

    y += 5;
  }
  return y;
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'deck'
  );
}

// ---- Fallback: print-window export when jsPDF can't be loaded (offline CDN, etc.) ----

export function openDeckPrintWindow(deck: Deck): boolean {
  const win = window.open('', '_blank', 'width=820,height=920');
  if (!win) return false;
  win.document.open();
  win.document.write(renderHtml(deck));
  win.document.close();
  win.onload = () => { win.focus(); win.print(); };
  return true;
}

function renderHtml(deck: Deck): string {
  const generated = new Date().toLocaleString('fr-FR');
  const sections = (['main', 'extra', 'side'] as const)
    .map((s) => sectionBlock(SECTION_TITLES[s], deck[s]))
    .join('');
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Deck — ${escapeHtml(deck.name)}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 24px; }
    h1 { font-size: 22px; margin: 0 0 4px; border-bottom: 2px solid #b8141f; padding-bottom: 8px; color: #1a1a1a; }
    .meta { color: #666; font-size: 11px; margin-bottom: 24px; }
    h2 { font-size: 14px; margin: 20px 0 6px; padding: 5px 10px; background: #b8141f; color: #fff; border-left: 4px solid #141414; letter-spacing: 0.04em; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { padding: 4px 8px; text-align: left; border-bottom: 1px solid #e0e0e0; }
    th { background: #f5f5f5; font-weight: 700; font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #555; }
    .count { width: 40px; text-align: center; font-weight: 700; color: #b8141f; }
    .set { width: 90px; color: #555; font-family: 'Courier New', monospace; font-size: 10px; }
    .empty { color: #999; font-style: italic; padding: 8px; font-size: 11px; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <h1>${escapeHtml(deck.name)}</h1>
  <p class="meta">Liste de deck Yu-Gi-Oh! — généré le ${generated}</p>
  ${sections}
</body>
</html>`;
}

function sectionBlock(title: string, cards: DeckCard[]): string {
  const total = cards.reduce((s, c) => s + c.count, 0);
  if (cards.length === 0) {
    return `<h2>${title} (0)</h2><div class="empty">— vide —</div>`;
  }
  const rows = cards
    .map(
      (c) => `<tr>
          <td class="count">${c.count}×</td>
          <td>${escapeHtml(c.snapshot.name)}</td>
          <td class="set">${escapeHtml(c.snapshot.set_code ?? '—')}</td>
        </tr>`,
    )
    .join('');
  return `<h2>${title} (${total})</h2>
    <table>
      <thead><tr><th class="count">×</th><th>Nom</th><th class="set">Set</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
