import type { ImageSourcePropType } from 'react-native';

import type { IconName } from '@/components/ui';

/** Product photos for the appliances we have one for; the others show an icon. */
const PHOTOS: Record<string, ImageSourcePropType> = {
  AC: require('../../assets/appliances/ac.jpg'),
  FRIDGE: require('../../assets/appliances/fridge.jpg'),
  WASHER: require('../../assets/appliances/washer.jpg'),
  TV: require('../../assets/appliances/tv.jpg'),
  MICROWAVE: require('../../assets/appliances/microwave.jpg'),
};

const ICONS: Record<string, IconName> = {
  AC: 'snow',
  FRIDGE: 'cube',
  WASHER: 'water',
  TV: 'tv',
  MICROWAVE: 'flame',
};

/** Transparent product cut-outs, for light tiles and illustrations. */
const CUTOUTS: Record<string, ImageSourcePropType> = {
  AC: require('../../assets/appliances/ac-cut.webp'),
  FRIDGE: require('../../assets/appliances/fridge-cut.webp'),
  WASHER: require('../../assets/appliances/washer-cut.webp'),
  TV: require('../../assets/appliances/tv-cut.webp'),
  MICROWAVE: require('../../assets/appliances/microwave-cut.webp'),
};

export const applianceCutout = (code: string): ImageSourcePropType | undefined => CUTOUTS[code];

export const appliancePhoto = (code: string): ImageSourcePropType | undefined => PHOTOS[code];

export const applianceIcon = (code: string): IconName => ICONS[code] ?? 'construct';
