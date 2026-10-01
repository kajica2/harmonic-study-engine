/**
 * src/types/verovio.d.ts - ambient declarations for the verovio ESM
 * packages. verovio ships no TypeScript types; these declare only the
 * surface this app uses (module init + toolkit render calls) so the
 * strict tsconfig stays green without pulling in the full verovio API.
 */

declare module "verovio/wasm" {
  /** Emscripten module factory. Resolves once the WASM binary is ready. */
  export default function createVerovioModule(): Promise<unknown>;
}

declare module "verovio/esm" {
  export interface VerovioOptions {
    /** Page width in internal units (default 2100). */
    pageWidth?: number;
    /** Page height in internal units (default 2970). */
    pageHeight?: number;
    /** Render scale in percent (default 100). */
    scale?: number;
    /** Layout breaks: "auto" | "line" | "none". */
    breaks?: string;
    /** Spacing between staves (internal units). */
    spacingStaff?: number;
    /** Spacing between systems (internal units). */
    spacingSystem?: number;
    /** Font family override. */
    font?: string;
    /** Shrink the page height to fit the content. */
    adjustPageHeight?: boolean;
    [key: string]: unknown;
  }

  export class VerovioToolkit {
    constructor(module: unknown);
    destroy(): void;
    loadData(data: string): boolean;
    renderToSVG(pageNo?: number, xmlDeclaration?: boolean): string;
    setOptions(options: VerovioOptions): void;
    getOptions(): Record<string, unknown>;
    getDefaultOptions(): Record<string, unknown>;
    getPageCount(): number;
    getVersion(): string;
    resetOptions(): void;
  }
}