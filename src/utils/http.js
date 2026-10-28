function ok(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}
function created(res, data) {
  ok(res, data, 201);
}
function paginated(res, items, meta) {
  res.status(200).json({
    success: true,
    data: items,
    meta: { ...meta, pages: Math.ceil(meta.total / meta.limit) },
  });
}
module.exports = { ok, created, paginated };
