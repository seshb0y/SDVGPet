import type { Need, PetState } from '../api/types';
import { expressionFor, type Expression } from './expression';
import './shantik.css';

const FUR = '#e8a25c';
const FUR_INNER = '#f6c99a';
const CREAM = '#fbf3e4';
const INK = '#2b2b2b';
const PINK = '#e8697a';
const LINE = { stroke: INK, fill: 'none', strokeLinecap: 'round' } as const;

function Body() {
  return (
    <g>
      <path className="shantik__tail" d="M148 150 Q192 128 176 92 Q168 112 150 122 Z" fill={FUR} />
      <ellipse cx="100" cy="158" rx="64" ry="34" fill={CREAM} />
      <path d="M40 120 Q30 150 60 160 Q50 140 58 128Z M160 120 Q170 150 140 160 Q150 140 142 128Z" fill="#fff" />
      <ellipse cx="78" cy="186" rx="13" ry="8" fill="#fff" />
      <ellipse cx="122" cy="186" rx="13" ry="8" fill="#fff" />
    </g>
  );
}

function Head() {
  return (
    <g>
      <path d="M45 70 L58 22 L88 52 Z" fill={FUR} />
      <path d="M57 58 L62 36 L78 52 Z" fill={FUR_INNER} />
      <path d="M155 70 L142 22 L112 52 Z" fill={FUR} />
      <path d="M143 58 L138 36 L122 52 Z" fill={FUR_INNER} />
      <circle cx="100" cy="100" r="62" fill={CREAM} />
      <path d="M42 95 Q30 70 55 55 Q75 40 100 42 Q125 40 145 55 Q170 70 158 95 Q140 70 100 66 Q60 70 42 95Z" fill={FUR} />
      <ellipse cx="62" cy="118" rx="9" ry="5" fill="#f7b6b6" opacity=".7" />
      <ellipse cx="138" cy="118" rx="9" ry="5" fill="#f7b6b6" opacity=".7" />
      <ellipse cx="100" cy="114" rx="7" ry="5" fill={INK} />
    </g>
  );
}

function Eyes({ kind }: { kind: Expression['eyes'] }) {
  if (kind === 'closed' || kind === 'joy') {
    const dy = kind === 'closed' ? 6 : -12;
    return (
      <g {...LINE} strokeWidth={3}>
        <path d={`M66 100 Q76 ${100 + dy} 86 100`} />
        <path d={`M114 100 Q124 ${100 + dy} 134 100`} />
      </g>
    );
  }
  return (
    <g>
      <circle cx="76" cy="98" r="10" fill={INK} />
      <circle cx="124" cy="98" r="10" fill={INK} />
      <circle cx="79" cy="94" r="3.5" fill="#fff" />
      <circle cx="127" cy="94" r="3.5" fill="#fff" />
      {kind === 'sad' && (
        <g {...LINE} strokeWidth={3}>
          <path d="M64 86 L84 80" />
          <path d="M136 86 L116 80" />
        </g>
      )}
    </g>
  );
}

function Mouth({ kind }: { kind: Expression['mouth'] }) {
  if (kind === 'sad') return <path d="M90 128 Q100 121 110 128" {...LINE} strokeWidth={2.5} />;
  return (
    <g>
      <path d="M88 122 Q94 128 100 122 Q106 128 112 122" {...LINE} strokeWidth={2.5} />
      {kind === 'tongue' && <path d="M95 125 Q100 142 105 125Z" fill={PINK} />}
    </g>
  );
}

function Prop({ need }: { need: Need }) {
  switch (need) {
    case 'food':
      return (
        <g className="shantik__prop">
          <ellipse cx="170" cy="176" rx="20" ry="5" fill="#8a5a2b" />
          <path d="M150 176 h40 l-6 16 h-28 Z" fill="#6aa9d8" />
        </g>
      );
    case 'walk':
      return (
        <g className="shantik__prop">
          <path d="M154 190 Q158 150 178 158 Q192 166 182 182" stroke="#d1495b" strokeWidth="4" fill="none" strokeLinecap="round" />
          <circle cx="154" cy="190" r="5" fill="#d1495b" />
        </g>
      );
    case 'play':
      return (
        <g className="shantik__prop">
          <circle cx="170" cy="178" r="13" fill="#c8e05a" />
          <path d="M158 172 Q170 178 182 172 M158 184 Q170 178 182 184" stroke="#fff" strokeWidth="2" fill="none" />
        </g>
      );
    case 'love':
      return <path className="shantik__prop" d="M170 192 C152 178 156 162 170 170 C184 162 188 178 170 192 Z" fill={PINK} />;
  }
}

function Extra({ kind }: { kind: Expression['extra'] }) {
  if (kind === 'zzz') {
    return (
      <g className="shantik__zzz" fill="#9aa7c7" fontWeight="700">
        <text x="150" y="40" fontSize="18">z</text>
        <text x="164" y="26" fontSize="14">z</text>
        <text x="176" y="14" fontSize="10">z</text>
      </g>
    );
  }
  if (kind === 'sparkles') {
    return (
      <g className="shantik__sparkles" fill="#f2b53b">
        <text x="22" y="40" fontSize="20">✦</text>
        <text x="166" y="34" fontSize="16">✦</text>
        <text x="176" y="120" fontSize="14">✦</text>
      </g>
    );
  }
  return null;
}

const LABEL: Record<Expression['motion'], string> = {
  idle: 'Шантик спокоен',
  bounce: 'Шантик счастлив',
  tilt: 'Шантик просит внимания',
  breathe: 'Шантик спит',
  jump: 'Шантик радуется',
};

export function Shantik({ mood, celebrating }: { mood: PetState; celebrating: boolean }) {
  const face = expressionFor(mood, celebrating);
  return (
    <svg className={`shantik shantik--${face.motion}`} viewBox="0 0 200 200" width="200" height="200" role="img" aria-label={LABEL[face.motion]}>
      <g className="shantik__body">
        <Body />
        <Head />
        <Eyes kind={face.eyes} />
        <Mouth kind={face.mouth} />
      </g>
      {face.prop && <Prop need={face.prop} />}
      <Extra kind={face.extra} />
    </svg>
  );
}
