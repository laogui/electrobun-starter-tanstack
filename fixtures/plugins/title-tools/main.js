export async function normalizeTitles(ctx) {
  const result = await ctx.content.readSelection({ fields: ['title'] });
  const items = Array.isArray(result?.items) ? result.items : [];
  return {
    preview: items.map((item) => ({
      token: item.token,
      title: String(item.title ?? '')
        .trim()
        .replace(/\s+/g, ' '),
    })),
  };
}
