import React from 'react';

/**
 * Malzemeler bandının sağındaki çizim: tesisat boruları ve volanlı vanalar (SVG; fotoğraf dosyası yok, her ekranda net).
 * Yalnız ENYAP mavileri; solu bandın açık zeminine karışsın diye PageHeader üstüne beyaz geçiş koyar.
 */
const Valve: React.FC<{ x: number; y: number; s: number; id: string }> = ({ x, y, s, id }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    {/* flanşlar */}
    <rect x={-40} y={-24} width={9} height={48} rx={2} fill={`url(#${id}-fl)`} />
    <rect x={31} y={-24} width={9} height={48} rx={2} fill={`url(#${id}-fl)`} />
    {/* gövde */}
    <rect x={-32} y={-15} width={64} height={30} rx={8} fill={`url(#${id}-body)`} />
    <ellipse cx={0} cy={0} rx={22} ry={21} fill={`url(#${id}-body)`} />
    <ellipse cx={-6} cy={-7} rx={9} ry={6} fill="#fff" opacity={0.22} />
    {/* kapak ve mil */}
    <rect x={-11} y={-40} width={22} height={22} rx={3} fill="#0A5FA3" />
    <rect x={-15} y={-44} width={30} height={7} rx={2} fill="#1A78C2" />
    <rect x={-2.5} y={-74} width={5} height={32} rx={1.5} fill="#8FA9C4" />
    {/* volan (hafif açılı) */}
    <g fill="none" stroke="#0B65AE" strokeLinecap="round">
      <ellipse cx={0} cy={-74} rx={34} ry={11} strokeWidth={5.5} />
      <line x1={-33} y1={-74} x2={33} y2={-74} strokeWidth={3.2} />
      <line x1={-20} y1={-82.5} x2={20} y2={-65.5} strokeWidth={3.2} />
      <line x1={20} y1={-82.5} x2={-20} y2={-65.5} strokeWidth={3.2} />
    </g>
    <ellipse cx={0} cy={-74} rx={34} ry={11} fill="none" stroke="#5DB8F0" strokeWidth={1.4} opacity={0.75} transform="translate(0 -1.5)" />
    <circle cx={0} cy={-74} r={5} fill="#0A5FA3" />
  </g>
);

/** Yatay boru (metalik), aralarda flanş halkaları */
const PipeH: React.FC<{ y: number; x1: number; x2: number; d: number; rings?: number[] }> = ({ y, x1, x2, d, rings = [] }) => (
  <g>
    <rect x={x1} y={y - d / 2} width={x2 - x1} height={d} fill="url(#pa-pipeH)" />
    {rings.map(r => <rect key={r} x={r - 3} y={y - d / 2 - 3} width={6} height={d + 6} rx={1.5} fill="url(#pa-ringH)" />)}
  </g>
);
const PipeV: React.FC<{ x: number; y1: number; y2: number; d: number; rings?: number[] }> = ({ x, y1, y2, d, rings = [] }) => (
  <g>
    <rect x={x - d / 2} y={y1} width={d} height={y2 - y1} fill="url(#pa-pipeV)" />
    {rings.map(r => <rect key={r} x={x - d / 2 - 3} y={r - 3} width={d + 6} height={6} rx={1.5} fill="url(#pa-ringV)" />)}
  </g>
);

export const PipeArt: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg aria-hidden viewBox="0 0 640 150" preserveAspectRatio="xMaxYMid slice" className={className}>
    <defs>
      <linearGradient id="pa-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#E3F0FB" /><stop offset="1" stopColor="#F4F9FE" />
      </linearGradient>
      <linearGradient id="pa-pipeH" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#A9C0D8" /><stop offset="0.35" stopColor="#F3F8FD" /><stop offset="0.7" stopColor="#C4D5E7" /><stop offset="1" stopColor="#8EA8C4" />
      </linearGradient>
      <linearGradient id="pa-pipeV" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#A9C0D8" /><stop offset="0.35" stopColor="#F3F8FD" /><stop offset="0.7" stopColor="#C4D5E7" /><stop offset="1" stopColor="#8EA8C4" />
      </linearGradient>
      <linearGradient id="pa-ringH" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#7F9AB8" /><stop offset="0.4" stopColor="#D9E5F2" /><stop offset="1" stopColor="#6C88A8" />
      </linearGradient>
      <linearGradient id="pa-ringV" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#7F9AB8" /><stop offset="0.4" stopColor="#D9E5F2" /><stop offset="1" stopColor="#6C88A8" />
      </linearGradient>
      {['pa-v1', 'pa-v2', 'pa-v3'].map(id => (
        <React.Fragment key={id}>
          <linearGradient id={`${id}-body`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#2A93E0" /><stop offset="0.55" stopColor="#006DBB" /><stop offset="1" stopColor="#0A4F8A" />
          </linearGradient>
          <linearGradient id={`${id}-fl`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#0A5596" /><stop offset="0.5" stopColor="#2F8FD6" /><stop offset="1" stopColor="#0A5596" />
          </linearGradient>
        </React.Fragment>
      ))}
      <radialGradient id="pa-glow" cx="0.7" cy="0.2" r="0.6">
        <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.9" /><stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
      </radialGradient>
    </defs>
    <rect width="640" height="150" fill="url(#pa-sky)" />
    {/* arka plan: soluk borular */}
    <g opacity={0.45}>
      <PipeH y={22} x1={0} x2={640} d={12} rings={[150, 330, 520]} />
      <PipeV x={250} y1={0} y2={150} d={11} rings={[50, 118]} />
      <PipeV x={420} y1={0} y2={150} d={13} rings={[40]} />
      <PipeV x={600} y1={0} y2={150} d={11} rings={[70]} />
    </g>
    <rect width="640" height="150" fill="url(#pa-glow)" />
    {/* orta plan */}
    <g opacity={0.8}>
      <PipeH y={66} x1={120} x2={640} d={16} rings={[300, 560]} />
      <Valve id="pa-v3" x={430} y={66} s={0.5} />
    </g>
    {/* ön plan: kalın boru ve iki büyük vana */}
    <PipeH y={122} x1={60} x2={640} d={26} rings={[180, 600]} />
    <PipeV x={250} y1={122} y2={150} d={22} />
    <Valve id="pa-v1" x={360} y={122} s={0.95} />
    <Valve id="pa-v2" x={530} y={122} s={1.12} />
  </svg>
);
