import { createCanvas, loadImage, registerFont, type CanvasRenderingContext2D } from 'canvas';
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
    maxFontSize = 32
  ): { fontSize: number; lines: string[] } {
    let fontSize = maxFontSize;
    let lines: string[] = [];
    
    // 最適なフォントサイズを見つける
    while (fontSize > 8) {
      ctx.font = `${fontSize}px Arial, "Noto Sans CJK JP", sans-serif`;
      
      // 文字を単語で分割
      const words = text.split(' ');
      lines = [];
      let currentLine = '';
      
      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const metrics = ctx.measureText(testLine);
        
        if (metrics.width <= bounds.width * 0.9) { // 90%の幅を使用
          currentLine = testLine;
        } else {
          if (currentLine) {
            lines.push(currentLine);
            currentLine = word;
          } else {
            // 単語が長すぎる場合は文字ごとに分割
            lines.push(word);
            currentLine = '';
          }
        }
      }
      
      if (currentLine) {
        lines.push(currentLine);
      }
      
      // 行数をチェック
      const lineHeight = fontSize * 1.2;
      const totalHeight = lines.length * lineHeight;
      
      if (totalHeight <= bounds.height * 0.9) { // 90%の高さを使用
        break;
      }
      
      fontSize -= 2;
    }
    
    return { fontSize, lines };
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
      
      // 各テキスト領域を白で塗りつぶす
      ctx.fillStyle = 'white';
      
      for (const annotation of ocrResult.textAnnotations) {
        const vertices = annotation.boundingPoly.vertices;
        
        if (vertices.length >= 4) {
          // パスを開始
          ctx.beginPath();
          
          // 最初の頂点に移動
          ctx.moveTo(vertices[0].x, vertices[0].y);
          
          // 残りの頂点に線を引く
          for (let i = 1; i < vertices.length; i++) {
            ctx.lineTo(vertices[i].x, vertices[i].y);
          }
          
          // パスを閉じて塗りつぶし
          ctx.closePath();
          ctx.fill();
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
          
          const bounds = {
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
          };
          
          // 元のテキスト領域を白で塗りつぶし
          ctx.fillStyle = 'white';
          ctx.beginPath();
          ctx.moveTo(vertices[0].x, vertices[0].y);
          for (let j = 1; j < vertices.length; j++) {
            ctx.lineTo(vertices[j].x, vertices[j].y);
          }
          ctx.closePath();
          ctx.fill();
          
          // テキストを領域に合わせて調整
          const { fontSize, lines } = this.fitTextInBounds(ctx, translatedText, bounds);
          
          // 日本語テキストを描画
          ctx.fillStyle = 'black';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = `${fontSize}px Arial, "Noto Sans CJK JP", sans-serif`;
          
          const lineHeight = fontSize * 1.2;
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