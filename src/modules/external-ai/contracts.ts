export const AVAILABILITY_TOOL_NAME = "pan_availability_check" as const;

export const AVAILABILITY_MODEL_INSTRUCTION =
  "Answer only from the pan_availability_check result. That result is the only availability fact. You cannot grant access, change a relationship, approve a request, or read a calendar. If the result is unavailable, say that the availability question cannot be answered." as const;

export const MAX_USER_TEXT_CHARS = 2_000;
export const MAX_LABEL_CHARS = 80;
export const MAX_MODEL_TEXT_CHARS = 4_000;

export const AVAILABILITY_TOOL_PARAMETERS = Object.freeze({
  type: "object",
  additionalProperties: false,
  properties: Object.freeze({
    who: Object.freeze({
      type: "string",
      description: "Label the user used for the person. Not an agent identifier.",
    }),
    start: Object.freeze({
      type: "string",
      description: "Interval start, UTC instant with a Z suffix.",
    }),
    end: Object.freeze({
      type: "string",
      description: "Interval end, UTC instant with a Z suffix.",
    }),
  }),
  required: Object.freeze(["who", "start", "end"]),
});

export type AvailabilityToolOffer = Readonly<{
  name: typeof AVAILABILITY_TOOL_NAME;
  description: string;
  parameters: typeof AVAILABILITY_TOOL_PARAMETERS;
}>;

export const AVAILABILITY_TOOL: AvailabilityToolOffer = Object.freeze({
  name: AVAILABILITY_TOOL_NAME,
  description:
    "Check whether one labeled person is available for a future UTC interval. This tool cannot grant access.",
  parameters: AVAILABILITY_TOOL_PARAMETERS,
});
