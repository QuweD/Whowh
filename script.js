class GarticTracker {
    constructor() {
        this.players = new Map();
        this.rooms = new Map();
        this.connections = new Map();
        this.isTracking = false;
        this.updateInterval = null;
        this.proxyFrames = new Map();
        this.stats = {
            playerCount: 0,
            roomCount: 0,
            serverCount: 0,
            updateRate: 0
        };
        this.lastUpdateTime = Date.now();
        this.updateCount = 0;
    }

    async init() {
        this.setupMessageHandlers();
        this.createProxyFrames();
        this.setupWebSocketInterceptor();
    }

    createProxyFrames() {
        const servers = ['server01', 'server02', 'server03', 'server04', 'server05', 'server06'];
        servers.forEach(server => {
            const frame = document.createElement('iframe');
            frame.style.display = 'none';
            frame.sandbox = 'allow-scripts allow-same-origin';
            frame.srcdoc = this.generateProxyFrameContent(server);
            document.body.appendChild(frame);
            this.proxyFrames.set(server, frame);
        });
    }

    generateProxyFrameContent(server) {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <script>
                    class WebSocketProxy {
                        constructor() {
                            this.connections = new Map();
                            this.server = '${server}';
                            this.setupMessageHandler();
                        }

                        setupMessageHandler() {
                            window.addEventListener('message', (event) => {
                                if (event.data.type === 'connect') {
                                    this.connect(event.data.room);
                                } else if (event.data.type === 'disconnect') {
                                    this.disconnectAll();
                                }
                            });
                        }

                        connect(roomCode) {
                            const ws = new WebSocket(\`wss://${server}.gartic.io/socket.io/?EIO=3&transport=websocket\`);
                            
                            ws.onopen = () => {
                                const headers = {
                                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                                    'Origin': 'https://gartic.io',
                                    'Referer': 'https://gartic.io/'
                                };

                                ws.send(\`42["init",{"v":20000,"platform":0,"sala":"\${roomCode}"}]\`);
                                
                                Object.entries(headers).forEach(([key, value]) => {
                                    try {
                                        ws._socket.setHeader(key, value);
                                    } catch(e) {}
                                });
                            };

                            ws.onmessage = (event) => {
                                if (event.data.startsWith('42')) {
                                    try {
                                        const data = JSON.parse(event.data.slice(2));
                                        window.parent.postMessage({
                                            type: 'wsMessage',
                                            server: this.server,
                                            room: roomCode,
                                            data: data
                                        }, '*');
                                    } catch(e) {}
                                }
                            };

                            this.connections.set(roomCode, ws);
                        }

                        disconnectAll() {
                            this.connections.forEach(ws => ws.close());
                            this.connections.clear();
                        }
                    }

                    new WebSocketProxy();
                </script>
            </head>
            <body></body>
            </html>
        `;
    }

    setupMessageHandlers() {
        window.addEventListener('message', (event) => {
            if (event.data.type === 'wsMessage') {
                this.handleWebSocketMessage(event.data);
            }
        });
    }

    setupWebSocketInterceptor() {
        const originalWebSocket = window.WebSocket;
        window.WebSocket = function(url, protocols) {
            const ws = new originalWebSocket(url, protocols);
            ws.addEventListener('message', (event) => {
                if (event.data.startsWith('42')) {
                    try {
                        const data = JSON.parse(event.data.slice(2));
                        window.dispatchEvent(new CustomEvent('wsMessage', { detail: data }));
                    } catch(e) {}
                }
            });
            return ws;
        };
    }

    async getRooms(language) {
        try {
            const response = await fetch(`https://gartic.io/req/list?search=&language[]=${language}`, {
                headers: {
                    'Accept': 'application/json',
                    'Referer': 'https://gartic.io/',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });
            return await response.json();
        } catch(e) {
            return [];
        }
    }

    handleWebSocketMessage(message) {
        if (message.data[0] === 5) {
            const players = message.data[5];
            players.forEach(player => {
                const key = `${player.id}-${message.server}`;
                this.players.set(key, {
                    id: player.id,
                    nick: player.nick,
                    points: player.pontos,
                    avatar: player.avatar,
                    foto: player.foto,
                    room: `https://gartic.io/${message.room}`,
                    server: message.server,
                    timestamp: Date.now()
                });
            });

            this.updateCount++;
            this.updateStats();
            this.updateUI();
        }
    }

    updateStats() {
        const now = Date.now();
        const timeDiff = (now - this.lastUpdateTime) / 1000;
        
        this.stats.playerCount = this.players.size;
        this.stats.roomCount = this.rooms.size;
        this.stats.serverCount = this.connections.size;
        this.stats.updateRate = Math.round(this.updateCount / timeDiff);

        if (timeDiff >= 1) {
            this.lastUpdateTime = now;
            this.updateCount = 0;
        }

        document.getElementById('playerCount').textContent = this.stats.playerCount;
        document.getElementById('roomCount').textContent = this.stats.roomCount;
        document.getElementById('serverCount').textContent = this.stats.serverCount;
        document.getElementById('updateRate').textContent = `${this.stats.updateRate}/s`;
    }

    updateUI() {
        const container = document.getElementById('players');
        container.innerHTML = '';

        const currentTime = Date.now();
        const activePlayers = Array.from(this.players.values())
            .filter(p => currentTime - p.timestamp < 30000)
            .sort((a, b) => b.points - a.points);

        activePlayers.forEach(player => {
            const card = document.createElement('div');
            card.className = 'player-card';
            card.innerHTML = `
                <div class="player-header">
                    <img class="player-avatar" src="${player.foto || `https://gartic.io/static/images/avatar/svg/${player.avatar}.svg`}">
                    <div class="player-info">
                        <div class="player-name">${player.nick}</div>
                        <div class="player-stats">${player.points} points • ${player.server}</div>
                    </div>
                </div>
                <div class="player-actions">
                    <a href="${player.room}" target="_blank">Join Room</a>
                    <a href="${player.room}/viewer" target="_blank">Watch</a>
                </div>
            `;
            container.appendChild(card);
        });
    }

    async startTracking() {
        if (this.isTracking) return;
        this.isTracking = true;

        const language = document.getElementById('languageSelect').value;
        const selectedServers = Array.from(document.getElementById('serverSelect').selectedOptions).map(opt => opt.value);

        document.getElementById('loader').classList.add('active');

        try {
            const rooms = await this.getRooms(language);
            rooms.forEach(room => {
                if (room.quant > 0) {
                    selectedServers.forEach(server => {
                        this.proxyFrames.get(server).contentWindow.postMessage({
                            type: 'connect',
                            room: room.code
                        }, '*');
                        
                        this.rooms.set(room.code, room);
                        this.connections.set(`${server}-${room.code}`, true);
                    });
                }
            });

            this.updateInterval = setInterval(() => {
                const currentTime = Date.now();
                for (const [key, player] of this.players.entries()) {
                    if (currentTime - player.timestamp > 30000) {
                        this.players.delete(key);
                    }
                }
                this.updateUI();
                this.updateStats();
            }, 1000);

        } catch(e) {
            console.error('Tracking error:', e);
        } finally {
            document.getElementById('loader').classList.remove('active');
        }
    }

    stopTracking() {
        if (!this.isTracking) return;
        this.isTracking = false;

        this.proxyFrames.forEach(frame => {
            frame.contentWindow.postMessage({ type: 'disconnect' }, '*');
        });

        clearInterval(this.updateInterval);
        this.players.clear();
        this.rooms.clear();
        this.connections.clear();
        this.updateUI();
        this.updateStats();
    }
}

const tracker = new GarticTracker();
tracker.init();

window.startTracking = () => tracker.startTracking();
window.stopTracking = () => tracker.stopTracking();
