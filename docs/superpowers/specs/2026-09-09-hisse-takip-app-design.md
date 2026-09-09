# BIST Hisse Kar/Zarar Takip Uygulaması — Tasarım

**Tarih:** 2026-09-09
**Durum:** Onaylandı (brainstorming aşaması)

## Amaç

Kullanıcının BIST hisselerinde yaptığı alım/satım işlemlerini telefonundan
girip, gerçekleşen kar/zararını ve portföy özetini görebileceği bir Android
uygulaması (APK). Excel tabanlı bir çözüm değerlendirildi ama kullanıcı
doğrudan mobil app istedi; Excel kapsam dışı bırakıldı.

## Kapsam

**Dahil:**
- Hisse alım/satım işlemi girişi (BIST hisse kodu dropdown'dan seçilir)
- Hisse listesinin bir kerelik dışarıdan (TradingView BIST listesi referans
  alınarak) uygulama içine gömülmesi; kullanıcı sonradan elle ekleyip
  çıkarabilir
- Hisse bazında portföy özeti: adet, ortalama maliyet, gerçekleşen kar/zarar
- Toplam kar/zarar özeti + basit grafikler (hisse dağılımı, zaman içinde
  kümülatif kar/zarar)
- İşlem geçmişi listesi (düzenleme/silme)
- Veriler yalnızca cihazda (yerel SQLite), bulut yok

**Kapsam dışı (bilinçli olarak):**
- Canlı hisse fiyatı çekme
- Bulut yedekleme / çoklu cihaz senkronizasyonu
- Çoklu kullanıcı/hesap
- Excel entegrasyonu

## Teknoloji Seçimi

**React Native + Expo (TypeScript)**, APK üretimi **EAS Build** (bulut
derleme) ile. Gerekçe: kullanıcının makinesinde Android Studio/SDK kurulu
değil; yerel kurulum riskli ve zaman alıcı olurdu. EAS Build ücretsiz bir
Expo hesabıyla APK indirmeyi sağlıyor, ek araç kurulumu gerektirmiyor.

Yerel veritabanı: `expo-sqlite`.
Grafikler: hafif bir React Native grafik kütüphanesi (ör. `react-native-gifted-charts`
veya `victory-native` — plan aşamasında netleştirilecek).

## Veri Modeli

```
stocks
  id (pk)
  symbol       -- örn. "THYAO"
  name         -- örn. "Türk Hava Yolları"
  is_custom    -- kullanıcı tarafından eklenmiş mi

transactions
  id (pk)
  stock_id (fk -> stocks.id)
  type         -- 'buy' | 'sell'
  quantity
  price
  date
```

## Hesaplama Mantığı

- Her hisse için ağırlıklı ortalama maliyet yöntemi kullanılır (FIFO değil).
- Ortalama alım maliyeti = toplam alım tutarı / toplam alım adedi
- Ortalama satış fiyatı = toplam satış tutarı / toplam satış adedi
- Gerçekleşen kar/zarar = satılan adet × (ort. satış fiyatı − ort. alım maliyeti)
- Açık pozisyon (elde tutulan) = alım adedi − satım adedi, maliyet bazında
  gösterilir (canlı fiyat olmadığı için güncel piyasa değeri hesaplanmaz)

## Ekranlar

1. **İşlem Ekle** — hisse seçimi (aranabilir dropdown), tür (al/sat), adet,
   fiyat, tarih
2. **Portföy** — hisse bazında özet listesi (adet, ort. maliyet, gerçekleşen
   kar/zarar)
3. **Özet** — toplam kar/zarar, hisse dağılım grafiği, zaman içinde kümülatif
   kar/zarar grafiği
4. **İşlem Geçmişi** — tüm işlemler, düzenle/sil

## Hata Durumları

- Satış adedi, o hissede elde tutulan adetten fazla girilirse uyarı verilip
  işlem engellenir.
- Negatif/sıfır adet veya fiyat girilemez (form validasyonu).
- Hisse listesi boşsa veya seçilmemişse işlem eklenemez.

## Test Planı

- Hesaplama mantığı (ortalama maliyet, kar/zarar) için birim testleri
- Formların temel validasyonları için manuel/otomatik test
- EAS Build ile üretilen APK'nın gerçek/emulator Android cihazda kurulup
  temel akışın (işlem ekle → portföy → özet) çalıştığının doğrulanması
