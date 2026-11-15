export const projectRoles = [
  "ADMIN",
  "PRODUCT_OWNER",
  "SCRUM_MASTER",
  "DEVELOPER",
  "DESIGNER",
  "QA",
] as const;
export type ProjectRole = (typeof projectRoles)[number];
export type Capability =
  | "project:read"
  | "delivery:write"
  | "project:manage"
  | "project:create"
  | "project:edit"
  | "teams:manage";
const grants: Record<ProjectRole, readonly Capability[]> = {
  ADMIN: [
    "project:read",
    "delivery:write",
    "project:manage",
    "project:create",
    "project:edit",
    "teams:manage",
  ],
  PRODUCT_OWNER: [
    "project:read",
    "delivery:write",
    "project:create",
    "project:edit",
    "teams:manage",
  ],
  SCRUM_MASTER: [],
  DEVELOPER: [],
  DESIGNER: [],
  QA: [],
};
export function hasCapability(role: string, capability: Capability): boolean {
  return (
    Object.prototype.hasOwnProperty.call(grants, role) &&
    grants[role as ProjectRole].includes(capability)
  );
}
