# Kargo Hiring Dashboard (MESA Case 2)

**Live:** https://hireguys-mesa.vercel.app · **Dashboard:** https://hireguys-mesa.vercel.app/dashboard

The founder uploads CVs and picks the role each person applied for. The system separates each candidate's personal details, scores every candidate against both the PM and SPM rubrics, writes 3-sentence interview briefs for the top 5 per role, and drafts invites or rejections. The founder reads the drafts and sends each email with one click, via Resend.

## Pipeline
1. **Extract** (Gemini): pulls out name, email and phone. These are stored in `candidates.personal`. A regex pass then scrubs the name, emails, phones and profile links from the text, and the result is saved as `cv_content`.
2. **Score** (Gemini): scores `cv_content` against **both** rubrics. Each criterion gets a 0–5 score and a one-line reason. The code computes the weighted total out of 100.
3. **Brief** (Gemini): 3 sentences for the top `TOP_N` candidates per applied role.
4. **Email** (Gemini): invites for the top `TOP_N`, warm rejections for everyone else. Drafts use a `[NAME]` placeholder, which is replaced with the real name only at display and send time.
5. **Send** (Resend): runs only when the founder clicks *Confirm & send*. The record is then marked as sent.

Personal details never reach steps 2–4.

## Running without keys (rule-based mode)
With no `GEMINI_API_KEY`, the app still works end to end, like FlatMatch's fallback: `lib/rules.js` scores each CV against the same `rubric.txt` criteria with keyword rules (5 = work-history evidence with a number, 3 = evidence without one, 1 = summary only, 0 = absent), and briefs and emails come from templates. Everything made this way is labelled "rule-based" or "template" in the dashboard. If a Gemini draft call fails, that draft falls back to the template too.

With no `DATABASE_URL`, data is kept in a local embedded Postgres in `.localdb/` (local development only).

**Demo:** on the Upload page, click *Load 12 sample CVs (demo)*. These are fictional candidates in `public/samples/`, 6 per role. *Clear all* on the dashboard resets the demo.

## Setup
1. **Database (Neon Postgres)**: in Vercel, open the project, go to the Storage tab and click Connect Database. Choose Neon and create a new free database. Vercel adds `DATABASE_URL` for you. The app creates its tables and seeds the 10 rubric rows (from `rubric.txt`) the first time it runs. `db/schema.sql` is there if you'd rather set it up by hand.
2. **Keys**: add `GEMINI_API_KEY` from aistudio.google.com in Vercel > Settings > Environment Variables. Add `RESEND_API_KEY` at checkpoint B-2.
3. **Deploy**: import this GitHub repo into Vercel and deploy.
4. **Change the rubric**: edit `rubric.txt`, run `node scripts/build-schema.mjs`, clear the `rubric_criteria` table, then redeploy.

## Resend note
With the default sender, `onboarding@resend.dev`, Resend only delivers to the email address your Resend account was created with. To send to the MESA test addresses in the CVs, either verify a domain in Resend and set `RESEND_FROM`, or set `EMAIL_OVERRIDE_TO` to your own address for testing.
