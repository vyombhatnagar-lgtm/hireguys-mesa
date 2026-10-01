import { gemini } from './gemini';
import { q, getRubric, updateCandidate } from './db';
import { extractPersonalRules, scoreRules, briefRules, emailRules } from './rules';

// Without a Gemini key everything runs on the rubric rules in lib/rules.js
export const useAI = () => !!process.env.GEMINI_API_KEY;

const ROLE_LABEL = { PM: 'Product Manager', SPM: 'Senior Product Manager' };

// ---------- Step 0: separate personal details from CV content ----------
// The extraction call is the only AI step that sees raw text. Its job is to pull the
// personal details out. Everything downstream only ever receives the redacted cv_content.
export async function extractPersonal(rawText) {
  const out = await gemini(
    `You are a data-extraction step. From the CV text below, extract the candidate's personal details.
Return JSON: {"name": string, "email": string, "phone": string, "location": string}
Use "" if missing. Do not summarise or evaluate anything.

CV TEXT:
"""${rawText.slice(0, 30000)}"""`
  );
  const personal = {
    name: (out.name || '').trim(),
    email: (out.email || '').trim(),
    phone: (out.phone || '').trim(),
    location: (out.location || '').trim(),
  };
  // Fallbacks with regex if the model missed them
  if (!personal.email) personal.email = (rawText.match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || [''])[0];
  if (!personal.phone) personal.phone = (rawText.match(/\+?\d[\d\s()-]{8,}\d/) || [''])[0].trim();
  return { personal, cvContent: redact(rawText, personal) };
}

// Deterministic redaction: strip name, emails, phones, profile URLs.
export function redact(text, personal) {
  let t = text;
  t = t.replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[EMAIL]');
  t = t.replace(/(\+?\d[\d\s().-]{8,}\d)/g, (m) => (m.replace(/\D/g, '').length >= 10 ? '[PHONE]' : m));
  t = t.replace(/(https?:\/\/)?(www\.)?(linkedin\.com|github\.com|leetcode\.com)\/[^\s|·,]*/gi, '[LINK]');
  const parts = (personal.name || '').split(/\s+/).filter((p) => p.length > 2);
  if (personal.name) t = t.replace(new RegExp(escapeRe(personal.name), 'gi'), '[CANDIDATE]');
  for (const p of parts) t = t.replace(new RegExp(`\\b${escapeRe(p)}\\b`, 'gi'), '[CANDIDATE]');
  return t.replace(/(\[CANDIDATE\]\s*){2,}/g, '[CANDIDATE] ');
}
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------- Step 1: score against BOTH rubrics ----------
export async function scoreCandidate(cvContent, rubric) {
  const fmt = (rows) =>
    rows.map((r) => `- "${r.name}" (weight ${r.weight}%): ${r.description}`).join('\n');
  const out = await gemini(
    `You are scoring a CV for Kargo, a Series A logistics software startup in Mumbai (freight forwarders and 3PLs).
Score the CV against TWO rubrics independently: Product Manager (PM) and Senior Product Manager (SPM).

Scoring scale per criterion (integer 0-5):
5 = specific, dated evidence with a number or named outcome
3 = evidence present but vague or only partly the candidate's own
1 = only claimed in a summary, no supporting bullet
0 = absent
Rules: judge only what is written in work history. Summary claims without supporting bullets score at most 1.
Recompute tenure from dates; ignore stated "X years" in summaries. A self-described limitation counts against the candidate.
Each reason must be one line and quote or cite the specific evidence (or say what is missing).

PM RUBRIC:
${fmt(rubric.PM)}

SPM RUBRIC (higher bar, especially on independence):
${fmt(rubric.SPM)}

Return JSON exactly:
{"PM":[{"name": "<criterion name>", "score": 0-5, "reason": "..."}], "SPM":[{"name": "...", "score": 0-5, "reason": "..."}]}
Include every criterion, in the order given.

CV (personal details removed):
"""${cvContent.slice(0, 30000)}"""`
  );
  const scores = {};
  for (const role of ['PM', 'SPM']) {
    const criteria = rubric[role].map((r, i) => {
      const hit = (out[role] || []).find((c) => c.name === r.name) || (out[role] || [])[i] || {};
      const score = Math.max(0, Math.min(5, Number(hit.score) || 0));
      return { name: r.name, weight: Number(r.weight), score, reason: hit.reason || '' };
    });
    const total = Math.round(criteria.reduce((a, c) => a + (c.score / 5) * c.weight, 0) * 10) / 10;
    scores[role] = { total, criteria };
  }
  return scores;
}

// ---------- Step 2: interview brief (top candidates) ----------
async function makeBrief(c) {
  const role = c.applied_role;
  const s = c.scores[role];
  return gemini(
    `Write a three-sentence interview brief for Arjun Mehta (Founder, Kargo) about a ${ROLE_LABEL[role]} candidate.
Sentence 1: the strongest evidence for hiring them. Sentence 2: the biggest gap or risk. Sentence 3: the one question Arjun must ask in the interview to test that risk.
Plain text, exactly three sentences, no preamble. Refer to them as "the candidate".

Rubric scores (${s.total}/100):
${s.criteria.map((x) => `- ${x.name}: ${x.score}/5 - ${x.reason}`).join('\n')}

CV (personal details removed):
"""${c.cv_content.slice(0, 12000)}"""`,
    { json: false, temperature: 0.3 }
  );
}

// ---------- Step 3: personalised email draft ----------
async function makeEmail(c, type) {
  const role = ROLE_LABEL[c.applied_role];
  const s = c.scores[c.applied_role];
  const instr =
    type === 'invite'
      ? `An interview invitation for the ${role} role. Mention one or two specific things from their work history that stood out. Ask them to reply with three 45-minute slots over the next week for an in-person conversation at the Mumbai office.`
      : `A warm, respectful rejection for the ${role} role. Mention one specific genuine strength from their work history. Be clear it is a no for this role, without listing their weaknesses. Keep it short.`;
  const out = await gemini(
    `Draft an email from Arjun Mehta, Founder, Kargo (logistics software, Mumbai) to a candidate.
${instr}
Address the candidate as [NAME] (literal placeholder, it will be replaced). Do not invent facts not in the CV. Under 150 words. Sign off as "Arjun Mehta\\nFounder, Kargo".
Return JSON: {"subject": "...", "body": "..."}

Evidence summary:
${s.criteria.map((x) => `- ${x.name}: ${x.score}/5 - ${x.reason}`).join('\n')}

CV (personal details removed):
"""${c.cv_content.slice(0, 12000)}"""`,
    { temperature: 0.4 }
  );
  return { subject: out.subject || `Your application for ${role} at Kargo`, body: out.body || '' };
}

// ---------- Ranking + draft generation ----------
// Top N per applied role get a brief + invite; everyone else gets a rejection draft.
// Processes at most `limit` candidates per call so each request stays short on serverless.
export async function reconcile(limit = 4) {
  const topN = Number(process.env.TOP_N || 5);
  const data = await q(`select * from candidates where status = 'scored'`);

  const todo = [];
  for (const role of ['PM', 'SPM']) {
    const ranked = data
      .filter((c) => c.applied_role === role)
      .sort((a, b) => (b.scores?.[role]?.total || 0) - (a.scores?.[role]?.total || 0));
    ranked.forEach((c, i) => {
      if (c.sent_at) return; // never touch what has already been sent
      const wantType = i < topN ? 'invite' : 'rejection';
      const needBrief = wantType === 'invite' && !c.brief;
      const needEmail = c.email_type !== wantType || !c.email_body;
      if (needBrief || needEmail) todo.push({ c, wantType, needBrief, needEmail });
    });
  }

  const batch = todo.slice(0, limit);
  await Promise.all(
    batch.map(async ({ c, wantType, needBrief, needEmail }) => {
      const patch = {};
      let method = useAI() ? 'ai' : 'rules';
      // Gemini failure falls back to rule-based drafts, labelled as such
      const draft = async (ai, rules) => {
        if (method === 'ai') {
          try { return await ai(); } catch { method = 'rules'; }
        }
        return rules();
      };
      if (needBrief) patch.brief = await draft(() => makeBrief(c), () => briefRules(c));
      if (needEmail) {
        const e = await draft(() => makeEmail(c, wantType), () => emailRules(c, wantType));
        patch.email_type = wantType;
        patch.email_subject = e.subject;
        patch.email_body = e.body;
      }
      patch.draft_method = method;
      await updateCandidate(c.id, patch);
    })
  );
  return { processed: batch.length, remaining: todo.length - batch.length };
}

export async function processUpload({ fileName, rawText, appliedRole }) {
  const rubric = await getRubric();
  if (!rubric.PM.length || !rubric.SPM.length) throw new Error('rubric_criteria table is empty - check DATABASE_URL');
  const [row] = await q(
    `insert into candidates (file_name, applied_role, status) values ($1, $2, 'new') returning id`,
    [fileName, appliedRole]
  );
  try {
    let personal, cvContent, scores;
    if (useAI()) {
      try {
        ({ personal, cvContent } = await extractPersonal(rawText));
        scores = { method: 'ai', ...(await scoreCandidate(cvContent, rubric)) };
      } catch (e) {
        // Gemini unavailable (rate limit, outage): score with the rubric rules instead, labelled as such
        console.error('Gemini scoring failed, using rules:', e.message);
        personal = extractPersonalRules(rawText);
        cvContent = redact(rawText, personal);
        scores = scoreRules(cvContent, rubric);
      }
    } else {
      personal = extractPersonalRules(rawText);
      cvContent = redact(rawText, personal);
      scores = scoreRules(cvContent, rubric);
    }
    await updateCandidate(row.id, {
      personal,
      cv_content: cvContent,
      scores,
      pm_score: scores.PM.total,
      spm_score: scores.SPM.total,
      status: 'scored',
    });
    const updated = { id: row.id, file_name: fileName, applied_role: appliedRole, pm_score: scores.PM.total, spm_score: scores.SPM.total };
    return updated;
  } catch (err) {
    await updateCandidate(row.id, { status: 'error', error: String(err.message || err) });
    throw err;
  }
}
