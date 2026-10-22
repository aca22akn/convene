// Keyword fallback extraction: works with no API key. Maps free text to the fixed TAGS vocabulary.
import type { Extraction, Tag } from "./types";

const RULES: [Tag, RegExp][] = [
  ["frontend", /\b(front[- ]?end|react|vue|svelte|next\.?js|css|ui engineer|mobile app|react native|ios|android)\b/i],
  ["backend", /\b(back[- ]?end|api|apis|python|node|go\b|golang|java|rust|django|rails|server|mvp backend|engineer|engineers|developer|dev agency|agency)\b/i],
  ["infra", /\b(infra|infrastructure|devops|kubernetes|k8s|cloud|aws|gcp|azure|sharding|scal(e|ing)|platform engineering|dev tooling|tooling)\b/i],
  ["databases", /\b(postgres|postgresql|mysql|database|databases|sql|sharding|redis|mongo)\b/i],
  ["ai-agents", /\b(agent|agents|agentic|assistant|copilot|automation)\b/i],
  ["ml", /\b(ml|machine learning|model|models|ai\b|deep learning|computer vision|triage)\b/i],
  ["llm-evals", /\b(evals?|evaluation|evaluating|red[- ]?team(ing)?|model accuracy|measure model|benchmark)\b/i],
  ["data", /\b(data|analytics|pipelines?|carbon[- ]accounting|smart[- ]meter|traction data)\b/i],
  ["design", /\b(design|designer|ux|ui\b|user research|ux research|figma)\b/i],
  ["accessibility", /\b(accessib\w*|a11y|wcag|inclusive)\b/i],
  ["product", /\b(product|products|product teams|pm\b|mvp|product-led)\b/i],
  ["growth", /\b(growth|users|user acquisition|product-led growth|stress-test)\b/i],
  ["marketing", /\b(marketing|brand|storytelling|audience)\b/i],
  ["sales", /\b(sales|clients|customers|first clients|pilots?|pilot site|case stud(y|ies))\b/i],
  ["fundraising", /\b(fundrais\w*|seed round|pre-seed|raise|raising|round)\b/i],
  ["angel-investing", /\b(angel|angels|syndicate)\b/i],
  ["vc", /\b(vc|vcs|venture|fund\b|seed fund|investors?|climate fund)\b/i],
  ["hiring", /\b(hir(e|ing)|first senior hire|recruit\w*|placement|team to build)\b/i],
  ["job-seeking", /\b(job[- ]?seek\w*|looking for (a )?(job|role)|open to work|new role)\b/i],
  ["career-returners", /\b(returners?|career breaks?|returning to tech|after a break)\b/i],
  ["cofounder", /\b(co-?founders?|technical founders?|non-technical founder)\b/i],
  ["community", /\b(community|communities|meetup|network|devrel programme|community partners)\b/i],
  ["events", /\b(events?|meetups?|conference|hackathon|club)\b/i],
  ["venues", /\b(venues?|space|spaces|office)\b/i],
  ["sponsorship", /\b(sponsor\w*)\b/i],
  ["legal", /\b(legal|law|lawyer|tech-law|contract|regulat\w*|compliance|compliant|ai act)\b/i],
  ["privacy", /\b(privacy|gdpr|data protection)\b/i],
  ["healthtech", /\b(health|healthtech|health-tech|nhs|gp surger\w*|patient|clinical|medical)\b/i],
  ["clinical-safety", /\b(clinical safety|dcb0129|dcb0160|clinical risk)\b/i],
  ["fintech", /\b(fintech|payments?|banking|open banking|insur\w*|finance|financing|money)\b/i],
  ["climate", /\b(climate|carbon|energy|heat[- ]pump|decarbon\w*|retrofit|green|net zero|materials)\b/i],
  ["hardware", /\b(hardware|devices?|iot|electronics|smart-meter|materials)\b/i],
  ["robotics", /\b(robot\w*|warehouse picking)\b/i],
  ["edtech", /\b(edtech|education|teach\w*|kids|school|after-school|coding club|students?|learn\w*)\b/i],
  ["mentoring", /\b(mentor\w*|advise|advising|coach\w*)\b/i],
  ["content", /\b(content|stories|storytelling|writing|newsletter|blog)\b/i],
  ["podcasting", /\b(podcast\w*)\b/i],
  ["devrel", /\b(devrel|developer relations|developer communit\w*|developer advoca\w*)\b/i],
  ["speaking", /\b(speak\w*|talks?|keynote|panel)\b/i],
  ["open-source", /\b(open[- ]source|oss|github)\b/i],
];

export function tagsIn(text: string | null | undefined): Tag[] {
  if (!text) return [];
  const out: Tag[] = [];
  for (const [tag, re] of RULES) if (re.test(text)) out.push(tag);
  return out;
}

const SEEK_SPLIT = /\b(need|needs|needing|looking for|want|wants|seeking|searching for|hiring)\b/i;

export function keywordExtract(line: string, speak_on?: string | null): Extraction {
  const m = SEEK_SPLIT.exec(line);
  const offerPart = m ? line.slice(0, m.index) : line;
  const seekPart = m ? line.slice(m.index) : "";
  const seeks = tagsIn(seekPart);
  const offers = tagsIn(offerPart);
  const speak_topics = tagsIn(speak_on);
  const topics = Array.from(new Set([...offers, ...seeks, ...speak_topics]));
  return { offers, seeks, topics, speak_topics };
}
