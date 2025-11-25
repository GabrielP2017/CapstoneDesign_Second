import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  FileCheck,
  Gauge,
  Info,
  ListChecks,
  Loader2,
  RefreshCw,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";
import {
  evaluateRule,
  getRuleLibrary,
  refreshRegulationNotices,
} from "../../lib/api";

const SHIPPING_OPTIONS = [
  { value: "express", label: "특송 (DHL/UPS/EMS)" },
  { value: "postal", label: "우편 (K-packet/등기)" },
];

const RECIPIENT_OPTIONS = [
  { value: "personal", label: "개인" },
  { value: "business", label: "사업자" },
];

const BASE_FORM = {
  declared_value: 120,
  currency: "USD",
  origin_country: "US",
  shipping_method: "express",
  recipient_type: "personal",
  product_category: "general_goods",
  same_day_combined: false,
};

const PRESET_SCENARIOS = [
  {
    label: "미국 특송 $120 (면세)",
    values: { ...BASE_FORM },
  },
  {
    label: "미국 특송 $220 (과세)",
    values: { ...BASE_FORM, declared_value: 220 },
  },
  {
    label: "건강기능식품 $100 (목록 배제)",
    values: {
      ...BASE_FORM,
      product_category: "health_food",
      declared_value: 100,
    },
  },
  {
    label: "동일입항 합산",
    values: { ...BASE_FORM, same_day_combined: true },
  },
];

const riskBadgeClass = (risk = "LOW") => {
  switch (risk) {
    case "HIGH":
      return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200";
    case "MEDIUM":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200";
    default:
      return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200";
  }
};

const riskIcon = (risk = "LOW") => {
  switch (risk) {
    case "HIGH":
      return AlertTriangle;
    case "MEDIUM":
      return Gauge;
    default:
      return ShieldCheck;
  }
};

const riskBorderClass = (risk = "LOW") => {
  switch (risk) {
    case "HIGH":
      return "border-red-300 dark:border-red-700/60";
    case "MEDIUM":
      return "border-amber-300 dark:border-amber-700/60";
    default:
      return "border-emerald-300 dark:border-emerald-700/60";
  }
};

const prettyHostname = (url) => {
  if (!url) return "link";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch (error) {
    return url;
  }
};

function CustomsPredictor() {
  const [form, setForm] = useState(BASE_FORM);
  const [library, setLibrary] = useState({ categories: [], rules: [], rates: {} });
  const [libraryError, setLibraryError] = useState(null);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [result, setResult] = useState(null);
  const [evaluating, setEvaluating] = useState(false);
  const [evaluateError, setEvaluateError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    async function loadLibrary() {
      setLibraryLoading(true);
      try {
        const payload = await getRuleLibrary(controller.signal);
        setLibrary({
          categories: payload?.category_profiles || [],
          rules: payload?.rule_entries || [],
          rates: payload?.currency_rates || {},
        });
        setLibraryError(null);
      } catch (error) {
        setLibraryError(error.message || "규칙 사전을 불러오지 못했습니다.");
      } finally {
        setLibraryLoading(false);
      }
    }
    loadLibrary();
    return () => controller.abort();
  }, []);

  const currencyOptions = useMemo(() => {
    const entries = Object.entries(library.rates || {});
    const options = entries.sort((a, b) => a[0].localeCompare(b[0])).map(([code]) => code);
    return options.length ? options : ["USD", "KRW"];
  }, [library.rates]);

  const categoryOptions = useMemo(() => {
    return (library.categories || []).map((cat) => ({
      value: cat.id,
      label: cat.title,
      risk: cat.base_risk || "LOW",
      notes: cat.notes,
    }));
  }, [library.categories]);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setEvaluating(true);
    setEvaluateError(null);
    try {
      const payload = {
        ...form,
        declared_value: Number(form.declared_value),
      };
      const response = await evaluateRule(payload);
      setResult(response);
      setLastUpdated(new Date());
    } catch (error) {
      setEvaluateError(error.message || "평가에 실패했습니다.");
      setResult(null);
    } finally {
      setEvaluating(false);
    }
  };

  const handlePreset = (values) => {
    setForm(values);
    setResult(null);
  };

  const handleRefreshNotices = async () => {
    try {
      await refreshRegulationNotices();
    } catch (error) {
      console.warn("Notice refresh failed", error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white/80 dark:bg-slate-900/80 border border-slate-200/50 dark:border-slate-700/60 rounded-2xl p-6 backdrop-blur-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
              관세/통관 규칙 엔진
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              물품 정보를 입력하면 위험 라벨, 예상 세금, 근거 링크를 자동으로 제공합니다.
            </p>
          </div>
          <button
            onClick={handleRefreshNotices}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-200"
          >
            <RefreshCw className="w-4 h-4" />
            공지 새로고침
          </button>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <form
            onSubmit={handleSubmit}
            className="lg:col-span-2 space-y-5"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex flex-col text-sm font-medium text-slate-700 dark:text-slate-200">
                신고 금액
                <div className="flex gap-2 mt-1">
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    value={form.declared_value}
                    onChange={(e) => handleChange("declared_value", e.target.value)}
                    className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                  <select
                    value={form.currency}
                    onChange={(e) => handleChange("currency", e.target.value)}
                    className="w-28 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {currencyOptions.map((code) => (
                      <option key={code} value={code}>
                        {code}
                      </option>
                    ))}
                  </select>
                </div>
              </label>

              <label className="flex flex-col text-sm font-medium text-slate-700 dark:text-slate-200">
                발송국가
                <input
                  type="text"
                  value={form.origin_country}
                  onChange={(e) => handleChange("origin_country", e.target.value.toUpperCase())}
                  className="mt-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                  placeholder="US"
                  required
                />
              </label>

              <label className="flex flex-col text-sm font-medium text-slate-700 dark:text-slate-200">
                배송수단
                <select
                  value={form.shipping_method}
                  onChange={(e) => handleChange("shipping_method", e.target.value)}
                  className="mt-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {SHIPPING_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col text-sm font-medium text-slate-700 dark:text-slate-200">
                수취인 유형
                <select
                  value={form.recipient_type}
                  onChange={(e) => handleChange("recipient_type", e.target.value)}
                  className="mt-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {RECIPIENT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                품목 분류
              </label>
              <select
                value={form.product_category}
                onChange={(e) => handleChange("product_category", e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {categoryOptions.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                분류별 관세율과 특이 요건이 자동으로 반영됩니다.
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={form.same_day_combined}
                onChange={(e) => handleChange("same_day_combined", e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              동일 입항 합산 위험이 있는 주문입니다.
            </label>

            <div className="flex flex-wrap gap-2">
              {PRESET_SCENARIOS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => handlePreset(preset.values)}
                  className="px-3 py-1.5 rounded-full text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 border border-transparent hover:border-blue-200"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                * 계산 결과는 참고용이며 최종 세액은 관세청 고시를 따릅니다.
              </p>
              <button
                type="submit"
                disabled={evaluating}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-70 disabled:cursor-not-allowed"
              >
                {evaluating && <Loader2 className="w-4 h-4 animate-spin" />}
                결과 계산
              </button>
            </div>
          </form>

          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/60 p-4">
              <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <Info className="w-4 h-4" />
                규칙 사전 현황
              </div>
              {libraryLoading ? (
                <div className="mt-4 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  불러오는 중...
                </div>
              ) : libraryError ? (
                <p className="mt-3 text-sm text-red-500 dark:text-red-300">
                  {libraryError}
                </p>
              ) : (
                <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                  <li>통화: {currencyOptions.length}종 지원</li>
                  <li>분류: {categoryOptions.length}개</li>
                  <li>규칙: {library.rules.length}개</li>
                </ul>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-800/70 p-4">
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-100 flex items-center gap-2">
                <ListChecks className="w-4 h-4" />
                적용 규칙
              </h4>
              <div className="mt-3 max-h-72 overflow-y-auto space-y-3 text-sm">
                {library.rules.slice(0, 5).map((rule) => (
                  <div
                    key={rule.id}
                    className="p-3 rounded-xl bg-slate-100/60 dark:bg-slate-900/40 border border-slate-200/60 dark:border-slate-700/40"
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-slate-800 dark:text-slate-100">
                        {rule.title}
                      </p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${riskBadgeClass(rule.risk_level)}`}>
                        {rule.risk_label}
                      </span>
                    </div>
                    <p className="mt-1 text-slate-600 dark:text-slate-300 text-xs">
                      {rule.summary}
                    </p>
                  </div>
                ))}
                {library.rules.length === 0 && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    규칙 정보가 아직 없습니다.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/70 p-6 backdrop-blur">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              평가 결과
            </h3>
            {lastUpdated && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {lastUpdated.toLocaleString("ko-KR")}
              </p>
            )}
          </div>
          {evaluateError && (
            <p className="mt-3 text-sm text-red-500 dark:text-red-300">{evaluateError}</p>
          )}
          {result ? (() => {
            const breakdown = result.expected_tax_breakdown || {
              dutiable_value_krw: 0,
              duty: 0,
              vat: 0,
              special_tax: 0,
              estimated_total_tax: 0,
            };
            return (
            <div className="mt-5 space-y-4">
              <div className={`p-4 rounded-2xl border ${riskBorderClass(result.risk_level)}`}>
                <div className="flex items-center gap-3">
                  {(() => {
                    const Icon = riskIcon(result.risk_level);
                    return <Icon className="w-6 h-6 text-current" />;
                  })()}
                  <div>
                    <p className="text-sm text-slate-700 dark:text-slate-200">
                      위험 라벨
                    </p>
                    <p className="text-xl font-semibold text-slate-900 dark:text-white">
                      {result.risk_label}
                    </p>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                  <p className="text-xs text-slate-500 dark:text-slate-400">예상 세금</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
                    {result.expected_tax_krw.toLocaleString("ko-KR")} 원
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    과세표준 {breakdown.dutiable_value_krw.toLocaleString("ko-KR")} 원
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                  <p className="text-xs text-slate-500 dark:text-slate-400">환산 금액</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">
                    {result.converted_value_krw.toLocaleString("ko-KR")} 원
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    면세 한도 {result.duty_free_limit_usd} USD
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">세액 내역</p>
                <ul className="mt-2 text-sm text-slate-700 dark:text-slate-200 space-y-1">
                  <li>관세: {breakdown.duty.toLocaleString("ko-KR")} 원</li>
                  <li>부가세: {breakdown.vat.toLocaleString("ko-KR")} 원</li>
                  <li>개별소비세 등: {breakdown.special_tax.toLocaleString("ko-KR")} 원</li>
                </ul>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">조치/유의사항</p>
                <p className="text-sm text-slate-700 dark:text-slate-200">{result.advisory}</p>
              </div>
            </div>
            );
          })() : (
            <div className="mt-6 text-sm text-slate-500 dark:text-slate-400">
              평가 버튼을 눌러 결과를 확인하세요.
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/70 p-6 space-y-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <FileCheck className="w-5 h-5" />
            근거 및 참고 링크
          </h3>
          {result ? (
            <>
              <div className="space-y-3">
                {result.applied_rules.map((rule) => (
                  <div key={rule.id} className="border border-slate-200 dark:border-slate-800 rounded-xl p-3 bg-slate-50/70 dark:bg-slate-800/60">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {rule.title}
                      </p>
                      <span className={`text-2xs px-2 py-0.5 rounded-full ${riskBadgeClass(rule.risk_level)}`}>
                        {rule.risk_label}
                      </span>
                    </div>
                    {rule.summary && (
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                        {rule.summary}
                      </p>
                    )}
                    {rule.reference_urls?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        {rule.reference_urls.map((link) => (
                          <a
                            key={link}
                            href={link}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-500 dark:text-blue-300"
                          >
                            근거
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {result.basis_links?.length > 0 && (
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">관련 문서</p>
                  <div className="flex flex-wrap gap-2">
                    {result.basis_links.map((link) => (
                      <a
                        key={link}
                        href={link}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700 text-blue-600 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                      >
                        {prettyHostname(link)}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              결과를 계산하면 적용된 규칙과 근거 링크가 이곳에 표시됩니다.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default CustomsPredictor;
