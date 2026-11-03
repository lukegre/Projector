import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, project, projectUV, basis } from './geometry.js';

const near = (actual, expected, epsilon = 1e-9) => {
  assert.ok(Math.abs(actual - expected) < epsilon, `${actual} ≠ ${expected}`);
};
const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const vectorNear = (actual, expected) => actual.forEach((value, i) => near(value, expected[i]));

test('aligned dimensions, aspect, diagonal in inches and corners', () => {
  const p = project({ ...DEFAULTS, throwRatio: 4.6 / 1.5 });
  assert.equal(p.valid, true);
  near(p.nominal.width, 1.5);
  near(p.nominal.height, 1.5 * 9 / 16);
  near(p.bounds.width, 1.5);
  near(p.bounds.height, p.nominal.height);
  near(p.nominal.diagonalInches, Math.sqrt(1.5 ** 2 + (1.5 * 9 / 16) ** 2) / 0.0254);
  assert.deepEqual(p.corners.map(point => Math.sign(point[0])), [-1, 1, 1, -1]);
});

test('shift is percentage of full size, fixed offset adds, and translation applies', () => {
  const base = project(DEFAULTS);
  const p = project({
    ...DEFAULTS, shiftX: 10, shiftY: 5, fixedOffsetY: 10, offsetX: .3, lensHeight: 1.4,
  });
  near(p.center[0], .3 + base.nominal.width * .1);
  near(p.center[1], 1.4 + base.nominal.height * .15);
  near(p.bounds.width, base.bounds.width);
  const halfShift = project({ ...DEFAULTS, shiftX: 50 });
  near(halfShift.center[0] - base.center[0], base.nominal.width / 2);
  near(halfShift.bounds.left, base.center[0]);
});

test('yaw and pitch follow tangent and produce trapezoids', () => {
  const yaw = 12;
  const pitch = 10;
  const y = project({ ...DEFAULTS, yaw });
  const p = project({ ...DEFAULTS, pitch });
  assert.ok(y.valid && p.valid);
  near(y.center[0], DEFAULTS.offsetX + DEFAULTS.distance * Math.tan(yaw * Math.PI / 180));
  near(p.center[1], DEFAULTS.lensHeight + DEFAULTS.distance * Math.tan(pitch * Math.PI / 180));
  assert.notEqual(y.edges.left, y.edges.right);
  assert.notEqual(p.edges.top, p.edges.bottom);
});

test('positive roll is clockwise and combined axes form a rigid right-handed rotation', () => {
  const p = project({ ...DEFAULTS, roll: 90 });
  assert.ok(p.corners[1][1] < p.corners[0][1]);
  const b = basis({ yaw: 23, pitch: -17, roll: 34 });
  for (const vector of Object.values(b)) near(dot(vector, vector), 1);
  near(dot(b.right, b.up), 0);
  near(dot(b.right, b.forward), 0);
  near(dot(b.up, b.forward), 0);
  // Right cross up equals local +z, the opposite of forward.
  near(dot(cross(b.right, b.up), b.forward), -1);
  vectorNear(basis({ yaw: 90, pitch: 0, roll: 0 }).forward, [1, 0, 0]);
  vectorNear(basis({ yaw: -90, pitch: 0, roll: 0 }).forward, [-1, 0, 0]);
});

test('extreme orientation rejects a footprint if even one ray misses', () => {
  const p = project({ ...DEFAULTS, yaw: 85 });
  assert.equal(p.valid, false);
  assert.equal(p.corners.length, 0);
  assert.equal(p.coverage, null);
  assert.ok(p.errors.length);
  assert.equal(projectUV({ ...DEFAULTS, yaw: 180 }, 0, 0), null);
});

const square = {
  ...DEFAULTS, distance: 2, throwRatio: 1, aspectWidth: 1, aspectHeight: 1,
  screenWidth: 2, screenAspectWidth: 1, screenAspectHeight: 1,
  screenBottom: 0, lensHeight: 1,
};

test('polygon clipping computes partial intersection and both percentages', () => {
  const p = project({ ...square, offsetX: 1 });
  near(p.coverage.intersectionArea, 2);
  near(p.coverage.screenPercent, 50);
  near(p.coverage.imagePercent, 50);
});

test('clipping handles image inside screen, screen inside image and disjoint shapes', () => {
  const inside = project({ ...square, throwRatio: 2 });
  near(inside.coverage.intersectionArea, 1);
  near(inside.coverage.screenPercent, 25);
  near(inside.coverage.imagePercent, 100);

  const containing = project({ ...square, throwRatio: .5 });
  near(containing.coverage.intersectionArea, 4);
  near(containing.coverage.screenPercent, 100);
  near(containing.coverage.imagePercent, 25);

  const disjoint = project({ ...square, offsetX: 4 });
  near(disjoint.coverage.intersectionArea, 0);
  near(disjoint.coverage.screenPercent, 0);
  near(disjoint.coverage.imagePercent, 0);
});

test('invalid inputs return safe result', () => {
  const cases = [
    { distance: 0 }, { aspectWidth: NaN }, { screenWidth: 0 },
    { yaw: Infinity }, { shiftLimitX: -1 }, { limitMode: 'bad' },
  ];
  for (const change of cases) {
    const p = project({ ...DEFAULTS, ...change });
    assert.equal(p.valid, false);
    assert.ok(p.errors.length);
    assert.equal(p.corners.length, 0);
  }
});

test('adjustable limits exclude fixed offset and ellipse is a generic approximation', () => {
  const common = {
    ...DEFAULTS, shiftX: 8, shiftY: 8, fixedOffsetY: 100, shiftLimitX: 10, shiftLimitY: 10,
  };
  const independent = project({ ...common, limitMode: 'independent' });
  const ellipse = project({ ...common, limitMode: 'ellipse' });
  assert.ok(independent.limitStatus.within);
  assert.ok(!ellipse.limitStatus.within);
  assert.match(ellipse.limitStatus.message, /generic elliptical approximation/);
  assert.ok(ellipse.warnings.some(warning => warning.includes('outside')));
});
