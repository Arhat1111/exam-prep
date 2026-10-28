# Clarity v6 — subject-specific analysis

No SQL, Terminal, Supabase Edge Function or Cloudflare Worker changes are needed.

## Install in GitHub's browser interface
1. Open https://github.com/arhat1111/exam-prep
2. Replace **index.html**, **app.js**, and **styles.css** in the repository root with those in this ZIP.
3. Commit changes. After GitHub Pages finishes publishing, visit https://arhat1111.github.io/exam-prep/ and hard refresh (Cmd+Shift+R).
4. In Analyze test, choose a subject from the suggestions or enter a custom subject. A subject is required.
5. Under History, use **Filter past papers by subject**; under Insights, use **Show insights for** to see subject-specific weaknesses.

## Changes
- Mathematics, Physics, Chemistry, Biology, English, Economics, History, Geography, Computer Science and Business Studies use subject-specific topic classification. Unrecognized subjects remain separate under their own name.
- Existing Gemini Worker receives subject-specific grading hints in the already-supported `subject` field. No backend change is necessary.
- Older saved papers are grouped using normalized subject names (e.g. maths/math/mathematics) without changing stored records.
- Reports stay in existing History and Supabase reports table. The large-PDF batch processing is preserved.

## Caveats
- Old reports whose `subject` was entered incorrectly should be corrected manually if they need regrouping; v6 does not overwrite their source subject.
- AI's grading still needs spot-checking; subject-specific topic classification is heuristic when Gemini doesn't return a topic.
- Sync History to Cloud in Settings if reports are local-only.
