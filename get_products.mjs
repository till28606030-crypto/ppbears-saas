const WOOCOMMERCE_URL = 'https://ppbears.com';
const CONSUMER_KEY = 'ck_0b8fea2379b3ebb23e934e3d9eec89b47ac38548';
const CONSUMER_SECRET = 'cs_32691e0808904e552d491308c5e90d435bde872a';

async function listProducts() {
    try {
        const auth = Buffer.from(`${CONSUMER_KEY}:${CONSUMER_SECRET}`).toString('base64');

        const response = await fetch(`${WOOCOMMERCE_URL}/wp-json/wc/v3/products?per_page=50`, {
            method: 'GET',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('API Error:', errorText);
            return;
        }

        const products = await response.json();

        console.log('\n=== WooCommerce 產品列表 ===\n');

        products.forEach(product => {
            console.log(`ID: ${product.id}`);
            console.log(`名稱: ${product.name}`);
            console.log(`價格: NT$${product.price}`);
            console.log(`狀態: ${product.status}`);
            console.log(`類型: ${product.type}`);
            console.log('---');
        });

        console.log(`\n共找到 ${products.length} 個產品`);

        // 找出可能的客製化商品
        const customProducts = products.filter(p =>
            p.name.includes('客製') ||
            p.name.includes('訂製') ||
            p.name.includes('自訂') ||
            p.type === 'variable'
        );

        if (customProducts.length > 0) {
            console.log('\n=== 可能的客製化商品 ===\n');
            customProducts.forEach(p => {
                console.log(`ID: ${p.id} - ${p.name}`);
            });
        }

    } catch (error) {
        console.error('執行錯誤:', error.message);
    }
}

listProducts();
