const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const DATA_DIR = path.join(__dirname, 'data');

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

function readJson(filename, defaultValue) {
  try {
    const content = fs.readFileSync(path.join(DATA_DIR, filename), 'utf8');
    return JSON.parse(content);
  } catch (e) {
    return defaultValue;
  }
}

function writeJson(filename, data) {
  fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(data, null, 2));
}

// POST /api/verify
app.post('/api/verify', (req, res) => {
  const { idType, idValue, providedFields, operatorId } = req.body;
  if (!idType || !idValue) {
    return res.status(400).json({ error: 'missing idType/idValue' });
  }

  const people = readJson('people.json', []);

  let person = null;
  people.forEach(p => {
    if (p.ids && p.ids.some(i => i.type === idType && i.value === idValue)) {
      person = p;
    }
  });

  const now = new Date().toISOString();
  const reportId = uuidv4();

  let score = null;
  let mismatches = [];
  let criminalEscalation = false;
  const notFound = !person;

  if (person) {
    if (person.criminalRecords && person.criminalRecords.some(r => r.status === 'active')) {
      criminalEscalation = true;
    }

    if (!criminalEscalation) {
      if (providedFields.name && person.name && providedFields.name.toLowerCase() !== person.name.toLowerCase()) {
        mismatches.push({ field: 'name', expected: person.name, provided: providedFields.name });
        score = (score === null ? 100 : score) - 30;
      }
      if (providedFields.dob && person.dob && providedFields.dob !== person.dob) {
        mismatches.push({ field: 'dob', expected: person.dob, provided: providedFields.dob });
        score = (score === null ? 100 : score) - 20;
      }
      if (providedFields.address && person.address && providedFields.address.toLowerCase() !== person.address.toLowerCase()) {
        mismatches.push({ field: 'address', expected: person.address, provided: providedFields.address });
        score = (score === null ? 100 : score) - 10;
      }
      if (score === null) score = 100;
      score = Math.max(0, Math.min(100, score));
    }
  }
  // notFound → score stays null, no decision needed

  const history = readJson('history.json', []);
  const entry = {
    reportId,
    personId: person ? person.id : null,
    queriedIdType: idType,
    queriedIdValue: idValue,
    timestamp: now,
    score,
    mismatches,
    criminalEscalation,
    notFound,
    operatorId: operatorId || null,
    operatorDecision: null,
    operatorReason: null,
    decisionTimestamp: null
  };
  history.push(entry);
  writeJson('history.json', history);

  res.json({ reportId });
});

// GET /api/reports/:id
app.get('/api/reports/:id', (req, res) => {
  const id = req.params.id;
  const history = readJson('history.json', []);
  const entry = history.find(e => e.reportId === id);
  if (!entry) return res.status(404).json({ error: 'not found' });
  res.json(entry);
});

// POST /api/reports/:id/decision
app.post('/api/reports/:id/decision', (req, res) => {
  const id = req.params.id;
  const { operatorId, decision, reason } = req.body;
  const history = readJson('history.json', []);
  const entry = history.find(e => e.reportId === id);
  if (!entry) return res.status(404).json({ error: 'not found' });
  entry.operatorId = operatorId || entry.operatorId;
  entry.operatorDecision = decision;
  entry.operatorReason = reason || null;
  entry.decisionTimestamp = new Date().toISOString();
  writeJson('history.json', history);
  res.json({ success: true });
});

// GET /api/reports
app.get('/api/reports', (req, res) => {
  const history = readJson('history.json', []);
  res.json(history);
});


// DELETE /api/reports — clear all history
app.delete('/api/reports', (req, res) => {
  writeJson('history.json', []);
  res.json({ success: true });
});
// POST /api/persons
// Frontend sends: { name, dob, gender, address, ids: { Aadhaar, PAN, DL, Passport } }
app.post('/api/persons', (req, res) => {
  const { name, dob, gender, address, ids: idsObj } = req.body;

  if (!name || !dob || !address || !idsObj || !idsObj.Aadhaar) {
    return res.status(400).json({ error: 'name, dob, address, and Aadhaar are required' });
  }

  const people = readJson('people.json', []);

  // Check for duplicate Aadhaar
  const cleanAadhaar = idsObj.Aadhaar.replace(/\s/g, '');
  const duplicate = people.find(p =>
    p.ids && p.ids.some(i => i.type === 'Aadhaar' && i.value === cleanAadhaar)
  );
  if (duplicate) {
    return res.status(409).json({ error: 'A person with this Aadhaar number is already registered.' });
  }

  const personId = 'person-' + Date.now();

  const ids = [{ type: 'Aadhaar', value: cleanAadhaar }];
  if (idsObj.PAN)      ids.push({ type: 'PAN',      value: idsObj.PAN.toUpperCase() });
  if (idsObj.DL)       ids.push({ type: 'DL',        value: idsObj.DL.toUpperCase() });
  if (idsObj.Passport) ids.push({ type: 'Passport',  value: idsObj.Passport.toUpperCase() });

  const person = {
    id: personId,
    name,
    dob,
    gender: gender || null,
    address,
    photoHash: null,
    ids,
    criminalRecords: []
  };

  people.push(person);
  writeJson('people.json', people);

  res.json({ success: true, personId });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`VERISYS server listening on port ${port}`);
});