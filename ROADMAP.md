# JobHunter — Roadmap / Future TODO

## Done
- [x] Country-aware portal matching (CZ + SK): watcher location → matching job portals
  - CZ: jobs.cz, prace.cz (all 13 regions), startupjobs.cz
  - SK: profesia.sk, kariera.sk, startupjobs.cz
  - `country` setting per watcher: auto (detect from location) / cz / sk / both
  - 45-city CZ+SK database with coordinates for distance scoring

## Next: make it usable by non-technical friends (hosted web app)
- [ ] **Hosting on Railway (free plan)**: deploy the full app (Express +
      SQLite). Needs a persistent volume for data.db (Railway volumes work on
      the free tier; without one the DB resets on each deploy). API keys
      (DeepSeek/OpenAI) go into Railway environment variables — never into
      the repo. GitHub Pages alone is NOT enough — it serves only static
      files; scraping, AI analysis and the database need a running server.
- [ ] **Data privacy (TOP PRIORITY — must land before going public)**:
      - `.env` and `data.db` are gitignored and verified never committed —
        uploaded CVs and motivation letters NEVER reach the GitHub repo.
        Keep it that way: all user content stays in the database/volume only.
      - Per-user sandbox: every table gets a userId; every query filters by
        the authenticated account. A user's CVs, cover letters, watchers and
        job listings are accessible ONLY from the account that created them —
        no admin backdoor reading user CV content either.
      - Active profiles stay in the database; deactivated/deleted profiles
        get their data removed (GDPR right to erasure).
      - **Inactivity-based data expiry** (keeps storage small + GDPR-friendly):
        track `lastSeenAt` per user; after ~23 days of inactivity send a
        warning email ("log in or your data will be deleted in 7 days");
        after 30 days a daily cleanup job permanently deletes the user's
        CVs, cover letters, job listings, watchers and ledger. CV images are
        the only heavy data (~0.5–2 MB/user) — everything else is tiny text.
- [ ] **Authentication / cybersecurity**: sign-in (email + password with
      hashed passwords, or OAuth via Google), sessions/JWT, per-user data
      isolation, rate limiting, HTTPS only. Auth must land BEFORE the app
      goes public — currently the API is open.

## Credit system (monetization-ready, not the main goal yet)
- [x] **Core implemented**: every AI call (job analysis, CV analysis, cover
      letter, vision OCR) records its API token usage and deducts credits.
      Conversion ratio "tokens per 1 credit" is a runtime setting
      (`PATCH /api/credits/settings`) — **the exact number is a placeholder
      (10 000) and still needs to be decided/tuned**.
- [x] Free starter credits (100) for a fresh installation; manual top-up via
      `POST /api/credits/topup`; balance + ledger via `GET /api/credits`;
      no credits → scan and AI actions are refused (HTTP 402).
- [x] Credit ledger table: userId (ready for accounts), action, tokensUsed,
      creditsDelta, timestamp.
- [x] **Pricing model decided: 1 credit ≈ 1 scan.** The app measures the real
      token cost of every scan; the suggested ratio is 2× the measured average
      (safety reserve). After a few real scans, call
      `POST /api/credits/calibrate` to apply it (stats visible in
      `GET /api/credits` → scanStats).
- [ ] Decide the starter credit amount (still placeholder 100).
- [ ] Per-user balances once accounts/auth land; payment provider (Stripe)
      only if/when needed.
- [ ] UI for top-up + ledger history (now only the balance shows on the
      dashboard).

## Creator/admin dashboard
- [ ] Usage analytics: number of users, active users, scans run, jobs found,
      AI calls and their cost.
- [ ] Registered users overview (emails) — **GDPR**: legal because users
      provide email at sign-up, but requires a privacy policy, explicit
      consent checkbox, and data export/deletion on request. No tracking of
      visitors without consent (so prefer self-hosted, cookieless analytics
      like Plausible/Umami for page views).
- [ ] Credit system statistics: credits issued/spent per user, per action type.
