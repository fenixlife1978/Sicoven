/** Devuelve una tasa BCV utilizable sin recurrir a valores ficticios o implícitos. */
export const getValidBcvRate = (value: unknown): number | null => {
  const rate = Number(value);
  return Number.isFinite(rate) && rate > 0 ? rate : null;
};
