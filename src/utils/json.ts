export function jsonSerializer(_key: string, value: unknown) {
  if (value === Infinity) {
    return '9e999';
  }
  if (value === -Infinity) {
    return '-9e999';
  }
  return value;
}

export function jsonEncode(data: unknown) {
  return JSON.stringify(data, jsonSerializer).replaceAll(
    /"(-?9e999)"/g,
    (_str, grp) => grp,
  );
}
