export interface EqualizerBand {
  frequency: number;
  gain: number;
  label: string;
}

export interface EqualizerPreset {
  name: string;
  gains: number[];
}

export const DEFAULT_BANDS: EqualizerBand[] = [
  { frequency: 60, gain: 0, label: '60Hz' },
  { frequency: 170, gain: 0, label: '170Hz' },
  { frequency: 310, gain: 0, label: '310Hz' },
  { frequency: 600, gain: 0, label: '600Hz' },
  { frequency: 1000, gain: 0, label: '1kHz' },
  { frequency: 3000, gain: 0, label: '3kHz' },
  { frequency: 6000, gain: 0, label: '6kHz' },
  { frequency: 12000, gain: 0, label: '12kHz' },
  { frequency: 14000, gain: 0, label: '14kHz' },
  { frequency: 16000, gain: 0, label: '16kHz' },
];

export const PRESETS: EqualizerPreset[] = [
  { name: 'Flat', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { name: 'Bass Boost', gains: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] },
  { name: 'Treble Boost', gains: [0, 0, 0, 0, 0, 2, 4, 5, 6, 6] },
  { name: 'Rock', gains: [5, 4, 2, 0, -1, 0, 2, 4, 5, 5] },
  { name: 'Pop', gains: [-1, 1, 3, 4, 3, 0, -1, -1, 0, 1] },
  { name: 'Jazz', gains: [3, 2, 0, 1, -1, -1, 0, 1, 2, 3] },
  { name: 'Classical', gains: [4, 3, 2, 1, 0, 0, 0, 1, 2, 3] },
  { name: 'Electronic', gains: [5, 4, 1, 0, -2, 1, 0, 1, 4, 5] },
  { name: 'Hip-Hop', gains: [5, 4, 1, 2, -1, -1, 1, 0, 2, 3] },
  { name: 'Vocal', gains: [-2, -1, 0, 2, 4, 4, 3, 1, 0, -1] },
];

const STORAGE_KEY = 'eq_settings';

interface SavedSettings {
  enabled: boolean;
  gains: number[];
  presetName: string | null;
}

function loadSavedSettings(): SavedSettings | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {}
  return null;
}

class EqualizerManager {
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private filters: BiquadFilterNode[] = [];
  private gainNode: GainNode | null = null;
  private connectedAudio: HTMLAudioElement | null = null;
  private isEnabled: boolean = true;
  private bandGains: number[] = DEFAULT_BANDS.map(b => b.gain);
  private settingsLoaded: boolean = false;

  private loadSettings() {
    if (this.settingsLoaded) return;
    this.settingsLoaded = true;
    
    const settings = loadSavedSettings();
    if (settings) {
      this.isEnabled = settings.enabled;
      this.bandGains = settings.gains.length === DEFAULT_BANDS.length 
        ? settings.gains 
        : DEFAULT_BANDS.map(b => b.gain);
    }
  }

  connectAudio(audioElement: HTMLAudioElement) {
    this.loadSettings();
    if (this.connectedAudio === audioElement) {
      return;
    }

    this.disconnect();
    this.connectedAudio = audioElement;

    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.sourceNode = this.audioContext.createMediaElementSource(audioElement);
      this.gainNode = this.audioContext.createGain();

      this.filters = DEFAULT_BANDS.map((band, index) => {
        const filter = this.audioContext!.createBiquadFilter();
        filter.type = 'peaking';
        filter.frequency.value = band.frequency;
        filter.Q.value = 1.4;
        filter.gain.value = this.bandGains[index];
        return filter;
      });

      let prevNode: AudioNode = this.sourceNode;
      for (const filter of this.filters) {
        prevNode.connect(filter);
        prevNode = filter;
      }
      prevNode.connect(this.gainNode);
      this.gainNode.connect(this.audioContext.destination);

      if (!this.isEnabled) {
        this.filters.forEach(f => f.gain.value = 0);
      }
    } catch (error) {
      console.error('Failed to initialize equalizer:', error);
    }
  }

  disconnect() {
    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch (e) {}
      this.sourceNode = null;
    }
    this.filters.forEach(f => {
      try {
        f.disconnect();
      } catch (e) {}
    });
    this.filters = [];
    if (this.gainNode) {
      try {
        this.gainNode.disconnect();
      } catch (e) {}
      this.gainNode = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch (e) {}
    }
    this.audioContext = null;
    this.connectedAudio = null;
  }

  setBandGain(index: number, gain: number) {
    if (index >= 0 && index < this.bandGains.length) {
      this.bandGains[index] = gain;
      if (this.filters[index] && this.isEnabled) {
        this.filters[index].gain.value = gain;
      }
    }
  }

  setAllBands(gains: number[]) {
    gains.forEach((gain, index) => {
      if (index < this.bandGains.length) {
        this.bandGains[index] = gain;
        if (this.filters[index] && this.isEnabled) {
          this.filters[index].gain.value = gain;
        }
      }
    });
  }

  getBandGains(): number[] {
    return [...this.bandGains];
  }

  setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
    this.filters.forEach((filter, index) => {
      filter.gain.value = enabled ? this.bandGains[index] : 0;
    });
  }

  isActive(): boolean {
    return this.isEnabled;
  }

  resumeContext() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }
}

export const equalizerManager = new EqualizerManager();
