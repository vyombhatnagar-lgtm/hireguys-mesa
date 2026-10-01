'use client';
import { useEffect, useState } from 'react';

const LABEL = { PM: 'Product Manager', SPM: 'Senior Product Manager' };

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [role, setRole] = useState('PM');
  const [open, setOpen] = useState(null);
  const [drafting, setDrafting] = useState(false);

  async function load() {
    const res = await fetch('/api/candidates', { cache: 'no-store' });
    const out = await res.json();
    if (!res.ok) return setErr(out.error);
    setData(out);
  }
  useEffect(() => { load(); }, []);

  async function refreshDrafts() {
    setDrafting(true);
    for (let k = 0; k < 60; k++) {
      const res = await fetch('/api/reconcile', { method: 'POST' });
      const out = await res.json().catch(() => ({ error: `server returned ${res.status}` }));
      if (!res.ok) { setErr(out.error); break; }
      if (out.remaining === 0) break;
    }
    await load();
    setDrafting(false);
  }

  async function clearAll() {
    if (!confirm('Delete every candidate, including sent ones? The rubric is kept.')) return;
    await fetch('/api/candidates', { method: 'DELETE', body: JSON.stringify({ all: true }) });
    setOpen(null);
    load();
  }

  if (err) return <div className="panel err">{err}</div>;
  if (!data) return <p className="muted">Loading…</p>;

  const key = role === 'PM' ? 'pm_score' : 'spm_score';
  const scored = data.candidates.filter((c) => c.status === 'scored');
  const list = scored.filter((c) => c.applied_role === role).sort((a, b) => (b[key] || 0) - (a[key] || 0));
  const errors = data.candidates.filter((c) => c.status !== 'scored');
  const missingDrafts = scored.some((c) => !c.email_body);

  return (
    <>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h1 style={{ margin: 0 }}>Candidates</h1>
        <div className="row">
          <span className="muted small">{scored.length} scored · {scored.filter((c) => c.sent_at).length} sent</span>
          <button className="secondary" onClick={refreshDrafts} disabled={drafting}>{drafting ? 'Drafting…' : missingDrafts ? 'Generate missing drafts' : 'Re-check drafts'}</button>
          <button className="secondary" onClick={load}>Refresh</button>
          <button className="secondary" onClick={clearAll} disabled={!data.candidates.length}>Clear all</button>
        </div>
      </div>

      {data.mode === 'rules' && (
        <div className="panel notice small">
          <strong>Rule-based mode:</strong> scores come from keyword rules built from the rubric, and briefs and emails from templates. They show which evidence a CV mentions, not how good it is. Add <code>GEMINI_API_KEY</code> for AI scoring.
        </div>
      )}

      <div className="tabs">
        {['PM', 'SPM'].map((r) => (
          <button key={r} className={role === r ? 'active' : ''} onClick={() => { setRole(r); setOpen(null); }}>
            {LABEL[r]} ({scored.filter((c) => c.applied_role === r).length})
          </button>
        ))}
      </div>

      {list.length === 0 && <p className="muted">No candidates for this role yet. Upload CVs first.</p>}
      {list.map((c, i) => (
        <Card key={c.id} c={c} rank={i + 1} role={role} open={open === c.id} toggle={() => setOpen(open === c.id ? null : c.id)} onSent={load} />
      ))}

      {errors.length > 0 && (
        <div className="panel" style={{ marginTop: 24 }}>
          <strong>Failed / incomplete uploads</strong>
          {errors.map((c) => (
            <div key={c.id} className="row small" style={{ marginTop: 6 }}>
              <span>{c.file_name}</span><span className="pill err">{c.status}</span><span className="muted">{c.error}</span>
              <button className="secondary" onClick={async () => { await fetch('/api/candidates', { method: 'DELETE', body: JSON.stringify({ id: c.id }) }); load(); }}>Remove</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Card({ c, rank, role, open, toggle, onSent }) {
  const other = role === 'PM' ? 'SPM' : 'PM';
  const s = c.scores?.[role];
  const first = (c.personal?.name || '').split(/\s+/)[0] || 'there';
  const fill = (t) => (t || '').replaceAll('[NAME]', first);
  const [subject, setSubject] = useState(fill(c.email_subject));
  const [body, setBody] = useState(fill(c.email_body));
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { setSubject(fill(c.email_subject)); setBody(fill(c.email_body)); }, [c.email_subject, c.email_body]);

  async function send() {
    if (!confirm(`Send this ${c.email_type} to ${c.personal?.name} <${c.personal?.email}>?`)) return;
    setSending(true); setMsg('');
    const res = await fetch('/api/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: c.id, subject, body }) });
    const out = await res.json();
    setSending(false);
    if (!res.ok) return setMsg('Error: ' + out.error);
    setMsg(`Sent to ${out.to}`);
    onSent();
  }

  return (
    <div className="card">
      <div className="card-head" onClick={toggle}>
        <div className="rank">#{rank}</div>
        <div>
          <strong>{c.personal?.name || c.file_name}</strong>
          <div className="muted small">{c.file_name}{c.scores?.method === 'rules' && <span className="pill rules">rule-based</span>}</div>
        </div>
        <div><div className="score">{c.scores?.[role]?.total ?? '–'}</div><div className="muted small">{role} score</div></div>
        <div className="hide-sm"><div>{c.scores?.[other]?.total ?? '–'}</div><div className="muted small">{other} score</div></div>
        <div className="hide-sm">
          {c.sent_at ? <span className="pill sent">sent</span> : c.email_type ? <span className={`pill ${c.email_type}`}>{c.email_type}</span> : <span className="muted small">no draft</span>}
        </div>
      </div>
      {open && (
        <div className="card-body">
          <div>
            {c.brief && <p className="brief">{c.brief}{c.draft_method === 'rules' && <span className="pill rules">template</span>}</p>}
            <table>
              <thead><tr><th>Criterion</th><th>Score</th><th>Why</th></tr></thead>
              <tbody>
                {s?.criteria.map((x) => (
                  <tr key={x.name}>
                    <td>{x.name} <span className="muted small">({x.weight}%)</span></td>
                    <td><strong>{x.score}</strong>/5</td>
                    <td className="small">{x.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted small" style={{ marginTop: 10 }}>
              {c.personal?.email} · {c.personal?.phone} {c.personal?.location ? `· ${c.personal.location}` : ''}
            </p>
          </div>
          <div>
            {c.email_body ? (
              <>
                {c.draft_method === 'rules' && <p className="muted small" style={{ margin: '0 0 6px' }}>Template draft (no AI). Edit before sending.</p>}
                <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} style={{ width: '100%', marginBottom: 8 }} disabled={!!c.sent_at} />
                <textarea value={body} onChange={(e) => setBody(e.target.value)} disabled={!!c.sent_at} />
                <div className="row" style={{ marginTop: 8 }}>
                  {c.sent_at ? (
                    <span className="pill sent">Sent {new Date(c.sent_at).toLocaleString()}</span>
                  ) : (
                    <button onClick={send} disabled={sending}>{sending ? 'Sending…' : `Confirm & send ${c.email_type}`}</button>
                  )}
                  {msg && <span className="small">{msg}</span>}
                </div>
              </>
            ) : (
              <p className="muted">No draft yet. Click “Generate missing drafts”.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
