# Clarity — automatic History + improvement analysis fix

This package is based on the existing Cloudflare version. **Keep your working Cloudflare Worker and Gemini secret unchanged.** No Terminal or SQL changes required.

## Browser-only deployment

1. Open https://github.com/arhat1111/exam-prep
2. Replace the existing root `app.js` with this ZIP's `app.js`, then commit.
3. Replace the existing root `index.html` with this ZIP's `index.html`, then commit.
4. Leave `styles.css` and your Cloudflare Worker unchanged.
5. Open https://arhat1111.github.io/exam-prep/ and hard-refresh (Cmd+Shift+R).
6. Ensure Settings contains your Cloudflare Worker URL: https://clarity-ai.arhatshah123.workers.dev
7. Sign in. Upload a paper that includes the questions AND student answers; choose Analyze paper.
8. Reports will auto-save into browser History. The results screen shows whether Supabase cloud save succeeded. Go to History to reopen the report; go to Insights for saved-topic aggregates.

## What changed

- Automatic save to local History and to existing `public.reports` through Supabase when logged in.
- Save status shown in results; if cloud sync fails, the local report remains saved, and the Save report again button can retry.
- History and Insights refresh from Supabase when opened.
- Topic-level study recommendations are derived from the questions and their correct/incorrect/partial/needs_review statuses if Gemini returns no topic list. These are heuristic study suggestions; if recognition or grading is uncertain, verify manually.
- Topic labels appear within each question's review card; areas with lower accuracy appear first.
- Previously saved reports can now display calculated topic suggestions when reopened.

## Known boundaries

- Cloud sync depends on your existing reports table's INSERT/SELECT/UPDATE RLS permissions.
- The browser-only local history is tied to that browser and profile; syncing across devices needs successful Supabase saving.
- Uploaded PDFs/screenshots themselves are not stored; the analysis is saved.
- The feature derives approximate topic labels from recognized question text and subject; it does not guarantee curriculum-specific diagnosis. Unreadable papers should be reviewed manually.
