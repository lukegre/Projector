/** Ideal pinhole projection geometry; all lengths in metres, angles in degrees. */
export const DEFAULTS = Object.freeze({
  throwRatio: 1.5,
  distance: 4.6,
  aspectWidth: 16,
  aspectHeight: 9,
  offsetX: 0,
  lensHeight: 1.2,
  yaw: 0,
  pitch: 0,
  roll: 0,
  shiftX: 0,
  shiftY: 0,
  fixedOffsetY: 0,
  screenWidth: 3,
  screenAspectWidth: 16,
  screenAspectHeight: 9,
  screenBottom: 0.5,
  ceilingHeight: 2.7,
  roomWidth: 5,
  shiftLimitX: null,
  shiftLimitY: null,
  limitMode: 'none',
});

const radians = degrees => degrees * Math.PI / 180;
const length = (a, b) => Math.hypot(...a.map((value, i) => value - b[i]));
const finite = Number.isFinite;
const positive = value => finite(value) && value > 0;
const add = (a, b) => a.map((value, i) => value + b[i]);
const scale = (vector, factor) => vector.map(value => value * factor);

/** Rotate local axes: clockwise roll first, then upward pitch, then rightward yaw. */
export function basis(state) {
  const { yaw, pitch, roll } = state;
  const cy = Math.cos(radians(yaw));
  const sy = Math.sin(radians(yaw));
  const cp = Math.cos(radians(pitch));
  const sp = Math.sin(radians(pitch));
  const cr = Math.cos(radians(roll));
  const sr = Math.sin(radians(roll));

  const rotate = ([x, y, z]) => {
    const x1 = cr * x + sr * y;
    const y1 = -sr * x + cr * y;
    const y2 = cp * y1 - sp * z;
    const z2 = sp * y1 + cp * z;
    return [cy * x1 - sy * z2, y2, sy * x1 + cy * z2];
  };

  return {
    right: rotate([1, 0, 0]),
    up: rotate([0, 1, 0]),
    forward: rotate([0, 0, -1]),
  };
}

const positiveFields = [
  'throwRatio', 'distance', 'aspectWidth', 'aspectHeight', 'screenWidth',
  'screenAspectWidth', 'screenAspectHeight', 'ceilingHeight', 'roomWidth',
];
const finiteFields = [
  'offsetX', 'lensHeight', 'yaw', 'pitch', 'roll', 'shiftX', 'shiftY',
  'fixedOffsetY', 'screenBottom',
];

function errorsFor(state) {
  const errors = [];
  for (const key of positiveFields) {
    if (!positive(state[key])) errors.push(`${key} must be a positive finite number.`);
  }
  for (const key of finiteFields) {
    if (!finite(state[key])) errors.push(`${key} must be a finite number.`);
  }
  for (const key of ['shiftLimitX', 'shiftLimitY']) {
    if (state[key] !== null && (!finite(state[key]) || state[key] < 0)) {
      errors.push(`${key} must be null or a non-negative finite number.`);
    }
  }
  if (!['none', 'independent', 'ellipse'].includes(state.limitMode)) {
    errors.push('limitMode must be none, independent, or ellipse.');
  }
  return errors;
}

function rayPoint(state, u, v, axes) {
  if (!finite(u) || !finite(v)) return null;
  const x = (u + state.shiftX / 100) / state.throwRatio;
  const y = (v + (state.shiftY + state.fixedOffsetY) / 100)
    * (state.aspectHeight / state.aspectWidth) / state.throwRatio;
  const direction = add(add(scale(axes.right, x), scale(axes.up, y)), axes.forward);
  if (!direction.every(finite) || direction[2] >= -1e-12) return null;

  const t = -state.distance / direction[2];
  const point = [state.offsetX + t * direction[0], state.lensHeight + t * direction[1], 0];
  return t > 0 && point.every(finite) ? point : null;
}

export function projectUV(state, u, v) {
  const merged = { ...DEFAULTS, ...state };
  if (errorsFor(merged).length) return null;
  return rayPoint(merged, u, v, basis(merged));
}

function limitStatus(state) {
  const x = state.shiftLimitX;
  const y = state.shiftLimitY;
  const configured = state.limitMode !== 'none' && (x !== null || y !== null);
  if (!configured) {
    return { configured: false, within: true, message: 'No adjustable lens-shift limits configured.' };
  }
  const ratio = (value, limit) => {
    if (limit === null) return 0;
    if (limit === 0) return value === 0 ? 0 : Infinity;
    return Math.abs(value) / limit;
  };
  const rx = ratio(state.shiftX, x);
  const ry = ratio(state.shiftY, y);
  const within = state.limitMode === 'ellipse'
    ? rx * rx + ry * ry <= 1 + 1e-12
    : rx <= 1 + 1e-12 && ry <= 1 + 1e-12;
  const qualifier = state.limitMode === 'ellipse'
    ? ' (generic elliptical approximation; manufacturer limits may differ)'
    : '';
  return {
    configured: true,
    within,
    message: `Adjustable lens shift is ${within ? 'within' : 'outside'} configured limits${qualifier}.`,
  };
}

function polygonArea(polygon) {
  const twiceArea = polygon.reduce((sum, a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    return sum + a[0] * b[1] - b[0] * a[1];
  }, 0);
  return Math.abs(twiceArea) / 2;
}

function clip(polygon, axis, bound, greater) {
  if (!polygon.length) return [];
  const inside = point => greater ? point[axis] >= bound : point[axis] <= bound;
  const output = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const aInside = inside(a);
    const bInside = inside(b);
    if (aInside !== bInside) {
      const t = (bound - a[axis]) / (b[axis] - a[axis]);
      output.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
    if (bInside) output.push(b);
  }
  return output;
}

function screenFor(state) {
  const width = positive(state.screenWidth) ? state.screenWidth : null;
  const height = width !== null && positive(state.screenAspectWidth) && positive(state.screenAspectHeight)
    ? width * state.screenAspectHeight / state.screenAspectWidth
    : null;
  const bottom = finite(state.screenBottom) ? state.screenBottom : null;
  const left = width === null ? null : -width / 2;
  const right = width === null ? null : width / 2;
  const top = height === null || bottom === null ? null : bottom + height;
  const diagonal = width === null || height === null ? null : Math.hypot(width, height);
  return {
    width, height, diagonal,
    diagonalInches: diagonal === null ? null : diagonal / 0.0254,
    left, right, bottom, top,
    center: top === null ? null : [0, (bottom + top) / 2, 0],
    corners: top === null ? [] : [
      [left, top, 0], [right, top, 0], [right, bottom, 0], [left, bottom, 0],
    ],
  };
}

export function project(state) {
  const s = { ...DEFAULTS, ...state };
  const errors = errorsFor(s);
  const warnings = [];
  const screen = screenFor(s);
  const width = positive(s.distance) && positive(s.throwRatio) ? s.distance / s.throwRatio : null;
  const height = width !== null && positive(s.aspectWidth) && positive(s.aspectHeight)
    ? width * s.aspectHeight / s.aspectWidth : null;
  const diagonal = height === null ? null : Math.hypot(width, height);
  const nominal = { width, height, diagonal, diagonalInches: diagonal === null ? null : diagonal / 0.0254 };
  const limits = limitStatus(s);
  const result = {
    valid: false, errors, warnings, nominal, corners: [], center: null,
    bounds: null, edges: null, screen, coverage: null, limitStatus: limits,
  };
  if (errors.length) return result;
  if (!limits.within) warnings.push(limits.message);

  const axes = basis(s);
  const corners = [[-.5, .5], [.5, .5], [.5, -.5], [-.5, -.5]]
    .map(([u, v]) => rayPoint(s, u, v, axes));
  const center = rayPoint(s, 0, 0, axes);
  if (corners.some(point => point === null) || center === null) {
    errors.push('The image footprint is singular or one or more rays do not reach the screen plane.');
    return result;
  }

  const xs = corners.map(point => point[0]);
  const ys = corners.map(point => point[1]);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const bottom = Math.min(...ys);
  const top = Math.max(...ys);
  const bounds = { left, right, bottom, top, width: right - left, height: top - bottom };
  const edges = {
    top: length(corners[0], corners[1]),
    right: length(corners[1], corners[2]),
    bottom: length(corners[2], corners[3]),
    left: length(corners[3], corners[0]),
  };
  let clipped = corners.map(point => point.slice(0, 2));
  const boundaries = [
    [0, screen.left, true], [0, screen.right, false],
    [1, screen.bottom, true], [1, screen.top, false],
  ];
  for (const [axis, bound, greater] of boundaries) {
    clipped = clip(clipped, axis, bound, greater);
  }
  const imageArea = polygonArea(corners);
  const screenArea = screen.width * screen.height;
  const intersectionArea = polygonArea(clipped);
  const values = [...Object.values(bounds), ...Object.values(edges), imageArea, screenArea, intersectionArea];
  if (!values.every(finite) || imageArea <= 1e-15 || screenArea <= 0) {
    errors.push('The image footprint is singular or numerically invalid.');
    return result;
  }
  const coverage = {
    screenPercent: 100 * intersectionArea / screenArea,
    imagePercent: 100 * intersectionArea / imageArea,
    intersectionArea, screenArea, imageArea,
  };
  if (left < -s.roomWidth / 2 || right > s.roomWidth / 2) {
    warnings.push('Projected image extends beyond the room width.');
  }
  if (bottom < 0) warnings.push('Projected image extends below the floor.');
  if (top > s.ceilingHeight) warnings.push('Projected image extends above the ceiling.');
  return Object.assign(result, { valid: true, corners, center, bounds, edges, coverage });
}
