document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('verify-form');
  const resultDiv = document.getElementById('result');
  const reportContainer = document.getElementById('report-container');
  const historyContainer = document.getElementById('history-container');

  // common helpers
  async function fetchReport(id) {
    const resp = await fetch(`/api/reports/${id}`);
    return resp.json();
  }

  function renderReport(report, container) {
    container.innerHTML = '';
    const doc = document.createElement('div');
    doc.className = 'report-document';

    const addLine = (label, val) => {
      const p = document.createElement('p');
      p.innerHTML = `<strong>${label}:</strong> ${val}`;
      doc.appendChild(p);
    };

    addLine('Report ID', report.reportId);
    addLine('Person ID', report.personId || '-');
    addLine('Queried ID', `${report.queriedIdType}/${report.queriedIdValue}`);
    addLine('Timestamp', new Date(report.timestamp).toLocaleString());

    if (!report.criminalEscalation) {
      addLine('Validity score', report.score);
    }

    if (report.mismatches && report.mismatches.length) {
      const p = document.createElement('p');
      p.innerHTML = '<strong>Mismatches:</strong>';
      doc.appendChild(p);
      const ul = document.createElement('ul');
      ul.className = 'mismatch-list';
      report.mismatches.forEach(m => {
        const li = document.createElement('li');
        if (typeof m === 'string') {
          li.textContent = m;
        } else {
          li.innerHTML = `<strong>${m.field}</strong>: expected "${m.expected}" but got "${m.provided}"`;
        }
        ul.appendChild(li);
      });
      doc.appendChild(ul);
    }

    if (report.criminalEscalation) {
      const banner = document.createElement('div');
      banner.className = 'banner-escalation';
      banner.innerHTML = '<strong>Escalation required:</strong> active criminal case detected.';
      doc.appendChild(banner);
    }

    // decision section (always present)
    const decisionArea = document.createElement('div');
    if (report.operatorDecision) {
      decisionArea.innerHTML = `<p><strong>Decision:</strong> ${report.operatorDecision}` +
        (report.operatorReason ? `<br><em>${report.operatorReason}</em>` : '') +
        ` by <strong>${report.operatorId || '-'}</strong></p>`;
    } else {
      const decisionForm = document.createElement('form');
      decisionForm.innerHTML = `
        <label>Operator ID</label>
        <input type="text" name="operatorId" required />
        <div class="decision-buttons">
          <button type="submit" name="decision" value="ALLOW" class="big-button">APPROVE</button>
          <button type="submit" name="decision" value="DENY" class="big-button">DENY</button>
        </div>
        <label>Reason</label>
        <textarea name="reason" rows="2"></textarea>
      `;
      decisionForm.addEventListener('submit', async e => {
        e.preventDefault();
        const formData = new FormData(decisionForm);
        const operatorId = formData.get('operatorId');
        const decision = formData.get('decision');
        const reason = formData.get('reason').trim();
        await fetch(`/api/reports/${report.reportId}/decision`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ operatorId, decision, reason })
        });
        // after decision, send user back to home
        window.location.href = 'index.html';
      });
      decisionArea.appendChild(decisionForm);
    }
    doc.appendChild(decisionArea);

    container.appendChild(doc);
  }

  // verify form submission (present on ID pages)
  if (form) {
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (resultDiv) resultDiv.innerHTML = '';
      const idType = form.idType ? form.idType.value : '';
      const idValue = form.idValue.value.trim();
      const providedFields = {
        name: form.name ? form.name.value.trim() : '',
        dob: form.dob ? form.dob.value : '',
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
      const { reportId } = data;
      // navigate to report page
      window.location.href = `report.html?id=${reportId}`;
    });
  }

  // report page logic
  if (reportContainer) {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (id) {
      fetchReport(id).then(report => renderReport(report, reportContainer));
    }
  }

  // history page logic
  if (historyContainer) {
    fetch('/api/reports').then(r => r.json()).then(list => {
      list.forEach(rpt => {
        const card = document.createElement('div');
        card.className = 'history-card';
        if (rpt.operatorDecision === 'ALLOW') card.classList.add('history-approved');
        if (rpt.operatorDecision === 'DENY') card.classList.add('history-denied');
        card.innerHTML = `
          <p><strong>Time:</strong> ${new Date(rpt.timestamp).toLocaleString()}</p>
          <p><strong>ID:</strong> ${rpt.reportId}</p>
          <p><strong>Form:</strong> ${rpt.queriedIdType}</p>
          <p><strong>Validity:</strong> ${rpt.score !== null ? rpt.score : '-'}</p>
          <p><strong>Decision:</strong> ${rpt.operatorDecision || '-'}</p>
          <p><strong>By:</strong> ${rpt.operatorId || '-'}</p>
          <a href="report.html?id=${rpt.reportId}">view</a>
        `;
        historyContainer.appendChild(card);
      });
    });
  }
});
