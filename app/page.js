'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function Home() {
  const [screen, setScreen] = useState('loading')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [user, setUser] = useState(null)
  const [game, setGame] = useState(null)
  const [round, setRound] = useState(null)
  const [player, setPlayer] = useState(null)
  const [number, setNumber] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [message, setMessage] = useState('')
  const [results, setResults] = useState(null)
  const [waitingCount, setWaitingCount] = useState(0)
  const [timeLeft, setTimeLeft] = useState('')
  const [timeToOpen, setTimeToOpen] = useState('')

  // Calcule si le round est ouvert (midi-minuit heure Casablanca)
  const getRoundStatus = () => {
    const now = new Date()
    const casaOffset = isDST(now) ? 1 : 0
    const casaHour = (now.getUTCHours() + casaOffset) % 24
    return casaHour >= 12 ? 'open' : 'closed'
  }

  const isDST = (date) => {
    const march = new Date(date.getFullYear(), 2, 31)
    const october = new Date(date.getFullYear(), 9, 27)
    return date >= march && date < october
  }

  const getTimeLeft = () => {
    const now = new Date()
    const casaOffset = isDST(now) ? 1 : 0
    const casaHour = (now.getUTCHours() + casaOffset) % 24
    const casaMin = now.getUTCMinutes()
    const casaSec = now.getUTCSeconds()

    if (casaHour >= 12) {
      // Temps avant minuit
      const secondsLeft = (23 - casaHour) * 3600 + (59 - casaMin) * 60 + (60 - casaSec)
      return formatTime(secondsLeft)
    } else {
      // Temps avant midi
      const secondsLeft = (11 - casaHour) * 3600 + (59 - casaMin) * 60 + (60 - casaSec)
      return formatTime(secondsLeft)
    }
  }

  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = seconds % 60
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
  }

  useEffect(() => {
    const timer = setInterval(() => {
      const t = getTimeLeft()
      if (getRoundStatus() === 'open') {
        setTimeLeft(t)
      } else {
        setTimeToOpen(t)
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (!session?.user) setScreen('home')
    })
    supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (!session?.user) setScreen('home')
    })
  }, [])

  useEffect(() => {
    if (user) checkProfile()
  }, [user])

  useEffect(() => {
    if (!round) return
    const channel = supabase
      .channel('round-changes-' + round.id)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'rounds',
        filter: `id=eq.${round.id}`
      }, (payload) => {
        if (payload.new.status === 'done') loadResults(payload.new)
      })
      .subscribe()
    const subChannel = supabase
      .channel('sub-changes-' + round.id)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'submissions',
        filter: `round_id=eq.${round.id}`
      }, () => setWaitingCount(c => c + 1))
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
      supabase.removeChannel(subChannel)
    }
  }, [round])

  const checkProfile = async () => {
    const { data: profile } = await supabase
      .from('profiles').select('*').eq('id', user.id).single()
    if (!profile) {
      setScreen('username')
    } else {
      await joinGame(profile.username)
    }
  }

  const saveUsername = async () => {
    if (!username.trim() || username.length < 2) {
      setMessage('Pseudo trop court !')
      return
    }
    const { error } = await supabase
      .from('profiles').insert({ id: user.id, username: username.trim() })
    if (error) { setMessage('Ce pseudo est déjà pris !'); return }
    await joinGame(username.trim())
  }

  const joinGame = async (uname) => {
    const roundStatus = getRoundStatus()

    let { data: games } = await supabase
      .from('games').select('*').in('status', ['waiting', 'active']).limit(1)
    let currentGame = games?.[0]
    if (!currentGame) {
      const { data } = await supabase
        .from('games').insert({ status: 'waiting' }).select().single()
      currentGame = data
    }
    setGame(currentGame)

    let { data: existingPlayer } = await supabase
      .from('players').select('*')
      .eq('game_id', currentGame.id).eq('user_id', user.id).single()
    if (!existingPlayer) {
      const { data } = await supabase
        .from('players').insert({ game_id: currentGame.id, user_id: user.id, username: uname })
        .select().single()
      existingPlayer = data
    }
    setPlayer(existingPlayer)

    // Cherche le dernier round terminé pour les résultats
    const { data: lastDoneRound } = await supabase
      .from('rounds').select('*').eq('game_id', currentGame.id)
      .eq('status', 'done').order('round_number', { ascending: false }).limit(1)

    // Si entre minuit et midi : affiche résultats du dernier round
    if (roundStatus === 'closed') {
      if (lastDoneRound?.[0]) {
        await loadResults(lastDoneRound[0], existingPlayer)
        return
      }
      setScreen('waiting-open')
      return
    }

    // Round ouvert (midi-minuit)
    const { data: rounds } = await supabase
      .from('rounds').select('*').eq('game_id', currentGame.id).eq('status', 'open').limit(1)
    const currentRound = rounds?.[0]

    if (!currentRound) {
      setScreen('waiting-open')
      return
    }
    setRound(currentRound)

    if (existingPlayer.eliminated) {
      if (lastDoneRound?.[0]) {
        await loadResults(lastDoneRound[0], existingPlayer)
      } else {
        setScreen('eliminated')
      }
      return
    }

    const { data: existing } = await supabase
      .from('submissions').select('*')
      .eq('round_id', currentRound.id).eq('player_id', existingPlayer.id).single()

    if (existing) {
      setSubmitted(true)
      const { count } = await supabase
        .from('submissions').select('*', { count: 'exact', head: true })
        .eq('round_id', currentRound.id)
      setWaitingCount(count ?? 0)
      setScreen('waiting-results')
      return
    }

    const { count } = await supabase
      .from('submissions').select('*', { count: 'exact', head: true })
      .eq('round_id', currentRound.id)
    setWaitingCount(count ?? 0)
    setScreen('game')
  }

  const loadResults = async (currentRound, currentPlayer) => {
    const p = currentPlayer || player
    const { data } = await supabase
      .from('submissions').select('*, players(eliminated, username)')
      .eq('round_id', currentRound.id)
      .order('distance_from_average', { ascending: true })

    let updatedPlayer = p
    if (p?.id) {
      const { data: pd } = await supabase
        .from('players').select('*').eq('id', p.id).single()
      if (pd) updatedPlayer = pd
    }
    setPlayer(updatedPlayer)
    setResults({ average: currentRound.average, submissions: data, roundNumber: currentRound.round_number })
    setScreen('results')
  }

  const submitNumber = async () => {
    const num = parseFloat(number)
    if (isNaN(num) || num < 0 || num > 100) {
      setMessage('Entre un nombre entre 0 et 100 !')
      return
    }
    await supabase.from('submissions').insert({
      round_id: round.id, player_id: player.id, number: num
    })
    setSubmitted(true)
    setMessage('')
    setScreen('waiting-results')
  }

  const logout = async () => {
    await supabase.auth.signOut()
    setUser(null); setGame(null); setRound(null); setPlayer(null)
    setResults(null); setSubmitted(false); setScreen('home')
  }

  // ═══════════════════════════════
  // ÉCRANS
  // ═══════════════════════════════

  if (screen === 'loading') return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#000'}}>
      <p style={{color:'#555',fontFamily:'monospace'}}>Chargement...</p>
    </div>
  )

  if (screen === 'home') return (
    <div style={{minHeight:'100vh',background:'#000',color:'white',fontFamily:'monospace'}}>
      <div style={{maxWidth:600,margin:'0 auto',padding:'80px 24px'}}>
        <h1 style={{fontSize:64,color:'#e8ff00',marginBottom:8,letterSpacing:-2}}>MOYENNE</h1>
        <p style={{color:'#555',fontSize:13,letterSpacing:4,marginBottom:64}}>LE JEU DE LA SURVIE</p>
        <div style={{marginBottom:64}}>
          <h2 style={{color:'#e8ff00',fontSize:14,letterSpacing:3,marginBottom:24}}>COMMENT JOUER</h2>
          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            {[
              ['01','Chaque jour entre midi et minuit, soumets un nombre entre 0 et 100.'],
              ['02','La moyenne de tous les nombres est calculée à minuit.'],
              ['03','La moitié des joueurs les plus éloignés de la moyenne est éliminée.'],
              ['04','En cas d\'égalité, tous les joueurs à égale distance sont éliminés.'],
              ['05','Si tu ne soumets pas de nombre avant minuit, tu es éliminé automatiquement.'],
              ['06','Le dernier survivant remporte la partie.'],
            ].map(([num, text]) => (
              <div key={num} style={{display:'flex',gap:24,alignItems:'flex-start'}}>
                <span style={{color:'#e8ff00',fontSize:11,minWidth:24,marginTop:2}}>{num}</span>
                <p style={{color:'#888',fontSize:13,lineHeight:1.6,margin:0}}>{text}</p>
              </div>
            ))}
          </div>
        </div>
        <button onClick={() => setScreen('login')}
          style={{width:'100%',padding:18,background:'#e8ff00',color:'#000',border:'none',cursor:'pointer',fontSize:14,fontFamily:'monospace',letterSpacing:3}}>
          JOUER →
        </button>
      </div>
    </div>
  )

  if (screen === 'login') return (
    <div style={{minHeight:'100vh',background:'#000',color:'white',fontFamily:'monospace',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{maxWidth:400,width:'100%',padding:24}}>
        <button onClick={() => setScreen('home')} style={{background:'none',border:'none',color:'#555',cursor:'pointer',fontFamily:'monospace',fontSize:11,letterSpacing:2,marginBottom:32}}>← RETOUR</button>
        <h1 style={{fontSize:36,color:'#e8ff00',marginBottom:4}}>CONNEXION</h1>
        <p style={{color:'#555',marginBottom:32,fontSize:12}}>Un lien magique sera envoyé à ton email</p>
        <input type="email" placeholder="ton@email.com" value={email}
          onChange={e => setEmail(e.target.value)}
          style={{width:'100%',padding:12,background:'#111',border:'1px solid #333',color:'white',fontSize:16,marginBottom:12,boxSizing:'border-box',fontFamily:'monospace'}}
        />
        <button onClick={() => supabase.auth.signInWithOtp({ email }).then(() => setMessage('Vérifie ton email !'))}
          style={{width:'100%',padding:14,background:'#e8ff00',color:'#000',border:'none',cursor:'pointer',fontSize:14,fontFamily:'monospace',letterSpacing:2}}>
          ENVOYER LE LIEN →
        </button>
        {message && <p style={{color:'#00ff88',marginTop:12,fontSize:12}}>{message}</p>}
      </div>
    </div>
  )

  if (screen === 'username') return (
    <div style={{minHeight:'100vh',background:'#000',color:'white',fontFamily:'monospace',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{maxWidth:400,width:'100%',padding:24}}>
        <h1 style={{fontSize:36,color:'#e8ff00',marginBottom:4}}>TON PSEUDO</h1>
        <p style={{color:'#555',marginBottom:32,fontSize:12}}>Il sera visible de tous les joueurs</p>
        <input type="text" placeholder="Ex: Destroyeur42" value={username}
          onChange={e => setUsername(e.target.value)} maxLength={20}
          style={{width:'100%',padding:12,background:'#111',border:'1px solid #333',color:'white',fontSize:20,marginBottom:12,boxSizing:'border-box',fontFamily:'monospace'}}
        />
        <button onClick={saveUsername}
          style={{width:'100%',padding:14,background:'#e8ff00',color:'#000',border:'none',cursor:'pointer',fontSize:14,fontFamily:'monospace',letterSpacing:2}}>
          ENTRER DANS L'ARÈNE →
        </button>
        {message && <p style={{color:'#ff3131',marginTop:12,fontSize:12}}>{message}</p>}
      </div>
    </div>
  )

  // Écran avant midi (round pas encore ouvert)
  if (screen === 'waiting-open') return (
    <div style={{minHeight:'100vh',background:'#000',color:'white',fontFamily:'monospace',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{textAlign:'center',padding:24}}>
        <h1 style={{fontSize:48,color:'#e8ff00',marginBottom:8}}>MOYENNE</h1>
        <p style={{color:'#555',fontSize:11,letterSpacing:3,marginBottom:48}}>LE JEU DE LA SURVIE</p>
        <p style={{color:'#555',fontSize:12,letterSpacing:2,marginBottom:16}}>LE ROUND OUVRE DANS</p>
        <p style={{fontSize:64,color:'#e8ff00',fontFamily:'monospace',marginBottom:48,letterSpacing:4}}>{timeToOpen}</p>
        <p style={{color:'#333',fontSize:11}}>Reviens à midi pour soumettre ton nombre</p>
        <button onClick={logout} style={{marginTop:48,background:'none',border:'none',color:'#333',cursor:'pointer',fontFamily:'monospace',fontSize:11}}>déconnexion</button>
      </div>
    </div>
  )

  // Écran après soumission (attente minuit)
  if (screen === 'waiting-results') return (
    <div style={{minHeight:'100vh',background:'#000',color:'white',fontFamily:'monospace',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{textAlign:'center',padding:24}}>
        <h1 style={{fontSize:48,color:'#e8ff00',marginBottom:8}}>MOYENNE</h1>
        <p style={{color:'#555',fontSize:11,letterSpacing:3,marginBottom:48}}>ROUND {round?.round_number}</p>
        <p style={{color:'#00ff88',fontSize:14,letterSpacing:2,marginBottom:32}}>✓ NOMBRE SOUMIS</p>
        <p style={{color:'#555',fontSize:12,letterSpacing:2,marginBottom:16}}>RÉSULTATS DANS</p>
        <p style={{fontSize:64,color:'#e8ff00',fontFamily:'monospace',marginBottom:48,letterSpacing:4}}>{timeLeft}</p>
        <p style={{color:'#333',fontSize:11}}>{waitingCount} joueur(s) ont soumis leur nombre</p>
        <button onClick={logout} style={{marginTop:48,background:'none',border:'none',color:'#333',cursor:'pointer',fontFamily:'monospace',fontSize:11}}>déconnexion</button>
      </div>
    </div>
  )

  if (screen === 'game') return (
    <div style={{minHeight:'100vh',background:'#000',color:'white',fontFamily:'monospace'}}>
      <div style={{maxWidth:500,margin:'0 auto',padding:'60px 24px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:32}}>
          <div>
            <h1 style={{fontSize:36,color:'#e8ff00',marginBottom:4}}>MOYENNE</h1>
            <p style={{color:'#555',fontSize:11,letterSpacing:3}}>ROUND {round?.round_number}</p>
          </div>
          <div style={{textAlign:'right'}}>
            <p style={{color:'#555',fontSize:11}}>{player?.username}</p>
            <button onClick={logout} style={{background:'none',border:'none',color:'#333',cursor:'pointer',fontFamily:'monospace',fontSize:10}}>déconnexion</button>
          </div>
        </div>

        <div style={{background:'#111',border:'1px solid #222',padding:16,marginBottom:24,textAlign:'center'}}>
          <p style={{color:'#555',fontSize:11,letterSpacing:2,marginBottom:4}}>FERMETURE DU ROUND DANS</p>
          <p style={{fontSize:32,color:'#e8ff00',margin:0,letterSpacing:4}}>{timeLeft}</p>
        </div>

        <div style={{background:'#111',border:'1px solid #222',padding:24}}>
          <p style={{color:'#555',fontSize:11,letterSpacing:3,marginBottom:16}}>TON NOMBRE (0-100)</p>
          <input type="number" min="0" max="100" value={number}
            onChange={e => setNumber(e.target.value)} placeholder="0-100"
            style={{width:'100%',padding:16,background:'#000',border:'1px solid #333',color:'white',fontSize:48,fontFamily:'monospace',marginBottom:16,boxSizing:'border-box',textAlign:'center'}}
          />
          <button onClick={submitNumber}
            style={{width:'100%',padding:16,background:'#e8ff00',color:'#000',border:'none',cursor:'pointer',fontSize:14,fontFamily:'monospace',letterSpacing:3}}>
            SOUMETTRE →
          </button>
          {message && <p style={{color:'#ff3131',marginTop:12,fontSize:12}}>{message}</p>}
        </div>
      </div>
    </div>
  )

  if (screen === 'results') return (
    <div style={{minHeight:'100vh',background:'#000',color:'white',fontFamily:'monospace'}}>
      <div style={{maxWidth:500,margin:'0 auto',padding:'60px 24px'}}>
        <h1 style={{fontSize:36,color:'#e8ff00',marginBottom:4}}>MOYENNE</h1>
        <p style={{color:'#555',fontSize:11,letterSpacing:3,marginBottom:8}}>RÉSULTATS ROUND {results?.roundNumber}</p>
        <p style={{color:'#333',fontSize:11,marginBottom:32}}>Prochain round dans {timeToOpen}</p>

        <div style={{background:'#111',border:'1px solid #222',padding:24,marginBottom:16,textAlign:'center'}}>
          <p style={{color:'#555',fontSize:11,letterSpacing:3,marginBottom:8}}>MOYENNE DU ROUND</p>
          <p style={{fontSize:64,color:'#e8ff00',margin:0}}>{results?.average?.toFixed(1)}</p>
        </div>

        {!player?.eliminated ? (
          <div style={{background:'#001a00',border:'1px solid #00ff88',padding:24,marginBottom:16,textAlign:'center'}}>
            <p style={{color:'#00ff88',fontSize:18,letterSpacing:3}}>✓ SURVIVANT</p>
            <p style={{color:'#555',fontSize:12,marginTop:8}}>Tu passes au round suivant</p>
          </div>
        ) : (
          <div style={{background:'#1a0000',border:'1px solid #ff3131',padding:24,marginBottom:16,textAlign:'center'}}>
            <p style={{color:'#ff3131',fontSize:18,letterSpacing:3}}>❌ ÉLIMINÉ</p>
            <p style={{color:'#555',fontSize:12,marginTop:8}}>Tu étais trop loin de la moyenne</p>
          </div>
        )}

        <div style={{background:'#111',border:'1px solid #222',padding:24,marginBottom:24}}>
          <p style={{color:'#555',fontSize:11,letterSpacing:3,marginBottom:16}}>CLASSEMENT</p>
          {results?.submissions?.map((s, i) => (
            <div key={s.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid #1a1a1a',opacity:s.players?.eliminated ? 0.4 : 1}}>
              <span style={{color:'#555',fontSize:11}}>#{i+1}</span>
              <span style={{color:s.players?.eliminated ? '#ff3131' : '#00ff88',fontSize:13}}>
                {s.players?.eliminated ? '❌' : '✓'} {s.players?.username ?? 'Joueur'}
              </span>
              <span style={{color:'#888',fontSize:12}}>{s.number}</span>
              <span style={{color:'#555',fontSize:11}}>±{s.distance_from_average?.toFixed(1)}</span>
            </div>
          ))}
        </div>

        {player?.eliminated && (
          <button onClick={logout}
            style={{width:'100%',padding:16,background:'transparent',border:'1px solid #333',color:'#555',cursor:'pointer',fontSize:14,fontFamily:'monospace',letterSpacing:2}}>
            REJOUER
          </button>
        )}
      </div>
    </div>
  )

  if (screen === 'winner') return (
    <div style={{minHeight:'100vh',background:'#000',color:'white',fontFamily:'monospace',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{textAlign:'center',padding:24}}>
        <p style={{color:'#e8ff00',fontSize:12,letterSpacing:4,marginBottom:16}}>FÉLICITATIONS</p>
        <h1 style={{fontSize:80,color:'#e8ff00',marginBottom:8,letterSpacing:-4}}>WINNER</h1>
        <p style={{color:'#555',fontSize:13,marginBottom:48}}>Tu es le dernier survivant — {player?.username}</p>
        <button onClick={logout}
          style={{padding:'14px 32px',background:'#e8ff00',color:'#000',border:'none',cursor:'pointer',fontFamily:'monospace',letterSpacing:3,fontSize:13}}>
          REJOUER
        </button>
      </div>
    </div>
  )

  if (screen === 'eliminated') return (
    <div style={{minHeight:'100vh',background:'#000',color:'white',fontFamily:'monospace',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{textAlign:'center',padding:24}}>
        <h1 style={{fontSize:64,color:'#ff3131',marginBottom:16}}>ÉLIMINÉ</h1>
        <p style={{color:'#555',fontSize:13,marginBottom:48}}>Tu étais trop loin de la moyenne.</p>
        <button onClick={logout}
          style={{padding:'14px 32px',background:'transparent',border:'1px solid #333',color:'#555',cursor:'pointer',fontFamily:'monospace',letterSpacing:2}}>
          REJOUER
        </button>
      </div>
    </div>
  )

  return null
}