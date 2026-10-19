// sense.js: reads the camera, turns readings into signals, applies table.js,
// and writes window.sense.
//
// The instrument is the one from the Make a Face lab: MediaPipe Face Landmarker,
// 478 points and the same 52 named scores (press B to see them live). It is
// pinned to one version so it cannot change under you mid-module.
//
// What stays in the browser: every frame is read and dropped. Nothing here saves
// a frame or a landmark list. The model downloads once when Start is clicked;
// after that the Network panel should stay quiet.

// The library loads when you click Start, not before, so a blocked network shows
// up as a message on screen instead of a button that does nothing.
const LIBRARY = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/vision_bundle.mjs';
const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const video = document.querySelector('#camera');
const button = document.querySelector('#start');
const readout = document.querySelector('#readout');
const scores = document.querySelector('#scores');
const mesh = document.querySelector('#mesh');
const meshCtx = mesh.getContext('2d');

let landmarker = null;
let lastVideoTime = -1;
let latestScores = []; // the 52 named scores from the last frame, for the B panel only
let failed = false;    // the camera did not start; the readout holds the reason
const raw = { width: 0, flat: 0, moved: 0 }; // near's and still's raw readings, for the D panel only

// ---- near (KL) ---------------------------------------------------------------
// How close the nearest person is: 0 at the back of the space, 1 at arm's length
// from the screen.
//
// The reading is how wide a face looks in the picture. A face looks wider the
// closer it is, so the widest face in view belongs to the nearest person. Width
// runs cheek to cheek, points 234 and 454, and counts depth (z) as well as x and
// y, so turning your head to the side doesn't read as stepping back.
//
// The two widths below set the scale. Read them off the D panel ("width"):
// stand at the back of the space for the first, at arm's length for the second.
const WIDTH_AT_BACK = 0.06; // face width, as a fraction of the frame, at the back of the space
const WIDTH_AT_ARM = 0.17;  // face width at arm's length from the screen

// One quick move can make a person vanish from the readings for a few frames
// (Disappearing Act). near keeps its last reading this long instead of dropping
// to 0 in the middle of the move.
const NEAR_KEEP_MS = 1000;

function faceWidth(face, withDepth) {
  const a = face[234], b = face[454];
  // y runs 0 to 1 down the frame's height, so scale it to match x across the width
  const aspect = (video.videoHeight || 480) / (video.videoWidth || 640);
  const dz = withDepth ? b.z - a.z : 0; // z uses roughly the same scale as x
  return Math.hypot(b.x - a.x, (b.y - a.y) * aspect, dz);
}

// Distance goes as 1 / width. Measured in arm's lengths it is 1 at arm's length
// and WIDTH_AT_ARM / WIDTH_AT_BACK at the back; near runs 0 to 1 across that walk,
// so near 0.6 means 60% of the way from the back to arm's length.
function nearFromWidth(width) {
  const back = WIDTH_AT_ARM / WIDTH_AT_BACK;
  const distance = WIDTH_AT_ARM / width;
  return clamp((back - distance) / (back - 1));
}

// The nearest person is the widest face in view. still follows the same face.
function nearestFace(result) {
  let nearest = null, widest = 0;
  for (const face of result.faceLandmarks) {
    const width = faceWidth(face, true);
    if (width > widest) {
      nearest = face;
      widest = width;
    }
  }
  return nearest;
}

// ---- still (WC) --------------------------------------------------------------
// How little the person has moved over the last second: 0 while walking or
// gesturing, 1 when holding completely still. Written at Kenzo's request so the
// piece answers the camera alone; Will's to tune or rework.
//
// The reading follows five points that move with the head but not with the face:
// forehead (10), between the eyes (168), nose tip (1) and both cheeks (234, 454).
// Talking, blinking and smiling barely move them, so someone reciting digits can
// still read as still (field guide no. 08: only the mouth moves). Every tenth of a
// second it measures how far they moved, in face widths, so the same nod counts
// the same near the screen or across the room. still adds up the last second.
const STILL_POINTS = [10, 168, 1, 234, 454];
const STILL_STEP_MS = 100;   // how often a step is measured
const STILL_JITTER = 0.015;  // face widths a still face seems to move in one step; ignored
const STILL_FULL_MOVE = 0.5; // face widths moved in one second that reads as 0

// ---- Signals --------------------------------------------------------------
// Each function gets one frame's result and returns a number from 0 to 1.
// Its name has to match a name in table.js signals.

const SIGNALS = {
  // present (TS): the starter's worked signal, 1 when a face is in view, 0 when
  // not. Smoothed below, so one missed frame does not count as somebody leaving.
  present: result => (result.faceLandmarks.length > 0 ? 1 : 0),

  // near (KL): see above.
  near: (() => {
    let last = 0;
    let seenAt = -Infinity;
    return result => {
      const now = performance.now();
      const face = nearestFace(result);
      if (!face) {
        raw.width = raw.flat = 0;
        return now - seenAt < NEAR_KEEP_MS ? last : 0;
      }
      raw.width = faceWidth(face, true);
      raw.flat = faceWidth(face, false);
      last = nearFromWidth(raw.width);
      seenAt = now;
      return last;
    };
  })(),

  // still (WC): see above.
  still: (() => {
    let before = null; // the five points at the last step, x and y only
    let beforeAt = -Infinity;
    const steps = [];  // { at, moved } for the last second
    return result => {
      const now = performance.now();
      const face = nearestFace(result);
      // A face that vanishes mid-move (Disappearing Act) reads as moving. The
      // last points stay, so the jump when it comes back counts too.
      if (!face) return 0;
      if (now - beforeAt >= STILL_STEP_MS) {
        const points = STILL_POINTS.map(i => ({ x: face[i].x, y: face[i].y }));
        if (before) {
          const aspect = (video.videoHeight || 480) / (video.videoWidth || 640);
          let moved = 0;
          points.forEach((p, k) => { moved += Math.hypot(p.x - before[k].x, (p.y - before[k].y) * aspect); });
          moved /= points.length * faceWidth(face, true);
          steps.push({ at: now, moved: Math.max(0, moved - STILL_JITTER) });
        }
        before = points;
        beforeAt = now;
      }
      while (steps.length && now - steps[0].at > 1000) steps.shift();
      raw.moved = steps.reduce((sum, step) => sum + step.moved, 0);
      return clamp(1 - raw.moved / STILL_FULL_MOVE);
    };
  })(),
};

// One of the 52 scores by name, or 0 when no face is in view.
function score(result, name) {
  const face = result.faceBlendshapes[0];
  if (!face) return 0;
  const found = face.categories.find(c => c.categoryName === name);
  return found ? found.score : 0;
}

function clamp(x) {
  return Math.min(1, Math.max(0, x));
}

// Smoothing: each new reading moves the signal a fraction of the way. Higher is
// jumpier, lower is calmer. Thresholds in table.js read the smoothed numbers.
const SMOOTHING = 0.25;

// ---- The State Table, applied ----------------------------------------------

const signals = window.sense.signals; // the object fake-sense.js made, kept
let candidate = null;
let candidateSince = 0;

function applyTable(now) {
  const rows = window.TABLE.states;
  const winner = rows.find(row => row.when(signals));
  if (!winner || winner.name === window.sense.state) {
    candidate = null;
    return;
  }
  if (winner.name !== candidate) {
    candidate = winner.name;
    candidateSince = now;
  }
  if (now - candidateSince >= winner.hold * 1000) {
    window.sense.state = winner.name;
    window.sense.since = now;
    candidate = null;
  }
}

// ---- The loop ---------------------------------------------------------------

function tick() {
  const now = performance.now();
  if (video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const result = landmarker.detectForVideo(video, now);
    for (const name of window.TABLE.signals) {
      const read = SIGNALS[name];
      if (!read) continue;
      signals[name] += (clamp(read(result)) - signals[name]) * SMOOTHING;
    }
    latestScores = result.faceBlendshapes[0] ? result.faceBlendshapes[0].categories : [];
    if (!mesh.hidden) drawMesh(result);
  }
  applyTable(now);
  requestAnimationFrame(tick);
}

async function start() {
  button.disabled = true;
  button.textContent = 'Loading the model…';
  let FaceLandmarker, FilesetResolver;
  try {
    ({ FaceLandmarker, FilesetResolver } = await import(LIBRARY));
  } catch (err) {
    console.error(err);
    showFailure('The face library did not load (cdn.jsdelivr.net is blocked or offline). ' +
      'Press D: the fake sensor still works, so keep building the piece.');
    return;
  }
  try {
    const vision = await FilesetResolver.forVisionTasks(WASM);
    const options = {
      baseOptions: { modelAssetPath: MODEL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numFaces: 3, // near is about the nearest person, so look past the first face
      outputFaceBlendshapes: true,
    };
    try {
      landmarker = await FaceLandmarker.createFromOptions(vision, options);
    } catch {
      options.baseOptions.delegate = 'CPU'; // some machines refuse the GPU path
      landmarker = await FaceLandmarker.createFromOptions(vision, options);
    }
    button.textContent = 'Asking for the camera…';
    video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
    await video.play();
    for (const name of window.TABLE.signals) {
      if (!SIGNALS[name]) console.warn(`table.js names a signal "${name}" that sense.js does not read yet. The mouse keeps driving it.`);
    }
    window.senseReads = new Set(window.TABLE.signals.filter(name => SIGNALS[name]));
    window.senseLive = true;
    failed = false;
    button.remove();
    requestAnimationFrame(tick);
  } catch (err) {
    console.error(err);
    showFailure(`Camera did not start: ${err.message}`);
  }
}

function showFailure(message) {
  button.disabled = false;
  button.textContent = 'Did not start. Try again';
  failed = true;
  readout.hidden = false;
  readout.textContent = message;
}

button.addEventListener('click', start);

// ---- Readouts ---------------------------------------------------------------
// D shows the object piece.js reads. B shows all 52 scores, to find the name of
// the one you measured in the lab. V shows the camera. F shows the face mesh on
// black, for break-log screenshots. All off by default.

addEventListener('keydown', e => {
  const key = e.key.toLowerCase();
  if (key === 'd') {
    if (failed) { failed = false; readout.hidden = false; return; } // swap the message for the fake readout
    readout.hidden = !readout.hidden;
  }
  if (key === 'b') scores.hidden = !scores.hidden;
  if (key === 'v') video.classList.toggle('shown');
  if (key === 'f') mesh.hidden = !mesh.hidden;
});

// The 478 points on black, the way screenshots and the break log show a face:
// the camera image never appears. Drawn from the current frame and kept nowhere.
// near's two points, 234 and 454, are joined in amber.
function drawMesh(result) {
  const w = innerWidth * devicePixelRatio, h = innerHeight * devicePixelRatio;
  if (mesh.width !== w || mesh.height !== h) { mesh.width = w; mesh.height = h; }
  meshCtx.fillStyle = '#000';
  meshCtx.fillRect(0, 0, w, h);
  // fit the camera frame to the screen, mirrored like the V view
  const vw = video.videoWidth || 640, vh = video.videoHeight || 480;
  const scale = Math.min(w / vw, h / vh);
  const left = (w - vw * scale) / 2, top = (h - vh * scale) / 2;
  const sx = p => left + (1 - p.x) * vw * scale;
  const sy = p => top + p.y * vh * scale;
  const dot = 1.5 * devicePixelRatio;
  for (const face of result.faceLandmarks) {
    meshCtx.fillStyle = '#f2efe9';
    for (const p of face) meshCtx.fillRect(sx(p) - dot / 2, sy(p) - dot / 2, dot, dot);
    const a = face[234], b = face[454];
    meshCtx.strokeStyle = meshCtx.fillStyle = '#f5a623';
    meshCtx.lineWidth = 2 * devicePixelRatio;
    meshCtx.beginPath();
    meshCtx.moveTo(sx(a), sy(a));
    meshCtx.lineTo(sx(b), sy(b));
    meshCtx.stroke();
    for (const p of [a, b]) {
      meshCtx.beginPath();
      meshCtx.arc(sx(p), sy(p), 4 * devicePixelRatio, 0, Math.PI * 2);
      meshCtx.fill();
    }
  }
}

function drawReadouts() {
  if (!readout.hidden && !failed) {
    const { state, signals: s, since } = window.sense;
    const held = ((performance.now() - since) / 1000).toFixed(1);
    const onMouse = name => window.senseLive && !(window.senseReads && window.senseReads.has(name));
    const lines = Object.entries(s).map(([k, v]) => `${k.padEnd(8)} ${v.toFixed(2)}${onMouse(k) ? '  (mouse)' : ''}`);
    // the raw readings: set WIDTH_AT_BACK and WIDTH_AT_ARM from width, and
    // STILL_FULL_MOVE from moved
    const rawLines =
      `width    ${raw.width.toFixed(3)}  (flat ${raw.flat.toFixed(3)})\n` +
      `moved    ${raw.moved.toFixed(2)} face widths in the last second`;
    const onMouseXY = window.TABLE.signals.slice(0, 2).join(' and ');
    const keys = window.TABLE.states.map((row, i) => `${i + 1} ${row.name}`).join('  ');
    const header = window.senseLive ? 'camera on' : `fake sensor (mouse x and y: ${onMouseXY})\nkeys     ${keys}`;
    readout.textContent =
      `${header}\nstate    ${state}  (${held} s)\n` + lines.join('\n') + '\n' + rawLines;
  }
  if (!scores.hidden) {
    scores.textContent = latestScores.length
      ? latestScores.map(c => `${c.categoryName.padEnd(20)} ${c.score.toFixed(2)}`).join('\n')
      : 'no face in view (start the camera first)';
  }
  requestAnimationFrame(drawReadouts);
}
requestAnimationFrame(drawReadouts);
