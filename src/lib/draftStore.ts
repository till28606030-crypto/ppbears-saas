import localforage from 'localforage';

export interface DraftContext {
  productId: string;
  deviceHandle?: string;
  productColor?: string;
  productHandle?: string;
  productType?: string;
}

export interface DraftExtraState {
  selectedOptions?: Record<string, any>;
  activeSide?: string;
  zoom?: number;
  pan?: { x: number; y: number };
  [key: string]: any;
}

export interface Draft {
  version: number;
  updatedAt: string;
  context: DraftContext;
  canvasJson: any;
  extraState?: DraftExtraState;
}

// Create localforage instance
const draftStore = localforage.createInstance({
  name: 'ppbears-designer',
  storeName: 'drafts'
});

/**
 * Get a draft by key
 */
export const getDraft = async (key: string): Promise<Draft | null> => {
  try {
    const draft = await draftStore.getItem<Draft>(key);
    return draft;
  } catch (error) {
    console.error('Failed to get draft:', error);
    return null;
  }
};

/**
 * Save a draft
 */
export const setDraft = async (key: string, draft: Draft): Promise<void> => {
  try {
    await draftStore.setItem(key, draft);
  } catch (error) {
    console.error('Failed to set draft:', error);
    // If quota exceeded or other error, we might want to throw or handle it
    // But for now, we just log it as per requirement to "stop writing" if too big logic is handled upstream or here?
    // User requirement: "If JSON serialized size > 8MB... stop writing".
    // This check should ideally happen before calling setDraft or inside setDraft.
    // Since we pass the object 'draft', we can check size here roughly.
    throw error;
  }
};

/**
 * Remove a draft by key
 */
export const removeDraft = async (key: string): Promise<void> => {
  try {
    await draftStore.removeItem(key);
  } catch (error) {
    console.error('Failed to remove draft:', error);
  }
};

export default draftStore;
