'use client';

import { useMemo } from 'react';
import { type CelebrationMode } from '@/lib/holidayThemes';

// ─── CSS keyframes ────────────────────────────────────────────────────────────
const KEYFRAMES = `
@keyframes cs-bulb-glow{0%,100%{opacity:.82;box-shadow:0 0 6px 4px var(--bclr,#fff)}50%{opacity:1;box-shadow:0 0 18px 8px var(--bclr,#fff)}}
@keyframes cs-egg-bob{0%,100%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-8px) rotate(3deg)}}
@keyframes cs-lantern-sway{0%,100%{transform:rotate(-7deg) translateY(0)}50%{transform:rotate(7deg) translateY(4px)}}
@keyframes cs-flicker{0%,100%{opacity:1;transform:scaleX(1) scaleY(1)}30%{opacity:.8;transform:scaleX(.93) scaleY(1.07)}65%{opacity:.92;transform:scaleX(1.04) scaleY(.95)}}
@keyframes cs-rise{0%{transform:translateY(0) scale(1);opacity:1}100%{transform:translateY(-130px) scale(.1);opacity:0}}
@keyframes cs-fall{0%{transform:translateY(-40px) rotate(0deg) translateX(0);opacity:1}100%{transform:translateY(100vh) rotate(400deg) translateX(var(--cx,0px));opacity:.7}}
@keyframes cs-heart-rise{0%{transform:translateY(0) scale(1) rotate(var(--r,0deg));opacity:.9}100%{transform:translateY(-85vh) scale(.4) rotate(var(--r,0deg));opacity:0}}
@keyframes cs-bat{0%{transform:translate(0,0) scaleX(1)}25%{transform:translate(22px,-14px) scaleX(-1)}50%{transform:translate(0,-5px) scaleX(1)}75%{transform:translate(-18px,-18px) scaleX(-1)}100%{transform:translate(0,0) scaleX(1)}}
@keyframes cs-pulse-bright{0%,100%{opacity:.35;filter:brightness(1)}50%{opacity:.8;filter:brightness(1.5)}}
@keyframes cs-sparkle{0%,100%{opacity:0;transform:scale(0)}50%{opacity:1;transform:scale(1)}}
@keyframes cs-web-appear{from{opacity:0}to{opacity:.45}}
@keyframes cs-hang-bob{0%,100%{transform:translateY(0) rotate(-2deg)}50%{transform:translateY(-6px) rotate(2deg)}}
@keyframes cs-star-twinkle{0%,100%{opacity:.3;transform:scale(.7) rotate(0deg)}50%{opacity:1;transform:scale(1.15) rotate(15deg)}}
@keyframes cs-petal-fall{0%{transform:translateY(-30px) rotate(0deg) translateX(0);opacity:1}100%{transform:translateY(100vh) rotate(320deg) translateX(var(--cx,0px));opacity:.6}}
@keyframes cs-crescent-glow{0%,100%{filter:drop-shadow(0 0 4px #fbbf24)}50%{filter:drop-shadow(0 0 14px #fbbf24)}}
@keyframes cs-lotus-float{0%,100%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-9px) rotate(3deg)}}
@keyframes cs-zap-fall{0%{transform:translateY(-30px) rotate(-10deg);opacity:.9}100%{transform:translateY(100vh) rotate(20deg);opacity:.5}}
@keyframes cs-bunting-sway{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(3deg)}}
`;

// ─── helpers ──────────────────────────────────────────────────────────────────
function styleTag(css: string) {
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}

/** Deterministic — same value SSR & browser (rounded to avoid float precision mismatch) */
function rand(min: number, max: number, seed: number) {
  const x = Math.sin(seed + 1) * 10000;
  const raw = min + ((x - Math.floor(x)) * (max - min));
  return Math.round(raw * 100) / 100;
}

/** Evenly-spaced left positions across the full viewport as percentages */
function spreadLeft(count: number, minPct = 2, maxPct = 98): string[] {
  return Array.from({ length: count }, (_, i) =>
    `${(minPct + (i / Math.max(count - 1, 1)) * (maxPct - minPct)).toFixed(2)}%`
  );
}

function TopWire({ color = 'rgba(50,50,50,0.75)' }: { color?: string }) {
  return <div style={{ position:'absolute', top:0, left:0, right:0, height:'2px', background:color }} />;
}

// ═══════════════════════════════════════════════════════════════════════════
// CHRISTMAS / BOXING DAY — fairy lights full width
// ═══════════════════════════════════════════════════════════════════════════
const BULB_COLORS = ['#ff3b3b','#ffcc00','#3bff6e','#3bb4ff','#ff8c00','#ff3b3b','#3bff6e','#ffcc00','#ff8c00','#3bb4ff'];

function ChristmasLights() {
  const count = 24;
  const positions = spreadLeft(count);
  const bulbs = useMemo(() => positions.map((left, i) => ({
    left,
    drop: rand(14, 40, i * 3.7),
    color: BULB_COLORS[i % BULB_COLORS.length]!,
    delay: rand(0, 2.4, i * 1.9),
    dur: rand(1.4, 2.8, i * 2.3),
  })), []);// eslint-disable-line

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[99]" aria-hidden>
      <TopWire color="rgba(50,50,50,0.85)" />
      {bulbs.map((b, i) => (
        <div key={i} style={{ position:'absolute', left:b.left, top:0, display:'flex', flexDirection:'column', alignItems:'center' }}>
          <div style={{ width:'1.5px', height:`${b.drop}px`, background:'rgba(50,50,50,0.7)' }} />
          <div style={{ width:'6px', height:'4px', background:'#555', borderRadius:'2px 2px 0 0' }} />
          <div style={{
            width:'10px', height:'14px',
            borderRadius:'50% 50% 50% 50% / 40% 40% 60% 60%',
            background: b.color,
            ['--bclr' as string]: b.color,
            animation:`cs-bulb-glow ${b.dur}s ease-in-out ${b.delay}s infinite`,
          } as React.CSSProperties} />
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Generic wire-hang helper — items spread across full viewport
// ═══════════════════════════════════════════════════════════════════════════
function WireHang({ wireColor, items }: {
  wireColor: string;
  items: { left: string; drop: number; children: React.ReactNode; delay: number; dur: number }[];
}) {
  return (
    <div className="pointer-events-none fixed inset-0 z-[99]" aria-hidden>
      <TopWire color={wireColor} />
      {items.map((item, i) => (
        <div key={i} style={{ position:'absolute', left:item.left, top:0, display:'flex', flexDirection:'column', alignItems:'center' }}>
          <div style={{ width:'1.5px', height:`${item.drop}px`, background:wireColor }} />
          <div style={{ animation:`cs-hang-bob ${item.dur}s ease-in-out ${item.delay}s infinite` }}>
            {item.children}
          </div>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// EASTER — eggs full width
// ═══════════════════════════════════════════════════════════════════════════
const EGG_COLORS = [
  ['#f9a8d4','#f472b6'],['#86efac','#4ade80'],['#93c5fd','#60a5fa'],
  ['#fde68a','#fbbf24'],['#c4b5fd','#a78bfa'],['#fed7aa','#fb923c'],
  ['#a5f3fc','#22d3ee'],['#bbf7d0','#34d399'],
];

function EasterOverlay() {
  const count = 10;
  const positions = spreadLeft(count);
  const eggs = useMemo(() => positions.map((left, i) => ({
    left,
    drop: rand(18, 50, i * 3.7),
    size: rand(20, 32, i * 2.7),
    delay: rand(0, 1.8, i * 1.6),
    dur: rand(2.2, 3.8, i * 2.1),
    colors: EGG_COLORS[i % EGG_COLORS.length]!,
  })), []);// eslint-disable-line

  return (
    <div className="pointer-events-none fixed inset-0 z-[99]" aria-hidden>
      <TopWire color="rgba(180,140,80,0.55)" />
      {eggs.map((e, i) => (
        <div key={i} style={{ position:'absolute', left:e.left, top:0, display:'flex', flexDirection:'column', alignItems:'center' }}>
          <div style={{ width:'1.5px', height:`${e.drop}px`, background:'rgba(180,140,80,0.5)' }} />
          <svg viewBox="0 0 40 52" style={{
            width:`${e.size}px`, height:`${e.size*1.3}px`,
            filter:'drop-shadow(0 2px 5px rgba(0,0,0,0.12))',
            animation:`cs-egg-bob ${e.dur}s ease-in-out ${e.delay}s infinite`,
          }}>
            <defs>
              <linearGradient id={`eg${i}`} x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={e.colors[0]} />
                <stop offset="100%" stopColor={e.colors[1]} />
              </linearGradient>
            </defs>
            <path d="M20 2 C10 2 2 14 2 28 C2 40 10 50 20 50 C30 50 38 40 38 28 C38 14 30 2 20 2Z" fill={`url(#eg${i})`} />
            <path d="M5 26 Q20 22 35 26" stroke="rgba(255,255,255,0.5)" strokeWidth="2" fill="none" />
            <path d="M4 30 Q20 34 36 30" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" fill="none" />
          </svg>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HALLOWEEN — cobwebs + bats spread across screen
// ═══════════════════════════════════════════════════════════════════════════
function HalloweenOverlay() {
  const bats = useMemo(() => [
    { left:'18%', top:80,  size:24, delay:0,   dur:4.2 },
    { left:'32%', top:140, size:18, delay:0.8, dur:3.6 },
    { left:'50%', top:70,  size:22, delay:1.5, dur:5.0 },
    { left:'65%', top:110, size:20, delay:0.3, dur:4.5 },
    { left:'80%', top:60,  size:18, delay:1.2, dur:3.8 },
    { left:'91%', top:130, size:16, delay:0.6, dur:4.0 },
  ], []);

  return (
    <div className="pointer-events-none fixed inset-0 z-[99]" aria-hidden>
      <svg width="160" height="140" viewBox="0 0 160 140" style={{ position:'absolute', left:0, top:0, opacity:0.42, animation:'cs-web-appear 1.2s ease forwards' }}>
        <g stroke="#bbb" strokeWidth="0.7" fill="none">
          {[18,34,54,78,110].map((r,i)=>(<path key={i} d={`M0,0 Q${r*.55},${r*.38} ${r},${r*.78}`} />))}
          {[14,28,48,72,104].map((r,i)=>(<ellipse key={i} cx="0" cy="0" rx={r} ry={r*.68} />))}
        </g>
      </svg>
      <svg width="140" height="120" viewBox="0 0 140 120" style={{ position:'absolute', right:0, top:0, opacity:0.35, transform:'scaleX(-1)', animation:'cs-web-appear 1.4s ease forwards' }}>
        <g stroke="#bbb" strokeWidth="0.7" fill="none">
          {[16,30,48,70,98].map((r,i)=>(<path key={i} d={`M0,0 Q${r*.55},${r*.38} ${r},${r*.78}`} />))}
          {[12,26,44,68,96].map((r,i)=>(<ellipse key={i} cx="0" cy="0" rx={r} ry={r*.68} />))}
        </g>
      </svg>
      {bats.map((b, i) => (
        <svg key={i} viewBox="0 0 32 20" style={{
          position:'absolute', top:`${b.top}px`, left:b.left,
          width:`${b.size}px`, height:`${b.size*.65}px`,
          fill:'#2d1b4e', opacity:.72,
          animation:`cs-bat ${b.dur}s ease-in-out ${b.delay}s infinite`,
        }}>
          <path d="M16 10 C10 4 2 2 0 8 C3 8 5 9 6 12 C8 10 11 10 13 12 C14 11 15 10 16 10 Z" />
          <path d="M16 10 C22 4 30 2 32 8 C29 8 27 9 26 12 C24 10 21 10 19 12 C18 11 17 10 16 10 Z" />
          <ellipse cx="16" cy="12" rx="2.5" ry="3" />
        </svg>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// DIWALI — diyas on wire full width + sparkles
// ═══════════════════════════════════════════════════════════════════════════
function DiwaliOverlay() {
  const count = 12;
  const positions = spreadLeft(count);
  const diyas = useMemo(() => positions.map((left, i) => ({
    left, drop: rand(10, 28, i * 3.1),
    size: rand(22, 34, i * 2.3), delay: rand(0, 1.4, i * 1.7), dur: rand(1.1, 2.0, i * 1.3),
  })), []);// eslint-disable-line

  const sparkles = useMemo(() => Array.from({ length: 18 }, (_, i) => ({
    top:`${rand(10,88,i*4.7)}%`, left:`${rand(2,96,i*3.3)}%`,
    size:rand(4,10,i*2.1), delay:rand(0,3,i*0.9), dur:rand(1.5,3,i*1.1),
    color:['#facc15','#fb923c','#f472b6','#e879f9','#fbbf24'][i%5]!,
  })), []);

  return (
    <div className="pointer-events-none fixed inset-0 z-[99]" aria-hidden>
      <TopWire color="rgba(80,50,10,0.5)" />
      {diyas.map((d, i) => (
        <div key={i} style={{ position:'absolute', left:d.left, top:0, display:'flex', flexDirection:'column', alignItems:'center' }}>
          <div style={{ width:'1.5px', height:`${d.drop}px`, background:'rgba(80,50,10,0.4)' }} />
          <div style={{
            width:`${d.size*.36}px`, height:`${d.size*.5}px`, margin:'0 auto',
            background:'linear-gradient(to top,#f97316,#facc15,#fff7)',
            borderRadius:'50% 50% 30% 30% / 60% 60% 40% 40%',
            animation:`cs-flicker ${d.dur}s ease-in-out ${d.delay}s infinite`,
            boxShadow:`0 0 7px 3px #fb923c70`,
          }} />
          <svg viewBox="0 0 40 18" style={{ width:`${d.size}px`, display:'block' }}>
            <path d="M4 4 Q6 16 20 16 Q34 16 36 4 Z" fill="#c2410c" />
            <path d="M2 5 Q6 2 20 2 Q34 2 38 5" stroke="#92400e" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          </svg>
        </div>
      ))}
      {sparkles.map((s, i) => (
        <div key={i} style={{
          position:'absolute', top:s.top, left:s.left,
          width:`${s.size}px`, height:`${s.size}px`, borderRadius:'50%',
          background:s.color, animation:`cs-sparkle ${s.dur}s ease-in-out ${s.delay}s infinite`, filter:'blur(1px)',
        }} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BONFIRE NIGHT — embers rising from bottom full width
// ═══════════════════════════════════════════════════════════════════════════
function BonfireOverlay() {
  const embers = useMemo(() => Array.from({ length: 28 }, (_, i) => ({
    left:`${rand(2,96,i*3.3)}%`, bottom:`${rand(0,12,i*2.1)}%`,
    size:rand(3,8,i*1.7), delay:rand(0,3,i*0.8), dur:rand(1.5,3.5,i*1.3),
    color:['#ef4444','#f97316','#facc15','#fbbf24'][i%4]!,
  })), []);

  return (
    <div className="pointer-events-none fixed inset-0 z-[99]" aria-hidden>
      {embers.map((e, i) => (
        <div key={i} style={{
          position:'absolute', left:e.left, bottom:e.bottom,
          width:`${e.size}px`, height:`${e.size}px`, borderRadius:'50%',
          background:e.color, boxShadow:`0 0 6px 2px ${e.color}`,
          animation:`cs-rise ${e.dur}s ease-out ${e.delay}s infinite`,
        }} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// NEW YEAR'S — confetti full width
// ═══════════════════════════════════════════════════════════════════════════
const CONF_COLORS = ['#f43f5e','#3b82f6','#22c55e','#facc15','#a855f7','#fb923c','#06b6d4'];

function NewYearsOverlay() {
  const pieces = useMemo(() => Array.from({ length: 40 }, (_, i) => ({
    left:`${rand(1,98,i*3.7)}%`, size:rand(6,13,i*2.3), delay:rand(0,5,i*0.7),
    dur:rand(3,6,i*1.1), cx:`${rand(-40,40,i*1.9)}px`,
    color:CONF_COLORS[i%CONF_COLORS.length]!, isRect:i%3!==0,
  })), []);

  return (
    <div className="pointer-events-none fixed inset-0 z-[99] overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <div key={i} style={{
          position:'absolute', top:0, left:p.left,
          width:`${p.size}px`, height:p.isRect ? `${p.size*.45}px` : `${p.size}px`,
          borderRadius:p.isRect ? '1px' : '50%', background:p.color,
          ['--cx' as string]: p.cx,
          animation:`cs-fall ${p.dur}s linear ${p.delay}s infinite`,
        } as React.CSSProperties} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// VALENTINE'S DAY — hearts rising full width
// ═══════════════════════════════════════════════════════════════════════════
function ValentinesOverlay() {
  const hearts = useMemo(() => Array.from({ length: 18 }, (_, i) => ({
    left:`${rand(2,96,i*4.7)}%`, bottom:`${rand(0,8,i*3.1)}%`,
    size:rand(16,30,i*2.9), delay:rand(0,6,i*1.1), dur:rand(4,8,i*1.7),
    r:`${rand(-20,20,i*2.3)}deg`, opacity:rand(0.55,0.92,i*1.3),
    color:['#f43f5e','#fb7185','#fda4af','#e11d48','#ff6b9d'][i%5]!,
  })), []);

  return (
    <div className="pointer-events-none fixed inset-0 z-[99]" aria-hidden>
      {hearts.map((h, i) => (
        <svg key={i} viewBox="0 0 24 24" style={{
          position:'absolute', bottom:h.bottom, left:h.left,
          width:`${h.size}px`, height:`${h.size}px`, fill:h.color, opacity:h.opacity,
          filter:'drop-shadow(0 1px 4px rgba(244,63,94,0.3))',
          ['--r' as string]: h.r,
          animation:`cs-heart-rise ${h.dur}s ease-out ${h.delay}s infinite`,
        } as React.CSSProperties}>
          <path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402 0-3.791 3.068-5.191 5.281-5.191 1.312 0 4.151.501 5.719 4.457 1.59-3.968 4.464-4.447 5.726-4.447 2.54 0 5.274 1.621 5.274 5.181 0 4.069-5.136 8.625-11 14.402z" />
        </svg>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HOLI — colour blobs full width
// ═══════════════════════════════════════════════════════════════════════════
function HoliOverlay() {
  const blobs = useMemo(() => Array.from({ length: 14 }, (_, i) => ({
    top:`${rand(5,88,i*5.3)}%`, left:`${rand(1,94,i*4.1)}%`,
    size:rand(60,120,i*3.7), delay:rand(0,4,i*1.2), dur:rand(2.5,5,i*1.8),
    color:['#ec4899','#8b5cf6','#06b6d4','#f59e0b','#22c55e','#ef4444','#3b82f6'][i%7]!,
    opacity:rand(0.18,0.42,i*1.1),
  })), []);

  return (
    <div className="pointer-events-none fixed inset-0 z-[99]" aria-hidden>
      {blobs.map((b, i) => (
        <div key={i} style={{
          position:'absolute', top:b.top, left:b.left,
          width:`${b.size}px`, height:`${b.size*.7}px`, borderRadius:'50%',
          background:b.color, opacity:b.opacity, filter:'blur(22px)',
          animation:`cs-pulse-bright ${b.dur}s ease-in-out ${b.delay}s infinite`,
        }} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HANUKKAH — menorah centred + sparkles full width
// ═══════════════════════════════════════════════════════════════════════════
function HanukkahOverlay() {
  const sparkles = useMemo(() => Array.from({ length: 20 }, (_, i) => ({
    top:`${rand(8,90,i*4.3)}%`, left:`${rand(2,96,i*3.7)}%`,
    size:rand(4,10,i*2.1), delay:rand(0,3,i*0.9), dur:rand(1.5,3,i*1.3),
    color:['#60a5fa','#93c5fd','#dbeafe','#facc15','#fde68a'][i%5]!,
  })), []);

  return (
    <div className="pointer-events-none fixed inset-0 z-[99]" aria-hidden>
      <div style={{ position:'absolute', top:'10px', left:'50%', transform:'translateX(-50%)', display:'flex', alignItems:'flex-end', gap:'5px' }}>
        {Array.from({ length: 9 }, (_, i) => (
          <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center' }}>
            <div style={{
              width:'6px', height:'13px',
              background:'linear-gradient(to top,#f97316,#facc15,#fff8)',
              borderRadius:'50% 50% 30% 30% / 60% 60% 40% 40%',
              boxShadow:'0 0 8px 4px #fbbf2460',
              animation:`cs-flicker ${1.2+(i%3)*.35}s ease-in-out ${i*.22}s infinite`, marginBottom:'2px',
            }} />
            <div style={{
              width:'8px', height:i===4 ? '34px' : '26px',
              background:i===4 ? 'linear-gradient(#e879f9,#a78bfa)' : `hsl(${220+i*10},75%,62%)`,
              borderRadius:'2px 2px 0 0', boxShadow:`0 0 4px 1px hsl(${220+i*10},75%,62%)`,
            }} />
          </div>
        ))}
      </div>
      {sparkles.map((s, i) => (
        <div key={i} style={{
          position:'absolute', top:s.top, left:s.left,
          width:`${s.size}px`, height:`${s.size}px`, borderRadius:'50%',
          background:s.color, opacity:.75,
          animation:`cs-sparkle ${s.dur}s ease-in-out ${s.delay}s infinite`,
        }} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// THANKSGIVING — leaves falling full width
// ═══════════════════════════════════════════════════════════════════════════
function ThanksgivingOverlay() {
  const leaves = useMemo(() => Array.from({ length: 22 }, (_, i) => ({
    left:`${rand(1,98,i*4.9)}%`, size:rand(14,28,i*3.1),
    delay:rand(0,8,i*0.9), dur:rand(4,10,i*1.7), cx:`${rand(-30,30,i*2.3)}px`,
    color:['#b45309','#d97706','#f59e0b','#ea580c','#c2410c','#92400e'][i%6]!,
  })), []);

  return (
    <div className="pointer-events-none fixed inset-0 z-[99] overflow-hidden" aria-hidden>
      {leaves.map((l, i) => (
        <svg key={i} viewBox="0 0 24 24" style={{
          position:'absolute', top:0, left:l.left,
          width:`${l.size}px`, height:`${l.size}px`, fill:l.color, opacity:.85,
          ['--cx' as string]: l.cx,
          animation:`cs-fall ${l.dur}s ease-in ${l.delay}s infinite`,
        } as React.CSSProperties}>
          <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A4.49 4.49 0 0 0 8 20C19 20 22 3 22 3c-1 2-2 4-8 5z" />
        </svg>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// LUNAR NEW YEAR — lanterns full width
// ═══════════════════════════════════════════════════════════════════════════
function LunarNewYearOverlay() {
  const count = 10;
  const positions = spreadLeft(count);
  const lanterns = useMemo(() => positions.map((left, i) => ({
    left, drop: rand(18, 55, i * 3.7), size: rand(26, 42, i * 2.9),
    delay: rand(0, 2, i * 1.1), dur: rand(2.5, 4, i * 1.7),
    color: i%3===0 ? '#dc2626' : i%3===1 ? '#d97706' : '#b91c1c',
    glow: i%2===0 ? '#ef444470' : '#fbbf2450',
  })), []);// eslint-disable-line

  return (
    <div className="pointer-events-none fixed inset-0 z-[99]" aria-hidden>
      <TopWire color="rgba(80,30,10,0.7)" />
      {lanterns.map((l, i) => (
        <div key={i} style={{
          position:'absolute', top:0, left:l.left,
          display:'flex', flexDirection:'column', alignItems:'center',
          transformOrigin:'top center',
          animation:`cs-lantern-sway ${l.dur}s ease-in-out ${l.delay}s infinite`,
        }}>
          <div style={{ width:'1.5px', height:`${l.drop}px`, background:'rgba(80,30,10,0.55)' }} />
          <svg viewBox="0 0 36 62" style={{ width:`${l.size}px`, filter:`drop-shadow(0 0 8px ${l.glow})` }}>
            <rect x="12" y="0" width="12" height="5" rx="2" fill="#7f1d1d" />
            <ellipse cx="18" cy="30" rx="14" ry="22" fill={l.color} />
            <ellipse cx="18" cy="30" rx="10" ry="17" fill="none" stroke="rgba(255,200,100,0.22)" strokeWidth="1.5" />
            <line x1="4" y1="30" x2="32" y2="30" stroke="rgba(255,200,100,0.16)" strokeWidth="1" />
            <line x1="7" y1="20" x2="29" y2="20" stroke="rgba(255,200,100,0.13)" strokeWidth="1" />
            <line x1="7" y1="40" x2="29" y2="40" stroke="rgba(255,200,100,0.13)" strokeWidth="1" />
            <rect x="14" y="51" width="8" height="5" rx="1" fill="#7f1d1d" />
            {[14,17,20,23].map((x,ti)=>(<line key={ti} x1={x} y1="56" x2={x-1} y2="64" stroke="#fbbf24" strokeWidth="1" />))}
          </svg>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PRIDE — rainbow strips + sparkles full width
// ═══════════════════════════════════════════════════════════════════════════
function PrideOverlay() {
  const sparkles = useMemo(() => Array.from({ length: 20 }, (_, i) => ({
    top:`${rand(8,90,i*4.1)}%`, left:`${rand(2,96,i*3.7)}%`,
    size:rand(5,11,i*2.3), delay:rand(0,4,i*0.8), dur:rand(1.8,3.5,i*1.2),
    color:['#e40303','#ff8c00','#ffed00','#008026','#004dff','#750787'][i%6]!,
  })), []);

  return (
    <div className="pointer-events-none fixed inset-0 z-[99]" aria-hidden>
      <div style={{ position:'absolute', top:0, left:0, right:0, height:'5px', background:'linear-gradient(90deg,#e40303,#ff8c00,#ffed00,#008026,#004dff,#750787)', opacity:.85 }} />
      <div style={{ position:'absolute', bottom:0, left:0, right:0, height:'3px', background:'linear-gradient(90deg,#750787,#004dff,#008026,#ffed00,#ff8c00,#e40303)', opacity:.5 }} />
      {sparkles.map((s, i) => (
        <div key={i} style={{
          position:'absolute', top:s.top, left:s.left,
          width:`${s.size}px`, height:`${s.size}px`, borderRadius:'50%',
          background:s.color, opacity:.65,
          animation:`cs-sparkle ${s.dur}s ease-in-out ${s.delay}s infinite`,
        }} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// FLOWERS (Women's Day / Mother's Day) — full width wire
// ═══════════════════════════════════════════════════════════════════════════
function FlowerOverlay({ colors }: { colors: [string, string, string] }) {
  const count = 10;
  const positions = spreadLeft(count);
  const flowers = useMemo(() => positions.map((left, i) => ({
    left, drop: rand(14, 44, i * 3.1), size: rand(18, 30, i * 2.7),
    delay: rand(0, 2, i * 1.3), dur: rand(2, 3.5, i * 1.9),
  })), []);// eslint-disable-line

  const petals = useMemo(() => Array.from({ length: 18 }, (_, i) => ({
    left:`${rand(1,98,i*4.1)}%`, size:rand(8,16,i*2.3),
    delay:rand(0,7,i*0.9), dur:rand(4,9,i*1.5), cx:`${rand(-25,25,i*2.1)}px`,
    color:colors[i%3],
  })), [colors]);

  return (
    <div className="pointer-events-none fixed inset-0 z-[99] overflow-hidden" aria-hidden>
      <TopWire color="rgba(180,80,160,0.4)" />
      {flowers.map((f, i) => (
        <div key={i} style={{ position:'absolute', left:f.left, top:0, display:'flex', flexDirection:'column', alignItems:'center' }}>
          <div style={{ width:'1.5px', height:`${f.drop}px`, background:'rgba(180,80,160,0.35)' }} />
          <svg viewBox="0 0 32 32" style={{
            width:`${f.size}px`, height:`${f.size}px`,
            filter:'drop-shadow(0 1px 4px rgba(0,0,0,0.12))',
            animation:`cs-hang-bob ${f.dur}s ease-in-out ${f.delay}s infinite`,
          }}>
            {[0,60,120,180,240,300].map((rot,pi)=>(
              <ellipse key={pi} cx="16" cy="8" rx="5" ry="8" fill={colors[pi%3]} opacity=".85" transform={`rotate(${rot} 16 16)`} />
            ))}
            <circle cx="16" cy="16" r="5" fill="#fde68a" />
          </svg>
        </div>
      ))}
      {petals.map((p, i) => (
        <svg key={i} viewBox="0 0 24 24" style={{
          position:'absolute', top:0, left:p.left,
          width:`${p.size}px`, height:`${p.size}px`, fill:p.color, opacity:.75,
          ['--cx' as string]: p.cx,
          animation:`cs-petal-fall ${p.dur}s ease-in ${p.delay}s infinite`,
        } as React.CSSProperties}>
          <ellipse cx="12" cy="6" rx="5" ry="9" />
        </svg>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// EARTH DAY — globes on wire + falling leaves full width
// ═══════════════════════════════════════════════════════════════════════════
function EarthDayOverlay() {
  const count = 8;
  const positions = spreadLeft(count);
  const globes = useMemo(() => positions.map((left, i) => ({
    left, drop: rand(14, 42, i * 3.1), size: rand(24, 36, i * 2.7),
    delay: rand(0, 1.8, i * 1.3), dur: rand(2.2, 3.8, i * 1.9),
  })), []);// eslint-disable-line

  const leaves = useMemo(() => Array.from({ length: 18 }, (_, i) => ({
    left:`${rand(1,98,i*4.3)}%`, size:rand(12,24,i*3.1),
    delay:rand(0,7,i*0.9), dur:rand(4,10,i*1.7), cx:`${rand(-22,22,i*2.1)}px`,
    color:['#15803d','#16a34a','#4ade80','#22c55e','#86efac'][i%5]!,
  })), []);

  return (
    <div className="pointer-events-none fixed inset-0 z-[99] overflow-hidden" aria-hidden>
      <TopWire color="rgba(21,128,61,0.5)" />
      {globes.map((g, i) => (
        <div key={i} style={{ position:'absolute', left:g.left, top:0, display:'flex', flexDirection:'column', alignItems:'center' }}>
          <div style={{ width:'1.5px', height:`${g.drop}px`, background:'rgba(21,128,61,0.4)' }} />
          <svg viewBox="0 0 36 36" style={{
            width:`${g.size}px`, height:`${g.size}px`,
            animation:`cs-hang-bob ${g.dur}s ease-in-out ${g.delay}s infinite`,
          }}>
            <circle cx="18" cy="18" r="16" fill="#0ea5e9" opacity=".9" />
            <path d="M8 14 Q12 10 16 14 Q18 16 22 12 Q26 8 28 14 Q30 18 26 22 Q22 26 18 22 Q14 18 8 14Z" fill="#16a34a" opacity=".9" />
            <path d="M4 20 Q8 18 12 22 Q14 24 18 22" fill="#16a34a" opacity=".7" />
            <circle cx="18" cy="18" r="16" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
          </svg>
        </div>
      ))}
      {leaves.map((l, i) => (
        <svg key={i} viewBox="0 0 24 24" style={{
          position:'absolute', top:0, left:l.left,
          width:`${l.size}px`, height:`${l.size}px`, fill:l.color, opacity:.82,
          ['--cx' as string]: l.cx,
          animation:`cs-fall ${l.dur}s ease-in ${l.delay}s infinite`,
        } as React.CSSProperties}>
          <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A4.49 4.49 0 0 0 8 20C19 20 22 3 22 3c-1 2-2 4-8 5z" />
        </svg>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// RAMADAN — moon + stars on wire full width
// ═══════════════════════════════════════════════════════════════════════════
function RamadanOverlay() {
  const count = 10;
  const positions = spreadLeft(count);
  const items = useMemo(() => positions.map((left, i) => ({
    left, drop: rand(14, 40, i * 3.1), size: rand(18, 30, i * 2.7),
    delay: rand(0, 1.6, i * 1.3), dur: rand(2, 3.5, i * 1.9),
    isMoon: i % 3 === 0,
  })), []);// eslint-disable-line

  const sparkles = useMemo(() => Array.from({ length: 16 }, (_, i) => ({
    top:`${rand(8,90,i*4.3)}%`, left:`${rand(2,96,i*3.9)}%`,
    size:rand(4,9,i*2.1), delay:rand(0,3,i*0.9), dur:rand(1.5,3,i*1.3),
    color:['#fbbf24','#fde68a','#34d399','#6ee7b7'][i%4]!,
  })), []);

  return (
    <div className="pointer-events-none fixed inset-0 z-[99]" aria-hidden>
      <TopWire color="rgba(120,80,10,0.45)" />
      {items.map((it, i) => (
        <div key={i} style={{ position:'absolute', left:it.left, top:0, display:'flex', flexDirection:'column', alignItems:'center' }}>
          <div style={{ width:'1.5px', height:`${it.drop}px`, background:'rgba(120,80,10,0.35)' }} />
          {it.isMoon ? (
            <svg viewBox="0 0 32 32" style={{
              width:`${it.size}px`, height:`${it.size}px`,
              animation:`cs-crescent-glow ${it.dur}s ease-in-out ${it.delay}s infinite`,
            }}>
              <path d="M22 16 A12 12 0 1 1 10 16 A8 8 0 0 0 22 16Z" fill="#fbbf24" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" style={{
              width:`${it.size}px`, height:`${it.size}px`, fill:'#fde68a',
              animation:`cs-star-twinkle ${it.dur}s ease-in-out ${it.delay}s infinite`,
            }}>
              <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
            </svg>
          )}
        </div>
      ))}
      {sparkles.map((s, i) => (
        <div key={i} style={{
          position:'absolute', top:s.top, left:s.left,
          width:`${s.size}px`, height:`${s.size}px`, borderRadius:'50%',
          background:s.color, opacity:.7,
          animation:`cs-sparkle ${s.dur}s ease-in-out ${s.delay}s infinite`,
        }} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// EID — crescents + stars + confetti full width
// ═══════════════════════════════════════════════════════════════════════════
function EidOverlay({ green }: { green?: boolean }) {
  const accentColor = green ? '#16a34a' : '#7c3aed';
  const sparkColors = green
    ? ['#4ade80','#fbbf24','#86efac','#fde68a']
    : ['#a78bfa','#fbbf24','#c4b5fd','#fde68a'];

  const count = 10;
  const positions = spreadLeft(count);
  const items = useMemo(() => positions.map((left, i) => ({
    left, drop: rand(14, 40, i * 3.1), size: rand(18, 28, i * 2.7),
    delay: rand(0, 1.6, i * 1.3), dur: rand(2, 3.5, i * 1.9),
    isMoon: i % 3 === 0,
  })), []);// eslint-disable-line

  const confetti = useMemo(() => Array.from({ length: 30 }, (_, i) => ({
    left:`${rand(1,98,i*3.7)}%`, size:rand(5,11,i*2.3), delay:rand(0,5,i*0.7),
    dur:rand(3,6,i*1.1), cx:`${rand(-30,30,i*1.9)}px`,
    color:sparkColors[i%4]!, isRect:i%3!==0,
  })), [sparkColors]);

  return (
    <div className="pointer-events-none fixed inset-0 z-[99] overflow-hidden" aria-hidden>
      <TopWire color={`${accentColor}60`} />
      {items.map((it, i) => (
        <div key={i} style={{ position:'absolute', left:it.left, top:0, display:'flex', flexDirection:'column', alignItems:'center' }}>
          <div style={{ width:'1.5px', height:`${it.drop}px`, background:`${accentColor}50` }} />
          {it.isMoon ? (
            <svg viewBox="0 0 32 32" style={{
              width:`${it.size}px`, height:`${it.size}px`,
              animation:`cs-crescent-glow ${it.dur}s ease-in-out ${it.delay}s infinite`,
            }}>
              <path d="M22 16 A12 12 0 1 1 10 16 A8 8 0 0 0 22 16Z" fill="#fbbf24" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" style={{
              width:`${it.size}px`, height:`${it.size}px`, fill:'#fde68a',
              animation:`cs-star-twinkle ${it.dur}s ease-in-out ${it.delay}s infinite`,
            }}>
              <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
            </svg>
          )}
        </div>
      ))}
      {confetti.map((p, i) => (
        <div key={i} style={{
          position:'absolute', top:0, left:p.left,
          width:`${p.size}px`, height:p.isRect ? `${p.size*.45}px` : `${p.size}px`,
          borderRadius:p.isRect ? '1px' : '50%', background:p.color,
          ['--cx' as string]: p.cx,
          animation:`cs-fall ${p.dur}s linear ${p.delay}s infinite`,
        } as React.CSSProperties} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// ROSH HASHANAH — apples + honey jars on wire full width
// ═══════════════════════════════════════════════════════════════════════════
function RoshHashanahOverlay() {
  const count = 10;
  const positions = spreadLeft(count);
  const items = useMemo(() => positions.map((left, i) => ({
    left, drop: rand(14, 40, i * 3.1), size: rand(20, 30, i * 2.7),
    delay: rand(0, 1.8, i * 1.3), dur: rand(2.2, 3.8, i * 1.9),
    type: i % 3 === 0 ? 'honey' : i % 3 === 1 ? 'apple' : 'star',
  })), []);// eslint-disable-line

  return (
    <div className="pointer-events-none fixed inset-0 z-[99]" aria-hidden>
      <TopWire color="rgba(161,98,7,0.45)" />
      {items.map((it, i) => (
        <div key={i} style={{ position:'absolute', left:it.left, top:0, display:'flex', flexDirection:'column', alignItems:'center' }}>
          <div style={{ width:'1.5px', height:`${it.drop}px`, background:'rgba(161,98,7,0.35)' }} />
          {it.type === 'apple' && (
            <svg viewBox="0 0 32 36" style={{ width:`${it.size}px`, height:`${it.size*1.1}px`, animation:`cs-hang-bob ${it.dur}s ease-in-out ${it.delay}s infinite` }}>
              <path d="M16 2 Q18 0 20 2" stroke="#15803d" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              <ellipse cx="16" cy="10" rx="3" ry="4" fill="#15803d" opacity=".7" />
              <path d="M6 16 Q6 6 16 6 Q26 6 26 16 Q26 30 16 32 Q6 30 6 16Z" fill="#dc2626" />
              <path d="M10 14 Q12 10 16 12" stroke="rgba(255,200,200,0.5)" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            </svg>
          )}
          {it.type === 'honey' && (
            <svg viewBox="0 0 28 36" style={{ width:`${it.size}px`, height:`${it.size*1.25}px`, animation:`cs-hang-bob ${it.dur}s ease-in-out ${it.delay}s infinite` }}>
              <rect x="9" y="0" width="10" height="5" rx="2" fill="#92400e" />
              <path d="M4 8 Q4 6 14 6 Q24 6 24 8 L22 30 Q22 34 14 34 Q6 34 6 30Z" fill="#f59e0b" />
              <path d="M8 14 Q14 12 20 14" stroke="rgba(255,220,100,0.5)" strokeWidth="1" fill="none" />
              <path d="M7 20 Q14 18 21 20" stroke="rgba(255,220,100,0.4)" strokeWidth="1" fill="none" />
            </svg>
          )}
          {it.type === 'star' && (
            <svg viewBox="0 0 24 24" style={{ width:`${it.size}px`, height:`${it.size}px`, fill:'#fbbf24', animation:`cs-star-twinkle ${it.dur}s ease-in-out ${it.delay}s infinite` }}>
              <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
            </svg>
          )}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// PASSOVER — Star of David + wine cups full width
// ═══════════════════════════════════════════════════════════════════════════
function PassoverOverlay() {
  const count = 10;
  const positions = spreadLeft(count);
  const items = useMemo(() => positions.map((left, i) => ({
    left, drop: rand(14, 38, i * 3.1), size: rand(18, 28, i * 2.7),
    delay: rand(0, 1.8, i * 1.3), dur: rand(2.2, 3.8, i * 1.9),
    type: i % 2 === 0 ? 'star6' : 'cup',
  })), []);// eslint-disable-line

  return (
    <div className="pointer-events-none fixed inset-0 z-[99]" aria-hidden>
      <TopWire color="rgba(30,58,138,0.4)" />
      {items.map((it, i) => (
        <div key={i} style={{ position:'absolute', left:it.left, top:0, display:'flex', flexDirection:'column', alignItems:'center' }}>
          <div style={{ width:'1.5px', height:`${it.drop}px`, background:'rgba(30,58,138,0.35)' }} />
          {it.type === 'star6' && (
            <svg viewBox="0 0 24 24" style={{ width:`${it.size}px`, height:`${it.size}px`, animation:`cs-hang-bob ${it.dur}s ease-in-out ${it.delay}s infinite` }}>
              <polygon points="12,2 14.5,8.5 21.5,8.5 16,13 18.5,20 12,16 5.5,20 8,13 2.5,8.5 9.5,8.5" fill="#1d4ed8" opacity=".85" />
              <polygon points="12,22 9.5,15.5 2.5,15.5 8,11 5.5,4 12,8 18.5,4 16,11 21.5,15.5 14.5,15.5" fill="#93c5fd" opacity=".5" />
            </svg>
          )}
          {it.type === 'cup' && (
            <svg viewBox="0 0 24 32" style={{ width:`${it.size}px`, height:`${it.size*1.3}px`, animation:`cs-hang-bob ${it.dur}s ease-in-out ${it.delay}s infinite` }}>
              <path d="M6 2 Q4 4 5 14 Q6 22 12 24 Q18 22 19 14 Q20 4 18 2Z" fill="#7c3aed" opacity=".9" />
              <path d="M8 4 Q6 10 8 16" stroke="rgba(200,180,255,0.4)" strokeWidth="1.2" fill="none" strokeLinecap="round" />
              <rect x="9" y="24" width="6" height="4" rx="1" fill="#6d28d9" />
              <rect x="6" y="28" width="12" height="2" rx="1" fill="#5b21b6" />
            </svg>
          )}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// YOM KIPPUR — solemn white candles at bottom full width
// ═══════════════════════════════════════════════════════════════════════════
function YomKippurOverlay() {
  const count = 9;
  const positions = spreadLeft(count);
  const candles = useMemo(() => positions.map((left, i) => ({
    left, bottom:`${rand(1,8,i*2.1)}%`, height:rand(34,52,i*2.7),
    delay:rand(0,1.2,i*1.3), dur:rand(1.3,2,i*1.1),
  })), []);// eslint-disable-line

  return (
    <div className="pointer-events-none fixed inset-0 z-[99]" aria-hidden>
      <div style={{ position:'absolute', top:0, left:0, right:0, height:'3px', background:'linear-gradient(90deg,#e2e8f0,#94a3b8,#e2e8f0)', opacity:.6 }} />
      {candles.map((c, i) => (
        <div key={i} style={{ position:'absolute', bottom:c.bottom, left:c.left, display:'flex', flexDirection:'column', alignItems:'center' }}>
          <div style={{
            width:'6px', height:'12px',
            background:'linear-gradient(to top,#f97316,#fde68a,#fff9)',
            borderRadius:'50% 50% 30% 30% / 60% 60% 40% 40%',
            boxShadow:'0 0 8px 3px #fbbf2450',
            animation:`cs-flicker ${c.dur}s ease-in-out ${c.delay}s infinite`, marginBottom:'2px',
          }} />
          <div style={{
            width:'8px', height:`${c.height}px`,
            background:'linear-gradient(#f8fafc,#e2e8f0)', borderRadius:'2px 2px 0 0',
            boxShadow:'0 0 4px 1px rgba(255,255,255,0.3)',
          }} />
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// VESAK — lotus flowers on wire full width
// ═══════════════════════════════════════════════════════════════════════════
function VesakOverlay() {
  const count = 10;
  const positions = spreadLeft(count);
  const lotuses = useMemo(() => positions.map((left, i) => ({
    left, drop: rand(16, 44, i * 3.1), size: rand(20, 32, i * 2.7),
    delay: rand(0, 1.8, i * 1.3), dur: rand(2.2, 3.8, i * 1.9),
  })), []);// eslint-disable-line

  const sparkles = useMemo(() => Array.from({ length: 16 }, (_, i) => ({
    top:`${rand(8,90,i*4.3)}%`, left:`${rand(2,96,i*3.7)}%`,
    size:rand(4,9,i*2.1), delay:rand(0,3,i*0.9), dur:rand(1.5,3,i*1.3),
    color:['#e879f9','#c084fc','#fde68a','#a5f3fc'][i%4]!,
  })), []);

  return (
    <div className="pointer-events-none fixed inset-0 z-[99]" aria-hidden>
      <TopWire color="rgba(192,132,252,0.4)" />
      {lotuses.map((l, i) => (
        <div key={i} style={{ position:'absolute', left:l.left, top:0, display:'flex', flexDirection:'column', alignItems:'center' }}>
          <div style={{ width:'1.5px', height:`${l.drop}px`, background:'rgba(192,132,252,0.35)' }} />
          <svg viewBox="0 0 36 36" style={{
            width:`${l.size}px`, height:`${l.size}px`,
            filter:'drop-shadow(0 1px 5px rgba(192,132,252,0.4))',
            animation:`cs-lotus-float ${l.dur}s ease-in-out ${l.delay}s infinite`,
          }}>
            {[0,45,90,135,180,225,270,315].map((rot,pi)=>(
              <ellipse key={pi} cx="18" cy="9" rx="4" ry="9"
                fill={pi%2===0 ? '#f0abfc' : '#e879f9'} opacity=".8"
                transform={`rotate(${rot} 18 18)`} />
            ))}
            <circle cx="18" cy="18" r="5" fill="#fde68a" />
            <circle cx="18" cy="18" r="3" fill="#fbbf24" />
          </svg>
        </div>
      ))}
      {sparkles.map((s, i) => (
        <div key={i} style={{
          position:'absolute', top:s.top, left:s.left,
          width:`${s.size}px`, height:`${s.size}px`, borderRadius:'50%',
          background:s.color, opacity:.7,
          animation:`cs-sparkle ${s.dur}s ease-in-out ${s.delay}s infinite`,
        }} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// BLACK FRIDAY — price tags on wire + lightning bolts falling
// ═══════════════════════════════════════════════════════════════════════════
function BlackFridayOverlay() {
  const count = 8;
  const positions = spreadLeft(count);
  const PRICES = ['50%','30%','70%','25%','40%','60%','20%','80%'];
  const tags = useMemo(() => positions.map((left, i) => ({
    left, drop: rand(14, 38, i * 3.1), size: rand(22, 30, i * 2.7),
    delay: rand(0, 1.8, i * 1.3), dur: rand(2.2, 3.8, i * 1.9),
    price: PRICES[i % PRICES.length]!,
  })), []);// eslint-disable-line

  const bolts = useMemo(() => Array.from({ length: 16 }, (_, i) => ({
    left:`${rand(1,98,i*4.7)}%`, size:rand(14,24,i*3.1),
    delay:rand(0,6,i*0.9), dur:rand(3,7,i*1.5),
  })), []);

  return (
    <div className="pointer-events-none fixed inset-0 z-[99] overflow-hidden" aria-hidden>
      <TopWire color="rgba(30,30,30,0.7)" />
      {tags.map((t, i) => (
        <div key={i} style={{ position:'absolute', left:t.left, top:0, display:'flex', flexDirection:'column', alignItems:'center' }}>
          <div style={{ width:'1.5px', height:`${t.drop}px`, background:'rgba(30,30,30,0.5)' }} />
          <svg viewBox="0 0 36 42" style={{ width:`${t.size}px`, height:`${t.size*1.15}px`, animation:`cs-hang-bob ${t.dur}s ease-in-out ${t.delay}s infinite` }}>
            <circle cx="18" cy="5" r="3" fill="none" stroke="#374151" strokeWidth="1.5" />
            <path d="M6 8 L6 34 Q6 38 18 38 Q30 38 30 34 L30 8 Q18 5 6 8Z" fill="#111827" />
            <text x="18" y="24" textAnchor="middle" fill="#facc15" fontSize="9" fontWeight="bold" fontFamily="sans-serif">{t.price}</text>
            <text x="18" y="33" textAnchor="middle" fill="#9ca3af" fontSize="5.5" fontFamily="sans-serif">OFF</text>
          </svg>
        </div>
      ))}
      {bolts.map((b, i) => (
        <svg key={i} viewBox="0 0 24 24" style={{
          position:'absolute', top:0, left:b.left,
          width:`${b.size}px`, height:`${b.size}px`, fill:'#facc15', opacity:.8,
          animation:`cs-zap-fall ${b.dur}s ease-in ${b.delay}s infinite`,
        }}>
          <path d="M13 2L4.5 13.5H11L9 22l10-12.5H13L13 2z" />
        </svg>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// FATHER'S DAY — neckties on wire full width + stars
// ═══════════════════════════════════════════════════════════════════════════
const TIE_COLORS = ['#1d4ed8','#0369a1','#7c3aed','#1d4ed8','#0369a1','#6d28d9','#1e40af','#0284c7'];

function FathersDayOverlay() {
  const count = 8;
  const positions = spreadLeft(count);
  const ties = useMemo(() => positions.map((left, i) => ({
    left, drop: rand(14, 36, i * 3.1), size: rand(18, 26, i * 2.7),
    delay: rand(0, 1.8, i * 1.3), dur: rand(2.2, 3.8, i * 1.9),
    color: TIE_COLORS[i % TIE_COLORS.length]!,
  })), []);// eslint-disable-line

  const stars = useMemo(() => Array.from({ length: 16 }, (_, i) => ({
    top:`${rand(8,90,i*4.3)}%`, left:`${rand(2,96,i*3.9)}%`,
    size:rand(8,14,i*2.1), delay:rand(0,3,i*0.9), dur:rand(2,3.5,i*1.3),
    color:['#60a5fa','#fbbf24','#93c5fd','#fde68a'][i%4]!,
  })), []);

  return (
    <div className="pointer-events-none fixed inset-0 z-[99]" aria-hidden>
      <TopWire color="rgba(29,78,216,0.4)" />
      {ties.map((t, i) => (
        <div key={i} style={{ position:'absolute', left:t.left, top:0, display:'flex', flexDirection:'column', alignItems:'center' }}>
          <div style={{ width:'1.5px', height:`${t.drop}px`, background:'rgba(29,78,216,0.35)' }} />
          <svg viewBox="0 0 24 48" style={{ width:`${t.size}px`, height:`${t.size*2}px`, animation:`cs-hang-bob ${t.dur}s ease-in-out ${t.delay}s infinite` }}>
            <path d="M8 2 L16 2 L14 10 L12 8 L10 10 Z" fill={t.color} />
            <path d="M10 10 L6 38 L12 46 L18 38 L14 10 Z" fill={t.color} opacity=".9" />
            <path d="M11 12 L9 32" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      ))}
      {stars.map((s, i) => (
        <svg key={i} viewBox="0 0 24 24" style={{
          position:'absolute', top:s.top, left:s.left,
          width:`${s.size}px`, height:`${s.size}px`, fill:s.color, opacity:.7,
          animation:`cs-star-twinkle ${s.dur}s ease-in-out ${s.delay}s infinite`,
        }}>
          <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z" />
        </svg>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// EARLY MAY BANK HOLIDAY — Union Jack bunting full width + spring petals
// ═══════════════════════════════════════════════════════════════════════════
const BUNTING_COLORS = ['#ef4444','#f8f8f8','#3b82f6','#ef4444','#f8f8f8','#3b82f6','#ef4444','#f8f8f8','#3b82f6','#fbbf24'];

function EarlyMayOverlay() {
  const count = 18;
  const positions = spreadLeft(count);
  const flags = useMemo(() => positions.map((left, i) => ({
    left,
    drop: rand(10, 28, i * 3.1),
    color: BUNTING_COLORS[i % BUNTING_COLORS.length]!,
    delay: rand(0, 1.5, i * 1.7),
    dur: rand(2, 3.5, i * 2.1),
  })), []);// eslint-disable-line

  const petals = useMemo(() => Array.from({ length: 18 }, (_, i) => ({
    left:`${rand(1,98,i*4.1)}%`, size:rand(8,15,i*2.3),
    delay:rand(0,7,i*0.9), dur:rand(4,9,i*1.5), cx:`${rand(-22,22,i*2.1)}px`,
    color:['#fde68a','#86efac','#93c5fd','#f9a8d4','#c4b5fd'][i%5]!,
  })), []);

  return (
    <div className="pointer-events-none fixed inset-0 z-[99] overflow-hidden" aria-hidden>
      <TopWire color="rgba(30,30,80,0.5)" />
      {flags.map((f, i) => (
        <div key={i} style={{ position:'absolute', left:f.left, top:0, display:'flex', flexDirection:'column', alignItems:'center' }}>
          <div style={{ width:'1.5px', height:`${f.drop}px`, background:'rgba(30,30,80,0.4)' }} />
          <svg viewBox="0 0 20 26" style={{ width:'14px', height:'18px', animation:`cs-bunting-sway ${f.dur}s ease-in-out ${f.delay}s infinite` }}>
            <polygon points="0,0 20,0 10,26" fill={f.color} opacity={f.color === '#f8f8f8' ? 0.8 : 0.9} />
            {f.color === '#ef4444' && (
              <>
                <line x1="0" y1="0" x2="10" y2="26" stroke="#fff" strokeWidth="1.5" opacity=".35" />
                <line x1="20" y1="0" x2="10" y2="26" stroke="#fff" strokeWidth="1.5" opacity=".35" />
                <line x1="10" y1="0" x2="10" y2="26" stroke="#fff" strokeWidth="2" opacity=".4" />
              </>
            )}
          </svg>
        </div>
      ))}
      {petals.map((p, i) => (
        <svg key={i} viewBox="0 0 24 24" style={{
          position:'absolute', top:0, left:p.left,
          width:`${p.size}px`, height:`${p.size}px`, fill:p.color, opacity:.75,
          ['--cx' as string]: p.cx,
          animation:`cs-petal-fall ${p.dur}s ease-in ${p.delay}s infinite`,
        } as React.CSSProperties}>
          <ellipse cx="12" cy="6" rx="5" ry="9" />
        </svg>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════
export function HolidayOverlay({ mode }: { mode: CelebrationMode }) {
  if (mode === 'off') return null;
  return (
    <>
      {styleTag(KEYFRAMES)}
      <Decoration mode={mode} />
    </>
  );
}

function Decoration({ mode }: { mode: CelebrationMode }) {
  switch (mode) {
    case 'christmas':
    case 'boxing_day':             return <ChristmasLights />;
    case 'halloween':              return <HalloweenOverlay />;
    case 'easter':
    case 'good_friday':
    case 'palm_sunday':            return <EasterOverlay />;
    case 'diwali':                 return <DiwaliOverlay />;
    case 'bonfire_night':          return <BonfireOverlay />;
    case 'new_years_day':          return <NewYearsOverlay />;
    case 'valentines_day':         return <ValentinesOverlay />;
    case 'holi':                   return <HoliOverlay />;
    case 'hanukkah':               return <HanukkahOverlay />;
    case 'thanksgiving':           return <ThanksgivingOverlay />;
    case 'lunar_new_year':         return <LunarNewYearOverlay />;
    case 'pride':                  return <PrideOverlay />;
    case 'international_womens_day': return <FlowerOverlay colors={['#c084fc','#e879f9','#f0abfc']} />;
    case 'mothers_day':            return <FlowerOverlay colors={['#f9a8d4','#fb7185','#fda4af']} />;
    case 'earth_day':              return <EarthDayOverlay />;
    case 'ramadan':                return <RamadanOverlay />;
    case 'eid_al_fitr':            return <EidOverlay />;
    case 'eid_al_adha':            return <EidOverlay green />;
    case 'rosh_hashanah':          return <RoshHashanahOverlay />;
    case 'passover':               return <PassoverOverlay />;
    case 'yom_kippur':             return <YomKippurOverlay />;
    case 'vesak':                  return <VesakOverlay />;
    case 'black_friday':           return <BlackFridayOverlay />;
    case 'fathers_day':            return <FathersDayOverlay />;
    case 'early_may_bank_holiday': return <EarlyMayOverlay />;
    default:                       return null;
  }
}
