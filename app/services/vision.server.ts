import vision, { type protos } from "@google-cloud/vision";

export interface TextDetection {
  description: string;
  boundingPoly: {
    vertices: Array<{
      x: number;
      y: number;
    }>;
  };
}

export interface OCRResult {
  fullText: string;
  textAnnotations: TextDetection[];
}

type Vertex = protos.google.cloud.vision.v1.IVertex;

export class VisionService {
  private client: InstanceType<typeof vision.ImageAnnotatorClient>;

  constructor() {
    this.client = new vision.ImageAnnotatorClient();
  }

  async detectText(imageBuffer: Buffer): Promise<OCRResult> {
    try {
      // ドキュメントテキスト検出を使用（文章・段落レベルで抽出）
      const [result] = await this.client.documentTextDetection({
        image: {
          content: imageBuffer,
        },
      });

      const fullTextAnnotation = result.fullTextAnnotation;
      const textBlocks = fullTextAnnotation?.pages?.[0]?.blocks || [];

      if (textBlocks.length === 0) {
        return {
          fullText: fullTextAnnotation?.text || "",
          textAnnotations: [],
        };
      }

      const fullText = fullTextAnnotation?.text || "";
      const textAnnotations: TextDetection[] = [];

      // ブロック（段落）レベルでテキストを抽出
      for (const block of textBlocks) {
        if (!block.boundingBox || !block.paragraphs) continue;

        // 段落内の全テキストを結合
        let blockText = "";
        for (const paragraph of block.paragraphs) {
          if (!paragraph.words) continue;
          
          for (const word of paragraph.words) {
            if (!word.symbols) continue;
            
            for (const symbol of word.symbols) {
              blockText += symbol.text || "";
            }
            blockText += " "; // 単語間にスペースを追加
          }
          blockText += "\n"; // 段落間に改行を追加
        }

        // ブロックの境界ボックスを取得
        const vertices = block.boundingBox.vertices?.map((vertex: Vertex) => ({
          x: vertex.x || 0,
          y: vertex.y || 0,
        })) || [];

        if (vertices.length > 0 && blockText.trim()) {
          textAnnotations.push({
            description: blockText.trim(),
            boundingPoly: {
              vertices,
            },
          });
        }
      }

      return {
        fullText,
        textAnnotations,
      };
    } catch (error) {
      console.error("Vision API error:", error);
      throw new Error("Failed to detect text from image");
    }
  }
}

export const visionService = new VisionService();
