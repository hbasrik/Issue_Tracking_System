import { Subtitle } from '../components/ui';
import { useReferenceCache } from './ReferenceCacheProvider';

export function CacheAgeHint() {
  const { cacheAgeLabel } = useReferenceCache();
  if (!cacheAgeLabel) return null;
  return <Subtitle>{cacheAgeLabel}</Subtitle>;
}
