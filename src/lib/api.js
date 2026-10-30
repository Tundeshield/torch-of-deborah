export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function request(path, { method = "GET", body, signedIn = false } = {}) {
  const headers = { "content-type": "application/json" };
  if (signedIn) {
    const { auth } = await import("./firebase.js");
    const token = await auth?.currentUser?.getIdToken();
    if (!token) throw new ApiError("Sign in to continue.", 401);
    headers.authorization = `Bearer ${token}`;
  }
  let res;
  try {
    res = await fetch(`/api/${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError("We could not reach the server. Check your connection and try again.", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status}).`, res.status, data);
  return data;
}

export const api = {
  register: (body) => request("register", { method: "POST", body }),
  resendLink: (email) => request("register", { method: "POST", body: { action: "resend", email } }),
  welcome: (token) => request(`participant?t=${encodeURIComponent(token)}`),
  participant: (token, action, extra = {}) => request("participant", { method: "POST", body: { token, action, ...extra } }),
  stats: () => request("stats"),
  setup: (body) => request("setup", { method: "POST", body }),
  admin: (action, body = {}) => request("admin", { method: "POST", body: { action, ...body }, signedIn: true }),
};
