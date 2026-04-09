import type { Express } from "express";
import { chatbot } from "../chatbot-service";
import { rateLimitMiddleware } from "../performance-middleware";
import { secureLogger } from '../utils/secure-logger';

export function setupChatbotRoutes(app: Express): void {
  app.post("/api/chatbot/chat", rateLimitMiddleware(20, 60000), async (req, res) => {
    try {
      const { message, context } = req.body;

      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: "Message is required" });
      }

      const response = await chatbot.generateResponse(message, context);
      res.json({ response });
    } catch (error) {
      secureLogger.error('Chatbot error:', { error: String(error) });
      res.status(500).json({ error: "Failed to generate response" });
    }
  });

  app.post("/api/chatbot/analyze-segment", rateLimitMiddleware(10, 60000), async (req, res) => {
    try {
      const { segment } = req.body;

      if (!segment || typeof segment !== 'string') {
        return res.status(400).json({ error: "Segment name is required" });
      }

      const analysis = await chatbot.analyzeCustomerSegment(segment);
      res.json({ analysis });
    } catch (error) {
      secureLogger.error('Segment analysis error:', { error: String(error) });
      res.status(500).json({ error: "Failed to analyze segment" });
    }
  });
}
