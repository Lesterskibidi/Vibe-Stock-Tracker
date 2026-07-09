require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const YahooFinanceModule = require('yahoo-finance2');
const YahooFinance = YahooFinanceModule.default || YahooFinanceModule;
const yahooFinance = new YahooFinance({
    suppressNotices: ["yahooSurvey"]
});

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

function getFallbackPrice(symbol, market) {
    const normalized = symbol.toUpperCase().trim();
    const seed = normalized.split('').reduce((acc, char, index) => acc + char.charCodeAt(0) * (index + 1), 0);

    if (market === 'US') {
        const known = {
            AAPL: 185.24,
            MSFT: 423.67,
            NVDA: 121.04,
            AMZN: 188.95,
            GOOGL: 174.12,
            TSLA: 250.31,
            META: 503.1,
            NFLX: 612.88
        };
        return known[normalized] || 100 + (seed % 250);
    }

    const knownVN = {
        HPG: 29500,
        VNM: 82000,
        FPT: 93000,
        VIC: 26000,
        VCB: 42000,
        BID: 43000,
        CTG: 31000
    };

    return knownVN[normalized] || 10000 + (seed % 50000);
}

function normalizeSymbol(symbol, market) {
    if (market === 'VN') {
        return symbol.toUpperCase().trim().replace(/\.VN$/i, '');
    }
    return symbol.toUpperCase().trim();
}

function withTimeout(promise, ms, message) {
    return Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms))
    ]);
}

async function fetchUsQuote(symbol) {
    const results = await withTimeout(yahooFinance.quote(symbol), 2500, 'US quote timeout');
    if (results && results.regularMarketPrice) {
        return parseFloat(results.regularMarketPrice.toFixed(2));
    }
    throw new Error('No US quote data');
}

async function fetchVnQuote(symbol) {
    const response = await withTimeout(
        axios.get(`https://finfo-api.vndirect.com.vn/v4/stock_prices?sort=date:desc&size=1&filter=code:${symbol}`, {
            timeout: 2500,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            }
        }),
        2500,
        'VN quote timeout'
    );

    const data = response.data;
    if (data && data.data && data.data[0]) {
        const livePrice = parseFloat(data.data[0].adClose) * 1000;
        if (livePrice > 0) {
            return livePrice;
        }
    }
    throw new Error('No VN quote data');
}

// ========================================================
// 1. ENDPOINT: LẤY GIÁ MỸ
// ========================================================
app.get('/api/market/us/:symbol', async (req, res) => {
    try {
        const symbol = normalizeSymbol(req.params.symbol, 'US');
        const price = await fetchUsQuote(symbol);

        return res.json({
            success: true,
            symbol,
            price
        });
    } catch (error) {
        const symbol = normalizeSymbol(req.params.symbol, 'US');
        console.error(`Lỗi Yahoo Finance với mã ${symbol}:`, error.message);
        const fallbackPrice = getFallbackPrice(symbol, 'US');
        return res.json({ success: true, symbol, price: parseFloat(fallbackPrice.toFixed(2)), source: 'fallback' });
    }
});

// ========================================================
// 2. ENDPOINT: LẤY GIÁ VIỆT NAM (NGUỒN VNDIRECT ỔN ĐỊNH)
// ========================================================
app.get('/api/market/vn/:symbol', async (req, res) => {
    try {
        const symbol = normalizeSymbol(req.params.symbol, 'VN');
        const price = await fetchVnQuote(symbol);

        return res.json({
            success: true,
            symbol,
            price
        });
    } catch (error) {
        const symbol = normalizeSymbol(req.params.symbol, 'VN');
        console.error(`Lỗi kết nối sàn VN với mã ${symbol}:`, error.message);
        const fallbackPrice = getFallbackPrice(symbol, 'VN');
        return res.json({ success: true, symbol, price: fallbackPrice, source: 'fallback' });
    }
});

app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
});

function startServer() {
    app.listen(PORT, () => {
        console.log(`[VIBE ENGINE] Máy chủ đang chạy tại: http://localhost:${PORT}`);
    });
}

if (require.main === module) {
    startServer();
}

module.exports = { app, startServer };
