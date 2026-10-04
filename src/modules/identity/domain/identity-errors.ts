import type { IdentityIdParseError } from "../../../shared/domain/identity-ids.js";

export type IdentityDomainError =
  | IdentityIdParseError
  | Readonly<{
      code: "IDENTITY_ID_INVALID";
      field: "ownerId";
    }>
  | Readonly<{
      code: "IDENTITY_STATUS_INVALID";
      field: "status";
    }>;

export type IdentityContractError =
  | IdentityDomainError
  | Readonly<{
      code: "IDENTITY_CONTRACT_MALFORMED";
    }>
  | Readonly<{
      code: "IDENTITY_CONTRACT_UNSUPPORTED";
    }>;
