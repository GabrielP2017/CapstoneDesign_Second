const defaultBase = "http://localhost:8000";
const API_BASE_URL = (import.meta.env?.VITE_API_BASE_URL || defaultBase).replace(/\/$/, "");

async function http(path, { method = "GET", body, headers, signal } = {}) {
  const url = `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const init = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(headers || {}),
    },
    signal,
  };

  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  } else if (method !== "GET" && method !== "HEAD") {
    init.body = "{}";
  }

  const res = await fetch(url, init);
  const contentType = res.headers.get("content-type") || "";
  if (!res.ok) {
    let detail;
    if (contentType.includes("application/json")) {
      try {
        const errorPayload = await res.json();
        detail = errorPayload.detail || errorPayload.message || JSON.stringify(errorPayload);
      } catch (error) {
        detail = res.statusText;
      }
    } else {
      detail = await res.text();
    }
    throw new Error(`API ${res.status} ${res.statusText}: ${detail}`);
  }

  if (res.status === 204) {
    return null;
  }

  if (contentType.includes("application/json")) {
    return res.json();
  }

  return res.text();
}
// === Admin & User ===
export function adminSeedSample10(signal) {
  return http("/admin/seed-sample-10", { method: "POST", signal });
}

export function adminFetch17track10(signal) {
  return http("/admin/fetch-17track-10", { method: "POST", signal });
}

export function adminListTrackings(signal) {
  return http("/admin/trackings", { signal });
}

export function userListTrackings(signal) {
  return http("/user/trackings", { signal });
}
export function getHealth(signal) {
  return http("/health", { signal });
}

export function getNormalizedTracking(number, signal) {
  const query = new URLSearchParams({ number }).toString();
  return http(`/debug/normalize?${query}`, { signal });
}
export function adminRegister17track10(signal) {
  return http("/admin/register-17track-10", { method: "POST", signal });
}
export function triggerTestWebhook(params = {}, signal) {
  return http("/test/webhook", {
    method: "POST",
    body: params,
    signal,
  });
}
