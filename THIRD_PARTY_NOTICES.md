# Third-party notices

The root MIT license covers the project's original code and documentation. It does not replace the licenses of third-party assets or user-imported scores and PDFs.

## Vendored browser assets

| Files | Upstream / copyright | License | Included notices |
|---|---|---|---|
| `public/alphatab/alphaTab*.js`, `alphaTab*.mjs` | [alphaTab 1.8.4](https://github.com/CoderLine/alphaTab), Daniel Kuschny and contributors | MPL-2.0 | [LICENSE](public/alphatab/LICENSE), [LICENSE.header](public/alphatab/LICENSE.header), original headers in each script |
| `public/alphatab/font/Bravura.woff`, `Bravura.woff2` | Bravura, Steinberg Media Technologies GmbH; Reserved Font Name: Bravura | SIL Open Font License 1.1 | [Bravura-OFL.txt](public/alphatab/font/Bravura-OFL.txt), FONTLOG and OFL FAQ in the same directory |
| `public/alphatab/soundfont/sonivox.sf2` | Sonic Network Inc., copyright 2004–2006 | Apache-2.0 | [NOTICE](public/alphatab/soundfont/NOTICE), [LICENSE](public/alphatab/soundfont/LICENSE) |

These seven runtime files are unmodified copies of the installed `@coderline/alphatab@1.8.4` package's `dist/` files. The original alphaTab headers also identify its integrated libraries; their notices remain intact.

alphaTab source is available from [the upstream repository](https://github.com/CoderLine/alphaTab) and the [published 1.8.4 package](https://www.npmjs.com/package/@coderline/alphatab/v/1.8.4). To obtain the package version used here, run `npm pack @coderline/alphatab@1.8.4`. Covered alphaTab files remain subject to [MPL-2.0](https://www.mozilla.org/en-US/MPL/2.0/); changes to those files must preserve the applicable notices and source availability.

## npm dependencies

Other runtime and development dependencies are installed through npm rather than vendored as `node_modules`. Their versions and published license metadata are recorded in `package-lock.json`; refer to each package's license when redistributing it. Notable packages include Next.js and React (MIT), better-sqlite3 (MIT), Drizzle ORM (Apache-2.0), Zod (MIT), and Tailwind CSS (MIT).

## Project media and sample content

The application artwork, PWA icon generator, desktop icon source and demonstration MusicXML belong to the project assets. Public screenshots use the repository's demonstration data in an isolated database. No user-imported commercial sheet music, PDF textbook or personal practice database is distributed in this repository.
