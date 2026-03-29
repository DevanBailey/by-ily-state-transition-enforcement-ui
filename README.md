# state-transition-enforcement-ui

A production-quality state transition guard component extracted from an enterprise portfolio management platform built on the Internet Computer (ICP). It enforces strict forward-only lifecycle progressions for Projects, Collections, and Tasks, with precondition guards and inline error feedback.

---

## What it does

- Renders only the valid next-state button for each entity, making illegal transitions invisible rather than blocked after the fact
- Enforces strict sequential lifecycle chains:
  - **Projects**: `draft → active → completed → archived`
  - **Collections**: `active → archived`
  - **Tasks**: `todo → inProgress → completed → archived`
- Blocks the `active → completed` transition on Projects when open tasks remain, with the exact error message: _"Cannot complete this project while open tasks remain."_
- Surfaces all guard errors inline, directly beneath the status controls — no modals, no toasts
- Includes a test harness button that attempts a backward transition to demonstrate the error path

---

## Who this is for

Backend developers and frontend engineers building workflow tools on the Internet Computer who need reliable state machine enforcement without rolling their own guard logic. It is also useful for enterprise evaluators who want to audit the quality of the larger platform this module was extracted from before committing to a full integration.

---

## Deploy as a standalone ICP canister

### Prerequisites

- [dfx](https://internetcomputer.org/docs/current/developer-docs/setup/install/) >= 0.15.0
- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/) or npm

### Steps

```bash
# 1. Clone the repository
git clone https://github.com/your-org/state-transition-enforcement-ui
cd state-transition-enforcement-ui

# 2. Start a local ICP replica
dfx start --background

# 3. Deploy the backend canister
dfx deploy state_transition_backend

# 4. Install frontend dependencies
cd frontend
npm install

# 5. Copy the generated canister ID into the frontend environment
# The canister ID is printed after step 3, or run:
dfx canister id state_transition_backend

# 6. Start the frontend dev server
npm run dev

The frontend will connect to the local canister automatically via the generated declarations in frontend/src/declarations/.