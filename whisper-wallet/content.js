// content.js - Whisper Wallet - WITH ADDRESS HISTORY

(function() {
    'use strict';

    const URLS = {
        ethereum: {
            name: 'Ethereum',
            explorer: 'https://etherscan.io/address/',
            tx: 'https://etherscan.io/tx/',
            dex: 'https://dexscreener.com/ethereum/',
            icon: '⟠'
        },
        bsc: {
            name: 'BSC',
            explorer: 'https://bscscan.com/address/',
            tx: 'https://bscscan.com/tx/',
            dex: 'https://dexscreener.com/bsc/',
            icon: '🟡'
        },
        polygon: {
            name: 'Polygon',
            explorer: 'https://polygonscan.com/address/',
            tx: 'https://polygonscan.com/tx/',
            dex: 'https://dexscreener.com/polygon/',
            icon: '🟣'
        },
        base: {
            name: 'Base',
            explorer: 'https://basescan.org/address/',
            tx: 'https://basescan.org/tx/',
            dex: 'https://dexscreener.com/base/',
            icon: '🔵'
        },
        arbitrum: {
            name: 'Arbitrum',
            explorer: 'https://arbiscan.io/address/',
            tx: 'https://arbiscan.io/tx/',
            dex: 'https://dexscreener.com/arbitrum/',
            icon: '🔷'
        },
        optimism: {
            name: 'Optimism',
            explorer: 'https://optimistic.etherscan.io/address/',
            tx: 'https://optimistic.etherscan.io/tx/',
            dex: 'https://dexscreener.com/optimism/',
            icon: '🔴'
        },
        avalanche: {
            name: 'Avalanche',
            explorer: 'https://snowtrace.io/address/',
            tx: 'https://snowtrace.io/tx/',
            dex: 'https://dexscreener.com/avalanche/',
            icon: '🔺'
        },
        solana: {
            name: 'Solana',
            solscan: 'https://solscan.io/account/',
            tx: 'https://solscan.io/tx/',
            gmgn: 'https://gmgn.ai/sol/token/',
            dex: 'https://dexscreener.com/solana/',
            icon: '◎'
        }
    };

    let settings = {
        enableScamCheck: true,
        showChainIcons: true,
        truncateTxHash: true,
        truncateStartChars: 10,
        truncateEndChars: 8
    };

    const processedNodes = new WeakSet();
    const processedElements = new WeakSet();
    const scamCheckCache = new Map();
    let scamCheckQueue = [];
    let isProcessingScamCheck = false;
    let currentChain = 'ethereum'; // Track current chain for history

    function loadSettings() {
        chrome.storage.sync.get(['settings'], (result) => {
            if (result.settings) {
                settings = { ...settings, ...result.settings };
            }
        });
    }

    loadSettings();

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'sync' && changes.settings) {
            settings = { ...settings, ...changes.settings.newValue };
        }
    });

    function truncateHash(hash, startChars, endChars) {
        if (!settings.truncateTxHash) return hash;
        if (hash.length <= startChars + endChars + 3) return hash;
        return `${hash.slice(0, startChars)}...${hash.slice(-endChars)}`;
    }

    // NEW: Save to history
    function saveToHistory(address, chain, type) {
        chrome.storage.sync.get(['history'], (result) => {
            let history = result.history || [];
            
            // Remove duplicate if exists
            history = history.filter(item => item.address !== address);
            
            // Add new entry at the beginning
            history.unshift({
                address: address,
                chain: chain,
                type: type, // 'address' or 'tx'
                timestamp: Date.now()
            });
            
            // Keep only last 20 entries
            history = history.slice(0, 20);
            
            // Save back to storage
            chrome.storage.sync.set({ history });
        });
    }

    function copyToClipboard(text, chain = 'ethereum', type = 'address') {
        navigator.clipboard.writeText(text).then(() => {
            showCopiedNotification(chain);
            saveToHistory(text, chain, type); // Save to history
        }).catch(err => {
            console.error('Failed to copy:', err);
        });
    }

    function showCopiedNotification(chain = 'ethereum') {
        const existing = document.getElementById('whisper-wallet-notification');
        if (existing) {
            existing.remove();
        }

        const chainName = URLS[chain]?.name || 'Address';
        const notification = document.createElement('div');
        notification.id = 'whisper-wallet-notification';
        notification.textContent = `✓ Address Copied!`;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 14px;
            font-weight: 600;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            z-index: 999999;
            animation: slideInRight 0.3s ease-out, ease-in 2s;
            pointer-events: none;
        `;

        if (!document.getElementById('whisper-wallet-animations')) {
            const style = document.createElement('style');
            style.id = 'whisper-wallet-animations';
            style.textContent = `
                @keyframes slideInRight {
                    from {
                        transform: translateX(100%);
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }
                @keyframes fadeOut {
                    from {
                        opacity: 1;
                    }
                    to {
                        opacity: 0;
                    }
                }
                @keyframes pulse {
                    0%, 100% {
                        transform: scale(1);
                    }
                    50% {
                        transform: scale(1.1);
                    }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 2500);
    }

    async function processScamCheckQueue() {
        if (!settings.enableScamCheck || isProcessingScamCheck || scamCheckQueue.length === 0) {
            return;
        }

        isProcessingScamCheck = true;
        const item = scamCheckQueue.shift();

        await performScamCheck(item.address, item.chain, item.container);

        setTimeout(() => {
            isProcessingScamCheck = false;
            processScamCheckQueue();
        }, 1000);
    }

    function queueScamCheck(address, chain, container) {
        if (!settings.enableScamCheck) return;
        
        const cacheKey = `${chain}-${address}`;
        
        if (scamCheckCache.has(cacheKey)) {
            const cached = scamCheckCache.get(cacheKey);
            if (cached.isScam) {
                addScamWarning(container, cached.riskLevel, cached.details);
            }
            return;
        }

        scamCheckQueue.push({ address, chain, container });
        processScamCheckQueue();
    }

    async function performScamCheck(address, chain, container) {
        const cacheKey = `${chain}-${address}`;
        
        try {
            const supportedChains = ['ethereum', 'bsc', 'polygon', 'arbitrum', 'base'];
            
            if (!supportedChains.includes(chain)) {
                scamCheckCache.set(cacheKey, { isScam: false, isChecking: false });
                return;
            }

            const chainMap = {
                'ethereum': '1',
                'bsc': '56',
                'polygon': '137',
                'arbitrum': '42161',
                'base': '8453'
            };

            const chainId = chainMap[chain];
            const apiUrl = `https://api.honeypot.is/v2/IsHoneypot?address=${address}&chainID=${chainId}`;

            const response = await fetch(apiUrl);
            
            if (!response.ok) {
                scamCheckCache.set(cacheKey, { isScam: false, isChecking: false });
                return;
            }

            const data = await response.json();

            let isScam = false;
            let riskLevel = 'safe';

            if (data.honeypotResult) {
                const result = data.honeypotResult;
                
                if (result.isHoneypot) {
                    isScam = true;
                    riskLevel = 'danger';
                } else if (result.honeypotReason || result.highTax) {
                    isScam = true;
                    riskLevel = 'warning';
                }
            }

            const scamInfo = { 
                isScam, 
                isChecking: false, 
                riskLevel,
                details: data.honeypotResult 
            };

            scamCheckCache.set(cacheKey, scamInfo);

            if (isScam) {
                addScamWarning(container, riskLevel, data.honeypotResult);
            }

        } catch (error) {
            scamCheckCache.set(cacheKey, { isScam: false, isChecking: false });
        }
    }

    function addScamWarning(container, riskLevel, details) {
        if (container.querySelector('.scam-warning')) {
            return;
        }

        const warning = document.createElement('span');
        warning.className = 'scam-warning';
        
        let icon, color, text, title;
        
        if (riskLevel === 'danger') {
            icon = '🚨';
            color = '#ff4444';
            text = 'SCAM';
            title = 'Warning: This token is likely a scam/honeypot. Do not buy!';
        } else {
            icon = '⚠️';
            color = '#ff9800';
            text = 'RISK';
            title = 'Caution: This token has suspicious characteristics.';
        }

        if (details?.honeypotReason) {
            title += `\nReason: ${details.honeypotReason}`;
        }

        warning.textContent = `${icon} ${text}`;
        warning.title = title;
        warning.style.cssText = `
            display: inline-flex;
            align-items: center;
            background: ${color};
            color: white;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 0.75em;
            font-weight: bold;
            margin-left: 6px;
            cursor: help;
            animation: pulse 2s infinite;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
        `;

        container.appendChild(warning);
    }

    function detectChainFromContext(fullText, matchIndex) {
        const textLower = fullText.toLowerCase();
        
        const chainPatterns = [
            { chain: 'base', patterns: [/\bbase\s*(chain|network)?\b/i, /\bonbase\b/i, /\bbasescan\b/i] },
            { chain: 'bsc', patterns: [/\bbsc\b/i, /\bbnb\s*chain\b/i, /\bbinance\s*(smart\s*)?chain\b/i, /\bpancakeswap\b/i, /\bbscscan\b/i] },
            { chain: 'polygon', patterns: [/\bpolygon\b/i, /\bmatic\b/i, /\bpolygonscan\b/i] },
            { chain: 'arbitrum', patterns: [/\barbitrum\b/i, /\barb\s*(one|nova)?\b/i, /\barbiscan\b/i] },
            { chain: 'optimism', patterns: [/\boptimism\b/i, /\bop\s*mainnet\b/i, /\boptimistic\b/i] },
            { chain: 'avalanche', patterns: [/\bavalanche\b/i, /\bavax\b/i, /\bc-chain\b/i, /\bsnowtrace\b/i] },
            { chain: 'ethereum', patterns: [/\bethereum\b/i, /\beth\s*(mainnet)?\b/i, /\betherscan\b/i, /\berc-?20\b/i, /\berc-?721\b/i] }
        ];
        
        for (const chainPattern of chainPatterns) {
            for (const pattern of chainPattern.patterns) {
                if (pattern.test(textLower)) {
                    return chainPattern.chain;
                }
            }
        }
        
        return 'ethereum';
    }

    function isValidSolanaAddress(str) {
        if (str.length < 32 || str.length > 44) return false;
        if (/[0OIl]/.test(str)) return false;
        if (/^\d+$/.test(str)) return false;
        if (str.startsWith('1') || str.startsWith('3')) return false;
        
        const excludeWords = ['TRANSACTION', 'ADDRESS', 'WALLET', 'FOLLOWING', 'FOLLOWERS', 'HTTPS', 'TWITTER'];
        if (excludeWords.some(word => str.toUpperCase().includes(word))) return false;
        
        const uniqueChars = new Set(str).size;
        if (uniqueChars < 15) return false;
        
        return true;
    }

    function isValidEvmAddress(str) {
        if (!/^0x[a-fA-F0-9]{40}$/.test(str)) return false;
        
        const hex = str.slice(2);
        const uniqueChars = new Set(hex.toLowerCase()).size;
        if (uniqueChars < 8) return false;
        
        return true;
    }

    function createEvmDualLink(text, chain, address) {
        const chainConfig = URLS[chain];
        const container = document.createElement('span');
        container.className = 'whisper-wallet-address';
        container.style.cssText = 'display: inline; white-space: normal;';
        
        const mainText = document.createElement('span');
        mainText.textContent = text;
        mainText.title = `Click to copy: ${address}`;
        mainText.style.cssText = `
            color: #1da1f2;
            cursor: pointer;
            font-family: monospace;
            user-select: text;
        `;
        
        mainText.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            copyToClipboard(address, chain, 'address');
        });
        
        mainText.addEventListener('mouseenter', () => {
            mainText.style.backgroundColor = '#e8f5fe';
        });
        
        mainText.addEventListener('mouseleave', () => {
            mainText.style.backgroundColor = 'transparent';
        });
        
        container.appendChild(mainText);

        if (settings.showChainIcons) {
            const explorerIcon = document.createElement('a');
            explorerIcon.href = chainConfig.explorer + address;
            explorerIcon.target = '_blank';
            explorerIcon.rel = 'noopener noreferrer';
            explorerIcon.textContent = ' ' + chainConfig.icon;
            explorerIcon.title = `Open in ${chainConfig.name} Explorer`;
            explorerIcon.style.cssText = 'text-decoration: none; cursor: pointer; margin-left: 2px;';
            
            explorerIcon.addEventListener('mouseenter', () => {
                explorerIcon.style.transform = 'scale(1.2)';
            });
            explorerIcon.addEventListener('mouseleave', () => {
                explorerIcon.style.transform = 'scale(1)';
            });
            
            const dexIcon = document.createElement('a');
            dexIcon.href = chainConfig.dex + address;
            dexIcon.target = '_blank';
            dexIcon.rel = 'noopener noreferrer';
            dexIcon.textContent = ' 📊';
            dexIcon.title = `Open in DEXScreener (${chainConfig.name})`;
            dexIcon.style.cssText = 'text-decoration: none; cursor: pointer; margin-left: 2px;';
            
            dexIcon.addEventListener('mouseenter', () => {
                dexIcon.style.transform = 'scale(1.2)';
            });
            dexIcon.addEventListener('mouseleave', () => {
                dexIcon.style.transform = 'scale(1)';
            });
            
            container.appendChild(explorerIcon);
            container.appendChild(dexIcon);
        }

        queueScamCheck(address, chain, container);
        
        return container;
    }

    function createSolanaQuadLink(text, address) {
        const container = document.createElement('span');
        container.className = 'whisper-wallet-address';
        container.style.cssText = 'display: inline; white-space: normal;';
        
        const mainText = document.createElement('span');
        mainText.textContent = text;
        mainText.title = `Click to copy: ${address}`;
        mainText.style.cssText = `
            color: #1da1f2;
            cursor: pointer;
            font-family: monospace;
            user-select: text;
        `;

        mainText.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            copyToClipboard(address, 'solana', 'address');
        });
        
        mainText.addEventListener('mouseenter', () => {
            mainText.style.backgroundColor = '#e8f5fe';
        });
        mainText.addEventListener('mouseleave', () => {
            mainText.style.backgroundColor = 'transparent';
        });
        
        container.appendChild(mainText);

        if (settings.showChainIcons) {
            const solscanIcon = document.createElement('a');
            solscanIcon.href = URLS.solana.solscan + address;
            solscanIcon.target = '_blank';
            solscanIcon.rel = 'noopener noreferrer';
            solscanIcon.textContent = ' ◎';
            solscanIcon.title = 'Open in Solscan';
            solscanIcon.style.cssText = 'text-decoration: none; cursor: pointer; margin-left: 2px;';
            
            solscanIcon.addEventListener('mouseenter', () => { solscanIcon.style.transform = 'scale(1.2)'; });
            solscanIcon.addEventListener('mouseleave', () => { solscanIcon.style.transform = 'scale(1)'; });
            
            const dexIcon = document.createElement('a');
            dexIcon.href = URLS.solana.dex + address;
            dexIcon.target = '_blank';
            dexIcon.rel = 'noopener noreferrer';
            dexIcon.textContent = ' 📊';
            dexIcon.title = 'Open in DEXScreener (Solana)';
            dexIcon.style.cssText = 'text-decoration: none; cursor: pointer; margin-left: 2px;';
            
            dexIcon.addEventListener('mouseenter', () => { dexIcon.style.transform = 'scale(1.2)'; });
            dexIcon.addEventListener('mouseleave', () => { dexIcon.style.transform = 'scale(1)'; });
            
            const gmgnIcon = document.createElement('a');
            gmgnIcon.href = URLS.solana.gmgn + address;
            gmgnIcon.target = '_blank';
            gmgnIcon.rel = 'noopener noreferrer';
            gmgnIcon.textContent = ' 🚀';
            gmgnIcon.title = 'Open in GMGN.ai';
            gmgnIcon.style.cssText = 'text-decoration: none; cursor: pointer; margin-left: 2px;';
            
            gmgnIcon.addEventListener('mouseenter', () => { gmgnIcon.style.transform = 'scale(1.2)'; });
            gmgnIcon.addEventListener('mouseleave', () => { gmgnIcon.style.transform = 'scale(1)'; });
            
            container.appendChild(solscanIcon);
            container.appendChild(dexIcon);
            container.appendChild(gmgnIcon);
        }
        
        return container;
    }

    function createTxLink(text, url, type, chain = 'ethereum') {
        const container = document.createElement('span');
        container.className = 'whisper-wallet-address';
        container.style.cssText = 'display: inline; white-space: normal;';
        
        const displayText = truncateHash(text, settings.truncateStartChars, settings.truncateEndChars);
        
        const txText = document.createElement('span');
        txText.textContent = displayText;
        txText.title = `Click to copy full hash: ${text}`;
        txText.style.cssText = `
            color: #1da1f2;
            cursor: pointer;
            font-family: monospace;
            user-select: text;
        `;
        
        txText.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            copyToClipboard(text, chain, 'tx');
        });
        
        txText.addEventListener('mouseenter', () => {
            txText.style.backgroundColor = '#e8f5fe';
        });
        txText.addEventListener('mouseleave', () => {
            txText.style.backgroundColor = 'transparent';
        });
        
        container.appendChild(txText);

        if (settings.showChainIcons) {
            const explorerIcon = document.createElement('a');
            explorerIcon.href = url;
            explorerIcon.target = '_blank';
            explorerIcon.rel = 'noopener noreferrer';
            explorerIcon.style.cssText = 'text-decoration: none; cursor: pointer; margin-left: 2px;';
            
            if (type === 'evmTx') {
                const chainConfig = URLS[chain];
                explorerIcon.textContent = ' ' + chainConfig.icon;
                explorerIcon.title = `Open Transaction in ${chainConfig.name}`;
            } else if (type === 'solanaTx') {
                explorerIcon.textContent = ' ◎';
                explorerIcon.title = 'Open Transaction in Solscan';
            }
            
            explorerIcon.addEventListener('mouseenter', () => { explorerIcon.style.transform = 'scale(1.2)'; });
            explorerIcon.addEventListener('mouseleave', () => { explorerIcon.style.transform = 'scale(1)'; });
            
            container.appendChild(explorerIcon);
        }
        
        return container;
    }

    function findAddresses(text) {
        const matches = [];
        
        const evmTxPattern = /\b(0x[a-fA-F0-9]{64})\b/g;
        let match;
        while ((match = evmTxPattern.exec(text)) !== null) {
            const chain = detectChainFromContext(text, match.index);
            matches.push({
                index: match.index,
                length: match[0].length,
                text: match[0],
                type: 'evmTx',
                chain: chain,
                url: URLS[chain].tx + match[0]
            });
        }
        
        const evmAddrPattern = /\b(0x[a-fA-F0-9]{40})\b/g;
        while ((match = evmAddrPattern.exec(text)) !== null) {
            const overlaps = matches.some(m => 
                match.index >= m.index && match.index < m.index + m.length
            );
            
            if (!overlaps && isValidEvmAddress(match[0])) {
                const chain = detectChainFromContext(text, match.index);
                matches.push({
                    index: match.index,
                    length: match[0].length,
                    text: match[0],
                    type: 'evmDual',
                    chain: chain,
                    address: match[0]
                });
            }
        }
        
        const solanaPattern = /\b([1-9A-HJ-NP-Za-km-z]{32,44})\b/g;
        while ((match = solanaPattern.exec(text)) !== null) {
            const overlaps = matches.some(m => 
                match.index >= m.index && match.index < m.index + m.length
            );
            
            if (!overlaps && isValidSolanaAddress(match[0])) {
                matches.push({
                    index: match.index,
                    length: match[0].length,
                    text: match[0],
                    type: 'solanaQuad',
                    address: match[0]
                });
            }
        }
        
        const solanaTxPattern = /\b([1-9A-HJ-NP-Za-km-z]{87,88})\b/g;
        while ((match = solanaTxPattern.exec(text)) !== null) {
            const overlaps = matches.some(m => 
                match.index >= m.index && match.index < m.index + m.length
            );
            
            if (!overlaps && isValidSolanaAddress(match[0])) {
                matches.push({
                    index: match.index,
                    length: match[0].length,
                    text: match[0],
                    type: 'solanaTx',
                    url: URLS.solana.tx + match[0]
                });
            }
        }
        
        return matches.sort((a, b) => a.index - b.index);
    }

    function processTextNode(node) {
        if (processedNodes.has(node)) return;
        if (!node.textContent || !node.textContent.trim()) return;
        
        if (node.parentElement) {
            if (node.parentElement.tagName === 'A') return;
            if (node.parentElement.classList?.contains('whisper-wallet-address')) return;
        }
        
        const text = node.textContent;
        const matches = findAddresses(text);
        
        if (matches.length === 0) return;
        
        const fragments = [];
        let lastIndex = 0;
        
        matches.forEach(match => {
            if (match.index > lastIndex) {
                fragments.push(document.createTextNode(text.substring(lastIndex, match.index)));
            }
            
            if (match.type === 'evmDual') {
                fragments.push(createEvmDualLink(match.text, match.chain, match.address));
            } else if (match.type === 'solanaQuad') {
                fragments.push(createSolanaQuadLink(match.text, match.address));
            } else if (match.type === 'evmTx' || match.type === 'solanaTx') {
                fragments.push(createTxLink(match.text, match.url, match.type, match.chain));
            }
            
            lastIndex = match.index + match.length;
        });
        
        if (lastIndex < text.length) {
            fragments.push(document.createTextNode(text.substring(lastIndex)));
        }
        
        const parent = node.parentNode;
        if (parent) {
            const wrapper = document.createElement('span');
            wrapper.style.cssText = 'display: inline;';
            fragments.forEach(fragment => wrapper.appendChild(fragment));
            parent.replaceChild(wrapper, node);
            processedNodes.add(wrapper);
            processedNodes.add(node);
        }
    }

    function processElement(element) {
        if (!element) return;
        if (element.querySelector('.whisper-wallet-address')) return;
        
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
            acceptNode: function(node) {
                const parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;
                
                const tagName = parent.tagName;
                if (tagName === 'SCRIPT' || tagName === 'STYLE' || tagName === 'A' ||
                    tagName === 'TEXTAREA' || tagName === 'INPUT' ||
                    parent.classList?.contains('whisper-wallet-address') ||
                    processedNodes.has(node)) {
                    return NodeFilter.FILTER_REJECT;
                }
                
                return NodeFilter.FILTER_ACCEPT;
            }
        });

        const textNodes = [];
        let currentNode;
        while (currentNode = walker.nextNode()) {
            textNodes.push(currentNode);
        }

        textNodes.forEach(processTextNode);
    }

    function processTweets() {
        const tweetArticles = document.querySelectorAll('article[data-testid="tweet"]');
        
        tweetArticles.forEach(article => {
            if (!processedElements.has(article)) {
                processElement(article);
                processedElements.add(article);
            }
        });
    }

    function init() {
        processElement(document.body);
        processTweets();
    }

    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE) {
                    setTimeout(() => {
                        processElement(node);
                        processTweets();
                    }, 100);
                } else if (node.nodeType === Node.TEXT_NODE) {
                    setTimeout(() => processTextNode(node), 100);
                }
            });
        });
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    setTimeout(() => {
        if (document.body) {
            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    }, 1000);

    setInterval(() => {
        processTweets();
    }, 5000);

    console.log('🔍 Whisper Wallet v1.1.0 - With Address History');
})();