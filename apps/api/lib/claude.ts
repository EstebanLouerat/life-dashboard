import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY

const MODEL = process.env.CLAUDE_MODEL ?? "claude-sonnet-5-5";

/**
 * Ask Claude for JSON matching `schema`, then re-validate with zod so the
 * app only ever receives data that matches the shared contract.
 */
export async function generateStructured<S extends z.ZodType>(opts: {
  schema: S;
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<z.infer<S>> {
  const message = await client.messages.parse({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.system,
    messages: [{ role: "user", content: opts.prompt }],
    output_config: { format: zodOutputFormat(opts.schema) },
  });

  if (message.parsed_output == null) {
    throw new Error(`Claude returned no structured output (stop_reason: ${message.stop_reason})`);
  }
  return opts.schema.parse(message.parsed_output);
}
