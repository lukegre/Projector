import { DEFAULTS, project } from './geometry.js';
import { digitalProjection } from './keystone.js';

const FIELDS = ['throwRatio', 'shiftX', 'shiftY', 'yaw', 'pitch', 'roll'];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const radiansToDegrees = 180 / Math.PI;

/**
 * Fit image corners to screen corners. RMS and maximum errors are Euclidean
 * corner distances in metres. The bounded numerical search is not a proof of
 * global optimality. Neither this function nor project mutates inputState.
 */
export function autoFit(inputState, options = {}) {
  const original = { ...DEFAULTS, ...inputState };
  const initial = project(original);
  const requested = options.adjustableFields ?? FIELDS;
  const invalidFields = !Array.isArray(requested) || requested.some(field => !FIELDS.includes(field));
  const adjustable = new Set(invalidFields ? [] : requested);
  const min = original.throwMin ?? null;
  const max = original.throwMax ?? null;
  const invalidZoom = (min !== null && (!Number.isFinite(min) || min <= 0))
    || (max !== null && (!Number.isFinite(max) || max <= 0))
    || (min !== null && max !== null && min > max);
  const failure = message => ({
    state: { ...inputState }, exact: false, rmsError: Infinity, maxError: Infinity,
    changed: false, message, iterations: 0,
  });
  if (invalidFields) return failure('Invalid adjustable fields.');
  if (invalidZoom) return failure('Invalid throw bounds: use positive values with minimum no greater than maximum.');
  // An invalid footprint may be repairable, but invalid settings are not.
  const structuralErrors = initial.errors.filter(error =>
    !error.includes('footprint') && !error.includes('rays do not reach'));
  if (structuralErrors.length) return failure(`Cannot fit: ${structuralErrors.join(' ')}`);

  if (!adjustable.has('throwRatio') && ((min !== null && original.throwRatio < min) || (max !== null && original.throwRatio > max))) {
    return failure('The locked throw ratio is outside the configured throw bounds.');
  }
  if (original.limitMode !== 'none') {
    const contribution = (field, limit) => {
      if (adjustable.has(field) || limit === null) return 0;
      const value = Math.abs(original[field]);
      return limit === 0 ? (value === 0 ? 0 : Infinity) : value / limit;
    };
    const x = contribution('shiftX', original.shiftLimitX);
    const y = contribution('shiftY', original.shiftLimitY);
    if (x > 1 + 1e-12 || y > 1 + 1e-12 || (original.limitMode === 'ellipse' && x * x + y * y > 1 + 1e-12)) {
      return failure('The locked lens shift is outside the configured shift limits.');
    }
  }

  const targetWidth = original.screenWidth;
  const targetHeight = initial.screen.height;
  const digitalMode = original.digitalKeystone === true;
  const nativeAspect = original.aspectWidth / original.aspectHeight;
  const fitWidth = digitalMode ? Math.min(targetWidth, targetHeight * nativeAspect) : targetWidth;
  const fitHeight = digitalMode ? fitWidth / nativeAspect : targetHeight;
  const [cx, cy] = initial.screen.center;
  const targetCorners = [[cx - fitWidth / 2, cy + fitHeight / 2], [cx + fitWidth / 2, cy + fitHeight / 2],
    [cx + fitWidth / 2, cy - fitHeight / 2], [cx - fitWidth / 2, cy - fitHeight / 2]];
  const idealRatio = original.distance / targetWidth;
  const idealX = -original.offsetX / targetWidth * 100;
  const idealY = (initial.screen.center[1] - original.lensHeight)
    / (targetWidth * original.aspectHeight / original.aspectWidth) * 100 - original.fixedOffsetY;
  const lowRatio = min ?? Math.min(idealRatio / 4, original.throwRatio, max === null ? Infinity : max / 4);
  const highRatio = max ?? Math.max(idealRatio * 4, original.throwRatio, min === null ? 0 : min * 4);
  const xBound = Math.max(100, Math.abs(idealX) + 50, Math.abs(original.shiftX));
  const yBound = Math.max(100, Math.abs(idealY) + 50, Math.abs(original.shiftY));
  const xLimit = original.limitMode !== 'none' && original.shiftLimitX !== null
    ? original.shiftLimitX : xBound;
  const yLimit = original.limitMode !== 'none' && original.shiftLimitY !== null
    ? original.shiftLimitY : yBound;
  const limits = [[lowRatio, highRatio], [-xLimit, xLimit], [-yLimit, yLimit], [-60, 60], [-60, 60], [-30, 30]];
  FIELDS.forEach((field, i) => {
    if (!adjustable.has(field)) limits[i] = [original[field], original[field]];
  });
  let iterations = 0;

  function feasible(values) {
    if (values.some((v, i) => !Number.isFinite(v) || (!adjustable.has(FIELDS[i]) && v !== original[FIELDS[i]])
      || v < limits[i][0] - 1e-10 || v > limits[i][1] + 1e-10)) return false;
    if (original.limitMode === 'ellipse') {
      const term = (value, limit) => limit === null ? 0 : limit === 0 ? (value === 0 ? 0 : Infinity) : (value / limit) ** 2;
      if (term(values[1], original.shiftLimitX) + term(values[2], original.shiftLimitY) > 1 + 1e-12) return false;
    }
    return true;
  }
  function assess(values) {
    if (!feasible(values)) return null;
    iterations++;
    const state = { ...original };
    FIELDS.forEach((key, i) => { state[key] = values[i]; });
    const p = project(state);
    if (!p.valid) return null;
    const digital = digitalMode ? digitalProjection(state, p) : null;
    if (digitalMode && !digital.valid) return null;
    const imageCorners = digitalMode ? digital.corners : p.corners;
    let error = 0;
    let squaredMetres = 0;
    let maxError = 0;
    imageCorners.forEach((corner, i) => {
      const dx = corner[0] - targetCorners[i][0];
      const dy = corner[1] - targetCorners[i][1];
      const distance = Math.hypot(dx, dy);
      error += (dx / targetWidth) ** 2 + (dy / targetHeight) ** 2;
      squaredMetres += distance ** 2;
      maxError = Math.max(maxError, distance);
    });
    return { values, error, rmsError: Math.sqrt(squaredMetres / 4), maxError, digital,
      rotation: values[3] ** 2 + values[4] ** 2 + values[5] ** 2 };
  }
  function better(a, b) {
    if (!a) return false;
    if (!b) return true;
    if (digitalMode && a.digital.fullTarget !== b.digital.fullTarget) return a.digital.fullTarget;
    if (a.error < b.error - 1e-14) return true;
    if (Math.abs(a.error - b.error) > 1e-14) return false;
    if (digitalMode && Math.abs(a.digital.panelUsedPercent - b.digital.panelUsedPercent) > 1e-9) {
      return a.digital.panelUsedPercent > b.digital.panelUsedPercent;
    }
    return a.rotation < b.rotation;
  }
  function constrain(values) {
    const result = values.map((value, i) => clamp(value, ...limits[i]));
    if (original.limitMode === 'ellipse') {
      const contribution = (value, limit) => limit === null || limit === 0 ? 0 : (value / limit) ** 2;
      const locked = (adjustable.has('shiftX') ? 0 : contribution(result[1], original.shiftLimitX))
        + (adjustable.has('shiftY') ? 0 : contribution(result[2], original.shiftLimitY));
      const variable = (adjustable.has('shiftX') ? contribution(result[1], original.shiftLimitX) : 0)
        + (adjustable.has('shiftY') ? contribution(result[2], original.shiftLimitY) : 0);
      if (locked + variable > 1 && variable > 0) {
        const factor = Math.sqrt(Math.max(0, 1 - locked) / variable);
        if (adjustable.has('shiftX')) result[1] *= factor;
        if (adjustable.has('shiftY')) result[2] *= factor;
      }
    }
    return result;
  }
  function output(best, message) {
    const state = { ...inputState };
    FIELDS.forEach((key, i) => { state[key] = best.values[i]; });
    const changed = FIELDS.some((key, i) => original[key] !== best.values[i]);
    const exact = best.maxError <= .001 && (!digitalMode || best.digital.fullTarget);
    return { state, exact, rmsError: best.rmsError, maxError: best.maxError, changed, message, iterations,
      ...(digitalMode ? { digital: best.digital } : {}) };
  }

  const directValues = [idealRatio, idealX, idealY, 0, 0, 0];
  const currentValues = FIELDS.map(key => original[key]);
  const current = assess(currentValues);
  const direct = assess(directValues);
  if (direct && direct.maxError <= .001 && (!digitalMode || direct.digital.fullTarget)) {
    if (current && current.maxError <= .001 && !better(direct, current)) {
      return output(current, 'The current image already fits the screen.');
    }
    return output(direct, 'Exact aligned screen fit found.');
  }
  let best = current;
  const seed = constrain(directValues);
  const ratio = seed[0];
  const width = original.distance / ratio;
  const height = width * original.aspectHeight / original.aspectWidth;
  const aimX = (Math.atan2(-original.offsetX - width * seed[1] / 100, original.distance)) * radiansToDegrees;
  const aimY = (Math.atan2(initial.screen.center[1] - original.lensHeight
    - height * (seed[2] + original.fixedOffsetY) / 100, original.distance)) * radiansToDegrees;
  const seeds = [seed, constrain([ratio, seed[1], seed[2], aimX, aimY, 0]), constrain(currentValues)];
  for (const startingValues of seeds) {
    let local = assess(startingValues);
    if (!local) continue;
    if (better(local, best)) best = local;
    let steps = [(highRatio - lowRatio) / 8, Math.max(1, xLimit / 4), Math.max(1, yLimit / 4), 12, 12, 8];
    for (let round = 0; round < 48; round++) {
      let improved = false;
      for (let axis = 0; axis < FIELDS.length; axis++) {
        if (!adjustable.has(FIELDS[axis])) continue;
        for (const direction of [-1, 1]) {
          const candidate = [...local.values];
          candidate[axis] += direction * steps[axis];
          const next = assess(constrain(candidate));
          if (better(next, local)) { local = next; improved = true; }
        }
      }
      if (better(local, best)) best = local;
      if (!improved) steps = steps.map(step => step / 2);
      if (Math.max(...steps) < 0.00005) break;
    }
  }
  if (!best) return failure('No valid image footprint was found within the fit bounds.');
  return output(best, best.maxError <= .001 && (!digitalMode || best.digital.fullTarget)
    ? 'Screen fit found within 1 mm at every corner.'
    : 'Closest screen fit found within the search and configured limits.');
}

/** Analytic, square-on requirements for a room, independent of hardware limits. */
export function idealFit(inputState) {
  const original = { ...DEFAULTS, ...inputState };
  const safe = {
    ...original, throwRatio: 1, shiftX: 0, shiftY: 0, yaw: 0, pitch: 0, roll: 0,
    shiftLimitX: null, shiftLimitY: null, limitMode: 'none',
  };
  const initial = project(safe);
  if (!initial.valid) {
    return { state: { ...inputState }, exact: false, rmsError: Infinity, maxError: Infinity,
      changed: false, message: `Cannot calculate ideal requirements: ${initial.errors.join(' ')}`, iterations: 0 };
  }
  const aspect = original.aspectWidth / original.aspectHeight;
  const width = Math.min(initial.screen.width, initial.screen.height * aspect);
  const height = width / aspect;
  const values = [original.distance / width, -original.offsetX / width * 100,
    (initial.screen.center[1] - original.lensHeight) / height * 100 - original.fixedOffsetY, 0, 0, 0];
  const state = { ...inputState };
  FIELDS.forEach((key, i) => { state[key] = values[i]; });
  const check = { ...safe, ...state, shiftLimitX: null, shiftLimitY: null, limitMode: 'none', digitalKeystone: true };
  const digital = digitalProjection(check);
  if (!digital.valid) {
    return { state: { ...inputState }, exact: false, rmsError: Infinity, maxError: Infinity,
      changed: false, message: `Cannot calculate ideal requirements: ${digital.errors.join(' ')}`, iterations: 0 };
  }
  const changed = FIELDS.some((key, i) => original[key] !== values[i]);
  return { state, exact: true, rmsError: 0, maxError: 0, changed,
    message: 'Ideal optical requirements, independent of hardware limits; the native-aspect target fits within the screen.',
    iterations: 1, digital };
}
