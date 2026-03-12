# ID Verification Engine

Simple prototype for a college assignment.

## Getting Started

1. Ensure Node.js is installed.
2. Clone or download this repository.
3. In the project root, run:
   ```bash
   npm install
   ```
4. Start the server:
   ```bash
   npm start
   ```
5. Open your browser and navigate to `http://localhost:3000`.
The home screen presents navigation buttons for each ID type and a history page. The UI now uses a dark theme with a **deep‑blue border** around containers and animated transitions. Clicking a button takes you to a dedicated form (Aadhaar, PAN, DL, Passport) with type‑specific inputs and placeholder dummy values – just fill in one of the seeded identities (e.g. Aadhaar `111122223333` for Alice, DL `MH0420150000001` for Bob) to try the demo flows.

*Note:* operator ID and photo‑hash fields are omitted from the initial form; the decision form on the report page now asks for an operator ID so approvals/denials are tracked.
The front end is served from `public/`. Data is stored in JSON files under `data/`.

### Demo Scenarios

- **Valid**: enter Aadhaar `111122223333` with matching name `Alice Johnson`, dob `1990-05-15`, address `123 Maple Street` on the Aadhaar form (the verify button is intentionally big).
- **Suspicious**: same ID but enter a different name or dob to see the validity score drop and detailed mismatch explanation. After verifying you will be taken to a **clean, scrollable report page** with generous spacing and document‑like layout; decision controls are oversized. Choosing approve/deny returns you to the home screen and the choice is recorded.
- **Active Criminal Case**: enter DL `MH0420150000001` (Bob Singh) on the DL or Passport form; the system shows a red escalation banner with no score and prompts for a decision (approve/deny).

Reports and decisions are persisted in `data/history.json` and can be queried via the API. The history page now displays entries as **sleek cards** (not tables) with green or red borders showing decisions, and includes operator IDs.

### API Endpoints

- **POST /api/verify**  
  Request body: `{ idType, idValue, providedFields }`  
  Response: `{ reportId }` (operatorId is optional and ignored).

- **GET /api/reports/:id**  
  Returns full report object stored in history.

- **POST /api/reports/:id/decision**  
  Body: `{ decision, reason }`  - records the operator's decision on an escalated report.

- **GET /api/reports**  
  Returns entire history array.

