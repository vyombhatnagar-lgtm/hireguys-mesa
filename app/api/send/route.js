import { NextResponse } from 'next/server';
import { q, updateCandidate } from '@/lib/db';

export const runtime = 'nodejs';

// Sends the draft email for one candidate via Resend. Only ever triggered by the founder clicking Send.
export async function POST(req) {
  try {
    const { id, subject, body } = await req.json();
    const [c] = await q('select * from candidates where id = $1', [id]);
    if (!c) return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
    if (c.sent_at) return NextResponse.json({ error: 'Already sent' }, { status: 409 });
    if (!process.env.RESEND_API_KEY) return NextResponse.json({ error: 'RESEND_API_KEY not set' }, { status: 400 });

    const to = process.env.EMAIL_OVERRIDE_TO || c.personal?.email;
    if (!to) return NextResponse.json({ error: 'No email address on file for this candidate' }, { status: 400 });

    const name = (c.personal?.name || 'there').split(/\s+/)[0];
    const finalSubject = (subject ?? c.email_subject).replaceAll('[NAME]', name);
    const finalBody = (body ?? c.email_body).replaceAll('[NAME]', name);

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || 'Kargo Hiring <onboarding@resend.dev>',
        to: [to],
        subject: finalSubject,
        text: finalBody,
      }),
    });
    const out = await res.json();
    if (!res.ok) return NextResponse.json({ error: out?.message || JSON.stringify(out) }, { status: 502 });

    const sent_at = new Date().toISOString();
    await updateCandidate(id, { sent_at, email_subject: subject ?? c.email_subject, email_body: body ?? c.email_body });
    return NextResponse.json({ ok: true, to, sent_at, resend_id: out.id });
  } catch (e) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 500 });
  }
}
