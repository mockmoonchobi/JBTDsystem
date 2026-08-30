import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

interface GenerateWithRetryOptions {
  model?: string;
  fallbackModels?: string[];
  contents: any;
  config?: any;
  maxRetriesPerModel?: number;
}

/**
 * Executes generateContent with automatic retry on transient spikes (503, 429, etc.)
 * and falls back to alternative supported models if high-demand spikes persist.
 */
async function generateContentWithRetry(ai: GoogleGenAI, options: GenerateWithRetryOptions) {
  const primary = options.model || 'gemini-3.7-flash';
  const models = [primary, ...(options.fallbackModels || ['gemini-flash-latest', 'gemini-3.1-flash-lite'])];
  // Unique preserving order
  const uniqueModels = Array.from(new Set(models));
  const maxRetries = options.maxRetriesPerModel ?? 2;

  let lastError: any = null;

  for (const currentModel of uniqueModels) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: currentModel,
          contents: options.contents,
          config: options.config,
        });
        return response;
      } catch (err: any) {
        lastError = err;
        const errMsg = String(err?.message || err || '').toLowerCase();
        const isTransient =
          errMsg.includes('503') ||
          errMsg.includes('unavailable') ||
          errMsg.includes('high demand') ||
          errMsg.includes('spikes in demand') ||
          errMsg.includes('overloaded') ||
          errMsg.includes('429') ||
          errMsg.includes('resource_exhausted') ||
          errMsg.includes('rate limit') ||
          errMsg.includes('fetch failed') ||
          errMsg.includes('timeout') ||
          err?.status === 503 ||
          err?.status === 429 ||
          err?.status === 'UNAVAILABLE' ||
          err?.status === 'RESOURCE_EXHAUSTED';

        console.warn(`[AI Engine] Attempt ${attempt + 1}/${maxRetries} with model "${currentModel}" failed:`, err?.message || err);

        if (!isTransient) {
          // If error is not a transient/capacity issue, don't keep retrying the same model
          break;
        }

        if (attempt < maxRetries - 1) {
          const delay = Math.min(1200 * Math.pow(1.8, attempt) + Math.random() * 400, 4500);
          await new Promise((res) => setTimeout(res, delay));
        }
      }
    }
  }

  // Format friendly user error if all retries failed
  const rawErr = String(lastError?.message || lastError || '');
  if (rawErr.includes('503') || rawErr.includes('UNAVAILABLE') || rawErr.includes('high demand') || rawErr.includes('spikes in demand')) {
    throw new Error('現在AIサービスが一時的に高負荷となっております。少し時間を置いて再度お試しください。');
  }
  if (rawErr.includes('429') || rawErr.includes('RESOURCE_EXHAUSTED')) {
    throw new Error('AIサービスの利用上限に達しました。しばらく経ってから再度お試しください。');
  }

  throw lastError;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));
  const PORT = 3000;

  const getAi = () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
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

      const response = await generateContentWithRetry(ai, {
        model: 'gemini-3.7-flash',
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

      const response = await generateContentWithRetry(ai, {
        model: 'gemini-3.7-flash',
        contents: prompt,
      });

      res.json({ text: response.text });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // API Route: AI Individual Household Past Record Parsing (Photos of Gravestones/Ihai/Kakocho, Word, Excel, Text)
  app.post("/api/ai/parse-kakocho-records", async (req, res) => {
    try {
      const { fileBase64, mimeType, textData, householdContext } = req.body;
      const ai = getAi();
      if (!ai) {
        return res.status(400).json({ error: "GEMINI_API_KEY が設定されていません。Settings > Secrets に設定してください。" });
      }

      const hhName = householdContext?.familyHead || householdContext?.sponsorName || '該当世帯';
      const tombNum = householdContext?.tombNumber || '';
      const templeName = householdContext?.templeName || '';
      const existingList = (householdContext?.existingRecords || []).join('、');

      const systemInstruction = `あなたは日本の伝統的仏教寺院の過去帳・物故者台帳の作成・整理を専門とするAI書記官です。
提供された資料（墓碑・墓石・墓誌・霊標・位牌・過去帳原本・紙台帳・Word・Excel・OCRテキスト等）から、対象檀家世帯に属する精霊（故人）の情報を高精度に識別・抽出し、構造化データとして出力してください。

【対象世帯の基本情報】
- 対象施主・世帯主名: ${hhName} 様
- 墓地番号・納骨場所: ${tombNum || '未指定'}
- 寺院名: ${templeName || '当寺院'}
${existingList ? `- すでに登録済みの精霊: ${existingList}` : ''}

【抽出・正規化ルール】
1. 戒名・法名（dharmaName）:
   - 院号、道号、法名、位号（居士・大姉・信士・信女・童子・童女・水子等）を含めた正式名称を抽出してください。
   - 墓石の旧字体や異体字（例: 釋, 證, 壽, 榮, 萬, 廣, 靈, 圓, 辨）も文脈に合わせて適切に識別してください。
2. 俗名（secularName）:
   - 生前の氏名を抽出してください。姓が省略され名のみの場合は、必要に応じて世帯主の姓または名のみを抽出してください。
3. 俗名ふりがな（furigana）:
   - 俗名の読み仮名（ひらがな）を推測または抽出してください。
4. 没年月日（deathDate）:
   - 和暦（例: 令和5年3月15日, 平成12年10月4日, 昭和58年8月20日, 大正14年1月1日, 明治40年5月2日 等）または西暦形式で抽出してください。
   - 年号（元号）が省略されている場合は、前後の精霊の年代や享年、文脈から推測してください。
5. 享年・行年（ageAtDeath）:
   - 没年齢（〇歳、〇才）を整数値として抽出してください。不明な場合は null または省略してください。
6. 続柄（relationship）:
   - 施主・世帯主から見た関係（父, 母, 祖父, 祖母, 夫, 妻, 長男, 次男, 長女, 次女, 伯父, 叔母, 先代, 義父, 義母, 水子等）を推測または抽出してください。
7. 当時の施主名（householdHeadName）:
   - 資料に施主名や建立者名の記載があれば抽出し、なければ対象世帯主名（${hhName}）を設定してください。
8. 墓地番号・納骨場所（burialLocation）:
   - 資料に記載があれば抽出、なければ対象世帯の墓地番号（${tombNum}）を設定してください。
9. 備考（notes）:
   - 墓誌に刻まれた経歴、俗名・別称、没地、特記事項などがあれば簡潔に記載してください。

※ 墓碑写真の場合、左右の並びや裏面・側面、複数名の精霊が刻まれていることがあります。刻まれている全ての精霊を1霊ずつ個別のレコードに分けて抽出してください。`;

      const promptText = `以下の資料から、${hhName} 様の過去帳・精霊データを読み取り、抽出してください。
${textData ? `\n【入力テキスト・文書データ】\n${textData}` : ''}`;

      const contents: any = [];

      if (fileBase64 && mimeType) {
        // Remove data URL prefix if present
        const base64Clean = fileBase64.replace(/^data:[^;]+;base64,/, '');
        contents.push({
          inlineData: {
            mimeType: mimeType,
            data: base64Clean,
          },
        });
      }

      contents.push({
        text: promptText,
      });

      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          summary: {
            type: Type.STRING,
            description: "読み取り結果の概要、認識した精霊の件数や特記事項のまとめ",
          },
          records: {
            type: Type.ARRAY,
            description: "抽出された過去帳・精霊（物故者）レコードの配列",
            items: {
              type: Type.OBJECT,
              properties: {
                dharmaName: {
                  type: Type.STRING,
                  description: "戒名・法名・法号",
                },
                secularName: {
                  type: Type.STRING,
                  description: "俗名（生前の本名）",
                },
                furigana: {
                  type: Type.STRING,
                  description: "俗名のふりがな",
                },
                deathDate: {
                  type: Type.STRING,
                  description: "没年月日（和暦または西暦）",
                },
                ageAtDeath: {
                  type: Type.INTEGER,
                  description: "享年・行年（数値）",
                },
                relationship: {
                  type: Type.STRING,
                  description: "世帯主との続柄",
                },
                householdHeadName: {
                  type: Type.STRING,
                  description: "当時の施主名または世帯主名",
                },
                burialLocation: {
                  type: Type.STRING,
                  description: "墓地番号・納骨場所",
                },
                notes: {
                  type: Type.STRING,
                  description: "備考・特記事項",
                },
              },
              required: ["dharmaName", "secularName", "deathDate"],
            },
          },
        },
        required: ["records", "summary"],
      };

      const response = await generateContentWithRetry(ai, {
        model: 'gemini-3.7-flash',
        contents: { parts: contents },
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema,
        },
      });

      const jsonText = response.text || "{}";
      let parsedData: any = {};
      try {
        parsedData = JSON.parse(jsonText);
      } catch (pErr) {
        console.error("JSON parse error from Gemini response:", jsonText);
        parsedData = {
          summary: "解析結果の整形に失敗しました",
          records: [],
        };
      }

      res.json(parsedData);
    } catch (err: any) {
      console.error("AI Parse Kakocho Error:", err);
      res.status(500).json({ error: err.message || "過去帳データのAI解析に失敗しました。" });
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
