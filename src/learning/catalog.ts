import type { Copy, Lesson, Step, NoteEvent } from "./model";

const c = (en: string, sr: string): Copy => ({ en, "sr-Latn": sr });
const notes = (pitches: number[], spacing = 1): NoteEvent[] =>
  pitches.map((midi, i) => ({
    midi,
    beat: i * spacing,
    duration: spacing * 0.7,
  }));
const prompts = (
  listen: Copy,
  sing: Copy,
  play: Copy,
  review: Copy,
  create: Copy,
): Record<Step, Copy> => ({ listen, sing, play, review, create });
const common = {
  media: [],
  provenance: "Original Ultimate Exercise study",
} as const;

/** Small, original seed curriculum; levels are learner choices, never age gates. */
export const LESSONS: readonly Lesson[] = [
  {
    ...common,
    id: "tap-the-swing",
    level: "first-sounds",
    role: "pulse",
    minutes: 4,
    bpm: 72,
    beats: 4,
    title: c("Tap the swing", "Otkucaj sving"),
    goal: c(
      "Hear a long–short call. Answer with your hands.",
      "Čuj dugi–kratki poziv. Odgovori dlanovima.",
    ),
    notes: [0, 2 / 3, 1, 1 + 2 / 3, 2, 2 + 2 / 3, 3, 3 + 2 / 3].map((beat) => ({
      midi: 72,
      beat,
      duration: 0.12,
    })),
    prompts: prompts(
      c(
        "Play the call. Sway to the steady pulse underneath it.",
        "Pusti poziv. Njiši se uz ravnomeran puls.",
      ),
      c(
        "Echo with ‘da–ba’ or a gentle clap. No reading needed.",
        "Ponovi sa „da–ba“ ili tihim pljeskom. Čitanje nije potrebno.",
      ),
      c(
        "Use the big pad below to answer. An adult can take turns with a child.",
        "Odgovori velikim tasterom ispod. Odrasli i dete mogu da se smenjuju.",
      ),
      c(
        "Did your answer keep moving? Listen again without a score or grade.",
        "Da li je odgovor tekao? Slušaj ponovo, bez ocene.",
      ),
      c(
        "Change one hit in the loop studio. Make a different ending.",
        "Promeni jedan udarac u studiju. Smisli drugačiji kraj.",
      ),
    ),
  },
  {
    ...common,
    id: "sound-around-you",
    level: "first-sounds",
    role: "production",
    minutes: 5,
    bpm: 80,
    beats: 4,
    title: c("A room full of sound", "Soba puna zvuka"),
    goal: c(
      "Turn two everyday sounds into your first groove.",
      "Pretvori dva svakodnevna zvuka u prvi gruv.",
    ),
    notes: notes([60, 67, 60, 67]),
    prompts: prompts(
      c(
        "Listen to the call, then clap once and hear the room's tail.",
        "Poslušaj poziv, zatim pljesni i oslušni odjek sobe.",
      ),
      c("Hum a low sound, then a high one.", "Otpevuši nizak zvuk, pa visok."),
      c(
        "Tap a low sound on your knee and clap a higher sound.",
        "Otkucaj nizak zvuk po kolenu, a viši pljeskom.",
      ),
      c(
        "Try the clap in another position. What changes?",
        "Pljesni sa drugog mesta. Šta se menja?",
      ),
      c(
        "Build a two-sound pattern below and play it for someone.",
        "Napravi obrazac od dva zvuka ispod i odsviraj ga nekome.",
      ),
    ),
  },
  {
    ...common,
    id: "one-note-many-shapes",
    level: "foundation",
    role: "melody",
    minutes: 7,
    bpm: 60,
    beats: 8,
    title: c("One note, many shapes", "Jedan ton, mnogo oblika"),
    goal: c(
      "Make a phrase with breath, space and one pitch.",
      "Napravi frazu dahom, pauzom i jednim tonom.",
    ),
    notes: [
      { midi: 58, beat: 0, duration: 2 },
      { midi: 58, beat: 3, duration: 1 },
      { midi: 58, beat: 5, duration: 2 },
    ],
    prompts: prompts(
      c(
        "Hear where each note ends. The spaces belong to the phrase.",
        "Čuj gde se svaki ton završava. Pauze pripadaju frazi.",
      ),
      c(
        "Sing the phrase on any comfortable pitch.",
        "Otpevaj frazu na prijatnom tonu.",
      ),
      c(
        "Play one comfortable note. Copy the rhythm, then leave more space.",
        "Sviraj jedan prijatan ton. Ponovi ritam, pa ostavi više prostora.",
      ),
      c(
        "Listen for a clear start and a deliberate ending. Write what you heard.",
        "Oslušni jasan početak i nameran završetak. Zapiši šta čuješ.",
      ),
      c(
        "Keep the pitch; invent a new rhythm over your loop.",
        "Zadrži ton; smisli novi ritam uz svoj lup.",
      ),
    ),
  },
  {
    ...common,
    id: "bass-is-a-melody",
    level: "foundation",
    role: "bass",
    minutes: 7,
    bpm: 76,
    beats: 8,
    title: c("The bass is a melody", "I bas je melodija"),
    goal: c(
      "Hear the root and fifth as an ensemble role.",
      "Čuj osnovni ton i kvintu kao ulogu u sastavu.",
    ),
    notes: notes([48, 55, 48, 55], 2),
    enginePathId: "path-1",
    prompts: prompts(
      c(
        "Follow the low line rather than the top note.",
        "Prati duboku liniju umesto najvišeg tona.",
      ),
      c(
        "Sing the root and fifth in a comfortable octave.",
        "Otpevaj osnovni ton i kvintu u prijatnoj oktavi.",
      ),
      c(
        "Play, sing or tap the bass role. Leave space for a melody.",
        "Sviraj, pevaj ili otkucaj bas deonicu. Ostavi mesta za melodiju.",
      ),
      c(
        "Can you hear the return home without looking?",
        "Možeš li da čuješ povratak kući bez gledanja?",
      ),
      c(
        "Add a short answering phrase above the bass.",
        "Dodaj kratku frazu kao odgovor iznad basa.",
      ),
    ),
  },
  {
    ...common,
    id: "pentatonic-open-door",
    level: "intermediate",
    role: "harmony",
    minutes: 10,
    bpm: 88,
    beats: 8,
    title: c("Pentatonics, an open door", "Pentatonika, otvorena vrata"),
    goal: c(
      "Explore a D-minor pentatonic line over a thirdless D–A–E voicing.",
      "Istraži d-mol pentatoniku uz sazvuk D–A–E bez terce.",
    ),
    notes: notes([62, 65, 67, 69, 72, 69, 67, 62]),
    prompts: prompts(
      c(
        "Hear the original pentatonic line. Its pitches are concert D, F, G, A, C.",
        "Čuj originalnu pentatonsku liniju. Koncertni tonovi su D, F, G, A, C.",
      ),
      c(
        "Sing the line from memory. Rest before the final D.",
        "Otpevaj liniju iz sećanja. Napravi pauzu pre završnog D.",
      ),
      c(
        "Play it in a comfortable octave. For B♭ horn, written notes are E, G, A, B, D.",
        "Sviraj u prijatnoj oktavi. Za B♭ trubu pisani tonovi su E, G, A, H, D.",
      ),
      c(
        "Sustain D–A–E on a keyboard or with partners. Hear how F gives the open chord a minor color.",
        "Drži D–A–E na klavijaturi ili sa drugima. Čuj kako F daje molsku boju otvorenom akordu.",
      ),
      c(
        "Create a two-bar answer using only three of those pitches.",
        "Napravi odgovor od dva takta koristeći samo tri od tih tonova.",
      ),
    ),
  },
  {
    ...common,
    id: "move-the-motive",
    level: "advanced",
    role: "melody",
    minutes: 12,
    bpm: 104,
    beats: 8,
    title: c("Move the motive", "Pomeri motiv"),
    goal: c(
      "Keep an idea recognizable while moving its entry point.",
      "Sačuvaj prepoznatljivu ideju dok pomeraš njen početak.",
    ),
    notes: [
      { midi: 62, beat: 0.5, duration: 0.5 },
      { midi: 65, beat: 1, duration: 1 },
      { midi: 69, beat: 2.5, duration: 1 },
      { midi: 64, beat: 4, duration: 0.5 },
      { midi: 67, beat: 4.5, duration: 1 },
      { midi: 71, beat: 6, duration: 1 },
    ],
    enginePathId: "path-2",
    prompts: prompts(
      c(
        "Hear the same contour at two starting points.",
        "Čuj istu konturu na dva početna mesta.",
      ),
      c(
        "Sing the motive, then count silently before answering.",
        "Otpevaj motiv, pa izbroj u sebi pre odgovora.",
      ),
      c(
        "Move the entrance by an eighth note; keep the intervals intact.",
        "Pomeri ulazak za osminu; sačuvaj intervale.",
      ),
      c(
        "Did the displaced version still sound like the same idea?",
        "Da li pomerena verzija i dalje zvuči kao ista ideja?",
      ),
      c(
        "Use the engine to develop an eight-bar variation, then return to the original.",
        "U alatu razvij varijaciju od osam taktova, pa se vrati originalu.",
      ),
    ),
  },
  {
    ...common,
    id: "your-own-small-world",
    level: "open-study",
    role: "production",
    minutes: 15,
    bpm: 96,
    beats: 8,
    title: c("Your own small world", "Tvoj mali svet"),
    goal: c(
      "Compose, arrange and explain a short musical idea.",
      "Komponuj, aranžiraj i objasni kratku muzičku ideju.",
    ),
    notes: notes([60, 67, 62, 69], 2),
    prompts: prompts(
      c(
        "Listen for the relationship between the two answering pairs.",
        "Oslušni odnos dva para koja se dozivaju.",
      ),
      c(
        "Sing your own answer before choosing an instrument.",
        "Otpevaj svoj odgovor pre izbora instrumenta.",
      ),
      c(
        "Make an eight-bar sketch with a melody, bass and pulse. Use the engine for arranging.",
        "Napravi skicu od osam taktova sa melodijom, basom i pulsom. Koristi alat za aranžman.",
      ),
      c(
        "Name one choice that serves the music and one you want to change.",
        "Navedi jedan izbor koji služi muzici i jedan koji želiš da promeniš.",
      ),
      c(
        "Change roles. Perform the bass part, then leave it space while you improvise.",
        "Promeni ulogu. Sviraj bas, pa mu ostavi prostor dok improvizuješ.",
      ),
    ),
  },
];
export const LESSON_IDS = LESSONS.map((l) => l.id);
