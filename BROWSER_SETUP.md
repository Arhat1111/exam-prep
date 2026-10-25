# Clarity browser-only fix

1. In Supabase Dashboard > Edge Functions > analyze-paper > Code, open index.ts and replace ALL its contents with the contents of `supabase/functions/analyze-paper/index.ts`. Click Deploy updates. Do not paste into SQL Editor.
2. Confirm GEMINI_API_KEY in Edge Functions > Secrets.
3. Visit https://gvxmvvthyztptlopovyj.supabase.co/functions/v1/analyze-paper in a new browser tab. If it returns JSON with ok:true, the deployed function can boot and answer GET requests. If it still returns 503, investigate Supabase service/support; Gemini is not being called for this health check.
4. In GitHub > arhat1111/exam-prep, replace `app.js` and `index.html` with files from this package; commit changes. Keep styles.css.
5. Refresh with Cmd+Shift+R, sign in ONCE through Settings, then close and reopen tab. Persistent login uses localStorage and refresh tokens; private browsing or clearing site data will still log you out.
6. Upload a SINGLE small screenshot and press Analyze. For failures, inspect Supabase Invocations. 401 means auth, 429 model quota, 502 Gemini returned an error, 504 backend timeout, 503 can mean Supabase service/gateway.

These changes reduce hanging and add diagnostics. They cannot guarantee resolution of a gateway-generated 503 that happens before your function code runs.
