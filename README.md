# Clarity — Gemini 2.5 Flash-Lite Edition

Static GitHub Pages frontend + Supabase Auth/database + Supabase Edge Function calling Google Gemini 2.5 Flash-Lite.

## Your Supabase project
- Project ref: `gvxmvvthyztptlopovyj`
- URL and **publishable** public key are configured in `app.js`.

## Setup
1. Go to Supabase SQL Editor and run `supabase/schema.sql` (or skip if the `reports` table and all four RLS policies already exist).
2. Under Supabase Authentication → Providers, enable Email. Set Site URL and redirect URLs to your GitHub Pages URL once known.
3. Create a Gemini API key via https://aistudio.google.com/apikey .
4. In Supabase Dashboard → Edge Functions → Secrets, set `GEMINI_API_KEY` to that value. Do NOT put the key in frontend files or GitHub.
5. With Node installed, open Terminal **in this extracted folder**, then run:
   ```sh
   npx supabase login
   npx supabase link --project-ref gvxmvvthyztptlopovyj
   npx supabase functions deploy analyze-paper --no-verify-jwt
   ```
   The Edge Function checks authorization with Supabase Auth even though gateway-level legacy JWT verification is disabled. This is required for the newer publishable key.
6. Upload `index.html`, `app.js`, `styles.css` to GitHub repository root. Enable GitHub Pages → deploy main branch `/ (root)`.
7. Sign up and sign in from the website's Settings. Upload a small paper, analyze, and save the report.

## Important notes
- The AI provider is **Gemini**, not OpenAI. You only need the `GEMINI_API_KEY` secret (no `OPENAI_API_KEY`).
- Google sets request-per-minute, token-per-minute, and request-per-day quotas. Free-tier capacity is limited and may change. Check https://aistudio.google.com/rate-limit . An upload can fail with 429 when quota is exceeded; that is not a Supabase error.
- Gemini free-tier data may be used to improve Google products; review terms and obtain consent for students' documents before uploads.
- Files are forwarded transiently to Gemini and are **not** permanently saved. Analysis reports save to browser localStorage and, after Sign In + Save, to Supabase `public.reports`.
- No hard usage caps per student, CAPTCHA, billing guards, token-refresh implementation, or automatic handwriting correction exist yet. Add those before public launch. `--no-verify-jwt` is safe only while Edge Function's explicit Auth check is retained.
- The AI can make mistakes, especially reading handwriting or interpreting ambiguous marking schemes. Use results as assisted feedback, not authoritative grading.

## Reliability & persistent login update (October 2026)
- Login now persists in browser `localStorage` and refreshes Supabase access tokens automatically using a rotating refresh token. The user stays signed in on the same browser unless they sign out, clear browser site data, change account credentials, or the refresh token is revoked/expired. Do not use persistent login on a shared computer.
- Gemini requests are aborted after 45 seconds, and the backend returns HTTP 504 with a readable message instead of waiting until the Supabase gateway times out. The model output budget is reduced to 6144 tokens. Long exams may need to be split into smaller uploads; output may be incomplete.
- This update **does not cure Supabase platform 503 responses** if they happen before the function runs. If even a one-question analysis still takes ~160 seconds and shows 503, investigate Supabase gateway/service health or move the backend to a different serverless host such as Cloudflare Workers / Google Cloud Run. This alternative requires additional deployment and code adaptation.
- To install: replace index.html, app.js and styles.css in GitHub; redeploy the updated Edge Function `supabase/functions/analyze-paper/index.ts`. Database SQL schema is unchanged.
- Deployment from this extracted folder: `npx --yes supabase functions deploy analyze-paper --project-ref gvxmvvthyztptlopovyj --no-verify-jwt --use-api`
- Confirm `GEMINI_API_KEY` exists in Supabase Edge Function Secrets. Do not commit secrets.
