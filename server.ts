import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  app.use(express.json());
  const PORT = 3000;

  const getAi = () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    return new GoogleGenAI({ apiKey });
  };

  // API Route: AI Memorial Notice Text Generation
  app.post("/api/ai/generate-notice", async (req, res) => {
    try {
      const { templeName, deceasedName, dharmaName, memorialType, eventDate, time, location, additionalNotes } = req.body;
      const ai = getAi();
      if (!ai) {
        return res.status(400).json({ error: "GEMINI_API_KEY が設定されていません。" });
      }

      const prompt = `あなたは日本の伝統的仏教寺院（${templeName || '当寺院'}）の住職です。
檀家様へお送りする「法要のご案内状（はがき・封筒用）」の文面を作成してください。
伝統的かつ丁寧で心温まる時候の挨拶、時候の候、敬語表現を含めた文章にしてください。

【案内情報】
- 故人俗名: ${deceasedName || '故人'}
- 戒名/法名: ${dharmaName || '（未登録）'}
- 法要種別: ${memorialType || '年回忌法要'}
- 法要開催日時: ${eventDate || '未定'} ${time || ''}
- 開催場所: ${location || '当寺 本堂'}
- 連絡・補足事項: ${additionalNotes || '特になし'}

【構成要件】
1. 拝啓・時候の挨拶（季節に応じた格式ある表現）
2. 法要実施のお知らせと趣旨
3. 日時・場所・持参物の明記
4. 出欠返信の依頼（返信用ハガキやQR受付のご案内）
5. 敬具・寺院名・連絡先`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      res.json({ text: response.text });
    } catch (err: any) {
      console.error("AI Notice Error:", err);
      res.status(500).json({ error: err.message || "Failed to generate AI notice text" });
    }
  });

  // API Route: AI Dharma Name & Past Record Advisory
  app.post("/api/ai/dharma-advisor", async (req, res) => {
    try {
      const { secularName, gender, remarks } = req.body;
      const ai = getAi();
      if (!ai) return res.status(400).json({ error: "GEMINI_API_KEY が設定されていません。" });

      const prompt = `寺院の過去帳管理のアシスタントとして、以下の俗名・特徴から戒名・法名の字義や年忌要約のアドバイスを簡潔に生成してください。
俗名: ${secularName}
性別: ${gender}
備考: ${remarks || 'なし'}`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      res.json({ text: response.text });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
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
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Temple System Server listening on port ${PORT}`);
  });
}

startServer();
