# Mobile app and offline use

Harmonic Study Engine is installable as a progressive web app. Open the
production site in a supported browser and choose **Install app** when the
browser offers it. On iPhone or iPad, open the site in Safari, tap **Share**,
then **Add to Home Screen**. Launch the installed icon to use the standalone
app window.

## Offline behavior

After the first successful load, the service worker keeps the app shell,
compiled JavaScript/CSS, and icons available offline. Practice state and
settings already persist in local storage; core practice, composition,
exploration, and audio features run locally. Backend endpoints, marketplace
requests, remote soundfonts, and sharing still require a connection (or their
respective assets to have been downloaded before going offline). Uploaded or
large audio/video files and API responses are never added to the app cache.

The app displays an offline status when connectivity is lost. It resumes
network-dependent features when the device reconnects. Browser audio policies
still require a user gesture before audio can start, especially after opening
an installed app on iOS.

## Updates and mobile use

The service worker checks for new builds and shows **A new version is ready**
when one is waiting. Choose **Update now** to activate it and reload into the
new version. The fixed practice controls respect safe-area insets, have
touch-sized targets, and compact for landscape phone layouts. Keyboard focus
indicators and reduced-motion preferences remain enabled.

## Launch checks

- `npm run lint`, `npm test`, and `npm run build` pass.
- Confirm `dist/manifest.webmanifest`, `dist/service-worker.js`, and the icon
  files are present after build.
- On a phone, verify browser install/Add to Home Screen, standalone launch,
  offline reload after one online visit, and the update prompt after deploying
  a new build.
- Confirm `/play`, `/engine`, and `/rnn` continue to load online.
