/* ida 2030 – shared frontend logic (jQuery + Bootstrap 5)
   - settings (language, plain language, large text, read aloud, persona)
   - i18n, header/footer/widgets injection
   - API helper + session handling
   - voice: ElevenLabs via our Worker, browser fallback
   - "Explain this page" offcanvas + human handoff modal */
(function ($) {
  'use strict';

  const LANGS = [
    { code: 'de', label: 'Deutsch', speech: 'de-AT' },
    { code: 'en', label: 'English', speech: 'en-GB' },
    { code: 'bcs', label: 'BCS (bos/hrv/srp)', speech: 'hr-HR' },
    { code: 'tr', label: 'Türkçe', speech: 'tr-TR' },
    { code: 'ar', label: 'العربية', speech: 'ar-SA', rtl: true },
    { code: 'uk', label: 'Українська', speech: 'uk-UA' }
  ];
  const PERSONAS = [
    { id: 'anna', label: 'Anna Huber, 78 · Wien' },
    { id: 'ali', label: 'Ali Rahimi, 34 · Graz' },
    { id: 'max', label: 'Max Berger, 22 · Wien' }
  ];
  const DEFAULTS = { lang: 'de', simple: false, big: false, speak: true, persona: 'anna' };

  const IDA = (window.IDA = {
    settings: Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem('ida.settings') || '{}')),
    status: { bedrock: false, voice: false, demo: true },
    citizen: null,
    LANGS: LANGS
  });

  /* ---------- helpers ---------- */
  IDA.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  IDA.uiLang = () => (['de', 'en', 'bcs'].includes(IDA.settings.lang) ? IDA.settings.lang : 'en');
  IDA.t = (key, vars) => {
    const dict = window.IDA_I18N[IDA.uiLang()] || window.IDA_I18N.en;
    let s = dict[key] ?? window.IDA_I18N.en[key] ?? key;
    if (vars) Object.keys(vars).forEach((k) => (s = s.replace('{' + k + '}', vars[k])));
    return s;
  };
  IDA.locale = () => ({ de: 'de-AT', en: 'en-GB', bcs: 'hr-HR', tr: 'tr-TR', ar: 'ar', uk: 'uk-UA' }[IDA.settings.lang] || 'de-AT');
  IDA.fmtDate = (iso) => (iso ? new Date(iso.length === 10 ? iso + 'T12:00:00' : iso).toLocaleDateString(IDA.locale(), { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
  IDA.fmtSlot = (iso) => new Date(iso).toLocaleString(IDA.locale(), { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  IDA.param = (k) => new URLSearchParams(location.search).get(k);
  IDA.saveSettings = () => localStorage.setItem('ida.settings', JSON.stringify(IDA.settings));

  IDA.toast = function (msg, kind) {
    const $t = $(`<div class="toast align-items-center border-0 text-bg-${kind || 'dark'}" role="status" aria-live="polite">
      <div class="d-flex"><div class="toast-body">${IDA.esc(msg)}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="${IDA.t('close')}"></button></div></div>`);
    $('#ida-toasts').append($t);
    new bootstrap.Toast($t[0], { delay: 4000 }).show();
    $t.on('hidden.bs.toast', () => $t.remove());
  };

  /* ---------- API ---------- */
  IDA.api = function (method, path, data, opts) {
    const o = Object.assign({ url: path, method: method, dataType: 'json' }, opts || {});
    if (data instanceof FormData) Object.assign(o, { data: data, processData: false, contentType: false });
    else if (data !== undefined && method !== 'GET') Object.assign(o, { data: JSON.stringify(data), contentType: 'application/json' });
    else if (data !== undefined) o.data = data;
    return new Promise((resolve, reject) => {
      $.ajax(o).done(resolve).fail((xhr) => {
        const err = new Error((xhr.responseJSON && (xhr.responseJSON.message || xhr.responseJSON.error)) || xhr.statusText || 'error');
        err.status = xhr.status;
        reject(err);
      });
    });
  };

  const sessionKey = () => 'ida.session.' + IDA.settings.persona;
  IDA.ensureSession = async function (force) {
    let sid = !force && localStorage.getItem(sessionKey());
    if (sid) return sid;
    const r = await IDA.api('POST', '/api/session', { citizenId: IDA.settings.persona, lang: IDA.settings.lang });
    localStorage.setItem(sessionKey(), r.sessionId);
    IDA.citizen = r.citizen;
    return r.sessionId;
  };
  // run fn(sessionId); if the session vanished on the server, create a new one and retry once
  IDA.withSession = async function (fn) {
    const sid = await IDA.ensureSession();
    try {
      return await fn(sid);
    } catch (e) {
      if (e.status === 404 && /session/i.test(e.message)) return fn(await IDA.ensureSession(true));
      throw e;
    }
  };

  /* ---------- voice ---------- */
  let audio = null;
  IDA.stopSpeaking = function () {
    if (audio) audio.pause();
    if (window.speechSynthesis) speechSynthesis.cancel();
  };
  IDA.speak = async function (text, force) {
    if ((!IDA.settings.speak && !force) || !text) return;
    IDA.stopSpeaking();
    if (IDA.status.voice) {
      try {
        const r = await fetch('/api/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: text }) });
        if (r.ok) {
          audio = new Audio(URL.createObjectURL(await r.blob()));
          return audio.play().catch(() => {});
        }
      } catch (e) { /* fall through to browser voice */ }
    }
    if (window.speechSynthesis) {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = (LANGS.find((l) => l.code === IDA.settings.lang) || LANGS[0]).speech;
      u.rate = IDA.settings.simple ? 0.9 : 1;
      speechSynthesis.speak(u);
    }
  };

  // Toggle recording on a button. Calls onText(text) with the transcript.
  let rec = null, chunks = [], recog = null;
  IDA.toggleRecording = async function ($btn, onText) {
    if (rec && rec.state === 'recording') return rec.stop();
    if (recog) { recog.stop(); return; }
    IDA.stopSpeaking();
    if (IDA.status.voice && window.MediaRecorder) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        rec = new MediaRecorder(stream);
        chunks = [];
        rec.ondataavailable = (e) => chunks.push(e.data);
        rec.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop());
          $btn.removeClass('is-recording').attr('aria-pressed', 'false');
          const fd = new FormData();
          fd.append('audio', new Blob(chunks, { type: rec.mimeType }), 'speech.webm');
          try {
            const r = await IDA.api('POST', '/api/stt', fd);
            if (r.text) onText(r.text);
          } catch (e) { IDA.toast(IDA.t('error'), 'danger'); }
        };
        rec.start();
        $btn.addClass('is-recording').attr('aria-pressed', 'true');
        IDA.toast(IDA.t('listening'));
        return;
      } catch (e) { /* mic blocked: try browser recognition */ }
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return IDA.toast(IDA.t('error'), 'danger');
    recog = new SR();
    recog.lang = (LANGS.find((l) => l.code === IDA.settings.lang) || LANGS[0]).speech;
    recog.onresult = (e) => onText(e.results[0][0].transcript);
    recog.onend = () => { $btn.removeClass('is-recording').attr('aria-pressed', 'false'); recog = null; };
    recog.start();
    $btn.addClass('is-recording').attr('aria-pressed', 'true');
    IDA.toast(IDA.t('listening'));
  };

  // Downscale photos before upload (faster, cheaper, below Bedrock limits)
  IDA.prepareImage = function (file, maxSide) {
    maxSide = maxSide || 1600;
    if (!file.type.startsWith('image/')) return Promise.resolve(file);
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        c.toBlob((b) => resolve(new File([b], 'upload.jpg', { type: 'image/jpeg' })), 'image/jpeg', 0.85);
      };
      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });
  };

  IDA.confBadge = function (c) {
    if (!c) return '';
    const icon = { high: 'bi-patch-check-fill', medium: 'bi-patch-question-fill', low: 'bi-exclamation-octagon-fill' }[c];
    return `<span class="conf conf-${c}"><i class="bi ${icon}" aria-hidden="true"></i> ${IDA.t('conf_' + c)}</span>`;
  };

  /* ---------- layout injection ---------- */
  function headerHtml() {
    const path = location.pathname === '/' ? '/index.html' : location.pathname;
    const links = [
      ['/index.html', 'nav_home', 'bi-house-door'], ['/umzug.html', 'nav_moving', 'bi-box-seam'],
      ['/brief.html', 'nav_letters', 'bi-envelope-paper'], ['/reisepass.html', 'nav_passport', 'bi-passport'],
      ['/assistant.html', 'nav_assistant', 'bi-chat-dots'], ['/admin.html', 'nav_admin', 'bi-building']
    ].map(([href, key, icon]) => `<li class="nav-item"><a class="nav-link${path === href ? ' active' : ''}" ${path === href ? 'aria-current="page"' : ''} href="${href}"><i class="bi ${icon}" aria-hidden="true"></i> <span data-i18n="${key}"></span></a></li>`).join('');
    const langOpts = LANGS.map((l) => `<option value="${l.code}">${l.label}</option>`).join('');
    const personaOpts = PERSONAS.map((p) => `<option value="${p.id}">${p.label}</option>`).join('');
    return `
    <a class="skip-link" href="#main" data-i18n="skip"></a>
    <div class="rwr" aria-hidden="true"></div>
    <nav class="navbar navbar-expand-lg ida-nav" aria-label="Hauptnavigation">
      <div class="container-xl">
        <a class="navbar-brand" href="/index.html"><span class="brand-ida">ida</span><span class="brand-year">2030</span>
          <span class="brand-tag d-none d-xl-inline" data-i18n="brand_tag"></span></a>
        <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#idaNav" aria-controls="idaNav" aria-expanded="false" aria-label="Menu">
          <span class="navbar-toggler-icon"></span></button>
        <div class="collapse navbar-collapse" id="idaNav">
          <ul class="navbar-nav me-auto">${links}</ul>
          <div class="d-flex flex-wrap gap-2 align-items-center py-2 py-lg-0">
            <label class="visually-hidden" for="ida-lang" data-i18n="lang_label"></label>
            <select id="ida-lang" class="form-select form-select-sm ida-select">${langOpts}</select>
            <div class="dropdown">
              <button class="btn btn-outline-ink btn-sm dropdown-toggle" type="button" data-bs-toggle="dropdown" data-bs-auto-close="outside" aria-expanded="false">
                <i class="bi bi-sliders" aria-hidden="true"></i> <span data-i18n="settings"></span></button>
              <div class="dropdown-menu dropdown-menu-end p-3 ida-settings">
                <div class="form-check form-switch mb-2"><input class="form-check-input" type="checkbox" role="switch" id="set-simple"><label class="form-check-label" for="set-simple" data-i18n="simple"></label></div>
                <div class="form-check form-switch mb-2"><input class="form-check-input" type="checkbox" role="switch" id="set-big"><label class="form-check-label" for="set-big" data-i18n="big"></label></div>
                <div class="form-check form-switch mb-3"><input class="form-check-input" type="checkbox" role="switch" id="set-speak"><label class="form-check-label" for="set-speak" data-i18n="speak"></label></div>
                <label class="form-label small text-muted mb-1" for="set-persona" data-i18n="persona"></label>
                <select id="set-persona" class="form-select form-select-sm">${personaOpts}</select>
              </div>
            </div>
          </div>
        </div>
      </div>
    </nav>
    <div id="ida-demo" class="demo-strip d-none" role="note"><div class="container-xl"><i class="bi bi-info-circle" aria-hidden="true"></i> <span data-i18n="demo_badge"></span></div></div>`;
  }

  function widgetsHtml() {
    return `
    <div class="fab-stack no-explain">
      <button type="button" class="btn btn-fab btn-paper" id="fab-explain"><i class="bi bi-magic" aria-hidden="true"></i> <span data-i18n="explain_btn"></span></button>
      <button type="button" class="btn btn-fab btn-rot" id="fab-human"><i class="bi bi-person-raised-hand" aria-hidden="true"></i> <span data-i18n="human_btn"></span></button>
    </div>

    <div class="offcanvas offcanvas-end ida-offcanvas no-explain" tabindex="-1" id="ida-explain" aria-labelledby="ida-explain-title">
      <div class="offcanvas-header"><h2 class="offcanvas-title h4" id="ida-explain-title" data-i18n="explain_title"></h2>
        <button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button></div>
      <div class="offcanvas-body" id="ida-explain-body" aria-live="polite"></div>
    </div>

    <div class="modal fade no-explain" id="ida-handoff" tabindex="-1" aria-labelledby="ida-handoff-title" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered"><div class="modal-content ida-modal">
        <div class="modal-header"><h2 class="modal-title h4" id="ida-handoff-title" data-i18n="ho_title"></h2>
          <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
        <div class="modal-body">
          <p data-i18n="ho_text"></p>
          <form id="ho-form">
            <label class="form-label" for="ho-phone" data-i18n="ho_phone"></label>
            <input class="form-control form-control-lg mb-3" id="ho-phone" type="tel" autocomplete="tel">
            <fieldset class="mb-3"><legend class="form-label fs-6" data-i18n="ho_when"></legend>
              <div class="btn-group w-100" role="group">
                <input type="radio" class="btn-check" name="ho-when" id="ho-m" value="morning"><label class="btn btn-outline-ink" for="ho-m" data-i18n="ho_morning"></label>
                <input type="radio" class="btn-check" name="ho-when" id="ho-a" value="afternoon"><label class="btn btn-outline-ink" for="ho-a" data-i18n="ho_afternoon"></label>
                <input type="radio" class="btn-check" name="ho-when" id="ho-x" value="any" checked><label class="btn btn-outline-ink" for="ho-x" data-i18n="ho_any"></label>
              </div></fieldset>
            <button class="btn btn-rot btn-lg w-100" type="submit"><i class="bi bi-telephone-inbound" aria-hidden="true"></i> <span data-i18n="ho_send"></span></button>
          </form>
          <div id="ho-done" class="d-none">
            <div class="alert alert-success d-flex gap-2"><i class="bi bi-check-circle-fill" aria-hidden="true"></i><span data-i18n="ho_done"></span></div>
            <h3 class="h6" data-i18n="ho_summary"></h3><pre class="ho-summary" id="ho-summary"></pre>
          </div>
          <p class="small text-muted mt-3 mb-0"><span data-i18n="hotline"></span>: +43 50 233770 (Mo–Fr 8–16)</p>
        </div>
      </div></div>
    </div>
    <div id="ida-toasts" class="toast-container position-fixed top-0 end-0 p-3 no-explain"></div>`;
  }

  function footerHtml() {
    return `<footer class="ida-footer no-explain"><div class="container-xl d-flex flex-wrap justify-content-between gap-2">
      <span data-i18n="footer"></span>
      <span><a href="https://www.oesterreich.gv.at" target="_blank" rel="noopener">oesterreich.gv.at</a></span></div></footer>`;
  }

  /* ---------- settings + i18n ---------- */
  IDA.applyI18n = function (root) {
    const $r = $(root || document);
    $r.find('[data-i18n]').each(function () { $(this).text(IDA.t($(this).data('i18n'))); });
    $r.find('[data-i18n-ph]').each(function () { $(this).attr('placeholder', IDA.t($(this).data('i18n-ph'))); });
    $r.find('[data-i18n-aria]').each(function () { $(this).attr('aria-label', IDA.t($(this).data('i18n-aria'))); });
  };

  IDA.applySettings = function () {
    const s = IDA.settings;
    const lang = LANGS.find((l) => l.code === s.lang) || LANGS[0];
    $('html').attr('lang', s.lang === 'bcs' ? 'hr' : s.lang).attr('dir', lang.rtl ? 'rtl' : 'ltr');
    $('body').toggleClass('text-big', !!s.big).toggleClass('plain', !!s.simple);
    $('#ida-lang').val(s.lang);
    $('#set-simple').prop('checked', !!s.simple);
    $('#set-big').prop('checked', !!s.big);
    $('#set-speak').prop('checked', !!s.speak);
    $('#set-persona').val(s.persona);
    IDA.applyI18n();
  };

  function bindSettings() {
    $('#ida-lang').on('change', function () { IDA.settings.lang = this.value; IDA.saveSettings(); IDA.applySettings(); $(document).trigger('ida:settings'); });
    $('#set-simple').on('change', function () { IDA.settings.simple = this.checked; IDA.saveSettings(); IDA.applySettings(); $(document).trigger('ida:settings'); });
    $('#set-big').on('change', function () { IDA.settings.big = this.checked; IDA.saveSettings(); IDA.applySettings(); });
    $('#set-speak').on('change', function () { IDA.settings.speak = this.checked; IDA.saveSettings(); if (!this.checked) IDA.stopSpeaking(); });
    $('#set-persona').on('change', function () { IDA.settings.persona = this.value; IDA.saveSettings(); location.reload(); });
  }

  /* ---------- explain this page ---------- */
  async function explainPage() {
    const $b = $('#ida-explain-body');
    $b.html(`<div class="d-flex align-items-center gap-3 py-4"><div class="spinner-border text-rot" role="status"></div><span>${IDA.t('explain_loading')}</span></div>`);
    bootstrap.Offcanvas.getOrCreateInstance('#ida-explain').show();
    const $clone = $('main').clone();
    $clone.find('.no-explain, script, style, form, button, select, input, textarea').remove();
    const text = $clone.text().replace(/\s+/g, ' ').trim();
    try {
      const c = IDA.citizen || {};
      const r = await IDA.api('POST', '/api/explain', {
        text: document.title + '. ' + text, lang: IDA.settings.lang, simple: true,
        profile: c.first_name ? { name: c.first_name, city: c.city, nationality: c.nationality, passport_expiry: c.passport_expiry } : null
      });
      const points = (r.key_points || []).map((p) => `<li>${IDA.esc(p)}</li>`).join('');
      const terms = (r.terms || []).map((x) => `<dt>${IDA.esc(x.term)}</dt><dd>${IDA.esc(x.explanation)}</dd>`).join('');
      $b.html(`
        <p class="lead">${IDA.esc(r.summary)}</p>
        ${points ? `<ul class="explain-points">${points}</ul>` : ''}
        ${r.for_me ? `<div class="callout"><h3 class="h6">${IDA.t('explain_for_me')}</h3><p class="mb-0">${IDA.esc(r.for_me)}</p></div>` : ''}
        ${terms ? `<h3 class="h6 mt-4">${IDA.t('explain_terms')}</h3><dl class="terms">${terms}</dl>` : ''}
        <button class="btn btn-outline-ink mt-3" id="explain-speak"><i class="bi bi-volume-up" aria-hidden="true"></i> ${IDA.t('read_aloud')}</button>`);
      $('#explain-speak').on('click', () => IDA.speak([r.summary].concat(r.key_points || []).join('. '), true));
    } catch (e) {
      $b.html(`<div class="alert alert-warning">${IDA.t('error')}</div>`);
    }
  }

  /* ---------- human handoff ---------- */
  IDA.openHandoff = function () {
    $('#ho-form').removeClass('d-none');
    $('#ho-done').addClass('d-none');
    bootstrap.Modal.getOrCreateInstance('#ida-handoff').show();
  };
  function bindHandoff() {
    $('#fab-human').on('click', IDA.openHandoff);
    $('#ho-form').on('submit', async function (e) {
      e.preventDefault();
      const contact = [$('#ho-phone').val(), $('input[name=ho-when]:checked').val()].filter(Boolean).join(' · ');
      try {
        const r = await IDA.withSession((sid) => IDA.api('POST', '/api/handoff', { sessionId: sid, contact: contact, page: document.title }));
        $('#ho-summary').text(r.summary);
      } catch (err) { $('#ho-summary').text(document.title); }
      $('#ho-form').addClass('d-none');
      $('#ho-done').removeClass('d-none');
      IDA.speak(IDA.t('ho_done'));
    });
  }

  /* ---------- boot ---------- */
  $(async function () {
    $('#ida-header').html(headerHtml());
    $('#ida-footer').html(footerHtml());
    $('body').append(widgetsHtml());
    IDA.applySettings();
    bindSettings();
    bindHandoff();
    $('#fab-explain').on('click', explainPage);
    try {
      IDA.status = await IDA.api('GET', '/api/status');
      $('#ida-demo').toggleClass('d-none', !IDA.status.demo);
    } catch (e) { /* backend not reachable */ }
    try {
      const me = await IDA.api('GET', '/api/me', { citizenId: IDA.settings.persona });
      IDA.citizen = me.citizen;
      IDA.nudges = me.nudges;
    } catch (e) { /* ignore */ }
    $(document).trigger('ida:ready');
  });
})(jQuery);
