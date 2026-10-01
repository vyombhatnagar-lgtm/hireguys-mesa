import { NextResponse } from 'next/server';
import { fileToText } from '@/lib/parse';
import { processUpload } from '@/lib/pipeline';

export const runtime = 'nodejs';
export const maxDuration = 120; // scanned PDFs / photos add a transcription step

export async function POST(req) {
  try {
    const form = await req.formData();
    const file = form.get('file');
    const appliedRole = form.get('role');
    if (!file || !['PM', 'SPM'].includes(appliedRole)) {
      return NextResponse.json({ error: 'file and role (PM|SPM) required' }, { status: 400 });
    }
    // Postgres rejects NUL bytes, which some PDFs and transcriptions contain
    const rawText = (await fileToText(file)).replace(/\u0000/g, '');
    if (!rawText || rawText.trim().length < 50) {
      return NextResponse.json({ error: 'Could not read text from file' }, { status: 422 });
    }
    const result = await processUpload({ fileName: file.name, rawText, appliedRole });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: e.status || 500 });
  }
}
