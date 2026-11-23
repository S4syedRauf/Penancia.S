export const API_BASE = import.meta.env?.VITE_API_BASE || '';

// Enable .NET backend only when VITE_BACKEND_ENABLED=true is explicitly set.
// Default is false so the app works locally via the Express server on port 3000.
export const BACKEND_ENABLED = import.meta.env?.VITE_BACKEND_ENABLED === 'true';

// ISS-011: heuristic estimates were removed from results. Do not enable.
export const ENABLE_HEURISTIC_MORPHOLOGY = false;

// ISS-014: demo pipeline quarantine. Default false — production builds never serve fixture-seed results.
export const DEMO_MODE = import.meta.env?.VITE_DEMO_MODE === 'true';

export function apiUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${cleanPath}`;
}
