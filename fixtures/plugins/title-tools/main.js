export async function normalizeTitles(ctx) {
  const result = await ctx.content.readSelection({ fields: ['title'] });
  const items = Array.isArray(result?.items) ? result.items : [];
  const preview = items.map((item) => ({
    token: item.token,
    title: String(item.title ?? '')
      .trim()
      .replace(/\s+/g, ' '),
  }));
  if (items.length === 0) {
    return { preview };
  }
  await ctx.content.applyBatch({
    operationId: ctx.operationId,
    label: '整理资料标题',
    operations: items.map((item, index) => ({
      ref: item.ref ?? item.token,
      expectedRevision: item.revision,
      set: { title: preview[index].title },
    })),
  });
  return { preview };
}
