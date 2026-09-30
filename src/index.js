// BU KOD TRAVMA TARAFINDAN HAZIRLANMIŞTIR
// HERHANGİ BİR SORUNDA DC = @FİNDHOST
// AÇIKLAMA METİNLERİ MEVCUTTUR
process.noDeprecation = true;

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { setTimeout: sleep } = require('timers/promises');
const mineflayer = require('mineflayer');

// ==========================================================
// SABİTLER
// ==========================================================
const PROGRAM_ADI = 'FindLoader';
const SABIT_SUNUCU_IP = 'oyna.chickennw.com';

const CONFIG_KLASORU = path.join(
  process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
  PROGRAM_ADI
);

const CONFIG_YOLU = path.join(CONFIG_KLASORU, 'config.json');

const LOGIN_ONCESI_BEKLEME_MS = 5000;
const SMP_ONCESI_BEKLEME_MS = 10000;
const AFK_ONCESI_BEKLEME_MS = 10000;
const AFK_PENCERE_ZAMAN_ASIMI_MS = 8000;

const AFK_SLOTLAR = Object.freeze([10, 11, 12]);

const ANTI_AFK_MIN_MS = 2 * 60 * 1000;
const ANTI_AFK_MAX_MS = 3 * 60 * 1000;

const HAREKET_SURESI_MIN_MS = 300;
const HAREKET_SURESI_MAX_MS = 800;

const DONUS_ACISI_MIN = 0.3;
const DONUS_ACISI_MAX = 1.2;

const RECONNECT_MIN_MS = 2 * 60 * 1000;
const RECONNECT_MAX_MS = 3 * 60 * 1000;

const CONSOLE_CLEAR_MS = 15 * 60 * 1000;

const ANTI_AFK_EYLEMLERI = Object.freeze([
  'sagaDon',
  'solaDon',
  'ileri',
  'geri'
]);

// ==========================================================
// GLOBAL DURUM
// ==========================================================
let rl = null;

let bot = null;
let activeSessionId = null;
let activeSession = null;

let sessionCounter = 0;

let kullaniciAdi = '';
let sifre = '';

let chatGizli = false;
let menuAcik = false;

let denemeSayisi = 0;

let reconnectTimer = null;
let consoleClearInterval = null;

let kapanisBasladi = false;

// ==========================================================
// 1. CONSOLE / UI YARDIMCILARI
// ==========================================================
function ekranaYaz(metin) {
  try {
    if (process.stdout.isTTY) {
      try {
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
      } catch (e) {
        // Terminal bunları desteklemiyorsa devam et.
      }
    }

    const mesaj = String(metin);

    process.stdout.write(
      mesaj.endsWith('\n')
        ? mesaj
        : mesaj + '\n'
    );

    if (rl && !kapanisBasladi) {
      rl.prompt(true);
    }
  } catch (e) {
    // Konsol kapanıyorsa log fonksiyonu uygulamayı düşürmesin.
  }
}

function banneryaz() {
  console.log('======================================================');
  console.log('   ' + PROGRAM_ADI);
  console.log('   Version 1.0 / LifeTime');
  console.log('======================================================');
}

function konsoluTemizle() {
  if (
    kapanisBasladi ||
    !process.stdout.isTTY
  ) {
    return;
  }

  try {
    // execSync('cls') / execSync('clear') kullanmak yerine
    // doğrudan ANSI escape sequence kullanıyoruz.
    process.stdout.write('\x1b[2J\x1b[H');

    banneryaz();

    const botDurumu =
      bot && activeSessionId !== null
        ? 'Bağlı'
        : 'Bağlı değil';

    console.log('[BOT] ' + botDurumu);
    console.log('[SUNUCU] ' + SABIT_SUNUCU_IP);
    console.log('[KULLANICI] ' + (kullaniciAdi || '-'));
    console.log('');

    if (rl) {
      rl.prompt(true);
    }

    if (typeof global.gc === 'function') {
      try {
        global.gc();
      } catch (e) {
        // yoksay
      }
    }
  } catch (e) {
    // Konsol temizleme hatası botu etkilemesin.
  }
}

// ==========================================================
// 2. METİN DÖNÜŞÜM YARDIMCISI
// ==========================================================
function mcTextCevir(veri) {
  if (
    veri === null ||
    veri === undefined
  ) {
    return '';
  }

  if (typeof veri === 'string') {
    return veri;
  }

  try {
    if (
      typeof veri.toAnsi === 'function'
    ) {
      return veri.toAnsi();
    }
  } catch (e) {
    // Aşağıdaki parse yöntemine düş.
  }

  let sonuc = '';

  if (
    typeof veri.text === 'string'
  ) {
    sonuc += veri.text;
  }

  if (
    Array.isArray(veri.extra) &&
    veri.extra.length > 0
  ) {
    for (const parca of veri.extra) {
      sonuc += mcTextCevir(parca);
    }
  }

  if (sonuc === '') {
    try {
      return JSON.stringify(veri);
    } catch (e) {
      return '';
    }
  }

  return sonuc;
}

function hataMesaji(err) {
  if (
    err &&
    typeof err.message === 'string' &&
    err.message.trim() !== ''
  ) {
    return err.message;
  }

  const cevrilmis = mcTextCevir(err);

  return cevrilmis || String(err);
}

// ==========================================================
// 3. CONFIG (KULLANICI ADI / ŞİFRE) YÖNETİMİ
// ==========================================================
function configKlasoruHazirla() {
  try {
    fs.mkdirSync(
      CONFIG_KLASORU,
      {
        recursive: true
      }
    );

    return true;
  } catch (e) {
    ekranaYaz(
      '[-] Config klasörü oluşturulamadı: ' +
      e.message
    );

    return false;
  }
}

function girisBilgileriGecerliMi(
  kAdi,
  sfr
) {
  return (
    typeof kAdi === 'string' &&
    typeof sfr === 'string' &&
    kAdi.trim() !== '' &&
    sfr.trim() !== ''
  );
}

function configOku() {
  try {
    if (!configKlasoruHazirla()) {
      return null;
    }

    if (!fs.existsSync(CONFIG_YOLU)) {
      return null;
    }

    const ham =
      fs.readFileSync(
        CONFIG_YOLU,
        'utf8'
      );

    const veri =
      JSON.parse(ham);

    if (
      veri &&
      girisBilgileriGecerliMi(
        veri.kullaniciAdi,
        veri.sifre
      )
    ) {
      return {
        kullaniciAdi:
          veri.kullaniciAdi.trim(),
        sifre: veri.sifre
      };
    }

    return null;
  } catch (e) {
    ekranaYaz(
      '[-] config.json okunamadı, sıfırdan giriş bilgisi istenecek: ' +
      e.message
    );

    return null;
  }
}

function configKaydet(
  kAdi,
  sfr
) {
  try {
    if (
      !girisBilgileriGecerliMi(
        kAdi,
        sfr
      )
    ) {
      return false;
    }

    if (!configKlasoruHazirla()) {
      return false;
    }

    const configVerisi = {
      kullaniciAdi:
        kAdi.trim(),
      sifre: sfr
    };

    fs.writeFileSync(
      CONFIG_YOLU,
      JSON.stringify(
        configVerisi,
        null,
        2
      ),
      'utf8'
    );

    return true;
  } catch (e) {
    ekranaYaz(
      '[-] config.json kaydedilemedi: ' +
      e.message
    );

    return false;
  }
}

// ==========================================================
// 4. GİRİŞ SORULARI
// ==========================================================
function soruSor(soru) {
  if (!rl) {
    return Promise.reject(
      new Error(
        'Readline henüz başlatılmadı.'
      )
    );
  }

  return new Promise(
    (resolve, reject) => {
      let tamamlandi = false;

      const temizle = () => {
        rl.removeListener(
          'close',
          kapanis
        );

        rl.removeListener(
          'SIGINT',
          iptal
        );
      };

      const bitir = (
        hata,
        cevap
      ) => {
        if (tamamlandi) {
          return;
        }

        tamamlandi = true;

        temizle();

        if (hata) {
          reject(hata);
        } else {
          resolve(cevap);
        }
      };

      const kapanis = () => {
        bitir(
          new Error(
            'Readline kapatıldı.'
          )
        );
      };

      const iptal = () => {
        bitir(
          new Error(
            'Giriş işlemi iptal edildi.'
          )
        );
      };

      rl.once(
        'close',
        kapanis
      );

      rl.once(
        'SIGINT',
        iptal
      );

      try {
        rl.question(
          soru,
          (cevap) => {
            bitir(
              null,
              cevap
            );
          }
        );
      } catch (err) {
        bitir(err);
      }
    }
  );
}

function sifreSor(soru) {
  if (!rl) {
    return Promise.reject(
      new Error(
        'Readline henüz başlatılmadı.'
      )
    );
  }

  if (!process.stdin.isTTY) {
    return soruSor(soru);
  }

  return new Promise(
    (resolve, reject) => {
      const orijinalWriteToOutput =
        rl._writeToOutput;

      let tamamlandi = false;

      const temizle = () => {
        // Override kesinlikle kalıcı bırakılmaz.
        rl._writeToOutput =
          orijinalWriteToOutput;

        rl.removeListener(
          'close',
          kapanis
        );

        rl.removeListener(
          'SIGINT',
          iptal
        );
      };

      const bitir = (
        hata,
        cevap
      ) => {
        if (tamamlandi) {
          return;
        }

        tamamlandi = true;

        temizle();

        if (hata) {
          reject(hata);
        } else {
          resolve(cevap);
        }
      };

      const kapanis = () => {
        bitir(
          new Error(
            'Readline kapatıldı.'
          )
        );
      };

      const iptal = () => {
        bitir(
          new Error(
            'Giriş işlemi iptal edildi.'
          )
        );
      };

      // Sadece password sorusu boyunca aktif.
      rl._writeToOutput =
        function (stringToWrite) {
          try {
            const metin =
              String(
                stringToWrite
              );

            if (
              metin.startsWith(
                soru
              )
            ) {
              const yazilanKisim =
                metin.slice(
                  soru.length
                );

              rl.output.write(
                soru +
                yazilanKisim.replace(
                  /[^\r\n]/g,
                  '*'
                )
              );
            } else {
              rl.output.write(
                metin.replace(
                  /[^\r\n]/g,
                  '*'
                )
              );
            }
          } catch (err) {
            // Soru sonunda kesin olarak restore edilecek.
          }
        };

      rl.once(
        'close',
        kapanis
      );

      rl.once(
        'SIGINT',
        iptal
      );

      try {
        rl.question(
          soru,
          (cevap) => {
            bitir(
              null,
              cevap
            );
          }
        );
      } catch (err) {
        bitir(err);
      }
    }
  );
}

async function girisBilgileriniAl() {
  const mevcutConfig =
    configOku();

  if (mevcutConfig) {
    ekranaYaz(
      '[+] Kaydedilmiş giriş bilgisi bulundu, otomatik giriş yapılacak (' +
      mevcutConfig.kullaniciAdi +
      ').'
    );

    return {
      kullaniciAdi:
        mevcutConfig.kullaniciAdi,
      sifre:
        mevcutConfig.sifre
    };
  }

  let kAdi = '';

  while (kAdi === '') {
    kAdi = (
      await soruSor(
        'Kullanıcı adınızı girin: '
      )
    ).trim();

    if (kAdi === '') {
      ekranaYaz(
        '[-] Kullanıcı adı boş bırakılamaz. ' +
        'Yalnızca boşluk da kabul edilmez. ' +
        'Lütfen tekrar girin.'
      );
    }
  }

  let sfr = '';

  while (sfr.trim() === '') {
    sfr =
      await sifreSor(
        'Şifrenizi girin: '
      );

    if (sfr.trim() === '') {
      ekranaYaz(
        '[-] Şifre boş bırakılamaz. ' +
        'Yalnızca boşluk da kabul edilmez. ' +
        'Lütfen tekrar girin.'
      );
    }
  }

  const kaydetCevap =
    (
      await soruSor(
        '\nSıradaki girişler için bu bilgileri kaydedelim mi? (e/h): '
      )
    )
      .trim()
      .toLowerCase();

  if (
    kaydetCevap.startsWith('e')
  ) {
    const basarili =
      configKaydet(
        kAdi,
        sfr
      );

    ekranaYaz(
      basarili
        ? '[+] Giriş bilgileri ' +
          path.basename(
            CONFIG_YOLU
          ) +
          ' dosyasına kaydedildi.\n'
        : '[-] Kaydetme başarısız oldu, bilgiler yalnızca bu oturum için kullanılacak.\n'
    );
  }

  return {
    kullaniciAdi: kAdi,
    sifre: sfr
  };
}

// ==========================================================
// 5. SESSION / TIMER YÖNETİMİ
// ==========================================================
// Global Map yok.
// Her timer doğrudan kendi session'ına bağlı.
// Session öldüğünde bütün timer referansları temizlenir.

function sessionAktifMi(sessionId) {
  return (
    activeSessionId === sessionId &&
    activeSession !== null &&
    activeSession.id === sessionId &&
    !activeSession.cleaned
  );
}

function yeniSessionOlustur(
  sessionId
) {
  return {
    id: sessionId,

    bot: null,

    cleaned: false,
    disconnectHandled: false,

    timers: new Set(),

    antiAfkTimer: null,

    controls: new Set(),

    pencereBekleniyor: false,

    lastTitle: '',

    abortController:
      new AbortController()
  };
}

// ----------------------------------------------------------
// Eski fonksiyon isimleri korunuyor.
// Artık global Map yerine session.timers kullanılıyor.
// ----------------------------------------------------------
function hareketTimeriEkle(
  sessionId,
  handle
) {
  const session =
    activeSession;

  if (
    !session ||
    session.id !== sessionId ||
    session.cleaned ||
    !handle
  ) {
    return;
  }

  session.timers.add(
    handle
  );
}

function hareketTimerSil(
  sessionId,
  handle
) {
  const session =
    activeSession;

  if (
    !session ||
    session.id !== sessionId ||
    !handle
  ) {
    return;
  }

  session.timers.delete(
    handle
  );

  if (
    session.antiAfkTimer ===
    handle
  ) {
    session.antiAfkTimer =
      null;
  }
}

function hareketTimerleriniTemizle(
  sessionId
) {
  const session =
    activeSession &&
    activeSession.id === sessionId
      ? activeSession
      : null;

  if (!session) {
    return;
  }

  for (
    const handle of
    session.timers
  ) {
    clearTimeout(handle);
  }

  session.timers.clear();

  session.antiAfkTimer =
    null;
}

function antiAfkTimeriniTemizle(
  sessionId
) {
  const session =
    activeSession &&
    activeSession.id === sessionId
      ? activeSession
      : null;

  if (!session) {
    return;
  }

  if (
    session.antiAfkTimer
  ) {
    clearTimeout(
      session.antiAfkTimer
    );

    session.timers.delete(
      session.antiAfkTimer
    );

    session.antiAfkTimer =
      null;
  }
}

function zamanlayiciEkle(
  session,
  callback,
  gecikmeMs
) {
  if (
    !session ||
    session.cleaned ||
    !sessionAktifMi(
      session.id
    )
  ) {
    return null;
  }

  const handle =
    setTimeout(
      () => {
        hareketTimerSil(
          session.id,
          handle
        );

        if (
          session.cleaned ||
          !sessionAktifMi(
            session.id
          )
        ) {
          return;
        }

        try {
          callback();
        } catch (err) {
          ekranaYaz(
            '[🚨 HATA] Session timer callback hatası: ' +
            hataMesaji(err)
          );
        }
      },
      gecikmeMs
    );

  hareketTimeriEkle(
    session.id,
    handle
  );

  return handle;
}

function zamanlayiciyiSil(
  session,
  handle
) {
  if (
    !session ||
    !handle
  ) {
    return;
  }

  clearTimeout(handle);

  hareketTimerSil(
    session.id,
    handle
  );
}

function sessionTimerlariniTemizle(
  session
) {
  if (!session) {
    return;
  }

  hareketTimerleriniTemizle(
    session.id
  );
}

async function sessionBekle(
  session,
  ms
) {
  if (
    !session ||
    session.cleaned ||
    !sessionAktifMi(
      session.id
    )
  ) {
    return false;
  }

  try {
    await sleep(
      ms,
      undefined,
      {
        signal:
          session
            .abortController
            .signal
      }
    );

    return (
      !session.cleaned &&
      sessionAktifMi(
        session.id
      )
    );
  } catch (err) {
    if (
      err &&
      err.name === 'AbortError'
    ) {
      return false;
    }

    throw err;
  }
}

function rastgele(
  min,
  max
) {
  return (
    Math.random() *
    (max - min) +
    min
  );
}

function rastgeleTamsayi(
  min,
  max
) {
  return Math.floor(
    rastgele(
      min,
      max + 1
    )
  );
}

// ==========================================================
// 6. MINEFLAYER BOT CLEANUP
// ==========================================================
function botInstanceTemizle(
  botRef
) {
  if (!botRef) {
    return;
  }

  // Mineflayer'ın protocol client'ı.
  const client =
    botRef._client || null;

  const socket =
    client &&
    client.socket
      ? client.socket
      : null;

  // Önce normal Mineflayer kapanışını dene.
  try {
    if (
      typeof botRef.quit ===
      'function'
    ) {
      botRef.quit();
    }
  } catch (e) {
    // Zaten kapanmış olabilir.
  }

  // Socket / protocol client.
  if (client) {
    try {
      if (
        typeof client.end ===
        'function'
      ) {
        client.end();
      }
    } catch (e) {
      // yoksay
    }

    try {
      if (
        socket &&
        typeof socket.destroy ===
        'function'
      ) {
        socket.destroy();
      }
    } catch (e) {
      // yoksay
    }

    try {
      if (
        socket &&
        typeof socket.removeAllListeners ===
        'function'
      ) {
        socket.removeAllListeners();
      }
    } catch (e) {
      // yoksay
    }

    try {
      if (
        typeof client.removeAllListeners ===
        'function'
      ) {
        client.removeAllListeners();
      }
    } catch (e) {
      // yoksay
    }
  }

  // Mineflayer bot event listener'ları.
  try {
    if (
      typeof botRef.removeAllListeners ===
      'function'
    ) {
      botRef.removeAllListeners();
    }
  } catch (e) {
    // yoksay
  }

  // GC için bot nesnesi içindeki ağır referansları temizle
  try {
    if (botRef.entities) botRef.entities = null;
    if (botRef.players) botRef.players = null;
    if (botRef.world) botRef.world = null;
    if (botRef.inventory) botRef.inventory = null;
    if (botRef._client) botRef._client = null;
  } catch (e) {
    // yoksay
  }

  if (typeof global.gc === 'function') {
    try {
      global.gc();
    } catch (e) {
      // yoksay
    }
  }
}

// ==========================================================
// 7. SESSION TAM TEMİZLİĞİ
// ==========================================================
function sessionTemizle(
  session
) {
  if (
    !session ||
    session.cleaned
  ) {
    return;
  }

  // Bundan sonra eski event callback'lerinin hiçbirinin
  // yeni bağlantıya dokunmasına izin verme.
  session.cleaned = true;
  session.pencereBekleniyor =
    false;
  session.disconnectHandled =
    true;

  // Otomatik login akışındaki timers/promises anında iptal.
  try {
    session
      .abortController
      .abort();
  } catch (e) {
    // yoksay
  }

  // Bütün klasik timeout'lar.
  sessionTimerlariniTemizle(
    session
  );

  // Açık kalan movement state'lerini bırak.
  if (session.bot) {
    for (
      const yon of
      session.controls
    ) {
      try {
        session.bot.setControlState(
          yon,
          false
        );
      } catch (e) {
        // Socket kapanmış olabilir.
      }
    }
  }

  session.controls.clear();

  const botRef =
    session.bot;

  // Session içindeki bot referansını kopar.
  session.bot = null;

  // Global bot referansı aynı instance ise null.
  if (
    bot === botRef
  ) {
    bot = null;
  }

  // Session artık aktif değil.
  if (
    activeSessionId ===
    session.id
  ) {
    activeSessionId = null;
  }

  if (
    activeSession ===
    session
  ) {
    activeSession = null;
  }

  menuAcik = false;

  // Socket + client + bot event listener cleanup.
  botInstanceTemizle(
    botRef
  );
}

// ==========================================================
// 8. HAREKET
// ==========================================================
function kisaHareketUygula(
  botRef,
  sessionId,
  yon,
  sureMs
) {
  if (
    !botRef ||
    !sessionAktifMi(
      sessionId
    ) ||
    !activeSession
  ) {
    return;
  }

  const session =
    activeSession;

  try {
    botRef.setControlState(
      yon,
      true
    );

    session.controls.add(
      yon
    );
  } catch (e) {
    return;
  }

  zamanlayiciEkle(
    session,
    () => {
      if (
        !sessionAktifMi(
          sessionId
        )
      ) {
        return;
      }

      try {
        botRef.setControlState(
          yon,
          false
        );
      } catch (e) {
        // yoksay
      } finally {
        session.controls.delete(
          yon
        );
      }
    },
    sureMs
  );
}

// ==========================================================
// 9. İNSANCIL ANTİ-AFK
// ==========================================================
function antiAfkAdimiCalistir(
  botRef,
  sessionId
) {
  if (
    !sessionAktifMi(
      sessionId
    )
  ) {
    return;
  }

  const session =
    activeSession;

  if (
    !session ||
    session.bot !== botRef
  ) {
    return;
  }

  try {
    const eylem =
      ANTI_AFK_EYLEMLERI[
        Math.floor(
          Math.random() *
          ANTI_AFK_EYLEMLERI.length
        )
      ];

    if (
      eylem === 'sagaDon' ||
      eylem === 'solaDon'
    ) {
      const mevcutYaw =
        botRef.entity
          ? botRef.entity.yaw
          : 0;

      const aci =
        rastgele(
          DONUS_ACISI_MIN,
          DONUS_ACISI_MAX
        ) *
        (
          eylem === 'sagaDon'
            ? 1
            : -1
        );

      botRef.look(
        mevcutYaw + aci,
        botRef.entity
          ? botRef.entity.pitch
          : 0,
        true
      );
    } else {
      const yon =
        eylem === 'ileri'
          ? 'forward'
          : 'back';

      const sure =
        rastgeleTamsayi(
          HAREKET_SURESI_MIN_MS,
          HAREKET_SURESI_MAX_MS
        );

      kisaHareketUygula(
        botRef,
        sessionId,
        yon,
        sure
      );
    }
  } catch (e) {
    // Anlık movement hatası döngüyü bozmasın.
  }

  if (
    !sessionAktifMi(
      sessionId
    )
  ) {
    return;
  }

  const sonrakiGecikme =
    rastgeleTamsayi(
      ANTI_AFK_MIN_MS,
      ANTI_AFK_MAX_MS
    );

  session.antiAfkTimer =
    zamanlayiciEkle(
      session,
      () => {
        session.antiAfkTimer =
          null;

        antiAfkAdimiCalistir(
          botRef,
          sessionId
        );
      },
      sonrakiGecikme
    );
}

function antiAfkDongusuBaslat(
  botRef,
  sessionId
) {
  if (
    !sessionAktifMi(
      sessionId
    )
  ) {
    return;
  }

  const session =
    activeSession;

  if (
    !session ||
    session.bot !== botRef
  ) {
    return;
  }

  if (
    session.antiAfkTimer
  ) {
    zamanlayiciyiSil(
      session,
      session.antiAfkTimer
    );
  }

  ekranaYaz(
    '\n[🤖 ANTİ-AFK] İnsancıl hareket döngüsü başlatıldı.\n'
  );

  const ilkGecikme =
    rastgeleTamsayi(
      ANTI_AFK_MIN_MS,
      ANTI_AFK_MAX_MS
    );

  session.antiAfkTimer =
    zamanlayiciEkle(
      session,
      () => {
        session.antiAfkTimer =
          null;

        antiAfkAdimiCalistir(
          botRef,
          sessionId
        );
      },
      ilkGecikme
    );
}

// ==========================================================
// 10. OTOMATİK GİRİŞ AKIŞI
// ==========================================================
function gecikme(ms) {
  return sleep(ms);
}

async function otomatikGirisAkisiniCalistir(
  botRef,
  sessionId
) {
  const session =
    activeSession;

  if (
    !session ||
    session.id !== sessionId ||
    session.bot !== botRef
  ) {
    return;
  }

  try {
    if (
      !(await sessionBekle(
        session,
        LOGIN_ONCESI_BEKLEME_MS
      ))
    ) {
      return;
    }

    ekranaYaz(
      '\n[⏳] /login gönderiliyor...'
    );

    try {
      botRef.chat(
        '/login ' + sifre
      );
    } catch (e) {
      // yoksay
    }

    if (
      !(await sessionBekle(
        session,
        SMP_ONCESI_BEKLEME_MS
      ))
    ) {
      return;
    }

    ekranaYaz(
      '[⏳] /smp gönderiliyor...'
    );

    try {
      botRef.chat(
        '/smp'
      );
    } catch (e) {
      // yoksay
    }

    if (
      !(await sessionBekle(
        session,
        AFK_ONCESI_BEKLEME_MS
      ))
    ) {
      return;
    }

    ekranaYaz(
      '[⏳] /afk gönderiliyor...'
    );

    session.pencereBekleniyor =
      true;

    try {
      botRef.chat(
        '/afk'
      );
    } catch (e) {
      // yoksay
    }

    if (
      !(await sessionBekle(
        session,
        AFK_PENCERE_ZAMAN_ASIMI_MS
      ))
    ) {
      return;
    }

    if (
      !session.pencereBekleniyor
    ) {
      return;
    }

    session.pencereBekleniyor =
      false;

    ekranaYaz(
      '\n[!] /afk penceresi beklenen sürede açılmadı, anti-afk döngüsüne geçiliyor.\n'
    );

    antiAfkDongusuBaslat(
      botRef,
      sessionId
    );
  } catch (err) {
    if (!session.cleaned) {
      ekranaYaz(
        '[🚨 HATA] Otomatik giriş akışı hatası: ' +
        hataMesaji(err)
      );
    }
  }
}

// ==========================================================
// 11. RECONNECT
// ==========================================================
function yenidenBaglanmayiPlanla(
  sebep,
  sessionId
) {
  if (kapanisBasladi) {
    return;
  }

  if (
    !sessionAktifMi(
      sessionId
    )
  ) {
    return;
  }

  const session =
    activeSession;

  if (
    !session ||
    session.disconnectHandled
  ) {
    return;
  }

  // error + end + kicked aynı bağlantı için
  // birden fazla reconnect oluşturamasın.
  session.disconnectHandled =
    true;

  const sebepMetni =
    hataMesaji(sebep);

  // Eski session önce tamamen yok edilir.
  sessionTemizle(
    session
  );

  // Her ihtimale karşı eski reconnect timerını da sil.
  if (reconnectTimer) {
    clearTimeout(
      reconnectTimer
    );

    reconnectTimer =
      null;
  }

  denemeSayisi++;

  const bekleme =
    rastgeleTamsayi(
      RECONNECT_MIN_MS,
      RECONNECT_MAX_MS
    );

  ekranaYaz(
    '\n[-] Bağlantı koptu veya hata oluştu (' +
    sebepMetni +
    ')'
  );

  ekranaYaz(
    '[!] Sunucunun otomatik yeniden başlatması olabileceği için ' +
    (bekleme / 1000 / 60)
      .toFixed(1) +
    ' dakika sonra tekrar denenecek. (Deneme: ' +
    denemeSayisi +
    ')\n'
  );

  reconnectTimer =
    setTimeout(
      () => {
        reconnectTimer =
          null;

        if (
          kapanisBasladi
        ) {
          return;
        }

        baslatBot();
      },
      bekleme
    );

  if (
    typeof reconnectTimer.unref ===
    'function'
  ) {
    reconnectTimer.unref();
  }
}

// ==========================================================
// 12. BOT EVENT LIFECYCLE
// ==========================================================
function botEventleriniBagla(
  botRef,
  sessionId
) {
  const session =
    activeSession;

  if (
    !session ||
    session.id !== sessionId ||
    session.bot !== botRef
  ) {
    return;
  }

  botRef.on(
    'login',
    () => {
      if (
        !sessionAktifMi(
          sessionId
        )
      ) {
        return;
      }

      ekranaYaz(
        '\n[+] Sunucuya bağlantı kuruldu, karakterin oluşması bekleniyor...'
      );
    }
  );

  botRef.on(
    'spawn',
    () => {
      if (
        !sessionAktifMi(
          sessionId
        )
      ) {
        return;
      }

      denemeSayisi = 0;

      ekranaYaz(
        '\n[+] Sunucuya giriş yapıldı!'
      );

      void otomatikGirisAkisiniCalistir(
        botRef,
        sessionId
      );
    }
  );

  botRef.on(
    'message',
    (message) => {
      if (
        !sessionAktifMi(
          sessionId
        )
      ) {
        return;
      }

      if (
        menuAcik ||
        chatGizli
      ) {
        return;
      }

      try {
        ekranaYaz(
          message.toAnsi()
        );
      } catch (e) {
        ekranaYaz(
          mcTextCevir(
            message
          )
        );
      }
    }
  );

  botRef.on(
    'title',
    (text) => {
      if (
        !sessionAktifMi(
          sessionId
        ) ||
        !text
      ) {
        return;
      }

      let str =
        mcTextCevir(text);

      str = str
        .replace(
          /§[0-9a-fk-or]/gi,
          ''
        )
        .trim();

      if (
        str !== '' &&
        str !== session.lastTitle
      ) {
        session.lastTitle =
          str;
      }
    }
  );

  botRef.on(
    'windowOpen',
    (window) => {
      if (
        !sessionAktifMi(
          sessionId
        )
      ) {
        return;
      }

      menuAcik = true;

      if (
        session.pencereBekleniyor
      ) {
        session.pencereBekleniyor =
          false;

        const slot =
          AFK_SLOTLAR[
            Math.floor(
              Math.random() *
              AFK_SLOTLAR.length
            )
          ];

        ekranaYaz(
          '\n[!] AFK menüsü açıldı, ' +
          slot +
          ' numaralı slota tıklanıyor...'
        );

        Promise.resolve(
          botRef.clickWindow(
            slot,
            0,
            0
          )
        )
          .then(
            () => {
              if (
                !sessionAktifMi(
                  sessionId
                )
              ) {
                return;
              }

              ekranaYaz(
                '[+] Tıklama başarılı, anti-afk döngüsü başlıyor.\n'
              );

              antiAfkDongusuBaslat(
                botRef,
                sessionId
              );
            }
          )
          .catch(
            (err) => {
              if (
                !sessionAktifMi(
                  sessionId
                )
              ) {
                return;
              }

              ekranaYaz(
                '[-] Slot tıklanamadı: ' +
                hataMesaji(err) +
                ', yine de anti-afk döngüsüne geçiliyor.\n'
              );

              antiAfkDongusuBaslat(
                botRef,
                sessionId
              );
            }
          );

        return;
      }

      ekranaYaz(
        '\n[!] Bir menü açıldı (' +
        (
          window &&
          window.title
            ? mcTextCevir(
                window.title
              )
            : 'isimsiz'
        ) +
        ').'
      );
    }
  );

  botRef.on(
    'windowClose',
    () => {
      if (
        !sessionAktifMi(
          sessionId
        )
      ) {
        return;
      }

      menuAcik = false;
    }
  );

  botRef.on(
    'end',
    (reason) => {
      yenidenBaglanmayiPlanla(
        'Sunucu bağlantıyı kesti: ' +
        hataMesaji(reason),
        sessionId
      );
    }
  );

  botRef.on(
    'error',
    (err) => {
      yenidenBaglanmayiPlanla(
        'Hata: ' +
        hataMesaji(err),
        sessionId
      );
    }
  );

  botRef.on(
    'kicked',
    (reason) => {
      yenidenBaglanmayiPlanla(
        'Atıldın: ' +
        mcTextCevir(reason),
        sessionId
      );
    }
  );
}

// ==========================================================
// 13. BOT BAŞLAT
// ==========================================================
function baslatBot() {
  if (kapanisBasladi) {
    return;
  }

  // Yeni session başlamadan önce mevcut sessionı tamamen temizle.
  if (activeSession) {
    sessionTemizle(
      activeSession
    );
  }

  if (reconnectTimer) {
    clearTimeout(
      reconnectTimer
    );

    reconnectTimer =
      null;
  }

  sessionCounter++;

  const sessionId =
    sessionCounter;

  const session =
    yeniSessionOlustur(
      sessionId
    );

  activeSession =
    session;

  activeSessionId =
    sessionId;

  bot = null;
  menuAcik = false;

  try {
    const yeniBot =
      mineflayer.createBot({
        host:
          SABIT_SUNUCU_IP,

        username:
          kullaniciAdi,

        auth:
          'offline',

        version:
          false,

        viewDistance:
          'tiny',

        checkTimeoutInterval:
          30 * 1000
      });

    session.bot =
      yeniBot;

    // Debug / trace amacıyla session ID.
    yeniBot._sessionId =
      sessionId;

    bot =
      yeniBot;

    botEventleriniBagla(
      yeniBot,
      sessionId
    );
  } catch (err) {
    ekranaYaz(
      '\n[🚨 HATA] Bot oluşturulamadı: ' +
      hataMesaji(err) +
      '\n'
    );

    yenidenBaglanmayiPlanla(
      'Bot oluşturma hatası: ' +
      hataMesaji(err),
      sessionId
    );
  }
}

// ==========================================================
// 14. KOMUT SATIRI
// ==========================================================
function komutuIsle(
  inputRaw
) {
  const mesaj =
    String(
      inputRaw
    ).trim();

  if (mesaj === '') {
    if (rl) {
      rl.prompt();
    }

    return;
  }

  if (
    mesaj === '!kapa' ||
    mesaj === '!kapat'
  ) {
    chatGizli =
      true;

    ekranaYaz(
      '\n[!] Chat akışı GİZLENDİ.\n'
    );
  } else if (
    mesaj === '!aç' ||
    mesaj === '!ac'
  ) {
    chatGizli =
      false;

    ekranaYaz(
      '\n[!] Chat akışı AÇILDI.\n'
    );
  } else {
    if (
      !bot ||
      activeSessionId === null ||
      !activeSession ||
      activeSession.bot !== bot
    ) {
      ekranaYaz(
        '\n[-] Bot şu anda sunucuya bağlı değil, mesaj gönderilemedi.\n'
      );

      if (rl) {
        rl.prompt();
      }

      return;
    }

    try {
      bot.chat(
        mesaj
      );
    } catch (err) {
      ekranaYaz(
        '\n[-] Mesaj gönderilemedi: ' +
        hataMesaji(err) +
        '\n'
      );
    }
  }

  if (rl) {
    rl.prompt();
  }
}

// ==========================================================
// 15. BAŞLANGIÇ
// ==========================================================
async function programiBaslat() {
  if (rl) {
    return;
  }

  rl =
    readline.createInterface({
      input:
        process.stdin,

      output:
        process.stdout,

      terminal:
        process.stdin.isTTY === true
    });

  banneryaz();

  try {
    const bilgiler =
      await girisBilgileriniAl();

    if (
      !girisBilgileriGecerliMi(
        bilgiler.kullaniciAdi,
        bilgiler.sifre
      )
    ) {
      throw new Error(
        'Geçerli giriş bilgileri alınamadı.'
      );
    }

    kullaniciAdi =
      bilgiler.kullaniciAdi;

    sifre =
      bilgiler.sifre;

    rl.setPrompt(
      'Mesajın > '
    );

    // line event'i yalnızca burada bir kez bağlanıyor.
    rl.on(
      'line',
      (input) => {
        try {
          komutuIsle(
            input
          );
        } catch (err) {
          ekranaYaz(
            '\n[🚨 HATA] Komut işlenirken beklenmeyen bir hata oluştu: ' +
            hataMesaji(err) +
            '\n'
          );

          if (rl) {
            rl.prompt();
          }
        }
      }
    );

    ekranaYaz(
      '\n[~] ' +
      SABIT_SUNUCU_IP +
      ' adresine bağlanılıyor...'
    );

    baslatBot();

    // Program boyunca yalnızca tek console clear interval.
    consoleClearInterval =
      setInterval(
        konsoluTemizle,
        CONSOLE_CLEAR_MS
      );

    // Interval process'in kapanmasını tek başına engellemesin.
    if (
      typeof consoleClearInterval.unref ===
      'function'
    ) {
      consoleClearInterval.unref();
    }
  } catch (err) {
    ekranaYaz(
      '\n[🚨 KRİTİK HATA] Program başlatılamadı: ' +
      hataMesaji(err) +
      '\n'
    );

    temizlikYap();

    process.exitCode =
      1;
  }
}

// ==========================================================
// 16. KAPANIŞ VE HATA YÖNETİMİ
// ==========================================================
function temizlikYap() {
  if (kapanisBasladi) {
    return;
  }

  kapanisBasladi =
    true;

  if (consoleClearInterval) {
    clearInterval(
      consoleClearInterval
    );

    consoleClearInterval =
      null;
  }

  if (reconnectTimer) {
    clearTimeout(
      reconnectTimer
    );

    reconnectTimer =
      null;
  }

  if (activeSession) {
    sessionTemizle(
      activeSession
    );
  } else if (bot) {
    const eskiBot =
      bot;

    bot = null;
    activeSessionId =
      null;

    botInstanceTemizle(
      eskiBot
    );
  }

  if (rl) {
    try {
      rl.removeAllListeners();
      rl.close();
    } catch (e) {
      // yoksay
    } finally {
      rl = null;
    }
  }

  menuAcik = false;
}

function programiDurdur(
  exitCode = 0
) {
  if (!kapanisBasladi) {
    ekranaYaz(
      exitCode === 0
        ? '\n[~] Program kapatılıyor...\n'
        : '\n[~] Program hata nedeniyle kapatılıyor...\n'
    );
  }

  temizlikYap();

  process.exitCode =
    exitCode;
}

// ==========================================================
// PROCESS SIGNALS
// ==========================================================
process.once(
  'SIGINT',
  () => {
    programiDurdur(0);
  }
);

process.once(
  'SIGTERM',
  () => {
    programiDurdur(0);
  }
);

process.once(
  'uncaughtException',
  (err) => {
    ekranaYaz(
      '\n[🚨 KRİTİK HATA] Yakalanmayan hata: ' +
      hataMesaji(err) +
      '\n'
    );

    programiDurdur(1);
  }
);

process.once(
  'unhandledRejection',
  (err) => {
    ekranaYaz(
      '\n[🚨 KRİTİK HATA] Yakalanmayan promise hatası: ' +
      hataMesaji(err) +
      '\n'
    );

    programiDurdur(1);
  }
);

// ==========================================================
// BAŞLAT
// ==========================================================
void programiBaslat();
