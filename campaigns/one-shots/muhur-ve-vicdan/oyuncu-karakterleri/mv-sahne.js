/* ══════════════════════════════════════════════════════════════════
   MÜHÜR VE VİCDAN — KARAKTER SAHNE MOTORU
   Karakter sayfalarındaki iki WebGL katmanını kurar:

   • MVSahne.atmosfer({...})  Sayfanın arkasında sürekli dönen tam ekran shader
                              (içeriğin altında, arkaplan görselinin üstünde).
   • MVSahne.sinematik({...}) Sayfa açılınca oynayan kısa tam ekran sahne.
                              Başlığa (h1) tıklayınca yeniden oynar; Geç / Esc / tıklama ile atlanır.

   Her sayfa kendi fragment shader'ını verir; motor ortak GLSL yardımcılarını
   (gürültü, fbm, doku yerleştirme, yazı dokusu) başa ekler, dokuları yükler,
   çözünürlüğü kare süresine göre ayarlar ve sekme gizlenince durur.

   Ortak uniform'lar:
     uRes (canvas px) · uScale (canvas px / CSS px) · uView (CSS px) · uT (sn)
     uMouse (0–1, sol üst) · uText (yazı dokusu: r net, g yakın hâle, b geniş hâle)
     uTextBox (yazının CSS px kutusu) · <doku>Size (her dokunun piksel boyutu)
   Koordinat: PX() → CSS piksel, sol üst köşe orijin. Dokularda v=0 üst satırdır.
   ══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const PRE = `
precision highp float;
uniform vec2 uRes, uView, uMouse;
uniform float uScale, uT;
uniform sampler2D uText;
uniform vec4 uTextBox, uSubBox;
float h(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float n(vec2 p){ vec2 i=floor(p), f=fract(p), u=f*f*(3.-2.*f);
  return mix(mix(h(i),h(i+vec2(1,0)),u.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x), u.y); }
const mat2 RM = mat2(1.6,1.2,-1.2,1.6);
float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<5;i++){ v+=a*n(p); p=RM*p; a*=.5; } return v; }
float fbm3(vec2 p){ float v=0., a=.5; for(int i=0;i<3;i++){ v+=a*n(p); p=RM*p; a*=.5; } return v; }
vec2 PX(){ return vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uScale; }
/* px'i, merkezi c ve yüksekliği hg olan dokunun uv'sine çevirir */
vec2 placeUV(vec2 px, vec2 c, float hg, vec2 ts){ return (px - c) / vec2(ts.x/ts.y*hg, hg) + .5; }
/* ekranı "cover" ile dolduran doku uv'si */
vec2 coverUV(vec2 px, vec2 ts){ float s = max(uView.x/ts.x, uView.y/ts.y); return (px - uView*.5)/(ts*s) + .5; }
float inBox(vec2 uv){ return step(0.,uv.x)*step(uv.x,1.)*step(0.,uv.y)*step(uv.y,1.); }
vec3 textAt(vec2 px){ return texture2D(uText, px/uView).rgb; }
float grain(vec2 px, float t){ return h(px + fract(t*7.)*91.) - .5; }
/* ── 2.5D KAMERA ──
   Tek bir görseli, derinlik haritasıyla (beyaz = yakın) sahte 3B kamera hareketiyle çizer.
   Derinlik haritası .claude/araclar/derinlik/derinlik.py ile üretilir ("<ad> Derinlik.webp").
   uv   : görselin uv'si (0–1)
   cam  : kamera kayması, uv cinsinden (ör. vec2(sin(t), cos(t)) * .02). Yakın katmanlar ters yöne,
          uzaklar kameranın yönüne kayar; derinliği 0.5 olan düzlem sabit kalır.
   Işın yürütme (parallax occlusion): yakın nesneler arkadakini doğru şekilde örter. */
vec2 derinlikUV(sampler2D dep, vec2 uv, vec2 cam){
  const float N = 28.;
  vec2 stepv = cam / N;
  vec2 p = uv + cam * .5;
  float ld = 1., hp = texture2D(dep, p).r, pl = ld, ph = hp;
  for (int i = 0; i < 28; i++) {
    if (hp >= ld) break;
    pl = ld; ph = hp;
    p -= stepv; ld -= 1. / N;
    hp = texture2D(dep, p).r;
  }
  // son iki katman arasında doğrusal ara değer: kademelenmeyi giderir
  float a = hp - ld, b = ph - pl;
  float k = clamp(a / (a - b + 1e-5), 0., 1.);
  return p + stepv * k;
}
/* Catmull-Rom bikübik örnekleme (9 doku okuması): büyütülmüş görselde bilinear'dan çok daha net. ts = doku boyutu (px) */
vec4 bikubik(sampler2D img, vec2 uv, vec2 ts){
  vec2 sp = uv * ts, t1 = floor(sp - .5) + .5, f = sp - t1;
  vec2 w0 = f * (-.5 + f * (1. - .5 * f)), w1 = 1. + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (.5 + f * (2. - 1.5 * f)), w3 = f * f * (-.5 + .5 * f);
  vec2 w12 = w1 + w2, t12 = (t1 + w2 / w12) / ts, t0 = (t1 - 1.) / ts, t3 = (t1 + 2.) / ts;
  return texture2D(img, vec2(t0.x, t0.y)) * w0.x * w0.y + texture2D(img, vec2(t12.x, t0.y)) * w12.x * w0.y + texture2D(img, vec2(t3.x, t0.y)) * w3.x * w0.y
       + texture2D(img, vec2(t0.x, t12.y)) * w0.x * w12.y + texture2D(img, t12) * w12.x * w12.y + texture2D(img, vec2(t3.x, t12.y)) * w3.x * w12.y
       + texture2D(img, vec2(t0.x, t3.y)) * w0.x * w3.y + texture2D(img, vec2(t12.x, t3.y)) * w12.x * w3.y + texture2D(img, t3) * w3.x * w3.y;
}
/* Derinliğe göre alan derinliği (odak).
   odak    = netlenen derinlik (0–1); odağın ±0.08'i tamamen nettir (özne asla bulanmaz)
   bulanik = en büyük yarıçap (uv, yatay); ts = görselin piksel boyutu
   keskin  = netlikteki hafif keskinleştirme miktarı (0 = yok; büyütülmüş çekimlerde ~.5)
   Bulanıklık 12 noktalı altın açı sarmalıyla alınır; öndeki nesneler arka bulanıklığa sızmaz. */
vec4 derinlik25(sampler2D img, sampler2D dep, vec2 uv, vec2 cam, float odak, float bulanik, vec2 ts, float keskin){
  vec2 q = derinlikUV(dep, uv, cam);
  vec4 c0 = bikubik(img, q, ts);
  float d0 = texture2D(dep, q).r;
  float r = max(0., abs(d0 - odak) - .08) * bulanik;
  if (r < .0004) {
    if (keskin <= 0.) return c0;
    vec2 e = 1. / ts;
    vec4 b = (texture2D(img, q + vec2(e.x, 0.)) + texture2D(img, q - vec2(e.x, 0.)) + texture2D(img, q + vec2(0., e.y)) + texture2D(img, q - vec2(0., e.y))) * .25;
    return c0 + (c0 - b) * keskin;
  }
  vec4 acc = c0; float ws = 1.;
  for (int i = 0; i < 12; i++) {
    float fi = float(i), an = fi * 2.39996, rr = r * sqrt((fi + .5) / 12.);
    vec2 o = vec2(cos(an), sin(an) * ts.x / ts.y) * rr;
    float w = step(texture2D(dep, q + o).r, d0 + .1);
    acc += texture2D(img, q + o) * w; ws += w;
  }
  return acc / ws;
}
`;

  const VS = 'attribute vec2 p; void main(){ gl_Position = vec4(p,0.,1.); }';

  /* ── Ortak CSS ── */
  const css = document.createElement('style');
  css.textContent = `
    .mv-atmosfer { position: fixed; inset: 0; width: 100%; height: 100%; display: block;
      pointer-events: none; z-index: 0; opacity: 0; transition: opacity 1.6s ease; }
    .mv-atmosfer.on { opacity: 1; }
    .mv-sinematik { position: fixed; inset: 0; z-index: 5000; background: #000;
      cursor: pointer; opacity: 1; transition: opacity .9s ease; -webkit-tap-highlight-color: transparent; }
    .mv-sinematik.bitiyor { opacity: 0; pointer-events: none; }
    .mv-sinematik canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
    .mv-sin-gec { position: absolute; top: 18px; right: 22px; z-index: 2;
      font-family: 'Cinzel', serif; font-size: .7rem; letter-spacing: 3px; text-transform: uppercase;
      color: rgba(230,220,198,.45); background: none; border: 1px solid rgba(230,220,198,.18);
      padding: .45rem .9rem; cursor: pointer; transition: color .2s, border-color .2s; }
    .mv-sin-gec:hover { color: rgba(230,220,198,.9); border-color: rgba(196,58,44,.6); }
    .mv-tetik { cursor: pointer; }
    body.mv-sin-acik #fluid { opacity: 0; }   /* sıvı imleç sahnenin üstüne binmesin */
  `;
  document.head.appendChild(css);
  /* sinematik yazısının fontu */
  const fl = document.createElement('link'); fl.rel = 'stylesheet';
  fl.href = 'https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@900&display=swap';
  document.head.appendChild(fl);

  /* ── GL kurulum ── */
  function build(canvas, fs, textures) {
    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!gl) return null;
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, PRE + fs));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    gl.useProgram(pr);
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const L = {};
    const U = name => (name in L ? L[name] : (L[name] = gl.getUniformLocation(pr, name)));
    const set = (name, ...v) => {
      const l = U(name); if (!l) return;
      if (v[0] && v[0].length) { const a = v[0]; (a.length % 4 === 0 ? gl.uniform4fv : gl.uniform2fv).call(gl, l, a); return; }
      [, gl.uniform1f, gl.uniform2f, gl.uniform3f, gl.uniform4f][v.length].call(gl, l, ...v);
    };

    function newTex(unit) {
      const tx = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tx);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
      return tx;
    }
    function upload(unit, tx, src) {
      gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tx);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    }

    const textTx = newTex(0);
    gl.uniform1i(U('uText'), 0);
    /* .mp4 dokular gerçek VFX çekimidir: sessiz, döngülü <video>; her karede dokuya yüklenir */
    const videos = [];
    const loads = Object.entries(textures || {}).map(([name, src], i) => new Promise(res => {
      const unit = i + 1, tx = newTex(unit);
      gl.uniform1i(U(name), unit);
      if (/\.mp4$/i.test(src)) {
        const v = document.createElement('video');
        v.src = src; v.muted = true; v.loop = true; v.playsInline = true; v.preload = 'auto';
        v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
        v.addEventListener('loadeddata', () => { set(name + 'Size', v.videoWidth, v.videoHeight); res(true); }, { once: true });
        v.addEventListener('error', () => { console.warn('Video yüklenemedi:', src); res(false); }, { once: true });
        const o = { v, unit, tx, yeni: true, son: -1 };
        if (v.requestVideoFrameCallback) { const cb = () => { o.yeni = true; v.requestVideoFrameCallback(cb); }; v.requestVideoFrameCallback(cb); }
        videos.push(o);
        return;
      }
      const img = new Image();
      img.onload = () => { upload(unit, tx, img); set(name + 'Size', img.naturalWidth, img.naturalHeight); res(true); };
      img.onerror = () => { console.warn('Doku yüklenemedi:', src); res(false); };
      img.src = src;
    }));
    return {
      gl, set, ready: Promise.all(loads), uploadText: c => upload(0, textTx, c),
      tick() {
        videos.forEach(o => {
          if (o.v.readyState < 2 || !o.v.videoWidth) return;
          // video ~30 fps; ekran 60–165 Hz. Aynı kareyi tekrar tekrar GPU'ya yüklemeyelim
          const yeni = o.v.requestVideoFrameCallback ? o.yeni : o.v.currentTime !== o.son;
          if (!yeni) return;
          o.yeni = false; o.son = o.v.currentTime; upload(o.unit, o.tx, o.v);
        });
      },
      playVideos(from) { videos.forEach(o => { try { if (from != null) o.v.currentTime = from; } catch (e) {} o.v.play().catch(() => {}); }); },
      pauseVideos() { videos.forEach(o => o.v.pause()); },
    };
  }

  /* ── Döngü: çözünürlük ayarı, görünürlük, fare ── */
  const mouse = [.5, .5];
  addEventListener('pointermove', e => { mouse[0] = e.clientX / innerWidth; mouse[1] = e.clientY / innerHeight; }, { passive: true });

  /* clock(t): sahnenin saatini dışarıdan vermek için (ör. müziğin currentTime'ı). Sayı dönerse zaman
     ona eşitlenir ve oradan akmaya devam eder; null dönerse kendi saatiyle sürer. */
  function loop(canvas, g, baseScale, onFrame, clock) {
    let raf = 0, t0 = 0, last = 0, slow = 0, frames = 0, scale = baseScale, running = false, W = 0, H = 0;
    const minScale = baseScale * .35;
    function resize() {
      W = innerWidth; H = innerHeight;
      const w = Math.max(1, Math.floor(W * scale)), hh = Math.max(1, Math.floor(H * scale));
      if (canvas.width !== w || canvas.height !== hh) { canvas.width = w; canvas.height = hh; g.gl.viewport(0, 0, w, hh); }
    }
    function frame(now) {
      raf = 0; if (!running) return;
      // 120–165 Hz ekranlarda her kareyi çizmek GPU'yu boşuna iki-üç kat yorar; ~60 fps yeter
      if (t0 && now - last < 12.5) { if (!document.hidden) raf = requestAnimationFrame(frame); return; }
      if (!t0) t0 = last = now;
      const dt = now - last; last = now;
      // zayıf ekran kartında çözünürlük hızla düşer: üst üste 4 yavaş karede, kare süresine göre
      // (maliyet ~ piksel sayısı ~ ölçek²). Düşürmeden sonra GPU kuyruğu boşalsın diye 8 kare beklenir.
      // İlk 8 kare (yükleme takılmaları) ve sekme dönüşü gibi uzun boşluklar sayılmaz.
      if (++frames > 8 && dt < 250) {
        if (dt > 24) {
          if (++slow >= 4 && scale > minScale) { scale = Math.max(minScale, scale * Math.max(.6, Math.sqrt(15 / dt))); slow = -8; }
        } else if (slow > 0) slow = 0; else if (slow < 0) slow++;
      }
      resize();
      let t = (now - t0) / 1000;
      if (clock) { const c = clock(t); if (c != null && isFinite(c)) { t0 = now - c * 1000; t = c; } }
      g.set('uRes', g.gl.canvas.width, g.gl.canvas.height);
      g.set('uView', W, H);
      g.set('uScale', g.gl.canvas.width / W);
      g.set('uT', t);
      g.set('uMouse', mouse[0], mouse[1]);
      const keep = onFrame(t, W, H);
      g.tick();
      g.gl.drawArrays(g.gl.TRIANGLE_STRIP, 0, 4);
      if (keep !== false && !document.hidden) raf = requestAnimationFrame(frame);
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden && running && !raf) { last = 0; raf = requestAnimationFrame(f => { last = f; frame(f); }); } });
    return {
      start() { running = true; t0 = 0; frames = 0; slow = 0; scale = baseScale; resize(); if (!raf) raf = requestAnimationFrame(frame); },
      resume() { if (!running) { running = true; if (!raf) raf = requestAnimationFrame(frame); } },
      pause() { running = false; cancelAnimationFrame(raf); raf = 0; },
      size: () => [W, H],
      resize,
    };
  }

  const atmosferler = [];

  /* ── ATMOSFER ── */
  function atmosfer(opt) {
    const cv = document.createElement('canvas');
    cv.className = 'mv-atmosfer'; cv.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(cv, document.body.firstChild);
    let g;
    try { g = build(cv, opt.fs, opt.textures); } catch (e) { console.warn('Atmosfer kurulamadı:', e); cv.remove(); return null; }
    if (!g) { cv.remove(); return null; }
    const lp = loop(cv, g, Math.min(devicePixelRatio || 1, 1) * (opt.olcek || .75), (t, W, H) => {
      if (opt.kare) opt.kare(reduce ? 6 : t, g.set, W, H);
      if (reduce) g.set('uT', 6);
      return !reduce;
    });
    const api = { pause: lp.pause, resume: lp.resume, ready: g.ready };
    g.ready.then(() => { cv.classList.add('on'); if (!api.held) lp.start(); });
    atmosferler.push(api);
    return api;
  }

  /* ── SİNEMATİK ── */
  function sinematik(opt) {
    if (reduce) return null;
    const ov = document.createElement('div');
    ov.className = 'mv-sinematik';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', (opt.baslik || '') + ' — açılış sahnesi');
    const cv = document.createElement('canvas');
    const gec = document.createElement('button');
    gec.className = 'mv-sin-gec'; gec.type = 'button'; gec.textContent = 'Geç ›';
    ov.append(cv, gec);
    document.body.appendChild(ov);
    let g;
    try { g = build(cv, opt.fs, opt.textures); } catch (e) { console.warn('Sinematik kurulamadı:', e); ov.remove(); return null; }
    if (!g) { ov.remove(); return null; }

    const SURE = opt.sure || 6;
    const textCv = document.createElement('canvas'), tc = textCv.getContext('2d');
    let playing = false, endTimer = 0;

    /* Yazı dokusu: kırmızı = net yazı, yeşil = yakın hâle, mavi = geniş hâle.
       Hâleler gölge hilesiyle çizilir: yazı ekran dışına, gölgesi yerine düşer. */
    function drawText(W, H) {
      textCv.width = W; textCv.height = H;
      const txt = (opt.baslik || '').toLocaleUpperCase('tr');
      const fs = Math.min(Math.max(30, W * (opt.yaziOrani || .075)), 96);
      tc.fillStyle = '#000'; tc.fillRect(0, 0, W, H);
      tc.font = `900 ${fs}px "Cinzel Decorative", Cinzel, Georgia, serif`;
      tc.textAlign = 'center'; tc.textBaseline = 'middle';
      if ('letterSpacing' in tc) tc.letterSpacing = Math.round(fs * .12) + 'px';
      const words = txt.split(' '), rows = []; let cur = '';
      words.forEach(w => { const tl = cur ? cur + ' ' + w : w; if (tc.measureText(tl).width > W * .86 && cur) { rows.push(cur); cur = w; } else cur = tl; });
      rows.push(cur);
      const lh = fs * 1.2, cy = H * (opt.yaziY || .5), top = cy - (rows.length - 1) * lh / 2;
      let bw = 0; rows.forEach(r => { bw = Math.max(bw, tc.measureText(r).width); });
      g.set('uTextBox', W / 2 - bw / 2, top - lh / 2, bw, rows.length * lh);
      // alt başlık (isteğe bağlı): başlığın altında, daha küçük ve aralıklı harflerle
      const sub = (opt.altBaslik || '').toUpperCase(), fsub = Math.max(13, fs * .26);
      const subY = top + (rows.length - 1) * lh + lh * .5 + fsub * 1.4;
      tc.globalCompositeOperation = 'lighter';
      const SH = 10000;
      [['#0000ff', fs * .55], ['#00ff00', fs * .16]].forEach(([c, b]) => {
        tc.shadowColor = c; tc.shadowBlur = b; tc.shadowOffsetX = SH; tc.fillStyle = c;
        rows.forEach((r, i) => tc.fillText(r, W / 2 - SH, top + i * lh));
      });
      tc.shadowColor = 'transparent'; tc.shadowBlur = 0; tc.shadowOffsetX = 0;
      tc.fillStyle = '#ff0000';
      rows.forEach((r, i) => tc.fillText(r, W / 2, top + i * lh));
      if (sub) {
        tc.font = `700 ${fsub}px Cinzel, Georgia, serif`;
        if ('letterSpacing' in tc) tc.letterSpacing = Math.round(fsub * .38) + 'px';
        const sw = tc.measureText(sub).width;
        g.set('uSubBox', W / 2 - sw / 2, subY - fsub * .7, sw, fsub * 1.4);
        [['#0000ff', fsub * .6], ['#00ff00', fsub * .2]].forEach(([c, b]) => {
          tc.shadowColor = c; tc.shadowBlur = b; tc.shadowOffsetX = SH; tc.fillStyle = c;
          tc.fillText(sub, W / 2 - SH, subY);
        });
        tc.shadowColor = 'transparent'; tc.shadowBlur = 0; tc.shadowOffsetX = 0;
        tc.fillStyle = '#ff0000'; tc.fillText(sub, W / 2, subY);
      }
      tc.globalCompositeOperation = 'source-over';
      g.uploadText(textCv);
    }

    const lp = loop(cv, g, Math.min(devicePixelRatio || 1, opt.cozunurluk || 1), (t) => {
      if (opt.kare) opt.kare(t, g.set);
      g.set('uDur', SURE);
      if (t >= SURE - .9 && playing) end();
      return t < SURE + 1;
    }, opt.saat ? (t) => (playing ? opt.saat(t) : null) : null);

    function end() {
      if (!playing) return;
      playing = false;
      ov.classList.add('bitiyor');
      clearTimeout(endTimer);
      endTimer = setTimeout(() => {
        lp.pause(); g.pauseVideos(); ov.style.display = 'none';
        document.body.style.overflow = '';
        document.body.classList.remove('mv-sin-acik');
        atmosferler.forEach(a => { a.held = false; a.resume(); });
        if (opt.bitis) opt.bitis();
      }, 900);
    }
    async function play() {
      if (playing) return;
      clearTimeout(endTimer);
      ov.style.display = ''; ov.classList.remove('bitiyor');
      document.body.style.overflow = 'hidden';
      document.body.classList.add('mv-sin-acik');
      atmosferler.forEach(a => { a.held = true; a.pause(); });
      playing = true;
      const ok = await Promise.race([g.ready, new Promise(r => setTimeout(() => r('zaman'), 5000))]);
      if (ok === 'zaman') { console.warn('Sinematik dokuları zamanında yüklenmedi'); end(); return; }
      if (document.fonts && document.fonts.load) { try { await document.fonts.load('900 40px "Cinzel Decorative"'); } catch (e) {} }
      lp.resize(); drawText(...lp.size());
      if (opt.basla) opt.basla();
      g.playVideos(0);
      lp.start();
      ov.focus({ preventScroll: true });
    }
    const onResize = () => { if (playing) { lp.resize(); drawText(...lp.size()); } };
    addEventListener('resize', onResize);
    ov.tabIndex = 0;
    ov.addEventListener('click', end);
    gec.addEventListener('click', e => { e.stopPropagation(); end(); });
    addEventListener('keydown', e => { if (e.key === 'Escape' && playing) end(); });

    if (opt.tetik) {
      opt.tetik.classList.add('mv-tetik');
      opt.tetik.title = 'Sahneyi yeniden oynat';
      opt.tetik.addEventListener('click', play);
    }
    play();
    return { play, end };
  }

  /* ── SES EFEKTLERİ ──
     MVSahne.sesler({ ad: 'dosya.mp3', ... }) → { cal(ad, gain), zamanla([[sn, ad, gain], ...]), durdur() }
     Dosyalar hemen indirilir; ses bağlamı ancak sayfada bir etkileşim olunca açılır (tarayıcı kuralı).
     Etkileşim sinematik sırasında gelirse, zamanı henüz gelmemiş sesler yine çalar. */
  function sesler(map) {
    let ac = null, timers = [];
    const raw = {}, buf = {};
    Object.entries(map).forEach(([k, u]) => { raw[k] = fetch(u).then(r => r.arrayBuffer()).catch(() => null); });
    function ensure() {
      if (ac) return true;
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return false; }
      Object.entries(raw).forEach(([k, p]) => p.then(b => b && ac.decodeAudioData(b.slice(0))).then(d => { if (d) buf[k] = d; }).catch(() => {}));
      document.addEventListener('visibilitychange', () => { if (document.hidden) ac.suspend(); else ac.resume(); });
      return true;
    }
    const unlock = () => { if (ensure() && ac.state === 'suspended') ac.resume(); };
    ['pointerdown', 'keydown', 'touchstart'].forEach(ev => addEventListener(ev, unlock, true));
    if (!navigator.userActivation || navigator.userActivation.hasBeenActive) ensure();
    function cal(k, g) {
      if (!ac || ac.state !== 'running' || !buf[k]) return;
      const s = ac.createBufferSource(), gn = ac.createGain();
      s.buffer = buf[k]; gn.gain.value = g == null ? 1 : g;
      s.connect(gn); gn.connect(ac.destination); s.start();
    }
    return {
      cal,
      zamanla(list) { this.durdur(); timers = list.map(([sn, k, g]) => setTimeout(() => cal(k, g), sn * 1000)); },
      durdur() { timers.forEach(clearTimeout); timers = []; },
    };
  }

  window.MVSahne = { atmosfer, sinematik, sesler, reduce };
})();
