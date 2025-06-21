import { createCanvas, loadImage, type CanvasRenderingContext2D } from 'canvas';
import type { OCRResult } from './vision.server';

export interface WhiteMaskResult {
  maskedImageBytes: string; // Base64 encoded image
}

export interface TranslatedImageResult {
  translatedImageBytes: string; // Base64 encoded image
}

export class ImageProcessingService {
  
  // テキストを領域内に収まるように調整する
  private fitTextInBounds(
    ctx: CanvasRenderingContext2D,
    text: string,
    bounds: { x: number; y: number; width: number; height: number },
    maxFontSize = 24
  ): { fontSize: number; lines: string[] } {
    let fontSize = Math.min(maxFontSize, Math.floor(bounds.height / 2)); // 高さに基づく初期フォントサイズ
    let lines: string[] = [];
    
    // 最適なフォントサイズを見つける
    while (fontSize > 6) {
      ctx.font = `${fontSize}px Arial, "Noto Sans CJK JP", sans-serif`;
      
      // 日本語と英語の混在テキストを適切に分割
      const chars = text.split('');
      lines = [];
      let currentLine = '';
      
      for (const char of chars) {
        const testLine = currentLine + char;
        const metrics = ctx.measureText(testLine);
        
        if (metrics.width <= bounds.width * 0.85) { // 85%の幅を使用（余裕を持たせる）
          currentLine = testLine;
        } else {
          if (currentLine) {
            lines.push(currentLine);
            currentLine = char;
          } else {
            // 1文字でも幅を超える場合は強制的に改行
            lines.push(char);
            currentLine = '';
          }
        }
      }
      
      if (currentLine) {
        lines.push(currentLine);
      }
      
      // 行数をチェック（行間を考慮）
      const lineHeight = fontSize * 1.1; // 行間を狭める
      const totalHeight = lines.length * lineHeight;
      
      if (totalHeight <= bounds.height * 0.85) { // 85%の高さを使用（余裕を持たせる）
        break;
      }
      
      fontSize -= 1; // より細かい調整
    }
    
    return { fontSize, lines };
  }

  // 統一フォントサイズでテキストを行に分割する
  private splitTextIntoLines(
    ctx: CanvasRenderingContext2D,
    text: string,
    maxWidth: number
  ): string[] {
    const chars = text.split('');
    const lines: string[] = [];
    let currentLine = '';
    
    for (const char of chars) {
      const testLine = currentLine + char;
      const metrics = ctx.measureText(testLine);
      
      if (metrics.width <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = char;
        } else {
          lines.push(char);
          currentLine = '';
        }
      }
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    return lines;
  }

  async whiteMaskTextRegions(imageBytes: string, ocrResult: OCRResult): Promise<WhiteMaskResult> {
    try {
      // Base64画像をBufferに変換
      const imageBuffer = Buffer.from(imageBytes, 'base64');
      
      // 画像を読み込み
      const image = await loadImage(imageBuffer);
      
      // キャンバスを作成
      const canvas = createCanvas(image.width, image.height);
      const ctx = canvas.getContext('2d');
      
      // 元の画像を描画
      ctx.drawImage(image, 0, 0);
      
      // 各テキスト領域を白で塗りつぶす（拡大マスク）
      ctx.fillStyle = 'white';
      
      for (const annotation of ocrResult.textAnnotations) {
        const vertices = annotation.boundingPoly.vertices;
        
        if (vertices.length >= 4) {
          // 境界ボックスを計算
          const minX = Math.min(...vertices.map(v => v.x));
          const maxX = Math.max(...vertices.map(v => v.x));
          const minY = Math.min(...vertices.map(v => v.y));
          const maxY = Math.max(...vertices.map(v => v.y));
          
          // マスク領域を拡大（各方向に2%拡張）
          const padding = Math.max((maxX - minX) * 0.02, (maxY - minY) * 0.02, 2);
          const expandedMinX = Math.max(0, minX - padding);
          const expandedMaxX = Math.min(image.width, maxX + padding);
          const expandedMinY = Math.max(0, minY - padding);
          const expandedMaxY = Math.min(image.height, maxY + padding);
          
          // 拡大された矩形領域を塗りつぶし
          ctx.fillRect(
            expandedMinX,
            expandedMinY,
            expandedMaxX - expandedMinX,
            expandedMaxY - expandedMinY
          );
        }
      }
      
      // Base64形式で画像を取得
      const maskedImageBytes = canvas.toBuffer('image/png').toString('base64');
      
      return {
        maskedImageBytes,
      };
    } catch (error) {
      console.error('Image processing error:', error);
      throw new Error('Failed to process image');
    }
  }

  async translateTextRegions(
    imageBytes: string, 
    ocrResult: OCRResult, 
    translatedTexts: string[]
  ): Promise<TranslatedImageResult> {
    try {
      // Base64画像をBufferに変換
      const imageBuffer = Buffer.from(imageBytes, 'base64');
      
      // 画像を読み込み
      const image = await loadImage(imageBuffer);
      
      // キャンバスを作成
      const canvas = createCanvas(image.width, image.height);
      const ctx = canvas.getContext('2d');
      
      // 元の画像を描画
      ctx.drawImage(image, 0, 0);
      
      // 統一フォントサイズを決定（画像サイズに基づく）
      const uniformFontSize = Math.max(12, Math.min(20, Math.floor(Math.min(image.width, image.height) / 40)));
      
      // 各テキスト領域を処理
      for (let i = 0; i < ocrResult.textAnnotations.length && i < translatedTexts.length; i++) {
        const annotation = ocrResult.textAnnotations[i];
        const translatedText = translatedTexts[i];
        const vertices = annotation.boundingPoly.vertices;
        
        if (vertices.length >= 4 && translatedText.trim()) {
          // 境界ボックスを計算
          const minX = Math.min(...vertices.map(v => v.x));
          const maxX = Math.max(...vertices.map(v => v.x));
          const minY = Math.min(...vertices.map(v => v.y));
          const maxY = Math.max(...vertices.map(v => v.y));
          
          // マスク領域を拡大（各方向に2%拡張）
          const padding = Math.max((maxX - minX) * 0.02, (maxY - minY) * 0.02, 2);
          const expandedMinX = Math.max(0, minX - padding);
          const expandedMaxX = Math.min(image.width, maxX + padding);
          const expandedMinY = Math.max(0, minY - padding);
          const expandedMaxY = Math.min(image.height, maxY + padding);
          
          const bounds = {
            x: expandedMinX,
            y: expandedMinY,
            width: expandedMaxX - expandedMinX,
            height: expandedMaxY - expandedMinY,
          };
          
          // 元のテキスト領域を白で塗りつぶし（拡大領域）
          ctx.fillStyle = 'white';
          ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);
          
          // 統一フォントサイズでテキストを分割
          ctx.font = `${uniformFontSize}px Arial, "Noto Sans CJK JP", sans-serif`;
          const lines = this.splitTextIntoLines(ctx, translatedText, bounds.width * 0.85);
          
          // 日本語テキストを描画
          ctx.fillStyle = 'black';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          
          const lineHeight = uniformFontSize * 1.1;
          const totalHeight = lines.length * lineHeight;
          const startY = bounds.y + bounds.height / 2 - totalHeight / 2 + lineHeight / 2;
          
          for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const line = lines[lineIndex];
            const y = startY + lineIndex * lineHeight;
            const x = bounds.x + bounds.width / 2;
            
            ctx.fillText(line, x, y);
          }
        }
      }
      
      // Base64形式で画像を取得
      const translatedImageBytes = canvas.toBuffer('image/png').toString('base64');
      
      return {
        translatedImageBytes,
      };
    } catch (error) {
      console.error('Translation image processing error:', error);
      throw new Error('Failed to process translated image');
    }
  }
}

export const imageProcessingService = new ImageProcessingService();