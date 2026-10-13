// Tokens & utilities
export * from './tokens';
export { cn } from './lib/cn';
export { formatINR, getInitials } from './lib/format';
export * from './lib/datetime';
export { useNow } from './lib/use-now';
export { useMediaQuery, usePrefersReducedMotion } from './lib/use-media-query';
export * from './icons';
export * from './illustrations';

// Foundation components
export * from './components/avatar';
export * from './components/badge';
export * from './components/button';
export * from './components/card';
export * from './components/choice';
export * from './components/dialog';
export * from './components/feedback';
export * from './components/field';
export * from './components/icon-button';
export * from './components/input';
export * from './components/menu';
export * from './components/otp-input';
export * from './components/table';
export * from './components/stat-tile';
export * from './components/stepper';
export * from './components/tabs';
export * from './components/toast';
export * from './components/tooltip';
export * from './components/typography';

// Layout primitives
export * from './layout/layout';
export * from './layout/app-shell';
export * from './layout/hero';
export * from './layout/auth-layout';

// Shared domain components (used by 2+ of customer / technician / admin)
export * from './domain/ai';
export * from './domain/cards';
export * from './domain/status';
