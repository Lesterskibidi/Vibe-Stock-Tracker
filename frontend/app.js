const SUPABASE_URL = "https://asmevcyuutuvywaxqwwx.supabase.co"; 
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzbWV2Y3l1dXR1dnl3YXhxd3d4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM1MjAzMDUsImV4cCI6MjA5OTA5NjMwNX0.A6vNysd6DW3fL53g-5eRH6nuwAxwn-uOvFs-hFjXK1w";

// Khởi tạo client dùng chung một tên biến duy nhất
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let userPlanStatus = 'free'; // Mặc định ban đầu là Free

// Tự động lắng nghe xem người dùng đã đăng nhập từ trang index.html chưa
supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (session) {
        currentUser = session.user;
        await checkUserSubscription(); // Kiểm tra xem người này là Free hay Premium
        await loadPortfolioFromCloud(); // Tải danh mục từ đám mây xuống bảng tính
    } else {
        currentUser = null;
        window.location.href = "index.html"; // Chưa đăng nhập thì đá về trang chủ
    }
});

// Hàm kiểm tra hạng tài khoản
async function checkUserSubscription() {
    if (!currentUser) return;
    let { data } = await supabaseClient.from('user_subscriptions').select('status').eq('user_id', currentUser.id).single();
    if (data) {
        userPlanStatus = data.status;
    } else {
        await supabaseClient.from('user_subscriptions').insert([{ user_id: currentUser.id, status: 'free' }]);
        userPlanStatus = 'free';
    }
    updateUIForPlan(userPlanStatus);
}

// Hàm hiển thị chữ Upgrade Premium hoặc Vương miện Vàng lên góc màn hình
function updateUIForPlan(plan) {
    const badgeContainer = document.getElementById('user-plan-badge');
    if (!badgeContainer) return;
    if (plan === 'premium') {
        badgeContainer.innerHTML = `<span class="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 px-3 py-1 rounded-full font-bold flex items-center gap-1">👑 Thành viên Vàng</span>`;
    } else {
        badgeContainer.innerHTML = `<span class="text-xs bg-zinc-800 text-zinc-400 border border-zinc-700 px-3 py-1 rounded-full font-medium cursor-pointer hover:bg-zinc-700" onclick="alert('Tính năng thanh toán MoMo ủng hộ từ thiện đang được kết nối!')">Upgrade Premium</span>`;
    }
}


const FIXED_API_KEY = "GY0BEYPOGV34OIE9"; 
const USD_VND_EXCHANGE_RATE = 25000; // Tỷ giá quy đổi cố định cố định

// Trạng thái dữ liệu danh mục đầu tư ban đầu (Giữ nguyên của bạn để dự phòng)
let portfolio = JSON.parse(localStorage.getItem('vibe_v3_holdings')) || [
    { symbol: 'AAPL', currency: 'USD', quantity: 10, buyPrice: 170.00, currentPrice: 185.00, stopLoss: 160, takeProfit: 200 },
    { symbol: 'HPG', currency: 'VND', quantity: 1000, buyPrice: 28000, currentPrice: 29500, stopLoss: 25000, takeProfit: 35000 }
];
let ledger = JSON.parse(localStorage.getItem('vibe_v3_ledger')) || [];

let chartInstance = null;
let searchTimeout = null;
let audioCtx = null;

// Khởi chạy ứng dụng khi DOM sẵn sàng
document.addEventListener("DOMContentLoaded", () => {
    lucide.createIcons();
    initApiStatus();
    updateUI();
    setupAutoComplete();

    // Vòng lặp cập nhật giá thị trường tự động định kỳ mỗi 4 giây
    setInterval(() => {
        if(hasValidApiKey()) {
            fetchLivePrices();
        } else {
            simulatePrices();
        }
    }, 10000); // Đổi 4000 thành 65000
});

function hasValidApiKey() {
    return FIXED_API_KEY && FIXED_API_KEY !== "MÃ_API_KEY_CỦA_BẠN_Ở_ĐÂY";
}

function initApiStatus() {
    const el = document.getElementById('api-status');
    if (hasValidApiKey()) {
        el.className = "inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20";
        el.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Gắn sẵn Live API`;
    } else {
        el.className = "inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20";
        el.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span> Sandbox Engine (No Key)`;
    }
}

// ========================================================
// 2. LOGIC TỰ ĐỘNG HÓA VÀ QUẢN TRỊ RỦI RO
// ========================================================
function playAlertSound() {
    try {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        let osc = audioCtx.createOscillator();
        let gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(660, audioCtx.currentTime); // Tần số âm thanh cảnh báo bíp bíp
        gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.12);
    } catch(e) {}
}

function simulatePrices() {
    portfolio.forEach(s => {
        const fluctuation = (Math.random() - 0.5) * 0.006;
        s.currentPrice = +(s.currentPrice * (1 + fluctuation)).toFixed(2);
    });
    updateUI();
}

// Thay đổi địa chỉ Server của bạn (khi đưa lên mạng sẽ đổi localhost thành tên miền thật)
const BACKEND_URL = "http://localhost:3000/api/market";

async function fetchLivePrices() {
    for (let stock of portfolio) {
        const cleanSymbol = stock.symbol.toUpperCase().trim();
        
        // 1. Nếu là tiền VND -> Gọi lên Endpoint Việt Nam trên Server của mình
        if (stock.currency === 'VND') {
            try {
                const res = await fetch(`${BACKEND_URL}/api/market/vn/${cleanSymbol}`);
                const data = await res.json();
                if (data.success && data.price > 0) {
                    stock.currentPrice = data.price;
                }
            } catch (e) {
                console.error(`Lỗi cập nhật mã VN ${cleanSymbol}:`, e);
            }
            continue;
        }
        
        // 2. Nếu là tiền USD -> Gọi lên Endpoint Mỹ trên Server của mình
        if (stock.currency === 'USD') {
            try {
                const res = await fetch(`${BACKEND_URL}/api/market/us/${cleanSymbol}`);
                const data = await res.json();
                if (data.success && data.price > 0) {
                    stock.currentPrice = data.price;
                }
            } catch (e) {
                console.error(`Lỗi cập nhật mã Mỹ ${cleanSymbol}:`, e);
            }
        }
    }
    updateUI();
}

// ========================================================
// 3. TÌM KIẾM GỢI Ý AUTO-COMPLETE
// ========================================================
function setupAutoComplete() {
    const input = document.getElementById('symbol');
    const dropdown = document.getElementById('autocomplete-dropdown');
    
    // Danh sách các mã cổ phiếu phổ biến để gợi ý khi không dùng API
    const mockSuggestions = [
        { symbol: 'AAPL', name: 'Apple Inc.' },
        { symbol: 'AMZN', name: 'Amazon.com Inc.' },
        { symbol: 'GOOGL', name: 'Alphabet Inc.' },
        { symbol: 'MSFT', name: 'Microsoft Corporation' },
        { symbol: 'NVDA', name: 'NVIDIA Corporation' },
        { symbol: 'TSLA', name: 'Tesla Inc.' },
        { symbol: 'HPG', name: 'Tập đoàn Hòa Phát (VND)' },
        { symbol: 'VNM', name: 'Vinamilk (VND)' },
        { symbol: 'FPT', name: 'Tập đoàn FPT (VND)' }
    ];
    
    input.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        const query = input.value.trim().toUpperCase();
        if(!query) { dropdown.classList.add('hidden'); return; }

        // Nếu có API Key thật thì gọi API, nếu chưa có thì dùng danh sách gợi ý mẫu
        if (hasValidApiKey()) {
            searchTimeout = setTimeout(async () => {
                try {
                    const res = await fetch(`https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords=${query}&apikey=${FIXED_API_KEY}`);
                    const data = await res.json();
                    dropdown.innerHTML = '';
                    if(data.bestMatches) {
                        data.bestMatches.slice(0, 5).forEach(m => {
                            renderDropdownItem(dropdown, input, m["1. symbol"], m["2. name"]);
                        });
                        dropdown.classList.remove('hidden');
                    }
                } catch(e) {}
            }, 500);
        } else {
            // Hiển thị từ danh sách mẫu
            dropdown.innerHTML = '';
            const matches = mockSuggestions.filter(item => 
                item.symbol.includes(query) || item.name.toUpperCase().includes(query)
            );
            
            if (matches.length > 0) {
                matches.forEach(item => {
                    renderDropdownItem(dropdown, input, item.symbol, item.name);
                });
                dropdown.classList.remove('hidden');
            } else {
                dropdown.classList.add('hidden');
            }
        }
    });

    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !dropdown.contains(e.target)) dropdown.classList.add('hidden');
    });
}

// Hàm phụ trợ hiển thị từng hàng gợi ý
function renderDropdownItem(dropdown, input, symbol, name) {
    const div = document.createElement('div');
    div.className = "p-2.5 hover:bg-zinc-900 text-xs cursor-pointer transition-colors border-b border-zinc-900/50 last:border-none";
    div.innerHTML = `
        <div class="font-bold text-emerald-400">${symbol}</div>
        <div class="text-[10px] text-zinc-500 truncate">${name}</div>
    `;
    div.onclick = () => { 
        input.value = symbol; 
        dropdown.classList.add('hidden'); 
    };
    dropdown.appendChild(div);
}

// ========================================================
// 4. CHỨC NĂNG THÊM, SỬA, XÓA VỊ THẾ
// ========================================================
function saveTransaction(e) {
    e.preventDefault();
    const index = parseInt(document.getElementById('edit-index').value);
    const symbol = document.getElementById('symbol').value.toUpperCase().trim();
    const currency = document.getElementById('currency').value;
    const quantity = parseFloat(document.getElementById('quantity').value);
    const buyPrice = parseFloat(document.getElementById('buy-price').value);
    const sl = document.getElementById('stop-loss').value ? parseFloat(document.getElementById('stop-loss').value) : null;
    const tp = document.getElementById('take-profit').value ? parseFloat(document.getElementById('take-profit').value) : null;

    const stockData = { symbol, currency, quantity, buyPrice, currentPrice: buyPrice, stopLoss: sl, takeProfit: tp };

    if(index === -1) {
        portfolio.push(stockData);
    } else {
        stockData.currentPrice = portfolio[index].currentPrice; 
        portfolio[index] = stockData;
    }
    
    // Ghi lại nhật ký giao dịch
    ledger.unshift({
        timestamp: new Date().toLocaleString('vi-VN'),
        symbol: symbol,
        type: index === -1 ? 'MUA/THÊM' : 'SỬA VỊ THẾ',
        quantity: quantity,
        price: buyPrice
    });
    
    // CHÈN ĐOẠN NÀY VÀO TRONG SỰ KIỆN KHI BẤM NÚT THÊM MÃ CỔ PHIẾU
    async function handleAddNewStock(symbol, quantity, buyPrice, currencyType) {
        if (!currentUser) return alert("Vui lòng đăng nhập trước!");

        // 1. Kiểm tra xem tài khoản Free đã thêm đủ 3 mã chưa
        let { data: currentStocks } = await supabase.from('portfolio').select('symbol').eq('user_id', currentUser.id);
        const uniqueSymbols = new Set(currentStocks.map(item => item.symbol));
        
        // 2. Nếu vượt quá 3 mã mà không phải mã đã có sẵn trong danh mục -> Chặn lại bắt nâng cấp Premium
        if (userPlanStatus === 'free' && uniqueSymbols.size >= 3 && !uniqueSymbols.has(symbol.toUpperCase())) {
            alert("⚠️ Gói Miễn Phí chỉ giới hạn theo dõi tối đa 3 mã cổ phiếu.\n\nHãy nâng cấp lên gói Premium (Thành viên Vàng) để không giới hạn danh mục. 100% chi phí nâng cấp sẽ được chuyển thẳng vào Quỹ từ thiện xã hội!");
            return; // Dừng lại không cho lưu
        }

        // 3. Nếu hợp lệ, đẩy thẳng lên Cloud Database công khai
        const { error } = await supabase.from('portfolio').insert([
            { 
                user_id: currentUser.id, 
                symbol: symbol.toUpperCase().trim(), 
                currency: currencyType, 
                quantity: parseFloat(quantity), 
                buy_price: parseFloat(buyPrice) 
            }
        ]);

        if (error) {
            alert("Lỗi đồng bộ dữ liệu: " + error.message);
        } else {
            alert("🎉 Tài sản đã được bảo mật và đồng bộ lên đám mây!");
            await loadPortfolioFromCloud(); // Tải lại bảng tính mới tinh
        }
    }
    
    // Gọi hàm cập nhật giá live ngay khi vừa nhấn nút (nếu có backend url)
    fetchLivePrices(); 
} // <-- Đảm bảo dấu đóng ngoặc nhọn này kết thúc hàm saveTransaction hoàn chỉnh!

function editStock(index) {
    const s = portfolio[index];
    document.getElementById('edit-index').value = index;
    document.getElementById('symbol').value = s.symbol;
    document.getElementById('currency').value = s.currency;
    document.getElementById('quantity').value = s.quantity;
    document.getElementById('buy-price').value = s.buyPrice;
    document.getElementById('stop-loss').value = s.stopLoss || '';
    document.getElementById('take-profit').value = s.takeProfit || '';

    document.getElementById('form-title').innerHTML = `<i data-lucide="edit" class="w-4 h-4 text-amber-400"></i> Hiệu chỉnh vị thế`;
    document.getElementById('submit-btn').className = "flex-1 bg-amber-500 hover:bg-amber-600 text-zinc-950 font-bold py-2.5 rounded-xl transition-all cursor-pointer text-sm";
    document.getElementById('cancel-btn').classList.remove('hidden');
    lucide.createIcons();
}

function deleteStock(index) {
    if(confirm(`Xóa hoàn toàn mã cổ phiếu ${portfolio[index].symbol} khỏi danh mục?`)) {
        portfolio.splice(index, 1);
        localStorage.setItem('vibe_v3_holdings', JSON.stringify(portfolio));
        updateUI();
    }
}

function resetForm() {
    document.getElementById('stock-form').reset();
    document.getElementById('edit-index').value = "-1";
    document.getElementById('form-title').innerHTML = `<i data-lucide="plus-circle" class="w-4 h-4 text-emerald-400"></i> Thêm giao dịch mới`;
    document.getElementById('submit-btn').className = "flex-1 bg-emerald-500 hover:bg-emerald-600 text-zinc-950 font-bold py-2.5 rounded-xl transition-all cursor-pointer text-sm";
    document.getElementById('cancel-btn').classList.add('hidden');
    lucide.createIcons();
}

// ========================================================
// 5. QUY ĐỔI TIỀN TỆ ĐA QUỐC GIA & RENDER UI
// ========================================================
function updateUI() {
    const baseCur = document.getElementById('base-currency').value;
    let totalValBase = 0;
    let totalInvBase = 0;
    let anyRiskAlert = false;

    const tbody = document.getElementById('portfolio-table-body');
    tbody.innerHTML = '';

    portfolio.forEach((s, idx) => {
        let rateToSub = 1; 
        if(s.currency !== baseCur) {
            rateToSub = (baseCur === 'VND') ? USD_VND_EXCHANGE_RATE : (1 / USD_VND_EXCHANGE_RATE);
        }

        const costBase = (s.quantity * s.buyPrice) * rateToSub;
        const currentValBase = (s.quantity * s.currentPrice) * rateToSub;
        const pnlBase = currentValBase - costBase;
        const pnlPercent = costBase > 0 ? (pnlBase / costBase) * 100 : 0;

        totalValBase += currentValBase;
        totalInvBase += costBase;

        let riskClass = "";
        let slStatus = s.stopLoss ? `${s.stopLoss}` : "-";
        let tpStatus = s.takeProfit ? `${s.takeProfit}` : "-";

        // Thêm class nhấp nháy nếu vi phạm quản trị rủi ro
        if((s.stopLoss && s.currentPrice <= s.stopLoss) || (s.takeProfit && s.currentPrice >= s.takeProfit)) {
            riskClass = "risk-alert-active";
            anyRiskAlert = true;
        }

        tbody.innerHTML += `
            <tr class="hover:bg-zinc-900/20 transition-all ${riskClass}">
                <td class="p-4 font-bold text-zinc-200">${s.symbol} <span class="text-[10px] text-zinc-500 font-normal">(${s.currency})</span></td>
                <td class="p-4 text-zinc-300">${s.quantity}</td>
                <td class="p-4 text-zinc-400">${s.buyPrice.toLocaleString()} ${s.currency}</td>
                <td class="p-4 font-semibold text-zinc-200">${s.currentPrice.toLocaleString()} ${s.currency}</td>
                <td class="p-4 text-xs font-mono">
                    <span class="text-rose-400/80">SL: ${slStatus}</span> | <span class="text-emerald-400/80">TP: ${tpStatus}</span>
                </td>
                <td class="p-4 text-right flex justify-end gap-3 items-center">
                    <button onclick="quickAction(${idx}, 'BUY')" class="text-emerald-500 hover:text-emerald-400 p-1 transition-colors cursor-pointer" title="Mua thêm nhanh">
                        <i data-lucide="plus" class="w-4 h-4"></i>
                    </button>
                    <button onclick="quickAction(${idx}, 'SELL')" class="text-rose-500 hover:text-rose-400 p-1 transition-colors cursor-pointer" title="Bán bớt nhanh">
                        <i data-lucide="minus" class="w-4 h-4"></i>
                    </button>
                    
                    <button onclick="editStock(${idx})" class="text-zinc-500 hover:text-amber-400 transition-colors cursor-pointer">
                        <i data-lucide="edit-2" class="w-4 h-4"></i>
                    </button>
                    <button onclick="deleteStock(${idx})" class="text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer">
                        <i data-lucide="trash" class="w-4 h-4"></i>
                    </button>
                </td>
            </tr>
        `;
    });

    const banner = document.getElementById('global-risk-banner');
    if(anyRiskAlert) { banner.classList.remove('hidden'); playAlertSound(); } 
    else { banner.classList.add('hidden'); }

    const totalPnL = totalValBase - totalInvBase;
    const totalPnLPercent = totalInvBase > 0 ? (totalPnL / totalInvBase) * 100 : 0;
    const sign = baseCur === 'USD' ? '$' : 'đ ';

    document.getElementById('total-value').innerText = `${sign}${totalValBase.toLocaleString(undefined, {maximumFractionDigits: 2})}`;
    document.getElementById('total-investment').innerText = `${sign}${totalInvBase.toLocaleString(undefined, {maximumFractionDigits: 2})}`;
    
    const pnlEl = document.getElementById('total-pnl');
    const pnlPercentEl = document.getElementById('total-pnl-percent');
    pnlEl.innerText = `${totalPnL >= 0 ? '+' : ''}${sign}${totalPnL.toLocaleString(undefined, {maximumFractionDigits: 2})}`;
    pnlPercentEl.innerText = `${totalPnL >= 0 ? '+' : ''}${totalPnLPercent.toFixed(2)}%`;
    pnlEl.className = `text-2xl font-bold mt-2 ${totalPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`;
    // --- ĐOẠN CHÈN MỚI: TÍNH TOÁN DRAWDOWN TỪ ĐỈNH TÀI SẢN ---
    let peak = parseFloat(localStorage.getItem('vibe_portfolio_peak')) || 0;
    if (totalValBase > peak) {
        peak = totalValBase;
        localStorage.setItem('vibe_portfolio_peak', peak.toString());
    }
    let drawdown = 0;
    if (peak > 0) {
        drawdown = ((peak - totalValBase) / peak) * 100;
    }
    const peakSign = baseCur === 'USD' ? '$' : 'đ ';
    document.getElementById('portfolio-peak').innerText = `${peakSign}${peak.toLocaleString(undefined, {maximumFractionDigits: 2})}`;
    document.getElementById('portfolio-drawdown').innerText = `-${drawdown.toFixed(2)}%`;
    // -------------------------------------------------------

    // --- ĐOẠN THÊM VÀO: HIỂN THỊ DỮ LIỆU NHẬT KÝ (LEDGER) ---
    const ledgerBody = document.getElementById('ledger-table-body');
    if (ledgerBody) {
        ledgerBody.innerHTML = ledger.map(l => `
            <tr class="hover:bg-zinc-900/10 transition-all">
                <td class="p-3 text-zinc-500 font-mono">${l.timestamp}</td>
                <td class="p-3 font-bold text-zinc-300 uppercase">${l.symbol}</td>
                <td class="p-3">
                    <span class="${l.type.includes('MUA') ? 'text-emerald-400 bg-emerald-500/10' : 'text-amber-400 bg-amber-500/10'} px-2 py-0.5 rounded text-[10px] font-medium border ${l.type.includes('MUA') ? 'border-emerald-500/20' : 'border-amber-500/20'}">
                        ${l.type}
                    </span>
                </td>
                <td class="p-3 text-zinc-300 font-medium">${l.quantity}</td>
                <td class="p-3 text-zinc-300 font-mono">${l.price.toLocaleString()}</td>
            </tr>
        `).join('');
    }
    // --------------------------------------------------------

    lucide.createIcons();
    renderChart(baseCur);
}
function renderChart(baseCur) {
    const ctx = document.getElementById('portfolioChart').getContext('2d');
    const labels = portfolio.map(s => s.symbol);
    const dataValues = portfolio.map(s => {
        let rate = 1;
        if(s.currency !== baseCur) rate = baseCur === 'VND' ? USD_VND_EXCHANGE_RATE : (1 / USD_VND_EXCHANGE_RATE);
        return s.quantity * s.currentPrice * rate;
    });

    if(chartInstance) chartInstance.destroy();
    if(labels.length === 0) return;

    chartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: dataValues,
                backgroundColor: ['rgba(16, 185, 129, 0.6)', 'rgba(59, 130, 246, 0.6)', 'rgba(245, 158, 11, 0.6)', 'rgba(236, 72, 153, 0.6)'],
                borderColor: '#09090b', borderWidth: 2
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#a1a1aa' } } } }
    });
}

function exportToCSV() {
    let csv = "data:text/csv;charset=utf-8,\\uFEFFMa CK,Tien Te,So Luong,Gia Von,Gia Hien Tai,Stop Loss,Take Profit\\n";
    portfolio.forEach(s => { csv += `${s.symbol},${s.currency},${s.quantity},${s.buyPrice},${s.currentPrice},${s.stopLoss||''},${s.takeProfit||''}\\n`; });
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csv));
    link.setAttribute("download", "vibe_portfolio_risk_report.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
function clearLedger() {
    if (confirm("Bạn có chắc chắn muốn xóa toàn bộ lịch sử giao dịch trong Nhật ký? Hành động này không thể hoàn tác.")) {
        ledger = []; // Xóa sạch mảng dữ liệu trong bộ nhớ lệnh
        localStorage.setItem('vibe_v3_ledger', JSON.stringify(ledger)); // Cập nhật lại LocalStorage
        updateUI(); // Làm mới lại giao diện bảng
    }
}
// Hàm xử lý Mua/Bán nhanh khi ấn nút + hoặc -
function quickAction(index, actionType) {
    const s = portfolio[index];
    const val = prompt(`Nhập số lượng muốn ${actionType === 'BUY' ? 'mua thêm' : 'bán bớt'} cho mã ${s.symbol}:`);
    const qty = parseFloat(val);
    if (isNaN(qty) || qty <= 0) return;

    if (actionType === 'BUY') {
        s.quantity += qty;
        // Ghi lại vào Nhật ký giao dịch
        ledger.unshift({ timestamp: new Date().toLocaleString('vi-VN'), symbol: s.symbol, type: 'MUA THÊM NHANH', quantity: qty, price: s.currentPrice });
    } else {
        if (qty >= s.quantity) {
            if (confirm(`Số lượng bán lớn hơn hoặc bằng lượng đang giữ. Xóa vị thế ${s.symbol}?`)) {
                ledger.unshift({ timestamp: new Date().toLocaleString('vi-VN'), symbol: s.symbol, type: 'BÁN HẾT VỊ THẾ', quantity: s.quantity, price: s.currentPrice });
                portfolio.splice(index, 1);
            }
        } else {
            s.quantity -= qty;
            ledger.unshift({ timestamp: new Date().toLocaleString('vi-VN'), symbol: s.symbol, type: 'BÁN BỚT NHANH', quantity: qty, price: s.currentPrice });
        }
    }
    localStorage.setItem('vibe_v3_holdings', JSON.stringify(portfolio));
    localStorage.setItem('vibe_v3_ledger', JSON.stringify(ledger));
    updateUI();
}
// Hàm xuất toàn bộ dữ liệu ra file JSON để lưu về máy tính
function exportBackupJSON() {
    const backupData = {
        portfolio: portfolio,
        ledger: ledger
    };
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backupData));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `vibe_stock_backup_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

// Hàm đọc file JSON từ máy tính và nạp ngược lại vào web
function importBackupJSON(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (data.portfolio && data.ledger) {
                if(confirm("Hành động này sẽ ghi đè và thay thế toàn bộ danh mục hiện tại bằng dữ liệu trong file sao lưu. Bạn có chắc chắn?")) {
                    portfolio = data.portfolio;
                    ledger = data.ledger;
                    localStorage.setItem('vibe_v3_holdings', JSON.stringify(portfolio));
                    localStorage.setItem('vibe_v3_ledger', JSON.stringify(ledger));
                    updateUI();
                    alert("Khôi phục dữ liệu thành công!");
                }
            } else {
                alert("File sao lưu không đúng cấu trúc!");
            }
        } catch (err) {
            alert("Lỗi khi đọc file sao lưu!");
        }
    };
    reader.readAsText(file);
}
