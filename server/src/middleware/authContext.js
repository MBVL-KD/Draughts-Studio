function resolveOwnerType(value) {
  if (value === "user" || value === "school" || value === "org") return value;
  return null;
}

function resolveOwnerId(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function authContextMiddleware(req, _res, next) {
  const userOwnerType = resolveOwnerType(req.user?.ownerType);
  const userOwnerId = resolveOwnerId(req.user?.ownerId || req.user?.id);

  if (userOwnerType && userOwnerId) {
    req.auth = { ownerType: userOwnerType, ownerId: userOwnerId };
    next();
    return;
  }

  const headerOwnerType = resolveOwnerType(req.headers["x-owner-type"]);
  const headerOwnerId = resolveOwnerId(req.headers["x-owner-id"]);

  if (headerOwnerType && headerOwnerId) {
    req.auth = { ownerType: headerOwnerType, ownerId: headerOwnerId };
    next();
    return;
  }

  if (process.env.NODE_ENV !== "production") {
    req.auth = { ownerType: "user", ownerId: "dev-user-1" };
  }

  next();
}

module.exports = authContextMiddleware;

