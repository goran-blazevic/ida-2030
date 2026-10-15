/* Officials' cockpit: KPIs, submitted cases, call backs with context, bookings, content gaps */
(function ($) {
  'use strict';
  const IDA = window.IDA;
  let timer = null;
  const token = () => sessionStorage.getItem('ida.admin') || '';
  const opts = () => ({ headers: { 'x-admin-token': token() } });
  const time = (s) => (s ? new Date(s.replace(' ', 'T') + (s.includes('Z') ? '' : 'Z')).toLocaleString(IDA.locale()) : '');

  function table(cols, rows, empty) {
    if (!rows.length) return `<p class="text-muted">${IDA.t('empty')}</p>`;
    return `<div class="table-responsive"><table class="table table-ida align-middle"><thead><tr>${cols.map((c) => `<th scope="col">${c}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
  }

  async function load() {
    try {
      const r = await IDA.api('GET', '/api/admin/overview', undefined, opts());
      const k = r.counts || {};
      const kpi = (n, l, hot) => `<div class="col-6 col-md-4 col-xl-2"><div class="kpi${hot ? ' kpi-hot' : ''}"><div class="n">${n ?? 0}</div><div class="l">${l}</div></div></div>`;
      const cases = r.cases.map((c) => {
        const d = JSON.parse(c.data || '{}');
        const who = d.citizen ? `${d.citizen.first_name} ${d.citizen.last_name}` : c.citizen_id;
        return `<tr><td class="fw-bold">${IDA.esc(c.id)}</td><td>${IDA.esc(c.service)}</td><td>${IDA.esc(who)}</td><td>${time(c.created_at)}</td>
          <td><details><summary class="small">JSON</summary><pre class="ho-summary">${IDA.esc(JSON.stringify(d.form, null, 2))}</pre></details></td></tr>`;
      });
      const hos = r.handoffs.map((h) => `<tr><td><span class="badge ${h.status === 'open' ? 'text-bg-danger' : 'text-bg-secondary'}">${IDA.esc(h.status)}</span></td>
          <td>${IDA.esc(h.citizen_id)}<br><small class="text-muted">${IDA.esc(h.contact || '')}</small></td><td>${IDA.esc(h.reason)}</td>
          <td><pre class="ho-summary mb-0">${IDA.esc(h.summary)}</pre></td><td>${time(h.created_at)}</td>
          <td>${h.status === 'open' ? `<button class="btn btn-sm btn-outline-ink js-close" data-id="${h.id}">${IDA.t('close_handoff')}</button>` : ''}</td></tr>`);
      const books = r.bookings.map((b) => `<tr><td class="fw-bold">${IDA.esc(b.id)}</td><td>${IDA.esc(b.citizen_id)}</td><td>${IDA.esc(b.office_id)}</td><td>${IDA.fmtSlot(b.slot)}</td></tr>`);
      const gaps = r.low_confidence.map((g) => `<li>${IDA.esc(g.text)} <small class="text-muted">${time(g.created_at)}</small></li>`).join('');
      $('#admin-body').html(`
        <div class="row g-3 mb-4">
          ${kpi(k.cases, IDA.t('kpi_cases'))}${kpi(k.open_handoffs, IDA.t('kpi_handoffs'), true)}${kpi(k.bookings, IDA.t('kpi_bookings'))}
          ${kpi(k.notifications, IDA.t('kpi_notify'))}${kpi(k.turns, IDA.t('kpi_turns'))}${kpi(k.letters, IDA.t('kpi_letters'))}
        </div>
        <div class="ida-card mb-4"><h2 class="h5">${IDA.t('handoffs')}</h2>${table(['', 'Person', IDA.t('reason'), IDA.t('summary'), IDA.t('time'), ''], hos)}</div>
        <div class="row g-4">
          <div class="col-xl-7"><div class="ida-card h-100"><h2 class="h5">${IDA.t('cases')}</h2>${table([IDA.t('reference'), IDA.t('service'), 'Person', IDA.t('time'), ''], cases)}</div></div>
          <div class="col-xl-5"><div class="ida-card mb-4"><h2 class="h5">${IDA.t('bookings')}</h2>${table([IDA.t('reference'), 'Person', 'Office', IDA.t('time')], books)}</div>
            <div class="ida-card"><h2 class="h5">${IDA.t('low_conf')}</h2>${gaps ? `<ul class="mb-0">${gaps}</ul>` : `<p class="text-muted mb-0">${IDA.t('empty')}</p>`}</div></div>
        </div>`);
      clearTimeout(timer);
      timer = setTimeout(load, 15000); // live refresh during the demo
    } catch (e) {
      $('#admin-body').html(`<div class="alert alert-warning">${e.status === 401 ? 'Token?' : IDA.t('error')}</div>`);
    }
  }

  $(document).on('ida:ready', function () { if (token()) load(); });
  $(document).on('ida:settings', function () { if (token()) load(); });

  $(function () {
    $('#token').val(token());
    $('#token-form').on('submit', (e) => { e.preventDefault(); sessionStorage.setItem('ida.admin', $('#token').val()); load(); });
    $('#admin-body').on('click', '.js-close', async function () {
      try { await IDA.api('POST', `/api/admin/handoffs/${$(this).data('id')}/close`, {}, opts()); load(); } catch (e) { IDA.toast(IDA.t('error'), 'danger'); }
    });
  });
})(jQuery);
