"use client";

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { client } from "./sanityClient"; 
import { supabase } from "./supabaseClient";
import FsLightbox from "fslightbox-react";

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [hasEntered, setHasEntered] = useState(false);
  const [voted, setVoted] = useState(false);
  const [showSwipeHint, setShowSwipeHint] = useState(true);
  const [showBackToTop, setShowBackToTop] = useState(false);

  // --- LIVE DATA STATES ---
  const [nominees, setNominees] = useState<any[]>([]);
  const [archive, setArchive] = useState<any[]>([]);
  const [photoIndices, setPhotoIndices] = useState<number[]>([]);
  const [heroVideoUrl, setHeroVideoUrl] = useState("");

  // --- LIGHTBOX STATE ---
  const [lightboxController, setLightboxController] = useState({
    toggler: false,
    slide: 1
  });

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // --- 1. INITIAL LOAD (Sanity + Vote Check) ---
  useEffect(() => {
    const fetchData = async () => {
      try {
        const checkVote = localStorage.getItem("mku_voted");
        if (checkVote) setVoted(true);

        const data = await client.fetch(`{
          "nominees": *[_type == "nominee"]{ handle, "photoUrls": photos[].asset->url },
          "archive": *[_type == "archive"]{ "url": image.asset->url },
          "settings": *[_type == "siteSettings"][0]{ "videoUrl": heroVideo.asset->url }
        }`);
        
        const { data: voteData } = await supabase.from('nominees').select('*');

        const merged = data.nominees.map((n: any) => {
          const v = voteData?.find((vd) => vd.handle === n.handle);
          return { ...n, votes: v ? v.votes : 0 };
        });
        
        setNominees(merged);
        setArchive(data.archive);
        setHeroVideoUrl(data.settings?.videoUrl);
        setPhotoIndices(new Array(data.nominees.length).fill(0));
        setLoading(false);
      } catch (err) {
        console.error("Fetch failed:", err);
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // --- 2. REAL-TIME LISTENER (Watch Supabase) ---
  useEffect(() => {
    const channel = supabase
      .channel('realtime-votes')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'nominees' }, (payload) => {
        setNominees((prev) => 
          prev.map(n => n.handle === payload.new.handle ? { ...n, votes: payload.new.votes } : n)
        );
      })
      .subscribe();
    return () => { supabase.removeChannel(channel) };
  }, []);

  // --- 3. BACK TO TOP BUTTON VISIBILITY ---
  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 300);
    };
    
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // --- 4. THE VOTE FUNCTION ---
  const handleVote = async (handle: string) => {
    if (voted) return;
    const { error } = await supabase.rpc('increment_vote', { nominee_handle: handle });
    if (!error) {
      setVoted(true);
      localStorage.setItem("mku_voted", "true");
    } else {
      alert("Vote failed to log. Check connection.");
    }
  };

  const startVibes = () => {
    setHasEntered(true);
    if (audioRef.current) {
      audioRef.current.volume = 0.4;
      audioRef.current.play().catch(() => {});
    }
  };

  const nextPhoto = (i: number, max: number) => {
    setPhotoIndices(prev => {
      const next = [...prev];
      next[i] = (next[i] + 1) % max;
      return next;
    });
  };

  const leaderVotes = Math.max(...nominees.map(n => n.votes || 0));

  return (
    <main className="bg-black text-white min-h-screen overflow-x-hidden font-sans">
      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { scrollbar-width: none; -ms-overflow-style: none; }
      `}</style>

      <audio ref={audioRef} loop src="https://files.catbox.moe/d6xb75.mp3" />

      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div key="loader" exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black flex items-center justify-center">
            <motion.p animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 2 }} className="text-[10px] tracking-[1em] uppercase italic">
              Loading memories… 💫
            </motion.p>
          </motion.div>
        ) : !hasEntered ? (
          <motion.section key="gate" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black text-center px-6">
            <h1 className="text-4xl italic tracking-[0.2em] uppercase mb-12">Yuh hadda be deh 🎉</h1>
            <button onClick={startVibes} className="px-12 py-5 rounded-full border border-white/10 bg-white/5 hover:bg-white hover:text-black transition">
              <span className="text-[10px] tracking-[0.5em] uppercase font-bold">Relive the night ⚡</span>
            </button>
          </motion.section>
        ) : (
          <motion.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.2 }}>
            
            {/* HERO SECTION */}
            <section className="relative h-[100dvh] w-full flex items-center justify-center overflow-hidden bg-black">
              {/* 1. The Video Layer - Connects to Sanity or stays as a perfect backup */}
              <video 
                autoPlay 
                loop 
                muted 
                playsInline 
                className={`absolute inset-0 w-full h-full object-cover transition-all duration-[3000ms] ${hasEntered ? 'blur-0 scale-100 opacity-60' : 'blur-xl scale-110 opacity-0'}`}
              >
                {/* If sanity video exists, use it. Otherwise, use this high-quality party backup */}
                <source src={heroVideoUrl || "https://cdn.coverr.co/videos/coverr-party-crowd-9717/1080p.mp4"} type="video/mp4" />
              </video>
              {/* 2. Professional Overlays for that "Premium Archive" look */}
              <div className="absolute inset-0 bg-gradient-to-b from-black via-transparent to-black z-10 opacity-70" />
              <div className="absolute inset-0 bg-black/40 z-10" /> 
              
              {/* 3. The Content Layer (Your Title Area) */}
              <div className="relative z-20 text-center px-4">
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={hasEntered ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 1.5, ease: "easeOut" }}
                >
                  <h3 className="text-6xl md:text-8xl italic font-light tracking-tighter uppercase leading-none">
                    PARTY IN <br />
                    <span className="font-black text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.3)]">MKU</span>
                  </h3>
                  
                  <div className="mt-8 flex flex-col items-center gap-4">
                    <div className="h-[1px] w-20 bg-white/30" />
                    <p className="text-[10px] tracking-[1.2em] uppercase opacity-60 font-medium">
                      OFFICIAL ARCHIVE 📂
                    </p>
                  </div>
                </motion.div>
              </div>
              {/* 4. Bottom Fade to make scrolling into the nominees smooth */}
              <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black to-transparent z-20" />
            </section>

            {/* BEST DRIP CAROUSEL */}
            <section className="py-32 px-4 max-w-5xl mx-auto">
              <div className="text-center mb-10">
                <h2 className="text-[9px] tracking-[1em] uppercase opacity-30 mb-2">Category 01</h2>
                <h3 className="text-2xl italic uppercase">Best Drip Award 🧥</h3>
              </div>

              <div className="relative">
                <div ref={scrollRef} onScroll={() => setShowSwipeHint(false)} className="flex gap-6 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-8">
                  {nominees.map((n, i) => {
                    const isLeader = voted && n.votes === leaderVotes && leaderVotes > 0;
                    return (
                      <div key={i} className="snap-center min-w-[280px] md:min-w-[320px] rounded-3xl p-4 border border-white/15 bg-white/5 backdrop-blur-xl relative">
                        {isLeader && (
                          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute top-14 left-8 z-20 flex items-center gap-2 bg-black/60 backdrop-blur-md px-4 py-2 rounded-full border border-yellow-500/30">
                             <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                             <span className="text-[9px] tracking-[0.3em] font-black uppercase text-yellow-500">Leader 👑</span>
                          </motion.div>
                        )}
                        <div onClick={() => nextPhoto(i, n.photoUrls?.length || 1)} className="aspect-[4/5] rounded-2xl bg-black/40 mb-4 overflow-hidden cursor-pointer group relative">
                          {n.photoUrls ? (
                            <img src={n.photoUrls[photoIndices[i]]} className="w-full h-full object-cover" alt="fit" />
                          ) : (
                            <span className="text-[9px] tracking-[0.4em] opacity-20 uppercase italic">Loading Flick...</span>
                          )}
                        </div>
                        <div className="flex justify-between mb-3 px-1">
                          <span className="text-[11px] tracking-[0.3em] uppercase font-bold">{n.handle}</span>
                          <span className="text-[10px] opacity-40">{voted ? `${n.votes} Votes` : "?? Votes"}</span>
                        </div>
                        <button 
                          onClick={() => handleVote(n.handle)}
                          disabled={voted}
                          className={`w-full py-3 rounded-full border text-[9px] tracking-[0.5em] uppercase font-bold transition ${
                            voted ? "border-white/5 text-white/30" : "border-white/30 hover:bg-white hover:text-black"
                          }`}
                        >
                          {voted ? "Logged ✅" : "Vote 🗳️"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* ARCHIVE SECTION */}
            <section className="py-32 px-4 md:px-10 bg-black border-t border-white/5">
              <div className="max-w-7xl mx-auto">
                <div className="mb-16 flex justify-between items-end">
                  <div>
                    <h3 className="text-[10px] tracking-[1em] uppercase opacity-30 italic mb-2">The Archive 📂</h3>
                    <h4 className="text-xl font-light uppercase tracking-tighter">Every Moment Captured 📸</h4>
                  </div>
                  <p className="text-[9px] opacity-40 uppercase tracking-widest pb-1">Tap to Expand & Save</p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {archive.map((item, i) => (
                    <motion.div 
                      key={i} 
                      onClick={() => setLightboxController({ toggler: !lightboxController.toggler, slide: i + 1 })}
                      className="aspect-[3/4] bg-neutral-950 rounded-2xl overflow-hidden group cursor-pointer"
                    >
                      <img src={item.url} className="w-full h-full object-cover opacity-80 group-hover:scale-110 transition-transform duration-700" alt="archive" />
                    </motion.div>
                  ))}
                </div>

                {/* The Zoom View */}
                <FsLightbox
                  toggler={lightboxController.toggler}
                  sources={archive.map(img => img.url)}
                  slide={lightboxController.slide}
                />
              </div>
            </section>

            {/* FOOTER */}
            <footer className="relative bg-black/80 border-t border-white/5 py-8 md:py-12 px-6 mt-20">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              
              <div className="max-w-6xl mx-auto">
                <div className="grid grid-cols-3 gap-2 md:gap-8 items-center">
                  
                  {/* LEFT: Socials */}
                  <div className="flex gap-3 md:gap-4 justify-start">
                    <a 
                      href="https://www.instagram.com/_benekanyarwanda/" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="w-9 h-9 md:w-11 md:h-11 rounded-full border border-white/15 flex items-center justify-center hover:border-white hover:bg-white/10 transition-all duration-300 hover:scale-110"
                      aria-label="Instagram"
                    >
                      <svg className="w-4 h-4 md:w-5 md:h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                      </svg>
                    </a>
                    
                    <a 
                      href="https://wa.me/250790955021?text=Yo%2C%20saw%20the%20MKU%20archive%20🔥" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="w-9 h-9 md:w-11 md:h-11 rounded-full border border-white/15 flex items-center justify-center hover:border-white hover:bg-white/10 transition-all duration-300 hover:scale-110"
                      aria-label="WhatsApp"
                    >
                      <svg className="w-4 h-4 md:w-5 md:h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                      </svg>
                    </a>
                  </div>

                  {/* MIDDLE: Tagline */}
                  <div className="text-center">
                    <h4 className="text-sm md:text-2xl font-light italic tracking-tight uppercase leading-tight">
                      WE HERE TO STAY <span className="font-black">MKU</span>
                    </h4>
                  </div>

                  {/* RIGHT: Credits */}
                  <div className="text-right space-y-0.5">
                    <p className="text-[7px] md:text-[9px] tracking-[0.2em] md:tracking-[0.25em] uppercase opacity-50">CURATED BY 15 ISN'T LTD</p>
                    <p className="text-[6px] md:text-[8px] tracking-[0.3em] md:tracking-[0.4em] uppercase opacity-30">PARTY IN MKU 2026</p>
                  </div>
                </div>
              </div>
            </footer>

            {/* BACK TO TOP BUTTON */}
            {showBackToTop && (
              <motion.button 
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="fixed bottom-6 right-6 w-11 h-11 rounded-full bg-white/5 border border-white/15 flex items-center justify-center hover:bg-white hover:text-black transition-all duration-300 backdrop-blur-md z-50 hover:scale-110"
                aria-label="Back to top"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
              </motion.button>
            )}

          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}