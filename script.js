// Core Configuration
const CONFIG = {
    WS_SERVERS: ['01', '02', '03', '04', '05', '06'],
    WS_URL: 'wss://server{}.gartic.io/',
    API_URL: 'https://gartic.io/req/',
    ENDPOINTS: {
        ROOMS: 'list',
        PLAYER: 'player',
        DRAW: 'draw'
    },
    UPDATE_INTERVAL: 3000,
    RETRY_ATTEMPTS: 3,
    BYPASS_METHODS: ['direct', 'websocket', 'iframe']
};

// WebSocket Handler
class WebSocketManager {
    constructor() {
        this.connections = new Map();
        this.messageQueue = [];
        this.reconnectAttempts = 0;
    }

    connect(server) {
        const ws = new WebSocket(CONFIG.WS_URL.replace('{}', server));
        
        ws.onopen = () => {
            console.log(`Connected to server ${server}`);
            this.initializeConnection(ws, server);
        };

        ws.onmessage = (event) => this.handleMessage(event.data, server);
        
        ws.onerror = (error) => {
            console.error(`WebSocket error on server ${server}:`, error);
            this.handleError(server);
        };

        ws.onclose = () => this.handleClose(server);
        
        this.connections.set(server, ws);
    }

    initializeConnection(ws, server) {
        ws.send('2probe');
        ws.send('5');
        this.joinAllRooms(server);
    }

    handleMessage(data, server) {
        if (data.startsWith('42')) {
            try {
                const parsedData = JSON.parse(data.slice(2));
                this.processMessage(parsedData, server);
            } catch (error) {
                console.error('Message parsing error:', error);
            }
        }
    }

    processMessage([event, data]) {
        switch(event) {
            case 'rooms':
                app.updateRooms(data);
                break;
            case 'players':
                app.updatePlayers(data);
                break;
            case 'draw':
                app.handleDrawData(data);
                break;
        }
    }

    joinRoom(roomCode) {
        this.connections.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(`42["join",{"sala":"${roomCode}","v":20000}]`);
            }
        });
    }

    broadcastMessage(message) {
        this.connections.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(message);
            }
        });
    }
}

// Bypass System
class BypassSystem {
    constructor() {
        this.currentMethod = CONFIG.BYPASS_METHODS[0];
        this.successRate = 100;
        this.blocked = false;
    }

    async initialize() {
        await this.setupBypass();
        this.startHeartbeat();
    }

    async setupBypass() {
        const frame = document.createElement('iframe');
        frame.style.display = 'none';
        frame.src = 'https://gartic.io';
        document.body.appendChild(frame);

        return new Promise(resolve => {
            frame.onload = () => {
                this.frame = frame;
                resolve();
            };
        });
    }

    async fetchWithBypass(endpoint, options = {}) {
        if (this.blocked) {
            await this.rotateMethod();
        }

        try {
            const response = await this.executeRequest(endpoint, options);
            this.updateSuccessRate(true);
            return response;
        } catch (error) {
            this.updateSuccessRate(false);
            throw error;
        }
    }

    async executeRequest(endpoint, options) {
        switch (this.currentMethod) {
            case 'direct':
                return this.directRequest(endpoint, options);
            case 'websocket':
                return this.wsRequest(endpoint, options);
            case 'iframe':
                return this.iframeRequest(endpoint, options);
            default:
                throw new Error('Invalid bypass method');
        }
    }

    updateSuccessRate(success) {
        const weight = 0.3;
        this.successRate = this.successRate * (1 - weight) + (success ? 100 : 0) * weight;
        app.updateBypassStatus(this.successRate);
    }

    startHeartbeat() {
        setInterval(() => {
            this.checkConnection();
        }, 30000);
    }
}

// Main Application
class GarticEnhanced {
    constructor() {
        this.ws = new WebSocketManager();
        this.bypass = new BypassSystem();
        this.rooms = new Map();
        this.players = new Map();
        this.stats = {
            totalPlayers: 0,
            activeRooms: 0,
            totalPoints: 0,
            bypassRate: 100
        };
    }

    async initialize() {
        try {
            await this.bypass.initialize();
            this.initializeWebSockets();
            this.setupEventListeners();
            this.startUpdateCycle();
            this.updateUI();
        } catch (error) {
            console.error('Initialization error:', error);
            this.showError('Failed to initialize application');
        }
    }

    initializeWebSockets() {
        CONFIG.WS_SERVERS.forEach(server => {
            this.ws.connect(server);
        });
    }

    setupEventListeners() {
        document.querySelector('.refresh-btn')?.addEventListener('click', () => this.refreshData());
        document.querySelector('.search-input')?.addEventListener('input', (e) => this.handleSearch(e.target.value));
        
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => this.changePage(item.dataset.page));
        });
    }

    async refreshData() {
        try {
            const rooms = await this.bypass.fetchWithBypass(CONFIG.ENDPOINTS.ROOMS);
            this.updateRooms(rooms);
            this.updateStats();
            this.showSuccess('Data refreshed successfully');
        } catch (error) {
            this.showError('Failed to refresh data');
        }
    }

    updateRooms(rooms) {
        this.rooms.clear();
        rooms.forEach(room => {
            if (room.quant > 0) {
                this.rooms.set(room.code, {
                    code: room.code,
                    players: room.quant,
                    language: room.lang,
                    timestamp: Date.now()
                });
            }
        });
        this.updateUI();
    }

    updatePlayers(data) {
        if (data.players) {
            data.players.forEach(player => {
                this.players.set(player.id, {
                    id: player.id,
                    name: player.nick,
                    points: player.points,
                    avatar: player.avatar,
                    room: data.room,
                    lastSeen: Date.now()
                });
            });
            this.updateStats();
            this.updateUI();
        }
    }

    updateStats() {
        this.stats.totalPlayers = this.players.size;
        this.stats.activeRooms = this.rooms.size;
        this.stats.totalPoints = Array.from(this.players.values())
            .reduce((sum, player) => sum + player.points, 0);
        
        Object.entries(this.stats).forEach(([key, value]) => {
            const element = document.querySelector(`[data-stat="${key}"]`);
            if (element) {
                element.textContent = typeof value === 'number' ? 
                    value.toLocaleString() : value;
            }
        });
    }

    updateUI() {
        this.updatePlayersList();
        this.updateRoomsList();
    }

    updatePlayersList() {
        const container = document.getElementById('playersContainer');
        if (!container) return;

        const playerCards = Array.from(this.players.values())
            .map(player => this.createPlayerCard(player))
            .join('');

        container.innerHTML = playerCards;
    }

    createPlayerCard(player) {
        return `
            <div class="player-card" data-player-id="${player.id}">
                <div class="player-header">
                    <img src="https://gartic.io/static/images/avatar/svg/${player.avatar}.svg" 
                         alt="${player.name}" class="player-avatar">
                    <div class="player-info">
                        <div class="player-name">${player.name}</div>
                        <div class="player-room">Room: ${player.room}</div>
                    </div>
                </div>
                <div class="player-stats">
                    <div class="stat">
                        <span class="stat-label">Points</span>
                        <span class="stat-value">${player.points.toLocaleString()}</span>
                    </div>
                </div>
                <div class="player-actions">
                    <button onclick="app.joinRoom('${player.room}')" class="action-btn">
                        Join Room
                    </button>
                </div>
            </div>
        `;
    }

    showSuccess(message) {
        this.showToast(message, 'success');
    }

    showError(message) {
        this.showToast(message, 'error');
    }

    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        
        const container = document.querySelector('.toast-container');
        container.appendChild(toast);
        
        setTimeout(() => toast.remove(), 3000);
    }

    startUpdateCycle() {
        setInterval(() => this.refreshData(), CONFIG.UPDATE_INTERVAL);
    }
}

// Initialize Application
const app = new GarticEnhanced();
window.addEventListener('load', () => app.initialize());
