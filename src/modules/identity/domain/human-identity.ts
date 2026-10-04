import {
  type HumanIdentityId,
  type IdentityIdParseError,
  parseHumanIdentityId,
} from "../../../shared/domain/identity-ids.js";
import { type Result, success } from "../../../shared/domain/result.js";

export type HumanIdentity = Readonly<{
  kind: "human";
  id: HumanIdentityId;
}>;

export const createHumanIdentity = (id: unknown): Result<HumanIdentity, IdentityIdParseError> => {
  const parsedId = parseHumanIdentityId(id);
  return parsedId.ok
    ? success(Object.freeze({ kind: "human" as const, id: parsedId.value }))
    : parsedId;
};
