# jjikgyebu maintenance

- Preserve the existing localStorage keys and stored transactions.
- The current release is v1.0.3. For each subsequent user-requested change/release, run `node bump-version.cjs` once to increment the patch version in app.js, index.html and sw.js together. Do not bump for each intermediate edit of the same release.
- Card identity uses the text after 본인/가족 as a four-character string; never use card artwork or treat bare digits as payment amounts.
- Run `node --test --test-isolation=none tests.cjs excel-tests.cjs` and check the review UI before delivery.
- Never publish user spreadsheets or real transaction fixtures. Use synthetic test data. Keep card issuer in spreadsheet identity; preserve repeated equal-amount rows. Ask for a review choice when exports lack reliable transaction IDs.
