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
      try { detail = await res.text(); } catch { detail = res.statusText; }
    }
    throw new Error(`API ${res.status} ${res.statusText}: ${detail}`);
  }

  if (res.status === 204) return null;
  if (contentType.includes("application/json")) return res.json();
  return res.text();
}

// ========== Admin & User (원본 유지) ==========
export function adminSeedSample10(signal) {
  return http("/admin/seed-sample-10", { method: "POST", signal });
}

// 구버튼 호환: 내부적으로 새 동기화 엔드포인트 호출하도록 라우팅
export function adminFetch17track10(signal) {
  return adminSyncFromFile(signal);
}

export function adminRegister17track10(signal) {
  return http("/admin/register-17track-10", { method: "POST", signal });
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

export function triggerTestWebhook(params = {}, signal) {
  return http("/test/webhook", {
    method: "POST",
    body: params,
    signal,
  });
}

// ========== 새로 추가 ==========

// 1) DB 동기화 (백엔드: /admin/fetch-from-file)
export function adminSyncFromFile(params = {}, signal) {
  const qs = new URLSearchParams();
  if (params.path) qs.set("path", params.path);
  if (params.batch) qs.set("batch", String(params.batch));
  const q = qs.toString() ? `?${qs.toString()}` : "";
  return http(`/admin/fetch-from-file${q}`, { method: "POST", signal });
}

// 2) DB 목록 (백엔드: /user/trackings 응답 → 화면 공통 형태로 변환)
export async function adminListTrackings(signal) {
  const raw = await userListTrackings(signal).catch(() => []);
  if (!Array.isArray(raw)) return [];

  return raw.map((r) => {
    const number =
      r.number || r.tracking_number || r.trackingNumber || r.no || r.id || "";

    const status =
      r.status || r.last_status || r.summary?.status || "UNKNOWN";

    const last_event_text =
      r.last_event ||
      r.lastEvent ||
      r.last_event_text ||
      r.lastEventText ||
      r.summary?.delays?.[0]?.hint ||
      (Array.isArray(r.normalized) && r.normalized.length > 0
        ? r.normalized[r.normalized.length - 1]?.desc
        : "") ||
      "";

    const last_event_at =
      r.last_event_at ||
      r.lastEventAt ||
      r.updated_at ||
      r.updatedAt ||
      r.summary?.cleared_at ||
      r.summary?.in_progress_at ||
      (Array.isArray(r.normalized) && r.normalized.length > 0
        ? r.normalized[r.normalized.length - 1]?.ts
        : null);

    const source =
      r.source ??
      (typeof r.any_events !== "undefined"
        ? r.any_events ? "17TRACK" : "DB"
        : "DB");

    return {
      number: String(number),
      status: String(status).toUpperCase(),
      last_event_text,
      last_event_at,
      source,
    };
  });
}