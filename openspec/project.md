# Project Context

## Purpose

Create a single-page sticker gallery for Lynn Chan inspired by a moodboard provided by the user. The site should celebrate Lynn-themed memes/stickers with a bright, playful, but editorial layout: oversized headline, short intro copy, and a grid of sticker cards that feel tactile.

## Tech Stack

- Next.js (App Router preferred) with React 18
- TypeScript across all code
- Tailwind CSS for utility-first styling
- Local JSON/YAML data source for sticker metadata (name, description, asset paths, hover metadata)

## Project Conventions

### Code Style

- Use functional React components with explicit prop typing.
- Keep components small and colocated under `src/components/` by concern (layout, sticker, typography).
- Tailwind classes for layout; extract shared tokens (colors, shadows) via `tailwind.config.js` to ensure consistency with the reference design.

### Architecture Patterns

- Presentational-first: data layer delivers sticker metadata into a `StickerGrid` component; each sticker is pure UI.
- Use a central `stickerData.ts` file exporting structured sticker info (id, title, tagline, png/svg URLs, download options, hover description tooltips).
- Encapsulate hover interactions within `StickerCard` to keep page layout simple.

### Testing Strategy

- Add Playwright visual regression coverage for the sticker hover interaction once UI stabilizes.
- For now, rely on Storybook/Chromatic snapshots (to be set up later) and manual QA focusing on hover shadows and download CTA visibility.

### Git Workflow

- Feature branches per change (`feature/add-lynn-hero`, etc.).
- Squash-merge into `main` with conventional commit prefixes (`feat:`, `fix:`, `docs:`).
- Keep OpenSpec `tasks.md` synced before requesting review.

## Domain Context

- Lynn Chan is the central character; copy should mix Mandarin + playful English (e.g., "Lynn酱 says hi!").
- Each sticker panel should show: sticker image, short caption, and download affordances (PNG + SVG). Optionally show meta badges (e.g., "New", "限定").
- Hover behavior per reference image: sticker lifts with soft drop shadow, subtle rotation, and reveals metadata row (question-mark tooltip icon + download buttons).
- Hero section should mirror reference: brand mark left, nav links (Wall*, Blog, About), search icon, and mascot (cat/octocat) on the right.

## Important Constraints

- Maintain accessible contrast on text and buttons over the warm gray (#f4f4f4) background.
- Sticker assets must have transparent backgrounds and subtle white border to mimic die-cut feel.
- Hover animation: 200–250ms ease-out translateY(-8px) + scale(1.02) + drop-shadow; ensure reduced-motion users see static state.

## External Dependencies

- Optional: `@phosphor-icons/react` for lightweight icons (search, info, download).
- Local font files or Google Fonts for Bricolage Grotesque (headings) and MiSans VF (body) as shown in the reference.
