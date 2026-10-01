// Rule-based fallback used when GEMINI_API_KEY is not set (or a Gemini draft call fails).
// Follows the scoring guide in rubric.txt:
//   5 = specific evidence in work history with a number or named outcome
//   3 = evidence present in work history but vague / missing the stronger signal
//   1 = mentioned only in the summary
//   0 = absent
// Keyword matching is a rough proxy for the rubric's judgement calls; results are labelled "rule-based".

const ROLE_LABEL = { PM: 'Product Manager', SPM: 'Senior Product Manager' };

// ---------- Personal details ----------
export function extractPersonalRules(rawText) {
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
  // First short "Firstname Lastname" in the top lines; tolerates "Name | email | phone" and "Name, MBA"
  const name =
    lines
      .slice(0, 6)
      .map((l) => l.split(/\s*[|,•·–—]\s*/)[0].replace(/^(name|resume|cv|curriculum vitae)\s*[:-]\s*/i, '').trim())
      .find((l) => /^[A-Za-z][A-Za-z.'-]*(\s+[A-Za-z][A-Za-z.'-]*){1,3}$/.test(l) && !/curriculum|resume|vitae|\bcv\b/i.test(l)) || '';
  const titled = name.toUpperCase() === name ? name.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : name;
  const email = (rawText.match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || [''])[0];
  const phone = (rawText.match(/\+?\d[\d\s()-]{8,}\d/) || [''])[0].trim();
  const location =
    (rawText.slice(0, 600).match(/\b(Mumbai|Navi Mumbai|Pune|Bengaluru|Bangalore|Delhi|New Delhi|Gurugram|Gurgaon|Noida|Chennai|Hyderabad|Kolkata|Ahmedabad)\b/i) || [''])[0];
  return { name: titled, email, phone, location };
}

// ---------- CV sections ----------
const EXP_WORDS = '(relevant |professional |work |career |employment )?(experience|history)|employment|work history|career history|internships?|projects|experience (and|&) projects';
const SUM_WORDS = 'summary|profile|about( me)?|objective|professional summary|career summary|personal statement|overview';
const OTHER_WORDS = 'education|skills|technical skills|key skills|projects|certifications?|awards|achievements|interests|languages|publications|references|volunteering|extra-?curricular';
const HEADER = new RegExp(`^(${EXP_WORDS}|${SUM_WORDS}|${OTHER_WORDS})\\s*:?$`, 'i');
const EXPERIENCE = new RegExp(`^(${EXP_WORDS})\\s*:?$`, 'i');
const SUMMARY = new RegExp(`^(${SUM_WORDS})\\s*:?$`, 'i');

function sections(cv) {
  const summary = [];
  const work = [];
  let cur = null;
  let sawHeader = false;
  for (const raw of cv.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const bare = line.replace(/[#*=_|:\-–—]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (HEADER.test(bare)) {
      sawHeader = true;
      cur = EXPERIENCE.test(bare) ? work : SUMMARY.test(bare) ? summary : null;
      continue;
    }
    // A line starting in lower case continues the previous bullet (wrapped text in PDFs)
    if (cur && cur.length && /^[a-z(]/.test(line)) cur[cur.length - 1] += ' ' + line;
    else if (cur) cur.push(line.replace(/^[-•*·▪]\s*/, ''));
  }
  // No recognisable headers: treat the whole CV as work history
  if (!sawHeader) return { summary: [], work: cv.split('\n').map((l) => l.trim().replace(/^[-•*·▪]\s*/, '')).filter(Boolean) };
  return { summary, work };
}

// ---------- Criterion rules (keyed by rubric position, same criteria for PM and SPM) ----------
const NUM = /\d/;
const NO_LAYER = /\bno (product|PM|VP|senior|account[- ]manager|manager)\b/i;
const R = {
  1: {
    // Did the operational work firsthand
    topic: /\b(shipments?|consignments?|bills? of lading|BoL|customs|CHA|carriers?|freight|dispatch|warehouse|delivery exceptions?|3PL|containers?|ports?|JNPT|e-?way bills?|trucks?|fleet|allocation|clearance|documentation)\b/i,
    strong: /\b(handled|processed|coordinated|cleared|ran|dispatched|allocated|resolved|filed|prepared|managed|booked|tracked)\b/i,
    weak: /\b(interviews?|user research|discovery|consult(ed|ing|ant)?|analy[sz]ed|shadowed|observed)\b/i,
    spmExtra: /\b(prioriti[sz]ed|integrations?|architected|designed|built|launched|platform)\b/i,
    missing: 'No firsthand operations work (documents, customs, carriers, exceptions) found in work history.',
  },
  2: {
    // Built something unprompted that others adopted
    topic: /\b(built|created|prototyped?|tracker|tool|checklist|dashboard|template|script|automated|spreadsheet|excel|playbook)\b/i,
    strong: /\b(adopted|used by|users|colleagues|rolled out|became (the |our )?(team |company )?standard|taken up|picked up|spread|others used)\b/i,
    weak: /\b(shipped \d+ features?|conference|talk|spoke|wrote \d+|PRDs?)\b/i,
    spmExtra: /\b(core (product|platform|feature)|company-?wide|org-?wide|organi[sz]ation|standard|across|other (teams|regions|offices)|beyond)\b/i,
    missing: 'No self-started tool or process with evidence of adoption found in work history.',
  },
  3: {
    // Killed or failed, and wrote down why
    topic: /\b(killed|sunset|shut down|stopped|deprecated|failed|failure|lost|mistake|got (it )?wrong|reversed|rolled back|post-?mortem|retro(spective)?)\b/i,
    strong: /\b(moved|changed|introduced|now|became|standard|redirected|replaced|led to|so (we|that)|because|showed|result)\b/i,
    weak: /\b(due to (the )?(team|vendor|client|management)|lessons? learned)\b/i,
    spmExtra: /\b(standard|process|practice|policy|playbook|guideline|checklist)\b/i,
    missing: 'Every bullet is a win: no stopped, failed or reversed work is described.',
  },
  4: {
    // No layer between them and the user
    topic: /\b(sole|only PM|single PM|directly|direct|reported (directly )?to (the )?(CEO|founder)|no (product|PM|account[- ]manager|manager) layer|owned|final (call|decision)|decision[- ]maker|end[- ]to[- ]end)\b/i,
    // who they dealt with, or an explicit statement that the call was theirs
    strong: /\b(customers?|clients?|drivers?|ops|operations|users?|forwarders?|shippers?|field|merchants?|sole|final (call|decision)|decision[- ]maker|CEO|founder)\b/i,
    weak: /\b(account managers?|committee|approval (committee|cycles?|board)|for (approval|sign-?off)|reviewed by|VP|one of \d+ PMs|PM team|presented to|through the)\b/i,
    spmExtra: /\b(sole|final (call|decision)|decision[- ]maker|no (product|PM|senior|VP) (layer|above)|reported (directly )?to (the )?(CEO|founder))\b/i,
    missing: 'Does not say who they dealt with directly or that they owned the decisions.',
  },
  5: {
    // Fixed it personally under time pressure
    topic: /\b(outage|hold|incident|migration|breakdown|downtime|P1|went down|crash|format change|overnight|weekend|deadline|midnight|within \d+ (hours|days))\b/i,
    strong: /\b(fixed|resolved|cleared|restored|recover(y|ed)|rebuilt|redesigned|migrated|no data loss|led)\b/i,
    weak: /\bfast[- ]paced\b/i,
    spmExtra: /\b(on-?call|rotation|runbook|monitoring|alerts?|prevent(ed)?|recur|so it (did not|never)|cut|reduced)\b/i,
    missing: 'No specific breakdown they personally resolved against a clock.',
  },
};

const clip = (s, n = 140) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

function scoreOne(pos, role, { summary, work }) {
  const r = R[pos];
  if (!r) return { score: 0, reason: 'No rule for this criterion.' };
  const hits = work.filter((l) => r.topic.test(l));
  const workText = work.join('\n');
  // "no VP layer above me" is a strong signal, not a weak one
  const isWeak = (l) => r.weak.test(l) && !(pos === 4 && NO_LAYER.test(l));
  const weakInWork = work.some(isWeak);

  if (!hits.length) {
    const s = summary.find((l) => r.topic.test(l));
    if (s) return { score: 1, reason: `Only claimed in the summary: “${clip(s)}”` };
    const w = work.find((l) => r.weak.test(l));
    if (w) return { score: 1, reason: `Weak signal only: “${clip(w)}”` };
    return { score: 0, reason: r.missing };
  }

  // A line is "strong" if it has the topic, the strong signal and a number, and is not itself a weak pattern
  const strongLine = hits.find((l) => r.strong.test(l) && NUM.test(l) && !isWeak(l));
  const goodLine = hits.find((l) => r.strong.test(l) && !isWeak(l));
  let score = strongLine ? 5 : goodLine ? 3 : 1;
  let best = strongLine || goodLine || hits[0];

  // SPM needs the higher-bar signal somewhere in work history to get a 5
  if (role === 'SPM' && score === 5 && !r.spmExtra.test(workText)) score = 3;
  // Criterion 4: any intermediary layer caps the score (harder cap for SPM)
  if (pos === 4 && weakInWork) {
    const layer = work.find(isWeak);
    score = Math.min(score, role === 'SPM' ? 1 : 3);
    return { score, reason: `${score === 1 ? 'Layer above them' : 'Some layer present'}: “${clip(layer)}”` };
  }
  if (pos !== 4 && weakInWork && score === 5) score = 3;

  const label = score === 5 ? 'Evidence' : score === 3 ? 'Partial evidence' : 'Mentioned without an outcome';
  return { score, reason: `${label}: “${clip(best)}”` };
}

export function scoreRules(cvContent, rubric) {
  const sec = sections(cvContent);
  const scores = { method: 'rules' };
  for (const role of ['PM', 'SPM']) {
    const criteria = rubric[role].map((c) => {
      const { score, reason } = scoreOne(c.position, role, sec);
      return { name: c.name, weight: Number(c.weight), score, reason };
    });
    const total = Math.round(criteria.reduce((a, c) => a + (c.score / 5) * c.weight, 0) * 10) / 10;
    scores[role] = { total, criteria };
  }
  return scores;
}

// ---------- Brief ----------
const QUESTION = {
  'Did the operational work firsthand': 'Walk me through a normal day in that operations role: which documents, counterparties and volumes did you personally handle?',
  'Built something unprompted that others adopted': 'Tell me about something you built that nobody asked for: who started using it, and how do you know?',
  'Killed or failed, and wrote down why': 'Tell me about a call you got wrong: what did the evidence show, and what did you change afterwards?',
  'No layer between them and the user': 'Who did you deal with directly, and which decisions were yours alone without sign-off?',
  'Fixed it personally under time pressure': 'Describe a breakdown you fixed against the clock: what did you do hour by hour, and what changed so it did not recur?',
};

export function briefRules(c) {
  const s = c.scores[c.applied_role];
  const best = [...s.criteria].sort((a, b) => b.score * b.weight - a.score * a.weight)[0];
  const rest = s.criteria.filter((x) => x !== best);
  const worst = [...rest].sort((a, b) => a.score - b.score || b.weight - a.weight)[0];
  const quote = best.reason.replace(/^[^:]+:\s*/, '').replace(/[.。]”$/, '”');
  const q = QUESTION[worst.name] || `Ask for a concrete example of “${worst.name}”.`;
  const gap =
    worst.score === 5
      ? `The CV shows strong evidence on every criterion, so the main risk is whether the bullets hold up in detail, starting with “${worst.name}”.`
      : `The biggest gap is “${worst.name}” (${worst.score}/5), ${worst.score === 0 ? 'with nothing in the work history to support it' : 'where the evidence is thin'}.`;
  const lead =
    best.score >= 3
      ? `The candidate's strongest evidence is “${best.name}” (${best.score}/5): ${quote}.`
      : best.score === 0
        ? `The CV has no work-history evidence for any of the rubric criteria.`
        : `The CV has no solid work-history evidence on any criterion; the best it offers is a ${best.score}/5 on “${best.name}”.`;
  return `${lead} ${gap} Ask: ${q}`;
}

// ---------- Emails ----------
const STRENGTH = {
  'Did the operational work firsthand': 'the hands-on operations work you did yourself',
  'Built something unprompted that others adopted': 'the tools you built on your own initiative that others went on to use',
  'Killed or failed, and wrote down why': 'how openly you wrote about what did not work and what you changed',
  'No layer between them and the user': 'how directly you have worked with the people using your product',
  'Fixed it personally under time pressure': 'how you handled a breakdown under real time pressure',
};

export function emailRules(c, type) {
  const role = ROLE_LABEL[c.applied_role];
  const s = c.scores[c.applied_role];
  const best = [...s.criteria].sort((a, b) => b.score * b.weight - a.score * a.weight)[0];
  // Only praise something the CV actually evidences (3/5 or better)
  const strength = best.score >= 3 ? STRENGTH[best.name] || `your experience with "${best.name.toLowerCase()}"` : '';
  const praise = strength ? `Your CV stood out, particularly ${strength}.` : `We'd like to hear more about your work.`;
  const thanks = strength ? ` We did appreciate seeing ${strength}.` : '';
  const sign = 'Arjun Mehta\nFounder, Kargo';
  if (type === 'invite') {
    return {
      subject: `Interview for ${role} at Kargo`,
      body:
        `Hi [NAME],\n\nThank you for applying for the ${role} role at Kargo. ${praise}\n\n` +
        `I'd like to meet you in person at our Mumbai office. Could you reply with three 45-minute slots over the next week that work for you?\n\n` +
        `Looking forward to it.\n\n${sign}`,
    };
  }
  return {
    subject: `Your application for ${role} at Kargo`,
    body:
      `Hi [NAME],\n\nThank you for applying for the ${role} role at Kargo and for the time you put into your application.\n\n` +
      `We have decided not to move forward with your application for this role.${thanks}\n\n` +
      `I wish you the very best in your search.\n\n${sign}`,
  };
}
