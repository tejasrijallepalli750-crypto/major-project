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
    themeGradient: 'from-amber-50 via-orange-50 to-rose-100',
    accentColor: 'text-amber-800',
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
    themeGradient: 'from-rose-50 via-pink-50 to-orange-100',
    accentColor: 'text-rose-700',
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
    themeGradient: 'from-sky-50 via-cyan-50 to-indigo-100',
    accentColor: 'text-sky-800',
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
    themeGradient: 'from-violet-50 via-purple-50 to-slate-100',
    accentColor: 'text-violet-800',
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
        className={`relative overflow-hidden rounded-3xl bg-gradient-to-r ${slide.themeGradient} text-slate-900 shadow-xl transition-all duration-700 min-h-[340px] sm:min-h-[380px] flex items-center border border-slate-200`}
      >
        {/* Festive Decorative Background Arch / Pattern */}
        <div className="absolute inset-0 opacity-30 pointer-events-none">
          <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-white/70 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-amber-200/40 blur-3xl" />
          <div className="absolute inset-0 bg-[radial-gradient(#94a3b8_1px,transparent_1px)] [background-size:24px_24px] opacity-15" />
        </div>

        {/* Content Container */}
        <div className="relative z-10 w-full p-6 sm:p-10 lg:p-12 flex flex-col md:flex-row items-center justify-between gap-8">
          {/* Left Text Column */}
          <div className="max-w-2xl space-y-4 text-center md:text-left">
            {/* Top Festive Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/70 border border-white/80 text-slate-700 text-xs font-bold tracking-wider uppercase backdrop-blur-sm shadow-xs">
              <Sparkles className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
              <span>{slide.badge}</span>
            </div>

            {/* Main Headings */}
            <div>
              <h1 className="text-3xl sm:text-5xl font-black tracking-tight leading-tight text-slate-900">
                {slide.title}
              </h1>
              <div className="mt-1 flex items-center justify-center md:justify-start gap-3">
                <span className={`text-2xl sm:text-4xl font-extrabold ${slide.accentColor} tracking-wide`}>
                  {slide.subtitle}
                </span>
                <span className="px-2 py-0.5 rounded bg-amber-400 text-slate-950 text-xs font-black uppercase tracking-wider animate-bounce">
                  Live
                </span>
              </div>
            </div>

            {/* Offer details & Highlights */}
            <p className="text-slate-700 text-sm sm:text-base font-medium leading-relaxed max-w-xl">
              {slide.highlightText}
            </p>
            <p className="text-slate-600 text-xs sm:text-sm font-normal">
              {slide.offerDetails}
            </p>

            {/* Bank Instant Discount Ribbon */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white/70 border border-white/80 text-xs font-semibold backdrop-blur-md shadow-xs text-slate-700">
              <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0" />
              <span>{slide.bankOffer}</span>
            </div>

            {/* Tag Pills */}
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 pt-1">
              {slide.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2.5 py-0.5 rounded-md bg-white/65 border border-white/80 text-[11px] font-medium text-slate-700"
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
                className="px-5 py-3 rounded-xl bg-white/70 hover:bg-white border border-white text-slate-800 font-semibold text-xs transition-colors cursor-pointer"
              >
                Explore Recommendations
              </button>
            </div>
          </div>

          {/* Right Visual Card / Festive Offer Highlight */}
          <div className="hidden lg:flex flex-col items-center justify-center shrink-0">
            <div className="relative w-80 p-5 rounded-2xl bg-white/75 backdrop-blur-xl border border-white shadow-xl text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-full bg-amber-400 text-slate-950 flex items-center justify-center font-black text-xl shadow-md">
                <Tag className="w-6 h-6" />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-amber-800">
                  Exclusive Festive Bonus
                </p>
                <p className="text-lg font-black text-slate-900 mt-0.5">
                  Save Up to 70% + Extra 10%
                </p>
                <p className="text-xs text-slate-600 mt-1">
                  100% Genuine Certified · Same-Day Dispatch
                </p>
              </div>

              <div className="pt-2 border-t border-slate-200 flex items-center justify-around text-xs font-bold text-slate-700">
                <div className="flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-amber-600" />
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
          className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/80 hover:bg-white text-slate-800 flex items-center justify-center backdrop-blur-sm border border-white shadow-sm transition-transform active:scale-90 cursor-pointer z-20"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <button
          onClick={nextSlide}
          aria-label="Next Slide"
          className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/80 hover:bg-white text-slate-800 flex items-center justify-center backdrop-blur-sm border border-white shadow-sm transition-transform active:scale-90 cursor-pointer z-20"
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
                  : 'w-2 bg-slate-400/60 hover:bg-slate-500'
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};
