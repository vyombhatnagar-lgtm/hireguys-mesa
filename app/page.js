'use client';
import { useEffect, useState } from 'react';

const guessRole = (name, fallback) => {
  const n = name.toLowerCase();
  if (n.startsWith('spm_')) return 'SPM';
  if (n.startsWith('pm_')) return 'PM';
  return fallback;
};

export default function Upload() {
  const [role, setRole] = useState('PM');
  const [queue, setQueue] = useState([]); // {file, role, state, msg}
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]);
  const [mode, setMode] = useState(null);
  useEffect(() => { fetch('/api/candidates').then((r) => r.json()).then((d) => setMode(d.mode || null)).catch(() => {}); }, []);
  const add = (m) => setLog((l) => [...l, `${new Date().toLocaleTimeString()}  ${m}`]);

  function pick(e) {
    const files = [...e.target.files];
    setQueue(files.map((f) => ({ file: f, role: guessRole(f.name, role), state: 'queued', msg: '' })));
  }
  const setItem = (i, patch) => setQueue((q) => q.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  // Demo: fetch the fictional CVs in public/samples and run them through the normal upload flow
  async function loadSamples() {
    setBusy(true);
    const names = await fetch('/samples/index.json').then((r) => r.json());
    const files = await Promise.all(
      names.map(async (n) => new File([await fetch(`/samples/${n}`).then((r) => r.text())], n, { type: 'text/plain' }))
    );
    const items = files.map((f) => ({ file: f, role: guessRole(f.name, role), state: 'queued', msg: '' }));
    setQueue(items);
    add(`Loaded ${files.length} sample CVs (fictional candidates).`);
    await run(items);
  }

  async function run(source = queue) {
    setBusy(true);
    const items = source.map((q, i) => ({ ...q, i }));
    let next = 0;
    async function worker() {
      while (next < items.length) {
        const it = items[next++];
        if (it.state === 'done') continue;
        setItem(it.i, { state: 'working' });
        const fd = new FormData();
        fd.append('file', it.file);
        fd.append('role', it.role);
        try {
          const res = await fetch('/api/upload', { method: 'POST', body: fd });
          const out = await res.json();
          if (!res.ok) throw new Error(out.error);
          setItem(it.i, { state: 'done', msg: `PM ${out.pm_score} · SPM ${out.spm_score}` });
          add(`${it.file.name}: scored PM ${out.pm_score} / SPM ${out.spm_score}`);
        } catch (err) {
          setItem(it.i, { state: 'error', msg: err.message });
          add(`${it.file.name}: ERROR ${err.message}`);
        }
      }
    }
    await Promise.all([worker(), worker()]);
    add('Scoring done. Generating briefs and email drafts…');
    for (let k = 0; k < 60; k++) {
      const res = await fetch('/api/reconcile', { method: 'POST' });
      const out = await res.json();
      if (!res.ok) { add('Draft error: ' + out.error); break; }
      add(`Drafts: ${out.processed} done, ${out.remaining} remaining`);
      if (out.remaining === 0) break;
    }
    add('Pipeline complete. Open the dashboard.');
    setBusy(false);
  }

  const done = queue.filter((q) => q.state === 'done').length;
  return (
    <>
      <h1>Upload CVs</h1>
      {mode === 'rules' && (
        <div className="panel notice small">
          <strong>Rule-based mode.</strong> No <code>GEMINI_API_KEY</code> is set, so CVs are scored by fixed keyword rules built from the rubric,
          and briefs and emails come from templates. Add a Gemini key to switch to AI scoring and drafting.
        </div>
      )}
      <div className="panel">
        <div className="row">
          <label>
            Applied role{' '}
            <select value={role} onChange={(e) => { setRole(e.target.value); setQueue((q) => q.map((x) => ({ ...x, role: guessRole(x.file.name, e.target.value) }))); }} disabled={busy}>
              <option value="PM">Product Manager</option>
              <option value="SPM">Senior Product Manager</option>
            </select>
          </label>
          <input type="file" multiple accept=".pdf,.docx,.txt" onChange={pick} disabled={busy} />
          <button onClick={() => run()} disabled={busy || !queue.length}>{busy ? `Processing ${done}/${queue.length}…` : `Upload & score ${queue.length || ''}`}</button>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="secondary" onClick={loadSamples} disabled={busy}>Load 12 sample CVs (demo)</button>
          <span className="muted small">Fictional candidates, 6 per role, scored through the same pipeline.</span>
        </div>
        <p className="muted small">
          Personal details (name, email, phone) are separated at upload and never sent to the scoring, brief or email steps.
          Files named pm_… / spm_… pre-select their role; you can change any row below.
        </p>
      </div>

      {queue.length > 0 && (
        <div className="panel">
          <table>
            <thead><tr><th>File</th><th>Role</th><th>Status</th></tr></thead>
            <tbody>
              {queue.map((q, i) => (
                <tr key={i}>
                  <td>{q.file.name}</td>
                  <td>
                    <select value={q.role} onChange={(e) => setItem(i, { role: e.target.value })} disabled={busy || q.state === 'done'}>
                      <option value="PM">PM</option>
                      <option value="SPM">SPM</option>
                    </select>
                  </td>
                  <td className="small">
                    {q.state === 'error' ? <span className="pill err">error</span> : q.state}
                    {q.msg && <span className="muted"> {q.msg}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {log.length > 0 && <div className="log">{log.map((l, i) => <div key={i}>{l}</div>)}</div>}
    </>
  );
}
