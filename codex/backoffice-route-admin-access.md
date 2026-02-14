# Route Admin Access Scope for Backoffice

## 1. Goal

In the backoffice, a `ROUTE_ADMIN` must manage only the routes assigned to that admin.

A route admin must **not** have visibility or control over all routes by default.

For MVP scope, a route admin must be able to monitor bus locations on a live map, but only for assigned routes/directions.

---

## 2. Access Rule

- `SUPER_ADMIN`:
  - Can view and manage all routes.
- `ROUTE_ADMIN`:
  - Can view and manage only explicitly assigned routes.
  - Can view live bus map updates only for assigned routes/directions.
  - Cannot subscribe to unassigned route channels.
  - Cannot execute control actions on unassigned routes.

This rule applies to:

- Route list APIs
- Bus snapshot APIs
- WebSocket subscriptions (`route:{routeId}:{direction}`)
- Backoffice actions (alerts, controls, assignments, dispatch commands)

---

## 3. Why a New Model Is Required

The current user model/role model is not enough to represent per-route scope.

We need a dedicated assignment model to answer:

- Which routes can this admin manage?
- In which direction(s)?
- Is the assignment active?
- Who created/updated the assignment?

Without this model, route filtering and channel authorization become unsafe and hard to audit.

---

## 4. Proposed Model

Model name (suggested): `bo_route_admin_scope`

Each document represents one admin-to-route permission.

```ts
import { Schema, model } from "mongoose";

const routeAdminScopeSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "_users",
      required: true,
      index: true,
    },
    routeId: {
      type: Schema.Types.ObjectId,
      ref: "bu_routes",
      required: true,
      index: true,
    },
    directions: {
      type: [String],
      enum: ["FORWARD", "BACKWARD", "BOTH"],
      default: ["BOTH"],
      required: true,
    },
    permissions: {
      type: [String],
      default: ["MONITOR"],
      // examples: MONITOR, DISPATCH, CONTROL
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
    assignedBy: {
      type: Schema.Types.ObjectId,
      ref: "_users",
      required: false,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  },
);

routeAdminScopeSchema.index({ userId: 1, routeId: 1 }, { unique: true });

export default model("bo_route_admin_scope", routeAdminScopeSchema);
```

---

## 5. Backend Enforcement

### 5.1 API filtering

For `ROUTE_ADMIN`, every route query must be restricted to assigned routes:

- Resolve `assignedRouteIds` from `bo_route_admin_scope` (`active=true`).
- Apply `routeId IN assignedRouteIds` filter.

### 5.2 WebSocket authorization

When subscribing to `route:{routeId}:{direction}`:

- If `SUPER_ADMIN`: allow.
- If `ROUTE_ADMIN`: allow only when:
  - route is assigned and active
  - requested direction is allowed by assignment

### 5.3 Action authorization

Any write/control endpoint must validate the same scope before execution.

---

## 6. Suggested API Endpoints

- `GET /api/v1/backoffice/routes/assigned`
  - Returns only routes assigned to the logged-in route admin.
- `POST /api/v1/backoffice/route-admin-scope`
  - Assign route(s) to route admin.
- `PUT /api/v1/backoffice/route-admin-scope/:id`
  - Update directions/permissions/active flag.
- `DELETE /api/v1/backoffice/route-admin-scope/:id`
  - Revoke assignment.

---

## 7. Backoffice UI Behavior

- Route selector must show assigned routes only.
- Map must render current bus positions for selected assigned route/direction and update in real time.
- Initial map state should come from assigned-route snapshot API before live stream updates.
- If assignment is removed while connected:
  - unsubscribe from unauthorized channels
  - show access error and force route re-selection
- Any route outside assignment scope must be hidden or blocked in UI.

---

## 8. MVP Acceptance Criteria

- Route admin login returns only assigned routes in backoffice context.
- Route admin can select an assigned route and see current bus locations updating live on map.
- Route admin cannot subscribe to non-assigned route channels.
- Route admin cannot access snapshot/live map data for non-assigned routes.
- Route admin cannot perform actions on non-assigned routes.
- Super admin can assign/revoke route scopes and changes apply immediately.
- All scope changes are auditable (`assignedBy`, timestamps, active status).
