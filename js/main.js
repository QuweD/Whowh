import GarticProxy from './proxy.js';
import WebSocketManager from './websocket.js';
import GarticUI from './ui.js';

class GarticMain {
    constructor() {
        this.proxy = GarticProxy;
        this.wsManager = WebSocketManager;
        this.ui = GarticUI;
        this.isRunning = false;
        this.activeServers = new Set();
        this.activeRooms = new Map();
        this.updateInterval = null;
        this.lastRoomUpdate = 0;
        this.config = {
            roomUpdateInterval: 30000,
            playerTimeout: 30000,
            maxRoomsPerServer: 10,
            maxRetries: 3,
            languages: {
                8: 'Türkçe',
                1: 'English',
                3: 'Español',
                2: 'Português',
                4: 'Русский'
            }
        };
    }

    async init() {
        await this.proxy.init();
        this.ui.init();
        this.setupEventListeners();
        this.initializeState();
    }

    setupEventListeners() {
        window.startTracking = () => this.start();
        window.stopTracking = () => this.stop();

        document.addEventListener('proxyMessage', (event) => {
            this.handleProxyMessage(event.detail);
        });

        window.addEventListener('beforeunload', () => {
            this.cleanup();
        });
    }

    initializeState() {
        const servers = ['server01', 'server02', 'server03', 'server04', 'server05', 'server06'];
        servers.forEach(server => {
            this.activeServers.add(server);
        });
    }

    async start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.ui.showLoader('Initializing tracking system...');

        try {
            await this.updateRooms();
            this.startUpdateCycle();
            this.ui.hideLoader();
        } catch (error) {
            this.ui.showError('Failed to start tracking system');
            this.stop();
        }
    }

    stop() {
        this.isRunning = false;
        this.cleanup();
        clearInterval(this.updateInterval);
        this.ui.hideLoader();
    }

    cleanup() {
        this.proxy.disconnectAll();
        this.wsManager.disconnectAll();
        this.activeRooms.clear();
    }

    async updateRooms() {
        const now = Date.now();
        if (now - this.lastRoomUpdate < this.config.roomUpdateInterval) return;

        try {
            const language = document.getElementById('languageSelect').value;
            const response = await fetch(`https://gartic.io/req/list?search=&language[]=${language}`, {
                headers: {
                    'Accept': 'application/json',
                    'Referer': 'https://gartic.io/',
                }
            });

            const rooms = await response.json();
            this.processRooms(rooms);
            this.lastRoomUpdate = now;
        } catch (error) {
            console.error('Failed to update rooms:', error);
        }
    }

    processRooms(rooms) {
        const activeRoomCodes = new Set();

        rooms.forEach(room => {
            if (room.quant > 0) {
                activeRoomCodes.add(room.code);
                if (!this.activeRooms.has(room.code)) {
                    this.connectToRoom(room);
                }
            }
        });

        this.activeRooms.forEach((room, code) => {
            if (!activeRoomCodes.has(code)) {
                this.disconnectFromRoom(code);
            }
        });
    }

    connectToRoom(room) {
        const servers = Array.from(this.activeServers);
        const selectedServers = servers.slice(0, this.config.maxRoomsPerServer);

        selectedServers.forEach(server => {
            this.proxy.connect(server, room.code, {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Origin': 'https://gartic.io',
                'Referer': `https://gartic.io/${room.code}`
            });
        });

        this.activeRooms.set(room.code, {
            ...room,
            servers: selectedServers,
            lastUpdate: Date.now()
        });
    }

    disconnectFromRoom(roomCode) {
        const room = this.activeRooms.get(roomCode);
        if (room) {
            room.servers.forEach(server => {
                this.proxy.disconnect(server, roomCode);
            });
            this.activeRooms.delete(roomCode);
        }
    }

    handleProxyMessage(message) {
        const { server, room, data } = message;

        if (Array.isArray(data) && data[0] === 5) {
            const players = data[5];
            players.forEach(player => {
                this.ui.updatePlayer({
                    id: player.id,
                    nick: player.nick,
                    points: player.pontos,
                    avatar: player.avatar,
                    foto: player.foto,
                    room: `https://gartic.io/${room}`,
                    server: server
                });
            });
        }
    }

    startUpdateCycle() {
        this.updateInterval = setInterval(async () => {
            if (this.isRunning) {
                await this.updateRooms();
            }
        }, this.config.roomUpdateInterval);
    }

    getStats() {
        return {
            activeRooms: this.activeRooms.size,
            activeServers: this.activeServers.size,
            isRunning: this.isRunning
        };
    }
}

const garticMain = new GarticMain();
garticMain.init();

export default garticMain;
