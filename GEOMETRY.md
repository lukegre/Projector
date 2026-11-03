# Projection geometry

This is an ideal pinhole model, not a measurement of any particular projector. It models the projector's native aspect ratio and the raw optical image, with no digital keystone correction. Actual lens distortion, mechanical tolerances, focus, lens shift behaviour, and manufacturer specifications may differ.

The screen lies in the plane z = 0. Looking towards it from the room, x increases rightwards and y increases upwards from the floor. The lens is at (offsetX, lensHeight, distance), where distance is the perpendicular distance to the screen plane, not the distance along the tilted optical axis. The screen is centred at x = 0, with its lower edge at screenBottom.

For aligned axes and no shift, the nominal image width is distance / throwRatio and its height is width × aspectHeight / aspectWidth. These nominal values are perpendicular, aligned sizes; the calculated edges and bounds describe the actual tilted footprint. Screen and image diagonals are provided in metres and inches.

Image coordinates u and v run from −0.5 to +0.5, with v positive upwards. Before rotation, their rays have direction

```
((u + shiftX/100) / throwRatio,
 (v + (shiftY + fixedOffsetY)/100) × (aspectHeight/aspectWidth) / throwRatio,
 -1)
```

Shifts are percentages of the full unrotated image width or height. Positive shift is right or up; fixedOffsetY adds to the adjustable vertical shift. Roll, pitch and yaw are rigid rotations of the ray and local basis, applied in that order: positive roll is clockwise as seen on screen, positive pitch aims up, and positive yaw aims right. Rays intersect the screen plane at positive distance along the ray. If any corner ray is parallel to or points away from the screen, the footprint is invalid rather than a misleading finite polygon.

Coverage is calculated by clipping the four-sided footprint to the rectangular screen. Screen coverage is intersection area divided by screen area; image coverage is intersection area divided by projected image area. Corners are ordered top left, top right, bottom right, bottom left in the unrotated image, which can change their apparent position after rotation.

Optional shift limits apply to adjustable shiftX and shiftY only. Independent limits check each configured axis separately. Elliptical limits are a generic coupled approximation, not a claim about verified manufacturer constraints; unconfigured axes do not contribute to the check. Room warnings compare the projected bounds with the floor, ceiling and room width, assuming the screen is centred in the room.

Run tests with `node --test geometry.test.mjs`.

## Automatic fit

`autoFit(state)` preserves the projector's physical position and adjusts throw ratio, lens shift and rotation. With matching aspect ratios and sufficient adjustment range, it uses the exact aligned solution. Otherwise, a deterministic bounded search minimises the squared x and y corner errors after normalising each by screen width and height. It reports the best fit found, not a guarantee of a global optimum. Optional `throwMin` and `throwMax` are positive throw-ratio bounds; null means no configured bound. Shift limits constrain adjustable shift only, including the generic elliptical approximation when selected.

`rmsError` is the square root of the mean of the four squared Euclidean corner distances, in metres; `maxError` is the largest of those distances. A fit is called exact when every corner is within 1 mm. A valid initial configuration that satisfies the search limits is included as a candidate so the search does not worsen the objective.

## Ideal digital correction

When enabled, digital correction models a prewarped input image; it does not move or remove the raw projected light footprint. It places a centred, native-aspect rectangle within the screen and finds the largest scale up to the target size whose corners map inside the physical panel. If the desired centre is outside the illuminated footprint, correction is unavailable. The model assumes ideal geometric prewarping; actual device limits and supported correction modes may differ.

For a screen point Q and lens P, let R, U and F be the rotated right, up and forward unit basis vectors and let D = (Q − P) · F. The panel coordinates are u = throwRatio × ((Q − P) · R) / D − shiftX / 100 and v = throwRatio × (aspectWidth / aspectHeight) × ((Q − P) · U) / D − (shiftY + fixedOffsetY) / 100. The algorithm checks these coordinates against the panel bounds and searches for the maximum rectangle scale. Horizontal and vertical warp percentages give the maximum displacement of a corrected rectangle corner from its corresponding full-panel corner as a percentage of full panel width or height. Panel used and unused percentages describe geometric panel **area**, not resolution, brightness or a manufacturer specification. Screen coverage is corrected rectangle area divided by screen area; a different native aspect ratio can leave part of the screen unused.

With correction enabled, automatic fit compares corrected rectangle corners with the largest centred native-aspect target rectangle. It prioritises reaching the full target, then greater panel area used, and prefers less rotation when otherwise tied. It searches a bounded set of optical settings and does not guarantee the global optimum. The reported RMS and maximum distances are calculated for the corrected rectangle; an exact fit requires the full target and at most 1 mm error at each corner.
