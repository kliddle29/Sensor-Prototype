# Sensor Layer prototype

Kenzo Liddle (KL) · Will Chamberlain (WC) · Tate (TS). States from our field guide, *Gaze Lexicography*.

**Live:** add the GitHub Pages URL here once Pages is on.

A full-screen field of drifting grain and one low tone. It never shows a word, so every state reaches the visitor as grain and sound alone.

## What it does for the person, and to them

**For them:** *(one sentence, ours to write)*

**To them:** *(one sentence, ours to write)*

## Signals

| Signal | Owner | What it measures | Where |
|---|---|---|---|
| `near` | KL | How close the nearest person is: 0 at the back of the space, 1 at arm's length from the screen. Read from the widest face's cheek-to-cheek width (points 234 and 454, counting depth). | `sense.js`, `near` |
| `still` | WC | How little the person has moved over the last second: 0 walking or gesturing, 1 holding completely still. Read from five head points (forehead, between the eyes, nose tip, both cheeks) that talking and blinking don't move, in face widths per second. | `sense.js`, `still` (written at KL's request so the camera drives every signal; WC's to tune or rework) |
| `present` | TS | Whether anyone is in range at all: 0 empty, 1 a person clearly there. | `sense.js`, `present` (the starter's version for now) |

## The State Table

Checked top to bottom; the first true rule wins, after its hold. A reading between rules keeps the last state.

| State | Owner | Rule | Hold | The piece does |
|---|---|---|---|---|
| nobody | TS | `present` below 0.2 | 5 s | The screen fades to black, the tone stops, and the piece erases the pattern the last visitor built. |
| Performative (no. 13) | WC | `near` 0.2 to 0.6 and `still` below 0.4 | 1.5 s | The grain swirls out to the edges and a crowd murmur swells with each movement. |
| Planted (no. 14) | WC | `near` 0.2 to 0.6 and `still` above 0.75 | 3 s | The grain sinks into a level floor along the bottom and the tone holds one low note. |
| Recursive (no. 08) | KL | `near` above 0.6 and `still` above 0.75 | 4 s | The grain slows and sharpens into a fine pattern, finer each second they stay, while the tone fades to near silence. |
| Breached (no. 04) | KL | `near` above 0.6 and `still` below 0.3 | 0.5 s | The grain bursts out from the center in one white flash with a short, sharp chord. |

The numbers are the paper table's. Monday's first readings set the real ones; any threshold that moves goes in the break log.

## Run it

Run it from a local server; opening `index.html` from the Finder won't reach the camera. Live Server works, or `python3 -m http.server` and open `http://localhost:8000`. Click **Start the camera**. Sound starts on the first click or key.

| Key | Does |
|---|---|
| D | The object `piece.js` reads, live, plus the raw readings behind `near` (`width`) and `still` (`moved`) |
| B | All 52 named scores |
| V | The camera, small, in the corner |
| F | The face mesh on black (for screenshots; the camera image never shows) |
| M | Mute |
| 1 to 5 + mouse | Before the camera: keys set the state (1 nobody, 2 Performative, 3 Planted, 4 Recursive, 5 Breached), mouse x sets `near`, mouse y sets `still` |

After the camera starts, the camera drives all three signals. A signal with no reader in `sense.js` would stay on the mouse, marked "(mouse)" in the D panel.

### Setting the numbers from real readings

The constants at the top of `near` and `still` in `sense.js` are guesses until we read them off the D panel:

- `WIDTH_AT_BACK` and `WIDTH_AT_ARM`: stand at the back of the space and note `width`, then at arm's length and note it again.
- `STILL_FULL_MOVE` and `STILL_JITTER`: note `moved` while gesturing, which should reach `STILL_FULL_MOVE` so `still` reads 0, and while holding still, which should stay near 0. If holding still doesn't, raise `STILL_JITTER`.

## Files

| File | Job |
|---|---|
| `table.js` | The State Table above, in code |
| `sense.js` | Reads the camera (MediaPipe Face Landmarker 1.1.1), turns readings into signals, applies the table, writes `window.sense` |
| `piece.js` | Reads `window.sense` every frame and draws and sounds the piece. Each state's part is marked with its owner; Performative, Planted and nobody are first drafts for WC and TS to rework |
| `fake-sense.js` | Writes the same object with no camera; loads first |
| `index.html` | Loads them in order |

## What stays in the browser

Nothing saves a frame or a landmark list. The model downloads once when Start is clicked; after that the Network panel stays quiet. MediaPipe's library would also post usage statistics (counts and timings, not frames) to Google once a minute, so `sense.js` refuses that one address. All sound is made in the page. Screenshots in this repo show the piece, the D panel or the F mesh, never the camera image.

## Break log

Date, commit hash, what broke, what we changed.

| Date | Commit | What broke | What we changed |
|---|---|---|---|
