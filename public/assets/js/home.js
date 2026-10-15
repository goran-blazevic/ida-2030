/* Home: "What happened?" intent box, examples, proactive nudges */
(function ($) {
  'use strict';
  const IDA = window.IDA;

  async function go(text) {
    text = String(text || '').trim();
    if (!text) return $('#intent-input').trigger('focus');
    try {
      const r = await IDA.api('POST', '/api/intent', { text: text });
      if (r.route === 'handoff') return IDA.openHandoff();
      location.href = r.route + '?q=' + encodeURIComponent(text);
    } catch (e) {
      location.href = '/assistant.html?q=' + encodeURIComponent(text);
    }
  }

  function renderNudges() {
    const list = IDA.nudges || [];
    const html = list.map((n) => {
      if (n.kind === 'passport') {
        const msg = n.days < 0 ? IDA.t('nudge_passport_exp') : IDA.t('nudge_passport', { d: n.days });
        return `<div class="nudge"><i class="bi bi-passport" aria-hidden="true"></i><p>${IDA.esc(msg)}</p><a class="btn btn-rot btn-sm" href="${n.href}">${IDA.t('nudge_open')}</a></div>`;
      }
      if (n.kind === 'letters') {
        const msg = IDA.t('nudge_letters', { n: n.count, d: n.next.days_left });
        return `<div class="nudge"><i class="bi bi-envelope-exclamation" aria-hidden="true"></i><p>${IDA.esc(msg)}</p><a class="btn btn-rot btn-sm" href="${n.href}">${IDA.t('nudge_open')}</a></div>`;
      }
      return '';
    }).join('');
    $('#nudges').html(html);
    $('#nudge-wrap').prop('hidden', !html);
  }

  $(document).on('ida:ready', function () {
    renderNudges();
    if (IDA.citizen) IDA.speak(IDA.t('hello', { n: IDA.citizen.first_name }));
  });
  $(document).on('ida:settings', renderNudges);

  $(function () {
    $('#intent-form').on('submit', (e) => { e.preventDefault(); go($('#intent-input').val()); });
    $('#examples').on('click', '.chip', function () { $('#intent-input').val($(this).text()); go($(this).text()); });
    $('#intent-mic').on('click', function () {
      IDA.toggleRecording($(this), (text) => { $('#intent-input').val(text); go(text); });
    });
    $('#tile-human').on('click', (e) => { e.preventDefault(); IDA.openHandoff(); });
  });
})(jQuery);
