/* ==========================================================================
   NyxFocus — script.js
   Saf ES6+ · harici kütüphane yok · modüler yapı (tek dosya, IIFE kapsamı)
   ========================================================================== */
(() => {
  'use strict';

  /* ------------------------------------------------------------------------
     1) Yardımcılar
     ------------------------------------------------------------------------ */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const reducedMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const PROP_ATTRS = new Set(['checked', 'disabled', 'value', 'hidden']);

  /** Küçük DOM üreticisi: h('div', {class:'x', onclick(){}}, 'metin', altEleman) */
  function h(tag, props = {}, ...children) {
    const el = document.createElement(tag);
    for (const [key, val] of Object.entries(props)) {
      if (val === null || val === undefined || val === false) continue;
      if (key === 'class') el.className = val;
      else if (key === 'dataset') Object.assign(el.dataset, val);
      else if (key.startsWith('on') && typeof val === 'function') el.addEventListener(key.slice(2), val);
      else if (PROP_ATTRS.has(key)) el[key] = val;
      else el.setAttribute(key, val === true ? '' : String(val));
    }
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false) continue;
      el.append(child.nodeType ? child : document.createTextNode(String(child)));
    }
    return el;
  }

  /** Sprite içindeki simgeyi kullanan SVG üretir */
  function icon(name, cls = 'icon') {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', cls);
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    const use = document.createElementNS(SVG_NS, 'use');
    use.setAttribute('href', '#i-' + name);
    svg.append(use);
    return svg;
  }

  /** Düğmenin simgesini ve (varsa) etiketini değiştirir */
  function setBtn(btn, iconName, label) {
    const use = $('use', btn);
    if (use && iconName) use.setAttribute('href', '#i-' + iconName);
    if (label !== undefined) {
      const span = $('span', btn);
      if (span) span.textContent = label;
    }
  }

  /** Saniyeyi MM:SS veya SS:DD:SS biçimine çevirir (sabit genişlik) */
  function fmtClock(totalSecs, withHours = false) {
    const s = Math.max(0, Math.floor(totalSecs));
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    return withHours ? `${pad(hh)}:${pad(mm)}:${pad(ss)}` : `${pad(hh * 60 + mm)}:${pad(ss)}`;
  }

  /** Ekran okuyucu için doğal Türkçe süre ("1 saat 5 dakika") */
  function fmtSpoken(totalSecs) {
    const s = Math.max(0, Math.round(totalSecs));
    const parts = [];
    const hh = Math.floor(s / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
    if (hh) parts.push(`${hh} saat`);
    if (mm) parts.push(`${mm} dakika`);
    if (ss || !parts.length) parts.push(`${ss} saniye`);
    return parts.join(' ');
  }

  /** Küçük olay yayıncısı */
  const Bus = {
    map: new Map(),
    on(evt, fn) { (this.map.get(evt) || this.map.set(evt, []).get(evt)).push(fn); },
    emit(evt, ...args) { (this.map.get(evt) || []).forEach((fn) => { try { fn(...args); } catch (e) { console.error(e); } }); },
  };

  /* ------------------------------------------------------------------------
     2) Depolama (localStorage, hata korumalı)
     ------------------------------------------------------------------------ */
  const Store = {
    prefix: 'nyxfocus.',
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(this.prefix + key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (e) {
        return fallback;
      }
    },
    /** Başarılıysa true, kota/erişim hatasında false döner */
    set(key, value) {
      try {
        localStorage.setItem(this.prefix + key, JSON.stringify(value));
        return true;
      } catch (e) {
        console.warn('NyxFocus: kayıt başarısız', key, e);
        return false;
      }
    },
  };

  /* ------------------------------------------------------------------------
     3) Ayarlar
     ------------------------------------------------------------------------ */
  const DEFAULT_SOUND = 'builtin-crystal';
  const Settings = {
    defaults: {
      focus: 25, short: 5, long: 15, longEvery: 4, autoStart: false,
      soundId: DEFAULT_SOUND, volume: 80,
      noiseVol: { white: 40, brown: 50, pink: 40 },
    },
    data: {},
    init() {
      const saved = Store.get('settings', {});
      const d = this.defaults;
      const int = (v, min, max, fb) => (Number.isFinite(+v) ? clamp(Math.round(+v), min, max) : fb);
      const nv = saved && typeof saved.noiseVol === 'object' && saved.noiseVol ? saved.noiseVol : {};
      this.data = {
        focus: int(saved.focus, 1, 180, d.focus),
        short: int(saved.short, 1, 60, d.short),
        long: int(saved.long, 1, 120, d.long),
        longEvery: int(saved.longEvery, 2, 8, d.longEvery),
        autoStart: !!saved.autoStart,
        soundId: typeof saved.soundId === 'string' ? saved.soundId : d.soundId,
        volume: int(saved.volume, 0, 100, d.volume),
        noiseVol: {
          white: int(nv.white, 0, 100, d.noiseVol.white),
          brown: int(nv.brown, 0, 100, d.noiseVol.brown),
          pink: int(nv.pink, 0, 100, d.noiseVol.pink),
        },
      };
    },
    get(key) { return this.data[key]; },
    set(key, value) {
      this.data[key] = value;
      Store.set('settings', this.data);
      Bus.emit('settings', key);
    },
    save() { Store.set('settings', this.data); },
  };

  /* ------------------------------------------------------------------------
     4) Ekran okuyucu duyuruları, Toast, Başlık, Favicon
     ------------------------------------------------------------------------ */
  const Announcer = {
    el: null,
    say(text) {
      if (!this.el) this.el = $('#sr-live');
      if (!this.el) return;
      this.el.textContent = '';
      setTimeout(() => { this.el.textContent = text; }, 40);
    },
  };

  const Toast = {
    root: null,
    max: 4,
    show({ title, message = '', type = 'info', sticky = false, timeout = 6500 }) {
      if (!this.root) this.root = $('#toasts');
      const iconName = { success: 'check', warn: 'bell', error: 'x', info: 'info' }[type] || 'info';
      const el = h('div', { class: `toast toast-${type}`, role: type === 'error' ? 'alert' : 'status' },
        h('span', { class: 'toast-icon' }, icon(iconName)),
        h('div', { class: 'toast-body' },
          h('strong', { class: 'toast-title' }, title),
          message ? h('span', { class: 'toast-msg' }, message) : null),
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Bildirimi kapat', onclick: () => dismiss() }, icon('x')));
      let timer = 0;
      let gone = false;
      const dismiss = () => {
        if (gone) return;
        gone = true;
        clearTimeout(timer);
        el.classList.add('is-leaving');
        setTimeout(() => el.remove(), 320);
      };
      this.root.append(el);
      while (this.root.children.length > this.max) this.root.firstElementChild.remove();
      if (!sticky) timer = setTimeout(dismiss, timeout);
      return dismiss;
    },
    info(title, message) { return this.show({ title, message, type: 'info' }); },
    success(title, message) { return this.show({ title, message, type: 'success' }); },
    warn(title, message) { return this.show({ title, message, type: 'warn' }); },
    error(title, message) { return this.show({ title, message, type: 'error', timeout: 9000 }); },
  };

  const Favicon = {
    set(color) {
      const link = $('#favicon');
      if (!link) return;
      const svg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='-4 -4 32 32'><rect x='-4' y='-4' width='32' height='32' rx='9' fill='#07080C'/>" +
        "<path d='M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z' fill='none' stroke='" + color + "' stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'/></svg>";
      link.href = 'data:image/svg+xml,' + encodeURIComponent(svg);
    },
  };

  const Title = {
    base: 'NyxFocus',
    live: {},
    setBase(t) { this.base = t; this.update(); },
    setLive(key, text) { if (text) this.live[key] = text; else delete this.live[key]; this.update(); },
    update() {
      const live = this.live.pomodoro || this.live.timer;
      document.title = live ? `${live} — NyxFocus` : this.base;
    },
  };

  /* ------------------------------------------------------------------------
     5) Bildirimler (Notification API)
     ------------------------------------------------------------------------ */
  const Notifier = {
    supported: 'Notification' in window,
    _icon: undefined,

    get permission() { return this.supported ? Notification.permission : 'unsupported'; },

    /** İzin 'default' ise tarayıcı iznini ister. Kullanıcı hareketi içinde çağrılmalı. */
    ensurePermission() {
      if (!this.supported) return Promise.resolve('unsupported');
      if (Notification.permission !== 'default') return Promise.resolve(Notification.permission);
      return new Promise((resolve) => {
        const done = (res) => { Bus.emit('permission', res); resolve(res); };
        try {
          const ret = Notification.requestPermission(done);
          if (ret && typeof ret.then === 'function') ret.then(done, () => done(Notification.permission));
        } catch (e) {
          done(Notification.permission);
        }
      });
    },

    iconURL() {
      if (this._icon !== undefined) return this._icon;
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 192;
        const x = c.getContext('2d');
        x.fillStyle = '#07080C';
        x.fillRect(0, 0, 192, 192);
        x.translate(24, 24);
        x.scale(6, 6);
        x.lineWidth = 1.75; x.lineCap = 'round'; x.lineJoin = 'round';
        x.strokeStyle = '#E2C799';
        x.stroke(new Path2D('M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z'));
        this._icon = c.toDataURL('image/png');
      } catch (e) {
        this._icon = '';
      }
      return this._icon;
    },

    send(title, body, { tag } = {}) {
      if (!this.supported || Notification.permission !== 'granted') return null;
      try {
        const opts = { body, tag, silent: true, lang: 'tr' };
        const icon = this.iconURL();
        if (icon) opts.icon = icon;
        const n = new Notification(title, opts);
        n.onclick = () => { window.focus(); n.close(); };
        return n;
      } catch (e) {
        // Bazı mobil tarayıcılar yapıcıyı desteklemez; ekran içi bildirim yeterli olur.
        return null;
      }
    },
  };

  /* ------------------------------------------------------------------------
     6) Ses motoru: Web Audio ile üretilen bildirim sesleri, medya, gürültüler
     ------------------------------------------------------------------------ */
  function partial(ctx, dest, t, { freq, peak = 0.2, attack = 0.008, decay = 2, type = 'sine' }) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(t);
    osc.stop(t + attack + decay + 0.05);
  }

  /** Her sentezleyici toplam süreyi (sn) döndürür */
  const SYNTHS = {
    // Kristal Çan: yüksek, berrak, birbirini izleyen üç vuruş
    crystal(ctx, out, t) {
      [[1318.51, 0], [1975.53, 0.17], [2637.02, 0.36]].forEach(([f, d], i) => {
        const dur = 2.6 - i * 0.3;
        [[1, 1], [2.756, 0.26], [5.404, 0.09]].forEach(([ratio, amp], k) => {
          partial(ctx, out, t + d, { freq: f * ratio, peak: (0.2 - i * 0.04) * amp, attack: 0.006, decay: dur * (1 - k * 0.25) });
        });
      });
      return 3.2;
    },
    // Yumuşak Gong: alçak, sıcak, uzun sönümlü
    gong(ctx, out, t) {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2600;
      lp.connect(out);
      const f = 130.81;
      [[1, 0.34, 5], [1.004, 0.28, 5], [2.0, 0.16, 4.2], [2.99, 0.1, 3.4], [4.16, 0.06, 2.6], [5.43, 0.035, 2]]
        .forEach(([ratio, peak, decay]) => partial(ctx, lp, t, { freq: f * ratio, peak, attack: 0.025, decay }));
      return 5;
    },
    // Minimal Akor: Do majör 7'li, yumuşak arpej
    chord(ctx, out, t) {
      [523.25, 659.25, 783.99, 987.77, 1174.66].forEach((f, i) => {
        partial(ctx, out, t + i * 0.07, { freq: f, peak: 0.11, attack: 0.04, decay: 2.4 });
        partial(ctx, out, t + i * 0.07, { freq: f * 2, peak: 0.022, attack: 0.04, decay: 1.5 });
      });
      return 3.2;
    },
  };

  const Sounds = {
    builtin: [
      { id: 'builtin-crystal', name: 'Kristal Çan', kind: 'builtin', synth: 'crystal', desc: 'Berrak, yüksek ve ferah' },
      { id: 'builtin-gong', name: 'Yumuşak Gong', kind: 'builtin', synth: 'gong', desc: 'Derin, sıcak ve uzun sönümlü' },
      { id: 'builtin-chord', name: 'Minimal Akor', kind: 'builtin', synth: 'chord', desc: 'Sakin, arpej akor' },
    ],
    custom: [],
    init() {
      const saved = Store.get('sounds', []);
      this.custom = Array.isArray(saved)
        ? saved.filter((s) => s && typeof s.id === 'string' && typeof s.name === 'string' && typeof s.src === 'string' && (s.kind === 'url' || s.kind === 'file'))
        : [];
    },
    all() { return [...this.builtin, ...this.custom]; },
    get(id) { return this.all().find((s) => s.id === id) || null; },
    add(entry) {
      this.custom.push(entry);
      if (!Store.set('sounds', this.custom)) {
        this.custom.pop();
        return false;
      }
      return true;
    },
    remove(id) {
      this.custom = this.custom.filter((s) => s.id !== id);
      Store.set('sounds', this.custom);
      if (Settings.get('soundId') === id) Settings.set('soundId', DEFAULT_SOUND);
    },
    usageBytes() { try { return JSON.stringify(this.custom).length; } catch (e) { return 0; } },
  };

  const Engine = {
    ctx: null,

    /** AudioContext'i oluşturur/uyandırır (kullanıcı hareketi içinde çağrılmalı) */
    ensure() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try { this.ctx = new AC(); } catch (e) { return null; }
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return this.ctx;
    },

    /** soundRef: ses kimliği ya da ses nesnesi. {stop()} döndürür. */
    play(soundRef, { loop = false, onEnd, onError, volume } = {}) {
      const snd = (typeof soundRef === 'string' ? Sounds.get(soundRef) : soundRef) || Sounds.get(DEFAULT_SOUND);
      const vol = clamp(volume !== undefined ? volume : Settings.get('volume') / 100, 0, 1);
      return snd.kind === 'builtin'
        ? this._playSynth(snd, { loop, onEnd, vol })
        : this._playMedia(snd, { loop, onEnd, onError, vol });
    },

    _playSynth(snd, { loop, onEnd, vol }) {
      const ctx = this.ensure();
      if (!ctx) { if (onEnd) onEnd(); return { stop() {} }; }
      const out = ctx.createGain();
      out.gain.value = vol;
      out.connect(ctx.destination);
      let stopped = false;
      let loopTimer = 0;
      let endTimer = 0;
      const finish = () => {
        stopped = true;
        clearTimeout(loopTimer);
        clearTimeout(endTimer);
        try { out.gain.setTargetAtTime(0, ctx.currentTime, 0.06); } catch (e) { /* yoksay */ }
        setTimeout(() => { try { out.disconnect(); } catch (e) { /* yoksay */ } }, 600);
      };
      const trigger = () => {
        if (stopped) return;
        const dur = SYNTHS[snd.synth](ctx, out, ctx.currentTime + 0.03);
        if (loop) loopTimer = setTimeout(trigger, Math.max(1500, dur * 900));
        else endTimer = setTimeout(() => { if (!stopped) { finish(); if (onEnd) onEnd(); } }, dur * 1000 + 150);
      };
      trigger();
      return { stop() { if (!stopped) finish(); } };
    },

    _playMedia(snd, { loop, onEnd, onError, vol }) {
      const handle = { fallback: null, stop() { cleanup(); if (this.fallback) this.fallback.stop(); } };
      const audio = new window.Audio();
      let stopped = false;
      let cap = 0;
      const cleanup = () => {
        if (stopped) return;
        stopped = true;
        clearTimeout(cap);
        try { audio.pause(); audio.removeAttribute('src'); audio.load(); } catch (e) { /* yoksay */ }
      };
      const fail = (err) => {
        if (stopped) return;
        cleanup();
        if (onError) { onError(err); return; }
        Toast.warn('Seçili ses çalınamadı', 'Varsayılan ses kullanılıyor.');
        handle.fallback = this._playSynth(Sounds.get(DEFAULT_SOUND), { loop, onEnd, vol });
      };
      audio.preload = 'auto';
      audio.loop = loop;
      audio.volume = vol;
      audio.addEventListener('ended', () => { if (!loop && !stopped) { cleanup(); if (onEnd) onEnd(); } });
      audio.addEventListener('error', () => fail(audio.error));
      audio.src = snd.src;
      const p = audio.play();
      if (p && typeof p.catch === 'function') p.catch((err) => { if (!err || err.name !== 'AbortError') fail(err); });
      if (!loop) cap = setTimeout(() => { if (!stopped) { cleanup(); if (onEnd) onEnd(); } }, 45000);
      return handle;
    },

    /** Bir ses kaynağının gerçekten yüklenip yüklenmediğini dener: true / false / 'timeout' */
    probe(src, ms = 8000) {
      return new Promise((resolve) => {
        const a = new window.Audio();
        let done = false;
        const fin = (v) => {
          if (done) return;
          done = true;
          clearTimeout(t);
          try { a.removeAttribute('src'); a.load(); } catch (e) { /* yoksay */ }
          resolve(v);
        };
        const t = setTimeout(() => fin('timeout'), ms);
        a.preload = 'metadata';
        a.addEventListener('loadedmetadata', () => fin(true));
        a.addEventListener('canplay', () => fin(true));
        a.addEventListener('error', () => fin(false));
        a.src = src;
      });
    },
  };

  /** Beyaz / Kahverengi / Pembe gürültü üretici ve mikser */
  const Noise = {
    buffers: {},
    nodes: {},
    GAIN: { white: 0.6, pink: 0.9, brown: 1 },

    makeBuffer(ctx, type) {
      const sr = ctx.sampleRate;
      const L = Math.floor(sr * 8);
      const N = Math.floor(sr * 0.5); // döngü geçişi için eşit güç çapraz geçiş
      const total = L + N;
      const raw = new Float32Array(total);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
      for (let i = 0; i < total; i++) {
        const w = Math.random() * 2 - 1;
        let v;
        if (type === 'white') {
          v = w;
        } else if (type === 'pink') {
          b0 = 0.99886 * b0 + w * 0.0555179;
          b1 = 0.99332 * b1 + w * 0.0750759;
          b2 = 0.969 * b2 + w * 0.153852;
          b3 = 0.8665 * b3 + w * 0.3104856;
          b4 = 0.55 * b4 + w * 0.5329522;
          b5 = -0.7616 * b5 - w * 0.016898;
          v = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
          b6 = w * 0.115926;
        } else {
          last = (last + 0.02 * w) / 1.02;
          v = last * 3.5;
        }
        raw[i] = v;
      }
      let mean = 0;
      for (let i = 0; i < total; i++) mean += raw[i];
      mean /= total;
      let peak = 0;
      for (let i = 0; i < total; i++) { raw[i] -= mean; peak = Math.max(peak, Math.abs(raw[i])); }
      const norm = peak > 0 ? 0.9 / peak : 1;
      const buf = ctx.createBuffer(1, L, sr);
      const out = buf.getChannelData(0);
      for (let i = 0; i < L; i++) {
        let v = raw[i] * norm;
        if (i < N) {
          const t = (i / N) * Math.PI / 2;
          v = raw[i] * norm * Math.sin(t) + raw[L + i] * norm * Math.cos(t);
        }
        out[i] = v;
      }
      return buf;
    },

    level(type) { return Math.pow(Settings.get('noiseVol')[type] / 100, 1.6) * this.GAIN[type]; },

    start(type) {
      const ctx = Engine.ensure();
      if (!ctx) return false;
      if (this.nodes[type]) return true;
      if (!this.buffers[type] || this.buffers[type].sampleRate !== ctx.sampleRate) this.buffers[type] = this.makeBuffer(ctx, type);
      const src = ctx.createBufferSource();
      src.buffer = this.buffers[type];
      src.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start();
      gain.gain.setTargetAtTime(this.level(type), ctx.currentTime, 0.15);
      this.nodes[type] = { src, gain };
      return true;
    },

    stop(type) {
      const n = this.nodes[type];
      if (!n || !Engine.ctx) return;
      delete this.nodes[type];
      n.gain.gain.setTargetAtTime(0, Engine.ctx.currentTime, 0.1);
      setTimeout(() => { try { n.src.stop(); n.src.disconnect(); n.gain.disconnect(); } catch (e) { /* yoksay */ } }, 700);
    },

    refresh(type) {
      const n = this.nodes[type];
      if (n && Engine.ctx) n.gain.gain.setTargetAtTime(this.level(type), Engine.ctx.currentTime, 0.05);
    },
  };

  /** Süre bittiğinde: sistem bildirimi + ekran içi banner + seçili ses */
  const Alerts = {
    fire({ title, body, tag, sticky = false, type = 'info', loop = false }) {
      Notifier.send(title, body, { tag });
      Toast.show({ title, message: body, type, sticky, timeout: 9000 });
      Announcer.say(`${title}. ${body}`);
      return Engine.play(Settings.get('soundId'), { loop });
    },
  };

  /* ------------------------------------------------------------------------
     7) Geri sayım çekirdeği (zaman damgası tabanlı, arka planda kaymaz)
     ------------------------------------------------------------------------ */
  class Countdown {
    constructor({ onTick, onDone }) {
      this.onTick = onTick;
      this.onDone = onDone;
      this.total = 0;
      this.remaining = 0;
      this.running = false;
      this.endAt = 0;
      this.timer = 0;
    }
    set(ms) { this._clear(); this.running = false; this.total = this.remaining = Math.max(0, ms); this.onTick(this); }
    start() {
      if (this.running || this.remaining <= 0) return false;
      this.endAt = Date.now() + this.remaining;
      this.running = true;
      this.timer = setInterval(() => this._tick(), 200);
      this.onTick(this);
      return true;
    }
    pause() {
      if (!this.running) return;
      this.remaining = Math.max(0, this.endAt - Date.now());
      this._clear();
      this.running = false;
      this.onTick(this);
    }
    reset() { this._clear(); this.running = false; this.remaining = this.total; this.onTick(this); }
    _clear() { clearInterval(this.timer); this.timer = 0; }
    _tick() {
      const rem = this.endAt - Date.now();
      if (rem <= 0) {
        this._clear();
        this.running = false;
        this.remaining = 0;
        this.onTick(this);
        this.onDone();
      } else {
        this.remaining = rem;
        this.onTick(this);
      }
    }
  }

  /** SVG ilerleme halkası */
  class Ring {
    constructor(circle) {
      this.circle = circle;
      this.len = 2 * Math.PI * (parseFloat(circle.getAttribute('r')) || 100);
      circle.style.strokeDasharray = this.len.toFixed(3);
      this.last = -1;
    }
    set(fraction) {
      const f = clamp(fraction, 0, 1);
      if (Math.abs(f - this.last) < 0.0005) return;
      this.last = f;
      this.circle.style.strokeDashoffset = (this.len * (1 - f)).toFixed(3);
    }
  }

  /** Duyuru sıklığı: 5 dk'da bir, son 5 dakikada her dakika, son 10 sn */
  const shouldAnnounce = (secs) => secs > 0 && (secs % 300 === 0 || (secs <= 300 && secs % 60 === 0) || secs === 10);

  /* ------------------------------------------------------------------------
     8) Sayı çarkı bileşeni (yaz / ↑↓ / +− / basılı tut)
     ------------------------------------------------------------------------ */
  class Spinner {
    constructor(el, { value, onChange } = {}) {
      const d = el.dataset;
      this.el = el;
      this.min = Number(d.min) || 0;
      this.max = Number(d.max) || 99;
      this.step = Number(d.step) || 1;
      this.wrap = el.hasAttribute('data-wrap');
      this.pad = Number(d.pad) || 2;
      this.unit = d.unit || '';
      this.onChange = onChange || (() => {});
      this.value = clamp(Number.isFinite(value) ? value : this.min, this.min, this.max);
      this.holdTimer = 0;

      this.input = h('input', {
        class: 'spin-input', type: 'text', inputmode: 'numeric', pattern: '[0-9]*', autocomplete: 'off',
        enterkeyhint: 'done', spellcheck: 'false', role: 'spinbutton', 'aria-label': d.label || '',
        'aria-valuemin': this.min, 'aria-valuemax': this.max,
      });
      this.up = this._button(1, 'plus', `${d.label || 'Değer'} artır`);
      this.down = this._button(-1, 'minus', `${d.label || 'Değer'} azalt`);
      el.classList.add('spin');
      el.replaceChildren(this.up, this.input, this.down, h('span', { class: 'spin-unit', 'aria-hidden': 'true' }, this.unit));
      this._bindInput();
      this._paint();
    }

    _button(dir, iconName, label) {
      const btn = h('button', { type: 'button', class: 'spin-btn', 'aria-label': label, tabindex: '-1' }, icon(iconName));
      const stopHold = () => clearTimeout(this.holdTimer);
      btn.addEventListener('pointerdown', (e) => {
        if (e.button !== 0 || btn.disabled) return;
        e.preventDefault();
        this._nudge(dir);
        let delay = 420;
        const loop = () => { this._nudge(dir); delay = Math.max(60, delay * 0.85); this.holdTimer = setTimeout(loop, delay); };
        this.holdTimer = setTimeout(loop, delay);
      });
      ['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach((ev) => btn.addEventListener(ev, stopHold));
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
      // Klavye / ekran okuyucu etkinleştirmesi (detail === 0)
      btn.addEventListener('click', (e) => { if (e.detail === 0) this._nudge(dir); });
      return btn;
    }

    _bindInput() {
      const input = this.input;
      const maxLen = String(this.max).length;
      let justFocused = false;
      input.addEventListener('focus', () => {
        justFocused = true;
        setTimeout(() => { try { input.select(); } catch (e) { /* yoksay */ } }, 0);
      });
      // Fare bırakılınca seçimin kaybolmasını önle: tıklayınca tüm rakamlar seçili kalır
      const selectAll = () => { try { input.select(); } catch (e) { /* yoksay */ } };
      input.addEventListener('mouseup', (e) => { if (justFocused) { e.preventDefault(); selectAll(); } });
      input.addEventListener('click', () => { if (justFocused) { selectAll(); justFocused = false; } });
      input.addEventListener('input', () => {
        const digits = input.value.replace(/\D/g, '').slice(-maxLen);
        if (digits !== input.value) input.value = digits;
        if (digits === '') return;
        const parsed = parseInt(digits, 10);
        const v = clamp(parsed, this.min, this.max);
        if (parsed > this.max) input.value = String(v);
        this._commit(v, false);
      });
      input.addEventListener('blur', () => { justFocused = false; this._paint(); });
      input.addEventListener('keydown', (e) => {
        justFocused = false;
        const big = this.step * 10;
        const actions = {
          ArrowUp: () => this._nudge(1), ArrowDown: () => this._nudge(-1),
          PageUp: () => this._nudge(1, big), PageDown: () => this._nudge(-1, big),
          Home: () => this._commit(this.min, true), End: () => this._commit(this.max, true),
        };
        if (actions[e.key]) { e.preventDefault(); actions[e.key](); }
      });
    }

    _nudge(dir, amount = this.step) {
      let v = this.value + dir * amount;
      if (v > this.max) v = this.wrap ? this.min : this.max;
      if (v < this.min) v = this.wrap ? this.max : this.min;
      this._commit(v, true);
    }

    _commit(v, repaint) {
      const changed = v !== this.value;
      this.value = clamp(v, this.min, this.max);
      if (repaint) this._paint(); else this._aria();
      if (changed) this.onChange(this.value);
    }

    _aria() {
      this.input.setAttribute('aria-valuenow', this.value);
      this.input.setAttribute('aria-valuetext', `${this.value} ${this.unit}`.trim());
    }

    _paint() { this.input.value = pad(this.value, this.pad); this._aria(); }
    set(v) { this.value = clamp(v, this.min, this.max); this._paint(); }
    get() { return this.value; }
    focus() { this.input.focus(); }
    setDisabled(disabled) {
      clearTimeout(this.holdTimer);
      this.input.disabled = disabled;
      this.up.disabled = disabled;
      this.down.disabled = disabled;
    }
  }

  /** Aralık (range) kaydırıcılarında dolu kısım */
  function paintRange(input) {
    const min = Number(input.min) || 0;
    const max = Number(input.max) || 100;
    input.style.setProperty('--val', `${((input.value - min) / (max - min)) * 100}%`);
  }

  /* ------------------------------------------------------------------------
     9) Arka plan ışık küreleri (scroll + sekme ile akıcı dönüşüm)
     ------------------------------------------------------------------------ */
  const Ambient = {
    // [x%, y%, ölçek, r, g, b, alfa]
    PRESETS: {
      alarm: [[16, 20, 1.0, 226, 165, 98, 0.30], [86, 24, 0.75, 160, 100, 78, 0.20], [68, 88, 1.15, 44, 64, 126, 0.34], [10, 84, 0.7, 118, 160, 132, 0.14]],
      zamanlayici: [[80, 16, 1.05, 44, 74, 150, 0.38], [14, 30, 0.8, 108, 160, 232, 0.20], [40, 92, 1.1, 32, 48, 110, 0.34], [92, 78, 0.65, 120, 164, 136, 0.14]],
      pomodoro: [[14, 18, 1.05, 112, 160, 132, 0.26], [88, 26, 0.85, 226, 182, 112, 0.22], [60, 90, 1.1, 40, 58, 118, 0.32], [8, 76, 0.75, 150, 134, 214, 0.16]],
      ayarlar: [[50, 12, 1.0, 150, 136, 212, 0.22], [10, 56, 0.9, 40, 60, 132, 0.34], [90, 70, 0.85, 206, 166, 112, 0.14], [56, 96, 0.8, 112, 160, 132, 0.16]],
    },
    // Aşağı kaydırdıkça her kürenin dönüşeceği ton
    TINTS: [[40, 64, 140, 0.36], [120, 165, 135, 0.22], [226, 170, 110, 0.18], [120, 170, 240, 0.20]],
    PARALLAX: [14, -10, 8, -16],
    EPS: [0.02, 0.02, 0.002, 0.3, 0.3, 0.3, 0.002],

    els: [], cur: [], tgt: [], route: 'pomodoro', raf: 0, last: 0, ready: false,

    init() {
      this.els = $$('.orb');
      this.compute();
      // Açılışta küreler yavaşça belirir
      this.cur = this.tgt.map((o) => { const c = o.slice(); c[6] = 0; return c; });
      this.render();
      this.ready = true;
      const wake = () => this.schedule();
      window.addEventListener('scroll', wake, { passive: true });
      window.addEventListener('resize', wake, { passive: true });
      this.schedule();
    },

    setRoute(route) { this.route = route; this.schedule(); },

    progress() {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      return max > 4 ? clamp(window.scrollY / max, 0, 1) : 0;
    },

    compute() {
      const t = this.progress();
      const sy = window.scrollY / Math.max(1, window.innerHeight);
      const preset = this.PRESETS[this.route] || this.PRESETS.pomodoro;
      this.tgt = preset.map(([x, y, s, r, g, b, a], i) => {
        const tint = this.TINTS[i];
        const k = 0.55 * t;
        return [
          x + (50 - x) * 0.45 * t,
          y * (1 - t) + (100 - y) * t - sy * this.PARALLAX[i],
          s * (1 + 0.2 * t),
          r + (tint[0] - r) * k, g + (tint[1] - g) * k, b + (tint[2] - b) * k,
          a + (tint[3] - a) * k,
        ];
      });
    },

    schedule() {
      if (this.raf) return;
      this.last = performance.now();
      this.raf = requestAnimationFrame((ts) => this.frame(ts));
    },

    frame(ts) {
      this.compute();
      const dt = Math.min(0.05, Math.max(0.001, (ts - this.last) / 1000));
      this.last = ts;
      const k = reducedMotion.matches ? 1 : 1 - Math.exp(-dt / 0.55);
      let moving = false;
      for (let i = 0; i < this.cur.length; i++) {
        for (let j = 0; j < 7; j++) {
          const d = this.tgt[i][j] - this.cur[i][j];
          if (Math.abs(d) > this.EPS[j]) { moving = true; this.cur[i][j] += d * k; } else this.cur[i][j] = this.tgt[i][j];
        }
      }
      this.render();
      this.raf = moving ? requestAnimationFrame((t) => this.frame(t)) : 0;
    },

    render() {
      const w = window.innerWidth, hgt = window.innerHeight;
      this.els.forEach((el, i) => {
        const [x, y, s, r, g, b, a] = this.cur[i];
        el.style.transform = `translate3d(${(x / 100 * w).toFixed(1)}px, ${(y / 100 * hgt).toFixed(1)}px, 0) scale(${s.toFixed(3)})`;
        const color = `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${Math.min(1, a * 1.45).toFixed(3)})`;
        if (el._color !== color) { el._color = color; el.style.setProperty('--c', color); }
      });
    },
  };

  /* ------------------------------------------------------------------------
     10) Hash Router (SPA)
     ------------------------------------------------------------------------ */
  const ROUTES = {
    alarm: { title: 'Alarm', color: '#E2C799' },
    zamanlayici: { title: 'Zamanlayıcı', color: '#93C5FD' },
    pomodoro: { title: 'Pomodoro', color: '#E2C799' },
    ayarlar: { title: 'Ayarlar', color: '#C4B5FD' },
  };
  const ROUTE_KEYS = Object.keys(ROUTES);

  const Router = {
    DEFAULT: 'pomodoro',
    current: null,
    peekTimer: 0,

    init() {
      this.tabs = $$('.dock-item');
      this.list = $('#dock-list');
      window.addEventListener('hashchange', () => this.render());

      // Klavye: ok tuşlarıyla sekmeler arasında gezinme
      this.list.addEventListener('keydown', (e) => {
        const idx = ROUTE_KEYS.indexOf(this.current);
        let next = -1;
        if (e.key === 'ArrowRight') next = (idx + 1) % ROUTE_KEYS.length;
        else if (e.key === 'ArrowLeft') next = (idx - 1 + ROUTE_KEYS.length) % ROUTE_KEYS.length;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = ROUTE_KEYS.length - 1;
        if (next < 0) return;
        e.preventDefault();
        location.hash = '#' + ROUTE_KEYS[next];
        this.tabs[next].focus();
      });

      // "Ana içeriğe geç" bağlantısı hash yönlendiricisini bozmasın
      $('[data-skip]').addEventListener('click', (e) => { e.preventDefault(); $('#main').focus(); });

      this.render();
    },

    parse() {
      let key = location.hash.replace(/^#\/?/, '');
      try { key = decodeURIComponent(key); } catch (e) { /* bozuk kodlama: yoksay */ }
      key = key.toLowerCase();
      return Object.prototype.hasOwnProperty.call(ROUTES, key) ? key : null;
    },

    render() {
      let key = this.parse();
      if (!key) {
        try { history.replaceState(null, '', '#' + this.DEFAULT); } catch (e) { location.hash = '#' + this.DEFAULT; }
        key = this.DEFAULT;
      }
      if (key === this.current) return;
      const first = this.current === null;
      this.current = key;

      ROUTE_KEYS.forEach((k) => {
        const view = $('#view-' + k);
        const active = k === key;
        view.hidden = !active;
        view.classList.toggle('is-active', active);
      });
      this.tabs.forEach((tab, i) => {
        const active = tab.dataset.route === key;
        tab.setAttribute('aria-selected', String(active));
        tab.tabIndex = active ? 0 : -1;
        if (active) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current');
        tab.classList.remove('is-peek');
        if (active) this.list.style.setProperty('--i', i);
      });

      document.body.dataset.view = key;
      Title.setBase(`${ROUTES[key].title} — NyxFocus`);
      Favicon.set(ROUTES[key].color);
      Ambient.setRoute(key);
      if (!first) {
        window.scrollTo(0, 0);
        const activeTab = this.tabs[ROUTE_KEYS.indexOf(key)];
        activeTab.classList.add('is-peek');
        clearTimeout(this.peekTimer);
        this.peekTimer = setTimeout(() => activeTab.classList.remove('is-peek'), 1600);
      }
      Bus.emit('route', key);
    },
  };

  /* ------------------------------------------------------------------------
     11) Saat (başlık + saniye tikleri)
     ------------------------------------------------------------------------ */
  const Clock = {
    init() {
      this.timeEl = $('#clock-time');
      this.dateEl = $('#clock-date');
      this.dateFmt = new Intl.DateTimeFormat('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
      this.tick();
    },
    tick() {
      const now = new Date();
      const t = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
      this.timeEl.textContent = t;
      const day = this.dateFmt.format(now);
      if (this.dateEl.textContent !== day) this.dateEl.textContent = day;
      Bus.emit('second', now);
      setTimeout(() => this.tick(), 1000 - now.getMilliseconds() + 5);
    },
  };

  /* ------------------------------------------------------------------------
     12) Alarm modülü
     ------------------------------------------------------------------------ */
  const AlarmModule = {
    alarms: [], snoozes: [], ringing: [],
    handle: null, autoStop: 0, prevFocus: null,
    lastCheck: Date.now(), minuteKey: '',

    init() {
      const saved = Store.get('alarms', []);
      this.alarms = (Array.isArray(saved) ? saved : []).filter((a) => a && Number.isInteger(a.hour) && Number.isInteger(a.minute) && a.hour >= 0 && a.hour < 24 && a.minute >= 0 && a.minute < 60)
        .map((a) => ({ id: String(a.id || uid()), hour: a.hour, minute: a.minute, label: String(a.label || ''), enabled: !!a.enabled, repeat: !!a.repeat }));

      this.listEl = $('#alarm-list');
      this.emptyEl = $('#alarm-empty');
      this.nextEl = $('#alarm-next');
      this.labelEl = $('#alarm-label');
      this.repeatEl = $('#alarm-repeat');
      this.overlay = $('#ring-overlay');

      const now = new Date(Date.now() + 5 * 60000);
      this.hour = new Spinner($('#alarm-hour'), { value: now.getHours() });
      this.minute = new Spinner($('#alarm-minute'), { value: now.getMinutes() });

      $('#alarm-form').addEventListener('submit', (e) => { e.preventDefault(); this.add(); });
      $('#ring-stop').addEventListener('click', () => this.stop());
      $('#ring-snooze').addEventListener('click', () => this.snooze());
      this.overlay.addEventListener('keydown', (e) => this.onOverlayKey(e));

      this.render();
      Bus.on('second', (n) => this.tick(n));
    },

    save() { Store.set('alarms', this.alarms); },
    timeText(a) { return `${pad(a.hour)}:${pad(a.minute)}`; },

    /** now'dan sonraki ilk çalma anı */
    nextOccurrence(a, now = new Date()) {
      const d = new Date(now);
      d.setHours(a.hour, a.minute, 0, 0);
      if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
      return d;
    },
    /** now'a kadarki son çalma anı */
    lastOccurrence(a, now = new Date()) {
      const d = new Date(now);
      d.setHours(a.hour, a.minute, 0, 0);
      if (d.getTime() > now.getTime()) d.setDate(d.getDate() - 1);
      return d;
    },

    dayWord(a) {
      const next = this.nextOccurrence(a);
      return next.getDate() === new Date().getDate() ? 'Bugün' : 'Yarın';
    },

    metaText(a) {
      const name = a.label || 'Alarm';
      if (!a.enabled) return `${name} · Kapalı`;
      return `${name} · ${a.repeat ? 'Her gün' : this.dayWord(a)}`;
    },

    fmtRemaining(ms) {
      const mins = Math.max(1, Math.ceil(ms / 60000));
      const hh = Math.floor(mins / 60), mm = mins % 60;
      if (hh && mm) return `${hh} sa ${mm} dk`;
      return hh ? `${hh} sa` : `${mm} dk`;
    },

    add() {
      Notifier.ensurePermission(); // ilk alarmda izin iste (kullanıcı hareketi içinde)
      Engine.ensure();
      if (this.alarms.length >= 20) { Toast.warn('Alarm sınırı', 'En fazla 20 alarm kurabilirsiniz.'); return; }
      const alarm = {
        id: uid(), hour: this.hour.get(), minute: this.minute.get(),
        label: this.labelEl.value.trim().slice(0, 40), enabled: true, repeat: this.repeatEl.checked,
      };
      this.alarms.push(alarm);
      this.alarms.sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
      this.save();
      this.render();
      this.labelEl.value = '';
      const when = this.fmtRemaining(this.nextOccurrence(alarm).getTime() - Date.now());
      Toast.success('Alarm kuruldu', `${this.timeText(alarm)} · ${when} sonra`);
      Announcer.say(`Alarm kuruldu: ${this.timeText(alarm)}`);
    },

    render() {
      this.listEl.replaceChildren(...this.alarms.map((a) => this.item(a)));
      this.emptyEl.hidden = this.alarms.length > 0;
      this.listEl.hidden = this.alarms.length === 0;
      this.updateNext();
    },

    item(a) {
      const name = a.label || this.timeText(a);
      const toggle = h('input', {
        type: 'checkbox', role: 'switch', checked: a.enabled, 'aria-label': `${name} alarmını aç veya kapat`,
        onchange: (e) => {
          a.enabled = e.target.checked;
          this.save();
          li.classList.toggle('is-off', !a.enabled);
          this.updateMeta();
          if (a.enabled) { Notifier.ensurePermission(); Engine.ensure(); }
        },
      });
      const li = h('li', { class: `alarm-item${a.enabled ? '' : ' is-off'}`, dataset: { id: a.id } },
        h('div', { class: 'alarm-info' },
          h('span', { class: 'alarm-time' }, this.timeText(a)),
          h('span', { class: 'alarm-meta' }, this.metaText(a))),
        h('span', { class: 'switch' }, toggle, h('span', { class: 'switch-ui', 'aria-hidden': 'true' })),
        h('button', {
          type: 'button', class: 'icon-btn is-danger', 'aria-label': `${name} alarmını sil`, title: 'Sil',
          onclick: () => {
            this.alarms = this.alarms.filter((x) => x.id !== a.id);
            this.save();
            this.render();
            Announcer.say('Alarm silindi');
            this.labelEl.focus();
          },
        }, icon('trash')));
      return li;
    },

    updateMeta() {
      this.alarms.forEach((a) => {
        const el = $(`.alarm-item[data-id="${a.id}"] .alarm-meta`, this.listEl);
        if (el) { const t = this.metaText(a); if (el.textContent !== t) el.textContent = t; }
      });
      this.updateNext();
    },

    updateNext() {
      const now = new Date();
      const times = this.alarms.filter((a) => a.enabled).map((a) => this.nextOccurrence(a, now).getTime() - now.getTime());
      this.nextEl.textContent = times.length ? `Sıradaki: ${this.fmtRemaining(Math.min(...times))} sonra` : 'Aktif alarm yok';
    },

    tick(now) {
      const t = now.getTime();
      let changed = false;
      for (const a of this.alarms) {
        if (!a.enabled) continue;
        const last = this.lastOccurrence(a, now).getTime();
        if (last > this.lastCheck && last <= t) {
          this.trigger({ key: a.id, label: a.label || 'Alarm', time: this.timeText(a) });
          if (!a.repeat) { a.enabled = false; changed = true; }
        }
      }
      const due = this.snoozes.filter((s) => s.at <= t);
      if (due.length) {
        this.snoozes = this.snoozes.filter((s) => s.at > t);
        due.forEach((s) => this.trigger({ key: s.key, label: s.label, time: s.time }));
      }
      this.lastCheck = t;
      if (changed) { this.save(); this.render(); }
      const mk = `${now.getHours()}:${now.getMinutes()}`;
      if (mk !== this.minuteKey) { this.minuteKey = mk; this.updateMeta(); }
    },

    trigger(item) {
      if (!this.ringing.some((r) => r.key === item.key)) this.ringing.push(item);
      if (!this.handle) this.handle = Engine.play(Settings.get('soundId'), { loop: true });
      Notifier.send('NyxFocus · Alarm', `${item.label} · ${item.time}`, { tag: 'alarm-' + item.key });
      Toast.show({ title: 'Alarm çalıyor', message: `${item.label} · ${item.time}`, type: 'warn', timeout: 9000 });
      this.showOverlay();
      clearTimeout(this.autoStop);
      this.autoStop = setTimeout(() => this.stop(true), 3 * 60000);
    },

    showOverlay() {
      const n = this.ringing.length;
      $('#ring-title').textContent = n === 1 ? this.ringing[0].label : `${n} alarm çalıyor`;
      $('#ring-desc').textContent = n === 1 ? `Saat ${this.ringing[0].time}` : this.ringing.map((r) => `${r.label} (${r.time})`).join(', ');
      if (this.overlay.hidden) {
        this.prevFocus = document.activeElement;
        this.overlay.hidden = false;
        $('#ring-stop').focus();
      }
      Announcer.say(`Alarm çalıyor. ${$('#ring-title').textContent}. ${$('#ring-desc').textContent}`);
    },

    hideOverlay() {
      this.overlay.hidden = true;
      if (this.prevFocus && document.contains(this.prevFocus) && this.prevFocus.focus) this.prevFocus.focus();
      this.prevFocus = null;
    },

    stop(auto = false) {
      clearTimeout(this.autoStop);
      if (this.handle) { this.handle.stop(); this.handle = null; }
      const had = this.ringing.length > 0;
      this.ringing = [];
      this.hideOverlay();
      if (auto && had) Toast.info('Alarm susturuldu', 'Alarm 3 dakika sonra otomatik olarak kapatıldı.');
    },

    snooze() {
      const items = this.ringing.slice();
      this.stop();
      items.forEach((r) => this.snoozes.push({ key: 'snz-' + uid(), label: r.label, time: r.time, at: Date.now() + 5 * 60000 }));
      if (items.length) {
        Toast.info('Alarm ertelendi', '5 dakika sonra tekrar çalacak.');
        Announcer.say('Alarm 5 dakika ertelendi');
      }
    },

    onOverlayKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); this.stop(); return; }
      if (e.key !== 'Tab') return;
      const btns = [$('#ring-stop'), $('#ring-snooze')];
      const i = btns.indexOf(document.activeElement);
      e.preventDefault();
      btns[(i + (e.shiftKey ? -1 : 1) + btns.length) % btns.length].focus();
    },
  };

  /* ------------------------------------------------------------------------
     13) Zamanlayıcı modülü
     ------------------------------------------------------------------------ */
  const TimerModule = {
    state: 'idle', // idle | running | paused | finished
    lastShown: '',

    init() {
      this.card = $('#timer-card');
      this.display = $('#timer-display');
      this.stateEl = $('#timer-state');
      this.toggleBtn = $('#timer-toggle');
      this.resetBtn = $('#timer-reset');
      this.chips = $$('#timer-presets .chip');
      this.ring = new Ring($('#timer-bar'));

      const s = Store.get('timer', { h: 0, m: 5, s: 0 });
      const onChange = () => this.onSpin();
      this.h = new Spinner($('#timer-h'), { value: Number(s.h), onChange });
      this.m = new Spinner($('#timer-m'), { value: Number(s.m), onChange });
      this.s = new Spinner($('#timer-s'), { value: Number(s.s), onChange });

      this.cd = new Countdown({ onTick: () => this.render(), onDone: () => this.done() });

      this.chips.forEach((chip) => chip.addEventListener('click', () => {
        if (this.state === 'running' || this.state === 'paused') return;
        this.h.set(0); this.m.set(Number(chip.dataset.minutes)); this.s.set(0);
        this.onSpin();
        Announcer.say(`${chip.dataset.minutes} dakika seçildi`);
      }));
      this.toggleBtn.addEventListener('click', () => this.toggle());
      this.resetBtn.addEventListener('click', () => this.reset());

      this.onSpin();
    },

    total() { return (this.h.get() * 3600 + this.m.get() * 60 + this.s.get()) * 1000; },

    locked() { return this.state === 'running' || this.state === 'paused'; },

    onSpin() {
      if (this.locked()) return;
      Store.set('timer', { h: this.h.get(), m: this.m.get(), s: this.s.get() });
      this.state = 'idle';
      this.cd.set(this.total());
    },

    toggle() {
      if (this.state === 'running') {
        this.cd.pause();
        this.state = 'paused';
        this.render();
        Announcer.say(`Zamanlayıcı duraklatıldı. Kalan ${fmtSpoken(Math.ceil(this.cd.remaining / 1000))}`);
        return;
      }
      if (this.state !== 'paused') {
        this.state = 'idle';
        this.cd.set(this.total());
        if (this.cd.total <= 0) {
          Toast.warn('Süre belirleyin', 'Başlatmak için en az 1 saniyelik bir süre girin.');
          this.m.focus();
          return;
        }
      }
      Notifier.ensurePermission(); // ilk başlatmada izin iste (kullanıcı hareketi içinde)
      Engine.ensure();
      if (this.cd.start()) {
        this.state = 'running';
        this.render();
        Announcer.say(`Zamanlayıcı başladı. ${fmtSpoken(Math.ceil(this.cd.remaining / 1000))}`);
      }
    },

    reset() {
      this.state = 'idle';
      this.cd.set(this.total());
      Announcer.say('Zamanlayıcı sıfırlandı');
    },

    done() {
      this.state = 'finished';
      this.render();
      Alerts.fire({ title: 'Süre doldu', body: `${fmtSpoken(Math.round(this.cd.total / 1000))} tamamlandı.`, tag: 'timer', sticky: true, type: 'success' });
    },

    render() {
      const secs = Math.ceil(this.cd.remaining / 1000);
      const text = fmtClock(secs, true);
      if (text !== this.lastShown) {
        this.lastShown = text;
        this.display.textContent = text;
        if (this.state === 'running') {
          if (shouldAnnounce(secs)) Announcer.say(`Kalan ${fmtSpoken(secs)}`);
        }
      }
      this.ring.set(this.cd.total > 0 ? this.cd.remaining / this.cd.total : 0);

      const labels = { idle: 'Hazır', running: 'Çalışıyor', paused: 'Duraklatıldı', finished: 'Süre doldu' };
      this.stateEl.textContent = labels[this.state];
      this.card.classList.toggle('is-done', this.state === 'finished');
      const btn = {
        idle: ['play', 'Başlat'], finished: ['play', 'Yeniden Başlat'],
        running: ['pause', 'Duraklat'], paused: ['play', 'Devam Et'],
      }[this.state];
      setBtn(this.toggleBtn, btn[0], btn[1]);

      const locked = this.locked();
      [this.h, this.m, this.s].forEach((sp) => sp.setDisabled(locked));
      const total = this.cd.total;
      this.chips.forEach((chip) => {
        chip.disabled = locked;
        chip.setAttribute('aria-pressed', String(!locked && total === Number(chip.dataset.minutes) * 60000));
      });
      Title.setLive('timer', this.state === 'running' ? fmtClock(secs, secs >= 3600) + ' · Zamanlayıcı' : '');
    },
  };

  /* ------------------------------------------------------------------------
     14) Görev listesi
     ------------------------------------------------------------------------ */
  const Tasks = {
    items: [], activeId: null,

    init() {
      const saved = Store.get('tasks', []);
      this.items = (Array.isArray(saved) ? saved : []).filter((t) => t && typeof t.text === 'string')
        .map((t) => ({ id: String(t.id || uid()), text: t.text.slice(0, 80), done: !!t.done, pomos: Number(t.pomos) || 0 }));
      const active = Store.get('activeTask', null);
      this.activeId = this.items.some((t) => t.id === active && !t.done) ? active : null;

      this.listEl = $('#task-list');
      this.emptyEl = $('#task-empty');
      this.countEl = $('#tasks-count');
      this.footEl = $('#task-foot');
      this.inputEl = $('#task-input');

      $('#task-form').addEventListener('submit', (e) => { e.preventDefault(); this.add(); });
      $('#task-clear').addEventListener('click', () => {
        const n = this.items.filter((t) => t.done).length;
        this.items = this.items.filter((t) => !t.done);
        this.commit();
        Announcer.say(`${n} tamamlanan görev temizlendi`);
        this.inputEl.focus();
      });
      this.render();
    },

    active() { return this.items.find((t) => t.id === this.activeId) || null; },

    commit(focusSel) {
      Store.set('tasks', this.items);
      Store.set('activeTask', this.activeId);
      this.render(focusSel);
      Bus.emit('tasks');
    },

    add() {
      const text = this.inputEl.value.trim();
      if (!text) { this.inputEl.focus(); return; }
      const task = { id: uid(), text: text.slice(0, 80), done: false, pomos: 0 };
      this.items.push(task);
      if (!this.activeId) this.activeId = task.id;
      this.inputEl.value = '';
      this.commit();
      Announcer.say(`Görev eklendi: ${task.text}`);
      this.inputEl.focus();
    },

    addPomo(id) {
      const t = this.items.find((x) => x.id === id);
      if (t) { t.pomos += 1; this.commit(); }
    },

    render(focusSel) {
      this.listEl.replaceChildren(...this.items.map((t) => this.row(t)));
      const done = this.items.filter((t) => t.done).length;
      this.countEl.textContent = `${done} / ${this.items.length}`;
      this.emptyEl.hidden = this.items.length > 0;
      this.listEl.hidden = this.items.length === 0;
      this.footEl.hidden = done === 0;
      if (focusSel) { const el = $(focusSel, this.listEl); if (el) el.focus(); }
    },

    row(t) {
      const isActive = t.id === this.activeId;
      return h('li', { class: `task${t.done ? ' is-done' : ''}${isActive ? ' is-active' : ''}`, dataset: { id: t.id } },
        h('label', { class: 'check' },
          h('input', {
            type: 'checkbox', checked: t.done, 'aria-label': `${t.text} görevini tamamlandı olarak işaretle`,
            onchange: (e) => {
              t.done = e.target.checked;
              if (t.done && this.activeId === t.id) this.activeId = null;
              if (!t.done && !this.activeId) this.activeId = t.id;
              this.commit(`[data-id="${t.id}"] input[type="checkbox"]`);
            },
          }),
          h('span', { class: 'check-ui', 'aria-hidden': 'true' }, icon('check'))),
        h('button', {
          type: 'button', class: 'task-text', disabled: t.done, 'aria-pressed': String(isActive),
          title: isActive ? 'Aktif görev' : 'Aktif görev yap',
          onclick: () => { this.activeId = isActive ? null : t.id; this.commit(`[data-id="${t.id}"] .task-text`); },
        }, t.text),
        t.pomos ? h('span', { class: 'task-pomos', title: `${t.pomos} odak seansı`, 'aria-label': `${t.pomos} odak seansı` }, icon('pomodoro'), String(t.pomos)) : null,
        h('button', {
          type: 'button', class: 'icon-btn is-danger', 'aria-label': `${t.text} görevini sil`, title: 'Sil',
          onclick: () => {
            this.items = this.items.filter((x) => x.id !== t.id);
            if (this.activeId === t.id) this.activeId = null;
            this.commit();
            Announcer.say('Görev silindi');
            this.inputEl.focus();
          },
        }, icon('trash')));
    },
  };

  /* ------------------------------------------------------------------------
     15) Pomodoro modülü (sayaç + ses mikseri)
     ------------------------------------------------------------------------ */
  const PomodoroModule = {
    MODES: { focus: 'Odak', short: 'Kısa Mola', long: 'Uzun Mola' },
    mode: 'focus',
    state: 'idle', // idle | running | paused
    lastShown: '',
    completed: 0,

    init() {
      this.card = $('#pomo-card');
      this.display = $('#pomo-display');
      this.stateEl = $('#pomo-state');
      this.toggleBtn = $('#pomo-toggle');
      this.dotsEl = $('#pomo-dots');
      this.taskEl = $('#pomo-active-task');
      this.modeBtns = $$('#pomo-modes button');
      this.ring = new Ring($('#pomo-bar'));

      const saved = Store.get('pomo', {});
      const today = new Date().toDateString();
      this.completed = saved && saved.date === today ? Number(saved.completed) || 0 : 0;

      this.cd = new Countdown({ onTick: () => this.render(), onDone: () => this.done() });

      this.modeBtns.forEach((b) => b.addEventListener('click', () => this.setMode(b.dataset.mode)));
      this.toggleBtn.addEventListener('click', () => this.toggle());
      $('#pomo-reset').addEventListener('click', () => { this.setMode(this.mode); Announcer.say('Sayaç sıfırlandı'); });
      $('#pomo-skip').addEventListener('click', () => this.skip());

      Bus.on('settings', (key) => {
        if (['focus', 'short', 'long', 'longEvery'].includes(key) && this.state === 'idle') this.setMode(this.mode, { silent: true });
        if (key === 'longEvery') this.renderDots();
      });
      Bus.on('tasks', () => this.renderTask());

      this.initMixer();
      this.setMode('focus', { silent: true });
      this.renderTask();
    },

    duration(mode) { return Settings.get(mode) * 60000; },

    setMode(mode, { silent = false } = {}) {
      this.mode = mode;
      this.state = 'idle';
      this.card.dataset.mode = mode;
      this.modeBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
      this.cd.set(this.duration(mode));
      if (!silent) Announcer.say(`${this.MODES[mode]} seçildi, ${fmtSpoken(Settings.get(mode) * 60)}`);
    },

    toggle() {
      if (this.state === 'running') {
        this.cd.pause();
        this.state = 'paused';
        this.render();
        Announcer.say('Pomodoro duraklatıldı');
        return;
      }
      Notifier.ensurePermission(); // ilk başlatmada izin iste (kullanıcı hareketi içinde)
      Engine.ensure();
      if (this.cd.start()) {
        this.state = 'running';
        this.render();
        Announcer.say(`${this.MODES[this.mode]} başladı. ${fmtSpoken(Math.ceil(this.cd.remaining / 1000))}`);
      }
    },

    nextMode() {
      if (this.mode !== 'focus') return 'focus';
      return this.completed % Settings.get('longEvery') === 0 ? 'long' : 'short';
    },

    saveProgress() { Store.set('pomo', { date: new Date().toDateString(), completed: this.completed }); },

    skip() {
      const wasRunning = this.state === 'running';
      this.setMode(this.nextMode(), { silent: true });
      Announcer.say(`${this.MODES[this.mode]} seçildi`);
      if (wasRunning) this.toggle();
    },

    done() {
      const finished = this.mode;
      let body;
      if (finished === 'focus') {
        this.completed += 1;
        this.saveProgress();
        const task = Tasks.active();
        if (task) Tasks.addPomo(task.id);
        const next = this.nextMode();
        body = `Harika iş! Şimdi ${next === 'long' ? 'uzun' : 'kısa'} mola zamanı.${task ? ` (${task.text})` : ''}`;
      } else {
        body = 'Mola bitti. Yeni bir odak seansına hazır mısınız?';
      }
      Alerts.fire({ title: finished === 'focus' ? 'Odak seansı tamamlandı' : `${this.MODES[finished]} bitti`, body, tag: 'pomodoro', sticky: true, type: 'success' });
      this.setMode(this.nextMode(), { silent: true });
      if (Settings.get('autoStart')) this.toggle();
    },

    renderDots() {
      const every = Settings.get('longEvery');
      const justFinishedCycle = this.mode === 'long' && this.completed > 0 && this.completed % every === 0;
      const filled = justFinishedCycle ? every : this.completed % every;
      if (this.dotsEl.children.length !== every) this.dotsEl.replaceChildren(...Array.from({ length: every }, () => h('i')));
      Array.from(this.dotsEl.children).forEach((d, i) => d.classList.toggle('is-on', i < filled));
      this.dotsEl.setAttribute('aria-label', `Döngü ilerlemesi: ${filled} / ${every} odak seansı. Bugün toplam ${this.completed} seans tamamlandı.`);
    },

    renderTask() {
      const t = Tasks.active();
      this.taskEl.replaceChildren();
      if (t) this.taskEl.append('Aktif görev: ', h('strong', {}, t.text));
      else this.taskEl.textContent = 'Aktif görev seçilmedi';
    },

    render() {
      const secs = Math.ceil(this.cd.remaining / 1000);
      const text = fmtClock(secs);
      if (text !== this.lastShown) {
        this.lastShown = text;
        this.display.textContent = text;
        if (this.state === 'running' && shouldAnnounce(secs)) Announcer.say(`Kalan ${fmtSpoken(secs)}`);
      }
      this.ring.set(this.cd.total > 0 ? this.cd.remaining / this.cd.total : 0);
      const labels = { idle: 'Hazır', running: 'Çalışıyor', paused: 'Duraklatıldı' };
      this.stateEl.textContent = `${this.MODES[this.mode]} · ${labels[this.state]}`;
      setBtn(this.toggleBtn, this.state === 'running' ? 'pause' : 'play', this.state === 'running' ? 'Duraklat' : this.state === 'paused' ? 'Devam Et' : 'Başlat');
      this.renderDots();
      Title.setLive('pomodoro', this.state === 'running' ? `${text} · ${this.MODES[this.mode]}` : '');
    },

    /* --- Odak sesleri mikseri --- */
    initMixer() {
      $$('.mix-row').forEach((row) => {
        const type = row.dataset.noise;
        const sw = $('input[type="checkbox"]', row);
        const range = $('input[type="range"]', row);
        range.value = Settings.get('noiseVol')[type];
        paintRange(range);
        sw.addEventListener('change', () => {
          if (sw.checked) {
            if (!Noise.start(type)) {
              sw.checked = false;
              Toast.error('Ses başlatılamadı', 'Tarayıcınız Web Audio API desteklemiyor olabilir.');
              return;
            }
          } else {
            Noise.stop(type);
          }
          row.classList.toggle('is-on', sw.checked);
        });
        range.addEventListener('input', () => {
          paintRange(range);
          Settings.data.noiseVol[type] = Number(range.value);
          Noise.refresh(type);
        });
        range.addEventListener('change', () => Settings.save());
      });
    },
  };

  /* ------------------------------------------------------------------------
     16) Ayarlar modülü + Bildirim sesi stüdyosu
     ------------------------------------------------------------------------ */
  const SettingsModule = {
    previewKey: null,
    previewHandle: null,
    previewBtn: null,
    MAX_FILE: 2 * 1024 * 1024,

    init() {
      const bindSpin = (id, key) => new Spinner($(id), { value: Settings.get(key), onChange: (v) => Settings.set(key, v) });
      bindSpin('#set-focus', 'focus');
      bindSpin('#set-short', 'short');
      bindSpin('#set-long', 'long');
      bindSpin('#set-every', 'longEvery');

      const auto = $('#set-autostart');
      auto.checked = Settings.get('autoStart');
      auto.addEventListener('change', () => Settings.set('autoStart', auto.checked));

      const vol = $('#set-volume');
      const out = $('#set-volume-out');
      vol.value = Settings.get('volume');
      out.textContent = `${vol.value}%`;
      paintRange(vol);
      vol.addEventListener('input', () => { paintRange(vol); out.textContent = `${vol.value}%`; Settings.data.volume = Number(vol.value); });
      vol.addEventListener('change', () => { Settings.save(); this.preview('volume-test', Sounds.get(Settings.get('soundId')), null); });

      this.permBox = $('#perm-box');
      this.permText = $('#perm-text');
      this.permBtn = $('#perm-request');
      this.permBtn.addEventListener('click', async () => { await Notifier.ensurePermission(); this.renderPermission(); });
      Bus.on('permission', () => this.renderPermission());
      document.addEventListener('visibilitychange', () => { if (!document.hidden) this.renderPermission(); });
      window.addEventListener('focus', () => this.renderPermission());
      this.renderPermission();

      $('#test-notify').addEventListener('click', () => this.testNotify());

      this.listEl = $('#sound-list');
      this.usageEl = $('#studio-usage');
      this.renderSounds();

      $('#sound-url-form').addEventListener('submit', (e) => { e.preventDefault(); this.addUrl(); });
      $('#sound-url-preview').addEventListener('click', (e) => this.previewUrl(e.currentTarget));
      $('#sound-file').addEventListener('change', (e) => this.addFile(e.target));
    },

    renderPermission() {
      const state = Notifier.permission;
      const texts = {
        unsupported: 'Bu tarayıcı sistem bildirimlerini desteklemiyor. Ekran içi bildirimler ve sesler çalışmaya devam eder.',
        default: 'Bildirim izni henüz verilmedi. İlk alarm, zamanlayıcı veya Pomodoro başlatışınızda izin istenecek.',
        granted: 'Sistem bildirimleri açık. Süre dolduğunda masaüstü veya mobil bildirim alacaksınız.',
        denied: 'Bildirimler tarayıcıda engellenmiş. Adres çubuğundaki site ayarlarından izni açabilirsiniz.',
      };
      this.permBox.dataset.state = state;
      this.permText.textContent = texts[state];
      this.permBtn.parentElement.hidden = state !== 'default';
    },

    async testNotify() {
      Engine.ensure();
      const perm = await Notifier.ensurePermission();
      this.renderPermission();
      Alerts.fire({ title: 'NyxFocus testi', body: 'Bildirim ve ses sorunsuz çalışıyor.', tag: 'test', type: 'success' });
      if (perm === 'denied') Toast.info('Sistem bildirimi engelli', 'Ekran içi bildirim ve ses çalışıyor. Sistem bildirimi için tarayıcı izinlerini düzenleyin.');
      else if (perm === 'unsupported') Toast.info('Sistem bildirimi yok', 'Tarayıcınız sistem bildirimlerini desteklemiyor.');
    },

    /* --- Önizleme (tek seferde yalnızca bir ses) --- */
    stopPreview() {
      if (this.previewHandle) this.previewHandle.stop();
      this.previewHandle = null;
      if (this.previewBtn) { setBtn(this.previewBtn, 'play'); this.previewBtn.setAttribute('aria-pressed', 'false'); }
      this.previewBtn = null;
      this.previewKey = null;
    },

    preview(key, sound, btn) {
      const same = this.previewKey === key && btn;
      this.stopPreview();
      if (same || !sound) return;
      Engine.ensure();
      this.previewKey = key;
      this.previewBtn = btn;
      if (btn) { setBtn(btn, 'stop'); btn.setAttribute('aria-pressed', 'true'); }
      this.previewHandle = Engine.play(sound, {
        onEnd: () => { if (this.previewKey === key) this.stopPreview(); },
        onError: () => { if (this.previewKey === key) this.stopPreview(); Toast.error('Ses çalınamadı', 'Bağlantı erişilemiyor, CORS/biçim sorunu olabilir ya da dosya bozuk.'); },
      });
    },

    /* --- Ses listesi --- */
    renderSounds() {
      this.stopPreview();
      const selected = Settings.get('soundId');
      this.listEl.replaceChildren(...Sounds.all().map((s) => this.soundItem(s, s.id === selected)));
      const kb = Math.round(Sounds.usageBytes() / 1024);
      this.usageEl.textContent = `Özel sesler: ${kb} KB`;
    },

    soundItem(s, selected) {
      const tag = { builtin: 'Hazır', url: 'Bağlantı', file: 'Dosya' }[s.kind];
      const desc = s.kind === 'builtin' ? s.desc : s.kind === 'url' ? s.src : 'Cihazdan yüklendi';
      const radio = h('input', { type: 'radio', name: 'notif-sound', value: s.id, checked: selected, onchange: () => this.select(s) });
      const previewBtn = h('button', {
        type: 'button', class: 'icon-btn', 'aria-label': `${s.name} sesini önizle`, 'aria-pressed': 'false', title: 'Önizle / Dinle',
        onclick: (e) => this.preview('sound:' + s.id, s, e.currentTarget),
      }, icon('play'));
      return h('li', { class: `sound-item${selected ? ' is-selected' : ''}`, role: 'none' },
        h('label', { class: 'sound-pick' }, radio, h('span', { class: 'radio-ui', 'aria-hidden': 'true' }),
          h('span', { class: 'sound-meta' }, h('span', { class: 'sound-name' }, s.name), h('span', { class: 'sound-desc' }, desc))),
        h('span', { class: 'sound-tag' }, tag),
        previewBtn,
        s.kind !== 'builtin'
          ? h('button', {
            type: 'button', class: 'icon-btn is-danger', 'aria-label': `${s.name} sesini sil`, title: 'Sil',
            onclick: () => { Sounds.remove(s.id); this.renderSounds(); Toast.info('Ses silindi', s.name); },
          }, icon('trash'))
          : null);
    },

    select(sound) {
      Settings.set('soundId', sound.id);
      $$('.sound-item', this.listEl).forEach((li) => li.classList.toggle('is-selected', $('input', li).value === sound.id));
      Toast.success('Bildirim sesi seçildi', sound.name);
      this.stopPreview();
      this.previewKey = 'select:' + sound.id;
      this.previewHandle = Engine.play(sound, {
        onEnd: () => { if (this.previewKey === 'select:' + sound.id) this.previewKey = null; },
        onError: () => Toast.error('Ses çalınamadı', 'Bu ses yüklenemedi. Başka bir ses seçmeyi deneyin.'),
      });
    },

    /* --- MP3 bağlantısı --- */
    parseUrl() {
      const raw = $('#sound-url').value.trim();
      if (!raw) { Toast.warn('Bağlantı gerekli', 'Lütfen bir MP3 bağlantısı yapıştırın.'); $('#sound-url').focus(); return null; }
      let url;
      try { url = new URL(raw); } catch (e) { url = null; }
      if (!url || !/^https?:$/.test(url.protocol)) { Toast.error('Geçersiz bağlantı', 'Bağlantı http:// veya https:// ile başlamalıdır.'); $('#sound-url').focus(); return null; }
      if (location.protocol === 'https:' && url.protocol === 'http:') { Toast.error('Güvenli olmayan bağlantı', 'Bu sayfa https üzerinden açıldığı için yalnızca https bağlantıları çalınabilir.'); return null; }
      return url;
    },

    previewUrl(btn) {
      const url = this.parseUrl();
      if (!url) return;
      this.preview('draft-url', { kind: 'url', src: url.href, name: 'Önizleme' }, btn);
    },

    async addUrl() {
      const url = this.parseUrl();
      if (!url) return;
      const submit = $('#sound-url-form button[type="submit"]');
      submit.disabled = true;
      this.stopPreview();
      try {
        const ok = await Engine.probe(url.href);
        if (ok === false) { Toast.error('Ses yüklenemedi', 'Bağlantı bir ses dosyasına çıkmıyor ya da erişilemiyor.'); return; }
        let name = $('#sound-url-name').value.trim();
        if (!name) {
          const last = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || '');
          name = last.replace(/\.[a-z0-9]{2,4}$/i, '') || 'Özel ses';
        }
        const entry = { id: 'url-' + uid(), name: name.slice(0, 40), kind: 'url', src: url.href };
        if (!Sounds.add(entry)) { Toast.error('Kaydedilemedi', 'Tarayıcı depolama alanı dolu veya erişilemiyor.'); return; }
        $('#sound-url-name').value = '';
        $('#sound-url').value = '';
        this.renderSounds();
        Toast.success('Ses eklendi', ok === 'timeout' ? `${entry.name} (bağlantı doğrulanamadı, yine de eklendi). Seçmek için işaretleyin.` : `${entry.name} — kullanmak için listeden seçin.`);
      } finally {
        submit.disabled = false;
      }
    },

    /* --- Cihazdan dosya yükleme --- */
    addFile(input) {
      const file = input.files && input.files[0];
      if (!file) return;
      const textEl = $('#sound-file-text');
      const drop = input.closest('.file-drop');
      const reset = () => { input.value = ''; textEl.textContent = 'Dosya seçin'; drop.classList.remove('is-busy'); };

      const ext = (file.name.match(/\.([a-z0-9]+)$/i) || [])[1] || '';
      const isAudio = file.type.startsWith('audio/') || /^(mp3|wav|ogg|m4a|aac|flac|weba)$/i.test(ext);
      if (!isAudio) { Toast.error('Desteklenmeyen dosya', 'Lütfen bir ses dosyası (MP3 veya WAV) seçin.'); reset(); return; }
      if (file.size > this.MAX_FILE) {
        Toast.error('Dosya çok büyük', `En fazla 2 MB yükleyebilirsiniz (seçilen: ${(file.size / 1048576).toFixed(1)} MB). localStorage alanı sınırlıdır.`);
        reset();
        return;
      }

      textEl.textContent = `${file.name} okunuyor…`;
      drop.classList.add('is-busy');
      const reader = new FileReader();
      reader.onerror = () => { Toast.error('Dosya okunamadı', 'Dosya okunurken bir hata oluştu.'); reset(); };
      reader.onload = async () => {
        try {
          const mime = file.type.startsWith('audio/') ? file.type : (ext.toLowerCase() === 'wav' ? 'audio/wav' : 'audio/mpeg');
          const src = String(reader.result).replace(/^data:[^;,]*/, 'data:' + mime);
          const ok = await Engine.probe(src, 6000);
          if (ok === false) { Toast.error('Geçersiz ses dosyası', 'Dosya çalınamıyor veya bozuk olabilir.'); return; }
          const typed = $('#sound-file-name').value.trim();
          const name = (typed || file.name.replace(/\.[a-z0-9]+$/i, '') || 'Yüklenen ses').slice(0, 40);
          const entry = { id: 'file-' + uid(), name, kind: 'file', src };
          if (!Sounds.add(entry)) {
            Toast.error('Kaydedilemedi', 'localStorage kotası doldu. Önce eski özel seslerden birini silin ya da daha küçük bir dosya seçin.');
            return;
          }
          $('#sound-file-name').value = '';
          this.renderSounds();
          Toast.success('Ses yüklendi', `${name} — kullanmak için listeden seçin.`);
        } catch (e) {
          Toast.error('Yükleme başarısız', 'Dosya kaydedilirken beklenmeyen bir hata oluştu.');
        } finally {
          reset();
        }
      };
      try { reader.readAsDataURL(file); } catch (e) { Toast.error('Dosya okunamadı', 'Dosya okunurken bir hata oluştu.'); reset(); }
    },
  };

  /* ------------------------------------------------------------------------
     17) Başlatma
     ------------------------------------------------------------------------ */
  function boot() {
    Settings.init();
    Sounds.init();
    // Seçili ses silinmişse varsayılana dön
    if (!Sounds.get(Settings.get('soundId'))) Settings.set('soundId', DEFAULT_SOUND);

    Ambient.route = Router.parse() || Router.DEFAULT;
    Ambient.init();
    AlarmModule.init();
    TimerModule.init();
    Tasks.init();
    PomodoroModule.init();
    SettingsModule.init();
    Router.init();
    Clock.init();

    // Tarayıcı otomatik oynatma kısıtını ilk etkileşimde kaldır (izin penceresi AÇMAZ)
    const unlock = () => { Engine.ensure(); };
    ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, unlock, { once: true, passive: true }));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
