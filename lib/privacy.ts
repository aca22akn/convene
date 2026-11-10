import { aiProviderName } from "./ai-provider";

export const RETENTION_DAYS_DEFAULT = 365;

const commonNotice = [
  "We collect your name, your one-line profile, optional X handle and speaker topic, and contact details only when you provide them.",
  "Your name and your line appear to people you are matched with. The room screen shows your first name and a quote from your line.",
  "Contact details are shared with the organiser only if you consent.",
  "The public directory shows your profile only if you opt in.",
  "The organiser can delete event data at any time.",
] as const;

export function privacyNotice(aiEnabled: boolean, retentionDays = RETENTION_DAYS_DEFAULT, providerName = aiProviderName()): string[] {
  return [
    ...commonNotice,
    aiEnabled
      ? `When event AI is enabled (\`ai_enabled\`), your name, line, X handle, and speaker topic may be processed by ${providerName} for matching and Ask unless you set \`ai_opt_out\`. If you opt out, only basic keyword matching is used and your text is excluded from AI prompts.`
      : "External AI processing is off for this event (`ai_enabled` is off); matching uses basic keyword extraction and tag-only matching.",
    `Event data is retained for ${retentionDays} days, then deleted automatically.`,
  ];
}

export function renderPrivacyReadmeSection(retentionDays = RETENTION_DAYS_DEFAULT, providerName = aiProviderName()): string {
  return [
    ...privacyNotice(false, retentionDays, providerName).slice(0, 5),
    "Each event controls external AI with `ai_enabled`; when it is off, external AI is not called and matching uses keyword extraction and tags.",
    `When \`ai_enabled\` is on, attendees can set \`ai_opt_out\`. Names, lines, X handles, and speaker topics from people who have not opted out may be processed by ${providerName} for matching and Ask; opted-out people are excluded from AI prompts and receive basic matching only.`,
    `Event data is retained for ${retentionDays} days, then deleted automatically.`,
  ].map((line) => `- ${line}`).join("\n");
}

export function renderDataProviderSection(providerName = aiProviderName()): string {
  return [
    "`members` rows are private to server-side routes and authorised organisers. Public directory rows are available only when `directory_consent` is true, and the public live screen has a reduced projection. " +
      `${providerName} receives attendee text only when the event has \`ai_enabled = true\` and that attendee has \`ai_opt_out = false\`.`,
    "",
    "## AI processing decision",
    "",
    `\`events.ai_enabled\` controls whether an event may call ${providerName}. If it is false, extraction, reranking, and Ask use no external AI. When it is true, \`members.ai_opt_out\` lets an attendee keep their text out of external AI: opted-out people are excluded both as the subject and as candidates in AI prompts, and receive keyword/tag-based matching. The public join notice and README privacy section describe the same rule.`,
    "",
    `| Column | Stored as | Read by | Sent to ${providerName} | Retention / handling |`,
    "|---|---|---|---|---|",
  ].join("\n");
}
