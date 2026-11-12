# Contributing to Maestri Bridge

Thanks for your interest in improving Maestri Bridge. Bug reports, ideas, translations and pull requests are all welcome.

## Before you start

- **Bugs.** Open an issue with your OS, editor and version, Maestri version, what you did, what you expected and what happened. Screenshots help.
- **Features.** Open an issue first to discuss the idea, especially for larger changes, so nobody spends time on something that won't be merged.
- **Security issues.** Don't open a public issue. Use [GitHub's private vulnerability reporting](https://github.com/PierreOliveira1/maestri-bridge/security/advisories/new) instead.
- **Never paste secrets.** Logs and screenshots must not include pairing codes or access tokens.

## Setup

You need [Node.js](https://nodejs.org) 20 or later, [pnpm](https://pnpm.io), VS Code and Maestri with Wire turned on.

```sh
git clone https://github.com/PierreOliveira1/maestri-bridge.git
cd maestri-bridge
pnpm install
```

## Run the extension

1. Open the repository folder in VS Code.
2. Press `F5` and choose **Run Maestri extension**. It builds the extension and opens a new VS Code window with it loaded.
3. Pair that window with Maestri (see [Pair with Maestri](README.md#pair-with-maestri)).

After changing the code, run `pnpm build` and reload the test window (**Developer: Reload Window**).

## Useful commands

| Command | What it does |
| --- | --- |
| `pnpm typecheck` | Type-checks every package. |
| `pnpm test` | Runs every test suite. |
| `pnpm build` | Builds the VS Code extension into `integrations/vscode/dist`. |
| `pnpm package` | Builds and packs the extension into `integrations/vscode/maestri-bridge.vsix`. |

To run a single test file, run Vitest inside the package, for example:

```sh
cd packages/core
pnpm exec vitest run --maxWorkers=5% test/floors.test.ts
```

## Project layout

- `packages/core`: everything that doesn't depend on an editor, such as the Wire client, pairing, the pinned TLS connection, agent status polling, floors and the prompt format. Put new logic here whenever it can be shared with other editors.
- `integrations/vscode`: the VS Code extension. Keep it to the editor glue: commands, views, the inline box, the panel and settings.

## Code guidelines

- TypeScript in strict mode, ES modules, and imports with the `.ts` extension.
- Don't use `any`. Model the data with types and narrow `unknown` values coming from the network.
- Don't add comments to the code. Prefer clear names and small functions.
- Follow the style of the code around your change.
- Every change in behavior comes with tests. Run `pnpm typecheck` and `pnpm test` before opening a pull request.
- For changes you can see, such as the sidebar, the inline box or the panel, include before and after screenshots in the pull request.

## Translations

Maestri Bridge ships in the same languages as Maestri: English (`en`), Portuguese (Brazil) (`pt-br`), Spanish (`es`), French (`fr`), German (`de`), Japanese (`ja`) and Simplified Chinese (`zh-cn`).

- Extension strings live in `integrations/vscode/src/i18n/locales/<locale>/`. English is the source: add the key there first, then to every other locale.
- Command, menu and setting names live in `integrations/vscode/package.nls.json` and `package.nls.<locale>.json`.
- The core never returns user-facing text. Errors carry an id and parameters, and the extension translates them.
- Use the same terms as the Maestri app in each language (for example, floor, ground floor and agent).
- Keep `{placeholders}` exactly as they are in English.

Tests check that every locale has every key with the same placeholders, so a missing translation fails `pnpm test`.

## Pull requests

1. Fork the repository and create a branch from `main`.
2. Keep each pull request focused on one change.
3. Write a clear description: the problem, how you solved it and how to test it.
4. Make sure `pnpm typecheck` and `pnpm test` pass.

Every push and pull request runs the type check, the tests and the build on GitHub Actions.

## Releases

Maintainers publish a release by bumping `version` in `integrations/vscode/package.json`, merging it into `main` and pushing a matching tag:

```sh
git tag v0.2.0
git push origin v0.2.0
```

The release workflow checks that the tag matches the version, runs the checks, builds `maestri-bridge.vsix` and attaches it to a new GitHub release.

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
