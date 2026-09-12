import type { StoryPage } from "./story";

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const fillers = new Set(
  "a an the i we to go do it is and or please want choose pick option one two first second lets little small with for of that this would like can could should".split(
    " ",
  ),
);

export function spokenChoice(
  text: string,
  choices: string[],
): number | undefined {
  if (choices.length !== 2) return;
  const answer = normalize(text);
  if (/\b(not|no|neither|both|dont|instead)\b/.test(answer)) return;
  const number = answer.match(
    /^(?:(?:i (?:choose|pick|want|would like)|lets (?:choose|pick)) )?(?:the )?(?:option |number )?(one|two|1|2|first|second)(?: (?:one|option))?(?: please)?$/,
  );
  if (number) return /^(one|1|first)$/.test(number[1]) ? 0 : 1;
  if (/^(why|how|what|who|where|when|does|is|are)\b/.test(answer)) return;
  const normalized = choices.map(normalize);
  const exact = normalized.flatMap((choice, i) =>
    choice === answer ? [i] : [],
  );
  if (exact.length === 1) return exact[0];
  const words = new Set(answer.split(" ").filter((word) => !fillers.has(word)));
  const matches = normalized.flatMap((choice, i) => {
    const other = new Set(normalized[1 - i].split(" "));
    const optionWords = new Set(choice.split(" "));
    // A new verb, attribute or extra action belongs to the child, not to a
    // preset option. Never discard it because a character name also matched.
    return words.size > 0 &&
      [...words].every((word) => optionWords.has(word)) &&
      [...words].some((word) => !other.has(word))
      ? [i]
      : [];
  });
  return matches.length === 1 ? matches[0] : undefined;
}

export function pageNarration(page: StoryPage) {
  if (page.responseKind === "ending") return page.narrative;
  if (page.responseKind === "calm")
    return `${page.narrative} We can continue gently when you’re ready.`;
  if (page.responseKind === "answer" || page.responseKind === "simplify")
    return page.narrative;
  const parts = [page.narrative, page.question];
  page.choices
    .slice(0, 2)
    .forEach((choice, index) =>
      parts.push(
        `Option ${index === 0 ? "one" : "two"}: ${choice.replace(/[.!?]+$/, "")}.`,
      ),
    );
  if (page.choices.length === 2)
    parts.push(
      "Say one or two, choose on the screen, or tell me your own idea.",
    );
  return parts.join(" ");
}
