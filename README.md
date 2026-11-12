# Göl Avcısı — 3D Balık Tutma Simülasyonu

Tarayıcıda çalışan, 3 boyutlu bir göl balıkçılığı oyunu. Kurulum gerektirmez: iPad, iPhone, Mac ve modern tarayıcılarda çalışır.
Three.js ile yazıldı; grafikler, sesler ve balıklar tamamen kod ile üretilir (harici model/ses dosyası yok).

## Nasıl açılır?

### Seçenek A — iPad'de doğrudan (önerilen)
GitHub Pages ile yayınlayın: repo → **Settings → Pages → Deploy from a branch** → branch `claude/exciting-mccarthy-5hisec`, klasör `/ (root)`.
Birkaç dakika sonra `https://fatihyurt97.github.io/3d-fishingsimulator/` adresini iPad'de Safari ile açın.

Ana ekrana eklemek için: Safari → Paylaş → **Ana Ekrana Ekle**. Oyun tam ekran olarak açılır.

### Seçenek B — Mac'ten yerel sunucu
```bash
cd 3d-fishingsimulator
python3 -m http.server 8000
```
Mac ve iPad aynı Wi-Fi'de olmalı. Mac'in IP'sini bulun (Sistem Ayarları → Wi-Fi → Ayrıntılar) ve iPad'de `http://<mac-ip>:8000` açın.

> Not: Oyun ES modülleri ve CDN üzerinden Three.js (`cdn.jsdelivr.net`) kullandığı için internet bağlantısı gerekir. Dosyayı doğrudan (`file://`) açmak yerine mutlaka bir sunucu üzerinden açın.

## Kontroller

| Eylem | iPad / iPhone (dokunmatik) | Mac (fare) | Klavye |
|---|---|---|---|
| Olta at | Ekranda **aşağı çek**, güç çubuğu dolar, **bırak** | Aynısı, fare ile | **Boşluk** basılı tut, bırak |
| Yön ayarla | Çekerken sağa/sola kaydır | Aynısı | Ok tuşları |
| Vur (ısırık anında) | Dokun | Tıkla | Boşluk |
| Makara çek | Basılı tut | Basılı tut | Boşluk basılı tut |
| Yemi geri çek / sürükle | Bekleme sırasında basılı tut | Aynısı | Boşluk basılı tut |
| Yem değiştir | Sol alttaki yem kutusu | Aynısı | — |
| Menü | Sağ üst düğmeler | Aynısı | Esc: kapat |

## Nasıl oynanır?

1. **At.** Güç, çekme mesafesiyle belirlenir. Kısa atış **sığ** suya, uzun atış **derin** suya düşer. Efsane balıklar derinde yaşar.
2. **Bekle.** Balık yemi yoklar (önce küçük titreşim, sonra şamandıra çekilir).
3. **Vur.** “ŞİMDİ VUR!” çıktığında dokun. Erken vurursan balık kaçar.
4. **Mücadele et.** Makarayı basılı tutarsan ip gerilir. Gerilim kırmızıya çıkarsa **bırak**; yoksa ip kopar. Balık ara ara ani kaçar (surge), o anlarda gevşetmek gerekir.
5. **Karar ver.** Yakalanan balığı çantaya koyup satabilir ya da suya bırakabilirsin. Çanta 10 kapasiteli.
6. **Kazan ve geliştir.** Dükkânda yem al, daha iyi olta (Fiber, Karbon) takarak daha uzağa at ve daha güçlü ip kullan.

Gün döngüsü (4 dakika), hava (açık / bulutlu / yağmur) ve saat ısırma olasılığını etkiler. Her balığın sevdiği saat ve yem farklıdır — Balık Kitabı'nda ipuçlarını bulursun.

### Balıklar

| Tür | Bölge | Ne zaman | Yem | Not |
|---|---|---|---|---|
| Kefal | Sığ | Gün | Hepsi | Başlangıç balığı |
| Lina | Sığ–orta | Şafak | Hamur | Çamurlu dibi sever |
| Sazan | Sığ–orta | Her zaman | Hamur | Göllerin klasiği |
| Gümüş Sudak | Orta | Şafak / akşam | Solucan, yapay yem | Sürüler halinde |
| Gökkuşağı Alabalığı | Sığ–orta | Gündüz | Yapay yem | Temiz, serin su |
| Turna | Orta–derin | Akşam / gece | Yapay yem | Saldırgan |
| Yayın | Derin | Gece | Solucan | Yaşlı avcı |
| Altın Sazan | Orta–derin | Şafak | Hamur | Nadir |
| Göl Ejderi | Derin | Gece + yağmur | Hepsi | Efsane |

## Dosya yapısı

```
index.html        Oyun kabuğu, HUD ve meta etiketleri (iPad tam ekran desteği)
css/style.css     Arayüz, güvenli alanlar (çentik), telefon uyumu
js/config.js      TÜM DENGE AYARLARI: balıklar, oltalar, yemler, hava, saat
js/main.js        Oyun döngüsü, ekonomi, menüler, kayıt
js/world.js       Göl, arazi, su dalgası, gökyüzü, gün dönümü, yağmur, iskele, ağaçlar
js/fish.js        Balık modeli (kod ile), gezinme, yemi fark etme, kaçma, ısırma olasılığı
js/fishing.js    Atış, bekleme, ısırık, makara mücadelesi, yakalama (oyunun çekirdeği)
js/input.js       Dokunmatik, fare ve klavye girişini tek noktada toplar
js/ui.js          HUD, dükkân, çanta, balık kitabı, ayarlar, yakalama ekranı
js/audio.js       WebAudio ile prosedürel sesler (iOS'ta ilk dokunuşta açılır)
js/save.js        localStorage kaydı (gizli modda da çökmez)
```

## Denge ayarı

Çoğu sayı `js/config.js` içinde:
- `SPECIES` — balık başına ısırma olasılığı (`bite`), gün dönemi çarpanları (`timeW`), yem çarpanları (`baitW`), fiyat (`price`), güç (`strength`), sayı (`count`).
- `RODS` — atış mesafesi, ip kapasitesi (kopma eşiği), makara hızı, fiyat.
- `BAITS` — paket miktarı ve fiyatı.
- `ZONE_LIMITS` — sığ/orta/derin mesafe sınırları.
- `DAY_LENGTH_SEC` — gün uzunluğu.

Ayrıca `js/fishing.js` içinde `BITE_SCALE` (ısırma sıklığı genel çarpanı) ve makara/gerilim formülleri (`_updateFight`) ayarlanabilir.

Test için: **Ayarlar → Zamanı ilerlet** (+2 saat) ve **Hava değiştir** düğmeleri.

## Bilinen sınırlar (v1)

- Gölde sadece tek bir iskele var; ileride tekne veya farklı göl noktaları eklenebilir.
- Kayıt yalnızca bu cihazın tarayıcısında tutulur (cihazlar arası senkronizasyon yok).
- Grafikler düşük poligonlu ve gölgesiz; eski iPad'lerde performans için bilinçli olarak sade tutuldu.
