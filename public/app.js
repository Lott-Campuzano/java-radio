/* ============================================================
   JAVA RADIO · 140.1 · cabina
   ------------------------------------------------------------
   Este archivo es todo el cliente: no hay frameworks ni build.

   Reglas que conviene respetar si lo tocas:
   1. El navegador NUNCA habla con Drive. Pide /api/tracks y
      reproduce /api/stream/<token>?e=...&s=... (firmado y
      caducado). No construyas URLs de Drive aquí.
   2. La voz se lanza ANTES de esperar a audio.play(). Si se
      espera primero, Safari/Chrome pierden el gesto del usuario
      y speechSynthesis queda mudo aunque el texto aparezca.
   3. La cola se ordena por hora del día + energía + emoción.
      No es aleatoria: es la recomendación de la radio.
   4. Cada locutor tiene paleta, carácter, voz y libretos propios.
      El fondo de la web cambia con la ropa del locutor activo.
   ============================================================ */
(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const audio = $('#audio');

  const els = {
    body: document.body,
    clock: $('#clock'),
    onair: $('#onair'),
    onairLabel: $('#onairLabel'),
    voiceBtn: $('#voiceBtn'),
    voiceLabel: $('#voiceLabel'),
    powerBtn: $('#powerBtn'),
    powerLabel: $('#powerLabel'),
    heroNote: $('#heroNote'),
    djCard: $('#djCard'),
    djAvatarUse: $('#djAvatarUse'),
    djRole: $('#djRole'),
    djName: $('#djName'),
    djTag: $('#djTag'),
    bubble: $('#djBubble'),
    djState: $('#djState'),
    typing: $('#typing'),
    signal: $('#signal'),
    crewGrid: $('#crewGrid'),
    crewNote: $('#crewNote'),
    autoDjBtn: $('#autoDjBtn'),
    autoDjLabel: $('#autoDjLabel'),
    dediDjName: $('#dediDjName'),
    cover: $('#cover'),
    coverArt: $('#coverArt'),
    coverKicker: $('#coverKicker'),
    coverLetter: $('#coverLetter'),
    nowLabel: $('#nowLabel'),
    trackTitle: $('#trackTitle'),
    trackArtist: $('#trackArtist'),
    trackTags: $('#trackTags'),
    viz: $('#viz'),
    curTime: $('#curTime'),
    durTime: $('#durTime'),
    seek: $('#seek'),
    shuffleBtn: $('#shuffleBtn'),
    prevBtn: $('#prevBtn'),
    playBtn: $('#playBtn'),
    nextBtn: $('#nextBtn'),
    muteBtn: $('#muteBtn'),
    volume: $('#volume'),
    sourceBadge: $('#sourceBadge'),
    trackCount: $('#trackCount'),
    smartBadge: $('#smartBadge'),
    queue: $('#queue'),
    queueMeta: $('#queueMeta'),
    queueEmpty: $('#queueEmpty'),
    emptyCopy: $('#emptyCopy'),
    retryBtn: $('#retryBtn'),
    refreshBtn: $('#refreshBtn'),
    dediForm: $('#dediForm'),
    dediName: $('#dediName'),
    dediMsg: $('#dediMsg'),
    dediList: $('#dediList'),
    recent: $('#recent'),
    recentMeta: $('#recentMeta'),
    factTracks: $('#factTracks'),
    mini: $('#mini'),
    miniCover: $('#miniCover'),
    miniTitle: $('#miniTitle'),
    miniArtist: $('#miniArtist'),
    miniPlay: $('#miniPlay'),
    toast: $('#toast')
  };

  /* Claves de localStorage propias de Java Radio: no heredan
     ajustes de otras radios ni de versiones anteriores. */
  const STORE = {
    voice: 'javaradio.voice',
    volume: 'javaradio.volume',
    shuffle: 'javaradio.shuffle',
    pinned: 'javaradio.pinnedDj',
    dedications: 'javaradio.dedications.v1'
  };

  /* ------------------------------------------------------------
     LOCUTORES
     ------------------------------------------------------------
     `genres` y `moods` son afinidades, no reglas absolutas: el
     modo automático suma puntos por género, emoción y hora.
     `palette` sale de la ropa de cada personaje y alimenta las
     variables CSS --dj, --dj-2, --dj-3 y --dj-soft.
     `voiceSlot` reparte las voces del sistema entre los cuatro
     para que no suenen exactamente igual.
     ------------------------------------------------------------ */
  const DJ_PROFILES = {
    xander: {
      name: 'Xander',
      role: 'Locutor · Electrónica',
      tag: '140.1 FM · energía',
      short: 'Electrónica · energía',
      quote: '«Si esto no te mueve, revisa el altavoz.»',
      palette: { accent: '#5fd0ff', accent2: '#ff6a4d', deep: '#14313b' },
      genres: ['electronica', 'synthpop', 'funk', 'pop', 'trap'],
      moods: ['energetic'],
      hours: [6, 7, 8, 9, 10, 11],
      rate: 1.06,
      pitch: 1.04,
      voiceSlot: 0,
      voiceHints: [/jorge|diego|male|hombre|google.*espa/i],
      lines: {
        hello: 'Esto es Java Radio. Aquí Xander. Sube el volumen, que esto despega.',
        dedi: 'Me pasan una dedicatoria{name}: «{message}».{tail}',
        intro: [
          'Esto es Java Radio, 140.1. Aquí Xander. Abrimos con «{next}», de {artist}.',
          'Esto es Java Radio. Soy Xander y esto empieza con «{next}».',
          'Esto es Java Radio, 140.1, sin anuncios. Primer corte: «{next}», de {artist}.'
        ],
        generic: [
          'Sin freno. «{next}», de {artist}.',
          'Esto es Java Radio y esto suena a futuro: «{next}».',
          'Si no te mueve, revisa el altavoz. «{next}».',
          'Corte limpio, entrada directa: «{next}», de {artist}.',
          'La cabina está caliente. «{next}».',
          'Un drop y seguimos: «{next}», de {artist}.',
          'Nada de baladas por ahora. «{next}».',
          'Energía al cien. «{next}».',
          'Esto no es una playlist, es una sacudida: «{next}».',
          'Volumen arriba, dudas abajo. «{next}», de {artist}.'
        ],
        night: [
          'A esta hora el techno también susurra. «{next}».',
          'Los que no duermen merecen un buen bajo. «{next}», de {artist}.'
        ],
        morning: [
          'Buenos días. Café y «{next}», de {artist}.',
          'Arrancamos el motor: «{next}».',
          'Primera hora, primeros graves: «{next}».'
        ],
        afternoon: [
          'Media tarde y seguimos eléctricos. «{next}».',
          'Esto es para terminar la tarde despierto: «{next}», de {artist}.'
        ],
        evening: [
          'Cae la noche y sube el ritmo. «{next}».',
          'Entrada a la noche: «{next}», de {artist}.'
        ]
      }
    },

    sari: {
      name: 'Sari',
      role: 'Locutora · Folk y emoción',
      tag: '140.1 FM · ternura',
      short: 'Folk · emoción',
      quote: '«Bajamos la luz y subimos la ternura.»',
      palette: { accent: '#ffc46b', accent2: '#ff5f8f', deep: '#3a2033' },
      genres: ['folk', 'balada', 'indie', 'acustico', 'rnb', 'country', 'clasica', 'ambient', 'lofi'],
      moods: ['emotional', 'calm'],
      hours: [12, 13, 14, 15, 16, 17, 18, 19, 0, 1, 2, 3, 4, 5],
      rate: 0.94,
      pitch: 1.12,
      voiceSlot: 1,
      voiceHints: [/monica|mónica|paulina|helena|marisol|lucia|lucía|female|mujer/i],
      lines: {
        hello: 'Esto es Java Radio. Aquí Sari. Bajamos la luz y subimos la ternura.',
        dedi: 'Alguien dejó una dedicatoria{name}: «{message}».{tail}',
        intro: [
          'Esto es Java Radio, 140.1. Aquí Sari. Empezamos con «{next}», de {artist}.',
          'Esto es Java Radio. Soy Sari. Quédate, que esto se pone bonito: «{next}».',
          'Esto es Java Radio, 140.1. Abrimos con «{next}», de {artist}.'
        ],
        generic: [
          'Con calma. «{next}», de {artist}.',
          'Esto es para escucharlo con el corazón abierto: «{next}».',
          'Una canción que abraza: «{next}».',
          'Quédate un poco más. «{next}», de {artist}.',
          'Hay temas que no se oyen, se sienten. «{next}».',
          'Silencio alrededor. «{next}».',
          'Te dejo con «{next}». Sin prisa.',
          'Para los que extrañan a alguien: «{next}», de {artist}.',
          'La noche también sabe ser tierna. «{next}».',
          'Un respiro hondo y «{next}», de {artist}.'
        ],
        night: [
          'Son las {hora} y la ciudad duerme. «{next}».',
          'Para trasnochar con compañía: «{next}», de {artist}.',
          'Si estás despierto a esta hora, esto es para ti: «{next}».'
        ],
        morning: [
          'Buenos días, despacio. «{next}», de {artist}.',
          'Primer café y una canción suave: «{next}».'
        ],
        afternoon: [
          'Media tarde, un momento para sentir: «{next}».',
          'Deja lo que estás haciendo y escucha «{next}», de {artist}.'
        ],
        evening: [
          'Cae la tarde y el corazón se pone nostálgico. «{next}».',
          'Atardecer y «{next}», de {artist}.'
        ]
      }
    },

    jai: {
      name: 'Jai',
      role: 'Locutor · Rock e instrumental',
      tag: '140.1 FM · guitarras',
      short: 'Rock · guitarras',
      quote: '«Menos charla, más distorsión.»',
      palette: { accent: '#8fe3c0', accent2: '#ffc46b', deep: '#1d2a22' },
      genres: ['rock', 'metal', 'instrumental', 'jazz', 'clasica', 'blues'],
      moods: ['calm', 'balanced'],
      hours: [0, 1, 2, 3, 4, 5, 20, 21],
      rate: 0.9,
      pitch: 0.88,
      voiceSlot: 2,
      voiceHints: [/jorge|diego|male|hombre|enrique|spanish.*male/i],
      lines: {
        hello: 'Esto es Java Radio. Jai. Menos charla, más distorsión.',
        dedi: 'Dedicatoria{name}: «{message}».{tail}',
        intro: [
          'Esto es Java Radio, 140.1. Jai. «{next}».',
          'Esto es Java Radio. Soy Jai. Empezamos: «{next}», de {artist}.',
          'Esto es Java Radio, 140.1. Menos charla: «{next}».'
        ],
        generic: [
          '«{next}». Siguiente.',
          'Guitarras. «{next}», de {artist}.',
          'Esto no necesita presentación: «{next}».',
          'Sube el volumen. «{next}».',
          'Riff limpio y adelante: «{next}», de {artist}.',
          'Sin adornos: «{next}».',
          'La cabina huele a amplificador. «{next}».',
          'Un instrumental para limpiar la cabeza: «{next}».',
          'Dale. «{next}», de {artist}.',
          'Menos algoritmo, más guitarra. «{next}».'
        ],
        night: [
          'A esta hora el rock suena mejor. «{next}».',
          'Para los insomnes: «{next}», de {artist}.'
        ],
        morning: [
          'Buenos días. «{next}». Y a trabajar.',
          'Café y riff: «{next}», de {artist}.'
        ],
        afternoon: [
          'Tarde de guitarras. «{next}».',
          'Corte instrumental para la tarde: «{next}», de {artist}.'
        ],
        evening: [
          'Última luz y «{next}».',
          'La noche empieza con «{next}», de {artist}.'
        ]
      }
    },

    bry: {
      name: 'Bry',
      role: 'Locutora · Urbano',
      tag: '140.1 FM · flow',
      short: 'Urbano · flow',
      quote: '«La cabina está en modo urbano.»',
      palette: { accent: '#ff5f8f', accent2: '#ffc46b', deep: '#3a1730' },
      genres: ['urbano', 'reggaeton', 'trap', 'hiphop', 'pop', 'latino', 'rnb'],
      moods: ['energetic', 'balanced'],
      hours: [18, 19, 20, 21, 22, 23],
      rate: 1.02,
      pitch: 1.08,
      voiceSlot: 3,
      voiceHints: [/monica|mónica|paulina|helena|marisol|lucia|lucía|female|mujer|google.*espa/i],
      lines: {
        hello: 'Esto es Java Radio. Aquí Bry. La cabina está en modo urbano.',
        dedi: 'Me llega una dedicatoria{name}: «{message}».{tail}',
        intro: [
          'Esto es Java Radio, 140.1. Aquí Bry. Abrimos con «{next}», de {artist}.',
          'Esto es Java Radio. Soy Bry y esto es la cabina urbana. «{next}».',
          'Esto es Java Radio, 140.1. Empezamos con flow: «{next}», de {artist}.'
        ],
        generic: [
          'Flow activo: «{next}», de {artist}.',
          'Esto es barrio, no pasarela: «{next}».',
          'La cabina se mueve: «{next}».',
          'Perreo consciente: «{next}», de {artist}.',
          'Bajo y actitud. «{next}».',
          'No es tendencia, es calle: «{next}».',
          'Dale play mental: «{next}», de {artist}.',
          'Para la noche que empieza: «{next}».',
          'Aquí se baila hasta en la fila: «{next}».',
          'Cambio de flow: «{next}», de {artist}.'
        ],
        night: [
          'La noche es nuestra: «{next}».',
          'A esta hora el barrio suena así: «{next}», de {artist}.'
        ],
        morning: [
          'Buenos días con flow: «{next}».',
          'Arranca el día, pero con actitud: «{next}», de {artist}.'
        ],
        afternoon: [
          'Tarde urbana: «{next}», de {artist}.',
          'Un respiro con sabor: «{next}».'
        ],
        evening: [
          'Entra la noche y esto se pone bueno: «{next}».',
          'Modo urbano activado: «{next}», de {artist}.'
        ]
      }
    }
  };

  /* ------------------------------------------------------------
     FRANJAS HORARIAS Y RECOMENDACIÓN
     ------------------------------------------------------------
     Mañana → energía. Tarde → emoción. Noche → calma.
     La puntuación compara la energía de cada pista con la
     energía objetivo de la franja y premia la emoción adecuada.
     ------------------------------------------------------------ */
  const SLOTS = {
    night: { label: 'Madrugada', badge: 'Madrugada · calma', energy: 24, moods: ['calm', 'emotional'] },
    morning: { label: 'Mañana', badge: 'Mañana · energía', energy: 80, moods: ['energetic', 'balanced'] },
    afternoon: { label: 'Tarde', badge: 'Tarde · emoción', energy: 46, moods: ['emotional', 'calm', 'balanced'] },
    evening: { label: 'Noche', badge: 'Noche · equilibrio', energy: 62, moods: ['balanced', 'energetic', 'emotional'] }
  };

  function slotForHour(hour) {
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 20) return 'afternoon';
    if (hour >= 20) return 'evening';
    return 'night';
  }

  function currentSlot() {
    const key = slotForHour(new Date().getHours());
    return { key, ...SLOTS[key] };
  }

  /* Puntuación estable: la misma pista conserva su sitio durante
     la sesión, pero la cola cambia al cambiar de franja horaria. */
  function recommendationScore(track, slotKey) {
    const spec = SLOTS[slotKey];
    const energy = Number.isFinite(track.energy) ? track.energy : 50;
    let score = 120 - Math.abs(energy - spec.energy);
    if (spec.moods.includes(track.mood)) score += 30;
    if (slotKey === 'afternoon' && track.mood === 'emotional') score += 8;
    if (slotKey === 'morning' && track.mood === 'energetic') score += 8;
    if (slotKey === 'night' && track.mood === 'calm') score += 8;
    score += (hashString(track.id) % 997) / 997 * 6;
    return score;
  }

  /* ------------------------------------------------------------
     ESTADO
     ------------------------------------------------------------ */
  const state = {
    tracks: [],
    order: [],
    index: -1,
    on: false,
    playing: false,
    talking: false,
    shuffle: readBool(STORE.shuffle, false),
    voice: readBool(STORE.voice, true),
    volume: readNumber(STORE.volume, 0.82),
    muted: false,
    mode: 'local',
    recent: [],
    loaded: false,
    breakSeq: 0,
    lastLogged: '',
    playerVisible: true,
    switching: false,
    failures: 0,
    pinned: readPinned(),
    dj: 'xander',
    colors: ['#5fd0ff', '#ff6a4d'],
    lastLine: ''
  };

  let fadeTimer = null;
  let typeTimer = null;
  let toastTimer = null;
  let audioCtx = null;
  let analyser = null;
  let gainNode = null;
  let freqData = null;
  let speechWarned = false;
  let lastSlotKey = currentSlot().key;

  const PLAY_SVG = '<svg viewBox="0 0 24 24" class="icon"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>';
  const EQ_SVG = '<span class="eq"><i></i><i></i><i></i></span>';

  const PALETTES = [
    ['#ff6a4d', '#a99bff'],
    ['#8fe3c0', '#3f8cff'],
    ['#ffc46b', '#ff5f8f'],
    ['#a99bff', '#ff6a4d'],
    ['#5fd0ff', '#b18cff'],
    ['#ff8a5c', '#ffe07a'],
    ['#7ef0c0', '#ff7a9c'],
    ['#c8a6ff', '#5ee0d0'],
    ['#ff5f8f', '#5fd0ff']
  ];

  /* ------------------------------------------------------------
     UTILIDADES
     ------------------------------------------------------------ */
  function readBool(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : value === '1';
    } catch { return fallback; }
  }

  function readNumber(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null || raw === '') return fallback;
      const value = Number(raw);
      return Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback;
    } catch { return fallback; }
  }

  function readPinned() {
    try {
      const value = localStorage.getItem(STORE.pinned);
      return value && (value === 'auto' || DJ_PROFILES[value]) ? value : 'auto';
    } catch { return 'auto'; }
  }

  function store(key, value) {
    try { localStorage.setItem(key, value); } catch { /* modo privado */ }
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const total = Math.floor(seconds);
    const min = Math.floor(total / 60);
    const sec = total % 60;
    return `${min}:${String(sec).padStart(2, '0')}`;
  }

  function hashString(text) {
    let hash = 2166136261;
    const value = String(text || '');
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function shorten(text, max) {
    const value = String(text || '');
    return value.length > max ? `${value.slice(0, max - 1)}…` : value;
  }

  function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  }

  function toast(message, ms = 4200) {
    els.toast.textContent = message;
    els.toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('is-visible'), ms);
  }

  function currentTrack() {
    if (state.index < 0 || !state.order.length) return null;
    return state.tracks[state.order[state.index]] || null;
  }

  function targetVolume() {
    return state.muted ? 0 : state.volume;
  }

  function setOnAir(mode, label) {
    els.onair.dataset.state = mode;
    els.onairLabel.textContent = label;
  }

  function setDjState(text) {
    els.djState.textContent = text;
  }

  function setPlayingUI(playing) {
    state.playing = playing;
    els.body.classList.toggle('is-playing', playing);
    els.playBtn.setAttribute('aria-label', playing ? 'Pausar' : 'Reproducir');
    els.playBtn.title = playing ? 'Pausar' : 'Reproducir';
    els.miniPlay.setAttribute('aria-label', playing ? 'Pausar' : 'Reproducir');
    if ('mediaSession' in navigator) {
      try { navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'; } catch { /* noop */ }
    }
    if (state.talking) return;
    if (playing) {
      setOnAir('live', 'En vivo');
      const track = currentTrack();
      setDjState(track ? `Suena «${shorten(track.title, 34)}»` : 'En vivo');
    } else if (state.on) {
      setOnAir('idle', 'En pausa');
      setDjState('En pausa');
    } else {
      setOnAir('idle', 'Fuera del aire');
      setDjState('En espera');
    }
  }

  function setTalking(talking) {
    state.talking = talking;
    els.body.classList.toggle('is-talking', talking);
    els.djCard.classList.toggle('is-talking', talking);
    els.typing.classList.toggle('is-on', talking);
    if (talking) {
      const profile = DJ_PROFILES[state.dj];
      setOnAir('talking', `${profile.name} al micrófono`);
      setDjState('Al micrófono');
    } else if (state.playing) {
      setOnAir('live', 'En vivo');
      const track = currentTrack();
      setDjState(track ? `Suena «${shorten(track.title, 34)}»` : 'En vivo');
    } else if (state.on) {
      setOnAir('idle', 'En pausa');
      setDjState('En pausa');
    } else {
      setOnAir('idle', 'Fuera del aire');
      setDjState('En espera');
    }
  }

  function showBubble(text) {
    clearInterval(typeTimer);
    els.bubble.textContent = '';
    let i = 0;
    typeTimer = setInterval(() => {
      i += 1;
      els.bubble.textContent = text.slice(0, i);
      if (i >= text.length) clearInterval(typeTimer);
    }, 14);
  }

  /* ------------------------------------------------------------
     VOLUMEN Y FUNDIDOS
     ------------------------------------------------------------
     Si hay AudioContext usamos una GainNode (permite bajar la
     música mientras habla el locutor). Si no, audio.volume.
     ------------------------------------------------------------ */
  function setGain(value) {
    const clamped = Math.max(0, Math.min(1, value));
    clearInterval(fadeTimer);
    if (gainNode && audioCtx) {
      const now = audioCtx.currentTime;
      const param = gainNode.gain;
      if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(now);
      else param.cancelScheduledValues(now);
      param.setValueAtTime(clamped, now);
      return;
    }
    audio.volume = clamped;
  }

  function applyVolume() {
    setGain(targetVolume());
  }

  function fadeTo(target, ms = 600) {
    const clamped = Math.max(0, Math.min(1, target));
    if (gainNode && audioCtx) {
      const now = audioCtx.currentTime;
      const param = gainNode.gain;
      if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(now);
      else param.cancelScheduledValues(now);
      param.linearRampToValueAtTime(clamped, now + Math.max(0.02, ms / 1000));
      return;
    }
    clearInterval(fadeTimer);
    const start = audio.volume;
    const t0 = performance.now();
    fadeTimer = setInterval(() => {
      const k = Math.min(1, (performance.now() - t0) / ms);
      audio.volume = Math.max(0, Math.min(1, start + (clamped - start) * k));
      if (k >= 1) clearInterval(fadeTimer);
    }, 24);
  }

  /* ------------------------------------------------------------
     VOZ: dos motores, ninguno de pago
     ------------------------------------------------------------
     1. speechSynthesis del navegador: local, instantáneo y sin red.
        Se lanza de forma síncrona dentro del clic (antes de
        cualquier await) para no perder el gesto del usuario.
     2. Respaldo en el servidor: /api/tts usa el endpoint público
        de Google Translate TTS. No necesita API key ni pago.
        Solo entra si el motor del navegador no arranca.

     Si ambos fallan, el comentario sigue escrito en el bocadillo.
     ------------------------------------------------------------ */
  let voices = [];
  let ttsSource = null;   // AudioBufferSourceNode del respaldo
  let ttsAbort = null;    // AbortController de /api/tts
  let ttsObjectUrl = '';  // URL temporal si usamos <audio>
  const ttsAudio = new Audio();
  ttsAudio.preload = 'auto';

  function refreshVoices() {
    if (!('speechSynthesis' in window)) return;
    voices = window.speechSynthesis.getVoices() || [];
  }

  if ('speechSynthesis' in window) {
    refreshVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', refreshVoices);
    // En algunos navegadores las voces llegan tarde; reintentamos.
    setTimeout(refreshVoices, 600);
    setTimeout(refreshVoices, 2000);
  }

  function pickVoice(profile) {
    if (!voices.length) refreshVoices();
    const pool = voices.length ? voices : [];
    if (!pool.length) return null;
    const spanish = pool.filter((voice) => /^es([-_]|$)/i.test(voice.lang));
    const usable = spanish.length ? spanish : pool;
    const hinted = usable.find((voice) => profile.voiceHints.some((rx) => rx.test(voice.name)));
    return hinted || usable[profile.voiceSlot % usable.length] || null;
  }

  function cancelSpeech() {
    try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
    if (ttsAbort) {
      try { ttsAbort.abort(); } catch { /* noop */ }
      ttsAbort = null;
    }
    if (ttsSource) {
      try { ttsSource.stop(); } catch { /* noop */ }
      ttsSource = null;
    }
    try { ttsAudio.pause(); } catch { /* noop */ }
    if (ttsObjectUrl) {
      URL.revokeObjectURL(ttsObjectUrl);
      ttsObjectUrl = '';
    }
  }

  /* Motor 1: voces del sistema. Devuelve { ok, reason }. */
  function speakBrowser(text, profile) {
    if (!('speechSynthesis' in window)) {
      return Promise.resolve({ ok: false, reason: 'unsupported' });
    }

    const synth = window.speechSynthesis;
    return new Promise((resolve) => {
      let settled = false;
      let started = false;
      let retried = false;
      let watchdog = null;
      let keepAlive = null;
      let safety = null;

      const finish = (ok, reason) => {
        if (settled) return;
        settled = true;
        clearTimeout(watchdog);
        clearTimeout(safety);
        clearInterval(keepAlive);
        resolve({ ok, reason: reason || (ok ? 'ok' : 'error') });
      };

      const utter = () => {
        try {
          const utterance = new SpeechSynthesisUtterance(text);
          const voice = pickVoice(profile);
          if (voice) utterance.voice = voice;
          utterance.lang = voice?.lang || 'es-ES';
          utterance.rate = profile.rate;
          utterance.pitch = profile.pitch;
          utterance.volume = 1;

          utterance.onstart = () => {
            started = true;
            clearTimeout(watchdog);
            // Chrome puede pausar la síntesis al cambiar de pestaña.
            keepAlive = setInterval(() => {
              if (synth.speaking) synth.resume();
            }, 4000);
          };
          utterance.onend = () => finish(true, 'ok');
          utterance.onerror = (event) => {
            const reason = event.error || 'error';
            // Cambiar de pista cancela la frase: no es un fallo.
            if (reason === 'interrupted' || reason === 'canceled') {
              finish(false, 'interrupted');
              return;
            }
            if (!retried) {
              retried = true;
              setTimeout(utter, 140);
              return;
            }
            finish(false, reason);
          };

          synth.cancel();
          synth.speak(utterance);
          synth.resume();

          // Si en 1,5 s no ha empezado, reintenta una vez. Si sigue
          // mudo, speakText() llama al respaldo del servidor.
          watchdog = setTimeout(() => {
            if (settled || started) return;
            if (!retried) {
              retried = true;
              try { synth.cancel(); } catch { /* noop */ }
              setTimeout(utter, 160);
              watchdog = setTimeout(() => {
                if (!settled && !started) finish(false, 'no-start');
              }, 1500);
            } else {
              finish(false, 'no-start');
            }
          }, 1500);
        } catch {
          finish(false, 'error');
        }
      };

      utter();
      // Red de seguridad: nunca dejamos la música bajada para siempre.
      safety = setTimeout(() => finish(false, 'timeout'), Math.min(32000, 3000 + text.length * 110));
    });
  }

  /* Motor 2: MP3 generado por el servidor. Gratis y sin API key. */
  async function speakServer(text, profile) {
    if (ttsAbort) {
      try { ttsAbort.abort(); } catch { /* noop */ }
    }
    ttsAbort = new AbortController();
    try {
      const res = await fetch(`/api/tts?text=${encodeURIComponent(text)}&lang=es`, {
        signal: ttsAbort.signal,
        cache: 'no-store'
      });
      if (!res.ok) return false;
      const data = await res.arrayBuffer();
      if (!data.byteLength || ttsAbort.signal.aborted) return false;
      return await playTtsBuffer(data, profile);
    } catch {
      return false;
    } finally {
      ttsAbort = null;
    }
  }

  /* Reproduce el MP3 del respaldo. Primero por Web Audio (ya está
     desbloqueado por el clic inicial); si no hay AudioContext,
     usa un <audio> con blob. */
  async function playTtsBuffer(data, profile) {
    if (!audioCtx) initAudio();

    if (audioCtx) {
      try {
        if (audioCtx.state === 'suspended') await audioCtx.resume().catch(() => {});
        const buffer = await audioCtx.decodeAudioData(data.slice(0));
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = Math.max(0.85, Math.min(1.12, profile.rate));
        const gain = audioCtx.createGain();
        gain.gain.value = 1;
        source.connect(gain);
        gain.connect(audioCtx.destination);
        ttsSource = source;

        return await new Promise((resolve) => {
          let done = false;
          const finish = (ok) => {
            if (done) return;
            done = true;
            clearTimeout(limit);
            if (ttsSource === source) ttsSource = null;
            resolve(ok);
          };
          const limit = setTimeout(() => finish(false), (buffer.duration / source.playbackRate.value + 3) * 1000);
          source.onended = () => finish(true);
          try {
            source.start();
          } catch {
            finish(false);
          }
        });
      } catch { /* probamos el elemento <audio> */ }
    }

    return await new Promise((resolve) => {
      const blob = new Blob([data], { type: 'audio/mpeg' });
      ttsObjectUrl = URL.createObjectURL(blob);
      ttsAudio.src = ttsObjectUrl;
      ttsAudio.playbackRate = Math.max(0.85, Math.min(1.12, profile.rate));
      let done = false;
      const cleanup = (ok) => {
        if (done) return;
        done = true;
        clearTimeout(limit);
        ttsAudio.onended = null;
        ttsAudio.onerror = null;
        if (ttsObjectUrl) {
          URL.revokeObjectURL(ttsObjectUrl);
          ttsObjectUrl = '';
        }
        resolve(ok);
      };
      const limit = setTimeout(() => cleanup(false), 30000);
      ttsAudio.onended = () => cleanup(true);
      ttsAudio.onerror = () => cleanup(false);
      ttsAudio.play().catch(() => cleanup(false));
    });
  }

  /* Punto de entrada: navegador primero, servidor después. */
  async function speakText(text, profile) {
    if (!state.voice) return false;

    const browser = await speakBrowser(text, profile);
    if (browser.ok) return true;
    if (browser.reason === 'interrupted' || browser.reason === 'canceled') return false;

    const server = await speakServer(text, profile);
    if (server) return true;

    if (!speechWarned) {
      speechWarned = true;
      toast('La voz del sistema y la de respaldo no respondieron. El comentario queda escrito.', 6000);
    }
    return false;
  }

  /* Desbloquea los motores dentro del gesto del usuario. */
  function primeSpeech() {
    initAudio();
    if (!state.voice) return;
    try {
      const synth = window.speechSynthesis;
      if (synth) {
        synth.resume();
        if (!voices.length) refreshVoices();
      }
    } catch { /* noop */ }
  }

  /* ------------------------------------------------------------
     LOCUTOR ACTIVO Y FONDO DINÁMICO
     ------------------------------------------------------------ */
  function autoDjForHour(hour) {
    const slot = slotForHour(hour);
    if (slot === 'morning') return 'xander';
    if (slot === 'afternoon') return 'sari';
    if (slot === 'evening') return 'bry';
    return 'jai';
  }

  /* Elige locutor para una pista: afinidad de género + emoción +
     hora. En modo fijado devuelve siempre el elegido. */
  function chooseDjForTrack(track) {
    if (state.pinned !== 'auto') return state.pinned;
    const hour = new Date().getHours();
    let best = autoDjForHour(hour);
    let bestScore = -Infinity;

    Object.entries(DJ_PROFILES).forEach(([key, profile]) => {
      let score = 0;
      if (profile.genres.includes(track.genre)) score += 55;
      if (profile.moods.includes(track.mood)) score += 22;
      if (profile.hours.includes(hour)) score += 26;
      if (key === autoDjForHour(hour)) score += 10;
      // Desempate estable por pista para que no baile entre cortes.
      score += (hashString(`${track.id}:${key}`) % 100) / 100 * 4;
      if (score > bestScore) {
        bestScore = score;
        best = key;
      }
    });
    return best;
  }

  function applyDj(key) {
    const profile = DJ_PROFILES[key] || DJ_PROFILES.xander;
    state.dj = DJ_PROFILES[key] ? key : 'xander';
    state.colors = [profile.palette.accent, profile.palette.accent2];

    // Variables CSS que usan .ambient, .dj-card, chips y botones.
    els.body.style.setProperty('--dj', profile.palette.accent);
    els.body.style.setProperty('--dj-2', profile.palette.accent2);
    els.body.style.setProperty('--dj-3', profile.palette.deep);
    els.body.style.setProperty('--dj-soft', hexToRgba(profile.palette.accent, 0.14));

    els.djAvatarUse.setAttribute('href', `#dj-${state.dj}`);
    els.djRole.textContent = profile.role;
    els.djName.textContent = profile.name;
    els.djTag.textContent = profile.tag;
    els.dediDjName.textContent = profile.name;
    els.voiceLabel.textContent = state.voice ? `Voz de ${profile.name}` : `${profile.name} en silencio`;

    // En reposo el bocadillo debe presentar al locutor que tiene el
    // micrófono, no dejar el saludo fijo de otro DJ en el HTML.
    if (!state.playing) {
      els.bubble.textContent = profile.lines.hello;
    }

    updateCrewUI();
  }

  function hexToRgba(hex, alpha) {
    const clean = String(hex).replace('#', '');
    if (clean.length !== 6) return `rgba(255,255,255,${alpha})`;
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function updateCrewUI() {
    const profile = DJ_PROFILES[state.dj];
    [...els.crewGrid.querySelectorAll('.crew-card')].forEach((card) => {
      const key = card.dataset.dj;
      card.setAttribute('aria-pressed', String(state.pinned === key));
      card.classList.toggle('is-active', state.dj === key);
    });
    const auto = state.pinned === 'auto';
    els.autoDjBtn.setAttribute('aria-pressed', String(auto));
    els.autoDjLabel.textContent = auto ? 'Modo automático' : 'Automático apagado';
    els.crewNote.textContent = auto
      ? `Automático: ahora habla ${profile.name} (${currentSlot().label}). La hora y el género deciden.`
      : `${profile.name} tiene el micrófono fijo. Pulsa «Modo automático» para soltarlo.`;
  }

  /* ------------------------------------------------------------
     CATÁLOGO
     ------------------------------------------------------------ */
  async function loadTracks(force = false) {
    const previous = currentTrack();
    const previousId = previous?.id || '';
    els.refreshBtn.disabled = true;
    try {
      const res = await fetch(`/api/tracks${force ? '?refresh=1' : ''}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw Object.assign(new Error(data.error || 'No se pudo cargar la música.'), { hint: data.hint });
      }
      state.tracks = Array.isArray(data.tracks) ? data.tracks : [];
      state.mode = data.mode || 'local';
      state.loaded = true;
      buildOrder(previousId);
      renderQueue();
      updateCounts();
      updateSource();
      updateSmartBadge();
      els.queueEmpty.hidden = state.tracks.length > 0;
      if (!state.tracks.length && data.warnings?.length) els.emptyCopy.textContent = data.warnings[0];
      if (data.warnings?.length && state.tracks.length) toast(data.warnings[0], 7000);
      if (force) toast(state.tracks.length ? 'Selección actualizada.' : 'La carpeta sigue vacía.');
      if (state.on && previousId) {
        const stillThere = state.tracks.some((track) => track.id === previousId);
        if (!stillThere) toast('La pista que sonaba ya no está en la carpeta.');
      }
      // Si no hay nada sonando, el locutor de la hora toma la cabina.
      if (!state.playing && state.pinned === 'auto') applyDj(autoDjForHour(new Date().getHours()));
    } catch (error) {
      state.loaded = true;
      els.queueEmpty.hidden = false;
      els.emptyCopy.textContent = error.hint || error.message || 'Revisa la configuración del servidor.';
      els.heroNote.textContent = 'No pude cargar la selección';
      toast(error.message || 'No se pudo cargar la música.', 6500);
    } finally {
      els.refreshBtn.disabled = false;
    }
  }

  function buildOrder(keepId = '') {
    const all = state.tracks.map((_, index) => index);
    const keepIndex = keepId ? state.tracks.findIndex((track) => track.id === keepId) : -1;

    if (state.shuffle) {
      const rest = all.filter((index) => index !== keepIndex);
      for (let i = rest.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [rest[i], rest[j]] = [rest[j], rest[i]];
      }
      state.order = keepIndex >= 0 ? [keepIndex, ...rest] : rest;
      state.index = keepIndex >= 0 ? 0 : -1;
      return;
    }

    // Orden inteligente: mejor puntuación primero. La pista actual
    // se queda delante para no cortar lo que ya está sonando.
    const slotKey = currentSlot().key;
    const ranked = all.slice().sort((a, b) => {
      const diff = recommendationScore(state.tracks[b], slotKey) - recommendationScore(state.tracks[a], slotKey);
      return diff !== 0 ? diff : a - b;
    });
    if (keepIndex >= 0) {
      state.order = [keepIndex, ...ranked.filter((index) => index !== keepIndex)];
      state.index = 0;
    } else {
      state.order = ranked;
      state.index = -1;
    }
  }

  function updateSource() {
    const drive = state.mode === 'drive';
    els.sourceBadge.textContent = drive ? 'Google Drive' : 'Carpeta local';
    els.heroNote.textContent = drive
      ? 'Música desde Drive · sin descargas'
      : 'Música local · sin descargas';
  }

  function updateCounts() {
    const count = state.tracks.length;
    const label = `${count} ${count === 1 ? 'tema' : 'temas'}`;
    els.trackCount.textContent = label;
    els.queueMeta.textContent = label;
    els.factTracks.textContent = String(count);
  }

  function updateSmartBadge() {
    const slot = currentSlot();
    els.smartBadge.textContent = slot.badge;
    els.smartBadge.title = 'La cola se ordena según la hora: mañana energía, tarde emoción, noche calma.';
  }

  /* ------------------------------------------------------------
     PINTAR
     ------------------------------------------------------------ */
  function renderQueue() {
    els.queue.textContent = '';
    state.order.forEach((trackIndex, position) => {
      const track = state.tracks[trackIndex];
      if (!track) return;
      const li = document.createElement('li');
      li.className = 'queue-row';
      li.dataset.pos = String(position);
      li.tabIndex = 0;
      li.setAttribute('role', 'button');
      li.setAttribute('aria-label', `Reproducir ${track.title}, de ${track.artist}`);

      const num = document.createElement('span');
      num.className = 'q-num';
      num.textContent = String(position + 1).padStart(2, '0');

      const main = document.createElement('span');
      main.className = 'q-main';
      const title = document.createElement('span');
      title.className = 'q-title';
      title.textContent = track.title;
      const sub = document.createElement('span');
      sub.className = 'q-sub';
      sub.textContent = `${track.artist} · ${track.genreLabel || 'Sin género'} · ${track.moodLabel || 'Equilibrada'}`;
      main.append(title, sub);

      const energy = document.createElement('span');
      energy.className = 'q-energy';
      energy.title = `Energía estimada: ${Math.round(track.energy || 0)}/100`;
      energy.textContent = String(Math.round(track.energy || 0));

      const stateIcon = document.createElement('span');
      stateIcon.className = 'q-state';
      stateIcon.innerHTML = PLAY_SVG;

      li.append(num, main, energy, stateIcon);
      els.queue.append(li);
    });
    updateQueueCurrent();
  }

  function updateQueueCurrent() {
    const current = currentTrack();
    [...els.queue.children].forEach((li, position) => {
      const track = state.tracks[state.order[position]];
      const isCurrent = Boolean(current && track === current);
      li.classList.toggle('is-current', isCurrent);
      const stateIcon = li.querySelector('.q-state');
      if (stateIcon) stateIcon.innerHTML = isCurrent ? EQ_SVG : PLAY_SVG;
      if (isCurrent) li.setAttribute('aria-current', 'true');
      else li.removeAttribute('aria-current');
    });
  }

  function renderTrackTags(track) {
    els.trackTags.textContent = '';
    const items = [];
    if (track.genreLabel) items.push({ text: track.genreLabel, cls: 'chip chip-genre' });
    if (track.moodLabel) items.push({ text: track.moodLabel, cls: 'chip chip-mood' });
    if (Number.isFinite(track.energy)) {
      items.push({ text: `Energía ${Math.round(track.energy)}`, cls: 'chip chip-energy' });
    }
    const estimated = track.classification === 'estimated';
    items.forEach((item) => {
      const span = document.createElement('span');
      span.className = item.cls;
      span.textContent = item.text;
      if (estimated) {
        span.classList.add('is-estimated');
        span.title = 'Clasificación estimada a partir del nombre del archivo. Añade etiquetas ID3 o «[genero]» al nombre para afinarla.';
      }
      els.trackTags.append(span);
    });
  }

  function renderNow(track) {
    if (!track) return;
    // El locutor se decide por pista (modo automático) o se respeta
    // el que el oyente haya fijado.
    applyDj(chooseDjForTrack(track));

    els.trackTitle.textContent = track.title;
    els.trackArtist.textContent = `${track.artist} · ${track.album}`;
    els.nowLabel.textContent = 'Suena ahora';
    els.coverKicker.textContent = track.album || 'Java Radio';
    const letter = (track.title.match(/[a-z0-9áéíóúñ]/i) || ['♪'])[0];
    els.coverLetter.textContent = letter.toUpperCase();
    renderTrackTags(track);

    const palette = PALETTES[hashString(`${track.artist}|${track.title}`) % PALETTES.length];
    els.cover.style.setProperty('--c1', palette[0]);
    els.cover.style.setProperty('--c2', palette[1]);
    els.miniCover.style.setProperty('--c1', palette[0]);
    els.miniCover.style.setProperty('--c2', palette[1]);

    els.coverArt.classList.remove('has-image');
    els.coverArt.style.backgroundImage = '';
    els.cover.classList.remove('has-image');
    if (track.cover) {
      const img = new Image();
      img.onload = () => {
        if (currentTrack() !== track) return;
        els.coverArt.style.backgroundImage = `url("${track.cover}")`;
        els.coverArt.classList.add('has-image');
        els.cover.classList.add('has-image');
        els.miniCover.style.backgroundImage = `url("${track.cover}")`;
      };
      img.onerror = () => { /* se queda el degradado generado */ };
      img.src = track.cover;
    } else {
      els.miniCover.style.backgroundImage = '';
    }

    document.title = `${track.title} · Java Radio 140.1`;
    updateMini();
  }

  function updateMini() {
    const track = currentTrack();
    if (track) {
      els.miniTitle.textContent = track.title;
      els.miniArtist.textContent = track.artist;
    }
  }

  function logRecent(track) {
    if (!track) return;
    if (state.lastLogged === track.id) return;
    state.lastLogged = track.id;
    const now = new Date();
    state.recent.unshift({
      title: track.title,
      artist: track.artist,
      time: now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    });
    state.recent = state.recent.slice(0, 7);
    renderRecent();
  }

  function renderRecent() {
    els.recent.textContent = '';
    if (!state.recent.length) {
      const li = document.createElement('li');
      li.className = 'recent-empty';
      li.textContent = 'Todavía no ha sonado nada.';
      els.recent.append(li);
      els.recentMeta.textContent = '—';
      return;
    }
    state.recent.forEach((item) => {
      const li = document.createElement('li');
      const time = document.createElement('span');
      time.className = 'r-time';
      time.textContent = item.time;
      const title = document.createElement('span');
      title.className = 'r-title';
      title.textContent = item.title;
      const artist = document.createElement('span');
      artist.textContent = ` · ${item.artist}`;
      title.append(artist);
      li.append(time, title);
      els.recent.append(li);
    });
    els.recentMeta.textContent = `${state.recent.length} en esta sesión`;
  }

  /* ------------------------------------------------------------
     DEDICATORIAS (solo localStorage)
     ------------------------------------------------------------ */
  let dedications = [];

  function loadDedications() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE.dedications) || '[]');
      dedications = Array.isArray(raw) ? raw.filter((item) => item && typeof item.message === 'string') : [];
    } catch {
      dedications = [];
    }
    renderDedications();
  }

  function saveDedications() {
    try { localStorage.setItem(STORE.dedications, JSON.stringify(dedications.slice(0, 25))); } catch { /* noop */ }
  }

  function renderDedications() {
    els.dediList.textContent = '';
    dedications.slice(0, 8).forEach((item) => {
      const li = document.createElement('li');
      li.className = `dedi-item${item.read ? ' is-read' : ''}`;
      const head = document.createElement('div');
      head.className = 'dedi-head';
      const name = document.createElement('span');
      name.className = 'dedi-name';
      name.textContent = item.name || 'Anónimo';
      const tag = document.createElement('span');
      tag.className = 'dedi-tag';
      tag.textContent = item.read ? 'Leída' : 'En el buzón';
      head.append(name, tag);
      const msg = document.createElement('p');
      msg.className = 'dedi-msg';
      msg.textContent = item.message;
      li.append(head, msg);
      els.dediList.append(li);
    });
  }

  function takeDedication() {
    if (!state.voice) return null;
    const item = [...dedications].reverse().find((entry) => !entry.read);
    if (!item) return null;
    item.read = true;
    saveDedications();
    renderDedications();
    return item;
  }

  /* ------------------------------------------------------------
     LIBRETOS
     ------------------------------------------------------------ */
  function fillLine(template, next, prev) {
    const now = new Date();
    const hour = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    return template
      .replaceAll('{next}', next?.title || 'la siguiente canción')
      .replaceAll('{artist}', next?.artist || 'un artista independiente')
      .replaceAll('{prev}', prev?.title || 'el tema anterior')
      .replaceAll('{hora}', hour);
  }

  function buildLine(prev, next, intro, profile) {
    const dedication = takeDedication();
    if (dedication) {
      const name = dedication.name ? ` de ${dedication.name}` : '';
      const message = dedication.message.replace(/[\s.]+$/, '');
      const tail = next ? ` Y ahora, «${next.title}», de ${next.artist}.` : '';
      return fillLine(profile.lines.dedi, next, prev)
        .replace('{name}', name)
        .replace('{message}', message)
        .replace('{tail}', tail);
    }

    if (intro) return fillLine(pick(profile.lines.intro), next, prev);

    const slot = currentSlot().key;
    const pool = [...profile.lines.generic, ...(profile.lines[slot] || [])];
    const usable = pool.filter((template) => !template.includes('{prev}') || prev);
    let chosen = fillLine(pick(usable), next, prev);
    for (let attempt = 0; attempt < 8 && chosen === state.lastLine; attempt += 1) {
      chosen = fillLine(pick(usable), next, prev);
    }
    state.lastLine = chosen;
    return chosen;
  }

  /* ------------------------------------------------------------
     REPRODUCCIÓN
     ------------------------------------------------------------ */
  function nextPosition() {
    if (!state.order.length) return -1;
    if (state.index < 0) return 0;
    return (state.index + 1) % state.order.length;
  }

  function previousPosition() {
    if (!state.order.length) return -1;
    if (state.index < 0) return 0;
    return (state.index - 1 + state.order.length) % state.order.length;
  }

  async function transitionTo(position, options = {}) {
    const { announce = false, intro = false } = options;
    if (position < 0 || !state.tracks.length) return;
    const track = state.tracks[state.order[position]];
    if (!track) return;

    const my = ++state.breakSeq;
    cancelSpeech();
    setTalking(false);
    const previous = currentTrack();
    state.index = position;
    state.switching = true;
    renderNow(track);
    updateQueueCurrent();
    updateMini();

    const profile = DJ_PROFILES[state.dj];
    const line = announce ? buildLine(previous, track, intro, profile) : '';
    if (line) showBubble(line);

    audio.src = track.stream;
    setGain(0);

    /* IMPORTANTE: la voz arranca aquí, de forma síncrona, antes de
       cualquier await. Es la diferencia entre oír al locutor o solo
       leer el bocadillo. */
    let speechPromise = Promise.resolve(false);
    if (announce && line) {
      if (state.voice) {
        setTalking(true);
        speechPromise = speakText(line, profile);
        fadeTo(Math.min(targetVolume(), 0.14), 500);
      }
    }

    try {
      await audio.play();
    } catch {
      cancelSpeech();
      setTalking(false);
      if (my === state.breakSeq) {
        state.switching = false;
        setPlayingUI(false);
        toast('El navegador no me deja arrancar. Pulsa play otra vez.');
      }
      return;
    }
    if (my !== state.breakSeq) return;

    state.switching = false;
    state.failures = 0;
    logRecent(track);
    updateMediaSession(track);
    setPlayingUI(true);

    if (!announce) {
      fadeTo(targetVolume(), 500);
      return;
    }

    const spoke = await speechPromise;
    if (my !== state.breakSeq) return;
    if (state.voice && !spoke) {
      toast('La voz del sistema no respondió. El comentario queda escrito.', 5000);
    }
    setTalking(false);
    fadeTo(targetVolume(), 900);
  }

  async function resume() {
    if (!state.on) return togglePower();
    if (!audio.src) return;
    try {
      await audio.play();
      fadeTo(targetVolume(), 600);
    } catch {
      toast('No pude reanudar la reproducción.');
    }
  }

  function pause() {
    state.breakSeq += 1;
    cancelSpeech();
    setTalking(false);
    audio.pause();
    clearInterval(fadeTimer);
    setPlayingUI(false);
  }

  async function togglePower() {
    if (!state.on) {
      if (!state.loaded) {
        toast('Espera un segundo, estoy cargando la selección.');
        return;
      }
      if (!state.tracks.length) {
        toast('No hay música todavía. Revisa la carpeta de Drive o musica/.');
        return;
      }
      state.on = true;
      els.body.classList.add('is-on');
      els.powerLabel.textContent = 'Apagar la radio';
      initAudio();
      primeSpeech();
      syncMini();
      if (state.index >= 0 && audio.src) {
        await resume();
      } else {
        await transitionTo(0, { announce: true, intro: true });
      }
    } else {
      state.on = false;
      state.breakSeq += 1;
      cancelSpeech();
      setTalking(false);
      audio.pause();
      clearInterval(fadeTimer);
      els.body.classList.remove('is-on');
      els.powerLabel.textContent = 'Encender la radio';
      setPlayingUI(false);
      setOnAir('idle', 'Fuera del aire');
      setDjState('En espera');
      showBubble('Radio apagada. Aquí estaré cuando quieras volver.');
      syncMini();
    }
  }

  function initAudio() {
    if (audioCtx) {
      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
      return;
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtx = new Ctx();
      const source = audioCtx.createMediaElementSource(audio);
      gainNode = audioCtx.createGain();
      gainNode.gain.value = targetVolume();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.82;
      source.connect(gainNode);
      gainNode.connect(analyser);
      analyser.connect(audioCtx.destination);
      audio.volume = 1;
      freqData = new Uint8Array(analyser.frequencyBinCount);
    } catch {
      analyser = null;
      gainNode = null;
      audio.volume = targetVolume();
    }
  }

  /* ------------------------------------------------------------
     MEDIA SESSION (pantalla de bloqueo / teclas del sistema)
     ------------------------------------------------------------ */
  function updateMediaSession(track) {
    if (!('mediaSession' in navigator) || !track) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: `${track.album} · Java Radio 140.1`,
        artwork: track.cover ? [{ src: track.cover, sizes: '512x512' }] : []
      });
      navigator.mediaSession.setActionHandler('play', () => resume());
      navigator.mediaSession.setActionHandler('pause', () => pause());
      navigator.mediaSession.setActionHandler('nexttrack', () => transitionTo(nextPosition()));
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        if (audio.currentTime > 3) audio.currentTime = 0;
        else transitionTo(previousPosition());
      });
    } catch { /* noop */ }
  }

  /* ------------------------------------------------------------
     VISUALIZADOR
     ------------------------------------------------------------ */
  const vizCtx = els.viz.getContext('2d');
  let vizWidth = 0;
  let vizHeight = 0;
  let vizDpr = 1;

  function sizeCanvas() {
    const rect = els.viz.getBoundingClientRect();
    vizDpr = Math.min(2, window.devicePixelRatio || 1);
    vizWidth = Math.max(1, rect.width);
    vizHeight = Math.max(1, rect.height);
    els.viz.width = Math.floor(vizWidth * vizDpr);
    els.viz.height = Math.floor(vizHeight * vizDpr);
  }

  function drawViz(time) {
    requestAnimationFrame(drawViz);
    if (!vizWidth || !vizHeight) sizeCanvas();
    const ctx = vizCtx;
    ctx.setTransform(vizDpr, 0, 0, vizDpr, 0, 0);
    ctx.clearRect(0, 0, vizWidth, vizHeight);

    const bars = 46;
    const gap = 3;
    const barWidth = Math.max(1.5, (vizWidth - gap * (bars - 1)) / bars);
    const mid = vizHeight * 0.5;
    const gradient = ctx.createLinearGradient(0, 0, vizWidth, 0);
    gradient.addColorStop(0, state.colors[0]);
    gradient.addColorStop(0.55, state.colors[0]);
    gradient.addColorStop(1, state.colors[1]);
    ctx.fillStyle = gradient;

    if (analyser && freqData) analyser.getByteFrequencyData(freqData);

    for (let i = 0; i < bars; i += 1) {
      let value;
      if (analyser && state.playing) {
        const index = Math.floor(Math.pow(i / bars, 1.45) * freqData.length * 0.95);
        value = (freqData[index] || 0) / 255;
        value = Math.pow(value, 0.72) * (0.7 + 1.05 * (i / bars));
        value = Math.min(1, value * 1.05 + 0.03);
      } else if (state.playing) {
        value = 0.12 + 0.28 * Math.abs(Math.sin(time / 520 + i * 0.42));
      } else {
        value = 0.035 + 0.05 * Math.abs(Math.sin(time / 1400 + i * 0.3));
      }
      const height = Math.max(2, value * vizHeight * 0.92);
      const x = i * (barWidth + gap);
      const y = mid - height / 2;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, barWidth, height, Math.min(barWidth / 2, 3));
      else ctx.rect(x, y, barWidth, height);
      ctx.fill();
    }
  }

  /* ------------------------------------------------------------
     PROGRESO Y MINI REPRODUCTOR
     ------------------------------------------------------------ */
  let dragging = false;

  function updateTimeline() {
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    const position = Number.isFinite(audio.currentTime) ? audio.currentTime : 0;
    els.curTime.textContent = formatTime(position);
    els.durTime.textContent = formatTime(duration);
    const ratio = duration > 0 ? Math.min(1, position / duration) : 0;
    els.seek.value = String(Math.round(ratio * 1000));
    els.seek.style.setProperty('--p', `${(ratio * 100).toFixed(2)}%`);
    if ('mediaSession' in navigator && duration > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration,
          playbackRate: 1,
          position: Math.min(position, duration)
        });
      } catch { /* noop */ }
    }
  }

  function syncMini() {
    const visible = state.on && !state.playerVisible;
    els.mini.classList.toggle('is-visible', visible);
    els.mini.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }

  /* ------------------------------------------------------------
     FIJAR LOCUTOR / MODO AUTOMÁTICO
     ------------------------------------------------------------ */
  function pinDj(key) {
    if (!DJ_PROFILES[key]) return;
    state.pinned = key;
    store(STORE.pinned, key);
    applyDj(key);
    const profile = DJ_PROFILES[key];
    // `hello` es una frase única, no una lista: no pasa por pick().
    const line = profile.lines.hello;
    showBubble(line);
    toast(`${profile.name} toma el micrófono.`);

    // Breve prueba de voz para que se oiga al locutor elegido.
    if (state.voice) {
      primeSpeech();
      setTalking(true);
      const ducked = state.playing;
      if (ducked) fadeTo(Math.min(targetVolume(), 0.16), 400);
      speakText(line, profile).then(() => {
        setTalking(false);
        if (ducked) fadeTo(targetVolume(), 650);
      });
    }
  }

  function enableAuto() {
    state.pinned = 'auto';
    store(STORE.pinned, 'auto');
    const key = currentTrack() ? chooseDjForTrack(currentTrack()) : autoDjForHour(new Date().getHours());
    applyDj(key);
    toast('Modo automático: la hora y el género eligen locutor.');
  }

  /* ------------------------------------------------------------
     EVENTOS
     ------------------------------------------------------------ */
  els.powerBtn.addEventListener('click', togglePower);

  els.playBtn.addEventListener('click', () => {
    if (!state.on) return togglePower();
    if (audio.paused) resume();
    else pause();
  });

  els.miniPlay.addEventListener('click', () => {
    if (audio.paused) resume();
    else pause();
  });

  els.nextBtn.addEventListener('click', () => {
    if (!state.on) return togglePower();
    transitionTo(nextPosition());
  });

  els.prevBtn.addEventListener('click', () => {
    if (!state.on) return togglePower();
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    transitionTo(previousPosition());
  });

  els.shuffleBtn.addEventListener('click', () => {
    state.shuffle = !state.shuffle;
    store(STORE.shuffle, state.shuffle ? '1' : '0');
    els.shuffleBtn.setAttribute('aria-pressed', String(state.shuffle));
    const currentId = currentTrack()?.id || '';
    buildOrder(currentId);
    renderQueue();
    toast(state.shuffle ? 'Orden aleatorio activado.' : 'Volvemos a la recomendación por hora.');
  });

  els.muteBtn.addEventListener('click', () => {
    state.muted = !state.muted;
    els.body.classList.toggle('is-muted', state.muted);
    applyVolume();
    els.muteBtn.setAttribute('aria-label', state.muted ? 'Quitar silencio' : 'Silenciar');
  });

  els.volume.addEventListener('input', () => {
    const value = Number(els.volume.value) / 100;
    state.volume = value;
    state.muted = value === 0;
    els.body.classList.toggle('is-muted', state.muted);
    els.muteBtn.setAttribute('aria-label', state.muted ? 'Quitar silencio' : 'Silenciar');
    els.volume.style.setProperty('--p', `${value * 100}%`);
    if (!state.talking) applyVolume();
    store(STORE.volume, String(value));
  });

  els.seek.addEventListener('input', () => {
    dragging = true;
    if (!Number.isFinite(audio.duration) || audio.duration <= 0) return;
    const position = (Number(els.seek.value) / 1000) * audio.duration;
    audio.currentTime = position;
    els.curTime.textContent = formatTime(position);
    els.seek.style.setProperty('--p', `${(Number(els.seek.value) / 10).toFixed(2)}%`);
  });
  els.seek.addEventListener('change', () => { dragging = false; });

  els.voiceBtn.addEventListener('click', () => {
    state.voice = !state.voice;
    store(STORE.voice, state.voice ? '1' : '0');
    els.voiceBtn.setAttribute('aria-pressed', String(state.voice));
    const profile = DJ_PROFILES[state.dj];
    els.voiceLabel.textContent = state.voice ? `Voz de ${profile.name}` : `${profile.name} en silencio`;
    if (!state.voice) {
      cancelSpeech();
      setTalking(false);
      if (state.playing) fadeTo(targetVolume(), 500);
      toast('El locutor seguirá escribiendo, pero no hablará.');
    } else {
      primeSpeech();
      const line = `Voz activada. Aquí ${profile.name}.`;
      showBubble(line);
      setTalking(true);
      speakText(line, profile).then(() => {
        setTalking(false);
        if (state.playing) fadeTo(targetVolume(), 500);
      });
      toast(`Voz de ${profile.name} activada.`);
    }
  });

  els.crewGrid.addEventListener('click', (event) => {
    const card = event.target.closest('.crew-card');
    if (!card) return;
    pinDj(card.dataset.dj);
  });

  els.autoDjBtn.addEventListener('click', () => {
    if (state.pinned === 'auto') {
      toast('Ya estás en modo automático.');
      return;
    }
    enableAuto();
  });

  els.queue.addEventListener('click', (event) => {
    const row = event.target.closest('.queue-row');
    if (!row) return;
    const position = Number(row.dataset.pos);
    if (!Number.isFinite(position)) return;
    if (!state.on) {
      state.on = true;
      els.body.classList.add('is-on');
      els.powerLabel.textContent = 'Apagar la radio';
      initAudio();
      primeSpeech();
      syncMini();
    }
    transitionTo(position);
  });

  els.queue.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = event.target.closest('.queue-row');
    if (!row) return;
    event.preventDefault();
    row.click();
  });

  els.refreshBtn.addEventListener('click', () => loadTracks(true));
  els.retryBtn.addEventListener('click', () => loadTracks(true));

  els.dediForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const message = els.dediMsg.value.trim();
    if (!message) {
      els.dediMsg.focus();
      return;
    }
    dedications.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: els.dediName.value.trim().slice(0, 28),
      message: message.slice(0, 160),
      read: false,
      at: Date.now()
    });
    dedications = dedications.slice(0, 25);
    saveDedications();
    renderDedications();
    els.dediMsg.value = '';
    els.dediName.value = '';
    toast(`Dedicatoria en el buzón. ${DJ_PROFILES[state.dj].name} la leerá en el próximo corte.`, 5000);
  });

  audio.addEventListener('loadedmetadata', updateTimeline);
  audio.addEventListener('durationchange', updateTimeline);
  audio.addEventListener('timeupdate', () => { if (!dragging) updateTimeline(); });
  audio.addEventListener('play', () => setPlayingUI(true));
  audio.addEventListener('playing', () => setPlayingUI(true));
  audio.addEventListener('pause', () => {
    if (audio.ended) return;
    setPlayingUI(false);
  });
  audio.addEventListener('waiting', () => {
    if (state.on) setDjState('Cargando el tema…');
  });

  audio.addEventListener('ended', () => {
    if (!state.on) return;
    setPlayingUI(false);
    transitionTo(nextPosition(), { announce: true });
  });

  audio.addEventListener('error', async () => {
    if (!state.on || !audio.src || state.switching) return;
    state.failures += 1;
    if (state.failures > 2) {
      state.failures = 0;
      setPlayingUI(false);
      toast('Esa pista no se puede reproducir. Prueba con otra.', 6000);
      return;
    }
    const currentId = currentTrack()?.id || '';
    toast('El enlace caducó. Renovando la sesión…', 4000);
    await loadTracks(true);
    const track = state.tracks.find((item) => item.id === currentId);
    if (!track) return;
    const position = state.order.findIndex((index) => state.tracks[index] === track);
    if (position < 0) return;
    state.index = position;
    audio.src = track.stream;
    audio.play().then(() => fadeTo(targetVolume(), 500)).catch(() => {});
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && audioCtx?.state === 'suspended' && state.playing) {
      audioCtx.resume().catch(() => {});
    }
  });

  /* ------------------------------------------------------------
     PROTECCIÓN DISUASORIA
     ------------------------------------------------------------
     No es DRM: una web abierta siempre se puede inspeccionar.
     Solo evitamos el botón derecho, el arrastre del audio y los
     atajos más obvios. El audio real vive en el servidor.
     ------------------------------------------------------------ */
  document.addEventListener('contextmenu', (event) => {
    if (event.target instanceof Element && event.target.closest('input, textarea')) return;
    event.preventDefault();
    toast('El reproductor no tiene menú: el audio no está para descargar.', 2600);
  });

  document.addEventListener('dragstart', (event) => {
    if (event.target instanceof Element && event.target.closest('img, .cover, audio, .queue-row')) event.preventDefault();
  });

  document.addEventListener('keydown', (event) => {
    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    const blocked = event.key === 'F12'
      || (mod && event.shiftKey && ['i', 'j', 'c'].includes(key))
      || (mod && !event.shiftKey && ['u', 's'].includes(key));
    if (blocked) {
      event.preventDefault();
      toast('La cabina se queda en la cabina: el código y el audio no se abren desde aquí.', 2600);
      return;
    }

    if (event.target instanceof Element && event.target.closest('input, textarea')) return;
    if (event.code === 'Space') {
      event.preventDefault();
      if (!state.on) togglePower();
      else if (audio.paused) resume();
      else pause();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 10);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      audio.currentTime = Math.max(0, audio.currentTime - 10);
    } else if (key === 'n' && state.on) {
      transitionTo(nextPosition());
    } else if (key === 'p' && state.on) {
      transitionTo(previousPosition());
    } else if (key === 'm') {
      els.muteBtn.click();
    }
  });

  /* ------------------------------------------------------------
     ARRANQUE
     ------------------------------------------------------------ */
  function boot() {
    els.volume.value = String(Math.round(state.volume * 100));
    els.volume.style.setProperty('--p', `${state.volume * 100}%`);
    audio.volume = targetVolume();
    els.shuffleBtn.setAttribute('aria-pressed', String(state.shuffle));
    els.voiceBtn.setAttribute('aria-pressed', String(state.voice));
    els.body.classList.toggle('is-muted', state.muted);
    els.muteBtn.setAttribute('aria-label', state.muted ? 'Quitar silencio' : 'Silenciar');
    setOnAir('idle', 'Fuera del aire');

    // Locutor inicial: el fijado o el que toque por la hora.
    applyDj(state.pinned === 'auto' ? autoDjForHour(new Date().getHours()) : state.pinned);
    updateCrewUI();

    const tick = () => {
      els.clock.textContent = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    };
    tick();
    setInterval(tick, 15000);

    // Cada minuto comprobamos si cambió la franja horaria. Si no
    // está sonando nada, reordenamos la cola con la nueva energía.
    setInterval(() => {
      const slot = currentSlot();
      if (slot.key === lastSlotKey) return;
      lastSlotKey = slot.key;
      updateSmartBadge();
      if (state.pinned === 'auto' && !state.playing) applyDj(autoDjForHour(new Date().getHours()));
      if (!state.playing) {
        buildOrder(currentTrack()?.id || '');
        renderQueue();
      }
    }, 30000);

    sizeCanvas();
    if ('ResizeObserver' in window) new ResizeObserver(sizeCanvas).observe(els.viz);
    else window.addEventListener('resize', sizeCanvas);
    requestAnimationFrame(drawViz);

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        state.playerVisible = entries[0]?.isIntersecting ?? true;
        syncMini();
      }, { threshold: 0.08 });
      observer.observe($('#player'));
    }

    loadDedications();
    renderRecent();
    updateSmartBadge();
    loadTracks();

    const params = new URLSearchParams(location.search);
    if (params.get('play') === '1') {
      // Puede fallar si el navegador exige clic; el botón sigue ahí.
      setTimeout(() => { if (!state.on) togglePower(); }, 700);
    }
  }

  boot();
})();
