export const API_BASE = import.meta.env.VITE_API_BASE || '';

// Enable .NET backend only when VITE_BACKEND_ENABLED=true is explicitly set.
// Default is false so the app works locally via the Express server on port 3000.
export const BACKEND_ENABLED = import.meta.env.VITE_BACKEND_ENABLED === 'true';

export function apiUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE}${cleanPath}`;
}
