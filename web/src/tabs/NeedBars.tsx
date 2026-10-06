import { NEEDS } from '../../../src/core/types';
import type { Needs } from '../api/types';
import { NEED_EMOJI, NEED_LABEL } from '../lib/needs';

const LOW = 30;

export function NeedBars({ needs }: { needs: Needs }) {
  return (
    <div className="bars">
      {NEEDS.map((need) => (
        <div key={need} className="bar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={needs[need]} aria-label={NEED_LABEL[need]}>
          <span className="bar__emoji">{NEED_EMOJI[need]}</span>
          <div className="bar__track">
            <div className={`bar__fill ${needs[need] < LOW ? 'bar__fill--low' : ''}`} style={{ width: `${needs[need]}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
