// Core Configuration
const CONFIG = {
    API_ENDPOINTS: {
        BASE: 'https://gartic.io/req',
        ROOMS: '/list',
        PLAYER: '/player'
    },
    PROXY_SERVERS: [
        'https://cors-anywhere.herokuapp.com/',
        'https://api.allorigins.win/raw?url=',
        'https://proxy.cors.sh/',
        'https://corsproxy.io/?'
    ],
    WEBSOCKET_SERVERS: ['01', '02', '03', '04', '05', '06'],
    UPDATE_INTERVAL: 5000,
    MAX_RETRY_ATTEMPTS: 3,
    TIMEOUT: 10000
};

// Enhanced Bypass System
class BypassSystem {
    constructor() {
        this.proxyIndex = 0;
        this.retryCount = 0;
        this.activeProxy = null;
        this.proxyRotationInterval = null;
        this.wsConnections = new Map();
        this.initializeProxyRotation();
    }

    initializeProxyRotation() {
        this.proxyRotationInterval = setInterval(() => {
            this.rotateProxy();
        }, 30000);
    }

    rotateProxy() {
        this.proxyIndex = (this.proxyIndex + 1) % CONFIG.PROXY_SERVERS.length;
        this.activeProxy = CONFIG.PROXY_SERVERS[this.proxyIndex];
        console.log(`Rotated to proxy: ${this.activeProxy}`);
    }

    async fetchWithBypass(endpoint, options = {}) {
        try {
            const response = await fetch(this.activeProxy + encodeURIComponent(CONFIG.API_ENDPOINTS.BASE + endpoint), {
                ...options,
                headers: {
                    'Origin': 'https://gartic.io',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    ...options.headers
                }
            });

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return await response.json();
        } catch (error) {
            this.retryCount++;
            if (this.retryCount >= CONFIG.MAX_RETRY_ATTEMPTS) {
                throw new Error('Maximum retry attempts reached');
            }
            this.rotateProxy();
            return this.fetchWithBypass(endpoint, options);
        }
    }

    async connectWebSocket(roomCode) {
        return new Promise((resolve, reject) => {
            const playerData = new Map();
            let connectedCount = 0;

            CONFIG.WEBSOCKET_SERVERS.forEach(server => {
                const ws = new WebSocket(`wss://server${server}.gartic.io/socket.io/?EIO=3&transport=websocket`);
                
                ws.onopen = () => {
                    ws.send(`42[12,{"v":20000,"platform":0,"sala":"${roomCode}"}]`);
                    this.wsConnections.set(roomCode + server, ws);
                };

                ws.onmessage = (event) => {
                    try {
                        if (event.data.startsWith('42["5"')) {
                            const data = JSON.parse(event.data.substr(2))[1];
                            data.players.forEach(player => {
                                playerData.set(player.id, {
                                    id: player.id,
                                    nick: player.nick,
                                    points: player.points,
                                    avatar: player.avatar,
                                    customProfile: !!player.foto,
                                    room: roomCode,
                                    lastSeen: Date.now()
                                });
                            });
                        }
                    } catch (error) {
                        console.error('WebSocket message parsing error:', error);
                    }
                };

                ws.onclose = () => {
                    connectedCount++;
                    this.wsConnections.delete(roomCode + server);
                    if (connectedCount === CONFIG.WEBSOCKET_SERVERS.length) {
                        resolve(Array.from(playerData.values()));
                    }
                };

                ws.onerror = (error) => {
                    console.error('WebSocket connection error:', error);
                    connectedCount++;
                    if (connectedCount === CONFIG.WEBSOCKET_SERVERS.length) {
                        resolve(Array.from(playerData.values()));
                    }
                };
            });

            setTimeout(() => reject(new Error('WebSocket connection timeout')), CONFIG.TIMEOUT);
        });
    }

    cleanup() {
        clearInterval(this.proxyRotationInterval);
        this.wsConnections.forEach(ws => ws.close());
        this.wsConnections.clear();
    }
}

// Data Management System
class DataManager {
    constructor() {
        this.rooms = new Map();
        this.players = new Map();
        this.stats = {
            totalPlayers: 0,
            activeRooms: 0,
            customProfiles: 0,
            averagePoints: 0
        };
        this.lastUpdate = null;
    }

    updateRooms(roomsData) {
        this.rooms.clear();
        roomsData.forEach(room => {
            if (room.quant > 0) {
                this.rooms.set(room.code, {
                    code: room.code,
                    players: room.quant,
                    language: room.lang,
                    timestamp: Date.now()
                });
            }
        });
        this.stats.activeRooms = this.rooms.size;
    }

    updatePlayers(playersData) {
        playersData.forEach(player => {
            this.players.set(player.id, {
                ...player,
                lastUpdate: Date.now()
            });
        });
        this.updateStats();
    }

    updateStats() {
        const players = Array.from(this.players.values());
        this.stats.totalPlayers = players.length;
        this.stats.customProfiles = players.filter(p => p.customProfile).length;
        this.stats.averagePoints = Math.floor(
            players.reduce((acc, p) => acc + p.points, 0) / players.length
        );
        this.lastUpdate = Date.now();
    }

    cleanup() {
        const threshold = Date.now() - 300000; // 5 minutes
        for (const [id, player] of this.players) {
            if (player.lastUpdate < threshold) {
                this.players.delete(id);
            }
        }
    }
}

// UI Management System
class UIManager {
    constructor() {
        this.initializeEventListeners();
        this.charts = new Map();
        this.initializeCharts();
    }

    initializeEventListeners() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => this.handleNavigation(item.dataset.page));
        });

        document.querySelector('.search-input')?.addEventListener('input', 
            debounce((e) => this.handleSearch(e.target.value), 300)
        );

        document.querySelector('.refresh-btn')?.addEventListener('click', 
            () => window.app.refreshData()
        );
    }

    initializeCharts() {
        // Activity Chart
        const activityCtx = document.querySelector('.activity-chart')?.getContext('2d');
        if (activityCtx) {
            this.charts.set('activity', new Chart(activityCtx, {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: 'Active Players',
                        data: [],
                        borderColor: '#6c5ce7',
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false
                }
            }));
        }
    }

    updateStats(stats) {
        Object.entries(stats).forEach(([key, value]) => {
            const element = document.querySelector(`.stat-value[data-stat="${key}"]`);
            if (element) {
                element.textContent = typeof value === 'number' ? 
                    value.toLocaleString() : value;
            }
        });
    }

    updatePlayerGrid(players) {
        const container = document.querySelector('.players-container');
        if (!container) return;

        container.innerHTML = players.map(player => this.createPlayerCard(player)).join('');
    }

    createPlayerCard(player) {
        return `
            <div class="player-card" data-player-id="${player.id}">
                <div class="player-header">
                    <img class="player-avatar" src="${this.getPlayerAvatar(player)}" alt="${player.nick}">
                    <div class="player-info">
                        <div class="player-name">${player.nick}</div>
                        <div class="player-status">${this.formatLastSeen(player.lastSeen)}</div>
                    </div>
                </div>
                <div class="player-stats">
                    <div class="stat-item">
                        <span class="stat-label">Points</span>
                        <span class="stat-value">${player.points.toLocaleString()}</span>
                    </div>
                </div>
                <div class="player-actions">
                    <button onclick="window.app.joinRoom('${player.room}')">Join Room</button>
                </div>
            </div>
        `;
    }

    getPlayerAvatar(player) {
        return player.customProfile ? 
            player.foto : 
            `https://gartic.io/static/images/avatar/svg/${player.avatar}.svg`;
    }

    formatLastSeen(timestamp) {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < 60) return 'Just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        return `${Math.floor(seconds / 3600)}h ago`;
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        
        const container = document.querySelector('.toast-container') || 
            document.body.appendChild(document.createElement('div'));
        container.className = 'toast-container';
        container.appendChild(toast);

        setTimeout(() => toast.remove(), 3000);
    }

    handleNavigation(page) {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.page === page);
        });
        // Implement page switching logic
    }

    handleSearch(query) {
        // Implement search logic
    }
}

// Main Application
class GarticEnhanced {
    constructor() {
        this.bypass = new BypassSystem();
        this.data = new DataManager();
        this.ui = new UIManager();
        this.updateInterval = null;
    }

    async initialize() {
        try {
            load.show('Initializing systems...');
            await this.refreshData();
            this.startUpdateCycle();
            load.success('System initialized successfully');
        } catch (error) {
            console.error('Initialization error:', error);
            load.error('Failed to initialize system');
        }
    }

    async refreshData() {
        try {
            const rooms = await this.bypass.fetchWithBypass(CONFIG.API_ENDPOINTS.ROOMS);
            this.data.updateRooms(rooms);

            for (const room of this.data.rooms.values()) {
                const players = await this.bypass.connectWebSocket(room.code);
                this.data.updatePlayers(players);
            }

            this.ui.updateStats(this.data.stats);
            this.ui.updatePlayerGrid(Array.from(this.data.players.values()));
        } catch (error) {
            console.error('Data refresh error:', error);
            this.ui.showToast('Failed to refresh data', 'error');
        }
    }

    startUpdateCycle() {
        this.updateInterval = setInterval(() => {
            this.refreshData();
            this.data.cleanup();
        }, CONFIG.UPDATE_INTERVAL);
    }

    async joinRoom(roomCode) {
        window.open(`https://gartic.io/${roomCode}`, '_blank');
    }

    cleanup() {
        clearInterval(this.updateInterval);
        this.bypass.cleanup();
    }
}

// Utility Functions
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Initialize Application
window.app = new GarticEnhanced();
window.addEventListener('load', () => window.app.initialize());
window.addEventListener('beforeunload', () => window.app.cleanup());
