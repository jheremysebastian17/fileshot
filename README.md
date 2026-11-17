<div align="center">

# 🏀 FileShot

**File tools where uploading is a sport. Compress, merge and convert files in your browser, but first you have to score.**

[![Live demo](https://img.shields.io/badge/Live%20demo-C6F432?style=for-the-badge&logo=githubpages&logoColor=black)](https://jheremysebastian17.github.io/fileshot/)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge)

</div>

## How it works

1. Pick a tool and drop your files (or choose them from your computer).
2. Play the tool's mini-game with real physics. Score to get your file processed.
3. Download the result. After **3 misses** a frosted *Skip game* button appears.

Everything runs locally: **your files never leave your browser**. There is no server.

| Tool | Sport | What you do |
|---|---|---|
| Compress image (JPG, PNG, WebP) | 🏀 Basketball | Slingshot the ball into the hoop. It can bounce off the rim and the backboard. |
| Merge PDF | ⚽ Football | Shoot past a goalkeeper who keeps jumping. |
| Image to PDF | ⚾ Baseball | Swing (click, tap or Space) at the right moment. Clear the fence for a home run. |
| Split PDF (every page or ranges) | ⛳ Golf | Chip the ball over a hill into the cup. |
| Create ZIP | 🎳 Bowling | Roll the ball and knock down at least 7 pins. |

## Features

- **Real physics** with Matter.js: gravity, bounces, friction and collisions. A dotted line previews the first part of the shot while you aim.
- **Processing** in the browser:
  - Images are re-encoded with canvas. PNG and WebP become WebP so transparency is kept.
  - PDFs are handled with pdf-lib.
  - ZIP files are built with fflate.
  - The work starts while you play, so the result is ready as soon as you score.
- **Accessible:**
  - With keyboard-only use, pressing Tab inside the game reveals the skip button at once.
  - Baseball can also be played with Space.
  - Under `prefers-reduced-motion` the effects are reduced.
- **5 languages** (ES, EN, CA, FR, DE), **light/dark theme** and a **responsive** layout with touch support.

## Run locally

No build step. Serve the folder with any static server:

```bash
npx serve .
```

## Tests

```bash
node tests/run.mjs
```

The tests cover the PDF and ZIP logic and checks that every language has the same keys. They also run a **headless physics check**: hundreds of simulated shots per sport confirm that each game can be won, but that random aiming mostly misses.

## Project structure

```
index.html          Views: home, tool, game, result
css/style.css       Stadium-night theme, light theme, skip button
js/app.js           Routing, file handling, game flow, results
js/tools.js         Compress / merge / split / image-to-PDF / ZIP
js/i18n.js          Translations
js/games/core.js    Shared physics runtime: slingshot, confetti, scoring
js/games/*.js       Basketball, football, baseball, golf, bowling
vendor/             Matter.js, pdf-lib, fflate (MIT)
tests/run.mjs       Node tests
```

## Credits

- [Matter.js](https://brm.io/matter-js/), [pdf-lib](https://pdf-lib.js.org/) and [fflate](https://github.com/101arrowz/fflate), all under the MIT license (see `vendor/`).

MIT © Jheremy Sánchez
