const rooms = new Map();

export function subscribe(roomId, res) {
  let set = rooms.get(roomId);
  if (!set) {
    set = new Set();
    rooms.set(roomId, set);
  }
  set.add(res);
  return function unsubscribe() {
    set.delete(res);
    if (!set.size) rooms.delete(roomId);
  };
}

export function publish(roomId, event) {
  const set = rooms.get(roomId);
  if (!set) return;
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of set) {
    res.write(payload);
  }
}
