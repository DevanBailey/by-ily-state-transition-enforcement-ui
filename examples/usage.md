# Integration Example

This walkthrough shows how to embed `StateTransitionEnforcement` into an existing ICP React frontend.

---

## Prerequisites

- An ICP canister that exposes the three backend functions (or the standalone canister from this repo)
- A React frontend using Vite + Tailwind CSS
- `motion/react` installed (`npm install motion`)
- `lucide-react` installed (`npm install lucide-react`)

---

## 1. Add the OKLCH status tokens to your CSS

The `StatusBadge` sub-component uses semantic CSS custom properties. Add these to your `index.css` (or equivalent global stylesheet) inside `:root`:

```css
:root {
  --status-draft:          0.50  0.01   265;
  --status-draft-bg:       0.20  0.008  265;
  --status-active:         0.58  0.18   240;
  --status-active-bg:      0.17  0.06   240;
  --status-inprogress:     0.72  0.17   75;
  --status-inprogress-bg:  0.19  0.06   75;
  --status-completed:      0.70  0.16   150;
  --status-completed-bg:   0.16  0.07   150;
  --status-archived:       0.48  0.02   265;
  --status-archived-bg:    0.19  0.010  265;
}

.status-draft      { color: oklch(var(--status-draft));      background-color: oklch(var(--status-draft-bg));      border-color: oklch(var(--status-draft) / 0.3); }
.status-active     { color: oklch(var(--status-active));     background-color: oklch(var(--status-active-bg));     border-color: oklch(var(--status-active) / 0.3); }
.status-inProgress { color: oklch(var(--status-inprogress)); background-color: oklch(var(--status-inprogress-bg)); border-color: oklch(var(--status-inprogress) / 0.3); }
.status-completed  { color: oklch(var(--status-completed));  background-color: oklch(var(--status-completed-bg));  border-color: oklch(var(--status-completed) / 0.3); }
.status-archived   { color: oklch(var(--status-archived));   background-color: oklch(var(--status-archived-bg));   border-color: oklch(var(--status-archived) / 0.3); }
.status-todo       { color: oklch(var(--status-draft));      background-color: oklch(var(--status-draft-bg));      border-color: oklch(var(--status-draft) / 0.3); }

2. Copy the component

Copy frontend/src/StateTransitionEnforcement.tsx into your project's component directory.
3. Wire up the actor

// src/App.tsx
import { createActor } from "./declarations/state_transition_backend";
import { StateTransitionEnforcement } from "./components/StateTransitionEnforcement";

const canisterId = import.meta.env.VITE_CANISTER_ID_STATE_TRANSITION_BACKEND;

const actor = createActor(canisterId, {
  agentOptions: { host: "http://127.0.0.1:4943" },
});

export default function App() {
  return (
    <main className="max-w-4xl mx-auto px-6 py-10">
      <StateTransitionEnforcement actor={actor} />
    </main>
  );
}

The component calls actor.getEntities() on mount to hydrate itself. If you already have entity data from a parent query, pass it via the entities prop to skip the internal fetch:

<StateTransitionEnforcement actor={actor} entities={myEntities} />

4. Using only the guard hook

If you want only the transition guard logic without the full card UI, import useTransitionGuard, getValidNextStates, and getStatusLabel directly from the component file:

import {
  useTransitionGuard,
  getValidNextStates,
  getStatusLabel,
} from "./components/StateTransitionEnforcement";

function MyCustomStatusControl({ entityType, currentStatus, entityId, actor }) {
  const { entityStates, initEntityStates, attemptTransition } = useTransitionGuard();
  const validNext = getValidNextStates(entityType, currentStatus);

  return (
    <div>
      {validNext.map((next) => (
        <button key={next} onClick={() => attemptTransition(entityId, next, actor)}>
          → {getStatusLabel(next)}
        </button>
      ))}
    </div>
  );
}

5. Re-adding RBAC

In the full platform, transition buttons are only rendered for users with editor or admin role on the entity. To re-add this gate, pass a canEdit boolean to your custom status control and conditionally render the transition buttons:

{canEdit && validNext.map((next) => (
  <button key={next} onClick={() => attemptTransition(entityId, next, actor)}>
    → {getStatusLabel(next)}
  </button>
))}
{!canEdit && <StatusBadge status={currentStatus} />}

6. Re-adding audit logging

The backend handleProjectTransition, handleCollectionTransition, and handleTaskTransition functions are the correct insertion points. After the guard checks pass and before #ok is returned, append to your audit log storage:

auditLog.add({
  entityType  = "Project";
  entityId    = entityId;
  priorStatus = currentStatus;
  targetStatus = targetStatus;
  outcome     = "success";
  callerId    = Principal.toText(caller);
  timestamp   = Time.now();
});

Guard error messages (exact strings)

These are the error strings the backend returns and the frontend renders verbatim:
Scenario	Message
Transition not in valid chain	"Invalid transition: must follow the defined progression."
Project has open tasks	"Cannot complete this project while open tasks remain."
Entity ID not found	"Entity not found"
Project ID not found (resolveOpenTasks)	"Project not found"
Network/canister error	"Network error — please try again." (client-side)