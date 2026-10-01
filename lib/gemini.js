// Minimal Gemini REST client. Returns parsed JSON when json=true.
// `files` attaches inline documents/images ({ data: base64, mimeType }); `attempts`/`timeoutMs` tune the retry budget.
export async function gemini(prompt, { json = true, temperature = 0, files = [], attempts = 2, timeoutMs = 10000 } = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Missing GEMINI_API_KEY');
  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const body = {
    contents: [{ role: 'user', parts: [...files.map((f) => ({ inline_data: { mime_type: f.mimeType, data: f.data } })), { text: prompt }] }],
    generationConfig: { temperature, ...(json ? { responseMimeType: 'application/json' } : {}) },
  };
  let lastErr;
  // Default: 2 attempts with a 10 s cap each, so a request (and its rule-based fallback) stays inside Vercel's time limit
  for (let attempt = 0; attempt < attempts; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
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
    if (attempt < attempts - 1) await new Promise((r) => setTimeout(r, 2000));
  }
  throw lastErr;
}

// Transcribe a scanned PDF or a photo of a resume into plain text (one long attempt; OCR is slower than text calls)
export function geminiFile(buf, mimeType, prompt) {
  return gemini(prompt, { json: false, files: [{ data: buf.toString('base64'), mimeType }], attempts: 1, timeoutMs: 25000 });
}
