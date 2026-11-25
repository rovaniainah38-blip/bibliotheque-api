const ok = (res, data, extra = {}, status = 200) => res.status(status).json({ success: true, data, ...extra });
const fail = (res, status, message, extra = {}) => res.status(status).json({ success: false, message, ...extra });
module.exports = { ok, fail };
