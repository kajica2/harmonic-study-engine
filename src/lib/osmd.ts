/**
 * OSMD loader — OpenSheetMusicDisplay 2.x from CDN.
 *
 * Pattern lifted from `browser-chart-engine-cdn-loading` skill §2.
 * OSMD is UMD, so we load it as a plain <script> tag injected at
 * runtime and wait for `window.opensheetmusicdisplay.OpenSheetMusicDisplay`
 * to exist. We then keep a single instance per host element.
 *
 * Why CDN, not npm:
 *   - OSMD pulls in a non-trivial chunk (3+ MB after minify+gzip).
 *     Most users never open the Lead Sheet modal, so paying that
 *     cost on the critical path is wasteful.
 *   - The OSMD CDN bundle already ships a working `load()` and
 *     `render()`. The npm build path needs the same Vite plugin
 *     dance we did for Magenta.
 *
 * What this gives the user:
 *   - OSMD is **higher fidelity** than abcjs: stems, beams, ties,
 *     slurs, ledger lines, grace notes. Worth it for a printed
 *     lead sheet.
 */

const OSMD_CDN_URL =
  "https://cdn.jsdelivr.net/npm/opensheetmusicdisplay@2.1.1/build/opensheetmusicdisplay.min.js";

type OSMDClass = new (host: HTMLElement, opts?: object) => any;

let loadPromise: Promise<OSMDClass | null> | null = null;

/**
 * Inject the OSMD script tag once and return a promise that
 * resolves with the OSMD class. Idempotent; safe to call multiple
 * times. Returns `null` if the load fails (e.g. offline).
 */
export function loadOSMD(): Promise<OSMDClass | null> {
  if (typeof window === "undefined") return Promise.resolve(null);
  // Already loaded?
  const Ctor =
    (window as any).opensheetmusicdisplay?.OpenSheetMusicDisplay;
  if (typeof Ctor === "function") return Promise.resolve(Ctor as OSMDClass);

  if (loadPromise) return loadPromise;

  loadPromise = new Promise<OSMDClass | null>((resolve) => {
    const existing = document.querySelector(
      `script[data-osmd-loader="1"]`,
    ) as HTMLScriptElement | null;
    if (existing) {
      // Wait for it
      existing.addEventListener("load", () => {
        const C = (window as any).opensheetmusicdisplay?.OpenSheetMusicDisplay;
        resolve(typeof C === "function" ? (C as OSMDClass) : null);
      });
      existing.addEventListener("error", () => resolve(null));
      return;
    }

    const script = document.createElement("script");
    script.src = OSMD_CDN_URL;
    script.async = true;
    script.dataset.osmdLoader = "1";
    script.addEventListener("load", () => {
      const C = (window as any).opensheetmusicdisplay?.OpenSheetMusicDisplay;
      resolve(typeof C === "function" ? (C as OSMDClass) : null);
    });
    script.addEventListener("error", () => resolve(null));
    document.head.appendChild(script);
  });

  return loadPromise;
}

/**
 * Render MusicXML into a host element using OSMD. Returns the
 * instance so the caller can call `osmd.cursor.show()` later
 * (though skill §2 says that's unreliable in 2.x; we don't rely
 * on it).
 *
 * The host element is cleared first so re-renders don't pile up.
 */
export async function renderOSMD(
  host: HTMLElement,
  musicXml: string,
): Promise<boolean> {
  const Ctor = await loadOSMD();
  if (!Ctor) return false;
  host.innerHTML = "";
  try {
    const osmd = new Ctor(host, {
      autoResize: true,
      backend: "svg",
      drawTitle: true,
      drawComposer: true,
      drawPartNames: false,
    });
    // OSMD 2.x renamed loadData → load; skill §2 calls this out.
    await osmd.load(musicXml);
    await osmd.render();
    return true;
  } catch (e) {
    console.error("[osmd] render failed:", e);
    return false;
  }
}