export type MessageValues = Record<string, number | string>;

export function formatMessage(
  template: string,
  values: MessageValues = {}
): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, key: string) => {
    const value = values[key];
    return value == null ? placeholder : String(value);
  });
}

export function formatCountMessage(
  count: number,
  oneTemplate: string,
  otherTemplate: string
): string {
  return formatMessage(count === 1 ? oneTemplate : otherTemplate, { count });
}
