/**
 * OpenAI client initialization.
 * Configured from environment variables (server-side only).
 */

import OpenAI from "openai";

let client: OpenAI | null = null;

/**
 * Get the OpenAI client singleton.
 * Throws if OPENAI_API_KEY is not set.
 */
export function getOpenAIClient(): OpenAI {
  if (client) return client;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }

  client = new OpenAI({ apiKey });
  return client;
}

function parseCategorizationContent(
  content: string
): Array<{ id: number; category: string }> {
  const normalized = content.trim();
  const strippedFence = normalized
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  const candidates = [normalized, strippedFence];

  for (const candidate of candidates) {
    try {
      const results = JSON.parse(candidate);
      if (!Array.isArray(results)) {
        continue;
      }

      return results.map((r: { id: unknown; category: unknown }) => {
        if (typeof r.id !== "number" || typeof r.category !== "string") {
          throw new Error("Invalid result format");
        }
        return { id: r.id, category: r.category };
      });
    } catch {
      // Try the next parsing strategy below.
    }
  }

  const jsonMatch = strippedFence.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    const results = JSON.parse(jsonMatch[0]);
    return results.map((r: { id: unknown; category: unknown }) => ({
      id: Number(r.id),
      category: String(r.category),
    }));
  }

  throw new Error(
    `Failed to parse OpenAI response: ${normalized.substring(0, 200)}`
  );
}

/**
 * Categorize transactions using OpenAI GPT-4o-mini.
 * Returns an array of { id, category } results.
 * Throws if the API call fails.
 */
export async function classifyTransactionsWithAI(
  prompt: string
): Promise<Array<{ id: number; category: string }>> {
  const openai = getOpenAIClient();

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are a personal finance assistant that categorizes transactions. Always respond with valid JSON only.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.1, // Low temperature for consistent categorization
    max_tokens: 2048,
  });

  const content = response.choices[0]?.message?.content?.trim();
  if (!content) {
    throw new Error("Empty response from OpenAI");
  }

  return parseCategorizationContent(content);
}
