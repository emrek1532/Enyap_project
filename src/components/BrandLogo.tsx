import React from 'react';

/** Enyap kurumsal logosu (public/logo-splash.png). Beyaz / açık zemin üzerinde kullanılmalı. */
export const BrandLogo: React.FC<{ className?: string }> = ({ className = 'h-8' }) => (
  <img src="/logo-splash.png" alt="ENYAP" className={`${className} w-auto select-none`} draggable={false} />
);
