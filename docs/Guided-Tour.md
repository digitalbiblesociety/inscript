# Guided tour & demo walkthrough

Two things come from one source:

- **In the app.** A step-by-step tour that drives the real UI. It opens the menu,
  jumps to a passage, types a search, and opens each panel type and closes it
  again, spotlighting whatever it is describing.
- **On disk.** `tools/demo-walkthrough.mjs` plays that same tour in a recorded
  browser and captures a video, an optional GIF, and one screenshot per step.

The steps live in `TOUR_STEPS` in
[`browserbible/js/menu/GuidedTour.js`](../browserbible/js/menu/GuidedTour.js).
A step drops out of both the tour and the video when its subject is missing, for
example a panel disabled by the site profile or a feature switched off in config.
The recording therefore cannot advertise something the app no longer does.

## Using the tour

| How | Where |
|-----|-------|
| Main menu, then **Guided Tour** | always available |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd>, then `> tour` | command palette |
| `?tour=1` | starts once the first passage has loaded |
| `?tour=0` | suppresses it, including autostart |

Press <kbd>→</kbd> and <kbd>←</kbd> to move between steps. <kbd>Esc</kbd> closes
whatever the app has open first, such as a menu, the version chooser, or the
command palette, and leaves the tour on the next press.

The tour does not block the app. Everything behind the card stays clickable, and
each step sets up its own screen, so clicking around mid-tour cannot strand it.

First-run autostart is **off** by default. Set `enableGuidedTourAutostart: true`
in [`config.js`](../browserbible/js/core/config.js) to open it automatically for
visitors who have not seen it. It shows once, then a `guided-tour` flag in
`localStorage` records that they have.

## Recording the walkthrough

```bash
pnpm demo                        # boot a server, record everything
pnpm demo -- --gif               # also write an animated GIF
pnpm demo -- --headed --fast     # watch it happen, with shorter pauses
pnpm demo -- --only search,searchresults,commentary
pnpm demo -- --url https://inscript.org/ --content none
```

Output lands in `demo-output/`, which is gitignored:

```
inscript-walkthrough.webm   the whole run
inscript-walkthrough.gif    same run as a GIF, with --gif
screens/01-welcome.png …    one shot per step
walkthrough.json            step ids, titles, body copy, timings
index.html                  contact sheet: video plus every shot with its caption
```

Options: `--url`, `--port`, `--site`, `--content`, `--viewport WxH`, `--out`,
`--only`, `--from`, `--fast`, `--slow`, `--dwell`, `--gif`, `--gif-only`,
`--gif-width`, `--gif-fps`, `--gif-colors`, `--gif-name`, `--no-video`,
`--no-cursor`, `--headed`. Run `node tools/demo-walkthrough.mjs --help` for the
full list.

A blue dot follows the pointer through the recording. A headless browser has no
cursor of its own for the video to capture, so the recorder draws one and moves
the real mouse to each spotlight. Pass `--no-cursor` to turn it off.

### GIF output

`--gif` needs `ffmpeg` on the PATH. It also runs `gifsicle -O3` when that is
installed, which is worth another 10% or so.

The conversion drops duplicate frames and keeps the original frame delays, so a
reading pause costs one frame rather than fifty. GIF size therefore tracks the
number of frames containing motion, not the running time: cursor movement, typing,
and panels loading are what cost, and trimming the pauses would save almost
nothing.

A full walkthrough at the defaults (1200px, 8fps) lands around 40 MB, which is
fine to hand someone but too large for a README, where GitHub caps images at
10 MB. For something embeddable, cut the size and frame rate:

```bash
pnpm demo -- --gif-only --gif-width 800 --gif-fps 5 --gif-colors 48 \
            --gif-name inscript-walkthrough-compact.gif     # about 13 MB
pnpm demo -- --gif --only welcome,navigator,navigate,searchresults,commentary
```

`--gif-only` re-encodes the video already sitting in `--out` instead of recording
again, so settings can be tried out in a minute rather than four.

### Which content to record against

`--content` picks the runtime preset (`?custom=`):

| `--content` | Texts | Notes |
|-------------|-------|-------|
| `demo` (default) | content CDN | Searches client-side. Best local result. |
| `local` | starter pack in `public/` | No network. Commentaries are CDN-only, so that panel comes up empty. |
| `none` | whatever the target serves | Use with `--url` against a deployed site. |

Two services are locked to the deployed origin, so they are unavailable from a
dev server or a recording run: the search API (`serverSearchPath`) and the audio
and API.Bible proxies. That is why the `demo` preset exists. It blanks
`serverSearchPath` so the Search panel uses the client-side path and returns real
results instead of a connection error. The Audio panel still records as
"no audio" locally.

**Record a publishable video against the deployed site**, using
`--url https://inscript.org/ --content none`. There the search, audio, and
API.Bible translations all work. Everything else is identical.

## Adding or changing a step

A step is an entry in `TOUR_STEPS` plus its copy in
`browserbible/public/js/resources/en.json` under `tour.steps.<id>`:

```js
{
  id: 'parallels',
  target: '.window.ParallelsWindow',   // selector or () => Element
  placement: 'left',                   // top | bottom | left | right | center | auto
  pad: 8,                              // spotlight padding, default 8
  available: () => !isDisabledWindow('ParallelsWindow'),
  async enter({ addWindow }) {          // set the screen up before the card shows
    await addWindow('ParallelsWindow');
  },
  async exit() {}                      // optional, runs on the way out either way
}
```

- `enter` receives helpers: `$`, `sleep`, `waitFor`, `click`, `typeInto`,
  `dragBy`, `addWindow`, `trackNewWindows`, `remember`, `recall`.
- Panels opened through `addWindow` or `trackNewWindows` close again when the
  step is left, so the tour does not end with a dozen panels open.
- Use `remember` and `recall` for anything else a step changes and should put
  back. The theme step uses them to restore the reader's theme.
- Set `focus: false` to keep focus where it is. The search step needs this,
  because moving focus would blur the input and drop the suggestions.
- Other languages fall back to English, so English copy is enough to ship a step.

Write copy as instructions. Say what the feature is and what the reader does with
it, in short sentences, and no em-dashes.

Missing copy shows up as the literal key (`tour.steps.parallels.title`), and
`e2e/guided-tour.spec.js` fails on it, along with any step whose target no longer
resolves. Run it after touching either the tour or the UI it points at:

```bash
pnpm exec playwright test --project=chromium-remote guided-tour
```

## Pacing

Steps wait on the app rather than on the clock. `waitForPanel()` watches for a
new panel's `.loading-indicator` to clear, so a commentary that loads quickly
moves on quickly, and the fixed delays that remain are short settle beats for
paint. That is both faster and steadier than guessing at a duration.

The card and spotlight travel between steps instead of cutting, using the tokens
in [Motion.md](Motion.md). Opening and closing the tour does cut, because the
centered card is a different width and gliding it would mean animating a resize
across the screen.

`--dwell`, `--fast`, and `--slow` on the recorder change only how long each card
is held for the camera. They do not affect the tour in the app.

## How the overlay stays on top

Every menu, chooser, and dialog in the app is a native popover, so anything drawn
with an ordinary `z-index` ends up underneath them. The spotlight and card
therefore live in one `popover="manual"` layer, because manual popovers neither
light-dismiss nor close the app's own `auto` popovers. The layer is re-shown after
each step's action to lift it back to the top of the top layer. The dimming is the
spotlight's own large `box-shadow` rather than a separate scrim, so there is no
hole geometry to keep in sync.
