export type ConnectionState = 'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED';

interface SocketLike {
  readyState: number;
  onopen: ((event: any) => void) | null;
  onclose: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onmessage: ((event: { data: string }) => void) | null;
  send(raw: string): void;
  close(): void;
}

interface ConnectionOptions {
  onState(state: ConnectionState): void;
  onMessage(raw: string): void;
  onOpen?(): void;
  createSocket?(url: string): SocketLike;
  retryDelays?: number[];
}

/** Own one socket, discard stale callbacks, and reconnect without replaying audio. */
export class WebSocketConnection {
  private socket: SocketLike | null = null;
  private url = '';
  private state: ConnectionState = 'CLOSED';
  private stopped = true;
  private retries = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private options: ConnectionOptions;

  constructor(options: ConnectionOptions) { this.options = options; }

  getCurrentState(): ConnectionState { return this.state; }

  private updateState(state: ConnectionState) {
    if (this.state !== state) {
      this.state = state;
      this.options.onState(state);
    }
  }

  private clearTimer() {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private disposeSocket() {
    const previous = this.socket;
    this.socket = null;
    if (!previous) return;
    previous.onopen = null;
    previous.onclose = null;
    previous.onerror = null;
    previous.onmessage = null;
    try { previous.close(); } catch { /* Already closed. */ }
  }

  connect(url: string) {
    if (!this.stopped && this.url === url
      && (this.socket?.readyState === 0 || this.socket?.readyState === 1)) return;
    this.stopped = false;
    this.url = url;
    this.retries = 0;
    this.clearTimer();
    this.disposeSocket();
    this.openSocket();
  }

  private openSocket() {
    if (this.stopped) return;
    this.updateState('CONNECTING');
    try {
      const socket = this.options.createSocket
        ? this.options.createSocket(this.url) : new WebSocket(this.url);
      this.socket = socket;
      socket.onopen = () => {
        if (this.socket !== socket || this.stopped) return;
        this.retries = 0;
        this.updateState('OPEN');
        this.options.onOpen?.();
      };
      socket.onmessage = (event) => {
        if (this.socket === socket && !this.stopped) this.options.onMessage(event.data);
      };
      const lost = () => {
        if (this.socket === socket && !this.stopped) this.recover();
      };
      socket.onclose = lost;
      socket.onerror = lost;
    } catch { this.recover(); }
  }

  private recover() {
    this.disposeSocket();
    this.updateState('CLOSED');
    if (this.stopped || this.timer !== null) return;
    const delays = this.options.retryDelays?.length
      ? this.options.retryDelays : [1000, 2000, 4000, 8000, 10000];
    const delay = delays[Math.min(this.retries++, delays.length - 1)];
    this.timer = setTimeout(() => {
      this.timer = null;
      this.openSocket();
    }, delay);
  }

  send(message: object): boolean {
    if (this.socket?.readyState !== 1) return false;
    try {
      this.socket.send(JSON.stringify(message));
      return true;
    } catch {
      this.recover();
      return false;
    }
  }

  disconnect() {
    this.stopped = true;
    this.clearTimer();
    this.disposeSocket();
    this.updateState('CLOSED');
  }
}
