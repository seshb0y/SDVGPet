import type { PetState } from '../api/types';
import ask from './clips/ask.mp4';
import happy from './clips/happy.mp4';
import joy from './clips/joy.mp4';
import ok from './clips/ok.mp4';
import sleepClip from './clips/sleep.mp4';
import { expressionFor, type Expression } from './expression';
import awake from './img/awake.webp';
import sleep from './img/sleep.webp';
import './shantik.css';

/** Первые кадры роликов: заставка, пока ролик грузится, и замена ему при «уменьшить движение». */
const FRAME: Record<Expression['pose'], string> = { awake, sleep };
const CLIP: Record<Expression['motion'], string> = { idle: ok, bounce: happy, tilt: ask, breathe: sleepClip, jump: joy };
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
        <text x="14" y="130" fontSize="14">✦</text>
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
  const clip = reducedMotion() ? undefined : CLIP[face.motion];
  return (
    <div className={`shantik shantik--${face.motion}`} role="img" aria-label={LABEL[face.motion]}>
      {clip ? (
        // радость играет один раз, остальные состояния — бесконечной петлёй
        <video key={clip} className="shantik__clip" src={clip} poster={FRAME[face.pose]} autoPlay loop={face.motion !== 'jump'} muted playsInline aria-hidden="true" />
      ) : (
        <img className="shantik__pet" src={FRAME[face.pose]} alt="" draggable={false} />
      )}
      <svg className="shantik__overlay" viewBox="0 0 200 200" aria-hidden="true">
        <Extra kind={face.extra} />
      </svg>
    </div>
  );
}
