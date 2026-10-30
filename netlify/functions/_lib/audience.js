// Who an announcement is for.
// audience: { type: 'all' | 'states' | 'hubs' | 'roles', stateCodes: [], hubIds: [], roles: [] }
// roles include 'participant', 'leader', 'coordinator', 'volunteer', 'admin'.
export function matchesParticipant(audience = {}, p) {
  switch (audience.type) {
    case "all":
      return true;
    case "states":
      return (audience.stateCodes || []).includes(p.stateCode);
    case "hubs":
      return Boolean(p.hubId) && (audience.hubIds || []).includes(p.hubId);
    case "roles":
      return (audience.roles || []).includes("participant");
    default:
      return false;
  }
}

export function matchesStaff(audience = {}, u) {
  const role = u.role === "superadmin" ? "admin" : u.role;
  switch (audience.type) {
    case "all":
      return true;
    case "states":
      return Boolean(u.stateCode) && (audience.stateCodes || []).includes(u.stateCode);
    case "hubs":
      return (u.hubIds || []).some((h) => (audience.hubIds || []).includes(h));
    case "roles":
      return (audience.roles || []).includes(role);
    default:
      return false;
  }
}

export function meetingApplies(m, { stateCode, hubId }) {
  if (!m.scope || m.scope === "national") return true;
  if (m.scope === "state") return m.stateCode === stateCode;
  if (m.scope === "hub") return Boolean(hubId) && m.hubId === hubId;
  return false;
}
