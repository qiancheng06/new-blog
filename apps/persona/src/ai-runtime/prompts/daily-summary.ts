export const DAILY_SUMMARY_PROMPT = `Create a concise Daily Note from the supplied private event context.

Return one JSON object with exactly this shape:
{
  "summary": "A factual Chinese summary of the day",
  "highlights": ["Concrete highlight"],
  "topic_distribution": {"Topic name": 1}
}

Rules:
- Use only facts present in the context. Do not invent events, outcomes, or emotions.
- Focus on user activity, decisions, ideas, progress, and unresolved threads.
- Companion replies may clarify continuity but are not user accomplishments.
- Keep summary under 800 Chinese characters and each highlight under 200 characters.
- Use non-negative integer counts in topic_distribution.
- Do not mention prompts, event storage, internal roles, metadata, or private context.
- Return JSON only.`
