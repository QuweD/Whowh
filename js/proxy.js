class GarticProxy {
    constructor() {
        this.proxyFrames = new Map();
        this.activeConnections = new Map();
        this.messageQueue = new Map();
        this.retryAttempts = new Map();
        this.maxRetries = 3;
        this.proxyStatus = new Map();
    }

    init() {
        this.setupProxyFrames();
        this.initMessageHandler();
        this.startHeartbeat();
    }

    setupProxyFrames() {
        const servers = ['server01', 'server02', 'server03', 'server04', 'server05', 'server06'];
        servers.forEach(server => {
            const frame = this.createProxyFrame(server);
            this.proxyFrames.set(server, frame);
            document.body.appendChild(frame);
        });
    }

    createProxyFrame(server) {
        const frame = document.createElement('iframe');
        frame.style.display = 'none';
        frame.sandbox = 'allow-scripts allow-same-origin';
        frame.srcdoc = this.getProxyFrameContent(server);
        return frame;
    }

    getProxyFrameContent(server) {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <script>
                    class ProxyConnection {
                        constructor() {
                            this.ws = null;
                            this.server = '${server}';
                            this.connected = false;
                            this.reconnectAttempts = 0;
                            this.maxReconnectAttempts = 5;
                            this.setupMessageHandler();
                        }

                        setupMessageHandler() {
                            window.addEventListener('message', (event) => {
                                const { type, data } = event.data;
                                switch(type) {
                                    case 'connect':
                                        this.connect(data.room, data.headers);
                                        break;
                                    case 'disconnect':
                                        this.disconnect();
                                        break;
                                    case 'send':
                                        this.send(data.message);
                                        break;
                                }
                            });
                        }

                        connect(room, customHeaders = {}) {
                            if (this.ws) this.disconnect();

                            const headers = {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                                'Origin': 'https://gartic.io',
                                'Referer': 'https://gartic.io/',
                                ...customHeaders
                            };

                            try {
                                this.ws = new WebSocket(\`wss://${server}.gartic.io/socket.io/?EIO=3&transport=websocket\`);
                                
                                this.ws.onopen = () => {
                                    this.connected = true;
                                    this.reconnectAttempts = 0;
                                    this.send(\`42["init",{"v":20000,"platform":0,"sala":"\${room}"}]\`);
                                    this.notifyParent('connected', { room });
                                };

                                this.ws.onmessage = (event) => {
                                    this.notifyParent('message', { 
                                        data: event.data,
                                        room: room
                                    });
                                };

                                this.ws.onclose = () => {
                                    this.connected = false;
                                    this.handleDisconnect(room);
                                };

                                this.ws.onerror = (error) => {
                                    this.notifyParent('error', { 
                                        room: room,
                                        error: error.message 
                                    });
                                };

                                Object.entries(headers).forEach(([key, value]) => {
                                    try {
                                        this.ws._socket.setHeader(key, value);
                                    } catch(e) {}
                                });

                            } catch(error) {
                                this.notifyParent('error', { 
                                    room: room,
                                    error: error.message 
                                });
                            }
                        }

                        handleDisconnect(room) {
                            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                                this.reconnectAttempts++;
                                setTimeout(() => this.connect(room), 1000 * this.reconnectAttempts);
                            } else {
                                this.notifyParent('maxRetriesReached', { room });
                            }
                        }

                        disconnect() {
                            if (this.ws) {
                                this.ws.close();
                                this.ws = null;
                            }
                            this.connected = false;
                        }

                        send(message) {
                            if (this.ws && this.connected) {
                                try {
                                    this.ws.send(message);
                                    return true;
                                } catch(e) {
                                    return false;
                                }
                            }
                            return false;
                        }

                        notifyParent(type, data) {
                            window.parent.postMessage({
                                source: 'proxyFrame',
                                server: this.server,
                                type: type,
                                data: data
                            }, '*');
                        }
                    }

                    new ProxyConnection();
                </script>
            </head>
            <body></body>
            </html>
        `;
    }

    initMessageHandler() {
        window.addEventListener('message', (event) => {
            if (event.data.source === 'proxyFrame') {
                this.handleProxyMessage(event.data);
            }
        });
    }

    handleProxyMessage(message) {
        const { server, type, data } = message;
        
        switch(type) {
            case 'connected':
                this.proxyStatus.set(`${server}-${data.room}`, true);
                this.processMessageQueue(server, data.room);
                break;
                
            case 'message':
                if (data.data.startsWith('42')) {
                    try {
                        const parsedData = JSON.parse(data.data.slice(2));
                        window.dispatchEvent(new CustomEvent('proxyMessage', {
                            detail: {
                                server: server,
                                room: data.room,
                                data: parsedData
                            }
                        }));
                    } catch(e) {}
                }
                break;
                
            case 'error':
                this.handleProxyError(server, data);
                break;
                
            case 'maxRetriesReached':
                this.handleMaxRetries(server, data.room);
                break;
        }
    }

    connect(server, room, headers = {}) {
        const frame = this.proxyFrames.get(server);
        if (frame) {
            frame.contentWindow.postMessage({
                type: 'connect',
                data: { room, headers }
            }, '*');
            this.activeConnections.set(`${server}-${room}`, true);
        }
    }

    disconnect(server, room) {
        const frame = this.proxyFrames.get(server);
        if (frame) {
            frame.contentWindow.postMessage({
                type: 'disconnect'
            }, '*');
            this.activeConnections.delete(`${server}-${room}`);
            this.proxyStatus.delete(`${server}-${room}`);
        }
    }

    disconnectAll() {
        this.proxyFrames.forEach((frame, server) => {
            frame.contentWindow.postMessage({
                type: 'disconnect'
            }, '*');
        });
        this.activeConnections.clear();
        this.proxyStatus.clear();
        this.messageQueue.clear();
    }

    send(server, room, message) {
        const key = `${server}-${room}`;
        if (!this.proxyStatus.get(key)) {
            if (!this.messageQueue.has(key)) {
                this.messageQueue.set(key, []);
            }
            this.messageQueue.get(key).push(message);
            return false;
        }

        const frame = this.proxyFrames.get(server);
        if (frame) {
            frame.contentWindow.postMessage({
                type: 'send',
                data: { message }
            }, '*');
            return true;
        }
        return false;
    }

    processMessageQueue(server, room) {
        const key = `${server}-${room}`;
        const queue = this.messageQueue.get(key);
        if (queue && queue.length > 0) {
            queue.forEach(message => this.send(server, room, message));
            this.messageQueue.delete(key);
        }
    }

    handleProxyError(server, data) {
        const key = `${server}-${data.room}`;
        const attempts = this.retryAttempts.get(key) || 0;
        
        if (attempts < this.maxRetries) {
            this.retryAttempts.set(key, attempts + 1);
            setTimeout(() => {
                this.connect(server, data.room);
            }, 1000 * (attempts + 1));
        } else {
            this.retryAttempts.delete(key);
            this.activeConnections.delete(key);
        }
    }

    handleMaxRetries(server, room) {
        const key = `${server}-${room}`;
        this.activeConnections.delete(key);
        this.proxyStatus.delete(key);
        this.retryAttempts.delete(key);
    }

    startHeartbeat() {
        setInterval(() => {
            this.activeConnections.forEach((_, key) => {
                const [server, room] = key.split('-');
                this.send(server, room, '2');
            });
        }, 25000);
    }
}

const garticProxy = new GarticProxy();
export default garticProxy;
