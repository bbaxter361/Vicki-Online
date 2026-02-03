const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const OAuth = require('oauth-1.0a');

const app = express();
const port = 18795;

const CREDENTIALS_PATH = 'C:/Users/bbaxt/clawd/credentials/brick-sync.json';

// --- Cache Mechanism ---
let cache = {
    stats: null,
    orders: null,
    timestamp: 0
};
const CACHE_TTL = 2 * 60 * 1000; // 2 minutes

// --- Data Provider ---
async function fetchData() {
    // Return cached data if valid
    if (cache.stats && cache.orders && (Date.now() - cache.timestamp < CACHE_TTL)) {
        console.log('Returning cached data');
        return { stats: cache.stats, orders: cache.orders };
    }

    console.log('Fetching fresh data from BrickLink and BrickOwl...');
    
    let stats = {
        orders: {
            total: 0,
            bricklink: 0,
            brickowl: 0
        },
        inventory: {
            totalParts: 0,
            totalLots: 0,
            bricklink: { parts: 0, lots: 0 },
            brickowl: { parts: 0, lots: 0 }
        },
        sync: {
            status: 'healthy',
            lastSync: new Date().toISOString()
        }
    };

    let allOrders = [];

    try {
        const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));

        // --- Brick Owl ---
        try {
            // Orders - fetch all orders
            const boOrderUrl = `https://api.brickowl.com/v1/order/list?key=${creds.brickowl.apiKey}`;
            const boOrderResponse = await fetch(boOrderUrl);
            const boOrderData = await boOrderResponse.json();
            
            let boOrders = [];
            if (Array.isArray(boOrderData)) {
                boOrders = boOrderData;
            } else if (boOrderData && typeof boOrderData === 'object') {
                boOrders = Object.values(boOrderData);
            }

            stats.orders.brickowl = boOrders.length;
            
            // Map BrickOwl orders
            allOrders = allOrders.concat(boOrders.map(o => ({
                id: o.order_id,
                source: 'BrickOwl',
                date: isNaN(new Date(o.date_placed * 1000)) ? new Date().toISOString() : new Date(o.date_placed * 1000).toISOString(),
                items: parseInt(o.total_items),
                total: `${o.currency} ${o.total_price}`,
                status: o.status_name,
                statusId: o.status_id
            })));

            // Inventory
            const boInvUrl = `https://api.brickowl.com/v1/inventory/list?key=${creds.brickowl.apiKey}`;
            const boInvResponse = await fetch(boInvUrl);
            const boInvData = await boInvResponse.json();
            
            let boLots = [];
            if (Array.isArray(boInvData)) {
                boLots = boInvData;
            } else if (boInvData && typeof boInvData === 'object') {
                boLots = Object.values(boInvData);
            }

            stats.inventory.brickowl.lots = boLots.length;
            stats.inventory.brickowl.parts = boLots.reduce((sum, item) => sum + parseInt(item.qty || item.quantity || 0), 0);
        } catch (e) {
            console.error('Brick Owl Error:', e.message);
        }

        // --- BrickLink ---
        try {
            const oauth = OAuth({
                consumer: { key: creds.bricklink.consumerKey, secret: creds.bricklink.consumerSecret },
                signature_method: 'HMAC-SHA1',
                hash_function(base_string, key) {
                    return crypto.createHmac('sha1', key).update(base_string).digest('base64');
                },
            });

            const token = {
                key: creds.bricklink.tokenValue,
                secret: creds.bricklink.tokenSecret,
            };

            // Orders - fetch all orders (no status filter)
            const order_req = {
                url: 'https://api.bricklink.com/api/store/v1/orders?direction=in',
                method: 'GET',
            };
            const blOrderResponse = await fetch(order_req.url, { headers: oauth.toHeader(oauth.authorize(order_req, token)) });
            const blOrderData = await blOrderResponse.json();
            if (blOrderData.meta.code === 200 && blOrderData.data) {
                const blOrders = Array.isArray(blOrderData.data) ? blOrderData.data : [];
                stats.orders.bricklink = blOrders.length;
                
                // Map BrickLink orders
                allOrders = allOrders.concat(blOrders.map(o => ({
                    id: o.order_id,
                    source: 'BrickLink',
                    date: o.date_ordered,
                    items: parseInt(o.total_count),
                    total: `${o.currency_code} ${o.total_grand_amount}`,
                    status: o.status,
                    statusId: o.status
                })));
            }

            // Inventory (using /inventories which returns the list of lots)
            const inv_req = {
                url: 'https://api.bricklink.com/api/store/v1/inventories',
                method: 'GET',
            };
            const blInvResponse = await fetch(inv_req.url, { headers: oauth.toHeader(oauth.authorize(inv_req, token)) });
            const blInvData = await blInvResponse.json();
            if (blInvData.meta.code === 200 && blInvData.data) {
                stats.inventory.bricklink.lots = blInvData.data.length;
                stats.inventory.bricklink.parts = blInvData.data.reduce((sum, item) => sum + parseInt(item.quantity || 0), 0);
            }
        } catch (e) {
            console.error('BrickLink Error:', e.message);
        }

        stats.orders.total = stats.orders.bricklink + stats.orders.brickowl;
        stats.inventory.totalLots = stats.inventory.bricklink.lots + stats.inventory.brickowl.lots;
        stats.inventory.totalParts = stats.inventory.bricklink.parts + stats.inventory.brickowl.parts;
        
        // Sort orders by date newest first
        allOrders.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Update cache
        cache.stats = stats;
        cache.orders = allOrders;
        cache.timestamp = Date.now();
        
        return { stats, orders: allOrders };
    } catch (e) {
        console.error('Error fetching data:', e.message);
        return { 
            stats: cache.stats || stats, 
            orders: cache.orders || [] 
        };
    }
}

// --- Routes ---

app.get('/api/dashboard/stats', async (req, res) => {
    const { stats } = await fetchData();
    res.json(stats);
});

app.get('/api/dashboard/orders', async (req, res) => {
    const { orders } = await fetchData();
    res.json(orders);
});

app.get('/dashboard.html', (req, res) => {
    const filePath = path.join(__dirname, '..', 'projects', 'replaybrick-proto', 'dashboard.html');
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).send(`File not found at ${filePath}`);
    }
});

app.use(express.static(path.join(__dirname, '..', 'projects', 'replaybrick-proto')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../projects/replaybrick-proto/index.html'));
});

app.listen(port, '0.0.0.0', () => {
    console.log(`ReplayBrick proto server listening at http://0.0.0.0:${port}`);
});
