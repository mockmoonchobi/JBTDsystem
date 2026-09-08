import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import nodemailer from "nodemailer";

dotenv.config();

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));
  const PORT = 3000;

  // Health check endpoint
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", message: "Temple Management System Server is running" });
  });

  // SMTP Status Check
  app.get("/api/smtp-status", (_req, res) => {
    const isConfigured = Boolean(
      (process.env.SMTP_HOST && process.env.SMTP_USER) || process.env.SMTP_HOST
    );
    res.json({
      configured: isConfigured,
      host: process.env.SMTP_HOST || null,
      port: process.env.SMTP_PORT || 587,
      from: process.env.SMTP_FROM || process.env.SMTP_USER || null,
    });
  });

  // Send Tanagyo Patrol Email endpoint
  app.post("/api/send-tanagyo-email", async (req, res) => {
    try {
      const { to, subject, html, text, priestName } = req.body;

      if (!to || !to.trim()) {
        return res.status(400).json({
          success: false,
          error: "宛先メールアドレスが指定されていません。",
        });
      }

      const smtpHost = process.env.SMTP_HOST;
      const smtpPort = parseInt(process.env.SMTP_PORT || "587", 10);
      const smtpUser = process.env.SMTP_USER;
      const smtpPass = process.env.SMTP_PASS;
      const smtpFrom = process.env.SMTP_FROM || smtpUser || "temple-system@example.com";

      if (!smtpHost) {
        return res.status(200).json({
          success: false,
          needSmtpConfig: true,
          message:
            "サーバーのSMTP設定（SMTP_HOST, SMTP_USER, SMTP_PASS）が未設定です。画面上の「HTML表をコピーしてメール作成」をご利用いただくか、環境変数を設定してください。",
        });
      }

      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: smtpUser ? { user: smtpUser, pass: smtpPass || "" } : undefined,
      });

      const mailOptions = {
        from: smtpFrom,
        to: to.trim(),
        subject: subject || `【お盆棚経巡回計画】${priestName || "担当"} 師`,
        html,
        text: text || "お盆棚経巡回計画のご案内です。HTML表示対応のメールアプリでご確認ください。",
      };

      const info = await transporter.sendMail(mailOptions);
      console.log("Tanagyo email sent successfully:", info.messageId);

      return res.json({
        success: true,
        messageId: info.messageId,
        message: `${to} へ棚経巡回計画メールを送信しました。`,
      });
    } catch (error: any) {
      console.error("Error sending tanagyo email:", error);
      return res.status(500).json({
        success: false,
        error: error.message || "メール送信中にエラーが発生しました。",
        message: `メール送信エラー: ${error.message || "不明なエラー"}`,
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);

    app.use('*', async (req, res, next) => {
      if (req.originalUrl.startsWith('/api')) {
        return next();
      }
      try {
        const url = req.originalUrl;
        let template = fs.readFileSync(path.resolve(process.cwd(), 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Temple System Server listening on port ${PORT}`);
  });
}

startServer();
