import { NEEDS } from '../../../src/core/types';
import type { Need } from '../api/types';
import { NEED_EMOJI, NEED_LABEL } from '../lib/needs';

export function NeedPicker({ value, onChange }: { value: Need | null; onChange: (need: Need) => void }) {
  return (
    <div className="needs-picker" role="radiogroup" aria-label="Куда засчитать">
      {NEEDS.map((need) => (
        <button
          key={need}
          type="button"
          role="radio"
          aria-checked={value === need}
          className={`pick ${value === need ? 'pick--on' : ''}`}
          onClick={() => onChange(need)}
        >
          <span>{NEED_EMOJI[need]}</span>
          <small>{NEED_LABEL[need]}</small>
        </button>
      ))}
    </div>
  );
}
