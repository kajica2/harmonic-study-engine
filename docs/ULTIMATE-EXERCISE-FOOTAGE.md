# Ultimate Exercise: starter lesson footage

This is the production scaffold for attaching real lesson footage to the learning app. No footage has been recorded or generated. The seven seed activities currently use original synthesized demonstrations. Start with three short lessons and validate them with learners before shooting a large course.

## A repeatable lesson sequence

| Shot             | Picture and sound                                                                      | Purpose                                                   | Suggested length |
| ---------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------- |
| Hear it          | Teacher performs the complete call once, hands/instrument visible, clean natural sound | Learner knows what they are aiming for before explanation | 8–15 seconds     |
| Try it together  | Same angle; brief count-in, one phrase, an equal response gap                          | Echo without reading or navigating controls               | 15–30 seconds    |
| Notice one thing | Close view of the gesture or sound source; repeat one clear contrast                   | Ask a specific listening question                         | 10–20 seconds    |
| Make it yours    | Teacher demonstrates one variation, then leaves space                                  | Learner creates rather than only copies                   | 15–30 seconds    |
| Carry it forward | Short spoken or captioned prompt tied to the in-app loop or next exercise              | Connect the filmed activity to practice                   | 5–10 seconds     |

These are planning ranges, not attention-span claims. Allow replay and slower playback. Avoid music under spoken guidance. Capture a clean master and edit lengths around the actual phrase and response gap.

## First shooting batch

| Lesson ID              | Demonstration                                                           | Detail shot                                                                         | Response / creative task                                                  |
| ---------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `tap-the-swing`        | Clap one bar of long–short pairs at 72 BPM, with a visible steady pulse | Hands and torso; the learner can see the gesture without reading                    | Leave one bar empty; invite an answering pattern with a changed final hit |
| `one-note-many-shapes` | Flugelhorn or trumpet, one comfortable pitch, clear starts and releases | Instrument and breathing gesture; caption concert versus written note if naming it  | Copy the rhythm, then invent a new phrase using the same note             |
| `pentatonic-open-door` | Concert D-minor pentatonic line; separate D–A–E voicing demonstration   | Keyboard notes and horn fingering as separate views; label instrument/transposition | Sing the phrase, play it, then answer with only three pitches             |

For B♭ trumpet/flugelhorn, concert D, F, G, A, C correspond to written E, G, A, B, D in English note naming (B natural is H in Serbian naming). Keep score/audio labels explicit. Do not copy a third-party workbook or reference recording into footage without the required rights.

## Capture and delivery

- Frame the face, instrument and hands clearly; preserve room for captions and avoid cuts during a musical phrase. A tripod and available light are sufficient for the first shoot.
- Record the complete action with a natural dynamic range. Listen to the loudest horn phrase before committing to placement/gain. Retain a clean unprocessed master and a separate voice track when available.
- Deliver an H.264/AAC MP4 at 720p for the first low-data web version, a poster frame if useful, a WebVTT caption file, and a plain transcript. Keep master files outside the source repository; put only cleared, compressed web assets in the app.
- Caption speech and musical actions, including count-ins and response gaps. Use meaningful text or shapes alongside color. Film an action that still makes sense with sound off, and provide an audio demonstration for learners who cannot see the gesture.
- Record creator, performers, permission, source, version and permitted use. Prefer founder-only footage for the first batch; child participation is unnecessary for showing a caregiver activity.

## Attach an approved clip

Create `public/learning-media/` only when assets are available. Add files there or reference a controlled same-origin asset route. Attach the actual shipped paths in the matching lesson's `media` array:

```ts
media: [
  {
    kind: "video",
    title: { en: "Hear and echo", "sr-Latn": "Čuj i ponovi" },
    src: "/learning-media/tap-the-swing-en.mp4",
    captions: "/learning-media/tap-the-swing-en.vtt",
    locale: "en",
    transcript: {
      en: "[Replace with the complete reviewed transcript.]",
      "sr-Latn": "[Unesi ceo pregledan prevod transkripta.]",
    },
    rights: "[Replace with the verified creator, permission and version.]",
  },
];
```

The example filenames describe the intended delivery; these assets do not exist yet. The schema requires captions for video, and the student surface renders native playback controls with `preload="none"`. Use one clip at a time while practicing; synthesized reference and native media have independent playback controls in this scaffold. Check all transcripts, asset URLs, caption timing and phone playback when real footage is attached.
