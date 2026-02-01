// src/utils/normalizeOptionGroup.ts 
 
export type AnyRecord = Record<string, any>; 
 
export function normalizeStepIndex(input: any, fallback = 1): number { 
  const n = 
    typeof input === "number" 
      ? input 
      : typeof input === "string" 
      ? parseInt(input, 10) 
      : NaN; 
 
  if (!Number.isFinite(n)) return fallback; 
  if (n < 1) return 1; 
  return n; 
} 
 
/** 
 * 把「後台/舊資料/不同欄位名」統一成 stepIndex 
 * 會同時回填到 group.stepIndex 與 group.ui.stepIndex（若 ui 存在） 
 */ 
export function normalizeOptionGroup<T extends AnyRecord>(g: T): T & { 
  stepIndex: number; 
  ui?: AnyRecord; 
} { 
  const stepIndex = normalizeStepIndex( 
    g?.stepIndex ?? 
      g?.step ?? 
      g?.step_index ?? 
      g?.ui?.stepIndex ?? 
      g?.ui?.step ?? 
      g?.ui?.step_index, 
    1 
  ); 
 
  const ui = g?.ui ? { ...g.ui, stepIndex } : g?.ui; 
 
  return { 
    ...g, 
    stepIndex, 
    ...(ui ? { ui } : {}), 
  }; 
} 
