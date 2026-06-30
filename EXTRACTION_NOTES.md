# ETS 2024 Listening - Part 3/4 DATA notes

- Part 1 photos: included in `images/part1/`.
- Part 3/4 questions/options: OCR extracted from `ETS 2024 - LISTENING.pdf` into `data/listening-ets2024-p34.js` and `data/listening-ets2024-p34.json`.
- Transcript fields are prepared as `transcript_en` and `transcript_vi`, but the uploaded PDF contains the test-book pages only, not the audio scripts/transcripts. Fill these fields later from an official transcript/source.
- Vietnamese translation fields are prepared as `question_vi` and `text_vi`. They are currently blank to avoid inserting inaccurate machine/guessed translations.
- OCR quality is usable but should be reviewed, especially questions with graphics and scanned Korean/low-contrast pages.


## Part 3/4 graphics added
- Added 50 graphics: 5 graphic sets per test × 10 tests.
- Paths: `images/graphics/ets-toeic-2024-test-N-p3-set11-q62-64.jpg`, etc.
- JSON fields added: `graphic` and `graphicLabel` on questions in the corresponding set.
