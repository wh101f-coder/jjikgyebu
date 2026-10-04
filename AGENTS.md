# jjikgyebu maintenance

- Preserve the existing localStorage keys and stored transactions.
- The current release is v1.0.2. For each subsequent user-requested change/release, run `node bump-version.cjs` once to increment the patch version in app.js, index.html and sw.js together. Do not bump for each intermediate edit of the same release.
- Card identity uses the text after 본인/가족 as a four-character string; never use card artwork or treat bare digits as payment amounts.
- Run `node --test --test-isolation=none tests.cjs` and check the review UI before delivery.
