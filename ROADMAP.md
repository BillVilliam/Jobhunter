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
- [ ] **Authentication / cybersecurity**: sign-in (email + password with
      hashed passwords, or OAuth via Google), sessions/JWT, per-user data
      isolation, rate limiting, HTTPS only. Auth must land BEFORE the app
      goes public — currently the API is open.

## Credit system (monetization-ready, not the main goal yet)
- [ ] Credits per AI action (scan run, CV analysis, cover letter generation)
      since AI calls cost real money per use.
- [ ] Free starter credits for new accounts; manual top-up by admin first,
      payment provider (Stripe) only if/when needed.
- [ ] Credit ledger table: userId, action, creditsDelta, timestamp.

## Creator/admin dashboard
- [ ] Usage analytics: number of users, active users, scans run, jobs found,
      AI calls and their cost.
- [ ] Registered users overview (emails) — **GDPR**: legal because users
      provide email at sign-up, but requires a privacy policy, explicit
      consent checkbox, and data export/deletion on request. No tracking of
      visitors without consent (so prefer self-hosted, cookieless analytics
      like Plausible/Umami for page views).
- [ ] Credit system statistics: credits issued/spent per user, per action type.
