'use client';

import React from 'react';
import { HeroUIProvider, ToastProvider } from '@heroui/react';
import { MotionConfig } from 'framer-motion';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
      <HeroUIProvider locale="vi-VN">
        <ToastProvider placement="top-right" />
        {children}
      </HeroUIProvider>
    </MotionConfig>
  );
}

