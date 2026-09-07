/**
 * downloadText — trigger a browser download for an in-memory blob.
 *
 * Used by the etude / score / setlist exporters in App.tsx. Lives
 * here (not next to React) because it's pure DOM, has no React
 * surface, and gets reused by the ImportExportModal's "export to
 * file" path.
 *
 * URL.revokeObjectURL runs on a 1s timeout (rather than immediately)
 * to give Safari a moment to start the download — Safari will
 * cancel the download if the URL is invalidated synchronously.
 */

export function downloadText(
  filename: string,
  content: string,
  mime: string,
): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
