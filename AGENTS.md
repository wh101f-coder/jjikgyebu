# jjikgyebu maintenance

- Preserve the existing localStorage keys and stored transactions.
- The current release is v1.1.4. For each subsequent user-requested change/release, run `node bump-version.cjs` once to increment the patch version in app.js, index.html and sw.js together. Do not bump for each intermediate edit of the same release.
- Card identity uses the text after 본인/가족 as a four-character string; never use card artwork or treat bare digits as payment amounts.
- Spreadsheet rows that omit card numbers may use their explicit card product name as identity. Never invent a suffix. Keep different named products separate and review overlaps between numbered and named exports.
- Run `node --test --test-isolation=none tests.cjs excel-tests.cjs dashboard-tests.cjs refresh-tests.cjs batch-tests.cjs` and check the calendar, statistics, cancel buttons and review UI before delivery.
- Keep release.json, versioned script/style URLs and the worker precache synchronized. Refresh must preserve localStorage and avoid interrupting unsaved forms or pending imports.
- Never publish user spreadsheets or real transaction fixtures. Use synthetic test data. Keep card issuer in spreadsheet identity; preserve repeated equal-amount rows. Ask for a review choice when exports lack reliable transaction IDs.
- Representative merchant names are presentation-only. Do not overwrite raw merchant names or import identities when collecting an unedited review field. Filtering must keep original pending indices and never discard hidden transactions.

