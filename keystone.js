import { DEFAULTS, basis, project } from './geometry.js';

const dot = (a, b) => a.reduce((sum, value, i) => sum + value * b[i], 0);
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));

/** Invert the ideal pinhole projection to native panel coordinates. */
export function wallToPanel(state, point) {
  const s = { ...DEFAULTS, ...state };
  const axes = basis(s);
  const ray = [point[0] - s.offsetX, point[1] - s.lensHeight, point[2] - s.distance];
  const denominator = dot(ray, axes.forward);
  if (!Number.isFinite(denominator) || denominator <= 1e-12) return null;
  const u = s.throwRatio * dot(ray, axes.right) / denominator - s.shiftX / 100;
  const v = s.throwRatio * (s.aspectWidth / s.aspectHeight) * dot(ray, axes.up) / denominator
    - (s.shiftY + s.fixedOffsetY) / 100;
  return Number.isFinite(u) && Number.isFinite(v) ? [u, v] : null;
}

function area(polygon) {
  return Math.abs(polygon.reduce((sum, point, i) => {
    const next = polygon[(i + 1) % polygon.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0)) / 2;
}

/** Ideal rectangular prewarp inside the physical light footprint. */
export function digitalProjection(state, raw = project(state)) {
  const s = { ...DEFAULTS, ...state };
  const blank = {
    enabled: !!s.digitalKeystone, valid: false, errors: [], warnings: [], corners: [],
    panelCorners: [], center: null, width: null, height: null, scale: null,
    fullTarget: false, fullScreen: false, panelUsedPercent: null, unusedPanelPercent: null,
    maxHorizontalWarpPercent: null, maxVerticalWarpPercent: null, screenCoveragePercent: null,
  };
  if (!blank.enabled) return blank;
  if (!raw.valid) {
    blank.errors.push('Digital correction requires a valid raw projection footprint.');
    return blank;
  }
  const screen = raw.screen;
  const aspect = s.aspectWidth / s.aspectHeight;
  const targetWidth = Math.min(screen.width, screen.height * aspect);
  const targetHeight = targetWidth / aspect;
  const center = screen.center;
  const inside = point => {
    const panel = wallToPanel(s, point);
    return panel && panel.every(value => value >= -.5 - 1e-12 && value <= .5 + 1e-12);
  };
  if (!inside(center)) {
    blank.errors.push('The desired screen centre is outside the illuminated footprint.');
    return blank;
  }
  const cornersAt = scale => {
    const x = targetWidth * scale / 2;
    const y = targetHeight * scale / 2;
    return [
      [center[0] - x, center[1] + y, 0], [center[0] + x, center[1] + y, 0],
      [center[0] + x, center[1] - y, 0], [center[0] - x, center[1] - y, 0],
    ];
  };
  let low = 0;
  let high = 1;
  if (cornersAt(1).every(inside)) low = 1;
  else {
    for (let i = 0; i < 42; i++) {
      const middle = (low + high) / 2;
      if (cornersAt(middle).every(inside)) low = middle;
      else high = middle;
    }
  }
  if (low <= 1e-12) {
    blank.errors.push('No usable corrected rectangle fits at the screen centre.');
    return blank;
  }
  const corners = cornersAt(low);
  const panelCorners = corners.map(point => wallToPanel(s, point));
  const fullPanel = [[-.5, .5], [.5, .5], [.5, -.5], [-.5, -.5]];
  const used = clamp(area(panelCorners) * 100, 0, 100);
  const fullTarget = low >= 1 - 1e-9;
  const fullScreen = fullTarget && Math.abs(targetWidth * targetHeight - screen.width * screen.height)
    <= 1e-9 * screen.width * screen.height;
  const warnings = ['Ideal digital prewarp; real device correction limits may differ.'];
  if (!fullTarget) warnings.push('The full target rectangle is not illuminated; the corrected image is smaller.');
  if (Math.abs(targetWidth * targetHeight - screen.width * screen.height) > 1e-9 * screen.width * screen.height) {
    warnings.push('The native image aspect ratio leaves unused screen area.');
  }
  return {
    enabled: true, valid: true, errors: [], warnings, corners, panelCorners, center: [...center],
    width: targetWidth * low, height: targetHeight * low, scale: low, fullTarget, fullScreen,
    panelUsedPercent: used, unusedPanelPercent: 100 - used,
    maxHorizontalWarpPercent: Math.max(...panelCorners.map((p, i) => Math.abs(p[0] - fullPanel[i][0]))) * 100,
    maxVerticalWarpPercent: Math.max(...panelCorners.map((p, i) => Math.abs(p[1] - fullPanel[i][1]))) * 100,
    screenCoveragePercent: 100 * targetWidth * targetHeight * low * low / (screen.width * screen.height),
  };
}
