'use client'
import { useState, useEffect, useRef } from 'react'
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
  const [message, setMessage] = useState('')
  const [results, setResults] = useState(null)
  const [winnerUsername, setWinnerUsername] = useState(null)
  const [totalRanking, setTotalRanking] = useState([])
  const [prevRanking, setPrevRanking] = useState([])
  const [waitingCount, setWaitingCount] = useState(0)
  const [historyRounds, setHistoryRounds] = useState([])
  const [selectedHistoryRound, setSelectedHistoryRound] = useState(null)
  const [historySubmissions, setHistorySubmissions] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const [lang, setLang] = useState('fr')
  const [isMobile, setIsMobile] = useState(false)
  const [musicOn, setMusicOn] = useState(false)
  const audioRef = useRef(null)
  const oscillatorRef = useRef(null)
  const intervalRef = useRef(null)

  const tr = (key) => translations[lang]?.[key] ?? key

  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth <= 540)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    if (!musicOn) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      if (oscillatorRef.current) {
        oscillatorRef.current.stop()
        oscillatorRef.current.disconnect()
        oscillatorRef.current = null
      }
      return
    }

    const AudioContext = window.AudioContext || window.webkitAudioContext
    if (!AudioContext) return

    if (!audioRef.current) {
      audioRef.current = new AudioContext()
    }

    const ctx = audioRef.current
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {})
    }

    const gain = ctx.createGain()
    gain.gain.value = 0.06
    gain.connect(ctx.destination)

    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(440, ctx.currentTime)
    osc.connect(gain)
    osc.start()
    oscillatorRef.current = osc

    const notes = [440, 494, 523, 587, 659, 698, 784]
    let step = 0
    intervalRef.current = setInterval(() => {
      const next = notes[step % notes.length]
      osc.frequency.setValueAtTime(next, ctx.currentTime)
      step += 1
    }, 600)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      if (oscillatorRef.current) {
        oscillatorRef.current.stop()
        oscillatorRef.current.disconnect()
        oscillatorRef.current = null
      }
    }
  }, [musicOn])

  const translations = {
    fr: {
      play: 'JOUER →',
      rules: 'RULES',
      howToPlay: 'COMMENT JOUER',
      howToSurvive: 'COMMENT SURVIVRE',
      login: 'CONNEXION',
      sendLink: 'ENVOYER LE LIEN →',
      usernameTitle: 'TON PSEUDO',
      enterArena: "ENTRER DANS L'ARÈNE →",
      back: '← RETOUR',
      roundResults: 'RÉSULTATS ROUND',
      target: 'CIBLE (2/3 moyenne)',
      yourHp: 'TES PV RESTANTS',
      roundRanking: 'CLASSEMENT DU ROUND',
      totalRanking: 'CLASSEMENT TOTAL (TOUS LES ROUNDS)',
      history: 'HISTORIQUE DES ROUNDS',
      rulesHeader: 'RULES',
      closeRound: 'CLÔTURER LE ROUND',
      resetGame: 'RESET PARTIE',
      logout: 'déconnexion',
      replay: 'REJOUER',
      waiting: 'En attente du prochain round...',
      adminError: 'Erreur : structure of query does not match function result type',
    },
    en: {
      play: 'PLAY →',
      rules: 'RULES',
      howToPlay: 'HOW TO PLAY',
      howToSurvive: 'HOW TO SURVIVE',
      login: 'LOGIN',
      sendLink: 'SEND LINK →',
      usernameTitle: 'YOUR USERNAME',
      enterArena: 'ENTER THE ARENA →',
      back: '← BACK',
      roundResults: 'ROUND RESULTS',
      target: 'TARGET (2/3 average)',
      yourHp: 'YOUR HP LEFT',
      roundRanking: 'ROUND RANKING',
      totalRanking: 'TOTAL RANKING (ALL ROUNDS)',
      history: 'ROUND HISTORY',
      rulesHeader: 'RULES',
      closeRound: 'CLOSE ROUND',
      resetGame: 'RESET GAME',
      logout: 'logout',
      replay: 'REPLAY',
      waiting: 'Waiting for next round...',
      adminError: 'Error: structure of query does not match function result type',
    }
  }

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
      const playerChannel = player ? supabase
  .channel('player-pv')
  .on('postgres_changes', {
    event: 'UPDATE', schema: 'public', table: 'players',
    filter: `id=eq.${player.id}`
  }, (payload) => {
    setPlayer(payload.new)
  })
  .subscribe() : null
    return () => {
      supabase.removeChannel(channel)
      supabase.removeChannel(subChannel)
      if (playerChannel) supabase.removeChannel(playerChannel)
    }
  }, [round])

  useEffect(() => {
    if (!user) return

    const gamesChannel = supabase
      .channel('games-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'games'
      }, async () => {
        const { data: profile } = await supabase
          .from('profiles').select('username').eq('id', user.id).single()
        if (profile?.username) {
          await joinGame(profile.username)
        }
      })
      .subscribe()

    let gameRoundsChannel = null
    if (game?.id) {
      gameRoundsChannel = supabase
        .channel('game-rounds-' + game.id)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'rounds',
          filter: `game_id=eq.${game.id}`
        }, async (payload) => {
          if (payload.new?.status === 'open' && payload.new?.id !== round?.id) {
            const { data: prof } = await supabase
              .from('profiles').select('username').eq('id', user.id).single()
            if (prof?.username) {
              await joinGame(prof.username)
            }
          }
        })
        .subscribe()
    }

    return () => {
      supabase.removeChannel(gamesChannel)
      if (gameRoundsChannel) supabase.removeChannel(gameRoundsChannel)
    }
  }, [user, game?.id, player?.username, round?.id])

  const checkProfile = async () => {
    const { data: profile } = await supabase
      .from('profiles').select('*').eq('id', user.id).single()
    if (!profile) {
      setScreen('username')
    } else {
      if (!player) await joinGame(profile.username)
    else {
      const { data: freshPlayer } = await supabase
        .from('players').select('*').eq('id', player.id).single()
      if (freshPlayer) setPlayer(freshPlayer)
    }
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
    const { data: games } = await supabase
      .from('games').select('*').in('status', ['waiting', 'active']).limit(1)
    let currentGame = games?.[0] ?? null
    let existingPlayer = null

    if (currentGame) {
      const { data } = await supabase
        .from('players')
        .select('*')
        .eq('game_id', currentGame.id)
        .eq('user_id', user.id)
        .maybeSingle()
      existingPlayer = data
    } else {
      const { data: previousPlayers } = await supabase
        .from('players')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)

      const previousPlayer = previousPlayers?.[0]
      if (previousPlayer) {
        const { data: previousGame } = await supabase
          .from('games')
          .select('*')
          .eq('id', previousPlayer.game_id)
          .single()
        currentGame = previousGame ?? null
        existingPlayer = previousPlayer
      }
    }

    if (!currentGame) {
      setMessage("Aucune partie en cours. Attends que l'admin lance une nouvelle partie.")
      setScreen('waiting-open')
      return
    }

    setGame(currentGame)
    if (!existingPlayer) {
      const { count: roundsCount } = await supabase
        .from('rounds')
        .select('*', { count: 'exact', head: true })
        .eq('game_id', currentGame.id)

      if ((roundsCount ?? 0) > 0) {
        setMessage('Une partie est déjà en cours. Reviens au prochain reset !')
        setScreen('game-locked')
        return
      }

      const { data } = await supabase
        .from('players').insert({ game_id: currentGame.id, user_id: user.id, username: uname, pv: 100 })
        .select().single()
      existingPlayer = data
    }
    const { data: freshPlayer } = await supabase
  .from('players')
  .select('*')
  .eq('id', existingPlayer.id)
  .single()
setPlayer(freshPlayer || existingPlayer)

    const { data: rounds } = await supabase
      .from('rounds').select('*').eq('game_id', currentGame.id).eq('status', 'open').limit(1)
    const currentRound = rounds?.[0]

if (!currentRound) {
  if (existingPlayer.eliminated) {
    setScreen('eliminated')
    return
  }
  // Cherche le dernier round terminé pour afficher les résultats
  const { data: lastDoneRounds } = await supabase
    .from('rounds').select('*').eq('game_id', currentGame.id)
    .eq('status', 'done').order('round_number', { ascending: false }).limit(1)
  if (lastDoneRounds?.[0]) {
    await loadResults(lastDoneRounds[0], existingPlayer)
  } else {
    setScreen('waiting-open')
  }
  return

   }
    setRound(currentRound)

    if (existingPlayer.eliminated) {
      const { data: lastDoneRounds } = await supabase
        .from('rounds').select('*').eq('game_id', currentGame.id)
        .eq('status', 'done').order('round_number', { ascending: false }).limit(1)
      if (lastDoneRounds?.[0]) {
        await loadResults(lastDoneRounds[0], existingPlayer)
      } else {
        setScreen('eliminated')
      }
      return
    }

    const { data: existingList } = await supabase
      .from('submissions').select('*')
      .eq('round_id', currentRound.id)
      .eq('player_id', existingPlayer.id)

    if (existingList && existingList.length > 0) {
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
      .from('submissions').select('*, players(pv, eliminated, username)')
      .eq('round_id', currentRound.id)
      .order('distance_from_average', { ascending: true })
    let updatedPlayer = p
    if (p?.id) {
      const { data: pd } = await supabase
        .from('players').select('*').eq('id', p.id).single()
      if (pd) updatedPlayer = pd
    }

    const { data: alivePlayers } = await supabase
      .from('players')
      .select('id, username')
      .eq('game_id', currentRound.game_id)
      .eq('eliminated', false)

    const { data: rankingData } = await supabase
      .from('players')
      .select('id, username, pv, eliminated, eliminated_at_round')
      .eq('game_id', currentRound.game_id)
      .order('pv', { ascending: false })
      .order('eliminated_at_round', { ascending: false, nullsFirst: true })

    if ((alivePlayers ?? []).length === 1) {
      setWinnerUsername(alivePlayers[0].username)
    } else if ((alivePlayers ?? []).length === 0 && (rankingData ?? []).length > 0) {
      setWinnerUsername(rankingData[0].username)
    } else {
      setWinnerUsername(null)
    }

    setPrevRanking(totalRanking)
    setPlayer(updatedPlayer)
    setTotalRanking(rankingData ?? [])
    setResults({ average: currentRound.average, target: currentRound.target, submissions: data, roundNumber: currentRound.round_number })
    setScreen('results')
  }

  const effectiveDamage = (distance, target) => {
    const numericDistance = Number(distance ?? 0)
    const numericTarget = Number(target ?? 0)
    if (numericTarget > 33.3) return numericDistance / 2
    return numericDistance
  }

  const loadHistoryRoundDetails = async (roundData) => {
    if (!roundData?.id) return
    setSelectedHistoryRound(roundData)
    setHistoryLoading(true)

    const { data } = await supabase
      .from('submissions')
      .select('*, players(username, eliminated, pv)')
      .eq('round_id', roundData.id)
      .order('distance_from_average', { ascending: true })

    setHistorySubmissions(data ?? [])
    setHistoryLoading(false)
  }

  const openHistory = async () => {
    if (!game?.id) return

    setHistoryLoading(true)
    try {
      const { data: doneRounds } = await supabase
        .from('rounds')
        .select('*')
        .eq('game_id', game.id)
        .eq('status', 'done')
        .order('round_number', { ascending: false })

      const roundsList = doneRounds ?? []
      setHistoryRounds(roundsList)

      const defaultRound = roundsList.find((r) => r.round_number === results?.roundNumber) ?? roundsList[0] ?? null
      if (defaultRound) {
        await loadHistoryRoundDetails(defaultRound)
      } else {
        setSelectedHistoryRound(null)
        setHistorySubmissions([])
      }

      setScreen('history')
    } catch (err) {
      console.error('Failed to load history rounds', err)
      setMessage('Erreur de chargement de l\'historique. Réessaie plus tard.')
    } finally {
      setHistoryLoading(false)
    }
  }

  const submitNumber = async () => {
    const normalizedNumber = number.trim().replace(',', '.')
    const isValidFormat = /^(?:100(?:\.0)?|[0-9]{1,2}(?:\.[0-9])?)$/.test(normalizedNumber)
    if (!isValidFormat) {
      setMessage('Entre un nombre entre 0 et 100 (max 1 décimale) !')
      return
    }
    const num = Number(normalizedNumber)
    await supabase.from('submissions').insert({
      round_id: round.id, player_id: player.id, number: num
    })
    setMessage('')
    setScreen('waiting-results')
  }

  const logout = async () => {
    await supabase.auth.signOut()
    setUser(null); setGame(null); setRound(null); setPlayer(null)
    setResults(null); setWinnerUsername(null); setTotalRanking([]); setScreen('home')
  }

  if (screen === 'loading') return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#000'}}>
      <p style={{color:'#555',fontFamily:'monospace'}}>Chargement...</p>
    </div>
  )

  if (screen === 'home') return (
    <div style={{minHeight:'100vh',background:'#000',color:'white',fontFamily:'monospace'}}>
      {hint}
      <div style={{maxWidth:600,margin:'0 auto',padding:'80px 24px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div>
            <h1 style={{fontSize:64,color:'#e8ff00',marginBottom:8,letterSpacing:-2}}>MOYENNE</h1>
            <p style={{color:'#555',fontSize:13,letterSpacing:4,marginBottom:0}}>LE JEU DE LA SURVIE</p>
          </div>
          <button onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}
            style={{background:'none',border:'1px solid #555',color:'#fff',cursor:'pointer',fontFamily:'monospace',fontSize:10,padding:'8px 12px'}}>
            {lang === 'fr' ? 'EN' : 'FR'}
          </button>
        </div>
        <div style={{marginBottom:64}}>
          <h2 style={{color:'#e8ff00',fontSize:14,letterSpacing:3,marginBottom:24}}>{tr('howToPlay')}</h2>
          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            {[
              ['01', lang === 'fr' ? 'Chaque joueur commence avec 100 PV.' : 'Each player starts with 100 HP.'],
              ['02', lang === 'fr' ? 'Chaque round, soumets un nombre entre 0 et 100 (max 1 décimale).' : 'Each round, submit a number between 0 and 100 (max 1 decimal).'],
              ['03', lang === 'fr' ? 'La cible est les 2/3 de la moyenne de tous les nombres.' : 'The target is 2/3 of the average of all numbers.'],
              ['04', lang === 'fr' ? 'Tu perds autant de PV que ta distance à la cible. Si la cible dépasse 33.3, tu ne perds que la moitié.' : 'You lose HP equal to your distance from the target. If the target is above 33.3, you lose only half.'],
              ['05', lang === 'fr' ? 'Règle du 100 unique : si exactement un joueur joue 100, il gagne la distance entre la cible et 100 (max 100).' : 'Unique 100 rule: if exactly one player plays 100, they gain the distance between the target and 100 (max 100).'],
              ['06', lang === 'fr' ? 'Règle Double Tranchant : si quelqu\'un joue 0 et quelqu\'un joue 100, le joueur à 0 perd 20 PV bonus.' : 'Double-Edged Rule: if someone plays 0 and someone plays 100, the 0 player loses 20 extra HP.'],
              ['07', lang === 'fr' ? 'À 0 PV tu es éliminé. Le dernier survivant gagne.' : 'At 0 HP you are eliminated. The last survivor wins.'],
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
          {tr('play')}
        </button>
      </div>
    </div>
  )

  if (screen === 'login') return (
    <div style={{minHeight:'100vh',background:'#000',color:'white',fontFamily:'monospace',display:'flex',alignItems:'center',justifyContent:'center'}}>
      {hint}
      <div style={{maxWidth:400,width:'100%',padding:24}}>
        <button onClick={() => setScreen('home')} style={{background:'none',border:'none',color:'#555',cursor:'pointer',fontFamily:'monospace',fontSize:11,letterSpacing:2,marginBottom:32}}>← RETOUR</button>
        <h1 style={{fontSize:36,color:'#e8ff00',marginBottom:4}}>CONNEXION</h1>
        <p style={{color:'#555',marginBottom:32,fontSize:12}}>Un lien magique sera envoyé à ton email</p>
        <input type="email" placeholder="ton@email.com" value={email}
          onChange={e => setEmail(e.target.value)}
          style={{width:'100%',padding:12,background:'#111',border:'1px solid #333',color:'white',fontSize:16,marginBottom:12,boxSizing:'border-box',fontFamily:'monospace'}}
        />
 <button onClick={async () => {
  // if (!email.endsWith('@groupeiscae.ma')) {
  //  setMessage('Seules les adresses @groupeiscae.ma sont autorisées !')
  //  return
  // }
  await supabase.auth.signInWithOtp({ email })
  setMessage('Vérifie ton email !')
}}
  style={{width:'100%',padding:14,background:'#e8ff00',color:'#000',border:'none',cursor:'pointer',fontSize:14,fontFamily:'monospace',letterSpacing:2}}>
  ENVOYER LE LIEN →
</button>
        {message && <p style={{color:'#00ff88',marginTop:12,fontSize:12}}>{message}</p>}
      </div>
    </div>
  )

  if (screen === 'username') return (
    <div style={{minHeight:'100vh',background:'#000',color:'white',fontFamily:'monospace',display:'flex',alignItems:'center',justifyContent:'center'}}>
      {hint}
      <div style={{maxWidth:400,width:'100%',padding:24}}>
        <h1 style={{fontSize:36,color:'#e8ff00',marginBottom:4}}>TON PSEUDO</h1>
        <p style={{color:'#555',marginBottom:32,fontSize:12}}>Il sera visible de tous les joueurs</p>
        <input type="text" placeholder="Ex: Lkhadri67" value={username}
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

  if (screen === 'game-locked') return (
    <div style={{minHeight:'100vh',background:'#000',color:'white',fontFamily:'monospace',display:'flex',alignItems:'center',justifyContent:'center'}}>
      {hint}
      <div style={{maxWidth:500,width:'100%',padding:24,textAlign:'center'}}>
        <h1 style={{fontSize:42,color:'#e8ff00',marginBottom:8}}>PARTIE EN COURS</h1>
        <p style={{color:'#555',fontSize:12,letterSpacing:2,marginBottom:20}}>
          Les nouvelles inscriptions sont fermées pour cette partie.
        </p>
        <p style={{color:'#888',fontSize:13,lineHeight:1.6,marginBottom:32}}>
          Tu pourras rejoindre la prochaine partie quand l&apos;admin fera un reset.
        </p>
        {message && <p style={{color:'#ff3131',marginBottom:24,fontSize:12}}>{message}</p>}
        <button onClick={logout}
          style={{padding:'14px 24px',background:'transparent',border:'1px solid #333',color:'#777',cursor:'pointer',fontFamily:'monospace',letterSpacing:2}}>
          RETOUR
        </button>
      </div>
    </div>
  )

  if (screen === 'waiting-open') return (
    <div style={{minHeight:'100vh',background:'#000',color:'white',fontFamily:'monospace',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{textAlign:'center',padding:24}}>
        <h1 style={{fontSize:48,color:'#e8ff00',marginBottom:8}}>MOYENNE</h1>
        <p style={{color:'#555',fontSize:11,letterSpacing:3,marginBottom:48}}>LE JEU DE LA SURVIE</p>
        <p style={{color:'#555',fontSize:14,marginBottom:16}}>⏳ En attente du prochain round...</p>
        <p style={{color:'#333',fontSize:11,marginBottom:48}}>L'administrateur lancera le round prochainement</p>

<button onClick={() => setScreen('rules')}
  style={{marginTop:24,background:'none',border:'1px solid #333',color:'#e8ff00',cursor:'pointer',fontFamily:'monospace',fontSize:11,letterSpacing:3,padding:'8px 24px'}}>
  RULES
</button>
        {player && (
          <div style={{display:'flex',flexDirection:'column',gap:16,alignItems:'center'}}>
            <div style={{background:'#111',border:'1px solid #222',padding:24,width:240}}>
              <p style={{color:'#555',fontSize:11,letterSpacing:2,marginBottom:8}}>TES PV</p>
              <p style={{fontSize:48,color: player.pv > 50 ? '#e8ff00' : player.pv > 20 ? '#ff8800' : '#ff3131',margin:0}}>{player.pv}</p>
              <div style={{width:'100%',height:6,background:'#222',borderRadius:3,marginTop:12}}>
                <div style={{width: player.pv + '%', height:'100%', background: player.pv > 50 ? '#00ff88' : player.pv > 20 ? '#e8ff00' : '#ff3131', borderRadius:3}}/>
              </div>
            </div>
            <RankDisplay player={player} game={game} />
          </div>
        )}
        <br/>
        <button onClick={logout} style={{marginTop:48,background:'none',border:'none',color:'#333',cursor:'pointer',fontFamily:'monospace',fontSize:11}}>déconnexion</button>
      </div>
    </div>
  )

  if (screen === 'waiting-results') return (
    <div style={{minHeight:'100vh',background:'#000',color:'white',fontFamily:'monospace',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{textAlign:'center',padding:24}}>
        <h1 style={{fontSize:48,color:'#e8ff00',marginBottom:8}}>MOYENNE</h1>
        <p style={{color:'#555',fontSize:11,letterSpacing:3,marginBottom:48}}>ROUND {round?.round_number}</p>
        <p style={{color:'#00ff88',fontSize:14,letterSpacing:2,marginBottom:16}}>✓ NOMBRE SOUMIS</p>
        <p style={{color:'#555',fontSize:12,marginBottom:32}}>{waitingCount} joueur(s) ont soumis leur nombre</p>
        <p style={{color:'#333',fontSize:11}}>En attente de la clôture par l'administrateur...</p>
        {player && (
          <div style={{marginTop:48,background:'#111',border:'1px solid #222',padding:24,display:'inline-block'}}>
            <p style={{color:'#555',fontSize:11,letterSpacing:2,marginBottom:8}}>TES PV ACTUELS</p>
            <p style={{fontSize:48,color:'#e8ff00',margin:0}}>{player.pv}</p>
          </div>
        )}
        <br/>
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
            <p style={{color:'#e8ff00',fontSize:18,margin:'4px 0'}}>{player?.pv} PV</p>
            <button onClick={logout} style={{background:'none',border:'none',color:'#333',cursor:'pointer',fontFamily:'monospace',fontSize:10}}>déconnexion</button>
          </div>
        </div>
        <div style={{background:'#111',border:'1px solid #222',padding:24,marginBottom:24}}>
          <p style={{color:'#555',fontSize:11,letterSpacing:3,marginBottom:16}}>TON NOMBRE (0-100, 1 décimale max)</p>
          <input type="text" inputMode="decimal" value={number}
            onChange={e => {
              const nextValue = e.target.value.replace(',', '.')
              if (nextValue === '') {
                setNumber('')
                return
              }
              if (!/^\d{0,3}(?:\.\d?)?$/.test(nextValue)) return
              const parsed = Number(nextValue)
              if (!Number.isNaN(parsed) && parsed > 100) return
              setNumber(nextValue)
            }} placeholder="Ex: 42.5"
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

  if (screen === 'results') {
    const submissions = results?.submissions ?? []
    const count100 = submissions.filter(s => s.number === 100).length
    const has0 = submissions.some(s => s.number === 0)
    const mySubmission = submissions.find(s => s.player_id === player?.id || s.players?.id === player?.id)
    const rule05Active = count100 === 1
    const rule06Active = has0 && count100 > 0
    const gain100 = rule05Active && mySubmission?.number === 100
      ? Math.min(100, Math.max(0, 100 - (results?.target ?? 0)))
      : null

    return (
      <div style={{minHeight:'100vh',background:'#000',color:'white',fontFamily:'monospace'}}>
        <div style={{maxWidth:500,margin:'0 auto',padding:'60px 24px'}}>
          {winnerUsername && (
            <div style={{background:'#001a00',border:'1px solid #00ff88',padding:14,marginBottom:16,textAlign:'center'}}>
              <p style={{margin:0,color:'#00ff88',fontSize:12,letterSpacing:2}}>
                {winnerUsername === player?.username ? '🏆 VOUS ÊTES LE GAGNANT' : `🏆 GAGNANT : ${winnerUsername}`}
              </p>
            </div>
          )}

          {(rule05Active || rule06Active) && (
            <div style={{background:'#111',border:'1px solid #444',padding:16,marginBottom:16}}>
              {rule05Active && (
                <p style={{margin:0,color:'#e8ff00',fontSize:12,letterSpacing:2}}>
                  Règle 100 unique activée : {mySubmission?.number === 100 ? `tu gagnes +${gain100.toFixed(1)} PV` : 'un joueur a gagné des PV'}.
                </p>
              )}
              {rule06Active && mySubmission?.number === 0 && (
                <p style={{margin:0,color:'#ff3131',fontSize:12,letterSpacing:2}}>
                  Règle Double Tranchant activée : tu perds 20 PV supplémentaires (tu as joué 0 et quelqu'un a joué 100).
                </p>
              )}
            </div>
          )}

          <h1 style={{fontSize:36,color:'#e8ff00',marginBottom:4}}>MOYENNE</h1>
          <p style={{color:'#555',fontSize:11,letterSpacing:3,marginBottom:32}}>RÉSULTATS ROUND {results?.roundNumber}</p>

        <div style={{background:'#111',border:'1px solid #222',padding:24,marginBottom:16,textAlign:'center'}}>
          <p style={{color:'#555',fontSize:11,letterSpacing:3,marginBottom:8}}>CIBLE (2/3 moyenne)</p>
          <p style={{fontSize:64,color:'#e8ff00',margin:0}}>{results?.target?.toFixed(1)}</p>
        </div>

        <div style={{background:'#111',border:'1px solid #222',padding:24,marginBottom:16,textAlign:'center'}}>
          <p style={{color:'#555',fontSize:11,letterSpacing:2,marginBottom:8}}>TES PV RESTANTS</p>
          <p style={{fontSize:48,color: player?.pv > 30 ? '#00ff88' : '#ff3131',margin:0}}>{player?.pv}</p>
          {player?.eliminated && <p style={{color:'#ff3131',fontSize:12,marginTop:8}}>ÉLIMINÉ</p>}
        </div>

        <div style={{background:'#111',border:'1px solid #222',padding:24,marginBottom:24}}>
          <p style={{color:'#555',fontSize:11,letterSpacing:3,marginBottom:16}}>CLASSEMENT DU ROUND</p>
          {results?.submissions?.map((s, i) => {
            const deltaFromDb = typeof s.pv_delta === 'number' ? s.pv_delta : null
            const oldPv = prevRanking.find(p => p.id === s.player_id || p.id === s.players?.id)?.pv ?? null
            const newPv = s.players?.pv ?? null
            const deltaComputed = typeof oldPv === 'number' && typeof newPv === 'number' ? newPv - oldPv : null
            const delta = deltaFromDb ?? deltaComputed

            return (
              <div key={s.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid #1a1a1a',opacity:s.players?.eliminated ? 0.4 : 1}}>
                <span style={{color:'#555',fontSize:11}}>#{i+1}</span>
                <span style={{color:s.players?.eliminated ? '#ff3131' : '#00ff88',fontSize:13}}>
                  {s.players?.eliminated ? '❌' : '✓'} {s.players?.username ?? 'Joueur'}
                </span>
                <span style={{color:'#888',fontSize:12}}>{s.number}</span>
                <span style={{color:'#555',fontSize:11}}>±{s.distance_from_average?.toFixed(1)}</span>
                {delta !== null ? (
                  <span style={{color:delta >= 0 ? '#00ff88' : '#ff3131',fontSize:11}}>
                    {delta >= 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1)} PV
                  </span>
                ) : (
                  <span style={{color:'#e8ff00',fontSize:11}}>-{effectiveDamage(s.distance_from_average, results?.target).toFixed(1)} PV</span>
                )}
                <span style={{color:'#e8ff00',fontSize:11}}>{s.players?.pv} PV</span>
              </div>
            )
          })}
        </div>

        <div style={{background:'#111',border:'1px solid #222',padding:24,marginBottom:24}}>
          <p style={{color:'#555',fontSize:11,letterSpacing:3,marginBottom:16}}>CLASSEMENT TOTAL (TOUS LES ROUNDS)</p>
          {totalRanking.map((p, i) => (
            <div key={p.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid #1a1a1a',opacity:p.eliminated ? 0.55 : 1}}>
              <span style={{color:'#555',fontSize:11}}>#{i + 1}</span>
              <span style={{color:p.eliminated ? '#ff3131' : '#00ff88',fontSize:13}}>
                {p.eliminated ? '❌' : '✓'} {p.username ?? 'Joueur'}
              </span>
              <span style={{color:'#e8ff00',fontSize:11}}>{p.pv} PV</span>
            </div>
          ))}
          {totalRanking.length === 0 && <p style={{color:'#666',fontSize:12,margin:0}}>Aucune donnée de classement.</p>}
        </div>

        <button onClick={openHistory}
          style={{width:'100%',padding:14,background:'transparent',border:'1px solid #e8ff00',color:'#e8ff00',cursor:'pointer',fontSize:13,fontFamily:'monospace',letterSpacing:2,marginBottom:16}}>
          HISTORIQUE DES ROUNDS
        </button>

        <button onClick={() => setScreen('rules')}
          style={{width:'100%',padding:14,background:'transparent',border:'1px solid #e8ff00',color:'#e8ff00',cursor:'pointer',fontSize:13,fontFamily:'monospace',letterSpacing:2,marginBottom:16}}>
          RULES
        </button>

        {player?.eliminated && (
          <button onClick={logout}
            style={{width:'100%',padding:16,background:'transparent',border:'1px solid #333',color:'#555',cursor:'pointer',fontSize:14,fontFamily:'monospace',letterSpacing:2}}>
            REJOUER
          </button>
        )}
      </div>
    </div>
  )

  if (screen === 'history') return (
    <div style={{minHeight:'100vh',background:'#000',color:'white',fontFamily:'monospace'}}>
      <div style={{maxWidth:900,margin:'0 auto',padding:'40px 24px'}}>
        <button onClick={() => setScreen('results')} style={{background:'none',border:'none',color:'white',cursor:'pointer',fontFamily:'monospace',fontSize:11,letterSpacing:2,marginBottom:24}}>
          ← RETOUR RÉSULTATS
        </button>

        <h1 style={{fontSize:36,color:'#e8ff00',marginBottom:8}}>HISTORIQUE</h1>
        <p style={{color:'white',fontSize:11,letterSpacing:3,marginBottom:24}}>TOUS LES ROUNDS TERMINÉS</p>

        {historyLoading && historyRounds.length === 0 ? (
          <p style={{color:'white',fontSize:12}}>Chargement...</p>
        ) : historyRounds.length === 0 ? (
          <p style={{color:'white',fontSize:12}}>Aucun round terminé pour l'instant.</p>
        ) : (
          <div style={{
            display: isMobile ? 'flex' : 'grid',
            flexDirection: isMobile ? 'column' : undefined,
            gridTemplateColumns: isMobile ? undefined : '260px 1fr',
            gap: 16,
          }}>
            <div style={{
              background: '#111',
              border: '1px solid #222',
              padding: 12,
              maxHeight: isMobile ? 'none' : 560,
              overflowY: isMobile ? 'visible' : 'auto',
            }}>
              {historyRounds.map((r) => (
                <button
                  key={r.id}
                  onClick={() => loadHistoryRoundDetails(r)}
                  style={{
                    width:'100%',
                    textAlign:'left',
                    marginBottom:8,
                    padding:'12px 10px',
                    background:selectedHistoryRound?.id === r.id ? '#1a1a1a' : 'transparent',
                    border:selectedHistoryRound?.id === r.id ? '1px solid #e8ff00' : '1px solid #222',
                    color:'white',
                    cursor:'pointer',
                    fontFamily:'monospace'
                  }}>
                  <p style={{margin:'0 0 4px 0',fontSize:12,color:'#e8ff00'}}>ROUND {r.round_number}</p>
                  <p style={{margin:0,fontSize:11,color:'#777'}}>Cible: {r.target?.toFixed(1) ?? '-'}</p>
                </button>
              ))}
            </div>

            <div style={{background:'#111',border:'1px solid #222',padding:20}}>
              {selectedHistoryRound ? (
                <>
                  <p style={{margin:'0 0 8px 0',fontSize:12,color:'#e8ff00',letterSpacing:2}}>
                    ROUND {selectedHistoryRound.round_number}
                  </p>
                  <p style={{margin:'0 0 4px 0',fontSize:12,color:'#888'}}>
                    CIBLE: {selectedHistoryRound.target?.toFixed(1) ?? '-'}
                  </p>
                  <p style={{margin:'0 0 20px 0',fontSize:12,color:'#555'}}>
                    MOYENNE: {selectedHistoryRound.average?.toFixed(1) ?? '-'}
                  </p>

                  <div style={{borderTop:'1px solid #1a1a1a'}}>
                    {historySubmissions.map((s, i) => (
                      <div key={s.id} style={{display:'grid',gridTemplateColumns:'50px 1fr 80px 80px 90px',gap:8,alignItems:'center',padding:'10px 0',borderBottom:'1px solid #1a1a1a',opacity:s.players?.eliminated ? 0.5 : 1}}>
                        <span style={{color:'#555',fontSize:11}}>#{i + 1}</span>
                        <span style={{color:s.players?.eliminated ? '#ff3131' : '#00ff88',fontSize:12}}>
                          {s.players?.eliminated ? '❌' : '✓'} {s.players?.username ?? 'Joueur'}
                        </span>
                        <span style={{color:'#ddd',fontSize:12}}>{s.number}</span>
                        <span style={{color:'#777',fontSize:11}}>±{s.distance_from_average?.toFixed(1)}</span>
                        <span style={{color:'#e8ff00',fontSize:11}}>-{effectiveDamage(s.distance_from_average, selectedHistoryRound?.target).toFixed(1)} PV</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p style={{color:'white',fontSize:12}}>Sélectionne un round pour voir le détail.</p>
              )}
            </div>
          </div>
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
  }

  if (screen === 'eliminated') return (
    <div style={{minHeight:'100vh',background:'#000',color:'white',fontFamily:'monospace',display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{textAlign:'center',padding:24}}>
        <h1 style={{fontSize:64,color:'#ff3131',marginBottom:16}}>ÉLIMINÉ</h1>
        <p style={{color:'#555',fontSize:13,marginBottom:16}}>Tu as atteint 0 PV.</p>
        <p style={{color:'#333',fontSize:11,marginBottom:48}}>Merci d'avoir joué !</p>
        <button onClick={logout}
          style={{padding:'14px 32px',background:'transparent',border:'1px solid #333',color:'#555',cursor:'pointer',fontFamily:'monospace',letterSpacing:2}}>
          REJOUER
        </button>
      </div>
    </div>
  )
function RankDisplay({ player, game }) {
    const [rank, setRank] = useState(null)
    const [total, setTotal] = useState(null)

    useEffect(() => {
      if (!player || !game) return
      const fetchRank = async () => {
        const { data } = await supabase
          .from('players')
          .select('id, pv')
          .eq('game_id', game.id)
          .eq('eliminated', false)
          .order('pv', { ascending: false })
        if (data) {
          setTotal(data.length)
          const pos = data.findIndex(p => p.id === player.id)
          setRank(pos + 1)
        }
      }
      fetchRank()
    }, [player, game])

    if (!rank || !total) return null

    return (
      <div style={{background:'#111',border:'1px solid #222',padding:24,width:240}}>
        <p style={{color:'#555',fontSize:11,letterSpacing:2,marginBottom:8}}>{lang === 'fr' ? 'TON CLASSEMENT' : 'YOUR RANK'}</p>
        <p style={{margin:0}}>
          <span style={{fontSize:48,color:'#e8ff00'}}>{rank}</span>
          <span style={{color:'#555',fontSize:14}}>/{total}</span>
        </p>
        <p style={{color:'#333',fontSize:11,marginTop:8}}>
          {rank === 1 ? (lang === 'fr' ? '🏆 Tu mènes la partie !' : '🏆 You lead the game!')
            : rank <= 3 ? (lang === 'fr' ? '🔥 Top 3 !' : '🔥 Top 3!')
            : rank === total ? (lang === 'fr' ? '⚠️ Dernier survivant...' : '⚠️ Last survivor...') : ''}
        </p>
      </div>
    )
  }
if (screen === 'rules') return (
  <div style={{minHeight:'100vh',background:'#000',color:'white',fontFamily:'monospace'}}>
    <div style={{maxWidth:600,margin:'0 auto',padding:'60px 24px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
        <button onClick={() => setScreen('waiting-open')} style={{background:'none',border:'none',color:'#555',cursor:'pointer',fontFamily:'monospace',fontSize:11,letterSpacing:2}}>← {lang === 'fr' ? 'RETOUR' : 'BACK'}</button>
        <button onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')} style={{background:'none',border:'1px solid #555',color:'#fff',cursor:'pointer',fontFamily:'monospace',fontSize:10,padding:'8px 12px'}}>{lang === 'fr' ? 'EN' : 'FR'}</button>
      </div>
      <h1 style={{fontSize:48,color:'#e8ff00',marginBottom:8}}>{tr('rulesHeader')}</h1>
      <p style={{color:'#555',fontSize:11,letterSpacing:3,marginBottom:48}}>{tr('howToSurvive')}</p>
      <div style={{display:'flex',flexDirection:'column',gap:24}}>
        {[
          ['01', lang === 'fr' ? 'Chaque joueur commence avec 100 PV.' : 'Each player starts with 100 HP.'],
          ['02', lang === 'fr' ? 'Chaque round, soumets un nombre entre 0 et 100.' : 'Each round, submit a number between 0 and 100.'],
          ['03', lang === 'fr' ? 'La cible est les 2/3 de la moyenne de tous les nombres soumis.' : 'The target is 2/3 of the average of all submitted numbers.'],
          ['04', lang === 'fr' ? 'Tu perds autant de PV que ta distance à la cible. Si la cible dépasse 33.3, tu ne perds que la moitié de ta distance.' : 'You lose HP equal to your distance from the target. If the target is over 33.3, you lose only half.'],
          ['05', lang === 'fr' ? 'Si tu ne soumets pas de nombre, tu perds 20 PV automatiquement.' : 'If you do not submit a number, you lose 20 HP automatically.'],
          ['06', lang === 'fr' ? 'Si tu es le seul à jouer 100, tu gagnes la distance entre la cible et 100 (max 100).' : 'If you are the only one to play 100, you gain the distance between the target and 100 (max 100).'],
          ['07', lang === 'fr' ? 'Règle Double Tranchant : si quelqu\'un joue 0 ET quelqu\'un joue 100, le joueur à 0 perd 20 PV supplémentaires.' : 'Double-Edged Rule: if someone plays 0 AND someone plays 100, the 0 player loses 20 extra HP.'],
          ['08', lang === 'fr' ? 'À 0 PV tu es éliminé définitivement.' : 'At 0 HP you are eliminated permanently.'],
          ['09', lang === 'fr' ? 'Le dernier survivant remporte la partie.' : 'The last survivor wins the game.'],
        ].map(([num, text]) => (
          <div key={num} style={{display:'flex',gap:24,alignItems:'flex-start',borderBottom:'1px solid #111',paddingBottom:24}}>
            <span style={{color:'#e8ff00',fontSize:11,minWidth:24,marginTop:2}}>{num}</span>
            <p style={{color:'#888',fontSize:13,lineHeight:1.6,margin:0}}>{text}</p>
          </div>
        ))}
      </div>
    </div>
  </div>
)
  return null
}