// Minimal Gemini REST client. Returns parsed JSON when json=true.
export async function gemini(prompt, { json = true, temperature = 0 } = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Missing GEMINI_API_KEY');
  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature, ...(json ? { responseMimeType: 'application/json' } : {}) },
  };
  let lastErr;
  // 2 attempts with a 10 s cap each, so a request (and its rule-based fallback) stays well inside Vercel's 60 s limit
  for (let attempt = 0; attempt < 2; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
    } catch (e) {
      lastErr = new Error(`Gemini request failed: ${e.message}`);
      continue;
    }
    if (res.ok) {
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
      if (!json) return text.trim();
      try {
        return JSON.parse(text);
      } catch {
        const m = text.match(/\{[\s\S]*\}/);
        if (m) return JSON.parse(m[0]);
        lastErr = new Error('Gemini returned non-JSON: ' + text.slice(0, 200));
      }
    } else {
      lastErr = new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
      if (res.status !== 429 && res.status < 500) break;
    }
    if (attempt === 0) await new Promise((r) => setTimeout(r, 2000));
  }
  throw lastErr;
}
