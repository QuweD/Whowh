class GarticUI {
    constructor() {
        this.players = new Map();
        this.stats = {
            totalPlayers: 0,
            activeRooms: 0,
            connectedServers: 0,
            updateRate: 0
        };
        this.updateCount = 0;
        this.lastUpdateTime = Date.now();
        this.observers = new Set();
        this.filterSettings = {
            minPoints: 0,
            maxPoints: Infinity,
            searchTerm: '',
            server: 'all',
            sortBy: 'points'
        };
    }

    init() {
        this.setupEventListeners();
        this.initializeTooltips();
        this.setupFilters();
        this.startPerformanceMonitoring();
    }

    setupEventListeners() {
        document.getElementById('serverSelect')?.addEventListener('change', () => this.updateFilters());
        document.getElementById('searchInput')?.addEventListener('input', (e) => {
            this.filterSettings.searchTerm = e.target.value.toLowerCase();
            this.updatePlayerList();
        });
        document.getElementById('sortSelect')?.addEventListener('change', (e) => {
            this.filterSettings.sortBy = e.target.value;
            this.updatePlayerList();
        });
        document.getElementById('minPoints')?.addEventListener('input', (e) => {
            this.filterSettings.minPoints = parseInt(e.target.value) || 0;
            this.updatePlayerList();
        });
        document.getElementById('maxPoints')?.addEventListener('input', (e) => {
            this.filterSettings.maxPoints = parseInt(e.target.value) || Infinity;
            this.updatePlayerList();
        });
    }

    initializeTooltips() {
        const tooltips = document.querySelectorAll('[data-tooltip]');
        tooltips.forEach(element => {
            element.addEventListener('mouseenter', (e) => this.showTooltip(e));
            element.addEventListener('mouseleave', (e) => this.hideTooltip(e));
        });
    }

    showTooltip(event) {
        const tooltip = document.createElement('div');
        tooltip.className = 'tooltip';
        tooltip.textContent = event.target.dataset.tooltip;
        document.body.appendChild(tooltip);

        const rect = event.target.getBoundingClientRect();
        tooltip.style.top = `${rect.bottom + 5}px`;
        tooltip.style.left = `${rect.left + (rect.width - tooltip.offsetWidth) / 2}px`;
    }

    hideTooltip() {
        const tooltips = document.querySelectorAll('.tooltip');
        tooltips.forEach(tooltip => tooltip.remove());
    }

    updatePlayer(playerData) {
        const key = `${playerData.id}-${playerData.server}`;
        this.players.set(key, {
            ...playerData,
            lastUpdate: Date.now()
        });
        this.updateCount++;
        this.updatePlayerList();
        this.updateStats();
    }

    removeInactivePlayers(timeout = 30000) {
        const now = Date.now();
        let removed = 0;
        this.players.forEach((player, key) => {
            if (now - player.lastUpdate > timeout) {
                this.players.delete(key);
                removed++;
            }
        });
        if (removed > 0) {
            this.updatePlayerList();
            this.updateStats();
        }
    }

    updatePlayerList() {
        const container = document.getElementById('players');
        if (!container) return;

        container.innerHTML = '';
        const filteredPlayers = this.getFilteredPlayers();
        
        filteredPlayers.forEach(player => {
            const card = this.createPlayerCard(player);
            container.appendChild(card);
        });
    }

    createPlayerCard(player) {
        const card = document.createElement('div');
        card.className = 'player-card';
        card.innerHTML = `
            <div class="player-header">
                <img class="player-avatar" 
                     src="${player.foto || `https://gartic.io/static/images/avatar/svg/${player.avatar}.svg`}"
                     onerror="this.src='https://gartic.io/static/images/avatar/svg/0.svg'">
                <div class="player-info">
                    <div class="player-name">${this.escapeHtml(player.nick)}</div>
                    <div class="player-stats">
                        <span class="points">${player.points} points</span>
                        <span class="server">${player.server}</span>
                    </div>
                </div>
            </div>
            <div class="player-actions">
                <a href="${player.room}" target="_blank" class="action-button">
                    <i class="fas fa-sign-in-alt"></i> Join
                </a>
                <a href="${player.room}/viewer" target="_blank" class="action-button">
                    <i class="fas fa-eye"></i> Watch
                </a>
                <button class="action-button" onclick="navigator.clipboard.writeText('${player.room}')">
                    <i class="fas fa-copy"></i>
                </button>
            </div>
        `;
        return card;
    }

    getFilteredPlayers() {
        return Array.from(this.players.values())
            .filter(player => {
                return (
                    player.points >= this.filterSettings.minPoints &&
                    player.points <= this.filterSettings.maxPoints &&
                    (this.filterSettings.server === 'all' || player.server === this.filterSettings.server) &&
                    player.nick.toLowerCase().includes(this.filterSettings.searchTerm)
                );
            })
            .sort((a, b) => {
                switch (this.filterSettings.sortBy) {
                    case 'points': return b.points - a.points;
                    case 'name': return a.nick.localeCompare(b.nick);
                    case 'server': return a.server.localeCompare(b.server);
                    default: return 0;
                }
            });
    }

    updateStats() {
        this.stats.totalPlayers = this.players.size;
        this.stats.activeRooms = new Set(Array.from(this.players.values()).map(p => p.room)).size;
        this.stats.connectedServers = new Set(Array.from(this.players.values()).map(p => p.server)).size;

        const now = Date.now();
        const timeDiff = (now - this.lastUpdateTime) / 1000;
        this.stats.updateRate = Math.round(this.updateCount / timeDiff);

        if (timeDiff >= 1) {
            this.lastUpdateTime = now;
            this.updateCount = 0;
        }

        this.updateStatsDisplay();
    }

    updateStatsDisplay() {
        Object.entries(this.stats).forEach(([key, value]) => {
            const element = document.getElementById(key);
            if (element) {
                element.textContent = value;
            }
        });
    }

    showLoader(message = 'Loading...') {
        const loader = document.getElementById('loader');
        if (loader) {
            document.getElementById('loaderText').textContent = message;
            loader.classList.add('active');
        }
    }

    hideLoader() {
        const loader = document.getElementById('loader');
        if (loader) {
            loader.classList.remove('active');
        }
    }

    showError(message) {
        const errorContainer = document.createElement('div');
        errorContainer.className = 'error-message';
        errorContainer.innerHTML = `
            <div class="error-content">
                <i class="fas fa-exclamation-circle"></i>
                <span>${this.escapeHtml(message)}</span>
                <button onclick="this.parentElement.remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        document.body.appendChild(errorContainer);
        setTimeout(() => errorContainer.remove(), 5000);
    }

    escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    startPerformanceMonitoring() {
        setInterval(() => {
            this.removeInactivePlayers();
            this.updateStats();
        }, 1000);
    }

    addObserver(observer) {
        this.observers.add(observer);
    }

    removeObserver(observer) {
        this.observers.delete(observer);
    }

    notifyObservers(event, data) {
        this.observers.forEach(observer => {
            if (typeof observer[event] === 'function') {
                observer[event](data);
            }
        });
    }
}

const garticUI = new GarticUI();
export default garticUI;
