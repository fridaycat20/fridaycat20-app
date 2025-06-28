import vision, { type protos } from "@google-cloud/vision";
import { GoogleGenAI } from "@google/genai";

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
  originalTextAnnotations: TextDetection[];
}

type Vertex = protos.google.cloud.vision.v1.IVertex;

export class VisionService {
  private client: InstanceType<typeof vision.ImageAnnotatorClient>;
  private ai: GoogleGenAI;

  constructor() {
    this.client = new vision.ImageAnnotatorClient();
    this.ai = new GoogleGenAI({
      vertexai: true,
      location: "us-central1",
      project: "fridaycat20",
    });
  }

  // Geminiを使ってテキストの意味的なまとまりを判断してグルーピング
  private async combineTextWithGemini(
    textAnnotations: TextDetection[],
  ): Promise<TextDetection[]> {
    if (textAnnotations.length <= 1) return textAnnotations;

    try {
      // テキスト要素の情報を整理
      const textElements = textAnnotations.map((annotation, index) => {
        const bounds = this.getBoundingRect(annotation.boundingPoly.vertices);
        return {
          id: index,
          text: annotation.description,
          x: bounds.centerX,
          y: bounds.centerY,
          width: bounds.width,
          height: bounds.height,
        };
      });

      const prompt = `以下は4コマ漫画から抽出されたテキスト要素です。各要素は吹き出しや文字列の一部である可能性があります。

テキスト要素:
${textElements.map((el) => `ID${el.id}: "${el.text}" (座標: x=${Math.round(el.x)}, y=${Math.round(el.y)}, サイズ: ${Math.round(el.width)}x${Math.round(el.height)})`).join("\n")}

以下の条件を満たすテキスト要素のみをグループ化してください：

1. 座標がほぼ隣接している（距離がテキストサイズの0.5倍以内、ほとんど重なっているか隣り合っている）
2. 意味的に連続している（分割された単語、同じセリフの続き）
3. 同じ吹き出し内にある可能性が高い

重要：少しでも離れた位置にあるテキストは別々のグループにしてください。基本的にはほとんどのテキストは単独のグループになると考えてください。

グループ化結果を以下の形式で回答してください：
グループ1: [ID0, ID1]
グループ2: [ID2]
グループ3: [ID3, ID4, ID5]

各テキスト要素は必ず1つのグループに含めてください。`;

      const response = await this.ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        config: {
          thinkingConfig: {
            thinkingBudget: 0,
          },
        },
      });

      const result = response.text?.toString().trim() || "";
      const groups = this.parseGeminiGroupingResult(result, textAnnotations);

      return groups;
    } catch (error) {
      console.error("Gemini text grouping error:", error);
      // フォールバックとして既存の近接ベースの結合を使用
      return this.combineNearbyTextRegions(textAnnotations);
    }
  }

  // Geminiの結果を解析してテキストをグループ化
  private parseGeminiGroupingResult(
    geminiResult: string,
    originalAnnotations: TextDetection[],
  ): TextDetection[] {
    const groups: TextDetection[] = [];
    const used = new Set<number>();

    // "グループN: [IDx, IDy, ...]" の形式を解析
    const groupPattern = /グループ\d+:\s*\[([^\]]+)\]/g;
    let match: RegExpExecArray | null = groupPattern.exec(geminiResult);

    while (match !== null) {
      const idsText = match[1];
      const ids = idsText
        .split(",")
        .map((id) => {
          const idMatch = id.trim().match(/ID(\d+)/);
          return idMatch ? Number.parseInt(idMatch[1]) : -1;
        })
        .filter((id) => id >= 0 && id < originalAnnotations.length);

      if (ids.length > 0) {
        const groupAnnotations = ids.map((id) => originalAnnotations[id]);

        if (groupAnnotations.length === 1) {
          groups.push(groupAnnotations[0]);
        } else {
          groups.push(this.mergeTextRegions(groupAnnotations));
        }

        for (const id of ids) {
          used.add(id);
        }
      }
      
      match = groupPattern.exec(geminiResult);
    }

    // 使用されていないアノテーションを個別に追加
    for (let i = 0; i < originalAnnotations.length; i++) {
      if (!used.has(i)) {
        groups.push(originalAnnotations[i]);
      }
    }

    return groups;
  }

  // 近接するテキスト領域を結合する（フォールバック用）
  private combineNearbyTextRegions(
    textAnnotations: TextDetection[],
  ): TextDetection[] {
    if (textAnnotations.length <= 1) return textAnnotations;

    const combined: TextDetection[] = [];
    const used = new Set<number>();

    for (let i = 0; i < textAnnotations.length; i++) {
      if (used.has(i)) continue;

      const current = textAnnotations[i];
      const group = [current];
      used.add(i);

      // 現在の領域の中心点とサイズを計算
      const currentBounds = this.getBoundingRect(current.boundingPoly.vertices);

      for (let j = i + 1; j < textAnnotations.length; j++) {
        if (used.has(j)) continue;

        const other = textAnnotations[j];
        const otherBounds = this.getBoundingRect(other.boundingPoly.vertices);

        // 近接判定: 垂直方向の重複またはマージン内であり、水平方向が近い
        if (this.areRegionsNearby(currentBounds, otherBounds)) {
          group.push(other);
          used.add(j);
        }
      }

      // グループが複数の領域を含む場合は結合
      if (group.length > 1) {
        combined.push(this.mergeTextRegions(group));
      } else {
        combined.push(current);
      }
    }

    return combined;
  }

  // 境界矩形を計算
  private getBoundingRect(vertices: Array<{ x: number; y: number }>) {
    const xs = vertices.map((v) => v.x);
    const ys = vertices.map((v) => v.y);
    return {
      left: Math.min(...xs),
      right: Math.max(...xs),
      top: Math.min(...ys),
      bottom: Math.max(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
      centerX: (Math.min(...xs) + Math.max(...xs)) / 2,
      centerY: (Math.min(...ys) + Math.max(...ys)) / 2,
    };
  }

  // 領域が近接しているかを判定
  private areRegionsNearby(
    rect1: ReturnType<typeof this.getBoundingRect>,
    rect2: ReturnType<typeof this.getBoundingRect>,
  ): boolean {
    // 垂直方向の余白を設定（高さの50%）
    const verticalMargin1 = rect1.height * 0.5;
    const verticalMargin2 = rect2.height * 0.5;

    // 余白を含めた領域を計算
    const expandedRect1 = {
      top: rect1.top - verticalMargin1,
      bottom: rect1.bottom + verticalMargin1,
    };
    const expandedRect2 = {
      top: rect2.top - verticalMargin2,
      bottom: rect2.bottom + verticalMargin2,
    };

    // 余白を含めた領域が重複しているかを判定
    const verticalOverlap =
      Math.min(expandedRect1.bottom, expandedRect2.bottom) >
      Math.max(expandedRect1.top, expandedRect2.top);

    // 水平方向の重複チェック
    const horizontalOverlap =
      Math.min(rect1.right, rect2.right) > Math.max(rect1.left, rect2.left);

    return verticalOverlap && horizontalOverlap;
  }

  // 複数のテキスト領域を結合
  private mergeTextRegions(regions: TextDetection[]): TextDetection {
    // テキストを結合（左から右、上から下の順序で）
    const sortedRegions = regions.sort((a, b) => {
      const boundsA = this.getBoundingRect(a.boundingPoly.vertices);
      const boundsB = this.getBoundingRect(b.boundingPoly.vertices);

      // Y座標で並び替え（上から下）
      const yDiff = boundsA.centerY - boundsB.centerY;
      if (Math.abs(yDiff) > Math.max(boundsA.height, boundsB.height) * 0.5) {
        return yDiff;
      }

      // Y座標が近い場合はX座標で並び替え（左から右）
      return boundsA.centerX - boundsB.centerX;
    });

    const mergedText = sortedRegions
      .map((region) => region.description)
      .join(" ")
      .replace(/^["「『]|["」』]$/g, ""); // 開始と終了の鉤括弧を除去

    // 全体を囲む境界ボックスを計算
    const allVertices = regions.flatMap(
      (region) => region.boundingPoly.vertices,
    );
    const xs = allVertices.map((v) => v.x);
    const ys = allVertices.map((v) => v.y);

    return {
      description: mergedText,
      boundingPoly: {
        vertices: [
          { x: Math.min(...xs), y: Math.min(...ys) },
          { x: Math.max(...xs), y: Math.min(...ys) },
          { x: Math.max(...xs), y: Math.max(...ys) },
          { x: Math.min(...xs), y: Math.max(...ys) },
        ],
      },
    };
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
          originalTextAnnotations: [],
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
        const vertices =
          block.boundingBox.vertices?.map((vertex: Vertex) => ({
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

      // Geminiを使ってテキストの意味的なまとまりで結合
      const combinedTextAnnotations =
        await this.combineTextWithGemini(textAnnotations);

      return {
        fullText,
        textAnnotations: combinedTextAnnotations,
        originalTextAnnotations: textAnnotations,
      };
    } catch (error) {
      console.error("Vision API error:", error);
      throw new Error("Failed to detect text from image");
    }
  }
}

export const visionService = new VisionService();
