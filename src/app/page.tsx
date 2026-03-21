"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { client } from "./sanityClient";
import { supabase } from "./supabaseClient";

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [hasEntered, setHasEntered] = useState(false);
  const [voted, setVoted] = useState(false);
  const [showSwipeHint, setShowSwipeHint] = useState(true);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [swipeHintCount, setSwipeHintCount] = useState(0);

// --- 3D CAROUSEL ---
const [carouselActive, setCarouselActive] = useState(0);
const [revealedIndices, setRevealedIndices] = useState<number[]>([]);
const [carouselIsPaused, setCarouselIsPaused] = useState(false);
const carouselAutoRotate = useRef<NodeJS.Timeout | null>(null);
const carouselSwipeStartX = useRef(0);
const carouselSwipeStartY = useRef(0);
  // --- REACTIONS ---
  const [reactions, setReactions] = useState<Record<string, Record<string, number>>>({});
  const [userReactions, setUserReactions] = useState<Record<string, string | null>>({});
  const [activeReactionPicker, setActiveReactionPicker] = useState<string | null>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const [doubleTapFlash, setDoubleTapFlash] = useState(false);
  const [doubleTapPosition, setDoubleTapPosition] = useState({ x: 0, y: 0 });
  const [showGalleryBreakdown, setShowGalleryBreakdown] = useState<string | null>(null);

  // --- CUSTOM LIGHTBOX STATE ---
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [showLightboxReactions, setShowLightboxReactions] = useState(false);
  const lightboxLastTap = useRef(0);
  const lightboxLongPress = useRef<NodeJS.Timeout | null>(null);
  const swipeStartX = useRef(0);
  const swipeStartY = useRef(0);

  const REACTION_EMOJIS = ["🔥", "😂", "👑", "💪", "💀", "👎"];

  // --- LIVE DATA STATES ---
  const [nominees, setNominees] = useState<any[]>([]);
  const [archive, setArchive] = useState<any[]>([]);
  const [photoIndices, setPhotoIndices] = useState<number[]>([]);
  const [heroVideoUrl, setHeroVideoUrl] = useState("");

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const firstDripRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // --- GET USER ID (safe for Next.js) ---
  const getUserId = useCallback(() => {
    if (typeof window === "undefined") return "";
    let id = localStorage.getItem("mku_user_id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("mku_user_id", id);
    }
    return id;
  }, []);

  // --- SWIPE HINT ---
  useEffect(() => {
    if (!firstDripRef.current || swipeHintCount >= 2) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => setSwipeHintCount(1), 1000);
          setTimeout(() => setSwipeHintCount(2), 5000);
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(firstDripRef.current);
    return () => observer.disconnect();
  }, [swipeHintCount]);

  // --- PAUSE AUDIO WHEN TAB HIDDEN ---
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!audioRef.current) return;
      if (document.hidden) {
        audioRef.current.pause();
      } else if (hasEntered) {
        audioRef.current.play().catch(() => {
          console.warn("Audio autoplay blocked by browser");
        });
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [hasEntered]);

  // --- INITIAL LOAD ---
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

        const { data: voteData } = await supabase.from("nominees").select("*");

        const merged = data.nominees.map((n: any) => {
          const v = voteData?.find((vd: any) => vd.handle === n.handle);
          return { ...n, votes: v ? v.votes : 0 };
        });

       setNominees(merged);
setArchive(data.archive);
setHeroVideoUrl(data.settings?.videoUrl);
setPhotoIndices(new Array(data.nominees.length).fill(0));
setLoading(false);

// If already voted, reveal all counts immediately
const alreadyVoted = localStorage.getItem("mku_voted");
if (alreadyVoted) {
  setRevealedIndices(merged.map((_: any, idx: number) => idx));
}

      } catch (err) {
        console.error("Fetch failed:", err);
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // --- FETCH REACTIONS ---
  const fetchAllReactions = useCallback(async () => {
    const { data } = await supabase.from("photo_reactions").select("*");
    if (!data) return;
    const grouped: Record<string, Record<string, number>> = {};
    const mine: Record<string, string | null> = {};
    const userId = getUserId();
    data.forEach((r: any) => {
      if (!grouped[r.photo_url]) grouped[r.photo_url] = {};
      grouped[r.photo_url][r.emoji] = (grouped[r.photo_url][r.emoji] || 0) + 1;
      if (r.user_id === userId) mine[r.photo_url] = r.emoji;
    });
    setReactions(grouped);
    setUserReactions(mine);
  }, [getUserId]);

  useEffect(() => {
    fetchAllReactions();
  }, [fetchAllReactions]);

  // --- REALTIME VOTES ---
  useEffect(() => {
    const channel = supabase
      .channel("realtime-votes")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "nominees" }, (payload) => {
        setNominees((prev) =>
          prev.map((n) => (n.handle === payload.new.handle ? { ...n, votes: payload.new.votes } : n))
        );
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // --- REALTIME REACTIONS ---
  useEffect(() => {
    const channel = supabase
      .channel("realtime-reactions")
      .on("postgres_changes", { event: "*", schema: "public", table: "photo_reactions" }, () => {
        fetchAllReactions();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchAllReactions]);

  // --- AUTO CLOSE REACTION PICKER AFTER 3s ---
  useEffect(() => {
    if (!activeReactionPicker) return;
    const timer = setTimeout(() => setActiveReactionPicker(null), 3000);
    return () => clearTimeout(timer);
  }, [activeReactionPicker]);

  // --- CLICK OUTSIDE TO CLOSE PICKER ---
  useEffect(() => {
    if (!activeReactionPicker) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest(".reaction-picker") && !target.closest(".reaction-summary")) {
        setActiveReactionPicker(null);
      }
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [activeReactionPicker]);

  // --- AUTO HIDE GALLERY BREAKDOWN ---
  useEffect(() => {
    if (!showGalleryBreakdown) return;
    const timer = setTimeout(() => setShowGalleryBreakdown(null), 4000);
    return () => clearTimeout(timer);
  }, [showGalleryBreakdown]);

  // --- CAROUSEL AUTO ROTATE ---
useEffect(() => {
  if (carouselIsPaused || voted || nominees.length === 0) return;
  carouselAutoRotate.current = setInterval(() => {
    setCarouselActive((prev) => (prev + 1) % nominees.length);
  }, 7000);
  return () => {
    if (carouselAutoRotate.current) clearInterval(carouselAutoRotate.current);
  };
}, [carouselIsPaused, voted, nominees.length]);

  // --- BACK TO TOP ---
  useEffect(() => {
    const handleScroll = () => setShowBackToTop(window.scrollY > 300);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // --- LOCK BODY SCROLL WHEN LIGHTBOX IS OPEN ---
  useEffect(() => {
    if (lightboxOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [lightboxOpen]);

  // --- VOTE ---
  const handleVote = async (handle: string) => {
    if (voted) return;
    const { error } = await supabase.rpc("increment_vote", { nominee_handle: handle });
    if (!error) {
      setVoted(true);
      localStorage.setItem("mku_voted", "true");
    } else {
      alert("Vote failed to log. Check connection.");
    }
  };

  // --- REACT TO PHOTO ---
  const handleReaction = async (photoUrl: string, emoji: string) => {
    const userId = getUserId();
    const current = userReactions[photoUrl];

    await supabase.from("photo_reactions").delete().match({ photo_url: photoUrl, user_id: userId });

    if (current !== emoji) {
      await supabase.from("photo_reactions").insert({ photo_url: photoUrl, user_id: userId, emoji });
    }

    navigator.vibrate?.(40);

    setUserReactions((prev) => ({
      ...prev,
      [photoUrl]: current === emoji ? null : emoji,
    }));

    await fetchAllReactions();
    setActiveReactionPicker(null);
    setShowLightboxReactions(false);
  };

  // --- LONG PRESS HANDLERS (GRID) ---
  const handleLongPressStart = (photoUrl: string, e: any) => {
    if (e.cancelable) e.preventDefault();
    longPressTimer.current = setTimeout(() => {
      setActiveReactionPicker(photoUrl);
    }, 500);
  };

  const handleLongPressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  // --- OPEN LIGHTBOX ---
  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
    setShowLightboxReactions(false);
  };

  const closeLightbox = () => {
    setLightboxOpen(false);
    setShowLightboxReactions(false);
  };

  const goNext = () => {
    setLightboxIndex((prev) => (prev + 1) % archive.length);
    setShowLightboxReactions(false);
  };

  const goPrev = () => {
    setLightboxIndex((prev) => (prev - 1 + archive.length) % archive.length);
    setShowLightboxReactions(false);
  };

  // --- LIGHTBOX PHOTO TAP HANDLER (double tap = 🔥, long press = picker) ---
const handleLightboxPhotoPointerDown = (e: React.PointerEvent) => {
  e.stopPropagation();
  swipeStartX.current = e.clientX;
  swipeStartY.current = e.clientY;
  lightboxLongPress.current = setTimeout(() => {
    setShowLightboxReactions(true);
  }, 500);
};

const handleLightboxPhotoPointerUp = (e: React.PointerEvent) => {
  e.stopPropagation();

  if (lightboxLongPress.current) {
    clearTimeout(lightboxLongPress.current);
    lightboxLongPress.current = null;
  }

  const deltaX = e.clientX - swipeStartX.current;
  const deltaY = e.clientY - swipeStartY.current;

  // If it was a swipe (moved more than 50px horizontally and not mostly vertical)
  if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
    if (deltaX < 0) goNext();
    else goPrev();
    lightboxLastTap.current = 0;
    return;
  }

  // Otherwise check double tap
  const now = Date.now();
  const timeSince = now - lightboxLastTap.current;

  if (timeSince < 300 && timeSince > 0) {
    const currentPhoto = archive[lightboxIndex];
    if (currentPhoto) {
      handleReaction(currentPhoto.url, "🔥");
      setDoubleTapPosition({ x: e.clientX, y: e.clientY });
      setDoubleTapFlash(true);
      setTimeout(() => setDoubleTapFlash(false), 900);
    }
    lightboxLastTap.current = 0;
  } else {
    lightboxLastTap.current = now;
  }
};

const handleLightboxPhotoPointerLeave = () => {
  if (lightboxLongPress.current) {
    clearTimeout(lightboxLongPress.current);
    lightboxLongPress.current = null;
  }
};

  // --- NEXT PHOTO IN DRIP CAROUSEL ---
  const nextPhoto = (i: number, max: number) => {
    setPhotoIndices((prev) => {
      const next = [...prev];
      next[i] = (next[i] + 1) % max;
      return next;
    });
  };
// --- CAROUSEL FUNCTIONS ---
const carouselTotal = nominees.length;

const carouselRevealOrder = [...nominees]
  .map((n, i) => ({ votes: n.votes || 0, originalIndex: i }))
  .sort((a, b) => a.votes - b.votes)
  .map((n) => n.originalIndex);

const pauseAndResume = () => {
  setCarouselIsPaused(true);
  if (carouselAutoRotate.current) clearInterval(carouselAutoRotate.current);
  setTimeout(() => setCarouselIsPaused(false), 5000);
};

const carouselNext = () => {
  pauseAndResume();
  setCarouselActive((prev) => (prev + 1) % carouselTotal);
};

const carouselPrev = () => {
  pauseAndResume();
  setCarouselActive((prev) => (prev - 1 + carouselTotal) % carouselTotal);
};

const handleCarouselVote = async (handle: string) => {
  if (voted) return;
  const { error } = await supabase.rpc("increment_vote", { nominee_handle: handle });
  if (!error) {
    setVoted(true);
    localStorage.setItem("mku_voted", "true");
    // CINEMATIC REVEAL — last place first
    carouselRevealOrder.forEach((nomIndex, step) => {
      setTimeout(() => {
        setRevealedIndices((prev) => [...prev, nomIndex]);
      }, 400 + step * 450);
    });
  } else {
    alert("Vote failed. Check connection.");
  }
};

const getCarouselCardProps = (index: number) => {
  const diff = ((index - carouselActive) % carouselTotal + carouselTotal) % carouselTotal;
  if (diff === 0) return { zIndex: 40, scale: 1, x: "0%", rotateY: 0, opacity: 1 };
  if (diff === 1) return { zIndex: 30, scale: 0.82, x: "60%", rotateY: -28, opacity: 0.5 };
  if (diff === carouselTotal - 1) return { zIndex: 30, scale: 0.82, x: "-60%", rotateY: 28, opacity: 0.5 };
  return { zIndex: 10, scale: 0.6, x: "0%", rotateY: 180, opacity: 0 };
};
  const startVibes = () => {
    setHasEntered(true);
    if (audioRef.current) {
      audioRef.current.volume = 0.4;
      audioRef.current.play().catch(() => {
        console.warn("Audio autoplay blocked by browser");
      });
    }
  };

  const leaderVotes = Math.max(...nominees.map((n) => n.votes || 0));

  // --- CURRENT LIGHTBOX PHOTO DATA ---
  const currentLightboxPhoto = archive[lightboxIndex];
  const currentPhotoUrl = currentLightboxPhoto?.url;
  const currentPhotoReactions = reactions[currentPhotoUrl] || {};
  const currentUserReaction = userReactions[currentPhotoUrl];

  return (
    <main className="bg-black text-white min-h-screen overflow-x-hidden font-sans">
      <style>{`
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { scrollbar-width: none; -ms-overflow-style: none; }
        @keyframes gradientFlow {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>

      <audio ref={audioRef} loop src="https://files.catbox.moe/d6xb75.mp3" />

      {/* ===================== CUSTOM LIGHTBOX ===================== */}
      <AnimatePresence>
        {lightboxOpen && currentLightboxPhoto && (
          <motion.div
            key="lightbox"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9999] bg-black flex items-center justify-center"
            onClick={closeLightbox}
          >
            {/* CLOSE BUTTON */}
<button
  onClick={closeLightbox}
  className="absolute top-5 right-5 z-10 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white text-xl hover:bg-white/20 transition"
>
  ✕
</button>

{/* SHARE BUTTON */}
<button
  onClick={async (e) => {
    e.stopPropagation();
    const shareData = {
      title: "Party In MKU 🔥",
      text: "Bro Check out the archive",
      url: window.location.href,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        // user cancelled, do nothing
      }
    } else {
      await navigator.clipboard.writeText(window.location.href);
      alert("Link copied! 🔗");
    }
  }}
  className="absolute top-5 left-5 z-10 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition"
>
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
  </svg>
</button>
            {/* PREV BUTTON */}
            {archive.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); goPrev(); }}
                className="absolute left-4 z-10 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition"
              >
                ‹
              </button>
            )}

            {/* NEXT BUTTON */}
            {archive.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); goNext(); }}
                className="absolute right-4 z-10 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition"
              >
                ›
              </button>
            )}

            {/* THE PHOTO — double tap + long press attached HERE only */}
            <div
              className="relative max-w-[90vw] max-h-[90vh] select-none"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={handleLightboxPhotoPointerDown}
              onPointerUp={handleLightboxPhotoPointerUp}
              onPointerLeave={handleLightboxPhotoPointerLeave}
              style={{ touchAction: "none" }}
            >
              <img
                src={currentLightboxPhoto.url}
                className="max-w-[90vw] max-h-[85vh] object-contain rounded-2xl pointer-events-none"
                alt="photo"
                draggable={false}
              />

              {/* DOUBLE TAP 🔥 FLASH */}
              <AnimatePresence>
                {doubleTapFlash && (
                  <motion.div
                    key="flash"
                    initial={{ opacity: 1, scale: 0.5 }}
                    animate={{ opacity: 0, scale: 1.8 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.9, ease: "easeOut" }}
                    className="fixed pointer-events-none select-none z-[10001]"
                    style={{
                      left: doubleTapPosition.x - 40,
                      top: doubleTapPosition.y - 40,
                      fontSize: "80px",
                      lineHeight: 1,
                    }}
                  >
                    🔥
                  </motion.div>
                )}
              </AnimatePresence>

              {/* LIGHTBOX REACTION PICKER (long press) */}
              <AnimatePresence>
                {showLightboxReactions && (
                  <motion.div
                    key="lightbox-picker"
                    initial={{ y: 10, opacity: 0, scale: 0.9 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    exit={{ y: 10, opacity: 0, scale: 0.9 }}
                    transition={{ type: "spring", damping: 15, stiffness: 300 }}
                    className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onPointerUp={(e) => e.stopPropagation()}
                  >
                    <div className="relative p-[2px] rounded-full shadow-2xl" style={{ background: "linear-gradient(to right, #c2410c, #ea580c, #f97316)" }}>
                      <div className="relative bg-black/80 backdrop-blur-md rounded-full px-3 py-2 flex gap-2 items-center">
                        {REACTION_EMOJIS.map((emoji) => {
                          const isActive = currentUserReaction === emoji;
                          const count = currentPhotoReactions[emoji] || 0;
                          return (
                            <button
                              key={emoji}
                              onClick={() => handleReaction(currentPhotoUrl, emoji)}
                              className="flex flex-col items-center gap-0.5"
                            >
                              <span className={`text-xl transition-all ${isActive ? "scale-125 drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]" : ""}`}>
                                {emoji}
                              </span>
                              {count > 0 && (
                                <span className="text-[9px] text-white/60">{count}</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* COUNTER */}
            <div className="absolute bottom-5 left-1/2 -translate-x-1/2 text-[11px] tracking-widest opacity-40 uppercase">
              {lightboxIndex + 1} / {archive.length}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===================== MAIN PAGE ===================== */}
      <AnimatePresence mode="wait">
        {loading ? (
          <motion.div key="loader" exit={{ opacity: 0 }} className="fixed inset-0 z-[100] bg-black flex items-center justify-center">
            <motion.p
              animate={{ opacity: [0, 1, 0] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="text-[10px] tracking-[1em] uppercase italic"
            >
              Loading memories… 💫
            </motion.p>
          </motion.div>
        ) : !hasEntered ? (
          <motion.section
            key="gate"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black text-center px-6"
          >
            <h1 className="text-4xl italic tracking-[0.2em] uppercase mb-12">Yuh hadda be deh 🎉</h1>
            <button
              onClick={startVibes}
              className="px-12 py-5 rounded-full border border-white/10 bg-white/5 hover:bg-white hover:text-black transition"
            >
              <span className="text-[10px] tracking-[0.5em] uppercase font-bold">Relive the night ⚡</span>
            </button>
          </motion.section>
        ) : (
          <motion.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1.2 }}>

            {/* HERO */}
            <section className="relative h-[100dvh] w-full flex items-center justify-center overflow-hidden bg-black">
              <video
                autoPlay loop muted playsInline
                className={`absolute inset-0 w-full h-full object-cover transition-all duration-[3000ms] ${hasEntered ? "blur-0 scale-100 opacity-60" : "blur-xl scale-110 opacity-0"}`}
              >
                <source src={heroVideoUrl || "https://cdn.coverr.co/videos/coverr-party-crowd-9717/1080p.mp4"} type="video/mp4" />
              </video>
              <div className="absolute inset-0 bg-gradient-to-b from-black via-transparent to-black z-10 opacity-70" />
              <div className="absolute inset-0 bg-black/40 z-10" />
              <div className="relative z-20 text-center px-4">
                <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.5, ease: "easeOut" }}>
                  <h3 className="text-6xl md:text-8xl italic font-light tracking-tighter uppercase leading-none">
                    PARTY IN <br />
                    <span className="font-black text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.3)]">MKU</span>
                  </h3>
                  <div className="mt-8 flex flex-col items-center gap-4">
                    <div className="h-[1px] w-20 bg-white/30" />
                    <p className="text-[10px] tracking-[1.2em] uppercase opacity-60 font-medium">OFFICIAL ARCHIVE 📂</p>
                  </div>
                </motion.div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black to-transparent z-20" />
            </section>

            {/* BEST DRIP CAROUSEL */}
            <section className="py-16 px-0 overflow-hidden">
              <div className="text-center mb-10">
                <h2 className="text-[9px] tracking-[1em] uppercase opacity-30 mb-2">Category 01</h2>
                <h3 className="text-2xl italic uppercase">Best Drip Award 🧥</h3>
              </div>

              {/* 3D CAROUSEL */}
              <div
                className="relative flex items-center justify-center"
                style={{ width: "100vw", height: "520px", perspective: "1000px", touchAction: "pan-y" }}
               onPointerDown={(e) => {
  carouselSwipeStartX.current = e.clientX;
  carouselSwipeStartY.current = e.clientY;
}}
onPointerUp={(e) => {
  const deltaX = e.clientX - carouselSwipeStartX.current;
  const deltaY = e.clientY - carouselSwipeStartY.current;
  if (Math.abs(deltaX) > 50 && Math.abs(deltaX) > Math.abs(deltaY)) {
    if (deltaX < 0) carouselNext();
else carouselPrev();
  }
}}
              >
                {nominees.map((n, i) => {
                  const props = getCarouselCardProps(i);
                  const isActive = i === carouselActive;
                  const isLeader = voted && (n.votes || 0) === leaderVotes && leaderVotes > 0 && revealedIndices.includes(i);
                  const isRevealed = revealedIndices.includes(i);
                  const cardWidth = Math.min(typeof window !== "undefined" ? window.innerWidth * 0.63 : 300, 300);

                  return (
                    <motion.div
                      key={i}
                      animate={{
                        scale: props.scale,
                        x: props.x,
                        rotateY: props.rotateY,
                        opacity: props.opacity,
                        zIndex: props.zIndex,
                      }}
                      transition={{ type: "spring", stiffness: 120, damping: 25, mass: 1.2 }}
                      onClick={() => {
                        if (!isActive) {
                          const diff = ((i - carouselActive) % nominees.length + nominees.length) % nominees.length;
                          if (diff === 1) carouselNext();
                          else carouselPrev();
                        }
                      }}
                      className="absolute rounded-3xl overflow-hidden cursor-pointer"
                      style={{
                        width: `${cardWidth}px`,
                        aspectRatio: "9/13",
                        transformStyle: "preserve-3d",
                        border: "1px solid rgba(255,255,255,0.1)",
                      }}
                    >
                      {/* PHOTO */}
                      <div className="relative w-full h-full">
                        {n.photoUrls?.[photoIndices[i]] ? (
                          <img
                            src={n.photoUrls[photoIndices[i]]}
                            className="w-full h-full object-cover"
                            draggable={false}
                            onClick={() => isActive && nextPhoto(i, n.photoUrls.length)}
                          />
                        ) : (
                          <div className="w-full h-full bg-white/5 flex items-center justify-center">
                            <span className="text-[9px] tracking-[0.4em] opacity-20 uppercase italic">Loading...</span>
                          </div>
                        )}

                        {/* GRADIENT OVERLAY */}
                        <div
                          className="absolute inset-0 pointer-events-none"
                          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.15) 45%, transparent 70%)" }}
                        />

                        {/* LEADER BADGE */}
                        <AnimatePresence>
                          {isLeader && (
                            <motion.div
                              initial={{ scale: 0, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              transition={{ type: "spring", stiffness: 400, damping: 20 }}
                              className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full"
                              style={{
                                background: "rgba(0,0,0,0.65)",
                                border: "1px solid rgba(234,179,8,0.5)",
                                backdropFilter: "blur(8px)",
                              }}
                            >
                              <motion.div
                                animate={{ scale: [1, 1.5, 1] }}
                                transition={{ repeat: Infinity, duration: 1.2 }}
                                style={{ width: 7, height: 7, borderRadius: "50%", background: "#eab308" }}
                              />
                              <span style={{ fontSize: "9px", letterSpacing: "0.3em", fontWeight: 900, color: "#eab308", textTransform: "uppercase" }}>
                                Leader 👑
                              </span>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {/* HANDLE */}
                        <div className="absolute bottom-16 left-4">
                          <span style={{ fontSize: "12px", letterSpacing: "0.25em", fontWeight: 700, textTransform: "uppercase" }}>
                            {n.handle}
                          </span>
                        </div>

                        {/* BOTTOM ROW — vote + count */}
                        <div className="absolute bottom-4 left-4 right-4 flex items-center gap-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isActive && !voted) handleCarouselVote(n.handle);
                            }}
                            disabled={voted || !isActive}
                            style={{
                              flex: 1,
                              padding: "10px 0",
                              fontSize: "9px",
                              letterSpacing: "0.5em",
                              fontWeight: 800,
                              textTransform: "uppercase",
                              borderRadius: "999px",
                              border: voted ? "1px solid rgba(255,255,255,0.08)" : isActive ? "1px solid rgba(255,255,255,0.35)" : "1px solid rgba(255,255,255,0.06)",
                              background: voted ? "rgba(255,255,255,0.04)" : isActive ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.03)",
                              backdropFilter: "blur(12px)",
                              color: voted ? "rgba(255,255,255,0.25)" : isActive ? "white" : "rgba(255,255,255,0.15)",
                            }}
                          >
                            {voted ? "Logged ✅" : isActive ? "Vote 🗳️" : "· · ·"}
                          </button>

                          {/* VOTE COUNT */}
                          <AnimatePresence mode="wait">
                            {isRevealed ? (
                              <motion.div
                                key="revealed"
                                initial={{ scale: 0.7, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ type: "spring", stiffness: 400 }}
                                style={{
                                  minWidth: "44px",
                                  padding: "6px 8px",
                                  borderRadius: "999px",
                                  background: isLeader ? "rgba(234,179,8,0.18)" : "rgba(255,255,255,0.1)",
                                  border: isLeader ? "1px solid rgba(234,179,8,0.45)" : "1px solid rgba(255,255,255,0.15)",
                                  backdropFilter: "blur(12px)",
                                  textAlign: "center" as const,
                                }}
                              >
                                <div style={{ fontSize: "12px", fontWeight: 900, color: isLeader ? "#eab308" : "white" }}>
                                  {n.votes || 0}
                                </div>
                                <div style={{ fontSize: "7px", letterSpacing: "0.15em", opacity: 0.5, textTransform: "uppercase" as const }}>
                                  votes
                                </div>
                              </motion.div>
                            ) : (
                              <motion.div
                               key="hidden"
                              >
                                <div style={{ minWidth: "40px", padding: "6px 8px", borderRadius: "999px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(12px)", textAlign: "center" as const }}>
                                 <div style={{ fontSize: "11px", fontWeight: 900, color: "rgba(255,255,255,0.3)" }}>?</div>
                                 <div style={{ fontSize: "6px", letterSpacing: "0.15em", opacity: 0.4, textTransform: "uppercase" }}>votes</div>
                                  </div>
                                  </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* DOTS */}
              <div className="flex justify-center gap-2 mt-8">
                {nominees.map((_, i) => (
                  <motion.button
                    key={i}
                    animate={{ width: i === carouselActive ? 24 : 8 }}
                    onClick={() => { pauseAndResume(); setCarouselActive(i); }}
                    style={{
                      height: 8,
                      borderRadius: 999,
                      background: i === carouselActive ? "white" : "rgba(255,255,255,0.25)",
                      border: "none",
                      cursor: "pointer",
                    }}
                  />
                ))}
              </div>
            </section>

            {/* ARCHIVE SECTION */}
            <section className="py-16 px-4 md:px-10 bg-black border-t border-white/5">
              <div className="max-w-7xl mx-auto">
                <div className="mb-16 flex justify-between items-end">
                  <div>
                    <h3 className="text-[10px] tracking-[1em] uppercase opacity-30 italic mb-2">The Archive 📂</h3>
                    <h4 className="text-xl font-light uppercase tracking-tighter">Every Moment Captured 📸</h4>
                  </div>
                  <p className="text-[9px] opacity-40 uppercase tracking-widest pb-1">Long press to react</p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {archive.map((item, i) => {
                    const photoReactions = reactions[item.url] || {};
                    const topEmojis = Object.entries(photoReactions)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 3)
                      .map(([emoji]) => emoji);
                    const totalCount = Object.values(photoReactions).reduce((a, b) => a + b, 0);

                    return (
                      <div key={i} className="relative">
                        <motion.div
                          onClick={(e) => {
                            const target = e.target as HTMLElement;
                            if (target.closest(".reaction-summary") || target.closest(".reaction-breakdown")) return;
                            if (activeReactionPicker) {
                              setActiveReactionPicker(null);
                              return;
                            }
                            openLightbox(i);
                          }}
                          onPointerDown={(e) => {
                            const target = e.target as HTMLElement;
                            if (!target.closest(".reaction-summary") && !target.closest(".reaction-breakdown")) {
                              handleLongPressStart(item.url, e);
                            }
                          }}
                          onPointerUp={handleLongPressEnd}
                          onPointerLeave={handleLongPressEnd}
                          onContextMenu={(e) => e.preventDefault()}
                          className="aspect-[3/4] bg-neutral-950 rounded-2xl overflow-hidden group cursor-pointer relative"
                          style={{ touchAction: "pan-y" }}
                        >
                          <img
                            src={item.url}
                            className="w-full h-full object-cover opacity-80 group-hover:scale-110 transition-transform duration-700"
                            alt="archive"
                            draggable={false}
                          />

                          {/* REACTION SUMMARY BADGE */}
                          {totalCount > 0 && activeReactionPicker !== item.url && showGalleryBreakdown !== item.url && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowGalleryBreakdown(item.url);
                              }}
                              className="absolute bottom-2 left-2 reaction-summary"
                            >
                              <div className="relative p-[2px] rounded-full shadow-xl" style={{ background: "linear-gradient(to right, #c2410c, #ea580c, #f97316)" }}>
                                <div className="relative bg-black/70 backdrop-blur-md rounded-full px-3 py-1.5 flex items-center gap-1.5">
                                  <span className="flex -space-x-0.5">
                                    {topEmojis.map((e) => (
                                      <span key={e} className="text-sm">{e}</span>
                                    ))}
                                  </span>
                                  <span className="text-xs text-white/80">{totalCount}</span>
                                </div>
                              </div>
                            </button>
                          )}

                          {/* GALLERY BREAKDOWN */}
                          <AnimatePresence>
                            {showGalleryBreakdown === item.url && (
                              <motion.div
                                key="breakdown"
                                initial={{ y: 10, opacity: 0, scale: 0.95 }}
                                animate={{ y: 0, opacity: 1, scale: 1 }}
                                exit={{ y: 10, opacity: 0, scale: 0.95 }}
                                onClick={(e) => e.stopPropagation()}
                                className="absolute bottom-2 left-2 reaction-breakdown z-40"
                              >
                                <div className="relative p-[1.5px] rounded-full shadow-xl" style={{ background: "linear-gradient(to right, #c2410c, #ea580c, #f97316)" }}>
                                  <div className="relative bg-black/80 backdrop-blur-md rounded-full px-2 py-1.5 flex gap-1.5">
  {REACTION_EMOJIS.map(emoji => {
    const isActive = userReactions[item.url] === emoji;
    const count = photoReactions[emoji] || 0;
    return (
      <button
        key={emoji}
        onClick={(e) => {
          e.stopPropagation();
          handleReaction(item.url, emoji);
          setShowGalleryBreakdown(null);
        }}
        className="flex flex-col items-center gap-0"
      >
        <span className={`text-sm transition ${isActive ? "scale-110 drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]" : ""}`}>
          {emoji}
        </span>
        <span className="text-[8px] text-white/60">{count}</span>
      </button>
    );
  })}
</div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>

                        {/* REACTION PICKER (long press from grid) */}
                        <AnimatePresence>
                          {activeReactionPicker === item.url && (
                            <motion.div
                              key="picker"
                              initial={{ y: 20, opacity: 0, scale: 0.9 }}
                              animate={{ y: 0, opacity: 1, scale: 1 }}
                              exit={{ y: 20, opacity: 0, scale: 0.9 }}
                              transition={{ type: "spring", damping: 15, stiffness: 300 }}
                              className="absolute top-[68%] left-1/2 -translate-x-1/2 z-50 reaction-picker"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="relative p-[2px] rounded-full shadow-2xl" style={{ background: "linear-gradient(to right, #c2410c, #ea580c, #f97316)" }}>
                                <div className="relative bg-black/80 backdrop-blur-md rounded-full px-3 py-2 flex gap-2 items-center">
                                  {REACTION_EMOJIS.map((emoji, idx) => {
                                    const isActive = userReactions[item.url] === emoji;
                                    const count = photoReactions[emoji] || 0;
                                    return (
                                      <motion.button
                                        key={emoji}
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ delay: idx * 0.04, type: "spring" }}
                                        whileHover={{ scale: 1.2 }}
                                        whileTap={{ scale: 0.85 }}
                                        onClick={() => handleReaction(item.url, emoji)}
                                        className="flex flex-col items-center gap-0.5"
                                      >
                                        <span className={`text-xl transition-all ${isActive ? "scale-125 drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]" : ""}`}>
                                          {emoji}
                                        </span>
                                        {count > 0 && (
                                          <span className="text-[9px] text-white/60">{count}</span>
                                        )}
                                      </motion.button>
                                    );
                                  })}
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* FOOTER */}
            <footer className="relative bg-black/80 border-t border-white/5 py-8 md:py-12 px-6 mt-20">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
              <div className="max-w-6xl mx-auto">
                <div className="grid grid-cols-3 gap-2 md:gap-8 items-center">
                  <div className="flex gap-3 md:gap-4 justify-start">
                    <a href="https://www.instagram.com/i5.teen/" target="_blank" rel="noopener noreferrer"
                      className="w-9 h-9 md:w-11 md:h-11 rounded-full border border-white/15 flex items-center justify-center hover:border-white hover:bg-white/10 transition-all duration-300 hover:scale-110"
                      aria-label="Instagram">
                      <svg className="w-4 h-4 md:w-5 md:h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
                      </svg>
                    </a>
                    <a href="https://wa.me/250790955021?text=Yo%2C%20saw%20the%20MKU%20archive%20🔥" target="_blank" rel="noopener noreferrer"
                      className="w-9 h-9 md:w-11 md:h-11 rounded-full border border-white/15 flex items-center justify-center hover:border-white hover:bg-white/10 transition-all duration-300 hover:scale-110"
                      aria-label="WhatsApp">
                      <svg className="w-4 h-4 md:w-5 md:h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                      </svg>
                    </a>
                  </div>
                  <div className="text-center">
                    <h4 className="text-sm md:text-2xl font-light italic tracking-tight uppercase leading-tight">
                      WE HERE TO STAY <span className="font-black">MKU</span>
                    </h4>
                  </div>
                  <div className="text-right space-y-0.5">
                    <p className="text-[7px] md:text-[9px] tracking-[0.2em] md:tracking-[0.25em] uppercase opacity-50">CURATED BY 15 ISN'T LTD</p>
                    <p className="text-[6px] md:text-[8px] tracking-[0.3em] md:tracking-[0.4em] uppercase opacity-30">PARTY IN MKU 2026</p>
                  </div>
                </div>
              </div>
            </footer>

            {/* BACK TO TOP */}
            {showBackToTop && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
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