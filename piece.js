// piece.js: reads window.sense inside its own frame loop and answers.
//
// Our piece, from the State Table: a full-screen field of drifting grain and one
// low tone. It never shows a word, so every state reaches the visitor as grain
// and sound alone. It reads the object and never the camera.
//
// Each row of the table has an owner, and so does its part of this file:
//   Recursive, Breached      KL
//   Performative, Planted    WC   (first drafts from the table's wording, Will's to rework)
//   nobody                   TS   (first draft from the table's wording, Tate's to rework)

const canvas = document.querySelector('#piece');
const ctx = canvas.getContext('2d');
let W = innerWidth;
let H = innerHeight;

function resize() {
  W = innerWidth;
  H = innerHeight;
  canvas.width = W * devicePixelRatio;
  canvas.height = H * devicePixelRatio;
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0); // draw in CSS pixels
}
addEventListener('resize', resize);
resize();

// Someone who has asked their computer for less motion gets a softer flash and burst.
const gentle = matchMedia('(prefers-reduced-motion: reduce)').matches;

const clamp01 = x => Math.min(1, Math.max(0, x));

// ---- The grain --------------------------------------------------------------
// 6561 grains, 81 by 81: one for every point of Recursive's grid. Each grain has
// a position, a velocity and three random numbers of its own (a, b, c), so the
// field never moves as one block.

const GRID = 81;
const COUNT = GRID * GRID;
const px = new Float32Array(COUNT), py = new Float32Array(COUNT);
const vx = new Float32Array(COUNT), vy = new Float32Array(COUNT);
const ga = new Float32Array(COUNT), gb = new Float32Array(COUNT), gc = new Float32Array(COUNT);
const size = new Float32Array(COUNT);
for (let i = 0; i < COUNT; i++) {
  ga[i] = Math.random();
  gb[i] = Math.random();
  gc[i] = Math.random();
  size[i] = 1 + 1.3 * gc[i] * gc[i]; // mostly fine grain, a few coarse
}

function scatter() {
  for (let i = 0; i < COUNT; i++) {
    px[i] = Math.random() * W;
    py[i] = Math.random() * H;
    vx[i] = vy[i] = 0;
  }
}
scatter();

// ---- What each state asks of the field ---------------------------------------
// The grain moves four ways, blended by weight: drift (the resting field), swirl
// (Performative), floor (Planted) and pattern (Recursive). light is how bright
// the grain is and tone how loud the low tone is, both 0 to 1.

const MODES = {
  nobody:    { drift: 1,   light: 0,    tone: 0 },
  awake:     { drift: 1,   light: 0.55, tone: 0.45 }, // somebody is there and no row has fired yet
  Performative: { swirl: 1, light: 0.8, tone: 0.3 },
  Planted:   { floor: 1,   light: 0.85, tone: 0.75 },
  Recursive: { pattern: 1, light: 1,    tone: 0.04 },
  Breached:  { drift: 1,   light: 0.9,  tone: 0.3 },
};
const WAYS = ['drift', 'swirl', 'floor', 'pattern'];
const weight = { drift: 1, swirl: 0, floor: 0, pattern: 0 };
let light = 0;

// A state with no entry above (a new row in table.js) still shows: its grain
// gets a bright colour of its own, picked from its name.
function hueFor(state) {
  let hash = 0;
  for (const ch of state) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return hash;
}

// ---- Recursive (KL) -----------------------------------------------------------
// Field guide no. 08: a repeating task quiets the face. The grain slows and lines
// up on an 81 by 81 grid, then sharpens into a pattern made by repeating one
// rule: split a square 3 by 3 and empty the middle, then do the same to every
// square that's left. Grain in an emptied square steps out over its nearest edge,
// so the edges of each hole brighten. Every second the visitor holds still adds
// most of a level, so the pattern gets finer the longer they stay (81 is 3^4, so
// level 4 is as fine as the grid goes), and the tone fades to near silence.
// Movement takes levels back off ("any movement loosens what they built").

const STILL_ENOUGH = 0.75;     // the table's "still above 0.75": change both together
const LEVELS_PER_SECOND = 0.6;
const LOOSEN_PER_SECOND = 1.5; // levels lost per second of full movement
const MAX_LEVEL = 4;
let built = 0;                 // levels the current visitor has built, 0 to MAX_LEVEL

const home = new Uint16Array(COUNT); // grain i's grid point, row * GRID + column
const anchors = []; // anchors[level]: where each grain sits, x then y, 0 to 1 across the screen

// Hand out grid points by where the grain already is: sort it into 81 rows by y,
// then each row by x, so every grain lines up close to where it was.
function lineUp() {
  const byY = Array.from({ length: COUNT }, (_, i) => i).sort((a, b) => py[a] - py[b]);
  for (let row = 0; row < GRID; row++) {
    const inRow = byY.slice(row * GRID, (row + 1) * GRID).sort((a, b) => px[a] - px[b]);
    inRow.forEach((i, column) => { home[i] = row * GRID + column; });
  }
  anchors.length = 0;
}

// Where grain i sits, in grid points, once the rule has run `level` times.
function place(i, level) {
  let x = home[i] % GRID, y = Math.floor(home[i] / GRID);
  for (let l = 1; l <= level; l++) {
    const m = GRID / 3 ** l;                      // side of the middle square emptied at this level
    const a = Math.floor(x / (3 * m)) * 3 * m + m; // its first column
    const b = Math.floor(y / (3 * m)) * 3 * m + m; // its first row
    if (x < a || x >= a + m || y < b || y >= b + m) continue; // not in a middle square
    const left = x - a, right = a + m - 1 - x, up = y - b, down = b + m - 1 - y;
    const nearest = Math.min(left, right, up, down);
    // step out over the nearest edge, as far out as it was in
    if (nearest === left) x = a - 1 - left;
    else if (nearest === right) x = a + m + right;
    else if (nearest === up) y = b - 1 - up;
    else y = b + m + down;
  }
  return [x, y];
}

function anchorsAt(level) {
  if (anchors[level]) return anchors[level];
  const at = new Float32Array(COUNT * 2);
  for (let i = 0; i < COUNT; i++) {
    const [x, y] = place(i, level);
    at[2 * i] = (x + 0.5) / GRID;
    at[2 * i + 1] = (y + 0.5) / GRID;
  }
  return (anchors[level] = at);
}

// ---- Breached (KL) --------------------------------------------------------------
// Field guide no. 04: the first reaction escapes before control arrives, lasts a
// moment, and then control returns. On the way into Breached the grain bursts out
// from the centre in one white flash with a short, sharp chord, coasts to a stop
// and drifts again. The flash hides the grain jumping to the centre.

const COAST = 2.4;     // how hard the burst brakes, per second
const COAST_MS = 1200; // how long the burst owns the grain
let burstAt = -Infinity;
let flashAt = -Infinity;
let flash = 0;

function breach(now) {
  burstAt = now;
  for (const way of WAYS) weight[way] = way === 'drift' ? 1 : 0; // the burst breaks whatever was there
  for (let i = 0; i < COUNT; i++) {
    const angle = Math.random() * Math.PI * 2;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    px[i] = W / 2 + cos * Math.random() * 10;
    py[i] = H / 2 + sin * Math.random() * 10;
    // how far it is to the edge of the screen this way; a grain braking at COAST
    // travels speed / COAST, so this spreads the burst all the way out and no further
    const edge = Math.min(Math.abs(W / 2 / cos), Math.abs(H / 2 / sin));
    const speed = edge * (0.08 + 0.92 * Math.pow(gc[i], 0.7)) * COAST * (gentle ? 0.5 : 1);
    vx[i] = cos * speed;
    vy[i] = sin * speed;
  }
  // a second burst inside 1.5 s keeps its grain but skips the flash
  if (now - flashAt > 1500) {
    flash = gentle ? 0.35 : 1;
    flashAt = now;
  }
  chord();
}

// ---- Performative (WC, first draft) -------------------------------------------
// Field guide no. 13: the self presented outward to a room. The grain swirls out
// to the edges, faster the more the visitor moves, and a crowd murmur swells with
// each movement (see swirl in move() and the murmur in sound()).

// ---- Planted (WC, first draft) --------------------------------------------------
// Field guide no. 14: a firm, fixed presence. The grain sinks into a level floor
// along the bottom and the tone stops wavering to hold one low note (see floor in
// move() and waver in sound()).

// ---- nobody (TS, first draft) ---------------------------------------------------
// No one there: the screen fades to black and the tone stops (MODES.nobody), and
// once it's dark the piece erases the pattern the last visitor built, so no
// trace of one visitor is left for the next.

let erased = true;

function forget() {
  built = 0;
  scatter();
  erased = true;
}

// ---- Moving the grain -------------------------------------------------------

const DRIFT_SPEED = 14; // pixels a second, at rest
// How fast grain answers each way, per second. The swirl needs to be quick: grain
// that lags a turning current slides outward, like a car taking a corner too fast.
const OBEY = { drift: 1.2, swirl: 6, floor: 2.5, pattern: 2 };
const PATTERN_PULL = 1.4; // per second: how hard the pattern draws grain to its square
const PATTERN_TOP_SPEED = 260;

function move(dt, t, now, movement) {
  let total = 0;
  for (const way of WAYS) total += weight[way];
  const w = {};
  let rate = 0;
  for (const way of WAYS) {
    w[way] = weight[way] / total;
    rate += w[way] * OBEY[way];
  }
  const coasting = now - burstAt < COAST_MS;
  const obey = 1 - Math.exp(-(coasting ? COAST : rate) * dt);
  // Drifting grain that leaves one edge comes back on the other. Grain that is
  // headed for a spot or a ring of its own doesn't: wrapped, it would have to
  // cross the whole screen to get back.
  const wrap = w.pattern + w.floor + w.swirl < 0.01;
  const driftSpeed = DRIFT_SPEED * (1 + 2 * movement);
  const spinUp = 0.4 + 2 * movement; // Performative swirls faster as the visitor moves
  const floorDepth = Math.max(16, H * 0.05);

  let lo = null, hi = null, f = 0;
  if (w.pattern > 0.001) {
    const level = Math.min(built, MAX_LEVEL);
    const whole = Math.floor(level);
    lo = anchorsAt(whole);
    hi = anchorsAt(Math.min(MAX_LEVEL, whole + 1));
    f = level - whole;
    f = f * f * (3 - 2 * f); // ease between levels
  }

  for (let i = 0; i < COUNT; i++) {
    const x = px[i], y = py[i];
    let tx = 0, ty = 0; // the velocity this grain wants

    if (w.drift > 0.001) {
      // a slow current that changes across the screen and over time
      const dx = Math.sin(y * 0.004 + t * 0.21 + ga[i] * 6.283) + 0.6 * Math.sin(x * 0.0021 - t * 0.13 + gb[i] * 6.283);
      const dy = Math.cos(x * 0.0037 - t * 0.17 + gb[i] * 6.283) + 0.6 * Math.cos(y * 0.0029 + t * 0.11 + ga[i] * 6.283);
      tx += w.drift * dx * driftSpeed;
      ty += w.drift * dy * driftSpeed;
    }

    if (w.swirl > 0.001) {
      // Performative (WC): around the centre and out to a ring near the edges,
      // in screen units that run -1 to 1 so the ring follows the screen's shape
      const nx = (x - W / 2) / (W / 2), ny = (y - H / 2) / (H / 2);
      const r = Math.hypot(nx, ny) + 1e-6;
      const out = (0.72 + 0.18 * gb[i] - r) * 3; // toward this grain's own ring
      const spin = (0.15 + 0.35 * ga[i]) * spinUp; // radians a second
      tx += w.swirl * (out * nx / r - spin * ny) * (W / 2);
      ty += w.swirl * (out * ny / r + spin * nx) * (H / 2);
    }

    if (w.floor > 0.001) {
      // Planted (WC): fall to this grain's own depth in a flat layer at the bottom
      const rest = H - 2 - gb[i] * floorDepth;
      const fall = Math.min(600, Math.max(-200, (rest - y) * 1.8)) * (0.4 + 0.6 * ga[i]);
      ty += w.floor * fall;
      tx += w.floor * (Math.min(W - 2, Math.max(2, x)) - x) * 2; // back on screen if the swirl threw it off
    }

    if (lo) {
      const ax = (lo[2 * i] + (hi[2 * i] - lo[2 * i]) * f) * W;
      const ay = (lo[2 * i + 1] + (hi[2 * i + 1] - lo[2 * i + 1]) * f) * H;
      let sx = (ax - x) * PATTERN_PULL, sy = (ay - y) * PATTERN_PULL;
      const speed = Math.hypot(sx, sy);
      if (speed > PATTERN_TOP_SPEED) {
        sx *= PATTERN_TOP_SPEED / speed;
        sy *= PATTERN_TOP_SPEED / speed;
      }
      tx += w.pattern * sx;
      ty += w.pattern * sy;
    }

    vx[i] += (tx - vx[i]) * obey;
    vy[i] += (ty - vy[i]) * obey;
    px[i] += vx[i] * dt;
    py[i] += vy[i] * dt;

    if (wrap) {
      if (px[i] < -4) px[i] += W + 8; else if (px[i] > W + 4) px[i] -= W + 8;
      if (py[i] < -4) py[i] += H + 8; else if (py[i] > H + 4) py[i] -= H + 8;
    }
  }
}

// ---- Drawing ----------------------------------------------------------------

const SHADES = [0.4, 0.65, 1]; // every third grain shares a shade

function draw(dt, t, state, near) {
  let total = 0;
  for (const way of WAYS) total += weight[way];
  // Performative's swirl leaves short trails: clear only part of the last frame
  ctx.fillStyle = `rgba(11, 11, 13, ${1 - 0.6 * weight.swirl / total})`;
  ctx.fillRect(0, 0, W, H);

  // near (KL), read straight: the closer the visitor, the brighter the grain
  const shown = light * (0.7 + 0.3 * near);
  if (shown > 0.004) {
    // Recursive sharpens as it builds: the shake dies away, and the grain takes
    // one size and one shade so a missing grid point shows
    const p = weight.pattern / total;
    const shake = p * (2.5 * (1 - built / MAX_LEVEL) + 0.2);
    const hue = MODES[state] ? null : hueFor(state);
    for (let shade = 0; shade < 3; shade++) {
      const alpha = (SHADES[shade] + (0.8 - SHADES[shade]) * p) * shown;
      ctx.fillStyle = hue === null ? `rgba(242, 239, 233, ${alpha})` : `hsla(${hue}, 85%, 65%, ${alpha})`;
      for (let i = shade; i < COUNT; i += 3) {
        const s = size[i] + (1.7 - size[i]) * p;
        let x = px[i], y = py[i];
        if (shake > 0.05) {
          x += Math.sin(t * 9 + ga[i] * 60) * shake;
          y += Math.cos(t * 8 + gb[i] * 60) * shake;
        }
        ctx.fillRect(x - s / 2, y - s / 2, s, s);
      }
    }
  }

  if (flash > 0.003) {
    ctx.fillStyle = `rgba(255, 255, 255, ${flash})`;
    ctx.fillRect(0, 0, W, H);
    flash *= Math.exp(-dt / 0.14);
  }
}

// ---- The tone ---------------------------------------------------------------
// One low tone, Performative's murmur and Breached's chord, all made here with
// Web Audio, so nothing downloads. A browser lets a page make sound only after a click or a key, so it
// starts on the first one; the Start button counts. M mutes.

let audio = null;
let muted = false;

function startAudio() {
  if (audio) {
    if (audio.ac.state === 'suspended') audio.ac.resume();
    return;
  }
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return;
  const ac = new Context();
  const out = ac.createGain();
  out.connect(ac.createDynamicsCompressor()).connect(ac.destination);

  // E2 on a triangle wave, a second triangle a little sharp so the tone wavers
  // slowly, and a sine an octave down for speakers that can play it. Laptop
  // speakers can't, so there the triangles' overtones carry the pitch.
  const tone = ac.createGain();
  tone.gain.value = 0;
  const soften = ac.createBiquadFilter();
  soften.type = 'lowpass';
  soften.frequency.value = 700;
  soften.connect(tone).connect(out);
  const voice = (type, frequency, level) => {
    const osc = new OscillatorNode(ac, { type, frequency });
    const gain = new GainNode(ac, { gain: level });
    osc.connect(gain).connect(soften);
    osc.start();
    return gain;
  };
  voice('triangle', 82.41, 0.5);
  const waver = voice('triangle', 83.0, 0.35);
  voice('sine', 41.2, 0.6);

  // Performative's crowd murmur (WC): noise through three filters in the range
  // of speaking voices, each level wandering on its own, like a room talking
  const noise = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const samples = noise.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  const hiss = new AudioBufferSourceNode(ac, { buffer: noise, loop: true });
  const murmur = new GainNode(ac, { gain: 0 });
  murmur.connect(out);
  const bands = [350, 800, 1500].map(frequency => {
    const level = new GainNode(ac, { gain: 0 });
    hiss.connect(new BiquadFilterNode(ac, { type: 'bandpass', frequency, Q: 2.5 })).connect(level).connect(murmur);
    return level;
  });
  hiss.start();

  audio = { ac, out, tone, waver, murmur, bands };
  ac.resume();
}

addEventListener('pointerdown', startAudio);
addEventListener('keydown', e => {
  startAudio();
  if (e.key.toLowerCase() === 'm') muted = !muted;
});

function sound(state, mode, movement, t) {
  if (!audio) return;
  const now = audio.ac.currentTime;
  audio.out.gain.setTargetAtTime(muted ? 0 : 0.8, now, 0.05);
  // Recursive fades slowly to near silence; everything else answers within a second
  audio.tone.gain.setTargetAtTime(mode.tone * 0.4, now, state === 'Recursive' ? 1.5 : 0.4);
  // Planted (WC): the tone stops wavering and holds one low note
  audio.waver.gain.setTargetAtTime(state === 'Planted' ? 0 : 0.35, now, 0.6);
  // Performative (WC): the murmur swells with movement while the grain swirls
  audio.murmur.gain.setTargetAtTime(weight.swirl * movement * 0.6, now, 0.15);
  audio.bands.forEach((band, k) => {
    const wander = 0.5 + 0.5 * Math.sin(t * (2.3 + 1.7 * k) + k) * Math.sin(t * (0.9 + 0.6 * k));
    band.gain.setTargetAtTime(wander, now, 0.08);
  });
}

// Breached's chord: A2, C3, E-flat 3 and F-sharp 3, a diminished chord on sawtooth
// waves, as sharp as it gets in the first 5 ms and gone in half a second.
function chord() {
  if (!audio || muted) return;
  const { ac, out } = audio;
  const now = ac.currentTime;
  const env = ac.createGain();
  env.gain.setValueAtTime(0.0001, now);
  env.gain.exponentialRampToValueAtTime(0.18, now + 0.005);
  env.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
  const edge = new BiquadFilterNode(ac, { type: 'lowpass', frequency: 3000 });
  env.connect(edge).connect(out);
  for (const frequency of [110, 130.81, 155.56, 185]) {
    const osc = new OscillatorNode(ac, { type: 'sawtooth', frequency });
    osc.connect(env);
    osc.start(now);
    osc.stop(now + 0.55);
  }
}

// ---- The loop ---------------------------------------------------------------

let last = performance.now();
let seenSince = null;

function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); // never backwards, never a big jump
  last = now;
  const t = now / 1000;
  const { state, signals, since } = window.sense;
  const near = signals.near ?? 0;
  const still = signals.still ?? 0;
  const present = signals.present ?? 1;
  const movement = clamp01(1 - still);

  if (since !== seenSince) { // the state just changed
    if (seenSince !== null && state === 'Breached') breach(now);
    if (state === 'Recursive') lineUp();
    seenSince = since;
  }

  // Someone who has arrived before any row fires gets the resting field, not the
  // black of nobody.
  let mode = MODES[state] || MODES.awake;
  if (state === 'nobody' && present > 0.5) mode = MODES.awake;

  // ease toward what the state asks for
  const ease = 1 - Math.exp(-dt / 0.5);
  for (const way of WAYS) weight[way] += ((mode[way] || 0) - weight[way]) * ease;
  weight.drift = Math.max(weight.drift, 0.001); // never divide by an all-zero blend
  light += (mode.light - light) * (1 - Math.exp(-dt / (mode.light < light ? 1.4 : 0.6)));

  // Recursive (KL): levels build while the visitor holds still; movement loosens them
  if (state === 'Recursive' && still > STILL_ENOUGH) built = Math.min(MAX_LEVEL, built + LEVELS_PER_SECOND * dt);
  built = Math.max(0, built - LOOSEN_PER_SECOND * clamp01((STILL_ENOUGH - still) / STILL_ENOUGH) * dt);

  // nobody (TS): once the screen is dark, forget the last visitor
  if (present > 0.5) erased = false;
  if (state === 'nobody' && present <= 0.5 && light < 0.01 && !erased) forget();

  move(dt, t, now, movement);
  draw(dt, t, state, near);
  sound(state, mode, movement, t);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
