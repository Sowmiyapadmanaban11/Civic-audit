# CivicAudit

A construction & property bidding marketplace connecting property owners with verified architects, engineers, contractors, and construction companies. Built with **vanilla HTML/CSS/JavaScript** on the frontend and **Supabase** (PostgreSQL, Auth, Storage, Realtime) on the backend — no frameworks, no Node server required.

---

## 1. Download / extract the project

Unzip `CivicAudit.zip` anywhere on your computer. You should see this structure:

```
CivicAudit/
├── index.html, login.html, register.html, dashboard.html, ...
├── css/
├── js/
├── assets/
├── supabase/
│   ├── schema.sql
│   ├── policies.sql
│   ├── functions.sql
│   └── seed.sql
└── README.md   ← you are here
```

## 2. Open it in VS Code

1. Open VS Code.
2. `File → Open Folder…` → select the extracted `CivicAudit` folder.

## 3. Install & use Live Server

1. In VS Code, open the Extensions panel (`Ctrl+Shift+X` / `Cmd+Shift+X`).
2. Search for **"Live Server"** by Ritwick Dey and click **Install**.
3. Once installed, right-click `index.html` in the file explorer and choose **"Open with Live Server"**.
4. Your browser opens at something like `http://127.0.0.1:5500/index.html`. Keep this address — you'll add it to Supabase's redirect URLs in step 14.

The app will show an orange banner ("CivicAudit is not connected to Supabase yet…") until you complete the steps below.

---

## 4. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in (or create a free account).
2. Click **New Project**.
3. Choose an organization, name the project (e.g. `civicaudit`), set a database password (save it somewhere safe), pick a region close to you, and click **Create new project**. Wait ~2 minutes for provisioning.

## 5. Find your Supabase URL

1. In your project, go to **Project Settings** (gear icon, bottom left) → **API**.
2. Copy the **Project URL** (looks like `https://xxxxxxxxxxxx.supabase.co`).

## 6. Find your Supabase anon/publishable key

1. On the same **Project Settings → API** page, copy the key labeled **`anon` `public`** (NOT the `service_role` key — that one must never be used in frontend code).

## 7. Paste those values into the app

1. Open `js/config.js` in VS Code.
2. Replace the placeholders:

```javascript
const SUPABASE_URL = "YOUR_SUPABASE_URL";       // paste your Project URL here
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY"; // paste your anon public key here
```

3. Save the file.

---

## 8. Run `schema.sql`

1. In your Supabase project, open **SQL Editor** (left sidebar) → **New query**.
2. Open `supabase/schema.sql` from this project, copy its entire contents, paste into the SQL Editor, and click **Run**.
3. This creates every table (`profiles`, `projects`, `bids`, `portfolios`, `messages`, `site_visits`, `reviews`, `notifications`, `project_updates`, `reported_content`, etc.), enables Row Level Security, and creates the three Storage buckets.

## 9. Run `policies.sql`

1. New query in the SQL Editor.
2. Paste the entire contents of `supabase/policies.sql` and click **Run**.
3. This adds all Row Level Security policies so users can only see/edit data they're allowed to.

## 10. Run `functions.sql`

1. New query in the SQL Editor.
2. Paste the entire contents of `supabase/functions.sql` and click **Run**.
3. This creates:
   - A trigger that automatically creates a `profiles` row whenever someone registers.
   - Notification triggers for new bids, bid status changes, new messages, site visits, project updates, and reviews.
   - The `rank_bids_for_project()` function used for AI-assisted bid ranking.

**Run these three files in order** (`schema.sql` → `policies.sql` → `functions.sql`) — later files depend on tables/columns created earlier.

## 11. Run `seed.sql` (optional)

`seed.sql` ships with everything commented out, because Supabase requires real user accounts (with real `auth.users` UUIDs) before you can attach sample projects/bids to them. To use it:

1. Register two test accounts through the running app (see **Test accounts** below) — one Property Owner, one Construction Professional.
2. In Supabase, go to **Authentication → Users**, and copy each account's UUID.
3. Open `supabase/seed.sql`, uncomment the `do $$ ... end $$;` block, and paste the UUIDs into `v_owner_id` and `v_pro_id`.
4. Run it in the SQL Editor.

This inserts a sample project, a sample bid, and sample portfolio entries so you have something to look at immediately.

---

## 12. Create Storage buckets

`schema.sql` already creates the three buckets (`profile-images`, `project-documents`, `portfolio-images`) via SQL. To confirm:

1. Go to **Storage** in the Supabase sidebar.
2. You should see all three buckets listed. `profile-images` and `portfolio-images` are public; `project-documents` is private.

If for any reason they weren't created, add them manually with the same names and public/private settings, then re-run `supabase/policies.sql` so the storage policies attach correctly.

## 13. Configure authentication

1. Go to **Authentication → Providers** and confirm **Email** is enabled (it is by default).
2. Go to **Authentication → Settings**. For local development, you can turn **off** "Confirm email" so newly registered accounts can log in immediately without clicking an email link. (Leave it on for a production deployment.)

## 14. Configure redirect URLs

1. Go to **Authentication → URL Configuration**.
2. Set **Site URL** to your Live Server address, e.g. `http://127.0.0.1:5500`.
3. Under **Redirect URLs**, add:
   - `http://127.0.0.1:5500/*`
   - `http://localhost:5500/*` (in case VS Code uses `localhost` instead of `127.0.0.1`)
4. Save.

## 15. Run the frontend

With `js/config.js` filled in and all three SQL scripts run:

1. In VS Code, right-click `index.html` → **Open with Live Server**.
2. The orange "not connected" banner should be gone.
3. Click **Get Started** to register an account, or **Login** if you already have one.

---

## 16. Test accounts

No accounts ship pre-made (Supabase doesn't allow inserting password-based users via SQL). Create your own in under a minute:

1. Go to `register.html` in the running app.
2. Register as a **Property Owner** (e.g. `owner@test.com`).
3. Log out, register again as a **Construction Professional** (e.g. `pro@test.com`), selecting a professional type like "Contractor".
4. Log in as the owner, post a project (`post-project.html`).
5. Log in as the professional, browse projects (`projects.html`), and submit a bid.
6. Log back in as the owner and go to **Bids** to compare, shortlist, and accept.

To make a user an **admin** (for `admin.html`), run in the SQL Editor:
```sql
update public.profiles set role = 'admin' where email = 'owner@test.com';
```

---

## 17. Troubleshooting common errors

**"CivicAudit is not connected to Supabase yet" banner won't go away**
→ Double-check `js/config.js` has your real URL and anon key with no extra quotes or spaces, and that you saved the file. Hard-refresh the browser (`Ctrl+Shift+R`).

**Registration succeeds but I can't log in / "Email not confirmed"**
→ Turn off "Confirm email" in **Authentication → Settings**, or check the inbox of the email you registered with for a confirmation link.

**"row-level security policy" or "permission denied" errors**
→ Make sure you ran `policies.sql` (step 9) *after* `schema.sql`. If you edited a table structure afterward, re-run `policies.sql`.

**New registrations don't create a profile row / dashboard is blank**
→ Confirm `functions.sql` (step 10) ran successfully — it contains the `handle_new_user()` trigger that creates the `profiles` row. Check **Database → Functions** in Supabase to confirm `handle_new_user` exists.

**File uploads fail with a storage error**
→ Confirm the three buckets exist under **Storage**, and that `policies.sql` ran (it contains the `storage.objects` policies). Files are stored under a `{your-user-id}/...` path — the policies check that prefix matches your logged-in user.

**Realtime messages don't appear instantly**
→ Go to **Database → Replication** in Supabase and confirm the `messages` table has Realtime enabled (Supabase enables this by default for new tables, but double-check if you don't see live updates).

**CORS or network errors in the browser console**
→ Confirm your Live Server URL (e.g. `http://127.0.0.1:5500`) is listed under **Authentication → URL Configuration → Redirect URLs** (step 14).

**Nothing happens when I click a button**
→ Open the browser console (`F12`) for the actual error. Most likely `js/config.js` isn't filled in yet, or a required SQL script hasn't been run.

---

## Project structure reference

| Folder/File | Purpose |
|---|---|
| `js/config.js` | Supabase URL/key + shared constants |
| `js/supabase.js` | Supabase client, auth helpers, shared UI helpers, app shell |
| `js/auth.js` | Register/login/logout/password reset |
| `js/dashboard.js` | Owner + professional dashboards |
| `js/projects.js` | Post project, browse/search/filter projects |
| `js/project-details.js` | Single project view, bidding, progress tracking |
| `js/bids.js` | Bid comparison (owner) and my-bids (professional) |
| `js/messages.js` | Realtime messaging |
| `js/schedule.js` | Site visit scheduling |
| `js/profile.js` | View/edit profile |
| `js/portfolio.js` | Portfolio CRUD |
| `js/notifications.js` | Notification center |
| `js/reviews.js` | Leave/view reviews |
| `js/ai.js` | Cost estimator, contractor recommendation, bid ranking (rule-based, clearly labeled — not a live AI API call) |
| `js/admin.js` | Admin dashboard |
| `supabase/schema.sql` | Tables, indexes, storage buckets |
| `supabase/policies.sql` | Row Level Security policies |
| `supabase/functions.sql` | Triggers: new-user profile creation, notifications, review aggregation, bid ranking function |
| `supabase/seed.sql` | Optional sample data (edit with real user UUIDs first) |

## Notes on the AI features

The three "AI-assisted" features (`js/ai.js`) are transparent, rule-based scoring functions — not calls to an external AI model. Each one is documented in the file with its exact scoring formula, and the UI labels every score as an "algorithmic estimate" or "Match" score rather than implying a trained model. To connect a real AI API (e.g. Anthropic's API) later, replace the body of `estimateCost()` in `js/ai.js` with a `fetch()` call, keeping the same `{ min, avg, max }` return shape — no other file needs to change.
