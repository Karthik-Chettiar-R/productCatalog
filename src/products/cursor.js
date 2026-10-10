const CURSOR_VERSION = 1;

function invalidCursor(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function encodeCursor(cursor) {
  return Buffer.from(JSON.stringify({
    v: CURSOR_VERSION,
    field: cursor.field,
    order: cursor.order,
    value: cursor.value,
    id: cursor.id,
    boundary: cursor.boundary
  }), 'utf8').toString('base64url');
}

function decodeCursor(encodedCursor, expected) {
  if (!encodedCursor || typeof encodedCursor !== 'string' || encodedCursor.length > 512) {
    throw invalidCursor('Cursor must be a valid string.');
  }

  let cursor;
  try {
    cursor = JSON.parse(Buffer.from(encodedCursor, 'base64url').toString('utf8'));
  } catch {
    throw invalidCursor('Cursor is not valid base64url JSON.');
  }

  const isValid =
    cursor &&
    cursor.v === CURSOR_VERSION &&
    cursor.field === expected.field &&
    cursor.order === expected.order &&
    (cursor.boundary === 'after' || cursor.boundary === 'before') &&
    typeof cursor.value === 'string' &&
    Number.isSafeInteger(cursor.id) &&
    cursor.id > 0;

  if (!isValid) {
    throw invalidCursor('Cursor does not match the requested sort or contains invalid data.');
  }

  return cursor;
}

module.exports = { encodeCursor, decodeCursor };
