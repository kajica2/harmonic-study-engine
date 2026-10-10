import { Download, RefreshCw, WifiOff, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function isStandalone(): boolean {
  return (typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches) ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function isAppleMobile(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function PwaPrompt() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [offline, setOffline] = useState(() => !navigator.onLine);
  const [updateReady, setUpdateReady] = useState(false);
  const [installHelp, setInstallHelp] = useState(false);
  const [installDismissed, setInstallDismissed] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [appleMobile, setAppleMobile] = useState(false);
  const applyingUpdate = useRef(false);

  useEffect(() => {
    setStandalone(isStandalone());
    setAppleMobile(isAppleMobile());

    const handleOffline = () => setOffline(true);
    const handleOnline = () => setOffline(false);
    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
      setInstallDismissed(false);
    };
    const handleInstalled = () => {
      setStandalone(true);
      setInstallPrompt(null);
      setInstallHelp(false);
    };

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    const handleControllerChange = () => {
      if (applyingUpdate.current) window.location.reload();
    };

    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
      navigator.serviceWorker.register("/service-worker.js")
        .then((result) => {
          if (result.waiting && navigator.serviceWorker.controller) setUpdateReady(true);

          result.addEventListener("updatefound", () => {
            const worker = result.installing;
            if (!worker) return;
            worker.addEventListener("statechange", () => {
              if (worker.state === "installed" && navigator.serviceWorker.controller) {
                setUpdateReady(true);
              }
            });
          });
          void result.update().catch(() => {});
        })
        .catch(() => {});
    }

    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      navigator.serviceWorker?.removeEventListener("controllerchange", handleControllerChange);
    };
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) {
      setInstallHelp(true);
      return;
    }
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallPrompt(null);
      if (choice.outcome === "accepted") setStandalone(true);
    } catch {
      setInstallPrompt(null);
    }
  };

  const handleUpdate = () => {
    if (!("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.getRegistration().then((registration) => {
      const worker = registration?.waiting;
      if (!worker) return;
      applyingUpdate.current = true;
      worker.postMessage({ type: "SKIP_WAITING" });
    });
  };

  const showInstall = !standalone && !installDismissed && (installPrompt || appleMobile);

  return (
    <div className="fixed inset-x-2 top-[calc(env(safe-area-inset-top)+0.5rem)] z-[60] flex flex-col items-center gap-2 pointer-events-none">
      {offline && (
        <div role="status" aria-live="polite" className="flex w-full max-w-xl items-center gap-2 rounded-lg border border-amber-300/40 bg-neutral-950/95 px-3 py-2 text-sm text-neutral-100 shadow-lg pointer-events-auto">
          <WifiOff size={16} aria-hidden="true" />
          <span>Offline — saved practice data and tools are available; online services are paused.</span>
        </div>
      )}
      {showInstall && (
        <div className="flex w-full max-w-xl items-center gap-2 rounded-lg border border-[color:var(--color-brand)]/40 bg-neutral-950/95 px-3 py-2 text-sm text-neutral-100 shadow-lg pointer-events-auto">
          <Download size={16} aria-hidden="true" />
          <span className="flex-1">{installHelp ? "In Safari, tap Share, then Add to Home Screen." : "Install Harmonic Study Engine for practice on the go."}</span>
          {!installHelp && (
            <button type="button" onClick={() => void handleInstall()} className="rounded-md bg-[color:var(--color-brand)] px-3 py-2 font-semibold text-neutral-950">
              Install app
            </button>
          )}
          <button type="button" aria-label="Dismiss install message" onClick={() => { setInstallDismissed(true); setInstallHelp(false); }} className="rounded-md p-2 text-neutral-300">
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}
      {updateReady && (
        <div role="status" aria-live="polite" className="flex w-full max-w-xl items-center gap-2 rounded-lg border border-emerald-300/40 bg-neutral-950/95 px-3 py-2 text-sm text-neutral-100 shadow-lg pointer-events-auto">
          <RefreshCw size={16} aria-hidden="true" />
          <span className="flex-1">A new version is ready.</span>
          <button type="button" onClick={handleUpdate} className="rounded-md bg-emerald-300 px-3 py-2 font-semibold text-neutral-950">
            Update now
          </button>
        </div>
      )}
    </div>
  );
}
