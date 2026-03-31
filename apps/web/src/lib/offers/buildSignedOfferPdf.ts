import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

function wrapLines(text: string, maxLen: number): string[] {
  const out: string[] = [];
  const paragraphs = text.split(/\n+/);
  for (const para of paragraphs) {
    if (!para.trim()) {
      out.push('');
      continue;
    }
    let rest = para.trim();
    while (rest.length > 0) {
      if (rest.length <= maxLen) {
        out.push(rest);
        break;
      }
      let slice = rest.slice(0, maxLen);
      const breakAt = slice.lastIndexOf(' ');
      if (breakAt > maxLen * 0.55) slice = rest.slice(0, breakAt);
      out.push(slice.trimEnd());
      rest = rest.slice(slice.length).trimStart();
    }
  }
  return out;
}

export async function buildSignedOfferPdfBytes(opts: {
  letterPlainText: string;
  orgName: string;
  jobTitle: string;
  candidateName: string;
  signerName: string;
  signedAt: Date;
  signaturePngBytes?: Uint8Array | null;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([595, 842]);
  const margin = 48;
  const maxChars = 85;
  let y = 800;
  const lineH = 13;

  const draw = (text: string, size: number, bold?: boolean) => {
    const f = bold ? fontBold : font;
    const width = f.widthOfTextAtSize(text, size);
    if (width > 500) {
      for (const piece of wrapLines(text, maxChars)) {
        if (y < margin + lineH) {
          page = pdf.addPage([595, 842]);
          y = 800;
        }
        page.drawText(piece, { x: margin, y, size, font: f, color: rgb(0.1, 0.1, 0.12) });
        y -= lineH;
      }
      return;
    }
    if (y < margin + lineH) {
      page = pdf.addPage([595, 842]);
      y = 800;
    }
    page.drawText(text, { x: margin, y, size, font: f, color: rgb(0.1, 0.1, 0.12) });
    y -= lineH;
  };

  draw(opts.orgName, 9);
  y -= 4;
  draw(`Offer letter — ${opts.jobTitle}`, 13, true);
  y -= 6;
  draw(`Candidate: ${opts.candidateName}`, 10);
  y -= 10;

  const lines = wrapLines(opts.letterPlainText, maxChars);
  for (const line of lines) {
    if (y < margin + lineH) {
      page = pdf.addPage([595, 842]);
      y = 800;
    }
    if (!line) {
      y -= lineH * 0.5;
      continue;
    }
    page.drawText(line, { x: margin, y, size: 10, font, color: rgb(0.15, 0.15, 0.18) });
    y -= lineH;
  }

  y -= 12;
  if (opts.signaturePngBytes?.length) {
    try {
      const img = await pdf.embedPng(opts.signaturePngBytes);
      const scale = Math.min(120 / img.width, 48 / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      if (y < margin + h + 32) {
        page = pdf.addPage([595, 842]);
        y = 800;
      }
      page.drawImage(img, { x: margin, y: y - h, width: w, height: h });
      y -= h + 8;
    } catch {
      /* invalid PNG */
    }
  }

  y -= 4;
  draw(`Signed electronically by: ${opts.signerName}`, 11, true);
  draw(`Date: ${opts.signedAt.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`, 9);

  return pdf.save();
}
