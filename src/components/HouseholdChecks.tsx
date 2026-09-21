import React from 'react';
import { Household, TempleProfile } from '../types';
import { getCheckSlots, checkKey } from '../utils/householdChecks';
export function HouseholdChecks<T extends Partial<Household>>({household, temple, onChange}: {household: T; temple?: Partial<TempleProfile>; onChange: (h: T) => void}) {
  const slots = getCheckSlots(temple);
  if (!slots.length) return null;
  return <div className="space-y-2 border-t border-[#EBE7DF] pt-2">
    <div className="text-xs font-bold text-[#777777]">チェック項目</div>
    {slots.map(({slot,name}) => <label key={slot} className="flex items-center gap-2 text-sm font-sans cursor-pointer">
      <input type="checkbox" checked={household[checkKey(slot)] === true} onChange={e => onChange({...household, [checkKey(slot)]:e.target.checked})} className="accent-[#8B7024]" />{name}
    </label>)}
  </div>;
}
