/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * CONTROLLED FORENSIC GLITCH COMPONENT (STAGE 6 / 7)
 * 
 * Cinematic glitch sequence featuring:
 * - Unpredictable repeating loop of ~0.5s sharp, high-pitched electronic bursts followed by silence.
 * - Dynamic visual distortion (flicker, horizontal screen tearing, chromatic RGB displacement,
 *   scanline jitter) strictly synchronized to the audio burst state.
 * - Unpredictable variation in timing, displacement, and telemetry readouts.
 * - Absolute audio safety: immediate stop of all sounds on completion, skip, dismissal, or unmount.
 * - Full support for Reduced Scare Mode and prefers-reduced-motion.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { ShieldAlert, AlertTriangle, RefreshCw, XCircle, Terminal } from 'lucide-react';
import { tacticalAudio } from '../lib/tacticalAudio';

export interface ControlledSystemGlitchProps {
  isActive: boolean;
  reducedScareMode?: boolean;
  onComplete: () => void;
  onDismiss?: () => void;
}

type GlitchPhase =
  | 'idle'
  | 'carrier_warning'
  | 'active_glitching'
  | 'final_interruption'
  | 'resolved';

interface GlitchJitterStyle {
  skew: number;
  offsetX: number;
  offsetY: number;
  rgbSplit: number;
  tearTop: number;
  tearHeight: number;
  flickerOpacity: number;
}

const TELEMETRY_BURST_MSGS = [
  'CARRIER FREQUENCY DRIFT: 3080Hz MISMATCH DETECTED',
  'BUFFER OVERFLOW: REPOSITORY EMBARGO ENFORCED BY DIRECTORATE',
  'ANOMALOUS TRANSMISSION INTERRUPT // REEL 0x17-TLS',
  'PARITY COLLAPSE AT SECTOR 04 // AUDIO CARRIER SPIKE',
  'DIRECTORATE LOCKDOWN: TERMINAL INPUT FORCED OFF',
];

export const ControlledSystemGlitch: React.FC<ControlledSystemGlitchProps> = ({
  isActive,
  reducedScareMode = false,
  onComplete,
  onDismiss,
}) => {
  const [phase, setPhase] = useState<GlitchPhase>('idle');
  const [isGlitchBurstActive, setIsGlitchBurstActive] = useState(false);
  const [telemetryText, setTelemetryText] = useState('SYSTEM MONITOR: OK');
  const [burstCount, setBurstCount] = useState(0);
  const [jitter, setJitter] = useState<GlitchJitterStyle>({
    skew: 0,
    offsetX: 0,
    offsetY: 0,
    rgbSplit: 0,
    tearTop: 30,
    tearHeight: 40,
    flickerOpacity: 1,
  });

  const timersRef = useRef<NodeJS.Timeout[]>([]);
  const hasCompletedRef = useRef(false);

  const clearAllTimersAndSounds = useCallback(() => {
    timersRef.current.forEach((t) => clearTimeout(t));
    timersRef.current = [];
    tacticalAudio.stopAllGlitchSounds();
  }, []);

  const handleSkipOrRecover = useCallback(() => {
    if (hasCompletedRef.current) return;
    hasCompletedRef.current = true;
    clearAllTimersAndSounds();
    tacticalAudio.playGlitchCutoff();
    setPhase('resolved');
    setTimeout(() => {
      setPhase('idle');
      onComplete();
    }, 200);
  }, [clearAllTimersAndSounds, onComplete]);

  // Check prefers-reduced-motion
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearAllTimersAndSounds();
    };
  }, [clearAllTimersAndSounds]);

  // Main glitch sequencer
  useEffect(() => {
    if (!isActive) {
      setPhase('idle');
      setIsGlitchBurstActive(false);
      clearAllTimersAndSounds();
      hasCompletedRef.current = false;
      return;
    }

    hasCompletedRef.current = false;
    clearAllTimersAndSounds();

    // Reduced Scare Mode / Reduced Motion: clean, non-flashing teletype notice
    if (reducedScareMode || prefersReducedMotion) {
      setPhase('active_glitching');
      setTelemetryText('DIRECTORATE EMBARGO: TERMINAL INPUT RESTRICTED');
      tacticalAudio.playGlitchHum();

      const t = setTimeout(() => {
        handleSkipOrRecover();
      }, 2800);
      timersRef.current.push(t);
      return;
    }

    // Step 1: Initial subtle carrier warning (0ms -> 650ms)
    setPhase('carrier_warning');
    setTelemetryText('MONITORING ARCHIVAL REEL 0x17-TLS-VALE... [CARRIER LOCK]');
    tacticalAudio.playGlitchHum();

    // Step 2: Unpredictable repeating sound-and-silence sequence
    const tStartGlitch = setTimeout(() => {
      setPhase('active_glitching');

      let currentBurst = 0;
      const MAX_BURSTS = 4;

      const runBurstCycle = () => {
        if (hasCompletedRef.current) return;
        currentBurst += 1;
        setBurstCount(currentBurst);

        // Sound duration ~0.48s - 0.52s
        const soundDuration = 0.46 + Math.random() * 0.08;

        // Visual jitter parameters randomized per burst
        setJitter({
          skew: (Math.random() - 0.5) * 5.0, // -2.5deg to +2.5deg
          offsetX: (Math.random() - 0.5) * 16, // -8px to +8px
          offsetY: (Math.random() - 0.5) * 8, // -4px to +4px
          rgbSplit: 3 + Math.random() * 5, // 3px to 8px RGB separation
          tearTop: Math.floor(Math.random() * 75) + 10,
          tearHeight: Math.floor(Math.random() * 60) + 25,
          flickerOpacity: 0.85 + Math.random() * 0.15,
        });

        // Set dynamic telemetry text
        const msgIdx = (currentBurst - 1) % TELEMETRY_BURST_MSGS.length;
        setTelemetryText(TELEMETRY_BURST_MSGS[msgIdx]);

        // Trigger sharp electronic audio burst and activate visual tearing
        setIsGlitchBurstActive(true);
        tacticalAudio.playGlitchHighBurst(soundDuration);

        // End of the ~0.5s sound burst -> transition into silence
        const tBurstEnd = setTimeout(() => {
          if (hasCompletedRef.current) return;
          setIsGlitchBurstActive(false);

          // Reset severe tearing during silence, keep faint scanline tension
          setJitter((prev) => ({
            ...prev,
            skew: 0,
            offsetX: 0,
            offsetY: 0,
            rgbSplit: 0,
            flickerOpacity: 1,
          }));

          // Check if we reached max bursts
          if (currentBurst >= MAX_BURSTS) {
            // Transition to Final Interruption & CRT collapse
            const tFinal = setTimeout(() => {
              if (hasCompletedRef.current) return;
              setPhase('final_interruption');
              setTelemetryText('TERMINAL INPUT SEVERED // PERMANENT EMBARGO ACTIVE');
              tacticalAudio.playGlitchCutoff();

              const tResolve = setTimeout(() => {
                if (!hasCompletedRef.current) {
                  hasCompletedRef.current = true;
                  setPhase('resolved');
                  setTimeout(() => {
                    setPhase('idle');
                    onComplete();
                  }, 250);
                }
              }, 700);
              timersRef.current.push(tResolve);
            }, 350);
            timersRef.current.push(tFinal);
          } else {
            // Unpredictable silence interval between bursts (400ms - 850ms)
            const silenceDuration = 450 + Math.random() * 400;
            const tNext = setTimeout(runBurstCycle, silenceDuration);
            timersRef.current.push(tNext);
          }
        }, soundDuration * 1000);

        timersRef.current.push(tBurstEnd);
      };

      runBurstCycle();
    }, 650);

    timersRef.current.push(tStartGlitch);

    return () => {
      clearAllTimersAndSounds();
    };
  }, [isActive, reducedScareMode, prefersReducedMotion, handleSkipOrRecover, onComplete, clearAllTimersAndSounds]);

  // Keyboard Escape to quickly recover
  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleSkipOrRecover();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, handleSkipOrRecover]);

  if (!isActive && phase === 'idle') return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/94 backdrop-blur-md transition-opacity duration-200 ${
        phase === 'resolved' ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Dynamic Scanlines Overlay */}
      <div className="absolute inset-0 glitch-scanlines pointer-events-none opacity-50" />

      {/* Synchronized Screen Tearing Bar (Active only during the electronic burst) */}
      {isGlitchBurstActive && (
        <>
          <div
            className="absolute inset-x-0 bg-red-500/20 pointer-events-none mix-blend-screen transition-all"
            style={{
              top: `${jitter.tearTop}%`,
              height: `${jitter.tearHeight}px`,
              filter: 'blur(1px)',
            }}
          />
          <div
            className="absolute inset-0 pointer-events-none bg-red-950/25 mix-blend-color-dodge"
            style={{
              opacity: jitter.flickerOpacity,
            }}
          />
        </>
      )}

      {/* Main Terminal Malfunction Frame with unpredictable displacement during bursts */}
      <div
        style={{
          transform: isGlitchBurstActive
            ? `translate(${jitter.offsetX}px, ${jitter.offsetY}px) skewX(${jitter.skew}deg)`
            : 'none',
          boxShadow: isGlitchBurstActive
            ? `0 0 110px rgba(220, 20, 20, 0.7), ${jitter.rgbSplit}px 0 0 rgba(0, 255, 255, 0.2), -${jitter.rgbSplit}px 0 0 rgba(255, 0, 0, 0.3)`
            : '0 0 60px rgba(160, 20, 20, 0.35)',
          transition: isGlitchBurstActive ? 'none' : 'transform 120ms ease-out',
        }}
        className={`relative max-w-xl w-full bg-[#0a0a09] border p-6 sm:p-8 text-center select-none ${
          phase === 'final_interruption'
            ? 'glitch-phosphor-collapse border-red-700 bg-black'
            : isGlitchBurstActive
            ? 'border-red-600 bg-[#0e0707]'
            : 'border-red-900/60'
        }`}
      >
        {/* Terminal Header Telemetry */}
        <div className="flex items-center justify-between border-b border-red-900/40 pb-3 mb-5 font-mono text-[11px] tracking-widest text-red-400 uppercase">
          <div className="flex items-center gap-2">
            <span
              className={`size-2.5 rounded-full ${
                isGlitchBurstActive
                  ? 'bg-red-500 animate-ping'
                  : phase === 'carrier_warning'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-red-700'
              }`}
            />
            <span>
              {isGlitchBurstActive
                ? `INTERRUPT PULSE 0${burstCount} // CARRIER BURST ACTIVE`
                : phase === 'final_interruption'
                ? 'TERMINAL POWER CUTOFF'
                : 'DISPATCH MONITOR // CARRIER LOCKED'}
            </span>
          </div>
          <span>SEC-LVL 4</span>
        </div>

        {/* Status Icon */}
        <div className="flex justify-center mb-4">
          {isGlitchBurstActive ? (
            <ShieldAlert className="w-12 h-12 text-red-500 animate-pulse" />
          ) : phase === 'final_interruption' ? (
            <AlertTriangle className="w-12 h-12 text-red-600" />
          ) : (
            <Terminal className="w-12 h-12 text-amber-400/90" />
          )}
        </div>

        {/* Narrative Title */}
        <h3
          style={{
            textShadow: isGlitchBurstActive
              ? `${jitter.rgbSplit}px 0 0 rgba(255,0,0,0.7), -${jitter.rgbSplit}px 0 0 rgba(0,255,255,0.7)`
              : 'none',
          }}
          className="font-serif text-xl sm:text-2xl text-[#f4efe6] mb-2 tracking-wide"
        >
          {phase === 'final_interruption'
            ? 'TERMINAL POWER CUTOFF'
            : isGlitchBurstActive
            ? 'ARCHIVAL TRANSMISSION EMBARGO'
            : 'ANOMALOUS CARRIER DETECTED'}
        </h3>

        {/* Dynamic Telemetry Narrative */}
        <p
          style={{
            letterSpacing: isGlitchBurstActive ? '0.12em' : '0.05em',
          }}
          className={`font-mono text-xs sm:text-sm tracking-wider mb-6 leading-relaxed ${
            isGlitchBurstActive ? 'text-red-300 font-bold' : 'text-red-400/80'
          }`}
        >
          {telemetryText}
        </p>

        {/* Diagnostic Strip */}
        <div className="bg-[#050505] border border-stone-800 p-3 mb-6 text-left font-mono text-[10px] text-stone-400 space-y-1">
          <div className="flex justify-between">
            <span>REPOSITORY: CASE 17 // ELLEN VALE ARCHIVE</span>
            <span className={isGlitchBurstActive ? 'text-red-400 font-bold animate-pulse' : 'text-stone-300'}>
              {isGlitchBurstActive ? 'SIGNAL BURST SYNCHRONIZED' : 'SILENCE INTERVAL'}
            </span>
          </div>
          <div className="flex justify-between">
            <span>DIRECTORATE PROTOCOL: EMBARGO ACTIVE</span>
            <span>CONTAINMENT: ENFORCED</span>
          </div>
        </div>

        {/* Safe Recovery Action */}
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleSkipOrRecover}
            className="flex items-center gap-2 px-4 py-2 bg-stone-900 hover:bg-stone-800 border border-stone-700 hover:border-stone-500 text-stone-300 hover:text-white font-mono text-xs tracking-wider transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>BYPASS INTERRUPT (ESC)</span>
          </button>

          {onDismiss && (
            <button
              type="button"
              onClick={() => {
                clearAllTimersAndSounds();
                onDismiss();
              }}
              className="flex items-center gap-2 px-3 py-2 text-stone-500 hover:text-stone-300 font-mono text-xs tracking-wider transition-colors cursor-pointer"
            >
              <XCircle className="w-3.5 h-3.5" />
              <span>DISMISS</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
