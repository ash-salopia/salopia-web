// ─────────────────────────────────────────────────────────────────────────────
// lib/velocity-profile.ts
//
// Load-velocity profiling for VBT-estimated 1RM. Methodology extracted
// directly from a coach-provided working spreadsheet (load/velocity
// test points -> linear regression -> minimum velocity threshold),
// not published defaults - see the athlete_velocity_profiles migration
// (0078) and the coach-facing calibration editor for where the
// per-athlete-per-exercise slope/intercept/mvt actually come from.
//
// Two distinct estimates, both from the same calibrated line:
// 1. estimateOneRMFromProfile - the calibration session's own number
//    (where the fitted line crosses mvt).
// 2. estimateOneRMFromPoint - re-anchors the SAME slope through one
//    fresh (load, velocity) reading from an ordinary training day, so
//    the estimate can move week to week from normal logged data
//    without needing a full re-calibration every time.
// ─────────────────────────────────────────────────────────────────────────────

export interface VelocityPoint {
  load: number;
  velocity: number;
}

export interface LinearFit {
  slope: number;
  intercept: number;
  rSquared: number;
}

// Least-squares linear regression (velocity as a function of load).
// Needs at least 2 points across 2 distinct loads - a single load (or
// a repeated one) has no slope to fit. rSquared is surfaced so a coach
// can judge fit quality rather than trusting a line blindly - a small
// or noisy calibration set can produce a technically-valid but
// unreliable slope.
export function fitLinearRegression(points: VelocityPoint[]): LinearFit | null {
  const valid = points.filter((p) => isFinite(p.load) && isFinite(p.velocity));
  const distinctLoads = new Set(valid.map((p) => p.load));
  if (valid.length < 2 || distinctLoads.size < 2) return null;

  const n = valid.length;
  const sumX = valid.reduce((s, p) => s + p.load, 0);
  const sumY = valid.reduce((s, p) => s + p.velocity, 0);
  const meanX = sumX / n;
  const meanY = sumY / n;

  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const p of valid) {
    const dx = p.load - meanX;
    const dy = p.velocity - meanY;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0) return null;

  const slope = sxy / sxx;
  const intercept = meanY - slope * meanX;
  // R² via the correlation coefficient squared - equivalent for simple
  // linear regression, avoids a second pass computing residuals.
  const rSquared = syy === 0 ? 1 : Math.pow(sxy / Math.sqrt(sxx * syy), 2);

  return { slope, intercept, rSquared };
}

// Method 1: the calibration session's own estimate - where the fitted
// line crosses the chosen minimum velocity threshold.
// 1RM = (mvt - intercept) / slope
export function estimateOneRMFromProfile(slope: number, intercept: number, mvt: number): number | null {
  if (slope === 0 || !isFinite(slope) || !isFinite(intercept) || !isFinite(mvt)) return null;
  const oneRM = (mvt - intercept) / slope;
  return oneRM > 0 && isFinite(oneRM) ? Math.round(oneRM * 2) / 2 : null;
}

// Method 2: re-anchors the athlete's calibrated slope through a single
// fresh (load, velocity) reading from a normal training session -
// today's intercept is whatever makes the calibrated line pass through
// that one point, then solved for load at mvt the same way as method 1.
// This is what actually makes the estimate trend from ordinary logged
// data after only one calibration, rather than staying a static number
// until the next full profiling session.
export function estimateOneRMFromPoint(slope: number, mvt: number, load: number, velocity: number): number | null {
  if (slope === 0 || !isFinite(slope) || !isFinite(mvt) || !isFinite(load) || !isFinite(velocity)) return null;
  const interceptToday = velocity - slope * load;
  return estimateOneRMFromProfile(slope, interceptToday, mvt);
}
