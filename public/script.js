document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('verify-form');
  const resultDiv = document.getElementById('result');
  const reportContainer = document.getElementById('report-container');
  const historyContainer = document.getElementById('history-container');
  const regBtn    = document.getElementById('register-btn');
  const regResult = document.getElementById('register-result');

  async function fetchReport(id) {
    const resp = await fetch(`/api/reports/${id}`);
    return resp.json();
  }

  function row(label, val) {
    const r = document.createElement('div');
    r.className = 'report-row';
    r.innerHTML = `<div class="report-label">${label}</div><div class="report-value">${val}</div>`;
    return r;
  }

  // ── Not-found state ──────────────────────────────────
  function renderNotFound(container, report) {
    container.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'not-found-state';
    wrap.innerHTML = `
      <div class="not-found-icon">⊘</div>
      <div class="not-found-title">No Such Person</div>
      <div class="not-found-meta">
        <span>${report.queriedIdType}</span>
        <span class="nf-sep">·</span>
        <span>${report.queriedIdValue}</span>
      </div>
      <div class="not-found-sub">
        This ID number does not match any record in the VERISYS registry.<br/>
        No verification can be performed.
      </div>
      <div class="not-found-actions">
        <a href="index.html" class="btn btn-primary" style="margin-top:0;max-width:220px">← Dashboard</a>
        <a href="register.html" class="btn" style="margin-top:0;max-width:220px;border:1px solid var(--border);background:var(--surface2);color:var(--text)">Register Person</a>
      </div>
    `;
    container.appendChild(wrap);
  }

  function renderReport(report, container) {
    container.innerHTML = '';

    // ── Not-found guard ──────────────────────────────
    if (report.notFound) {
      renderNotFound(container, report);
      return;
    }

    const doc = document.createElement('div');
    doc.className = 'report-document';

    doc.appendChild(row('Report ID', report.reportId));
    doc.appendChild(row('Person ID', report.personId || '—'));
    doc.appendChild(row('Queried ID', `${report.queriedIdType} / ${report.queriedIdValue}`));
    doc.appendChild(row('Timestamp', new Date(report.timestamp).toLocaleString()));

    if (!report.criminalEscalation) {
      const scoreRow = document.createElement('div');
      scoreRow.className = 'report-row';
      scoreRow.innerHTML = `
        <div class="report-label">Validity Score</div>
        <div class="report-value"><span class="score-value">${report.score}</span></div>
      `;
      doc.appendChild(scoreRow);
    }

    if (report.mismatches && report.mismatches.length) {
      const mRow = document.createElement('div');
      mRow.className = 'report-row';
      const ul = document.createElement('ul');
      ul.className = 'mismatch-list';
      report.mismatches.forEach(m => {
        const li = document.createElement('li');
        if (typeof m === 'string') {
          li.textContent = m;
        } else {
          li.innerHTML = `<strong>${m.field}</strong>: expected "${m.expected}" — got "${m.provided}"`;
        }
        ul.appendChild(li);
      });
      mRow.innerHTML = `<div class="report-label">Mismatches</div>`;
      const valDiv = document.createElement('div');
      valDiv.className = 'report-value';
      valDiv.style.display = 'block';
      valDiv.style.padding = '14px 20px';
      valDiv.appendChild(ul);
      mRow.appendChild(valDiv);
      doc.appendChild(mRow);
    }

    if (report.criminalEscalation) {
      const banner = document.createElement('div');
      banner.className = 'banner-escalation';
      banner.textContent = 'Escalation required — active criminal case detected';
      doc.appendChild(banner);
    }

    // ── Decision section ─────────────────────────────
    const decisionSection = document.createElement('div');
    decisionSection.className = 'decision-section';

    if (report.operatorDecision) {
      const verdictClass = report.operatorDecision === 'ALLOW' ? 'verdict-allow' : 'verdict-deny';
      decisionSection.innerHTML = `
        <div class="decision-section-title">Operator Decision</div>
        <div class="decision-result">
          <div class="decision-verdict ${verdictClass}">${report.operatorDecision}</div>
          ${report.operatorReason ? `<div style="margin-top:8px;font-size:.82rem;opacity:.7">${report.operatorReason}</div>` : ''}
          <div style="margin-top:12px;font-size:.75rem;opacity:.5;font-family:var(--font-mono)">by ${report.operatorId || '—'}</div>
        </div>
      `;
    } else {
      decisionSection.innerHTML = `<div class="decision-section-title">Operator Decision Required</div>`;
      const decisionForm = document.createElement('form');
      decisionForm.innerHTML = `
        <div class="field">
          <label>Operator ID</label>
          <input type="text" name="operatorId" required placeholder="OP-001" />
        </div>
        <div class="field">
          <label>Reason <span style="opacity:.5">(optional)</span></label>
          <textarea name="reason" placeholder="Add context..."></textarea>
        </div>
        <div class="decision-buttons">
          <button type="button" data-value="ALLOW" class="btn btn-approve">✓ Approve</button>
          <button type="button" data-value="DENY"  class="btn btn-deny">✗ Deny</button>
        </div>
      `;
      // FormData never captures which submit button was clicked — use explicit click handlers
      decisionForm.querySelectorAll('button[data-value]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const operatorId = decisionForm.querySelector('[name="operatorId"]').value.trim();
          if (!operatorId) {
            decisionForm.querySelector('[name="operatorId"]').focus();
            return;
          }
          const decision = btn.dataset.value;
          const reason   = decisionForm.querySelector('[name="reason"]').value.trim();
          btn.disabled = true;
          btn.textContent = 'Saving...';
          await fetch(`/api/reports/${report.reportId}/decision`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ operatorId, decision, reason })
          });
          window.location.href = 'history.html';
        });
      });
      decisionSection.appendChild(decisionForm);
    }

    doc.appendChild(decisionSection);
    container.appendChild(doc);
  }

  // ── Verify form ──────────────────────────────────────
  if (form) {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (resultDiv) resultDiv.innerHTML = '';
      const idType  = form.idType  ? form.idType.value  : '';
      const idValue = form.idValue ? form.idValue.value.trim() : '';
      const providedFields = {
        name:    form.name    ? form.name.value.trim()    : '',
        dob:     form.dob     ? form.dob.value             : '',
        address: form.address ? form.address.value.trim() : ''
      };
      const resp = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idType, idValue, providedFields })
      });
      const data = await resp.json();
      if (data.error) {
        if (resultDiv) resultDiv.textContent = 'Error: ' + data.error;
        return;
      }
      window.location.href = `report.html?id=${data.reportId}`;
    });
  }

  // ── Report page ──────────────────────────────────────
  if (reportContainer) {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (id) fetchReport(id).then(r => renderReport(r, reportContainer));
  }

  // ── History page ─────────────────────────────────────
  if (historyContainer) {
    fetch('/api/reports').then(r => r.json()).then(list => {
      if (!list.length) {
        historyContainer.innerHTML = `
          <div style="padding:48px 0;text-align:center;font-family:var(--font-mono);font-size:.78rem;
                      color:var(--text-dim);letter-spacing:2px;text-transform:uppercase;">
            No reports yet
          </div>`;
        return;
      }

      list.slice().reverse().forEach(rpt => {
        const card = document.createElement('a');
        card.className = 'history-card';
        card.href = `report.html?id=${rpt.reportId}`;

        if (rpt.notFound) {
          card.classList.add('history-not-found');
        } else if (rpt.operatorDecision === 'ALLOW') {
          card.classList.add('history-approved');
        } else if (rpt.operatorDecision === 'DENY') {
          card.classList.add('history-denied');
        }

        let decision, badgeClass;
        if (rpt.notFound) {
          decision   = 'Not Found';
          badgeClass = 'badge badge-not-found';
        } else if (rpt.operatorDecision === 'ALLOW') {
          decision   = 'Approved';
          badgeClass = 'badge badge-allow';
        } else if (rpt.operatorDecision === 'DENY') {
          decision   = 'Denied';
          badgeClass = 'badge badge-deny';
        } else {
          decision   = 'Pending';
          badgeClass = 'badge badge-pending';
        }

        const scoreDisplay = rpt.notFound ? '—' : (rpt.score !== null ? rpt.score : '—');

        card.innerHTML = `
          <div class="hc-cell">
            <div class="hc-label">Timestamp</div>
            <div class="hc-value">${new Date(rpt.timestamp).toLocaleString()}</div>
          </div>
          <div class="hc-cell">
            <div class="hc-label">Report ID</div>
            <div class="hc-value">${rpt.reportId}</div>
          </div>
          <div class="hc-cell">
            <div class="hc-label">ID Type</div>
            <div class="hc-value">${rpt.queriedIdType}</div>
          </div>
          <div class="hc-cell">
            <div class="hc-label">Score</div>
            <div class="hc-value">${scoreDisplay}</div>
          </div>
          <div class="hc-cell">
            <div class="hc-label">Decision</div>
            <div class="hc-value"><span class="${badgeClass}">${decision}</span></div>
          </div>
        `;
        historyContainer.appendChild(card);
      });
    });
  }

  // ── Registration page ────────────────────────────────
  if (regBtn) {
    regBtn.addEventListener('click', async () => {
      if (regResult) regResult.innerHTML = '';

      const name    = document.getElementById('reg-name')?.value.trim();
      const dob     = document.getElementById('reg-dob')?.value;
      const gender  = document.getElementById('reg-gender')?.value;
      const address = document.getElementById('reg-address')?.value.trim();
      const aadhaar = document.getElementById('reg-aadhaar')?.value.replace(/\s/g, '').trim();
      const pan     = document.getElementById('reg-pan')?.value.trim();
      const dl      = document.getElementById('reg-dl')?.value.trim();
      const passport= document.getElementById('reg-passport')?.value.trim();

      if (!name || !dob || !gender || !address || !aadhaar) {
        if (regResult) {
          regResult.innerHTML = `<div style="margin-top:14px;font-family:var(--font-mono);font-size:.8rem;color:var(--red);display:flex;align-items:center;gap:8px">
            <span>⚠</span> Fill in all required fields — Name, DOB, Gender, Address, and Aadhaar.
          </div>`;
        }
        return;
      }

      const payload = {
        name, dob, gender, address,
        ids: { Aadhaar: aadhaar }
      };
      if (pan)      payload.ids.PAN      = pan;
      if (dl)       payload.ids.DL       = dl;
      if (passport) payload.ids.Passport = passport;

      try {
        regBtn.disabled = true;
        regBtn.textContent = 'Enrolling...';

        const resp = await fetch('/api/persons', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const data = await resp.json();

        if (data.error) {
          if (regResult) regResult.innerHTML = `<div style="margin-top:14px;font-family:var(--font-mono);font-size:.8rem;color:var(--red)">⚠ ${data.error}</div>`;
        } else {
          const overlay = document.getElementById('register-overlay');
          const idEl    = document.getElementById('overlay-person-id');
          if (idEl)    idEl.textContent = 'Person ID: ' + data.personId;
          if (overlay) overlay.classList.remove('hidden');
        }
      } catch (err) {
        if (regResult) regResult.innerHTML = `<div style="margin-top:14px;font-family:var(--font-mono);font-size:.8rem;color:var(--red)">⚠ Network error — please try again.</div>`;
      } finally {
        regBtn.disabled = false;
        regBtn.textContent = 'Enroll Person →';
      }
    });
  }
});