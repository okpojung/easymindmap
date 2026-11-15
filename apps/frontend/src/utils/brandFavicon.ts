/** Use the favicon selected by index.html, including the approved production brand.
 * Importing the identical SVG a second time under a different name makes Vite
 * deduplicate it to an unbranded filename and breaks the pinned image checks.
 */
export function appFaviconUrl(
  doc: Pick<Document, 'querySelector'> | null = typeof document === 'undefined' ? null : document,
): string {
  return doc?.querySelector<HTMLLinkElement>('link[rel~="icon"]')?.href || '/apple-touch-icon.png';
}
