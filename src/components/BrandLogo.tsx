import React from 'react';

/** Enyap kurumsal logosu (public/logo.png). Beyaz / açık zemin üzerinde kullanılmalı. */
export const BrandLogo: React.FC<{ className?: string }> = ({ className = 'h-8' }) => (
  <img src="/logo.png" alt="ENYAP" className={`${className} w-auto select-none`} draggable={false} />
);
