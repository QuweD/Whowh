// Temel Ayarlar
const CONFIG = {
    API_URL: 'https://gartic.io/req/',
    WS_URL: 'wss://server{}.gartic.io/',
    SUNUCULAR: ['01', '02', '03', '04', '05', '06'],
    GUNCELLEME_SURESI: 3000,
    DENEME_SAYISI: 3,
    BYPASS_METODLARI: ['iframe', 'websocket', 'xhr']
};

// WebSocket Yöneticisi
class WebSocketYonetici {
    constructor() {
        this.baglanti = new Map();
        this.mesajKuyrugu = [];
        this.yenidenBaglanmaSayisi = 0;
        this.aktifSunucu = null;
    }

    baglan(sunucu) {
        const ws = new WebSocket(CONFIG.WS_URL.replace('{}', sunucu));
        
        ws.onopen = () => {
            console.log(`${sunucu} sunucusuna bağlanıldı`);
            this.baglantiKur(ws, sunucu);
        };

        ws.onmessage = (event) => this.mesajAl(event.data, sunucu);
        
        ws.onerror = (hata) => {
            console.error(`WebSocket hatası (${sunucu}):`, hata);
            this.hataYonet(sunucu);
        };

        ws.onclose = () => this.baglantiyiKapat(sunucu);
        
        this.baglanti.set(sunucu, ws);
    }

    baglantiKur(ws, sunucu) {
        ws.send('2probe');
        ws.send('5');
        this.odalaraKatil(sunucu);
        this.aktifSunucu = sunucu;
        uygulama.durumGuncelle('bağlı');
    }

    mesajAl(veri, sunucu) {
        if (veri.startsWith('42')) {
            try {
                const [olay, data] = JSON.parse(veri.slice(2));
                this.mesajIsleme(olay, data, sunucu);
            } catch (hata) {
                console.error('Mesaj ayrıştırma hatası:', hata);
            }
        }
    }

    mesajIsleme(olay, veri, sunucu) {
        switch(olay) {
            case 'odalar':
                uygulama.odalariGuncelle(veri);
                break;
            case 'oyuncular':
                uygulama.oyunculariGuncelle(veri);
                break;
            case 'cizim':
                uygulama.cizimVerisiAl(veri);
                break;
        }
    }

    odayaKatil(odaKodu) {
        const mesaj = `42["katil",{"oda":"${odaKodu}","v":20000}]`;
        this.mesajGonder(mesaj);
    }

    mesajGonder(mesaj) {
        if (this.aktifSunucu && this.baglanti.get(this.aktifSunucu)?.readyState === WebSocket.OPEN) {
            this.baglanti.get(this.aktifSunucu).send(mesaj);
        } else {
            this.mesajKuyrugu.push(mesaj);
        }
    }
}

// Bypass Sistemi
class BypassSistemi {
    constructor() {
        this.metod = CONFIG.BYPASS_METODLARI[0];
        this.basariOrani = 100;
        this.engellendi = false;
        this.iframe = null;
    }

    async baslat() {
        await this.bypassKur();
        this.nabizKontrol();
    }

    async bypassKur() {
        this.iframe = document.createElement('iframe');
        this.iframe.style.display = 'none';
        this.iframe.src = 'https://gartic.io';
        document.body.appendChild(this.iframe);

        return new Promise(resolve => {
            this.iframe.onload = () => {
                console.log('Bypass iframe yüklendi');
                resolve();
            };
        });
    }

    async veriCek(endpoint, ayarlar = {}) {
        if (this.engellendi) {
            await this.metodDegistir();
        }

        try {
            const yanit = await this.istekGonder(endpoint, ayarlar);
            this.basariOraniniGuncelle(true);
            return yanit;
        } catch (hata) {
            this.basariOraniniGuncelle(false);
            throw hata;
        }
    }

    async istekGonder(endpoint, ayarlar) {
        const url = CONFIG.API_URL + endpoint;
        const varsayilanAyarlar = {
            headers: {
                'Origin': 'https://gartic.io',
                'Referer': 'https://gartic.io/',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0'
            }
        };

        const istekAyarlari = { ...varsayilanAyarlar, ...ayarlar };
        
        switch (this.metod) {
            case 'iframe':
                return this.iframeIstegi(url, istekAyarlari);
            case 'websocket':
                return this.wsIstegi(url, istekAyarlari);
            case 'xhr':
                return this.xhrIstegi(url, istekAyarlari);
        }
    }

    basariOraniniGuncelle(basarili) {
        const agirlik = 0.3;
        this.basariOrani = this.basariOrani * (1 - agirlik) + (basarili ? 100 : 0) * agirlik;
        uygulama.bypassDurumunuGuncelle(this.basariOrani);
    }
}

// Ana Uygulama
class GarticHack {
    constructor() {
        this.ws = new WebSocketYonetici();
        this.bypass = new BypassSistemi();
        this.odalar = new Map();
        this.oyuncular = new Map();
        this.yuklemeEkrani = document.getElementById('yukleniyor');
        this.oyuncuListesi = document.getElementById('oyuncuListe');
        this.odaListesi = document.getElementById('odaListe');
    }

    async baslat() {
        try {
            this.yuklemeGoster('Sistem başlatılıyor...', 0);
            await this.bypass.baslat();
            this.yuklemeGoster('Bypass sistemi hazır', 30);
            
            await this.sunucularaBaglan();
            this.yuklemeGoster('Sunuculara bağlanıldı', 60);
            
            await this.ilkVerileriYukle();
            this.yuklemeGoster('Veriler yüklendi', 90);
            
            this.olaylariKur();
            this.guncellemeBaslat();
            
            this.yuklemeGoster('Sistem hazır', 100);
            setTimeout(() => this.yuklemeGizle(), 1000);
        } catch (hata) {
            console.error('Başlatma hatası:', hata);
            this.hataGoster('Sistem başlatılamadı');
        }
    }

    async sunucularaBaglan() {
        CONFIG.SUNUCULAR.forEach(sunucu => {
            this.ws.baglan(sunucu);
        });
    }

    async ilkVerileriYukle() {
        try {
            const odalar = await this.bypass.veriCek('list');
            this.odalariGuncelle(odalar);
        } catch (hata) {
            console.error('Veri yükleme hatası:', hata);
            throw hata;
        }
    }

    odalariGuncelle(odalar) {
        this.odalar.clear();
        odalar.forEach(oda => {
            if (oda.quant > 0) {
                this.odalar.set(oda.code, {
                    kod: oda.code,
                    oyuncuSayisi: oda.quant,
                    dil: oda.lang,
                    zaman: Date.now()
                });
            }
        });
        this.arayuzuGuncelle();
    }

    oyunculariGuncelle(veri) {
        if (veri.oyuncular) {
            veri.oyuncular.forEach(oyuncu => {
                this.oyuncular.set(oyuncu.id, {
                    id: oyuncu.id,
                    isim: oyuncu.nick,
                    puan: oyuncu.points,
                    avatar: oyuncu.avatar,
                    oda: veri.oda,
                    sonGorulme: Date.now()
                });
            });
            this.arayuzuGuncelle();
        }
    }

    arayuzuGuncelle() {
        // İstatistikleri güncelle
        document.getElementById('oyuncuSayi').textContent = this.oyuncular.size;
        document.getElementById('odaSayi').textContent = this.odalar.size;
        
        // Oyuncu listesini güncelle
        if (this.oyuncuListesi) {
            this.oyuncuListesi.innerHTML = Array.from(this.oyuncular.values())
                .map(oyuncu => this.oyuncuKartiOlustur(oyuncu))
                .join('');
        }
    }

    oyuncuKartiOlustur(oyuncu) {
        return `
            <div class="oyuncu-kart" data-id="${oyuncu.id}">
                <div class="oyuncu-ust">
                    <img src="https://gartic.io/static/images/avatar/svg/${oyuncu.avatar}.svg" 
                         alt="${oyuncu.isim}" class="avatar">
                    <div class="bilgi">
                        <div class="isim">${oyuncu.isim}</div>
                        <div class="oda">Oda: ${oyuncu.oda}</div>
                    </div>
                </div>
                <div class="oyuncu-alt">
                    <div class="puan">
                        <i class="fas fa-star"></i>
                        <span>${oyuncu.puan}</span>
                    </div>
                    <button onclick="uygulama.odayaKatil('${oyuncu.oda}')" class="katil-btn">
                        Katıl
                    </button>
                </div>
            </div>
        `;
    }

    odayaKatil(odaKodu) {
        window.open(`https://gartic.io/${odaKodu}`, '_blank');
    }

    yuklemeGoster(mesaj, yuzde) {
        this.yuklemeEkrani.style.display = 'flex';
        const mesajElementi = this.yuklemeEkrani.querySelector('.mesaj');
        const yuzdeElementi = this.yuklemeEkrani.querySelector('.yuzde');
        const barDegeri = this.yuklemeEkrani.querySelector('.bar .deger');
        
        mesajElementi.textContent = mesaj;
        yuzdeElementi.textContent = `${yuzde}%`;
        barDegeri.style.width = `${yuzde}%`;
    }

    yuklemeGizle() {
        this.yuklemeEkrani.style.display = 'none';
    }

    guncellemeBaslat() {
        setInterval(() => this.verileriGuncelle(), CONFIG.GUNCELLEME_SURESI);
    }

    async verileriGuncelle() {
        try {
            const odalar = await this.bypass.veriCek('list');
            this.odalariGuncelle(odalar);
        } catch (hata) {
            console.error('Güncelleme hatası:', hata);
        }
    }

    olaylariKur() {
        // Yenile butonu
        document.querySelector('.yenile').addEventListener('click', () => {
            this.verileriGuncelle();
        });

        // Arama
        document.querySelector('.arama input').addEventListener('input', (e) => {
            this.aramaYap(e.target.value);
        });

        // Menü butonları
        document.querySelectorAll('.menu-item').forEach(buton => {
            buton.addEventListener('click', () => {
                this.sayfaDegistir(buton.dataset.sayfa);
            });
        });
    }
}

// Uygulamayı başlat
const uygulama = new GarticHack();
window.addEventListener('load', () => uygulama.baslat());
