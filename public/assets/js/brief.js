/* Letters & deadlines: Postkorb list, AI letter explainer, deadline stamp, calendar file */
(function ($) {
  'use strict';
  const IDA = window.IDA;
  let letters = [], file = null;

  const chip = (l) => {
    if (l.days_left === null) return `<span class="dl-chip dl-calm">${IDA.t('no_deadline')}</span>`;
    if (l.days_left < 0) return `<span class="dl-chip dl-calm">${IDA.t('deadline_over')}</span>`;
    const cls = l.days_left <= 3 ? 'dl-red' : l.days_left <= 10 ? 'dl-amber' : 'dl-calm';
    return `<span class="dl-chip ${cls}"><i class="bi bi-alarm" aria-hidden="true"></i> ${IDA.t('deadline_in', { d: l.days_left })}</span>`;
  };

  function renderList() {
    $('#letters').html(letters.map((l) => `
      <button type="button" class="letter-item" data-id="${l.id}">
        <i class="bi ${l.delivery === 'RSb' ? 'bi-envelope-check' : 'bi-envelope'}" aria-hidden="true"></i>
        <span><span class="sender">${IDA.esc(l.sender)} · ${IDA.t('delivered_on')} ${IDA.fmtDate(l.delivered_at)}${l.delivery === 'RSb' ? ' · RSb' : ''}</span>
        <span class="subject">${IDA.esc(l.subject)}</span>${chip(l)}</span>
      </button>`).join(''));
  }

  async function load() {
    try { letters = (await IDA.api('GET', '/api/letters')).letters; renderList(); } catch (e) { IDA.toast(IDA.t('error'), 'danger'); }
  }

  function loading() {
    $('#lt-result').html(`<div class="d-flex align-items-center gap-3 py-5 justify-content-center"><div class="spinner-border text-rot" role="status"></div><span>${IDA.t('analyzing')}</span></div>`);
  }

  async function explain(fd) {
    fd.append('lang', IDA.settings.lang);
    fd.append('simple', String(!!IDA.settings.simple));
    loading();
    try {
      render(await IDA.api('POST', '/api/letters/explain', fd));
    } catch (e) {
      $('#lt-result').html(`<div class="alert alert-warning">${IDA.esc(e.message || IDA.t('error'))}</div>`);
    }
  }

  function render(r) {
    const days = r.deadline_date ? Math.round((new Date(r.deadline_date + 'T12:00:00') - new Date()) / 864e5) : null;
    const stamp = r.deadline_date
      ? `<div class="stamp thump" aria-label="${IDA.t('stamp_label')} ${IDA.fmtDate(r.deadline_date)}"><span class="stamp-label">${IDA.t('stamp_label')}</span><span class="stamp-date">${new Date(r.deadline_date + 'T12:00:00').toLocaleDateString(IDA.locale())}</span><span class="stamp-days">${days >= 0 ? IDA.t('deadline_in', { d: days }) : IDA.t('deadline_over')}</span></div>`
      : `<div class="stamp stamp-ok thump"><span class="stamp-label">${IDA.t('stamp_label')}</span><span class="stamp-date">–</span><span class="stamp-days">${IDA.t('no_deadline')}</span></div>`;
    const amount = r.amount_eur ? `<div><div class="small text-muted">${IDA.t('amount')}</div><div class="amount">€ ${Number(r.amount_eur).toLocaleString(IDA.locale(), { minimumFractionDigits: 2 })}</div></div>` : '';
    const icon = { pay: 'bi-credit-card', send_documents: 'bi-file-earmark-arrow-up', appeal: 'bi-shield-exclamation', reply: 'bi-reply', appointment: 'bi-calendar-check', nothing: 'bi-check2', ask_human: 'bi-person-raised-hand' };
    const actions = (r.actions || []).map((a) => `<li${a.kind === 'ask_human' ? ' class="js-human" role="button" tabindex="0"' : ''}><i class="bi ${icon[a.kind] || 'bi-dot'}" aria-hidden="true"></i>${IDA.esc(a.label)}</li>`).join('');
    const uncertain = (r.uncertain || []).length ? `<div class="callout"><strong>${IDA.t('uncertain')}:</strong> ${r.uncertain.map(IDA.esc).join(', ')}</div>` : '';
    const reply = r.reply_draft ? `<details class="mt-3"><summary class="fw-bold">${IDA.t('reply_draft')}</summary>
        <textarea class="form-control mt-2" rows="6" id="reply-text">${IDA.esc(r.reply_draft)}</textarea>
        <button class="btn btn-sm btn-outline-ink mt-2" id="reply-copy"><i class="bi bi-clipboard" aria-hidden="true"></i> ${IDA.t('copy')}</button></details>` : '';
    const raw = r.letter ? `<details class="mt-3"><summary class="small">${IDA.esc(r.letter.subject)}</summary><div class="letter-raw mt-2">${IDA.esc(r.letter.body)}</div></details>` : '';
    const ics = r.deadline_date ? `/api/letters/calendar.ics?${$.param({ title: `${IDA.t('stamp_label')}: ${r.subject || ''}`, date: r.deadline_date, desc: r.summary_plain || '' })}` : null;

    $('#lt-result').html(`
      <div class="result-head mb-3">
        <div><span class="kicker">${IDA.esc(r.sender || '')}</span><h2 class="h3 mb-1">${IDA.esc(r.subject || '')}</h2>${IDA.confBadge(r.confidence)}</div>
        <div class="d-flex align-items-center gap-4">${amount}${stamp}</div>
      </div>
      <h3 class="h5 mt-4">${IDA.t('what_means')}</h3>
      <p class="fs-5">${IDA.esc(r.summary_plain)}</p>
      <h3 class="h5 mt-4">${IDA.t('todo')}</h3>
      <ul class="todo-list">${actions}</ul>
      ${r.consequences ? `<div class="callout"><strong>${IDA.t('if_nothing')}:</strong> ${IDA.esc(r.consequences)}</div>` : ''}
      ${uncertain}
      <div class="d-flex flex-wrap gap-2 mt-4 no-explain">
        ${ics ? `<a class="btn btn-ink" href="${ics}"><i class="bi bi-calendar-plus" aria-hidden="true"></i> ${IDA.t('add_calendar')}</a>` : ''}
        ${r.deadline_date ? `<button class="btn btn-outline-ink" id="sms"><i class="bi bi-phone-vibrate" aria-hidden="true"></i> ${IDA.t('remind_sms')}</button>` : ''}
        <button class="btn btn-outline-ink" id="speak-letter"><i class="bi bi-volume-up" aria-hidden="true"></i> ${IDA.t('read_aloud')}</button>
        <a class="btn btn-outline-ink" href="/assistant.html?${$.param({ q: `${r.subject}: ${r.summary_plain}` })}"><i class="bi bi-chat-dots" aria-hidden="true"></i> ${IDA.t('ask_ida')}</a>
      </div>
      ${reply}${raw}`);
    IDA.speak(r.summary_plain);
    $('#speak-letter').on('click', () => IDA.speak(r.summary_plain + ' ' + (r.actions || []).map((a) => a.label).join('. '), true));
    $('#sms').on('click', () => IDA.toast(IDA.t('remind_set'), 'success'));
    $('#reply-copy').on('click', async () => { try { await navigator.clipboard.writeText($('#reply-text').val()); IDA.toast(IDA.t('copied'), 'success'); } catch (e) {} });
    $('.js-human').on('click keydown', (e) => { if (e.type === 'click' || e.key === 'Enter') IDA.openHandoff(); });
  }

  $(document).on('ida:ready', load);
  $(document).on('ida:settings', renderList);

  $(function () {
    $('#letters').on('click', '.letter-item', function () {
      $('.letter-item').removeClass('active');
      $(this).addClass('active');
      const fd = new FormData();
      fd.append('letterId', $(this).data('id'));
      explain(fd);
    });
    $('#lt-file').on('change', async function () {
      const f = this.files[0];
      if (!f) return;
      file = await IDA.prepareImage(f);
      $('#lt-filename').text(f.name);
    });
    const $dz = $('#dropzone');
    $dz.on('dragover', (e) => { e.preventDefault(); $dz.addClass('is-over'); })
      .on('dragleave drop', () => $dz.removeClass('is-over'))
      .on('drop', async (e) => {
        e.preventDefault();
        const f = e.originalEvent.dataTransfer.files[0];
        if (f) { file = await IDA.prepareImage(f); $('#lt-filename').text(f.name); }
      });
    $('#lt-analyze').on('click', function () {
      const fd = new FormData();
      const text = $('#lt-text').val().trim();
      if (file) fd.append('file', file);
      else if (text) fd.append('text', text);
      else return IDA.toast(IDA.t('no_letter'));
      $('.letter-item').removeClass('active');
      explain(fd);
    });
  });
})(jQuery);
