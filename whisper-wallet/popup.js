// popup.js - Whisper Wallet v1.2.0 with Stats

const CHAIN_ICONS = {
    ethereum: '⟠',
    bsc: '🟡',
    polygon: '🟣',
    base: '🔵',
    arbitrum: '🔷',
    optimism: '🔴',
    avalanche: '🔺',
    solana: '◎'
};

const CHAIN_NAMES = {
    ethereum: 'Ethereum',
    bsc: 'BSC',
    polygon: 'Polygon',
    base: 'Base',
    arbitrum: 'Arbitrum',
    optimism: 'Optimism',
    avalanche: 'Avalanche',
    solana: 'Solana'
};

const CHAIN_EXPLORERS = {
    ethereum: 'https://etherscan.io/address/',
    bsc: 'https://bscscan.com/address/',
    polygon: 'https://polygonscan.com/address/',
    base: 'https://basescan.org/address/',
    arbitrum: 'https://arbiscan.io/address/',
    optimism: 'https://optimistic.etherscan.io/address/',
    avalanche: 'https://snowtrace.io/address/',
    solana: 'https://solscan.io/account/'
};

const CHAIN_DEX = {
    ethereum: 'https://dexscreener.com/ethereum/',
    bsc: 'https://dexscreener.com/bsc/',
    polygon: 'https://dexscreener.com/polygon/',
    base: 'https://dexscreener.com/base/',
    arbitrum: 'https://dexscreener.com/arbitrum/',
    optimism: 'https://dexscreener.com/optimism/',
    avalanche: 'https://dexscreener.com/avalanche/',
    solana: 'https://dexscreener.com/solana/'
};

document.addEventListener('DOMContentLoaded', () => {
    // Tab switching
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.getAttribute('data-tab');
            
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            document.getElementById(`${tabName}-tab`).classList.add('active');
        });
    });

    // Load all data
    loadStats();
    loadHistory();
    loadSettings();

    // Event listeners
    document.getElementById('saveBtn').addEventListener('click', saveSettings);
    document.getElementById('resetBtn').addEventListener('click', resetSettings);
    document.getElementById('clearHistoryBtn').addEventListener('click', clearHistory);
    document.getElementById('resetStatsBtn').addEventListener('click', resetStats);
    document.getElementById('truncateStartChars').addEventListener('input', updateExample);
    document.getElementById('truncateEndChars').addEventListener('input', updateExample);
});

function loadStats() {
    chrome.storage.sync.get(['history'], (result) => {
        const history = result.history || [];
        
        // Total copies
        document.getElementById('totalCopies').textContent = history.length;
        
        // Chain stats
        const chainCounts = {};
        const today = new Date().setHours(0, 0, 0, 0);
        let copiesToday = 0;
        
        history.forEach(item => {
            // Count by chain
            chainCounts[item.chain] = (chainCounts[item.chain] || 0) + 1;
            
            // Count today
            const itemDate = new Date(item.timestamp).setHours(0, 0, 0, 0);
            if (itemDate === today) {
                copiesToday++;
            }
        });
        
        // Display chain stats
        const chainStatsContainer = document.getElementById('chainStats');
        chainStatsContainer.innerHTML = '';
        
        Object.keys(CHAIN_ICONS).forEach(chain => {
            const count = chainCounts[chain] || 0;
            const statDiv = document.createElement('div');
            statDiv.className = 'chain-stat';
            statDiv.innerHTML = `
                <div class="chain-stat-icon">${CHAIN_ICONS[chain]}</div>
                <span class="chain-stat-name">${CHAIN_NAMES[chain]}</span>
                <div class="chain-stat-count">${count}</div>
            `;
            chainStatsContainer.appendChild(statDiv);
        });
        
        // Today stats
        document.getElementById('copiesToday').textContent = copiesToday;
        
        // Top chain
        let topChain = '-';
        let maxCount = 0;
        Object.entries(chainCounts).forEach(([chain, count]) => {
            if (count > maxCount) {
                maxCount = count;
                topChain = `${CHAIN_ICONS[chain]} ${CHAIN_NAMES[chain]}`;
            }
        });
        document.getElementById('topChain').textContent = topChain;
    });
}

function loadHistory() {
    chrome.storage.sync.get(['history'], (result) => {
        const history = result.history || [];
        const historyList = document.getElementById('historyList');
        
        if (history.length === 0) {
            historyList.innerHTML = `
                <div class="empty-state">
                    <p>📭 No addresses copied yet</p>
                    <span>Start copying addresses from Twitter/X!</span>
                </div>
            `;
            return;
        }

        historyList.innerHTML = '';
        
        history.forEach(item => {
            const historyItem = createHistoryItem(item);
            historyList.appendChild(historyItem);
        });
    });
}

function createHistoryItem(item) {
    const div = document.createElement('div');
    div.className = 'history-item';
    
    const chainIcon = CHAIN_ICONS[item.chain] || '🔗';
    const chainName = CHAIN_NAMES[item.chain] || 'Unknown';
    const timestamp = new Date(item.timestamp).toLocaleString();
    const truncatedAddress = truncateAddress(item.address);
    
    const explorerUrl = (CHAIN_EXPLORERS[item.chain] || '') + item.address;
    const dexUrl = (CHAIN_DEX[item.chain] || '') + item.address;
    
    div.innerHTML = `
        <div class="history-item-header">
            <div class="history-chain">
                <span>${chainIcon}</span>
                <span>${chainName}</span>
            </div>
            <div class="history-timestamp">${timestamp}</div>
        </div>
        <div class="history-address">${truncatedAddress}</div>
        <div class="history-actions">
            <button class="history-btn btn-copy" data-address="${item.address}">📋 Copy</button>
            <button class="history-btn btn-explorer" data-url="${explorerUrl}">🔍 Explorer</button>
            <button class="history-btn btn-dex" data-url="${dexUrl}">📊 DEX</button>
        </div>
    `;
    
    // Event listeners
    div.querySelector('.btn-copy').addEventListener('click', (e) => {
        copyToClipboard(e.target.getAttribute('data-address'));
    });
    
    div.querySelector('.btn-explorer').addEventListener('click', (e) => {
        window.open(e.target.getAttribute('data-url'), '_blank');
    });
    
    div.querySelector('.btn-dex').addEventListener('click', (e) => {
        window.open(e.target.getAttribute('data-url'), '_blank');
    });
    
    return div;
}

function truncateAddress(address) {
    if (address.length <= 20) return address;
    return `${address.slice(0, 10)}...${address.slice(-8)}`;
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showNotification('✅ Address copied!', 'success');
    }).catch(() => {
        showNotification('❌ Failed to copy', 'error');
    });
}

function clearHistory() {
    if (!confirm('Clear all history? This cannot be undone.')) {
        return;
    }
    
    chrome.storage.sync.set({ history: [] }, () => {
        loadHistory();
        loadStats();
        showNotification('🗑️ History cleared!', 'success');
    });
}

function resetStats() {
    if (!confirm('Reset ALL statistics and history? This cannot be undone!')) {
        return;
    }
    
    chrome.storage.sync.set({ history: [] }, () => {
        loadHistory();
        loadStats();
        showNotification('🔥 All stats reset!', 'success');
    });
}

function loadSettings() {
    chrome.storage.sync.get(['settings'], (result) => {
        const settings = result.settings || {
            enableScamCheck: true,
            showChainIcons: true,
            truncateTxHash: true,
            truncateStartChars: 10,
            truncateEndChars: 8
        };

        document.getElementById('enableScamCheck').checked = settings.enableScamCheck;
        document.getElementById('showChainIcons').checked = settings.showChainIcons;
        document.getElementById('truncateTxHash').checked = settings.truncateTxHash;
        document.getElementById('truncateStartChars').value = settings.truncateStartChars;
        document.getElementById('truncateEndChars').value = settings.truncateEndChars;

        updateExample();
    });
}

function saveSettings() {
    const settings = {
        enableScamCheck: document.getElementById('enableScamCheck').checked,
        showChainIcons: document.getElementById('showChainIcons').checked,
        truncateTxHash: document.getElementById('truncateTxHash').checked,
        truncateStartChars: parseInt(document.getElementById('truncateStartChars').value),
        truncateEndChars: parseInt(document.getElementById('truncateEndChars').value)
    };

    chrome.storage.sync.set({ settings }, () => {
        showNotification('✅ Settings saved!', 'success');
        
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.reload(tabs[0].id);
            }
        });
    });
}

function resetSettings() {
    const defaultSettings = {
        enableScamCheck: true,
        showChainIcons: true,
        truncateTxHash: true,
        truncateStartChars: 10,
        truncateEndChars: 8
    };

    chrome.storage.sync.set({ settings: defaultSettings }, () => {
        loadSettings();
        showNotification('🔄 Settings reset!', 'success');
        
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.reload(tabs[0].id);
            }
        });
    });
}

function updateExample() {
    const startChars = parseInt(document.getElementById('truncateStartChars').value);
    const endChars = parseInt(document.getElementById('truncateEndChars').value);
    
    const fullHash = '0x90539e91fbebd0aaa050a492548b1e3b1bc7d82dd84bf8a42a9595a90';
    const truncated = `${fullHash.slice(0, startChars)}...${fullHash.slice(-endChars)}`;
    
    document.querySelector('.example-text').textContent = truncated;
}

function showNotification(message, type) {
    const notification = document.getElementById('notification');
    notification.textContent = message;
    notification.className = `notification ${type} show`;
    
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}