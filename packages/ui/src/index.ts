// Tokens & utilities
export * from './tokens';
export { cn } from './lib/cn';
export { formatINR, getInitials } from './lib/format';
export { useMediaQuery, usePrefersReducedMotion } from './lib/use-media-query';
export * from './icons';

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
export * from './components/tabs';
export * from './components/toast';
export * from './components/tooltip';
export * from './components/typography';

// Layout primitives
export * from './layout/layout';

// Shared domain components (used by 2+ of customer / technician / admin)
export * from './domain/ai';
export * from './domain/cards';
export * from './domain/status';
