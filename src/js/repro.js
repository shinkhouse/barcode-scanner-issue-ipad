import {
  BarcodeFormat,
  BarcodeScanner,
  LensFacing,
  PreviewPlacement,
} from '@capawesome-team/capacitor-barcode-scanner';

const out = document.getElementById('out');
const frameEl = document.getElementById('frame');
const mirrorEl = document.getElementById('mirror');

let listener = null;
let scanning = false;
let hits = 0;

// Defaults to the front camera: that is where the issue was originally observed, and the
// front preview is horizontally mirrored, which the back camera's is not.
let lens = LensFacing.Front;

// Where the detection square sits, as a fraction of viewport height.
//
// 0.7 (low) is the interesting case. The defect reflects the decode window about the
// preview's centre, so a square at 0.5 maps onto itself and the bug becomes invisible —
// "centred" is a repro that passes on a broken plugin. Toggle it to see exactly that.
let frameTop = 0.7;

// Whether to send `detectionArea` at all. With it off the whole preview decodes, which
// separates "this camera cannot decode" from "the decode window is in the wrong place".
let useArea = true;

const log = (text) => {
  out.textContent = text;
};

function layout() {
  frameEl.style.top = `${frameTop * 100}%`;
  // Where the window actually lands if it is mirrored about the preview centre.
  mirrorEl.style.top = `${(1 - frameTop) * 100}%`;
  mirrorEl.style.display = useArea ? '' : 'none';
  frameEl.style.borderStyle = useArea ? 'solid' : 'dotted';
}

/** Viewport in CSS px, and the green square rebased onto it (what the plugin expects). */
function measure() {
  const preview = { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
  const r = frameEl.getBoundingClientRect();
  const detectionArea = {
    x: Math.round(r.x - preview.x),
    y: Math.round(r.y - preview.y),
    width: Math.round(r.width),
    height: Math.round(r.height),
  };
  return { preview, detectionArea };
}

function report(extra = '') {
  const { preview, detectionArea } = measure();
  const mirroredY = preview.height - detectionArea.y - detectionArea.height;
  log(
    `camera    ${lens}${scanning ? '' : ' (stopped)'}\n` +
      `area      ${useArea ? `on, top ${Math.round(frameTop * 100)}%` : 'OFF (whole preview decodes)'}\n` +
      `preview   ${preview.width}x${preview.height}\n` +
      `sent      x=${detectionArea.x} y=${detectionArea.y} w=${detectionArea.width} h=${detectionArea.height}\n` +
      `mirrored  y would become ${mirroredY} (off by ${Math.abs(detectionArea.y - mirroredY)}px)\n` +
      `hits      ${hits}${extra ? `\n${extra}` : ''}`,
  );
}

async function start() {
  if (scanning) return;
  const { camera } = await BarcodeScanner.requestPermissions();
  if (camera !== 'granted' && camera !== 'limited') {
    log(`camera permission: ${camera}`);
    return;
  }

  const { preview, detectionArea } = measure();

  listener = await BarcodeScanner.addListener('barcodesScanned', ({ barcodes }) => {
    hits += barcodes.length;
    const b = barcodes[0];
    report(`last      ${String(b?.rawValue ?? '').slice(0, 40)}\ncorners   ${JSON.stringify(b?.cornerPoints)}`);
  });

  await BarcodeScanner.startScan({
    formats: [BarcodeFormat.QrCode],
    placement: PreviewPlacement.Behind,
    frame: preview,
    lensFacing: lens,
    ...(useArea ? { detectionArea } : {}),
  });

  scanning = true;
  report();
}

async function stop() {
  if (!scanning) return;
  await listener?.remove();
  listener = null;
  await BarcodeScanner.stopScan();
  scanning = false;
  log('stopped');
}

/** `detectionArea`, `lensFacing` and `frame` can only be set by `startScan`. */
async function restart() {
  layout();
  if (!scanning) {
    report();
    return;
  }
  await stop();
  await start();
}

document.getElementById('start').addEventListener('click', () => void start());
document.getElementById('stop').addEventListener('click', () => void stop());

document.getElementById('flip').addEventListener('click', () => {
  lens = lens === LensFacing.Front ? LensFacing.Back : LensFacing.Front;
  void restart();
});

document.getElementById('move').addEventListener('click', () => {
  frameTop = frameTop === 0.5 ? 0.7 : 0.5;
  void restart();
});

document.getElementById('area').addEventListener('click', () => {
  useArea = !useArea;
  void restart();
});

// Rotating changes the layout, and detectionArea can only be set by startScan, so the
// session has to be restarted on the settled layout.
let settle = null;
window.addEventListener('resize', () => {
  if (!scanning) return;
  clearTimeout(settle);
  settle = setTimeout(() => void restart(), 350);
});

layout();
report();
