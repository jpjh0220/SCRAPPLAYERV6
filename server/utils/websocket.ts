import { Server as HTTPServer } from "http";
import { WebSocketServer, WebSocket } from "ws";

export interface WSMessage {
  type: string;
  payload: any;
}

export interface WSClient {
  ws: WebSocket;
  userId?: string;
  subscriptions: Set<string>;
}

/**
 * WebSocket manager for real-time features
 */
export class WebSocketManager {
  private wss: WebSocketServer;
  private clients = new Map<string, WSClient>();
  private clientIdCounter = 0;

  constructor(server: HTTPServer) {
    this.wss = new WebSocketServer({
      server,
      path: "/ws"
    });

    this.wss.on("connection", (ws: WebSocket, req) => {
      this.handleConnection(ws, req);
    });

    // Heartbeat to detect broken connections
    setInterval(() => {
      this.clients.forEach((client, id) => {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.ping();
        } else {
          this.clients.delete(id);
        }
      });
    }, 30000); // Every 30 seconds
  }

  private handleConnection(ws: WebSocket, req: any) {
    const clientId = `client_${++this.clientIdCounter}`;
    const client: WSClient = {
      ws,
      subscriptions: new Set(),
    };

    this.clients.set(clientId, client);
    console.log(`[WebSocket] Client connected: ${clientId}`);

    ws.on("message", (data) => {
      try {
        const message: WSMessage = JSON.parse(data.toString());
        this.handleMessage(clientId, message);
      } catch (error) {
        console.error("[WebSocket] Invalid message:", error);
      }
    });

    ws.on("close", () => {
      this.clients.delete(clientId);
      console.log(`[WebSocket] Client disconnected: ${clientId}`);
    });

    ws.on("error", (error) => {
      console.error(`[WebSocket] Client error ${clientId}:`, error);
    });

    // Send welcome message
    this.send(clientId, {
      type: "connected",
      payload: { clientId },
    });
  }

  private handleMessage(clientId: string, message: WSMessage) {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (message.type) {
      case "auth":
        // Authenticate client with userId
        client.userId = message.payload.userId;
        break;

      case "subscribe":
        // Subscribe to specific topics
        const topics = Array.isArray(message.payload)
          ? message.payload
          : [message.payload];
        topics.forEach((topic) => client.subscriptions.add(topic));
        break;

      case "unsubscribe":
        // Unsubscribe from topics
        const unsubTopics = Array.isArray(message.payload)
          ? message.payload
          : [message.payload];
        unsubTopics.forEach((topic) => client.subscriptions.delete(topic));
        break;

      default:
        console.warn(`[WebSocket] Unknown message type: ${message.type}`);
    }
  }

  /**
   * Send message to specific client
   */
  send(clientId: string, message: WSMessage): void {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Broadcast to all clients
   */
  broadcast(message: WSMessage): void {
    this.clients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(message));
      }
    });
  }

  /**
   * Send to specific user (all their connections)
   */
  sendToUser(userId: string, message: WSMessage): void {
    this.clients.forEach((client) => {
      if (client.userId === userId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(message));
      }
    });
  }

  /**
   * Send to subscribers of a topic
   */
  sendToTopic(topic: string, message: WSMessage): void {
    this.clients.forEach((client) => {
      if (
        client.subscriptions.has(topic) &&
        client.ws.readyState === WebSocket.OPEN
      ) {
        client.ws.send(JSON.stringify(message));
      }
    });
  }

  /**
   * Send download progress update
   */
  notifyDownloadProgress(userId: string, trackId: number, progress: number, status: string): void {
    this.sendToUser(userId, {
      type: "download:progress",
      payload: { trackId, progress, status },
    });
  }

  /**
   * Send notification
   */
  notifyUser(userId: string, notification: any): void {
    this.sendToUser(userId, {
      type: "notification",
      payload: notification,
    });
  }

  /**
   * Get connected clients count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get user connection count
   */
  getUserConnectionCount(userId: string): number {
    let count = 0;
    this.clients.forEach((client) => {
      if (client.userId === userId) count++;
    });
    return count;
  }
}

// Singleton instance
let wsManager: WebSocketManager | null = null;

export function initializeWebSocket(server: HTTPServer): WebSocketManager {
  if (!wsManager) {
    wsManager = new WebSocketManager(server);
  }
  return wsManager;
}

export function getWebSocketManager(): WebSocketManager | null {
  return wsManager;
}
