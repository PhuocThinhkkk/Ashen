/**
 * Resolves a public asset path against Vite's base URL.
 * Automatically prefixes the repository subpath (e.g. /Ashen/) when deployed to GitHub Pages,
 * while preserving root-relative / paths in local development.
 */
export function getAssetUrl(path: string): string {
  const base = import.meta.env?.BASE_URL || '/';
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  const cleanBase = base.endsWith('/') ? base : `${base}/`;
  return `${cleanBase}${cleanPath}`;
}
