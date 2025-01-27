class WebSocketManager {
    constructor() {
        this.sockets = new Map();
        this.messageHandlers = new Map();
        this.reconnectAttempts = new Map();
        this.maxReconnectAttempts = 5;
        this.connectionStatus = new Map();
        this.messageQueue = new Map();
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Origin': 'https://gartic.io',
            'Referer': 'https://gartic.io/',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Sec-WebSocket-Extensions': 'permessage-deflate; client_max_window_bits',
            'Sec-WebSocket-Version': '13'
        };
    }

    connect(server, room, customHeaders = {}) {
        const connectionId = `${server}-${room}`;
        if (this.sockets.has(connectionId)) {
            return;
        }

        try {
            const ws = new WebSocket(`wss://${server}.gartic.io/socket.io/?EIO=3&transport=websocket`);
            
            ws.binaryType = 'arraybuffer';
            
            const mergedHeaders = { ...this.headers, ...customHeaders };
            Object.entries(mergedHeaders).forEach(([key, value]) => {
                try {
                    ws._socket.setHeader(key, value);
                } catch(e) {}
            });

            ws.onopen = () => this.handleOpen(ws, server, room);
            ws.onmessage = (event) => this.handleMessage(event, server, room);
            ws.onclose = () => this.handleClose(server, room);
            ws.onerror = (error) => this.handleError(error, server, room);

            this.sockets.set(connectionId, ws);
            this.connectionStatus.set(connectionId, false);
            this.reconnectAttempts.set(connectionId, 0);

        } catch(error) {
            console.error(`Connection error for ${connectionId}:`, error);
            this.attemptReconnect(server, room);
        }
    }

    handleOpen(ws, server, room) {
        const connectionId = `${server}-${room}`;
        this.connectionStatus.set(connectionId, true);
        this.reconnectAttempts.set(connectionId, 0);

        const initMessage = {
            v: 20000,
            platform: 0,
            sala: room
        };

        ws.send(`42["init",${JSON.stringify(initMessage)}]`);
        
        if (this.messageQueue.has(connectionId)) {
            const queue = this.messageQueue.get(connectionId);
            queue.forEach(msg => this.send(server, room, msg));
            this.messageQueue.delete(connectionId);
        }

        this.startHeartbeat(ws, connectionId);
    }

    handleMessage(event, server, room) {
        if (typeof event.data === 'string') {
            if (event.data.startsWith('42')) {
                try {
                    const data = JSON.parse(event.data.slice(2));
                    const handlers = this.messageHandlers.get(`${server}-${room}`) || [];
                    handlers.forEach(handler => handler(data));
                } catch(e) {
                    console.error('Message parsing error:', e);
                }
            }
        }
    }

    handleClose(server, room) {
        const connectionId = `${server}-${room}`;
        this.connectionStatus.set(connectionId, false);
        this.sockets.delete(connectionId);
        this.attemptReconnect(server, room);
    }

    handleError(error, server, room) {
        console.error(`WebSocket error for ${server}-${room}:`, error);
        this.attemptReconnect(server, room);
    }

    attemptReconnect(server, room) {
        const connectionId = `${server}-${room}`;
        const attempts = this.reconnectAttempts.get(connectionId) || 0;

        if (attempts < this.maxReconnectAttempts) {
            this.reconnectAttempts.set(connectionId, attempts + 1);
            setTimeout(() => {
                this.connect(server, room);
            }, Math.min(1000 * Math.pow(2, attempts), 30000));
        } else {
            this.cleanup(connectionId);
        }
    }

    cleanup(connectionId) {
        this.sockets.delete(connectionId);
        this.connectionStatus.delete(connectionId);
        this.reconnectAttempts.delete(connectionId);
        this.messageQueue.delete(connectionId);
    }

    disconnect(server, room) {
        const connectionId = `${server}-${room}`;
        const ws = this.sockets.get(connectionId);
        if (ws) {
            ws.close();
            this.cleanup(connectionId);
        }
    }

    disconnectAll() {
        this.sockets.forEach((ws, connectionId) => {
            ws.close();
            this.cleanup(connectionId);
        });
    }

    send(server, room, message) {
        const connectionId = `${server}-${room}`;
        const ws = this.sockets.get(connectionId);
        
        if (!ws || !this.connectionStatus.get(connectionId)) {
            if (!this.messageQueue.has(connectionId)) {
                this.messageQueue.set(connectionId, []);
            }
            this.messageQueue.get(connectionId).push(message);
            return false;
        }

        try {
            ws.send(message);
            return true;
        } catch(e) {
            console.error('Send error:', e);
            return false;
        }
    }

    addMessageHandler(server, room, handler) {
        const connectionId = `${server}-${room}`;
        if (!this.messageHandlers.has(connectionId)) {
            this.messageHandlers.set(connectionId, []);
        }
        this.messageHandlers.get(connectionId).push(handler);
    }

    removeMessageHandler(server, room, handler) {
        const connectionId = `${server}-${room}`;
        const handlers = this.messageHandlers.get(connectionId);
        if (handlers) {
            const index = handlers.indexOf(handler);
            if (index !== -1) {
                handlers.splice(index, 1);
            }
        }
    }

    startHeartbeat(ws, connectionId) {
        const heartbeatInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN && this.connectionStatus.get(connectionId)) {
                ws.send('2');
            } else {
                clearInterval(heartbeatInterval);
            }
        }, 25000);

        ws.addEventListener('close', () => {
            clearInterval(heartbeatInterval);
        });
    }

    isConnected(server, room) {
        return this.connectionStatus.get(`${server}-${room}`) || false;
    }

    getConnectionStatus() {
        const status = {};
        this.connectionStatus.forEach((value, key) => {
            status[key] = value;
        });
        return status;
    }
}

const wsManager = new WebSocketManager();
export default wsManager;
