import Map "mo:core/Map";
import Text "mo:core/Text";

// ─────────────────────────────────────────────────────────────────────────────
// State Transition Enforcement — Standalone Canister
// Version: 1.0.0
//
// Public API:
//   getEntities()                                  : async [Entity]
//   attemptTransition(entityId, targetStatus)      : async TransitionResult
//   resolveOpenTasks(entityId)                     : async TransitionResult
//
// TransitionResult variants:
//   #ok                    — transition accepted and applied
//   #err(message : Text)   — transition rejected; message describes the guard that fired
//
// Error messages (exact strings, referenced by frontend guards):
//   "Entity not found"
//   "Project not found"
//   "Invalid transition: must follow the defined progression."
//   "Cannot complete this project while open tasks remain."
//
// RBAC integration point (stripped for standalone):
//   In the platform version, caller is resolved against per-entity role assignments
//   before any mutation is permitted. Re-add by checking:
//     require(rbac.hasRole(caller, entityId, #editor) or rbac.hasRole(caller, entityId, #admin))
//   before delegating to handleProjectTransition / handleCollectionTransition / handleTaskTransition.
//
// Audit log integration point (stripped for standalone):
//   In the platform version, every call to attemptTransition emits an audit entry:
//     { entityType, entityId, priorStatus, targetStatus, outcome, callerId, timestamp }
//   Re-add by appending to audit log storage after the transition result is determined.
// ─────────────────────────────────────────────────────────────────────────────

actor {

  // ── Type definitions ─────────────────────────────────────────────────────

  type Project = {
    id            : Text;
    name          : Text;
    entityType    : Text;
    status        : Text;
    openTaskCount : Nat;
  };

  type Collection = {
    id         : Text;
    name       : Text;
    entityType : Text;
    status     : Text;
  };

  type Task = {
    id         : Text;
    name       : Text;
    entityType : Text;
    status     : Text;
  };

  /// Unified entity record returned by getEntities().
  /// openTaskCount is Some(n) for Projects, None for Collections and Tasks.
  type Entity = {
    id            : Text;
    name          : Text;
    entityType    : Text;
    status        : Text;
    openTaskCount : ?Nat;
  };

  /// Result type for all mutation calls.
  /// #ok  — transition accepted
  /// #err — guard fired; err carries the human-readable reason
  type TransitionResult = {
    #ok;
    #err : Text;
  };

  // ── Storage ──────────────────────────────────────────────────────────────

  let projects    = Map.empty<Text, Project>();
  let collections = Map.empty<Text, Collection>();
  let tasks       = Map.empty<Text, Task>();

  // ── Seed data (demo) ─────────────────────────────────────────────────────
  // Pre-populated at mid-lifecycle states so every guard scenario is visible
  // from first load without any user-initiated create flow.

  do {
    projects.add(
      "proj1",
      {
        id            = "proj1";
        name          = "Alpha Initiative";
        entityType    = "Project";
        status        = "active";
        openTaskCount = 2;
      },
    );

    collections.add(
      "coll1",
      {
        id         = "coll1";
        name       = "Design Assets";
        entityType = "Collection";
        status     = "active";
      },
    );

    tasks.add(
      "task1",
      {
        id         = "task1";
        name       = "Write technical spec";
        entityType = "Task";
        status     = "inProgress";
      },
    );
  };

  // ── Public API ────────────────────────────────────────────────────────────

  /// Returns all entities across all types.
  /// Input:  none
  /// Output: [Entity] — unified array; openTaskCount is Some(n) for Projects, null otherwise
  public query func getEntities() : async [Entity] {
    let projectEntities = projects.values().toArray().map(
      func(p : Project) : Entity {
        {
          id            = p.id;
          name          = p.name;
          entityType    = p.entityType;
          status        = p.status;
          openTaskCount = ?p.openTaskCount;
        };
      }
    );
    let collectionEntities = collections.values().toArray().map(
      func(c : Collection) : Entity {
        {
          id            = c.id;
          name          = c.name;
          entityType    = c.entityType;
          status        = c.status;
          openTaskCount = null;
        };
      }
    );
    let taskEntities = tasks.values().toArray().map(
      func(t : Task) : Entity {
        {
          id            = t.id;
          name          = t.name;
          entityType    = t.entityType;
          status        = t.status;
          openTaskCount = null;
        };
      }
    );

    projectEntities.concat(collectionEntities).concat(taskEntities);
  };

  /// Attempt a status transition for any entity type.
  /// Input:
  ///   entityId     : Text — the entity's stable identifier
  ///   targetStatus : Text — the desired next status value
  /// Output:
  ///   TransitionResult — #ok on success, #err(reason) if any guard fires
  ///
  /// Guard rules enforced:
  ///   Projects    — must follow draft→active→completed→archived; openTaskCount must be 0 before completed
  ///   Collections — must follow active→archived
  ///   Tasks       — must follow todo→inProgress→completed→archived
  public shared func attemptTransition(entityId : Text, targetStatus : Text) : async TransitionResult {
    switch ((projects.get(entityId), collections.get(entityId), tasks.get(entityId))) {
      case (?project, _, _) {
        handleProjectTransition(entityId, project, targetStatus);
      };
      case (_, ?collection, _) {
        handleCollectionTransition(entityId, collection, targetStatus);
      };
      case (_, _, ?task) {
        handleTaskTransition(entityId, task, targetStatus);
      };
      case (null, null, null) { #err("Entity not found") };
    };
  };

  /// Clears openTaskCount for a Project to unblock the active→completed transition.
  /// Input:
  ///   entityId : Text — must be a Project id
  /// Output:
  ///   TransitionResult — #ok on success, #err("Project not found") if id is unknown
  public shared func resolveOpenTasks(entityId : Text) : async TransitionResult {
    switch (projects.get(entityId)) {
      case (?project) {
        projects.add(
          entityId,
          {
            id            = project.id;
            name          = project.name;
            entityType    = project.entityType;
            status        = project.status;
            openTaskCount = 0;
          },
        );
        #ok;
      };
      case (null) { #err("Project not found") };
    };
  };

  // ── Private transition handlers ───────────────────────────────────────────

  func handleProjectTransition(entityId : Text, project : Project, targetStatus : Text) : TransitionResult {
    let currentStatus = project.status;

    let validTransitions : [(Text, Text)] = [
      ("draft",     "active"),
      ("active",    "completed"),
      ("completed", "archived"),
    ];

    let transitionValid = validTransitions.any(
      func((from, to) : (Text, Text)) : Bool { from == currentStatus and to == targetStatus }
    );

    if (not transitionValid) {
      return #err("Invalid transition: must follow the defined progression.");
    };

    // Precondition guard — Project cannot reach completed while open tasks remain
    if (currentStatus == "active" and targetStatus == "completed" and project.openTaskCount > 0) {
      return #err("Cannot complete this project while open tasks remain.");
    };

    projects.add(
      entityId,
      {
        id            = project.id;
        name          = project.name;
        entityType    = project.entityType;
        status        = targetStatus;
        openTaskCount = project.openTaskCount;
      },
    );

    #ok;
  };

  func handleCollectionTransition(entityId : Text, collection : Collection, targetStatus : Text) : TransitionResult {
    let currentStatus = collection.status;
    let validTransition = (currentStatus == "active" and targetStatus == "archived");

    if (not validTransition) {
      return #err("Invalid transition: must follow the defined progression.");
    };

    collections.add(
      entityId,
      {
        id         = collection.id;
        name       = collection.name;
        entityType = collection.entityType;
        status     = targetStatus;
      },
    );

    #ok;
  };

  func handleTaskTransition(entityId : Text, task : Task, targetStatus : Text) : TransitionResult {
    let currentStatus = task.status;

    let validTransitions : [(Text, Text)] = [
      ("todo",       "inProgress"),
      ("inProgress", "completed"),
      ("completed",  "archived"),
    ];

    let transitionValid = validTransitions.any(
      func((from, to) : (Text, Text)) : Bool { from == currentStatus and to == targetStatus }
    );

    if (not transitionValid) {
      return #err("Invalid transition: must follow the defined progression.");
    };

    tasks.add(
      entityId,
      {
        id         = task.id;
        name       = task.name;
        entityType = task.entityType;
        status     = targetStatus;
      },
    );

    #ok;
  };

};