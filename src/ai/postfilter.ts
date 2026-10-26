// Пост-фильтр безопасности для текста, сгенерированного ИИ.
//
// ВАЖНО: это эвристический рубеж "лучшее, что можно сделать на регулярках",
// а НЕ гарантия безопасности контента. Основная защита — офлайн-пул текстов,
// который написан вручную и заведомо безопасен; ИИ только дополняет его, и
// при малейшем подозрении вызывающий код должен откатиться на офлайн-текст
// (см. src/ai/client.ts — весь вызов целиком считается неуспешным, если хоть
// один кусок текста не прошёл фильтр). Регулярки не понимают контекст и могут
// пропустить обходные формулировки или перестраховаться на безобидном тексте;
// ниже по каждому блоку отмечено, где именно фильтр слабее.

export interface PostFilterContext {
  characterAge: number;
  category: string;
}

type FilterResult = { ok: true } | { ok: false; reason: string };

const MAX_WORDS = 280;

// --- Блок 1: романтика/телесность/сексуальный контент для персонажей < 18 лет ---
// Пояснение: само слово "свадьба"/"брак" для взрослого персонажа — нормальная
// часть контента и НЕ должно отклоняться. Эти паттерны проверяются только
// когда ctx.characterAge < 18, и целятся в телесную/интимную/"первая брачная
// ночь"-подобную формулировку, а не в факт упоминания отношений или свадьбы
// как социального события.
const MINOR_INTIMACY_PATTERNS: RegExp[] = [
  /первая\s+брачн\w*\s+ночь/iu,
  /брачн\w*\s+ложе/iu,
  /интимн\w*\s+(близост\w*|отношен\w*|сцен\w*)/iu,
  /сексуальн\w*/iu,
  /обнажённ\w*/iu,
  /обнажен\w*/iu,
  /раздел\w*\s+(её|его|ее)/iu,
  /ласк\w*\s+(тело|кож)/iu,
  /прикосновени\w*\s+к\s+(телу|коже|груди|бедрам|бёдрам)/iu,
  /страстн\w*\s+(поцелу\w*|объят\w*)/iu,
  /первый\s+раз\s+в\s+постели/iu,
  /\bпостель\b.*\b(вместе|с ним|с ней)\b/iu,
  /\bwedding\s+night\b/i,
  /\bconsummat\w*/i,
  /\bintimat\w*\s+(moment|encounter|scene)\b/i,
  /\bsexual\w*/i,
  /\bnaked\b/i,
  /\bundressed\b/i,
  /\bmade\s+love\b/i,
  /\bcaress(ed|ing)?\s+(her|his)\s+(body|skin|breast)/i,
  /\bbedroom\s+scene\b/i,
  /\bfirst\s+time\s+in\s+bed\b/i,
];

// --- Блок 2: графическое насилие / травмы / процесс умирания ---
// Сам факт смерти/травмы/конфликта — ожидаемый и нормальный контент игры.
// Здесь ловим именно детализацию: кровь, расчленение, описание боли и агонии
// "по кадрам" и т.п.
const GRAPHIC_VIOLENCE_PATTERNS: RegExp[] = [
  /хлыну\w*\s+кров\w*/iu,
  /лужа\s+крови/iu,
  /кровь\s+(хлест|брызг|текла|залила)\w*/iu,
  /внутренност\w*/iu,
  /вывалив\w*\s+(кишк\w*|внутренност\w*)/iu,
  /оторван\w*\s+(конечност\w*|рук\w*|ног\w*|голов\w*)/iu,
  /расчленен\w*|расчленён\w*/iu,
  /хрип\w*\s+и\s+судорог\w*/iu,
  /агони\w*\s+длил\w*/iu,
  /предсмертн\w*\s+хрип/iu,
  /торчащ\w*\s+кост\w*/iu,
  /размозж\w*/iu,
  /\bgushing\s+blood\b/i,
  /\bpool\s+of\s+blood\b/i,
  /\bentrails?\b/i,
  /\bdismember\w*/i,
  /\bsevered\s+(limb|head|arm|leg)/i,
  /\bdeath\s+rattle\b/i,
  /\bprotruding\s+bones?\b/i,
  /\bgaping\s+wound\b/i,
  /\bbled\s+out\s+slowly\b/i,
];

// --- Блок 3: самоповреждение/суицид — конкретные методы/техники ---
// Сама тема утраты, горя или смерти (в том числе по собственной воле) не
// отклоняется — отклоняется описание конкретного способа/техники.
const SELF_HARM_METHOD_PATTERNS: RegExp[] = [
  /порезал\w*\s+(себе\s+)?вен\w*/iu,
  /вскрыл\w*\s+вен\w*/iu,
  /передозировк\w*\s+(таблет\w*|препарат\w*)/iu,
  /повесил\w*\s+(себя|на)/iu,
  /петл\w*\s+(из|на)\s+(шее|шею)/iu,
  /спрыгнул\w*\s+с\s+(крыши|моста|окна)/iu,
  /проглотил\w*\s+(таблетк\w*|яд)/iu,
  /\bslit\s+(his|her|their)\s+wrists?\b/i,
  /\bhanged\s+(himself|herself|themselves)\b/i,
  /\boverdos\w*\s+on\s+pills\b/i,
  /\bjumped\s+(off|from)\s+(the\s+)?(roof|bridge|window)\b/i,
  /\bnoose\s+around\s+(his|her|their)\s+neck\b/i,
];

// --- Блок 4: уничижительные обобщения о народах/религиях/странах ---
// Самый сложный случай для регулярок. Это грубая эвристика на основе
// "[группа] + [негативная характеристика]"-паттернов и явных оскорблений;
// заведомо НЕ ловит завуалированные/творчески сформулированные обобщения.
const DEGRADING_GENERALIZATION_PATTERNS: RegExp[] = [
  /все\s+(мусульман\w*|христиан\w*|евре\w*|цыган\w*|мигрант\w*|африканц\w*|азиат\w*)\s+(это|—|-)?\s*(дикари|варвары|преступники|паразиты|недочеловеки)/iu,
  /(этот|эта|эти)\s+(народ|нация|рели?гия|страна)\s+(всегда|по\s+природе)\s+(дика\w*|варвар\w*|отстал\w*|преступн\w*|лжив\w*)/iu,
  /\b(all|every)\s+(muslims?|jews?|christians?|roma|migrants?|africans?|asians?)\s+are\s+(savages?|criminals?|subhuman|parasites?)\b/i,
  /\bthis\s+(people|religion|nation|country)\s+(is|are)\s+(inherently|by\s+nature)\s+(savage|backward|criminal|inferior)\b/i,
  // явные оскорбления/дегуманизация
  /недочеловек\w*/iu,
  /\bsubhuman\b/i,
  /\bracial(ly)?\s+inferior\b/i,
];

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function matchesAny(text: string, patterns: RegExp[]): string | null {
  for (const re of patterns) {
    if (re.test(text)) return re.source;
  }
  return null;
}

export function passesContentSafety(
  text: string,
  ctx: PostFilterContext,
): FilterResult {
  if (!text || text.trim().length === 0) {
    return { ok: false, reason: 'Пустой или состоящий из пробелов текст.' };
  }

  const wordCount = countWords(text);
  if (wordCount > MAX_WORDS) {
    return {
      ok: false,
      reason: `Текст слишком длинный (${wordCount} слов) — вероятно, аномальный/убежавший ответ.`,
    };
  }

  if (ctx.characterAge < 18) {
    const hit = matchesAny(text, MINOR_INTIMACY_PATTERNS);
    if (hit) {
      return {
        ok: false,
        reason: `Романтический/телесный контент для персонажа младше 18 лет (совпадение: ${hit}).`,
      };
    }
  }

  const violenceHit = matchesAny(text, GRAPHIC_VIOLENCE_PATTERNS);
  if (violenceHit) {
    return {
      ok: false,
      reason: `Графическое описание насилия/травм/умирания (совпадение: ${violenceHit}).`,
    };
  }

  const selfHarmHit = matchesAny(text, SELF_HARM_METHOD_PATTERNS);
  if (selfHarmHit) {
    return {
      ok: false,
      reason: `Описание конкретного способа самоповреждения/суицида (совпадение: ${selfHarmHit}).`,
    };
  }

  const degradingHit = matchesAny(text, DEGRADING_GENERALIZATION_PATTERNS);
  if (degradingHit) {
    return {
      ok: false,
      reason: `Уничижительное обобщение о народе/религии/стране (совпадение: ${degradingHit}).`,
    };
  }

  return { ok: true };
}
