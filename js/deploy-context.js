// Which deployment this page is. `main` is served at the site root and is the
// live Canvas assignment; other branches are published by
// .github/workflows/pages.yml under branch/<slug>/ (see docs/BRANCH_PREVIEWS.md).
// Pure: reads only the path it is given, so it is safe under `node --test`.

const PREVIEW_PATH = /\/branch\/([a-z0-9-]+)\//;

// The preview's slug ("feature-low-cut"), or null on the live site and locally.
export function previewSlug(pathname) {
  return PREVIEW_PATH.exec(String(pathname || ""))?.[1] || null;
}

// The live site's URL for a preview URL (strips the branch/<slug>/ part).
export function liveUrl(href) {
  return String(href).replace(/branch\/[a-z0-9-]+\/.*$/, "");
}

export const PREVIEW = previewSlug(globalThis.location?.pathname);

// Previews share the live site's origin, so each one keeps its own saved data
// instead of mixing it into a student's real progress.
export const storageKey = (key, slug = PREVIEW) => (slug ? `${key}@${slug}` : key);

// The link to Assignment 1's frozen copy: always the live site's legacy/, even from a branch preview.
export const LEGACY_URL = "legacy/";
export const legacyHref = (href = globalThis.location?.href || "") => (previewSlug(new URL(href, "https://x/").pathname) ? liveUrl(href) : "") + LEGACY_URL;
