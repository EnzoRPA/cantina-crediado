export const getImageUrl = (path: string | null) => {
  if (!path) return null;

  // Already a full URL or base64 data URI — return as-is
  if (path.startsWith('http') || path.startsWith('data:')) return path;

  // Use the API URL base, but remove /api if it exists to point to the static root
  const baseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:3000/api').replace(/\/api$/, '').replace(/\/api\/$/, '');

  // Ensure the path starts with /
  const sanitizedPath = path.startsWith('/') ? path : `/${path}`;

  return `${baseUrl}${sanitizedPath}`;
};
