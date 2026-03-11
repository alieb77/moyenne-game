'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const ADMIN_PASSWORD = 'moyenne2024'

export default function Admin() {
  const [auth, setAuth] = useState(false)
  const [pwd, setPwd] = useState('')
  const [players, setPlayers] = useState([])
  const [submissions, setSubmissions] = useState([])
  const [round, setRound] = useState(null)
  const [game, setGame] = useState(null)
  const [message, setMessage] = useState('')

  const load = async () => {
    const { data: games } = await supabase
      .from('games').select('*').in('status', ['waiting', 'active']).limit(1)
    const currentGame = games?.[0]
    if (!currentGame) return
    setGame(currentGame)

    const { data: roundData } = await supabase
      .from('rounds').select('*').eq('game_id', currentGame.id)
      .eq('status', 'open').limit(1)
    const currentRound = roundData?.[0]
    setRound(currentRound)

    const { data: playersData } = await supabase
      .from('players').select('*').eq('game_id', currentGame.id)
      .order('created_at', { ascending: true })
    setPlayers(playersData ?? [])

    if (currentRound) {
      const { data: subs } = await supabase
        .from('submissions').select('*, players(username)')
        .eq('round_id', currentRound.id)
        .order('number', { ascending: true })
      setSubmissions(subs ?? [])
    }
  }

  useEffect(() => {
    if (auth) {
      load()
      const interval = setInterval(load, 10000)
      return () => clearInterval(interval)
    }
  }, [auth])

  const closeRound = async () => {
    if (!round) return
    const { error } = await supabase.rpc('close_round', { round_id: round.id })
    if (error) setMessage('Erreur : ' + error.message)
    else { setMessage('Round clôturé !'); load() }
  }

  const newRound = async () => {
    if (!game) return
    const { data: lastRound } = await supabase
      .from('rounds').select('*').eq('game_id', game.id)
      .order('round_number', { ascending: false }).limit(1)
    const nextNumber = (lastRound?.[0]?.round_number ?? 0) + 1
    await supabase.from('rounds').insert({
      game_id: game.id, round_number: nextNumber, status: 'open'
    })
    setMessage('Round ' + nextNumber + ' lancé !')
    load()
  }

  const resetGame = async () => {
    if (!confirm('Effacer toute la partie ?')) return
    await supabase.from('submissions').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('rounds').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('players').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('games').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('games').insert({ status: 'waiting' })
    setMessage('Partie réinitialisée !')
    load()
  }

  if (!auth) return (
    <div style={{minHeight:'100vh',background:'#000',color:'white',fontFamily:'monospace',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{maxWidth:300,width:'100%',padding:24}}>
        <h1 style={{fontSize:24,color:'#e8ff00',marginBottom:24}}>ADMIN</h1>
        <input type="password" placeholder="Mot de passe" value={pwd}
          onChange={e => setPwd(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && (pwd === ADMIN_PASSWORD ? setAuth(true) : setMessage('Mauvais mot de passe'))}
          style={{width:'100%',padding:12,background:'#111',border:'1px solid #333',color:'white',fontSize:16,marginBottom:12,boxSizing:'border-box',fontFamily:'monospace'}}
        />
        <button onClick={() => pwd === ADMIN_PASSWORD ? setAuth(true) : setMessage('Mauvais mot de passe')}
          style={{width:'100%',padding:12,background:'#e8ff00',color:'#000',border:'none',cursor:'pointer',fontFamily:'monospace',letterSpacing:2}}>
          ENTRER
        </button>
        {message && <p style={{color:'#ff3131',marginTop:12,fontSize:12}}>{message}</p>}
      </div>
    </div>
  )

  const moyenne = submissions.length > 0
    ? (submissions.reduce((a, b) => a + b.number, 0) / submissions.length).toFixed(2)
    : null

  return (
    <div style={{minHeight:'100vh',background:'#000',color:'white',fontFamily:'monospace',padding:32}}>
      <div style={{maxWidth:700,margin:'0 auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:32}}>
          <h1 style={{fontSize:32,color:'#e8ff00',margin:0}}>ADMIN</h1>
          <button onClick={load} style={{background:'none',border:'1px solid #333',color:'#555',cursor:'pointer',fontFamily:'monospace',padding:'8px 16px',fontSize:11}}>↻ REFRESH</button>
        </div>

        {message && (
          <div style={{background:'#001a00',border:'1px solid #00ff88',padding:12,marginBottom:24}}>
            <p style={{color:'#00ff88',margin:0,fontSize:12}}>{message}</p>
          </div>
        )}

        {/* Infos round */}
        <div style={{background:'#111',border:'1px solid #222',padding:24,marginBottom:24}}>
          <p style={{color:'#555',fontSize:11,letterSpacing:3,marginBottom:16}}>ROUND EN COURS</p>
          {round ? (
            <>
              <p style={{color:'white',margin:'0 0 8px'}}>Round <strong style={{color:'#e8ff00'}}>#{round.round_number}</strong> — statut : <strong style={{color:'#00ff88'}}>{round.status}</strong></p>
              <p style={{color:'#555',fontSize:12,margin:'0 0 16px'}}>{submissions.length} soumission(s) — Moyenne actuelle : <strong style={{color:'#e8ff00'}}>{moyenne ?? '—'}</strong></p>
              <button onClick={closeRound}
                style={{padding:'10px 24px',background:'#ff3131',color:'#000',border:'none',cursor:'pointer',fontFamily:'monospace',letterSpacing:2,fontSize:12,marginRight:12}}>
                CLÔTURER LE ROUND
              </button>
            </>
          ) : (
            <>
              <p style={{color:'#555',margin:'0 0 16px'}}>Aucun round ouvert</p>
              <button onClick={newRound}
                style={{padding:'10px 24px',background:'#e8ff00',color:'#000',border:'none',cursor:'pointer',fontFamily:'monospace',letterSpacing:2,fontSize:12,marginRight:12}}>
                LANCER UN NOUVEAU ROUND
              </button>
            </>
          )}
          <button onClick={resetGame}
            style={{padding:'10px 24px',background:'transparent',color:'#333',border:'1px solid #222',cursor:'pointer',fontFamily:'monospace',fontSize:12,marginTop:12}}>
            RESET PARTIE
          </button>
        </div>

        {/* Soumissions */}
        {submissions.length > 0 && (
          <div style={{background:'#111',border:'1px solid #222',padding:24,marginBottom:24}}>
            <p style={{color:'#555',fontSize:11,letterSpacing:3,marginBottom:16}}>SOUMISSIONS ({submissions.length})</p>
            {submissions.map((s, i) => (
              <div key={s.id} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid #1a1a1a'}}>
                <span style={{color:'#555',fontSize:11}}>#{i+1}</span>
                <span style={{color:'white',fontSize:13}}>{s.players?.username}</span>
                <span style={{color:'#e8ff00',fontSize:16,fontWeight:'bold'}}>{s.number}</span>
              </div>
            ))}
            <div style={{marginTop:16,paddingTop:16,borderTop:'1px solid #333',display:'flex',justifyContent:'space-between'}}>
              <span style={{color:'#555',fontSize:12}}>MOYENNE ACTUELLE</span>
              <span style={{color:'#e8ff00',fontSize:20,fontWeight:'bold'}}>{moyenne}</span>
            </div>
          </div>
        )}

        {/* Joueurs */}
        <div style={{background:'#111',border:'1px solid #222',padding:24}}>
          <p style={{color:'#555',fontSize:11,letterSpacing:3,marginBottom:16}}>JOUEURS ({players.length})</p>
          {players.map((p) => (
            <div key={p.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid #1a1a1a'}}>
              <span style={{color: p.eliminated ? '#ff3131' : '#00ff88',fontSize:13}}>
                {p.eliminated ? '❌' : '✓'} {p.username}
              </span>
              <span style={{color:'#333',fontSize:11}}>{p.eliminated ? 'éliminé' : 'en jeu'}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
