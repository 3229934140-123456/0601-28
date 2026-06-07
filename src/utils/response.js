function success(data = null, message = 'success') {
  return {
    code: 0,
    message,
    data,
    timestamp: Date.now(),
  };
}

function error(message = 'error', code = -1, data = null) {
  return {
    code,
    message,
    data,
    timestamp: Date.now(),
  };
}

function paginate(list, page = 1, pageSize = 10) {
  const total = list.length;
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const items = list.slice(start, end);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

module.exports = { success, error, paginate };
