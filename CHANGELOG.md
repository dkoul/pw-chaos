# Changelog

All notable changes to this project are documented in this file.

## [0.2.0] - 2026-11-20

### Added

- Typed `apply()` and `RecipeName` / `RecipeOptionsMap` exports for built-in recipes.
- `ChaosValidationError` when required recipe options are missing or invalid.
- Recipes: `api.rate-limit`, `api.intermittent`, `sessionStorage.clear`.
- `api.status` options `contentType` and `rawBody` for non-JSON responses.
- Safer `storage` / `sessionStorage` cleanup when the page is closed or navigated away.
- GitHub Actions CI, ESLint, and expanded Playwright coverage (including `dist` imports and the chaos fixture).

### Changed

- Tests import from compiled `dist/` output to match the published package entry.
- `@playwright/test` is a peer dependency.

### Removed

- Unused `ChaosOptions.seed` export (no behavior was attached).

## [0.1.0] - 2026-11-20

- Initial release.