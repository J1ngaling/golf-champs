"use client";

import { useState, useEffect, useCallback } from "react";
import { ref, onValue, set } from "firebase/database";
import { db } from "@/lib/firebase";
import { isAdmin, attemptLogin, logout } from "@/lib/auth";

// ─── Constants ───────────────────────────────────────────────────────────────

const TOURNAMENTS = [
  { id: "masters",  name: "The Masters",        emoji: "🌺", color: "#006747" },
  { id: "pga",      name: "PGA Championship",   emoji: "🏆", color: "#2563EB" },
  { id: "usopen",   name: "US Open",            emoji: "🇺🇸", color: "#862633" },
  { id: "open",     name: "The Open",           emoji: "⛳", color: "#78716c" },
];

const PRIZE_SPLIT = { first: 0.7, second: 0.3 };

const DEFAULT_PLAYERS = Array.from({ length: 16 }, (_, i) => `Player ${i + 1}`);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rankResults(entries) {
  if (!entries || entries.length === 0) return [];
  const sorted = [...entries].sort((a, b) => a.score - b.score);
  let rank = 1;
  return sorted.map((r, i) => {
    if (i > 0 && r.score > sorted[i - 1].score) rank = i + 1;
    return { ...r, rank };
  });
}

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ─── Styles ──────────────────────────────────────────────────────────────────

// ─── Component ───────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [players, setPlayers]           = useState(DEFAULT_PLAYERS);
  const [results, setResults]           = useState({});
  const [buyIn, setBuyIn]               = useState(20);
  const [seasonBuyIn, setSeasonBuyIn]   = useState(20);
  const [currency, setCurrency]         = useState("€");
  const [activeView, setActiveView]     = useState("standings");
  const [editingT, setEditingT]         = useState(null);
  const [editScores, setEditScores]     = useState({});
  const [loaded, setLoaded]             = useState(false);
  const [saving, setSaving]             = useState(false);
  const [editingPlayers, setEditingPlayers] = useState(false);
  const [playerDraft, setPlayerDraft]   = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [admin, setAdmin]               = useState(false);
  const [showLogin, setShowLogin]       = useState(false);
  const [pinInput, setPinInput]         = useState("");
  const [pinError, setPinError]         = useState("");

  // ── Firebase listeners ──────────────────────────────────────────────────
  useEffect(() => {
    setAdmin(isAdmin());
    const unsubs = [];

    const listen = (path, cb) => {
      const r = ref(db, path);
      const unsub = onValue(r, (snap) => cb(snap.val()));
      unsubs.push(unsub);
    };

    listen("players",    (v) => { if (v) setPlayers(v); });
    listen("results",    (v) => setResults(v || {}));
    listen("config",     (v) => {
      if (v) {
        if (v.buyIn      != null) setBuyIn(v.buyIn);
        if (v.seasonBuyIn != null) setSeasonBuyIn(v.seasonBuyIn);
        if (v.currency)            setCurrency(v.currency);
      }
      setLoaded(true);
    });

    return () => unsubs.forEach((u) => u());
  }, []);

  // ── Firebase writers ────────────────────────────────────────────────────
  const persist = useCallback(async (path, value) => {
    setSaving(true);
    await set(ref(db, path), value);
    setSaving(false);
  }, []);

  const persistPlayers = (p)          => { setPlayers(p); persist("players", p); };
  const persistConfig  = (bi, sbi, c) => { setBuyIn(bi); setSeasonBuyIn(sbi); setCurrency(c); persist("config", { buyIn: bi, seasonBuyIn: sbi, currency: c }); };
  const persistResults = (r)          => { setResults(r); persist("results", r); };

  // ── Admin auth ──────────────────────────────────────────────────────────
  const handleLogin = () => {
    if (attemptLogin(pinInput)) {
      setAdmin(true);
      setShowLogin(false);
      setPinInput("");
      setPinError("");
    } else {
      setPinError("Incorrect PIN");
      setPinInput("");
    }
  };

  const handleLogout = () => { logout(); setAdmin(false); };

  // ── Computed ────────────────────────────────────────────────────────────
  const tournamentRankings = {};
  TOURNAMENTS.forEach((t) => {
    if (results[t.id]) tournamentRankings[t.id] = rankResults(results[t.id]);
  });

  const activeSeason = players.map((player) => {
    let totalRank = 0, played = 0;
    const ranks = {};
    TOURNAMENTS.forEach((t) => {
      const tr = tournamentRankings[t.id];
      if (tr) {
        const entry = tr.find((r) => r.player === player);
        if (entry) { totalRank += entry.rank; played++; ranks[t.id] = entry.rank; }
      }
    });
    return { player, totalRank, played, ranks };
  }).filter((s) => s.played > 0);

  activeSeason.sort((a, b) =>
    a.played !== b.played ? b.played - a.played : a.totalRank - b.totalRank
  );

  let sr = 1;
  const seasonStandings = activeSeason.map((s, i) => {
    if (i > 0 && (s.totalRank > activeSeason[i - 1].totalRank || s.played < activeSeason[i - 1].played)) sr = i + 1;
    return { ...s, seasonRank: sr };
  });

  const tournamentPot  = buyIn * players.length;
  const seasonPot      = seasonBuyIn * players.length;
  const completedCount = TOURNAMENTS.filter((t) => results[t.id]).length;

  // ── Score editing ────────────────────────────────────────────────────────
  const startEdit = (tId) => {
    const existing = results[tId];
    const scores = {};
    players.forEach((p) => {
      const entry = existing?.find((r) => r.player === p);
      scores[p] = entry ? String(entry.score) : "";
    });
    setEditScores(scores);
    setEditingT(tId);
  };

  const saveScores = () => {
    const entries = Object.entries(editScores)
      .filter(([, v]) => v !== "" && !isNaN(Number(v)))
      .map(([player, score]) => ({ player, score: Number(score) }));
    const newResults = { ...results };
    if (entries.length === 0) delete newResults[editingT];
    else newResults[editingT] = entries;
    persistResults(newResults);
    setEditingT(null);
  };

  const clearTournament = (tId) => {
    const newResults = { ...results };
    delete newResults[tId];
    persistResults(newResults);
    setEditingT(null);
  };

  // ── Render ───────────────────────────────────────────────────────────────
  if (!loaded) return (
    <div className="gc gc-loading">
        <div className="gc-spinner" />
        <p>Loading…</p>
      </div>
  );

  return (
    <div>
    {/* PIN modal */}
      {showLogin && (
        <div className="gc-overlay">
          <div className="gc-modal">
            <h3>🔐 Admin Login</h3>
            <p>Enter your admin PIN to edit scores</p>
            <input
              className="gc-pin-input"
              type="password"
              inputMode="numeric"
              maxLength={8}
              value={pinInput}
              placeholder="····"
              onChange={(e) => setPinInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              autoFocus
            />
            <p className="gc-pin-err">{pinError}</p>
            <div className="gc-modal-btns">
              <button className="gc-modal-cancel" onClick={() => { setShowLogin(false); setPinError(""); setPinInput(""); }}>Cancel</button>
              <button className="gc-modal-login" onClick={handleLogin}>Login</button>
            </div>
          </div>
        </div>
      )}

      <div className="gc">
        {/* Header */}
        <header className="gc-header">
          <div className="gc-header-inner">
            <div>
              <h1 className="gc-title">⛳ Golf Champs</h1>
              <p className="gc-subtitle">{new Date().getFullYear()} Major Season — {completedCount}/4 played</p>
            </div>
            <div className="gc-header-actions">
              {saving && <span className="gc-saving">Saving…</span>}
              {admin
                ? <>
                    <span className="gc-admin-badge">Admin</span>
                    <button className="gc-icon-btn" title="Settings" onClick={() => setSettingsOpen(!settingsOpen)}>⚙️</button>
                    <button className="gc-icon-btn" title="Log out" onClick={handleLogout}>🚪</button>
                  </>
                : <button className="gc-icon-btn" title="Admin login" onClick={() => setShowLogin(true)}>🔐</button>
              }
            </div>
          </div>
        </header>

        {/* Settings (admin only) */}
        {settingsOpen && admin && (
          <div className="gc-settings">
            <h3>League Settings</h3>

            <div className="gc-settings-row">
              <label className="gc-label">Currency</label>
              <div className="gc-currency-btns">
                {["€","£","$","R"].map((c) => (
                  <button key={c} className={`gc-cur-btn ${currency === c ? "active" : ""}`}
                    onClick={() => persistConfig(buyIn, seasonBuyIn, c)}>{c}</button>
                ))}
              </div>
            </div>

            <div className="gc-settings-row">
              <label className="gc-label">Tournament buy-in (per person)</label>
              <input type="number" value={buyIn} className="gc-input w100"
                onChange={(e) => persistConfig(Number(e.target.value), seasonBuyIn, currency)} />
            </div>

            <div className="gc-settings-row">
              <label className="gc-label">Season buy-in (per person)</label>
              <input type="number" value={seasonBuyIn} className="gc-input w100"
                onChange={(e) => persistConfig(buyIn, Number(e.target.value), currency)} />
            </div>

            <div className="gc-settings-row">
              <label className="gc-label">Players (one per line)</label>
              {!editingPlayers ? (
                <>
                  <div className="gc-chips">
                    {players.map((p) => <span key={p} className="gc-chip">{p}</span>)}
                  </div>
                  <button className="gc-link-btn" onClick={() => { setPlayerDraft(players.join("\n")); setEditingPlayers(true); }}>
                    Edit players
                  </button>
                </>
              ) : (
                <>
                  <textarea className="gc-textarea" rows={10} value={playerDraft}
                    onChange={(e) => setPlayerDraft(e.target.value)} />
                  <div className="gc-row">
                    <button className="gc-save-btn" onClick={() => {
                      const np = playerDraft.split("\n").map((s) => s.trim()).filter(Boolean);
                      if (np.length > 0) persistPlayers(np);
                      setEditingPlayers(false);
                    }}>Save</button>
                    <button className="gc-cancel-btn" onClick={() => setEditingPlayers(false)}>Cancel</button>
                  </div>
                </>
              )}
            </div>

            <div className="gc-info-box">
              <p><strong>Tournament pot:</strong> {currency}{tournamentPot} → 1st {currency}{(tournamentPot * 0.7).toFixed(0)}, 2nd {currency}{(tournamentPot * 0.3).toFixed(0)}</p>
              <p><strong>Season pot:</strong> {currency}{seasonPot} → 1st {currency}{(seasonPot * 0.7).toFixed(0)}, 2nd {currency}{(seasonPot * 0.3).toFixed(0)}</p>
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="gc-nav">
          {[
            { id: "standings",   label: "Season Standings" },
            { id: "tournaments", label: "Tournaments" },
            { id: "prizes",      label: "Prize Money" },
          ].map((tab) => (
            <button key={tab.id} className={`gc-tab ${activeView === tab.id ? "active" : ""}`}
              onClick={() => setActiveView(tab.id)}>{tab.label}</button>
          ))}
        </nav>

        <main className="gc-main">

          {/* ── Season Standings ── */}
          {activeView === "standings" && (
            <div>
              <div className="gc-section-hd">
                <h2>Season Standings</h2>
                <p>Lowest cumulative rank across all majors wins</p>
              </div>
              {seasonStandings.length === 0 ? (
                <div className="gc-empty">
                  <div className="gc-empty-icon">🏌️</div>
                  <p className="gc-empty-text">No results yet — check back after the first major.</p>
                </div>
              ) : (
                <div className="gc-table-wrap">
                  <table className="gc-table">
                    <thead>
                      <tr>
                        <th style={{ width: 46 }}>#</th>
                        <th className="left">Player</th>
                        {TOURNAMENTS.map((t) => <th key={t.id} title={t.name}>{t.emoji}</th>)}
                        <th style={{ width: 62 }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {seasonStandings.map((s, i) => {
                        const isFirst  = i === 0;
                        const isSecond = s.seasonRank === 2;
                        return (
                          <tr key={s.player} className={isFirst ? "gold" : isSecond ? "silver" : ""}>
                            <td className="gc-td-rank">
                              {isFirst ? "🥇" : isSecond ? "🥈" : ordinal(s.seasonRank)}
                            </td>
                            <td className="gc-td-player">{s.player}</td>
                            {TOURNAMENTS.map((t) => (
                              <td key={t.id} className="gc-td-score">
                                {s.ranks[t.id] != null ? (
                                  <span className="gc-badge" style={{
                                    background:
                                      s.ranks[t.id] === 1 ? "#d4af37" :
                                      s.ranks[t.id] === 2 ? "#9ca3af" :
                                      s.ranks[t.id] === 3 ? "#cd7f32" :
                                      "rgba(255,255,255,0.07)",
                                    color: s.ranks[t.id] <= 3 ? "#111" : "#aaa",
                                  }}>{s.ranks[t.id]}</span>
                                ) : <span className="gc-dash">—</span>}
                              </td>
                            ))}
                            <td className="gc-td-total">{s.totalRank}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Tournaments ── */}
          {activeView === "tournaments" && (
            <div>
              <div className="gc-section-hd">
                <h2>Tournament Results</h2>
                <p>GolfChamps combined score — lower is better</p>
              </div>
              <div className="gc-t-grid">
                {TOURNAMENTS.map((t) => {
                  const hasResults = !!results[t.id];
                  const ranked     = tournamentRankings[t.id] || [];
                  const isEditing  = editingT === t.id;

                  return (
                    <div key={t.id} className="gc-t-card" style={{ borderTop: `3px solid ${t.color}` }}>
                      <div className="gc-t-header">
                        <span className="gc-t-emoji">{t.emoji}</span>
                        <h3 className="gc-t-name">{t.name}</h3>
                        {admin && !isEditing && (
                          <button className="gc-edit-btn" onClick={() => startEdit(t.id)}>
                            {hasResults ? "Edit" : "Enter scores"}
                          </button>
                        )}
                      </div>

                      {isEditing ? (
                        <div className="gc-edit-panel">
                          <p className="gc-edit-hint">Enter each player's GolfChamps total score:</p>
                          <div className="gc-score-list">
                            {players.map((p) => (
                              <div key={p} className="gc-score-row">
                                <label className="gc-score-lbl">{p}</label>
                                <input
                                  type="number"
                                  className="gc-score-input"
                                  value={editScores[p] || ""}
                                  placeholder="e.g. −46"
                                  onChange={(e) => setEditScores({ ...editScores, [p]: e.target.value })}
                                />
                              </div>
                            ))}
                          </div>
                          <div className="gc-edit-actions">
                            <button className="gc-save-btn" onClick={saveScores}>Save</button>
                            <button className="gc-cancel-btn" onClick={() => setEditingT(null)}>Cancel</button>
                            {hasResults && <button className="gc-clear-btn" onClick={() => clearTournament(t.id)}>Clear results</button>}
                          </div>
                        </div>
                      ) : hasResults ? (
                        <div className="gc-results">
                          {ranked.map((r) => (
                            <div key={r.player} className={`gc-result-row ${r.rank === 1 ? "r1" : r.rank === 2 ? "r2" : ""}`}>
                              <span className="gc-result-rank">
                                {r.rank === 1 ? "🥇" : r.rank === 2 ? "🥈" : r.rank === 3 ? "🥉" : ordinal(r.rank)}
                              </span>
                              <span className="gc-result-player">{r.player}</span>
                              <span className="gc-result-score">{r.score > 0 ? "+" : ""}{r.score}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="gc-no-results">No results yet</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Prize Money ── */}
          {activeView === "prizes" && (
            <div>
              <div className="gc-section-hd">
                <h2>Prize Money</h2>
                <p>70% to 1st, 30% to 2nd</p>
              </div>

              <div className="gc-prize-section">
                <h3>Tournament Prizes — {currency}{tournamentPot} pot each</h3>
                <div className="gc-prize-grid">
                  {TOURNAMENTS.map((t) => {
                    const ranked = tournamentRankings[t.id];
                    const first  = ranked?.find((r) => r.rank === 1);
                    const second = ranked?.find((r) => r.rank === 2);
                    return (
                      <div key={t.id} className="gc-prize-card" style={{ borderLeft: `3px solid ${t.color}` }}>
                        <div className="gc-prize-card-hd">{t.emoji} {t.name}</div>
                        {ranked ? (
                          <div className="gc-prize-entries">
                            <div className="gc-prize-entry">
                              <span>🥇 {first?.player}</span>
                              <span className="gc-prize-amt">{currency}{(tournamentPot * 0.7).toFixed(0)}</span>
                            </div>
                            <div className="gc-prize-entry">
                              <span>🥈 {second?.player}</span>
                              <span className="gc-prize-amt">{currency}{(tournamentPot * 0.3).toFixed(0)}</span>
                            </div>
                          </div>
                        ) : <p className="gc-pending">Pending</p>}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="gc-prize-section">
                <h3>Season Prize — {currency}{seasonPot} pot</h3>
                {seasonStandings.length > 0 ? (
                  <div className="gc-season-card">
                    {[0, 1].map((i) => {
                      const s = seasonStandings[i];
                      if (!s) return null;
                      const amt = i === 0 ? seasonPot * 0.7 : seasonPot * 0.3;
                      return (
                        <div key={i} className="gc-season-row">
                          <span className="gc-season-player">
                            {i === 0 ? "🥇" : "🥈"} {completedCount === 4 ? s.player : `${i === 0 ? "Leader" : "2nd"}: ${s.player}`}
                          </span>
                          <span className="gc-season-amt">{currency}{amt.toFixed(0)}</span>
                        </div>
                      );
                    })}
                    {completedCount < 4 && (
                      <p className="gc-projected">Projected standings — {4 - completedCount} major{4 - completedCount > 1 ? "s" : ""} remaining</p>
                    )}
                  </div>
                ) : <p className="gc-pending">No results entered yet</p>}
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}
