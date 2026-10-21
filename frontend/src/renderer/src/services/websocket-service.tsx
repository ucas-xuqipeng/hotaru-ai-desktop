/* eslint-disable global-require */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable no-use-before-define */
import { Subject, BehaviorSubject } from 'rxjs';
import i18n from '@/i18n';
import { WebSocketConnection, ConnectionState } from './websocket-connection';
import { ModelInfo } from '@/context/live2d-config-context';
import { HistoryInfo } from '@/context/websocket-context';
import { ConfigFile } from '@/context/character-config-context';
import { toaster } from '@/components/ui/toaster';

export interface DisplayText {
  text: string;
  name: string;
  avatar: string;
}

interface BackgroundFile {
  name: string;
  url: string;
}

export interface AudioPayload {
  type: 'audio';
  audio?: string;
  volumes?: number[];
  slice_length?: number;
  display_text?: DisplayText;
  actions?: Actions;
}

export interface Message {
  id: string;
  content: string;
  role: "ai" | "human";
  timestamp: string;
  name?: string;
  avatar?: string;

  // Fields for different message types (make optional)
  type?: 'text' | 'tool_call_status'; // Add possible types, default to 'text' if omitted
  tool_id?: string; // Specific to tool calls
  tool_name?: string; // Specific to tool calls
  status?: 'running' | 'completed' | 'error'; // Specific to tool calls
}

export interface Actions {
  motions?: string[];
  expressions?: string[] | number [];
  pictures?: string[];
  sounds?: string[];
}

export interface MessageEvent {
  tool_id: any;
  tool_name: any;
  name: any;
  status: any;
  content: string;
  timestamp: string;
  type: string;
  audio?: string;
  volumes?: number[];
  slice_length?: number;
  files?: BackgroundFile[];
  actions?: Actions;
  text?: string;
  model_info?: ModelInfo;
  conf_name?: string;
  conf_uid?: string;
  uids?: string[];
  messages?: Message[];
  history_uid?: string;
  success?: boolean;
  histories?: HistoryInfo[];
  configs?: ConfigFile[];
  message?: string;
  members?: string[];
  is_owner?: boolean;
  client_uid?: string;
  forwarded?: boolean;
  display_text?: DisplayText;
  live2d_model?: string;
  browser_view?: {
    debuggerFullscreenUrl: string;
    debuggerUrl: string;
    pages: {
      id: string;
      url: string;
      faviconUrl: string;
      title: string;
      debuggerUrl: string;
      debuggerFullscreenUrl: string;
    }[];
    wsUrl: string;
    sessionId?: string;
  };
}

// Get translation function for error messages
const getTranslation = () => {
  try {
    return i18n.t.bind(i18n);
  } catch (e) {
    // Fallback if i18next is not available
    return (_key: string) => '连接已断开，正在自动重连，请稍后重试。';
  }
};

class WebSocketService {
  private static instance: WebSocketService;

  private messageSubject = new Subject<MessageEvent>();
  private stateSubject = new BehaviorSubject<ConnectionState>('CLOSED');
  private historyUid: string | null = null;
  private lastInputNotice = 0;
  private connection = new WebSocketConnection({
    onState: (state) => this.stateSubject.next(state),
    onOpen: () => this.initializeConnection(),
    onMessage: (raw) => {
      try {
        const message = JSON.parse(raw);
        if (message.type === 'new-history-created') this.historyUid = message.history_uid;
        this.messageSubject.next(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    },
  });

  static getInstance() {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  private initializeConnection() {
    this.sendMessage({
      type: 'fetch-backgrounds',
    });
    this.sendMessage({
      type: 'fetch-configs',
    });
    this.sendMessage({
      type: 'fetch-history-list',
    });
    this.sendMessage(this.historyUid
      ? { type: 'fetch-and-set-history', history_uid: this.historyUid }
      : { type: 'create-new-history' });
  }

  connect(url: string) {
    this.connection.connect(url);
  }

  sendMessage(message: object): boolean {
    const sent = this.connection.send(message);
    const data = message as { type?: string; history_uid?: string };
    if (sent && data.type === 'fetch-and-set-history' && data.history_uid) {
      this.historyUid = data.history_uid;
    }
    if (!sent && data.type === 'text-input' && Date.now() - this.lastInputNotice > 5000) {
      this.lastInputNotice = Date.now();
      toaster.create({
        title: getTranslation()('error.websocketNotOpen'),
        type: 'error',
        duration: 2000,
      });
    }
    return sent;
  }

  onMessage(callback: (message: MessageEvent) => void) {
    return this.messageSubject.subscribe(callback);
  }

  onStateChange(callback: (state: 'CONNECTING' | 'OPEN' | 'CLOSING' | 'CLOSED') => void) {
    return this.stateSubject.subscribe(callback);
  }

  disconnect() {
    this.connection.disconnect();
  }

  getCurrentState() {
    return this.connection.getCurrentState();
  }
}

export const wsService = WebSocketService.getInstance();
