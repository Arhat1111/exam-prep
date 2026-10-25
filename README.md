# Clarity — AI Test Paper Analyzer

A responsive static frontend for GitHub Pages with a Supabase Edge Function AI backend.

## Setup
1. Create a Supabase project. Run `supabase/schema.sql` in its SQL editor. If you already have policies with the same names, skip/reconcile them.
2. Install Supabase CLI, authenticate, link your project: `supabase login` and `supabase link --project-ref YOUR_REF`.
3. Set server-only AI secret: `supabase secrets set OPENAI_API_KEY=YOUR_KEY` (never commit this key). Optionally `supabase secrets set OPENAI_MODEL=gpt-4.1`.
4. Deploy: `supabase functions deploy analyze-paper`. Keep JWT verification enabled. If your project uses newer asymmetric publishable keys, ensure the deployed function accepts the auth scheme you use; legacy anon JWT works with standard verification.
5. Upload `index.html`, `styles.css`, `app.js` to your GitHub repository, and enable Pages under Settings → Pages → Deploy from branch → main / root.
6. In the website Settings, enter Supabase Project URL and public **anon** key. Sign up/sign in to synchronize saved reports. Confirm your email if Supabase Auth requires it.

## Notes and limitations
- GitHub Pages alone cannot run an AI model or protect secret keys; the Edge Function calls OpenAI securely.
- The app stores reports in browser localStorage and syncs with Supabase for signed-in users. Original uploaded documents are **not** persisted; resubmit them for a fresh analysis. Browser localStorage is not a reliable backup. Export JSON as a backup.
- Current analysis accepts up to 12 files and ~26 MB of base64 payload; large PDFs may exceed model context or service limits.
- The AI may misread handwriting, skip questions, or give wrong grades/solutions. Review results before relying on them. `needs_review` marks uncertain items.
- Uploads are transmitted to Supabase and the configured AI provider; avoid uploading sensitive documents without consent.
- For production: add rate limits, CAPTCHA/abuse protection, billing caps, stricter CORS origins, PDF page splitting for very large PDFs, robust grading rubrics, teacher verification, and token refresh. Edge Function currently uses default Supabase JWT validation and accepts anon clients; lock it to authenticated users and add usage limits before public launch.
- Supabase upsert sync assumes no duplicate report ID conflicts across users. Local history remains per browser.
