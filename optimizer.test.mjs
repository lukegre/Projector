import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, project } from './geometry.js';
import { autoFit } from './optimizer.js';
import { digitalProjection } from './keystone.js';

const near = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a - b) < tolerance, `${a} ≠ ${b}`);
const room = { ...DEFAULTS, screenWidth: 1.5, screenBottom: .5, offsetX: .6, lensHeight: 1.1 };

test('exact aligned fit uses physical screen centre and full-image shift', () => {
  const fit = autoFit(room);
  assert.ok(fit.exact);
  near(fit.state.throwRatio, 4.6 / 1.5);
  near(fit.state.shiftX, -40);
  near(fit.state.shiftY, ((.5 + 1.5 * 9 / 16 / 2 - 1.1) / (1.5 * 9 / 16)) * 100);
  near(fit.maxError, 0);
});

test('fixed offset is subtracted and physical settings remain intact', () => {
  const input = { ...room, fixedOffsetY: 20, shiftLimitX: 100, shiftLimitY: 100, limitMode: 'independent' };
  const copy = structuredClone(input);
  const fit = autoFit(input);
  assert.ok(fit.exact);
  near(fit.state.shiftY, autoFit(room).state.shiftY - 20);
  assert.deepEqual(input, copy);
  for (const key of ['distance', 'offsetX', 'lensHeight', 'screenWidth', 'fixedOffsetY', 'shiftLimitX', 'shiftLimitY']) {
    assert.equal(fit.state[key], input[key]);
  }
  assert.deepEqual(autoFit(input), fit);
});

test('already exact aligned state is a no-op with finite errors', () => {
  const fitted = autoFit(room).state;
  const result = autoFit(fitted);
  assert.equal(result.changed, false);
  assert.ok(result.exact);
  near(result.rmsError, 0);
});

test('limited off-axis search improves valid footprint without changing position', () => {
  const input = { ...room, shiftLimitX: 10, shiftLimitY: 10, limitMode: 'independent' };
  const initial = project(input);
  const initialError = Math.sqrt(initial.corners.reduce((sum, point, i) => sum +
    (point[0] - initial.screen.corners[i][0]) ** 2 + (point[1] - initial.screen.corners[i][1]) ** 2, 0) / 4);
  const fit = autoFit(input);
  assert.ok(project(fit.state).valid);
  assert.ok(fit.rmsError < initialError);
  assert.ok(Math.abs(fit.state.shiftX) <= 10);
  assert.ok(Math.abs(fit.state.shiftY) <= 10);
  assert.equal(fit.state.offsetX, input.offsetX);
  assert.equal(fit.state.distance, input.distance);
});

test('zero and elliptical shift limits are enforced', () => {
  const zero = autoFit({ ...room, shiftLimitX: 0, shiftLimitY: 0, limitMode: 'independent' });
  assert.equal(zero.state.shiftX, 0);
  assert.equal(zero.state.shiftY, 0);
  assert.ok(project(zero.state).valid);
  const ellipse = autoFit({ ...room, shiftLimitX: 20, shiftLimitY: 20, limitMode: 'ellipse' });
  assert.ok((ellipse.state.shiftX / 20) ** 2 + (ellipse.state.shiftY / 20) ** 2 <= 1 + 1e-10);
  assert.ok(project(ellipse.state).valid);
});

test('zoom bounds and mismatched aspect report a best fit', () => {
  const bounded = autoFit({ ...room, throwMin: 4, throwMax: 5 });
  assert.ok(bounded.state.throwRatio >= 4 && bounded.state.throwRatio <= 5);
  assert.equal(bounded.exact, false);
  const mismatch = autoFit({ ...room, screenAspectWidth: 4, screenAspectHeight: 3 });
  assert.equal(mismatch.exact, false);
  assert.ok(Number.isFinite(mismatch.rmsError));
});

test('invalid limits return original state and diagnostic', () => {
  for (const change of [{ throwMin: 5, throwMax: 4 }, { throwMin: 0 }, { shiftLimitX: -1 }, { aspectWidth: 0 }]) {
    const input = { ...room, ...change };
    const result = autoFit(input);
    assert.equal(result.changed, false);
    assert.deepEqual(result.state, input);
    assert.equal(result.rmsError, Infinity);
    assert.ok(result.message.length);
  }
});

test('one-sided and fixed throw bounds allow a feasible search outside the inferred interval', () => {
  const cases = [
    { throwMax: .4 },
    { throwMin: 20 },
    { throwMin: 4, throwMax: 4 },
  ];
  for (const bounds of cases) {
    const result = autoFit({ ...room, ...bounds });
    assert.ok(Number.isFinite(result.rmsError), result.message);
    assert.ok(project(result.state).valid);
    if (bounds.throwMin !== undefined) assert.ok(result.state.throwRatio >= bounds.throwMin);
    if (bounds.throwMax !== undefined) assert.ok(result.state.throwRatio <= bounds.throwMax);
    if (bounds.throwMin === bounds.throwMax) assert.equal(result.state.throwRatio, bounds.throwMin);
  }
});

test('digital fit improves target coverage for zero shift off axis', () => {
  const input = { ...room, screenBottom: .6, lensHeight: 1.2,
    shiftLimitX: 0, shiftLimitY: 0, limitMode: 'independent' };
  const optical = autoFit(input);
  const fit = autoFit({ ...input, digitalKeystone: true });
  assert.ok(fit.digital?.valid, fit.message);
  assert.ok(fit.rmsError < optical.rmsError);
  assert.ok(fit.digital.panelCorners.every(point => point.every(value => Math.abs(value) <= .5 + 1e-9)));
  near(fit.state.shiftX, 0);
  near(fit.state.shiftY, 0);
  assert.ok(fit.exact && fit.digital.fullTarget);
});

test('digital fit improves panel usage when an existing corrected image already fills the target', () => {
  const input = { ...room, digitalKeystone: true, throwRatio: 2.5, shiftX: -30, shiftY: -17 };
  const before = digitalProjection(input);
  assert.ok(before.fullTarget);
  assert.ok(before.panelUsedPercent < 100);
  const existing = autoFit(input);
  assert.ok(existing.exact);
  assert.ok(existing.changed);
  near(existing.digital.panelUsedPercent, 100);
  near(existing.state.yaw, 0);
  near(existing.state.pitch, 0);
  near(existing.state.roll, 0);
  const repeat = autoFit(existing.state);
  assert.equal(repeat.changed, false);
});
