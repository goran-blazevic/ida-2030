/* Moving: Life Event Navigator. One form -> personal plan in 3 lanes, pre-filled Meldung, simulated Once-Only notify */
(function ($) {
  'use strict';
  const IDA = window.IDA;
  let plan = null, reference = null;
  const doneKey = () => 'ida.moving.done.' + IDA.settings.persona;
  const done = () => JSON.parse(localStorage.getItem(doneKey()) || '{}');
  const setDone = (id, v) => { const d = done(); d[id] = v; localStorage.setItem(doneKey(), JSON.stringify(d)); };
  const L = () => (IDA.settings.lang === 'de' ? 'de' : 'en');

  function stepHtml(s) {
    const d = done();
    const isDone = s.lane === 'auto' || !!d[s.id];
    const deadline = s.deadline ? `<span class="badge-deadline"><i class="bi bi-alarm" aria-hidden="true"></i> ${IDA.fmtDate(s.deadline)}</span>` : '';
    let action = '';
    if (s.action === 'template') action = `<button class="btn btn-sm btn-outline-ink js-copy" data-id="${s.id}"><i class="bi bi-clipboard" aria-hidden="true"></i> ${IDA.t('copy_template')}</button>`;
    if (s.lane === 'you') action += `<div class="form-check ms-auto"><input class="form-check-input js-done" type="checkbox" id="d-${s.id}" data-id="${s.id}" ${d[s.id] ? 'checked' : ''}><label class="form-check-label small" for="d-${s.id}">${IDA.t('done_mark')}</label></div>`;
    if (s.action === 'confirm_meldung') action = `<div id="meldung-draft" class="w-100"></div>`;
    if (s.action === 'notify') action = `<span class="small fw-bold js-notify-state" data-id="${s.id}">${d[s.id] ? '<i class="bi bi-check-circle-fill text-success"></i> ' + IDA.t('notified') : ''}</span>`;
    return `<article class="step${isDone ? ' is-done' : ''}" data-step="${s.id}">
      <h4><span>${IDA.esc(s.title[L()])}</span>${deadline}</h4>
      <p>${IDA.esc(s.detail[L()])}</p>
      <div class="meta"><span><i class="bi bi-building" aria-hidden="true"></i> ${IDA.esc(s.authority)}</span>
        <a href="${IDA.esc(s.source)}" target="_blank" rel="noopener">${IDA.t('step_source')}</a></div>
      ${action ? `<div class="d-flex flex-wrap gap-2 align-items-center mt-2">${action}</div>` : ''}
    </article>`;
  }

  function render() {
    if (!plan) return;
    $('#plan-empty').prop('hidden', true).addClass('d-none');
    $('#plan').prop('hidden', false);
    $('#plan-deadline').text(IDA.fmtDate(plan.meldung_deadline));
    $('#plan-stamp').removeClass('thump');
    void $('#plan-stamp')[0].offsetWidth;
    $('#plan-stamp').addClass('thump');
    ['ida', 'auto', 'you'].forEach((lane) => $('#lane-' + lane).html(plan.steps.filter((s) => s.lane === lane).map(stepHtml).join('')));
    renderDraft();
    $('#notify-box').removeClass('d-none');
    $('#notify-btn').prop('disabled', !(reference && $('#consent').prop('checked')));
    progress();
  }

  function renderDraft() {
    const d = plan.draft;
    if (reference) {
      $('#meldung-draft').html(`<div class="stamp stamp-ok"><span class="stamp-label">${IDA.t('submitted')}</span><span class="stamp-date">${IDA.esc(reference)}</span></div>`);
      return;
    }
    const rows = Object.entries(d.data).map(([k, v]) => `<tr><th scope="row">${IDA.esc(d.labels[k] || k)}</th><td>${IDA.esc(k === 'residence_type' ? IDA.t(v) : v)}</td></tr>`).join('');
    const missing = d.missing.length ? `<div class="callout">${IDA.t('missing')}: ${d.missing.map((k) => IDA.esc(d.labels[k] || k)).join(', ')}</div>` : '';
    $('#meldung-draft').html(`<details class="mt-1" open><summary class="fw-bold">${IDA.t('meldung_check')}</summary>
      <table class="table table-sm draft-table mt-2 mb-2"><tbody>${rows}</tbody></table>${missing}</details>
      ${d.missing.length ? '' : `<button class="btn btn-rot w-100" id="meldung-confirm"><i class="bi bi-check2-circle" aria-hidden="true"></i> ${IDA.t('confirm_submit')}</button>`}`);
  }

  function progress() {
    const all = plan.steps.length;
    const d = done();
    const n = plan.steps.filter((s) => s.lane === 'auto' || d[s.id] || (s.id === 'meldung' && reference)).length;
    $('#plan-bar').css('width', Math.round((n / all) * 100) + '%');
    $('#plan-count').text(`${n} / ${all} ${IDA.t('progress')}`);
  }

  async function build(e) {
    e.preventDefault();
    const f = e.target;
    if (!f.checkValidity()) { f.classList.add('was-validated'); return; }
    const body = {
      new_street: $('#f-street').val().trim(), new_postal_code: $('#f-postal').val().trim(), new_city: $('#f-city').val().trim(),
      move_in_date: $('#f-date').val(), residence_type: $('#f-type').val(),
      host_name: $('#f-host').val().trim(), host_address: $('#f-hostaddr').val().trim(),
      has_car: $('#x-car').prop('checked'), plate_changes: $('#x-plate').prop('checked'), has_dog: $('#x-dog').prop('checked'),
      employed: $('#x-emp').prop('checked'), unemployed: $('#x-ams').prop('checked'), student: $('#x-stu').prop('checked'),
      children: Number($('#x-kids').val() || 0)
    };
    const $btn = $(f).find('[type=submit]').prop('disabled', true);
    try {
      plan = await IDA.withSession((sid) => IDA.api('POST', '/api/life/moving', Object.assign({ sessionId: sid }, body)));
      reference = null;
      localStorage.removeItem(doneKey());
      render();
      $('#plan')[0].scrollIntoView({ behavior: 'smooth', block: 'start' });
      IDA.speak(`${IDA.t('plan_title')}. ${IDA.t('plan_deadline')} ${IDA.fmtDate(plan.meldung_deadline)}.`);
    } catch (err) {
      IDA.toast(IDA.t('error'), 'danger');
    } finally { $btn.prop('disabled', false); }
  }

  async function confirmMeldung() {
    try {
      const out = await IDA.withSession((sid) => IDA.api('POST', `/api/drafts/${plan.draft.id}/confirm`, { sessionId: sid }));
      reference = out.reference;
      setDone('meldung', true);
      render();
      $('[data-step=meldung]').addClass('just-done');
      IDA.speak(IDA.t('submitted') + ' ' + reference.split('').join(' '));
    } catch (e) { IDA.toast(IDA.t('error'), 'danger'); }
  }

  async function notifyAll() {
    const targets = plan.steps.filter((s) => s.action === 'notify');
    try {
      await IDA.withSession((sid) => IDA.api('POST', '/api/life/notify', { sessionId: sid, reference: reference, targets: targets.map((t) => t.authority) }));
      targets.forEach((t, i) => setTimeout(() => {
        setDone(t.id, true);
        const $s = $(`[data-step=${t.id}]`).addClass('is-done just-done');
        $s.find('.js-notify-state').html(`<i class="bi bi-check-circle-fill text-success" aria-hidden="true"></i> ${IDA.t('notified')}`);
        progress();
      }, 350 * i));
      $('#notify-btn').prop('disabled', true);
    } catch (e) { IDA.toast(IDA.t('error'), 'danger'); }
  }

  $(document).on('ida:ready', function () {
    const c = IDA.citizen;
    if (c) $('#mv-current').text(`${c.street}, ${c.postal_code} ${c.city}`);
    const q = IDA.param('q');
    if (q) IDA.toast('“' + q + '”');
  });
  $(document).on('ida:settings', render);

  $(function () {
    $('#f-date').val(new Date().toISOString().slice(0, 10));
    $('#x-car').on('change', function () { $('#x-plate-wrap').toggleClass('d-none', !this.checked); });
    $('#mv-form').on('submit', build);
    $('#plan').on('click', '#meldung-confirm', confirmMeldung);
    $('#consent').on('change', function () { $('#notify-btn').prop('disabled', !(reference && this.checked)); });
    $('#notify-btn').on('click', notifyAll);
    $('#plan').on('change', '.js-done', function () {
      setDone($(this).data('id'), this.checked);
      $(this).closest('.step').toggleClass('is-done', this.checked);
      progress();
    });
    $('#plan').on('click', '.js-copy', async function () {
      const txt = (plan.templates || {})[$(this).data('id')] || '';
      try { await navigator.clipboard.writeText(txt); IDA.toast(IDA.t('copied'), 'success'); } catch (e) { window.prompt('', txt); }
    });
  });
})(jQuery);
