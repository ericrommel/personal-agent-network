import type { AvailabilityResponse } from "../modules/messaging/index.js";

export type AvailabilityCliNode = Readonly<{
  handle(principal: unknown, body: unknown): Promise<AvailabilityResponse>;
}>;

export type CliResult = Readonly<{
  exitCode: number;
  stdout: string;
  stderr: string;
}>;

const USAGE = "usage: availability-cli request <principal-json> <body-json>\n";

const usage = (): CliResult => ({ exitCode: 2, stdout: "", stderr: USAGE });

const printResponse = (response: AvailabilityResponse, exitCode: number): CliResult => ({
  exitCode,
  stdout: `${JSON.stringify(response)}\n`,
  stderr: "",
});

/**
 * Local operator adapter over `handle`. It does not grant, revoke, or open a port.
 * An empty node denies. This is not two-node acceptance.
 */
export const runAvailabilityCli = async (
  argv: readonly string[],
  node: AvailabilityCliNode,
): Promise<CliResult> => {
  if (argv.length === 0 || argv[0] === "--help" || argv[0] === "help") {
    return usage();
  }
  const principalText = argv[1];
  const bodyText = argv[2];
  if (
    argv[0] !== "request" ||
    argv.length !== 3 ||
    principalText === undefined ||
    bodyText === undefined
  ) {
    return usage();
  }
  const principal = parseJson(principalText);
  const body = parseJson(bodyText);
  if (principal === undefined || body === undefined) {
    return usage();
  }
  try {
    return printResponse(await node.handle(principal, body), 0);
  } catch {
    return printResponse(Object.freeze({ outcome: "unavailable" }), 1);
  }
};

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
};
