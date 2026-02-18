// WooCommerce API Service
import { supabase } from '../lib/supabase';

const WOOCOMMERCE_URL = 'https://ppbears.com';
const CONSUMER_KEY = 'ck_0b8fea2379b3ebb23e934e3d9eec89b47ac38548';
const CONSUMER_SECRET = 'cs_32691e0808904e552d491308c5e90d435bde872a';

// Note: In production, these should be stored in environment variables
// VITE_WOOCOMMERCE_URL, VITE_WOOCOMMERCE_CONSUMER_KEY, VITE_WOOCOMMERCE_CONSUMER_SECRET

interface OrderLineItem {
    product_id: number;
    quantity: number;
    total: string;
    meta_data: Array<{
        key: string;
        value: string;
    }>;
}

interface CreateOrderParams {
    productId: number;
    productName: string;
    price: number;
    quantity: number;
    options: Record<string, any>;
    previewImageUrl?: string;
    printImageUrl?: string;
}

/**
 * Upload image to Supabase and return public URL
 */
async function uploadImageToSupabase(base64Image: string, fileName: string): Promise<string | null> {
    try {
        // Convert base64 to blob
        const response = await fetch(base64Image);
        const blob = await response.blob();

        const fileExt = 'png';
        const filePath = `orders/${Date.now()}_${fileName}.${fileExt}`;

        const { error: uploadError, data } = await supabase.storage
            .from('assets')
            .upload(filePath, blob, {
                contentType: 'image/png',
                upsert: false
            });

        if (uploadError) {
            console.error('Image upload error:', uploadError);
            return null;
        }

        const { data: urlData } = supabase.storage
            .from('assets')
            .getPublicUrl(filePath);

        return urlData.publicUrl;
    } catch (error) {
        console.error('Failed to upload image:', error);
        return null;
    }
}

/**
 * Add to WooCommerce cart using WordPress custom API
 * This will redirect to the checkout page (/checkout/) instead of order-pay
 */
export async function addToWooCommerceCart(
    productId: number,
    productName: string,
    price: number,
    options: Record<string, any>,
    designId: string,
    previewImageUrl?: string,
    printImageUrl?: string
): Promise<{ success: boolean; checkoutUrl?: string; error?: string }> {
    try {
        console.log('[WooCommerce Cart] Adding to cart...');
        console.log('[WooCommerce Cart] Product ID:', productId);
        console.log('[WooCommerce Cart] Price:', price);

        const customData = {
            design_id: designId,
            price: price,
            options: options,
            preview_image_url: previewImageUrl,
            print_image_url: printImageUrl
        };

        console.log('[WooCommerce Cart] Custom data:', customData);

        // Call WordPress custom API endpoint
        const response = await fetch(`${WOOCOMMERCE_URL}/wp-json/ppbears/v1/add-to-cart/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                product_id: productId,
                price: price,
                custom_data: customData
            })
        });

        console.log('[WooCommerce Cart] Response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('[WooCommerce Cart] API error:', errorText);
            return {
                success: false,
                error: `加入購物車失敗 (${response.status}): ${errorText.substring(0, 200)}`
            };
        }

        const result = await response.json();
        console.log('[WooCommerce Cart] Result:', result);

        if (result.success && result.checkout_url) {
            return {
                success: true,
                checkoutUrl: result.checkout_url
            };
        } else {
            return {
                success: false,
                error: '加入購物車失敗'
            };
        }

    } catch (error: any) {
        console.error('[WooCommerce Cart] Exception:', error);
        return {
            success: false,
            error: `網路錯誤: ${error.message}`
        };
    }
}
