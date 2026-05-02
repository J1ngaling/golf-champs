"use client";

import { useState, useEffect, useCallback, useMemo, useRef, createContext, useContext } from "react";
import { ref, onValue, set } from "firebase/database";
import { db } from "@/lib/firebase";
import { isAdmin, attemptLogin, logout } from "@/lib/auth";

const TOURNAMENTS = [
  { id: "masters", name: "The Masters", short: "Masters", venue: "Augusta National", month: "April", motif: "azalea" },
  { id: "pga", name: "PGA Championship", short: "PGA", venue: "Quail Hollow", month: "May", motif: "wanamaker" },
  { id: "usopen", name: "U.S. Open", short: "U.S. Open", venue: "Shinnecock Hills", month: "June", motif: "stripes" },
  { id: "open", name: "The Open", short: "The Open", venue: "Royal Birkdale", month: "July", motif: "links" },
];

const DEFAULT_PLAYERS = Array.from({ length: 16 }, (_, i) => `Player ${i + 1}`);

function rankResults(entries) {
  if (!entries || entries.length === 0) return [];
  const sorted = [...entries].sort((a, b) => a.score - b.score);
  let rank = 1;
  return sorted.map((r, i) => {
    if (i > 0 && r.score > sorted[i - 1].score) rank = i + 1;
    return { ...r, rank };
  });
}

function formatScore(n) {
  if (n == null) return "—";
  if (n === 0) return "E";
  return (n > 0 ? "+" : "") + n;
}

function inits(name) {
  return name.split(/\s+/).map(p => p[0]).slice(0, 2).join("").toUpperCase();
}

function Avatar({ name, size = 24 }) {
  return <span className="lk-avatar" style={{ width: size, height: size, fontSize: size * 0.4 }} aria-label={name}>{inits(name)}</span>;
}

function Crest({ motif, size = 32 }) {
  const c = "hsl(var(--primary))";
  const a = "hsl(var(--gold))";
  const r = "hsl(var(--azalea))";
  const cl = "hsl(var(--claret))";
  if (motif === "azalea") return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14" fill="none" stroke={c} strokeWidth="0.7" opacity="0.5"/>
      {[0,72,144,216,288].map(d => <ellipse key={d} cx="16" cy="9" rx="3.2" ry="5" fill={r} opacity="0.85" transform={`rotate(${d} 16 16)`}/>)}
      <circle cx="16" cy="16" r="2" fill={a}/>
    </svg>
  );
  if (motif === "wanamaker") return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="13" fill="none" stroke={c} strokeWidth="0.7" opacity="0.5"/>
      <circle cx="16" cy="16" r="9" fill="none" stroke={c} strokeWidth="0.7" opacity="0.4"/>
      <path d="M16 7 L18 14 L25 14 L19.5 18 L21.5 25 L16 21 L10.5 25 L12.5 18 L7 14 L14 14 Z" fill={a} opacity="0.9"/>
    </svg>
  );
  if (motif === "stripes") return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14" fill="none" stroke={c} strokeWidth="0.7" opacity="0.5"/>
      <rect x="6" y="9" width="20" height="2" fill={cl}/><rect x="6" y="13" width="20" height="2" fill={cl}/>
      <rect x="6" y="17" width="20" height="2" fill={cl}/><rect x="6" y="21" width="20" height="2" fill={cl}/>
    </svg>
  );
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="14" fill="none" stroke={c} strokeWidth="0.7" opacity="0.5"/>
      <path d="M3 22 Q9 15 14 19 T26 17 L29 22 L29 26 L3 26 Z" fill={c} opacity="0.7"/>
      <circle cx="22" cy="9" r="2.4" fill={a}/>
    </svg>
  );
}

function Move({ delta }) {
  if (delta == null || delta === 0) return <span className="lk-move lk-move-flat">—</span>;
  if (delta > 0) return <span className="lk-move lk-move-up"><svg width="10" height="10" viewBox="0 0 10 10"><path d="M5 2 L9 8 L1 8 Z" fill="currentColor"/></svg>{delta}</span>;
  return <span className="lk-move lk-move-down"><svg width="10" height="10" viewBox="0 0 10 10"><path d="M5 8 L9 2 L1 2 Z" fill="currentColor"/></svg>{Math.abs(delta)}</span>;
}

const ToastCtx = createContext(null);
function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = (msg) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, msg }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2400);
  };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="lk-toast-wrap" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="lk-toast" role="status">
            <span className="check"><svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 5 L4.2 7 L8 3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
const useToast = () => useContext(ToastCtx);

function StandingsView({ players, results, tournaments }) {
  const tRank = {};
  tournaments.forEach((t) => { if (results[t.id]) tRank[t.id] = rankResults(results[t.id]); });
  const standings = players.map((player) => {
    let totalRank = 0, played = 0; const ranks = {}; const wins = [];
    tournaments.forEach((t) => {
      const tr = tRank[t.id];
      if (tr) { const e = tr.find((r) => r.player === player); if (e) { totalRank += e.rank; played++; ranks[t.id] = e.rank; if (e.rank === 1) wins.push(t); } }
    });
    return { player, totalRank, played, ranks, wins };
  }).filter((s) => s.played > 0);
  standings.sort((a, b) => a.played !== b.played ? b.played - a.played : a.totalRank - b.totalRank);
  let sr = 1;
  const ranked = standings.map((s, i) => {
    if (i > 0 && (s.totalRank > standings[i - 1].totalRank || s.played < standings[i - 1].played)) sr = i + 1;
    return { ...s, seasonRank: sr };
  });
  if (ranked.length === 0) return <div className="lk-empty"><p>No results yet</p><span>Standings appear after the first major.</span></div>;
  return (
    <div className="lk-card">
      <div className="lk-card-hd"><div><h3 className="lk-card-title"><em>Season</em> Standings</h3><p className="lk-card-desc">Lowest cumulative rank across the four majors wins.</p></div></div>
      <table className="lk-table">
        <thead><tr><th style={{ width: 48 }}>#</th><th>Player</th>{tournaments.map((t) => <th key={t.id} className="center" title={t.name} style={{ width: 56 }}>{t.short}</th>)}<th className="right" style={{ width: 60 }}>Total</th><th className="center" style={{ width: 56 }}>Δ</th></tr></thead>
        <tbody>{ranked.map((s) => (
          <tr key={s.player} className={s.seasonRank <= 3 ? `podium-${s.seasonRank}` : ""}>
            <td className="lk-td-rank">{s.seasonRank === 1 ? <span className="lk-td-rank-seal">1</span> : s.seasonRank}</td>
            <td><div className="lk-td-player"><Avatar name={s.player} size={28} /><div><div className="lk-td-player-name">{s.player}{s.wins.length > 0 && <span className="lk-td-wins">{s.wins.map((w) => <span key={w.id} className="lk-td-win" title={`Won ${w.name}`}><Crest motif={w.motif} size={18} /></span>)}</span>}</div></div></div></td>
            {tournaments.map((t) => <td key={t.id} className="lk-td-major">{s.ranks[t.id] != null ? <span className={`lk-rank-badge ${s.ranks[t.id] === 1 ? "r1" : ""}`}>{s.ranks[t.id]}</span> : <span className="lk-dash">—</span>}</td>)}
            <td className="lk-td-total">{s.totalRank}</td>
            <td className="lk-td-move"><Move delta={null} /></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function TournamentsView({ players, results, tournaments, admin, onSave, onClear }) {
  const [editingT, setEditingT] = useState(null);
  const [scores, setScores] = useState({});
  const toast = useToast();
  const tRank = useMemo(() => { const o = {}; tournaments.forEach((t) => { if (results[t.id]) o[t.id] = rankResults(results[t.id]); }); return o; }, [tournaments, results]);
  const startEdit = (id) => { const existing = results[id]; const s = {}; players.forEach((p) => { const e = existing?.find((r) => r.player === p); s[p] = e ? String(e.score) : ""; }); setScores(s); setEditingT(id); };
  const save = () => { const entries = Object.entries(scores).filter(([, v]) => v !== "" && !isNaN(Number(v))).map(([player, score]) => ({ player, score: Number(score) })); onSave(editingT, entries); const t = tournaments.find(x => x.id === editingT); setEditingT(null); if (toast) toast(`${t?.short} saved`); };
  return (
    <div className="lk-t-grid">
      {tournaments.map((t) => {
        const has = !!results[t.id]; const ranked = tRank[t.id] || []; const isEditing = editingT === t.id;
        return (
          <article key={t.id} className="lk-t-card">
            <header className="lk-t-card-hd">
              <div><h3 className="lk-t-card-title">{t.name}</h3><div className="lk-t-card-meta">{t.venue} · {t.month}</div></div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}><Crest motif={t.motif} /><span className={`lk-badge ${has ? "lk-badge-primary" : ""}`}>{has && <span className="dot" />}{has ? "Final" : "Upcoming"}</span></div>
            </header>
            {isEditing ? (
              <div className="lk-entry">
                <div className="lk-entry-cap"><span>Scorecard · {t.short}</span><span className="hand">marker&apos;s pen</span></div>
                <div className="lk-entry-grid">{players.map((p) => (
                  <div key={p} className="lk-entry-row"><label htmlFor={`s-${t.id}-${p}`}><Avatar name={p} size={20} /><span>{p}</span></label>
                  <input id={`s-${t.id}-${p}`} type="number" className="lk-input lk-input-hand" placeholder="—" value={scores[p] || ""} onChange={(e) => setScores({ ...scores, [p]: e.target.value })} /></div>
                ))}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 16, paddingTop: 14, borderTop: "1px solid hsl(var(--border))" }}>
                  {has && <button className="lk-btn lk-btn-destructive lk-btn-sm" onClick={() => { onClear(t.id); setEditingT(null); if (toast) toast(`${t.short} cleared`); }}>Clear scores</button>}
                  <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}><button className="lk-btn lk-btn-ghost lk-btn-sm" onClick={() => setEditingT(null)}>Cancel</button><button className="lk-btn lk-btn-primary lk-btn-sm" onClick={save}>Save scores</button></div>
                </div>
              </div>
            ) : has ? (
              <div className="lk-t-card-body" style={{ maxHeight: 320, overflowY: "auto" }}>
                {ranked.map((r) => (
                  <div key={r.player} className="lk-result-row"><span className={`lk-result-rank ${r.rank === 1 ? "r1" : ""}`}>{r.rank}</span><span className="lk-result-player"><Avatar name={r.player} size={20} /><span className="lk-result-player-name">{r.player}</span></span><span className={`lk-result-score ${r.score < 0 ? "under" : ""}`}>{formatScore(r.score)}</span></div>
                ))}
              </div>
            ) : <div className="lk-t-card-empty">{t.motif === "azalea" ? "Tee times pending." : t.motif === "wanamaker" ? "Pack a sweater." : t.motif === "stripes" ? "Bring sunscreen." : "Sea breezes ahead."}</div>}
            {admin && !isEditing && <div className="lk-t-card-cta"><button className="lk-btn lk-btn-outline lk-btn-sm" onClick={() => startEdit(t.id)}>{has ? "Edit scores" : "Enter scores"}</button></div>}
          </article>
        );
      })}
    </div>
  );
}

function PrizesView({ players, results, tournaments, currency, buyIn, seasonBuyIn }) {
  const tournamentPot = buyIn * players.length; const seasonPot = seasonBuyIn * players.length;
  const tRank = {}; tournaments.forEach((t) => { if (results[t.id]) tRank[t.id] = rankResults(results[t.id]); });
  const standings = players.map((player) => { let totalRank = 0, played = 0; tournaments.forEach((t) => { if (tRank[t.id]) { const e = tRank[t.id].find((r) => r.player === player); if (e) { totalRank += e.rank; played++; } } }); return { player, totalRank, played }; }).filter((s) => s.played > 0);
  standings.sort((a, b) => a.played !== b.played ? b.played - a.played : a.totalRank - b.totalRank);
  const completed = tournaments.filter((t) => results[t.id]).length;
  return (
    <>
      <div className="lk-prize-section"><h3>Per-<em>major</em> purse</h3><p className="sub">{currency}{tournamentPot} per major · 70/30 split</p>
        <div className="lk-prize-grid">{tournaments.map((t) => { const ranked = tRank[t.id]; const first = ranked?.find((r) => r.rank === 1); const second = ranked?.find((r) => r.rank === 2); return (
          <div key={t.id} className="lk-prize-card"><div className="lk-prize-card-hd" style={{ display: "flex", alignItems: "center", gap: 8 }}><Crest motif={t.motif} size={22} />{t.name}</div>{ranked ? (<><div className="lk-prize-row"><span className="name"><Avatar name={first.player} size={20} /> {first.player}</span><span className="lk-prize-amt gold">{currency}{(tournamentPot * 0.7).toFixed(0)}</span></div><div className="lk-prize-row"><span className="name"><Avatar name={second.player} size={20} /> {second.player}</span><span className="lk-prize-amt">{currency}{(tournamentPot * 0.3).toFixed(0)}</span></div></>) : <p className="lk-prize-pending">Pending — {t.month}</p>}</div>
        ); })}</div>
      </div>
      <div className="lk-prize-section"><h3><em>Season</em> purse</h3><p className="sub">{currency}{seasonPot} on the line · 70/30 split</p>
        {standings.length > 0 ? (
          <div className="lk-season-prize">{[0, 1].map((i) => { const s = standings[i]; if (!s) return null; const amt = i === 0 ? seasonPot * 0.7 : seasonPot * 0.3; return <div key={i} className="lk-season-prize-row"><span className={`lk-season-prize-place ${i === 0 ? "first" : ""}`}>{i === 0 ? "1st" : "2nd"}</span><div><div className="lk-season-prize-name">{s.player}</div></div><span className="lk-season-prize-amt">{currency}{amt.toFixed(0)}</span></div>; })}
            {completed < 4 && <p className="lk-season-prize-foot">Projected — {4 - completed} major{4 - completed > 1 ? "s" : ""} remaining</p>}
          </div>
        ) : <p className="lk-prize-pending">No results entered yet.</p>}
      </div>
    </>
  );
}

function SettingsDrawer({ players, currency, buyIn, seasonBuyIn, onUpdate }) {
  const [editing, setEditing] = useState(false); const [draft, setDraft] = useState(players.join("\n"));
  const tournamentPot = buyIn * players.length; const seasonPot = seasonBuyIn * players.length;
  return (
    <div className="lk-settings"><h3>League settings</h3>
      <div className="lk-settings-row"><label className="lk-label">Currency</label><div className="lk-toggle-group" role="group">{["€","£","$","R"].map((c) => <button key={c} className={`lk-toggle ${currency === c ? "active" : ""}`} onClick={() => onUpdate({ currency: c })}>{c}</button>)}</div></div>
      <div className="lk-settings-row" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div><label className="lk-label" htmlFor="buyin">Per-major buy-in</label><input id="buyin" type="number" value={buyIn} className="lk-input" style={{ width: 120 }} onChange={(e) => onUpdate({ buyIn: Number(e.target.value) })} /></div>
        <div><label className="lk-label" htmlFor="sbuyin">Season buy-in</label><input id="sbuyin" type="number" value={seasonBuyIn} className="lk-input" style={{ width: 120 }} onChange={(e) => onUpdate({ seasonBuyIn: Number(e.target.value) })} /></div>
      </div>
      <div className="lk-settings-row"><label className="lk-label">Field — {players.length} players</label>
        {!editing ? (<><div className="lk-chips">{players.map((p) => <span key={p} className="lk-chip"><Avatar name={p} size={16} />{p}</span>)}</div><button className="lk-btn lk-btn-ghost lk-btn-sm" style={{ marginTop: 10, padding: "0 8px" }} onClick={() => { setDraft(players.join("\n")); setEditing(true); }}>Edit field</button></>) : (<><textarea className="lk-input" style={{ width: "100%", minHeight: 180, padding: 10, fontSize: 13 }} value={draft} onChange={(e) => setDraft(e.target.value)} /><div style={{ display: "flex", gap: 8, marginTop: 10 }}><button className="lk-btn lk-btn-primary lk-btn-sm" onClick={() => { const np = draft.split("\n").map(s => s.trim()).filter(Boolean); if (np.length > 0) onUpdate({ players: np }); setEditing(false); }}>Save</button><button className="lk-btn lk-btn-ghost lk-btn-sm" onClick={() => setEditing(false)}>Cancel</button></div></>)}
      </div>
      <div className="lk-help">Per-major pot: {currency}{tournamentPot} · Season pot: {currency}{seasonPot}</div>
    </div>
  );
}

function PinDialog({ onClose, onLogin }) {
  const [pin, setPin] = useState(""); const [err, setErr] = useState(""); const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { const onKey = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [onClose]);
  const submit = () => { if (attemptLogin(pin)) { onLogin(); } else { setErr("Incorrect PIN"); setPin(""); } };
  return (
    <div className="lk-overlay" onClick={onClose} role="dialog" aria-modal="true"><div className="lk-dialog" onClick={(e) => e.stopPropagation()}>
      <h3>Enter admin PIN</h3><p>Required to enter or edit scores.</p>
      <input ref={inputRef} className="lk-pin" type="password" inputMode="numeric" value={pin} placeholder="••••" onChange={(e) => { setPin(e.target.value); setErr(""); }} onKeyDown={(e) => e.key === "Enter" && submit()} />
      <p className="lk-pin-err" role="alert">{err || "\u00A0"}</p>
      <div className="lk-dialog-btns"><button className="lk-btn lk-btn-outline" onClick={onClose}>Cancel</button><button className="lk-btn lk-btn-primary" onClick={submit}>Continue</button></div>
    </div></div>
  );
}

export default function Dashboard() {
  const [players, setPlayers] = useState(DEFAULT_PLAYERS);
  const [results, setResults] = useState({});
  const [buyIn, setBuyIn] = useState(20);
  const [seasonBuyIn, setSeasonBuyIn] = useState(20);
  const [currency, setCurrency] = useState("€");
  const [view, setView] = useState("standings");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    setAdmin(isAdmin());
    const unsubs = [];
    const listen = (path, cb) => { const r = ref(db, path); const unsub = onValue(r, (snap) => cb(snap.val())); unsubs.push(unsub); };
    listen("players", (v) => { if (v) setPlayers(v); });
    listen("results", (v) => setResults(v || {}));
    listen("config", (v) => { if (v) { if (v.buyIn != null) setBuyIn(v.buyIn); if (v.seasonBuyIn != null) setSeasonBuyIn(v.seasonBuyIn); if (v.currency) setCurrency(v.currency); } setLoaded(true); });
    return () => unsubs.forEach((u) => u());
  }, []);

  useEffect(() => { if (theme === "dark") document.documentElement.classList.add("dark"); else document.documentElement.classList.remove("dark"); }, [theme]);

  const persist = useCallback(async (path, value) => { setSaving(true); await set(ref(db, path), value); setSaving(false); }, []);

  const handleSave = (tId, entries) => { const next = { ...results }; if (entries.length === 0) delete next[tId]; else next[tId] = entries; setResults(next); persist("results", next); };
  const handleClear = (tId) => { const next = { ...results }; delete next[tId]; setResults(next); persist("results", next); };
  const updateConfig = (patch) => {
    if (patch.currency != null) setCurrency(patch.currency);
    if (patch.buyIn != null) setBuyIn(patch.buyIn);
    if (patch.seasonBuyIn != null) setSeasonBuyIn(patch.seasonBuyIn);
    if (patch.players) { setPlayers(patch.players); persist("players", patch.players); }
    const cfgPatch = {};
    if (patch.currency != null) cfgPatch.currency = patch.currency;
    if (patch.buyIn != null) cfgPatch.buyIn = patch.buyIn;
    if (patch.seasonBuyIn != null) cfgPatch.seasonBuyIn = patch.seasonBuyIn;
    if (Object.keys(cfgPatch).length > 0) persist("config", { buyIn: patch.buyIn ?? buyIn, seasonBuyIn: patch.seasonBuyIn ?? seasonBuyIn, currency: patch.currency ?? currency });
  };

  const handleLogin = () => { setAdmin(true); setShowLogin(false); };
  const handleLogout = () => { logout(); setAdmin(false); };
  const seasonPot = seasonBuyIn * players.length;
  const completed = TOURNAMENTS.filter(t => results[t.id]).length;

  if (!loaded) return <div className="lk-app"><div className="lk-shell" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}><p style={{ color: "hsl(var(--muted-foreground))", fontStyle: "italic" }}>Loading…</p></div></div>;

  return (
    <ToastProvider><div className="lk-app">
      {showLogin && <PinDialog onClose={() => setShowLogin(false)} onLogin={handleLogin} />}
      <div className="lk-shell">
        <header className="lk-header">
          <div className="lk-brand">
            <div className="lk-brand-mark"><svg width="18" height="18" viewBox="0 0 14 14"><line x1="4" y1="2" x2="4" y2="12.5" stroke="white" strokeWidth="1.2" strokeLinecap="round" /><path d="M4 2.5 L11 4.2 L4 6 Z" fill="white" /><circle cx="4" cy="12.5" r="1" fill="white" /></svg></div>
            <span className="lk-brand-name">RC Golf <em>Champs</em></span>
            <span className="lk-brand-sub">{new Date().getFullYear()} season</span>
          </div>
          <div className="lk-header-actions">
            {saving && <span className="lk-badge lk-badge-secondary">Saving…</span>}
            <button className="lk-btn lk-btn-ghost lk-btn-icon lk-btn-sm" aria-label="Toggle theme" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              {theme === "dark" ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>}
            </button>
            {admin ? (<><span className="lk-badge lk-badge-secondary">Admin</span><button className="lk-btn lk-btn-ghost lk-btn-sm" onClick={() => setSettingsOpen((o) => !o)}>Settings</button><button className="lk-btn lk-btn-outline lk-btn-sm" onClick={handleLogout}>Sign out</button></>) : (<button className="lk-btn lk-btn-outline lk-btn-sm" onClick={() => setShowLogin(true)}>Sign in</button>)}
          </div>
        </header>

        <section className="lk-hero">
          <h1>The <em>Major</em> Wager</h1>
          <p>Track standings, scores, and the pot across the four majors.</p>
          <div className="lk-hero-row">
            <div className="lk-hero-stat"><span className="lk-hero-stat-label">Field</span><span className="lk-hero-stat-value">{players.length} players</span></div>
            <div className="lk-hero-stat"><span className="lk-hero-stat-label">Played</span><span className="lk-hero-stat-value">{completed} of 4</span></div>
            <div className="lk-hero-stat"><span className="lk-hero-stat-label">Season pot</span><span className="lk-hero-stat-value">{currency}{seasonPot}</span></div>
          </div>
        </section>

        {settingsOpen && admin && <SettingsDrawer players={players} currency={currency} buyIn={buyIn} seasonBuyIn={seasonBuyIn} onUpdate={updateConfig} />}

        <div className="lk-tabs-list" role="tablist">
          {[{ id: "standings", label: "Standings" }, { id: "tournaments", label: "Majors", badge: `${completed}/4` }, { id: "prizes", label: "Purse" }].map((tab) => (
            <button key={tab.id} role="tab" aria-selected={view === tab.id} className={`lk-tab ${view === tab.id ? "active" : ""}`} onClick={() => setView(tab.id)}>
              {tab.label}{tab.badge && view !== tab.id && <span style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", fontVariantNumeric: "tabular-nums" }}>{tab.badge}</span>}
            </button>
          ))}
        </div>

        <main key={view} className="lk-view">
          {view === "standings" && <StandingsView players={players} results={results} tournaments={TOURNAMENTS} />}
          {view === "tournaments" && <TournamentsView players={players} results={results} tournaments={TOURNAMENTS} admin={admin} onSave={handleSave} onClear={handleClear} />}
          {view === "prizes" && <PrizesView players={players} results={results} tournaments={TOURNAMENTS} currency={currency} buyIn={buyIn} seasonBuyIn={seasonBuyIn} />}
        </main>
      </div>
    </div></ToastProvider>
  );
}
