/**
 * Procedural Ambient Sound Engine using Web Audio API.
 * Synthesizes realistic, non-repeating Rain, Fireplace, Ocean Waves, Thunder, Wind,
 * Stream, Forest Night, Cafe, Vinyl, and Noise in real-time.
 * 100% offline, requires 0 MB audio downloads.
 */

import { logger } from '../logger';

export type AmbientSoundType = 
  | 'rain' 
  | 'thunder' 
  | 'fire' 
  | 'wind' 
  | 'stream' 
  | 'waves' 
  | 'forest' 
  | 'cafe' 
  | 'vinyl' 
  | 'brown' 
  | 'white';

export interface AmbientSoundTrack {
  id: AmbientSoundType;
  name: string;
  category: 'nature' | 'cozy' | 'focus';
  icon: string;
  enabled: boolean;
  volume: number; // 0.0 to 1.0
}

class SoundscapeEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isRunning = false;

  // Active audio nodes per track
  private activeTracks: Map<
    AmbientSoundType,
    {
      gainNode: GainNode;
      stopNodes: () => void;
    }
  > = new Map();

  private initContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.7, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  public setMasterVolume(volume: number) {
    this.initContext();
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(Math.max(0, Math.min(1, volume)), this.ctx.currentTime, 0.05);
    }
  }

  public setTrackVolume(type: AmbientSoundType, volume: number) {
    this.initContext();
    const track = this.activeTracks.get(type);
    if (track && this.ctx) {
      track.gainNode.gain.setTargetAtTime(Math.max(0, Math.min(1, volume)), this.ctx.currentTime, 0.05);
    }
  }

  public startTrack(type: AmbientSoundType, initialVolume = 0.5) {
    this.initContext();
    if (!this.ctx || !this.masterGain) return;

    if (this.activeTracks.has(type)) {
      this.setTrackVolume(type, initialVolume);
      return;
    }

    const trackGain = this.ctx.createGain();
    trackGain.gain.setValueAtTime(initialVolume, this.ctx.currentTime);
    trackGain.connect(this.masterGain);

    let stopNodes: () => void = () => {};

    switch (type) {
      case 'rain':
        stopNodes = this.createRainSynthesizer(this.ctx, trackGain);
        break;
      case 'thunder':
        stopNodes = this.createThunderSynthesizer(this.ctx, trackGain);
        break;
      case 'fire':
        stopNodes = this.createFireSynthesizer(this.ctx, trackGain);
        break;
      case 'wind':
        stopNodes = this.createWindSynthesizer(this.ctx, trackGain);
        break;
      case 'stream':
        stopNodes = this.createStreamSynthesizer(this.ctx, trackGain);
        break;
      case 'waves':
        stopNodes = this.createWavesSynthesizer(this.ctx, trackGain);
        break;
      case 'forest':
        stopNodes = this.createForestSynthesizer(this.ctx, trackGain);
        break;
      case 'cafe':
        stopNodes = this.createCafeSynthesizer(this.ctx, trackGain);
        break;
      case 'vinyl':
        stopNodes = this.createVinylSynthesizer(this.ctx, trackGain);
        break;
      case 'brown':
        stopNodes = this.createBrownNoiseSynthesizer(this.ctx, trackGain);
        break;
      case 'white':
        stopNodes = this.createWhiteNoiseSynthesizer(this.ctx, trackGain);
        break;
    }

    this.activeTracks.set(type, { gainNode: trackGain, stopNodes });
    this.isRunning = true;
  }

  public stopTrack(type: AmbientSoundType) {
    const track = this.activeTracks.get(type);
    if (track) {
      track.stopNodes();
      track.gainNode.disconnect();
      this.activeTracks.delete(type);
    }
    if (this.activeTracks.size === 0) {
      this.isRunning = false;
    }
  }

  public stopAll() {
    for (const [type] of this.activeTracks) {
      this.stopTrack(type);
    }
    this.activeTracks.clear();
    this.isRunning = false;
  }

  public getIsRunning() {
    return this.isRunning;
  }

  // -------------------------------------------------------------
  // PROCEDURAL NOISE BUFFERS
  // -------------------------------------------------------------

  /**
   * Generates continuous Pink Noise buffer.
   */
  private createPinkNoiseBuffer(ctx: AudioContext, duration = 5): AudioBuffer {
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.969 * b2 + white * 0.153852;
      b3 = 0.8665 * b3 + white * 0.3104856;
      b4 = 0.55 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.016898;
      data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
      b6 = white * 0.115926;
    }
    return buffer;
  }

  /**
   * Generates continuous Brown Noise buffer.
   */
  private createBrownNoiseBuffer(ctx: AudioContext, duration = 5): AudioBuffer {
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0.0;

    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      data[i] = (lastOut + 0.02 * white) / 1.02;
      lastOut = data[i];
      data[i] *= 3.5; // Gain compensation
    }
    return buffer;
  }

  // -------------------------------------------------------------
  // PROCEDURAL SOUNDSCAPE SYNTHESIZERS
  // -------------------------------------------------------------

  /**
   * Rain: Filtered Pink Noise + Random Droplet Burst Impulses
   */
  private createRainSynthesizer(ctx: AudioContext, destination: GainNode): () => void {
    const pinkBuffer = this.createPinkNoiseBuffer(ctx);
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = pinkBuffer;
    noiseSource.loop = true;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(1400, ctx.currentTime);

    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.setValueAtTime(200, ctx.currentTime);

    noiseSource.connect(lowpass);
    lowpass.connect(highpass);
    highpass.connect(destination);
    noiseSource.start();

    let isDropping = true;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const triggerRaindrop = () => {
      if (!isDropping) return;
      try {
        const osc = ctx.createOscillator();
        const dropGain = ctx.createGain();
        osc.frequency.setValueAtTime(600 + Math.random() * 1200, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.04);

        dropGain.gain.setValueAtTime(0.04 * Math.random(), ctx.currentTime);
        dropGain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.04);

        osc.connect(dropGain);
        dropGain.connect(destination);

        osc.start();
        osc.stop(ctx.currentTime + 0.05);

        const nextDelay = 80 + Math.random() * 350;
        timerId = setTimeout(triggerRaindrop, nextDelay);
      } catch {}
    };
    triggerRaindrop();

    return () => {
      isDropping = false;
      if (timerId) clearTimeout(timerId);
      try { noiseSource.stop(); } catch {}
      noiseSource.disconnect();
    };
  }

  /**
   * Thunderstorm: Low-frequency rolling rumble + audible mid-bass body + rain wash
   */
  private createThunderSynthesizer(ctx: AudioContext, destination: GainNode): () => void {
    const pinkBuffer = this.createPinkNoiseBuffer(ctx);
    const rainSource = ctx.createBufferSource();
    rainSource.buffer = pinkBuffer;
    rainSource.loop = true;

    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'lowpass';
    rainFilter.frequency.setValueAtTime(1200, ctx.currentTime);

    const rainGain = ctx.createGain();
    rainGain.gain.setValueAtTime(0.5, ctx.currentTime);

    rainSource.connect(rainFilter);
    rainFilter.connect(rainGain);
    rainGain.connect(destination);
    rainSource.start();

    let isAlive = true;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const triggerThunder = () => {
      if (!isAlive) return;
      try {
        const brownBuffer = this.createBrownNoiseBuffer(ctx, 5);
        const rumble = ctx.createBufferSource();
        rumble.buffer = brownBuffer;

        // Audible rumble filter (tuned for both laptop speakers and headphones: 140-220 Hz)
        const rumbleFilter = ctx.createBiquadFilter();
        rumbleFilter.type = 'lowpass';
        rumbleFilter.frequency.setValueAtTime(180, ctx.currentTime);
        rumbleFilter.Q.setValueAtTime(2.2, ctx.currentTime);

        const rumbleGain = ctx.createGain();
        const now = ctx.currentTime;
        rumbleGain.gain.setValueAtTime(0.01, now);
        rumbleGain.gain.linearRampToValueAtTime(0.65 + Math.random() * 0.25, now + 0.4);
        rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + 4.2);

        // Sub-bass oscillator for low punch
        const subOsc = ctx.createOscillator();
        const subGain = ctx.createGain();
        subOsc.frequency.setValueAtTime(75, now);
        subOsc.frequency.exponentialRampToValueAtTime(38, now + 2.8);

        subGain.gain.setValueAtTime(0.25, now);
        subGain.gain.exponentialRampToValueAtTime(0.001, now + 2.8);

        subOsc.connect(subGain);
        subGain.connect(destination);
        subOsc.start(now);
        subOsc.stop(now + 2.9);

        rumble.connect(rumbleFilter);
        rumbleFilter.connect(rumbleGain);
        rumbleGain.connect(destination);

        rumble.start(now);
        rumble.stop(now + 4.5);

        const nextDelay = 8000 + Math.random() * 8000;
        timerId = setTimeout(triggerThunder, nextDelay);
      } catch {}
    };

    // Immediate initial thunder roll so the user hears it right away
    timerId = setTimeout(triggerThunder, 150);

    return () => {
      isAlive = false;
      if (timerId) clearTimeout(timerId);
      try { rainSource.stop(); } catch {}
      rainSource.disconnect();
    };
  }

  /**
   * Fireplace: Low rumble + Poisson crackle impulses
   */
  private createFireSynthesizer(ctx: AudioContext, destination: GainNode): () => void {
    const brownBuffer = this.createBrownNoiseBuffer(ctx);
    const roarSource = ctx.createBufferSource();
    roarSource.buffer = brownBuffer;
    roarSource.loop = true;

    const roarFilter = ctx.createBiquadFilter();
    roarFilter.type = 'lowpass';
    roarFilter.frequency.setValueAtTime(400, ctx.currentTime);

    const roarGain = ctx.createGain();
    roarGain.gain.setValueAtTime(0.38, ctx.currentTime);

    roarSource.connect(roarFilter);
    roarFilter.connect(roarGain);
    roarGain.connect(destination);
    roarSource.start();

    let isPopping = true;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const triggerPop = () => {
      if (!isPopping) return;
      try {
        const pop = ctx.createBufferSource();
        const singlePopBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.03), ctx.sampleRate);
        const data = singlePopBuffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.005));
        }
        pop.buffer = singlePopBuffer;

        const popFilter = ctx.createBiquadFilter();
        popFilter.type = 'highpass';
        popFilter.frequency.setValueAtTime(1000 + Math.random() * 2000, ctx.currentTime);

        const popGain = ctx.createGain();
        popGain.gain.setValueAtTime(0.25 + Math.random() * 0.35, ctx.currentTime);

        pop.connect(popFilter);
        popFilter.connect(popGain);
        popGain.connect(destination);

        pop.start();
        const nextPopDelay = 100 + Math.random() * 500;
        timerId = setTimeout(triggerPop, nextPopDelay);
      } catch {}
    };
    triggerPop();

    return () => {
      isPopping = false;
      if (timerId) clearTimeout(timerId);
      try { roarSource.stop(); } catch {}
      roarSource.disconnect();
    };
  }

  /**
   * Soft Wind: Gentle howling breeze outside the window using swept resonant bandpass
   */
  private createWindSynthesizer(ctx: AudioContext, destination: GainNode): () => void {
    const brownBuffer = this.createBrownNoiseBuffer(ctx);
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = brownBuffer;
    noiseSource.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(340, ctx.currentTime);
    filter.Q.setValueAtTime(2.6, ctx.currentTime);

    // LFO to sweep wind frequency slowly back and forth
    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(0.08, ctx.currentTime); // ~12s gust cycle

    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(200, ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    const ampGain = ctx.createGain();
    ampGain.gain.setValueAtTime(0.85, ctx.currentTime);

    noiseSource.connect(filter);
    filter.connect(ampGain);
    ampGain.connect(destination);

    noiseSource.start();
    lfo.start();

    return () => {
      try { noiseSource.stop(); } catch {}
      try { lfo.stop(); } catch {}
      noiseSource.disconnect();
      lfo.disconnect();
    };
  }

  /**
   * Forest Stream: Babbling brook water flow with pleasant trickling water texture
   */
  private createStreamSynthesizer(ctx: AudioContext, destination: GainNode): () => void {
    const pinkBuffer = this.createPinkNoiseBuffer(ctx);
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = pinkBuffer;
    noiseSource.loop = true;

    // Dual resonant bandpass filters for bubbling brook timbre
    const lowFilter = ctx.createBiquadFilter();
    lowFilter.type = 'bandpass';
    lowFilter.frequency.setValueAtTime(550, ctx.currentTime);
    lowFilter.Q.setValueAtTime(2.2, ctx.currentTime);

    const highFilter = ctx.createBiquadFilter();
    highFilter.type = 'bandpass';
    highFilter.frequency.setValueAtTime(1200, ctx.currentTime);
    highFilter.Q.setValueAtTime(2.4, ctx.currentTime);

    const mixGain = ctx.createGain();
    mixGain.gain.setValueAtTime(0.8, ctx.currentTime);

    noiseSource.connect(lowFilter);
    noiseSource.connect(highFilter);
    lowFilter.connect(mixGain);
    highFilter.connect(mixGain);
    mixGain.connect(destination);
    noiseSource.start();

    let isAlive = true;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const triggerTrickle = () => {
      if (!isAlive) return;
      try {
        const osc = ctx.createOscillator();
        const dropGain = ctx.createGain();
        const now = ctx.currentTime;
        const startFreq = 480 + Math.random() * 380;
        osc.frequency.setValueAtTime(startFreq, now);
        osc.frequency.exponentialRampToValueAtTime(startFreq * 1.4, now + 0.045);

        dropGain.gain.setValueAtTime(0.08 + Math.random() * 0.08, now);
        dropGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

        osc.connect(dropGain);
        dropGain.connect(destination);
        osc.start(now);
        osc.stop(now + 0.05);

        const nextDelay = 60 + Math.random() * 180;
        timerId = setTimeout(triggerTrickle, nextDelay);
      } catch {}
    };
    triggerTrickle();

    return () => {
      isAlive = false;
      if (timerId) clearTimeout(timerId);
      try { noiseSource.stop(); } catch {}
      noiseSource.disconnect();
    };
  }

  /**
   * Ocean Waves: Low frequency oscillator sweeping brown noise gain and filter
   */
  private createWavesSynthesizer(ctx: AudioContext, destination: GainNode): () => void {
    const brownBuffer = this.createBrownNoiseBuffer(ctx);
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = brownBuffer;
    noiseSource.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(480, ctx.currentTime);

    const lfo = ctx.createOscillator();
    lfo.frequency.setValueAtTime(0.08, ctx.currentTime); // 12.5 second wave cycle

    const lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(320, ctx.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);

    const waveAmpGain = ctx.createGain();
    waveAmpGain.gain.setValueAtTime(0.65, ctx.currentTime);

    noiseSource.connect(filter);
    filter.connect(waveAmpGain);
    waveAmpGain.connect(destination);

    noiseSource.start();
    lfo.start();

    return () => {
      try { noiseSource.stop(); } catch {}
      try { lfo.stop(); } catch {}
      noiseSource.disconnect();
      lfo.disconnect();
    };
  }

  /**
   * Night Crickets: Rhythmic summer evening crickets with continuous AM modulation
   */
  private createForestSynthesizer(ctx: AudioContext, destination: GainNode): () => void {
    // Night breeze bed
    const brownBuffer = this.createBrownNoiseBuffer(ctx);
    const breezeSource = ctx.createBufferSource();
    breezeSource.buffer = brownBuffer;
    breezeSource.loop = true;

    const breezeFilter = ctx.createBiquadFilter();
    breezeFilter.type = 'lowpass';
    breezeFilter.frequency.setValueAtTime(320, ctx.currentTime);

    const breezeGain = ctx.createGain();
    breezeGain.gain.setValueAtTime(0.25, ctx.currentTime);

    breezeSource.connect(breezeFilter);
    breezeFilter.connect(breezeGain);
    breezeGain.connect(destination);
    breezeSource.start();

    // Harmonic cricket chirp generator (Continuous AM, 100% reliable)
    const carrierOsc = ctx.createOscillator();
    carrierOsc.type = 'sine';
    carrierOsc.frequency.setValueAtTime(4600, ctx.currentTime);

    // Fast stridulation tremolo (50 Hz)
    const tremolo = ctx.createOscillator();
    tremolo.type = 'square';
    tremolo.frequency.setValueAtTime(50, ctx.currentTime);

    const tremoloGain = ctx.createGain();
    tremoloGain.gain.setValueAtTime(0.5, ctx.currentTime);
    tremolo.connect(tremoloGain);

    // Slow rhythmic chirp rate (2.5 Hz = ~2-3 chirps per burst)
    const rhythmOsc = ctx.createOscillator();
    rhythmOsc.type = 'sine';
    rhythmOsc.frequency.setValueAtTime(2.5, ctx.currentTime);

    const rhythmGain = ctx.createGain();
    rhythmGain.gain.setValueAtTime(0.5, ctx.currentTime);
    rhythmOsc.connect(rhythmGain);

    const chirpAmp = ctx.createGain();
    chirpAmp.gain.setValueAtTime(0.12, ctx.currentTime);

    carrierOsc.connect(chirpAmp);
    chirpAmp.connect(destination);

    carrierOsc.start();
    tremolo.start();
    rhythmOsc.start();

    return () => {
      try { breezeSource.stop(); } catch {}
      try { carrierOsc.stop(); } catch {}
      try { tremolo.stop(); } catch {}
      try { rhythmOsc.stop(); } catch {}
      breezeSource.disconnect();
      carrierOsc.disconnect();
      tremolo.disconnect();
      rhythmOsc.disconnect();
    };
  }

  /**
   * Cozy Cafe: Soft conversational murmur + clear porcelain tea/coffee cup pings
   */
  private createCafeSynthesizer(ctx: AudioContext, destination: GainNode): () => void {
    const pinkBuffer = this.createPinkNoiseBuffer(ctx);
    const murmurSource = ctx.createBufferSource();
    murmurSource.buffer = pinkBuffer;
    murmurSource.loop = true;

    // Speech-formant filter for warm cafe ambience
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.setValueAtTime(1400, ctx.currentTime);

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(650, ctx.currentTime);
    bandpass.Q.setValueAtTime(1.5, ctx.currentTime);

    const cafeGain = ctx.createGain();
    cafeGain.gain.setValueAtTime(0.65, ctx.currentTime);

    murmurSource.connect(lowpass);
    lowpass.connect(bandpass);
    bandpass.connect(cafeGain);
    cafeGain.connect(destination);
    murmurSource.start();

    // Occasional coffee cup / spoon clinks
    let isAlive = true;
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const triggerClink = () => {
      if (!isAlive) return;
      try {
        const now = ctx.currentTime;
        const osc = ctx.createOscillator();
        const clinkGain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(2200 + Math.random() * 800, now);

        clinkGain.gain.setValueAtTime(0.15, now);
        clinkGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

        osc.connect(clinkGain);
        clinkGain.connect(destination);

        osc.start(now);
        osc.stop(now + 0.09);

        const nextDelay = 3000 + Math.random() * 6000;
        timerId = setTimeout(triggerClink, nextDelay);
      } catch {}
    };

    // Initial clink after 400ms so the user immediately hears cafe ambience
    timerId = setTimeout(triggerClink, 400);

    return () => {
      isAlive = false;
      if (timerId) clearTimeout(timerId);
      try { murmurSource.stop(); } catch {}
      murmurSource.disconnect();
    };
  }

  /**
   * Vinyl Crackle: Analog turntable warmth, continuous loop buffer with dust clicks & pops
   */
  private createVinylSynthesizer(ctx: AudioContext, destination: GainNode): () => void {
    // Generate a dedicated 4-second looping vinyl buffer with realistic clicks & hiss
    const duration = 4;
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    let lastOut = 0;
    for (let i = 0; i < bufferSize; i++) {
      // Gentle highpass analog surface hiss
      const white = (Math.random() * 2 - 1) * 0.035;
      data[i] = white - lastOut * 0.95;
      lastOut = white;

      // Random needle crackles and vinyl dust micro-pops
      if (Math.random() < 0.0012) {
        const popAmp = 0.2 + Math.random() * 0.35;
        const decaySamples = Math.floor(ctx.sampleRate * 0.003);
        for (let j = 0; j < decaySamples && i + j < bufferSize; j++) {
          data[i + j] += (Math.random() * 2 - 1) * popAmp * Math.exp(-j / (decaySamples * 0.3));
        }
      }
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.65, ctx.currentTime);

    source.connect(gain);
    gain.connect(destination);
    source.start();

    return () => {
      try { source.stop(); } catch {}
      source.disconnect();
    };
  }

  /**
   * Brown Noise for deep focus
   */
  private createBrownNoiseSynthesizer(ctx: AudioContext, destination: GainNode): () => void {
    const buffer = this.createBrownNoiseBuffer(ctx);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, ctx.currentTime);

    source.connect(filter);
    filter.connect(destination);
    source.start();

    return () => {
      try { source.stop(); } catch {}
      source.disconnect();
    };
  }

  /**
   * Pure White Noise
   */
  private createWhiteNoiseSynthesizer(ctx: AudioContext, destination: GainNode): () => void {
    const bufferSize = ctx.sampleRate * 4;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.18;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    source.connect(destination);
    source.start();

    return () => {
      try { source.stop(); } catch {}
      source.disconnect();
    };
  }
}

export const soundscapeEngine = new SoundscapeEngine();
