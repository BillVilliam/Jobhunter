# JobHunter
## Summary

JobHunter is an AI-powered job search platform that aggregates listings from multiple Czech job portals (jobs.cz, startupjobs.cz, prace.cz), intelligently matches them against your uploaded CVs using OpenAI, and helps you manage the entire application process — from discovery to cover letter generation — in one place.


## Background

Job searching today is fragmented and time-consuming. Candidates must manually browse multiple portals, compare listings against their skills, and write tailored cover letters for each position. There is no centralized way to track how well a job fits your profile or to automate the repetitive parts of the process.

This problem affects millions of job seekers worldwide, but it is especially acute in smaller markets like the Czech and Slovak job market, where listings are spread across several local portals with no unified aggregator that also understands your qualifications.

My personal motivation comes from experiencing this frustration firsthand — spending hours scrolling through portals, reading job descriptions that turned out to be irrelevant, and losing track of what I applied to. I wanted a tool that does the boring work for me and surfaces only the jobs that actually match my skills and preferences.

* Candidates waste significant time manually searching across multiple job portals
* There is no tool that intelligently scores job fit against your actual CV content
* Writing personalized cover letters for each application is repetitive and draining
* Tracking application status across platforms is error-prone and disorganized


## How is it used?

JobHunter is a web application designed for individual job seekers who want to streamline their search process. The typical workflow looks like this:

**1. Upload your CV** — The user uploads a CV image and the system uses OpenAI's Vision API to extract skills, experience, education, languages, and target role automatically.

**2. Create Watchers** — The user configures one or more "watchers" — automated scanners that define what kind of jobs to look for. Each watcher has search keywords, location, salary range, remote/hybrid/onsite preference, required skills, job categories, and even custom AI instructions for how strictly to evaluate matches.

**3. Run a Scan** — With one click, all active watchers scrape listings from jobs.cz, startupjobs.cz, and prace.cz simultaneously. The system provides real-time progress via Server-Sent Events, showing how many jobs were found, analyzed, and saved.

**4. Review AI-scored Results** — Each discovered job is analyzed by GPT-4.1-mini and scored 0–100 based on CV match, distance, salary competitiveness, work mode preference, and category relevance. The user sees a breakdown of pros, cons, and which CV is the best fit.

**5. Generate Cover Letters** — For jobs the user likes, they can generate a personalized motivation letter using AI, choosing the language and length. The letter is contextually informed by both the CV and the job description.

**6. Track Applications** — Jobs can be marked as new, applied, interview, rejected, or ignored, giving the user a pipeline view of their entire job search.

The primary users are active job seekers, particularly those searching in the Czech/Slovak job market. The solution is used from a personal computer at any time — there are no constraints on environment or schedule. It is important to consider that the scraped job portals serve employers as well; the tool only reads publicly available listings and does not interact with employer accounts or application systems directly.


## Data sources and AI methods

### Data Sources

JobHunter collects data from three Czech job portals:

| Portal | Method | Data Extracted |
| --- | --- | --- |
| [jobs.cz](https://www.jobs.cz) | HTML scraping (Cheerio) | Title, company, location, salary, URL, description |
| [startupjobs.cz](https://www.startupjobs.cz) | JSON API | Title, company, location, structured salary, full description |
| [prace.cz](https://www.prace.cz) | HTML scraping (Cheerio) | Title, company, location, employment type, URL |

Additionally, the [Nominatim OpenStreetMap API](https://nominatim.org/) is used for geocoding — converting location names to coordinates for distance-based scoring.

All CV data is provided directly by the user through image uploads.

### AI Methods

| Technique | Purpose | Model |
| --- | --- | --- |
| Computer Vision (OCR) | Extract text and structured data from CV images | OpenAI GPT-4.1-mini (Vision) |
| Natural Language Processing | Analyze job descriptions, match against CV content, score relevance | OpenAI GPT-4.1-mini |
| Text Generation | Generate personalized motivation/cover letters | OpenAI GPT-4.1-mini |
| Distance Scoring | Haversine formula calculates geographic fit (0–5 km: +10 pts, 30+ km: −5 pts) | Algorithmic (no AI) |

The AI matching system uses a multi-factor scoring algorithm that starts at a 55-point baseline and adjusts based on CV skill overlap, distance, salary range, work mode preference, seniority fit, and category relevance. The model runs with low temperature (0.2) for consistent, reproducible scoring and includes retry logic with exponential backoff for rate-limit handling.


## Challenges

JobHunter does not solve the following:

* **It does not submit applications** (yet) the tool helps you find and evaluate jobs, but you still need to apply through the portal yourself. Automating actual applications raises ethical and legal concerns.
* **Data freshness** — scraped data may become stale. Job listings can be removed or filled between scans, and there is no guarantee of real-time accuracy.
* **Portal coverage** — currently limited to three Czech portals (jobs.cz, startupjobs.cz, prace.cz). International portals like LinkedIn, Indeed, or Glassdoor are not supported.
* **AI scoring bias** — the matching model may reflect biases present in training data. It may over- or under-value certain skills, industries, or experience patterns depending on how the job description is written.


## What next?

JobHunter could grow in several directions:

* **More portals** — integrating LinkedIn, Indeed, Glassdoor, and other international platforms would make the tool useful beyond the Czech market.
* **Automatic application submission** — with proper user consent and portal API access, the tool could submit applications directly, turning it into a fully automated job search agent.
* **Interview preparation** — AI could analyze the job description and generate likely interview questions tailored to the user's CV gaps.
* **Salary intelligence** — aggregating salary data across listings to give users market benchmarks for their role and location.


To move forward, I would need expertise in legal compliance (GDPR, scraping regulations), partnerships with job portals for official API access, and potentially a team to scale the frontend and infrastructure for multiple users.


## Acknowledgments

* Built with [React](https://react.dev/), [Express.js](https://expressjs.com/), [Drizzle ORM](https://orm.drizzle.team/), and [SQLite](https://www.sqlite.org/)
* UI components from [shadcn/ui](https://ui.shadcn.com/) and [Radix UI](https://www.radix-ui.com/)
* Job matching and CV analysis powered by [OpenAI API](https://platform.openai.com/)
* Geocoding provided by [Nominatim / OpenStreetMap](https://nominatim.org/) / [ODbL License](https://opendatacommons.org/licenses/odbl/)
* HTML parsing with [Cheerio](https://cheerio.js.org/)
* Icons by [Lucide](https://lucide.dev/)
* Inspired by the frustration of manually searching across fragmented job portals
