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
  const [justClosed, setJustClosed] = useState(false)

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
      .order('pv', { ascending: false })
    setPlayers(playersData ?? [])

    if (currentRound) {
      const { data: subs } = await supabase
        .from('submissions').select('*, players(username, pv)')
        .eq('round_id', currentRound.id)
        .order('number', { ascending: true })
      setSubmissions(subs ?? [])
    } else {
      setSubmissions([])
    }
  }

  useEffect(() => {
    if (auth) {
      load()
      const interval = setInterval(load, 5000)
      return () => clearInterval(interval)
    }
  }, [auth])

  const startRound = async () => {
    if (!game) {
      const { data } = await supabase
        .from('games').insert({ status: 'waiting' }).select().single()
      setGame(data)
    }
    const currentGame = game || (await supabase.from('games').select('*').in('status', ['waiting', 'active']).limit(1)).data?.[0]
    if (!currentGame) return

    const { data: lastRound } = await supabase
      .from('rounds').select('*').eq('game_id', currentGame.id)
      .order('round_number', { ascending: false }).limit(1)
    const nextNumber = (lastRound?.[0]?.round_number ?? 0) + 1

    await supabase.from('rounds').insert({
      game_id: currentGame.id, round_number: nextNumber, status: 'open'
    })
    setMessage('Round ' + nextNumber + ' lancé !'); setJustClosed(false)
    load()
  }

  const closeRound = async () => {
    if (!round) return
    const { error } = await supabase.rpc('close_round', { p_round_id: round.id })
    if (error) setMessage('Erreur : ' + error.message)
    else { setMessage('Round clôturé !'); setJustClosed(true); load() }
  }

  const resetGame = async () => {
    if (!confirm('Effacer toute la partie ?')) return
    await supabase.from('submissions').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('rounds').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('players').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('games').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    const { data } = await supabase.from('games').insert({ status: 'waiting' }).select().single()
    setGame(data)
    setRound(null)
    setPlayers([])
    setSubmissions([])
    setMessage('Partie réinitialisée !')
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
  const cible = moyenne ? (moyenne * 2 / 3).toFixed(2) : null
  const activePlayers = players.filter(p => !p.eliminated)
  const eliminatedPlayers = players.filter(p => p.eliminated)

  return (
    <div style={{minHeight:'100vh',background:'#000',color:'white',fontFamily:'monospace',padding:32}}>
      <div style={{maxWidth:700,margin:'0 auto'}}>

        {/* Header */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:32}}>
          <h1 style={{fontSize:32,color:'#e8ff00',margin:0}}>ADMIN</h1>
          <button onClick={load} style={{background:'none',border:'1px solid #333',color:'#555',cursor:'pointer',fontFamily:'monospace',padding:'8px 16px',fontSize:11}}>↻ REFRESH</button>
        </div>

        {message && (
          <div style={{background:'#001a00',border:'1px solid #00ff88',padding:12,marginBottom:24}}>
            <p style={{color:'#00ff88',margin:0,fontSize:12}}>{message}</p>
          </div>
        )}

        {/* Contrôle rounds */}
        <div style={{background:'#111',border:'1px solid #222',padding:24,marginBottom:24}}>
          <p style={{color:'#555',fontSize:11,letterSpacing:3,marginBottom:16}}>CONTRÔLE DES ROUNDS</p>

          {round && !justClosed ? (
            <>
              <p style={{color:'white',margin:'0 0 8px'}}>
                Round <strong style={{color:'#e8ff00'}}>#{round.round_number}</strong> — 
                statut : <strong style={{color:'#00ff88'}}>OUVERT</strong>
              </p>
              <p style={{color:'#555',fontSize:12,margin:'0 0 16px'}}>
                {submissions.length} / {activePlayers.length} joueurs ont soumis — 
                Moyenne : <strong style={{color:'white'}}>{moyenne ?? '—'}</strong> → 
                Cible : <strong style={{color:'#e8ff00'}}>{cible ?? '—'}</strong>
              </p>
              <button onClick={closeRound}
                style={{padding:'12px 32px',background:'#ff3131',color:'#000',border:'none',cursor:'pointer',fontFamily:'monospace',letterSpacing:2,fontSize:13}}>
                CLÔTURER LE ROUND
              </button>
            </>
          ) : (
            <>
              <p style={{color:'#555',margin:'0 0 16px'}}>Aucun round ouvert</p>
              <button onClick={startRound}
                style={{padding:'12px 32px',background:'#e8ff00',color:'#000',border:'none',cursor:'pointer',fontFamily:'monospace',letterSpacing:2,fontSize:13}}>
                LANCER UN NOUVEAU ROUND
              </button>
            </>
          )}

          <button onClick={resetGame}
            style={{marginLeft:16,padding:'12px 24px',background:'transparent',color:'#333',border:'1px solid #222',cursor:'pointer',fontFamily:'monospace',fontSize:11}}>
            RESET PARTIE
          </button>
        </div>

        {/* Soumissions en cours */}
        {submissions.length > 0 && (
          <div style={{background:'#111',border:'1px solid #222',padding:24,marginBottom:24}}>
            <p style={{color:'#555',fontSize:11,letterSpacing:3,marginBottom:16}}>
              SOUMISSIONS ({submissions.length}/{activePlayers.length})
            </p>
            {submissions.map((s, i) => (
              <div key={s.id} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid #1a1a1a'}}>
                <span style={{color:'#555',fontSize:11}}>#{i+1}</span>
                <span style={{color:'white',fontSize:13}}>{s.players?.username}</span>
                <span style={{color:'#e8ff00',fontSize:16,fontWeight:'bold'}}>{s.number}</span>
                <span style={{color:'#555',fontSize:11}}>{s.players?.pv} PV</span>
              </div>
            ))}
            <div style={{marginTop:16,paddingTop:16,borderTop:'1px solid #333',display:'flex',justifyContent:'space-between'}}>
              <span style={{color:'#555',fontSize:12}}>CIBLE ACTUELLE (2/3 moyenne)</span>
              <span style={{color:'#e8ff00',fontSize:20,fontWeight:'bold'}}>{cible ?? '—'}</span>
            </div>
          </div>
        )}

        {/* Joueurs actifs */}
        <div style={{background:'#111',border:'1px solid #222',padding:24,marginBottom:16}}>
          <p style={{color:'#555',fontSize:11,letterSpacing:3,marginBottom:16}}>
            JOUEURS EN JEU ({activePlayers.length})
          </p>
          {activePlayers.map((p) => (
            <div key={p.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid #1a1a1a'}}>
              <span style={{color:'#00ff88',fontSize:13}}>✓ {p.username}</span>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <div style={{width:100,height:6,background:'#222',borderRadius:3}}>
                  <div style={{width: p.pv + '%', height:'100%', background: p.pv > 50 ? '#00ff88' : p.pv > 20 ? '#e8ff00' : '#ff3131', borderRadius:3}}/>
                </div>
                <span style={{color:'#e8ff00',fontSize:13,minWidth:40,textAlign:'right'}}>{p.pv} PV</span>
              </div>
            </div>
          ))}
        </div>

        {/* Joueurs éliminés */}
        {eliminatedPlayers.length > 0 && (
          <div style={{background:'#111',border:'1px solid #222',padding:24}}>
            <p style={{color:'#555',fontSize:11,letterSpacing:3,marginBottom:16}}>
              ÉLIMINÉS ({eliminatedPlayers.length})
            </p>
            {eliminatedPlayers.map((p) => (
              <div key={p.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid #1a1a1a',opacity:0.4}}>
                <span style={{color:'#ff3131',fontSize:13}}>❌ {p.username}</span>
                <span style={{color:'#333',fontSize:11}}>0 PV</span>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  )
}