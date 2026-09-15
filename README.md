# `detectionArea` is enforced point-mirrored in landscape (iOS)

Minimal reproduction for `@capawesome-team/capacitor-barcode-scanner@0.1.4` on iOS.

Built from the [`.capacitor-app`](https://github.com/capawesome-team/.capacitor-app) template.
Capacitor 8.5.2, plugin 0.1.4, Xcode 27 / iOS 26–27.

## Symptom

With `PreviewPlacement.Behind` and a `detectionArea`, codes inside the drawn detection
square are **not** detected while the device is in landscape. Portrait is correct in every
position. Rotating 180° (landscapeLeft ↔ landscapeRight) does not move the dead zone.

## Cause

`applyDetectionArea()` derives `rectOfInterest` with
`previewLayer.metadataOutputRectConverted(fromLayerRect:)`, which maps the rect through the
**preview** connection's orientation. But `rectOfInterest` is enforced in the **metadata
output** connection's orientation, and the two can sit 180° apart — the metadata
connection's orientation is read-only (`isVideoOrientationSupported == false`), so it
cannot be aligned.

When they disagree the decode window is **point-mirrored about the preview layer's
centre**. Measured on an iPad in landscape, preview `1108 × 759`:

| sent `detectionArea` | `rectOfInterest` maps back to | preview/metadata orientation |
| --- | --- | --- |
| `y = 263, h = 300` | `y = 263` ✅ | 3 / 3 |
| `y = 263, h = 300` | `y = 196` ❌ | 3 / 4 |
| `y = 473, h = 300` | `y = 473` ✅ | 4 / 4 |
| `y = 247, h = 300` | `y = 247` ✅ | 4 / 4 |

`759 − (263 + 300) = 196`: the failing rect is exactly the requested one reflected about
the layer centre. Correct in every sample where the two orientations agree.

Because the decode window is a **hardware** filter, rejected codes never reach
`metadataOutput(_:didOutput:from:)`, so the plugin's own — and correct —
`containsCornerPoints` check in `handleEmbeddedDetectedBarcodes` never gets to run.

The size of the dead band is **twice the square's offset from the preview centre**, because
the window is reflected rather than translated. In the affected app the square is centred
horizontally (`dx = 0` in every orientation) and sits 33px low — it is centred in the space
below a header bar — which yields the 67px dead band above:

| orientation | preview | square centre | preview centre | offset | dead band |
| --- | --- | --- | --- | --- | --- |
| landscape | 1108 × 759 | (554, 413) | (554, 380) | +33.5 | 67px |
| landscape | 1108 × 737 | (554, 397) | (554, 368) | +28.5 | 57px |
| portrait | 820 × 1180 | (410, 623) | (410, 590) | +33.0 | 66px |

> A square centred on **both** axes hides the defect completely — mirroring maps it onto
> itself. This repro defaults to the real app's geometry (centred below the header), which
> looks centred but still reproduces. **Centre / low** exaggerates it for a clearer demo.

## Running it

```bash
npm install      # requires @capawesome-team registry auth
npm run build
npx cap sync ios
npx cap open ios
```

Run on a **physical device** — the iOS Simulator has no `AVCaptureDevice`, so the scanner
cannot start there. Tap **Start scan**, then point it at any QR code.

Starts on the **front** camera, which is where the issue was originally seen (`lensFacing`
defaults to `LensFacing.Back`, so it has to be set explicitly). **Flip camera** switches
lenses — worth trying both, since the front preview is horizontally mirrored and the back
one is not.

- **Solid green square** — the `detectionArea` sent to `startScan`.
- **Dashed red square** — where the decode window actually lands when mirrored.

In landscape, codes inside the green square go undetected while codes inside the red one
scan. In portrait, green works as expected.

## Suggested fix

For the embedded (non-fullscreen) path the hardware gate isn't needed:
`handleEmbeddedDetectedBarcodes` already rejects out-of-area codes with
`containsCornerPoints`, and those points come from
`previewLayer.transformedMetadataObject`, which is orientation-correct by construction.
Leaving `rectOfInterest` at `{0, 0, 1, 1}` there restores correct behaviour in all
orientations:

```swift
if fullscreenOptions == nil {
    metadataOutput.rectOfInterest = CGRect(x: 0, y: 0, width: 1, height: 1)
} else {
    metadataOutput.rectOfInterest = previewLayer.metadataOutputRectConverted(fromLayerRect: layerRect)
}
```

That check also runs *before* the `lastEmittedAtMap` bookkeeping, so codes it drops do not
consume a `duplicateTimeout` slot. Verified on device: the dead zone disappears and
out-of-area codes are still ignored.
