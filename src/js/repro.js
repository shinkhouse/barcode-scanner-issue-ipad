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

// How the detection square is positioned.
//
// 'app' mirrors the real app: centred horizontally, and centred in the space *below* the
// header bar. That reads as centred on screen but sits half a header-height low, and the
// defect reflects the window about the preview centre, so the dead band is twice that
// offset — a 33px offset became a 67px dead band on the affected device.
//
// 'low' just exaggerates the same effect for a more obvious demo. A square centred on
// both axes maps onto itself and hides the bug entirely.
let framePos = 'app';

// Whether to send `detectionArea` at all. With it off the whole preview decodes, which
// separates "this camera cannot decode" from "the decode window is in the wrong place".
let useArea = true;

const log = (text) => {
  out.textContent = text;
};

function layout() {
  const h = window.innerHeight;
  const headerH = document.getElementById('ui').getBoundingClientRect().height;
  // 'app': centred in the space below the header — visually centred, half a header low.
  const centreY = framePos === 'app' ? headerH / 2 + h / 2 : 0.7 * h;

  frameEl.style.top = `${centreY}px`;
  // Where the window actually lands if it is mirrored about the preview centre.
  mirrorEl.style.top = `${h - centreY}px`;
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
      `area      ${useArea ? `on (${framePos})` : 'OFF (whole preview decodes)'}\n` +
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
  framePos = framePos === 'app' ? 'low' : 'app';
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
