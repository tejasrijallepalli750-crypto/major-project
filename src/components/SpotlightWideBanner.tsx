import React, { useState, useEffect } from 'react';
import { Tv, Sparkles, Clock, ArrowRight, ShieldCheck, Zap } from 'lucide-react';

interface SpotlightWideBannerProps {
  onSelectProduct?: (productId: string) => void;
  onExploreCatalog?: (category?: string) => void;
}

export const SpotlightWideBanner: React.FC<SpotlightWideBannerProps> = ({
  onSelectProduct,
  onExploreCatalog,
}) => {
  // Live deal countdown timer
  const [timeLeft, setTimeLeft] = useState({
    hours: 5,
    minutes: 42,
    seconds: 19,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev.seconds > 0) {
          return { ...prev, seconds: prev.seconds - 1 };
        } else if (prev.minutes > 0) {
          return { ...prev, minutes: 59, seconds: 59 };
        } else if (prev.hours > 0) {
          return { hours: prev.hours - 1, minutes: 59, seconds: 59 };
        }
        return { hours: 12, minutes: 0, seconds: 0 };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const format2 = (n: number) => n.toString().padStart(2, '0');

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-red-950 via-rose-900 to-amber-950 text-white border-2 border-amber-400/40 shadow-xl">
        {/* Festive Marquee Glow Top & Bottom Border */}
        <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 opacity-80" />
        <div className="absolute bottom-0 inset-x-0 h-1.5 bg-gradient-to-r from-amber-500 via-yellow-300 to-amber-400 opacity-80" />

        {/* Ambient festive circles */}
        <div className="absolute -right-20 -top-20 w-80 h-80 rounded-full bg-amber-400/15 blur-3xl pointer-events-none" />
        <div className="absolute -left-20 -bottom-20 w-80 h-80 rounded-full bg-rose-600/20 blur-3xl pointer-events-none" />

        <div className="relative z-10 px-6 py-6 sm:px-10 sm:py-8 flex flex-col lg:flex-row items-center justify-between gap-6">
          {/* Left Column: Brand & Specs */}
          <div className="space-y-3 max-w-xl text-center lg:text-left">
            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2.5">
              <span className="px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black uppercase tracking-wider">
                Festival Spotlight
              </span>
              <span className="px-2 py-0.5 rounded bg-white/10 border border-white/20 text-[10px] font-bold text-amber-200">
                AD · SPONSORED DEAL
              </span>
              <div className="flex items-center gap-1.5 text-xs text-amber-300 font-mono">
                <Clock className="w-3.5 h-3.5" />
                <span>Ends in {format2(timeLeft.hours)}h : {format2(timeLeft.minutes)}m : {format2(timeLeft.seconds)}s</span>
              </div>
            </div>

            <div>
              <p className="text-xs font-bold tracking-widest text-amber-300 uppercase">
                LG NANO 4K UHD AI & ULTRA DISPLAY
              </p>
              <h2 className="text-2xl sm:text-4xl font-extrabold tracking-tight mt-0.5 leading-snug">
                Nano detail enhancer 4K
              </h2>
            </div>

            <div className="flex items-baseline justify-center lg:justify-start gap-3">
              <span className="text-2xl sm:text-3xl font-black text-amber-300 font-mono">
                From ₹24,990*
              </span>
              <span className="text-sm line-through text-slate-400 font-mono">
                ₹39,990
              </span>
              <span className="px-2 py-0.5 rounded bg-emerald-500/30 text-emerald-300 border border-emerald-400/40 text-xs font-bold">
                Save 37%
              </span>
            </div>

            <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
              α5 Gen6 AI processor with 4K upscaling, webOS Smart TV, Dolby Audio, and filmmaker mode. Built for immersive home cinema.
            </p>

            <div className="flex flex-wrap items-center justify-center lg:justify-start gap-2 text-[11px] text-amber-100 font-medium">
              <span className="flex items-center gap-1 bg-black/30 px-2 py-1 rounded border border-white/10">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" /> 10% HDFC Instant Off
              </span>
              <span className="flex items-center gap-1 bg-black/30 px-2 py-1 rounded border border-white/10">
                <Zap className="w-3.5 h-3.5 text-amber-400" /> Free Installation
              </span>
              <span className="flex items-center gap-1 bg-black/30 px-2 py-1 rounded border border-white/10">
                3-Year Comprehensive Warranty
              </span>
            </div>
          </div>

          {/* Right Column: Interactive Buttons & Visual Highlight */}
          <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0">
            <button
              onClick={() => onSelectProduct ? onSelectProduct('prod-022') : onExploreCatalog?.('Electronics')}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs uppercase tracking-wider shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer group"
            >
              <span>Grab Festival Price</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </button>

            <button
              onClick={() => onExploreCatalog?.('Electronics')}
              className="w-full sm:w-auto px-5 py-3 rounded-xl bg-white/15 hover:bg-white/25 border border-white/30 text-white font-semibold text-xs transition-colors cursor-pointer text-center"
            >
              View All 4K Displays
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};
