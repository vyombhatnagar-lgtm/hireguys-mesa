import { geminiFile } from './gemini';

// Turns an uploaded resume into plain text.
// PDF / DOCX / TXT / MD / RTF are read directly. Scanned PDFs and photos (JPG / PNG / WEBP)
// have no text layer, so they are transcribed by Gemini when GEMINI_API_KEY is set.
const IMAGE_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp' };

export class UnreadableFile extends Error {
  constructor(msg) {
    super(msg);
    this.status = 422;
  }
}

const ext = (name) => (name.match(/\.[^.]+$/) || [''])[0].toLowerCase();

export async function fileToText(file) {
  const name = file.name || '';
  const e = ext(name);
  const buf = Buffer.from(await file.arrayBuffer());

  if (e === '.pdf') {
    const { getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const out = await pdfLines(pdf);
    if (out.trim().length >= 50) return out;
    return transcribe(buf, 'application/pdf', 'This PDF looks scanned (no text layer).');
  }
  if (e === '.docx') {
    const mammoth = await import('mammoth');
    const { value } = await (mammoth.default || mammoth).extractRawText({ buffer: buf });
    return value;
  }
  if (e === '.doc') throw new UnreadableFile('Old Word .doc files are not supported. Save it as .docx or PDF and upload again.');
  if (e === '.rtf') return rtfToText(buf.toString('latin1'));
  if (IMAGE_TYPES[e]) return transcribe(buf, IMAGE_TYPES[e], 'Photos of a resume need text recognition.');
  if (['.txt', '.md', ''].includes(e)) return buf.toString('utf8');
  throw new UnreadableFile(`Unsupported file type "${e}". Use PDF, Word (.docx), TXT, RTF or an image.`);
}

async function transcribe(buf, mimeType, why) {
  if (!process.env.GEMINI_API_KEY) throw new UnreadableFile(`${why} Add GEMINI_API_KEY to read it, or upload a text PDF / .docx.`);
  try {
    return await geminiFile(
      buf,
      mimeType,
      'Transcribe all the text in this resume exactly as written, keeping the line breaks and section headings. Output only the text.'
    );
  } catch (err) {
    throw new UnreadableFile(`${why} Gemini could not read it right now (${err.message.slice(0, 80)}). Try again later, or upload a text PDF / .docx.`);
  }
}

// Rebuild lines from text positions: many PDFs do not mark line ends, and the rubric rules need one bullet per line
async function pdfLines(pdf) {
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const { items } = await (await pdf.getPage(p)).getTextContent();
    const rows = [];
    for (const it of items) {
      if (!it.str) continue;
      const [x, y] = [it.transform[4], it.transform[5]];
      let row = rows.find((r) => Math.abs(r.y - y) < 2.5);
      if (!row) rows.push((row = { y, parts: [] }));
      row.parts.push({ x, s: it.str });
    }
    rows.sort((a, b) => b.y - a.y);
    pages.push(
      rows
        .map((r) => r.parts.sort((a, b) => a.x - b.x).map((q) => q.s).join('').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join('\n')
    );
  }
  return pages.join('\n');
}

// Windows-1252 punctuation that RTF writes as \'xx escapes
const CP1252 = { 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—', 0x85: '…' };

// Minimal RTF → text: drop groups like fonttbl/colortbl, control words and braces
function rtfToText(rtf) {
  return rtf
    .replace(/\\\r?\n/g, '\n') // "\" + newline is an RTF line break
    .replace(/\{\\(fonttbl|colortbl|stylesheet|info|\*)[\s\S]*?\}\s*/g, '')
    .replace(/\\par[d]?\b ?/g, '\n')
    .replace(/\\'([0-9a-f]{2})/gi, (_, h) => CP1252[parseInt(h, 16)] || String.fromCharCode(parseInt(h, 16)))
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/[{}]/g, '')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
