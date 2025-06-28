import { existsSync } from "node:fs";
import {
  type CanvasRenderingContext2D,
  createCanvas,
  loadImage,
  registerFont,
} from "canvas";
import type { OCRResult } from "./vision.server";

// フォントのフォールバック順序
const FONT_STACK = [
  "Noto Sans CJK JP",
  "Noto Sans CJK",
  "system-ui",
  "-apple-system",
  "BlinkMacSystemFont",
  "Segoe UI",
  "DejaVu Sans",
  "Arial",
  "Hiragino Sans",
  "Yu Gothic",
  "Meiryo",
  "sans-serif",
].join(", ");

export interface WhiteMaskResult {
  maskedImageBytes: string; // Base64 encoded image
}

export interface TranslatedImageResult {
  translatedImageBytes: string; // Base64 encoded image
}

export class ImageProcessingService {
  private static fontInitialized = false;

  // 日本語フォントが利用可能かチェック・初期化
  private static initializeFonts() {
    if (ImageProcessingService.fontInitialized) return;

    try {
      // Noto Sans CJKフォントを明示的に登録
      const fontPaths = [
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.otf",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-JP-Regular.otf",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/noto/NotoSansCJK-JP-Regular.otf",
      ];

      let fontRegistered = false;
      for (const fontPath of fontPaths) {
        if (existsSync(fontPath)) {
          try {
            registerFont(fontPath, { family: "Noto Sans CJK JP" });
            console.log(`Successfully registered font: ${fontPath}`);
            fontRegistered = true;
            break;
          } catch (error) {
            console.warn(`Failed to register font ${fontPath}:`, error);
          }
        }
      }

      if (!fontRegistered) {
        console.warn("Noto Sans CJK font not found in expected locations");
      }

      // 本番環境（Cloud Run）用のフォント検証とフォールバック
      const canvas = createCanvas(100, 100);
      const ctx = canvas.getContext("2d");

      // フォントテスト: 日本語文字が正しく表示されるかチェック
      ctx.font = `16px ${FONT_STACK}`;
      const testText = "あいうえお";
      const metrics = ctx.measureText(testText);

      // 日本語文字の幅が0でない場合、フォントが機能している
      if (metrics.width > 0) {
        console.log("Japanese font support detected");
      } else {
        console.warn(
          "Japanese font support may be limited - using fallback rendering",
        );
      }

      // Cloud Run環境での追加ログ
      console.log("Font stack:", FONT_STACK);
      console.log("Test text metrics:", {
        width: metrics.width,
        actualBoundingBoxLeft: metrics.actualBoundingBoxLeft,
      });

      // 環境情報を出力（Cloud Run診断用）
      console.log("Environment info:", {
        platform: process.platform,
        nodeVersion: process.version,
        environment: process.env.NODE_ENV || "development",
      });

      ImageProcessingService.fontInitialized = true;
    } catch (error) {
      console.warn("Font initialization failed:", error);
      ImageProcessingService.fontInitialized = true; // エラーでも初期化済みとマーク
    }
  }

  // テキスト分割のヘルパー関数
  private splitTextIntoLines(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number,
  ): string[] {
    const lines: string[] = [];
    const chars = text.split("");
    let currentLine = "";

    for (const char of chars) {
      const testLine = currentLine + char;
      const metrics = ctx.measureText(testLine);

      if (metrics.width <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine.trim()) {
          lines.push(currentLine.trim());
        }
        currentLine = char;
      }
    }

    if (currentLine.trim()) {
      lines.push(currentLine.trim());
    }

    return lines.filter((line) => line.length > 0);
  }

  // テキストを領域内に収まるように調整する
  private fitTextInBounds(
    ctx: CanvasRenderingContext2D,
    text: string,
    bounds: { x: number; y: number; width: number; height: number },
    maxFontSize = 48,
  ): { fontSize: number; lines: string[] } {
    // より大きな初期フォントサイズから開始（高さの80%まで）
    let fontSize = Math.max(maxFontSize, bounds.height);
    const maxWidth = bounds.width;
    const minFontSize = 8;

    // 最適なフォントサイズを見つける
    while (fontSize >= minFontSize) {
      // フォント設定
      ctx.font = `${fontSize}px ${FONT_STACK}`;
      if (!ctx.font.includes(`${fontSize}px`)) {
        ctx.font = `${fontSize}px sans-serif`;
      }

      // テキスト分割
      const lines = this.splitTextIntoLines(ctx, text, maxWidth);

      // 高さチェック
      const lineHeight = fontSize * 1.1;
      const totalHeight = lines.length * lineHeight;

      if (totalHeight <= bounds.height || fontSize === minFontSize) {
        return { fontSize, lines };
      }

      fontSize -= 1;
    }

    // フォールバック（理論的には到達しない）
    return { fontSize: minFontSize, lines: [text] };
  }

  async whiteMaskTextRegions(
    imageBytes: string,
    originalTextAnnotations: OCRResult["originalTextAnnotations"],
  ): Promise<WhiteMaskResult> {
    try {
      // フォントを初期化
      ImageProcessingService.initializeFonts();
      // Base64画像をBufferに変換
      const imageBuffer = Buffer.from(imageBytes, "base64");

      // 画像を読み込み
      const image = await loadImage(imageBuffer);

      // キャンバスを作成
      const canvas = createCanvas(image.width, image.height);
      const ctx = canvas.getContext("2d");

      // 元の画像を描画
      ctx.drawImage(image, 0, 0);

      // 各テキスト領域を白で塗りつぶす（拡大マスク）
      ctx.fillStyle = "white";

      for (const annotation of originalTextAnnotations) {
        const vertices = annotation.boundingPoly.vertices;

        if (vertices.length >= 4) {
          // 境界ボックスを計算
          const minX = Math.min(...vertices.map((v) => v.x));
          const maxX = Math.max(...vertices.map((v) => v.x));
          const minY = Math.min(...vertices.map((v) => v.y));
          const maxY = Math.max(...vertices.map((v) => v.y));

          // マスク領域を拡大（各方向に2%拡張）
          const padding = Math.max(
            (maxX - minX) * 0.02,
            (maxY - minY) * 0.02,
            2,
          );
          const expandedMinX = Math.max(0, minX - padding);
          const expandedMaxX = Math.min(image.width, maxX + padding);
          const expandedMinY = Math.max(0, minY - padding);
          const expandedMaxY = Math.min(image.height, maxY + padding);

          // 拡大された矩形領域を塗りつぶし
          ctx.fillRect(
            expandedMinX,
            expandedMinY,
            expandedMaxX - expandedMinX,
            expandedMaxY - expandedMinY,
          );
        }
      }

      // Base64形式で画像を取得
      const maskedImageBytes = canvas.toBuffer("image/png").toString("base64");

      return {
        maskedImageBytes,
      };
    } catch (error) {
      console.error("Image processing error:", error);
      throw new Error("Failed to process image");
    }
  }

  async translateTextRegions(
    imageBytes: string,
    combinedTextAnnotations: OCRResult["textAnnotations"],
    translatedTexts: string[],
  ): Promise<TranslatedImageResult> {
    try {
      // フォントを初期化
      ImageProcessingService.initializeFonts();
      // Base64画像をBufferに変換
      const imageBuffer = Buffer.from(imageBytes, "base64");

      // 画像を読み込み
      const image = await loadImage(imageBuffer);

      // キャンバスを作成
      const canvas = createCanvas(image.width, image.height);
      const ctx = canvas.getContext("2d");

      // 元の画像を描画
      ctx.drawImage(image, 0, 0);

      // 各テキスト領域で最適なフォントサイズを計算するため、統一フォントサイズは使用しない

      // 各テキスト領域を処理
      for (
        let i = 0;
        i < combinedTextAnnotations.length && i < translatedTexts.length;
        i++
      ) {
        const annotation = combinedTextAnnotations[i];
        const translatedText = translatedTexts[i];
        const vertices = annotation.boundingPoly.vertices;

        if (vertices.length >= 4 && translatedText.trim()) {
          // 境界ボックスを計算（拡大不要、元の領域を使用）
          const minX = Math.min(...vertices.map((v) => v.x));
          const maxX = Math.max(...vertices.map((v) => v.x));
          const minY = Math.min(...vertices.map((v) => v.y));
          const maxY = Math.max(...vertices.map((v) => v.y));

          const bounds = {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
          };

          // 既にマスク済みの画像を使用するため、白塗りは不要

          // 翻訳テキストの文字数とマスク領域に基づいて最適なフォントサイズを計算
          const { fontSize, lines } = this.fitTextInBounds(
            ctx,
            translatedText,
            bounds,
            Math.min(bounds.width / 4, bounds.height / 3, 32), // より保守的なサイズ制限
          );

          ctx.font = `${fontSize}px ${FONT_STACK}`;
          if (!ctx.font.includes(`${fontSize}px`)) {
            ctx.font = `${fontSize}px sans-serif`;
          }

          // 日本語テキストを描画
          ctx.fillStyle = "black";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          const lineHeight = fontSize * 1.1;
          // 上端から開始して余白を最小化
          const startY = bounds.y + fontSize / 2;


          for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];
            const y = startY + lineIndex * lineHeight;
            const x = bounds.x + bounds.width / 2;

            ctx.fillText(line, x, y);
          }

        }
      }

      // Base64形式で画像を取得
      const translatedImageBytes = canvas
        .toBuffer("image/png")
        .toString("base64");

      return {
        translatedImageBytes,
      };
    } catch (error) {
      console.error("Translation image processing error:", error);
      throw new Error("Failed to process translated image");
    }
  }
}

export const imageProcessingService = new ImageProcessingService();
