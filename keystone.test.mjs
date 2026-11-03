import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, project, projectUV } from './geometry.js';
import { digitalProjection, wallToPanel } from './keystone.js';

const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) < tolerance, `${a} ≠ ${b}`);
const aligned = { ...DEFAULTS, distance: 3, throwRatio: 1, screenWidth: 3,
  screenBottom: 0, lensHeight: 3 * 9 / 32, digitalKeystone: true };
const panelInside = p => p.panelCorners.every(point => point.every(value => Math.abs(value) <= .5 + 1e-9));

test('disabled digital correction is safe even with invalid raw footprint', () => {
  assert.equal(digitalProjection({ ...aligned, digitalKeystone: false, distance: 0 }).enabled, false);
});

test('aligned identical rectangle uses entire panel with no warp', () => {
  const p = digitalProjection(aligned);
  assert.ok(p.valid && p.fullTarget && p.fullScreen);
  near(p.panelUsedPercent, 100);
  near(p.unusedPanelPercent, 0);
  near(p.maxHorizontalWarpPercent, 0);
  near(p.maxVerticalWarpPercent, 0);
  near(p.screenCoveragePercent, 100);
});

test('tilt and yaw produce rectangular correction within raw footprint', () => {
  const p = digitalProjection({ ...aligned, throwRatio: .8, yaw: 2, pitch: 2 });
  assert.ok(p.valid);
  assert.ok(panelInside(p));
  assert.ok(p.unusedPanelPercent > 0);
  assert.ok(p.maxHorizontalWarpPercent > 0 && p.maxVerticalWarpPercent > 0);
  near(p.corners[0][1], p.corners[1][1]);
  near(p.corners[0][0], p.corners[3][0]);
});

test('centre outside light footprint is an error; smaller footprint shrinks image', () => {
  const missing = digitalProjection({ ...aligned, offsetX: 5 });
  assert.equal(missing.valid, false);
  assert.match(missing.errors[0], /centre/);
  const small = digitalProjection({ ...aligned, throwRatio: 2 });
  assert.ok(small.valid && !small.fullTarget);
  near(small.scale, .5);
  near(small.screenCoveragePercent, 25);
  assert.ok(panelInside(small));
});

test('full target inside larger footprint, rolled and shifted footprints', () => {
  const larger = digitalProjection({ ...aligned, throwRatio: .7 });
  assert.ok(larger.fullTarget && larger.fullScreen && larger.unusedPanelPercent > 0);
  const rotated = digitalProjection({ ...aligned, throwRatio: .7, roll: 12, fixedOffsetY: 5 });
  assert.ok(rotated.valid && panelInside(rotated));
  assert.ok(rotated.maxHorizontalWarpPercent > 0);
});

test('different screen aspect preserves native image aspect', () => {
  const p = digitalProjection({ ...aligned, throwRatio: .7, screenAspectWidth: 4, screenAspectHeight: 3 });
  assert.ok(p.valid && p.fullTarget && !p.fullScreen);
  near(p.width / p.height, 16 / 9);
  near(p.screenCoveragePercent, .75 * 100);
  assert.ok(p.warnings.some(warning => warning.includes('aspect')));
});

test('inverse mapping matches forward rays with compound rotation and shifts', () => {
  const state = { ...aligned, yaw: 10, pitch: -5, roll: 7, shiftX: 12, shiftY: -8, fixedOffsetY: 15 };
  for (const [u, v] of [[-.5, .5], [.21, -.34], [0, 0], [.5, -.5]]) {
    const point = projectUV(state, u, v);
    assert.ok(point);
    const inverse = wallToPanel(state, point);
    near(inverse[0], u);
    near(inverse[1], v);
  }
});
