import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Sparkles, Tag, ArrowRight, ShieldCheck, Zap } from 'lucide-react';

interface FestiveHeroCarouselProps {
  onNavigate: (view: string, param?: string) => void;
}

interface BannerSlide {
  id: string;
  badge: string;
  title: string;
  subtitle: string;
  highlightText: string;
  offerDetails: string;
  bankOffer: string;
  buttonText: string;
  targetView: string;
  targetParam?: string;
  themeGradient: string;
  accentColor: string;
  image?: string;
  tags: string[];
}

const SLIDES: BannerSlide[] = [
  {
    id: 'slide-utsav',
    badge: 'FESTIVE MEGA EVENT',
    title: 'BIG SHOPPING UTSAV',
    subtitle: 'Sale is LIVE',
    highlightText: 'Assured rewards with every order & instant gifts',
    offerDetails: 'Up to 70% Off across Flagship Audio, Tech & Decor',
    bankOffer: 'HDFC BANK | 10% Instant Discount* on Credit Cards & EasyEMI',
    buttonText: 'Shop Utsav Specials',
    targetView: 'catalog',
    targetParam: 'All',
    themeGradient: 'from-amber-700 via-rose-900 to-indigo-950',
    accentColor: 'text-amber-300',
    tags: ['Live Now', 'Extra 10% Off', 'Free Delivery'],
  },
  {
    id: 'slide-fashion',
    badge: 'ETHNIC & LUXURY APPAREL',
    title: 'Festive Anarkalis & Silks',
    subtitle: 'Min. 70% Off',
    highlightText: 'Trending now, gone soon! Handcrafted Chanderi & Merino',
    offerDetails: 'Exclusive festive kurta sets, fine overshirts & knitwear',
    bankOffer: 'HDFC BANK | 10% Instant Discount* + Assured Cashback',
    buttonText: 'Explore Ethnic Wear',
    targetView: 'catalog',
    targetParam: 'Apparel',
    themeGradient: 'from-fuchsia-900 via-pink-900 to-rose-950',
    accentColor: 'text-pink-300',
    tags: ['Min 70% Off', 'Chanderi Silk', 'Limited Festive Stock'],
  },
  {
    id: 'slide-mobiles',
    badge: 'FLAGSHIP LAUNCH & EXCLUSIVES',
    title: 'HMD Vibe 5G & Smartphones',
    subtitle: 'From ₹12,999*',
    highlightText: '50 MP AI Camera | 6000 mAh Two-Day Battery | 120Hz',
    offerDetails: 'Next-gen fluid display with clean OS and rapid 33W charging',
    bankOffer: 'HDFC & SBI CARDS | Flat ₹1,500 Instant Discount + No-Cost EMI',
    buttonText: 'View Smartphone Deals',
    targetView: 'product-detail',
    targetParam: 'prod-021',
    themeGradient: 'from-slate-900 via-sky-950 to-blue-900',
    accentColor: 'text-cyan-300',
    tags: ['50MP AI Dual', '6000 mAh', '5G Ready'],
  },
  {
    id: 'slide-audio',
    badge: 'AUDIOPHILE SOUND FEST',
    title: 'Studio Sound & Wearables',
    subtitle: 'Up to 55% Off',
    highlightText: 'Planar ANC Headphones, Titanium Smartwatches & DACs',
    offerDetails: 'Crafted for unmatched clarity, 38h battery, and comfort',
    bankOffer: 'HDFC BANK | Instant EMI Cashback & Complimentary Case',
    buttonText: 'Discover Audio & Watches',
    targetView: 'catalog',
    targetParam: 'Audio & Wearables',
    themeGradient: 'from-purple-950 via-violet-900 to-slate-950',
    accentColor: 'text-amber-300',
    tags: ['Hi-Res LDAC', 'Planar Drivers', 'Aerospace Titanium'],
  },
];

export const FestiveHeroCarousel: React.FC<FestiveHeroCarouselProps> = ({ onNavigate }) => {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (isHovered) return;
    const timer = setInterval(() => {
      setCurrentSlideIndex((prev) => (prev + 1) % SLIDES.length);
    }, 5500);
    return () => clearInterval(timer);
  }, [isHovered]);

  const prevSlide = () => {
    setCurrentSlideIndex((prev) => (prev === 0 ? SLIDES.length - 1 : prev - 1));
  };

  const nextSlide = () => {
    setCurrentSlideIndex((prev) => (prev + 1) % SLIDES.length);
  };

  const slide = SLIDES[currentSlideIndex];

  return (
    <div
      className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 pb-2"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`relative overflow-hidden rounded-3xl bg-gradient-to-r ${slide.themeGradient} text-white shadow-xl transition-all duration-700 min-h-[340px] sm:min-h-[380px] flex items-center border border-amber-400/20`}
      >
        {/* Festive Decorative Background Arch / Pattern */}
        <div className="absolute inset-0 opacity-25 pointer-events-none">
          <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-amber-400/20 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-rose-500/20 blur-3xl" />
          <div className="absolute inset-0 bg-[radial-gradient(#fde047_1px,transparent_1px)] [background-size:24px_24px] opacity-15" />
        </div>

        {/* Content Container */}
        <div className="relative z-10 w-full p-6 sm:p-10 lg:p-12 flex flex-col md:flex-row items-center justify-between gap-8">
          {/* Left Text Column */}
          <div className="max-w-2xl space-y-4 text-center md:text-left">
            {/* Top Festive Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-400/20 border border-amber-300/40 text-amber-200 text-xs font-bold tracking-wider uppercase backdrop-blur-sm shadow-xs">
              <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
              <span>{slide.badge}</span>
            </div>

            {/* Main Headings */}
            <div>
              <h1 className="text-3xl sm:text-5xl font-black tracking-tight drop-shadow-sm leading-tight">
                {slide.title}
              </h1>
              <div className="mt-1 flex items-center justify-center md:justify-start gap-3">
                <span className={`text-2xl sm:text-4xl font-extrabold ${slide.accentColor} tracking-wide drop-shadow-sm`}>
                  {slide.subtitle}
                </span>
                <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 text-xs font-black uppercase tracking-wider animate-bounce">
                  Live
                </span>
              </div>
            </div>

            {/* Offer details & Highlights */}
            <p className="text-slate-100 text-sm sm:text-base font-medium leading-relaxed max-w-xl">
              {slide.highlightText}
            </p>
            <p className="text-slate-300 text-xs sm:text-sm font-normal">
              {slide.offerDetails}
            </p>

            {/* Bank Instant Discount Ribbon */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white/10 border border-white/20 text-xs font-semibold backdrop-blur-md shadow-xs">
              <ShieldCheck className="w-4 h-4 text-amber-300 shrink-0" />
              <span className="text-amber-100">{slide.bankOffer}</span>
            </div>

            {/* Tag Pills */}
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 pt-1">
              {slide.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2.5 py-0.5 rounded-md bg-black/30 border border-white/15 text-[11px] font-medium text-slate-200"
                >
                  {tag}
                </span>
              ))}
            </div>

            {/* CTA Buttons */}
            <div className="pt-2 flex flex-wrap items-center justify-center md:justify-start gap-3">
              <button
                onClick={() => onNavigate(slide.targetView, slide.targetParam)}
                className="px-6 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs uppercase tracking-wider shadow-lg hover:shadow-amber-400/30 transition-all flex items-center gap-2 cursor-pointer group"
              >
                <span>{slide.buttonText}</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </button>

              <button
                onClick={() => {
                  const target = document.getElementById('recommendations-section');
                  target?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="px-5 py-3 rounded-xl bg-white/15 hover:bg-white/25 border border-white/30 text-white font-semibold text-xs transition-colors cursor-pointer"
              >
                Explore Recommendations
              </button>
            </div>
          </div>

          {/* Right Visual Card / Festive Offer Highlight */}
          <div className="hidden lg:flex flex-col items-center justify-center shrink-0">
            <div className="relative w-80 p-5 rounded-2xl bg-white/10 backdrop-blur-xl border border-white/25 shadow-2xl text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-full bg-amber-400 text-slate-950 flex items-center justify-center font-black text-xl shadow-md">
                <Tag className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-amber-300">
                  Exclusive Festive Bonus
                </p>
                <p className="text-lg font-black text-white mt-0.5">
                  Save Up to 70% + Extra 10%
                </p>
                <p className="text-xs text-slate-200 mt-1">
                  100% Genuine Certified · Same-Day Dispatch
                </p>
              </div>

              <div className="pt-2 border-t border-white/15 flex items-center justify-around text-xs font-bold text-amber-200">
                <div className="flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-amber-300" />
                  <span>Flash Delivery</span>
                </div>
                <span>•</span>
                <div>7-Day Returns</div>
              </div>
            </div>
          </div>
        </div>

        {/* Carousel Arrow Navigation */}
        <button
          onClick={prevSlide}
          aria-label="Previous Slide"
          className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center backdrop-blur-sm border border-white/20 transition-transform active:scale-90 cursor-pointer z-20"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <button
          onClick={nextSlide}
          aria-label="Next Slide"
          className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center backdrop-blur-sm border border-white/20 transition-transform active:scale-90 cursor-pointer z-20"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        {/* Dot Pagination matching the screenshot */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-20">
          {SLIDES.map((s, idx) => (
            <button
              key={s.id}
              onClick={() => setCurrentSlideIndex(idx)}
              aria-label={`Go to slide ${idx + 1}`}
              className={`h-2 rounded-full transition-all cursor-pointer ${
                idx === currentSlideIndex
                  ? 'w-7 bg-amber-400'
                  : 'w-2 bg-white/40 hover:bg-white/70'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
