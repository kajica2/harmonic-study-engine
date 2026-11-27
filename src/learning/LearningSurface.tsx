import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  BookOpen,
  Check,
  CirclePlay,
  Headphones,
  Music2,
  SlidersHorizontal,
  Sparkles,
  Square,
  Waves,
} from "lucide-react";
import { LESSON_IDS, LESSONS } from "./catalog";
import { COPY, INSTRUMENT_LABELS, LEVEL_LABELS, ROLE_LABELS } from "./copy";
import {
  completedCount,
  engineHref,
  INSTRUMENTS,
  LEVELS,
  STEPS,
  toggleStep,
  type Instrument,
  type LearningState,
  type Level,
  type Locale,
} from "./model";
import { LearningAudio, type SoundEvent } from "./audio";
import { createProgressRepository } from "./persistence";
import "./learning.css";

type View = "home" | "practice" | "studio" | "progress";
export default function LearningSurface() {
  const progressRepository = useMemo(
    () => createProgressRepository(() => window.localStorage, LESSON_IDS),
    [],
  );
  const [state, setState] = useState<LearningState>(
    () => progressRepository.load().state,
  );
  const [view, setView] = useState<View>("home");
  const [filter, setFilter] = useState<Level | "all">("all");
  const [storageOK, setStorageOK] = useState(true);
  const [message, setMessage] = useState("");
  const [bpm, setBpm] = useState(
    LESSONS.find((l) => l.id === state.selectedLesson)?.bpm ?? 72,
  );
  const [playing, setPlaying] = useState<"reference" | "loop" | null>(null);
  const [beat, setBeat] = useState(-1);
  const [taps, setTaps] = useState(0);
  const audio = useRef<LearningAudio | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const pageHeading = useRef<HTMLHeadingElement>(null);
  const locale = state.profile.locale;
  const t = COPY[locale];
  const lesson =
    LESSONS.find((l) => l.id === state.selectedLesson) ?? LESSONS[0];
  const entry = state.progress[lesson.id] ?? { steps: [], reflection: "" };
  const complete = completedCount(state, LESSON_IDS);
  const count = LESSON_IDS.reduce(
    (sum, id) => sum + (state.progress[id]?.steps.length ?? 0),
    0,
  );
  const levelLabels = LEVEL_LABELS[locale];
  const instrumentLabels = INSTRUMENT_LABELS[locale];
  const roles = ROLE_LABELS[locale];

  useEffect(() => {
    setStorageOK(progressRepository.save(state));
  }, [state, progressRepository]);
  useEffect(() => {
    const previousTitle = document.title;
    const previousLanguage = document.documentElement.lang;
    document.title = "Ultimate Exercise · Learning lab";
    document.documentElement.lang = locale;
    return () => {
      document.title = previousTitle;
      document.documentElement.lang = previousLanguage;
    };
  }, [locale]);
  useEffect(() => {
    const controller = new LearningAudio();
    audio.current = controller;
    const onHidden = () => {
      if (document.hidden) {
        controller.stop();
        setPlaying(null);
        setBeat(-1);
      }
    };
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      controller.stop();
      audio.current = null;
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, []);
  useEffect(() => {
    setBpm(lesson.bpm);
    setTaps(0);
  }, [lesson.id, lesson.bpm]);
  useEffect(() => {
    pageHeading.current?.focus();
  }, [view]);

  function stop() {
    audio.current?.stop();
    setPlaying(null);
    setBeat(-1);
  }
  function navigate(next: View) {
    stop();
    setMessage("");
    setView(next);
  }
  function openLesson(id: string) {
    stop();
    setState((s) => ({ ...s, selectedLesson: id }));
    setView("practice");
    setMessage("");
  }
  async function play(kind: "reference" | "loop") {
    stop();
    setMessage("");
    setPlaying(kind);
    const events: readonly SoundEvent[] =
      kind === "reference"
        ? lesson.notes
        : state.loop.flatMap((row, rowIndex) =>
            row.flatMap((on, i) =>
              on
                ? [
                    {
                      midi: 60,
                      beat: i / 2,
                      duration: 0.15,
                      drum:
                        rowIndex === 0 ? ("low" as const) : ("high" as const),
                    },
                  ]
                : [],
            ),
          );
    try {
      await audio.current?.start(
        events,
        kind === "reference" ? lesson.beats : 4,
        bpm,
        kind === "loop",
        (position) => setBeat(Math.floor(position * 2)),
        () => {
          setPlaying(null);
          setBeat(-1);
        },
      );
    } catch {
      setPlaying(null);
      setBeat(-1);
      setMessage(t.audioError);
    }
  }
  function exportBackup() {
    const url = URL.createObjectURL(
      new Blob([progressRepository.backup(state)], {
        type: "application/json",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "ultimate-exercise-practice.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importBackup(file?: File) {
    if (!file) return;
    try {
      if (file.size > 1_000_000) throw new Error("Oversized backup");
      const parsed = progressRepository.restore(await file.text());
      if (!parsed) throw new Error("Incompatible backup");
      stop();
      setState(parsed);
      setBpm(LESSONS.find((l) => l.id === parsed.selectedLesson)?.bpm ?? 72);
      setMessage(COPY[parsed.profile.locale].importDone);
    } catch {
      setMessage(t.importError);
    } finally {
      if (importInput.current) importInput.current.value = "";
    }
  }
  function toggleLoop(row: number, column: number) {
    stop();
    setState((s) => ({
      ...s,
      loop: s.loop.map((r, ri) =>
        ri !== row ? r : r.map((on, ci) => (ci === column ? !on : on)),
      ),
    }));
  }
  const nav = [
    { id: "home", label: t.home, icon: BookOpen },
    { id: "practice", label: t.practice, icon: Headphones },
    { id: "studio", label: t.studio, icon: SlidersHorizontal },
    { id: "progress", label: t.progress, icon: Waves },
  ] as const;

  return (
    <div className="ue-shell" data-testid="learning-surface">
      <a className="ue-skip" href="#ue-content">
        {t.browse}
      </a>
      <aside className="ue-sidebar">
        <a className="ue-brand" href="/learn">
          <span className="ue-brand-mark">
            <Music2 size={25} />
          </span>
          <span>
            ultimate<span className="ue-brand-small">exercise</span>
          </span>
        </a>
        <p className="ue-sidebar-tag">{t.tagline}</p>
        <nav aria-label={t.home}>
          {nav.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              aria-current={view === id ? "page" : undefined}
              onClick={() => navigate(id)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {view === id && <span className="ue-nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="ue-side-bottom">
          <div className="ue-small-orbit" aria-hidden="true">
            ♪
          </div>
          <p>{t.original}</p>
          <a href="/">
            {t.engine}
            <ArrowRight size={16} />
          </a>
        </div>
      </aside>
      <div className="ue-body">
        <header className="ue-topbar">
          <span className="ue-top-label">
            <span className="ue-live-dot" />
            {t.labNote}
          </span>
          <label className="ue-language">
            <span>{t.language}</span>
            <select
              aria-label={t.language}
              value={locale}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  profile: { ...s.profile, locale: e.target.value as Locale },
                }))
              }
            >
              <option value="en">English</option>
              <option value="sr-Latn">Srpski</option>
            </select>
          </label>
        </header>
        <main id="ue-content" className="ue-main">
          {view === "home" && (
            <>
              <section className="ue-hero">
                <div>
                  <p className="ue-eyebrow">{t.eyebrow}</p>
                  <h1 ref={pageHeading} tabIndex={-1}>
                    {t.headline}
                    <br />
                    <em>{t.headline2}</em>
                  </h1>
                  <p className="ue-lead">{t.intro}</p>
                  <button
                    className="ue-primary"
                    onClick={() => navigate("practice")}
                  >
                    {t.continue}
                    <ArrowRight size={18} />
                  </button>
                </div>
                <div className="ue-sound-art" aria-hidden="true">
                  <span className="ue-art-label">01 / ∞</span>
                  <div className="ue-art-orbit" />
                  <div className="ue-art-orbit ue-orbit-two" />
                  <div className="ue-art-disc">
                    <Music2 size={52} strokeWidth={1} />
                  </div>
                  <span className="ue-art-note ue-note-one">♪</span>
                  <span className="ue-art-note ue-note-two">♬</span>
                  <span className="ue-art-caption">LISTEN · PLAY · CREATE</span>
                </div>
              </section>
              <section className="ue-start" aria-labelledby="ue-start-title">
                <div>
                  <p className="ue-eyebrow">{t.yourStart}</p>
                  <h2 id="ue-start-title">{t.settings}</h2>
                  <p>{t.noGate}</p>
                </div>
                <div className="ue-profile-fields">
                  <label>
                    {t.level}
                    <select
                      aria-label={t.level}
                      value={state.profile.level}
                      onChange={(e) => {
                        const level = e.target.value as Level;
                        stop();
                        setFilter(level);
                        setState((s) => ({
                          ...s,
                          profile: { ...s.profile, level },
                          selectedLesson: LESSONS.find(
                            (l) => l.level === level,
                          )!.id,
                        }));
                      }}
                    >
                      {LEVELS.map((level) => (
                        <option key={level} value={level}>
                          {levelLabels[level]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t.instrument}
                    <select
                      aria-label={t.instrument}
                      value={state.profile.instrument}
                      onChange={(e) =>
                        setState((s) => ({
                          ...s,
                          profile: {
                            ...s.profile,
                            instrument: e.target.value as Instrument,
                          },
                        }))
                      }
                    >
                      {INSTRUMENTS.map((instrument) => (
                        <option key={instrument} value={instrument}>
                          {instrumentLabels[instrument]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="ue-check-label">
                    <input
                      type="checkbox"
                      checked={state.profile.caregiver}
                      onChange={(e) =>
                        setState((s) => ({
                          ...s,
                          profile: {
                            ...s.profile,
                            caregiver: e.target.checked,
                          },
                        }))
                      }
                    />
                    {t.caregiver}
                  </label>
                </div>
              </section>
              {state.profile.caregiver && (
                <p className="ue-callout">{t.caregiverHint}</p>
              )}
              <section aria-labelledby="ue-lessons-title">
                <div className="ue-section-heading">
                  <div>
                    <p className="ue-eyebrow">{t.lessons} / 01</p>
                    <h2 id="ue-lessons-title">{t.home}</h2>
                  </div>
                  <label className="ue-filter">
                    <span className="ue-sr-only">{t.level}</span>
                    <select
                      aria-label={t.lessons}
                      value={filter}
                      onChange={(e) =>
                        setFilter(e.target.value as Level | "all")
                      }
                    >
                      <option value="all">{t.all}</option>
                      {LEVELS.map((level) => (
                        <option key={level} value={level}>
                          {levelLabels[level]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="ue-lesson-grid">
                  {LESSONS.filter(
                    (l) => filter === "all" || l.level === filter,
                  ).map((item) => (
                    <article
                      key={item.id}
                      className={`ue-lesson-card ue-tone-${item.role}`}
                    >
                      <div className="ue-card-top">
                        <span className="ue-card-number">
                          {String(LESSON_IDS.indexOf(item.id) + 1).padStart(
                            2,
                            "0",
                          )}
                        </span>
                        <span className="ue-badge">
                          {levelLabels[item.level]}
                        </span>
                      </div>
                      <div className="ue-card-symbol" aria-hidden="true">
                        {item.level === "open-study" ? (
                          <Sparkles size={46} strokeWidth={1.4} />
                        ) : item.level === "advanced" ? (
                          <ArrowRight
                            size={46}
                            strokeWidth={1.4}
                            style={{ transform: "rotate(-45deg)" }}
                          />
                        ) : (
                          ["◒", "≋", "♫", "◉", "♮", "↗", "✳"][
                            LESSON_IDS.indexOf(item.id)
                          ]
                        )}
                      </div>
                      <p className="ue-eyebrow">{roles[item.role]}</p>
                      <h3>{item.title[locale]}</h3>
                      <p className="ue-card-goal">{item.goal[locale]}</p>
                      <div className="ue-card-footer">
                        <span>
                          {item.minutes} {t.minutes} ·{" "}
                          {state.progress[item.id]?.steps.length ?? 0}/5
                        </span>
                        <button
                          aria-label={`${t.openLesson}: ${item.title[locale]}`}
                          onClick={() => openLesson(item.id)}
                        >
                          <ArrowRight size={20} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </>
          )}
          {view === "practice" && (
            <>
              <p className="ue-eyebrow">
                {t.yourSession} / {levelLabels[lesson.level]} /{" "}
                {instrumentLabels[state.profile.instrument]}
              </p>
              <h1 className="ue-page-title" ref={pageHeading} tabIndex={-1}>
                {lesson.title[locale]}
              </h1>
              <p className="ue-lead">{lesson.goal[locale]}</p>
              <div className="ue-practice-layout">
                <section className="ue-panel">
                  <div className="ue-section-heading">
                    <h2>{t.sessionHint}</h2>
                    <span className="ue-badge">{entry.steps.length}/5</span>
                  </div>
                  <p className="ue-muted">{t.stepsHint}</p>
                  <ol className="ue-step-list">
                    {STEPS.map((step, i) => (
                      <li key={step}>
                        <label>
                          <input
                            type="checkbox"
                            checked={entry.steps.includes(step)}
                            onChange={() =>
                              setState((s) => toggleStep(s, lesson.id, step))
                            }
                          />
                          <span className="ue-step-index" aria-hidden="true">
                            {entry.steps.includes(step) ? (
                              <Check size={16} />
                            ) : (
                              i + 1
                            )}
                          </span>
                          <span>
                            <strong>{t[step]}</strong>
                            <span className="ue-step-prompt">
                              {lesson.prompts[step][locale]}
                            </span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ol>
                  <label className="ue-reflection">
                    {t.reflection}
                    <textarea
                      maxLength={2000}
                      rows={3}
                      placeholder={t.reflectionHint}
                      value={entry.reflection}
                      onChange={(e) => {
                        const reflection = e.target.value;
                        setState((s) => ({
                          ...s,
                          progress: {
                            ...s.progress,
                            [lesson.id]: {
                              ...(s.progress[lesson.id] ?? { steps: [] }),
                              reflection,
                            },
                          },
                        }));
                      }}
                    />
                  </label>
                </section>
                <aside className="ue-practice-tools">
                  <section className="ue-panel ue-listen-panel">
                    <Headphones size={28} />
                    <h2>{t.listen}</h2>
                    <p className="ue-muted">{t.concert}</p>
                    <div className="ue-tempo">
                      <label htmlFor="ue-reference-tempo">{t.tempo}</label>
                      <output htmlFor="ue-reference-tempo">{bpm} BPM</output>
                      <input
                        id="ue-reference-tempo"
                        aria-label={t.tempo}
                        type="range"
                        min={40}
                        max={180}
                        step={1}
                        value={bpm}
                        onChange={(e) => {
                          stop();
                          setBpm(Number(e.target.value));
                        }}
                      />
                    </div>
                    <button
                      className="ue-primary ue-full"
                      onClick={() =>
                        playing === "reference"
                          ? stop()
                          : void play("reference")
                      }
                    >
                      {playing === "reference" ? (
                        <Square size={17} />
                      ) : (
                        <CirclePlay size={19} />
                      )}
                      {playing === "reference" ? t.stop : t.reference}
                    </button>
                    <div className="ue-pulse-strip" aria-label={t.pulse}>
                      {Array.from({ length: lesson.beats }, (_, i) => (
                        <span
                          key={i}
                          className={
                            playing === "reference" &&
                            Math.floor(beat / 2) === i
                              ? "is-active"
                              : ""
                          }
                        >
                          {i + 1}
                        </span>
                      ))}
                    </div>
                  </section>
                  <section className="ue-panel">
                    <button
                      className={`ue-tap-pad ${taps % 2 ? "ue-tap-alt" : ""}`}
                      onClick={() => setTaps((n) => n + 1)}
                    >
                      <Music2 size={30} />
                      <strong>{t.tap}</strong>
                      <span>
                        {taps} {t.taps}
                      </span>
                    </button>
                    <p className="ue-muted">{t.tapHint}</p>
                    <button
                      className="ue-text-button"
                      onClick={() => setTaps(0)}
                    >
                      {t.resetTaps}
                    </button>
                  </section>
                </aside>
              </div>
              {lesson.media.map((media) => (
                <section className="ue-panel ue-lesson-media" key={media.src}>
                  <h2>{media.title[locale]}</h2>
                  {media.kind === "video" ? (
                    <video
                      controls
                      preload="none"
                      src={media.src}
                      aria-label={media.title[locale]}
                    >
                      <track
                        kind="captions"
                        src={media.captions}
                        srcLang={media.locale}
                        label={media.locale}
                        default
                      />
                    </video>
                  ) : (
                    <audio
                      controls
                      preload="none"
                      src={media.src}
                      aria-label={media.title[locale]}
                    />
                  )}
                  <p className="ue-muted">{media.transcript[locale]}</p>
                  <p className="ue-media-note">{media.rights}</p>
                </section>
              ))}
              <div className="ue-engine-callout">
                <div>
                  <h2>{t.related}</h2>
                  <p>{t.relatedHint}</p>
                </div>
                <a className="ue-secondary" href={engineHref(lesson)}>
                  {t.engine}
                  <ArrowRight size={18} />
                </a>
              </div>
              <div className="ue-practice-footer">
                <button
                  className="ue-text-button"
                  onClick={() => navigate("home")}
                >
                  {t.return}
                </button>
                <button
                  className="ue-secondary"
                  onClick={() => navigate("studio")}
                >
                  {t.studio}
                  <ArrowRight size={17} />
                </button>
              </div>
            </>
          )}
          {view === "studio" && (
            <>
              <p className="ue-eyebrow">{t.create} / 02</p>
              <h1 className="ue-page-title" ref={pageHeading} tabIndex={-1}>
                {t.studioTitle}
              </h1>
              <p className="ue-lead">{t.studioIntro}</p>
              <section className="ue-panel ue-sequencer">
                <p className="ue-muted">{t.loopHint}</p>
                <div className="ue-sequence-count" aria-hidden="true">
                  <span />
                  {["1", "&", "2", "&", "3", "&", "4", "&"].map((n, i) => (
                    <span
                      key={i}
                      className={
                        playing === "loop" && beat === i ? "is-active" : ""
                      }
                    >
                      {n}
                    </span>
                  ))}
                </div>
                {state.loop.map((row, ri) => (
                  <div className="ue-sequence-row" key={ri}>
                    <span>{ri === 0 ? t.kick : t.rim}</span>
                    {row.map((on, ci) => (
                      <button
                        key={ci}
                        aria-label={`${ri === 0 ? t.kick : t.rim}, ${t.step} ${ci + 1}`}
                        aria-pressed={on}
                        className={`${on ? "is-on" : ""} ${playing === "loop" && beat === ci ? "is-playing" : ""}`}
                        onClick={() => toggleLoop(ri, ci)}
                      >
                        {on ? (
                          <span aria-hidden="true">●</span>
                        ) : (
                          <span aria-hidden="true">–</span>
                        )}
                      </button>
                    ))}
                  </div>
                ))}
                <div className="ue-studio-transport">
                  <button
                    className="ue-primary"
                    onClick={() =>
                      playing === "loop" ? stop() : void play("loop")
                    }
                  >
                    {playing === "loop" ? (
                      <Square size={17} />
                    ) : (
                      <CirclePlay size={19} />
                    )}
                    {playing === "loop" ? t.stop : t.startLoop}
                  </button>
                  <div className="ue-tempo">
                    <label htmlFor="ue-loop-tempo">{t.tempo}</label>
                    <output htmlFor="ue-loop-tempo">{bpm} BPM</output>
                    <input
                      id="ue-loop-tempo"
                      aria-label={t.tempo}
                      type="range"
                      min={40}
                      max={180}
                      value={bpm}
                      onChange={(e) => {
                        stop();
                        setBpm(Number(e.target.value));
                      }}
                    />
                  </div>
                </div>
              </section>
              <button
                className="ue-secondary"
                onClick={() => navigate("practice")}
              >
                {t.practice}
                <ArrowRight size={17} />
              </button>
            </>
          )}
          {view === "progress" && (
            <>
              <p className="ue-eyebrow">{t.progress} / 03</p>
              <h1 className="ue-page-title" ref={pageHeading} tabIndex={-1}>
                {t.progressTitle}
              </h1>
              <p className="ue-lead">{t.progressIntro}</p>
              <div className="ue-stats">
                <div>
                  <strong>
                    {complete}
                    <small>/{LESSONS.length}</small>
                  </strong>
                  <span>
                    {t.lessons} {t.completed}
                  </span>
                </div>
                <div>
                  <strong>
                    {count}
                    <small>/{LESSONS.length * 5}</small>
                  </strong>
                  <span>{t.total}</span>
                </div>
                <div>
                  <Sparkles size={27} />
                  <span>{instrumentLabels[state.profile.instrument]}</span>
                </div>
              </div>
              <div className="ue-progress-list">
                {LESSONS.filter(
                  (l) =>
                    state.progress[l.id]?.steps.length ||
                    state.progress[l.id]?.reflection,
                ).map((l) => (
                  <article className="ue-panel" key={l.id}>
                    <div className="ue-section-heading">
                      <h2>{l.title[locale]}</h2>
                      <span>{state.progress[l.id].steps.length}/5</span>
                    </div>
                    <progress
                      aria-label={`${t.statusLabel}: ${l.title[locale]}`}
                      value={state.progress[l.id].steps.length}
                      max={5}
                    />
                    {state.progress[l.id].reflection && (
                      <p className="ue-saved-reflection">
                        {state.progress[l.id].reflection}
                      </p>
                    )}
                    <button
                      className="ue-text-button"
                      onClick={() => openLesson(l.id)}
                    >
                      {t.continue}
                      <ArrowRight size={16} />
                    </button>
                  </article>
                ))}
                {!count &&
                  !Object.values(state.progress).some((p) => p.reflection) && (
                    <p className="ue-callout">{t.noProgress}</p>
                  )}
              </div>
              <section className="ue-panel ue-backup">
                <h2>{t.saved}</h2>
                <p className="ue-muted">{t.backupHint}</p>
                <div className="ue-actions">
                  <button className="ue-secondary" onClick={exportBackup}>
                    <ArrowDownToLine size={17} />
                    {t.export}
                  </button>
                  <button
                    className="ue-secondary"
                    onClick={() => importInput.current?.click()}
                  >
                    {t.import}
                  </button>
                </div>
                <input
                  className="ue-sr-only"
                  aria-label={t.import}
                  ref={importInput}
                  type="file"
                  accept="application/json,.json"
                  onChange={(e) => void importBackup(e.target.files?.[0])}
                />
              </section>
            </>
          )}
          <div role="status" className="ue-status">
            {message}
          </div>
          <footer className="ue-footer">
            <span className={storageOK ? "" : "ue-storage-warning"}>
              <span className="ue-live-dot" />
              {storageOK ? t.saved : t.unsaved}
            </span>
            <span>
              {complete}/{LESSONS.length} {t.completed}
            </span>
          </footer>
          {!storageOK && (
            <button className="ue-secondary" onClick={exportBackup}>
              {t.export}
            </button>
          )}
          <p className="ue-media-note">{t.noMedia}</p>
        </main>
      </div>
    </div>
  );
}
