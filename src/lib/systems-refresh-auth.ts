export function authorizeSystemsMutation(authorization: string | null, cronSecret: string | undefined) {
  if (!cronSecret) return false;
  return authorization === `Bearer ${cronSecret}`;
}

export function parseSystemsRefreshDate(value: string | null | undefined) {
  if (value == null || value === "") return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("date must be YYYY-MM-DD");
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error("date must be a valid calendar date");
  }
  return value;
}

export default {
  authorizeSystemsMutation,
  parseSystemsRefreshDate,
};
