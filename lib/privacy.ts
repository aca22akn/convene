export const RETENTION_DAYS_DEFAULT = 365;

const commonNotice = [
  "We collect your name, your one-line profile, optional X handle and speaker topic, and contact details only when you provide them.",
  "Your name and your line appear to people you are matched with. The room screen shows your first name and a quote from your line.",
  "Contact details are shared with the organiser only if you consent.",
  "The public directory shows your profile only if you opt in.",
  "The organiser can delete event data at any time.",
] as const;

export function privacyNotice(aiEnabled: boolean, retentionDays = RETENTION_DAYS_DEFAULT): string[] {
  return [
    ...commonNotice,
    aiEnabled
      ? "When event AI is enabled, your name, line, and speaker topic may be processed by xAI for matching and Ask unless you opt out. If you opt out, only basic keyword matching is used and your text is excluded from AI prompts."
      : "External AI processing is off for this event; matching uses basic keyword extraction and tag-only matching.",
    `Event data is retained for ${retentionDays} days, then deleted automatically.`,
  ];
}

export function renderPrivacyReadmeSection(retentionDays = RETENTION_DAYS_DEFAULT): string {
  return [
    ...privacyNotice(false, retentionDays).slice(0, 5),
    "When event AI is enabled, names, lines, and speaker topics may be processed by xAI for matching and Ask unless a person opts out; opted-out text is excluded from AI prompts.",
    "When event AI is disabled, external AI is not called and matching uses keyword extraction and tags.",
    `Event data is retained for ${retentionDays} days, then deleted automatically.`,
  ].map((line) => `- ${line}`).join("\n");
}
