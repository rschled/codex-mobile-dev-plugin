const screen = document.querySelector('#screen');
const status = document.querySelector('#status');
const home = document.querySelector('#home');
const sendButton = document.querySelector('#send');
const typed = document.querySelector('#typed');
let socket;
let retry;
let frame;
let dragging;
let connected = false;

fetch('device').then(response => response.json()).then(device => {
  document.querySelector('#device').textContent = device.name;
  document.title = `${device.name} · iOS Simulator`;
}).catch(() => {});

function send(message) {
  if (connected && socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function enableInput(enabled) {
  connected = enabled;
  home.disabled = !enabled;
  sendButton.disabled = !enabled;
}

function connect() {
  clearTimeout(retry);
  const url = new URL('live', location.href);
  url.protocol = 'ws:';
  const current = socket = new WebSocket(url);
  current.binaryType = 'blob';
  status.textContent = screen.hidden ? 'Connecting…' : 'Reconnecting…';
  const timeout = setTimeout(() => current.close(), 10000);
  current.onmessage = ({ data }) => {
    if (current !== socket) return;
    if (typeof data === 'string') {
      const { error } = JSON.parse(data);
      status.textContent = error ?? 'Live';
      return;
    }
    const next = URL.createObjectURL(data);
    const previous = frame;
    frame = next;
    screen.src = next;
    if (previous) URL.revokeObjectURL(previous);
  };
  screen.onload = () => {
    if (current !== socket || connected) return;
    clearTimeout(timeout);
    screen.hidden = false;
    status.textContent = 'Live';
    enableInput(true);
  };
  current.onclose = () => {
    clearTimeout(timeout);
    if (current !== socket) return;
    dragging = undefined;
    enableInput(false);
    status.textContent = 'Reconnecting…';
    retry = setTimeout(connect, 1200);
  };
}

function releaseConnection() {
  clearTimeout(retry);
  const current = socket;
  socket = undefined;
  current?.close();
  if (frame) URL.revokeObjectURL(frame);
  frame = undefined;
  dragging = undefined;
  enableInput(false);
}

function coordinates(event) {
  const rect = screen.getBoundingClientRect();
  const width = screen.naturalWidth;
  const height = screen.naturalHeight;
  return {
    width, height,
    x: Math.min(width - 1, Math.max(0, (event.clientX - rect.left) / rect.width * width)),
    y: Math.min(height - 1, Math.max(0, (event.clientY - rect.top) / rect.height * height)),
  };
}

screen.addEventListener('pointerdown', event => {
  if (!connected || !event.isPrimary || event.button !== 0 || dragging) return;
  event.preventDefault();
  screen.focus({ preventScroll: true });
  screen.setPointerCapture(event.pointerId);
  dragging = { id: event.pointerId, point: coordinates(event), clientX: event.clientX, clientY: event.clientY, time: event.timeStamp };
});
screen.addEventListener('pointerup', event => {
  if (dragging?.id !== event.pointerId) return;
  const { point, clientX, clientY, time } = dragging;
  dragging = undefined;
  if (Math.hypot(event.clientX - clientX, event.clientY - clientY) < 8) {
    send({ type: 'tap', ...point });
  } else {
    const end = coordinates(event);
    const duration = Math.min(0.5, Math.max(0.16, (event.timeStamp - time) / 1000));
    send({ type: 'swipe', startX: point.x, startY: point.y, endX: end.x, endY: end.y, width: point.width, height: point.height, duration });
  }
});
for (const event of ['pointercancel', 'lostpointercapture']) {
  screen.addEventListener(event, e => { if (dragging?.id === e.pointerId) dragging = undefined; });
}
window.addEventListener('blur', () => { dragging = undefined; });
window.addEventListener('pagehide', releaseConnection);
window.addEventListener('pageshow', () => { if (!socket) connect(); });

screen.addEventListener('keydown', event => {
  if (!connected) return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (/^[\x20-\x7e]$/.test(event.key)) {
    event.preventDefault();
    send({ type: 'type', text: event.key });
  } else if (/^(Backspace|Enter|Escape|Arrow(Up|Down|Left|Right))$/.test(event.code)) {
    event.preventDefault();
    send({ type: 'key', code: event.code, modifiers: event.shiftKey ? ['shift'] : [] });
  }
});
function sendText(text) {
  if (!/^[\x20-\x7e]{1,1024}$/.test(text)) {
    status.textContent = 'Enter up to 1,024 printable US keyboard characters.';
    return;
  }
  status.textContent = 'Live';
  send({ type: 'type', text });
}
screen.addEventListener('paste', event => {
  if (!connected) return;
  event.preventDefault();
  sendText(event.clipboardData.getData('text'));
});
document.querySelector('#text').addEventListener('submit', event => {
  event.preventDefault();
  if (connected) sendText(typed.value);
});
home.addEventListener('click', () => send({ type: 'button', button: 'home' }));
connect();
