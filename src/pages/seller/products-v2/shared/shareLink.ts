export interface ShareUrlResult {
  url: string | null;
  reason?: 'MISSING_ORIGIN' | 'INVALID_ORIGIN' | 'MISSING_ID';
  originValue?: string;
}

/**
 * Builds the canonical sharing URL for a product design.
 * Uses VITE_CANONICAL_ORIGIN as the base to ensure consistency.
 */
export function buildDesignShareUrl(productId: string | undefined | null): ShareUrlResult {
  const origin = import.meta.env.VITE_CANONICAL_ORIGIN;
  
  if (!productId) {
    return { url: null, reason: 'MISSING_ID' };
  }

  if (!origin) {
    return { url: null, reason: 'MISSING_ORIGIN', originValue: origin };
  }

  try {
    // Basic validation for origin format
    if (!origin.startsWith('http')) {
      return { url: null, reason: 'INVALID_ORIGIN', originValue: origin };
    }

    const u = new URL('/design/', origin);
    u.searchParams.set('productId', productId);
    return { url: u.toString() };
  } catch (err) {
    console.error('Failed to construct share URL:', err);
    return { url: null, reason: 'INVALID_ORIGIN', originValue: origin };
  }
}

/**
 * Robust copy to clipboard helper with fallback.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      // Fallback for non-https or old browsers
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      textArea.style.top = "-999999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        const successful = document.execCommand('copy');
        textArea.remove();
        return successful;
      } catch (err) {
        console.error('Fallback copy failed', err);
        textArea.remove();
        return false;
      }
    }
  } catch (err) {
    console.error('Copy to clipboard failed', err);
    return false;
  }
}
