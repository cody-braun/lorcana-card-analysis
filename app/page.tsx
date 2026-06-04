'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

// ─── MultiSelect Component ────────────────────────────────────────────────────
function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = 'All',
}: {
  options: string[];
  selected: string[];
  onChange: (vals: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const anchorRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        anchorRef.current && !anchorRef.current.contains(e.target as Node) &&
        menuRef.current && !menuRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Reposition whenever open or window resizes
  useEffect(() => {
    if (!open || !anchorRef.current) return;
    const position = () => {
      const rect = anchorRef.current!.getBoundingClientRect();
      const menuH = 220;
      const spaceBelow = window.innerHeight - rect.bottom;
      if (spaceBelow < menuH) {
        // Open upward
        setMenuStyle({ position: 'fixed', bottom: window.innerHeight - rect.top + 4, left: rect.left, width: rect.width, zIndex: 9999 });
      } else {
        // Open downward
        setMenuStyle({ position: 'fixed', top: rect.bottom + 4, left: rect.left, width: rect.width, zIndex: 9999 });
      }
    };
    position();
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    return () => { window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true); };
  }, [open]);

  const toggle = (val: string) => {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  };

  const label = selected.length === 0
    ? placeholder
    : selected.length === 1
    ? selected[0]
    : `${selected.length} selected`;

  return (
    <div ref={anchorRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-sm text-left flex items-center justify-between focus:outline-none focus:border-violet-600 transition-colors"
      >
        <span className={selected.length ? 'text-slate-200' : 'text-slate-600'}>{label}</span>
        <span className="text-slate-500 text-xs ml-2 shrink-0">{open ? '▴' : '▾'}</span>
      </button>

      {open && (
        <div ref={menuRef} style={menuStyle} className="rounded-xl border border-slate-700 bg-slate-900 shadow-xl overflow-hidden">
          {/* Clear button */}
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="w-full px-3 py-2 text-left text-xs text-slate-500 hover:text-red-400 hover:bg-slate-800/60 transition-colors border-b border-slate-800"
            >
              ✕ Clear selection
            </button>
          )}
          <div className="max-h-52 overflow-y-auto">
            {options.map(opt => {
              const checked = selected.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => toggle(opt)}
                  className={`w-full px-3 py-2.5 text-left text-sm flex items-center gap-2.5 transition-colors ${
                    checked ? 'bg-violet-900/30 text-violet-200' : 'text-slate-300 hover:bg-slate-800/60'
                  }`}
                >
                  <span className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center text-[10px] transition-colors ${
                    checked ? 'bg-violet-600 border-violet-600 text-white' : 'border-slate-600'
                  }`}>
                    {checked && '✓'}
                  </span>
                  {opt}
                </button>
              );
            })}
            {options.length === 0 && (
              <div className="px-3 py-3 text-xs text-slate-600 text-center">No options available</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface MatchRecord {
  season_name?: string;
  went_first?: string | number | boolean;
  your_deck_colors?: string;
  opp_deck_colors?: string;
  [key: string]: any;
}

interface CardStats {
  displayName: string;
  playedWins: number; playedTotal: number;
  inkedWins: number;  inkedTotal: number;
  openingWins: number; openingTotal: number;
  drawnWins: number;  drawnTotal: number;
  notDrawnWins: number; notDrawnTotal: number;
}

interface VersionData {
  rawDecklist: string;
  firstMatchIndex: number;
  summary: {
    totalGames: number; wins: number;
    wentFirstCount: number; parsedGames: number; failedGames: number;
    deckColors?: string;
  };
  cards: Record<string, CardStats>;
}

interface CardMeta { title: string; imgUrl: string; }

// ─── Helpers ──────────────────────────────────────────────────────────────────
const pct = (w: number, t: number) =>
  t > 0 ? ((w / t) * 100).toFixed(1) + '%' : '—';

const pctNum = (w: number, t: number) =>
  t > 0 ? (w / t) * 100 : -1;

const unique = (arr: string[]) =>
  [...new Set(arr.filter(Boolean).map(v => String(v).trim()))].sort();

const winColor = (w: number, t: number) => {
  if (t === 0) return 'text-slate-500';
  const r = (w / t) * 100;
  if (r >= 60) return 'text-emerald-400';
  if (r >= 50) return 'text-green-400';
  if (r >= 45) return 'text-slate-300';
  return 'text-red-400';
};

// ─── Card Art Cache (module-level so it persists across re-renders) ───────────
const cardMetaCache: Record<string, CardMeta> = {};

async function fetchCardMeta(cardId: string): Promise<CardMeta> {
  if (cardMetaCache[cardId]) return cardMetaCache[cardId];
  const parts = cardId.split('-');
  if (parts.length !== 2) return { title: '', imgUrl: '' };
  try {
    const res = await fetch(`https://api.lorcast.com/v0/cards/${parts[0]}/${parts[1]}`);
    if (!res.ok) return { title: '', imgUrl: '' };
    const data = await res.json();
    const meta = {
      title: data.name + (data.version ? ` — ${data.version}` : ''),
      imgUrl: data.image_uris?.digital?.small || '',
    };
    cardMetaCache[cardId] = meta;
    return meta;
  } catch { return { title: '', imgUrl: '' }; }
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function StageLabel({ n, label, active, done }: { n: number; label: string; active: boolean; done: boolean }) {
  return (
    <div className={`flex items-center gap-2 text-xs font-bold uppercase tracking-widest transition-colors ${active ? 'text-violet-300' : done ? 'text-emerald-500' : 'text-slate-600'}`}>
      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] border ${active ? 'border-violet-500 text-violet-300' : done ? 'border-emerald-500 text-emerald-400' : 'border-slate-700 text-slate-600'}`}>
        {done ? '✓' : n}
      </span>
      {label}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function StatCell({ label, total, wins, highlight }: { label: string; total: number; wins: number; highlight?: boolean }) {
  const color = winColor(wins, total);
  return (
    <td className={`px-3 py-2.5 text-center align-middle border-r border-slate-800/60 last:border-r-0 ${highlight ? 'bg-slate-800/30' : ''}`}>
      <div className={`text-sm font-bold tabular-nums ${color}`}>{pct(wins, total)}</div>
      <div className="text-[10px] text-slate-600 mt-0.5">{total > 0 ? total : '—'}</div>
    </td>
  );
}

// Card row with lazy-loaded art
function CardRow({ cardId, stats, rank }: { cardId: string; stats: CardStats; rank: number }) {
  const [meta, setMeta] = useState<CardMeta | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    fetchCardMeta(cardId).then(setMeta);
  }, [cardId]);

  const displayName = meta?.title || stats.displayName || cardId;

  return (
    <tr className="border-b border-slate-800/40 hover:bg-slate-800/20 transition-colors group">
      {/* Card Info */}
      <td className="px-3 py-2 border-r border-slate-800/60 w-[200px] min-w-[180px]">
        <div className="flex items-center gap-2.5">
          {/* Art thumbnail */}
          <div className="w-9 h-12 rounded shrink-0 overflow-hidden bg-slate-800 border border-slate-700/60">
            {meta?.imgUrl
              ? <img src={meta.imgUrl} alt={displayName} className="w-full h-full object-cover object-top" />
              : <div className="w-full h-full flex items-center justify-center text-slate-600 text-[9px] font-mono leading-tight text-center px-0.5">{cardId}</div>
            }
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-200 leading-tight truncate max-w-[120px]">
              {meta?.title || stats.displayName || <span className="text-slate-500 font-mono">{cardId}</span>}
            </div>
            {(meta?.title || stats.displayName) && (
              <div className="text-[10px] text-slate-600 font-mono mt-0.5 truncate">{cardId}</div>
            )}
          </div>
        </div>
      </td>
      <StatCell label="Played"    wins={stats.playedWins}   total={stats.playedTotal}   highlight />
      <StatCell label="Inked"     wins={stats.inkedWins}    total={stats.inkedTotal}    />
      <StatCell label="Opening"   wins={stats.openingWins}  total={stats.openingTotal}  highlight />
      <StatCell label="Drawn"     wins={stats.drawnWins}    total={stats.drawnTotal}    />
      <StatCell label="Not Drawn" wins={stats.notDrawnWins} total={stats.notDrawnTotal} highlight />
    </tr>
  );
}

const inputCls  = "w-full px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:border-violet-600 transition-colors placeholder:text-slate-700";
const selectCls = "w-full px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:border-violet-600 transition-colors appearance-none cursor-pointer";

type SortKey = 'played' | 'inked' | 'opening' | 'drawn' | 'notDrawn' | 'playedWR' | 'openingWR' | 'drawnWR';

// ─── Main Component ───────────────────────────────────────────────────────────
export default function LorcanaTracker() {
  // Stage 1
  const [authToken, setAuthToken] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate]     = useState('');
  const [source, setSource]       = useState<string[]>([]);  // multi-select
  const [allMatches, setAllMatches] = useState<MatchRecord[] | null>(null);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchStatus, setFetchStatus]   = useState('');
  const [seasonOptions, setSeasonOptions]       = useState<string[]>([]);
  const [deckColorOptions, setDeckColorOptions] = useState<string[]>([]);
  const [oppColorOptions, setOppColorOptions]   = useState<string[]>([]);

  // Stage 2
  const [seasonFilter, setSeasonFilter]       = useState<string[]>([]);  // multi-select
  const [wentFirstFilter, setWentFirstFilter] = useState('');
  const [deckColorFilter, setDeckColorFilter] = useState('');
  const [oppColorFilter, setOppColorFilter]   = useState<string[]>([]);  // multi-select
  const [reportData, setReportData]     = useState<Record<string, Record<string, VersionData>> | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisStatus, setAnalysisStatus]   = useState('');
  const [analysisSummary, setAnalysisSummary] = useState<any>(null);

  // Report UI state
  const [expandedDeck, setExpandedDeck] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('playedWR');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');

  // ── Stage 1 ────────────────────────────────────────────────────────────────
  const handleFetchMatches = async () => {
    if (!authToken.trim()) { alert('Authorization token is required.'); return; }
    setFetchLoading(true);
    setFetchStatus('Fetching match history…');
    setAllMatches(null);
    setReportData(null);

    try {
      const res = await fetch('/api/fetch-matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authToken: authToken.trim(), startDate: startDate || undefined, endDate: endDate || undefined, source: source.length ? source.join(',') : undefined }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setFetchStatus(`Error: ${data.error}`); return; }

      const matches: MatchRecord[] = data.matches;
      setAllMatches(matches);
      setFetchStatus('');
      setSeasonOptions(unique(matches.map(m => m.season_name ?? '')));
      setDeckColorOptions(unique(matches.map(m => m.your_deck_colors ?? '')));
      setOppColorOptions(unique(matches.map(m => m.opp_deck_colors ?? '')));
      setSeasonFilter([]); setWentFirstFilter(''); setDeckColorFilter(''); setOppColorFilter([]);
    } catch (err: any) {
      setFetchStatus(`Network error: ${err.message}`);
    } finally {
      setFetchLoading(false);
    }
  };

  // ── Stage 2 ────────────────────────────────────────────────────────────────
  const handleGenerateAnalysis = async () => {
    if (!allMatches) return;
    setAnalysisLoading(true);
    setAnalysisStatus('Applying filters & parsing game logs…');
    setReportData(null);
    setAnalysisSummary(null);
    setExpandedDeck(null);

    const filters: Record<string, string> = {};
    if (seasonFilter.length)  filters['season_name']     = seasonFilter.join(',');
    if (wentFirstFilter)      filters['went_first']       = wentFirstFilter;
    if (deckColorFilter)      filters['your_deck_colors'] = deckColorFilter;
    if (oppColorFilter.length)filters['opp_deck_colors']  = oppColorFilter.join(',');

    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authToken: authToken.trim(), matches: allMatches, filters }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setAnalysisStatus(`Error: ${data.error}`); return; }
      setReportData(data.reportData);
      setAnalysisSummary(data.summary);
      setAnalysisStatus('');
    } catch (err: any) {
      setAnalysisStatus(`Network error: ${err.message}`);
    } finally {
      setAnalysisLoading(false);
    }
  };

  // ── Sort handler ───────────────────────────────────────────────────────────
  const handleSort = (key: SortKey) => {
    if (sortBy === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortBy(key); setSortDir('desc'); }
  };

  const sortCards = (cards: Record<string, CardStats>) => {
    return Object.entries(cards).sort(([, a], [, b]) => {
      let aVal: number, bVal: number;
      switch (sortBy) {
        case 'played':   aVal = a.playedTotal;  bVal = b.playedTotal;  break;
        case 'inked':    aVal = a.inkedTotal;   bVal = b.inkedTotal;   break;
        case 'opening':  aVal = a.openingTotal; bVal = b.openingTotal; break;
        case 'drawn':    aVal = a.drawnTotal;   bVal = b.drawnTotal;   break;
        case 'notDrawn': aVal = a.notDrawnTotal;bVal = b.notDrawnTotal;break;
        case 'playedWR': aVal = pctNum(a.playedWins, a.playedTotal);   bVal = pctNum(b.playedWins, b.playedTotal);   break;
        case 'openingWR':aVal = pctNum(a.openingWins,a.openingTotal);  bVal = pctNum(b.openingWins,b.openingTotal);  break;
        case 'drawnWR':  aVal = pctNum(a.drawnWins, a.drawnTotal);     bVal = pctNum(b.drawnWins, b.drawnTotal);     break;
        default: aVal = 0; bVal = 0;
      }
      return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
    });
  };

  const stage = allMatches === null ? 1 : 2;

  const SortTh = ({ label, k, sub }: { label: string; k: SortKey; sub?: string }) => (
    <th
      onClick={() => handleSort(k)}
      className={`px-3 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider cursor-pointer select-none border-r border-slate-800/60 last:border-r-0 whitespace-nowrap transition-colors ${
        sortBy === k ? 'text-violet-300 bg-violet-900/20' : 'text-slate-500 hover:text-slate-300'
      }`}
    >
      {label}
      {sub && <div className="text-[9px] font-normal text-slate-600 normal-case tracking-normal">{sub}</div>}
      {sortBy === k && <span className="ml-1">{sortDir === 'desc' ? '↓' : '↑'}</span>}
    </th>
  );

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-[#080b12] text-slate-100 font-sans antialiased">
      {/* Header */}
      <header className="border-b border-slate-800/60 px-5 py-4 flex items-center justify-between sticky top-0 bg-[#080b12]/95 backdrop-blur-sm z-20">
        <div className="flex items-center gap-3">
          <span className="text-xl">🃏</span>
          <div>
            <h1 className="text-sm font-extrabold tracking-tight text-slate-100">Lorcana Tracker</h1>
            <p className="text-[10px] text-slate-500 leading-none">duels.ink analytics</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <StageLabel n={1} label="Load"    active={stage === 1} done={stage > 1} />
          <div className="w-6 h-px bg-slate-800" />
          <StageLabel n={2} label="Analyze" active={stage === 2} done={false} />
        </div>
      </header>

      <div className="max-w-screen-xl mx-auto px-4 py-6 space-y-5">
        <div className="flex flex-col lg:flex-row gap-5">

          {/* ── LEFT COLUMN: Control panels ── */}
          <div className="w-full lg:w-80 shrink-0 space-y-5">

            {/* Stage 1 */}
            <section className="rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
                <h2 className="text-xs font-bold text-slate-300 uppercase tracking-widest">Step 1 — Load Matches</h2>
                {allMatches && <span className="text-[11px] text-emerald-400 font-semibold">{allMatches.length.toLocaleString()} loaded</span>}
              </div>
              <div className="p-5 space-y-4">
                <Field label="Authorization Token">
                  <input type="password" placeholder="Paste token from duels.ink/account" value={authToken}
                    onChange={e => setAuthToken(e.target.value)} className={inputCls + ' font-mono text-violet-300'} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Start Date">
                    <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="End Date">
                    <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={inputCls} />
                  </Field>
                </div>
                <Field label="Source">
                  <MultiSelect
                    options={['matchmaking', 'private', 'bot']}
                    selected={source}
                    onChange={setSource}
                    placeholder="All queues"
                  />
                </Field>
                <button onClick={handleFetchMatches} disabled={fetchLoading}
                  className={`w-full py-3 rounded-xl text-sm font-bold tracking-wide transition-all ${fetchLoading ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-500 text-white shadow-lg shadow-violet-900/30'}`}>
                  {fetchLoading ? 'Fetching…' : allMatches ? '↺ Re-fetch Matches' : 'Get Matches'}
                </button>
                {fetchStatus && <p className="text-xs text-center font-mono text-amber-400">{fetchStatus}</p>}
              </div>
            </section>

            {/* Stage 2 */}
            {allMatches && (
              <section className="rounded-2xl border border-violet-900/50 bg-slate-900/50 overflow-hidden">
                <div className="px-5 py-3.5 border-b border-violet-900/40">
                  <h2 className="text-xs font-bold text-violet-300 uppercase tracking-widest">Step 2 — Generate Analysis</h2>
                </div>
                <div className="p-5 space-y-3">
                  <Field label="Season">
                    <MultiSelect
                      options={seasonOptions}
                      selected={seasonFilter}
                      onChange={setSeasonFilter}
                      placeholder="All seasons"
                    />
                  </Field>
                  <Field label="Went First">
                    <div className="relative">
                      <select value={wentFirstFilter} onChange={e => setWentFirstFilter(e.target.value)} className={selectCls}>
                        <option value="">Either</option>
                        <option value="true">Yes</option>
                        <option value="false">No</option>
                      </select>
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">▾</span>
                    </div>
                  </Field>
                  <Field label="Your Deck Colors">
                    <div className="relative">
                      <select value={deckColorFilter} onChange={e => setDeckColorFilter(e.target.value)} className={selectCls}>
                        <option value="">All colors</option>
                        {deckColorOptions.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">▾</span>
                    </div>
                  </Field>
                  <Field label="Opp. Deck Colors">
                    <MultiSelect
                      options={oppColorOptions}
                      selected={oppColorFilter}
                      onChange={setOppColorFilter}
                      placeholder="All colors"
                    />
                  </Field>
                  <button onClick={handleGenerateAnalysis} disabled={analysisLoading}
                    className={`w-full py-3 rounded-xl text-sm font-bold tracking-wide transition-all ${analysisLoading ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-emerald-700 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-900/30'}`}>
                    {analysisLoading ? 'Analyzing…' : 'Generate Analysis'}
                  </button>
                  {analysisStatus && <p className="text-xs text-center font-mono text-amber-400">{analysisStatus}</p>}
                </div>
              </section>
            )}

            {/* Summary stats */}
            {analysisSummary && (
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: 'Fetched',  value: analysisSummary.totalFetched,   color: 'text-slate-300' },
                  { label: 'Filtered', value: analysisSummary.totalFiltered,  color: 'text-violet-400' },
                  { label: 'Parsed',   value: analysisSummary.processedCount, color: 'text-emerald-400' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl py-3">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">{label}</div>
                    <div className={`text-base font-bold ${color}`}>{value?.toLocaleString()}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── RIGHT COLUMN: Report tables ── */}
          <div className="flex-1 min-w-0 space-y-6">
            {reportData && Object.entries(reportData).map(([deckId, versions]) => {
              // Sort versions by firstMatchIndex (ascending = oldest first)
              const sortedVersions = Object.entries(versions).sort(([, a], [, b]) =>
                (a as VersionData).firstMatchIndex - (b as VersionData).firstMatchIndex
              );

              return sortedVersions.map(([, vData], idx) => {
                const versionData = vData as VersionData;
                const { summary, cards } = versionData;
                const versionNum = idx + 1;
                const deckColors = summary.deckColors || deckId;
                const uid = `${deckId}-v${versionNum}`;
                const isExpanded = expandedDeck === uid;
                const winRate = summary.totalGames > 0 ? ((summary.wins / summary.totalGames) * 100).toFixed(1) : '0.0';
                const sortedCards = sortCards(cards);
                const deckUrl = `https://duels.ink/decks/${deckId}`;

                return (
                  <div key={uid} className="rounded-2xl border border-slate-800 bg-slate-900/50 overflow-hidden shadow-lg">
                    {/* Deck header — always visible */}
                    <div
                      onClick={() => setExpandedDeck(isExpanded ? null : uid)}
                      className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-slate-800/30 transition-colors"
                    >
                      <div className="min-w-0">
                        <a
                          href={deckUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="text-base font-extrabold text-slate-100 hover:text-violet-300 transition-colors truncate block group"
                        >
                          {deckColors} — Version {versionNum}
                          <span className="ml-1.5 text-slate-600 group-hover:text-violet-500 text-xs font-normal">↗</span>
                        </a>
                        <div className="text-xs text-slate-500 mt-0.5 font-mono truncate">{deckId}</div>
                      </div>
                      <div className="flex items-center gap-6 shrink-0 ml-4">
                        {[
                          { label: 'Games',      value: summary.totalGames.toString(),    color: 'text-slate-200' },
                          { label: 'Parsed',     value: summary.parsedGames.toString(),   color: 'text-slate-400' },
                          { label: 'Went First', value: summary.wentFirstCount.toString(),color: 'text-slate-400' },
                          { label: 'Win Rate',   value: winRate + '%',
                            color: Number(winRate) >= 55 ? 'text-emerald-400' : Number(winRate) >= 45 ? 'text-slate-200' : 'text-red-400' },
                        ].map(({ label, value, color }) => (
                          <div key={label} className="text-center hidden sm:block">
                            <div className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</div>
                            <div className={`text-sm font-bold ${color}`}>{value}</div>
                          </div>
                        ))}
                        {/* Mobile: just win rate */}
                        <div className="text-center sm:hidden">
                          <div className="text-[10px] text-slate-500">Win Rate</div>
                          <div className={`text-sm font-bold ${Number(winRate) >= 55 ? 'text-emerald-400' : Number(winRate) >= 45 ? 'text-slate-200' : 'text-red-400'}`}>{winRate}%</div>
                        </div>
                        <span className="text-slate-600 text-xs ml-2">{isExpanded ? '▲' : '▼'}</span>
                      </div>
                    </div>

                    {/* Card table */}
                    {isExpanded && (
                      <div className="border-t border-slate-800 overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                          <thead>
                            <tr className="bg-slate-950/80 border-b border-slate-800">
                              <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 border-r border-slate-800/60 w-[200px]">
                                Card
                              </th>
                              <SortTh label="Played"    k="playedWR"  sub="win %" />
                              <SortTh label="Inked"     k="inked"     sub="games" />
                              <SortTh label="Opening"   k="openingWR" sub="win %" />
                              <SortTh label="Drawn"     k="drawnWR"   sub="win %" />
                              <SortTh label="Not Drawn" k="notDrawn"  sub="games" />
                            </tr>
                          </thead>
                          <tbody>
                            {sortedCards.map(([cardId, stats]) => (
                              <CardRow key={cardId} cardId={cardId} stats={stats} rank={0} />
                            ))}
                          </tbody>
                        </table>
                        {sortedCards.length === 0 && (
                          <div className="px-5 py-8 text-center text-sm text-slate-600">No card interactions parsed for this version.</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              });
            })}

            {/* Empty state */}
            {!reportData && !analysisLoading && allMatches && (
              <div className="rounded-2xl border border-slate-800/50 bg-slate-900/20 py-16 text-center">
                <div className="text-3xl mb-3">📊</div>
                <div className="text-sm text-slate-500">Set your filters and click <span className="text-violet-400 font-semibold">Generate Analysis</span> to see card effectiveness data.</div>
              </div>
            )}
            {!allMatches && (
              <div className="rounded-2xl border border-slate-800/50 bg-slate-900/20 py-16 text-center">
                <div className="text-3xl mb-3">🃏</div>
                <div className="text-sm text-slate-500">Enter your auth token and click <span className="text-violet-400 font-semibold">Get Matches</span> to begin.</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
