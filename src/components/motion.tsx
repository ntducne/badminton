'use client';

import React from 'react';
import { motion, useReducedMotion, HTMLMotionProps } from 'framer-motion';

const defaultEase = [0.22, 1, 0.36, 1] as const;

interface RevealProps extends HTMLMotionProps<'div'> {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  y?: number;
  className?: string;
}

export function Reveal({
  children,
  delay = 0,
  duration = 0.35,
  y = 12,
  className,
  ...props
}: RevealProps) {
  const shouldReduce = useReducedMotion();

  if (shouldReduce) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -y }}
      transition={{ duration, delay, ease: defaultEase }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function StaggerContainer({
  children,
  className,
  staggerDelay = 0.06,
}: {
  children: React.ReactNode;
  className?: string;
  staggerDelay?: number;
}) {
  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{
        hidden: { opacity: 0 },
        show: {
          opacity: 1,
          transition: {
            staggerChildren: staggerDelay,
          },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 12 },
        show: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.3, ease: defaultEase },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function InteractiveCard({
  children,
  className,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <motion.div
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
      whileTap={{ scale: 0.985 }}
      onClick={onClick}
      className={className}
    >
      {children}
    </motion.div>
  );
}

