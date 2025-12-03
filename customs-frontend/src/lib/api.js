// 개발 환경: localhost, 프로덕션: 상대 경로 사용 (현재 프로토콜 따라감)
// 프로덕션에서는 상대 경로를 사용하여 Mixed Content 문제 방지
function getApiBaseUrl() {
  // 환경 변수가 명시적으로 설정된 경우 사용
  if (import.meta.env?.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL.replace(/\/$/, "");
  }
  
  // 프로덕션 모드: 항상 상대 경로 사용 (HTTPS 페이지에서는 자동으로 HTTPS로 요청)
  if (import.meta.env?.MODE === "production") {
    return "/api";
  }
  
  // 개발 모드: localhost 사용
  return "http://localhost:8000";
}

export const API_BASE_URL = getApiBaseUrl();

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
        detail =
          errorPayload.detail ||
          errorPayload.message ||
          JSON.stringify(errorPayload);
      } catch (error) {
        detail = res.statusText;
      }
    } else {
      try {
        detail = await res.text();
      } catch {
        detail = res.statusText;
      }
    }
    throw new Error(`API ${res.status} ${res.statusText}: ${detail}`);
  }

  if (res.status === 204) return null;
  if (contentType.includes("application/json")) return res.json();
  return res.text();
}

// ========== Admin & User (관리자/사용자 공용) ==========
export function adminSeedSample10(signal) {
  return http("/admin/seed-sample-10", { method: "POST", signal });
}

// 17TRACK JSON 파일을 DB와 동기화
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

// ========== 관리자 전용 도구 ==========

// 1) JSON 파일을 DB로 적재 (기본 경로: tracking_numbers.json)
export function adminSyncFromFile(params = {}, signal) {
  const qs = new URLSearchParams();
  if (params.path) qs.set("path", params.path);
  if (params.batch) qs.set("batch", String(params.batch));
  const q = qs.toString() ? `?${qs.toString()}` : "";
  return http(`/admin/fetch-from-file${q}`, { method: "POST", signal });
}

// 2) 사용자 목록 API를 관리자 테이블 형태로 가공
export async function adminListTrackings(signal) {
  const raw = await userListTrackings(signal).catch(() => []);
  if (!Array.isArray(raw)) return [];

  return raw.map((r) => {
    const number =
      r.number || r.tracking_number || r.trackingNumber || r.no || r.id || "";

    const status = r.status || r.last_status || r.summary?.status || "UNKNOWN";

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
        ? r.any_events
          ? "17TRACK"
          : "DB"
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

export function adminGetShipmentEvents(number, signal) {
  return http(`/admin/shipments/${encodeURIComponent(number)}/events`, {
    signal,
  });
}

export function adminGetShipmentDetails(number, signal) {
  return http(`/admin/shipments/${encodeURIComponent(number)}/details`, {
    signal,
  });
}

export function adminSaveShipmentDetails(number, payload) {
  return http(`/admin/shipments/${encodeURIComponent(number)}/details`, {
    method: "PUT",
    body: payload,
  });
}

// ========== 실시간 이벤트 / BE4 ==========

export function getRecentEvents(limit = 20, trackingNumbers = null, signal) {
  const query = new URLSearchParams({ limit: String(limit) });
  if (
    trackingNumbers &&
    Array.isArray(trackingNumbers) &&
    trackingNumbers.length > 0
  ) {
    query.set("tracking_numbers", trackingNumbers.join(","));
  }
  return http(`/api/recent-events?${query.toString()}`, { signal });
}

export function getRuleLibrary(signal) {
  return http("/be4/rules/library", { signal });
}

export function evaluateRule(payload, signal) {
  return http("/be4/rules/evaluate", {
    method: "POST",
    body: payload,
    signal,
  });
}

export function getRegulationNotices(params = {}, signal) {
  const qs = new URLSearchParams();
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.category) qs.set("category", params.category);
  if (params.source) qs.set("source", params.source);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return http(`/be4/notices${suffix}`, { signal });
}

export function getNoticeHighlights(limit = 3, signal) {
  const query = new URLSearchParams({ limit: String(limit) }).toString();
  return http(`/be4/notices/highlights?${query}`, { signal });
}

export function refreshRegulationNotices(signal) {
  return http("/be4/notices/refresh", { method: "POST", signal });
}

// ========== 배송 예측 API ==========

export function predictDelivery(payload, signal) {
  return http("/api/predict-delivery", {
    method: "POST",
    body: payload,
    signal,
  });
}
