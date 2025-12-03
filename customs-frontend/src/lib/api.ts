// src/lib/api.ts
const defaultBase = 'http://localhost:8000';
export const API_BASE_URL = (((import.meta as any)?.env?.VITE_API_BASE_URL) || defaultBase).replace(/\/$/, '');

async function http(path: string, { method = 'GET', body, headers, signal }: any = {}) {
  const url = `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

  const init: RequestInit = {
    method,
    // ★ GET/HEAD에는 Content-Type 넣지 않음(불필요한 프리플라이트 방지)
    headers: {
      Accept: 'application/json',
      ...(headers || {}),
    },
    credentials: 'omit', // 쿠키 미사용
    mode: 'cors',
    signal,
  };

  if (body !== undefined) {
    (init.headers as any)['Content-Type'] = 'application/json';
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  } else if (method !== 'GET' && method !== 'HEAD') {
    (init.headers as any)['Content-Type'] = 'application/json';
    init.body = '{}';
  }

  const res = await fetch(url, init);
  const contentType = res.headers.get('content-type') || '';

  if (!res.ok) {
    let detail: string;
    if (contentType.includes('application/json')) {
      try {
        const errorPayload = await res.json();
        detail = errorPayload.detail || errorPayload.message || JSON.stringify(errorPayload);
      } catch {
        detail = res.statusText;
      }
    } else {
      try { detail = await res.text(); } catch { detail = res.statusText; }
    }
    throw new Error(`API ${res.status} ${res.statusText}: ${detail}`);
  }

  if (res.status === 204) return null;
  return contentType.includes('application/json') ? res.json() : res.text();
}

export function getHealth(signal?: AbortSignal) {
  return http('/health', { signal });
}

// ★ 안전 파서: /debug/normalize 응답을 언랩하고 타입/대소문자 보정
export async function getNormalizedTracking(number: string, signal?: AbortSignal) {
  const query = new URLSearchParams({ number: String(number) }).toString();
  const raw = await http(`/debug/normalize?${query}`, { signal });

  // 어떤 래핑이 와도 방어적으로 언랩
  const payload = (raw && typeof raw === 'object' && 'data' in raw) ? (raw as any).data : raw || {};
  const summary = payload?.summary ?? null;

  const normalized =
    Array.isArray(payload?.normalized)
      ? payload.normalized
      : Array.isArray(payload?.events)
        ? payload.events
        : [];

  const any_events = Boolean(payload?.any_events ?? payload?.anyEvents ?? false);
  const tracking_number = payload?.tracking_number ?? number;

  // ★ status/case 보정 + duration 형변환
  if (summary) {
    if (typeof summary.status === 'string') {
      summary.status = summary.status.toUpperCase();
    } else {
      summary.status = 'UNKNOWN';
    }
    if (typeof summary.duration_sec === 'string') {
      const n = parseInt(summary.duration_sec, 10);
      summary.duration_sec = Number.isFinite(n) ? n : null;
    }
  }

  return { ok: payload?.ok ?? true, tracking_number, summary, normalized, any_events };
}

export function triggerTestWebhook(params: Record<string, any> = {}, signal?: AbortSignal) {
  return http('/test/webhook', {
    method: 'POST',
    body: params,
    signal,
  });
}
