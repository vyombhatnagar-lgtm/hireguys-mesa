import { NextResponse } from 'next/server';
import { q, getRubric } from '@/lib/db';
import { useAI } from '@/lib/pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rubric = await getRubric(); // also creates tables on first run
    const candidates = await q(
      `select id, created_at, file_name, applied_role, personal, scores, pm_score::float as pm_score, spm_score::float as spm_score,
              status, error, brief, email_type, email_subject, email_body, sent_at, draft_method
       from candidates order by created_at desc`
    );
    return NextResponse.json({ candidates, rubric, mode: useAI() ? 'ai' : 'rules' });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}

// Delete a candidate row (e.g. a failed upload), or every row with { all: true } to reset a demo
export async function DELETE(req) {
  try {
    const { id, all } = await req.json();
    if (all) await q('delete from candidates');
    else await q('delete from candidates where id = $1', [id]);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
