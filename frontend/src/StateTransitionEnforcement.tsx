/**
 * StateTransitionEnforcement
 * Version: 1.0.0
 *
 * Standalone React component that renders status transition controls with
 * client-side guard enforcement for Projects, Collections, and Tasks.
 *
 * Props:
 *   actor    — any object implementing the BackendActor interface (see below)
 *   entities — initial list of Entity records (from getEntities())
 *
 * The component is fully self-contained. Copy this single file into your
 * project. It has no imports from the parent platform codebase.
 *
 * Required peer dependencies:
 *   react >= 18
 *   lucide-react
 *   tailwindcss (with the OKLCH status color tokens defined in index.css)
 *   motion/react  (optional — remove AnimatePresence/motion wrappers if unused)
 *
 * RBAC integration point (stripped for standalone):
 *   In the full platform, transition buttons are only rendered for users with
 *   editor or admin role on the entity. Viewers receive a read-only StatusBadge.
 *   Re-add by wrapping the StatusControls render path with a role check.
 *
 * Audit log integration point (stripped for standalone):
 *   In the full platform, every attemptTransition call result is emitted to
 *   the audit log storage with entityType, entityId, priorStatus, targetStatus,
 *   outcome, callerId, and timestamp.
 */

import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  GitBranch,
  Loader2,
  RotateCcw,
  ShieldAlert,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

export type EntityType = "Project" | "Collection" | "Task";

export interface Entity {
  id: string;
  name: string;
  entityType: string;
  status: string;
  openTaskCount?: bigint;
}

export type TransitionResult =
  | { __kind__: "ok"; ok: null }
  | { __kind__: "err"; err: string };

export interface BackendActor {
  getEntities(): Promise<Entity[]>;
  attemptTransition(
    entityId: string,
    targetStatus: string,
  ): Promise<TransitionResult>;
  resolveOpenTasks(entityId: string): Promise<TransitionResult>;
}

// ── Transition rules ──────────────────────────────────────────────────────────

const TRANSITION_MAP: Record<EntityType, string[]> = {
  Project: ["draft", "active", "completed", "archived"],
  Collection: ["active", "archived"],
  Task: ["todo", "inProgress", "completed", "archived"],
};

export function getValidNextStates(
  entityType: EntityType,
  currentStatus: string,
): string[] {
  const chain = TRANSITION_MAP[entityType];
  if (!chain) return [];
  const idx = chain.indexOf(currentStatus);
  if (idx === -1 || idx === chain.length - 1) return [];
  return [chain[idx + 1]];
}

export function getPreviousState(
  entityType: EntityType,
  currentStatus: string,
): string | null {
  const chain = TRANSITION_MAP[entityType];
  if (!chain) return null;
  const idx = chain.indexOf(currentStatus);
  if (idx <= 0) return null;
  return chain[idx - 1];
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: "Draft",
    active: "Active",
    inProgress: "In Progress",
    completed: "Completed",
    archived: "Archived",
    todo: "To Do",
  };
  return labels[status] ?? status;
}

// ── useTransitionGuard hook ───────────────────────────────────────────────────

interface EntityState {
  status: string;
  openTaskCount: bigint | undefined;
  error: string | null;
  isTransitioning: boolean;
  isResolvingTasks: boolean;
}

function useTransitionGuard() {
  const [entityStates, setEntityStates] = useState<Record<string, EntityState>>(
    {},
  );

  const initEntityStates = useCallback((entities: Entity[]) => {
    const initial: Record<string, EntityState> = {};
    for (const e of entities) {
      initial[e.id] = {
        status: e.status,
        openTaskCount: e.openTaskCount,
        error: null,
        isTransitioning: false,
        isResolvingTasks: false,
      };
    }
    setEntityStates(initial);
  }, []);

  const attemptTransition = useCallback(
    async (entityId: string, targetStatus: string, actor: BackendActor) => {
      setEntityStates((prev) => ({
        ...prev,
        [entityId]: { ...prev[entityId], isTransitioning: true, error: null },
      }));
      try {
        const result = await actor.attemptTransition(entityId, targetStatus);
        if (result.__kind__ === "ok") {
          setEntityStates((prev) => ({
            ...prev,
            [entityId]: {
              ...prev[entityId],
              status: targetStatus,
              error: null,
              isTransitioning: false,
            },
          }));
        } else {
          setEntityStates((prev) => ({
            ...prev,
            [entityId]: {
              ...prev[entityId],
              error: result.err,
              isTransitioning: false,
            },
          }));
        }
      } catch {
        setEntityStates((prev) => ({
          ...prev,
          [entityId]: {
            ...prev[entityId],
            error: "Network error — please try again.",
            isTransitioning: false,
          },
        }));
      }
    },
    [],
  );

  const resolveOpenTasks = useCallback(
    async (entityId: string, actor: BackendActor) => {
      setEntityStates((prev) => ({
        ...prev,
        [entityId]: {
          ...prev[entityId],
          isResolvingTasks: true,
          error: null,
        },
      }));
      try {
        const result = await actor.resolveOpenTasks(entityId);
        if (result.__kind__ === "ok") {
          setEntityStates((prev) => ({
            ...prev,
            [entityId]: {
              ...prev[entityId],
              openTaskCount: BigInt(0),
              error: null,
              isResolvingTasks: false,
            },
          }));
        } else {
          setEntityStates((prev) => ({
            ...prev,
            [entityId]: {
              ...prev[entityId],
              error: result.err,
              isResolvingTasks: false,
            },
          }));
        }
      } catch {
        setEntityStates((prev) => ({
          ...prev,
          [entityId]: {
            ...prev[entityId],
            error: "Network error — please try again.",
            isResolvingTasks: false,
          },
        }));
      }
    },
    [],
  );

  return { entityStates, initEntityStates, attemptTransition, resolveOpenTasks };
}

// ── StatusBadge ───────────────────────────────────────────────────────────────

const STATUS_CLASS: Record<string, string> = {
  draft: "status-draft",
  active: "status-active",
  inProgress: "status-inProgress",
  completed: "status-completed",
  archived: "status-archived",
  todo: "status-todo",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_CLASS[status] ?? "status-draft";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-wide font-mono uppercase ${cls}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {getStatusLabel(status)}
    </span>
  );
}

// ── StatusControls ────────────────────────────────────────────────────────────

const TRANSITION_BUTTON_LABEL: Record<string, string> = {
  active: "Mark Active",
  inProgress: "Start Progress",
  completed: "Mark Completed",
  archived: "Archive",
  todo: "Reopen",
};

interface StatusControlsProps {
  entityId: string;
  entityType: EntityType;
  currentStatus: string;
  openTaskCount?: bigint;
  error: string | null;
  isTransitioning: boolean;
  isResolvingTasks: boolean;
  onTransition: (entityId: string, targetStatus: string) => void;
  onResolveOpenTasks?: (entityId: string) => void;
}

function StatusControls({
  entityId,
  entityType,
  currentStatus,
  openTaskCount,
  error,
  isTransitioning,
  isResolvingTasks,
  onTransition,
  onResolveOpenTasks,
}: StatusControlsProps) {
  const validNextStates = getValidNextStates(entityType, currentStatus);
  const isTerminal = validNextStates.length === 0;
  const hasOpenTasks = openTaskCount !== undefined && openTaskCount > BigInt(0);
  const forceBackwardTarget = getPreviousState(entityType, currentStatus);

  return (
    <div className="space-y-3">
      {/* Production controls */}
      <div className="flex flex-wrap items-center gap-2">
        {validNextStates.map((nextState) => (
          <button
            key={nextState}
            type="button"
            onClick={() => onTransition(entityId, nextState)}
            disabled={isTransitioning || isResolvingTasks}
            data-ocid={`${entityType.toLowerCase()}.primary_button`}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary/90 px-3 py-1.5 text-xs font-medium tracking-wide text-primary-foreground shadow-sm shadow-primary/20 transition-all duration-150 hover:bg-primary disabled:opacity-50 disabled:cursor-not-allowed h-8"
          >
            {isTransitioning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            {TRANSITION_BUTTON_LABEL[nextState] ?? getStatusLabel(nextState)}
          </button>
        ))}

        {/* Resolve Open Tasks — Project only, shown when precondition guard is active */}
        {entityType === "Project" &&
          currentStatus === "active" &&
          hasOpenTasks &&
          onResolveOpenTasks && (
            <button
              type="button"
              onClick={() => onResolveOpenTasks(entityId)}
              disabled={isTransitioning || isResolvingTasks}
              data-ocid="project.secondary_button"
              className="inline-flex items-center gap-1.5 rounded-md border border-border/60 px-3 py-1.5 text-xs font-medium tracking-wide text-foreground/60 transition-all duration-150 hover:text-foreground hover:bg-accent/60 disabled:opacity-50 disabled:cursor-not-allowed h-8"
            >
              {isResolvingTasks ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
              )}
              Resolve Open Tasks
              {!isResolvingTasks && openTaskCount !== undefined && (
                <span className="ml-0.5 rounded-full px-1.5 py-0 text-[10px] font-bold tabular-nums text-amber-400 bg-amber-400/10 border border-amber-400/30">
                  {openTaskCount.toString()}
                </span>
              )}
            </button>
          )}

        {isTerminal && (
          <span className="text-[11px] text-muted-foreground/50 italic font-mono">
            — terminal state
          </span>
        )}
      </div>

      {/* Inline error — guard fired */}
      <AnimatePresence mode="wait">
        {error && (
          <motion.div
            key={error}
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -2, scale: 0.99 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            data-ocid={`${entityType.toLowerCase()}.error_state`}
          >
            <div className="flex items-start gap-2.5 rounded-md border border-destructive/40 bg-destructive/[0.08] px-3 py-2.5">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive/80" />
              <div className="space-y-0.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-destructive/80">
                  Guard Fired
                </p>
                <p className="text-xs text-destructive/70 leading-relaxed">
                  {error}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Test harness — adversarial backward transition coverage */}
      {forceBackwardTarget && (
        <div className="rounded-md border border-dashed border-amber-500/20 bg-amber-500/[0.04] px-3 pt-2.5 pb-2.5">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[9px] font-mono font-bold uppercase tracking-[0.15em] text-amber-500/50">
              ◈ Test Harness
            </span>
            <span className="text-[9px] font-mono text-amber-500/40">
              adversarial coverage
            </span>
          </div>
          <button
            type="button"
            onClick={() => onTransition(entityId, forceBackwardTarget)}
            disabled={isTransitioning || isResolvingTasks}
            data-ocid={`${entityType.toLowerCase()}.secondary_button`}
            className="inline-flex w-full items-center justify-start gap-1.5 rounded-md border border-amber-500/20 px-2.5 py-1 font-mono text-[10px] font-medium tracking-wide text-amber-500/50 transition-all duration-150 hover:text-amber-400 hover:bg-amber-500/10 hover:border-amber-400/30 disabled:opacity-50 disabled:cursor-not-allowed h-7"
          >
            <RotateCcw className="h-3 w-3 shrink-0" />
            Force backward → {getStatusLabel(forceBackwardTarget)}
          </button>
        </div>
      )}
    </div>
  );
}

// ── EntityCard ────────────────────────────────────────────────────────────────

const ENTITY_META: Record<
  EntityType,
  { icon: string; description: string; accent: string }
> = {
  Project: {
    icon: "◈",
    description: "Portfolio project with full lifecycle enforcement",
    accent: "oklch(0.57 0.22 265)",
  },
  Collection: {
    icon: "◧",
    description: "Nestable asset grouping within a project scope",
    accent: "oklch(0.62 0.18 220)",
  },
  Task: {
    icon: "◉",
    description: "Work item with parent-child support",
    accent: "oklch(0.70 0.16 150)",
  },
};

interface EntityCardProps {
  entityId: string;
  entityType: EntityType;
  entityName: string;
  currentStatus: string;
  openTaskCount?: bigint;
  error: string | null;
  isTransitioning: boolean;
  isResolvingTasks: boolean;
  onTransition: (entityId: string, targetStatus: string) => void;
  onResolveOpenTasks?: (entityId: string) => void;
  index?: number;
}

function EntityCard({
  entityId,
  entityType,
  entityName,
  currentStatus,
  openTaskCount,
  error,
  isTransitioning,
  isResolvingTasks,
  onTransition,
  onResolveOpenTasks,
  index = 0,
}: EntityCardProps) {
  const meta = ENTITY_META[entityType];

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.38,
        delay: index * 0.07,
        ease: [0.25, 0.1, 0.25, 1],
      }}
      className="relative overflow-hidden rounded-lg border border-border bg-card shadow-[0_2px_8px_-2px_rgba(0,0,0,0.4)] transition-shadow duration-200 hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.5)]"
      data-ocid={`${entityType.toLowerCase()}.card`}
    >
      <div
        className="absolute inset-y-0 left-0 w-[3px] rounded-l-lg"
        style={{ background: meta.accent }}
      />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/8 to-transparent" />

      <div className="pl-5 pr-5 pt-5 pb-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="font-mono text-sm select-none"
                style={{ color: meta.accent }}
                aria-hidden
              >
                {meta.icon}
              </span>
              <span
                className="text-[10px] font-mono uppercase tracking-[0.12em] font-semibold"
                style={{
                  color: `color-mix(in oklch, ${meta.accent} 70%, transparent)`,
                }}
              >
                {entityType}
              </span>
            </div>
            <h3 className="text-[15px] font-semibold text-foreground leading-snug tracking-tight truncate">
              {entityName}
            </h3>
            <p className="text-xs text-muted-foreground/70 leading-relaxed">
              {meta.description}
            </p>
          </div>
          <div className="shrink-0 pt-0.5">
            <StatusBadge status={currentStatus} />
          </div>
        </div>

        <div className="border-t border-border/40" />

        {entityType === "Project" &&
          openTaskCount !== undefined &&
          openTaskCount > BigInt(0) && (
            <div className="flex items-center gap-2.5 rounded-md border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2.5">
              <div className="h-1.5 w-1.5 rounded-full bg-amber-400 shrink-0" />
              <p className="text-xs leading-relaxed text-amber-400">
                <span className="font-semibold">
                  {openTaskCount.toString()} open task
                  {openTaskCount > BigInt(1) ? "s" : ""}
                </span>{" "}
                — precondition guard active
              </p>
            </div>
          )}

        <StatusControls
          entityId={entityId}
          entityType={entityType}
          currentStatus={currentStatus}
          openTaskCount={openTaskCount}
          error={error}
          isTransitioning={isTransitioning}
          isResolvingTasks={isResolvingTasks}
          onTransition={onTransition}
          onResolveOpenTasks={onResolveOpenTasks}
        />
      </div>
    </motion.div>
  );
}

// ── Section config ────────────────────────────────────────────────────────────

const SECTION_CONFIG: {
  type: EntityType;
  label: string;
  description: string;
}[] = [
  {
    type: "Project",
    label: "Projects",
    description: "Lifecycle: Draft → Active → Completed → Archived",
  },
  {
    type: "Collection",
    label: "Collections",
    description: "Lifecycle: Active → Archived",
  },
  {
    type: "Task",
    label: "Tasks",
    description: "Lifecycle: To Do → In Progress → Completed → Archived",
  },
];

// ── Main component ────────────────────────────────────────────────────────────

interface StateTransitionEnforcementProps {
  /** Backend actor implementing getEntities / attemptTransition / resolveOpenTasks */
  actor: BackendActor;
  /** Initial entity list (from actor.getEntities()). Pass [] to let the component fetch. */
  entities?: Entity[];
}

export function StateTransitionEnforcement({
  actor,
  entities: initialEntities,
}: StateTransitionEnforcementProps) {
  const [entities, setEntities] = useState<Entity[]>(initialEntities ?? []);
  const [isLoading, setIsLoading] = useState(!initialEntities);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const { entityStates, initEntityStates, attemptTransition, resolveOpenTasks } =
    useTransitionGuard();

  useEffect(() => {
    if (initialEntities) {
      initEntityStates(initialEntities);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    actor
      .getEntities()
      .then((data) => {
        if (!cancelled) {
          setEntities(data);
          initEntityStates(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setFetchError(
            err instanceof Error ? err.message : "Failed to load entities",
          );
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [actor, initialEntities, initEntityStates]);

  const handleTransition = (entityId: string, targetStatus: string) => {
    attemptTransition(entityId, targetStatus, actor);
  };

  const handleResolveOpenTasks = (entityId: string) => {
    resolveOpenTasks(entityId, actor);
  };

  if (isLoading) {
    return (
      <div
        className="flex items-center gap-3 text-muted-foreground py-8"
        data-ocid="app.loading_state"
      >
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">Loading entities…</span>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div
        className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-5"
        data-ocid="app.error_state"
      >
        <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-destructive">
            Failed to load entities
          </p>
          <p className="text-xs text-destructive/70 mt-1">{fetchError}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      {SECTION_CONFIG.map((section, sectionIdx) => {
        const sectionEntities = entities.filter(
          (e) => e.entityType === section.type,
        );

        return (
          <section
            key={section.type}
            aria-labelledby={`section-${section.type}`}
            className="space-y-4"
            data-ocid={`${section.type.toLowerCase()}.section`}
          >
            <motion.div
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                duration: 0.4,
                delay: sectionIdx * 0.1,
                ease: [0.25, 0.1, 0.25, 1],
              }}
              className="flex items-start gap-3"
            >
              <div className="mt-1 w-0.5 h-8 rounded-full bg-gradient-to-b from-primary to-primary/20 shrink-0" />
              <div>
                <h2
                  id={`section-${section.type}`}
                  className="text-lg font-semibold tracking-tight text-foreground"
                >
                  {section.label}
                </h2>
                <p className="text-xs text-muted-foreground font-mono">
                  {section.description}
                </p>
              </div>
            </motion.div>

            <div className="space-y-3">
              {sectionEntities.map((entity, entityIdx) => {
                const state = entityStates[entity.id];
                if (!state) return null;

                return (
                  <EntityCard
                    key={entity.id}
                    entityId={entity.id}
                    entityType={entity.entityType as EntityType}
                    entityName={entity.name}
                    currentStatus={state.status}
                    openTaskCount={state.openTaskCount}
                    error={state.error}
                    isTransitioning={state.isTransitioning}
                    isResolvingTasks={state.isResolvingTasks}
                    onTransition={handleTransition}
                    onResolveOpenTasks={
                      entity.entityType === "Project"
                        ? handleResolveOpenTasks
                        : undefined
                    }
                    index={entityIdx}
                  />
                );
              })}

              {sectionEntities.length === 0 && (
                <p
                  className="text-sm text-muted-foreground italic pl-4"
                  data-ocid={`${section.type.toLowerCase()}.empty_state`}
                >
                  No {section.label.toLowerCase()} loaded
                </p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ── Page wrapper (standalone demo entry point) ────────────────────────────────
// Remove this export if embedding the component into an existing app shell.

export function StateTransitionPage({ actor }: { actor: BackendActor }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-20 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="mx-auto max-w-4xl px-6 py-3 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/20 border border-primary/30">
              <GitBranch className="h-4 w-4 text-primary" />
            </div>
            <span className="font-semibold text-sm tracking-tight text-foreground">
              State Transition Engine
            </span>
          </div>
          <span className="hidden sm:block text-border">·</span>
          <span className="hidden sm:block text-xs text-muted-foreground font-mono">
            Enterprise Portfolio Platform
          </span>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-4xl px-6 py-10 space-y-12">
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1] }}
          className="space-y-5 pb-2"
        >
          <div className="flex items-center gap-2">
            <div className="h-px w-6 bg-primary/60" />
            <span className="text-[10px] font-mono font-semibold uppercase tracking-[0.2em] text-primary/70">
              Feature Demo · v1.0.0
            </span>
          </div>
          <div>
            <h1 className="text-4xl font-bold tracking-tight leading-[1.1] text-foreground">
              State Transition
              <br />
              <span className="text-primary">Enforcement</span>
            </h1>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-xl">
              Guards enforce valid lifecycle progressions for Projects,
              Collections, and Tasks. Only legal forward transitions are shown —
              illegal paths are invisible by design. Precondition failures
              surface inline, co-located with the triggering action.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {[
              {
                dot: "bg-primary",
                label: "Forward transition",
                desc: "valid next state",
              },
              {
                dot: "bg-destructive/80",
                label: "Guard fired",
                desc: "precondition failure",
              },
              {
                dot: "bg-amber-500/60",
                label: "Test harness",
                desc: "adversarial coverage",
              },
            ].map(({ dot, label, desc }) => (
              <div
                key={label}
                className="flex items-center gap-2 rounded-md border border-border/50 bg-card/60 px-2.5 py-1.5 text-xs"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full shrink-0 ${dot}`}
                />
                <span className="font-medium text-foreground/80">{label}</span>
                <span className="text-muted-foreground/60">— {desc}</span>
              </div>
            ))}
          </div>
        </motion.section>

        <StateTransitionEnforcement actor={actor} />
      </main>

      <footer className="border-t border-border/40 py-6 mt-auto">
        <div className="mx-auto max-w-4xl px-6">
          <p className="text-xs text-muted-foreground/60 text-center">
            state-transition-enforcement-ui · MIT License ·{" "}
            <a
              href="https://github.com/your-org/state-transition-enforcement-ui"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-muted-foreground transition-colors"
            >
              GitHub
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
