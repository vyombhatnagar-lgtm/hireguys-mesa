import { NextResponse } from 'next/server';
import { reconcile } from '@/lib/pipeline';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Generates briefs + email drafts for whoever needs them. Call repeatedly until remaining = 0.
export async function POST() {
  try {
    return NextResponse.json(await reconcile(4));
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
