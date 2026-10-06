import { failure, type Result, success } from "../../../shared/domain/result.js";

declare const canonicalEmailBrand: unique symbol;

export type CanonicalEmail = string & { readonly [canonicalEmailBrand]: true };

export type EmailCanonicalizationError = Readonly<{
  code: "DISCOVERY_EMAIL_INVALID";
}>;

export const DISCOVERY_EMAIL_MAX_LENGTH = 254;
export const DISCOVERY_EMAIL_LOCAL_MAX_LENGTH = 64;

const LOCAL_PART = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export const canonicalizeDiscoveryEmail = (
  input: unknown,
): Result<CanonicalEmail, EmailCanonicalizationError> => {
  if (
    typeof input !== "string" ||
    input.length === 0 ||
    input.length > DISCOVERY_EMAIL_MAX_LENGTH ||
    !/^[\x21-\x7e]+$/.test(input)
  ) {
    return invalidEmail();
  }

  const separator = input.indexOf("@");
  if (separator <= 0 || separator !== input.lastIndexOf("@")) {
    return invalidEmail();
  }

  const local = input.slice(0, separator).toLowerCase();
  const domain = input.slice(separator + 1).toLowerCase();
  if (
    local.length > DISCOVERY_EMAIL_LOCAL_MAX_LENGTH ||
    local.includes("*") ||
    local.includes("?") ||
    !LOCAL_PART.test(local) ||
    domain.length === 0 ||
    domain.length > 253 ||
    !domain.split(".").every((label) => DOMAIN_LABEL.test(label))
  ) {
    return invalidEmail();
  }

  return success(`${local}@${domain}` as CanonicalEmail);
};

const invalidEmail = (): Result<never, EmailCanonicalizationError> =>
  failure({ code: "DISCOVERY_EMAIL_INVALID" });
