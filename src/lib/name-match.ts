function normalizeName(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(left: string, right: string) {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;

  const rows = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let i = 1; i <= left.length; i += 1) {
    let previous = i - 1;
    rows[0] = i;

    for (let j = 1; j <= right.length; j += 1) {
      const current = rows[j];
      const substitution = previous + (left[i - 1] === right[j - 1] ? 0 : 1);
      const insertion = rows[j] + 1;
      const deletion = rows[j - 1] + 1;
      rows[j] = Math.min(substitution, insertion, deletion);
      previous = current;
    }
  }

  return rows[right.length];
}

function scoreNameMatch(targetName: string, candidateName: string) {
  const target = normalizeName(targetName);
  const candidate = normalizeName(candidateName);

  if (!target || !candidate) return null;
  if (target === candidate) return 0;
  if (candidate.includes(target) || target.includes(candidate)) return 1;

  const targetParts = target.split(" ").filter(Boolean);
  const candidateParts = candidate.split(" ").filter(Boolean);
  const targetFirst = targetParts[0] || "";
  const candidateFirst = candidateParts[0] || "";
  const targetLast = targetParts[targetParts.length - 1] || "";
  const candidateLast = candidateParts[candidateParts.length - 1] || "";

  if (!targetLast || !candidateLast) return null;

  const lastDistance = levenshteinDistance(targetLast, candidateLast);
  const longerLastNameLength = Math.max(targetLast.length, candidateLast.length);
  const lastCompatible = (
    lastDistance <= 1
    || (longerLastNameLength >= 8 && lastDistance <= 2)
    || targetLast.startsWith(candidateLast)
    || candidateLast.startsWith(targetLast)
  );
  if (!lastCompatible) return null;

  if (!targetFirst || !candidateFirst) {
    return 10 + lastDistance;
  }

  const firstDistance = levenshteinDistance(targetFirst, candidateFirst);
  const firstCompatible = (
    firstDistance <= 1
    || targetFirst.startsWith(candidateFirst)
    || candidateFirst.startsWith(targetFirst)
    || targetFirst[0] === candidateFirst[0]
  );
  if (!firstCompatible) return null;

  return 10 + (lastDistance * 2) + firstDistance;
}

export function isFuzzyNameMatch(targetName: string, candidateName?: string | null) {
  return scoreNameMatch(targetName, candidateName || "") !== null;
}

export function findBestFuzzyNameMatch<T>(
  items: T[],
  targetName: string,
  getName: (item: T) => string,
): T | undefined {
  const scored = items
    .map((item) => ({ item, name: getName(item), score: scoreNameMatch(targetName, getName(item)) }))
    .filter((entry): entry is { item: T; name: string; score: number } => typeof entry.score === "number")
    .sort((left, right) => left.score - right.score || left.name.localeCompare(right.name));

  const best = scored[0];
  if (!best) return undefined;

  const second = scored[1];
  if (
    second
    && second.score === best.score
    && normalizeName(second.name) !== normalizeName(best.name)
  ) {
    return undefined;
  }

  return best.item;
}
