#!/usr/bin/env node
/* ============================================================
   Genera cuatro temas instrumentales de prueba en musica/.
   WAV mono 22.05 kHz, sintetizado a mano. Sin dependencias.
   ============================================================ */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const SR = 22050;
const DURATION = 26;
const OUT_DIR = path.join(__dirname, '..', 'musica');

const CHORDS = {
  Am7: [220.0, 261.63, 329.63, 392.0],
  Fmaj7: [174.61, 220.0, 261.63, 329.63],
  Cmaj7: [261.63, 329.63, 392.0, 493.88],
  G6: [196.0, 246.94, 293.66, 329.63],
  Em7: [164.81, 196.0, 246.94, 293.66],
  Dm7: [146.83, 174.61, 220.0, 261.63]
};

const SCALE = [440.0, 523.25, 587.33, 659.25, 783.99, 880.0];

const TRACKS = [
  {
    file: 'Lott Campuzano - Medianoche en la cabina [lofi].wav',
    progression: ['Am7', 'Fmaj7', 'Cmaj7', 'G6'],
    step: 0.36,
    crackle: 0.0005,
    brightness: 0.24,
    seed: 11
  },
  {
    file: 'Lott Campuzano - Cinta de verano [indie].wav',
    progression: ['Cmaj7', 'Am7', 'Fmaj7', 'G6'],
    step: 0.26,
    crackle: 0.0003,
    brightness: 0.34,
    seed: 27
  },
  {
    file: 'Lott Campuzano - Lluvia sobre el dial [ambient].wav',
    progression: ['Am7', 'Em7', 'Fmaj7', 'G6'],
    step: 0.44,
    crackle: 0.0011,
    brightness: 0.16,
    seed: 43
  },
  {
    file: 'Lott Campuzano - Última llamada [rock].wav',
    progression: ['Fmaj7', 'G6', 'Em7', 'Am7'],
    step: 0.31,
    crackle: 0.0006,
    brightness: 0.2,
    seed: 59
  }
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smooth(x) {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
}

function synth(track) {
  const total = Math.floor(SR * DURATION);
  const buffer = new Float32Array(total);
  const random = mulberry32(track.seed);
  const barLength = DURATION / track.progression.length;

  // --- pads y bajo por compás ---------------------------------
  track.progression.forEach((name, bar) => {
    const chord = CHORDS[name];
    const start = bar * barLength;
    const end = start + barLength;
    const startSample = Math.floor(start * SR);
    const endSample = Math.min(total, Math.floor(end * SR));

    for (let i = startSample; i < endSample; i += 1) {
      const t = i / SR;
      const local = t - start;
      const env = smooth(local / 1.4) * smooth((barLength - local) / 1.1);
      const tremolo = 0.86 + 0.14 * Math.sin(2 * Math.PI * 0.11 * t + bar);
      let pad = 0;
      for (let n = 0; n < chord.length; n += 1) {
        const frequency = chord[n] * 0.5;
        const detune = 1 + (n % 2 === 0 ? 0.0015 : -0.0015);
        pad += Math.sin(2 * Math.PI * frequency * t);
        pad += Math.sin(2 * Math.PI * frequency * detune * t + n) * 0.7;
      }
      pad /= chord.length * 1.7;
      const bass = Math.sin(2 * Math.PI * (chord[0] / 4) * t) * 0.28;
      buffer[i] += (pad * track.brightness + bass * 0.32) * env * tremolo;
    }
  });

  // --- melodía de campanillas ---------------------------------
  let step = 0;
  for (let t = 1.2; t < DURATION - 2; t += track.step) {
    step += 1;
    if (random() < 0.28) continue;
    const chord = CHORDS[track.progression[Math.floor(t / barLength) % track.progression.length]];
    const useChordTone = random() < 0.45;
    let frequency;
    if (useChordTone) {
      frequency = chord[Math.floor(random() * chord.length)] * (random() < 0.4 ? 2 : 1);
    } else {
      frequency = SCALE[Math.floor(random() * SCALE.length)];
    }
    const startSample = Math.floor(t * SR);
    const length = Math.floor(SR * 0.55);
    const gain = 0.075 + random() * 0.035;
    for (let i = 0; i < length && startSample + i < total; i += 1) {
      const local = i / SR;
      const env = Math.exp(-local * 6.5) * smooth(local / 0.012);
      const value = Math.sin(2 * Math.PI * frequency * local)
        + 0.28 * Math.sin(2 * Math.PI * frequency * 2 * local)
        + 0.12 * Math.sin(2 * Math.PI * frequency * 3 * local);
      buffer[startSample + i] += value * env * gain;
    }
    if (step % 7 === 0) {
      // pequeña respuesta una octava abajo
      const echoStart = startSample + Math.floor(SR * track.step * 0.5);
      for (let i = 0; i < length && echoStart + i < total; i += 1) {
        const local = i / SR;
        const env = Math.exp(-local * 7) * smooth(local / 0.015);
        buffer[echoStart + i] += Math.sin(2 * Math.PI * (frequency / 2) * local) * env * gain * 0.45;
      }
    }
  }

  // --- vinilo y aire ------------------------------------------
  let hiss = 0;
  for (let i = 0; i < total; i += 1) {
    hiss = hiss * 0.92 + (random() * 2 - 1) * 0.08;
    buffer[i] += hiss * 0.014;
    if (random() < track.crackle) {
      const pop = (random() * 2 - 1) * 0.09;
      const tail = Math.floor(SR * 0.02);
      for (let j = 0; j < tail && i + j < total; j += 1) {
        buffer[i + j] += pop * Math.exp(-j / (SR * 0.004));
      }
    }
  }

  // --- fundidos y normalización -------------------------------
  const fadeIn = Math.floor(SR * 1.6);
  const fadeOut = Math.floor(SR * 3.2);
  for (let i = 0; i < total; i += 1) {
    if (i < fadeIn) buffer[i] *= smooth(i / fadeIn);
    if (i > total - fadeOut) buffer[i] *= smooth((total - i) / fadeOut);
  }

  let peak = 0;
  for (let i = 0; i < total; i += 1) peak = Math.max(peak, Math.abs(buffer[i]));
  const scale = peak > 0 ? 0.78 / peak : 1;
  for (let i = 0; i < total; i += 1) buffer[i] *= scale;
  return buffer;
}

function wavBuffer(samples) {
  const bytes = samples.length * 2;
  const out = Buffer.alloc(44 + bytes);
  out.write('RIFF', 0);
  out.writeUInt32LE(36 + bytes, 4);
  out.write('WAVE', 8);
  out.write('fmt ', 12);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(SR, 24);
  out.writeUInt32LE(SR * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write('data', 36);
  out.writeUInt32LE(bytes, 40);
  for (let i = 0; i < samples.length; i += 1) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    out.writeInt16LE(Math.round(value * 32767), 44 + i * 2);
  }
  return out;
}

fs.mkdirSync(OUT_DIR, { recursive: true });
for (const track of TRACKS) {
  const target = path.join(OUT_DIR, track.file);
  process.stdout.write(`· ${track.file} … `);
  const samples = synth(track);
  fs.writeFileSync(target, wavBuffer(samples));
  const size = (fs.statSync(target).size / 1024 / 1024).toFixed(1);
  console.log(`${size} MB`);
}
console.log('\nListo. Cuatro temas de prueba en musica/.\n');
