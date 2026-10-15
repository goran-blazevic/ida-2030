/* Passport: status, checklist, AI photo pre-check, appointment finder across offices, QR counter pass */
(function ($) {
  'use strict';
  const IDA = window.IDA;
  let status = null, photo = null, photoState = 'unknown', stream = null, selected = null;
  const CK = ['ck_passport', 'ck_photo', 'ck_id', 'ck_pay', 'ck_visit'];
  const ckKey = () => 'ida.pp.ck.' + IDA.settings.persona;
  const ck = () => JSON.parse(localStorage.getItem(ckKey()) || '{}');

  function renderStatus() {
    if (!status) return;
    let html;
    if (!status.eligible) html = `<div class="nudge"><i class="bi bi-globe2" aria-hidden="true"></i><p>${IDA.t('not_eligible')}</p><button class="btn btn-rot btn-sm js-human">${IDA.t('human_btn')}</button></div>`;
    else {
      const d = status.days_left;
      const line = d === null ? '' : d < 0 ? IDA.t('expired') : IDA.t('expires_in', { d: d });
      html = `<div class="nudge"><i class="bi bi-passport" aria-hidden="true"></i><p>${IDA.t('eligible')} ${IDA.esc(line)}</p>
        <a class="small" href="${status.source}" target="_blank" rel="noopener">${IDA.t('step_source')}</a></div>`;
    }
    $('#pp-status').html(html);
    $('#pp-status .js-human').on('click', IDA.openHandoff);
  }

  function renderChecklist() {
    const c = ck();
    $('#pp-checklist').html(CK.map((k) => `<div class="form-check mb-2"><input class="form-check-input" type="checkbox" id="${k}" ${c[k] ? 'checked' : ''}><label class="form-check-label" for="${k}">${IDA.t(k)}</label></div>`).join(''));
  }

  function renderCriteria(results) {
    const map = {};
    (results || []).forEach((r) => (map[r.id] = r));
    const icon = { pass: 'bi-check-circle-fill', fail: 'bi-x-circle-fill', unsure: 'bi-question-circle-fill' };
    return `<ul class="crit">${(status ? status.criteria : []).map((c) => {
      const r = map[c.id];
      return `<li><i class="bi ${r ? icon[r.status] : 'bi-circle'}" aria-hidden="true"></i><span>${IDA.esc(c.label)}${r && r.note ? `<br><small class="text-muted">${IDA.esc(r.note)}</small>` : ''}</span></li>`;
    }).join('')}</ul>`;
  }

  function setPhoto(fileOrBlob) {
    photo = fileOrBlob;
    $('#photo-stage').html(`<img alt="" src="${URL.createObjectURL(fileOrBlob)}"><div class="oval"></div>`);
    $('#photo-check').prop('disabled', false);
  }

  async function startCam() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 960, height: 1280 } });
      $('#photo-stage').html('<video autoplay playsinline muted></video><div class="oval"></div>');
      $('#photo-stage video')[0].srcObject = stream;
      $('#cam-shot').removeClass('d-none');
    } catch (e) { IDA.toast(IDA.t('error'), 'danger'); }
  }

  function shot() {
    const v = $('#photo-stage video')[0];
    if (!v) return;
    const c = document.createElement('canvas');
    c.width = 700; c.height = 900; // 35:45
    const ratio = 35 / 45, vw = v.videoWidth, vh = v.videoHeight;
    let sw = vw, sh = vw / ratio;
    if (sh > vh) { sh = vh; sw = vh * ratio; }
    c.getContext('2d').drawImage(v, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, c.width, c.height);
    stream.getTracks().forEach((t) => t.stop());
    $('#cam-shot').addClass('d-none');
    c.toBlob((b) => setPhoto(new File([b], 'photo.jpg', { type: 'image/jpeg' })), 'image/jpeg', 0.9);
  }

  async function checkPhoto() {
    if (!photo) return;
    $('#photo-result').html(`<div class="d-flex gap-2 align-items-center"><div class="spinner-border spinner-border-sm text-rot" role="status"></div>${IDA.t('checking')}</div>`);
    const fd = new FormData();
    fd.append('file', photo);
    fd.append('lang', IDA.settings.lang);
    try {
      const r = await IDA.api('POST', '/api/passport/photo-check', fd);
      photoState = r.overall;
      const head = { ok: ['alert-success', 'photo_ok'], retake: ['alert-danger', 'photo_retake'], unsure: ['alert-warning', 'photo_unsure'] }[r.overall] || ['alert-warning', 'photo_unsure'];
      $('#photo-result').html(`<div class="alert ${head[0]} fw-bold mb-2">${IDA.t(head[1])}</div>${r.tip ? `<p class="small">${IDA.esc(r.tip)}</p>` : ''}${renderCriteria(r.results)}`);
      if (r.overall === 'ok') { $('#ck_photo').prop('checked', true).trigger('change'); }
      IDA.speak(IDA.t(head[1]) + '. ' + (r.tip || ''));
    } catch (e) { $('#photo-result').html(`<div class="alert alert-warning">${IDA.t('error')}</div>`); }
  }

  async function loadOffices(postal) {
    $('#offices').html('<div class="spinner-border spinner-border-sm text-rot" role="status"></div>');
    try {
      const r = await IDA.api('GET', '/api/passport/offices', { postal: postal });
      $('#offices').html(r.offices.map((o) => `
        <div class="office" data-office="${o.id}">
          <h3>${IDA.esc(o.name)}</h3><div class="addr">${IDA.esc(o.address)}</div>
          <div class="small fw-bold mt-2">${IDA.t('next_slot')}: ${o.next ? IDA.fmtSlot(o.next) : '–'}</div>
          <div class="d-flex flex-wrap gap-1 mt-2">${o.slots.slice(0, 4).map((s) => `<button type="button" class="slot" data-office="${o.id}" data-slot="${s}">${IDA.fmtSlot(s)}</button>`).join('')}</div>
          <button type="button" class="btn btn-rot btn-sm w-100 mt-2 js-book d-none" data-office="${o.id}"><i class="bi bi-calendar-check" aria-hidden="true"></i> ${IDA.t('book')}</button>
        </div>`).join(''));
    } catch (e) { $('#offices').html(`<div class="alert alert-warning">${IDA.t('error')}</div>`); }
  }

  async function book(officeId) {
    if (!selected || selected.office !== officeId) return;
    try {
      const r = await IDA.withSession((sid) => IDA.api('POST', '/api/passport/book', { sessionId: sid, officeId: officeId, slot: selected.slot, checklist: ck(), photo: photoState }));
      $('#pass-ref').text(r.reference);
      $('#pass-office').text(r.office.name + ' · ' + r.office.address);
      $('#pass-slot').text(IDA.fmtSlot(r.slot));
      $('#qr').empty();
      if (window.QRCode) new QRCode(document.getElementById('qr'), { text: JSON.stringify(r.summary), width: 180, height: 180, correctLevel: QRCode.CorrectLevel.M });
      $('#pass-wrap').prop('hidden', false)[0].scrollIntoView({ behavior: 'smooth' });
      IDA.toast(IDA.t('booked'), 'success');
      IDA.speak(`${IDA.t('booked')}. ${IDA.fmtSlot(r.slot)}. ${r.office.name}.`);
    } catch (e) { IDA.toast(IDA.t('error'), 'danger'); }
  }

  $(document).on('ida:ready', async function () {
    renderChecklist();
    try {
      status = await IDA.api('GET', '/api/passport/status', { citizenId: IDA.settings.persona, lang: IDA.settings.lang });
      renderStatus();
      $('#photo-result').html(renderCriteria());
      $('#office-postal').val(status.postal);
      if (status.eligible) loadOffices(status.postal);
      else $('#offices').html(`<p class="text-muted">${IDA.t('not_eligible')}</p>`);
    } catch (e) { IDA.toast(IDA.t('error'), 'danger'); }
  });
  $(document).on('ida:settings', function () { renderStatus(); renderChecklist(); });

  $(function () {
    $('#pp-checklist').on('change', 'input', function () { const c = ck(); c[this.id] = this.checked; localStorage.setItem(ckKey(), JSON.stringify(c)); });
    $('#cam-start').on('click', startCam);
    $('#cam-shot').on('click', shot);
    $('#photo-file').on('change', async function () { if (this.files[0]) setPhoto(await IDA.prepareImage(this.files[0], 1200)); });
    $('#photo-check').on('click', checkPhoto);
    $('#office-form').on('submit', (e) => { e.preventDefault(); loadOffices($('#office-postal').val()); });
    $('#offices').on('click', '.slot', function () {
      $('.slot').removeClass('selected');
      $('.js-book').addClass('d-none');
      $(this).addClass('selected');
      selected = { office: $(this).data('office'), slot: $(this).data('slot') };
      $(`.js-book[data-office="${selected.office}"]`).removeClass('d-none');
    });
    $('#offices').on('click', '.js-book', function () { book($(this).data('office')); });
  });
})(jQuery);
