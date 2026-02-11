import type { Category } from '@/types';
import { buildCategoryTree as coreBuildCategoryTree, reorderByIds as coreReorderByIds } from './categoryTreeCore';

export const buildCategoryTree = (flat: Category[]) => {
  const result = coreBuildCategoryTree(flat as any);
  return result as { tree: Category[]; map: Map<string, Category> };
};

export const reorderByIds = <T extends { id: string }>(items: T[], orderedIds: string[]) => {
  return coreReorderByIds(items as any, orderedIds) as T[];
};
