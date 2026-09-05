import React from 'react';
import { Household, TempleInfo, TempleProfile } from '../types';
import { getHouseholdTempleMeta } from '../utils/templeUtils';

interface HouseholdTempleBadgeProps {
  household?: { templeId?: string } | null;
  templeId?: string;
  temples?: TempleProfile[];
  mainTempleInfo?: TempleInfo;
  size?: '2xs' | 'xs' | 'sm' | 'md';
  variant?: 'full' | 'short';
  className?: string;
}

export const HouseholdTempleBadge: React.FC<HouseholdTempleBadgeProps> = ({
  household,
  templeId,
  temples = [],
  mainTempleInfo,
  size = 'xs',
  variant = 'full',
  className = '',
}) => {
  const meta = getHouseholdTempleMeta(
    household || (templeId ? { templeId } : null),
    temples,
    mainTempleInfo
  );

  const sizeClasses = {
    '2xs': 'text-[9px] px-1 py-0.2',
    xs: 'text-[10px] px-1.5 py-0.5',
    sm: 'text-[11px] px-2 py-0.5',
    md: 'text-xs px-2.5 py-1',
  }[size];

  const label = variant === 'short' ? meta.shortBadgeLabel : meta.badgeLabel;

  if (meta.isAffiliated) {
    return (
      <span
        className={`inline-flex items-center gap-1 font-bold rounded-xs border shadow-2xs whitespace-nowrap bg-purple-100 text-purple-900 border-purple-300 ${sizeClasses} ${className}`}
        title={`所属寺院: ${meta.fullName}（兼務寺院）`}
      >
        <span
          className="w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: meta.color || '#9333EA' }}
        />
        <span>{label}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 font-bold rounded-xs border shadow-2xs whitespace-nowrap bg-amber-100 text-amber-900 border-amber-300 ${sizeClasses} ${className}`}
      title={`所属寺院: ${meta.fullName}（本寺）`}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: meta.color || '#D97706' }}
      />
      <span>{label}</span>
    </span>
  );
};
