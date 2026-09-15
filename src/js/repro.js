import {
  BarcodeFormat,
  BarcodeScanner,
  PreviewPlacement,
} from '@capawesome-team/capacitor-barcode-scanner';

const out = document.getElementById('out');
const frameEl = document.getElementById('frame');

let listener = null;
let scanning = false;
let hits = 0;

const log = (text) => {
  out.textContent = text;
};

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
    detectionArea,
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

document.getElementById('start').addEventListener('click', () => void start());
document.getElementById('stop').addEventListener('click', () => void stop());

// Rotating changes the layout, and detectionArea can only be set by startScan, so the
// session has to be restarted on the settled layout.
let settle = null;
window.addEventListener('resize', () => {
  if (!scanning) return;
  clearTimeout(settle);
  settle = setTimeout(async () => {
    await stop();
    await start();
  }, 350);
});

report();
