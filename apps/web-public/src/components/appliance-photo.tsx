import { CategoryTile, cn } from '@servicepro/ui';

/** Product photos for the appliances we have one for (public/appliances); others keep their illustration. */
const PHOTOS: Record<string, string> = { AC: 'ac', FRIDGE: 'fridge', WASHER: 'washer', TV: 'tv', MICROWAVE: 'microwave' };

/** A 4:3 product photo of the appliance, for the large appliance pickers. Decorative: the name is next to it. */
export function AppliancePhoto({ code, className }: { code: string; className?: string }) {
  const photo = PHOTOS[code];
  if (!photo) return <CategoryTile code={code} size="lg" className={cn('w-full', className)} />;
  return (
    <picture className={cn('block aspect-[4/3] w-full overflow-hidden bg-surface-sunken', className)}>
      <source type="image/webp" srcSet={`/appliances/${photo}.webp`} />
      <img src={`/appliances/${photo}.jpg`} alt="" width={640} height={480} loading="lazy" decoding="async" className="size-full object-cover" />
    </picture>
  );
}
