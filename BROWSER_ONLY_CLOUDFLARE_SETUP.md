# Clarity Cloudflare Worker setup (browser only)

1. Open https://dash.cloudflare.com/ and create a free account if necessary.
2. Go to **Workers & Pages** → **Create** → **Worker** (or **Start with Hello World**, depending on the dashboard) → name it `clarity-ai` → **Deploy**.
3. Open the Worker and select **Edit code**. Delete its starter code and paste all contents of `worker.js`; click **Deploy**.
4. In the Worker **Settings** → **Variables and Secrets** → **Add**, create a **Secret** named `GEMINI_API_KEY` and paste the Gemini API key. Save / Deploy.
5. Copy the Worker HTTPS URL shown by Cloudflare. Open it in a new tab: it should show `{"ok":true,"service":"clarity-cloudflare-ai",...}`.
6. In your `exam-prep` GitHub repository, replace the existing root `app.js` and `index.html` using the files from this ZIP. Commit changes. Keep `styles.css`.
7. Open your GitHub Pages Clarity website, hard-refresh, go to Settings, and paste the Worker HTTPS URL in the new **Cloudflare AI Worker URL** box. Save Settings. Sign in if needed.
8. Upload a single small screenshot to test. The reports and sign-in remain hosted by Supabase.

Notes:
- This changes AI hosting only; your Supabase `reports` table, auth, and history remain.
- Never put the Gemini API key in Github or the website settings.
- Cloudflare free Workers have CPU and request quotas, Gemini has separate free-tier limits. Large scans can exceed the request limits; send fewer pages at a time.
- Current Worker has access-token verification, origin restriction, and upload limits. Add per-user quotas and abuse protection before public rollout.
