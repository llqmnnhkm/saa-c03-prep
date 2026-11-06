# SAA-C03 Prep

A study app for the **AWS Certified Solutions Architect – Associate (SAA-C03)** exam. It's built for iPhone: install it from Safari and it runs full screen and works offline.

**Open the app:** https://llqmnnhkm.github.io/saa-c03-prep/

## What's inside

| Section | What it does |
| --- | --- |
| **Practice** | Answer questions one at a time. After you check an answer you see why each option is right or wrong, plus what to study next with links to the service notes. Filter by domain, service, or questions you missed. |
| **Exam** | Timed mock exams (65 Q / 130 min, 30 Q / 60 min, or 15 Q / 30 min) weighted like the real exam. Flag questions and jump around with the grid. At the end you get your score, a breakdown by domain and a full review. |
| **Labs** | Console walkthroughs as multiple-choice steps: *you're on this screen — what do you do next?* Each step explains what to click, and you finish with a cheat sheet of the whole procedure. |
| **Learn** | Notes for about 55 services (key numbers, exam must-knows, when to use and when not to), plus side-by-side comparison tables. |

Progress is saved on your device only.

## Install on iPhone

1. Open the link above in **Safari**.
2. Tap **Share** → **Add to Home Screen**.
3. Open it from the home screen icon.

### Getting updates

When a new version is published, the app shows an **Update available · Reload** banner the next time you open it. You can also go to **Home → Settings**:

- **Check for updates** checks right away.
- **Reload app** clears cached files and loads the newest version. Your progress is kept.

## Adding content

All content is plain JavaScript data. You can edit it straight on GitHub, and the app redeploys on every push.

- **Questions:** `data/questions.js`. Each question has `options`, `answer` (option indexes), `why` (one explanation per option) and `study`.
- **Service notes and comparisons:** `data/services.js`
- **Labs:** `data/labs.js`
- **Lab screenshots:** see [`assets/labs/README.md`](assets/labs/README.md)

Run the content checks before pushing (the deploy does this too):

```sh
node tools/validate.mjs
```

## Run locally

It's a static site with no build step. Serve the folder with any static server, for example:

```sh
npx serve .
```

## How deploys work

`.github/workflows/pages.yml` validates the content, stamps a build id into `sw.js` and `js/version.js`, then publishes to GitHub Pages. The new build id is what makes installed apps notice the update.

---

Original practice content written for studying. Not affiliated with or endorsed by Amazon Web Services. Check the [official exam guide](https://aws.amazon.com/certification/certified-solutions-architect-associate/) for the current scope.
