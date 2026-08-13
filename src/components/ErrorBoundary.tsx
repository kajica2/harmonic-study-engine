/**
 * ErrorBoundary — catches any uncaught error in its subtree and
 * renders a recovery UI instead of a white-screen.
 *
 * Two granularities:
 *   - <ErrorBoundary>           → wraps the whole app
 *   - <ErrorBoundary scope="..."> → wraps a section (e.g. canvas,
 *                                  lead sheet, recorder) so a
 *                                  throw inside one section doesn't
 *                                  crash the others.
 *
 * Recovery options surfaced:
 *   - "Reload this section"     → resets the subtree state
 *   - "Reload the page"         → hard reload (last resort)
 *   - "Copy the error"          → copy stack + component stack
 *                                  to clipboard for support
 *
 * Errors are reported to console.error so existing observability
 * hooks (Sentry, etc.) pick them up automatically. No remote
 * reporting is wired here — opt-in only.
 */

import React from "react";
import { AlertTriangle, RotateCw, RefreshCw, Copy, Check } from "lucide-react";

interface Props {
  children: React.ReactNode;
  /** Short label shown in the recovery UI, e.g. "Synesthesia Canvas" */
  scope?: string;
  /** Optional fallback element. If absent, the built-in SafeError renders. */
  fallback?: React.ReactNode;
}

interface State {
  error: Error | null;
  info: React.ErrorInfo | null;
  /** Bumping this counter remounts the subtree, clearing local state. */
  resetKey: number;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, info: null, resetKey: 0 };
  // Declare props + setState explicitly so TS sees them — React 19
  // ships no built-in type declarations, so without this `this.props`
  // and `this.setState` resolve to `unknown` / missing and TS errors.
  props!: Props;
  setState!: (
    state:
      | Partial<State>
      | ((prev: State, props: Props) => Partial<State> | Pick<State, never>)
      | Pick<State, never>,
    callback?: () => void,
  ) => void;

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Surface to console so existing error monitors (Sentry etc.) pick it up.
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info);
    this.setState({ info });
  }

  reset = () => {
    this.setState({
      error: null,
      info: null,
      resetKey: this.state.resetKey + 1,
    });
  };

  hardReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) {
      // Keyed wrapper ensures a reset fully remounts the subtree.
      return (
        <React.Fragment key={this.state.resetKey}>
          {this.props.children}
        </React.Fragment>
      );
    }

    if (this.props.fallback) {
      return <>{this.props.fallback}</>;
    }

    return (
      <SafeError
        scope={this.props.scope}
        error={this.state.error}
        info={this.state.info}
        onReset={this.reset}
        onReload={this.hardReload}
      />
    );
  }
}

const SafeError: React.FC<{
  scope?: string;
  error: Error;
  info: React.ErrorInfo | null;
  onReset: () => void;
  onReload: () => void;
}> = ({ scope, error, info, onReset, onReload }) => {
  const [copied, setCopied] = React.useState(false);

  const copyToClipboard = async () => {
    const text = [
      `Scope: ${scope ?? "App"}`,
      `Error: ${error.name}: ${error.message}`,
      `Stack:\n${error.stack ?? "(no stack)"}`,
      `Component stack:\n${info?.componentStack ?? "(no component stack)"}`,
    ].join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Best-effort — clipboard may be blocked.
    }
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex items-center justify-center p-6 surface-2 border border-[color:var(--color-err)] rounded-[var(--radius-lg)] max-w-xl mx-auto my-6 shadow-[0_4px_18px_rgba(0,0,0,0.35)]"
    >
      <div className="flex flex-col gap-3 w-full">
        <div className="flex items-center gap-2 text-[color:var(--color-err)]">
          <AlertTriangle size={20} aria-hidden="true" />
          <h2 className="text-base font-bold tracking-wide">
            {scope ? `${scope} crashed` : "Something went wrong"}
          </h2>
        </div>

        <p className="text-sm text-[color:var(--color-text-2)]">
          The app caught an error in this section. Your other work isn't
          lost — only {scope ?? "this area"} is paused.
        </p>

        <details className="text-xs t-mono text-[color:var(--color-text-3)] bg-black/30 border border-white/5 rounded p-2">
          <summary className="cursor-pointer hover:text-[color:var(--color-text-1)]">
            {error.name}: {error.message}
          </summary>
          <pre className="whitespace-pre-wrap break-words mt-2 text-[10px] leading-snug max-h-48 overflow-auto">
{error.stack}
{info?.componentStack ?? ""}
          </pre>
        </details>

        <div className="flex flex-wrap gap-2 mt-1">
          <button
            onClick={onReset}
            className="flex items-center gap-1.5 px-3 py-1.5 surface-1 border border-[color:var(--color-border)] rounded-[var(--radius-md)] text-xs hover:border-[color:var(--color-brand-strong)] transition-colors"
          >
            <RotateCw size={12} aria-hidden="true" />
            Reload this section
          </button>
          <button
            onClick={onReload}
            className="flex items-center gap-1.5 px-3 py-1.5 surface-1 border border-[color:var(--color-border)] rounded-[var(--radius-md)] text-xs hover:border-[color:var(--color-brand-strong)] transition-colors"
          >
            <RefreshCw size={12} aria-hidden="true" />
            Reload page
          </button>
          <button
            onClick={copyToClipboard}
            className="flex items-center gap-1.5 px-3 py-1.5 surface-1 border border-[color:var(--color-border)] rounded-[var(--radius-md)] text-xs hover:border-[color:var(--color-brand-strong)] transition-colors"
            aria-label="Copy error details to clipboard"
          >
            {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
            {copied ? "Copied" : "Copy error"}
          </button>
        </div>
      </div>
    </div>
  );
};