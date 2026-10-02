import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { Trophy, Swords, Users, History, Plus, Trash2, Edit3, X, Save, Camera, Crown, Flame, Target, BarChart3, UserPlus, UserMinus, ChevronRight, CalendarDays, MapPin, Settings2 } from 'lucide-react';
import './styles.css';

const VENUES = ["Parth's Akhada", "Yatharth's Combat", 'Mishra Arena'];
const MAX_PLAYERS = 6;
const DEFAULT_ELO = 1000;

const envUrl = import.meta.env.VITE_SUPABASE_URL;
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = envUrl && envKey ? createClient(envUrl, envKey) : null;

const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
const nowLocal = () => {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const scoreWins = (games) => games.reduce((a, g) => a + (g.winner_id || g.winner ? 1 : 0), 0);
const safeName = p => p?.name || 'Unknown';

function calcElo(rA, rB, scoreA, k = 32) {
  const expectedA = 1 / (1 + Math.pow(10, (rB - rA) / 400));
  return Math.round(rA + k * (scoreA - expectedA));
}

function App() {
  const [tab, setTab] = useState('dashboard');
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [online, setOnline] = useState(!!supabase);
  const [matchModal, setMatchModal] = useState(false);
  const [playerModal, setPlayerModal] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [editingMatch, setEditingMatch] = useState(null);
  const [toast, setToast] = useState('');

  const storageKey = 'tekken-family-arena-data-v2';

  const loadLocal = () => {
    try {
      const d = JSON.parse(localStorage.getItem(storageKey) || '{}');
      setPlayers(d.players || []); setMatches(d.matches || []);
    } catch { setPlayers([]); setMatches([]); }
  };

  const load = async () => {
    setLoading(true); setError('');
    if (!supabase) { loadLocal(); setOnline(false); setLoading(false); return; }
    try {
      const [{ data: ps, error: pe }, { data: ms, error: me }] = await Promise.all([
        supabase.from('players').select('*').order('created_at'),
        supabase.from('matches').select('*, match_players(*), match_games(*)').order('played_at', { ascending: false })
      ]);
      if (pe) throw pe; if (me) throw me;
      setPlayers(ps || []); setMatches(ms || []); setOnline(true);
    } catch (e) {
      setError(`Database connection issue: ${e.message}. The app will use this browser's local storage until Supabase is configured correctly.`);
      loadLocal(); setOnline(false);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (!supabase) localStorage.setItem(storageKey, JSON.stringify({ players, matches })); }, [players, matches]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(''), 2500); return () => clearTimeout(t); } }, [toast]);

  const playerStats = useMemo(() => buildStats(players, matches), [players, matches]);
  const activePlayers = players.filter(p => p.active !== false);

  async function savePlayer(form) {
    if (!form.name.trim()) return;
    if (!form.id && players.length >= MAX_PLAYERS) { setToast('Maximum of 6 player profiles reached.'); return; }
    const p = { id: form.id || uid(), name: form.name.trim(), avatar_url: form.avatar_url || '', active: form.active !== false, created_at: form.created_at || new Date().toISOString() };
    if (supabase && online) {
      const { data, error } = await supabase.from('players').upsert(p).select().single();
      if (error) { setError(error.message); return; }
      setPlayers(prev => form.id ? prev.map(x => x.id === form.id ? data : x) : [...prev, data]);
    } else setPlayers(prev => form.id ? prev.map(x => x.id === form.id ? p : x) : [...prev, p]);
    setPlayerModal(false); setToast(form.id ? 'Player updated.' : 'Player created.');
  }

  async function removePlayer(id) {
    if (!confirm('Remove this player from active players? Their old matches will stay intact.')) return;
    if (supabase && online) {
      const { error } = await supabase.from('players').update({ active: false }).eq('id', id);
      if (error) { setError(error.message); return; }
    }
    setPlayers(prev => prev.map(p => p.id === id ? { ...p, active: false } : p));
  }

  async function saveMatch(form) {
    const normalized = normalizeMatch(form);
    if (!normalized) return;
    if (supabase && online) {
      try {
        let matchId = form.id || uid();
        const base = { id: matchId, match_type: normalized.match_type, played_at: new Date(normalized.played_at).toISOString(), venue: normalized.venue, team1_score: normalized.team1_score, team2_score: normalized.team2_score, notes: normalized.notes || '' };
        const { error: me } = await supabase.from('matches').upsert(base);
        if (me) throw me;
        await supabase.from('match_players').delete().eq('match_id', matchId);
        const mp = [...normalized.team1, ...normalized.team2].map(x => ({ id: uid(), match_id: matchId, player_id: x.player_id, team: x.team, character: x.character || '' }));
        const { error: mpe } = await supabase.from('match_players').insert(mp); if (mpe) throw mpe;
        await supabase.from('match_games').delete().eq('match_id', matchId);
        const games = normalized.games.map((g, i) => ({ id: uid(), match_id: matchId, game_no: i + 1, player1_id: g.player1_id, player2_id: g.player2_id, player1_score: g.player1_score, player2_score: g.player2_score, winner_id: g.winner_id, player1_character: g.player1_character || '', player2_character: g.player2_character || '' }));
        if (games.length) { const { error: ge } = await supabase.from('match_games').insert(games); if (ge) throw ge; }
        await load();
      } catch (e) { setError(e.message); return; }
    } else {
      const m = { id: form.id || uid(), ...normalized, created_at: form.created_at || new Date().toISOString() };
      setMatches(prev => form.id ? prev.map(x => x.id === form.id ? m : x) : [m, ...prev]);
    }
    setMatchModal(false); setEditingMatch(null); setToast(form.id ? 'Match updated.' : 'Match saved.');
  }

  async function deleteMatch(id) {
    if (!confirm('Delete this match permanently?')) return;
    if (supabase && online) {
      const { error } = await supabase.from('matches').delete().eq('id', id);
      if (error) { setError(error.message); return; }
    }
    setMatches(prev => prev.filter(m => m.id !== id)); setToast('Match deleted.');
  }

  const openEdit = match => { setEditingMatch(match); setMatchModal(true); };

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand" onClick={() => setTab('dashboard')}><div className="brand-mark">⚡</div><div><div className="brand-title">TEKKEN</div><div className="brand-sub">FAMILY ARENA</div></div></div>
      <div className="connection">{online ? <><span className="dot live"/> Online DB</> : <><span className="dot local"/> Local mode</>}</div>
    </header>

    <main>
      {error && <div className="alert"><strong>Setup note:</strong> {error}<button onClick={() => setError('')}><X size={16}/></button></div>}
      {loading ? <div className="loading">Loading arena…</div> : <>
        {tab === 'dashboard' && <Dashboard stats={playerStats} players={players} matches={matches} onRecord={() => { setEditingMatch(null); setMatchModal(true); }} onTab={setTab} />}
        {tab === 'matches' && <Matches matches={matches} players={players} onRecord={() => { setEditingMatch(null); setMatchModal(true); }} onEdit={openEdit} onDelete={deleteMatch} />}
        {tab === 'leaderboard' && <Leaderboard stats={playerStats} />}
        {tab === 'players' && <Players players={players} stats={playerStats} onAdd={() => { setEditingPlayer(null); setPlayerModal(true); }} onEdit={p => { setEditingPlayer(p); setPlayerModal(true); }} onRemove={removePlayer} />}
      </>}
    </main>

    <nav className="bottom-nav">
      <NavButton icon={<BarChart3/>} label="Home" active={tab==='dashboard'} onClick={() => setTab('dashboard')}/>
      <NavButton icon={<History/>} label="Matches" active={tab==='matches'} onClick={() => setTab('matches')}/>
      <button className="record-fab" onClick={() => { setEditingMatch(null); setMatchModal(true); }}><Plus/></button>
      <NavButton icon={<Trophy/>} label="Ranks" active={tab==='leaderboard'} onClick={() => setTab('leaderboard')}/>
      <NavButton icon={<Users/>} label="Players" active={tab==='players'} onClick={() => setTab('players')}/>
    </nav>

    {matchModal && <MatchModal players={players} initial={editingMatch} onClose={() => { setMatchModal(false); setEditingMatch(null); }} onSave={saveMatch} />}
    {playerModal && <PlayerModal initial={editingPlayer} onClose={() => { setPlayerModal(false); setEditingPlayer(null); }} onSave={savePlayer} />}
    {toast && <div className="toast">{toast}</div>}
  </div>;

}

function NavButton({icon,label,active,onClick}) { return <button className={`nav-btn ${active?'active':''}`} onClick={onClick}>{icon}<span>{label}</span></button>; }

function Dashboard({stats, players, matches, onRecord, onTab}) {
  const ranked = [...stats].filter(x => x.active).sort((a,b)=>b.elo-a.elo);
  return <section className="page">
    <div className="hero"><div><div className="eyebrow">THE FAMILY RIVALRY</div><h1>Who owns<br/><span>the arena?</span></h1><p>Track every fight. Settle every debate.</p></div><div className="hero-emblem">拳</div></div>
    <button className="primary big" onClick={onRecord}><Swords size={20}/> Record a match <ChevronRight size={18}/></button>
    <div className="stat-grid"><Stat icon={<Swords/>} label="Matches" value={matches.length}/><Stat icon={<Users/>} label="Players" value={players.filter(p=>p.active!==false).length}/><Stat icon={<Trophy/>} label="Top ELO" value={ranked[0]?.elo ?? DEFAULT_ELO}/><Stat icon={<Flame/>} label="Longest streak" value={Math.max(0,...stats.map(s=>s.bestStreak))}/></div>
    <div className="section-head"><div><span className="eyebrow">CURRENT RANKS</span><h2>Leaderboard</h2></div><button className="text-btn" onClick={()=>onTab('leaderboard')}>View all <ChevronRight size={15}/></button></div>
    <div className="rank-list">{ranked.slice(0,5).map((s,i)=><RankRow key={s.id} rank={i+1} stat={s}/>)}{ranked.length===0 && <Empty text="Create player profiles to start the leaderboard."/>}</div>
    <div className="section-head"><div><span className="eyebrow">LATEST</span><h2>Recent battles</h2></div><button className="text-btn" onClick={()=>onTab('matches')}>History <ChevronRight size={15}/></button></div>
    <div className="recent-list">{matches.slice(0,4).map(m=><MiniMatch key={m.id} match={m} players={players}/>)}{matches.length===0 && <Empty text="Your first battle is waiting."/>}</div>
  </section>;
}

function Stat({icon,label,value}) { return <div className="stat-card"><div className="stat-icon">{icon}</div><div><div className="muted">{label}</div><strong>{value}</strong></div></div>; }
function RankRow({rank,stat}) { return <div className="rank-row"><div className="rank-num">{rank}</div><Avatar player={stat.player}/><div className="grow"><strong>{stat.player.name}</strong><div className="muted">{stat.wins}W – {stat.losses}L · {stat.winRate}%</div></div><div className="elo"><strong>{stat.elo}</strong><span>ELO</span></div></div>; }
function Avatar({player, small=false}) { return player?.avatar_url ? <img className={`avatar ${small?'small':''}`} src={player.avatar_url} alt=""/> : <div className={`avatar placeholder ${small?'small':''}`}>{(player?.name||'?').slice(0,1).toUpperCase()}</div>; }
function Empty({text}) { return <div className="empty">{text}</div>; }

function Matches({matches, players, onRecord, onEdit, onDelete}) { return <section className="page"><div className="section-head top"><div><span className="eyebrow">BATTLE LOG</span><h1>Match History</h1></div><button className="primary" onClick={onRecord}><Plus size={17}/> Record</button></div><div className="match-list">{matches.map(m=><MatchCard key={m.id} match={m} players={players} onEdit={onEdit} onDelete={onDelete}/>)}{matches.length===0&&<Empty text="No matches recorded yet."/>}</div></section>; }

function MatchCard({match, players, onEdit, onDelete}) {
  const p = id => players.find(x=>x.id===id) || {name:'Removed player'};
  const t1 = (match.match_players||match.team1||[]).filter(x=>x.team===1);
  const t2 = (match.match_players||match.team2||[]).filter(x=>x.team===2);
  const games = match.match_games || match.games || [];
  const score1 = match.team1_score ?? scoreWins(games.filter(g=>t1.some(x=>x.player_id===g.winner_id)));
  const score2 = match.team2_score ?? scoreWins(games.filter(g=>t2.some(x=>x.player_id===g.winner_id)));
  return <article className="match-card"><div className="match-meta"><span className="type-pill">{match.match_type}</span><span><CalendarDays size={13}/>{new Date(match.played_at).toLocaleString()}</span><span><MapPin size={13}/>{match.venue}</span><div className="card-actions"><button onClick={()=>onEdit(match)} title="Edit"><Edit3 size={15}/></button><button onClick={()=>onDelete(match.id)} title="Delete"><Trash2 size={15}/></button></div></div><div className="match-teams"><div className="team"><div className="team-avatars">{t1.map(x=><Avatar key={x.player_id} player={p(x.player_id)} small/>)}</div><strong>{t1.map(x=>safeName(p(x.player_id))).join(' + ')}</strong></div><div className="match-score"><b>{score1}</b><span>:</span><b>{score2}</b></div><div className="team right"><div className="team-avatars">{t2.map(x=><Avatar key={x.player_id} player={p(x.player_id)} small/>)}</div><strong>{t2.map(x=>safeName(p(x.player_id))).join(' + ')}</strong></div></div>{games.length>0 && <div className="games-preview">{games.map(g=><span key={g.id||g.game_no}>{safeName(p(g.player1_id))} {g.player1_score}–{g.player2_score} {safeName(p(g.player2_id))}</span>)}</div>}</article>;
}

function MiniMatch({match,players}) { const p=id=>players.find(x=>x.id===id); const a=(match.match_players||[]).filter(x=>x.team===1).map(x=>p(x.player_id)?.name).join(' + '); const b=(match.match_players||[]).filter(x=>x.team===2).map(x=>p(x.player_id)?.name).join(' + '); return <div className="mini"><span className="type-pill">{match.match_type}</span><div className="grow"><strong>{a} <span className="muted">vs</span> {b}</strong><div className="muted">{match.venue}</div></div><b>{match.team1_score} – {match.team2_score}</b></div>; }

function Leaderboard({stats}) { const active=stats.filter(x=>x.active).sort((a,b)=>b.elo-a.elo); return <section className="page"><div className="hero compact"><div><div className="eyebrow">RANKINGS</div><h1>The <span>arena</span> table.</h1><p>Ratings update automatically after every recorded match.</p></div><Trophy className="hero-icon"/></div><div className="leaderboard-table">{active.map((s,i)=><div className="leader-row" key={s.id}><div className="rank-big">#{i+1}</div><Avatar player={s.player}/><div className="grow"><strong>{s.player.name}</strong><div className="muted">{s.wins}W – {s.losses}L · {s.winRate}% · {s.bestStreak} best streak</div></div><div className="rating"><b>{s.elo}</b><span>ELO</span></div></div>)}</div>{active.length===0&&<Empty text="No active players yet."/>}<div className="info-card"><Target/><div><strong>How ELO works</strong><p>Each match changes a player's rating based on the opponent's rating and result. 2v2 team results update each participant against the opposing team's average rating.</p></div></div></section>; }

function Players({players,stats,onAdd,onEdit,onRemove}) { return <section className="page"><div className="section-head top"><div><span className="eyebrow">ROSTER</span><h1>Players</h1><p className="muted">{players.length}/{MAX_PLAYERS} profiles created</p></div>{players.length<MAX_PLAYERS&&<button className="primary" onClick={onAdd}><UserPlus size={17}/> Add</button>}</div><div className="player-grid">{players.map(p=>{const s=stats.find(x=>x.id===p.id); return <div className={`player-card ${p.active===false?'inactive':''}`} key={p.id}><Avatar player={p}/><div className="player-info"><h3>{p.name}</h3><div className="muted">{s?.wins||0}W – {s?.losses||0}L · {s?.winRate||0}%</div><div className="player-elo">{s?.elo||DEFAULT_ELO} ELO</div></div><div className="player-actions"><button onClick={()=>onEdit(p)}><Edit3 size={15}/></button>{p.active!==false&&<button onClick={()=>onRemove(p.id)}><UserMinus size={15}/></button>}</div></div>})}</div>{players.length===0&&<Empty text="Add your family roster to begin."/>}</section>; }

function PlayerModal({initial,onClose,onSave}) { const [form,setForm]=useState(initial||{name:'',avatar_url:'',active:true}); return <Modal title={initial?'Edit player':'New player'} onClose={onClose}><div className="form-grid"><label>Player name<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="e.g. Yatharth"/></label><label>Profile picture URL<input value={form.avatar_url||''} onChange={e=>setForm({...form,avatar_url:e.target.value})} placeholder="https://…"/></label></div><p className="hint"><Camera size={14}/> For now, paste a public image URL. We can add direct photo upload after the database setup.</p><div className="modal-actions"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" onClick={()=>onSave(form)}><Save size={17}/> Save player</button></div></Modal>; }

function MatchModal({players,initial,onClose,onSave}) {
  const makeInitial = () => {
    if (initial) return { ...initial, played_at: initial.played_at?.slice(0,16) || nowLocal(), team1:(initial.match_players||[]).filter(x=>x.team===1), team2:(initial.match_players||[]).filter(x=>x.team===2), games:(initial.match_games||initial.games||[]).map(g=>({...g})) };
    return { id:null, match_type:'1v1', played_at:nowLocal(), venue:VENUES[0], team1:[], team2:[], games:[], team1_score:0, team2_score:0, notes:'' };
  };
  const [form,setForm]=useState(makeInitial);
  useEffect(()=>setForm(makeInitial()),[initial]);
  const active=players.filter(p=>p.active!==false);
  const p=id=>players.find(x=>x.id===id);
  const is2=form.match_type==='2v2';

  function setType(type) { setForm(f=>({...f,match_type:type,team1:[],team2:[],games:[],team1_score:0,team2_score:0})); }
  function setTeam(team,index,id) { setForm(f=>{ const key=team===1?'team1':'team2'; const arr=[...(f[key]||[])]; arr[index]={player_id:id,team,character:''}; return {...f,[key]:arr}; }); }
  function setChar(team,index,val) { setForm(f=>{const key=team===1?'team1':'team2';const arr=[...(f[key]||[])];arr[index]={...(arr[index]||{}),character:val};return {...f,[key]:arr};}); }
  function addGame() {
    const a=form.team1, b=form.team2;
    if (!a[0]?.player_id || !b[0]?.player_id || (is2 && (!a[1]?.player_id || !b[1]?.player_id))) return;
    const pairings = is2 ? [[a[0],b[0]],[a[1],b[1]]] : [[a[0],b[0]]];
    const pair = pairings[form.games.length % pairings.length];
    setForm(f=>({...f,games:[...f.games,{id:uid(),game_no:f.games.length+1,player1_id:pair[0].player_id,player2_id:pair[1].player_id,player1_score:0,player2_score:0,winner_id:null,player1_character:pair[0].character||'',player2_character:pair[1].character||''}]}));
  }
  function updateGame(i,key,val) { setForm(f=>{const games=[...f.games];const g={...games[i],[key]:key.includes('score')?Math.max(0,Number(val)||0):val}; if(g.player1_score>g.player2_score)g.winner_id=g.player1_id; else if(g.player2_score>g.player1_score)g.winner_id=g.player2_id; else g.winner_id=null; games[i]=g; return {...f,games};}); }
  function removeGame(i) { setForm(f=>({...f,games:f.games.filter((_,j)=>j!==i).map((g,j)=>({...g,game_no:j+1}))})); }
  const t1Score=scoreWins(form.games.filter(g=>form.team1.some(x=>x.player_id===g.winner_id))); const t2Score=scoreWins(form.games.filter(g=>form.team2.some(x=>x.player_id===g.winner_id)));
  const ready = form.team1.filter(x=>x.player_id).length === (is2?2:1) && form.team2.filter(x=>x.player_id).length === (is2?2:1) && form.games.length>0 && form.games.every(g=>g.winner_id);
  return <Modal title={initial?'Edit match':'Record match'} wide onClose={onClose}>
    <div className="toggle"><button className={form.match_type==='1v1'?'selected':''} onClick={()=>setType('1v1')}>1v1</button><button className={is2?'selected':''} onClick={()=>setType('2v2')}>2v2</button></div>
    <div className="form-grid two"><label>Date & time<input type="datetime-local" value={form.played_at} onChange={e=>setForm({...form,played_at:e.target.value})}/></label><label>Venue<select value={form.venue} onChange={e=>setForm({...form,venue:e.target.value})}>{VENUES.map(v=><option key={v}>{v}</option>)}</select></label></div>
    <div className="teams-form"><TeamForm title={is2?'Team A':'Player 1'} players={active} count={is2?2:1} values={form.team1} other={form.team2} onPlayer={(i,id)=>setTeam(1,i,id)} onChar={(i,v)=>setChar(1,i,v)}/><div className="vs">VS</div><TeamForm title={is2?'Team B':'Player 2'} players={active} count={is2?2:1} values={form.team2} other={form.team1} onPlayer={(i,id)=>setTeam(2,i,id)} onChar={(i,v)=>setChar(2,i,v)}/></div>
    {is2&&<div className="format-note"><Settings2 size={16}/><div><strong>2v2 rotation:</strong> Game 1 is Team A player 1 vs Team B player 1, Game 2 is player 2 vs player 2, then the same pairings repeat.</div></div>}
    <div className="games-editor"><div className="section-head"><div><span className="eyebrow">INDIVIDUAL GAMES</span><h2>Fight log</h2></div><button className="secondary" onClick={addGame}><Plus size={15}/> Add game</button></div>{form.games.map((g,i)=><GameRow key={g.id||i} game={g} index={i} players={players} onChange={updateGame} onDelete={removeGame}/>)}{!form.games.length&&<div className="game-empty">Select players above, then add each fight in order.</div>}<div className="team-score-bar"><span>Team score</span><strong>{t1Score} – {t2Score}</strong></div></div>
    <label>Notes<textarea value={form.notes||''} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Optional notes…"/></label>
    <div className="modal-actions"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={!ready} onClick={()=>onSave({...form,team1_score:t1Score,team2_score:t2Score})}><Save size={17}/> Save match</button></div>
  </Modal>;
}

function TeamForm({title,players,count,values,other,onPlayer,onChar}) { return <div className="team-form"><h3>{title}</h3>{Array.from({length:count}).map((_,i)=><div className="player-select" key={i}><select value={values[i]?.player_id||''} onChange={e=>onPlayer(i,e.target.value)}><option value="">Select player {i+1}</option>{players.filter(p=>p.id===values[i]?.player_id || !other.some(x=>x.player_id===p.id)).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select><input placeholder="Character" value={values[i]?.character||''} onChange={e=>onChar(i,e.target.value)}/></div>)}</div>; }
function GameRow({game,index,players,onChange,onDelete}) { const p=id=>players.find(x=>x.id===id); return <div className="game-row"><div className="game-num">#{index+1}</div><div className="fight-names"><strong>{p(game.player1_id)?.name||'Player'}</strong><span>vs</span><strong>{p(game.player2_id)?.name||'Player'}</strong></div><div className="score-input"><input type="number" min="0" value={game.player1_score} onChange={e=>onChange(index,'player1_score',e.target.value)}/><span>–</span><input type="number" min="0" value={game.player2_score} onChange={e=>onChange(index,'player2_score',e.target.value)}/></div><div className="winner">{game.winner_id?<Crown size={14}/>:<span>Draw</span>}</div><button className="icon-btn" onClick={()=>onDelete(index)}><Trash2 size={15}/></button></div>; }

function Modal({title,onClose,children,wide=false}) { return <div className="modal-backdrop"><div className={`modal ${wide?'wide':''}`}><div className="modal-head"><h2>{title}</h2><button onClick={onClose}><X/></button></div>{children}</div></div>; }

function normalizeMatch(f) {
  if (!f.team1?.length || !f.team2?.length || !f.games?.length) return null;
  return { match_type:f.match_type, played_at:f.played_at, venue:f.venue, team1_score:f.team1_score, team2_score:f.team2_score, notes:f.notes, team1:f.team1.map(x=>({...x,team:1})), team2:f.team2.map(x=>({...x,team:2})), games:f.games };
}

function buildStats(players,matches) {
  const out=players.map(player=>({id:player.id,player,active:player.active!==false,wins:0,losses:0,winRate:0,elo:DEFAULT_ELO,bestStreak:0,currentStreak:0,games:0}));
  const byId=Object.fromEntries(out.map(x=>[x.id,x]));
  const sorted=[...matches].sort((a,b)=>new Date(a.played_at)-new Date(b.played_at));
  for(const m of sorted){
    const t1=(m.match_players||m.team1||[]).filter(x=>x.team===1); const t2=(m.match_players||m.team2||[]).filter(x=>x.team===2);
    const s1=Number(m.team1_score||0),s2=Number(m.team2_score||0); if(s1===s2) continue;
    const winners=s1>s2?t1:t2, losers=s1>s2?t2:t1;
    const avg=(arr)=>arr.reduce((z,x)=>z+(byId[x.player_id]?.elo||DEFAULT_ELO),0)/Math.max(arr.length,1);
    const er1=avg(t1),er2=avg(t2);
    for(const x of winners){const s=byId[x.player_id]; if(!s)continue;s.wins++;s.currentStreak=Math.max(1,s.currentStreak+1);s.bestStreak=Math.max(s.bestStreak,s.currentStreak);s.elo=calcElo(s.elo,s1>s2?er2:er1,1);}
    for(const x of losers){const s=byId[x.player_id]; if(!s)continue;s.losses++;s.currentStreak=0;s.elo=calcElo(s.elo,s2>s1?er1:er2,0);}
    const games=m.match_games||m.games||[];
    for(const g of games){const a=byId[g.player1_id],b=byId[g.player2_id];if(a)a.games++;if(b)b.games++;}
  }
  out.forEach(s=>s.winRate=s.wins+s.losses?Math.round(s.wins/(s.wins+s.losses)*100):0);
  return out;
}

createRoot(document.getElementById('root')).render(<App/>);
