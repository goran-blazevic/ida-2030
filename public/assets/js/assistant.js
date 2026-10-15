/* Assistant: chat with the ida agent (Bedrock), draft card, confirm flow */
(function ($) {
  'use strict';
  const IDA = window.IDA;
  let busy = false;

  function add(role, html) {
    const $m = $(`<div class="msg msg-${role}"></div>`).html(html);
    $('#chat').append($m);
    $('#chat').scrollTop($('#chat')[0].scrollHeight);
  }

  async function send(text) {
    text = String(text || '').trim();
    if (!text || busy) return;
    busy = true;
    add('user', IDA.esc(text));
    $('#quick').empty();
    $('#typing').prop('hidden', false);
    try {
      const res = await IDA.withSession((sid) => IDA.api('POST', '/api/chat', { sessionId: sid, text: text, lang: IDA.settings.lang, simple: IDA.settings.simple }));
      render(res);
    } catch (e) {
      add('system', IDA.esc(IDA.t('error')));
    } finally {
      $('#typing').prop('hidden', true);
      busy = false;
      $('#msg').trigger('focus');
    }
  }

  function render(res) {
    const src = (res.sources || []).length
      ? `<details><summary>${IDA.t('sources')}</summary><ul class="mb-0">${res.sources.map((u) => `<li><a href="${IDA.esc(u)}" target="_blank" rel="noopener">${IDA.esc(u.replace(/^https?:\/\/(www\.)?/, ''))}</a></li>`).join('')}</ul></details>`
      : '';
    add('bot', `<p>${IDA.esc(res.message).replace(/\n/g, '<br>')}</p>${IDA.confBadge(res.confidence)}${src}`);
    IDA.speak(res.message);
    $('#quick').html((res.quick_replies || []).map((q) => `<button type="button" class="chip">${IDA.esc(q)}</button>`).join(''));
    if (res.draft) renderDraft(res.draft);
    if (res.handoff) add('system', IDA.esc(IDA.t('ho_done')));
  }

  function renderDraft(d) {
    const rows = Object.entries(d.data).map(([k, v]) => `<tr><th scope="row">${IDA.esc(d.labels[k] || k)}</th><td>${IDA.esc(v)}</td></tr>`).join('');
    const missing = d.missing.length ? `<div class="callout"><strong>${IDA.t('missing')}:</strong> ${d.missing.map((k) => IDA.esc(d.labels[k] || k)).join(', ')}</div>` : '';
    const ready = !d.missing.length && !(d.errors || []).length;
    $('#draft').prop('hidden', false).html(`
      <span class="kicker" data-i18n="draft_title">${IDA.t('draft_title')}</span>
      <h2 class="h4" id="draft-title">${IDA.esc(d.title)}</h2>
      <table class="table table-sm draft-table mb-2"><tbody>${rows}</tbody></table>${missing}
      ${ready ? `<button class="btn btn-rot btn-lg w-100 mt-3" id="confirm"><i class="bi bi-check2-circle" aria-hidden="true"></i> ${IDA.t('confirm_submit')}</button>` : ''}`);
    $('#confirm').on('click', () => confirmDraft(d.id));
  }

  async function confirmDraft(id) {
    try {
      const out = await IDA.withSession((sid) => IDA.api('POST', `/api/drafts/${id}/confirm`, { sessionId: sid }));
      const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' }));
      $('#draft').html(`<div class="text-center py-3">
        <div class="stamp stamp-ok thump"><span class="stamp-label">${IDA.t('submitted')}</span><span class="stamp-date">${IDA.esc(out.reference)}</span></div>
        <p class="mt-4"><a class="btn btn-outline-ink" href="${url}" download="${out.reference}.json"><i class="bi bi-download" aria-hidden="true"></i> ${IDA.t('download_json')}</a></p></div>`);
      IDA.speak(IDA.t('submitted') + ' ' + out.reference.split('').join(' '));
    } catch (e) {
      add('system', IDA.esc(IDA.t('error')));
    }
  }

  $(document).on('ida:ready', function () {
    const name = IDA.citizen ? IDA.citizen.first_name : '';
    add('bot', `<p>${IDA.esc(IDA.t('hello', { n: name }))}</p>`);
    const q = IDA.param('q');
    if (q) send(q);
  });

  $(function () {
    $('#composer').on('submit', (e) => { e.preventDefault(); const v = $('#msg').val(); $('#msg').val(''); send(v); });
    $('#quick').on('click', '.chip', function () { send($(this).text()); });
    $('#mic').on('click', function () { IDA.toggleRecording($(this), send); });
  });
})(jQuery);
