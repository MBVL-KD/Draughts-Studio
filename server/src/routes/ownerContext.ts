import { ForbiddenError } from "../utils/httpErrors";

type OwnerType = "user" | "school" | "org";

type RequestLike = {
  auth?: {
    ownerType?: OwnerType;
    ownerId?: string;
  };
  user?: {
    ownerType?: OwnerType;
    ownerId?: string;
  };
};

export function getOwnerContext(req: RequestLike): { ownerType: OwnerType; ownerId: string } {
  const ownerType = req.auth?.ownerType ?? req.user?.ownerType;
  const ownerId = req.auth?.ownerId ?? req.user?.ownerId;
  if (!ownerType || !ownerId) {
    throw new ForbiddenError("Missing owner context");
  }
  if (ownerType !== "user" && ownerType !== "school" && ownerType !== "org") {
    throw new ForbiddenError("Invalid owner context");
  }
  return { ownerType, ownerId };
}

