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
