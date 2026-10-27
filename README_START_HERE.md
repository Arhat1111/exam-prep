# Clarity v4 — Equation display fix (browser-only)

This is based on the existing Clarity v3 frontend. Cloudflare Worker settings, Gemini API key, Supabase configuration, and report history logic are unchanged.

## Install without Terminal
1. In GitHub, open `arhat1111/exam-prep`.
2. Replace the three ROOT files with `index.html`, `app.js`, `styles.css` from this ZIP. Do not upload the folder itself as a nested directory.
3. Commit changes. In GitHub Actions or Settings > Pages, confirm Pages deployment succeeded.
4. Visit `https://arhat1111.github.io/exam-prep/?v=4`, hard refresh (Mac Cmd+Shift+R), then History > View report > Show solution.
5. Existing reports do not need to be regenerated. Their text is reformatted at display time.

## Supabase — IMPORTANT
NO SQL IS REQUIRED to fix math display. Do not delete or recreate the reports table, and do not redeploy the obsolete `analyze-paper` Supabase Edge Function. Current AI calls go via Cloudflare Worker. Keep your Supabase URL and publishable key unchanged.

Optional database verification (Supabase > SQL Editor):
SELECT id, user_id, created_at FROM public.reports ORDER BY created_at DESC LIMIT 10;

This checks whether rows exist; it does not modify data. For a secure user-level test, sign into Clarity and look for `Saved to History and Supabase`.

## Accuracy note
This fixes typesetting only. It will NOT correct logically wrong AI-generated equations or unsupported statements of verification. Verify solutions against the question/answer key, particularly for competitive-exam mathematics.

## If still showing raw text
1. Check that `index.html` references `app.js?v=20261027-clarity-v4` and `styles.css?v=20261027-clarity-v4`.
2. In DevTools > Network ensure KaTeX CSS and JS load (requires an Internet connection).
3. Inspect the input: extremely malformed AI output may still need correcting in the source report or regenerating it.
