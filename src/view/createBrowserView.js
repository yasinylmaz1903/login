const path = require('path');
const { BrowserView, Menu, dialog, shell } = require('electron');
const https = require('https');
const fs = require('fs');
const os = require('os');

function createBrowserView(partition, webPreferencesOverrides = {}) {
  const view = new BrowserView({
    webPreferences: {
      partition,
      contextIsolation: true,
      nodeIntegration: false,
      // Embedded player uyumluluğu için daha permissive ayarlar
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      javascript: true,
      devTools: false,
      ...webPreferencesOverrides
    }
  });
  
  // DevTools'u tamamen kapat
  view.webContents.on('devtools-opened', () => {
    view.webContents.closeDevTools();
  });
  
  // F12, Ctrl+Shift+I, Ctrl+R ve Ctrl+Shift+R kısayollarını engelle
  view.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      // F12 veya Ctrl+Shift+I (DevTools)
      if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) {
        event.preventDefault();
        return;
      }
      // Ctrl+R (normal yenileme) veya Ctrl+Shift+R (hard yenileme)
      if (input.control && (input.key === 'r' || input.key === 'R')) {
        event.preventDefault();
        return;
      }
    }
  });
  
  // Normal Chrome tarayıcısı gibi tam User-Agent
  const chromeVersion = process.versions.chrome;
  const userAgent = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
  view.webContents.setUserAgent(userAgent);
  
  // Sayfa yüklendiğinde scrollbar stilini enjekte et
  view.webContents.on('did-finish-load', () => {
    view.webContents.insertCSS(`
      ::-webkit-scrollbar {
        width: 10px;
        height: 10px;
      }
      ::-webkit-scrollbar-track {
        background: #1a1d24;
        border-radius: 5px;
      }
      ::-webkit-scrollbar-thumb {
        background: #2a3340;
        border-radius: 5px;
        transition: background 0.2s ease;
      }
      ::-webkit-scrollbar-thumb:hover {
        background: #36507a;
      }
      ::-webkit-scrollbar-corner {
        background: #1a1d24;
      }
      * {
        scrollbar-width: thin;
        scrollbar-color: #2a3340 #1a1d24;
      }
    `).catch(() => {});

    // Video player fullscreen desteği için iframe'leri patch et (sadece video sitelerinde)
    // Not: Giriş/kurumsal sayfalarda (örn. ebetlab) iframe sandbox'ını kaldırmak reCAPTCHA/login akışını bozabiliyor.
    view.webContents.executeJavaScript(`
      (() => {
        const host = (location && location.hostname) ? String(location.hostname).toLowerCase() : '';
        // Bu domainlerde iframe/sandbox ile oynamıyoruz.
        if (host.endsWith('ebetlab.com')) return;

        const isLikelyVideoFrame = (iframe) => {
          try {
            const src = String(iframe?.src || '').toLowerCase();
            if (src.includes('rapidvid') || src.includes('streamtape') || src.includes('voe') || src.includes('doodstream') || src.includes('mixdrop') || src.includes('upstream')) return true;
            const area = (iframe?.offsetWidth || 0) * (iframe?.offsetHeight || 0);
            // Büyük iframe'ler genelde player oluyor
            if (area >= (480 * 270)) return true;
          } catch (_e) { /* ignore */ }
          return false;
        };

        const patchIframes = () => {
          const frames = Array.from(document.querySelectorAll('iframe'));
          for (const f of frames) {
            try {
              if (!isLikelyVideoFrame(f)) continue;
              f.setAttribute('allowfullscreen', 'true');
              const allow = (f.getAttribute('allow') || '').trim();
              if (!/\\bfullscreen\\b/i.test(allow)) {
                f.setAttribute('allow', (allow ? (allow + '; ') : '') + 'fullscreen *');
              }
              // Sandbox fullscreen'i engelleyebiliyor; sadece video iframe'lerinde kaldır.
              if (f.hasAttribute('sandbox')) f.removeAttribute('sandbox');
            } catch (_e) { /* ignore */ }
          }
        };
        patchIframes();
        try {
          const obs = new MutationObserver(() => patchIframes());
          obs.observe(document.documentElement, { childList: true, subtree: true });
        } catch (_e) { /* ignore */ }

        // AGRESIF: Video iframe'ini "fake fullscreen" yap - CSS ile tüm sayfayı kaplasın
        let fakeFullscreenIframe = null;
        let originalStyles = null;

        const enterFakeFullscreen = (iframe) => {
          if (!iframe || fakeFullscreenIframe) return;
          
          try {
            fakeFullscreenIframe = iframe;
            originalStyles = {
              position: iframe.style.position,
              top: iframe.style.top,
              left: iframe.style.left,
              width: iframe.style.width,
              height: iframe.style.height,
              zIndex: iframe.style.zIndex,
              transform: iframe.style.transform
            };

            iframe.style.position = 'fixed';
            iframe.style.top = '0';
            iframe.style.left = '0';
            iframe.style.width = '100vw';
            iframe.style.height = '100vh';
            iframe.style.zIndex = '999999';
            iframe.style.transform = 'none';
            iframe.setAttribute('data-fake-fullscreen', 'true');
            
            document.body.style.overflow = 'hidden';
          } catch (_e) { /* ignore */ }
        };

        const exitFakeFullscreen = () => {
          if (!fakeFullscreenIframe || !originalStyles) return;
          
          try {
            fakeFullscreenIframe.removeAttribute('data-fake-fullscreen');
            fakeFullscreenIframe.style.position = originalStyles.position;
            fakeFullscreenIframe.style.top = originalStyles.top;
            fakeFullscreenIframe.style.left = originalStyles.left;
            fakeFullscreenIframe.style.width = originalStyles.width;
            fakeFullscreenIframe.style.height = originalStyles.height;
            fakeFullscreenIframe.style.zIndex = originalStyles.zIndex;
            fakeFullscreenIframe.style.transform = originalStyles.transform;
            
            document.body.style.overflow = '';
          } catch (_e) { /* ignore */ }
          
          fakeFullscreenIframe = null;
          originalStyles = null;
        };

        // Native fullscreen dene, başarısız olursa fake fullscreen
        const makeVideoFullscreen = () => {
          try {
            // 1) Önce native video fullscreen dene
            const videos = Array.from(document.querySelectorAll('video'));
            for (const vid of videos) {
              if (vid && vid.requestFullscreen && !document.fullscreenElement) {
                vid.requestFullscreen().then(() => {
                }).catch(() => {
                  tryFakeFullscreen();
                });
                return;
              }
            }
            
            // 2) Video bulunamadıysa direkt fake fullscreen
            tryFakeFullscreen();
          } catch (_e) { 
            tryFakeFullscreen();
          }
        };

        const tryFakeFullscreen = () => {
          // Video player içeren iframe'i bul
          const frames = Array.from(document.querySelectorAll('iframe'));
          for (const frame of frames) {
            const src = frame.src || '';
            // Video player iframe'lerini tespit et (rapidvid, voe, streamtape, etc)
            if (src.includes('rapidvid') || src.includes('streamtape') || 
                src.includes('voe') || src.includes('doodstream') ||
                src.includes('mixdrop') || src.includes('upstream') ||
                frame.offsetHeight > 300) { // veya yeterince büyük iframe
              enterFakeFullscreen(frame);
              return;
            }
          }
          // Hiç tespit edemediyse en büyük iframe'i al
          if (frames.length > 0) {
            const largest = frames.reduce((prev, curr) => 
              (curr.offsetHeight * curr.offsetWidth) > (prev.offsetHeight * prev.offsetWidth) ? curr : prev
            );
            enterFakeFullscreen(largest);
          }
        };

        // ESC ile fake fullscreen'den çık - WINDOW-LEVEL AGRESIF YAKALAMA
        let escPressed = false;
        const forceExitFullscreen = () => {
          
          // 1) data-fake-fullscreen attribute'lu iframe'leri bul
          const markedIframes = document.querySelectorAll('[data-fake-fullscreen="true"]');
          markedIframes.forEach((iframe, idx) => {
            iframe.removeAttribute('data-fake-fullscreen');
            iframe.style.cssText = '';
          });
          
          // 2) Tüm iframe'leri tara ve şüpheli olanları temizle
          const allIframes = document.querySelectorAll('iframe');
          let cleanedCount = 0;
          allIframes.forEach((iframe, idx) => {
            const pos = iframe.style.position;
            const z = iframe.style.zIndex;
            const w = iframe.style.width;
            
            if (pos === 'fixed' && parseInt(z) >= 999999 && w === '100vw') {
              iframe.removeAttribute('data-fake-fullscreen');
              iframe.style.position = '';
              iframe.style.top = '';
              iframe.style.left = '';
              iframe.style.width = '';
              iframe.style.height = '';
              iframe.style.zIndex = '';
              iframe.style.transform = '';
              cleanedCount++;
            }
          });
          
          // 3) fakeFullscreenIframe referansı varsa onu da temizle
          if (fakeFullscreenIframe) {
            exitFakeFullscreen();
            cleanedCount++;
          }
          
          document.body.style.overflow = '';
        };
        
        const handleEscape = (e) => {
          if (e.key === 'Escape' || e.keyCode === 27) {
            if (escPressed) return; // Debounce
            escPressed = true;
            setTimeout(() => { escPressed = false; }, 500);
            
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            
            forceExitFullscreen();
          }
          if (e.key === 'f' || e.key === 'F') {
            const active = document.activeElement;
            if (active && (active.tagName === 'VIDEO' || active.closest('iframe'))) {
              if (fakeFullscreenIframe) {
                exitFakeFullscreen();
              } else {
                makeVideoFullscreen();
              }
            }
          }
        };
        
        // ESC tuşunu CAPTURE phase'de yakala (iframe'den önce)
        document.addEventListener('keydown', handleEscape, true);
        document.addEventListener('keyup', handleEscape, true);
        window.addEventListener('keydown', handleEscape, true);
        window.addEventListener('keyup', handleEscape, true);
        
        // Her 200ms'de ESC tuşu kontrolü (polling fallback)
        setInterval(() => {
          // Fake fullscreen iframe'i kontrol et
          const allIframes = document.querySelectorAll('iframe');
          for (const iframe of allIframes) {
            if (iframe.style.position === 'fixed' && 
                iframe.style.zIndex === '999999' &&
                iframe.style.width === '100vw') {
              if (!iframe._escKeyHandler) {
                iframe._escKeyHandler = true;
                // Bu iframe'e odaklanıldığında ESC dinleyici ekle
                iframe.contentWindow?.addEventListener('keydown', handleEscape, true);
                iframe.contentWindow?.addEventListener('keyup', handleEscape, true);
              }
              if (!iframe._dblClickHandler) {
                iframe._dblClickHandler = (e) => {
                  if (e.detail === 2) {
                    handleEscape({ key: 'Escape', preventDefault: () => {}, stopPropagation: () => {}, stopImmediatePropagation: () => {} });
                  }
                };
                iframe.addEventListener('dblclick', iframe._dblClickHandler);
              }
            }
          }
        }, 200);

        // Native fullscreen'den çıkıldığında fake fullscreen da kapat
        document.addEventListener('fullscreenchange', () => {
          if (!document.fullscreenElement && fakeFullscreenIframe) {
            exitFakeFullscreen();
          }
        });

        // HER TIKLAMA için fullscreen dene (ultra-agresif)
        let clickCount = 0;
        document.addEventListener('click', (e) => {
          clickCount++;
          
          const el = e.target;
          if (!el) return;
          
          // Yaygın fullscreen button class/id pattern'leri
          const fullscreenPatterns = [
            'fullscreen', 'full-screen', 'fs-btn', 'maximize',
            'expand', 'vjs-fullscreen', 'plyr__fullscreen',
            'video-fullscreen', 'player-fullscreen', 'icon-fullscreen',
            'btn-fullscreen', 'full_screen', 'fullscreenicon'
          ];
          
          const classes = (el.className || '').toLowerCase();
          const id = (el.id || '').toLowerCase();
          const title = (el.title || '').toLowerCase();
          const aria = (el.getAttribute('aria-label') || '').toLowerCase();
          
          
          const isFullscreenBtn = fullscreenPatterns.some(p => 
            classes.includes(p) || id.includes(p) || title.includes(p) || aria.includes(p)
          );
          
          if (isFullscreenBtn) {
            setTimeout(() => {
              if (fakeFullscreenIframe) {
                exitFakeFullscreen();
              } else {
                makeVideoFullscreen();
              }
            }, 50);
          }
          
          // Fallback: iframe içinde herhangi bir tıklama olursa anında fullscreen
          setTimeout(() => {
            const iframes = document.querySelectorAll('iframe');
            for (const frame of iframes) {
              const rect = frame.getBoundingClientRect();
              const clickX = e.clientX;
              const clickY = e.clientY;
              if (clickX >= rect.left && clickX <= rect.right &&
                  clickY >= rect.top && clickY <= rect.bottom) {
                if (!fakeFullscreenIframe) {
                  makeVideoFullscreen();
                } else {
                }
                break;
              }
            }
          }, 100);
        }, true);
      })();
    `).catch(() => {});
  });

  // Setup find in page listener for main views
  view.webContents.on('found-in-page', (event, result) => {
    // This will be picked up by the main process
    // Event will bubble up automatically
  });

  // Context menu (sağ tık menüsü) - Resim indirme desteği
  view.webContents.on('context-menu', (event, params) => {
    const menuTemplate = [];

    // Eğer resim üzerinde sağ tık yapıldıysa
    if (params.mediaType === 'image') {
      menuTemplate.push({
        label: '🖼️ Resmi İndir',
        click: async () => {
          try {
            const imageUrl = params.srcURL;
            
            // Dosya adını URL'den çıkar
            let filename = 'image.png';
            try {
              const urlPath = new URL(imageUrl).pathname;
              const urlFilename = path.basename(urlPath);
              if (urlFilename && urlFilename.length > 0 && urlFilename.includes('.')) {
                filename = urlFilename;
              }
            } catch (_e) {
              // URL parse edilemezse varsayılan ismi kullan
            }

            // İndirme klasörünü al
            const downloadsPath = path.join(os.homedir(), 'Downloads');
            const savePath = path.join(downloadsPath, filename);

            // Resmi indir
            if (imageUrl.startsWith('data:')) {
              // Data URL ise base64'ü decode et
              const base64Data = imageUrl.split(',')[1];
              const buffer = Buffer.from(base64Data, 'base64');
              fs.writeFileSync(savePath, buffer);
              
              // Başarı bildirimi
              dialog.showMessageBox({
                type: 'info',
                title: 'İndirme Tamamlandı',
                message: `Resim indirildi:\n${filename}`,
                buttons: ['Tamam', 'Klasörü Aç']
              }).then(result => {
                if (result.response === 1) {
                  shell.showItemInFolder(savePath);
                }
              });
            } else {
              // HTTP/HTTPS URL ise indir
              const file = fs.createWriteStream(savePath);
              const protocol = imageUrl.startsWith('https:') ? https : require('http');
              
              protocol.get(imageUrl, (response) => {
                response.pipe(file);
                file.on('finish', () => {
                  file.close();
                  dialog.showMessageBox({
                    type: 'info',
                    title: 'İndirme Tamamlandı',
                    message: `Resim indirildi:\n${filename}`,
                    buttons: ['Tamam', 'Klasörü Aç']
                  }).then(result => {
                    if (result.response === 1) {
                      shell.showItemInFolder(savePath);
                    }
                  });
                });
              }).on('error', (err) => {
                fs.unlinkSync(savePath);
                dialog.showErrorBox('İndirme Hatası', `Resim indirilemedi: ${err.message}`);
              });
            }
          } catch (err) {
            dialog.showErrorBox('Hata', `Resim indirilemedi: ${err.message}`);
          }
        }
      });

      menuTemplate.push({
        label: '🔗 Resim Adresini Kopyala',
        click: () => {
          require('electron').clipboard.writeText(params.srcURL);
        }
      });

      menuTemplate.push({ type: 'separator' });
    }

    // Link üzerinde ise
    if (params.linkURL) {
      menuTemplate.push({
        label: '🔗 Bağlantıyı Kopyala',
        click: () => {
          require('electron').clipboard.writeText(params.linkURL);
        }
      });
      menuTemplate.push({ type: 'separator' });
    }

    // Seçili metin varsa
    if (params.selectionText) {
      menuTemplate.push({
        label: '📋 Kopyala',
        role: 'copy'
      });
      menuTemplate.push({ type: 'separator' });
    }

    // Genel menü öğeleri
    menuTemplate.push({
      label: '◀ Geri',
      enabled: view.webContents.canGoBack(),
      click: () => view.webContents.goBack()
    });

    menuTemplate.push({
      label: '▶ İleri',
      enabled: view.webContents.canGoForward(),
      click: () => view.webContents.goForward()
    });

    menuTemplate.push({
      label: '⟳ Yenile',
      click: () => view.webContents.reload()
    });

    // Menüyü göster
    if (menuTemplate.length > 0) {
      const menu = Menu.buildFromTemplate(menuTemplate);
      menu.popup();
    }
  });
  
  return view;
}

module.exports = { createBrowserView };
