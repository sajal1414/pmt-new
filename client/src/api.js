// Small fetch wrapper. Errors carry the server message and per-field messages.
export class ApiError extends Error {
  constructor(message, status, fields) { super(message); this.status = status; this.fields = fields || {}; }
}

async function request(method, url, body) {
  const opts = { method, headers: {} };
  if (body instanceof FormData) opts.body = body;
  else if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  let res;
  try { res = await fetch(url, opts); } catch { throw new ApiError('Can’t reach the Hazdemy server. Make sure it’s running (npm run dev).', 0); }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  // A 401 anywhere else means the session expired: let the auth provider send the user back to the login page.
  if (res.status === 401 && !['/api/login', '/api/me'].includes(url)) window.dispatchEvent(new Event('atlas:signed-out'));
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data.fields);
  return data;
}

export const api = {
  get: (u) => request('GET', u),
  post: (u, b) => request('POST', u, b),
  put: (u, b) => request('PUT', u, b),
  del: (u) => request('DELETE', u)
};
