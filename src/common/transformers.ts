// DECIMAL(12,2) columns come back from MySQL as strings; the API returns numbers.
export const decimal = {
  to: (v: number) => v,
  from: (v: string | number | null) => (v === null || v === undefined ? v : Number(v)),
};
