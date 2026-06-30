'use client';

/**
 * Brand Logo Component
 *
 * Renders the app logo based on the white-label config.
 * Supports three modes:
 *   - 'url': renders an <img> from a file path
 *   - 'svg': renders inline SVG markup
 *   - 'text': renders the app name with a colored icon
 *
 * Usage:
 *   <BrandLogo size="sm" />   → sidebar compact
 *   <BrandLogo size="md" />   → sidebar header
 *   <BrandLogo size="lg" />   → login/splash screen
 */

import { useBranding, useThemeConfig } from '@/lib/white-label/config-context';
import { Shield } from 'lucide-react';

type LogoSize = 'sm' | 'md' | 'lg';

interface BrandLogoProps {
  size?: LogoSize;
  showText?: boolean;
  className?: string;
}

const sizeMap = {
  sm: { icon: 'h-6 w-6', iconInner: 'h-3 w-3', text: 'text-sm', container: 'gap-2' },
  md: { icon: 'h-8 w-8', iconInner: 'h-4 w-4', text: 'text-lg', container: 'gap-2' },
  lg: { icon: 'h-12 w-12', iconInner: 'h-6 w-6', text: 'text-2xl', container: 'gap-3' },
};

const imgSizeMap = {
  sm: { width: 24, height: 24 },
  md: { width: 32, height: 32 },
  lg: { width: 48, height: 48 },
};

export function BrandLogo({ size = 'md', showText = true, className = '' }: BrandLogoProps) {
  const branding = useBranding();
  const theme = useThemeConfig();
  const s = sizeMap[size];
  const imgSize = imgSizeMap[size];

  // ─── URL Logo ────────────────────────────────────────────────────────────────
  if (branding.logo.type === 'url' && branding.logo.value) {
    return (
      <div className={`flex items-center ${s.container} ${className}`}>
        <img
          src={branding.logo.value}
          alt={`${branding.appName} logo`}
          width={imgSize.width}
          height={imgSize.height}
          className={`${s.icon} object-contain`}
        />
        {showText && (
          <span className={`${s.text} font-semibold`}>{branding.appName}</span>
        )}
      </div>
    );
  }

  // ─── SVG Logo ────────────────────────────────────────────────────────────────
  if (branding.logo.type === 'svg' && branding.logo.value) {
    return (
      <div className={`flex items-center ${s.container} ${className}`}>
        <div
          className={s.icon}
          dangerouslySetInnerHTML={{ __html: branding.logo.value }}
        />
        {showText && (
          <span className={`${s.text} font-semibold`}>{branding.appName}</span>
        )}
      </div>
    );
  }

  // ─── Text Logo (default) ─────────────────────────────────────────────────────
  return (
    <div className={`flex items-center ${s.container} ${className}`}>
      <div
        className={`${s.icon} rounded-lg flex items-center justify-center`}
        style={{ backgroundColor: theme.colors.primary }}
      >
        <Shield className={`${s.iconInner} text-white`} />
      </div>
      {showText && (
        <span className={`${s.text} font-semibold`}>{branding.appName}</span>
      )}
    </div>
  );
}
