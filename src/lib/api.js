export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

async function request(path, { body, signedIn = false } = {}) {
  const headers = { "content-type": "application/json" };
  if (signedIn) {
    const { auth } = await import("./firebase.js");
    const token = await auth?.currentUser?.getIdToken();
    if (!token) throw new ApiError("Sign in to continue.", 401);
    headers.authorization = `Bearer ${token}`;
  }
  let res;
  try {
    res = await fetch(`/api/${path}`, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError("We couldn't reach the server. Check your connection and try again.", 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Something went wrong (${res.status}).`, res.status, data);
  return data;
}

export const api = {
  register: (body) => request("register", { body }),
  myHub: (deviceKey) => request("find", { body: { deviceKey } }),
  site: () => request("site"),
  me: () => request("me", { body: {}, signedIn: true }),
  admin: (action, body = {}) => request("admin", { body: { action, ...body }, signedIn: true }),
};
