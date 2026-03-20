import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useSettingsStore } from "../../store/useSettingsStore.js";
import { fetchHistory, fetchQuotes } from "../../utils/marketData.js";

// ─── Constants ────────────────────────────────────────────────────────────────
const BENCHMARKS = [
  { id: "SPY", label: "S&P 500"      },
  { id: "QQQ", label: "Nasdaq 100"   },
  { id: "IWM", label: "Russell 2000" },
  { id: "VTI", label: "Total Market" },
  { id: "RSP", label: "Equal-Weight" },
];

const SECTORS = [
  { id: "XLK",  label: "Technology",      ticker: "XLK",  color: "#4db8ff" },
  { id: "XLV",  label: "Health Care",     ticker: "XLV",  color: "#00e5a0" },
  { id: "XLF",  label: "Financials",      ticker: "XLF",  color: "#ffaa00" },
  { id: "XLY",  label: "Cons. Discret.",  ticker: "XLY",  color: "#ff6b9d" },
  { id: "XLP",  label: "Cons. Staples",   ticker: "XLP",  color: "#a78bfa" },
  { id: "XLE",  label: "Energy",          ticker: "XLE",  color: "#f59e0b" },
  { id: "XLI",  label: "Industrials",     ticker: "XLI",  color: "#6ee7b7" },
  { id: "XLB",  label: "Materials",       ticker: "XLB",  color: "#fca5a5" },
  { id: "XLRE", label: "Real Estate",     ticker: "XLRE", color: "#93c5fd" },
  { id: "XLU",  label: "Utilities",       ticker: "XLU",  color: "#d9f99d" },
  { id: "XLC",  label: "Comm. Services",  ticker: "XLC",  color: "#fb923c" },
];

const INDUSTRIES = [
  // ── Technology ──────────────────────────────────────────
  { id: "XSD",   label: "Semis Equal Wt",       ticker: "XSD",   color: "#4db8ff" },
  { id: "IGV",   label: "Software",             ticker: "IGV",   color: "#3b82f6" },
  { id: "XSW",   label: "Software (EW)",        ticker: "XSW",   color: "#60a5fa" },
  { id: "WCLD",  label: "Cloud",                ticker: "WCLD",  color: "#818cf8" },
  { id: "CIBR",  label: "Cybersecurity",        ticker: "CIBR",  color: "#c4b5fd" },
  { id: "ROBO",  label: "Robotics",             ticker: "ROBO",  color: "#ddd6fe" },
  { id: "DRIV",  label: "Autonomous & EV",      ticker: "DRIV",  color: "#6ee7b7" },
  { id: "BLOK",  label: "Blockchain",           ticker: "BLOK",  color: "#fbbf24" },
  // ── Financials ──────────────────────────────────────────
  { id: "KBE",   label: "Banks",                ticker: "KBE",   color: "#ffaa00" },
  { id: "KRE",   label: "Regional Banks",       ticker: "KRE",   color: "#fef08a" },
  { id: "KIE",   label: "Insurance",            ticker: "KIE",   color: "#fcd34d" },
  { id: "IPAY",  label: "Digital Payments",     ticker: "IPAY",  color: "#fb923c" },
  { id: "GBTC",  label: "Bitcoin Trust",        ticker: "GBTC",  color: "#f59e0b" },
  // ── Healthcare ──────────────────────────────────────────
  { id: "XBI",   label: "Biotech",              ticker: "XBI",   color: "#00e5a0" },
  { id: "IHI",   label: "Med Devices",          ticker: "IHI",   color: "#34d399" },
  { id: "XHS",   label: "Healthcare Services",  ticker: "XHS",   color: "#22d3ee" },
  { id: "XHE",   label: "Healthcare Equipment", ticker: "XHE",   color: "#67e8f9" },
  // ── Energy ──────────────────────────────────────────────
  { id: "XOP",   label: "Oil & Gas E&P",        ticker: "XOP",   color: "#d97706" },
  { id: "XES",   label: "Oil Equipment",        ticker: "XES",   color: "#b45309" },
  { id: "USO",   label: "Crude Oil",            ticker: "USO",   color: "#92400e" },
  { id: "PBW",   label: "Clean Energy",         ticker: "PBW",   color: "#86efac" },
  { id: "RSPG",  label: "EW Energy",            ticker: "RSPG",  color: "#f97316" },
  // ── Materials ───────────────────────────────────────────
  { id: "XME",   label: "Metals & Mining",      ticker: "XME",   color: "#94a3b8" },
  { id: "SLX",   label: "Steel",                ticker: "SLX",   color: "#cbd5e1" },
  { id: "COPX",  label: "Copper Miners",        ticker: "COPX",  color: "#f87171" },
  { id: "GNR",   label: "Natural Resources",    ticker: "GNR",   color: "#a3e635" },
  { id: "RSPM",  label: "EW Materials",         ticker: "RSPM",  color: "#84cc16" },
  // ── Industrials & Transport ─────────────────────────────
  { id: "XAR",   label: "Aerospace & Defense",  ticker: "XAR",   color: "#64748b" },
  { id: "PAVE",  label: "Infrastructure",       ticker: "PAVE",  color: "#e2e8f0" },
  { id: "JETS",  label: "Airlines",             ticker: "JETS",  color: "#bfdbfe" },
  { id: "XTN",   label: "Transportation",       ticker: "XTN",   color: "#93c5fd" },
  { id: "BOAT",  label: "Global Shipping",      ticker: "BOAT",  color: "#7dd3fc" },
  { id: "RSPN",  label: "EW Industrials",       ticker: "RSPN",  color: "#475569" },
  // ── Consumer ────────────────────────────────────────────
  { id: "XHB",   label: "Homebuilders",         ticker: "XHB",   color: "#ff6b9d" },
  { id: "XRT",   label: "Retail",               ticker: "XRT",   color: "#fb7185" },
  { id: "IBUY",  label: "Online Retail",        ticker: "IBUY",  color: "#e879f9" },
  { id: "PBJ",   label: "Food & Beverage",      ticker: "PBJ",   color: "#fda4af" },
  { id: "PEJ",   label: "Leisure & Entertain.", ticker: "PEJ",   color: "#f9a8d4" },
  { id: "RSPD",  label: "EW Consumer Disc",     ticker: "RSPD",  color: "#ec4899" },
  { id: "RSPS",  label: "EW Consumer Staples",  ticker: "RSPS",  color: "#f0abfc" },
  // ── Agriculture ─────────────────────────────────────────
  { id: "MOO",   label: "Agribusiness",         ticker: "MOO",   color: "#4ade80" },
  // ── Telecom / Comm / Other ──────────────────────────────
  { id: "XTL",   label: "Telecom",              ticker: "XTL",   color: "#d946ef" },
  { id: "BUZZ",  label: "Social Media",         ticker: "BUZZ",  color: "#f472b6" },
  { id: "FFTY",  label: "IBD Innovators",       ticker: "FFTY",  color: "#8b5cf6" },
  // ── Broad Indices ───────────────────────────────────────
  { id: "IWM",   label: "Russell 2000",         ticker: "IWM",   color: "#38bdf8" },
  { id: "QQQE",  label: "Equal Wt Nasdaq",      ticker: "QQQE",  color: "#a78bfa" },
  { id: "RSP",   label: "Equal Wt S&P 500",     ticker: "RSP",   color: "#cbd5e1" },
  // ── Equal Weight Sectors ────────────────────────────────
  { id: "RSPT",  label: "EW Technology",        ticker: "RSPT",  color: "#3b82f6" },
  { id: "RSPH",  label: "EW Health Care",       ticker: "RSPH",  color: "#10b981" },
  { id: "RSPF",  label: "EW Financials",        ticker: "RSPF",  color: "#fbbf24" },
  { id: "RSPU",  label: "EW Utilities",         ticker: "RSPU",  color: "#d9f99d" },
  { id: "RSPR",  label: "EW Real Estate",       ticker: "RSPR",  color: "#fca5a5" },
  { id: "RSPC",  label: "EW Comm Services",     ticker: "RSPC",  color: "#c026d3" },
  // ── China ───────────────────────────────────────────────
  { id: "FXI",   label: "China Large Cap",      ticker: "FXI",   color: "#ef4444" },
  { id: "GXC",   label: "China All Cap",        ticker: "GXC",   color: "#fca5a5" },
];

const THEMES = [
  // ── Metals & Resources ──────────────────────────────────
  { id: "GDX",   label: "Gold Miners",          ticker: "GDX",   color: "#fcd34d" },
  { id: "SLV",   label: "Silver",               ticker: "SLV",   color: "#d4d4d8" },
  { id: "URNM",  label: "Uranium Miners",       ticker: "URNM",  color: "#fef08a" },
  { id: "NLR",   label: "Nuclear Energy",       ticker: "NLR",   color: "#bef264" },
  { id: "REMX",  label: "Rare Earth Metals",    ticker: "REMX",  color: "#a3e635" },
  { id: "DBC",   label: "Commodities",          ticker: "DBC",   color: "#d97706" },
  // ── Clean Energy ────────────────────────────────────────
  { id: "ICLN",  label: "Clean Energy",         ticker: "ICLN",  color: "#00e5a0" },
  { id: "TAN",   label: "Solar",                ticker: "TAN",   color: "#86efac" },
  { id: "LIT",   label: "Lithium & Battery",    ticker: "LIT",   color: "#22d3ee" },
  { id: "PHO",   label: "Water",                ticker: "PHO",   color: "#7dd3fc" },
  // ── Semiconductors ──────────────────────────────────────
  { id: "SMH",   label: "Semis (SMH)",          ticker: "SMH",   color: "#4db8ff" },
  { id: "SOXX",  label: "Semis (SOXX)",         ticker: "SOXX",  color: "#7c3aed" },
  // ── Tech Themes ─────────────────────────────────────────
  { id: "BOTZ",  label: "Robotics & AI",        ticker: "BOTZ",  color: "#6ee7b7" },
  { id: "QTUM",  label: "Quantum Computing",    ticker: "QTUM",  color: "#c084fc" },
  { id: "BUG",   label: "Cybersecurity",        ticker: "BUG",   color: "#ff4d6d" },
  { id: "SKYY",  label: "Cloud Computing",      ticker: "SKYY",  color: "#60a5fa" },
  { id: "DTCR",  label: "Data Centers",         ticker: "DTCR",  color: "#0ea5e9" },
  { id: "SNSR",  label: "IoT",                  ticker: "SNSR",  color: "#67e8f9" },
  { id: "METV",  label: "Metaverse",            ticker: "METV",  color: "#a78bfa" },
  { id: "ESPO",  label: "Video Games",          ticker: "ESPO",  color: "#818cf8" },
  { id: "FDN",   label: "Internet",             ticker: "FDN",   color: "#93c5fd" },
  { id: "ONLN",  label: "Online Retail",        ticker: "ONLN",  color: "#e879f9" },
  { id: "VOX",   label: "Communication Svcs",   ticker: "VOX",   color: "#d946ef" },
  // ── ARK ─────────────────────────────────────────────────
  { id: "ARKK",  label: "ARK Innovation",       ticker: "ARKK",  color: "#38bdf8" },
  { id: "ARKF",  label: "ARK Fintech",          ticker: "ARKF",  color: "#0284c7" },
  { id: "ARKG",  label: "ARK Genomics",         ticker: "ARKG",  color: "#06b6d4" },
  // ── Crypto ──────────────────────────────────────────────
  { id: "BTF",   label: "Crypto & Blockchain",  ticker: "BTF",   color: "#fbbf24" },
  // ── Space ───────────────────────────────────────────────
  { id: "UFO",   label: "Space Exploration",    ticker: "UFO",   color: "#e0e7ff" },
  { id: "ROKT",  label: "Space & Rocket",       ticker: "ROKT",  color: "#c7d2fe" },
  // ── Agriculture ─────────────────────────────────────────
  { id: "KROP",  label: "Agriculture",          ticker: "KROP",  color: "#4ade80" },
  // ── China / EM ──────────────────────────────────────────
  { id: "KWEB",  label: "China Internet",       ticker: "KWEB",  color: "#f87171" },
  { id: "EMQQ",  label: "EM Internet",          ticker: "EMQQ",  color: "#fb7185" },
  { id: "MCHI",  label: "China Large Cap",      ticker: "MCHI",  color: "#fca5a5" },
  { id: "EWY",   label: "South Korea",          ticker: "EWY",   color: "#fda4af" },
  // ── Niche / Alternative ─────────────────────────────────
  { id: "BJK",   label: "Casinos / Gambling",   ticker: "BJK",   color: "#f472b6" },
  { id: "MJ",    label: "Cannabis",             ticker: "MJ",    color: "#34d399" },
  { id: "AGNG",  label: "Aging / Longevity",    ticker: "AGNG",  color: "#f9a8d4" },
  { id: "IPOS",  label: "IPO Tracker",          ticker: "IPOS",  color: "#fb923c" },
  { id: "TOLZ",  label: "Global Infrastructure",ticker: "TOLZ",  color: "#94a3b8" },
  { id: "PBE",   label: "Biotech",              ticker: "PBE",   color: "#10b981" },
];

// ─── Quadrant helpers ─────────────────────────────────────────────────────────
const getQ = (rs, rm) =>
  rs >= 100 && rm >= 100 ? "leading"
  : rs < 100 && rm >= 100 ? "improving"
  : rs < 100 && rm < 100  ? "lagging"
  : "weakening";

const Q_STYLE = {
  leading:   { color: "#00e5a0", bg: "rgba(0,229,160,0.12)",  border: "rgba(0,229,160,0.35)",  label: "LEADING"   },
  improving: { color: "#4db8ff", bg: "rgba(77,184,255,0.12)", border: "rgba(77,184,255,0.35)", label: "IMPROVING" },
  lagging:   { color: "#ff4d6d", bg: "rgba(255,77,109,0.12)", border: "rgba(255,77,109,0.35)", label: "LAGGING"   },
  weakening: { color: "#ffaa00", bg: "rgba(255,170,0,0.12)",  border: "rgba(255,170,0,0.35)",  label: "WEAKENING" },
};

// ─── Cache ────────────────────────────────────────────────────────────────────
const LS_TTL = 4 * 60 * 60 * 1000;
const lsGet = key => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > LS_TTL) { localStorage.removeItem(key); return null; }
    return data;
  } catch { return null; }
};
const lsSet = (key, data) => {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch {}
};

// ─── Fetch ────────────────────────────────────────────────────────────────────

// Uses fetchHistory from marketData.js: Schwab → /api/history (Yahoo/Stooq server-side)
const fetchCloses = async (sym, days = 260) => {
  try {
    const end   = new Date();
    // Request extra days to account for weekends/holidays
    const start = new Date(end - Math.ceil(days * 1.5) * 24 * 3600 * 1000);
    const bars  = await fetchHistory(sym, start.toISOString().slice(0, 10), end.toISOString().slice(0, 10));
    if (!bars || bars.length < 30) return null;
    const slice  = bars.slice(-days);
    const closes = slice.map(b => b.close);
    const dates  = slice.map(b => b.time);
    return { closes, dates };
  } catch { return null; }
};

// ─── RRG Math ─────────────────────────────────────────────────────────────────
const computeRRG = (itemCloses, benchCloses) => {
  const n = Math.min(itemCloses.length, benchCloses.length);
  if (n < 20) return null;
  const ic = itemCloses.slice(-n), bc = benchCloses.slice(-n);
  const ema = (arr, len) => {
    const k = 2 / (len + 1); let p = arr[0];
    return arr.map(v => { p = v * k + p * (1 - k); return p; });
  };
  const rsRaw   = ic.map((v, i) => v / bc[i]);
  const ema10   = ema(rsRaw, 10), ema40 = ema(rsRaw, 40);
  const rsRatio = ema10.map((v, i) => (v / ema40[i]) * 100);
  const roc     = rsRatio.map((v, i) => i === 0 ? 0 : v - rsRatio[i - 1]);
  const emaRoc  = ema(roc, 10);
  const slice63 = emaRoc.slice(-63);
  const rocMean = slice63.reduce((a, b) => a + b, 0) / slice63.length;
  const rocStd  = Math.sqrt(slice63.reduce((a, b) => a + (b - rocMean) ** 2, 0) / slice63.length) || 0.001;
  const rsMom   = emaRoc.map(v => 100 + ((v - rocMean) / rocStd) * 2);
  const trail   = rsRatio.slice(-63).map((rs, i) => ({ rs, rm: rsMom.slice(-63)[i] }));
  return { rs: trail[trail.length - 1].rs, rm: trail[trail.length - 1].rm, trail };
};

// ─── Data Hook ────────────────────────────────────────────────────────────────
const useRRGData = (universe, benchmarkId) => {
  const [data,       setData]       = useState({});
  const [status,     setStatus]     = useState("idle");
  const [progress,   setProgress]   = useState(0);
  const [trailDates, setTrailDates] = useState([]);
  const cache = useRef({});

  const load = useCallback(async () => {
    setData({}); setStatus("loading"); setProgress(0); cache.current = {};
    const tickers = [...new Set([benchmarkId, ...universe.map(u => u.ticker)])];
    let done = 0;
    for (const sym of tickers) {
      const lsKey = `rrg_d_${sym}`;
      const cached = lsGet(lsKey);
      if (cached) { cache.current[sym] = cached; }
      else {
        const r = await fetchCloses(sym, 130);
        if (r) { cache.current[sym] = r; lsSet(lsKey, r); }
        await new Promise(r => setTimeout(r, 250));
      }
      done++;
      setProgress(Math.round((done / tickers.length) * 100));
    }
    const bench = cache.current[benchmarkId];
    if (!bench) { setStatus("error"); return; }
    setTrailDates((bench.dates ?? []).slice(-63));
    const computed = {};
    for (const item of universe) {
      const c = cache.current[item.ticker];
      if (!c) continue;
      const rrg = computeRRG(c.closes, bench.closes);
      if (rrg) computed[item.id] = rrg;
    }
    setData(computed); setStatus("done");
  }, [universe, benchmarkId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, status, progress, load, trailDates };
};

// ─── Return Data Hook (for Ranking view) ──────────────────────────────────────
const useReturnData = (universe) => {
  const [data,     setData]     = useState({});
  const [status,   setStatus]   = useState("idle");
  const [progress, setProgress] = useState(0);

  const load = useCallback(async () => {
    setData({}); setStatus("loading"); setProgress(0);
    const localCache = {};
    let done = 0;
    for (const item of universe) {
      const sym = item.ticker;
      const lsKey = `rrg_d_${sym}`;
      const cached = lsGet(lsKey);
      if (cached) { localCache[sym] = cached; }
      else {
        const res = await fetchCloses(sym, 260);
        if (res) { localCache[sym] = res; lsSet(lsKey, res); }
        await new Promise(r => setTimeout(r, 250));
      }
      done++;
      setProgress(Math.round((done / universe.length) * 100));
    }

    const thisYear = new Date().getFullYear().toString();

    // Fetch live quotes for real-time "Today" returns (Schwab → Yahoo → Stooq)
    const allSymbols = universe.map(i => i.ticker);
    let liveQuotes = new Map();
    try {
      liveQuotes = await fetchQuotes(allSymbols);
    } catch { /* non-fatal — fall back to last close */ }

    const computed = {};
    for (const item of universe) {
      const c = localCache[item.ticker];
      if (!c?.closes?.length) continue;
      const { closes, dates = [] } = c;
      const n = closes.length;
      const prevClose = closes[n - 1]; // last historical close (yesterday)

      // Use live quote if available, otherwise fall back to last historical close
      const liveQ    = liveQuotes.get(item.ticker);
      const livePrice = liveQ?.price ?? null;
      const last      = livePrice ?? prevClose;

      // d1 = live price vs yesterday's close (true intraday); others from history
      const d1 = livePrice != null && prevClose
        ? ((livePrice - prevClose) / prevClose) * 100
        : (closes.length >= 2 ? ((prevClose - closes[n - 2]) / closes[n - 2]) * 100 : null);

      const pct = (lb) => {
        if (n < lb + 1) return null;
        const base = closes[n - 1 - lb];
        return base ? ((last - base) / base) * 100 : null;
      };
      // YTD: find first trading day of current year
      let ytd = null;
      if (dates.length) {
        const idx = dates.findIndex(d => d.startsWith(thisYear));
        if (idx >= 0 && idx < n) {
          const base = closes[idx];
          if (base) ytd = ((last - base) / base) * 100;
        }
      }
      computed[item.id] = { d1, d5: pct(5), d21: pct(21), d63: pct(63), ytd };
    }
    setData(computed); setStatus("done");
  }, [universe]); // eslint-disable-line react-hooks/exhaustive-deps

  return { data, status, progress, load };
};

// ─── SVG Chart ────────────────────────────────────────────────────────────────
const PAD = { t: 30, r: 20, b: 48, l: 54 };

function RRGChart({ items, rrgData, tailBars, animFrame, hovId, setHovId, benchmarkId }) {
  const [tooltip, setTooltip] = useState(null);
  const containerRef = useRef(null);
  const [dims, setDims] = useState({ w: 900, h: 640 });
  const CW = dims.w, CH = dims.h;
  const PW = CW - PAD.l - PAD.r;
  const PH = CH - PAD.t - PAD.b;

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setDims({ w: Math.round(width), h: Math.round(height) });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const bounds = useMemo(() => {
    let minRS = 98.8, maxRS = 101.2, minRM = 98.8, maxRM = 101.2;
    items.forEach(item => {
      const d = rrgData[item.id];
      if (!d?.trail) return;
      // Always use the full trail for stable axes (so they don't jump during animation)
      d.trail.forEach(pt => {
        minRS = Math.min(minRS, pt.rs); maxRS = Math.max(maxRS, pt.rs);
        minRM = Math.min(minRM, pt.rm); maxRM = Math.max(maxRM, pt.rm);
      });
    });
    const padRS = Math.max(0.5, (maxRS - minRS) * 0.08);
    const padRM = Math.max(0.5, (maxRM - minRM) * 0.08);
    return {
      minRS: Math.min(minRS - padRS, 99.3), maxRS: Math.max(maxRS + padRS, 100.7),
      minRM: Math.min(minRM - padRM, 99.3), maxRM: Math.max(maxRM + padRM, 100.7),
    };
  }, [items, rrgData]);

  const toX = rs => PAD.l + ((rs - bounds.minRS) / (bounds.maxRS - bounds.minRS)) * PW;
  const toY = rm => PAD.t + (1 - (rm - bounds.minRM) / (bounds.maxRM - bounds.minRM)) * PH;
  const cx  = toX(100), cy = toY(100);

  const rsTicks = [], rmTicks = [];
  for (let v = Math.ceil(bounds.minRS); v <= Math.floor(bounds.maxRS); v++) rsTicks.push(v);
  for (let v = Math.ceil(bounds.minRM); v <= Math.floor(bounds.maxRM); v++) rmTicks.push(v);

  const hasData = items.some(i => rrgData[i.id]);

  return (
    <div ref={containerRef} style={{ flex: 1, minWidth: 0, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
      <svg viewBox={`0 0 ${CW} ${CH}`}
        style={{ width: '100%', height: '100%', display: 'block' }}>

        {/* Quadrant fills */}
        <rect x={PAD.l} y={PAD.t} width={Math.max(0, cx-PAD.l)} height={Math.max(0, cy-PAD.t)} fill="rgba(77,184,255,0.04)" />
        <rect x={cx} y={PAD.t} width={Math.max(0, PAD.l+PW-cx)} height={Math.max(0, cy-PAD.t)} fill="rgba(0,229,160,0.055)" />
        <rect x={PAD.l} y={cy} width={Math.max(0, cx-PAD.l)} height={Math.max(0, PAD.t+PH-cy)} fill="rgba(255,77,109,0.03)" />
        <rect x={cx} y={cy} width={Math.max(0, PAD.l+PW-cx)} height={Math.max(0, PAD.t+PH-cy)} fill="rgba(255,170,0,0.03)" />

        {/* Subtle grid */}
        {rsTicks.map(v => <line key={`gx${v}`} x1={toX(v)} y1={PAD.t} x2={toX(v)} y2={PAD.t+PH} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />)}
        {rmTicks.map(v => <line key={`gy${v}`} x1={PAD.l} y1={toY(v)} x2={PAD.l+PW} y2={toY(v)} stroke="rgba(255,255,255,0.04)" strokeWidth={1} />)}

        {/* Center crosshairs */}
        <line x1={cx} y1={PAD.t} x2={cx} y2={PAD.t+PH} stroke="rgba(255,255,255,0.22)" strokeWidth={1} strokeDasharray="5,4" />
        <line x1={PAD.l} y1={cy} x2={PAD.l+PW} y2={cy} stroke="rgba(255,255,255,0.22)" strokeWidth={1} strokeDasharray="5,4" />

        {/* Plot border */}
        <rect x={PAD.l} y={PAD.t} width={PW} height={PH} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={1} />

        {/* Quadrant labels */}
        <text x={PAD.l+10} y={PAD.t+20}    fill="rgba(77,184,255,0.4)"  fontSize={11} fontFamily="monospace" fontWeight={700} letterSpacing={2}>IMPROVING</text>
        <text x={cx+10}    y={PAD.t+20}    fill="rgba(0,229,160,0.4)"   fontSize={11} fontFamily="monospace" fontWeight={700} letterSpacing={2}>LEADING</text>
        <text x={PAD.l+10} y={PAD.t+PH-9}  fill="rgba(255,77,109,0.4)"  fontSize={11} fontFamily="monospace" fontWeight={700} letterSpacing={2}>LAGGING</text>
        <text x={cx+10}    y={PAD.t+PH-9}  fill="rgba(255,170,0,0.4)"   fontSize={11} fontFamily="monospace" fontWeight={700} letterSpacing={2}>WEAKENING</text>

        {/* X axis */}
        {rsTicks.map(v => (
          <g key={`xa${v}`}>
            <line x1={toX(v)} y1={PAD.t+PH} x2={toX(v)} y2={PAD.t+PH+5} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
            <text x={toX(v)} y={PAD.t+PH+18} fill="rgba(255,255,255,0.35)" fontSize={11} fontFamily="monospace" textAnchor="middle">{v}</text>
          </g>
        ))}
        <text x={PAD.l+PW/2} y={CH-6} fill="rgba(255,255,255,0.25)" fontSize={11} fontFamily="monospace" textAnchor="middle" letterSpacing={1}>Relative Strength (%)</text>

        {/* Y axis */}
        {rmTicks.map(v => (
          <g key={`ya${v}`}>
            <line x1={PAD.l-5} y1={toY(v)} x2={PAD.l} y2={toY(v)} stroke="rgba(255,255,255,0.18)" strokeWidth={1} />
            <text x={PAD.l-8} y={toY(v)+4} fill="rgba(255,255,255,0.35)" fontSize={11} fontFamily="monospace" textAnchor="end">{v}</text>
          </g>
        ))}
        <text transform={`rotate(-90) translate(${-(PAD.t+PH/2)}, 16)`}
          fill="rgba(255,255,255,0.25)" fontSize={11} fontFamily="monospace" textAnchor="middle" letterSpacing={1}>RS Momentum</text>

        {/* Trails — non-hovered */}
        {items.filter(i => rrgData[i.id] && i.id !== hovId).map(item => {
          const fullTrail = rrgData[item.id].trail;
          const end   = animFrame !== null ? Math.min(animFrame + 1, fullTrail.length) : fullTrail.length;
          const start = Math.max(0, end - tailBars);
          const trail = fullTrail.slice(start, end);
          if (trail.length < 2) return null;
          return <polyline key={item.id} points={trail.map(pt => `${toX(pt.rs).toFixed(1)},${toY(pt.rm).toFixed(1)}`).join(" ")}
            fill="none" stroke={item.color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" opacity={0.45} />;
        })}

        {/* Hovered trail on top */}
        {hovId && rrgData[hovId] && (() => {
          const item  = items.find(i => i.id === hovId); if (!item) return null;
          const fullTrail = rrgData[hovId].trail;
          const end   = animFrame !== null ? Math.min(animFrame + 1, fullTrail.length) : fullTrail.length;
          const start = Math.max(0, end - tailBars);
          const trail = fullTrail.slice(start, end);
          if (trail.length < 2) return null;
          return <polyline points={trail.map(pt => `${toX(pt.rs).toFixed(1)},${toY(pt.rm).toFixed(1)}`).join(" ")}
            fill="none" stroke={item.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />;
        })()}

        {/* Dots */}
        {items.map(item => {
          const d = rrgData[item.id]; if (!d) return null;
          const animPt = animFrame !== null ? (d.trail[Math.min(animFrame, d.trail.length - 1)] ?? { rs: d.rs, rm: d.rm }) : null;
          const dotRS  = animPt?.rs ?? d.rs;
          const dotRM  = animPt?.rm ?? d.rm;
          const x = toX(dotRS), y = toY(dotRM);
          const isHov = hovId === item.id;
          return (
            <g key={item.id} style={{ cursor: 'default' }}
              onMouseEnter={() => { setHovId(item.id); setTooltip({ item, d }); }}
              onMouseLeave={() => { setHovId(null);    setTooltip(null);        }}>
              {isHov && <circle cx={x} cy={y} r={16} fill={item.color} opacity={0.12} />}
              <circle cx={x} cy={y} r={isHov ? 7 : 5.5} fill={item.color}
                stroke={isHov ? '#fff' : 'rgba(8,12,20,0.7)'} strokeWidth={isHov ? 2 : 1.5} />
              <text x={x+9} y={y-7} fill={item.color} fontSize={10} fontFamily="monospace" fontWeight={700} opacity={isHov ? 1 : 0.75}>
                {item.ticker}
              </text>
            </g>
          );
        })}

        {/* Tooltip */}
        {tooltip && (() => {
          const { item, d } = tooltip;
          const animPt = animFrame !== null ? (d.trail[Math.min(animFrame, d.trail.length - 1)] ?? { rs: d.rs, rm: d.rm }) : null;
          const trs = animPt?.rs ?? d.rs;
          const trm = animPt?.rm ?? d.rm;
          const q = getQ(trs, trm);
          const sx = toX(trs), sy = toY(trm);
          const TW = 160, TH = 80;
          const tx = sx + 18 + TW > CW - PAD.r ? sx - 18 - TW : sx + 18;
          const ty = Math.max(PAD.t+4, Math.min(sy-32, PAD.t+PH-TH-4));
          return (
            <g>
              <rect x={tx} y={ty} width={TW} height={TH} rx={4} fill="#060b12" stroke={item.color} strokeWidth={1.5} opacity={0.98} />
              <text x={tx+10} y={ty+20} fill={item.color} fontSize={13} fontFamily="monospace" fontWeight={700}>{item.ticker}</text>
              <text x={tx+10} y={ty+34} fill="rgba(255,255,255,0.4)" fontSize={10} fontFamily="monospace">{item.label}</text>
              <text x={tx+10} y={ty+50} fill="rgba(255,255,255,0.4)" fontSize={10} fontFamily="monospace">RS {trs.toFixed(2)}  ·  MOM {trm.toFixed(2)}</text>
              <rect x={tx+10} y={ty+58} width={TW-20} height={15} rx={2} fill={Q_STYLE[q].bg} />
              <text x={tx+TW/2} y={ty+70} fill={Q_STYLE[q].color} fontSize={9} fontFamily="monospace" fontWeight={700} textAnchor="middle" letterSpacing={1}>{Q_STYLE[q].label}</text>
            </g>
          );
        })()}

        {/* Empty state */}
        {!hasData && (
          <g>
            <text x={CW/2} y={CH/2-12} fill="rgba(255,255,255,0.18)" fontSize={14} fontFamily="monospace" textAnchor="middle">No data loaded</text>
            <text x={CW/2} y={CH/2+10} fill="rgba(255,255,255,0.1)"  fontSize={11} fontFamily="monospace" textAnchor="middle">Click LOAD DATA to fetch historical prices</text>
          </g>
        )}

        {/* Benchmark watermark */}
        <text x={PAD.l+PW-4} y={PAD.t+PH-8} fill="rgba(255,255,255,0.1)" fontSize={10} fontFamily="monospace" textAnchor="end" letterSpacing={1}>vs {benchmarkId}</text>
      </svg>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function SectorList({ items, rrgData, hovId, setHovId }) {
  const sorted = useMemo(() => {
    const order = { leading: 0, improving: 1, weakening: 2, lagging: 3 };
    return [...items].sort((a, b) => {
      const da = rrgData[a.id], db = rrgData[b.id];
      if (!da && !db) return 0; if (!da) return 1; if (!db) return -1;
      const qa = getQ(da.rs, da.rm), qb = getQ(db.rs, db.rm);
      return order[qa] !== order[qb] ? order[qa] - order[qb] : db.rs - da.rs;
    });
  }, [items, rrgData]);

  return (
    <div style={{ width: 212, flexShrink: 0, borderLeft: '1px solid rgba(255,255,255,0.07)', overflowY: 'auto', background: '#060b12', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '9px 12px 7px', borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'sticky', top: 0, background: '#060b12', zIndex: 1, flexShrink: 0 }}>
        <div style={{ color: 'rgba(255,255,255,0.22)', fontSize: 9, letterSpacing: 3, fontFamily: 'monospace', fontWeight: 700 }}>
          {items.length} TICKERS · RS / MOMENTUM
        </div>
      </div>
      {sorted.map(item => {
        const d = rrgData[item.id], isHov = hovId === item.id, q = d ? getQ(d.rs, d.rm) : null;
        return (
          <div key={item.id} onMouseEnter={() => setHovId(item.id)} onMouseLeave={() => setHovId(null)}
            style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 12px',
              borderBottom: '1px solid rgba(255,255,255,0.04)', borderLeft: `2px solid ${isHov ? item.color : 'transparent'}`,
              background: isHov ? 'rgba(255,255,255,0.04)' : 'transparent', cursor: 'default', transition: 'background 0.1s' }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                <span style={{ color: '#dde4f0', fontFamily: 'monospace', fontSize: 12, fontWeight: 700 }}>{item.ticker}</span>
                {q && <span style={{ color: Q_STYLE[q].color, fontSize: 7, fontFamily: 'monospace', fontWeight: 700, letterSpacing: 0.5, padding: '1px 4px', borderRadius: 2, background: Q_STYLE[q].bg, border: `1px solid ${Q_STYLE[q].border}`, flexShrink: 0 }}>{Q_STYLE[q].label}</span>}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.28)', fontFamily: 'monospace', fontSize: 9.5, marginTop: 2 }}>
                {d ? `${d.rs.toFixed(1)} / ${d.rm.toFixed(1)}` : '—'}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Ranking View ─────────────────────────────────────────────────────────────
const RANK_PERIODS = [
  { key: 'd1',  label: 'Today' },
  { key: 'd5',  label: '1W'   },
  { key: 'd21', label: '1M'   },
  { key: 'd63', label: '3M'   },
  { key: 'ytd', label: 'YTD'  },
];

const PIN_OPTS = [
  { dir: 'top', n: 5,  label: 'T5'  },
  { dir: 'top', n: 10, label: 'T10' },
  { dir: 'bot', n: 5,  label: 'B5'  },
  { dir: 'bot', n: 10, label: 'B10' },
];

const PERIOD_LABEL = { d1: '1D', d5: '1W', d21: '1M', d63: '3M', ytd: 'YTD' };

// ─── Spearman rank correlation ─────────────────────────────────────────────────
function spearman(ranks1, ranks2) {
  const n = ranks1.length;
  if (n < 3) return 0;
  const d2 = ranks1.reduce((s, r, i) => s + (r - ranks2[i]) ** 2, 0);
  return 1 - (6 * d2) / (n * (n * n - 1));
}

// ─── Rotation DNA panel ────────────────────────────────────────────────────────
function RotationDNA({ universe, returnData, periods }) {
  const { apiKey } = useSettingsStore();
  const [analysis, setAnalysis] = useState(null);
  const [loading,  setLoading]  = useState(false);

  // Reference = rightmost column; short-terms = everything left of it
  const refPeriod   = periods[periods.length - 1];
  const shortPeriods = periods.slice(0, -1);
  const primaryPeriod = periods[0]; // leftmost (most recent, typically 1D)

  // Build rank-by-id maps for all active periods
  const rankMaps = useMemo(() => {
    const all = {};
    for (const p of [...periods, 'd1']) { // always include d1
      const rows = [...universe]
        .map(item => ({ id: item.id, ret: returnData[item.id]?.[p] ?? null }))
        .filter(r => r.ret !== null)
        .sort((a, b) => b.ret - a.ret);
      const map = {};
      rows.forEach((r, i) => { map[r.id] = i + 1; });
      all[p] = map;
    }
    return all;
  }, [universe, returnData, periods]);

  // Spearman correlations: each short-term period vs the reference
  const correlations = useMemo(() => {
    const refMap = rankMaps[refPeriod] ?? {};
    const ids = Object.keys(refMap);
    if (ids.length < 3) return {};
    const refRanks = ids.map(id => refMap[id]);
    const result = {};
    for (const sp of [...new Set([...shortPeriods, 'd1'])]) {
      const spMap = rankMaps[sp] ?? {};
      const spRanks = ids.map(id => spMap[id] ?? ids.length + 1);
      result[sp] = spearman(refRanks, spRanks);
    }
    return result;
  }, [rankMaps, refPeriod, shortPeriods]);

  const primaryCorr = correlations[primaryPeriod] ?? correlations['d1'] ?? 0;

  const [character, charColor] = primaryCorr >= 0.55
    ? ['CONTINUATION',      '#00e5a0']
    : primaryCorr >= 0.2
    ? ['MILD CONTINUATION', '#4db8ff']
    : primaryCorr >= -0.2
    ? ['CHOPPY',            '#ffa502']
    : primaryCorr >= -0.5
    ? ['ROTATION',          '#ff9500']
    : ['STRONG ROTATION',   '#ff4d6d'];

  // Top rank movers: items where d1 rank diverges most from ref period rank
  const rankMovers = useMemo(() => {
    const refMap = rankMaps[refPeriod] ?? {};
    const d1Map  = rankMaps['d1'] ?? {};
    return universe
      .filter(item => refMap[item.id] != null && d1Map[item.id] != null)
      .map(item => ({
        ...item,
        refRank: refMap[item.id],
        d1Rank:  d1Map[item.id],
        shift:   refMap[item.id] - d1Map[item.id], // +ve = laggard outperforming today
        d1Ret:   returnData[item.id]?.d1,
        refRet:  returnData[item.id]?.[refPeriod],
      }))
      .sort((a, b) => Math.abs(b.shift) - Math.abs(a.shift))
      .slice(0, 8);
  }, [rankMaps, refPeriod, universe, returnData]);

  const hasData = Object.keys(rankMaps[refPeriod] ?? {}).length > 2;
  if (!hasData) return null;

  const generateBreakdown = async () => {
    if (!apiKey || loading) return;
    setLoading(true); setAnalysis(null);
    try {
      const refMap = rankMaps[refPeriod] ?? {};
      const d1Map  = rankMaps['d1'] ?? {};
      const rows = universe
        .filter(item => refMap[item.id] && d1Map[item.id])
        .map(item => ({
          name:    item.label,
          d1Rank:  d1Map[item.id],
          refRank: refMap[item.id],
          d1Ret:   returnData[item.id]?.d1?.toFixed(2),
          refRet:  returnData[item.id]?.[refPeriod]?.toFixed(2),
          shift:   refMap[item.id] - d1Map[item.id],
        }))
        .sort((a, b) => a.d1Rank - b.d1Rank);

      const corrLines = Object.entries(correlations)
        .map(([p, r]) => `  ${PERIOD_LABEL[p] ?? p} vs ${PERIOD_LABEL[refPeriod]}: ρ=${r.toFixed(2)}`)
        .join('\n');

      const prompt = [
        `You are a market analyst. I have ETF/sector rank data across timeframes.`,
        `Reference (structural) timeframe: ${PERIOD_LABEL[refPeriod] ?? refPeriod}`,
        `Primary short-term: ${PERIOD_LABEL[primaryPeriod] ?? primaryPeriod}`,
        ``,
        `Spearman rank correlations (1D vs structural rank):`,
        corrLines,
        `Overall market character: ${character} (ρ=${primaryCorr.toFixed(2)})`,
        ``,
        `Today's rankings vs ${PERIOD_LABEL[refPeriod]} structural rank (sorted by 1D rank, 1=best):`,
        rows.map(r => `  ${r.name}: 1D #${r.d1Rank} (${r.d1Ret}%) | ${PERIOD_LABEL[refPeriod]} #${r.refRank} (${r.refRet}%) | rank shift ${r.shift > 0 ? '+' : ''}${r.shift}`).join('\n'),
        ``,
        `Please analyze in under 200 words:`,
        `1. Whether this is continuation (structural leaders leading today), rotation (laggards outperforming), or choppy/mixed — and the evidence`,
        `2. Which specific sectors are driving the divergence`,
        `3. What this implies for momentum traders vs rotation traders`,
        `4. Any early rotation signals worth watching`,
        `Be specific and data-driven. No generic filler.`,
      ].join('\n');

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }) }
      );
      const data  = await res.json();
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || (data.error ? `API Error: ${data.error.message}` : 'No response.');
      setAnalysis(reply);
    } catch (e) { setAnalysis(`Error: ${e.message}`); }
    setLoading(false);
  };

  return (
    <div style={{
      flexShrink: 0,
      borderTop: '1px solid rgba(255,255,255,0.07)',
      background: '#060b12',
      padding: '8px 14px',
      display: 'flex',
      flexDirection: 'column',
      gap: 7,
      maxHeight: analysis ? 360 : 110,
      overflow: 'hidden',
      transition: 'max-height 0.3s ease',
    }}>
      {/* ── Header row: character + correlations + AI button ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flexShrink: 0 }}>
        <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 9, fontFamily: 'monospace', letterSpacing: 2, fontWeight: 700, whiteSpace: 'nowrap' }}>◈ MARKET CHARACTER</span>

        {/* Character badge */}
        <span style={{
          padding: '2px 9px', borderRadius: 3, fontSize: 10, fontFamily: 'monospace', fontWeight: 700, letterSpacing: 0.8,
          color: charColor, background: `${charColor}18`, border: `1px solid ${charColor}40`, whiteSpace: 'nowrap',
        }}>{character}</span>

        {/* Correlation bars — one per short-term period vs the ref */}
        {[...new Set([...shortPeriods, 'd1'])].map(sp => {
          const corr = correlations[sp];
          if (corr == null) return null;
          const pct = ((corr + 1) / 2) * 100;
          const col = corr >= 0.2 ? '#00e5a0' : corr >= -0.2 ? '#ffa502' : '#ff4d6d';
          return (
            <div key={sp} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 8.5, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                {PERIOD_LABEL[sp] ?? sp} vs {PERIOD_LABEL[refPeriod]}
              </span>
              <div style={{ width: 56, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: col, borderRadius: 2 }} />
              </div>
              <span style={{ color: col, fontSize: 8.5, fontFamily: 'monospace', fontWeight: 700, whiteSpace: 'nowrap' }}>
                {corr >= 0 ? '+' : ''}{corr.toFixed(2)}
              </span>
            </div>
          );
        })}

        {/* AI button — right side */}
        <div style={{ marginLeft: 'auto' }}>
          <div
            onClick={generateBreakdown}
            style={{
              padding: '3px 10px', borderRadius: 3, cursor: loading ? 'wait' : apiKey ? 'pointer' : 'not-allowed',
              fontSize: 9.5, fontFamily: 'monospace', fontWeight: 700, letterSpacing: 0.8,
              color: loading ? 'rgba(255,149,0,0.4)' : '#ff9500',
              background: 'rgba(255,149,0,0.1)', border: '1px solid rgba(255,149,0,0.3)',
              userSelect: 'none', whiteSpace: 'nowrap',
              opacity: !apiKey ? 0.4 : 1,
            }}
            title={!apiKey ? 'Add Gemini API key in Settings' : 'Generate AI market character breakdown'}
          >
            {loading ? '⟳ ANALYZING…' : '✦ AI BREAKDOWN'}
          </div>
        </div>
      </div>

      {/* ── Rank mover chips ── */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', flexShrink: 0 }}>
        {rankMovers.map(item => {
          const rising = item.shift > 0;  // structural laggard outperforming today
          const col = rising ? '#00e5a0' : '#ff4d6d';
          const sign = item.shift > 0 ? '+' : '';
          return (
            <div key={item.id} style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '3px 8px', borderRadius: 3,
              background: `${col}0d`, border: `1px solid ${col}25`,
            }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
              <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 9.5, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                {item.ticker}
              </span>
              <span style={{ color: col, fontSize: 9, fontFamily: 'monospace', fontWeight: 700, whiteSpace: 'nowrap' }}>
                {rising ? '↑' : '↓'} #{item.refRank}→#{item.d1Rank}
              </span>
              <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 8.5, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                ({sign}{item.shift})
              </span>
              {item.d1Ret != null && (
                <span style={{ color: item.d1Ret >= 0 ? '#00d084' : '#ff4757', fontSize: 9, fontFamily: 'monospace', fontWeight: 700, whiteSpace: 'nowrap' }}>
                  {item.d1Ret >= 0 ? '+' : ''}{item.d1Ret.toFixed(1)}%
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* ── AI analysis text ── */}
      {analysis && (
        <div style={{
          flex: 1, overflowY: 'auto', padding: '8px 10px', borderRadius: 4,
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,149,0,0.18)',
          color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace', fontSize: 11,
          lineHeight: 1.65, whiteSpace: 'pre-wrap',
        }}>
          {analysis}
        </div>
      )}
    </div>
  );
}

function RankingCol({ universe, returnData, period, onPeriodChange, colIndex, hovId, setHovId, pinnedIds, pinConfig, onPin, onClearPins }) {
  const rows = useMemo(() => (
    [...universe]
      .map(item => ({ ...item, ret: returnData[item.id]?.[period] ?? null }))
      .filter(item => item.ret !== null)
      .sort((a, b) => b.ret - a.ret)
  ), [universe, returnData, period]);

  const maxAbs    = useMemo(() => Math.max(...rows.map(r => Math.abs(r.ret)), 0.01), [rows]);
  const hasPins   = pinnedIds.size > 0;
  const isSrcCol  = pinConfig?.colIdx === colIndex;

  const handlePin = (dir, n) => {
    if (isSrcCol && pinConfig?.dir === dir && pinConfig?.n === n) {
      onClearPins();
    } else {
      const slice = dir === 'top' ? rows.slice(0, n) : rows.slice(-n);
      onPin(dir, n, new Set(slice.map(r => r.id)));
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, borderRight: colIndex < 2 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
      {/* Period tabs */}
      <div style={{ display: 'flex', gap: 1, padding: '6px 8px 5px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0, flexWrap: 'nowrap' }}>
        {RANK_PERIODS.map(p => (
          <div key={p.key} onClick={() => onPeriodChange(p.key)}
            style={{ padding: '2px 7px', borderRadius: 3, cursor: 'pointer', fontSize: 9.5, fontFamily: 'monospace', fontWeight: 700, letterSpacing: 0.5, userSelect: 'none', whiteSpace: 'nowrap',
              border: period === p.key ? '1px solid rgba(77,184,255,0.55)' : '1px solid transparent',
              background: period === p.key ? 'rgba(77,184,255,0.15)' : 'rgba(255,255,255,0.03)',
              color: period === p.key ? '#4db8ff' : 'rgba(255,255,255,0.28)',
            }}>
            {p.label}
          </div>
        ))}
      </div>

      {/* Pin strip */}
      <div style={{ display: 'flex', gap: 3, padding: '4px 8px', borderBottom: '1px solid rgba(255,255,255,0.04)', flexShrink: 0, alignItems: 'center', minHeight: 26 }}>
        {PIN_OPTS.map(({ dir, n, label }) => {
          const isActive = isSrcCol && pinConfig?.dir === dir && pinConfig?.n === n;
          const isTop = dir === 'top';
          return (
            <div key={label} onClick={() => handlePin(dir, n)}
              title={`Highlight ${isTop ? 'top' : 'bottom'} ${n} from this list across all columns`}
              style={{ padding: '2px 7px', borderRadius: 3, cursor: 'pointer', fontSize: 9, fontFamily: 'monospace', fontWeight: 700, letterSpacing: 0.3, userSelect: 'none', whiteSpace: 'nowrap',
                border: isActive ? `1px solid ${isTop ? 'rgba(0,208,132,0.6)' : 'rgba(255,71,87,0.6)'}` : '1px solid rgba(255,255,255,0.08)',
                background: isActive ? (isTop ? 'rgba(0,208,132,0.12)' : 'rgba(255,71,87,0.12)') : 'rgba(255,255,255,0.02)',
                color: isActive ? (isTop ? '#00d084' : '#ff4757') : 'rgba(255,255,255,0.22)',
                transition: 'all 0.12s',
              }}>
              {label}
            </div>
          );
        })}
        {/* Source col: clear button */}
        {isSrcCol && hasPins && (
          <div onClick={onClearPins} title="Clear selection"
            style={{ marginLeft: 'auto', padding: '2px 7px', borderRadius: 3, cursor: 'pointer', fontSize: 9, fontFamily: 'monospace', fontWeight: 700, letterSpacing: 0.5, userSelect: 'none',
              color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)',
            }}>✕</div>
        )}
        {/* Other cols: show count indicator */}
        {!isSrcCol && hasPins && (
          <span style={{ marginLeft: 'auto', fontSize: 8.5, fontFamily: 'monospace', color: 'rgba(255,149,0,0.5)', letterSpacing: 0.5, whiteSpace: 'nowrap' }}>
            {pinnedIds.size} PINNED
          </span>
        )}
      </div>

      {/* Sorted rows */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {rows.length === 0 ? (
          <div style={{ color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace', fontSize: 11, padding: '20px 12px', textAlign: 'center' }}>
            No data
          </div>
        ) : rows.map((item, i) => {
          const pos      = item.ret >= 0;
          const barW     = (Math.abs(item.ret) / maxAbs) * 100;
          const isHov    = hovId === item.id;
          const isPinned = pinnedIds.has(item.id);
          const dimmed   = !isPinned && !isHov && (hasPins || !!hovId);
          return (
            <div key={item.id}
              onMouseEnter={() => setHovId(item.id)}
              onMouseLeave={() => setHovId(null)}
              style={{ position: 'relative', display: 'flex', alignItems: 'center', padding: '4px 8px', gap: 5, overflow: 'hidden', cursor: 'default',
                opacity: dimmed ? 0.22 : 1,
                background: isPinned && isHov ? 'rgba(255,149,0,0.13)' : isPinned ? 'rgba(255,149,0,0.07)' : isHov ? 'rgba(255,255,255,0.06)' : 'transparent',
                borderLeft: isPinned ? '2px solid rgba(255,149,0,0.65)' : isHov ? '2px solid rgba(255,255,255,0.3)' : '2px solid transparent',
                transition: 'opacity 0.12s, background 0.1s',
              }}>
              {/* Bar */}
              <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: `${barW}%`,
                background: pos ? 'rgba(61,132,255,0.13)' : 'rgba(255,71,87,0.11)',
                borderRight: `1.5px solid ${pos ? 'rgba(61,132,255,0.45)' : 'rgba(255,71,87,0.4)'}`,
                pointerEvents: 'none',
              }} />
              {/* Rank */}
              <span style={{ width: 14, fontSize: 9, fontFamily: 'monospace', color: 'rgba(255,255,255,0.18)', textAlign: 'right', flexShrink: 0, zIndex: 1 }}>{i + 1}</span>
              {/* Color dot */}
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: item.color, flexShrink: 0, opacity: 0.85, zIndex: 1 }} />
              {/* Label */}
              <span style={{ flex: 1, fontSize: 11.5, fontFamily: 'monospace', fontWeight: isPinned ? 700 : 400,
                color: isPinned ? '#ffd580' : isHov ? '#ffffff' : pos ? '#dde4f0' : 'rgba(200,210,230,0.5)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', zIndex: 1,
              }}>
                {item.label}
              </span>
              {/* Pct */}
              <span style={{ width: 50, textAlign: 'right', fontSize: 10.5, fontFamily: 'monospace', fontWeight: 700,
                color: pos ? '#00d084' : '#ff4757', flexShrink: 0, zIndex: 1 }}>
                {pos ? '+' : ''}{item.ret.toFixed(2)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RankingView({ universe, returnData, status, progress }) {
  const [periods,   setPeriods]   = useState(['d1', 'd5', 'd63']);
  const [hovId,     setHovId]     = useState(null);
  const [pinnedIds, setPinnedIds] = useState(new Set());
  const [pinConfig, setPinConfig] = useState(null); // { colIdx, dir, n }

  const setPeriod  = (colIdx, key) => setPeriods(prev => prev.map((v, i) => i === colIdx ? key : v));
  const handlePin  = (colIdx, dir, n, ids) => { setPinnedIds(ids); setPinConfig({ colIdx, dir, n }); };
  const clearPins  = () => { setPinnedIds(new Set()); setPinConfig(null); };

  if (status === 'idle' || status === 'loading') {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace', fontSize: 12 }}>
        {status === 'loading' ? (
          <>
            <div style={{ width: 140, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${progress}%`, height: '100%', background: '#4db8ff', transition: 'width 0.3s' }} />
            </div>
            <span>Loading… {progress}%</span>
          </>
        ) : 'Load data to view sector rankings'}
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
      {/* Ranking columns */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        {periods.map((period, i) => (
          <RankingCol
            key={i}
            colIndex={i}
            universe={universe}
            returnData={returnData}
            period={period}
            onPeriodChange={(key) => setPeriod(i, key)}
            hovId={hovId}
            setHovId={setHovId}
            pinnedIds={pinnedIds}
            pinConfig={pinConfig}
            onPin={(dir, n, ids) => handlePin(i, dir, n, ids)}
            onClearPins={clearPins}
          />
        ))}
      </div>

      {/* Rotation DNA analysis strip */}
      {status === 'done' && (
        <RotationDNA
          universe={universe}
          returnData={returnData}
          periods={periods}
        />
      )}
    </div>
  );
}

// ─── Anim Scrubber ────────────────────────────────────────────────────────────
const SPEED_OPTIONS = [{ v: 0.5, l: '½x' }, { v: 1, l: '1x' }, { v: 2, l: '2x' }, { v: 4, l: '4x' }];
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fmtDate = iso => {
  if (!iso) return '';
  const parts = iso.split('-');
  if (parts.length < 3) return iso;
  return `${MONTHS[+parts[1] - 1]} ${parts[2]} '${parts[0].slice(2)}`;
};

function AnimScrubber({ animFrame, setAnimFrame, setAnimating, animating, onPlayPause, onResetAnim, maxFrame, animSpeed, setAnimSpeed, trailDates }) {
  const frame = animFrame ?? maxFrame;
  const skip  = (f) => { setAnimating(false); setAnimFrame(Math.max(0, Math.min(maxFrame, f))); };
  const btnSt = (accent) => ({
    padding: '2px 7px', borderRadius: 3, cursor: 'pointer', fontSize: accent ? 14 : 13,
    fontFamily: 'monospace', userSelect: 'none', whiteSpace: 'nowrap',
    color: (accent && animating) ? '#ff9500' : 'rgba(255,255,255,0.45)',
    background: (accent && animating) ? 'rgba(255,149,0,0.1)' : 'transparent',
  });
  const dateStr = trailDates?.[frame] ? fmtDate(trailDates[frame]) : null;
  return (
    <div style={{ height: 36, flexShrink: 0, background: '#060b12', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', padding: '0 14px', gap: 7 }}>
      {/* Transport */}
      <div onClick={() => skip(0)}               title="First frame"    style={btnSt(false)}>⏮</div>
      <div onClick={() => skip(frame - 1)}        title="Step back"      style={btnSt(false)}>‹</div>
      <div onClick={onPlayPause}                  title="Play / Pause"   style={btnSt(true)}>{animating ? '⏸' : '▶'}</div>
      <div onClick={() => skip(frame + 1)}        title="Step forward"   style={btnSt(false)}>›</div>
      <div onClick={() => skip(maxFrame)}         title="Last frame"     style={btnSt(false)}>⏭</div>
      {/* Slider */}
      <input type="range" min={0} max={maxFrame} value={frame}
        onChange={e => { setAnimating(false); setAnimFrame(Number(e.target.value)); }}
        style={{ flex: 1, accentColor: '#ff9500', cursor: 'pointer' }}
      />
      {/* Date + frame counter */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', minWidth: 58, gap: 0 }}>
        <span style={{ color: dateStr ? 'rgba(255,255,255,0.65)' : 'rgba(255,255,255,0.3)', fontSize: 10.5, fontFamily: 'monospace', whiteSpace: 'nowrap', letterSpacing: 0.4, lineHeight: 1.1 }}>
          {dateStr ?? `${String(frame + 1).padStart(2, '0')}/${maxFrame + 1}`}
        </span>
        {dateStr && (
          <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 8.5, fontFamily: 'monospace', whiteSpace: 'nowrap', letterSpacing: 0.3, lineHeight: 1.1 }}>
            {String(frame + 1).padStart(2, '0')}/{maxFrame + 1}
          </span>
        )}
      </div>
      <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />
      {/* Speed pills */}
      {SPEED_OPTIONS.map(({ v, l }) => (
        <div key={v} onClick={() => setAnimSpeed(v)}
          style={{ padding: '2px 7px', borderRadius: 3, cursor: 'pointer', fontSize: 9.5, fontFamily: 'monospace', fontWeight: 700, letterSpacing: 0.3, userSelect: 'none',
            border: animSpeed === v ? '1px solid rgba(255,149,0,0.5)' : '1px solid transparent',
            background: animSpeed === v ? 'rgba(255,149,0,0.12)' : 'rgba(255,255,255,0.03)',
            color: animSpeed === v ? '#ff9500' : 'rgba(255,255,255,0.28)',
          }}>{l}</div>
      ))}
      {/* Live / reset */}
      {animFrame !== null && <>
        <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.08)', flexShrink: 0 }} />
        <div onClick={onResetAnim}
          style={{ padding: '2px 8px', borderRadius: 3, cursor: 'pointer', fontSize: 9, fontFamily: 'monospace', fontWeight: 700, letterSpacing: 0.8, userSelect: 'none',
            color: '#00e5a0', border: '1px solid rgba(0,229,160,0.3)', background: 'rgba(0,229,160,0.07)',
          }}>LIVE</div>
      </>}
    </div>
  );
}

// ─── Top Bar ──────────────────────────────────────────────────────────────────
const TAIL_OPTIONS = [{ bars: 5, label: '1W' }, { bars: 10, label: '2W' }, { bars: 21, label: '1M' }, { bars: 63, label: '3M' }];
const ACC = "#ff9500";

function Pill({ active, onClick, children }) {
  return <div onClick={onClick} style={{ padding: '3px 9px', borderRadius: 3, cursor: 'pointer', fontSize: 11, fontFamily: 'monospace', fontWeight: active ? 700 : 400, letterSpacing: 0.3, color: active ? '#060b12' : 'rgba(255,255,255,0.38)', background: active ? ACC : 'transparent', transition: 'all 0.12s', userSelect: 'none', whiteSpace: 'nowrap' }}>{children}</div>;
}
function Sep() { return <div style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.09)', flexShrink: 0 }} />; }

function TopBar({ view, setView, chartMode, setChartMode, benchmarkId, setBenchmarkId, tailBars, setTailBars, animating, onPlayPause, status, progress, load }) {
  return (
    <div style={{ height: 46, flexShrink: 0, background: '#060b12', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', padding: '0 14px', gap: 5, overflowX: 'auto', overflowY: 'hidden' }}>
      <span style={{ color: ACC, fontWeight: 700, fontSize: 13, fontFamily: 'monospace', letterSpacing: 0.5, marginRight: 4, whiteSpace: 'nowrap' }}>◈ ROTATION</span>
      <Sep />
      {/* Chart mode toggle */}
      <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: 4, padding: 2, gap: 2, flexShrink: 0 }}>
        {[{ id: 'rrg', label: 'RRG' }, { id: 'ranking', label: 'RANK' }].map(m => (
          <div key={m.id} onClick={() => setChartMode(m.id)}
            style={{ padding: '2px 10px', borderRadius: 3, cursor: 'pointer', fontSize: 10, fontFamily: 'monospace', fontWeight: 700, letterSpacing: 1, userSelect: 'none', whiteSpace: 'nowrap',
              background: chartMode === m.id ? 'rgba(77,184,255,0.2)' : 'transparent',
              border: chartMode === m.id ? '1px solid rgba(77,184,255,0.45)' : '1px solid transparent',
              color: chartMode === m.id ? '#4db8ff' : 'rgba(255,255,255,0.3)',
            }}>
            {m.label}
          </div>
        ))}
      </div>
      <Sep />
      <Pill active={view === 'sectors'}    onClick={() => setView('sectors')}>🏛 SECTORS</Pill>
      <Pill active={view === 'industries'} onClick={() => setView('industries')}>🔬 INDUSTRIES</Pill>
      <Pill active={view === 'themes'}     onClick={() => setView('themes')}>💡 THEMES</Pill>
      <div style={{ flex: 1, minWidth: 8 }} />
      {/* Benchmark + tail only relevant for RRG mode */}
      {chartMode === 'rrg' && (
        <>
          <span style={{ color: 'rgba(255,255,255,0.22)', fontSize: 10, fontFamily: 'monospace', letterSpacing: 1, whiteSpace: 'nowrap' }}>VS</span>
          {BENCHMARKS.map(b => <Pill key={b.id} active={benchmarkId === b.id} onClick={() => setBenchmarkId(b.id)}>{b.id}</Pill>)}
          <Sep />
          <span style={{ color: 'rgba(255,255,255,0.22)', fontSize: 10, fontFamily: 'monospace', letterSpacing: 1, whiteSpace: 'nowrap' }}>TAIL</span>
          {TAIL_OPTIONS.map(t => <Pill key={t.bars} active={tailBars === t.bars} onClick={() => setTailBars(t.bars)}>{t.label}</Pill>)}
          <Sep />
          {/* Animation toggle — detail controls are in the scrubber bar below */}
          <span style={{ color: 'rgba(255,255,255,0.22)', fontSize: 10, fontFamily: 'monospace', letterSpacing: 1, whiteSpace: 'nowrap' }}>ANIM</span>
          <div onClick={onPlayPause} title={animating ? 'Pause' : 'Play animation'}
            style={{ padding: '3px 10px', borderRadius: 3, cursor: 'pointer', fontSize: 13, userSelect: 'none', whiteSpace: 'nowrap',
              color: animating ? ACC : 'rgba(255,255,255,0.45)',
              background: animating ? 'rgba(255,149,0,0.12)' : 'transparent',
            }}>
            {animating ? '⏸' : '▶'}
          </div>
          <Sep />
        </>
      )}
      {chartMode === 'ranking' && <Sep />}
      {status === 'loading' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <div style={{ width: 60, height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: ACC, transition: 'width 0.3s' }} />
          </div>
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{progress}%</span>
        </div>
      )}
      {status === 'done'  && <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}><div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00e5a0', boxShadow: '0 0 6px #00e5a0' }} /><span style={{ color: 'rgba(255,255,255,0.22)', fontSize: 10, fontFamily: 'monospace' }}>LIVE</span></div>}
      {status === 'error' && <span style={{ color: '#ff4d6d', fontSize: 10, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>FETCH ERROR</span>}
      <div onClick={() => status !== 'loading' && load()} style={{ padding: '4px 12px', borderRadius: 3, flexShrink: 0, cursor: status === 'loading' ? 'not-allowed' : 'pointer', background: status === 'loading' ? 'transparent' : 'rgba(255,149,0,0.1)', border: `1px solid ${status === 'loading' ? 'rgba(255,255,255,0.08)' : 'rgba(255,149,0,0.35)'}`, color: status === 'loading' ? 'rgba(255,255,255,0.2)' : ACC, fontSize: 11, fontFamily: 'monospace', fontWeight: 700, letterSpacing: 1, whiteSpace: 'nowrap', userSelect: 'none' }}>
        {status === 'loading' ? `${progress}%…` : status === 'done' ? '↺ RELOAD' : '▶ LOAD DATA'}
      </div>
    </div>
  );
}

// ─── AI Chat ─────────────────────────────────────────────────────────────────
function AIChat({ view, benchmarkId, rrgData, universe, open, onClose }) {
  const { apiKey } = useSettingsStore();
  const [msgs,    setMsgs]    = useState([{ role: 'assistant', text: "Rotation analyst ready. Load data then ask:\n\n• \"What's the story right now?\"\n• \"Which themes are emerging?\"\n• \"What sectors are rotating in?\"" }]);
  const [input,   setInput]   = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, open]);

  const buildCtx = useCallback(() => {
    const loaded = Object.entries(rrgData);
    if (!loaded.length) return "No RRG data loaded yet.";
    const rows = loaded.map(([id, d]) => {
      const item = universe.find(x => x.id === id); if (!item) return "";
      const q = getQ(d.rs, d.rm);
      const prev = d.trail[Math.max(0, d.trail.length - 20)];
      return `${item.label}: RS=${d.rs.toFixed(1)}, MOM=${d.rm.toFixed(1)}, quadrant=${q}, 20d RS Δ=${(d.rs-(prev?.rs||d.rs)).toFixed(2)}, 20d MOM Δ=${(d.rm-(prev?.rm||d.rm)).toFixed(2)}`;
    }).filter(Boolean).join("\n");
    return `View: ${view}. Benchmark: ${benchmarkId}.\n\n${rows}`;
  }, [rrgData, universe, view, benchmarkId]);

  const send = async userText => {
    const text = userText.trim(); if (!text || loading) return;
    if (!apiKey) { setMsgs(p => [...p, { role: 'assistant', text: 'No Gemini API key — add it in Settings.' }]); return; }
    setInput(""); setMsgs(p => [...p, { role: 'user', text }]); setLoading(true);
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ system_instruction: { parts: [{ text: `You are a market analyst specializing in sector rotation and relative strength. Be concise and data-driven.\n\n${buildCtx()}` }] }, contents: [...msgs.filter((_,i)=>i>0).map(m=>({role:m.role==='user'?'user':'model',parts:[{text:m.text}]})),{role:'user',parts:[{text}]}] }) });
      const data  = await res.json();
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || (data.error ? `API Error: ${data.error.message}` : "No response.");
      setMsgs(p => [...p, { role: 'assistant', text: reply }]);
    } catch (e) { setMsgs(p => [...p, { role: 'assistant', text: `Error: ${e.message}` }]); }
    setLoading(false);
  };

  if (!open) return null;
  return (
    <div style={{ position: 'absolute', bottom: 60, right: 16, width: 340, height: 460, background: '#0a0f1a', border: `1px solid rgba(255,149,0,0.3)`, borderRadius: 8, display: 'flex', flexDirection: 'column', zIndex: 50, boxShadow: '0 8px 40px rgba(0,0,0,0.65)' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ flex: 1, color: ACC, fontFamily: 'monospace', fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>✦ ROTATION ANALYST</span>
        <div onClick={onClose} style={{ color: 'rgba(255,255,255,0.35)', cursor: 'pointer', fontSize: 16 }}>×</div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 7 }}>
        {msgs.map((m, i) => (
          <div key={i} style={{ padding: '8px 10px', borderRadius: 5, background: m.role === 'user' ? 'rgba(255,149,0,0.09)' : 'rgba(255,255,255,0.04)', border: `1px solid ${m.role === 'user' ? 'rgba(255,149,0,0.2)' : 'rgba(255,255,255,0.06)'}`, color: m.role === 'user' ? '#ffc56a' : 'rgba(255,255,255,0.65)', fontFamily: 'monospace', fontSize: 11, lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{m.text}</div>
        ))}
        {loading && <div style={{ color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace', fontSize: 12 }}>…</div>}
        <div ref={bottomRef} />
      </div>
      <div style={{ padding: '5px 10px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 4, flexWrap: 'wrap', flexShrink: 0 }}>
        {["What's the story?", "Emerging themes?", "Rotating in?"].map(p => (
          <div key={p} onClick={() => send(p)} style={{ padding: '3px 7px', borderRadius: 3, cursor: 'pointer', fontSize: 9, fontFamily: 'monospace', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.07)' }}>{p}</div>
        ))}
      </div>
      <div style={{ padding: '8px 10px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 6, flexShrink: 0 }}>
        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send(input)} placeholder="Ask about rotation…"
          style={{ flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '6px 9px', color: '#e0e6f0', fontFamily: 'monospace', fontSize: 11, outline: 'none' }} />
        <div onClick={() => send(input)} style={{ padding: '6px 11px', borderRadius: 4, cursor: 'pointer', background: 'rgba(255,149,0,0.14)', border: '1px solid rgba(255,149,0,0.3)', color: ACC, fontFamily: 'monospace', fontSize: 11, fontWeight: 700 }}>→</div>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function RRGPage() {
  const [view,        setView]        = useState("sectors");
  const [chartMode,   setChartMode]   = useState("rrg");
  const [benchmarkId, setBenchmarkId] = useState("SPY");
  const [tailBars,    setTailBars]    = useState(21);
  const [hovId,       setHovId]       = useState(null);
  const [aiOpen,      setAiOpen]      = useState(false);
  const [animating,   setAnimating]   = useState(false);
  const [animFrame,   setAnimFrame]   = useState(null);
  const [animSpeed,   setAnimSpeed]   = useState(1);
  const animRef = useRef(null);

  const universe = view === "sectors" ? SECTORS : view === "industries" ? INDUSTRIES : THEMES;

  // RRG data (relative strength / momentum)
  const { data: rrgData, status: rrgStatus, progress: rrgProgress, load: rrgLoad, trailDates } = useRRGData(universe, benchmarkId);

  // Return data (absolute % returns for ranking view)
  const { data: returnData, status: retStatus, progress: retProgress, load: retLoad } = useReturnData(universe);

  // Animation — trail is always 63 bars; maxFrame = 62
  const maxFrame = useMemo(() => {
    const vals = Object.values(rrgData);
    if (!vals.length) return 62;
    return Math.min(...vals.map(d => d.trail?.length ?? 63)) - 1;
  }, [rrgData]);

  useEffect(() => {
    if (animating) {
      const ms = Math.round(120 / animSpeed);
      animRef.current = setInterval(() => {
        setAnimFrame(f => {
          const cur = f ?? 0;
          if (cur >= maxFrame) { setAnimating(false); return maxFrame; }
          return cur + 1;
        });
      }, ms);
    } else {
      clearInterval(animRef.current);
    }
    return () => clearInterval(animRef.current);
  }, [animating, maxFrame, animSpeed]);

  const handlePlayPause = useCallback(() => {
    if (!Object.keys(rrgData).length) return;
    if (animating) {
      setAnimating(false);
    } else {
      if (animFrame === null || animFrame >= maxFrame) setAnimFrame(0);
      setAnimating(true);
    }
  }, [animating, animFrame, rrgData, maxFrame]);

  const handleResetAnim = useCallback(() => {
    setAnimating(false);
    setAnimFrame(null);
  }, []);

  // Active status / progress / load depend on mode
  const status   = chartMode === 'rrg' ? rrgStatus   : retStatus;
  const progress = chartMode === 'rrg' ? rrgProgress : retProgress;
  const load     = chartMode === 'rrg' ? rrgLoad     : retLoad;

  // Auto-load on mount
  useEffect(() => { rrgLoad(); retLoad(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Reload when view or benchmark changes
  const prevRef = useRef({ view, benchmarkId });
  useEffect(() => {
    const prev = prevRef.current;
    if (prev.view !== view || prev.benchmarkId !== benchmarkId) {
      prevRef.current = { view, benchmarkId };
      rrgLoad();
      retLoad();
    }
  }, [view, benchmarkId, rrgLoad, retLoad]);

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#080c14', overflow: 'hidden', position: 'relative' }}>
      <TopBar
        view={view} setView={setView}
        chartMode={chartMode} setChartMode={setChartMode}
        benchmarkId={benchmarkId} setBenchmarkId={setBenchmarkId}
        tailBars={tailBars} setTailBars={setTailBars}
        animating={animating} onPlayPause={handlePlayPause}
        status={status} progress={progress} load={load}
      />
      {chartMode === 'rrg' && rrgStatus === 'done' && (
        <AnimScrubber
          animFrame={animFrame} setAnimFrame={setAnimFrame}
          setAnimating={setAnimating} animating={animating}
          onPlayPause={handlePlayPause} onResetAnim={handleResetAnim}
          maxFrame={maxFrame}
          animSpeed={animSpeed} setAnimSpeed={setAnimSpeed}
          trailDates={trailDates}
        />
      )}

      <div style={{ flex: 1, display: 'flex', minHeight: 0, overflow: 'hidden' }}>
        {chartMode === 'rrg' ? (
          <>
            <RRGChart items={universe} rrgData={rrgData} tailBars={tailBars} animFrame={animFrame} hovId={hovId} setHovId={setHovId} benchmarkId={benchmarkId} />
            <SectorList items={universe} rrgData={rrgData} hovId={hovId} setHovId={setHovId} />
          </>
        ) : (
          <RankingView universe={universe} returnData={returnData} status={retStatus} progress={retProgress} />
        )}
      </div>

      <div style={{ position: 'absolute', bottom: 14, right: 14, zIndex: 40 }}>
        <div onClick={() => setAiOpen(o => !o)} style={{ padding: '7px 14px', borderRadius: 6, cursor: 'pointer', background: aiOpen ? ACC : 'rgba(255,149,0,0.1)', border: `1px solid ${aiOpen ? ACC : 'rgba(255,149,0,0.3)'}`, color: aiOpen ? '#060b12' : ACC, fontFamily: 'monospace', fontSize: 11, fontWeight: 700, letterSpacing: 1, boxShadow: '0 4px 16px rgba(0,0,0,0.5)', userSelect: 'none' }}>
          {aiOpen ? '× CLOSE' : '✦ ASK AI'}
        </div>
      </div>
      <AIChat view={view} benchmarkId={benchmarkId} rrgData={rrgData} universe={universe} open={aiOpen} onClose={() => setAiOpen(false)} />
    </div>
  );
}
