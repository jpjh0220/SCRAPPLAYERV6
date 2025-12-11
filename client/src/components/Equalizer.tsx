import { useState, useEffect } from 'react';
import { X, RotateCcw, Check } from 'lucide-react';
import { equalizerManager, DEFAULT_BANDS, PRESETS, EqualizerPreset } from '../lib/equalizerManager';

interface EqualizerProps {
  isOpen: boolean;
  onClose: () => void;
  audioElement: HTMLAudioElement | null;
}

const STORAGE_KEY = 'eq_settings';

interface SavedSettings {
  enabled: boolean;
  gains: number[];
  presetName: string | null;
}

function loadSettings(): SavedSettings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {}
  return { enabled: true, gains: DEFAULT_BANDS.map(() => 0), presetName: 'Flat' };
}

function saveSettings(settings: SavedSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {}
}

export function Equalizer({ isOpen, onClose, audioElement }: EqualizerProps) {
  const [isEnabled, setIsEnabled] = useState(true);
  const [bands, setBands] = useState(() => DEFAULT_BANDS.map((b, i) => ({ ...b, gain: 0 })));
  const [selectedPreset, setSelectedPreset] = useState<string | null>('Flat');
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const settings = loadSettings();
    setIsEnabled(settings.enabled);
    setSelectedPreset(settings.presetName);
    setBands(bands => bands.map((b, i) => ({ ...b, gain: settings.gains[i] || 0 })));
    equalizerManager.setAllBands(settings.gains);
    equalizerManager.setEnabled(settings.enabled);
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (audioElement && isOpen) {
      equalizerManager.connectAudio(audioElement);
      equalizerManager.resumeContext();
    }
  }, [audioElement, isOpen]);

  useEffect(() => {
    if (isInitialized) {
      saveSettings({
        enabled: isEnabled,
        gains: bands.map(b => b.gain),
        presetName: selectedPreset
      });
    }
  }, [isEnabled, bands, selectedPreset, isInitialized]);

  const handleBandChange = (index: number, gain: number) => {
    setBands(prev => prev.map((b, i) => i === index ? { ...b, gain } : b));
    equalizerManager.setBandGain(index, gain);
    setSelectedPreset(null);
  };

  const handlePresetSelect = (preset: EqualizerPreset) => {
    setBands(bands.map((b, i) => ({ ...b, gain: preset.gains[i] || 0 })));
    equalizerManager.setAllBands(preset.gains);
    setSelectedPreset(preset.name);
  };

  const handleReset = () => {
    const flat = PRESETS.find(p => p.name === 'Flat')!;
    handlePresetSelect(flat);
  };

  const handleToggleEnabled = () => {
    const newEnabled = !isEnabled;
    setIsEnabled(newEnabled);
    equalizerManager.setEnabled(newEnabled);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-foreground">Equalizer</h2>
            <button
              onClick={handleToggleEnabled}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                isEnabled 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-muted text-muted-foreground'
              }`}
              data-testid="eq-toggle-enabled"
            >
              {isEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors"
              title="Reset to Flat"
              data-testid="eq-reset"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors"
              data-testid="eq-close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-4">
          <div className="mb-4">
            <p className="text-xs text-muted-foreground mb-2">Presets</p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map(preset => (
                <button
                  key={preset.name}
                  onClick={() => handlePresetSelect(preset)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    selectedPreset === preset.name
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted hover:bg-muted/80 text-foreground'
                  }`}
                  data-testid={`eq-preset-${preset.name.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {preset.name}
                  {selectedPreset === preset.name && (
                    <Check className="w-3 h-3 ml-1 inline-block" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className={`transition-opacity ${isEnabled ? 'opacity-100' : 'opacity-40'}`}>
            <div className="flex items-end justify-between gap-2 h-48 bg-muted/30 rounded-lg p-4">
              {bands.map((band, index) => (
                <div key={band.frequency} className="flex flex-col items-center gap-2 flex-1">
                  <div className="relative h-32 w-full flex justify-center">
                    <input
                      type="range"
                      min="-12"
                      max="12"
                      step="0.5"
                      value={band.gain}
                      onChange={(e) => handleBandChange(index, parseFloat(e.target.value))}
                      disabled={!isEnabled}
                      className="absolute h-full w-8 appearance-none bg-transparent cursor-pointer disabled:cursor-not-allowed"
                      style={{
                        writingMode: 'vertical-lr',
                        direction: 'rtl',
                      }}
                      data-testid={`eq-band-${index}`}
                    />
                    <div 
                      className="absolute bottom-0 w-3 bg-primary rounded-full transition-all pointer-events-none"
                      style={{
                        height: `${((band.gain + 12) / 24) * 100}%`,
                        minHeight: '4px'
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {band.gain > 0 ? '+' : ''}{band.gain.toFixed(1)}
                  </span>
                  <span className="text-[9px] text-muted-foreground/70">
                    {band.label}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex justify-between mt-2 px-4">
              <span className="text-[10px] text-muted-foreground">Bass</span>
              <span className="text-[10px] text-muted-foreground">Mid</span>
              <span className="text-[10px] text-muted-foreground">Treble</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
