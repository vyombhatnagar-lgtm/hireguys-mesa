// Turns an uploaded CV file (PDF / DOCX / TXT) into plain text.
export async function fileToText(file) {
  const name = (file.name || '').toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());
  if (name.endsWith('.pdf')) {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    return Array.isArray(text) ? text.join('\n') : text;
  }
  if (name.endsWith('.docx')) {
    const mammoth = await import('mammoth');
    const { value } = await (mammoth.default || mammoth).extractRawText({ buffer: buf });
    return value;
  }
  return buf.toString('utf8');
}
