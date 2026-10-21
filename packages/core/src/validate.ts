import Ajv from "ajv-draft-04";
import schema from "./schema/collection-v2.1.0.json" with { type: "json" };

type Validator = ((d: unknown) => boolean) & { errors?: unknown };
let validator: Validator | undefined;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Validates against the public Collection v2.1.0 JSON schema. */
export function validateCollection(data: unknown): ValidationResult {
  if (!validator) {
    const ajv = new (Ajv as unknown as typeof Ajv.default)({ allErrors: true, strict: false });
    validator = ajv.compile(schema as object) as unknown as Validator;
  }
  const valid = validator!(data);
  const errs = (validator!.errors ?? []) as { instancePath?: string; message?: string }[];
  return { valid, errors: valid ? [] : errs.map((e) => `${e.instancePath || "/"} ${e.message ?? ""}`.trim()) };
}
