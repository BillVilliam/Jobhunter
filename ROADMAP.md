# JobHunter — Roadmap / Future TODO

## Done
- [x] Country-aware portal matching (CZ + SK): watcher location → matching job portals
  - CZ: jobs.cz, prace.cz (all 13 regions), startupjobs.cz
  - SK: profesia.sk, kariera.sk, startupjobs.cz
  - `country` setting per watcher: auto (detect from location) / cz / sk / both
  - 45-city CZ+SK database with coordinates for distance scoring

## Next: make it usable by non-technical friends (hosted web app)
- [ ] **Hosting**: deploy the full app (Express + SQLite) on a small VPS or a
      platform like Railway/Fly.io/Render. GitHub Pages is NOT enough on its
      own — it serves only static files, while scraping, the AI analysis and
      the SQLite database all need a running server. GitHub Pages could at
      most host the frontend pointing at a hosted API.
- [ ] **Authentication / cybersecurity**: sign-in (email + password with
      hashed passwords, or OAuth via Google), sessions/JWT, per-user data
      isolation (every table gets a userId), rate limiting, HTTPS only.
      Auth must land BEFORE the app goes public — currently the API is open.
- [ ] **Multi-user data model**: watchers, CVs, cover letters and job listings
      scoped per user account (today the DB is single-user).

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
