export const API_BASE = import.meta.env?.VITE_API_BASE || '';

// Enable .NET backend only when VITE_BACKEND_ENABLED=true is explicitly set.
// Default is false so the app works locally via the Express server on port 3000.
export const BACKEND_ENABLED = import.meta.env?.VITE_BACKEND_ENABLED === 'true';

// ISS-011: heuristic estimates were removed from results. Do not enable.
export const ENABLE_HEURISTIC_MORPHOLOGY = false;

// ISS-014: demo pipeline quarantine. Default false — production builds never serve fixture-seed results.
// Reads from process.env.DEMO_MODE (Node/server) or import.meta.env.VITE_DEMO_MODE (browser).
// Server-side enforcement uses process.env.DEMO_MODE; browser display only uses VITE_DEMO_MODE.
const envDemoMode = (typeof process !== 'undefined' && process.env?.DEMO_MODE === 'true')
  || import.meta.env?.VITE_DEMO_MODE === 'true';
export const DEMO_MODE = envDemoMode;

export function apiUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${cleanPath}`;
}
