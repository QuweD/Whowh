document.addEventListener('DOMContentLoaded', () => {
    const API_ENDPOINT = 'https://gartic.io/req/list';
    let globalPlayerData = new Map();
    let activeRooms = new Set();
    let updateInterval;
    let bypassAttempts = 0;
    const MAX_BYPASS_ATTEMPTS = 5;

    const state = {
        filters: {
            online: true,
            customProfile: false,
            minPoints: 0,
            sortBy: 'points'
        },
        loading: false,
        lastUpdate: null
    };

    class GarticBypass {
        constructor() {
            this.proxyList = [
                'https://cors-anywhere.herokuapp.com/',
                'https://api.allorigins.win/raw?url=',
                'https://proxy.cors.sh/'
            ];
            this.currentProxyIndex = 0;
            this.retryDelay = 1000;
        }

        async fetchWithProxy(url) {
            const proxy = this.proxyList[this.currentProxyIndex];
            try {
                const response = await fetch(proxy + encodeURIComponent(url), {
                    headers: {
                        'Origin': 'https://gartic.io',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    }
                });
                
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                return await response.json();
            } catch (error) {
                console.error(`Proxy ${proxy} failed:`, error);
                this.currentProxyIndex = (this.currentProxyIndex + 1) % this.proxyList.length;
                if (this.currentProxyIndex === 0) {
                    await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                    this.retryDelay *= 2;
                }
                throw error;
            }
        }

        async connectWebSocket(roomCode) {
            return new Promise((resolve, reject) => {
                const servers = ['01', '02', '03', '04', '05', '06'];
                let connectedCount = 0;
                const playerData = new Map();

                servers.forEach(server => {
                    const ws = new WebSocket(`wss://server${server}.gartic.io/socket.io/?EIO=3&transport=websocket`);
                    
                    ws.onopen = () => {
                        ws.send(`42[12,{"v":20000,"platform":0,"sala":"${roomCode}"}]`);
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
                                ws.close();
                            }
                        } catch (error) {
                            console.error('WebSocket message error:', error);
                        }
                    };

                    ws.onclose = () => {
                        connectedCount++;
                        if (connectedCount === servers.length) {
                            resolve(Array.from(playerData.values()));
                        }
                    };

                    ws.onerror = (error) => {
                        console.error('WebSocket error:', error);
                        connectedCount++;
                        if (connectedCount === servers.length) {
                            resolve(Array.from(playerData.values()));
                        }
                    };
                });

                setTimeout(() => reject(new Error('WebSocket timeout')), 10000);
            });
        }
    }

    const bypass = new GarticBypass();

    async function fetchRooms() {
        try {
            state.loading = true;
            updateLoadingState();
            
            const rooms = await bypass.fetchWithProxy(API_ENDPOINT);
            activeRooms.clear();
            
            for (const room of rooms) {
                if (room.quant > 0) {
                    activeRooms.add(room.code);
                    try {
                        const players = await bypass.connectWebSocket(room.code);
                        players.forEach(player => {
                            globalPlayerData.set(player.id, player);
                        });
                    } catch (error) {
                        console.error(`Failed to fetch players for room ${room.code}:`, error);
                    }
                }
            }

            updateUI();
            state.lastUpdate = Date.now();
            state.loading = false;
            updateLoadingState();
            showToast('Data updated successfully!', 'success');
        } catch (error) {
            console.error('Failed to fetch rooms:', error);
            bypassAttempts++;
            
            if (bypassAttempts >= MAX_BYPASS_ATTEMPTS) {
                clearInterval(updateInterval);
                showToast('Maximum bypass attempts reached. Please try again later.', 'error');
            }
            
            state.loading = false;
            updateLoadingState();
            showToast('Failed to update data. Retrying...', 'error');
        }
    }

    function updateUI() {
        updateStats();
        updatePlayerGrid();
    }

    function updateStats() {
        const stats = {
            totalPlayers: globalPlayerData.size,
            activeRooms: activeRooms.size,
            customProfiles: Array.from(globalPlayerData.values()).filter(p => p.customProfile).length,
            averagePoints: Math.floor(Array.from(globalPlayerData.values()).reduce((acc, p) => acc + p.points, 0) / globalPlayerData.size)
        };

        Object.entries(stats).forEach(([key, value]) => {
            const element = document.querySelector(`#${key}`);
            if (element) {
                element.textContent = value.toLocaleString();
            }
        });
    }

    function updatePlayerGrid() {
        const container = document.querySelector('.players-grid');
        if (!container) return;

        let players = Array.from(globalPlayerData.values());
        players = filterPlayers(players);
        players = sortPlayers(players);

        container.innerHTML = players.map(player => createPlayerCard(player)).join('');
        initializePlayerCardAnimations();
    }

    function filterPlayers(players) {
        return players.filter(player => {
            if (state.filters.customProfile && !player.customProfile) return false;
            if (player.points < state.filters.minPoints) return false;
            return true;
        });
    }

    function sortPlayers(players) {
        return players.sort((a, b) => {
            switch (state.filters.sortBy) {
                case 'points':
                    return b.points - a.points;
                case 'name':
                    return a.nick.localeCompare(b.nick);
                default:
                    return 0;
            }
        });
    }

    function createPlayerCard(player) {
        return `
            <div class="player-card" data-player-id="${player.id}">
                <div class="player-header">
                    <img class="player-avatar" src="${player.customProfile ? player.foto : `https://gartic.io/static/images/avatar/svg/${player.avatar}.svg`}" alt="${player.nick}">
                    <div class="player-info">
                        <div class="player-name">${player.nick}</div>
                        <div class="player-status">${formatLastSeen(player.lastSeen)}</div>
                    </div>
                </div>
                <div class="player-stats">
                    <div class="stat-item">
                        <div class="stat-title">Points</div>
                        <div class="stat-number">${player.points.toLocaleString()}</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-title">Room</div>
                        <div class="stat-number">${player.room}</div>
                    </div>
                </div>
                <div class="player-actions">
                    <button class="action-button primary-button" onclick="window.open('https://gartic.io/${player.room}', '_blank')">Join Room</button>
                    <button class="action-button secondary-button" onclick="window.open('https://gartic.io/${player.room}/viewer', '_blank')">View Only</button>
                </div>
            </div>
        `;
    }

    function initializePlayerCardAnimations() {
        const cards = document.querySelectorAll('.player-card');
        cards.forEach((card, index) => {
            card.style.animationDelay = `${index * 50}ms`;
        });
    }

    function updateLoadingState() {
        const loader = document.querySelector('.loading');
        if (loader) {
            loader.style.display = state.loading ? 'flex' : 'none';
        }
    }

    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    function formatLastSeen(timestamp) {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);
        if (seconds < 60) return 'Just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        return `${Math.floor(seconds / 3600)}h ago`;
    }

    function initializeEventListeners() {
        const searchInput = document.querySelector('.search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();
                const cards = document.querySelectorAll('.player-card');
                cards.forEach(card => {
                    const playerName = card.querySelector('.player-name').textContent.toLowerCase();
                    card.style.display = playerName.includes(searchTerm) ? 'block' : 'none';
                });
            });
        }

        const filterButtons = document.querySelectorAll('.filter-button');
        filterButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const filterType = e.target.dataset.filter;
                state.filters[filterType] = !state.filters[filterType];
                e.target.classList.toggle('active');
                updatePlayerGrid();
            });
        });

        const sortSelect = document.querySelector('.sort-select');
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                state.filters.sortBy = e.target.value;
                updatePlayerGrid();
            });
        }
    }

    // Initialize application
    updateInterval = setInterval(fetchRooms, 5000);
    initializeEventListeners();
    fetchRooms();
});

// Error handling and recovery
window.onerror = function(message, source, lineno, colno, error) {
    console.error('Global error:', {message, source, lineno, colno, error});
    showToast('An error occurred. Trying to recover...', 'error');
    return false;
};

window.onunhandledrejection = function(event) {
    console.error('Unhandled promise rejection:', event.reason);
    showToast('Connection error. Retrying...', 'error');
    return false;
};
